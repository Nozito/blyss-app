import mysql, { Pool } from "mysql2/promise";

let _pool: Pool | undefined;

/**
 * Lazy-initialized MySQL pool.
 * Called at request time (not at module load), so dotenv has already run.
 */
export function getDb(): Pool {
  if (!_pool) {
    _pool = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 3306,
      waitForConnections: true,
      connectionLimit: 10,
    });
  }
  return _pool;
}
