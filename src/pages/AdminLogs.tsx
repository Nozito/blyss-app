import { useState, useEffect } from "react";
import {
  Activity,
  User,
  AlertCircle,
  Info,
  CheckCircle,
  XCircle,
  Search,
  Download,
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

interface Log {
  id: number;
  action: string;
  description: string;
  user_name?: string;
  user_id?: number;
  type: "info" | "success" | "warning" | "error";
  ip_address?: string;
  created_at: string;
}

const AdminLogs = () => {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("today");
  const [showIncidents, setShowIncidents] = useState(false);

  useEffect(() => {
    fetchLogs();
  }, [dateFilter]);

  const fetchLogs = async () => {
    try {
      const response = await fetch(`${API_URL}/api/admin/logs?date=${dateFilter}`, {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setLogs(data.data || []);
      }
    } catch (error) {
      toast.error("Erreur lors du chargement des logs");
    } finally {
      setLoading(false);
    }
  };

  const typeConfig: Record<
    Log["type"],
    { icon: typeof Info; label: string; tone: StatusTone }
  > = {
    info: { icon: Info, label: "Info", tone: "info" },
    success: { icon: CheckCircle, label: "Succès", tone: "success" },
    warning: { icon: AlertCircle, label: "Attention", tone: "warning" },
    error: { icon: XCircle, label: "Erreur", tone: "danger" },
  };

  const filteredLogs = logs.filter((log) => {
    const matchesType = typeFilter === "all" || log.type === typeFilter;
    const matchesSearch =
      log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.user_name?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesSearch;
  });

  const stats = {
    total: logs.length,
    info: logs.filter((l) => l.type === "info").length,
    success: logs.filter((l) => l.type === "success").length,
    warning: logs.filter((l) => l.type === "warning").length,
    error: logs.filter((l) => l.type === "error").length,
  };

  // "Incidents" = warnings + erreurs réels du même flux de logs (pas de donnée fictive)
  const incidents = logs
    .filter((l) => l.type === "warning" || l.type === "error")
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-5 gap-4">
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
        title="Logs système"
        description={`${filteredLogs.length} événement${filteredLogs.length > 1 ? "s" : ""}`}
        actions={
          <>
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
            <Button size="sm" variant="outline">
              <Download size={16} className="mr-2" />
              Exporter
            </Button>
          </>
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
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
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
                <span className="font-semibold text-sm mb-1">Historique des incidents</span>
                {incidents.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">
                    Aucun incident (warning/erreur) sur la période sélectionnée.
                  </p>
                ) : (
                  incidents.map((inc) => (
                    <div
                      key={inc.id}
                      className="flex flex-col gap-1 border-b last:border-b-0 border-muted-foreground/10 pb-2 last:pb-0"
                    >
                      <span className="text-xs font-medium">
                        {inc.action} — {new Date(inc.created_at).toLocaleString("fr-FR")}
                      </span>
                      <span className="text-xs text-muted-foreground">{inc.description}</span>
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
          {filteredLogs.map((log) => {
            const config = typeConfig[log.type];
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
                    <h3 className="font-semibold text-foreground">{log.action}</h3>
                    <StatusBadge tone={config.tone} label={config.label} icon={config.icon} />
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">{log.description}</p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    {log.user_name && (
                      <div className="flex items-center gap-1">
                        <User size={12} />
                        {log.user_name}
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <Clock size={12} />
                      {new Date(log.created_at).toLocaleString("fr-FR")}
                    </div>
                    {log.ip_address && (
                      <div className="flex items-center gap-1">
                        <Activity size={12} />
                        {log.ip_address}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}

          {filteredLogs.length === 0 && (
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
