import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  User,
  AlertCircle,
  Info,
  CheckCircle,
  XCircle,
  Search,
  Clock,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatusBadge, type StatusTone } from "@/components/admin/StatusBadge";
import { EmptyState } from "@/components/admin/EmptyState";

const API_URL = import.meta.env.VITE_API_URL || "";

// Actions réellement journalisées côté backend (logAdminAction, table
// admin_audit_log) — voir backend/routes/admin.routes.ts. Rien ici n'est
// fictif : chaque entrée correspond à une vraie action admin passée.
type AuditAction =
  | "delete_user"
  | "deactivate_user"
  | "reactivate_user"
  | "grant_admin"
  | "revoke_admin"
  | "revoke_all_sessions"
  | "refund_payment";

interface AuditLogEntry {
  id: number;
  action: AuditAction | string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  created_at: string;
  actor_first_name: string | null;
  actor_last_name: string | null;
  target_first_name: string | null;
  target_last_name: string | null;
}

type Severity = "info" | "success" | "warning" | "error";

const ACTION_CONFIG: Record<AuditAction, { label: string; severity: Severity }> = {
  delete_user: { label: "Suppression d'un compte", severity: "error" },
  deactivate_user: { label: "Désactivation d'un compte", severity: "warning" },
  reactivate_user: { label: "Réactivation d'un compte", severity: "success" },
  grant_admin: { label: "Accès admin accordé", severity: "warning" },
  revoke_admin: { label: "Accès admin retiré", severity: "info" },
  revoke_all_sessions: { label: "Déconnexion de toutes les sessions", severity: "info" },
  refund_payment: { label: "Remboursement d'un paiement", severity: "warning" },
};

const SEVERITY_CONFIG: Record<Severity, { icon: typeof Info; label: string; tone: StatusTone }> = {
  info: { icon: Info, label: "Info", tone: "info" },
  success: { icon: CheckCircle, label: "Succès", tone: "success" },
  warning: { icon: AlertCircle, label: "Attention", tone: "warning" },
  error: { icon: XCircle, label: "Erreur", tone: "danger" },
};

const describe = (log: AuditLogEntry): string => {
  const meta = log.metadata || {};
  const targetName =
    log.target_first_name || log.target_last_name
      ? `${log.target_first_name ?? ""} ${log.target_last_name ?? ""}`.trim()
      : (meta.first_name || meta.last_name)
      ? `${meta.first_name ?? ""} ${meta.last_name ?? ""}`.trim()
      : null;

  switch (log.action) {
    case "delete_user":
      return targetName
        ? `${targetName}${meta.email ? ` (${meta.email})` : ""} — compte #${log.target_id} supprimé définitivement`
        : `Compte #${log.target_id} supprimé définitivement`;
    case "deactivate_user":
      return targetName ? `${targetName} (#${log.target_id}) désactivé` : `Compte #${log.target_id} désactivé`;
    case "reactivate_user":
      return targetName ? `${targetName} (#${log.target_id}) réactivé` : `Compte #${log.target_id} réactivé`;
    case "grant_admin":
      return targetName ? `${targetName} (#${log.target_id}) devient administrateur` : `Compte #${log.target_id} promu administrateur`;
    case "revoke_admin":
      return targetName ? `Accès admin retiré à ${targetName} (#${log.target_id})` : `Accès admin retiré au compte #${log.target_id}`;
    case "revoke_all_sessions":
      return "Toutes les sessions actives ont été révoquées";
    case "refund_payment":
      return `Paiement #${log.target_id} remboursé${meta.stripe_refund_id ? ` (Stripe ${meta.stripe_refund_id})` : ""}`;
    default:
      return log.target_id ? `${log.target_type ?? "Cible"} #${log.target_id}` : "";
  }
};

const AdminLogs = () => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState<"all" | Severity>("all");
  const [dateFilter, setDateFilter] = useState("week");
  const [showIncidents, setShowIncidents] = useState(false);

  useEffect(() => {
    fetchLogs();
  }, [dateFilter]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/admin/audit-log?date=${dateFilter}`, {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        setLogs(data.data || []);
      } else {
        toast.error("Erreur lors du chargement des logs");
      }
    } catch {
      toast.error("Erreur lors du chargement des logs");
    } finally {
      setLoading(false);
    }
  };

  const enriched = useMemo(
    () =>
      logs.map((log) => {
        const config = ACTION_CONFIG[log.action as AuditAction];
        return {
          log,
          label: config?.label ?? log.action,
          severity: config?.severity ?? ("info" as Severity),
          description: describe(log),
          actorName: `${log.actor_first_name ?? ""} ${log.actor_last_name ?? ""}`.trim() || "Compte supprimé",
        };
      }),
    [logs]
  );

  const filtered = enriched.filter(({ log, label, description, severity, actorName }) => {
    const matchesSeverity = severityFilter === "all" || severity === severityFilter;
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q || label.toLowerCase().includes(q) || description.toLowerCase().includes(q) || actorName.toLowerCase().includes(q);
    return matchesSeverity && matchesSearch;
  });

  const stats = {
    total: enriched.length,
    info: enriched.filter((e) => e.severity === "info").length,
    success: enriched.filter((e) => e.severity === "success").length,
    warning: enriched.filter((e) => e.severity === "warning").length,
    error: enriched.filter((e) => e.severity === "error").length,
  };

  const incidents = enriched
    .filter((e) => e.severity === "warning" || e.severity === "error")
    .sort((a, b) => new Date(b.log.created_at).getTime() - new Date(a.log.created_at).getTime());

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-20 w-full rounded-2xl" />
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Logs d'audit"
        description={`${filtered.length} action${filtered.length > 1 ? "s" : ""} admin — suppressions, désactivations, accès admin, remboursements`}
        actions={
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setShowIncidents((v) => !v)}
            aria-label={showIncidents ? "Masquer les incidents" : "Voir les incidents"}
          >
            {showIncidents ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            <span className="text-xs">
              Incidents {incidents.length > 0 && `(${incidents.length})`}
            </span>
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="bg-card rounded-xl p-4 border-2 border-border">
          <p className="text-sm text-muted-foreground mb-1">Total</p>
          <p className="text-2xl font-bold text-foreground">{stats.total}</p>
        </div>
        <div className="bg-card rounded-xl p-4 border-2 border-border">
          <p className="text-sm text-muted-foreground mb-1">Info</p>
          <p className="text-2xl font-bold text-foreground">{stats.info}</p>
        </div>
        <div className="bg-card rounded-xl p-4 border-2 border-border">
          <p className="text-sm text-muted-foreground mb-1">Succès</p>
          <p className="text-2xl font-bold text-foreground">{stats.success}</p>
        </div>
        <div className="bg-card rounded-xl p-4 border-2 border-border">
          <p className="text-sm text-muted-foreground mb-1">Attention</p>
          <p className="text-2xl font-bold text-foreground">{stats.warning}</p>
        </div>
        <div className="bg-card rounded-xl p-4 border-2 border-foreground/30">
          <p className="text-sm text-muted-foreground mb-1">Erreurs</p>
          <p className="text-2xl font-bold text-foreground">{stats.error}</p>
        </div>
      </div>

      {/* Filtres */}
      <div className="bg-card rounded-2xl p-6 border-2 border-border">
        <div className="grid grid-cols-3 gap-4">
          <div className="relative">
            <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher..."
              className="w-full pl-12 pr-4 py-3 rounded-xl border-2 border-border bg-muted/40 focus:border-primary focus:bg-card outline-none transition-all"
            />
          </div>

          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as "all" | Severity)}
            className="px-4 py-3 rounded-xl border-2 border-border bg-muted/40 focus:border-primary focus:bg-card outline-none font-semibold"
          >
            <option value="all">Tous les types</option>
            <option value="info">Info</option>
            <option value="success">Succès</option>
            <option value="warning">Attention</option>
            <option value="error">Erreur</option>
          </select>

          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="px-4 py-3 rounded-xl border-2 border-border bg-muted/40 focus:border-primary focus:bg-card outline-none font-semibold"
          >
            <option value="today">Aujourd'hui</option>
            <option value="week">Cette semaine</option>
            <option value="month">Ce mois</option>
            <option value="all">Tout</option>
          </select>
        </div>
      </div>

      {/* Panneau Incidents — warnings + erreurs réels, dépliable */}
      <AnimatePresence>
        {showIncidents && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <Card>
              <CardContent className="p-4 flex flex-col gap-2">
                <span className="font-semibold text-sm mb-1">Actions sensibles (attention / erreur)</span>
                {incidents.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">
                    Aucune action sensible sur la période sélectionnée.
                  </p>
                ) : (
                  incidents.map(({ log, label, description }) => (
                    <div
                      key={log.id}
                      className="flex flex-col gap-1 border-b last:border-b-0 border-muted-foreground/10 pb-2 last:pb-0"
                    >
                      <span className="text-xs font-medium">
                        {label} — {new Date(log.created_at).toLocaleString("fr-FR")}
                      </span>
                      <span className="text-xs text-muted-foreground">{description}</span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Logs Timeline */}
      <Card>
        <CardContent className="p-6">
          <div className="space-y-4">
            {filtered.map(({ log, label, description, severity, actorName }) => {
              const config = SEVERITY_CONFIG[severity];
              const Icon = config.icon;

              return (
                <motion.div
                  key={log.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-start gap-4 p-4 rounded-xl hover:bg-muted/40 transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-muted border border-border flex items-center justify-center flex-shrink-0">
                    <Icon size={20} className="text-foreground" />
                  </div>

                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-1 gap-3">
                      <h3 className="font-semibold text-foreground">{label}</h3>
                      <StatusBadge tone={config.tone} label={config.label} icon={config.icon} />
                    </div>
                    {description && <p className="text-sm text-muted-foreground mb-2">{description}</p>}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <User size={12} />
                        {actorName}
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock size={12} />
                        {new Date(log.created_at).toLocaleString("fr-FR")}
                      </div>
                      {log.ip && (
                        <div className="flex items-center gap-1">
                          <Activity size={12} />
                          {log.ip}
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}

            {filtered.length === 0 && (
              <EmptyState
                icon={Activity}
                title="Aucun log trouvé"
                description="Essaie d'élargir la période ou de retirer les filtres actifs."
              />
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminLogs;
