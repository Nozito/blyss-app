import { useEffect, useState, useCallback } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Loader2, Sparkles, MapPin, CheckCircle2, SkipForward, Circle, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const API_URL = import.meta.env.VITE_API_URL || "";

const STEP_LABELS: Record<number, string> = {
  0: "Pas commencé",
  1: "Bienvenue",
  2: "Préférences nails",
  3: "Recommandations",
  4: "CTA premier RDV",
  5: "Carousel features",
};

const STYLE_LABELS: Record<string, string> = {
  nail_art: "Nail art",
  french_nude: "French / nude",
  couleurs_vives: "Couleurs vives",
  vernis_gel: "Vernis gel",
  pose_resine: "Pose résine",
  autre: "Autre",
};

interface OnboardingData {
  client_id: number;
  client_name: string;
  onboarding_step: number;
  status: "not_started" | "in_progress" | "completed" | "skipped";
  started_at: string | null;
  onboarding_completed_at: string | null;
  onboarding_skipped: boolean;
  preferences: { style_nails: string; updated_at: string } | null;
  location: string | null;
  recommendations_viewed: number;
  cta_tapped: number;
  nudges_sent: { d1: string | null; d3: string | null; d7: string | null };
  first_reservation_at: string | null;
  first_appointment_booked_at: string | null;
}

const fmt = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

function StatusPill({ status }: { status: OnboardingData["status"] }) {
  const map = {
    completed: { icon: CheckCircle2, text: "Complété", cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
    skipped: { icon: SkipForward, text: "Passé", cls: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
    in_progress: { icon: Circle, text: "En cours", cls: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
    not_started: { icon: Circle, text: "Pas commencé", cls: "bg-muted text-muted-foreground border-border" },
  }[status];
  const Icon = map.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${map.cls}`}>
      <Icon size={12} aria-hidden="true" />
      {map.text}
    </span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-border/60 last:border-0">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-xs font-semibold text-foreground text-right">{children}</span>
    </div>
  );
}

export default function ClientOnboardingDialog({
  clientId,
  clientName,
  open,
  onOpenChange,
}: {
  clientId: number | null;
  clientName?: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [data, setData] = useState<OnboardingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmReplay, setConfirmReplay] = useState(false);
  const [replaying, setReplaying] = useState(false);

  const load = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/client-onboarding/${clientId}`, { credentials: "include" });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(
          json?.error === "client_not_found" ? "Client introuvable" :
          json?.error === "not_a_client" ? "Ce compte n'est pas un client" :
          "Impossible de charger l'onboarding"
        );
        return;
      }
      setData(json.data);
    } catch {
      setError("Erreur de connexion au serveur");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    if (open && clientId) load();
    if (!open) { setData(null); setError(null); }
  }, [open, clientId, load]);

  const replay = async () => {
    if (!clientId) return;
    setReplaying(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/client-onboarding/${clientId}/replay`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        toast.success("Onboarding réinitialisé — le client le reverra à sa prochaine ouverture");
        setConfirmReplay(false);
        load();
      } else {
        toast.error("Impossible de réinitialiser l'onboarding");
      }
    } catch {
      toast.error("Erreur serveur");
    } finally {
      setReplaying(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <div className="space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                <Sparkles size={16} className="text-primary" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-foreground">Onboarding client</h2>
                <p className="text-xs text-muted-foreground">{data?.client_name || clientName || `Client #${clientId}`}</p>
              </div>
            </div>

            {loading && (
              <div className="flex items-center justify-center py-10">
                <Loader2 size={20} className="animate-spin text-muted-foreground" aria-hidden="true" />
              </div>
            )}

            {error && !loading && (
              <div className="py-8 text-center text-xs font-medium text-muted-foreground">{error}</div>
            )}

            {data && !loading && !error && (
              <>
                <div className="flex items-center justify-between">
                  <StatusPill status={data.status} />
                  <span className="text-xs font-semibold text-muted-foreground">
                    Étape {data.onboarding_step} · {STEP_LABELS[data.onboarding_step] ?? "—"}
                  </span>
                </div>

                <div className="rounded-xl border border-border bg-muted/30 px-3.5 py-1">
                  <Row label="Style nails">
                    {data.preferences ? (STYLE_LABELS[data.preferences.style_nails] ?? data.preferences.style_nails) : "—"}
                  </Row>
                  <Row label="Localisation">
                    {data.location ? (
                      <span className="inline-flex items-center gap-1">
                        <MapPin size={11} aria-hidden="true" />
                        {data.location}
                      </span>
                    ) : "—"}
                  </Row>
                  <Row label="Recommandations vues">{data.recommendations_viewed}</Row>
                  <Row label="Taps « Prendre RDV »">{data.cta_tapped}</Row>
                  <Row label="Démarré le">{fmt(data.started_at)}</Row>
                  <Row label="Complété le">{fmt(data.onboarding_completed_at)}</Row>
                  <Row label="Relances envoyées">
                    {[["J+1", data.nudges_sent.d1], ["J+3", data.nudges_sent.d3], ["J+7", data.nudges_sent.d7]]
                      .filter(([, v]) => v).map(([k]) => k).join(", ") || "aucune"}
                  </Row>
                  <Row label="1ᵉʳ RDV réservé">{fmt(data.first_appointment_booked_at)}</Row>
                </div>

                <button
                  type="button"
                  onClick={() => setConfirmReplay(true)}
                  disabled={data.status === "not_started"}
                  className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-border bg-muted hover:bg-accent text-xs font-semibold text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <RotateCcw size={13} aria-hidden="true" />
                  Rejouer l'onboarding
                </button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmReplay} onOpenChange={setConfirmReplay}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rejouer l'onboarding ?</AlertDialogTitle>
            <AlertDialogDescription>
              L'étape repasse à 0 et les dates de complétion / passage sont effacées. Le client
              reverra l'onboarding à sa prochaine ouverture de l'app. Ses préférences et
              l'historique des relances sont conservés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={replaying}>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); replay(); }} disabled={replaying}>
              {replaying ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : "Rejouer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
