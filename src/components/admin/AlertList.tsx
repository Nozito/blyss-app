import { type LucideIcon, CheckCircle2, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

export interface AlertItem {
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
  /** Libellé du lien d'action, ex: "Voir les utilisateurs" */
  actionLabel: string;
  actionHref: string;
}

export interface AlertListProps {
  items: AlertItem[];
}

/**
 * Liste des signaux nécessitant une action admin. Monochrome — la priorité
 * se lit dans le texte et l'icône, jamais dans une couleur d'alerte.
 * État "rien à signaler" explicite plutôt qu'une zone vide.
 */
export function AlertList({ items }: AlertListProps) {
  if (items.length === 0) {
    return (
      <div className="flex items-center gap-3 py-6 justify-center text-center">
        <CheckCircle2 size={18} className="text-muted-foreground shrink-0" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">Rien ne nécessite ton attention pour le moment.</p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <li key={item.id}>
            <Link
              to={item.actionHref}
              className="flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/30 hover:bg-muted/60 transition-colors group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="h-9 w-9 rounded-lg border border-border bg-background flex items-center justify-center shrink-0">
                <Icon size={16} className="text-foreground" aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{item.title}</p>
                <p className="text-xs text-muted-foreground truncate">{item.description}</p>
              </div>
              <span className="flex items-center gap-1 text-xs font-semibold text-foreground shrink-0">
                {item.actionLabel}
                <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" aria-hidden="true" />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
