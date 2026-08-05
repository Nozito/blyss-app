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

const isExpoPushToken = (t: string) => /^Expo(nent)?PushToken\[.+\]$/.test(t);

/**
 * Envoie une notification push mobile (APNs/FCM via Expo) à un ou plusieurs
 * utilisateurs — c'est le mécanisme qui atteint réellement l'app React
 * Native (contrairement à sendPushToUser, qui est du web-push VAPID pour
 * navigateur). Mêmes tokens que ceux enregistrés via POST /api/push-token.
 */
export async function sendExpoPushToUsers(
  userIds: number[],
  payload: { title: string; body: string; data?: Record<string, unknown> }
): Promise<void> {
  if (userIds.length === 0) return;
  const db = getDb();

  let tokenRows: Array<{ user_id: number; token: string }> = [];
  try {
    const [rows] = await db.query(
      `SELECT user_id, token FROM expo_push_tokens WHERE user_id IN (${userIds.map(() => "?").join(",")})`,
      userIds
    );
    tokenRows = rows as Array<{ user_id: number; token: string }>;
  } catch {
    return;
  }

  const messages = tokenRows
    .filter((r) => isExpoPushToken(r.token))
    .map((r) => ({
      to: r.token,
      sound: "default",
      title: payload.title,
      body: payload.body,
      data: payload.data ?? {},
    }));

  const CHUNK = 100;
  for (let i = 0; i < messages.length; i += CHUNK) {
    const chunk = messages.slice(i, i + CHUNK);
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(chunk),
    }).catch(() => {});
  }
}
