import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Gift, ShieldAlert, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

const API_URL = import.meta.env.VITE_API_URL || "";

const PLAN_LABELS: Record<string, string> = { start: "Start", serenite: "Sérénité", signature: "Signature" };
const PLAN_OPTS = ["start", "serenite", "signature"] as const;
const MONTHS_OPTS = [1, 3, 6, 12];

const nf = new Intl.NumberFormat("fr-FR");
const eur = (v: number | null | undefined) =>
  v == null ? "—" : `${nf.format(Math.round(v))} €`;
const pct = (v: number | null | undefined) => (v == null ? "—" : `${nf.format(v)} %`);

interface ProActivity {
  reviews: { avg: number | null; count: number };
  bookings: {
    total: number; completed: number; cancelled: number; confirmed: number;
    gmv_total: number; gmv_month: number; cancellation_rate: number; completion_rate: number;
  };
  clients: { distinct: number; recurring: number };
  subscription: { plan: string; status: string; end_date: string | null; is_granted: boolean } | null;
}

interface UserDetail {
  id: number;
  first_name: string; last_name: string; email: string; phone_number?: string;
  role: "client" | "pro"; is_admin: boolean; is_active: boolean; created_at: string;
  activity_name?: string | null; city?: string | null; pro_status?: string | null; is_verified?: boolean;
  stats?: { total_bookings: number; completed: number; cancelled: number; total_spent: number };
  pro_activity?: ProActivity | null;
  subscription_history?: Array<{ id: number; plan: string; start_date: string; status: string }>;
  reports?: {
    against: Array<{ id: number; reason: string | null; reason_code: string; status: string; outcome: string | null; created_at: string }>;
    made: Array<{ id: number; reason: string | null; reason_code: string; status: string; outcome: string | null; created_at: string }>;
    reported_count: number; is_vigilant: boolean;
    made_total: number; made_abusive_count: number; is_abusive_reporter: boolean;
  };
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className="admin-display mt-1 text-2xl text-foreground">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

export default function UserDetailDialog({
  userId,
  open,
  onOpenChange,
}: {
  userId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [grantOpen, setGrantOpen] = useState(false);
  const [plan, setPlan] = useState<(typeof PLAN_OPTS)[number]>("serenite");
  const [months, setMonths] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-user", userId],
    enabled: open && userId != null,
    queryFn: async (): Promise<UserDetail> => {
      const r = await fetch(`${API_URL}/api/admin/users/${userId}`, { credentials: "include" });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j?.error ?? "Erreur");
      return j.data;
    },
  });

  const grantMut = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${API_URL}/api/admin/users/${userId}/grant-subscription`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ plan, months }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j?.error ?? "Erreur");
    },
    onSuccess: () => {
      toast.success("Abonnement accordé");
      setGrantOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-user", userId] });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: () => toast.error("Impossible d'accorder l'abonnement"),
  });

  const u = data;
  const pa = u?.pro_activity ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="admin-theme max-w-xl w-full max-h-[90vh] overflow-hidden p-0 gap-0 border-border">
        {isLoading || !u ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Chargement…</div>
        ) : (
          <ScrollArea className="max-h-[90vh]">
            {/* Header */}
            <div className="border-b border-border p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="admin-display text-2xl text-foreground">{u.first_name} {u.last_name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{u.email}{u.phone_number ? ` · ${u.phone_number}` : ""}</p>
                </div>
                <button onClick={() => onOpenChange(false)} className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-foreground">
                  <X size={16} />
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge variant="outline">{u.is_admin ? "Admin" : u.role === "pro" ? "Pro" : "Client"}</Badge>
                {u.activity_name && <Badge variant="outline">{u.activity_name}</Badge>}
                {u.city && <Badge variant="outline">{u.city}</Badge>}
                {!u.is_active && <Badge variant="destructive">Banni</Badge>}
                {u.reports?.is_vigilant && <Badge variant="destructive">Vigilance · {u.reports.reported_count}</Badge>}
                {u.reports?.is_abusive_reporter && <Badge variant="destructive">Reporter à risque</Badge>}
              </div>
            </div>

            <div className="space-y-6 p-6">
              {/* Activité pro */}
              {u.role === "pro" && pa && (
                <section>
                  <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Activité pro</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <Stat label="Note" value={pa.reviews.avg != null ? `${pa.reviews.avg.toLocaleString("fr-FR")} ★` : "—"} hint={`${nf.format(pa.reviews.count)} avis`} />
                    <Stat label="CA ce mois" value={eur(pa.bookings.gmv_month)} />
                    <Stat label="Complétion" value={pct(pa.bookings.completion_rate)} hint={`${nf.format(pa.bookings.completed)} terminées`} />
                    <Stat label="Annulation" value={pct(pa.bookings.cancellation_rate)} hint={`${nf.format(pa.bookings.cancelled)} annulées`} />
                    <Stat label="Clientèle" value={nf.format(pa.clients.distinct)} hint={`${nf.format(pa.clients.recurring)} récurrentes`} />
                    <Stat label="CA généré" value={eur(pa.bookings.gmv_total)} hint={`${nf.format(pa.bookings.total)} réservations`} />
                  </div>
                  <div className="mt-3 flex items-center justify-between rounded-xl border border-border bg-card p-4">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Abonnement</div>
                      <div className="mt-1 text-sm font-semibold text-foreground">
                        {pa.subscription ? (PLAN_LABELS[pa.subscription.plan] ?? pa.subscription.plan) : "Aucun"}
                        {pa.subscription?.end_date ? ` · fin ${new Date(pa.subscription.end_date).toLocaleDateString("fr-FR")}` : ""}
                      </div>
                    </div>
                    {pa.subscription && (
                      <Badge variant={pa.subscription.is_granted ? "secondary" : "default"}>
                        {pa.subscription.is_granted ? "Offert" : "Payé"}
                      </Badge>
                    )}
                  </div>
                </section>
              )}

              {/* Stats client */}
              {u.role !== "pro" && u.stats && (
                <section>
                  <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Activité</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <Stat label="Réservations" value={nf.format(u.stats.total_bookings)} />
                    <Stat label="Terminées" value={nf.format(u.stats.completed)} />
                    <Stat label="Annulées" value={nf.format(u.stats.cancelled)} />
                    <Stat label="Dépensé" value={eur(u.stats.total_spent)} />
                  </div>
                </section>
              )}

              {/* Abonnements */}
              {(u.subscription_history ?? []).length > 0 && (
                <section>
                  <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Historique abonnements</h3>
                  <div className="divide-y divide-border rounded-xl border border-border">
                    {(u.subscription_history ?? []).slice(0, 5).map((s) => (
                      <div key={s.id} className="flex items-center justify-between p-3 text-sm">
                        <span className="text-foreground">{PLAN_LABELS[s.plan] ?? s.plan}</span>
                        <span className="text-muted-foreground">{new Date(s.start_date).toLocaleDateString("fr-FR")}</span>
                        <Badge variant={s.status === "active" ? "default" : "outline"}>{s.status === "active" ? "Actif" : s.status}</Badge>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Signalements */}
              {((u.reports?.against.length ?? 0) > 0 || (u.reports?.made.length ?? 0) > 0) && (
                <section>
                  <h3 className="mb-3 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    <ShieldAlert size={13} /> Signalements
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {u.reports?.reported_count ?? 0} reçu(s) fondé(s) · {u.reports?.made_total ?? 0} émis dont {u.reports?.made_abusive_count ?? 0} abusif(s)
                  </p>
                </section>
              )}

              {/* Action */}
              <button
                onClick={() => setGrantOpen((v) => !v)}
                className="admin-field-rose flex w-full items-center justify-center gap-2 rounded-xl p-3 text-sm font-bold"
              >
                <Gift size={15} /> Offrir un abonnement
              </button>
              {grantOpen && (
                <div className="space-y-3 rounded-xl border border-border bg-card p-4">
                  <div className="flex overflow-hidden rounded-lg border border-border">
                    {PLAN_OPTS.map((p) => (
                      <button key={p} onClick={() => setPlan(p)}
                        className={`flex-1 py-2 text-xs font-bold uppercase tracking-wide ${plan === p ? "admin-field-rose" : "text-muted-foreground"}`}>
                        {PLAN_LABELS[p]}
                      </button>
                    ))}
                  </div>
                  <div className="flex overflow-hidden rounded-lg border border-border">
                    {MONTHS_OPTS.map((m) => (
                      <button key={m} onClick={() => setMonths(m)}
                        className={`flex-1 py-2 text-xs font-bold ${months === m ? "admin-field-rose" : "text-muted-foreground"}`}>
                        {m}m
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => grantMut.mutate()}
                    disabled={grantMut.isPending}
                    className="admin-field-rose w-full rounded-lg py-2.5 text-sm font-bold disabled:opacity-60"
                  >
                    {grantMut.isPending ? "…" : "Accorder l'abonnement"}
                  </button>
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
