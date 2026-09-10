/* eslint-disable @typescript-eslint/no-explicit-any -- réponses de l'API
   analytics v2 : shapes documentées côté backend (admin-analytics.routes.ts)
   et dans docs/analytics-behavior-audit.md. Typage fin non prioritaire ici. */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Users as UsersIcon, Sparkles, Repeat, Clock, TrendingUp, Store,
  Activity, Building2, HeartPulse, ArrowRight, Info,
} from "lucide-react";
import { BarChart, Bar, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/admin/PageHeader";
import { KpiCard } from "@/components/admin/KpiCard";
import { EmptyState } from "@/components/admin/EmptyState";
import { ErrorState } from "@/components/admin/ErrorState";
import { ChartCard } from "@/components/admin/ChartCard";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

const API_URL = import.meta.env.VITE_API_URL || "";
const V2 = `${API_URL}/api/admin/analytics/v2`;

const nf = new Intl.NumberFormat("fr-FR");
const eur = (v: number | null | undefined) => (v == null ? "—" : `${nf.format(Math.round(v))} €`);
const pct = (v: number | null | undefined) => (v == null ? "—" : `${v} %`);
const days = (v: number | null | undefined) => (v == null ? "—" : `${nf.format(v)} j`);
const isoDaysAgo = (d: number) => new Date(Date.now() - d * 86400_000).toISOString().slice(0, 10);
const todayIso = () => new Date().toISOString().slice(0, 10);

type Tab = "clients" | "pros" | "marketplace" | "subscriptions" | "health";

// ── petit hook fetch JSON ───────────────────────────────────────────────────
function useJson<T>(url: string | null): { data: T | null; loading: boolean; error: boolean; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!url) return;
    let alive = true;
    setLoading(true);
    setError(false);
    fetch(url, { credentials: "include" })
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (!j?.success) throw new Error();
        setData(j.data);
      })
      .catch(() => alive && setError(true))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [url, tick]);

  return { data, loading, error, reload: () => setTick((t) => t + 1) };
}

// ── Funnel ──────────────────────────────────────────────────────────────────
interface FunnelStep {
  label: string; count: number; pctOfTop: number; stepConversion: number;
  dropoff?: number; medianDays?: number | null;
}
function Funnel({ steps }: { steps: FunnelStep[] }) {
  return (
    <div className="space-y-2">
      {steps.map((s, i) => (
        <div key={s.label} className="flex items-center gap-3">
          <div className="w-40 shrink-0 text-right text-xs text-muted-foreground">{s.label}</div>
          <div className="relative h-9 flex-1 overflow-hidden rounded-lg bg-muted">
            <div className="h-full rounded-lg bg-primary/80" style={{ width: `${Math.max(s.pctOfTop, 2)}%` }} />
            <div className="absolute inset-0 flex items-center gap-2 px-3 text-xs font-bold text-foreground">
              {nf.format(s.count)}
              <span className="font-medium text-muted-foreground">{s.pctOfTop}%</span>
            </div>
          </div>
          <div className="w-28 shrink-0 text-xs text-muted-foreground">
            {i === 0 ? "—" : (
              <>
                <span className={s.stepConversion < 60 ? "text-destructive font-semibold" : ""}>{s.stepConversion}%</span>
                {s.medianDays != null && <span className="ml-1 opacity-70">· {s.medianDays}j</span>}
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Cohort heatmap ──────────────────────────────────────────────────────────
interface Cohort {
  cohort: string;
  size: number;
  retention: Record<number, { retained: number; pct: number }>;
}
function CohortGrid({ cohorts, maxIndex = 12 }: { cohorts: Cohort[]; maxIndex?: number }) {
  const cols = useMemo(() => {
    let m = 0;
    for (const c of cohorts) for (const k of Object.keys(c.retention)) m = Math.max(m, Number(k));
    return Math.min(maxIndex, m);
  }, [cohorts, maxIndex]);

  if (!cohorts.length) return <EmptyState icon={UsersIcon} title="Pas encore de cohortes" description="Aucune donnée sur la fenêtre." />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-1 text-xs">
        <thead>
          <tr className="text-muted-foreground">
            <th className="px-2 py-1 text-left font-semibold">Cohorte</th>
            <th className="px-2 py-1 text-right font-semibold">Taille</th>
            {Array.from({ length: cols + 1 }, (_, k) => (
              <th key={k} className="px-2 py-1 text-center font-semibold">M{k}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cohorts.map((c) => (
            <tr key={c.cohort}>
              <td className="px-2 py-1 font-semibold text-foreground">{c.cohort}</td>
              <td className="px-2 py-1 text-right text-muted-foreground">{c.size}</td>
              {Array.from({ length: cols + 1 }, (_, k) => {
                const cell = c.retention[k];
                return (
                  <td
                    key={k}
                    className="rounded px-2 py-1 text-center tabular-nums"
                    style={cell ? { backgroundColor: `hsl(var(--primary) / ${0.08 + (cell.pct / 100) * 0.6})`, color: cell.pct > 55 ? "white" : undefined } : undefined}
                  >
                    {cell ? `${cell.pct}%` : ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-center gap-2">
      <h2 className="text-lg font-bold text-foreground">{children}</h2>
      {hint && (
        <span className="group relative">
          <Info size={14} className="text-muted-foreground" />
          <span className="pointer-events-none absolute left-5 top-0 z-10 hidden w-64 rounded-lg border border-border bg-popover p-2 text-xs text-muted-foreground shadow-lg group-hover:block">
            {hint}
          </span>
        </span>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TAB : CLIENTES
// ════════════════════════════════════════════════════════════════════════════
function ClientsTab({ qs }: { qs: string }) {
  const kpis = useJson<any>(`${V2}/clients/kpis?${qs}`);
  const funnel = useJson<any>(`${V2}/clients/funnel?${qs}`);
  const cohorts = useJson<any>(`${V2}/clients/cohorts?months=12`);

  return (
    <div className="space-y-8">
      {kpis.loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-[128px] rounded-2xl" />)}</div>
      ) : kpis.error ? <ErrorState onRetry={kpis.reload} /> : kpis.data && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard icon={UsersIcon} label="Clientes actives (transac.)" value={nf.format(kpis.data.activeClients.value)} change={kpis.data.activeClients.change} changeLabel="vs période précéd." emphasis />
          <KpiCard icon={Sparkles} label="Nouvelles clientes" value={nf.format(kpis.data.newClients.value)} change={kpis.data.newClients.change} changeLabel="vs période précéd." />
          <KpiCard icon={TrendingUp} label="Réservations" value={nf.format(kpis.data.bookings.value)} change={kpis.data.bookings.change} changeLabel="vs période précéd." />
          <KpiCard icon={TrendingUp} label="GMV période" value={eur(kpis.data.gmv)} />
          <KpiCard icon={Repeat} label="Repeat booking rate" value={pct(kpis.data.repeatBookingRate.value)} changeLabel={`${kpis.data.repeatBookingRate.n} clientes`} change={null} />
          <KpiCard icon={TrendingUp} label="Résas / cliente (moy.)" value={nf.format(kpis.data.avgBookingsPerClient)} />
          <KpiCard icon={Clock} label="Délai médian → 2ᵉ résa" value={days(kpis.data.medianDaysToSecondBooking)} />
          <KpiCard icon={Clock} label="Délai médian entre résas" value={days(kpis.data.medianDaysBetweenBookings)} />
        </div>
      )}

      <Card className="p-5 sm:p-6">
        <SectionTitle hint={funnel.data?.note}>Funnel d'activation cliente</SectionTitle>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">Clientes inscrites sur la période — progression cumulée (lifetime).</p>
        {funnel.loading ? <Skeleton className="h-64 w-full" /> : funnel.error ? <ErrorState onRetry={funnel.reload} /> : funnel.data && <Funnel steps={funnel.data.steps} />}
      </Card>

      <Card className="p-5 sm:p-6">
        <SectionTitle hint={cohorts.data?.definition}>Cohortes clientes — rétention</SectionTitle>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">Par mois de 1re réservation. Une cellule = % de la cohorte ayant réservé ce mois-là.</p>
        {cohorts.loading ? <Skeleton className="h-64 w-full" /> : cohorts.error ? <ErrorState onRetry={cohorts.reload} /> : cohorts.data && <CohortGrid cohorts={cohorts.data.cohorts} />}
      </Card>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TAB : PROS
// ════════════════════════════════════════════════════════════════════════════
const SORT_LABELS: Record<string, string> = { score: "Score", revenue: "CA", bookings: "Réservations", fill: "Remplissage", clients: "Clientes" };

function ProsTab({ qs }: { qs: string }) {
  const [sort, setSort] = useState("score");
  const kpis = useJson<any>(`${V2}/pros/kpis?${qs}`);
  const funnel = useJson<any>(`${V2}/pros/funnel?${qs}`);
  const activity = useJson<any>(`${V2}/pros/activity?${qs}&sort=${sort}&limit=100`);
  const cohorts = useJson<any>(`${V2}/pros/cohorts?months=12`);
  const services = useJson<any>(`${V2}/pros/services?${qs}`);

  const fc = kpis.data?.funnelCounts;

  return (
    <div className="space-y-8">
      {kpis.loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[128px] rounded-2xl" />)}</div>
      ) : kpis.error ? <ErrorState onRetry={kpis.reload} /> : kpis.data && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard icon={Building2} label="Pros au total" value={nf.format(kpis.data.totalPros)} emphasis />
          <KpiCard icon={Activity} label="Statut actif" value={nf.format(kpis.data.activeStatusPros)} />
          <KpiCard icon={Sparkles} label="Nouvelles pros" value={nf.format(kpis.data.newPros)} />
          <KpiCard icon={TrendingUp} label="Taux de remplissage moy." value={pct(kpis.data.avgFillRate)} />
          <KpiCard icon={Clock} label="Time to 1re résa (médiane)" value={days(kpis.data.timeToFirstBooking.median)} changeLabel={`P25 ${days(kpis.data.timeToFirstBooking.p25)} · P75 ${days(kpis.data.timeToFirstBooking.p75)}`} change={null} />
          <KpiCard icon={UsersIcon} label="Pros avec ≥ 1 résa" value={fc ? `${nf.format(fc.withBooking)} / ${nf.format(kpis.data.totalPros)}` : "—"} />
        </div>
      )}

      <Card className="p-5 sm:p-6">
        <SectionTitle>Funnel d'activation pro</SectionTitle>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">Pros inscrites sur la période. Colonne de droite : conversion d'étape · délai médian.</p>
        {funnel.loading ? <Skeleton className="h-64 w-full" /> : funnel.error ? <ErrorState onRetry={funnel.reload} /> : funnel.data && <Funnel steps={funnel.data.steps} />}
      </Card>

      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionTitle hint={activity.data?.scoreFormula}>Activité par pro</SectionTitle>
          <div className="flex gap-1 rounded-lg border border-border p-0.5">
            {Object.entries(SORT_LABELS).map(([k, l]) => (
              <button key={k} onClick={() => setSort(k)} className={`rounded-md px-2.5 py-1 text-xs font-bold ${sort === k ? "bg-primary text-white" : "text-muted-foreground"}`}>{l}</button>
            ))}
          </div>
        </div>
        <div className="mt-4 overflow-x-auto">
          {activity.loading ? <Skeleton className="h-64 w-full" /> : activity.error ? <ErrorState onRetry={activity.reload} /> : activity.data && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-3">Pro</th><th className="pb-2 pr-3 text-right">Score</th>
                  <th className="pb-2 pr-3 text-right">Résas</th><th className="pb-2 pr-3 text-right">Acceptées</th>
                  <th className="pb-2 pr-3 text-right">Annul.</th><th className="pb-2 pr-3 text-right">No-show</th>
                  <th className="pb-2 pr-3 text-right">Clientes</th><th className="pb-2 pr-3 text-right">Nouv.</th>
                  <th className="pb-2 pr-3 text-right">Remplissage</th><th className="pb-2 text-right">CA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {activity.data.items.map((p: any) => (
                  <tr key={p.proId}>
                    <td className="py-2 pr-3 font-semibold text-foreground">{p.proName}{p.city ? <span className="ml-1 font-normal text-muted-foreground">· {p.city}</span> : null}</td>
                    <td className="py-2 pr-3 text-right font-bold">{p.activityScore}</td>
                    <td className="py-2 pr-3 text-right">{p.bookingsReceived}</td>
                    <td className="py-2 pr-3 text-right text-muted-foreground">{p.bookingsAccepted}</td>
                    <td className="py-2 pr-3 text-right text-muted-foreground">{p.bookingsCancelled}</td>
                    <td className="py-2 pr-3 text-right text-muted-foreground">{p.noShows}</td>
                    <td className="py-2 pr-3 text-right">{p.uniqueClients}</td>
                    <td className="py-2 pr-3 text-right text-muted-foreground">{p.newClients}</td>
                    <td className="py-2 pr-3 text-right">{p.fillRate == null ? "—" : `${p.fillRate}%`}</td>
                    <td className="py-2 text-right font-semibold">{eur(p.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5 sm:p-6">
          <SectionTitle hint={cohorts.data?.definition}>Cohortes pros — rétention</SectionTitle>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">Par mois d'inscription. % ayant reçu ≥ 1 résa ce mois-là.</p>
          {cohorts.loading ? <Skeleton className="h-56 w-full" /> : cohorts.error ? <ErrorState onRetry={cohorts.reload} /> : cohorts.data && <CohortGrid cohorts={cohorts.data.cohorts} />}
        </Card>

        <Card className="p-5 sm:p-6">
          <SectionTitle hint={services.data?.note}>Prestations</SectionTitle>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">Top prestations par CA sur la période.</p>
          <div className="overflow-x-auto">
            {services.loading ? <Skeleton className="h-56 w-full" /> : services.error ? <ErrorState onRetry={services.reload} /> : services.data && (
              services.data.items.length === 0 ? <EmptyState icon={Activity} title="Aucune prestation réservée" description="Sur cette période." /> : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="pb-2 pr-3">Prestation</th><th className="pb-2 pr-3 text-right">Résas</th>
                      <th className="pb-2 pr-3 text-right">Prix</th><th className="pb-2 text-right">CA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {services.data.items.slice(0, 15).map((s: any) => (
                      <tr key={s.id}>
                        <td className="py-2 pr-3 font-medium text-foreground">{s.name}</td>
                        <td className="py-2 pr-3 text-right">{s.bookings}</td>
                        <td className="py-2 pr-3 text-right text-muted-foreground">{eur(s.price)}</td>
                        <td className="py-2 text-right font-semibold">{eur(s.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TAB : MARKETPLACE
// ════════════════════════════════════════════════════════════════════════════
function MarketplaceTab({ qs }: { qs: string }) {
  const m = useJson<any>(`${V2}/marketplace?${qs}`);

  const chartConfig: ChartConfig = {
    pros: { label: "Pros", color: "hsl(210 90% 60%)" },
    demand: { label: "Demande", color: "hsl(var(--primary))" },
  };

  return (
    <div className="space-y-8">
      {m.loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[128px] rounded-2xl" />)}</div>
      ) : m.error ? <ErrorState onRetry={m.reload} /> : m.data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard icon={Store} label="Pros actives" value={nf.format(m.data.supply.activePros)} emphasis />
            <KpiCard icon={Building2} label="Pros réservables" value={nf.format(m.data.supply.bookablePros)} changeLabel="profil public + presta + dispos" change={null} />
            <KpiCard icon={UsersIcon} label="Clientes actives (période)" value={nf.format(m.data.demand.activeClients)} />
            <KpiCard icon={TrendingUp} label="Réservations (période)" value={nf.format(m.data.demand.bookings)} />
            <KpiCard icon={Activity} label="Pros avec ≥ 1 résa" value={pct(m.data.matching.prosWithBookingRate.value)} changeLabel={`${m.data.matching.prosWithBookingRate.n} pros`} change={null} />
            <KpiCard icon={Activity} label="Clientes ayant réservé" value={pct(m.data.matching.clientsWithBookingRate.value)} changeLabel={`${m.data.matching.clientsWithBookingRate.n} clientes`} change={null} />
            <KpiCard icon={Repeat} label="Ratio offre / demande" value={m.data.matching.supplyDemandRatio == null ? "—" : nf.format(m.data.matching.supplyDemandRatio)} changeLabel="pros réservables / cliente active" change={null} />
          </div>

          <ChartCard icon={Building2} title="Offre vs demande par ville" description={m.data.notes} isEmpty={!m.data.byCity.length}>
            <ChartContainer config={chartConfig} className="h-72 w-full">
              <BarChart data={m.data.byCity.slice(0, 12)}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="city" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis tickLine={false} axisLine={false} fontSize={11} width={28} allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="pros" fill="var(--color-pros)" radius={4} />
                <Bar dataKey="demand" fill="var(--color-demand)" radius={4} />
              </BarChart>
            </ChartContainer>
          </ChartCard>

          <Card className="p-5 sm:p-6">
            <SectionTitle hint={m.data.notes}>Villes — offre, demande, écart</SectionTitle>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-3">Ville</th><th className="pb-2 pr-3 text-right">Pros</th>
                    <th className="pb-2 pr-3 text-right">Demande</th><th className="pb-2 pr-3 text-right">Résas période</th>
                    <th className="pb-2 text-right">Écart (dem. − pros)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {m.data.byCity.map((c: any) => (
                    <tr key={c.city}>
                      <td className="py-2 pr-3 font-semibold capitalize text-foreground">{c.city}</td>
                      <td className="py-2 pr-3 text-right">{c.pros}</td>
                      <td className="py-2 pr-3 text-right">{c.demand}</td>
                      <td className="py-2 pr-3 text-right text-muted-foreground">{c.bookings}</td>
                      <td className={`py-2 text-right font-semibold ${c.gap > 0 ? "text-destructive" : "text-muted-foreground"}`}>{c.gap > 0 ? `+${c.gap}` : c.gap}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TAB : ABONNEMENTS (approfondissement)
// ════════════════════════════════════════════════════════════════════════════
const STORE_LABELS: Record<string, string> = {
  app_store: "App Store (iOS)", mac_app_store: "Mac App Store", play_store: "Play Store (Android)",
  amazon: "Amazon", stripe: "Stripe", promotional: "Offert", unknown: "Inconnu",
};
function SubscriptionsTab() {
  const d = useJson<any>(`${V2}/subscriptions/deep?months=12`);

  return (
    <div className="space-y-8">
      {d.loading ? <div className="grid gap-4 lg:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}</div>
        : d.error ? <ErrorState onRetry={d.reload} /> : d.data && (
        <>
          <p className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            <Info size={14} className="mt-0.5 shrink-0" /> {d.data.disclaimer}
          </p>

          <Card className="p-5 sm:p-6">
            <SectionTitle hint={d.data.storeMix.note}>Répartition par plateforme</SectionTitle>
            <div className="mt-4 space-y-3">
              {d.data.storeMix.items.map((s: any) => (
                <div key={s.store}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-foreground">{STORE_LABELS[s.store] ?? s.store}</span>
                    <span className="text-muted-foreground">{s.active} actifs · {s.pct}% · {eur(s.mrr)} MRR</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${s.pct}%` }} /></div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5 sm:p-6">
            <SectionTitle>Churn par ancienneté</SectionTitle>
            <p className="mt-1 mb-4 text-sm text-muted-foreground">À quel âge les abonnés résilient. Base = résiliés + encore actifs dans la tranche.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-3">Ancienneté</th><th className="pb-2 pr-3 text-right">Résiliés</th>
                  <th className="pb-2 pr-3 text-right">Encore actifs</th><th className="pb-2 text-right">Taux de churn</th>
                </tr></thead>
                <tbody className="divide-y divide-border">
                  {d.data.churnByTenure.map((b: any) => (
                    <tr key={b.bucket}>
                      <td className="py-2 pr-3 font-semibold text-foreground">{b.bucket}</td>
                      <td className="py-2 pr-3 text-right">{b.churned}</td>
                      <td className="py-2 pr-3 text-right text-muted-foreground">{b.active}</td>
                      <td className="py-2 text-right font-semibold">{b.churnRate == null ? "—" : `${b.churnRate}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="p-5 sm:p-6">
            <SectionTitle>Cohortes d'abonnement — survie</SectionTitle>
            <p className="mt-1 mb-4 text-sm text-muted-foreground">Par mois de souscription. % encore abonnés à M+k.</p>
            <CohortGrid cohorts={d.data.cohorts} />
          </Card>
        </>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TAB : SANTÉ DATA
// ════════════════════════════════════════════════════════════════════════════
const STATUS_STYLE: Record<string, string> = {
  real: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  computed: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  estimated: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  unavailable: "bg-muted text-muted-foreground",
};
function HealthTab() {
  const h = useJson<any>(`${V2}/data-health`);
  return (
    <div className="space-y-6">
      {h.loading ? <Skeleton className="h-96 w-full" /> : h.error ? <ErrorState onRetry={h.reload} /> : h.data && (
        <>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {Object.entries(h.data.volumes).map(([k, v]) => (
              <Card key={k} className="p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{k}</p>
                <p className="mt-1 text-2xl font-black text-foreground">{nf.format(v as number)}</p>
              </Card>
            ))}
          </div>

          <Card className="p-5 sm:p-6">
            <SectionTitle>Fiabilité des métriques</SectionTitle>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
              {Object.entries(h.data.legend).map(([k, v]) => (
                <span key={k} className="flex items-center gap-1.5">
                  <span className={`rounded px-1.5 py-0.5 font-bold ${STATUS_STYLE[k]}`}>{k}</span> {v as string}
                </span>
              ))}
            </div>
            <div className="mt-4 space-y-2">
              {h.data.metrics.map((m: any, i: number) => (
                <div key={i} className="flex flex-col gap-1 border-b border-border pb-2 last:border-0 sm:flex-row sm:items-center sm:gap-3">
                  <span className={`w-24 shrink-0 rounded px-1.5 py-0.5 text-center text-xs font-bold ${STATUS_STYLE[m.status]}`}>{m.status}</span>
                  <span className="flex-1 text-sm text-foreground">{m.metric}</span>
                  {m.missing && <span className="text-xs text-muted-foreground">manque : {m.missing.join(", ")}</span>}
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
export default function AdminBehavior() {
  const [tab, setTab] = useState<Tab>("clients");
  const [from, setFrom] = useState(isoDaysAgo(30));
  const [to, setTo] = useState(todayIso());
  const [city, setCity] = useState("");

  const qs = useMemo(() => {
    const p = new URLSearchParams({ from, to });
    if (city.trim()) p.set("city", city.trim());
    return p.toString();
  }, [from, to, city]);

  const setPreset = useCallback((d: number) => { setFrom(isoDaysAgo(d)); setTo(todayIso()); }, []);

  const TABS: { key: Tab; label: string; icon: typeof UsersIcon }[] = [
    { key: "clients", label: "Clientes", icon: UsersIcon },
    { key: "pros", label: "Professionnelles", icon: Building2 },
    { key: "marketplace", label: "Marketplace", icon: Store },
    { key: "subscriptions", label: "Abonnements", icon: TrendingUp },
    { key: "health", label: "Santé data", icon: HeartPulse },
  ];

  const showRange = tab !== "subscriptions" && tab !== "health";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Comportement"
        description="Comment clientes et pros utilisent l'app — et ce qui convertit, retient, fait churner."
        actions={
          showRange && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg border border-border p-0.5">
                {[7, 30, 90].map((d) => (
                  <button key={d} onClick={() => setPreset(d)} className={`rounded-md px-2.5 py-1 text-xs font-bold ${from === isoDaysAgo(d) && to === todayIso() ? "bg-primary text-white" : "text-muted-foreground"}`}>{d}j</button>
                ))}
              </div>
              <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-border bg-card px-2 py-1 text-xs" />
              <span className="text-muted-foreground">→</span>
              <input type="date" value={to} min={from} max={todayIso()} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-border bg-card px-2 py-1 text-xs" />
              <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ville…" className="w-24 rounded-lg border border-border bg-card px-2 py-1 text-xs" />
            </div>
          )
        }
      />

      <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              aria-pressed={tab === t.key}
              className={`flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition-colors ${tab === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Icon size={14} aria-hidden="true" /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "clients" && <ClientsTab qs={qs} />}
      {tab === "pros" && <ProsTab qs={qs} />}
      {tab === "marketplace" && <MarketplaceTab qs={qs} />}
      {tab === "subscriptions" && <SubscriptionsTab />}
      {tab === "health" && <HealthTab />}

      <p className="flex items-center gap-1.5 pt-2 text-xs text-muted-foreground">
        <ArrowRight size={12} /> Le haut du funnel (recherche, vues de profil, sessions) et l'attribution par canal demandent une instrumentation d'events — voir l'onglet « Santé data ».
      </p>
    </div>
  );
}
