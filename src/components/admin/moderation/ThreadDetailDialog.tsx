import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Flag, ShieldCheck, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge, type StatusTone } from "@/components/admin/StatusBadge";
import { ModerationActionDialog } from "./ModerationActionDialog";
import { REASON_LABELS, type FlaggedThread, type FlagOutcome, type ThreadDetail } from "./types";

const API_URL = import.meta.env.VITE_API_URL || "";

const OUTCOME_CONFIG: Record<string, { label: string; tone: StatusTone }> = {
  pending: { label: "En attente", tone: "warning" },
  upheld: { label: "Fondé — modéré", tone: "danger" },
  dismissed: { label: "Classé sans suite", tone: "neutral" },
  abusive: { label: "Signalement abusif", tone: "info" },
};

export interface ThreadDetailDialogProps {
  thread: FlaggedThread | null;
  deletedView: boolean;
  onOpenChange: (open: boolean) => void;
  onActionDone: () => void;
}

/** Examen complet d'un fil signalé — conversation + historique des signalements + décision. */
export function ThreadDetailDialog({ thread, deletedView, onOpenChange, onActionDone }: ThreadDetailDialogProps) {
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<"delete" | "restore" | "ignore" | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!thread) {
      setDetail(null);
      return;
    }
    setLoading(true);
    fetch(`${API_URL}/api/admin/messages/threads/${thread.id}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => setDetail(data.data))
      .catch(() => toast.error("Impossible de charger la conversation"))
      .finally(() => setLoading(false));
  }, [thread]);

  const runAction = async (action: "delete" | "restore" | "ignore", note: string, outcome?: FlagOutcome) => {
    if (!thread) return;
    setSubmitting(true);
    try {
      const url = `${API_URL}/api/admin/messages/threads/${thread.id}${action === "delete" ? "" : `/${action}`}`;
      const response = await fetch(url, {
        method: action === "delete" ? "DELETE" : "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(action === "ignore" ? { note: note || undefined, outcome } : { note: note || undefined }),
      });
      if (response.ok) {
        toast.success(
          action === "delete" ? "Conversation modérée" : action === "restore" ? "Conversation restaurée" : "Signalement classé"
        );
        setPendingAction(null);
        onActionDone();
        onOpenChange(false);
      } else {
        toast.error("Une erreur est survenue");
      }
    } catch {
      toast.error("Erreur serveur");
    } finally {
      setSubmitting(false);
    }
  };

  if (!thread) return null;

  return (
    <>
      <Dialog open={!!thread} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {thread.client_name} ↔ {thread.pro_name}
            </DialogTitle>
          </DialogHeader>

          {loading || !detail ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Conversation */}
              <div className="space-y-2 max-h-64 overflow-y-auto rounded-xl border border-border p-3 bg-muted/20">
                {detail.messages.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">Aucun message.</p>
                ) : (
                  detail.messages.map((m) => (
                    <div key={m.id} className={`flex flex-col ${m.sender_role === "pro" ? "items-end" : "items-start"}`}>
                      <div
                        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                          m.sender_role === "pro" ? "bg-foreground text-background" : "bg-card border border-border text-foreground"
                        }`}
                      >
                        {m.deleted_at ? (
                          <span className="italic text-xs opacity-70">Message supprimé (modération)</span>
                        ) : m.body ? (
                          m.body
                        ) : (
                          <span className="italic text-xs opacity-70">Pièce jointe</span>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground mt-0.5">
                        {m.sender_role === "pro" ? thread.pro_name : m.sender_role === "client" ? thread.client_name : "?"} ·{" "}
                        {new Date(m.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  ))
                )}
              </div>

              {/* Historique des signalements */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Signalements ({detail.flags.length})
                </h3>
                {detail.flags.map((f) => {
                  const config = OUTCOME_CONFIG[f.outcome ?? "pending"];
                  return (
                    <div key={f.id} className="rounded-xl border border-border p-3 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-foreground">{REASON_LABELS[f.reason_code]}</span>
                        <StatusBadge tone={config.tone} label={config.label} icon={f.status === "pending" ? Flag : ShieldCheck} />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {f.flagged_by_name} a signalé {f.reported_user_name} — {new Date(f.created_at).toLocaleDateString("fr-FR")}
                      </p>
                      {f.reason && <p className="text-xs text-foreground/80">« {f.reason} »</p>}
                      {f.admin_note && <p className="text-xs text-muted-foreground italic">Note admin : {f.admin_note}</p>}
                    </div>
                  );
                })}
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                {deletedView ? (
                  <Button size="sm" onClick={() => setPendingAction("restore")}>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Restaurer la conversation
                  </Button>
                ) : (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setPendingAction("ignore")}>
                      <ShieldCheck className="h-4 w-4 mr-2" />
                      Classer le signalement
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => setPendingAction("delete")}>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Modérer (effacer le contenu)
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ModerationActionDialog
        open={pendingAction === "delete"}
        onOpenChange={(o) => !o && setPendingAction(null)}
        title="Modérer cette conversation ?"
        description="Efface tout le contenu du fil pour les deux personnes et marque les signalements en attente comme fondés — ça compte dans la vigilance de la personne visée. Réversible via « Restaurer »."
        confirmLabel="Modérer"
        submitting={submitting}
        onConfirm={(note) => runAction("delete", note)}
      />
      <ModerationActionDialog
        open={pendingAction === "restore"}
        onOpenChange={(o) => !o && setPendingAction(null)}
        title="Restaurer cette conversation ?"
        description="Remet le contenu en ligne et exonère la personne visée — le signalement ne comptera plus dans sa vigilance."
        confirmLabel="Restaurer"
        submitting={submitting}
        onConfirm={(note) => runAction("restore", note)}
      />
      <ModerationActionDialog
        open={pendingAction === "ignore"}
        onOpenChange={(o) => !o && setPendingAction(null)}
        title="Classer le(s) signalement(s) en attente"
        description="Le contenu reste en ligne, le fil se débloque. Précise si la personne visée n'y était pour rien, ou si c'est le signalement lui-même qui était abusif."
        confirmLabel="Classer"
        submitting={submitting}
        showOutcomeChoice
        onConfirm={(note, outcome) => runAction("ignore", note, outcome)}
      />
    </>
  );
}
