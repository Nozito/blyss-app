// ============================================================
// InstagramService.ts
// Gestion complète de l'intégration Instagram Basic Display API
// OAuth2, chiffrement AES-256-GCM, refresh tokens, cache photos
// ============================================================

import crypto from "crypto";
import { getDb } from "../lib/db";

// ──────────────────────────────────────────────────────────────
// TYPES
// ──────────────────────────────────────────────────────────────

export interface InstagramPhoto {
  media_id: string;
  media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  media_url: string;
  thumbnail_url: string | null;
  permalink: string;
  caption: string | null;
  ig_timestamp: string;
  display_order: number;
}

type SyncType = "auto" | "manual" | "oauth_connect";
type SyncStatus = "success" | "failed" | "rate_limited" | "token_expired" | "skip";

// ──────────────────────────────────────────────────────────────
// CONSTANTES
// ──────────────────────────────────────────────────────────────

const ALGORITHM = "aes-256-gcm";
const IG_BASE_URL = "https://graph.instagram.com";
const IG_AUTH_URL = "https://api.instagram.com/oauth/authorize";
const IG_TOKEN_URL = "https://api.instagram.com/oauth/access_token";
const IG_LONG_TOKEN_URL = `${IG_BASE_URL}/access_token`;
const IG_REFRESH_TOKEN_URL = `${IG_BASE_URL}/refresh_access_token`;

// Conservatif par rapport à la limite officielle Instagram (200 req/h)
const MAX_CALLS_PER_HOUR = 150;
// Refresh si moins de 7 jours restants (token valide 60j)
const REFRESH_THRESHOLD_DAYS = 7;
// TTL du state OAuth (10 minutes)
const STATE_TTL_MS = 10 * 60 * 1000;
// Throttle sync manuelle (5 minutes)
const MANUAL_SYNC_THROTTLE_MS = 5 * 60 * 1000;
// TTL du cache photos (1h = validité des URLs CDN Instagram)
const CACHE_TTL_MINUTES = 60;

// ──────────────────────────────────────────────────────────────
// INSTAGRAM SERVICE
// ──────────────────────────────────────────────────────────────

export class InstagramService {
  private db: ReturnType<typeof getDb>;
  private encryptionKey: Buffer;
  private stateSecret: string;
  private appId: string;
  private appSecret: string;
  private redirectUri: string;

  // Rate limiting par pro (in-memory, à remplacer par Redis en prod)
  private rateLimitMap = new Map<number, { count: number; resetAt: number }>();

  // Store des states OAuth en attente (TTL 10min)
  private oauthStateStore = new Map<
    string,
    { proId: number; createdAt: number }
  >();

  constructor(db: ReturnType<typeof getDb>) {
    this.db = db;

    const keyHex = process.env.INSTAGRAM_TOKEN_KEY;
    const stateSecret = process.env.INSTAGRAM_STATE_SECRET;
    const appId = process.env.INSTAGRAM_APP_ID;
    const appSecret = process.env.INSTAGRAM_APP_SECRET;
    const redirectUri = process.env.INSTAGRAM_REDIRECT_URI;

    if (!keyHex || !stateSecret || !appId || !appSecret || !redirectUri) {
      throw new Error(
        "Instagram env vars missing: INSTAGRAM_TOKEN_KEY, INSTAGRAM_STATE_SECRET, " +
          "INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET, INSTAGRAM_REDIRECT_URI"
      );
    }

    if (keyHex.length !== 64) {
      throw new Error("INSTAGRAM_TOKEN_KEY must be 32 bytes (64 hex chars)");
    }

    this.encryptionKey = Buffer.from(keyHex, "hex");
    this.stateSecret = stateSecret;
    this.appId = appId;
    this.appSecret = appSecret;
    this.redirectUri = redirectUri;

    // Nettoyage des states expirés toutes les minutes
    setInterval(() => this.cleanExpiredStates(), 60_000);
  }

  // ────────────────────────────────────────────────────────────
  // OAuth
  // ────────────────────────────────────────────────────────────

  /**
   * Génère l'URL d'autorisation Instagram et stocke le state CSRF.
   */
  buildAuthUrl(proId: number): { url: string; state: string } {
    const nonce = crypto.randomBytes(16).toString("hex");
    const payload = `${proId}:${Date.now()}:${nonce}`;

    // HMAC-SHA256 du payload pour prévenir CSRF et spoofing
    const hmac = crypto
      .createHmac("sha256", this.stateSecret)
      .update(payload)
      .digest("hex");

    const state = `${hmac}.${Buffer.from(payload).toString("base64url")}`;

    this.oauthStateStore.set(state, { proId, createdAt: Date.now() });

    const params = new URLSearchParams({
      client_id: this.appId,
      redirect_uri: this.redirectUri,
      scope: "user_profile,user_media",
      response_type: "code",
      state,
    });

    return { url: `${IG_AUTH_URL}?${params}`, state };
  }

  /**
   * Valide un state OAuth retourné par Instagram.
   * Vérifie : HMAC, identité du pro, TTL, unicité (one-time use).
   */
  validateAndConsumeState(state: string, expectedProId: number): boolean {
    const stored = this.oauthStateStore.get(state);
    if (!stored) return false;

    // Suppression immédiate (one-time use)
    this.oauthStateStore.delete(state);

    // Vérification TTL
    if (Date.now() - stored.createdAt > STATE_TTL_MS) return false;

    // Vérification identité du pro
    if (stored.proId !== expectedProId) return false;

    // Vérification HMAC (timing-safe)
    const [hmac, payloadB64] = state.split(".");
    if (!hmac || !payloadB64) return false;

    const payload = Buffer.from(payloadB64, "base64url").toString();
    const expectedHmac = crypto
      .createHmac("sha256", this.stateSecret)
      .update(payload)
      .digest("hex");

    return crypto.timingSafeEqual(
      Buffer.from(hmac, "hex"),
      Buffer.from(expectedHmac, "hex")
    );
  }

  /**
   * Récupère un state stocké sans le consommer (pour lecture du proId).
   */
  getStoredState(state: string): { proId: number } | null {
    const stored = this.oauthStateStore.get(state);
    if (!stored) return null;
    if (Date.now() - stored.createdAt > STATE_TTL_MS) {
      this.oauthStateStore.delete(state);
      return null;
    }
    return { proId: stored.proId };
  }

  /**
   * Échange un code OAuth contre un long-lived token (60 jours).
   * Étape 1 : code → short-lived token (1h)
   * Étape 2 : short → long-lived token
   */
  async exchangeCodeForLongLivedToken(code: string): Promise<{
    accessToken: string;
    userId: string;
    expiresIn: number;
  }> {
    // Étape 1 : Short-lived token
    const shortRes = await this.fetchWithTimeout(IG_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.appId,
        client_secret: this.appSecret,
        grant_type: "authorization_code",
        redirect_uri: this.redirectUri,
        code,
      }).toString(),
    });

    if (!shortRes.ok) {
      const err = await shortRes.text();
      throw new Error(`Short token exchange failed (${shortRes.status}): ${err}`);
    }

    const shortData = await shortRes.json();

    // Étape 2 : Long-lived token
    const longRes = await this.fetchWithTimeout(
      `${IG_LONG_TOKEN_URL}?` +
        new URLSearchParams({
          grant_type: "ig_exchange_token",
          client_secret: this.appSecret,
          access_token: shortData.access_token,
        })
    );

    if (!longRes.ok) {
      const err = await longRes.text();
      throw new Error(`Long token exchange failed (${longRes.status}): ${err}`);
    }

    const longData = await longRes.json();

    return {
      accessToken: longData.access_token,
      userId: shortData.user_id.toString(),
      expiresIn: longData.expires_in, // ~5 184 000 secondes = 60 jours
    };
  }

  // ────────────────────────────────────────────────────────────
  // Chiffrement AES-256-GCM
  // ────────────────────────────────────────────────────────────

  encryptToken(plainToken: string): {
    encrypted: string;
    iv: string;
    tag: string;
  } {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, this.encryptionKey, iv);

    const encrypted = Buffer.concat([
      cipher.update(plainToken, "utf8"),
      cipher.final(),
    ]);

    return {
      encrypted: encrypted.toString("base64"),
      iv: iv.toString("hex"),
      tag: (cipher as any).getAuthTag().toString("hex"),
    };
  }

  decryptToken(encrypted: string, iv: string, tag: string): string {
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      this.encryptionKey,
      Buffer.from(iv, "hex")
    );
    (decipher as any).setAuthTag(Buffer.from(tag, "hex"));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encrypted, "base64")),
      decipher.final(),
    ]);

    return decrypted.toString("utf8");
  }

  // ────────────────────────────────────────────────────────────
  // Cycle de vie du token
  // ────────────────────────────────────────────────────────────

  /**
   * Rafraîchit le token si moins de REFRESH_THRESHOLD_DAYS restants.
   * Retourne false si le token est révoqué/expiré → connexion désactivée.
   */
  async refreshTokenIfNeeded(proId: number): Promise<boolean> {
    const [rows] = await this.db.query(
      `SELECT access_token_enc, token_iv, token_tag, token_expires_at
       FROM instagram_connections
       WHERE pro_id = ? AND is_active = true`,
      [proId]
    );

    if (!rows.length) return false;

    const conn = rows[0];
    const expiresAt = new Date(conn.token_expires_at);
    const daysRemaining =
      (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24);

    // Pas besoin de refresh
    if (daysRemaining > REFRESH_THRESHOLD_DAYS) return true;

    // Token déjà expiré
    if (daysRemaining <= 0) {
      await this.markConnectionInactive(proId, "expired");
      return false;
    }

    try {
      const plainToken = this.decryptToken(
        conn.access_token_enc,
        conn.token_iv,
        conn.token_tag
      );

      const refreshRes = await this.fetchWithTimeout(
        `${IG_REFRESH_TOKEN_URL}?` +
          new URLSearchParams({
            grant_type: "ig_refresh_token",
            access_token: plainToken,
          })
      );

      if (!refreshRes.ok) {
        await this.markConnectionInactive(proId, "expired");
        return false;
      }

      const refreshed = await refreshRes.json();
      const { encrypted, iv, tag } = this.encryptToken(refreshed.access_token);
      const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000);

      await this.db.query(
        `UPDATE instagram_connections
         SET access_token_enc = ?, token_iv = ?, token_tag = ?,
             token_expires_at = ?, last_refreshed_at = NOW()
         WHERE pro_id = ?`,
        [encrypted, iv, tag, newExpiry, proId]
      );

      return true;
    } catch (err: any) {
      console.error(`[Instagram] Token refresh error for pro ${proId}:`, err.message);
      return false;
    }
  }

  // ────────────────────────────────────────────────────────────
  // Rate Limiting
  // ────────────────────────────────────────────────────────────

  checkRateLimit(proId: number): boolean {
    const now = Date.now();
    const entry = this.rateLimitMap.get(proId);

    if (!entry || now > entry.resetAt) {
      this.rateLimitMap.set(proId, { count: 1, resetAt: now + 3_600_000 });
      return true;
    }

    if (entry.count >= MAX_CALLS_PER_HOUR) return false;

    entry.count++;
    return true;
  }

  // ────────────────────────────────────────────────────────────
  // Synchronisation des photos
  // ────────────────────────────────────────────────────────────

  /**
   * Appelle l'API Instagram, valide et écrit les 6 dernières photos en cache.
   * Opération atomique (transaction).
   */
  async fetchAndCachePhotos(proId: number): Promise<boolean> {
    if (!this.checkRateLimit(proId)) {
      console.warn(`[Instagram] Rate limit reached for pro ${proId}`);
      await this.logSync(proId, "auto", "rate_limited", 0);
      return false;
    }

    const [connRows] = await this.db.query(
      `SELECT access_token_enc, token_iv, token_tag
       FROM instagram_connections
       WHERE pro_id = ? AND is_active = true AND token_expires_at > NOW()`,
      [proId]
    );

    if (!connRows.length) return false;

    const conn = connRows[0];
    let apiCallCount = 0;

    try {
      const token = this.decryptToken(
        conn.access_token_enc,
        conn.token_iv,
        conn.token_tag
      );

      const fields = "id,media_type,media_url,thumbnail_url,permalink,caption,timestamp";
      const mediaRes = await this.fetchWithTimeout(
        `${IG_BASE_URL}/me/media?fields=${fields}&limit=6&access_token=${token}`
      );
      apiCallCount++;

      if (mediaRes.status === 429) {
        await this.logSync(proId, "auto", "rate_limited", 0, apiCallCount);
        return false;
      }

      if (!mediaRes.ok) {
        const errData = await mediaRes.json().catch(() => ({}));

        // Code 190 = token invalide/révoqué
        if (errData?.error?.code === 190) {
          await this.markConnectionInactive(proId, "revoked");
          await this.logSync(proId, "auto", "token_expired", 0, apiCallCount, "Token revoked (code 190)");
          return false;
        }

        throw new Error(`IG API ${mediaRes.status}: ${JSON.stringify(errData)}`);
      }

      const { data: mediaItems } = await mediaRes.json();

      if (!Array.isArray(mediaItems) || mediaItems.length === 0) {
        await this.logSync(proId, "auto", "success", 0, apiCallCount);
        return true;
      }

      // Écriture atomique du cache
      const dbConn = await this.db.getConnection();
      await dbConn.beginTransaction();

      try {
        await dbConn.query(
          `DELETE FROM instagram_media_cache WHERE pro_id = ?`,
          [proId]
        );

        let insertCount = 0;

        for (let i = 0; i < Math.min(mediaItems.length, 6); i++) {
          const item = mediaItems[i];

          // Validation des champs obligatoires
          if (!item.id || !item.media_type || !item.media_url) continue;

          // Validation de l'URL CDN (anti-injection)
          if (!this.isValidInstagramCdnUrl(item.media_url)) {
            console.warn(`[Instagram] Suspicious media_url for pro ${proId}: ${item.media_url}`);
            continue;
          }

          if (item.thumbnail_url && !this.isValidInstagramCdnUrl(item.thumbnail_url)) {
            item.thumbnail_url = null;
          }

          // Validation du permalink
          const safePermalink = this.sanitizePermalink(item.permalink);

          await dbConn.query(
            `INSERT INTO instagram_media_cache
             (pro_id, media_id, media_type, media_url, thumbnail_url,
              permalink, caption, ig_timestamp, cache_expires_at, display_order)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW() + (? * INTERVAL '1 minute'), ?)`,
            [
              proId,
              item.id,
              item.media_type,
              item.media_url,
              item.thumbnail_url ?? null,
              safePermalink,
              item.caption ? item.caption.substring(0, 2200) : null,
              new Date(item.timestamp),
              CACHE_TTL_MINUTES,
              i + 1,
            ]
          );

          insertCount++;
        }

        await dbConn.commit();
        await this.logSync(proId, "auto", "success", insertCount, apiCallCount);
        return true;
      } catch (txErr) {
        await dbConn.rollback();
        throw txErr;
      } finally {
        dbConn.release();
      }
    } catch (err: any) {
      console.error(`[Instagram] Sync failed for pro ${proId}:`, err.message);
      await this.logSync(proId, "auto", "failed", 0, apiCallCount, err.message?.substring(0, 500));
      return false;
    }
  }

  /**
   * Récupère les photos depuis le cache DB.
   */
  async getCachedPhotos(proId: number): Promise<InstagramPhoto[]> {
    const [rows] = await this.db.query(
      `SELECT media_id, media_type, media_url, thumbnail_url,
              permalink, caption, ig_timestamp, display_order
       FROM instagram_media_cache
       WHERE pro_id = ?
       ORDER BY display_order ASC`,
      [proId]
    );
    return rows as InstagramPhoto[];
  }

  /**
   * Vérifie si le cache est expiré (URLs CDN périmées).
   */
  async isCacheExpired(proId: number): Promise<boolean> {
    const [rows] = await this.db.query(
      `SELECT COUNT(*) as cnt
       FROM instagram_media_cache
       WHERE pro_id = ? AND cache_expires_at > NOW()`,
      [proId]
    );
    return rows[0].cnt === 0;
  }

  /**
   * Vérifie si une sync manuelle est autorisée (throttle 5min).
   */
  async canManualSync(proId: number): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
    const [rows] = await this.db.query(
      `SELECT synced_at FROM instagram_sync_log
       WHERE pro_id = ? AND status = 'success'
       ORDER BY synced_at DESC LIMIT 1`,
      [proId]
    );

    if (!rows.length) return { allowed: true };

    const elapsed = Date.now() - new Date(rows[0].synced_at).getTime();
    if (elapsed < MANUAL_SYNC_THROTTLE_MS) {
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil((MANUAL_SYNC_THROTTLE_MS - elapsed) / 1000),
      };
    }

    return { allowed: true };
  }

  /**
   * Récupère le statut de la connexion Instagram d'un pro.
   */
  async getConnectionStatus(proId: number): Promise<{
    connected: boolean;
    username?: string;
    expiresAt?: string;
  }> {
    const [rows] = await this.db.query(
      `SELECT instagram_username, token_expires_at
       FROM instagram_connections
       WHERE pro_id = ? AND is_active = true AND token_expires_at > NOW()`,
      [proId]
    );

    if (!rows.length) return { connected: false };

    return {
      connected: true,
      username: rows[0].instagram_username,
      expiresAt: rows[0].token_expires_at,
    };
  }

  /**
   * Sauvegarde une nouvelle connexion Instagram en DB (UPSERT).
   */
  async saveConnection(
    proId: number,
    instagramUserId: string,
    username: string,
    accessToken: string,
    expiresIn: number,
    scopes: string = "user_profile,user_media"
  ): Promise<void> {
    const { encrypted, iv, tag } = this.encryptToken(accessToken);
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    await this.db.query(
      `INSERT INTO instagram_connections
       (pro_id, instagram_user_id, instagram_username,
        access_token_enc, token_iv, token_tag,
        token_expires_at, last_refreshed_at, scopes_granted, is_active, disconnect_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?, 1, NULL)
       ON DUPLICATE KEY UPDATE
         instagram_user_id   = VALUES(instagram_user_id),
         instagram_username  = VALUES(instagram_username),
         access_token_enc    = VALUES(access_token_enc),
         token_iv            = VALUES(token_iv),
         token_tag           = VALUES(token_tag),
         token_expires_at    = VALUES(token_expires_at),
         last_refreshed_at   = NOW(),
         scopes_granted      = VALUES(scopes_granted),
         is_active           = 1,
         disconnect_reason   = NULL`,
      [proId, instagramUserId, username, encrypted, iv, tag, expiresAt, scopes]
    );
  }

  /**
   * Déconnecte Instagram pour un pro (soft delete + nettoyage cache).
   */
  async disconnect(proId: number): Promise<void> {
    await this.markConnectionInactive(proId, "manual");
    await this.db.query(
      `DELETE FROM instagram_media_cache WHERE pro_id = ?`,
      [proId]
    );
  }

  // ────────────────────────────────────────────────────────────
  // CRON : batch refresh + sync
  // ────────────────────────────────────────────────────────────

  /**
   * À appeler en cron toutes les 6h.
   * Refresh les tokens qui expirent dans < 7 jours.
   */
  async batchRefreshExpiringTokens(): Promise<void> {
    const [pros] = await this.db.query(
      `SELECT ic.pro_id
       FROM instagram_connections ic
       JOIN subscriptions s ON s.client_id = ic.pro_id
       WHERE ic.is_active = true
         AND ic.token_expires_at < NOW() + (? * INTERVAL '1 day')
         AND ic.token_expires_at > NOW()
         AND s.plan = 'signature'
         AND s.status = 'active'
         AND (s.end_date IS NULL OR s.end_date > NOW())`,
      [REFRESH_THRESHOLD_DAYS]
    );

    for (const { pro_id } of pros) {
      await this.refreshTokenIfNeeded(pro_id);
      await this.sleep(500); // Throttle inter-requêtes
    }
  }

  /**
   * À appeler en cron toutes les 6h.
   * Resync les photos pour les pros Signature avec connexion active.
   */
  async batchSyncPhotos(batchSize = 100): Promise<void> {
    const [pros] = await this.db.query(
      `SELECT DISTINCT ic.pro_id
       FROM instagram_connections ic
       JOIN subscriptions s ON s.client_id = ic.pro_id
       WHERE ic.is_active = true
         AND ic.token_expires_at > NOW()
         AND s.plan = 'signature'
         AND s.status = 'active'
         AND (s.end_date IS NULL OR s.end_date > NOW())
       LIMIT ?`,
      [batchSize]
    );

    for (const { pro_id } of pros) {
      await this.fetchAndCachePhotos(pro_id);
      await this.sleep(1000); // 1s entre chaque pro
    }
  }

  // ────────────────────────────────────────────────────────────
  // Helpers privés
  // ────────────────────────────────────────────────────────────

  private async markConnectionInactive(
    proId: number,
    reason: string
  ): Promise<void> {
    await this.db.query(
      `UPDATE instagram_connections
       SET is_active = false, disconnect_reason = ?
       WHERE pro_id = ?`,
      [reason, proId]
    );
  }

  private async logSync(
    proId: number,
    syncType: SyncType,
    status: SyncStatus,
    photosCount: number,
    apiCalls = 0,
    errorMsg?: string
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO instagram_sync_log
       (pro_id, sync_type, status, photos_count, api_calls, error_msg)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [proId, syncType, status, photosCount, apiCalls, errorMsg ?? null]
    ).catch((e) =>
      console.error("[Instagram] Log insert error:", e.message)
    );
  }

  private isValidInstagramCdnUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return (
        parsed.protocol === "https:" &&
        (parsed.hostname.endsWith(".cdninstagram.com") ||
          parsed.hostname.endsWith(".fbcdn.net"))
      );
    } catch {
      return false;
    }
  }

  private sanitizePermalink(url: string): string {
    try {
      const parsed = new URL(url);
      if (!parsed.hostname.endsWith("instagram.com")) {
        return "https://www.instagram.com/";
      }
      // Retourner uniquement origin + pathname
      return `${parsed.origin}${parsed.pathname}`;
    } catch {
      return "https://www.instagram.com/";
    }
  }

  private fetchWithTimeout(
    url: string | URL,
    options?: RequestInit,
    timeoutMs = 10_000
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal }).finally(() =>
      clearTimeout(timer)
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  private cleanExpiredStates(): void {
    const now = Date.now();
    for (const [key, val] of this.oauthStateStore) {
      if (now - val.createdAt > STATE_TTL_MS) {
        this.oauthStateStore.delete(key);
      }
    }
  }
}
