import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface LastUpdatedIndicatorProps {
  /** Timestamp de dernière donnée reçue, ou null si jamais chargée. */
  updatedAt: number | null;
  onRefresh: () => void;
  refreshing?: boolean;
}

/** Petit indicateur discret + bouton de rafraîchissement, pour l'en-tête du dashboard. */
export function LastUpdatedIndicator({ updatedAt, onRefresh, refreshing }: LastUpdatedIndicatorProps) {
  const label = updatedAt
    ? `Mis à jour à ${new Date(updatedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`
    : "Pas encore chargé";

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground" role="status" aria-live="polite">
        {label}
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={onRefresh}
        disabled={refreshing}
        aria-label="Rafraîchir les données du dashboard"
      >
        <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} aria-hidden="true" />
      </Button>
    </div>
  );
}
