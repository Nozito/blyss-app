-- Expo push tokens for React Native mobile app
CREATE TABLE IF NOT EXISTS expo_push_tokens (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (user_id, token)
);

CREATE INDEX IF NOT EXISTS idx_expo_push_tokens_user_id ON expo_push_tokens(user_id);
