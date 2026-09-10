import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CreditCard, TrendingUp, Users as UsersIcon, Gift, CalendarClock,
  ArrowUpRight, ArrowDownRight, Repeat, Wallet, Target, XCircle, Inbox,
} from "lucide-react";
import {
  ComposedChart, Area, Line, Bar, BarChart, CartesianGrid, XAxis, YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/admin/PageHeader";
import { KpiCard } from "@/components/admin/KpiCard";
import { EmptyState } from "@/components/admin/EmptyState";
import { ErrorState } from "@/components/admin/ErrorState";
import { ChartCard } from "@/components/admin/ChartCard";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import UserDetailDialog from "@/components/admin/UserDetailDialog";

const API_URL = import.meta.env.VITE_API_URL || "";

const PLAN_LABELS: Record<string, string> = { start: "Start", serenite: "Sérénité", signature: "Signature" };
const SOURCE_LABELS: Record<string, string> = {
  store: "App Store / Play", granted: "Offert", internal: "Interne", seed: "Seed", other: "—",
};

const nf = new Intl.NumberFormat("fr-FR");
// Chiffres financiers — jamais arrondis à l'euro : toujours 2 décimales.
const moneyFmt = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const eur = (v: number | null | undefined) => (v == null ? "—" : moneyFmt.format(v));
const eur2 = eur;
const pctS = (v: number | null | undefined) => (v == null ? "—" : `${v} %`);
const shortMonth = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("fr-FR", { month: "short" });
};
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
  id: number; proId: number; proName: string; email: string; city: string | null;
  profilePhoto: string | null; proStatus: string;
  plan: string; billingType: "monthly" | "one_time";
  monthlyPrice: number; totalPrice: number | null; priceSource?: "store" | "catalog";
  status: "active" | "cancelled" | "pending";
  startDate: string | null; endDate: string | null; source: string; isGranted: boolean;
}
interface SubSummary {
  activeCount: number; activeStore: number; activeFree: number; mrr: number; arr: number;
  byPlan: { start: number; serenite: number; signature: number };
  newThisMonth: number; cancelledThisMonth: number; expiring7d: number;
}
interface Analytics {
  series: { month: string; activeEnd: number; mrrEnd: number; newSubs: number; churned: number }[];
  current: {
    mrr: number; arr: number; activeCount: number; newThisMonth: number; churnedThisMonth: number;
    churnRate: number; grossRetention: number; arpu: number | null; avgLifetimeMonths: number | null; ltv: number | null;
  };
  adoption: { activePros: number; subscribedPros: number; payingPros: number; freePros: number; rate: number };
  planMix: Record<"start" | "serenite" | "signature", { count: number; mrr: number }>;
  cohorts: { cohort: string; pros: number; everSubscribed: number; stillActive: number }[];
}

type StatusFilter = "active" | "cancelled" | "all";

const mrrConfig: ChartConfig = {
  mrrEnd: { label: "MRR (€)", color: "hsl(var(--primary))" },
  activeEnd: { label: "Abonnés", color: "hsl(210 90% 60%)" },
};
const movesConfig: ChartConfig = {
  newSubs: { label: "Nouveaux", color: "hsl(var(--primary))" },
  churned: { label: "Résiliés", color: "hsl(var(--destructive))" },
};

export default function AdminSubscriptions() {
  const [status, setStatus] = useState<StatusFilter>("active");
  const [planFilter, setPlanFilter] = useState<string | null>(null);
  const [months, setMonths] = useState(12);

  const [summary, setSummary] = useState<SubSummary | null>(null);
  const [items, setItems] = useState<SubItem[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [analyticsError, setAnalyticsError] = useState(false);

  const [detailProId, setDetailProId] = useState<number | null>(null);
  const [cancelTarget, setCancelTarget] = useState<SubItem | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const q = new URLSearchParams({ status, limit: "100" });
      if (planFilter) q.set("plan", planFilter);
      const res = await fetch(`${API_URL}/api/admin/subscriptions?${q}`, { credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error();
      setSummary(json.data.summary);
      setItems(json.data.items);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [status, planFilter]);

  const loadAnalytics = useCallback(async () => {
    setAnalyticsError(false);
    try {
      const res = await fetch(`${API_URL}/api/admin/subscriptions/analytics?months=${months}`, { credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error();
      setAnalytics(json.data);
    } catch {
      setAnalyticsError(true);
    }
  }, [months]);

  useEffect(() => { void loadList(); }, [loadList]);
  useEffect(() => { void loadAnalytics(); }, [loadAnalytics]);

  const planTotal = useMemo(
    () => (summary ? summary.byPlan.start + summary.byPlan.serenite + summary.byPlan.signature : 0),
    [summary],
  );

  const chartData = useMemo(
    () => (analytics?.series ?? []).map((s) => ({ ...s, label: shortMonth(s.month) })),
    [analytics],
  );
  const hasSeries = chartData.some((d) => d.activeEnd > 0 || d.newSubs > 0 || d.churned > 0);

  const cur = analytics?.current;
  const mrrTrend = useMemo(() => {
    const s = analytics?.series ?? [];
    if (s.length < 2 || s[s.length - 2].mrrEnd === 0) return null;
    return Math.round(((s[s.length - 1].mrrEnd - s[s.length - 2].mrrEnd) / s[s.length - 2].mrrEnd) * 100);
  }, [analytics]);

  const doCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/users/${cancelTarget.proId}/cancel-subscription`, {
        method: "POST", credentials: "include",
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.message);
      toast.success(
        json.data?.wasStoreSub
          ? "Accès coupé — la facturation App Store continue tant que la pro n'annule pas côté Apple."
          : "Abonnement résilié.",
      );
      setCancelTarget(null);
      void loadList();
      void loadAnalytics();
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Résiliation impossible.");
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Abonnements"
        description="Revenu récurrent des pros — santé, tendances et leviers."
        actions={
          <div className="flex rounded-lg border border-border p-0.5">
            {[6, 12, 24].map((m) => (
              <button
                key={m}
                onClick={() => setMonths(m)}
                className={`rounded-md px-3 py-1 text-xs font-bold ${months === m ? "bg-primary text-white" : "text-muted-foreground"}`}
              >
                {m} mois
              </button>
            ))}
          </div>
        }
      />

      {/* ── KPIs santé ── */}
      {loading && !summary ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-[128px] rounded-2xl" />)}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard icon={TrendingUp} label="Revenu mensuel (MRR)" value={eur(cur?.mrr ?? summary?.mrr)} change={mrrTrend} changeLabel="vs mois -1" emphasis />
          <KpiCard icon={CreditCard} label="Revenu annualisé (ARR)" value={eur(cur?.arr ?? summary?.arr)} />
          <KpiCard icon={UsersIcon} label="Abonnés actifs" value={nf.format(cur?.activeCount ?? summary?.activeCount ?? 0)} />
          <KpiCard icon={Gift} label="Payants / offerts" value={`${nf.format(summary?.activeStore ?? 0)} / ${nf.format(summary?.activeFree ?? 0)}`} />
          <KpiCard icon={XCircle} label="Churn (ce mois)" value={pctS(cur?.churnRate)} />
          <KpiCard icon={Repeat} label="Rétention brute" value={pctS(cur?.grossRetention)} />
          <KpiCard icon={Wallet} label="ARPU" value={eur2(cur?.arpu)} />
          <KpiCard
            icon={Target}
            label="LTV estimée"
            value={eur(cur?.ltv)}
            change={cur?.avgLifetimeMonths != null ? null : undefined}
            changeLabel={cur?.avgLifetimeMonths != null ? `durée de vie ~${cur.avgLifetimeMonths} mois` : undefined}
          />
        </div>
      )}

      {/* ── Charts ── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          icon={TrendingUp}
          title="MRR & abonnés dans le temps"
          description="Estimation reconstituée depuis les dates d'abonnement."
          loading={!analytics && !analyticsError}
          error={analyticsError}
          onRetry={loadAnalytics}
          isEmpty={!!analytics && !hasSeries}
          emptyDescription="Pas encore d'historique d'abonnements."
        >
          <ChartContainer config={mrrConfig} className="h-64 w-full">
            <ComposedChart data={chartData}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
              <YAxis yAxisId="l" tickLine={false} axisLine={false} fontSize={11} width={44} />
              <YAxis yAxisId="r" orientation="right" tickLine={false} axisLine={false} fontSize={11} width={30} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area yAxisId="l" type="monotone" dataKey="mrrEnd" stroke="var(--color-mrrEnd)" fill="var(--color-mrrEnd)" fillOpacity={0.15} strokeWidth={2} />
              <Line yAxisId="r" type="monotone" dataKey="activeEnd" stroke="var(--color-activeEnd)" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ChartContainer>
        </ChartCard>

        <ChartCard
          icon={ArrowUpRight}
          title="Nouveaux vs résiliés / mois"
          loading={!analytics && !analyticsError}
          error={analyticsError}
          onRetry={loadAnalytics}
          isEmpty={!!analytics && !hasSeries}
        >
          <ChartContainer config={movesConfig} className="h-64 w-full">
            <BarChart data={chartData}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
              <YAxis tickLine={false} axisLine={false} fontSize={11} width={28} allowDecimals={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="newSubs" fill="var(--color-newSubs)" radius={4} />
              <Bar dataKey="churned" fill="var(--color-churned)" radius={4} />
            </BarChart>
          </ChartContainer>
        </ChartCard>
      </div>

      {/* ── Mix par formule + adoption + à surveiller ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">MRR par formule</p>
          <div className="mt-4 space-y-3">
            {(["signature", "serenite", "start"] as const).map((p) => {
              const n = summary?.byPlan[p] ?? 0;
              const mrr = analytics?.planMix[p]?.mrr ?? 0;
              const pct = planTotal > 0 ? Math.round((n / planTotal) * 100) : 0;
              return (
                <button key={p} onClick={() => setPlanFilter(planFilter === p ? null : p)} className={`w-full text-left ${planFilter === p ? "" : "hover:opacity-100 opacity-90"}`}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-foreground">{PLAN_LABELS[p]}</span>
                    <span className="text-muted-foreground">{n} · {eur(mrr)}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="p-5 flex flex-col justify-center gap-2">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Adoption</p>
          <p className="text-3xl font-black text-foreground">{pctS(analytics?.adoption.rate)}</p>
          <p className="text-xs text-muted-foreground">
            {analytics?.adoption.subscribedPros ?? 0} pros abonnés / {analytics?.adoption.activePros ?? 0} pros actifs
            <br />
            dont {analytics?.adoption.payingPros ?? 0} payants · {analytics?.adoption.freePros ?? 0} offerts/internes
          </p>
        </Card>

        <Card className="p-5 flex flex-col justify-center gap-1">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Ce mois</p>
          <div className="flex items-center gap-2 text-2xl font-black text-foreground"><ArrowUpRight size={18} className="text-muted-foreground" />{cur?.newThisMonth ?? summary?.newThisMonth ?? 0}<span className="text-sm text-muted-foreground">nouveaux</span></div>
          <div className="flex items-center gap-2 text-2xl font-black text-foreground"><ArrowDownRight size={18} className="text-muted-foreground" />{cur?.churnedThisMonth ?? summary?.cancelledThisMonth ?? 0}<span className="text-sm text-muted-foreground">résiliés</span></div>
          <div className="flex items-center gap-2 text-2xl font-black text-foreground"><CalendarClock size={18} className="text-muted-foreground" />{summary?.expiring7d ?? 0}<span className="text-sm text-muted-foreground">expirent &lt; 7 j</span></div>
        </Card>
      </div>

      {/* ── Cohortes ── */}
      {analytics && analytics.cohorts.length > 0 && (
        <Card className="p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">Cohortes de pros (par mois d'inscription)</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-4">Cohorte</th><th className="pb-2 pr-4">Pros</th>
                  <th className="pb-2 pr-4">Ont pris un abo</th><th className="pb-2 pr-4">Encore actifs</th><th className="pb-2">Rétention</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {analytics.cohorts.map((c) => {
                  const ret = c.everSubscribed > 0 ? Math.round((c.stillActive / c.everSubscribed) * 100) : 0;
                  return (
                    <tr key={c.cohort}>
                      <td className="py-2 pr-4 font-semibold text-foreground">{monthYear(`${c.cohort}-01`)}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{c.pros}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{c.everSubscribed}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{c.stillActive}</td>
                      <td className="py-2 text-muted-foreground">{c.everSubscribed > 0 ? pctS(ret) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Filtres + liste ── */}
      <div className="flex flex-wrap items-center gap-2">
        {(["active", "cancelled", "all"] as StatusFilter[]).map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={`rounded-full px-3.5 py-1.5 text-xs font-bold uppercase tracking-wide transition ${status === s ? "bg-primary text-white" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
            {s === "active" ? "Actifs" : s === "cancelled" ? "Résiliés" : "Tous"}
          </button>
        ))}
        {planFilter && (
          <button onClick={() => setPlanFilter(null)} className="rounded-full px-3.5 py-1.5 text-xs font-bold uppercase tracking-wide bg-primary/15 text-primary">
            {PLAN_LABELS[planFilter]} ✕
          </button>
        )}
      </div>

      {error ? (
        <ErrorState onRetry={loadList} />
      ) : loading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={Inbox} title="Aucun abonnement" description="Rien à afficher pour ce filtre." />
      ) : (
        <Card className="overflow-hidden">
          <div className="divide-y divide-border">
            {items.map((s) => (
              <div key={s.id} className="flex items-center gap-4 p-4">
                <button onClick={() => setDetailProId(s.proId)} className="flex min-w-0 flex-1 items-center gap-4 text-left">
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-muted">
                    {s.profilePhoto ? <img src={s.profilePhoto} alt="" className="h-full w-full object-cover" /> : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-foreground">{s.proName || s.email}</p>
                    <p className="truncate text-xs text-muted-foreground">{s.city ? `${s.city} · ` : ""}{s.email}</p>
                  </div>
                </button>

                <div className="hidden shrink-0 text-center sm:block">
                  <span className="rounded-lg bg-muted px-2 py-1 text-xs font-bold text-foreground">{PLAN_LABELS[s.plan] ?? s.plan}</span>
                  <p className="mt-1 text-[11px] text-muted-foreground">{s.billingType === "monthly" ? "Mensuel" : "Annuel"}</p>
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-sm font-black text-foreground">
                    {s.billingType === "monthly" ? eur(s.monthlyPrice) : eur(s.totalPrice)}
                    <span className="text-[11px] font-medium text-muted-foreground">{s.billingType === "monthly" ? "/mois" : "/an"}</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {s.isGranted ? "Offert" : SOURCE_LABELS[s.source] ?? s.source}
                    {s.priceSource === "catalog" && <span className="ml-1 opacity-70" title="Prix de référence du catalogue Blyss (pas un montant facturé — abo offert, interne ou seed).">· tarif catalogue</span>}
                  </p>
                </div>

                <div className="hidden shrink-0 text-right md:block">
                  <p className="text-[11px] text-muted-foreground">depuis {monthYear(s.startDate)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {s.status === "active" ? (s.endDate ? `renouv. ${dayMonth(s.endDate)}` : "récurrent") : "résilié"}
                  </p>
                </div>

                {s.status === "active" ? (
                  <button
                    onClick={() => setCancelTarget(s)}
                    className="shrink-0 rounded-lg border border-destructive/30 px-2.5 py-1 text-[11px] font-bold text-destructive hover:bg-destructive/10"
                  >
                    Résilier
                  </button>
                ) : (
                  <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold text-muted-foreground">
                    {s.status === "pending" ? "En attente" : "Résilié"}
                  </span>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      <UserDetailDialog
        userId={detailProId}
        open={detailProId != null}
        onOpenChange={(v) => { if (!v) { setDetailProId(null); void loadList(); void loadAnalytics(); } }}
      />

      <ConfirmDialog
        open={cancelTarget != null}
        onOpenChange={(v) => { if (!v) setCancelTarget(null); }}
        title="Résilier cet abonnement ?"
        description={
          cancelTarget?.source === "store"
            ? `${cancelTarget.proName} — abo App Store. La résiliation coupe l'accès Blyss immédiatement, mais Apple continuera de facturer tant que la pro n'annule pas dans l'App Store.`
            : `${cancelTarget?.proName ?? ""} perdra l'accès pro immédiatement.`
        }
        confirmLabel="Résilier"
        loading={cancelling}
        onConfirm={doCancel}
      />
    </div>
  );
}
