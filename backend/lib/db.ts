import { Pool, PoolClient } from "pg";

let _pool: Pool | undefined;

/** Custom error thrown when a DB query exceeds the timeout. */
export class DbTimeoutError extends Error {
  constructor(message = "Database query timed out") {
    super(message);
    this.name = "DbTimeoutError";
  }
}

const QUERY_TIMEOUT_MS = 5000;

function getPool(): Pool {
  if (!_pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL manquante");
    _pool = new Pool({
      connectionString: url,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
    });

    // Alert on pool-level errors (connection failures, etc.)
    _pool.on("error", (err) => {
      console.error("[DB POOL] Unexpected error:", err.message);
      // Dynamic import to avoid circular dependency
      import("./alerts").then(({ sendAlert }) => {
        sendAlert("critical", "DB connection pool error", { message: err.message }).catch(() => {});
      }).catch(() => {});
    });
  }
  return _pool;
}

/** Convert MySQL-style ? placeholders to PostgreSQL $1, $2, ... */
function convertPlaceholders(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

type QueryResult = [any[], any[]];

async function runQuery(
  runner: (text: string, values?: any[]) => Promise<{ rows: any[]; fields?: any[] }>,
  sql: string,
  params?: any[]
): Promise<QueryResult> {
  const text = convertPlaceholders(sql);

  const queryPromise = runner(text, params).then((result) => {
    return [result.rows, result.fields ?? []] as QueryResult;
  });

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new DbTimeoutError()), QUERY_TIMEOUT_MS)
  );

  return Promise.race([queryPromise, timeoutPromise]);
}

/**
 * Returns a mysql2/promise-compatible DB interface backed by a pg.Pool.
 * Callers destructure as: const [rows] = await db.execute(sql, params)
 */
export function getDb() {
  return {
    execute: (sql: string, params?: any[]) =>
      runQuery((t, v) => getPool().query(t, v), sql, params),

    query: (sql: string, params?: any[]) =>
      runQuery((t, v) => getPool().query(t, v), sql, params),

    getConnection: async () => {
      const client: PoolClient = await getPool().connect();
      const run = (sql: string, params?: any[]) =>
        runQuery((t, v) => client.query(t, v), sql, params);
      return {
        execute: run,
        query: run,
        beginTransaction: () => client.query("BEGIN"),
        commit: () => client.query("COMMIT"),
        rollback: () => client.query("ROLLBACK"),
        release: () => client.release(),
      };
    },
  };
}
