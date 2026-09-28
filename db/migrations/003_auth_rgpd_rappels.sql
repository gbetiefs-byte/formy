-- Migration 003 : refresh tokens (revocation JWT), consentement RGPD,
-- rattachement FranceConnect et gestion des échéances.

-- Un utilisateur FranceConnect n'a pas de mot de passe local.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS fc_sub TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS consent_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);

ALTER TABLE user_progress ADD COLUMN IF NOT EXISTS date_echeance DATE;

ALTER TABLE demarches ADD COLUMN IF NOT EXISTS verified_at DATE NOT NULL DEFAULT CURRENT_DATE;
