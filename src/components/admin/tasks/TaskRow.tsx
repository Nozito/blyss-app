import { Clock, Check, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge, type StatusTone } from "@/components/admin/StatusBadge";
import { COLOR_DOT } from "./TaskFormDialog";
import type { AdminTask, TaskStatus } from "./types";

export const STATUS_CONFIG: Record<TaskStatus, { label: string; tone: StatusTone }> = {
  pending: { label: "À faire", tone: "neutral" },
  in_progress: { label: "En cours", tone: "info" },
  done: { label: "Terminée", tone: "success" },
};

export interface TaskRowProps {
  task: AdminTask;
  isOwner: boolean;
  overdue?: boolean;
  onOpen: (task: AdminTask) => void;
  onAdvanceStatus: (task: AdminTask) => void;
  onDelete: (task: AdminTask) => void;
  compact?: boolean;
}

/** Une ligne de tâche — utilisée par la vue liste et les listes compactes (en retard / aujourd'hui). */
export function TaskRow({ task, isOwner, overdue, onOpen, onAdvanceStatus, onDelete, compact }: TaskRowProps) {
  const status = STATUS_CONFIG[task.status];

  return (
    <div className={`flex items-center gap-3 rounded-xl border border-border bg-card ${compact ? "p-2.5" : "p-3"}`}>
      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${COLOR_DOT[task.color]}`} aria-hidden="true" />
      <button
        onClick={() => onOpen(task)}
        className="flex-1 min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
      >
        <p className={`font-semibold text-sm text-foreground truncate ${task.status === "done" ? "line-through text-muted-foreground" : ""}`}>
          {task.title}
        </p>
        <p className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
          <Clock size={11} aria-hidden="true" />
          <time dateTime={task.start_time}>
            {new Date(task.start_time).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
          </time>
          <span>· {task.admin_first_name} {task.admin_last_name}</span>
          {overdue && <span className="font-semibold text-foreground">· En retard</span>}
        </p>
      </button>
      <StatusBadge tone={status.tone} label={status.label} />
      {isOwner && (
        <>
          {task.status !== "done" && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onAdvanceStatus(task)}
              aria-label={task.status === "pending" ? "Passer en cours" : "Marquer terminée"}
              title={task.status === "pending" ? "Passer en cours" : "Marquer terminée"}
            >
              <Check className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive"
            onClick={() => onDelete(task)}
            aria-label="Supprimer la tâche"
            title="Supprimer la tâche"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        </>
      )}
    </div>
  );
}
