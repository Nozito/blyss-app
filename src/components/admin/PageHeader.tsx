import { type ReactNode } from "react";

export interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  /** @deprecated conservé pour compat d'appel — plus rendu. */
  eyebrow?: string;
}

/**
 * En-tête standard pour toutes les pages admin — titre, sous-titre
 * descriptif, actions principales alignées à droite sur desktop.
 * Garantit une hiérarchie et un espacement identiques d'une page à l'autre.
 */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="admin-display text-[2.4rem] text-foreground sm:text-[3.2rem]">
          {title}
        </h1>
        {description ? <p className="mt-2 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2 shrink-0">{actions}</div> : null}
    </div>
  );
}
