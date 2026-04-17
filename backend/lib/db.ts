import { Pool, PoolClient } from "pg";
import { execSync } from "child_process";

/** Custom error thrown when a DB query exceeds the timeout. */
export class DbTimeoutError extends Error {
  constructor(message = "Database query timed out") {
    super(message);
    this.name = "DbTimeoutError";
  }
}

// Timeout par mode : pg = 5s (connexion locale/proche), management API = 30s (HTTP)
const PG_QUERY_TIMEOUT_MS = 5000;
const MGMT_QUERY_TIMEOUT_MS = 30000;

// ── Mode de connexion ────────────────────────────────────────────────────────
// "pg"         : connexion TCP directe via node-postgres (pool)
// "management" : fallback HTTP via Supabase Management API (si pg inaccessible)
type DbMode = "pg" | "management";

let _mode: DbMode | undefined;
let _modePromise: Promise<DbMode> | undefined;
let _pool: Pool | undefined;
let _projectRef: string | undefined;
let _mgmtToken: string | undefined;

// ── Utilitaires Supabase ─────────────────────────────────────────────────────

/** Extrait le project ref depuis DATABASE_URL (pooler ou direct). */
function extractProjectRef(): string {
  const url = process.env.DATABASE_URL ?? "";
  // Pooler format : postgres.{ref}:password@... ou postgres.{ref}@...
  const m1 = url.match(/\/\/postgres\.([a-z0-9]+)[:@]/);
  if (m1) return m1[1];
  // Direct format : @db.{ref}.supabase.co
  const m2 = url.match(/@db\.([a-z0-9]+)\.supabase\.co/);
  if (m2) return m2[1];
  if (process.env.SUPABASE_PROJECT_REF) return process.env.SUPABASE_PROJECT_REF;
  throw new Error("Impossible de détecter le project ref Supabase depuis DATABASE_URL");
}

/** Lit le token Management API (env var ou keychain macOS). */
function readMgmtToken(): string {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN;

  // Supabase CLI stocke le token sous différents noms selon la version et l'OS.
  // go-keyring (macOS) : service = "supabase" (versions récentes) ou "Supabase CLI" (anciennes).
  const serviceNames = ["supabase", "Supabase CLI"];
  for (const svc of serviceNames) {
    try {
      const raw = execSync(
        `security find-generic-password -s "${svc}" -w 2>/dev/null`,
        { stdio: ["pipe", "pipe", "pipe"] }
      ).toString().trim();
      if (!raw || raw.length < 10) continue;
      if (raw.startsWith("go-keyring-base64:")) {
        const decoded = Buffer.from(raw.replace("go-keyring-base64:", ""), "base64").toString().trim();
        if (decoded.length > 10) return decoded;
        continue;
      }
      return raw;
    } catch { /* not macOS or this service name not found */ }
  }

  throw new Error(
    "Token Supabase introuvable. " +
    "Lancez `supabase login` ou définissez SUPABASE_ACCESS_TOKEN dans .env.dev."
  );
}

// ── Pool pg ───────────────────────────────────────────────────────────────────

function getPool(): Pool {
  if (!_pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL manquante");
    _pool = new Pool({
      connectionString: url,
      // rejectUnauthorized: false requis même en prod — le pooler Supabase utilise
    // un certificat AWS intermédiaire absent du trust store Node.js par défaut.
    // Le chiffrement TLS reste actif (ssl: { ... }), seule la validation CA est désactivée.
    ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
    });
    _pool.on("error", (err) => {
      console.error("[DB POOL] Unexpected error:", err.message);
      import("./alerts").then(({ sendAlert }) => {
        sendAlert("critical", "DB connection pool error", { message: err.message }).catch(() => {});
      }).catch(() => {});
    });
  }
  return _pool;
}

// ── Détection du mode (une seule fois au premier appel) ──────────────────────

async function detectMode(): Promise<DbMode> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL manquante");

  // En production, on utilise toujours pg directement (pas de probe ni fallback).
  // La Management API est un fallback dev uniquement (machines sans IPv6).
  if (process.env.NODE_ENV === "production") {
    _mode = "pg";
    console.info("[DB] pg direct connection (production)");
    return _mode;
  }

  // Test rapide (3s) pour voir si pg est joignable (dev uniquement)
  // Probe pool is dev-only (we already returned early for production above)
  const probe = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 3000,
    max: 1,
  });

  try {
    const client = await probe.connect();
    client.release();
    await probe.end();
    _mode = "pg";
    console.info("[DB] pg direct connection (dev)");
  } catch {
    await probe.end().catch(() => {});
    _mode = "management";
    _projectRef = extractProjectRef();
    _mgmtToken = readMgmtToken();
    console.info("[DB] Management API fallback (pg unreachable in dev)");
  }

  return _mode;
}

function getMode(): Promise<DbMode> {
  if (_mode) return Promise.resolve(_mode);
  if (!_modePromise) _modePromise = detectMode();
  return _modePromise;
}

// ── Utilitaires SQL ───────────────────────────────────────────────────────────

/** Convertit les placeholders MySQL-style ? en $1, $2, ... (PostgreSQL). */
function convertPlaceholders(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

/**
 * Colonnes BOOLEAN du schéma Blyss.
 * Permet de convertir 0/1 (style MySQL) en FALSE/TRUE (PostgreSQL) selon le contexte SQL.
 */
const BOOLEAN_COLUMNS = new Set([
  "is_read", "is_admin", "is_active", "active", "revoked", "processed",
  "paid_online", "accept_online_payment", "stripe_onboarding_complete",
  "reminders", "changes", "messages", "late", "offers", "email_summary",
  "new_reservation", "cancel_change", "daily_reminder", "client_message",
  "payment_alert", "activity_summary",
]);

/**
 * Interpole les params positionnels ($1, $2, ...) dans une chaîne SQL.
 * Utilisé uniquement en mode Management API — pg utilise la liaison native.
 *
 * Gère la migration MySQL → PostgreSQL :
 * - Valeurs 0/1 passées pour des colonnes BOOLEAN → converties en FALSE/TRUE
 *   en détectant le nom de colonne dans le SQL précédant le placeholder.
 * - Chaînes : échappement SQL standard (quote → double quote).
 */
function interpolateSql(sql: string, params?: any[]): string {
  if (!params || params.length === 0) return sql;
  return sql.replace(/\$(\d+)/g, (match, idx, offset) => {
    const val = params[parseInt(idx, 10) - 1];

    // Détection du contexte booléen : colonne_bool = $N ou colonne_bool != $N
    if ((val === 0 || val === 1) && typeof val === "number") {
      const before = sql.substring(0, offset as number);
      const colMatch = before.match(/\b(\w+)\s*(?:=|!=|<>|IS(?:\s+NOT)?)\s*$/i);
      if (colMatch && BOOLEAN_COLUMNS.has(colMatch[1].toLowerCase())) {
        return val === 0 ? "FALSE" : "TRUE";
      }
    }

    if (val === null || val === undefined) return "NULL";
    if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
    if (typeof val === "number") return Number.isFinite(val) ? String(val) : "NULL";
    if (val instanceof Date) return `'${val.toISOString()}'`;
    if (Array.isArray(val) || typeof val === "object") {
      return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
    }
    return `'${String(val).replace(/'/g, "''")}'`;
  });
}

// ── Management API ────────────────────────────────────────────────────────────

type QueryResult = [any[], any[]];

async function mgmtQuery(sql: string, params?: any[]): Promise<QueryResult> {
  const query = interpolateSql(sql, params);
  const resp = await fetch(
    `https://api.supabase.com/v1/projects/${_projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${_mgmtToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    }
  );
  const json = await resp.json() as any;
  if (!resp.ok || json?.message) {
    throw new Error(`[DB Management API] ${json?.message ?? JSON.stringify(json)}`);
  }
  return [Array.isArray(json) ? json : [], []];
}

// ── Exécution avec timeout ────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new DbTimeoutError()), ms)
  );
  return Promise.race([promise, timeout]);
}

async function runQuery(sql: string, params?: any[]): Promise<QueryResult> {
  const text = convertPlaceholders(sql);
  const mode = await getMode(); // attend la détection (1s max pour pg probe)

  if (mode === "pg") {
    return withTimeout(
      getPool().query(text, params).then((r) => [r.rows, r.fields ?? []] as QueryResult),
      PG_QUERY_TIMEOUT_MS
    );
  } else {
    return withTimeout(mgmtQuery(text, params), MGMT_QUERY_TIMEOUT_MS);
  }
}

async function runQueryOnClient(
  client: PoolClient,
  sql: string,
  params?: any[]
): Promise<QueryResult> {
  return withTimeout(
    client.query(sql, params).then((r) => [r.rows, r.fields ?? []] as QueryResult),
    PG_QUERY_TIMEOUT_MS
  );
}

// ── Interface publique ────────────────────────────────────────────────────────

/**
 * Retourne un objet DB compatible mysql2/promise, backed by pg.Pool ou
 * Supabase Management API selon la disponibilité du serveur pg.
 *
 * Utilisation : const [rows] = await db.execute(sql, params)
 */
export function getDb() {
  return {
    execute: (sql: string, params?: any[]) => runQuery(sql, params),

    query: (sql: string, params?: any[]) => runQuery(sql, params),

    getConnection: async () => {
      const mode = await getMode();

      if (mode === "pg") {
        // Transactions atomiques complètes via pg client dédié
        const client: PoolClient = await getPool().connect();
        const run = (sql: string, params?: any[]) =>
          runQueryOnClient(client, convertPlaceholders(sql), params);
        return {
          execute: run,
          query: run,
          beginTransaction: () => client.query("BEGIN"),
          commit: () => client.query("COMMIT"),
          rollback: () => client.query("ROLLBACK"),
          release: () => client.release(),
        };
      } else {
        // Mode Management API : chaque requête est exécutée immédiatement.
        // begin/commit/rollback sont des no-ops (pas d'atomicité garantie en dev).
        return {
          execute: (sql: string, params?: any[]) => runQuery(sql, params),
          query: (sql: string, params?: any[]) => runQuery(sql, params),
          beginTransaction: async () => {},
          commit: async () => {},
          rollback: async () => {},
          release: () => {},
        };
      }
    },
  };
}
