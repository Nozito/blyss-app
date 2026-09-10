import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CreditCard,
  TrendingUp,
  Users as UsersIcon,
  Gift,
  CalendarClock,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/admin/PageHeader";
import { KpiCard } from "@/components/admin/KpiCard";
import { EmptyState } from "@/components/admin/EmptyState";
import { ErrorState } from "@/components/admin/ErrorState";

const API_URL = import.meta.env.VITE_API_URL || "";

const PLAN_LABELS: Record<string, string> = { start: "Start", serenite: "Sérénité", signature: "Signature" };
const SOURCE_LABELS: Record<string, string> = {
  store: "App Store / Play",
  granted: "Offert",
  internal: "Interne",
  seed: "Seed",
  other: "—",
};

const nf = new Intl.NumberFormat("fr-FR");
const eur = (v: number | null | undefined) =>
  v == null ? "—" : `${nf.format(Math.round(v))} €`;

const monthYear = (d: string | null) => {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString("fr-FR", { month: "short", year: "numeric" });
};
const dayMonth = (d: string | null) => {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
};

interface SubItem {
  id: number;
  proId: number;
  proName: string;
  email: string;
  city: string | null;
  profilePhoto: string | null;
  proStatus: string;
  plan: string;
  billingType: "monthly" | "one_time";
  monthlyPrice: number;
  totalPrice: number | null;
  status: "active" | "cancelled" | "pending";
  startDate: string | null;
  endDate: string | null;
  source: string;
  isGranted: boolean;
}

interface SubSummary {
  activeCount: number;
  activeStore: number;
  activeFree: number;
  mrr: number;
  arr: number;
  byPlan: { start: number; serenite: number; signature: number };
  newThisMonth: number;
  cancelledThisMonth: number;
  expiring7d: number;
}

type StatusFilter = "active" | "cancelled" | "all";

export default function AdminSubscriptions() {
  const [status, setStatus] = useState<StatusFilter>("active");
  const [planFilter, setPlanFilter] = useState<string | null>(null);
  const [summary, setSummary] = useState<SubSummary | null>(null);
  const [items, setItems] = useState<SubItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const q = new URLSearchParams({ status, limit: "100" });
      if (planFilter) q.set("plan", planFilter);
      const res = await fetch(`${API_URL}/api/admin/subscriptions?${q}`, { credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.message ?? "Erreur");
      setSummary(json.data.summary);
      setItems(json.data.items);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [status, planFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const planTotal = useMemo(
    () => (summary ? summary.byPlan.start + summary.byPlan.serenite + summary.byPlan.signature : 0),
    [summary],
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="Abonnements"
        description="Revenu récurrent des pros — abos App Store / Play, offerts et internes."
      />

      {/* ── KPIs ── */}
      {loading && !summary ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[128px] rounded-2xl" />
          ))}
        </div>
      ) : summary ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            icon={TrendingUp}
            label="Revenu mensuel (MRR)"
            value={eur(summary.mrr)}
            emphasis
          />
          <KpiCard icon={CreditCard} label="Revenu annualisé (ARR)" value={eur(summary.arr)} />
          <KpiCard
            icon={UsersIcon}
            label="Abonnés actifs"
            value={nf.format(summary.activeCount)}
            change={undefined}
          />
          <KpiCard
            icon={Gift}
            label="Payants / offerts"
            value={`${nf.format(summary.activeStore)} / ${nf.format(summary.activeFree)}`}
          />
        </div>
      ) : null}

      {/* ── Répartition plan + mouvements ── */}
      {summary && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Répartition par formule</p>
            <div className="mt-4 space-y-3">
              {(["signature", "serenite", "start"] as const).map((p) => {
                const n = summary.byPlan[p];
                const pct = planTotal > 0 ? Math.round((n / planTotal) * 100) : 0;
                return (
                  <button
                    key={p}
                    onClick={() => setPlanFilter(planFilter === p ? null : p)}
                    className={`w-full text-left ${planFilter === p ? "opacity-100" : "opacity-90 hover:opacity-100"}`}
                  >
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold text-foreground">{PLAN_LABELS[p]}</span>
                      <span className="text-muted-foreground">{n} · {pct}%</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card className="p-5 flex flex-col justify-center gap-1">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Ce mois</p>
            <div className="mt-2 flex items-center gap-2 text-2xl font-black text-foreground">
              <ArrowUpRight size={18} className="text-muted-foreground" />
              {summary.newThisMonth}
              <span className="text-sm font-semibold text-muted-foreground">nouveaux</span>
            </div>
            <div className="flex items-center gap-2 text-2xl font-black text-foreground">
              <ArrowDownRight size={18} className="text-muted-foreground" />
              {summary.cancelledThisMonth}
              <span className="text-sm font-semibold text-muted-foreground">résiliés</span>
            </div>
          </Card>

          <Card className="p-5 flex flex-col justify-center gap-1">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">À surveiller</p>
            <div className="mt-2 flex items-center gap-2 text-2xl font-black text-foreground">
              <CalendarClock size={18} className="text-muted-foreground" />
              {summary.expiring7d}
              <span className="text-sm font-semibold text-muted-foreground">expirent &lt; 7 j</span>
            </div>
          </Card>
        </div>
      )}

      {/* ── Filtres statut ── */}
      <div className="flex flex-wrap items-center gap-2">
        {(["active", "cancelled", "all"] as StatusFilter[]).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-bold uppercase tracking-wide transition ${
              status === s ? "bg-primary text-white" : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {s === "active" ? "Actifs" : s === "cancelled" ? "Résiliés" : "Tous"}
          </button>
        ))}
        {planFilter && (
          <button
            onClick={() => setPlanFilter(null)}
            className="rounded-full px-3.5 py-1.5 text-xs font-bold uppercase tracking-wide bg-primary/15 text-primary"
          >
            {PLAN_LABELS[planFilter]} ✕
          </button>
        )}
      </div>

      {/* ── Liste ── */}
      {error ? (
        <ErrorState onRetry={load} />
      ) : loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState title="Aucun abonnement" description="Rien à afficher pour ce filtre." />
      ) : (
        <Card className="overflow-hidden">
          <div className="divide-y divide-border">
            {items.map((s) => (
              <div key={s.id} className="flex items-center gap-4 p-4">
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-muted">
                  {s.profilePhoto ? (
                    <img src={s.profilePhoto} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-foreground">{s.proName || s.email}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {s.city ? `${s.city} · ` : ""}{s.email}
                  </p>
                </div>

                <div className="hidden shrink-0 text-center sm:block">
                  <span className="rounded-lg bg-muted px-2 py-1 text-xs font-bold text-foreground">
                    {PLAN_LABELS[s.plan] ?? s.plan}
                  </span>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {s.billingType === "monthly" ? "Mensuel" : "Annuel"}
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-sm font-black text-foreground">
                    {s.billingType === "monthly" ? eur(s.monthlyPrice) : eur(s.totalPrice)}
                    <span className="text-[11px] font-medium text-muted-foreground">
                      {s.billingType === "monthly" ? "/mois" : "/an"}
                    </span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {s.isGranted ? "Offert" : SOURCE_LABELS[s.source] ?? s.source}
                  </p>
                </div>

                <div className="hidden shrink-0 text-right md:block">
                  <p className="text-[11px] text-muted-foreground">depuis {monthYear(s.startDate)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {s.status === "active"
                      ? s.endDate
                        ? `renouv. ${dayMonth(s.endDate)}`
                        : "récurrent"
                      : `résilié`}
                  </p>
                </div>

                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                    s.status === "active"
                      ? "bg-emerald-500/15 text-emerald-500"
                      : s.status === "pending"
                        ? "bg-amber-500/15 text-amber-500"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {s.status === "active" ? "Actif" : s.status === "pending" ? "En attente" : "Résilié"}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
