import { Bell, BellOff, X } from "lucide-react";
import { useState } from "react";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { toast } from "sonner";

/**
 * Banner discret affiché une seule fois pour inviter l'utilisateur
 * à activer les notifications push.
 * Usage : monter dans la page d'accueil client ou pro.
 */
export function PushNotificationPrompt() {
  const { isSupported, permission, isSubscribed, isLoading, subscribe } = usePushNotifications();
  const [dismissed, setDismissed] = useState(() =>
    localStorage.getItem("push_prompt_dismissed") === "1"
  );

  if (!isSupported || permission === "denied" || isSubscribed || dismissed) return null;

  const handleEnable = async () => {
    const ok = await subscribe();
    if (ok) {
      toast.success("Notifications activées !");
    } else if (Notification.permission === "denied") {
      toast.error("Notifications bloquées par le navigateur");
    }
  };

  const handleDismiss = () => {
    localStorage.setItem("push_prompt_dismissed", "1");
    setDismissed(true);
  };

  return (
    <div className="flex items-center gap-3 bg-primary/8 border border-primary/20 rounded-2xl px-4 py-3 mb-4">
      <div className="w-8 h-8 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
        <Bell size={16} className="text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">Activer les notifications</p>
        <p className="text-xs text-muted-foreground">Reçois tes rappels de RDV</p>
      </div>
      <button
        onClick={handleEnable}
        disabled={isLoading}
        className="text-xs font-semibold text-primary px-3 py-1.5 rounded-xl bg-primary/10 hover:bg-primary/20 transition-colors flex-shrink-0 disabled:opacity-50"
      >
        {isLoading ? "..." : "Activer"}
      </button>
      <button
        onClick={handleDismiss}
        className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
        aria-label="Fermer"
      >
        <X size={14} />
      </button>
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
