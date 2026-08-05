-- Portfolio photos ("galerie de réalisations") — la table n'a jamais existé :
-- le front (app/(pro)/(profile)/public-profile.tsx) appelle GET/POST/DELETE
-- /api/pro/gallery depuis le début, mais aucune route ni table backend ne
-- les servait (404 silencieux). Cette migration + les routes serveur
-- associées comblent le trou.

CREATE TABLE gallery_images (
  id          SERIAL PRIMARY KEY,
  pro_id      INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  thumbnail   TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_gallery_images_pro ON gallery_images(pro_id, created_at DESC);
