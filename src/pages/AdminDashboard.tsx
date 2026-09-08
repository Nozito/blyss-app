import { useQuery } from "@tanstack/react-query";
import {
  Users,
  Calendar,
  DollarSign,
  UserPlus,
  Activity,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Circle,
  TrendingUp,
  Flag,
  CreditCard,
} from "lucide-react";
import { AreaChart, Area, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { PageHeader } from "@/components/admin/PageHeader";
import { KpiCard } from "@/components/admin/KpiCard";
import { ChartCard } from "@/components/admin/ChartCard";
import { AlertList, type AlertItem } from "@/components/admin/AlertList";
import { ActivityTimeline } from "@/components/admin/ActivityTimeline";
import { LastUpdatedIndicator } from "@/components/admin/LastUpdatedIndicator";
import { ErrorState } from "@/components/admin/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";

const API_URL = import.meta.env.VITE_API_URL || "";

interface Changes {
  clients: number | null;
  pros: number | null;
  users: number | null;
  revenue: number | null;
  bookings: number | null;
}

interface Stats {
  totalUsers: number;
  totalPros: number;
  totalClients: number;
  totalBookings: number;
  todayBookings: number;
  totalRevenue: number;
  monthRevenue: number;
  activeUsers: number;
  newUsersThisMonth: number;
  bookingsByStatus: Record<string, number>;
  changes: Changes;
  // Optionnel : une réponse mise en cache par React Query avant ce champ
  // (ou un backend pas encore redéployé) ne l'a pas — jamais y accéder
  // sans garde, comme ça a planté toute la page une première fois.
  alerts?: { pendingReports: number; failedPayments: number };
}

interface ActivityItem {
  type: "booking" | "user" | "payment";
  title: string;
  description: string;
  time: string;
}

interface HealthStatus {
  status: "ok" | "degraded";
  db: "ok" | "error";
}

interface RevenuePoint {
  label: string;
  revenue: number;
}

const revenueChartConfig: ChartConfig = {
  revenue: { label: "Chiffre d'affaires (€)", color: "hsl(var(--primary))" },
};

const activityIcon: Record<ActivityItem["type"] | string, typeof Calendar> = {
  booking: Calendar,
  user: UserPlus,
  payment: DollarSign,
};

const bookingStatusRows: { key: string; label: string }[] = [
  { key: "pending", label: "En attente" },
  { key: "confirmed", label: "Confirmées" },
  { key: "completed", label: "Terminées" },
  { key: "cancelled", label: "Annulées" },
];

const AdminDashboard = () => {
  const { user } = useAuth();
  const {
    data,
    isLoading: loading,
    isFetching: statsFetching,
    error,
    refetch,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: async () => {
      const response = await fetch(`${API_URL}/api/admin/dashboard/stats`, { credentials: "include" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(`HTTP ${response.status} — ${body?.message ?? "Erreur inconnue"}`);
      }
      const json = await response.json();
      if (!json.success) throw new Error("Erreur serveur");
      return json;
    },
    staleTime: 5 * 60_000,
    retry: false,
  });

  const { data: healthData, refetch: refetchHealth } = useQuery({
    queryKey: ["admin-health"],
    queryFn: async () => {
      const response = await fetch(`${API_URL}/api/health`, { credentials: "include" });
      if (!response.ok) throw new Error("health error");
      return response.json() as Promise<HealthStatus>;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
  });

  const {
    data: revenueData,
    isLoading: revenueLoading,
    isError: revenueError,
    refetch: refetchRevenue,
  } = useQuery({
    queryKey: ["admin-dashboard-revenue"],
    queryFn: async (): Promise<RevenuePoint[]> => {
      const response = await fetch(`${API_URL}/api/admin/analytics/revenue?period=month`, { credentials: "include" });
      if (!response.ok) throw new Error("revenue error");
      const json = await response.json();
      if (!json.success) throw new Error("revenue error");
      return (json.data as any[]).map((r) => {
        const d = new Date(r.period);
        return {
          label: isNaN(d.getTime()) ? r.period : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
          revenue: Number(r.revenue),
        };
      });
    },
    staleTime: 5 * 60_000,
    retry: false,
  });

  const stats: Stats | null = data?.stats ?? null;
  const changes: Changes = stats?.changes ?? { clients: null, pros: null, users: null, revenue: null, bookings: null };
  const recentActivity: ActivityItem[] = data?.recentActivity ?? [];
  const bookingsByStatus: Record<string, number> = stats?.bookingsByStatus ?? {};

  const handleRefresh = () => {
    refetch();
    refetchHealth();
    refetchRevenue();
  };

  if (loading) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-14 w-72 rounded-lg" />
        <Skeleton className="h-44 w-full rounded-[1.5rem]" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
        <div className="grid lg:grid-cols-3 gap-6">
          <Skeleton className="lg:col-span-2 h-72 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-8">
        <PageHeader title="Dashboard" description="Vue de pilotage de l'application Blyss." />
        <ErrorState
          title="Impossible de charger le dashboard"
          description={(error as Error).message}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  type ServiceState = "operational" | "degraded" | "down" | "unknown";

  const apiState: ServiceState = !healthData ? "unknown" : healthData.status === "ok" ? "operational" : "degraded";
  const dbState: ServiceState = !healthData ? "unknown" : healthData.db === "ok" ? "operational" : "down";
  // Le WebSocket tourne dans le même process Express que l'API — pas de check dédié côté backend.
  const wsState = apiState;

  const serviceStatusConfig: Record<ServiceState, { label: string; icon: typeof CheckCircle; dot: string }> = {
    operational: { label: "Opérationnel", icon: CheckCircle, dot: "bg-success animate-pulse" },
    degraded: { label: "Dégradé", icon: AlertTriangle, dot: "bg-warning" },
    down: { label: "Indisponible", icon: XCircle, dot: "bg-destructive ring-1 ring-destructive/40" },
    unknown: { label: "Inconnu", icon: Circle, dot: "bg-muted-foreground/40" },
  };

  const hasSystemIssue = apiState !== "operational" || dbState !== "operational";

  const pendingReports = stats?.alerts?.pendingReports ?? 0;
  const failedPayments = stats?.alerts?.failedPayments ?? 0;

  const alerts: AlertItem[] = [];
  if (pendingReports) {
    alerts.push({
      id: "reports",
      icon: Flag,
      title: `${pendingReports} signalement${pendingReports > 1 ? "s" : ""} en attente`,
      description: "Conversations et avis signalés, à examiner.",
      actionLabel: "Voir la modération",
      actionHref: "/admin/moderation",
    });
  }
  if (failedPayments) {
    alerts.push({
      id: "failed-payments",
      icon: CreditCard,
      title: `${failedPayments} paiement${failedPayments > 1 ? "s" : ""} en échec`,
      description: "Sur les 30 derniers jours.",
      actionLabel: "Voir les paiements",
      actionHref: "/admin/analytics",
    });
  }
  if (hasSystemIssue) {
    alerts.push({
      id: "system",
      icon: AlertTriangle,
      title: dbState !== "operational" ? "Base de données dégradée" : "API dégradée",
      description: "Vérifie le statut système ci-dessous.",
      actionLabel: "Voir les détails",
      actionHref: "/admin/logs",
    });
  }

  const revenueIsEmpty = !revenueData || revenueData.every((p) => p.revenue === 0);

  const now = new Date();
  const greeting = now.getHours() < 6 ? "Bonne nuit" : now.getHours() < 18 ? "Bonjour" : "Bonsoir";
  const monthChange = changes.revenue;
  const adminName = (user?.first_name ?? "").trim();

  return (
    <div className="space-y-8">
      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
            {now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
          </p>
          <h1 className="admin-display mt-2 text-[2.9rem] text-foreground sm:text-[4.2rem]">
            {greeting}{adminName ? `, ${adminName}` : ""}.
          </h1>
        </div>
        <LastUpdatedIndicator
          updatedAt={dataUpdatedAt || null}
          onRefresh={handleRefresh}
          refreshing={statsFetching}
        />
      </header>

      {/* ── Métrique phare : CA du mois — aplat rose plein largeur ──────── */}
      <section className="admin-field-rose relative overflow-hidden rounded-[1.25rem] p-7 sm:p-10">
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em]">
              <DollarSign size={13} /> Chiffre d'affaires du mois
            </p>
            <p className="admin-display mt-3 text-[4rem] leading-[0.85] sm:text-[6rem]">
              {(stats?.monthRevenue ?? 0).toLocaleString("fr-FR")}
              <span className="ml-2 align-top text-[1.8rem]">€</span>
            </p>
            {monthChange != null && (
              <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-black">
                {monthChange >= 0 ? <TrendingUp size={14} /> : <TrendingUp size={14} className="rotate-180" />}
                {monthChange > 0 ? "+" : ""}
                {monthChange}% vs mois dernier
              </p>
            )}
          </div>
          <dl className="grid grid-cols-3 gap-x-8 gap-y-1 text-right">
            {[
              { k: "Total encaissé", v: `${(stats?.totalRevenue ?? 0).toLocaleString("fr-FR")} €` },
              { k: "RDV aujourd'hui", v: stats?.todayBookings ?? 0 },
              { k: "Réservations", v: stats?.totalBookings ?? 0 },
            ].map((s) => (
              <div key={s.k}>
                <dd className="admin-display text-[1.8rem] leading-none">{s.v}</dd>
                <dt className="mt-1 text-[10px] font-black uppercase tracking-[0.12em]">{s.k}</dt>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* KPI secondaires */}
      <div className="admin-stagger grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          icon={Users}
          label="Utilisateurs"
          value={stats?.totalUsers ?? 0}
          change={changes.users}
          changeLabel="vs mois dernier"
        />
        <KpiCard icon={Activity} label="Actifs (7j)" value={stats?.activeUsers ?? 0} />
        <KpiCard icon={UserPlus} label="Nouveaux (30j)" value={stats?.newUsersThisMonth ?? 0} />
        <KpiCard
          icon={Calendar}
          label="RDV aujourd'hui"
          value={stats?.todayBookings ?? 0}
          change={changes.bookings}
          changeLabel="vs hier"
        />
      </div>

      {/* Activité principale + alertes */}
      <div className="grid lg:grid-cols-3 gap-6 lg:items-start">
        <ChartCard
          className="lg:col-span-2"
          icon={TrendingUp}
          title="Chiffre d'affaires"
          description="Réservations confirmées et terminées — 30 derniers jours."
          loading={revenueLoading}
          error={revenueError}
          onRetry={() => refetchRevenue()}
          isEmpty={revenueIsEmpty}
          emptyTitle="Pas encore de revenus ce mois-ci"
          emptyDescription="Le graphique apparaîtra dès les premières réservations payées."
        >
          <ChartContainer config={revenueChartConfig} className="h-56 w-full">
            <AreaChart data={revenueData} accessibilityLayer aria-label="Évolution du chiffre d'affaires sur 30 jours">
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} minTickGap={24} />
              <YAxis tickLine={false} axisLine={false} fontSize={11} width={48} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="var(--color-revenue)"
                fill="var(--color-revenue)"
                fillOpacity={0.15}
                strokeWidth={2}
              />
            </AreaChart>
          </ChartContainer>
        </ChartCard>

        <div className="bg-card rounded-2xl border border-border p-5 sm:p-6 shadow-[var(--shadow-card)]">
          <h2 className="text-lg font-bold text-foreground mb-1">Nécessite ton attention</h2>
          <p className="text-sm text-muted-foreground mb-4">Signaux à traiter dès que possible.</p>
          <AlertList items={alerts} />
        </div>
      </div>

      {/* Activité récente + aperçu opérationnel */}
      <div className="grid lg:grid-cols-3 gap-6 lg:items-start">
        <div className="lg:col-span-2 bg-card rounded-2xl border border-border p-5 sm:p-6 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-foreground">Activité récente</h2>
            <span className="text-xs text-muted-foreground font-medium">Dernières actions</span>
          </div>
          <ActivityTimeline items={recentActivity} iconFor={(type) => activityIcon[type] ?? Activity} />
        </div>

        <div className="space-y-6">
          <div className="bg-card rounded-2xl border border-border p-5 sm:p-6 shadow-[var(--shadow-card)]">
            <h3 className="text-sm font-bold text-foreground mb-3">Réservations par statut</h3>
            <div className="space-y-2">
              {bookingStatusRows.map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between py-1.5">
                  <span className="text-sm text-muted-foreground">{label}</span>
                  <span className="text-sm font-bold text-foreground">{bookingsByStatus[key] ?? 0}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-card rounded-2xl border border-border p-5 sm:p-6 shadow-[var(--shadow-card)]">
            <h3 className="text-sm font-bold text-foreground mb-3">Statut système</h3>
            <div className="space-y-2">
              {[
                { label: "API", state: apiState },
                { label: "Base de données", state: dbState },
                { label: "WebSocket", state: wsState },
              ].map(({ label, state }) => {
                const config = serviceStatusConfig[state];
                const Icon = config.icon;
                return (
                  <div key={label} className="flex items-center justify-between py-1.5">
                    <div className="flex items-center gap-2">
                      <Icon size={14} className="text-foreground" aria-hidden="true" />
                      <span className="text-sm text-muted-foreground">{label}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${config.dot}`} aria-hidden="true" />
                      <span className="text-sm font-semibold text-foreground">{config.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground/70 mt-3">Vérifié toutes les 60s.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
