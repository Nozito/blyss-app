-- ============================================================
-- Moteur de prestations — V2 : support multi_choice sur les réponses
-- ============================================================
--
-- Réf : blyss-mobile/docs/ARCHITECTURE_MOTEUR_PRESTATIONS_V1_V3.md (§9).
-- `answer_value` (singulier) posé en V1 ne peut pas porter plusieurs choix
-- cochés simultanément (type multi_choice). Ajout non destructif d'une
-- colonne tableau dédiée plutôt que de sérialiser une liste dans le TEXT
-- existant — pas de JSONB, cohérent avec la décision verrouillée V1 (tables
-- normalisées).
--
-- Convention : answer_value porte la réponse des types à valeur unique
-- (short_text, long_text, boolean, single_choice) ; answer_values porte la
-- réponse de multi_choice. Exactement une des deux colonnes est renseignée
-- par ligne (contrainte applicative dans reservation.service.ts, pas de
-- CHECK SQL pour rester simple — cf. doc du chantier V2).

BEGIN;

ALTER TABLE reservation_item_answers
  ADD COLUMN IF NOT EXISTS answer_values TEXT[];

COMMIT;
