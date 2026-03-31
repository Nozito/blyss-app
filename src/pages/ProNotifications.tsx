import MobileLayout from "@/components/MobileLayout";
import {
  Bell,
  ChevronLeft,
  Calendar,
  MessageSquare,
  CreditCard,
  TrendingUp,
  Settings,
  Sparkles,
} from "lucide-react";
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

// ─── TOGGLE ───────────────────────────────────────────────────────────────────

const Toggle = ({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: () => void;
}) => (
  <button
    type="button"
    onClick={onToggle}
    className={`relative w-12 h-7 rounded-full flex-shrink-0 transition-colors duration-200 ${
      enabled ? "bg-primary" : "bg-muted-foreground/25"
    }`}
  >
    <div
      className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all duration-200 ${
        enabled ? "left-[22px]" : "left-0.5"
      }`}
    />
  </button>
);

// ─── ROW ──────────────────────────────────────────────────────────────────────

const Row = ({
  icon: Icon,
  iconBg,
  iconColor,
  title,
  description,
  prefKey,
  isEnabled,
  onToggle,
}: {
  icon: any;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
  prefKey: ProNotificationKey;
  isEnabled: boolean;
  onToggle: (k: ProNotificationKey) => void;
}) => (
  <div className="flex items-center gap-3 py-3.5 px-4">
    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
      <Icon size={17} className={iconColor} strokeWidth={1.8} />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-[13.5px] font-medium text-foreground leading-tight">{title}</p>
      <p className="text-[11.5px] text-muted-foreground mt-0.5 leading-snug">{description}</p>
    </div>
    <Toggle enabled={isEnabled} onToggle={() => onToggle(prefKey)} />
  </div>
);

// ─── SECTION ──────────────────────────────────────────────────────────────────

const Section = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <div className="mb-5">
    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-2">
      {label}
    </p>
    <div className="rounded-2xl border border-border/60 bg-card overflow-hidden divide-y divide-border/50">
      {children}
    </div>
  </div>
);

// ─── PAGE ─────────────────────────────────────────────────────────────────────

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
    },
    onSuccess: () => {
      toast.success("Préférences enregistrées");
      setHasChanges(false);
      queryClient.invalidateQueries({ queryKey: ["pro-notification-settings"] });
    },
    onError: (err: any) => toast.error(err.message || "Erreur serveur"),
  });

  const prefs: Record<ProNotificationKey, boolean> = localPrefs ?? {
    newBookings: true,
    changes: true,
    todayReminders: true,
    clientMessages: true,
    paymentAlerts: true,
    activitySummary: false,
  };

  const toggle = (key: ProNotificationKey) => {
    setLocalPrefs((prev) => {
      const base = prev ?? prefs;
      return { ...base, [key]: !base[key] };
    });
    setHasChanges(true);
  };

  if (isLoading) {
    return (
      <MobileLayout showNav={false}>
        <div className="flex items-center justify-center h-screen">
          <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout showNav={false}>
      <div className="py-6 pb-28">

        {/* Header */}
        <div className="flex items-center gap-3 mb-7">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center active:scale-95 transition-transform"
          >
            <ChevronLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-foreground leading-tight">Notifications pro</h1>
            <p className="text-[12px] text-muted-foreground">Préférences de réception</p>
          </div>
        </div>

        {/* Rendez-vous & clientes */}
        <Section label="Rendez-vous & clientes">
          <Row icon={Bell} iconBg="bg-primary/10" iconColor="text-primary"
            title="Nouvelles réservations"
            description="Dès qu'une cliente réserve un créneau"
            prefKey="newBookings" isEnabled={prefs.newBookings} onToggle={toggle} />
          <Row icon={Calendar} iconBg="bg-amber-50" iconColor="text-amber-500"
            title="Changements & annulations"
            description="Modification d'horaire ou annulation par la cliente"
            prefKey="changes" isEnabled={prefs.changes} onToggle={toggle} />
          <Row icon={Sparkles} iconBg="bg-sky-50" iconColor="text-sky-500"
            title="Rappels du jour"
            description="Récap' de tes rendez-vous du jour le matin"
            prefKey="todayReminders" isEnabled={prefs.todayReminders} onToggle={toggle} />
          <Row icon={MessageSquare} iconBg="bg-emerald-50" iconColor="text-emerald-600"
            title="Messages clientes"
            description="Quand une cliente t'envoie un message"
            prefKey="clientMessages" isEnabled={prefs.clientMessages} onToggle={toggle} />
        </Section>

        {/* Paiement & activité */}
        <Section label="Paiement & activité">
          <Row icon={CreditCard} iconBg="bg-violet-50" iconColor="text-violet-500"
            title="Acomptes & garanties"
            description="Quand un paiement ou acompte est encaissé"
            prefKey="paymentAlerts" isEnabled={prefs.paymentAlerts} onToggle={toggle} />
          <Row icon={TrendingUp} iconBg="bg-rose-50" iconColor="text-rose-500"
            title="Résumé d'activité"
            description="Aperçu de ton CA et rendez-vous en fin de journée"
            prefKey="activitySummary" isEnabled={prefs.activitySummary} onToggle={toggle} />
        </Section>

        {/* Système */}
        <Section label="Système">
          <button
            type="button"
            onClick={() => toast.info("Ouvre les réglages de ton téléphone pour activer les notifications Blyss")}
            className="w-full flex items-center gap-3 py-3.5 px-4 active:bg-muted/50 transition-colors"
          >
            <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
              <Settings size={17} className="text-muted-foreground" strokeWidth={1.8} />
            </div>
            <div className="flex-1 text-left">
              <p className="text-[13.5px] font-medium text-foreground">Réglages système</p>
              <p className="text-[11.5px] text-muted-foreground mt-0.5">Activer les notifications pour Blyss</p>
            </div>
            <ChevronLeft size={15} className="rotate-180 text-muted-foreground/50" />
          </button>
        </Section>

      </div>

      {/* Bouton Enregistrer — sticky bottom */}
      <div className="fixed bottom-0 left-0 right-0 px-5 pb-8 pt-4 bg-gradient-to-t from-background via-background to-transparent pointer-events-none">
        <button
          onClick={() => save()}
          disabled={!hasChanges || saving}
          className={`w-full h-14 rounded-2xl font-semibold text-[15px] transition-all pointer-events-auto ${
            hasChanges && !saving
              ? "bg-primary text-white active:scale-[0.98] shadow-lg shadow-primary/25"
              : "bg-muted text-muted-foreground cursor-not-allowed"
          }`}
        >
          {saving ? (
            <span className="flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              Enregistrement…
            </span>
          ) : hasChanges ? (
            "Enregistrer les préférences"
          ) : (
            "Préférences à jour"
          )}
        </button>
      </div>
    </MobileLayout>
  );
};

export default ProNotifications;
