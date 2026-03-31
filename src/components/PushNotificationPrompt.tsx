import { Bell, BellOff, X, Shield } from "lucide-react";
import { useState } from "react";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { toast } from "sonner";

const CONSENT_KEY = "push_consent_given";
const DISMISS_KEY = "push_prompt_dismissed";

/**
 * RGPD: Affiche un écran de consentement explicite AVANT d'appeler
 * Notification.requestPermission(). L'utilisateur doit activement accepter
 * avant toute demande de permission système.
 */
export function PushNotificationPrompt() {
  const { isSupported, permission, isSubscribed, isLoading, subscribe } = usePushNotifications();

  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISS_KEY) === "1"
  );
  // Step 1: show in-app consent — Step 2: trigger browser permission
  const [consentStep, setConsentStep] = useState<"prompt" | "confirming">("prompt");

  if (!isSupported || permission === "denied" || isSubscribed || dismissed) return null;

  const handleAccept = async () => {
    setConsentStep("confirming");
    // Store that the user gave in-app consent (RGPD base légale = consentement)
    localStorage.setItem(CONSENT_KEY, new Date().toISOString());
    const ok = await subscribe();
    if (ok) {
      toast.success("Notifications activées !");
    } else if (Notification.permission === "denied") {
      toast.error("Notifications bloquées par le navigateur");
    }
    setConsentStep("prompt");
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 mb-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Bell size={18} className="text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">Activer les notifications</p>
          <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
            Reçois tes rappels de rendez-vous et les messages de tes clients.
            Tu peux désactiver ça à tout moment dans tes paramètres.
          </p>
        </div>
        <button
          onClick={handleDismiss}
          className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          aria-label="Fermer"
        >
          <X size={14} />
        </button>
      </div>

      {/* RGPD notice */}
      <div className="flex items-center gap-2 px-1">
        <Shield size={12} className="text-muted-foreground flex-shrink-0" />
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Base légale : consentement (art. 6.1.a RGPD). Aucune donnée partagée avec des tiers.
        </p>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          onClick={handleDismiss}
          className="flex-1 h-9 rounded-xl text-xs font-medium text-muted-foreground bg-muted/50 hover:bg-muted transition-colors"
        >
          Pas maintenant
        </button>
        <button
          onClick={handleAccept}
          disabled={isLoading || consentStep === "confirming"}
          className="flex-1 h-9 rounded-xl text-xs font-semibold text-white bg-primary hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {consentStep === "confirming" ? "..." : "Activer"}
        </button>
      </div>
    </div>
  );
}

/**
 * Bouton toggle pour les pages de settings.
 */
export function PushNotificationToggle() {
  const { isSupported, permission, isSubscribed, isLoading, subscribe, unsubscribe } = usePushNotifications();

  if (!isSupported) return null;

  const handleToggle = async () => {
    if (isSubscribed) {
      await unsubscribe();
      toast.success("Notifications désactivées");
    } else {
      // Store consent timestamp before requesting browser permission
      localStorage.setItem(CONSENT_KEY, new Date().toISOString());
      const ok = await subscribe();
      if (ok) toast.success("Notifications activées !");
      else if (permission === "denied") toast.error("Notifications bloquées par le navigateur. Autorise-les dans les réglages.");
    }
  };

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        {isSubscribed
          ? <Bell size={18} className="text-primary" />
          : <BellOff size={18} className="text-muted-foreground" />
        }
        <div>
          <p className="text-sm font-semibold text-foreground">Notifications push</p>
          <p className="text-xs text-muted-foreground">
            {permission === "denied"
              ? "Bloquées dans le navigateur"
              : isSubscribed ? "Activées sur cet appareil" : "Désactivées"
            }
          </p>
        </div>
      </div>
      <button
        onClick={handleToggle}
        disabled={isLoading || permission === "denied"}
        className={`relative w-12 h-6 rounded-full transition-colors duration-200 disabled:opacity-40 ${
          isSubscribed ? "bg-primary" : "bg-muted"
        }`}
      >
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${
          isSubscribed ? "translate-x-6" : "translate-x-0.5"
        }`} />
      </button>
    </div>
  );
}
