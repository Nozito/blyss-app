import MobileLayout from "@/components/MobileLayout";
import { ChevronLeft, Info } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";

type NotificationKey =
  | "reminders"
  | "changes"
  | "messages"
  | "late"
  | "offers"
  | "emailSummary";

const ClientNotifications = () => {
  const navigate = useNavigate();

  const [preferences, setPreferences] = useState<Record<NotificationKey, boolean>>({
    reminders: true,
    changes: true,
    messages: true,
    late: true,
    offers: true,
    emailSummary: false
  });

  const togglePreference = (key: NotificationKey) => {
    setPreferences((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const goToSystemSettings = () => {
    // Placeholder : à adapter côté natif si besoin
    // window.open("app-settings:", "_blank");
  };

  return (
    <MobileLayout showNav={false}>
      <div className="animate-fade-in">
        {/* Header */}
        <div className="flex items-center mb-2">
          <button
            onClick={() => navigate("/client/profile")}
            className="p-2"
          >
            <ChevronLeft size={24} className="text-foreground" />
          </button>
          <h1 className="font-display text-2xl font-semibold text-foreground ml-2">
            Notifications
          </h1>
        </div>
        <p className="text-muted-foreground text-sm mb-5">
          Choisis ce que tu souhaites recevoir de Blyss.
        </p>

        {/* Bloc info – icône à gauche, texte à droite */}
        <div className="blyss-card flex items-center gap-3 mb-5">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Info size={16} className="text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">
              Rappels & messages importants
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
              Recommandé : garde activés les rappels de rendez-vous et les
              messages de tes expertes pour éviter les oublis.
            </p>
          </div>
        </div>

        {/* SECTION : Blyss & rendez-vous */}
        <div className="space-y-3 mb-6">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
            Blyss & rendez-vous
          </h2>

          {/* Confirmation + rappels */}
          <div className="blyss-card flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm text-foreground">
                Confirmation & rappels de rendez-vous
              </span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={preferences.reminders}
                  onChange={() => togglePreference("reminders")}
                />
                <div className="w-11 h-6 bg-muted peer-checked:bg-primary rounded-full transition-colors" />
                <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow peer-checked:translate-x-5 transition-transform" />
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Confirmation de réservation, rappel la veille, rappel 1h avant ton
              rendez-vous.
            </p>
          </div>

          {/* Changements / annulations */}
          <div className="blyss-card flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm text-foreground">
                Changements & annulations
              </span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={preferences.changes}
                  onChange={() => togglePreference("changes")}
                />
                <div className="w-11 h-6 bg-muted peer-checked:bg-primary rounded-full transition-colors" />
                <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow peer-checked:translate-x-5 transition-transform" />
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Notifications en cas de modification d’horaire ou d’annulation par
              l’experte.
            </p>
          </div>

          {/* Messages */}
          <div className="blyss-card flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm text-foreground">
                Nouveaux messages
              </span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={preferences.messages}
                  onChange={() => togglePreference("messages")}
                />
                <div className="w-11 h-6 bg-muted peer-checked:bg-primary rounded-full transition-colors" />
                <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow peer-checked:translate-x-5 transition-transform" />
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Alertes quand une experte t’envoie un message ou répond à une
              question.
            </p>
          </div>

          {/* Retards & arrivée */}
          <div className="blyss-card flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm text-foreground">
                Retard & arrivée de l’experte
              </span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={preferences.late}
                  onChange={() => togglePreference("late")}
                />
                <div className="w-11 h-6 bg-muted peer-checked:bg-primary rounded-full transition-colors" />
                <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow peer-checked:translate-x-5 transition-transform" />
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Notification si ton rendez-vous prend du retard ou quand l’experte
              arrive sur place (si activé par elle).
            </p>
          </div>
        </div>

        {/* SECTION : Offres & communication */}
        <div className="space-y-3 mb-6">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
            Offres & communication
          </h2>

          {/* Offres / promos */}
          <div className="blyss-card flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm text-foreground">
                Offres et promotions
              </span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={preferences.offers}
                  onChange={() => togglePreference("offers")}
                />
                <div className="w-11 h-6 bg-muted peer-checked:bg-primary rounded-full transition-colors" />
                <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow peer-checked:translate-x-5 transition-transform" />
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Bons plans Blyss, codes promo et offres de tes expertes
              favorites.
            </p>
          </div>

          {/* Résumé email */}
          <div className="blyss-card flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm text-foreground">
                Résumé par email
              </span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={preferences.emailSummary}
                  onChange={() => togglePreference("emailSummary")}
                />
                <div className="w-11 h-6 bg-muted peer-checked:bg-primary rounded-full transition-colors" />
                <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow peer-checked:translate-x-5 transition-transform" />
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Un résumé occasionnel avec tes prochains rendez-vous et les
              nouveautés Blyss.
            </p>
          </div>
        </div>

        {/* SECTION : Réglages système */}
        <div className="space-y-2">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
            Réglages de ton téléphone
          </h2>

          <div className="blyss-card flex flex-col gap-2">
            <p className="text-xs text-muted-foreground leading-snug">
              Si les notifications sont désactivées pour Blyss dans les
              réglages de ton téléphone, certains réglages ci-dessus peuvent ne
              pas fonctionner.
            </p>
            <button
              type="button"
              onClick={goToSystemSettings}
              className="self-start text-xs text-primary active:opacity-80"
            >
              Ouvrir les réglages de notifications
            </button>
          </div>
        </div>
      </div>
    </MobileLayout>
  );
};

export default ClientNotifications;
