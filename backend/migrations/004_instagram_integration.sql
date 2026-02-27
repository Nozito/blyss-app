-- ============================================================
-- Migration 004 : Instagram Integration
-- Tables : instagram_connections, instagram_media_cache, instagram_sync_log
-- ============================================================

-- Table principale : stockage des tokens OAuth chiffrés
CREATE TABLE IF NOT EXISTS instagram_connections (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  pro_id              INT UNSIGNED NOT NULL,

  -- Identifiants Instagram
  instagram_user_id   VARCHAR(50)  NOT NULL,
  instagram_username  VARCHAR(100) NOT NULL,

  -- Token chiffré AES-256-GCM (jamais en clair)
  access_token_enc    TEXT         NOT NULL,
  token_iv            VARCHAR(64)  NOT NULL,
  token_tag           VARCHAR(64)  NOT NULL,

  -- Cycle de vie du token
  token_expires_at    DATETIME     NOT NULL,
  last_refreshed_at   DATETIME     NOT NULL,

  -- Scopes accordés par l'utilisateur Instagram
  scopes_granted      VARCHAR(255) NOT NULL DEFAULT 'user_profile,user_media',

  -- Statut de la connexion
  is_active           TINYINT(1)   NOT NULL DEFAULT 1,
  disconnect_reason   VARCHAR(100)          NULL COMMENT 'revoked | expired | manual | plan_downgrade',

  -- Audit
  connected_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE  KEY uq_pro          (pro_id),
  FOREIGN KEY fk_ig_conn_user (pro_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX   idx_ig_expires      (token_expires_at),
  INDEX   idx_ig_active       (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table de cache : 6 dernières photos (URLs CDN valides ~1h)
CREATE TABLE IF NOT EXISTS instagram_media_cache (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  pro_id           INT UNSIGNED NOT NULL,

  -- Données media Instagram
  media_id         VARCHAR(50)                               NOT NULL,
  media_type       ENUM('IMAGE','VIDEO','CAROUSEL_ALBUM')    NOT NULL,
  media_url        TEXT                                      NOT NULL,
  thumbnail_url    TEXT                                          NULL,
  permalink        VARCHAR(512)                              NOT NULL,
  caption          TEXT                                          NULL,

  -- Horodatage Instagram (date de publication)
  ig_timestamp     DATETIME     NOT NULL,

  -- Gestion du cache
  cached_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cache_expires_at DATETIME     NOT NULL COMMENT 'cached_at + 1h (durée validité URL CDN)',

  -- Ordre d'affichage (1 = plus récent)
  display_order    TINYINT UNSIGNED NOT NULL DEFAULT 1,

  UNIQUE  KEY uq_media          (pro_id, media_id),
  FOREIGN KEY fk_ig_cache_user  (pro_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX   idx_ig_cache_order    (pro_id, display_order),
  INDEX   idx_ig_cache_expires  (cache_expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table de logs : audit des synchronisations
CREATE TABLE IF NOT EXISTS instagram_sync_log (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  pro_id       INT UNSIGNED NOT NULL,

  sync_type    ENUM('auto','manual','oauth_connect')                          NOT NULL,
  status       ENUM('success','failed','rate_limited','token_expired','skip') NOT NULL,
  photos_count TINYINT UNSIGNED                                                   NULL,
  api_calls    TINYINT UNSIGNED                                               NOT NULL DEFAULT 0,
  error_msg    VARCHAR(500)                                                       NULL,

  synced_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_ig_log_pro  (pro_id),
  INDEX idx_ig_log_date (synced_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
