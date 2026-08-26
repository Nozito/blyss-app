import { type ReactNode } from "react";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SectionCardProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Carte de section standard pour les pages de gestion de compte —
 * titre + description courte + zone d'actions optionnelle en en-tête,
 * contenu en dessous. Évite de répéter le même bloc `<h2>` + `<p>` partout.
 */
export function SectionCard({ icon: Icon, title, description, actions, children, className }: SectionCardProps) {
  return (
    <section className={cn("bg-card rounded-2xl border-2 border-border p-5 sm:p-6", className)}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            {Icon ? <Icon size={18} className="text-muted-foreground shrink-0" aria-hidden="true" /> : null}
            <span className="truncate">{title}</span>
          </h2>
          {description ? <p className="text-sm text-muted-foreground mt-1">{description}</p> : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
