import { type LucideIcon, Activity } from "lucide-react";
import { motion } from "framer-motion";
import { EmptyState } from "@/components/admin/EmptyState";

export interface TimelineItem {
  type: string;
  title: string;
  description: string;
  time: string;
}

export interface ActivityTimelineProps {
  items: TimelineItem[];
  iconFor: (type: string) => LucideIcon;
  emptyTitle?: string;
  limit?: number;
}

/**
 * Liste d'activité récente — lisible, pas un journal technique. Limitée par
 * défaut pour éviter un pavé illisible sur le dashboard d'accueil.
 */
export function ActivityTimeline({ items, iconFor, emptyTitle = "Aucune activité récente", limit = 8 }: ActivityTimelineProps) {
  if (items.length === 0) {
    return <EmptyState icon={Activity} title={emptyTitle} />;
  }

  return (
    <ul className="space-y-2">
      {items.slice(0, limit).map((item, index) => {
        const Icon = iconFor(item.type);
        return (
          <motion.li
            key={index}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: Math.min(index, 10) * 0.04 }}
            className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 hover:bg-muted/70 transition-colors"
          >
            <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-background border border-border shrink-0">
              <Icon size={16} className="text-foreground" aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{item.title}</p>
              <p className="text-xs text-muted-foreground truncate">{item.description}</p>
            </div>
            <span className="text-xs text-muted-foreground font-medium whitespace-nowrap shrink-0">{item.time}</span>
          </motion.li>
        );
      })}
    </ul>
  );
}
