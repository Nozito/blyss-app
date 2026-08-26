import { useEffect, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { FlagOutcome } from "./types";

export interface ModerationActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  submitting: boolean;
  /** Affiche le choix "infondé / signalement abusif" — seulement pour ignorer un fil de messages. */
  showOutcomeChoice?: boolean;
  /** Les avis (review_flags) n'ont pas de colonne note — inutile de le laisser croire l'inverse. Défaut : true. */
  showNote?: boolean;
  onConfirm: (note: string, outcome?: FlagOutcome) => void;
}

/**
 * Dialogue générique pour toute action de modération (supprimer, restaurer,
 * ignorer) — un commentaire interne optionnel, jamais montré à
 * l'utilisateur (voir backend/routes/admin.routes.ts), et pour "ignorer" un
 * fil, le choix de qui était fautif (personne visée vs. signalement abusif).
 */
export function ModerationActionDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  submitting,
  showOutcomeChoice,
  showNote = true,
  onConfirm,
}: ModerationActionDialogProps) {
  const [note, setNote] = useState("");
  const [outcome, setOutcome] = useState<FlagOutcome>("dismissed");

  useEffect(() => {
    if (open) {
      setNote("");
      setOutcome("dismissed");
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {showOutcomeChoice && (
          <div className="space-y-2">
            <Label>Qui était fautif ?</Label>
            <div className="flex flex-col gap-2" role="radiogroup">
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="outcome"
                  checked={outcome === "dismissed"}
                  onChange={() => setOutcome("dismissed")}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium text-foreground">Infondé, de bonne foi</span>
                  <span className="block text-xs text-muted-foreground">La personne visée n'y est pour rien — n'engage pas sa vigilance.</span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="outcome"
                  checked={outcome === "abusive"}
                  onChange={() => setOutcome("abusive")}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium text-foreground">Signalement abusif</span>
                  <span className="block text-xs text-muted-foreground">Le signalement était mensonger — compte contre la personne qui l'a déposé.</span>
                </span>
              </label>
            </div>
          </div>
        )}

        {showNote && (
          <div className="space-y-2">
            <Label htmlFor="moderation-note">Note interne (optionnelle)</Label>
            <Textarea
              id="moderation-note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Jamais montrée à l'utilisateur — pour la traçabilité entre admins."
              maxLength={1000}
            />
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            type="button"
            disabled={submitting}
            onClick={() => onConfirm(note, showOutcomeChoice ? outcome : undefined)}
          >
            {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
