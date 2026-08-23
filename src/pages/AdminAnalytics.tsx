import { useEffect, useState, useMemo } from "react";
import { fetchAllPages } from "@/utils/fetchAllPages";
import {
  TrendingUp,
  TrendingDown,
  Users,
  Calendar,
  DollarSign,
  Download,
  CheckCircle2,
  XCircle,
  CreditCard,
  Search,
  Clock,
  Eye,
  RefreshCw,
  Receipt,
  LayoutGrid,
  List,
} from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatusBadge, type StatusTone } from "@/components/admin/StatusBadge";
import { EmptyState } from "@/components/admin/EmptyState";

const API_URL = import.meta.env.VITE_API_URL || "";

type Period = "week" | "month" | "year";
type Tab = "overview" | "transactions";

interface AnalyticsAggregate {
  revenue: {
    total_revenue: number;
    month_revenue: number;
    successful_payments: number;
    refunded_payments: number;
  };
  users: {
    total_users: number;
    total_pros: number;
    total_clients: number;
    new_last_30d: number;
  };
  bookings: {
    total: number;
    completed: number;
    cancelled: number;
    pending: number;
    confirmed: number;
    last_30d: number;
  };
}

interface RevenuePoint {
  period: string;
  revenue: number;
  transactions: number;
}

interface BookingPoint {
  period: string;
  total: number;
  completed: number;
  cancelled: number;
  revenue: number;
}

interface Transaction {
  id: number;
  booking_id: number;
  client_name: string;
  pro_name: string;
  amount: number;
  fee: number;
  net_amount: number;
  status: "pending" | "processing" | "succeeded" | "failed" | "refunded";
  type: "deposit" | "balance" | "full" | "on_site";
  created_at: string;
}

const TYPE_LABELS: Record<Transaction["type"], string> = {
  deposit: "Acompte",
  balance: "Solde",
  full: "Total",
  on_site: "Sur place",
};

const periodLabels: Record<Period, string> = {
  week: "Cette semaine",
  month: "Ce mois",
  year: "Cette année",
};

const formatPeriodLabel = (iso: string, period: Period) => {
  const date = new Date(iso);
  if (isNaN(date.getTime())) return iso;
  return period === "year"
    ? date.toLocaleDateString("fr-FR", { month: "short" })
    : date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
};

/** Variation réelle entre le premier et le dernier point de la série — jamais un chiffre inventé. */
const seriesGrowth = (values: number[]): number | null => {
  if (values.length < 2) return null;
  const first = values[0];
  const last = values[values.length - 1];
  if (first === 0) return last > 0 ? 100 : null;
  return Math.round(((last - first) / first) * 100 * 10) / 10;
};

const revenueChartConfig: ChartConfig = {
  revenue: { label: "Chiffre d'affaires (€)", color: "hsl(var(--primary))" },
};

const bookingsChartConfig: ChartConfig = {
  completed: { label: "Terminées", color: "hsl(var(--primary))" },
  cancelled: { label: "Annulées", color: "hsl(var(--destructive))" },
};

const GrowthBadge = ({ value }: { value: number | null }) => {
  if (value === null) {
    return (
      <Badge variant="outline" className="bg-muted text-muted-foreground border-border text-xs font-bold">
        —
      </Badge>
    );
  }
  const positive = value >= 0;
  return (
    <Badge variant="outline" className="gap-1 bg-muted text-foreground border-border text-xs font-bold">
      {positive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {positive ? "+" : ""}
      {value}%
    </Badge>
  );
};

const AdminAnalytics = () => {
  const [tab, setTab] = useState<Tab>("overview");

  // ── Vue d'ensemble ────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("month");
  const [aggregate, setAggregate] = useState<AnalyticsAggregate | null>(null);
  const [revenueSeries, setRevenueSeries] = useState<RevenuePoint[]>([]);
  const [bookingSeries, setBookingSeries] = useState<BookingPoint[]>([]);

  useEffect(() => {
    fetchAnalytics();
  }, [period]);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const [aggRes, revRes, bookRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/analytics`, { credentials: "include" }),
        fetch(`${API_URL}/api/admin/analytics/revenue?period=${period}`, { credentials: "include" }),
        fetch(`${API_URL}/api/admin/analytics/bookings?period=${period}`, { credentials: "include" }),
      ]);

      if (aggRes.ok) {
        const json = await aggRes.json();
        if (json.success) setAggregate(json.data);
      }
      if (revRes.ok) {
        const json = await revRes.json();
        if (json.success) {
          setRevenueSeries(
            (json.data as any[]).map((r) => ({
              period: r.period,
              revenue: Number(r.revenue),
              transactions: Number(r.transactions),
            }))
          );
        }
      }
      if (bookRes.ok) {
        const json = await bookRes.json();
        if (json.success) {
          setBookingSeries(
            (json.data as any[]).map((b) => ({
              period: b.period,
              total: Number(b.total),
              completed: Number(b.completed),
              cancelled: Number(b.cancelled),
              revenue: Number(b.revenue),
            }))
          );
        }
      }
    } catch (error) {
      toast.error("Erreur lors du chargement des analytics");
    } finally {
      setLoading(false);
    }
  };

  const revenueGrowth = seriesGrowth(revenueSeries.map((p) => p.revenue));
  const bookingsGrowth = seriesGrowth(bookingSeries.map((p) => p.total));

  const totalRevenue = aggregate?.revenue.total_revenue ?? 0;
  const totalBookings = aggregate?.bookings.total ?? 0;
  const avgBookingValue = totalBookings > 0 ? totalRevenue / totalBookings : 0;

  const revenueChartData = revenueSeries.map((p) => ({
    label: formatPeriodLabel(p.period, period),
    revenue: p.revenue,
  }));

  const bookingsChartData = bookingSeries.map((p) => ({
    label: formatPeriodLabel(p.period, period),
    completed: p.completed,
    cancelled: p.cancelled,
  }));

  // ── Transactions ──────────────────────────────────────────────────────────
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    fetchTransactions();
  }, []);

  const fetchTransactions = async () => {
    try {
      // L'API pagine (défaut 50/page) — la recherche/les filtres sont faits
      // côté client sur `transactions`, donc il faut TOUT charger, sinon un
      // paiement hors des N plus récents devient invisible. Les pages sont
      // chargées en parallèle (fetchAllPages), pas une par une.
      const all = await fetchAllPages<Transaction>(`${API_URL}/api/admin/payments`);
      setTransactions(all);
    } catch (error) {
      toast.error("Erreur lors du chargement des paiements");
    } finally {
      setTransactionsLoading(false);
    }
  };

  // Un seul passage sur `transactions` plutôt que 4 (filter+reduce séparés),
  // et mémoïsé pour ne pas recalculer à chaque frappe dans la recherche.
  const paymentStats = useMemo(() => {
    let totalRevenue = 0;
    let totalFees = 0;
    let netRevenue = 0;
    let pendingCount = 0;
    for (const t of transactions) {
      if (t.status === "succeeded") {
        totalRevenue += t.amount;
        totalFees += t.fee;
        netRevenue += t.net_amount;
      } else if (t.status === "pending" || t.status === "processing") {
        pendingCount += 1;
      }
    }
    return { totalRevenue, totalFees, netRevenue, pendingCount };
  }, [transactions]);

  const statusConfig: Record<
    Transaction["status"],
    { label: string; icon: typeof CheckCircle2; tone: StatusTone }
  > = {
    succeeded: { label: "Réussi", icon: CheckCircle2, tone: "success" },
    pending: { label: "En attente", icon: Clock, tone: "warning" },
    processing: { label: "En cours", icon: Clock, tone: "warning" },
    failed: { label: "Échoué", icon: XCircle, tone: "danger" },
    refunded: { label: "Remboursé", icon: RefreshCw, tone: "info" },
  };

  const filteredTransactions = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return transactions.filter((t) => {
      const matchesStatus = statusFilter === "all" || t.status === statusFilter;
      const matchesSearch =
        (t.client_name || "").toLowerCase().includes(q) ||
        (t.pro_name || "").toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [transactions, searchQuery, statusFilter]);

  const tabButtonClass = (active: boolean) =>
    `h-8 px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${
      active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
    }`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finances"
        description={
          tab === "overview"
            ? `Vue d'ensemble des performances — ${periodLabels[period].toLowerCase()}`
            : `${filteredTransactions.length} transaction${filteredTransactions.length > 1 ? "s" : ""}`
        }
        actions={
          <>
            <div className="flex items-center gap-1 rounded-xl border-2 border-border bg-card p-1">
              <button onClick={() => setTab("overview")} aria-pressed={tab === "overview"} className={tabButtonClass(tab === "overview")}>
                <LayoutGrid size={14} aria-hidden="true" /> Vue d'ensemble
              </button>
              <button onClick={() => setTab("transactions")} aria-pressed={tab === "transactions"} className={tabButtonClass(tab === "transactions")}>
                <List size={14} aria-hidden="true" /> Transactions
              </button>
            </div>

            {tab === "overview" ? (
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value as Period)}
                aria-label="Période d'analyse"
                className="px-4 py-2.5 rounded-xl border-2 border-border bg-card font-semibold outline-none focus:border-ring focus-visible:ring-2 focus-visible:ring-ring transition-all"
              >
                <option value="week">Cette semaine</option>
                <option value="month">Ce mois</option>
                <option value="year">Cette année</option>
              </select>
            ) : null}

            <button className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold flex items-center gap-2 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors">
              <Download size={18} aria-hidden="true" />
              Exporter
            </button>
          </>
        }
      />

      {tab === "overview" ? (
        loading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-32 rounded-2xl" />
              ))}
            </div>
            <div className="grid lg:grid-cols-2 gap-6">
              <Skeleton className="h-72 rounded-2xl" />
              <Skeleton className="h-72 rounded-2xl" />
            </div>
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {[
                {
                  title: "Utilisateurs",
                  value: aggregate?.users.total_users ?? 0,
                  sub: `+${aggregate?.users.new_last_30d ?? 0} sur 30j`,
                  icon: Users,
                },
                {
                  title: "Réservations",
                  value: totalBookings,
                  growth: bookingsGrowth,
                  icon: Calendar,
                },
                {
                  title: "Chiffre d'Affaires",
                  value: `${totalRevenue.toLocaleString("fr-FR")}€`,
                  growth: revenueGrowth,
                  icon: DollarSign,
                },
                {
                  title: "Panier Moyen",
                  value: `${avgBookingValue.toFixed(2)}€`,
                  icon: TrendingUp,
                },
              ].map((stat, index) => {
                const Icon = stat.icon;
                return (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    whileHover={{ y: -3 }}
                    className="bg-card rounded-2xl p-6 border-2 border-border"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <Icon size={32} className="text-muted-foreground" />
                      {"growth" in stat ? (
                        <GrowthBadge value={stat.growth ?? null} />
                      ) : "sub" in stat ? (
                        <Badge variant="outline" className="bg-muted text-muted-foreground border-border text-xs font-bold">
                          {stat.sub}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-3xl font-bold mb-1 text-foreground">{stat.value}</p>
                    <p className="text-sm text-muted-foreground">{stat.title}</p>
                  </motion.div>
                );
              })}
            </div>

            {/* Charts — alimentés par de vraies séries temporelles */}
            <div className="grid lg:grid-cols-2 gap-6">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-card rounded-2xl p-6 border-2 border-border"
              >
                <h2 className="text-xl font-bold text-foreground mb-4">Évolution du Chiffre d'Affaires</h2>
                {revenueChartData.length === 0 ? (
                  <EmptyState icon={DollarSign} title="Aucune donnée" description="Aucun chiffre d'affaires enregistré sur cette période." className="py-10" />
                ) : (
                  <ChartContainer config={revenueChartConfig} className="h-64 w-full">
                    <AreaChart data={revenueChartData}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                      <YAxis tickLine={false} axisLine={false} fontSize={11} width={40} />
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
                )}
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-card rounded-2xl p-6 border-2 border-border"
              >
                <h2 className="text-xl font-bold text-foreground mb-4">Réservations Terminées vs Annulées</h2>
                {bookingsChartData.length === 0 ? (
                  <EmptyState icon={Calendar} title="Aucune donnée" description="Aucune réservation enregistrée sur cette période." className="py-10" />
                ) : (
                  <ChartContainer config={bookingsChartConfig} className="h-64 w-full">
                    <BarChart data={bookingsChartData}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                      <YAxis tickLine={false} axisLine={false} fontSize={11} width={30} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="completed" fill="var(--color-completed)" radius={4} />
                      <Bar dataKey="cancelled" fill="var(--color-cancelled)" radius={4} />
                    </BarChart>
                  </ChartContainer>
                )}
              </motion.div>
            </div>

            {/* Répartitions réelles */}
            <div className="grid lg:grid-cols-2 gap-6">
              <div className="bg-card rounded-2xl p-6 border-2 border-border">
                <h2 className="text-xl font-bold text-foreground mb-6">Réservations par Statut</h2>
                <div className="space-y-3">
                  {[
                    { label: "Terminées", value: aggregate?.bookings.completed ?? 0, color: "bg-foreground" },
                    { label: "Confirmées", value: aggregate?.bookings.confirmed ?? 0, color: "bg-foreground/65" },
                    { label: "En attente", value: aggregate?.bookings.pending ?? 0, color: "bg-foreground/35" },
                    { label: "Annulées", value: aggregate?.bookings.cancelled ?? 0, color: "bg-muted-foreground/40" },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-foreground/80 w-24 shrink-0">{label}</span>
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full ${color} rounded-full`}
                          style={{ width: `${totalBookings > 0 ? (value / totalBookings) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="text-sm font-bold text-foreground w-8 text-right">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-card rounded-2xl p-6 border-2 border-border">
                <h2 className="text-xl font-bold text-foreground mb-6">Paiements</h2>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-xl bg-muted/40">
                    <span className="text-sm font-semibold text-foreground/80 flex items-center gap-2">
                      <CheckCircle2 size={16} className="text-foreground" />
                      Réussis
                    </span>
                    <span className="text-xl font-black text-foreground">{aggregate?.revenue.successful_payments ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-xl bg-muted/40 border border-border">
                    <span className="text-sm font-semibold text-foreground/80 flex items-center gap-2">
                      <XCircle size={16} className="text-muted-foreground" />
                      Remboursés
                    </span>
                    <span className="text-xl font-black text-foreground">{aggregate?.revenue.refunded_payments ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-xl bg-muted/40">
                    <span className="text-sm font-semibold text-foreground/80">CA du mois</span>
                    <span className="text-xl font-black text-foreground">
                      {(aggregate?.revenue.month_revenue ?? 0).toLocaleString("fr-FR")}€
                    </span>
                  </div>
                  <button
                    onClick={() => setTab("transactions")}
                    className="w-full text-sm font-semibold text-foreground hover:underline text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                  >
                    Voir toutes les transactions →
                  </button>
                </div>
              </div>
            </div>
          </>
        )
      ) : transactionsLoading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-96 w-full rounded-2xl" />
        </div>
      ) : (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-foreground text-background rounded-2xl p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <DollarSign size={32} />
                <TrendingUp size={20} />
              </div>
              <p className="text-3xl font-bold">{paymentStats.totalRevenue.toFixed(2)}€</p>
              <p className="text-sm opacity-70 mt-1">Revenus Total</p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-card rounded-2xl p-6 border-2 border-border"
            >
              <div className="flex items-center justify-between mb-2">
                <CreditCard size={20} className="text-muted-foreground" />
                <span className="text-xs font-bold text-muted-foreground">FRAIS</span>
              </div>
              <p className="text-3xl font-bold text-foreground">{paymentStats.totalFees.toFixed(2)}€</p>
              <p className="text-sm text-muted-foreground mt-1">Commissions</p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-card rounded-2xl p-6 border-2 border-border"
            >
              <div className="flex items-center justify-between mb-2">
                <TrendingUp size={20} className="text-muted-foreground" />
                <span className="text-xs font-bold text-muted-foreground">NET</span>
              </div>
              <p className="text-3xl font-bold text-foreground">{paymentStats.netRevenue.toFixed(2)}€</p>
              <p className="text-sm text-muted-foreground mt-1">Revenu Net</p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-card rounded-2xl p-6 border-2 border-border"
            >
              <div className="flex items-center justify-between mb-2">
                <Clock size={20} className="text-muted-foreground" />
                <span className="text-xs font-bold text-muted-foreground">EN ATTENTE</span>
              </div>
              <p className="text-3xl font-bold text-foreground">{paymentStats.pendingCount}</p>
              <p className="text-sm text-muted-foreground mt-1">Paiements</p>
            </motion.div>
          </div>

          {/* Filtres */}
          <div className="bg-card rounded-2xl p-6 border-2 border-border">
            <div className="flex gap-4">
              <div className="relative flex-1">
                <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Rechercher par nom..."
                  className="w-full pl-12 pr-4 py-3 rounded-xl border-2 border-border bg-muted/40 focus:border-primary focus:bg-card outline-none transition-all"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-3 rounded-xl border-2 border-border bg-muted/40 focus:border-primary focus:bg-card outline-none font-semibold"
              >
                <option value="all">Tous les statuts</option>
                <option value="succeeded">Réussi</option>
                <option value="pending">En attente</option>
                <option value="processing">En cours</option>
                <option value="failed">Échoué</option>
                <option value="refunded">Remboursé</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="bg-card rounded-2xl border-2 border-border overflow-hidden">
            {filteredTransactions.length === 0 ? (
              <EmptyState
                icon={Receipt}
                title="Aucune transaction"
                description={
                  searchQuery || statusFilter !== "all"
                    ? "Aucun paiement ne correspond à cette recherche ou à ce filtre."
                    : "Aucun paiement enregistré pour le moment."
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40 border-b-2 border-border">
                      <TableHead className="text-xs font-bold text-muted-foreground uppercase">ID</TableHead>
                      <TableHead className="text-xs font-bold text-muted-foreground uppercase">Client</TableHead>
                      <TableHead className="text-xs font-bold text-muted-foreground uppercase">Pro</TableHead>
                      <TableHead className="text-xs font-bold text-muted-foreground uppercase">Montant</TableHead>
                      <TableHead className="text-xs font-bold text-muted-foreground uppercase">Frais</TableHead>
                      <TableHead className="text-xs font-bold text-muted-foreground uppercase">Net</TableHead>
                      <TableHead className="text-xs font-bold text-muted-foreground uppercase">Type</TableHead>
                      <TableHead className="text-xs font-bold text-muted-foreground uppercase">Statut</TableHead>
                      <TableHead className="text-xs font-bold text-muted-foreground uppercase">Date</TableHead>
                      <TableHead className="text-xs font-bold text-muted-foreground uppercase">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTransactions.map((transaction) => {
                      const status = statusConfig[transaction.status];
                      const StatusIcon = status.icon;

                      return (
                        <TableRow key={transaction.id} className="hover:bg-muted/40 transition-colors">
                          <TableCell>
                            <span className="font-mono text-sm text-muted-foreground">#{transaction.id}</span>
                          </TableCell>
                          <TableCell>
                            <span className="font-semibold text-foreground">{transaction.client_name}</span>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-foreground/80">{transaction.pro_name}</span>
                          </TableCell>
                          <TableCell>
                            <span className="font-bold text-foreground">{transaction.amount.toFixed(2)}€</span>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground">-{transaction.fee.toFixed(2)}€</span>
                          </TableCell>
                          <TableCell>
                            <span className="font-bold text-foreground">{transaction.net_amount.toFixed(2)}€</span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <CreditCard size={16} className="text-muted-foreground/60" />
                              <span className="text-sm">{TYPE_LABELS[transaction.type] ?? transaction.type}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <StatusBadge tone={status.tone} icon={StatusIcon} label={status.label} />
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground">
                              {new Date(transaction.created_at).toLocaleDateString("fr-FR")}
                            </span>
                          </TableCell>
                          <TableCell>
                            <button
                              aria-label={`Voir le détail du paiement #${transaction.id}`}
                              className="w-8 h-8 rounded-lg bg-muted hover:bg-accent flex items-center justify-center transition-colors"
                            >
                              <Eye size={16} className="text-foreground" />
                            </button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default AdminAnalytics;
