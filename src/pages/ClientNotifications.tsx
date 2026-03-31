import MobileLayout from "@/components/MobileLayout";
import {
  ChevronLeft,
  Bell,
  Calendar,
  MessageSquare,
  Tag,
  Mail,
  AlertTriangle,
  Settings,
  Loader2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import api, { type ClientNotificationSettings } from "@/services/api";
import { toast } from "sonner";

type NotificationKey = keyof ClientNotificationSettings;

// ─── TOGGLE ───────────────────────────────────────────────────────────────────

const Toggle = ({
  enabled,
  loading,
  onToggle,
}: {
  enabled: boolean;
  loading: boolean;
  onToggle: () => void;
}) => (
  <button
    type="button"
    onClick={onToggle}
    disabled={loading}
    className={`relative w-12 h-7 rounded-full flex-shrink-0 transition-colors duration-200 disabled:opacity-50 ${
      enabled ? "bg-primary" : "bg-muted-foreground/25"
    }`}
  >
    <div
      className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all duration-200 ${
        enabled ? "left-[22px]" : "left-0.5"
      } flex items-center justify-center`}
    >
      {loading && <Loader2 size={11} className="animate-spin text-primary" />}
    </div>
  </button>
);

// ─── ROW ──────────────────────────────────────────────────────────────────────

const Row = ({
  icon: Icon,
  iconColor,
  iconBg,
  title,
  description,
  prefKey,
  isEnabled,
  savingKey,
  onToggle,
}: {
  icon: any;
  iconColor: string;
  iconBg: string;
  title: string;
  description: string;
  prefKey: NotificationKey;
  isEnabled: boolean;
  savingKey: NotificationKey | null;
  onToggle: (k: NotificationKey) => void;
}) => (
  <div className="flex items-center gap-3 py-3.5 px-4">
    <div
      className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}
    >
      <Icon size={17} className={iconColor} strokeWidth={1.8} />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-[13.5px] font-medium text-foreground leading-tight">{title}</p>
      <p className="text-[11.5px] text-muted-foreground mt-0.5 leading-snug">{description}</p>
    </div>
    <Toggle
      enabled={isEnabled}
      loading={savingKey === prefKey}
      onToggle={() => onToggle(prefKey)}
    />
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

const ClientNotifications = () => {
  const navigate = useNavigate();
  const [savingKey, setSavingKey] = useState<NotificationKey | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [preferences, setPreferences] = useState<ClientNotificationSettings>({
    reminders: true,
    changes: true,
    messages: true,
    late: true,
    offers: true,
    email_summary: false,
  });

  useEffect(() => {
    api.notifications.getSettings().then((res) => {
      if (res.success && res.data) setPreferences(res.data);
      setIsLoading(false);
    }).catch(() => setIsLoading(false));
  }, []);

  const toggle = async (key: NotificationKey) => {
    if (savingKey) return;
    const next = !preferences[key];
    setPreferences((p) => ({ ...p, [key]: next }));
    setSavingKey(key);
    try {
      await api.notifications.updateSettings({ [key]: next });
    } catch {
      setPreferences((p) => ({ ...p, [key]: !next }));
      toast.error("Erreur lors de la mise à jour");
    } finally {
      setSavingKey(null);
    }
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
      <div className="py-6">

        {/* Header */}
        <div className="flex items-center gap-3 mb-7">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center active:scale-95 transition-transform"
          >
            <ChevronLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-foreground leading-tight">Notifications</h1>
            <p className="text-[12px] text-muted-foreground">Préférences de réception</p>
          </div>
        </div>

        {/* Rendez-vous */}
        <Section label="Rendez-vous">
          <Row icon={Bell} iconBg="bg-primary/10" iconColor="text-primary"
            title="Confirmations & rappels"
            description="La veille et 1h avant ton rendez-vous"
            prefKey="reminders" isEnabled={preferences.reminders}
            savingKey={savingKey} onToggle={toggle} />
          <Row icon={AlertTriangle} iconBg="bg-amber-50" iconColor="text-amber-500"
            title="Modifications & annulations"
            description="Si l'experte change ou annule ton créneau"
            prefKey="changes" isEnabled={preferences.changes}
            savingKey={savingKey} onToggle={toggle} />
          <Row icon={Calendar} iconBg="bg-blue-50" iconColor="text-blue-500"
            title="Retard de l'experte"
            description="Si ton rendez-vous prend du retard"
            prefKey="late" isEnabled={preferences.late}
            savingKey={savingKey} onToggle={toggle} />
        </Section>

        {/* Messages */}
        <Section label="Messages">
          <Row icon={MessageSquare} iconBg="bg-emerald-50" iconColor="text-emerald-600"
            title="Nouveaux messages"
            description="Quand une experte t'envoie un message"
            prefKey="messages" isEnabled={preferences.messages}
            savingKey={savingKey} onToggle={toggle} />
        </Section>

        {/* Promotions */}
        <Section label="Promotions">
          <Row icon={Tag} iconBg="bg-violet-50" iconColor="text-violet-500"
            title="Offres & codes promo"
            description="Exclusivités et promotions de tes expertes"
            prefKey="offers" isEnabled={preferences.offers}
            savingKey={savingKey} onToggle={toggle} />
          <Row icon={Mail} iconBg="bg-slate-100" iconColor="text-slate-500"
            title="Résumé par email"
            description="Récap' hebdo de tes rendez-vous"
            prefKey="email_summary" isEnabled={preferences.email_summary}
            savingKey={savingKey} onToggle={toggle} />
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
            <ArrowLeft size={15} className="rotate-180 text-muted-foreground/50" />
          </button>
        </Section>

      </div>
    </MobileLayout>
  );
};

export default ClientNotifications;
