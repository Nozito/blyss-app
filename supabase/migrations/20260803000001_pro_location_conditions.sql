-- Profile-level booking conditions shown in the client app's "Localisation" section.
-- Left nullable (no default) on purpose: NULL means the pro hasn't configured this yet,
-- distinct from an explicit false — the client app renders that as "Non renseigné"
-- rather than assuming a value the pro never set.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS deposit_required BOOLEAN,
  ADD COLUMN IF NOT EXISTS companions_allowed BOOLEAN,
  ADD COLUMN IF NOT EXISTS handicap_access BOOLEAN;
