-- ============================================================
-- Auth — unicité du numéro de téléphone
-- ============================================================
--
-- `users.email` est déjà UNIQUE. Le numéro de téléphone ne l'était pas : deux
-- comptes pouvaient partager le même 06. On l'aligne.
--
-- Dédoublonnage défensif : s'il existe déjà des doublons, on conserve le compte
-- le plus ancien (created_at, puis id) et on efface le numéro des suivants,
-- avec un NOTICE indiquant combien de lignes ont été touchées.

DO $$
DECLARE
  cleared INT;
BEGIN
  WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY phone_number ORDER BY created_at, id) AS rn
    FROM users
    WHERE phone_number IS NOT NULL AND phone_number <> ''
  )
  UPDATE users u
     SET phone_number = NULL
    FROM ranked r
   WHERE u.id = r.id AND r.rn > 1;

  GET DIAGNOSTICS cleared = ROW_COUNT;
  IF cleared > 0 THEN
    RAISE NOTICE 'unique_phone_number: % compte(s) avec un numero deja utilise -> numero efface', cleared;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_phone_number
  ON users (phone_number)
  WHERE phone_number IS NOT NULL AND phone_number <> '';
