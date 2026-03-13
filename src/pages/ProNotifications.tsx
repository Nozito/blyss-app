import MobileLayout from "@/components/MobileLayout";
import { ChevronLeft, Info, Bell, Calendar, MessageSquare, CreditCard, TrendingUp, Settings, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/services/api";

type ProNotificationKey =
  | "newBookings"
  | "changes"
  | "todayReminders"
  | "clientMessages"
  | "paymentAlerts"
  | "activitySummary";

const ProNotifications = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [localPrefs, setLocalPrefs] = useState<Record<ProNotificationKey, boolean> | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  const { isLoading } = useQuery({
    queryKey: ["pro-notification-settings"],
    queryFn: async () => {
      const res = await api.pro.getNotificationSettings();
      if (!res.success || !res.data) throw new Error(res.error || "Erreur serveur");
      return res.data;
    },
    staleTime: 60_000,
    onSuccess: (data: any) => {
      if (!localPrefs) {
        setLocalPrefs({
          newBookings: Boolean(data.new_reservation),
          changes: Boolean(data.cancel_change),
          todayReminders: Boolean(data.daily_reminder),
          clientMessages: Boolean(data.client_message),
          paymentAlerts: Boolean(data.payment_alert),
          activitySummary: Boolean(data.activity_summary),
        });
      }
    },
  } as any);

  const { mutate: save, isPending: saving } = useMutation({
    mutationFn: async () => {
      if (!localPrefs) return;
      const res = await api.pro.updateNotificationSettings({
        new_reservation: localPrefs.newBookings,
        cancel_change: localPrefs.changes,
        daily_reminder: localPrefs.todayReminders,
        client_message: localPrefs.clientMessages,
        payment_alert: localPrefs.paymentAlerts,
        activity_summary: localPrefs.activitySummary,
      });
      if (!res.success) throw new Error(res.error || "Erreur serveur");
      return res.data;
    },
    onSuccess: () => {
      toast.success("Préférences enregistrées !");
      setHasChanges(false);
      queryClient.invalidateQueries({ queryKey: ["pro-notification-settings"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Une erreur est survenue");
    },
  });

  const preferences: Record<ProNotificationKey, boolean> = localPrefs ?? {
    newBookings: true,
    changes: true,
    todayReminders: true,
    clientMessages: true,
    paymentAlerts: true,
    activitySummary: false,
  };

  const togglePreference = (key: ProNotificationKey) => {
    setLocalPrefs((prev) => {
      const base = prev ?? preferences;
      return { ...base, [key]: !base[key] };
    });
    setHasChanges(true);
  };

  const goToSystemSettings = () => {
    toast.info("Ouvre les réglages de ton téléphone pour activer les notifications Blyss");
  };

  const NotificationToggle = ({
    icon: Icon,
    title,
    description,
    prefKey,
    isEnabled,
    recommended = false,
  }: {
    icon: any;
    title: string;
    description: string;
    prefKey: ProNotificationKey;
    isEnabled: boolean;
    recommended?: boolean;
  }) => (
    <div className={`blyss-card group hover:shadow-lg transition-all duration-300 ${isEnabled ? "bg-gradient-to-br from-primary/5 to-transparent" : ""}`}>
      <div className="flex items-start gap-4">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 transition-all duration-300 ${isEnabled ? "bg-primary/10 scale-110" : "bg-muted group-hover:bg-muted-foreground/10"}`}>
          <Icon size={20} className={isEnabled ? "text-primary" : "text-muted-foreground"} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-sm text-foreground">{title}</span>
            {recommended && (
              <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-wide">
                Recommandé
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
        </div>
        <button
          type="button"
          onClick={() => togglePreference(prefKey)}
          className={`relative w-14 h-8 rounded-full flex-shrink-0 transition-all duration-300 ease-out active:scale-95 ${isEnabled ? "bg-primary shadow-lg shadow-primary/30" : "bg-muted hover:bg-muted-foreground/10"}`}
        >
          <div className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-md transition-all duration-300 ease-out ${isEnabled ? "left-7 scale-110" : "left-1"} flex items-center justify-center`}>
            {isEnabled && <div className="w-2 h-2 rounded-full bg-primary" />}
          </div>
        </button>
      </div>
    </div>
  );

  const enabledCount = Object.values(preferences).filter(Boolean).length;
  const totalCount = Object.keys(preferences).length;

  if (isLoading) {
    return (
      <MobileLayout showNav={false}>
        <div className="flex flex-col items-center justify-center h-screen">
          <div className="w-16 h-16 rounded-full border-4 border-primary/20 border-t-primary animate-spin mb-4" />
          <p className="text-sm text-muted-foreground animate-pulse">Chargement de tes préférences...</p>
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout showNav={false}>
      <div className="min-h-screen py-6">
        {/* Header */}
        <div className="relative -mx-4 px-4 pt-2 pb-6 mb-6">
          <div className="flex items-center mb-3">
            <button
              onClick={() => navigate("/pro/profile")}
              className="w-10 h-10 rounded-xl bg-muted hover:bg-muted-foreground/10 flex items-center justify-center active:scale-95 transition-all mr-3"
            >
              <ChevronLeft size={20} className="text-foreground" />
            </button>
            <h1 className="font-display text-2xl font-bold text-foreground">Notifications pro</h1>
          </div>
          <p className="text-muted-foreground text-sm">
            Gère tes alertes pour ne rien manquer de ton activité.
          </p>
        </div>

        {/* Badge modifications en attente */}
        {hasChanges && (
          <div className="blyss-card mb-6 bg-primary/5 border-2 border-primary/20 animate-in slide-in-from-top-2 duration-300">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Bell size={18} className="text-primary animate-pulse" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">Modifications non enregistrées</p>
                <p className="text-xs text-muted-foreground mt-0.5">N'oublie pas de sauvegarder tes préférences</p>
              </div>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="blyss-card mb-6 overflow-hidden relative group hover:shadow-lg transition-all duration-300">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center flex-shrink-0 shadow-lg">
              <Bell size={20} className="text-white" />
            </div>
            <div className="flex-1 pt-1">
              <div className="flex items-baseline gap-2 mb-1">
                <p className="text-2xl font-bold text-foreground">{enabledCount}/{totalCount}</p>
                <p className="text-sm text-muted-foreground">notifications actives</p>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Les notifications te permettent de rester informée en temps réel de ton activité Blyss.
              </p>
            </div>
          </div>
        </div>

        {/* Rendez-vous & clientes */}
        <div className="space-y-3 mb-6">
          <div className="flex items-center gap-2 px-1">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Calendar size={12} /> Rendez-vous & clientes
            </h2>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
          </div>
          <div className="space-y-3">
            <NotificationToggle icon={Bell} title="Nouvelles réservations" description="Notification dès qu'une cliente réserve un nouveau créneau chez toi." prefKey="newBookings" isEnabled={preferences.newBookings} recommended />
            <NotificationToggle icon={Calendar} title="Changements & annulations" description="Alertes en cas de modification d'horaire ou d'annulation par la cliente." prefKey="changes" isEnabled={preferences.changes} recommended />
            <NotificationToggle icon={Sparkles} title="Rappels du jour" description="Récap' de tes rendez-vous du jour et premiers créneaux à venir." prefKey="todayReminders" isEnabled={preferences.todayReminders} />
            <NotificationToggle icon={MessageSquare} title="Messages clientes" description="Notification quand une cliente t'écrit ou répond à un message." prefKey="clientMessages" isEnabled={preferences.clientMessages} recommended />
          </div>
        </div>

        {/* Paiement & activité */}
        <div className="space-y-3 mb-6">
          <div className="flex items-center gap-2 px-1">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <CreditCard size={12} /> Paiement & activité
            </h2>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
          </div>
          <div className="space-y-3">
            <NotificationToggle icon={CreditCard} title="Paiement & réservations garanties" description="Alertes quand un acompte est encaissé ou qu'une réservation est garantie." prefKey="paymentAlerts" isEnabled={preferences.paymentAlerts} />
            <NotificationToggle icon={TrendingUp} title="Résumé d'activité" description="Un résumé occasionnel (jour/semaine) avec ton nombre de rendez-vous et ton CA estimé." prefKey="activitySummary" isEnabled={preferences.activitySummary} />
          </div>
        </div>

        {/* Réglages système */}
        <div className="space-y-3 mb-6">
          <div className="flex items-center gap-2 px-1">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Settings size={12} /> Réglages système
            </h2>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
          </div>
          <div className="blyss-card bg-gradient-to-br from-muted/50 to-transparent hover:shadow-lg transition-all duration-300">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Info size={18} className="text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground mb-1">Autorisations système</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Si les notifications sont désactivées pour Blyss dans les réglages de ton téléphone, les paramètres ci-dessus ne fonctionneront pas.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={goToSystemSettings}
              className="w-full py-3 px-4 rounded-xl bg-muted hover:bg-muted-foreground/10 text-sm font-medium text-foreground flex items-center justify-center gap-2 active:scale-95 transition-all"
            >
              <Settings size={16} /> Ouvrir les réglages de notifications
            </button>
          </div>
        </div>

        {/* Conseil */}
        <div className="blyss-card bg-gradient-to-br from-primary/5 to-transparent border border-primary/10 mb-24">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Sparkles size={16} className="text-primary" />
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              <span className="font-semibold text-foreground">Conseil pro — </span>
              Active au minimum les notifications de nouvelles réservations, changements et messages clientes pour réduire les no-shows.
            </p>
          </div>
        </div>

        {/* Bouton Enregistrer */}
        <div className="sticky bottom-0 -mx-4 px-4 pt-4 pb-6 bg-gradient-to-t from-background via-background to-transparent">
          <button
            onClick={() => save()}
            disabled={!hasChanges || saving}
            className={`w-full py-4 rounded-2xl font-semibold text-sm transition-all duration-300 flex items-center justify-center gap-2 ${hasChanges && !saving ? "bg-primary text-white active:scale-[0.97] shadow-lg" : "bg-muted text-muted-foreground cursor-not-allowed"}`}
          >
            {saving ? (
              <><div className="animate-spin rounded-full h-5 w-5 border-2 border-current border-t-transparent" /> Enregistrement...</>
            ) : hasChanges ? (
              <><Bell size={18} /> Enregistrer les préférences</>
            ) : (
              <><Bell size={18} /> Préférences à jour</>
            )}
          </button>
        </div>
      </div>
    </MobileLayout>
  );
};

export default ProNotifications;
