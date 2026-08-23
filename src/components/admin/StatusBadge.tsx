import { CheckCircle2, Clock, AlertTriangle, XCircle, Circle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

/**
 * Badge de statut monochrome — noir/blanc/gris uniquement. Les tons se
 * distinguent par la luminosité et une icône, jamais par une teinte.
 */
const TONE_STYLES: Record<StatusTone, { className: string; defaultIcon: LucideIcon }> = {
  success: { className: "bg-foreground/10 text-foreground border-foreground/20", defaultIcon: CheckCircle2 },
  warning: { className: "bg-muted text-foreground/80 border-border", defaultIcon: AlertTriangle },
  danger: { className: "bg-background text-foreground border-foreground/30", defaultIcon: XCircle },
  info: { className: "bg-muted/60 text-muted-foreground border-border", defaultIcon: Clock },
  neutral: { className: "bg-muted/40 text-muted-foreground border-border", defaultIcon: Circle },
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
