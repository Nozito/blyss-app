export type LiveActivityPrivacy = "full" | "time_only" | "countdown_only";

/**
 * Applies the pro's confidentiality setting server-side — shared between the
 * next-appointment route and the push-to-start cron so neither path can ever
 * leak more than the pro opted into.
 */
export function applyLiveActivityPrivacy(
  privacy: LiveActivityPrivacy,
  clientFirstName: string | null
): { clientFirstName: string | null; showTime: boolean } {
  if (privacy === "countdown_only") return { clientFirstName: null, showTime: false };
  if (privacy === "time_only") return { clientFirstName: null, showTime: true };
  return { clientFirstName, showTime: true };
}
