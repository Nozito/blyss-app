import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronLeft, Bell, CheckCheck,
  CheckCircle, AlertCircle, AlertTriangle, Clock,
  MessageSquare, CreditCard, Gift, Mail, Tag, Loader2,
  Settings, Calendar,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import MobileLayout from "@/components/MobileLayout";
import { useNotifications } from "@/contexts/NotificationContext";
import api, { type ClientNotificationSettings } from "@/services/api";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = "activity" | "preferences";
type NotificationKey = keyof ClientNotificationSettings;

// ── Config icônes ─────────────────────────────────────────────────────────────

const NOTIF_CFG: Record<string, { icon: any; color: string; bg: string }> = {
  new_booking:       { icon: CheckCircle,   color: "#34C759", bg: "rgba(52,199,89,.12)"   },
  booking_confirmed: { icon: CheckCircle,   color: "#007AFF", bg: "rgba(0,122,255,.12)"   },
  booking_cancelled: { icon: AlertCircle,   color: "#FF3B30", bg: "rgba(255,59,48,.12)"   },
  booking_reminder:  { icon: Clock,         color: "#FF9500", bg: "rgba(255,149,0,.12)"   },
  message_received:  { icon: MessageSquare, color: "#5856D6", bg: "rgba(88,86,214,.12)"   },
  payment_received:  { icon: CreditCard,    color: "#34C759", bg: "rgba(52,199,89,.12)"   },
  promotional:       { icon: Gift,          color: "#FF2D55", bg: "rgba(255,45,85,.12)"   },
  late_alert:        { icon: AlertTriangle, color: "#FF9500", bg: "rgba(255,149,0,.12)"   },
  email_summary:     { icon: Mail,          color: "#8E8E93", bg: "rgba(142,142,147,.12)" },
  default:           { icon: Bell,          color: "#8E8E93", bg: "rgba(142,142,147,.12)" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRelTime(dateString: string) {
  const date = new Date(dateString);
  const diffMs = Date.now() - date.getTime();
  const diffMins  = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays  = Math.floor(diffMs / 86_400_000);
  if (diffMins  < 1)  return "maintenant";
  if (diffMins  < 60) return `${diffMins} min`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays  === 1) return "hier";
  if (diffDays  < 7)  return `${diffDays}j`;
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function groupByDay(notifications: any[]) {
  const todayStart     = new Date(); todayStart.setHours(0, 0, 0, 0);
  const yesterdayStart = new Date(todayStart); yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const weekStart      = new Date(todayStart); weekStart.setDate(weekStart.getDate() - 7);

  const groups: { label: string; items: any[] }[] = [
    { label: "Aujourd'hui",    items: [] },
    { label: "Hier",           items: [] },
    { label: "Cette semaine",  items: [] },
    { label: "Plus ancien",    items: [] },
  ];

  for (const n of notifications) {
    const d = new Date(n.created_at); d.setHours(0, 0, 0, 0);
    if      (d >= todayStart)     groups[0].items.push(n);
    else if (d >= yesterdayStart) groups[1].items.push(n);
    else if (d >= weekStart)      groups[2].items.push(n);
    else                          groups[3].items.push(n);
  }

  return groups.filter(g => g.items.length > 0);
}

// ── UI primitives ─────────────────────────────────────────────────────────────

const Toggle = ({
  enabled, loading, onToggle,
}: { enabled: boolean; loading: boolean; onToggle: () => void }) => (
  <button
    type="button"
    onClick={onToggle}
    disabled={loading}
    className={`relative w-12 h-7 rounded-full flex-shrink-0 transition-colors duration-200 disabled:opacity-50 ${
      enabled ? "bg-primary" : "bg-muted-foreground/25"
    }`}
  >
    <div className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all duration-200 ${
      enabled ? "left-[22px]" : "left-0.5"
    } flex items-center justify-center`}>
      {loading && <Loader2 size={11} className="animate-spin text-primary" />}
    </div>
  </button>
);

const PrefRow = ({
  icon: Icon, iconColor, iconBg, title, description,
  prefKey, isEnabled, savingKey, onToggle,
}: {
  icon: any; iconColor: string; iconBg: string;
  title: string; description: string; prefKey: NotificationKey;
  isEnabled: boolean; savingKey: NotificationKey | null;
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
    <Toggle enabled={isEnabled} loading={savingKey === prefKey} onToggle={() => onToggle(prefKey)} />
  </div>
);

const PrefSection = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-2">
    <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">{label}</h2>
    <div className="rounded-2xl border border-border bg-card overflow-hidden divide-y divide-border/50">
      {children}
    </div>
  </div>
);

// ── Page ──────────────────────────────────────────────────────────────────────

const ClientNotifications = () => {
  const navigate = useNavigate();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();

  const [tab, setTab] = useState<Tab>("activity");

  // Préférences
  const [savingKey,    setSavingKey]    = useState<NotificationKey | null>(null);
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [preferences,  setPreferences]  = useState<ClientNotificationSettings>({
    reminders: true, changes: true, messages: true, late: true, offers: true, email_summary: false,
  });

  useEffect(() => {
    api.notifications.getSettings()
      .then(res => { if (res.success && res.data) setPreferences(res.data); })
      .finally(() => setPrefsLoading(false));
  }, []);

  const togglePref = async (key: NotificationKey) => {
    if (savingKey) return;
    const next = !preferences[key];
    setPreferences(p => ({ ...p, [key]: next }));
    setSavingKey(key);
    try {
      await api.notifications.updateSettings({ [key]: next });
    } catch {
      setPreferences(p => ({ ...p, [key]: !next }));
      toast.error("Erreur lors de la mise à jour");
    } finally {
      setSavingKey(null);
    }
  };

  const grouped = useMemo(() => groupByDay(notifications), [notifications]);

  return (
    <MobileLayout showNav>
      <div className="pb-28">

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 pt-3 pb-4">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-2xl bg-muted flex items-center justify-center flex-shrink-0 active:bg-muted/70 transition-colors"
          >
            <ChevronLeft size={20} className="text-foreground" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-[18px] font-bold text-foreground leading-tight">Notifications</h1>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              {unreadCount > 0
                ? `${unreadCount} non lue${unreadCount > 1 ? "s" : ""}`
                : "Tout est lu"}
            </p>
          </div>
          <AnimatePresence>
            {unreadCount > 0 && tab === "activity" && (
              <motion.button
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                onClick={markAllAsRead}
                className="flex items-center gap-1.5 h-9 px-3 rounded-2xl bg-primary/10 text-primary text-[12px] font-semibold active:bg-primary/20 transition-colors flex-shrink-0"
              >
                <CheckCheck size={14} />
                Tout lire
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* ── Tabs ───────────────────────────────────────────────────────────── */}
        <div className="flex gap-1 p-1 rounded-2xl bg-muted mb-5">
          {([ ["activity", "Activité"], ["preferences", "Préférences"] ] as [Tab, string][]).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex-1 h-9 rounded-xl text-[13px] font-semibold transition-all ${
                tab === id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground active:bg-black/5"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Contenu ────────────────────────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          {tab === "activity" ? (

            /* ── Activité ── */
            <motion.div
              key="activity"
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.15 }}
            >
              {notifications.length === 0 ? (
                <div className="text-center py-20">
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                    <Bell size={26} className="text-muted-foreground" strokeWidth={1.5} />
                  </div>
                  <h3 className="text-[16px] font-bold text-foreground mb-1.5">Aucune notification</h3>
                  <p className="text-[13px] text-muted-foreground max-w-[220px] mx-auto leading-relaxed">
                    Tes notifications apparaîtront ici en temps réel.
                  </p>
                </div>
              ) : (
                <div className="space-y-5">
                  {grouped.map((group) => (
                    <div key={group.label}>
                      <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2 px-1">
                        {group.label}
                      </p>
                      <div className="space-y-1.5">
                        {group.items.map((notif, i) => {
                          const cfg  = NOTIF_CFG[notif.type] ?? NOTIF_CFG.default;
                          const Icon = cfg.icon;
                          return (
                            <motion.button
                              key={notif.id}
                              initial={{ opacity: 0, y: 5 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: Math.min(i * 0.03, 0.18) }}
                              onClick={() => { if (!notif.is_read) markAsRead(notif.id); }}
                              className={`w-full flex items-start gap-3 p-3.5 rounded-2xl text-left transition-all active:scale-[.985] ${
                                notif.is_read
                                  ? "bg-muted/40"
                                  : "bg-primary/[.05] border border-primary/10"
                              }`}
                            >
                              <div
                                className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-opacity"
                                style={{
                                  backgroundColor: cfg.bg,
                                  opacity: notif.is_read ? 0.55 : 1,
                                }}
                              >
                                <Icon size={17} style={{ color: cfg.color }} strokeWidth={2.5} />
                              </div>
                              <div className="flex-1 min-w-0 pt-0.5">
                                <p className={`text-[14px] leading-tight line-clamp-1 ${
                                  notif.is_read
                                    ? "font-medium text-muted-foreground"
                                    : "font-semibold text-foreground"
                                }`}>
                                  {notif.title}
                                </p>
                                <p className="text-[12px] text-muted-foreground mt-0.5 leading-snug line-clamp-2">
                                  {notif.message}
                                </p>
                                <p className="text-[11px] text-muted-foreground/50 mt-1.5 font-medium">
                                  {formatRelTime(notif.created_at)}
                                </p>
                              </div>
                              {!notif.is_read && (
                                <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-2" />
                              )}
                            </motion.button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>

          ) : (

            /* ── Préférences ── */
            <motion.div
              key="preferences"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              transition={{ duration: 0.15 }}
            >
              {prefsLoading ? (
                <div className="flex justify-center py-20">
                  <Loader2 size={24} className="animate-spin text-primary" />
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex items-center gap-3 p-4 rounded-2xl bg-primary/5 border border-primary/15">
                    <Bell size={18} className="text-primary flex-shrink-0" />
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Les modifications sont sauvegardées automatiquement.
                    </p>
                  </div>

                  <PrefSection label="Rendez-vous">
                    <PrefRow icon={Bell} iconBg="bg-primary/10" iconColor="text-primary"
                      title="Confirmations & rappels" description="La veille et 1h avant ton rendez-vous"
                      prefKey="reminders" isEnabled={preferences.reminders} savingKey={savingKey} onToggle={togglePref} />
                    <PrefRow icon={AlertTriangle} iconBg="bg-amber-100 dark:bg-amber-900/30" iconColor="text-amber-600"
                      title="Modifications & annulations" description="Si l'experte change ou annule ton créneau"
                      prefKey="changes" isEnabled={preferences.changes} savingKey={savingKey} onToggle={togglePref} />
                    <PrefRow icon={Calendar} iconBg="bg-sky-100 dark:bg-sky-900/30" iconColor="text-sky-500"
                      title="Retard de l'experte" description="Si ton rendez-vous prend du retard"
                      prefKey="late" isEnabled={preferences.late} savingKey={savingKey} onToggle={togglePref} />
                  </PrefSection>

                  <PrefSection label="Messages">
                    <PrefRow icon={MessageSquare} iconBg="bg-emerald-100 dark:bg-emerald-900/30" iconColor="text-emerald-600"
                      title="Nouveaux messages" description="Quand une experte t'envoie un message"
                      prefKey="messages" isEnabled={preferences.messages} savingKey={savingKey} onToggle={togglePref} />
                  </PrefSection>

                  <PrefSection label="Promotions">
                    <PrefRow icon={Tag} iconBg="bg-violet-100 dark:bg-violet-900/30" iconColor="text-violet-500"
                      title="Offres & codes promo" description="Exclusivités et promotions de tes expertes"
                      prefKey="offers" isEnabled={preferences.offers} savingKey={savingKey} onToggle={togglePref} />
                    <PrefRow icon={Mail} iconBg="bg-slate-100 dark:bg-slate-800" iconColor="text-slate-500"
                      title="Résumé par email" description="Récap' hebdo de tes rendez-vous"
                      prefKey="email_summary" isEnabled={preferences.email_summary} savingKey={savingKey} onToggle={togglePref} />
                  </PrefSection>

                  <PrefSection label="Système">
                    <button
                      type="button"
                      onClick={() => toast.info("Ouvre les réglages de ton téléphone pour activer les notifications Blyss")}
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
                  </PrefSection>
                </div>
              )}
            </motion.div>

          )}
        </AnimatePresence>
      </div>
    </MobileLayout>
  );
};

export default ClientNotifications;
