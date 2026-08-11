/**
 * Appointment reminder cron — runs every 15 minutes.
 *
 * Sends push notifications to clients:
 *   - J-1   : day before the appointment (sent once, any time that day)
 *   - H-2   : ~2 hours before the appointment (±10 min window for 15-min cycle)
 *   - POST  : ~24h after a completed appointment, review + rebook nudge —
 *             only for pros on Sérénité or Signature (feature grid: "Rappels
 *             post-prestation").
 *
 * Also keeps a pro's Live Activity phase in sync with the clock even while
 * their app is backgrounded/killed (manageLiveActivities / start,
 * pushLiveActivityInProgress / upcoming -> en cours,
 * endExpiredLiveActivities / en cours -> ended) — the widget's own phase
 * label only recomputes when something pushes a new content-state, it
 * doesn't tick on its own.
 *
 * Respects client_notification_settings.reminders preference.
 * Each reminder is idempotent via reminder_j1_sent / reminder_h2_sent / reminder_post_sent flags.
 *
 * Race condition prevention: a single CTE atomically marks rows (UPDATE...RETURNING)
 * with FOR UPDATE SKIP LOCKED so concurrent instances never double-send.
 */

import { sendPushToUser, sendExpoPushToUsers } from "./push";
import { getDb } from "./db";
import { log } from "./logger";
import { sendLiveActivityStart, sendLiveActivityUpdate, sendLiveActivityEnd, isApnsConfigured } from "./apns";
import { applyLiveActivityPrivacy } from "./liveActivityPrivacy";

/**
 * Atomically claims J-1 reminders that have not been sent yet and returns
 * their data. Uses FOR UPDATE SKIP LOCKED + UPDATE...RETURNING in one CTE
 * so concurrent cron instances cannot claim the same row.
 */
const J1_CLAIM_QUERY = `
  WITH locked AS (
    SELECT r.id
    FROM reservations r
    JOIN users u_client ON u_client.id = r.client_id AND u_client.is_active = true
    LEFT JOIN client_notification_settings cns ON cns.user_id = r.client_id
    WHERE
      DATE(r.start_datetime AT TIME ZONE 'Europe/Paris') = (CURRENT_DATE + INTERVAL '1 day')
      AND r.status = 'confirmed'
      AND r.reminder_j1_sent = false
      AND COALESCE(cns.reminders, true) = true
    FOR UPDATE OF r SKIP LOCKED
  ),
  claimed AS (
    UPDATE reservations
    SET reminder_j1_sent = true
    FROM locked
    WHERE reservations.id = locked.id
    RETURNING
      reservations.id,
      reservations.client_id,
      reservations.pro_id,
      reservations.prestation_id,
      TO_CHAR(reservations.start_datetime AT TIME ZONE 'Europe/Paris', 'HH24"h"MI') AS rdv_time
  )
  SELECT
    c.id,
    c.client_id,
    c.rdv_time,
    COALESCE(p.name, 'Soin') AS prestation_name,
    p.preparation_instructions,
    COALESCE(
      NULLIF(TRIM(u_pro.activity_name), ''),
      u_pro.first_name || ' ' || u_pro.last_name
    ) AS pro_name
  FROM claimed c
  LEFT JOIN prestations p ON p.id = c.prestation_id
  JOIN users u_pro ON u_pro.id = c.pro_id
`;

/**
 * Atomically claims H-2 reminders using the same CTE pattern.
 */
const H2_CLAIM_QUERY = `
  WITH locked AS (
    SELECT r.id
    FROM reservations r
    JOIN users u_client ON u_client.id = r.client_id AND u_client.is_active = true
    LEFT JOIN client_notification_settings cns ON cns.user_id = r.client_id
    WHERE
      r.start_datetime BETWEEN
        (NOW() + INTERVAL '1 hour 50 minutes') AND
        (NOW() + INTERVAL '2 hours 10 minutes')
      AND r.status = 'confirmed'
      AND r.reminder_h2_sent = false
      AND COALESCE(cns.reminders, true) = true
    FOR UPDATE OF r SKIP LOCKED
  ),
  claimed AS (
    UPDATE reservations
    SET reminder_h2_sent = true
    FROM locked
    WHERE reservations.id = locked.id
    RETURNING
      reservations.id,
      reservations.client_id,
      reservations.pro_id,
      reservations.prestation_id,
      TO_CHAR(reservations.start_datetime AT TIME ZONE 'Europe/Paris', 'HH24"h"MI') AS rdv_time
  )
  SELECT
    c.id,
    c.client_id,
    c.rdv_time,
    COALESCE(p.name, 'Soin') AS prestation_name,
    COALESCE(
      NULLIF(TRIM(u_pro.activity_name), ''),
      u_pro.first_name || ' ' || u_pro.last_name
    ) AS pro_name
  FROM claimed c
  LEFT JOIN prestations p ON p.id = c.prestation_id
  JOIN users u_pro ON u_pro.id = c.pro_id
`;

/**
 * Atomically claims post-appointment reminders (completed reservations,
 * end_datetime at least 24h in the past) for pros currently on Sérénité or
 * Signature. Same CTE + SKIP LOCKED pattern as J1/H2.
 */
const POST_CLAIM_QUERY = `
  WITH locked AS (
    SELECT r.id
    FROM reservations r
    JOIN users u_client ON u_client.id = r.client_id AND u_client.is_active = true
    LEFT JOIN client_notification_settings cns ON cns.user_id = r.client_id
    WHERE
      r.status = 'completed'
      AND r.end_datetime <= (NOW() - INTERVAL '24 hours')
      AND r.reminder_post_sent = false
      AND COALESCE(cns.reminders, true) = true
      AND EXISTS (
        SELECT 1 FROM subscriptions s
        WHERE s.client_id = r.pro_id
          AND s.status = 'active'
          AND s.plan IN ('serenite', 'signature')
      )
    FOR UPDATE OF r SKIP LOCKED
  ),
  claimed AS (
    UPDATE reservations
    SET reminder_post_sent = true
    FROM locked
    WHERE reservations.id = locked.id
    RETURNING
      reservations.id,
      reservations.client_id,
      reservations.pro_id,
      reservations.prestation_id
  )
  SELECT
    c.id,
    c.client_id,
    c.pro_id,
    COALESCE(p.name, 'Soin') AS prestation_name,
    COALESCE(
      NULLIF(TRIM(u_pro.activity_name), ''),
      u_pro.first_name || ' ' || u_pro.last_name
    ) AS pro_name
  FROM claimed c
  LEFT JOIN prestations p ON p.id = c.prestation_id
  JOIN users u_pro ON u_pro.id = c.pro_id
`;

/**
 * Claims reservations entering the Live Activity trigger window (up to 3h
 * before start) for pros with the feature enabled and a push-to-start token
 * registered. Idempotent via reservations.live_activity_started — unlike the
 * J1/H2 windows this one is open-ended (now → +3h) rather than a narrow
 * band, since the flag (not the window) is what prevents re-triggering
 * across 15-min cycles.
 */
const LIVE_ACTIVITY_CLAIM_QUERY = `
  WITH locked AS (
    SELECT r.id
    FROM reservations r
    JOIN users u_pro ON u_pro.id = r.pro_id AND u_pro.live_activity_enabled = true
    JOIN live_activity_tokens t ON t.user_id = r.pro_id AND t.kind = 'start'
    WHERE
      r.start_datetime BETWEEN NOW() AND (NOW() + INTERVAL '3 hours')
      AND r.status = 'confirmed'
      AND r.live_activity_started = false
    FOR UPDATE OF r SKIP LOCKED
  ),
  claimed AS (
    UPDATE reservations
    SET live_activity_started = true
    FROM locked
    WHERE reservations.id = locked.id
    RETURNING
      reservations.id, reservations.pro_id, reservations.client_id, reservations.prestation_id,
      reservations.start_datetime, reservations.end_datetime
  )
  SELECT
    c.id, c.pro_id, c.start_datetime, c.end_datetime,
    COALESCE(p.name, 'Soin') AS prestation_name,
    u_client.first_name AS client_first_name,
    u_pro.live_activity_privacy AS privacy,
    t.push_token AS push_to_start_token
  FROM claimed c
  LEFT JOIN prestations p ON p.id = c.prestation_id
  JOIN users u_client ON u_client.id = c.client_id
  JOIN users u_pro ON u_pro.id = c.pro_id
  JOIN live_activity_tokens t ON t.user_id = c.pro_id AND t.kind = 'start'
`;

async function manageLiveActivities(): Promise<void> {
  const db = getDb();
  const [rows] = await db.query(LIVE_ACTIVITY_CLAIM_QUERY, []);

  let started = 0;
  for (const row of rows as any[]) {
    try {
      const { clientFirstName, showTime } = applyLiveActivityPrivacy(row.privacy, row.client_first_name);
      const contentState = {
        startAt: row.start_datetime,
        endAt: row.end_datetime,
        prestationName: row.privacy === "full" ? row.prestation_name : null,
        clientFirstName,
        showTime,
        privacyLevel: row.privacy,
      };
      const staleDate = Math.floor(new Date(row.end_datetime).getTime() / 1000);
      const result = await sendLiveActivityStart(
        row.push_to_start_token,
        { reservationId: row.id },
        contentState,
        staleDate
      );
      if (result.tokenInvalid) {
        await db.query("DELETE FROM live_activity_tokens WHERE user_id = ? AND kind = 'start'", [row.pro_id]);
      }
      if (result.ok) started++;
    } catch (err) {
      log.error(
        "/cron/reminders",
        `Live Activity push-to-start failed for reservation ${row.id}`,
        err instanceof Error ? err.stack : String(err)
      );
    }
  }

  if (started > 0) {
    log.warn("/cron/reminders", `LIVE ACTIVITY: ${started} started`);
  }
}

/**
 * Claims reservations whose Live Activity has been running (push-to-start
 * already sent) and whose start time has now passed — pushing a fresh
 * content-state update is what actually flips the widget's phase label from
 * "Prochain" to "En cours" for a backgrounded app. Without this, that
 * transition only ever happened to occur when something unrelated (5-min
 * foreground poll, a reschedule) forced a re-render.
 */
const LIVE_ACTIVITY_INPROGRESS_QUERY = `
  WITH locked AS (
    SELECT r.id
    FROM reservations r
    WHERE
      r.start_datetime <= NOW()
      AND r.end_datetime > NOW()
      AND r.status = 'confirmed'
      AND r.live_activity_started = true
      AND r.live_activity_inprogress_pushed = false
    FOR UPDATE OF r SKIP LOCKED
  ),
  claimed AS (
    UPDATE reservations
    SET live_activity_inprogress_pushed = true
    FROM locked
    WHERE reservations.id = locked.id
    RETURNING
      reservations.id, reservations.pro_id, reservations.client_id, reservations.prestation_id,
      reservations.start_datetime, reservations.end_datetime
  )
  SELECT
    c.id, c.start_datetime, c.end_datetime,
    COALESCE(p.name, 'Soin') AS prestation_name,
    u_client.first_name AS client_first_name,
    u_pro.live_activity_privacy AS privacy,
    t.push_token AS update_token
  FROM claimed c
  LEFT JOIN prestations p ON p.id = c.prestation_id
  JOIN users u_client ON u_client.id = c.client_id
  JOIN users u_pro ON u_pro.id = c.pro_id
  LEFT JOIN live_activity_tokens t ON t.reservation_id = c.id AND t.kind = 'update'
`;

async function pushLiveActivityInProgress(): Promise<void> {
  const db = getDb();
  const [rows] = await db.query(LIVE_ACTIVITY_INPROGRESS_QUERY, []);

  let sent = 0;
  for (const row of rows as any[]) {
    // The reservation is claimed (flag flipped) regardless — no update
    // token yet just means the device never registered one (app not opened
    // since the activity was push-started); nothing to push to.
    if (!row.update_token) continue;
    try {
      const { clientFirstName, showTime } = applyLiveActivityPrivacy(row.privacy, row.client_first_name);
      const staleDate = Math.floor(new Date(row.end_datetime).getTime() / 1000);
      const result = await sendLiveActivityUpdate(
        row.update_token,
        {
          startAt: row.start_datetime,
          endAt: row.end_datetime,
          prestationName: row.privacy === "full" ? row.prestation_name : null,
          clientFirstName,
          showTime,
          privacyLevel: row.privacy,
        },
        staleDate
      );
      if (result.tokenInvalid) {
        await db.query("DELETE FROM live_activity_tokens WHERE reservation_id = ? AND kind = 'update'", [row.id]);
      }
      if (result.ok) sent++;
    } catch (err) {
      log.error(
        "/cron/reminders",
        `Live Activity in-progress push failed for reservation ${row.id}`,
        err instanceof Error ? err.stack : String(err)
      );
    }
  }

  if (sent > 0) {
    log.warn("/cron/reminders", `LIVE ACTIVITY: ${sent} transitioned to en cours`);
  }
}

/**
 * Ends any Live Activity whose reservation's end time has passed. The
 * client only ever ends+restarts activities while foregrounded (5-min
 * poll) — a pro who backgrounds or kills the app mid-appointment would
 * otherwise be left with a stale "En cours" activity forever, since nothing
 * else calls sendLiveActivityEnd on a schedule. Deleting the 'update' token
 * row is itself the idempotency marker (same row a running activity is
 * pushed through), so no separate "already ended" flag is needed — an
 * activity dropped here is simply gone from the next cycle's WHERE clause.
 */
const LIVE_ACTIVITY_EXPIRED_QUERY = `
  WITH claimed AS (
    DELETE FROM live_activity_tokens lat
    USING reservations r
    WHERE lat.kind = 'update'
      AND lat.reservation_id = r.id
      AND r.end_datetime <= NOW()
    RETURNING lat.reservation_id, lat.push_token
  )
  SELECT * FROM claimed
`;

async function endExpiredLiveActivities(): Promise<void> {
  const db = getDb();
  const [rows] = await db.query(LIVE_ACTIVITY_EXPIRED_QUERY, []);

  let ended = 0;
  for (const row of rows as any[]) {
    try {
      const result = await sendLiveActivityEnd(row.push_token);
      if (result.ok) ended++;
    } catch (err) {
      log.error(
        "/cron/reminders",
        `Live Activity end push failed for reservation ${row.reservation_id}`,
        err instanceof Error ? err.stack : String(err)
      );
    }
  }

  if (ended > 0) {
    log.warn("/cron/reminders", `LIVE ACTIVITY: ${ended} ended (appointment over)`);
  }
}

async function sendPostReminders(): Promise<void> {
  const db = getDb();
  const [rows] = await db.query(POST_CLAIM_QUERY, []);

  let sent = 0;
  for (const row of rows as any[]) {
    // Same reasoning as sendJ1Reminders: don't let one failed push abort
    // the rest of an already-claimed batch.
    try {
      const title = "Comment s'est passé ton RDV ? 💬";
      const body = `Ton rendez-vous avec ${row.pro_name} (${row.prestation_name}) est terminé. Laisse un avis et reprends ton prochain créneau dès maintenant !`;
      await sendPushToUser(row.client_id, {
        title,
        body,
        url: "/client/bookings",
        tag: `rdv-post-${row.id}`,
      });
      await sendExpoPushToUsers([row.client_id], {
        title,
        body,
        data: { type: "post_appointment", reservation_id: row.id },
      });
      await db.query(
        `INSERT INTO notifications (user_id, type, title, message, data)
         VALUES (?, 'post_appointment', ?, ?, ?)`,
        [row.client_id, title, body, JSON.stringify({ reservation_id: row.id })]
      );
      sent++;
    } catch (err) {
      log.error(
        "/cron/reminders",
        `Post-appointment push failed for reservation ${row.id}`,
        err instanceof Error ? err.stack : String(err)
      );
    }
  }

  if (sent > 0) {
    log.warn("/cron/reminders", `POST: ${sent} reminder(s) sent`);
  }
}

async function sendJ1Reminders(): Promise<void> {
  const db = getDb();
  const [rows] = await db.query(J1_CLAIM_QUERY, []);

  let sent = 0;
  for (const row of rows as any[]) {
    // The row is already claimed (reminder_j1_sent=true) by the CTE above —
    // an uncaught error here would otherwise abort the whole loop, silently
    // dropping the push for every remaining row in this batch too, not just
    // this one (all already marked "sent" regardless of whether it happened).
    try {
      let body = `${row.prestation_name} avec ${row.pro_name} demain à ${row.rdv_time}.`;
      if (row.preparation_instructions) {
        body += ` ${row.preparation_instructions}`;
      }
      const title = "Ton RDV, c'est demain";
      // sendPushToUser (VAPID) reaches a web PWA subscriber; sendExpoPushToUsers
      // is what actually reaches the React Native mobile app — both are kept
      // since a client can have either or both registered.
      await sendPushToUser(row.client_id, {
        title,
        body,
        url: "/client/bookings",
        tag: `rdv-j1-${row.id}`,
      });
      await sendExpoPushToUsers([row.client_id], {
        title,
        body,
        data: { type: "booking_reminder", reservation_id: row.id },
      });
      await db.query(
        `INSERT INTO notifications (user_id, type, title, message, data)
         VALUES (?, 'booking_reminder', ?, ?, ?)`,
        [row.client_id, title, body, JSON.stringify({ reservation_id: row.id })]
      );
      sent++;
    } catch (err) {
      log.error(
        "/cron/reminders",
        `J-1 push failed for reservation ${row.id}`,
        err instanceof Error ? err.stack : String(err)
      );
    }
  }

  if (sent > 0) {
    log.warn("/cron/reminders", `J-1: ${sent} reminder(s) sent`);
  }
}

async function sendH2Reminders(): Promise<void> {
  const db = getDb();
  const [rows] = await db.query(H2_CLAIM_QUERY, []);

  let sent = 0;
  for (const row of rows as any[]) {
    // Same reasoning as sendJ1Reminders: don't let one failed push abort
    // the rest of an already-claimed batch.
    try {
      const title = "Ton RDV dans 2h";
      const body = `${row.pro_name} t'attend à ${row.rdv_time}.`;
      await sendPushToUser(row.client_id, {
        title,
        body,
        url: "/client/bookings",
        tag: `rdv-h2-${row.id}`,
      });
      await sendExpoPushToUsers([row.client_id], {
        title,
        body,
        data: { type: "booking_reminder", reservation_id: row.id },
      });
      await db.query(
        `INSERT INTO notifications (user_id, type, title, message, data)
         VALUES (?, 'booking_reminder', ?, ?, ?)`,
        [row.client_id, title, body, JSON.stringify({ reservation_id: row.id })]
      );
      sent++;
    } catch (err) {
      log.error(
        "/cron/reminders",
        `H-2 push failed for reservation ${row.id}`,
        err instanceof Error ? err.stack : String(err)
      );
    }
  }

  if (sent > 0) {
    log.warn("/cron/reminders", `H-2: ${sent} reminder(s) sent`);
  }
}

export async function runReminderCycle(): Promise<void> {
  await Promise.allSettled([
    sendJ1Reminders(),
    sendH2Reminders(),
    sendPostReminders(),
    manageLiveActivities(),
    pushLiveActivityInProgress(),
    endExpiredLiveActivities(),
  ]);
}

/**
 * Starts the reminder cron (every 15 minutes). Drives two independent
 * channels — web-push reminders (VAPID) and Live Activity start/update/end
 * (APNs) — so it only skips entirely if *neither* is configured; each
 * channel's own send functions already no-op safely when their specific
 * keys are missing (see sendPushToUser / isApnsConfigured guards). A single
 * VAPID-only gate here previously killed the Live Activity "end" safety net
 * — the cron's only defense against a ghost activity when the app never
 * reopens — for any deployment that only configured APNs.
 */
export function startReminderCron(): void {
  const hasVapid = Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
  const hasApns = isApnsConfigured();
  if (!hasVapid && !hasApns) {
    console.info("[reminders] neither VAPID nor APNs configured — reminder cron disabled");
    return;
  }
  if (!hasVapid) console.info("[reminders] VAPID keys not configured — web-push reminders disabled, Live Activity cron still runs");
  if (!hasApns) console.info("[reminders] APNs not configured — Live Activity start/update/end disabled, web-push reminders still run");

  const INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

  // First run after 30s (let the server finish booting)
  setTimeout(async () => {
    try {
      await runReminderCycle();
    } catch (err) {
      log.error("/cron/reminders", err instanceof Error ? err.message : String(err), err instanceof Error ? err.stack : undefined);
    }
  }, 30_000);

  setInterval(async () => {
    try {
      await runReminderCycle();
    } catch (err) {
      log.error("/cron/reminders", err instanceof Error ? err.message : String(err), err instanceof Error ? err.stack : undefined);
    }
  }, INTERVAL_MS);

  console.info("[reminders] cron started (every 15 min)");
}
