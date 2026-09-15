/**
 * Configuration d'une prestation — groupes de variantes, valeurs, options.
 *
 * Réf : blyss-mobile/docs/ARCHITECTURE_MOTEUR_PRESTATIONS_V1_V3.md (§2, §5.3, §17).
 * Toute écriture (création/màj d'un groupe, d'une valeur, d'une option, ou
 * du prix/durée de base de la prestation) revalide la configuration entière
 * de la prestation via `assertConfigViable` : aucune configuration ne peut
 * être enregistrée si sa pire combinaison légale aboutit à un prix négatif
 * ou une durée nulle/négative (doc §5.3, décision verrouillée §0.8). C'est
 * le filet PRINCIPAL — reservation.service.ts revalide aussi à la création
 * (computeItemPricing) comme filet de SECOURS.
 *
 * Ownership : chaque fonction prend `proId` et filtre systématiquement par
 * `pro_id` (via la prestation parente), jamais de confiance dans un ID seul
 * — même pattern que le reste du backend (server.ts prestations CRUD).
 */

import { getDb } from "../lib/db";
import { computeWorstCasePricing } from "./pricing-engine";

const db = getDb();

export class PrestationConfigError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = "PrestationConfigError";
  }
}

async function assertOwnsPrestation(prestationId: number, proId: number): Promise<{ price: number; duration_minutes: number }> {
  const [rows] = await db.query(
    `SELECT price, duration_minutes FROM prestations WHERE id = ? AND pro_id = ?`,
    [prestationId, proId]
  );
  const row = (rows as any[])[0];
  if (!row) throw new PrestationConfigError(404, "Prestation introuvable", "PRESTATION_NOT_FOUND");
  return { price: Number(row.price), duration_minutes: Number(row.duration_minutes) };
}

/**
 * Revalide la configuration ENTIÈRE d'une prestation (tous ses groupes de
 * variantes actifs + toutes ses options actives) après une écriture. Lève si
 * la pire combinaison légale est invalide. Appelée en fin de chaque fonction
 * mutante de ce fichier, toujours après l'écriture qui vient d'avoir lieu
 * (une transaction englobante permet d'annuler si elle échoue).
 */
export async function assertConfigViable(prestationId: number, proId: number): Promise<void> {
  const base = await assertOwnsPrestation(prestationId, proId);

  const [groupRows] = await db.query(
    `SELECT id, required FROM variant_groups WHERE prestation_id = ? AND active = TRUE`,
    [prestationId]
  );
  const groups = groupRows as Array<{ id: number; required: boolean }>;

  const groupsWithValues = await Promise.all(
    groups.map(async (g) => {
      const [valueRows] = await db.query(
        `SELECT price_delta, duration_delta FROM variant_values WHERE variant_group_id = ? AND active = TRUE`,
        [g.id]
      );
      return {
        required: g.required,
        values: (valueRows as any[]).map((v) => ({
          price_delta: Number(v.price_delta),
          duration_delta: Number(v.duration_delta),
        })),
      };
    })
  );

  const [optionRows] = await db.query(
    `SELECT price_delta, duration_delta FROM options WHERE prestation_id = ? AND active = TRUE`,
    [prestationId]
  );
  const options = (optionRows as any[]).map((o) => ({
    price_delta: Number(o.price_delta),
    duration_delta: Number(o.duration_delta),
  }));

  const worst = computeWorstCasePricing({
    basePrice: base.price,
    baseDurationMinutes: base.duration_minutes,
    groups: groupsWithValues,
    options,
  });

  if (worst.price < 0) {
    throw new PrestationConfigError(
      422,
      `Cette configuration peut aboutir à un prix négatif (${worst.price.toFixed(2)} €). Ajuste les tarifs des variantes/options concernées.`,
      "CONFIG_NEGATIVE_PRICE"
    );
  }
  if (worst.durationMinutes <= 0) {
    throw new PrestationConfigError(
      422,
      `Cette configuration peut aboutir à une durée nulle ou négative (${worst.durationMinutes} min). Ajuste les durées des variantes/options concernées.`,
      "CONFIG_NON_POSITIVE_DURATION"
    );
  }
}

// ── Groupes de variantes ────────────────────────────────────────────────────

export interface VariantGroupInput {
  name: string;
  required?: boolean;
  selectionMode?: "single" | "multi";
  sortOrder?: number;
}

export async function listVariantGroups(prestationId: number, proId: number) {
  await assertOwnsPrestation(prestationId, proId);
  const [groupRows] = await db.query(
    `SELECT id, name, required, selection_mode, active, sort_order
     FROM variant_groups WHERE prestation_id = ? ORDER BY sort_order, id`,
    [prestationId]
  );
  const groups = groupRows as any[];
  for (const g of groups) {
    const [valueRows] = await db.query(
      `SELECT id, label, price_delta, duration_delta, active, sort_order
       FROM variant_values WHERE variant_group_id = ? ORDER BY sort_order, id`,
      [g.id]
    );
    g.values = valueRows;
  }
  return groups;
}

export async function createVariantGroup(prestationId: number, proId: number, input: VariantGroupInput) {
  await assertOwnsPrestation(prestationId, proId);
  const [rows] = await db.query(
    `INSERT INTO variant_groups (prestation_id, name, required, selection_mode, sort_order)
     VALUES (?, ?, ?, ?, ?) RETURNING *`,
    [prestationId, input.name, input.required ?? true, input.selectionMode ?? "single", input.sortOrder ?? 0]
  );
  // Un groupe fraîchement créé n'a aucune valeur : s'il est requis, il est
  // déjà "invalide" (groupe requis sans valeur active) — mais ce n'est pas
  // une erreur de prix/durée négatif, donc assertConfigViable ne bloque pas
  // ici (elle skip les groupes sans valeur active, cf. son commentaire).
  await assertConfigViable(prestationId, proId);
  return (rows as any[])[0];
}

export async function updateVariantGroup(
  groupId: number,
  proId: number,
  input: Partial<VariantGroupInput> & { active?: boolean }
) {
  const [ownerRows] = await db.query(
    `SELECT vg.prestation_id FROM variant_groups vg
     JOIN prestations p ON p.id = vg.prestation_id
     WHERE vg.id = ? AND p.pro_id = ?`,
    [groupId, proId]
  );
  const owner = (ownerRows as any[])[0];
  if (!owner) throw new PrestationConfigError(404, "Groupe introuvable", "GROUP_NOT_FOUND");

  const updates: string[] = [];
  const values: unknown[] = [];
  if (input.name !== undefined) { updates.push("name = ?"); values.push(input.name); }
  if (input.required !== undefined) { updates.push("required = ?"); values.push(input.required); }
  if (input.selectionMode !== undefined) { updates.push("selection_mode = ?"); values.push(input.selectionMode); }
  if (input.sortOrder !== undefined) { updates.push("sort_order = ?"); values.push(input.sortOrder); }
  if (input.active !== undefined) { updates.push("active = ?"); values.push(input.active); }
  if (updates.length > 0) {
    values.push(groupId);
    await db.execute(`UPDATE variant_groups SET ${updates.join(", ")} WHERE id = ?`, values);
  }
  await assertConfigViable(owner.prestation_id, proId);

  const [rows] = await db.query(`SELECT * FROM variant_groups WHERE id = ?`, [groupId]);
  return (rows as any[])[0];
}

/**
 * Pas de hard delete si le groupe est référencé par un snapshot de
 * réservation (reservation_item_variants.variant_group_id) — désactivation
 * uniquement dans ce cas, cohérent avec le principe déjà appliqué aux
 * prestations (doc §1.8). Hard delete autorisé sinon (groupe jamais utilisé).
 */
export async function deleteOrDeactivateVariantGroup(groupId: number, proId: number) {
  const [ownerRows] = await db.query(
    `SELECT vg.prestation_id FROM variant_groups vg
     JOIN prestations p ON p.id = vg.prestation_id
     WHERE vg.id = ? AND p.pro_id = ?`,
    [groupId, proId]
  );
  const owner = (ownerRows as any[])[0];
  if (!owner) throw new PrestationConfigError(404, "Groupe introuvable", "GROUP_NOT_FOUND");

  const [usageRows] = await db.query(
    `SELECT 1 FROM reservation_item_variants WHERE variant_group_id = ? LIMIT 1`,
    [groupId]
  );
  if ((usageRows as any[]).length > 0) {
    await db.execute(`UPDATE variant_groups SET active = FALSE WHERE id = ?`, [groupId]);
    return { deactivated: true };
  }
  await db.execute(`DELETE FROM variant_groups WHERE id = ?`, [groupId]);
  return { deactivated: false };
}

// ── Valeurs de variante ──────────────────────────────────────────────────────

export interface VariantValueInput {
  label: string;
  priceDelta?: number;
  durationDelta?: number;
  sortOrder?: number;
}

export async function createVariantValue(groupId: number, proId: number, input: VariantValueInput) {
  const [ownerRows] = await db.query(
    `SELECT vg.prestation_id FROM variant_groups vg
     JOIN prestations p ON p.id = vg.prestation_id
     WHERE vg.id = ? AND p.pro_id = ?`,
    [groupId, proId]
  );
  const owner = (ownerRows as any[])[0];
  if (!owner) throw new PrestationConfigError(404, "Groupe introuvable", "GROUP_NOT_FOUND");

  const [rows] = await db.query(
    `INSERT INTO variant_values (variant_group_id, label, price_delta, duration_delta, sort_order)
     VALUES (?, ?, ?, ?, ?) RETURNING *`,
    [groupId, input.label, input.priceDelta ?? 0, input.durationDelta ?? 0, input.sortOrder ?? 0]
  );
  await assertConfigViable(owner.prestation_id, proId);
  return (rows as any[])[0];
}

export async function updateVariantValue(
  valueId: number,
  proId: number,
  input: Partial<VariantValueInput> & { active?: boolean }
) {
  const [ownerRows] = await db.query(
    `SELECT vg.prestation_id FROM variant_values vv
     JOIN variant_groups vg ON vg.id = vv.variant_group_id
     JOIN prestations p ON p.id = vg.prestation_id
     WHERE vv.id = ? AND p.pro_id = ?`,
    [valueId, proId]
  );
  const owner = (ownerRows as any[])[0];
  if (!owner) throw new PrestationConfigError(404, "Valeur introuvable", "VALUE_NOT_FOUND");

  const updates: string[] = [];
  const values: unknown[] = [];
  if (input.label !== undefined) { updates.push("label = ?"); values.push(input.label); }
  if (input.priceDelta !== undefined) { updates.push("price_delta = ?"); values.push(input.priceDelta); }
  if (input.durationDelta !== undefined) { updates.push("duration_delta = ?"); values.push(input.durationDelta); }
  if (input.sortOrder !== undefined) { updates.push("sort_order = ?"); values.push(input.sortOrder); }
  if (input.active !== undefined) { updates.push("active = ?"); values.push(input.active); }
  if (updates.length > 0) {
    values.push(valueId);
    await db.execute(`UPDATE variant_values SET ${updates.join(", ")} WHERE id = ?`, values);
  }
  await assertConfigViable(owner.prestation_id, proId);

  const [rows] = await db.query(`SELECT * FROM variant_values WHERE id = ?`, [valueId]);
  return (rows as any[])[0];
}

/** Même règle que les groupes : désactivation seule si référencée par un snapshot. */
export async function deleteOrDeactivateVariantValue(valueId: number, proId: number) {
  const [ownerRows] = await db.query(
    `SELECT vg.prestation_id FROM variant_values vv
     JOIN variant_groups vg ON vg.id = vv.variant_group_id
     JOIN prestations p ON p.id = vg.prestation_id
     WHERE vv.id = ? AND p.pro_id = ?`,
    [valueId, proId]
  );
  const owner = (ownerRows as any[])[0];
  if (!owner) throw new PrestationConfigError(404, "Valeur introuvable", "VALUE_NOT_FOUND");

  const [usageRows] = await db.query(
    `SELECT 1 FROM reservation_item_variants WHERE variant_value_id = ? LIMIT 1`,
    [valueId]
  );
  if ((usageRows as any[]).length > 0) {
    await db.execute(`UPDATE variant_values SET active = FALSE WHERE id = ?`, [valueId]);
    return { deactivated: true };
  }
  await db.execute(`DELETE FROM variant_values WHERE id = ?`, [valueId]);
  return { deactivated: false };
}

// ── Options ──────────────────────────────────────────────────────────────────

export interface OptionInput {
  name: string;
  priceDelta?: number;
  durationDelta?: number;
  sortOrder?: number;
}

export async function listOptions(prestationId: number, proId: number) {
  await assertOwnsPrestation(prestationId, proId);
  const [rows] = await db.query(
    `SELECT id, name, price_delta, duration_delta, active, sort_order
     FROM options WHERE prestation_id = ? ORDER BY sort_order, id`,
    [prestationId]
  );
  return rows;
}

export async function createOption(prestationId: number, proId: number, input: OptionInput) {
  await assertOwnsPrestation(prestationId, proId);
  const [rows] = await db.query(
    `INSERT INTO options (prestation_id, name, price_delta, duration_delta, sort_order)
     VALUES (?, ?, ?, ?, ?) RETURNING *`,
    [prestationId, input.name, input.priceDelta ?? 0, input.durationDelta ?? 0, input.sortOrder ?? 0]
  );
  await assertConfigViable(prestationId, proId);
  return (rows as any[])[0];
}

export async function updateOption(optionId: number, proId: number, input: Partial<OptionInput> & { active?: boolean }) {
  const [ownerRows] = await db.query(
    `SELECT o.prestation_id FROM options o
     JOIN prestations p ON p.id = o.prestation_id
     WHERE o.id = ? AND p.pro_id = ?`,
    [optionId, proId]
  );
  const owner = (ownerRows as any[])[0];
  if (!owner) throw new PrestationConfigError(404, "Option introuvable", "OPTION_NOT_FOUND");

  const updates: string[] = [];
  const values: unknown[] = [];
  if (input.name !== undefined) { updates.push("name = ?"); values.push(input.name); }
  if (input.priceDelta !== undefined) { updates.push("price_delta = ?"); values.push(input.priceDelta); }
  if (input.durationDelta !== undefined) { updates.push("duration_delta = ?"); values.push(input.durationDelta); }
  if (input.sortOrder !== undefined) { updates.push("sort_order = ?"); values.push(input.sortOrder); }
  if (input.active !== undefined) { updates.push("active = ?"); values.push(input.active); }
  if (updates.length > 0) {
    values.push(optionId);
    await db.execute(`UPDATE options SET ${updates.join(", ")} WHERE id = ?`, values);
  }
  await assertConfigViable(owner.prestation_id, proId);

  const [rows] = await db.query(`SELECT * FROM options WHERE id = ?`, [optionId]);
  return (rows as any[])[0];
}

export async function deleteOrDeactivateOption(optionId: number, proId: number) {
  const [ownerRows] = await db.query(
    `SELECT o.prestation_id FROM options o
     JOIN prestations p ON p.id = o.prestation_id
     WHERE o.id = ? AND p.pro_id = ?`,
    [optionId, proId]
  );
  const owner = (ownerRows as any[])[0];
  if (!owner) throw new PrestationConfigError(404, "Option introuvable", "OPTION_NOT_FOUND");

  const [usageRows] = await db.query(`SELECT 1 FROM reservation_item_options WHERE option_id = ? LIMIT 1`, [optionId]);
  if ((usageRows as any[]).length > 0) {
    await db.execute(`UPDATE options SET active = FALSE WHERE id = ?`, [optionId]);
    return { deactivated: true };
  }
  await db.execute(`DELETE FROM options WHERE id = ?`, [optionId]);
  return { deactivated: false };
}

// ── Duplication complète (doc §17) ──────────────────────────────────────────

/**
 * Duplique une prestation ET toute sa configuration (groupes, valeurs,
 * options) — jamais de donnée de réservation. Corrige le bug identifié dans
 * l'audit : l'ancienne implémentation (server.ts) omettait déjà les buffers,
 * preparation_instructions, recall_weeks, booking_lead/horizon_days,
 * is_online_bookable, pricing_mode. Nouveaux IDs partout (pas de FK
 * partagée avec l'original — désactiver une valeur sur l'original ne doit
 * jamais affecter la copie).
 */
export async function duplicatePrestation(prestationId: number, proId: number) {
  const [originalRows] = await db.query(`SELECT * FROM prestations WHERE id = ? AND pro_id = ?`, [prestationId, proId]);
  const original = (originalRows as any[])[0];
  if (!original) throw new PrestationConfigError(404, "Prestation introuvable", "PRESTATION_NOT_FOUND");

  const [dupRows] = await db.query(
    `INSERT INTO prestations (
       pro_id, name, description, price, duration_minutes, active,
       buffer_before_minutes, buffer_after_minutes, preparation_instructions, recall_weeks,
       booking_lead_time_minutes, booking_horizon_days, is_online_bookable,
       pricing_mode, ordering_rank
     ) VALUES (?, ?, ?, ?, ?, FALSE, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    [
      proId,
      `${original.name} (copie)`,
      original.description,
      original.price,
      original.duration_minutes,
      original.buffer_before_minutes,
      original.buffer_after_minutes,
      original.preparation_instructions,
      original.recall_weeks,
      original.booking_lead_time_minutes,
      original.booking_horizon_days,
      original.is_online_bookable,
      original.pricing_mode,
      original.ordering_rank,
    ]
  );
  const duplicate = (dupRows as any[])[0];

  const [groupRows] = await db.query(
    `SELECT * FROM variant_groups WHERE prestation_id = ? ORDER BY sort_order, id`,
    [prestationId]
  );
  for (const group of groupRows as any[]) {
    const [newGroupRows] = await db.query(
      `INSERT INTO variant_groups (prestation_id, name, required, selection_mode, active, sort_order)
       VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
      [duplicate.id, group.name, group.required, group.selection_mode, group.active, group.sort_order]
    );
    const newGroupId = (newGroupRows as any[])[0].id;

    const [valueRows] = await db.query(
      `SELECT * FROM variant_values WHERE variant_group_id = ? ORDER BY sort_order, id`,
      [group.id]
    );
    for (const value of valueRows as any[]) {
      await db.execute(
        `INSERT INTO variant_values (variant_group_id, label, price_delta, duration_delta, active, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [newGroupId, value.label, value.price_delta, value.duration_delta, value.active, value.sort_order]
      );
    }
  }

  const [optionRows] = await db.query(`SELECT * FROM options WHERE prestation_id = ? ORDER BY sort_order, id`, [prestationId]);
  for (const option of optionRows as any[]) {
    await db.execute(
      `INSERT INTO options (prestation_id, name, price_delta, duration_delta, active, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [duplicate.id, option.name, option.price_delta, option.duration_delta, option.active, option.sort_order]
    );
  }

  const [questionRows] = await db.query(`SELECT * FROM questions WHERE prestation_id = ? ORDER BY sort_order, id`, [prestationId]);
  for (const question of questionRows as any[]) {
    const [newQuestionRows] = await db.query(
      `INSERT INTO questions (prestation_id, label, type, required, active, is_sensitive, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [duplicate.id, question.label, question.type, question.required, question.active, question.is_sensitive, question.sort_order]
    );
    const newQuestionId = (newQuestionRows as any[])[0].id;

    const [choiceRows] = await db.query(`SELECT * FROM question_choices WHERE question_id = ? ORDER BY sort_order, id`, [question.id]);
    for (const choice of choiceRows as any[]) {
      await db.execute(
        `INSERT INTO question_choices (question_id, label, sort_order) VALUES (?, ?, ?)`,
        [newQuestionId, choice.label, choice.sort_order]
      );
    }
  }

  return duplicate;
}
