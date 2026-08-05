/**
 * Requêtes financières partagées entre /api/pro/finance/* et le cron de
 * génération de rapports (cron/finance-reports.ts), pour garder une seule
 * définition de "CA d'une période" et "top prestations" dans tout le backend.
 */

type Db = ReturnType<typeof import("./db").getDb>;

export interface RevenueStats {
  revenue: number;
  count: number;
}

export async function getRevenueStats(
  db: Db,
  proId: number,
  from: string,
  to: string
): Promise<RevenueStats> {
  const [rows] = await db.query(
    `SELECT COALESCE(SUM(price), 0) AS revenue, COUNT(*) AS count
     FROM reservations
     WHERE pro_id = ?
       AND start_datetime::date BETWEEN ? AND ?
       AND status IN ('confirmed','completed')`,
    [proId, from, to]
  );
  const row = (rows as any[])[0];
  return { revenue: Number(row?.revenue) || 0, count: Number(row?.count) || 0 };
}

export interface TopService {
  name: string;
  revenue: number;
  count: number;
  percentage: number;
}

export async function getTopServices(
  db: Db,
  proId: number,
  from: string,
  to: string,
  limit = 5
): Promise<TopService[]> {
  const [rows] = await db.query(
    `SELECT COALESCE(p.name, 'Prestation') AS name,
            SUM(r.price) AS revenue,
            COUNT(*) AS count
     FROM reservations r
     LEFT JOIN prestations p ON p.id = r.prestation_id
     WHERE r.pro_id = ?
       AND r.start_datetime::date BETWEEN ? AND ?
       AND r.status IN ('confirmed','completed')
     GROUP BY COALESCE(p.name, 'Prestation')
     ORDER BY revenue DESC
     LIMIT ?`,
    [proId, from, to, limit]
  );
  const list = rows as Array<{ name: string; revenue: string | number; count: string | number }>;
  const total = list.reduce((sum, r) => sum + (Number(r.revenue) || 0), 0);
  return list.map((r) => ({
    name: r.name,
    revenue: Number(r.revenue) || 0,
    count: Number(r.count) || 0,
    percentage: total > 0 ? Math.round(((Number(r.revenue) || 0) / total) * 1000) / 10 : 0,
  }));
}
