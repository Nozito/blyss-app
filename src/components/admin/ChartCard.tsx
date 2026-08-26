import { type ReactNode } from "react";
import { type LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/admin/EmptyState";
import { ErrorState } from "@/components/admin/ErrorState";

export interface ChartCardProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  isEmpty?: boolean;
  emptyIcon?: LucideIcon;
  emptyTitle?: string;
  emptyDescription?: string;
  children: ReactNode;
  className?: string;
}

/**
 * Carte pour une visualisation — gère elle-même chargement / erreur / vide,
 * pour ne jamais afficher un grand graphique vide sans explication.
 */
export function ChartCard({
  icon: Icon,
  title,
  description,
  loading,
  error,
  onRetry,
  isEmpty,
  emptyIcon,
  emptyTitle = "Pas assez de données sur cette période",
  emptyDescription,
  children,
  className,
}: ChartCardProps) {
  return (
    <div className={`bg-card rounded-2xl border-2 border-border p-5 sm:p-6 ${className ?? ""}`}>
      <h2 className="text-lg font-bold text-foreground mb-1 flex items-center gap-2">
        {Icon ? <Icon size={18} className="text-muted-foreground shrink-0" aria-hidden="true" /> : null}
        {title}
      </h2>
      {description ? <p className="text-sm text-muted-foreground mb-4">{description}</p> : null}

      {loading ? (
        <Skeleton className="h-56 w-full rounded-xl" />
      ) : error ? (
        <ErrorState description="Impossible de charger ces données." onRetry={onRetry} />
      ) : isEmpty ? (
        <EmptyState icon={emptyIcon ?? (Icon as LucideIcon)} title={emptyTitle} description={emptyDescription} className="py-10" />
      ) : (
        children
      )}
    </div>
  );
}
