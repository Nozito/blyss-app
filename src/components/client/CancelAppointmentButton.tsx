/**
 * CancelAppointmentButton
 *
 * Affiche la date limite d'annulation et gère le flux d'annulation côté client.
 *
 * SECURITY DESIGN:
 *   - Le bouton est désactivé visuellement si la deadline est dépassée
 *     (UX uniquement — le serveur revalide toujours côté back).
 *   - Pas d'optimistic update : le statut local n'est mis à jour qu'après
 *     confirmation du serveur (onSuccess de la mutation).
 *   - En cas d'erreur 422 (cancellation_window_expired), le message serveur
 *     est affiché — aucune logique de délai calculée côté client.
 */

import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { AlertTriangle, Ban, CalendarX } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { clientApi } from "@/services/api";

// ── Types ──────────────────────────────────────────────────────────────────

interface Props {
  /** ID de la réservation à annuler */
  reservationId: number;
  /** Début du rendez-vous (ISO string ou Date) */
  appointmentStartAt: string | Date;
  /**
   * Délai minimum configuré par le pro (en heures).
   * Utilisé UNIQUEMENT pour l'affichage de la deadline au client.
   * La validation réelle est toujours effectuée côté serveur.
   */
  cancellationNoticeHours: number;
  /** Appelé après annulation réussie (pour rafraîchir la liste) */
  onCancelled?: (reservationId: number) => void;
  /** Clé TanStack Query à invalider après succès (ex: ["my-bookings"]) */
  queryKeyToInvalidate?: unknown[];
}

// ── Helpers locaux (affichage uniquement — jamais pour décider de bloquer) ─

function computeDeadline(startAt: Date, noticeHours: number): Date {
  return new Date(startAt.getTime() - noticeHours * 60 * 60 * 1000);
}

function isBeforeDeadline(startAt: Date, noticeHours: number): boolean {
  if (noticeHours === 0) return new Date() < startAt;
  return new Date() < computeDeadline(startAt, noticeHours);
}

// ── Composant ──────────────────────────────────────────────────────────────

export default function CancelAppointmentButton({
  reservationId,
  appointmentStartAt,
  cancellationNoticeHours,
  onCancelled,
  queryKeyToInvalidate,
}: Props) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const startAt = useMemo(
    () =>
      appointmentStartAt instanceof Date
        ? appointmentStartAt
        : new Date(appointmentStartAt),
    [appointmentStartAt]
  );

  const deadline = useMemo(
    () => computeDeadline(startAt, cancellationNoticeHours),
    [startAt, cancellationNoticeHours]
  );

  // Indique si l'annulation semble encore possible (affichage uniquement)
  const canCancel = useMemo(
    () => isBeforeDeadline(startAt, cancellationNoticeHours),
    [startAt, cancellationNoticeHours]
  );

  const deadlineLabel = useMemo(() => {
    if (cancellationNoticeHours === 0) return null;
    return format(deadline, "EEEE d MMMM 'à' HH'h'mm", { locale: fr });
  }, [deadline, cancellationNoticeHours]);

  const timeUntilDeadline = useMemo(() => {
    if (!canCancel || cancellationNoticeHours === 0) return null;
    return formatDistanceToNow(deadline, { locale: fr, addSuffix: true });
  }, [canCancel, deadline, cancellationNoticeHours]);

  // ── Mutation ─────────────────────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: () => clientApi.cancelReservationWithPolicy(reservationId),
    onSuccess: (res) => {
      if (!res.success) {
        // Le serveur a refusé (ex: délai expiré entre l'affichage et le clic)
        const serverDeadline = (res as { deadline?: string }).deadline;
        const detail = serverDeadline
          ? `La date limite d'annulation était le ${format(new Date(serverDeadline), "d MMMM 'à' HH'h'mm", { locale: fr })}.`
          : res.error ?? "Annulation impossible.";
        toast.error("Annulation refusée", { description: detail });
        setOpen(false);
        return;
      }
      setOpen(false);
      toast.success("Réservation annulée", {
        description: "Votre rendez-vous a bien été annulé.",
      });
      if (queryKeyToInvalidate) {
        queryClient.invalidateQueries({ queryKey: queryKeyToInvalidate });
      }
      onCancelled?.(reservationId);
    },
    onError: () => {
      toast.error("Une erreur est survenue", {
        description: "Veuillez réessayer ou contacter le support.",
      });
    },
  });

  // ── Rendu ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-2">
      {/* Bandeau informatif sur la deadline */}
      {cancellationNoticeHours > 0 && (
        <div
          role="note"
          className={`flex items-start gap-2 rounded-xl px-3 py-2 text-xs ${
            canCancel
              ? "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400"
              : "bg-destructive/10 text-destructive"
          }`}
        >
          {canCancel ? (
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          )}
          <span>
            {canCancel ? (
              <>
                Annulation possible{" "}
                <strong>{timeUntilDeadline}</strong> (avant le{" "}
                {deadlineLabel}).
              </>
            ) : (
              <>
                La date limite d'annulation est passée
                {deadlineLabel ? ` (${deadlineLabel})` : ""}. Ce rendez-vous
                ne peut plus être annulé.
              </>
            )}
          </span>
        </div>
      )}

      {/* Bouton + Modale de confirmation */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={!canCancel}
            aria-disabled={!canCancel}
            aria-label={
              canCancel
                ? "Annuler ce rendez-vous"
                : "Annulation impossible — délai dépassé"
            }
            className="gap-2 text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/5 disabled:pointer-events-none"
          >
            <CalendarX className="h-4 w-4" aria-hidden="true" />
            Annuler le rendez-vous
          </Button>
        </DialogTrigger>

        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmer l'annulation</DialogTitle>
            <DialogDescription>
              Voulez-vous vraiment annuler ce rendez-vous du{" "}
              <strong>
                {format(startAt, "EEEE d MMMM 'à' HH'h'mm", { locale: fr })}
              </strong>
              ?{" "}
              {cancellationNoticeHours > 0 && (
                <>Cette action est irréversible.</>
              )}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={mutation.isPending}
            >
              Retour
            </Button>
            <Button
              variant="destructive"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              aria-label="Confirmer l'annulation du rendez-vous"
            >
              {mutation.isPending ? "Annulation…" : "Confirmer l'annulation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
