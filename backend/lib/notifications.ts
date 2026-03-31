import { WebSocket } from "ws";
import { getDb } from "./db";
import { log } from "./logger";

export const connectedClients = new Map<number, WebSocket>();

const CLIENT_NOTIFICATION_MAPPING: { [key: string]: string } = {
  booking_confirmed: "changes",
  booking_reminder: "reminders",
  booking_cancelled: "changes",
  message_received: "messages",
  late_alert: "late",
  promotional: "offers",
  email_summary: "email_summary",
  info: "offers",
};

const PRO_NOTIFICATION_MAPPING: { [key: string]: string } = {
  new_booking: "new_reservation",
  booking_confirmed: "cancel_change",
  booking_cancelled: "cancel_change",
  booking_reminder: "daily_reminder",
  message_received: "client_message",
  payment_received: "payment_alert",
  activity_summary: "activity_summary",
  promotional: "activity_summary",
  info: "activity_summary",
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
    ws.send(JSON.stringify({ type: "new_notification", data: notification }));
    return true;
  }

  // User offline — normal, not an error
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
