import { type ReactNode } from "react";

export interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}

/**
 * En-tête standard pour toutes les pages admin — titre, sous-titre
 * descriptif, actions principales alignées à droite sur desktop.
 * Garantit une hiérarchie et un espacement identiques d'une page à l'autre.
 */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="relative pl-4">
        {/* Ruban de marque — accent vertical rose × prune */}
        <span
          aria-hidden="true"
          className="admin-ribbon absolute left-0 top-1 bottom-1 w-[3px] rounded-full"
        />
        <h1 className="admin-display text-[2rem] leading-none text-foreground sm:text-[2.5rem]">
          {title}
        </h1>
        {description ? <p className="mt-2 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2 shrink-0">{actions}</div> : null}
    </div>
  );
}
