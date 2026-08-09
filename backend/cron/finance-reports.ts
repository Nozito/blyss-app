/**
 * Finance reports cron — checks hourly, generates:
 *   - a weekly report every Monday, for the week that just ended (Mon→Sun)
 *   - a monthly report on the 1st of the month, for the month that just ended
 *
 * Idempotent via the (pro_id, period_type, period_start) unique index —
 * ON CONFLICT DO NOTHING means re-running the same hour/day twice never
 * duplicates a report or re-notifies a pro who already got one.
 *
 * Notifies via Expo push (reaches the app in background/closed) + an
 * in-app notification row, same pattern as cron/recall.ts.
 */

import { getDb } from "../lib/db";
import { log } from "../lib/logger";
import { getRevenueStats, getTopServices } from "../lib/finance";
import { sendExpoPushToUsers } from "../lib/push";

const ROUTE = "/cron/finance-reports";
const INTERVAL_MS = 60 * 60 * 1000; // 1 heure

function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

async function getActiveProIds(db: ReturnType<typeof getDb>): Promise<number[]> {
  const [rows] = await db.query(
    `SELECT id FROM users WHERE role = 'pro' AND pro_status = 'active'`,
    []
  );
  return (rows as Array<{ id: number }>).map((r) => r.id);
}

async function generateReportsForPeriod(
  periodType: "week" | "month",
  periodStart: Date,
  periodEnd: Date,
  previousStart: Date,
  previousEnd: Date
): Promise<void> {
  const db = getDb();
  const proIds = await getActiveProIds(db);
  if (proIds.length === 0) return;

  const periodStartStr = toDateStr(periodStart);
  const periodEndStr = toDateStr(periodEnd);
  const previousStartStr = toDateStr(previousStart);
  const previousEndStr = toDateStr(previousEnd);

  for (const proId of proIds) {
    try {
      const current = await getRevenueStats(db, proId, periodStartStr, periodEndStr);
      // Un pro sans aucune activité sur la période n'a rien d'intéressant à
      // consulter — pas de rapport, pas de notification qui sonnerait creux.
      if (current.count === 0) continue;

      const previous = await getRevenueStats(db, proId, previousStartStr, previousEndStr);
      const topServices = await getTopServices(db, proId, periodStartStr, periodEndStr, 5);
      const avgBasket = current.count > 0 ? Math.round((current.revenue / current.count) * 100) / 100 : 0;

      const [inserted] = await db.query(
        `INSERT INTO finance_reports
           (pro_id, period_type, period_start, period_end, revenue, previous_revenue, bookings_count, avg_basket, top_services)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (pro_id, period_type, period_start) DO NOTHING
         RETURNING id`,
        [
          proId, periodType, periodStartStr, periodEndStr,
          current.revenue, previous.revenue, current.count, avgBasket,
          JSON.stringify(topServices),
        ]
      );

      if ((inserted as any[]).length > 0) {
        // Same title/body for the in-app row and the push — a shared batch
        // push across every pro used to force a generic body that dropped
        // the revenue figure; sending one push per pro keeps it personal.
        const label = periodType === "week" ? "Ton rapport hebdomadaire est prêt ✨" : "Ton rapport mensuel est prêt ✨";
        const body = `${current.revenue.toFixed(0)} € de CA sur la période — consulte le détail dans Finances.`;

        await db.query(
          `INSERT INTO notifications (user_id, type, title, message, data)
           VALUES (?, 'finance_report', ?, ?, ?)`,
          [proId, label, body, JSON.stringify({ periodType, periodStart: periodStartStr })]
        );
        await sendExpoPushToUsers([proId], {
          title: label,
          body,
          data: { type: "finance_report", periodType },
        });
      }
    } catch (err) {
      log.error(ROUTE, `Failed to generate ${periodType} report for pro ${proId}`, err instanceof Error ? err.stack : String(err));
    }
  }
}

async function runWeeklyReports(): Promise<void> {
  const now = new Date();
  if (now.getDay() !== 1) return; // Lundi uniquement

  // La semaine qui vient de se terminer : lundi dernier → dimanche dernier
  const lastSunday = new Date(now);
  lastSunday.setDate(now.getDate() - 1);
  const lastMonday = new Date(lastSunday);
  lastMonday.setDate(lastSunday.getDate() - 6);

  const prevSunday = new Date(lastMonday);
  prevSunday.setDate(lastMonday.getDate() - 1);
  const prevMonday = new Date(prevSunday);
  prevMonday.setDate(prevSunday.getDate() - 6);

  await generateReportsForPeriod("week", lastMonday, lastSunday, prevMonday, prevSunday);
}

async function runMonthlyReports(): Promise<void> {
  const now = new Date();
  if (now.getDate() !== 1) return; // 1er du mois uniquement

  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth() - 1, 0);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);

  await generateReportsForPeriod("month", lastMonthStart, lastMonthEnd, prevMonthStart, prevMonthEnd);
}

export async function runFinanceReportsCycle(): Promise<void> {
  try {
    await runWeeklyReports();
  } catch (err) {
    log.error(ROUTE, "Weekly reports cycle failed", err instanceof Error ? err.stack : String(err));
  }
  try {
    await runMonthlyReports();
  } catch (err) {
    log.error(ROUTE, "Monthly reports cycle failed", err instanceof Error ? err.stack : String(err));
  }
}

export function startFinanceReportsCron(): void {
  // Premier run 3 minutes après démarrage (couvre le cas où le process
  // redémarre juste après minuit un lundi/1er du mois)
  setTimeout(() => { runFinanceReportsCycle().catch(() => {}); }, 3 * 60 * 1000);

  setInterval(() => { runFinanceReportsCycle().catch(() => {}); }, INTERVAL_MS);

  log.warn(ROUTE, "Finance reports cron started (hourly check)");
}
