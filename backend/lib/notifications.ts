import { WebSocket } from "ws";
import { getDb } from "./db";

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
      const defaultColumns =
        role === "pro"
          ? { user_id: userId, new_reservation: 1, cancel_change: 1, daily_reminder: 1, client_message: 1, payment_alert: 1, activity_summary: 1 }
          : { user_id: userId, reminders: 1, changes: 1, messages: 1, late: 1, offers: 1, email_summary: 0 };
      await db.query(`INSERT INTO ${table} SET ?`, [defaultColumns]);
      return true;
    }

    return (settings as any[])[0][column] === 1;
  } catch (error) {
    console.error("Error checking notification preference:", error);
    return true;
  }
}

export async function sendUnreadNotifications(ws: WebSocket, userId: number): Promise<void> {
  try {
    const [rows] = await getDb().query(
      `SELECT id, user_id, type, title, message, data, is_read, created_at
       FROM notifications WHERE user_id = ? AND is_read = 0 ORDER BY created_at DESC`,
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
    console.log(`⚠️ User ${userId} has disabled ${notification.type} notifications`);
    return false;
  }

  const ws = connectedClients.get(userId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "new_notification", data: notification }));
    console.log(`📨 Notification sent to user ${userId}`);
    return true;
  }

  console.log(`⚠️ User ${userId} not connected`);
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
