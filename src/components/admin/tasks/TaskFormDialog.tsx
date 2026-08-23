import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AdminTask, TaskColor } from "./types";

const COLOR_DOT: Record<TaskColor, string> = {
  blue: "bg-foreground",
  green: "bg-foreground/70",
  purple: "bg-foreground/45",
  orange: "border-2 border-foreground bg-transparent",
  pink: "bg-foreground/25",
  red: "border-2 border-foreground/60 bg-foreground/10",
};

const toInputValue = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

export interface TaskFormValues {
  title: string;
  description: string;
  start_time: string;
  end_time: string;
  color: TaskColor;
}

const emptyForm: TaskFormValues = { title: "", description: "", start_time: "", end_time: "", color: "blue" };

export interface TaskFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Tâche à éditer, ou null/undefined pour une création. */
  task?: AdminTask | null;
  /** Pré-remplit la date de début lors d'une création (ex: clic sur une case du calendrier). */
  defaultDate?: Date | null;
  submitting: boolean;
  onSubmit: (values: TaskFormValues) => void;
}

/**
 * Formulaire de création/édition d'une tâche admin. N'expose que les champs
 * réellement supportés par le modèle (admin_tasks) : titre, description,
 * horaires, couleur — pas de priorité/type/responsable externe/récurrence,
 * ces champs n'existent pas côté backend.
 */
export function TaskFormDialog({ open, onOpenChange, task, defaultDate, submitting, onSubmit }: TaskFormDialogProps) {
  const [values, setValues] = useState<TaskFormValues>(emptyForm);
  const [errors, setErrors] = useState<{ title?: string; end_time?: string }>({});

  useEffect(() => {
    if (!open) return;
    if (task) {
      setValues({
        title: task.title,
        description: task.description || "",
        start_time: toInputValue(task.start_time),
        end_time: toInputValue(task.end_time),
        color: task.color,
      });
    } else if (defaultDate) {
      const start = new Date(defaultDate);
      start.setHours(9, 0, 0, 0);
      const end = new Date(defaultDate);
      end.setHours(10, 0, 0, 0);
      setValues({ ...emptyForm, start_time: toInputValue(start.toISOString()), end_time: toInputValue(end.toISOString()) });
    } else {
      setValues(emptyForm);
    }
    setErrors({});
  }, [open, task, defaultDate]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors: typeof errors = {};
    if (!values.title.trim()) nextErrors.title = "Le titre est requis";
    if (values.start_time && values.end_time && new Date(values.end_time) <= new Date(values.start_time)) {
      nextErrors.end_time = "La fin doit être après le début";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    onSubmit(values);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{task ? "Modifier la tâche" : "Nouvelle tâche"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="task-title">Titre</Label>
            <Input
              id="task-title"
              value={values.title}
              onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
              placeholder="Ex : Relancer les pros en attente de vérification"
              aria-invalid={!!errors.title}
              aria-describedby={errors.title ? "task-title-error" : undefined}
            />
            {errors.title ? <p id="task-title-error" className="text-xs text-foreground/80">{errors.title}</p> : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-description">Description</Label>
            <Textarea
              id="task-description"
              rows={3}
              value={values.description}
              onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="task-start">Début</Label>
              <Input
                id="task-start"
                type="datetime-local"
                required
                value={values.start_time}
                onChange={(e) => setValues((v) => ({ ...v, start_time: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-end">Fin</Label>
              <Input
                id="task-end"
                type="datetime-local"
                required
                value={values.end_time}
                onChange={(e) => setValues((v) => ({ ...v, end_time: e.target.value }))}
                aria-invalid={!!errors.end_time}
                aria-describedby={errors.end_time ? "task-end-error" : undefined}
              />
              {errors.end_time ? <p id="task-end-error" className="text-xs text-foreground/80">{errors.end_time}</p> : null}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Catégorie</Label>
            <div className="flex gap-2" role="radiogroup" aria-label="Catégorie de la tâche">
              {(Object.keys(COLOR_DOT) as TaskColor[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={values.color === c}
                  onClick={() => setValues((v) => ({ ...v, color: c }))}
                  className={`w-7 h-7 rounded-full ${COLOR_DOT[c]} ${values.color === c ? "ring-2 ring-offset-2 ring-foreground" : ""} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
                  aria-label={`Catégorie ${c}`}
                />
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {task ? "Enregistrer" : "Créer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export { COLOR_DOT };
