import { type ReactNode } from "react";
import { type LucideIcon } from "lucide-react";

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/**
 * État vide / absence de résultat, cohérent sur toutes les pages admin —
 * remplace les "Aucune donnée" bruts dispersés page par page.
 */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 py-16 text-center ${className ?? ""}`}>
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-muted/40">
        <Icon size={20} className="text-muted-foreground" aria-hidden="true" />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {description ? <p className="mt-1 text-sm text-muted-foreground max-w-sm">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
