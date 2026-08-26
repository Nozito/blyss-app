import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Flag, MessageSquare, Star, ShieldCheck, RotateCcw, Trash2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/admin/PageHeader";
import { KpiCard } from "@/components/admin/KpiCard";
import { EmptyState } from "@/components/admin/EmptyState";
import { ErrorState } from "@/components/admin/ErrorState";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { ModerationActionDialog } from "@/components/admin/moderation/ModerationActionDialog";
import { ThreadDetailDialog } from "@/components/admin/moderation/ThreadDetailDialog";
import { REASON_LABELS, type FlaggedReview, type FlaggedThread } from "@/components/admin/moderation/types";

const API_URL = import.meta.env.VITE_API_URL || "";

type Domain = "reviews" | "messages";
type SubView = "flagged" | "deleted";

const AdminModeration = () => {
  const [domain, setDomain] = useState<Domain>("messages");
  const [subView, setSubView] = useState<SubView>("flagged");

  const [reviews, setReviews] = useState<FlaggedReview[]>([]);
  const [threads, setThreads] = useState<FlaggedThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const PAGE_SIZE = 50;

  const [reviewAction, setReviewAction] = useState<{ review: FlaggedReview; kind: "delete" | "restore" | "ignore" } | null>(null);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [openThread, setOpenThread] = useState<FlaggedThread | null>(null);

  const fetchData = async (targetPage: number, append: boolean) => {
    append ? setLoadingMore(true) : setLoading(true);
    setLoadError(false);
    try {
      const filterParam = subView === "flagged" ? "flagged=true" : "deleted=true";
      if (domain === "reviews") {
        const response = await fetch(
          `${API_URL}/api/admin/reviews?${filterParam}&page=${targetPage}&limit=${PAGE_SIZE}`,
          { credentials: "include" }
        );
        if (!response.ok) throw new Error();
        const data = await response.json();
        setReviews((prev) => (append ? [...prev, ...(data.data || [])] : data.data || []));
        setTotal(data.total ?? 0);
      } else {
        const response = await fetch(
          `${API_URL}/api/admin/messages/threads?${filterParam}&page=${targetPage}&limit=${PAGE_SIZE}`,
          { credentials: "include" }
        );
        if (!response.ok) throw new Error();
        const data = await response.json();
        setThreads((prev) => (append ? [...prev, ...(data.data || [])] : data.data || []));
        setTotal(data.total ?? 0);
      }
      setPage(targetPage);
    } catch {
      setLoadError(true);
      toast.error("Erreur lors du chargement");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchData(1, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain, subView]);

  const currentCount = domain === "reviews" ? reviews.length : threads.length;
  const hasMore = currentCount < total;

  const runReviewAction = async (note: string) => {
    if (!reviewAction) return;
    setReviewSubmitting(true);
    try {
      const { review, kind } = reviewAction;
      const url = `${API_URL}/api/admin/reviews/${review.id}${kind === "delete" ? "" : `/${kind}`}`;
      const response = await fetch(url, {
        method: kind === "delete" ? "DELETE" : "PATCH",
        credentials: "include",
      });
      if (response.ok) {
        toast.success(kind === "delete" ? "Avis supprimé" : kind === "restore" ? "Avis restauré" : "Signalement ignoré");
        setReviewAction(null);
        fetchData(1, false);
      } else {
        toast.error("Une erreur est survenue");
      }
    } catch {
      toast.error("Erreur serveur");
    } finally {
      setReviewSubmitting(false);
    }
  };

  const kpis = useMemo(
    () => ({
      flaggedReviews: domain === "reviews" && subView === "flagged" ? reviews.length : null,
      flaggedThreads: domain === "messages" && subView === "flagged" ? threads.length : null,
    }),
    [domain, subView, reviews, threads]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Modération"
        description="Avis et conversations signalés par les utilisateurs — rien ici n'est scanné proactivement."
      />

      {/* KPI rapide sur la vue courante */}
      <div className="grid grid-cols-2 gap-4">
        <KpiCard icon={Star} label="Avis signalés" value={domain === "reviews" ? total : "—"} />
        <KpiCard icon={MessageSquare} label="Conversations signalées" value={domain === "messages" ? total : "—"} />
      </div>

      {/* Onglets domaine */}
      <div className="flex gap-2 bg-muted p-1 rounded-xl w-fit">
        {([
          { key: "messages", label: "Messages", icon: MessageSquare },
          { key: "reviews", label: "Avis", icon: Star },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setDomain(key)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg font-bold text-xs transition-all ${
              domain === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Sous-onglets signalés / traités */}
      <div className="flex gap-2">
        {([
          { key: "flagged", label: "Signalés" },
          { key: "deleted", label: domain === "reviews" ? "Supprimés" : "Modérées" },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setSubView(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              subView === key ? "border-foreground text-foreground" : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      ) : loadError ? (
        <ErrorState onRetry={() => fetchData(1, false)} />
      ) : domain === "reviews" ? (
        reviews.length === 0 ? (
          <EmptyState
            icon={Flag}
            title={subView === "flagged" ? "Aucun avis signalé" : "Aucun avis supprimé"}
            description={subView === "flagged" ? "Rien à modérer pour le moment." : "Les avis supprimés par modération apparaîtront ici."}
          />
        ) : (
          <div className="space-y-3">
            {reviews.map((review) => (
              <div key={review.id} className="bg-card rounded-2xl border-2 border-border p-4 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-foreground text-sm">
                      {review.author_name} → {review.pro_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {"★".repeat(review.rating)}
                      {"☆".repeat(5 - review.rating)} · {new Date(review.created_at).toLocaleDateString("fr-FR")}
                    </p>
                  </div>
                  {review.flags_count > 0 && (
                    <StatusBadge tone="warning" label={`${review.flags_count} signalement${review.flags_count > 1 ? "s" : ""}`} icon={Flag} />
                  )}
                </div>
                <p className="text-sm text-foreground/80">« {review.comment} »</p>
                <div className="flex gap-2 pt-1">
                  {subView === "flagged" ? (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setReviewAction({ review, kind: "ignore" })}>
                        <ShieldCheck className="h-4 w-4 mr-2" />
                        Ignorer le signalement
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => setReviewAction({ review, kind: "delete" })}>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Supprimer l'avis
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" onClick={() => setReviewAction({ review, kind: "restore" })}>
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Restaurer
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      ) : threads.length === 0 ? (
        <EmptyState
          icon={Flag}
          title={subView === "flagged" ? "Aucune conversation signalée" : "Aucune conversation modérée"}
          description={subView === "flagged" ? "Rien à examiner pour le moment." : "Les conversations modérées apparaîtront ici."}
        />
      ) : (
        <div className="space-y-3">
          {threads.map((thread) => (
            <button
              key={thread.id}
              onClick={() => setOpenThread(thread)}
              className="w-full text-left bg-card rounded-2xl border-2 border-border p-4 flex flex-col gap-2 hover:border-foreground/30 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground text-sm truncate">
                    {thread.client_name} ↔ {thread.pro_name}
                  </p>
                  {thread.last_message_preview && (
                    <p className="text-xs text-muted-foreground truncate">{thread.last_message_preview}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {thread.is_locked && <StatusBadge tone="neutral" label="Verrouillé" icon={Lock} />}
                  {thread.flags_count > 0 && (
                    <StatusBadge tone="warning" label={`${thread.flags_count} en attente`} icon={Flag} />
                  )}
                </div>
              </div>
              {thread.last_reason_code && (
                <p className="text-xs text-muted-foreground">
                  Motif : {REASON_LABELS[thread.last_reason_code]}
                  {thread.last_reason ? ` — « ${thread.last_reason} »` : ""}
                </p>
              )}
            </button>
          ))}
        </div>
      )}

      {!loading && !loadError && hasMore && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" disabled={loadingMore} onClick={() => fetchData(page + 1, true)}>
            {loadingMore ? "Chargement..." : `Charger plus (${currentCount}/${total})`}
          </Button>
        </div>
      )}

      <ModerationActionDialog
        open={!!reviewAction}
        onOpenChange={(o) => !o && setReviewAction(null)}
        title={
          reviewAction?.kind === "delete"
            ? "Supprimer cet avis ?"
            : reviewAction?.kind === "restore"
            ? "Restaurer cet avis ?"
            : "Ignorer le signalement ?"
        }
        description={
          reviewAction?.kind === "delete"
            ? "L'avis disparaît du profil de la pro. Réversible via « Restaurer »."
            : reviewAction?.kind === "restore"
            ? "L'avis redevient visible sur le profil de la pro."
            : "L'avis reste en ligne, le(s) signalement(s) sont effacés."
        }
        confirmLabel={reviewAction?.kind === "delete" ? "Supprimer" : reviewAction?.kind === "restore" ? "Restaurer" : "Ignorer"}
        submitting={reviewSubmitting}
        showNote={false}
        onConfirm={runReviewAction}
      />

      <ThreadDetailDialog
        thread={openThread}
        deletedView={subView === "deleted"}
        onOpenChange={(o) => !o && setOpenThread(null)}
        onActionDone={() => fetchData(1, false)}
      />
    </div>
  );
};

export default AdminModeration;
