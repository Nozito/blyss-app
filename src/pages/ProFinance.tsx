import { useCallback, useEffect, useMemo, useState } from "react";
import MobileLayout from "@/components/MobileLayout";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ChevronLeft,
  TrendingUp,
  Download,
  Sparkles,
  DollarSign,
  BarChart3,
  Target,
  Crown,
  AlertCircle,
  FileDown,
  ChevronRight,
  X,
  Check,
} from "lucide-react";
import { proApi } from "@/services/api";
import { toast } from "sonner";
import * as Dialog from "@radix-ui/react-dialog";

// ===== TYPES =====
interface FinanceStats {
  today: number;
  month: number;
  lastMonth: number;
  objective?: number;
  forecast: number;
  topServices?: Array<{
    name: string;
    revenue: number;
    count: number;
    percentage: number;
  }>;
  trend: "up" | "down" | "stable";
}

const DEFAULT_STATS = {
  today: 0,
  month: 0,
  lastMonth: 0,
  forecast: 0,
  trend: "stable" as const,
  objective: 0,
  topServices: [] as Array<{
    name: string;
    revenue: number;
    count: number;
    percentage: number;
  }>,
};

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);

const ProFinance = () => {
  const navigate = useNavigate();

  const [stats, setStats] = useState<(FinanceStats & { objective: number; topServices: any[] }) | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<"week" | "month" | "year">("month");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Graphiques (chargés à la demande)
  const [chartsOpen, setChartsOpen] = useState(false);
  const [recharts, setRecharts] = useState<any>(null);
  const [chartsLoading, setChartsLoading] = useState(false);
  const [selectedBarIndex, setSelectedBarIndex] = useState<number>(1);
  const [selectedPieIndex, setSelectedPieIndex] = useState<number | null>(null);

  // Modal objectif
  const [objectiveOpen, setObjectiveOpen] = useState(false);
  const [objectiveInput, setObjectiveInput] = useState<string>("");
  const [isSavingObjective, setIsSavingObjective] = useState(false);

  const loadFinanceData = useCallback(async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);

      const res = await proApi.getFinanceStats();
      if (!res?.success) throw new Error(res?.error || "Erreur serveur");

      const d: any = res.data ?? {};
      const normalized = {
        ...DEFAULT_STATS,
        ...d,
        objective: typeof d?.objective === "number" ? d.objective : DEFAULT_STATS.objective,
        topServices: Array.isArray(d?.topServices) ? d.topServices : DEFAULT_STATS.topServices,
      };

      setStats(normalized);
    } catch (err: any) {
      const msg = err?.message || "Impossible de charger les données financières";
      setErrorMessage(msg);
      setStats(null);
      toast.error("Impossible de charger les données financières");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFinanceData();
  }, [loadFinanceData]);

  useEffect(() => {
    let cancelled = false;

    const loadCharts = async () => {
      if (!chartsOpen || recharts) return;
      try {
        setChartsLoading(true);
        const mod = await import("recharts");
        if (!cancelled) setRecharts(mod);
      } catch {
        if (!cancelled) toast.error("Impossible de charger les graphiques");
      } finally {
        if (!cancelled) setChartsLoading(false);
      }
    };

    loadCharts();
    return () => {
      cancelled = true;
    };
  }, [chartsOpen, recharts]);

  const handleExport = async () => {
    try {
      setIsExporting(true);
      const res = await proApi.exportFinanceData(selectedPeriod);
      if (!res?.success) throw new Error(res?.error || "Erreur lors de l'export");

      const blob = new Blob([res.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `blyss-compta-${selectedPeriod}-${new Date().toISOString().slice(0, 7)}.xlsx`;
      a.click();

      toast.success("Export comptable téléchargé !");
    } catch {
      toast.error("Impossible d'exporter les données");
    } finally {
      setIsExporting(false);
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(amount);

  const monthLabel = useMemo(() => {
    const now = new Date();
    return now.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  }, []);

  const variation = useMemo(() => {
    if (!stats || stats.lastMonth === 0) return null;
    return Math.round(((stats.month - stats.lastMonth) / stats.lastMonth) * 100);
  }, [stats]);

  const progress = useMemo(() => {
    if (!stats || !stats.objective) return 0;
    return Math.min(Math.round((stats.month / stats.objective) * 100), 100);
  }, [stats]);

  const topServices = useMemo(() => stats?.topServices ?? [], [stats]);

  const barData = useMemo(() => {
    if (!stats) return [];
    return [
      { name: "Aujourd'hui", value: stats.today },
      { name: "Ce mois", value: stats.month },
      { name: "Mois dernier", value: stats.lastMonth },
      { name: "Prévision", value: stats.forecast },
    ];
  }, [stats]);

  const pieData = useMemo(() => {
    return topServices
      .filter((s: any) => typeof s?.revenue === "number" && s.revenue > 0)
      .map((s: any) => ({ name: s.name, value: s.revenue }));
  }, [topServices]);

  const pieColors = ["#6366F1", "#10B981", "#F59E0B", "#EF4444", "#06B6D4", "#8B5CF6"];

  const isSignaturePaywall =
    (errorMessage || "").toLowerCase().includes("signature") ||
    (errorMessage || "").toLowerCase().includes("abonnement");

  const openObjectiveModal = () => {
    const current = stats?.objective ?? 0;
    setObjectiveInput(String(current));
    setObjectiveOpen(true);
  };

  const parseObjective = (value: string) => {
    const n = Number(String(value).replace(",", "."));
    if (!Number.isFinite(n)) return null;
    return clamp(Math.round(n), 0, 1_000_000);
  };

  const canSaveObjective = useMemo(() => {
    if (!stats) return false;
    const next = parseObjective(objectiveInput);
    if (next === null) return false;
    return next !== stats.objective;
  }, [objectiveInput, stats]);

  const saveObjective = async () => {
    if (!stats) return;
    const next = parseObjective(objectiveInput);
    if (next === null) {
      toast.error("Objectif invalide");
      return;
    }

    try {
      setIsSavingObjective(true);

      // Persistance côté backend
      const res = await (proApi as any).updateFinanceObjective(next);
      if (!res?.success) throw new Error(res?.error || "Impossible d'enregistrer l'objectif");

      // Mise à jour immédiate UI
      setStats((prev) => (prev ? { ...prev, objective: next } : prev));
      setObjectiveOpen(false);
      toast.success("Objectif mensuel mis à jour");
    } catch (e) {
      toast.error("Impossible d'enregistrer l'objectif");
    } finally {
      setIsSavingObjective(false);
    }
  };

  return (
    <MobileLayout>
      <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/10 pb-20">
        {/* Header */}
        <div className="relative pt-6 pb-5 px-4 mb-4">
          <motion.button
            initial={{ opacity: 0, x: -18 }}
            animate={{ opacity: 1, x: 0 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => navigate(-1)}
            className="absolute left-4 top-6 w-10 h-10 rounded-xl bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl border border-white/20 shadow-sm flex items-center justify-center"
            aria-label="Retour"
          >
            <ChevronLeft size={20} className="text-foreground" />
          </motion.button>

          <div className="text-center">
            <div className="inline-flex items-center gap-2 mb-1">
              <Crown size={18} className="text-primary" />
              <span className="text-xs font-bold text-primary uppercase tracking-wider">
                Finance Pro
              </span>
            </div>
            <h1 className="text-2xl font-bold text-foreground">Tableau de bord</h1>
            <p className="text-xs text-muted-foreground mt-1">
              Vue mensuelle • {monthLabel}
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="px-4 space-y-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-40 rounded-2xl bg-gradient-to-br from-muted/40 to-muted/20 animate-pulse"
              />
            ))}
          </div>
        ) : !stats ? (
          <div className="px-4 py-12">
            <div className="rounded-2xl border border-border/50 bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl p-6 text-center shadow-sm">
              <AlertCircle size={44} className="text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-semibold text-foreground mb-1">
                Impossible d’afficher la finance
              </p>
              <p className="text-xs text-muted-foreground mb-4">
                {isSignaturePaywall
                  ? "Cette section est réservée au plan Signature."
                  : "Vérifie ta connexion et réessaie."}
              </p>

              <div className="flex gap-2">
                <button
                  onClick={loadFinanceData}
                  className="flex-1 py-3 rounded-xl bg-primary text-white font-bold shadow-lg shadow-primary/20 active:scale-[0.98] transition"
                >
                  Réessayer
                </button>

                {isSignaturePaywall && (
                  <button
                    onClick={() => navigate("/pro/subscription")}
                    className="flex-1 py-3 rounded-xl bg-muted text-foreground font-bold border border-border/50 active:scale-[0.98] transition"
                  >
                    Voir les plans
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="px-4 space-y-4">
            {/* KPI principal */}
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary to-primary/90 p-6 shadow-xl"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16" />
              <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full -ml-12 -mb-12" />

              <div className="relative">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-xl flex items-center justify-center">
                      <DollarSign size={20} className="text-white" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-white/70 uppercase tracking-wide">
                        CA • {monthLabel}
                      </p>
                      <p className="text-[11px] text-white/60">
                        Confirmées + terminées
                      </p>
                    </div>
                  </div>

                  <div
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold ${variation === null
                      ? "bg-white/15 text-white"
                      : variation >= 0
                        ? "bg-green-500/20 text-green-100"
                        : "bg-red-500/20 text-red-100"
                      }`}
                    title="Variation vs mois dernier"
                  >
                    <TrendingUp
                      size={12}
                      className={variation !== null && variation < 0 ? "rotate-180" : ""}
                    />
                    {variation === null ? "—" : `${variation >= 0 ? "+" : ""}${variation}%`}
                  </div>
                </div>

                <div className="mb-5">
                  {/* Montant + action */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-4xl font-bold text-white leading-none tracking-tight tabular-nums">
                        {formatCurrency(stats.month)}
                      </p>

                      {/* Objectif sur ligne dédiée (toujours lisible) */}
                      <div className="mt-2 flex items-center gap-2 text-xs text-white/70">
                        <span className="uppercase tracking-wide">Objectif</span>
                        <span className="font-semibold text-white/90 tabular-nums whitespace-nowrap">
                          {stats.objective > 0 ? formatCurrency(stats.objective) : "—"}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={openObjectiveModal}
                      className="shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/15 text-white text-xs font-bold border border-white/15 active:scale-[0.98] transition"
                    >
                      <Target size={14} />
                      {stats.objective > 0 ? "Modifier" : "Définir"}
                      <ChevronRight size={14} className="opacity-80" />
                    </button>
                  </div>

                  {/* Progression (toujours présente => pas de saut) */}
                  <div className="mt-3">
                    <p className="text-xs text-white/70 font-medium min-h-[16px]">
                      {stats.objective > 0 ? `${progress}% de ton objectif atteint` : "Objectif non défini"}
                    </p>

                    <div className="mt-2 h-2 bg-white/20 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${stats.objective > 0 ? progress : 0}%` }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                        className="h-full bg-gradient-to-r from-white to-white/80 rounded-full"
                      />
                    </div>
                  </div>
                </div>


                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white/10 backdrop-blur-xl rounded-xl p-3">
                    <p className="text-[10px] text-white/60 uppercase tracking-wide mb-1">
                      Aujourd'hui
                    </p>
                    <p className="text-lg font-bold text-white">
                      {formatCurrency(stats.today)}
                    </p>
                  </div>
                  <div className="bg-white/10 backdrop-blur-xl rounded-xl p-3">
                    <p className="text-[10px] text-white/60 uppercase tracking-wide mb-1">
                      Mois dernier
                    </p>
                    <p className="text-lg font-bold text-white">
                      {formatCurrency(stats.lastMonth)}
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Prévision */}
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.06 }}
              className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl rounded-2xl border border-white/20 shadow-sm p-5"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-purple-500/20 to-purple-600/10 flex items-center justify-center">
                  <Sparkles size={20} className="text-purple-600 dark:text-purple-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-bold text-foreground">Prévision</h3>
                  <p className="text-xs text-muted-foreground">
                    Estimation fin de mois (au rythme actuel)
                  </p>
                </div>
                <div
                  className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${stats.trend === "up"
                    ? "border-green-200/60 bg-green-50 text-green-700 dark:bg-green-950/20 dark:text-green-300 dark:border-green-800/40"
                    : stats.trend === "down"
                      ? "border-red-200/60 bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-300 dark:border-red-800/40"
                      : "border-border/60 bg-muted/50 text-muted-foreground"
                    }`}
                  title="Tendance"
                >
                  {stats.trend === "up" ? "En hausse" : stats.trend === "down" ? "En baisse" : "Stable"}
                </div>
              </div>

              <div className="bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-950/30 dark:to-purple-900/20 rounded-xl p-4 border border-purple-200/50 dark:border-purple-800/30">
                <p className="text-sm text-muted-foreground mb-2">Projection :</p>
                <p className="text-3xl font-bold text-purple-700 dark:text-purple-300 mb-1">
                  {formatCurrency(stats.forecast)}
                </p>

                {stats.objective > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {stats.forecast >= stats.objective
                      ? `Objectif dépassé de ${formatCurrency(stats.forecast - stats.objective)}`
                      : `Manque ${formatCurrency(stats.objective - stats.forecast)} pour atteindre ton objectif`}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Définis un objectif pour obtenir des conseils adaptés.
                  </p>
                )}
              </div>
            </motion.div>

            {/* Export */}
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 }}
              className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl rounded-2xl border border-white/20 shadow-sm p-5"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-600/10 flex items-center justify-center">
                  <FileDown size={20} className="text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-bold text-foreground">Export comptable</h3>
                  <p className="text-xs text-muted-foreground">Excel prêt pour compta</p>
                </div>
              </div>

              <div className="flex gap-2 mb-4">
                {(["week", "month", "year"] as const).map((period) => (
                  <button
                    key={period}
                    onClick={() => setSelectedPeriod(period)}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all ${selectedPeriod === period
                      ? "bg-primary text-white shadow-lg shadow-primary/20"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted"
                      }`}
                  >
                    {period === "week" ? "Semaine" : period === "month" ? "Mois" : "Année"}
                  </button>
                ))}
              </div>

              <button
                onClick={handleExport}
                disabled={isExporting}
                className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-lg shadow-blue-600/20 disabled:opacity-50 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
              >
                {isExporting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Export en cours...
                  </>
                ) : (
                  <>
                    <Download size={18} />
                    Télécharger Excel
                  </>
                )}
              </button>
            </motion.div>

            {/* Graphiques */}
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18 }}
              className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl rounded-2xl border border-white/20 shadow-sm p-5"
            >
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 flex items-center justify-center">
                    <BarChart3 size={20} className="text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-foreground">Graphiques</h3>
                    <p className="text-xs text-muted-foreground">Comparatif + répartition</p>
                  </div>
                </div>

                <button
                  onClick={() => setChartsOpen((v) => !v)}
                  className="px-3 py-2 rounded-xl bg-muted/60 hover:bg-muted text-foreground text-xs font-bold border border-border/50 transition active:scale-[0.98] inline-flex items-center gap-2"
                >
                  {chartsOpen ? "Masquer" : "Afficher"}
                  <ChevronRight size={14} className={chartsOpen ? "rotate-90 transition" : "transition"} />
                </button>
              </div>

              {!chartsOpen ? (
                <div className="mt-3 rounded-xl border border-border/50 bg-muted/30 p-4">
                  <p className="text-xs text-muted-foreground">
                    Les graphiques se chargent uniquement si tu les ouvres (plus rapide au démarrage).
                  </p>
                </div>
              ) : chartsLoading || !recharts ? (
                <div className="mt-4 space-y-3">
                  <div className="h-44 rounded-xl bg-gradient-to-br from-muted/40 to-muted/20 animate-pulse" />
                  <div className="h-44 rounded-xl bg-gradient-to-br from-muted/40 to-muted/20 animate-pulse" />
                </div>
              ) : (
                (() => {
                  const {
                    ResponsiveContainer,
                    BarChart,
                    Bar,
                    XAxis,
                    YAxis,
                    CartesianGrid,
                    Tooltip,
                    PieChart,
                    Pie,
                    Cell,
                    Legend,
                  } = recharts;

                  const CurrencyTooltip = ({ active, payload, label }: any) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="rounded-xl border border-border/60 bg-background/95 backdrop-blur px-3 py-2 shadow-lg">
                        <p className="text-xs font-semibold text-foreground">{label}</p>
                        <p className="text-xs text-muted-foreground">{formatCurrency(payload[0].value)}</p>
                      </div>
                    );
                  };

                  const selectedBar = barData[selectedBarIndex] ?? barData[0];

                  const pieTotal = pieData.reduce((acc: number, v: any) => acc + (Number(v.value) || 0), 0);
                  const focusedPie =
                    selectedPieIndex !== null ? pieData[selectedPieIndex] : null;

                  return (
                    <div className="mt-4 space-y-4">
                      {/* Bar chart: comparatif */}
                      <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <p className="text-sm font-bold text-foreground">Comparatif rapide</p>
                          <span className="text-[11px] text-muted-foreground">
                            Tap sur une barre
                          </span>
                        </div>

                        <div className="h-48">
                          <ResponsiveContainer width="100%" height="100%" debounce={150}>
                            <BarChart
                              data={barData}
                              margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                              barCategoryGap={14}
                            >
                              <defs>
                                <linearGradient id="kpiBar" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor="#6366F1" stopOpacity={0.95} />
                                  <stop offset="100%" stopColor="#6366F1" stopOpacity={0.55} />
                                </linearGradient>
                                <linearGradient id="kpiBarDim" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor="#6366F1" stopOpacity={0.55} />
                                  <stop offset="100%" stopColor="#6366F1" stopOpacity={0.25} />
                                </linearGradient>
                              </defs>

                              <CartesianGrid strokeDasharray="3 3" opacity={0.22} vertical={false} />
                              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                              <YAxis tick={{ fontSize: 11 }} width={38} />
                              <Tooltip content={<CurrencyTooltip />} />

                              <Bar
                                dataKey="value"
                                radius={[12, 12, 12, 12]}
                                isAnimationActive={false}
                                onClick={(_, idx: number) => setSelectedBarIndex(idx)}
                              >
                                {barData.map((_d: any, idx: number) => (
                                  <Cell
                                    key={idx}
                                    cursor="pointer"
                                    fill={idx === selectedBarIndex ? "url(#kpiBar)" : "url(#kpiBarDim)"}
                                  />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>

                        {/* Détail sélection */}
                        <div className="mt-3 rounded-xl border border-border/50 bg-background/60 p-3">
                          <p className="text-xs text-muted-foreground">Sélection</p>
                          <p className="text-sm font-bold text-foreground">
                            {selectedBar?.name ?? "—"} : {formatCurrency(selectedBar?.value ?? 0)}
                          </p>
                        </div>
                      </div>

                      {/* Pie chart: répartition */}
                      <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <p className="text-sm font-bold text-foreground">Répartition par prestation</p>
                          <span className="text-[11px] text-muted-foreground">
                            Tap sur une part
                          </span>
                        </div>

                        {pieData.length === 0 ? (
                          <div className="rounded-xl border border-border/50 bg-background/60 p-4 text-center">
                            <p className="text-xs text-muted-foreground">
                              Pas assez de données pour afficher la répartition.
                            </p>
                          </div>
                        ) : (
                          <>
                            <div className="h-56">
                              <ResponsiveContainer width="100%" height="100%" debounce={150}>
                                <PieChart>
                                  <Tooltip content={<CurrencyTooltip />} />
                                  <Legend verticalAlign="bottom" height={36} />

                                  <Pie
                                    data={pieData}
                                    dataKey="value"
                                    nameKey="name"
                                    cx="50%"
                                    cy="45%"
                                    outerRadius={78}
                                    innerRadius={44}
                                    isAnimationActive={false}
                                    onClick={(_, idx: number) => setSelectedPieIndex(idx)}
                                  >
                                    {pieData.map((_entry: any, idx: number) => {
                                      const isFocused = selectedPieIndex === idx;
                                      return (
                                        <Cell
                                          key={`cell-${idx}`}
                                          cursor="pointer"
                                          fill={pieColors[idx % pieColors.length]}
                                          opacity={selectedPieIndex === null || isFocused ? 1 : 0.35}
                                          stroke={isFocused ? "rgba(255,255,255,0.9)" : "transparent"}
                                          strokeWidth={isFocused ? 2 : 0}
                                        />
                                      );
                                    })}
                                  </Pie>
                                </PieChart>
                              </ResponsiveContainer>
                            </div>

                            {/* Détail sélection */}
                            <div className="mt-3 rounded-xl border border-border/50 bg-background/60 p-3">
                              {focusedPie ? (
                                <>
                                  <p className="text-xs text-muted-foreground">Prestation</p>
                                  <p className="text-sm font-bold text-foreground">{focusedPie.name}</p>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {formatCurrency(focusedPie.value)} •{" "}
                                    {pieTotal > 0 ? Math.round((focusedPie.value / pieTotal) * 100) : 0}% du total
                                  </p>
                                </>
                              ) : (
                                <>
                                  <p className="text-xs text-muted-foreground">Total analysé</p>
                                  <p className="text-sm font-bold text-foreground">{formatCurrency(pieTotal)}</p>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Sélectionne une part pour voir le détail.
                                  </p>
                                </>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })()
              )}
            </motion.div>

            {/* Prestations rentables */}
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.24 }}
              className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl rounded-2xl border border-white/20 shadow-sm p-5"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-bold text-foreground">Prestations rentables</h3>
                  <p className="text-xs text-muted-foreground">Top 3 du mois</p>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {topServices.length > 0 ? `${topServices.length} éléments` : "—"}
                </div>
              </div>

              {topServices.length === 0 ? (
                <div className="rounded-xl border border-border/50 bg-muted/20 p-4 text-center">
                  <p className="text-xs text-muted-foreground">
                    Aucune prestation à analyser pour le moment.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {topServices.slice(0, 3).map((service: any, index: number) => (
                    <div
                      key={`${service.name}-${index}`}
                      className="relative overflow-hidden rounded-xl bg-gradient-to-br from-muted/30 to-muted/10 p-4 border border-border/50"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                            <span className="text-sm font-bold text-primary">#{index + 1}</span>
                          </div>
                          <div>
                            <p className="text-sm font-bold text-foreground">{service.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {service.count ?? 0} réservations
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-foreground">
                            {formatCurrency(service.revenue ?? 0)}
                          </p>
                          <p className="text-xs text-primary font-semibold">
                            {service.percentage ?? 0}% du CA
                          </p>
                        </div>
                      </div>

                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(Number(service.percentage ?? 0), 100)}%` }}
                          transition={{ duration: 0.6, delay: 0.1 + index * 0.08 }}
                          className="h-full bg-gradient-to-r from-primary to-primary/60 rounded-full"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </div>
        )}

        {/* MODAL OBJECTIF */}
        <Dialog.Root
          open={objectiveOpen}
          onOpenChange={(open) => !isSavingObjective && setObjectiveOpen(open)}
        >
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm" />

            <Dialog.Content
              className="
        fixed z-50 left-1/2 top-1/2 w-[92vw] max-w-md
        -translate-x-1/2 -translate-y-1/2
        rounded-2xl border border-black/10 dark:border-white/10
        bg-white text-neutral-900
        dark:bg-neutral-950 dark:text-neutral-50
        shadow-2xl
        outline-none
      "
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3 p-5 pb-3 border-b border-black/5 dark:border-white/10">
                <div>
                  <Dialog.Title className="text-base font-bold">
                    Objectif mensuel
                  </Dialog.Title>
                  <Dialog.Description className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
                    Mets une cible pour calculer la progression et les conseils.
                  </Dialog.Description>
                </div>

                <Dialog.Close asChild>
                  <button
                    className="
              w-9 h-9 rounded-xl
              bg-neutral-100 hover:bg-neutral-200
              dark:bg-white/10 dark:hover:bg-white/15
              border border-black/5 dark:border-white/10
              flex items-center justify-center
              transition active:scale-[0.98]
            "
                    aria-label="Fermer"
                    disabled={isSavingObjective}
                  >
                    <X size={16} />
                  </button>
                </Dialog.Close>
              </div>

              {/* Body */}
              <div className="p-5 pt-4 space-y-3">
                <label className="text-xs font-semibold">
                  Montant (EUR)
                </label>

                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-neutral-500 dark:text-neutral-400">
                    €
                  </span>

                  <input
                    value={objectiveInput}
                    onChange={(e) => setObjectiveInput(e.target.value)}
                    inputMode="numeric"
                    type="number"
                    min={0}
                    step={1}
                    placeholder="Ex : 3000"
                    className="
              w-full h-12 pl-8 pr-4 rounded-xl
              bg-neutral-50 dark:bg-white/5
              border border-black/10 dark:border-white/10
              focus:outline-none focus:ring-2 focus:ring-primary/40
            "
                    disabled={isSavingObjective}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveObjective();
                    }}
                  />
                </div>

                <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
                  Astuce : commence simple (ex : 3000€) puis ajuste chaque mois.
                </p>

                {/* Presets (chips) */}
                <div className="flex flex-wrap gap-2 pt-1">
                  {[1000, 2000, 3000, 5000, 8000].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setObjectiveInput(String(v))}
                      disabled={isSavingObjective}
                      className="
                px-3 py-2 rounded-xl text-xs font-bold
                bg-neutral-100 hover:bg-neutral-200
                dark:bg-white/10 dark:hover:bg-white/15
                border border-black/5 dark:border-white/10
                transition active:scale-[0.98]
              "
                    >
                      {formatCurrency(v)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Footer */}
              <div className="p-5 pt-0 flex gap-2">
                <Dialog.Close asChild>
                  <button
                    type="button"
                    disabled={isSavingObjective}
                    className="
              flex-1 h-11 rounded-xl font-bold
              bg-neutral-100 hover:bg-neutral-200
              dark:bg-white/10 dark:hover:bg-white/15
              border border-black/5 dark:border-white/10
              transition active:scale-[0.98]
              disabled:opacity-50
            "
                  >
                    Annuler
                  </button>
                </Dialog.Close>

                <button
                  type="button"
                  onClick={saveObjective}
                  disabled={!canSaveObjective || isSavingObjective}
                  className="
            flex-1 h-11 rounded-xl font-bold
            bg-primary text-white
            shadow-lg shadow-primary/20
            transition active:scale-[0.98]
            disabled:opacity-50
            inline-flex items-center justify-center gap-2
          "
                >
                  {isSavingObjective ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Enregistrement…
                    </>
                  ) : (
                    <>
                      <Check size={18} />
                      Enregistrer
                    </>
                  )}
                </button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

      </div>
    </MobileLayout>
  );
};

export default ProFinance;