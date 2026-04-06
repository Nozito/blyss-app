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
    aria-pressed={enabled}
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

const NotifRow = ({
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
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  title: string;
  description: string;
  prefKey: NotificationKey;
  isEnabled: boolean;
  savingKey: NotificationKey | null;
  onToggle: (k: NotificationKey) => void;
}) => (
  <div className="flex items-center gap-3 p-4">
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
      <Icon size={18} className={iconColor} strokeWidth={1.8} />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-semibold text-foreground leading-tight">{title}</p>
      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
    </div>
    <Toggle
      enabled={isEnabled}
      loading={savingKey === prefKey}
      onToggle={() => onToggle(prefKey)}
    />
  </div>
);

// ─── SECTION ──────────────────────────────────────────────────────────────────

const Section = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-2">
    <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
      {label}
    </h2>
    <div className="rounded-2xl border border-border bg-card overflow-hidden divide-y divide-border/50">
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
        <div className="flex flex-col items-center justify-center h-screen gap-3">
          <div className="w-10 h-10 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
          <p className="text-sm text-muted-foreground animate-pulse">Chargement…</p>
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout showNav={false}>
      <div className="min-h-screen bg-background">
        {/* Header sticky */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate("/client/settings")}
            className="p-2 -ml-2 rounded-xl hover:bg-muted/50 transition-colors"
            aria-label="Retour"
          >
            <ChevronLeft size={20} className="text-foreground" />
          </button>
          <div>
            <h1 className="font-semibold text-foreground text-base">Notifications</h1>
            <p className="text-xs text-muted-foreground">Préférences de réception</p>
          </div>
        </div>

        <div className="px-4 py-6 space-y-6 pb-24">
          {/* Intro */}
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-primary/5 border border-primary/15">
            <Bell size={20} className="text-primary flex-shrink-0" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              Les modifications sont sauvegardées automatiquement dès que tu actives ou désactives une option.
            </p>
          </div>

          {/* Rendez-vous */}
          <Section label="Rendez-vous">
            <NotifRow
              icon={Bell}
              iconBg="bg-primary/10"
              iconColor="text-primary"
              title="Confirmations & rappels"
              description="La veille et 1h avant ton rendez-vous"
              prefKey="reminders"
              isEnabled={preferences.reminders}
              savingKey={savingKey}
              onToggle={toggle}
            />
            <NotifRow
              icon={AlertTriangle}
              iconBg="bg-amber-100 dark:bg-amber-900/30"
              iconColor="text-amber-600"
              title="Modifications & annulations"
              description="Si l'experte change ou annule ton créneau"
              prefKey="changes"
              isEnabled={preferences.changes}
              savingKey={savingKey}
              onToggle={toggle}
            />
            <NotifRow
              icon={Calendar}
              iconBg="bg-sky-100 dark:bg-sky-900/30"
              iconColor="text-sky-500"
              title="Retard de l'experte"
              description="Si ton rendez-vous prend du retard"
              prefKey="late"
              isEnabled={preferences.late}
              savingKey={savingKey}
              onToggle={toggle}
            />
          </Section>

          {/* Messages */}
          <Section label="Messages">
            <NotifRow
              icon={MessageSquare}
              iconBg="bg-emerald-100 dark:bg-emerald-900/30"
              iconColor="text-emerald-600"
              title="Nouveaux messages"
              description="Quand une experte t'envoie un message"
              prefKey="messages"
              isEnabled={preferences.messages}
              savingKey={savingKey}
              onToggle={toggle}
            />
          </Section>

          {/* Promotions */}
          <Section label="Promotions">
            <NotifRow
              icon={Tag}
              iconBg="bg-violet-100 dark:bg-violet-900/30"
              iconColor="text-violet-500"
              title="Offres & codes promo"
              description="Exclusivités et promotions de tes expertes"
              prefKey="offers"
              isEnabled={preferences.offers}
              savingKey={savingKey}
              onToggle={toggle}
            />
            <NotifRow
              icon={Mail}
              iconBg="bg-slate-100 dark:bg-slate-800"
              iconColor="text-slate-500"
              title="Résumé par email"
              description="Récap' hebdo de tes rendez-vous"
              prefKey="email_summary"
              isEnabled={preferences.email_summary}
              savingKey={savingKey}
              onToggle={toggle}
            />
          </Section>

          {/* Système */}
          <Section label="Système">
            <button
              type="button"
              onClick={() =>
                toast.info("Ouvre les réglages de ton téléphone pour activer les notifications Blyss")
              }
              className="w-full flex items-center gap-3 p-4 active:bg-muted/50 transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
                <Settings size={18} className="text-muted-foreground" strokeWidth={1.8} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">Réglages système</p>
                <p className="text-xs text-muted-foreground mt-0.5">Activer les notifications pour Blyss</p>
              </div>
              <ChevronLeft size={16} className="rotate-180 text-muted-foreground/50 flex-shrink-0" />
            </button>
          </Section>
        </div>
      </div>
    </MobileLayout>
  );
};

export default ClientNotifications;
