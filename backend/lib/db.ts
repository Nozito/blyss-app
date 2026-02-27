import { Pool, PoolClient } from "pg";

let _pool: Pool | undefined;

function getPool(): Pool {
  if (!_pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL manquante");
    _pool = new Pool({
      connectionString: url,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
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
  const result = await runner(text, params);
  return [result.rows, result.fields ?? []];
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
