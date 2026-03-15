import webpush from "web-push";
import { getDb } from "./db";

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_EMAIL ?? "contact@blyssapp.fr"}`,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  tag?: string;
  requireInteraction?: boolean;
}

/**
 * Envoie une notification push à tous les appareils d'un utilisateur.
 * Supprime automatiquement les subscriptions expirées (410/404).
 */
export async function sendPushToUser(userId: number, payload: PushPayload): Promise<void> {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;

  const db = getDb();
  const [rows] = await db.query(
    "SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?",
    [userId]
  );

  for (const sub of rows as any[]) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload)
      );
    } catch (err: any) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        await db.query("DELETE FROM push_subscriptions WHERE endpoint = ?", [sub.endpoint]);
      }
    }
  }
}

/**
 * Envoie une notification push à plusieurs utilisateurs en parallèle.
 */
export async function sendPushToUsers(userIds: number[], payload: PushPayload): Promise<void> {
  await Promise.allSettled(userIds.map((id) => sendPushToUser(id, payload)));
}
