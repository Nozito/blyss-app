/**
 * Namespaces des verrous consultatifs Postgres (pg_advisory_xact_lock).
 *
 * pg_advisory_xact_lock accepte soit un bigint, soit deux int4. On utilise
 * TOUJOURS la forme à deux int4 `(namespace, ressourceId)` pour qu'un futur
 * verrou sur une autre ressource partageant le même id (ex. pro_id) ne puisse
 * jamais entrer en collision avec un verrou de réservation.
 *
 * Ajouter ici tout nouveau namespace — ne jamais réutiliser une valeur.
 */

/** Verrou sérialisant les écritures de réservation d'une pro (création,
 *  acceptation de reschedule). Clé : (RESERVATION_LOCK_NS, pro_id). */
export const RESERVATION_LOCK_NS = 0x424c; // "BL" (Blyss) — 16972
