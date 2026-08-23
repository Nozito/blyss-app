import { WebSocket } from "ws";
import { getDb } from "./db";
import { log } from "./logger";
import { sendExpoPushToUsers } from "./push";

export const connectedClients = new Map<number, WebSocket>();

// booking_confirmed and late_alert are intentionally absent — no backend
// code path ever emits those types (and their
// corresponding preference toggles were removed from the UI). Every type
// that IS actually sent must have an entry here, or it silently falls
// through to the default column below — that's how no_show and
// slot_available used to end up sharing an on/off switch with
// promotional offers.
const CLIENT_NOTIFICATION_MAPPING: { [key: string]: string } = {
  booking_reminder: "reminders",
  booking_cancelled: "changes",
  booking_rescheduled: "changes",
  appointment_created_by_pro: "changes",
  no_show: "changes",
  slot_available: "reminders",
  post_appointment: "offers",
  recall: "offers",
  promotional: "offers",
  email_summary: "email_summary",
  info: "offers",
  new_message: "messages",
  thread_moderated: "changes",
};

const PRO_NOTIFICATION_MAPPING: { [key: string]: string } = {
  new_booking: "new_reservation",
  booking_cancelled: "cancel_change",
  booking_rescheduled: "cancel_change",
  booking_reminder: "daily_reminder",
  daily_reminder: "daily_reminder",
  payment_received: "payment_alert",
  subscription_billing_issue: "payment_alert",
  activity_summary: "activity_summary",
  finance_report: "activity_summary",
  promotional: "activity_summary",
  info: "activity_summary",
  review_deleted: "activity_summary",
  review_restored: "activity_summary",
  new_message: "client_message",
  thread_moderated: "activity_summary",
};

export async function checkNotificationPreference(
  userId: number,
  notificationType: string
): Promise<boolean> {
  try {
    const db = getDb();
    const [userRows] = await db.query(`SELECT role FROM users WHERE id = ?`, [userId]);
    if ((userRows as any[]).length === 0) return false;

    const role = (userRows as any[])[0].role;
    const mapping = role === "pro" ? PRO_NOTIFICATION_MAPPING : CLIENT_NOTIFICATION_MAPPING;
    const column = mapping[notificationType] || (role === "pro" ? "activity_summary" : "offers");
    const table = role === "pro" ? "pro_notification_settings" : "client_notification_settings";

    const [settings] = await db.query(`SELECT ${column} FROM ${table} WHERE user_id = ?`, [userId]);

    if ((settings as any[]).length === 0) {
      if (role === "pro") {
        await db.query(
          `INSERT INTO pro_notification_settings (user_id, new_reservation, cancel_change, daily_reminder, client_message, payment_alert, activity_summary)
           VALUES (?, TRUE, TRUE, TRUE, TRUE, TRUE, FALSE)
           ON CONFLICT (user_id) DO NOTHING`,
          [userId]
        );
      } else {
        await db.query(
          `INSERT INTO client_notification_settings (user_id, reminders, changes, messages, late, offers, email_summary)
           VALUES (?, TRUE, TRUE, TRUE, TRUE, TRUE, FALSE)
           ON CONFLICT (user_id) DO NOTHING`,
          [userId]
        );
      }
      return true;
    }

    return (settings as any[])[0][column] === true || (settings as any[])[0][column] === 1;
  } catch (error) {
    console.error("Error checking notification preference:", error);
    return true;
  }
}

export async function sendUnreadNotifications(ws: WebSocket, userId: number): Promise<void> {
  try {
    const [rows] = await getDb().query(
      `SELECT id, user_id, type, title, message, data, is_read, created_at
       FROM notifications WHERE user_id = ? AND is_read = FALSE ORDER BY created_at DESC`,
      [userId]
    );
    if ((rows as any[]).length > 0) {
      ws.send(JSON.stringify({ type: "notifications", data: rows }));
    }
  } catch (error) {
    console.error("Error sending unread notifications:", error);
  }
}

export async function sendNotificationToUser(
  userId: number,
  notification: { id: number; type: string; title: string; message: string; data?: any; created_at: string }
): Promise<boolean> {
  const hasPermission = await checkNotificationPreference(userId, notification.type);
  if (!hasPermission) {
    log.warn("/ws/notifications", "notification type disabled", { uid: userId, type: notification.type });
    return false;
  }

  const ws = connectedClients.get(userId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    // App foreground with a live socket: the client already turns this into
    // a local banner (see NotificationContext.tsx) — sending a real Expo push
    // too would show it twice.
    ws.send(JSON.stringify({ type: "new_notification", data: notification }));
    return true;
  }

  // No live socket — app backgrounded/closed, this is the only way to reach it.
  await sendExpoPushToUsers([userId], {
    title: notification.title,
    body: notification.message,
    data: { type: notification.type, ...(notification.data ?? {}) },
  });

  return false;
}

export async function broadcastNotification(
  userIds: number[],
  notification: { type: string; title: string; message: string; data?: any }
): Promise<void> {
  for (const userId of userIds) {
    const hasPermission = await checkNotificationPreference(userId, notification.type);
    if (!hasPermission) continue;

    const ws = connectedClients.get(userId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "new_notification", data: notification }));
    }
  }
}
