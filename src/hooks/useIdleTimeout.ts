import { useEffect, useRef } from "react";
import { toast } from "sonner";

const ACTIVITY_EVENTS = ["mousedown", "keydown", "scroll", "touchstart"] as const;

interface UseIdleTimeoutOptions {
  /** Délai total avant déconnexion (ms) */
  timeoutMs: number;
  /** Délai avant le toast d'avertissement (ms), doit être < timeoutMs */
  warnBeforeMs: number;
  onIdle: () => void;
  enabled: boolean;
}

/** Déconnexion automatique après inactivité — mesure de sécurité pour le backoffice admin. */
export function useIdleTimeout({ timeoutMs, warnBeforeMs, onIdle, enabled }: UseIdleTimeoutOptions) {
  const idleTimer = useRef<ReturnType<typeof setTimeout>>();
  const warnTimer = useRef<ReturnType<typeof setTimeout>>();
  const warned = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const reset = () => {
      warned.current = false;
      clearTimeout(idleTimer.current);
      clearTimeout(warnTimer.current);

      warnTimer.current = setTimeout(() => {
        warned.current = true;
        toast.warning("Déconnexion automatique dans 1 minute pour inactivité.");
      }, timeoutMs - warnBeforeMs);

      idleTimer.current = setTimeout(() => {
        onIdle();
      }, timeoutMs);
    };

    reset();
    ACTIVITY_EVENTS.forEach((evt) => document.addEventListener(evt, reset));

    return () => {
      clearTimeout(idleTimer.current);
      clearTimeout(warnTimer.current);
      ACTIVITY_EVENTS.forEach((evt) => document.removeEventListener(evt, reset));
    };
  }, [enabled, timeoutMs, warnBeforeMs, onIdle]);
}
