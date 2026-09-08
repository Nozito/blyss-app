import { CheckCircle2, Clock, AlertTriangle, XCircle, Circle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

/**
 * Badge de statut — DA Rupture : chaque ton porte sa teinte sémantique
 * (verre teinté sur nuit prune), renforcée par une icône.
 */
const TONE_STYLES: Record<StatusTone, { className: string; defaultIcon: LucideIcon }> = {
  success: { className: "bg-success/15 text-success border-success/30", defaultIcon: CheckCircle2 },
  warning: { className: "bg-warning/15 text-warning border-warning/30", defaultIcon: AlertTriangle },
  danger: { className: "bg-destructive/15 text-destructive border-destructive/30", defaultIcon: XCircle },
  info: { className: "bg-info/15 text-info border-info/30", defaultIcon: Clock },
  neutral: { className: "bg-muted/50 text-muted-foreground border-border", defaultIcon: Circle },
};

export interface StatusBadgeProps {
  tone: StatusTone;
  label: string;
  icon?: LucideIcon;
  className?: string;
}

export function StatusBadge({ tone, label, icon, className }: StatusBadgeProps) {
  const { className: toneClass, defaultIcon } = TONE_STYLES[tone];
  const Icon = icon ?? defaultIcon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold whitespace-nowrap",
        toneClass,
        className
      )}
    >
      <Icon size={12} strokeWidth={2.5} aria-hidden="true" />
      {label}
    </span>
  );
}
