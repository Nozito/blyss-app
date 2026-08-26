import { type ReactNode } from "react";
import { type LucideIcon } from "lucide-react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export interface KpiCardProps {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  /** Variation en % vs période comparable — null = pas assez de recul pour comparer. */
  change?: number | null;
  /** Ex: "vs 30 derniers jours". Omis si `change` est undefined. */
  changeLabel?: string;
  /** Met la carte en avant (une seule par rangée, idéalement). */
  emphasis?: boolean;
  className?: string;
}

/**
 * Tuile KPI compacte et comparable — toutes de même hauteur, alignées en
 * rangée. La tendance (hausse/baisse) est portée par l'icône + le signe,
 * jamais par la couleur : même gris pour +X% et -X%.
 */
export function KpiCard({ icon: Icon, label, value, change, changeLabel, emphasis, className }: KpiCardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border-2 p-5 flex flex-col justify-between gap-4 min-h-[128px]",
        emphasis ? "bg-foreground text-background border-foreground" : "bg-card border-border",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "text-xs font-bold uppercase tracking-wide",
            emphasis ? "text-background/70" : "text-muted-foreground"
          )}
        >
          {label}
        </span>
        <Icon size={16} className={emphasis ? "text-background/70" : "text-muted-foreground"} aria-hidden="true" />
      </div>

      <div>
        <p className={cn("text-3xl font-black tracking-tight", emphasis ? "text-background" : "text-foreground")}>
          {value}
        </p>
        {change !== undefined && (
          <div
            className={cn(
              "mt-1.5 inline-flex items-center gap-1 text-xs font-semibold",
              emphasis ? "text-background/70" : "text-muted-foreground"
            )}
          >
            {change === null ? (
              <>
                <Minus size={12} aria-hidden="true" />
                <span>Pas encore assez de recul</span>
              </>
            ) : (
              <>
                {change >= 0 ? <TrendingUp size={12} aria-hidden="true" /> : <TrendingDown size={12} aria-hidden="true" />}
                <span>
                  {change > 0 ? "+" : ""}
                  {change}%{changeLabel ? ` ${changeLabel}` : ""}
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
