/**
 * Configuration des questions personnalisées d'une prestation — moteur de
 * prestations V2.
 *
 * Réf : docs/ARCHITECTURE_MOTEUR_PRESTATIONS_V1_V3.md (§9, §17).
 * Même pattern que prestation-config.service.ts (V1) : ownership par
 * prestation, désactivation plutôt que suppression physique si la question
 * (ou le choix) est déjà référencée par un snapshot de réservation.
 *
 * Les questions n'ont AUCUN effet sur le prix ou la durée (doc §9, décision
 * verrouillée du chantier V2) — ce service ne touche jamais au pricing engine.
 */

import { getDb } from "../lib/db";
import { detectSensitiveKeywords } from "../lib/sensitive-questions";

const db = getDb();

export class QuestionConfigError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = "QuestionConfigError";
  }
}

async function assertOwnsPrestation(prestationId: number, proId: number): Promise<void> {
  const [rows] = await db.query(`SELECT id FROM prestations WHERE id = ? AND pro_id = ?`, [prestationId, proId]);
  if ((rows as any[]).length === 0) throw new QuestionConfigError(404, "Prestation introuvable", "PRESTATION_NOT_FOUND");
}

// ── Questions ────────────────────────────────────────────────────────────────

export interface QuestionInput {
  label: string;
  type: "short_text" | "long_text" | "boolean" | "single_choice" | "multi_choice";
  required?: boolean;
  isSensitive?: boolean;
  sortOrder?: number;
}

export async function listQuestions(prestationId: number, proId: number) {
  await assertOwnsPrestation(prestationId, proId);
  const [questionRows] = await db.query(
    `SELECT id, label, type, required, active, is_sensitive, sort_order
     FROM questions WHERE prestation_id = ? ORDER BY sort_order, id`,
    [prestationId]
  );
  const questions = questionRows as any[];
  for (const q of questions) {
    const [choiceRows] = await db.query(
      `SELECT id, label, sort_order FROM question_choices WHERE question_id = ? ORDER BY sort_order, id`,
      [q.id]
    );
    q.choices = choiceRows;
  }
  return questions;
}

export async function createQuestion(prestationId: number, proId: number, input: QuestionInput) {
  await assertOwnsPrestation(prestationId, proId);
  const [rows] = await db.query(
    `INSERT INTO questions (prestation_id, label, type, required, is_sensitive, sort_order)
     VALUES (?, ?, ?, ?, ?, ?) RETURNING *`,
    [prestationId, input.label, input.type, input.required ?? false, input.isSensitive ?? false, input.sortOrder ?? 0]
  );
  return (rows as any[])[0];
}

export async function updateQuestion(
  questionId: number,
  proId: number,
  input: Partial<QuestionInput> & { active?: boolean }
) {
  const [ownerRows] = await db.query(
    `SELECT q.prestation_id FROM questions q JOIN prestations p ON p.id = q.prestation_id WHERE q.id = ? AND p.pro_id = ?`,
    [questionId, proId]
  );
  if ((ownerRows as any[]).length === 0) throw new QuestionConfigError(404, "Question introuvable", "QUESTION_NOT_FOUND");

  const updates: string[] = [];
  const values: unknown[] = [];
  if (input.label !== undefined) { updates.push("label = ?"); values.push(input.label); }
  if (input.type !== undefined) { updates.push("type = ?"); values.push(input.type); }
  if (input.required !== undefined) { updates.push("required = ?"); values.push(input.required); }
  if (input.isSensitive !== undefined) { updates.push("is_sensitive = ?"); values.push(input.isSensitive); }
  if (input.sortOrder !== undefined) { updates.push("sort_order = ?"); values.push(input.sortOrder); }
  if (input.active !== undefined) { updates.push("active = ?"); values.push(input.active); }
  if (updates.length > 0) {
    values.push(questionId);
    await db.execute(`UPDATE questions SET ${updates.join(", ")} WHERE id = ?`, values);
  }

  const [rows] = await db.query(`SELECT * FROM questions WHERE id = ?`, [questionId]);
  return (rows as any[])[0];
}

/**
 * Désactivation seule si la question est déjà référencée par un snapshot de
 * réponse (reservation_item_answers.question_id) — même règle que les
 * groupes/valeurs/options V1 (doc §18) : l'historique ne doit jamais pointer
 * dans le vide, et la question doit continuer à ne plus être proposée.
 */
export async function deleteOrDeactivateQuestion(questionId: number, proId: number) {
  const [ownerRows] = await db.query(
    `SELECT q.prestation_id FROM questions q JOIN prestations p ON p.id = q.prestation_id WHERE q.id = ? AND p.pro_id = ?`,
    [questionId, proId]
  );
  if ((ownerRows as any[]).length === 0) throw new QuestionConfigError(404, "Question introuvable", "QUESTION_NOT_FOUND");

  const [usageRows] = await db.query(`SELECT 1 FROM reservation_item_answers WHERE question_id = ? LIMIT 1`, [questionId]);
  if ((usageRows as any[]).length > 0) {
    await db.execute(`UPDATE questions SET active = FALSE WHERE id = ?`, [questionId]);
    return { deactivated: true };
  }
  await db.execute(`DELETE FROM questions WHERE id = ?`, [questionId]);
  return { deactivated: false };
}

// ── Choix ────────────────────────────────────────────────────────────────────

export interface QuestionChoiceInput {
  label: string;
  sortOrder?: number;
}

export async function createQuestionChoice(questionId: number, proId: number, input: QuestionChoiceInput) {
  const [ownerRows] = await db.query(
    `SELECT q.id, q.type FROM questions q JOIN prestations p ON p.id = q.prestation_id WHERE q.id = ? AND p.pro_id = ?`,
    [questionId, proId]
  );
  const owner = (ownerRows as any[])[0];
  if (!owner) throw new QuestionConfigError(404, "Question introuvable", "QUESTION_NOT_FOUND");
  if (owner.type !== "single_choice" && owner.type !== "multi_choice") {
    throw new QuestionConfigError(422, "Cette question n'accepte pas de choix (type non compatible)", "QUESTION_TYPE_NO_CHOICES");
  }

  const [rows] = await db.query(
    `INSERT INTO question_choices (question_id, label, sort_order) VALUES (?, ?, ?) RETURNING *`,
    [questionId, input.label, input.sortOrder ?? 0]
  );
  return (rows as any[])[0];
}

export async function updateQuestionChoice(choiceId: number, proId: number, input: Partial<QuestionChoiceInput>) {
  const [ownerRows] = await db.query(
    `SELECT qc.question_id FROM question_choices qc
     JOIN questions q ON q.id = qc.question_id
     JOIN prestations p ON p.id = q.prestation_id
     WHERE qc.id = ? AND p.pro_id = ?`,
    [choiceId, proId]
  );
  if ((ownerRows as any[]).length === 0) throw new QuestionConfigError(404, "Choix introuvable", "CHOICE_NOT_FOUND");

  const updates: string[] = [];
  const values: unknown[] = [];
  if (input.label !== undefined) { updates.push("label = ?"); values.push(input.label); }
  if (input.sortOrder !== undefined) { updates.push("sort_order = ?"); values.push(input.sortOrder); }
  if (updates.length > 0) {
    values.push(choiceId);
    await db.execute(`UPDATE question_choices SET ${updates.join(", ")} WHERE id = ?`, values);
  }

  const [rows] = await db.query(`SELECT * FROM question_choices WHERE id = ?`, [choiceId]);
  return (rows as any[])[0];
}

/**
 * Pas de flag "active" sur question_choices (doc schéma V1) : suppression
 * physique bloquée si le choix a déjà été répondu, sinon suppression directe.
 * Un choix référencé ne peut donc plus être retiré une fois utilisé — la pro
 * doit renommer/laisser le choix plutôt que le retirer ; cohérent avec
 * l'absence de colonne `active` sur cette table (posée ainsi dès V1).
 */
export async function deleteQuestionChoice(choiceId: number, proId: number) {
  const [ownerRows] = await db.query(
    `SELECT qc.question_id, qc.label FROM question_choices qc
     JOIN questions q ON q.id = qc.question_id
     JOIN prestations p ON p.id = q.prestation_id
     WHERE qc.id = ? AND p.pro_id = ?`,
    [choiceId, proId]
  );
  const owner = (ownerRows as any[])[0];
  if (!owner) throw new QuestionConfigError(404, "Choix introuvable", "CHOICE_NOT_FOUND");

  // Le snapshot d'une réponse choix stocke le LIBELLÉ (jamais l'id — même
  // logique que snapshot_value_label sur les variantes V1), donc l'usage se
  // vérifie par correspondance de libellé, scopée à la question.
  const [usageRows] = await db.query(
    `SELECT 1 FROM reservation_item_answers
     WHERE question_id = ? AND (answer_value = ? OR ? = ANY(answer_values))
     LIMIT 1`,
    [owner.question_id, owner.label, owner.label]
  );
  if ((usageRows as any[]).length > 0) {
    throw new QuestionConfigError(
      409,
      "Ce choix a déjà été utilisé dans une réponse et ne peut pas être supprimé. Renomme-le si besoin.",
      "CHOICE_ALREADY_USED"
    );
  }
  await db.execute(`DELETE FROM question_choices WHERE id = ?`, [choiceId]);
}

// ── Détection assistée (doc §9.2) ────────────────────────────────────────────

export function suggestSensitive(label: string): { suggested: boolean; matchedKeywords: string[] } {
  const matched = detectSensitiveKeywords(label);
  return { suggested: matched.length > 0, matchedKeywords: matched };
}
