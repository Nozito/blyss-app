import MobileLayout from "@/components/MobileLayout";
import { ChevronLeft, Info } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";

type ProNotificationKey =
  | "newBookings"
  | "changes"
  | "todayReminders"
  | "clientMessages"
  | "paymentAlerts"
  | "activitySummary";

const ProNotifications = () => {
  const navigate = useNavigate();

  const [preferences, setPreferences] = useState<
    Record<ProNotificationKey, boolean>
  >({
    newBookings: true,
    changes: true,
    todayReminders: true,
    clientMessages: true,
    paymentAlerts: true,
    activitySummary: false
  });

  const togglePreference = (key: ProNotificationKey) => {
    setPreferences((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const goToSystemSettings = () => {
    // À brancher côté natif (iOS/Android) si besoin
    // window.open("app-settings:", "_blank");
  };

  return (
    <MobileLayout showNav={false}>
      <div className="py-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center mb-2">
          <button
            onClick={() => navigate("/pro/profile")}
            className="p-2"
          >
            <ChevronLeft size={24} className="text-foreground" />
          </button>
          <h1 className="font-display text-2xl font-semibold text-foreground ml-2">
            Notifications pro
          </h1>
        </div>
        <p className="text-muted-foreground text-sm mb-5">
          Choisis ce que tu souhaites recevoir pour ton activité Blyss.
        </p>

        {/* Bloc info */}
        <div className="blyss-card flex items-center gap-3 mb-5">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Info size={16} className="text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">
              Nouveaux rendez-vous & changements
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
              Recommandé : garde activées les notifications de réservations,
              changements et messages clientes pour éviter les no‑shows.
            </p>
          </div>
        </div>

        {/* SECTION : Rendez-vous & clientes */}
        <div className="space-y-3 mb-6">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
            Rendez-vous & clientes
          </h2>

          {/* Nouvelles réservations */}
          <div className="blyss-card flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm text-foreground">
                Nouvelles réservations
              </span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={preferences.newBookings}
                  onChange={() => togglePreference("newBookings")}
                />
                <div className="w-11 h-6 bg-muted peer-checked:bg-primary rounded-full transition-colors" />
                <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow peer-checked:translate-x-5 transition-transform" />
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Notification dès qu’une cliente réserve un nouveau créneau chez
              toi.
            </p>
          </div>

          {/* Changements / annulations par les clientes */}
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
              Alertes en cas de modification d’horaire ou d’annulation par la
              cliente.
            </p>
          </div>

          {/* Rappels du jour pour la pro */}
          <div className="blyss-card flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm text-foreground">
                Rappels du jour
              </span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={preferences.todayReminders}
                  onChange={() => togglePreference("todayReminders")}
                />
                <div className="w-11 h-6 bg-muted peer-checked:bg-primary rounded-full transition-colors" />
                <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow peer-checked:translate-x-5 transition-transform" />
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Récap’ de tes rendez-vous du jour et premiers créneaux à venir.
            </p>
          </div>

          {/* Messages clientes */}
          <div className="blyss-card flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm text-foreground">
                Messages clientes
              </span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={preferences.clientMessages}
                  onChange={() => togglePreference("clientMessages")}
                />
                <div className="w-11 h-6 bg-muted peer-checked:bg-primary rounded-full transition-colors" />
                <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow peer-checked:translate-x-5 transition-transform" />
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Notification quand une cliente t’écrit ou répond à un message.
            </p>
          </div>
        </div>

        {/* SECTION : Paiement & activité */}
        <div className="space-y-3 mb-6">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
            Paiement & activité
          </h2>

          {/* Alerte paiement / réservation garantie */}
          <div className="blyss-card flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm text-foreground">
                Paiement & réservations garanties
              </span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={preferences.paymentAlerts}
                  onChange={() => togglePreference("paymentAlerts")}
                />
                <div className="w-11 h-6 bg-muted peer-checked:bg-primary rounded-full transition-colors" />
                <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow peer-checked:translate-x-5 transition-transform" />
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Alertes quand un acompte est encaissé ou qu’une réservation est
              garantie.
            </p>
          </div>

          {/* Résumé d’activité */}
          <div className="blyss-card flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm text-foreground">
                Résumé d’activité
              </span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={preferences.activitySummary}
                  onChange={() => togglePreference("activitySummary")}
                />
                <div className="w-11 h-6 bg-muted peer-checked:bg-primary rounded-full transition-colors" />
                <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow peer-checked:translate-x-5 transition-transform" />
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Un résumé occasionnel (jour / semaine) avec ton nombre de
              rendez-vous et ton CA estimé.
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

export default ProNotifications;
