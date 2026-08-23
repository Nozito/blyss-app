import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  Clock,
  RefreshCw,
  List,
  Grid3x3,
  Search,
  X,
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  ListChecks,
  CheckCircle2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/admin/PageHeader";
import { KpiCard } from "@/components/admin/KpiCard";
import { EmptyState } from "@/components/admin/EmptyState";
import { ErrorState } from "@/components/admin/ErrorState";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { TaskFormDialog, type TaskFormValues, COLOR_DOT } from "@/components/admin/tasks/TaskFormDialog";
import { TaskRow } from "@/components/admin/tasks/TaskRow";
import type { AdminTask, TaskStatus } from "@/components/admin/tasks/types";
import { useAuth } from "@/contexts/AuthContext";

const API_URL = import.meta.env.VITE_API_URL || "";

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** Toutes les journées (clé YYYY-M-D) couvertes par une tâche, du jour de
 * début au jour de fin inclus — pour afficher correctement les tâches qui
 * s'étendent sur plusieurs jours dans le calendrier. */
const taskDayKeys = (task: AdminTask): string[] => {
  const start = new Date(task.start_time);
  const end = new Date(task.end_time);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return [];
  const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const keys: string[] = [];
  let guard = 0;
  while (cur <= last && guard < 62) {
    keys.push(dayKey(cur));
    cur.setDate(cur.getDate() + 1);
    guard += 1;
  }
  return keys;
};

type Bucket = "overdue" | "today" | "week" | "later" | "done";

const AdminTasks = () => {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<AdminTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<"calendar" | "list">("calendar");

  // Toolbar
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | TaskStatus>("all");
  const [mineOnly, setMineOnly] = useState(false);

  // Formulaire / suppression
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<AdminTask | null>(null);
  const [createDate, setCreateDate] = useState<Date | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminTask | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchTasks = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    setLoadError(false);
    try {
      const response = await fetch(`${API_URL}/api/admin/tasks`, { credentials: "include" });
      if (response.ok) {
        const data = await response.json();
        setTasks(data.data || []);
      } else {
        setLoadError(true);
      }
    } catch {
      setLoadError(true);
      toast.error("Erreur lors du chargement des tâches");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  const openCreate = (date?: Date) => {
    setSelectedTask(null);
    setCreateDate(date ?? new Date());
    setIsDialogOpen(true);
  };

  const openEdit = (task: AdminTask) => {
    setSelectedTask(task);
    setCreateDate(null);
    setIsDialogOpen(true);
  };

  const handleSubmit = async (values: TaskFormValues) => {
    setSubmitting(true);
    try {
      const body = {
        title: values.title,
        description: values.description || undefined,
        start_time: new Date(values.start_time).toISOString(),
        end_time: new Date(values.end_time).toISOString(),
        color: values.color,
      };
      const url = selectedTask ? `${API_URL}/api/admin/tasks/${selectedTask.id}` : `${API_URL}/api/admin/tasks/create`;
      const response = await fetch(url, {
        method: selectedTask ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const responseData = await response.json();
      if (response.ok) {
        toast.success(selectedTask ? "Tâche modifiée" : "Tâche créée");
        setIsDialogOpen(false);
        fetchTasks();
      } else {
        toast.error(responseData.message || "Une erreur est survenue");
      }
    } catch {
      toast.error("Erreur de connexion au serveur");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdvanceStatus = async (task: AdminTask) => {
    const nextStatus: TaskStatus = task.status === "pending" ? "in_progress" : "done";
    try {
      const response = await fetch(`${API_URL}/api/admin/tasks/${task.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: nextStatus }),
      });
      if (response.ok) {
        setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus, updated_at: new Date().toISOString() } : t)));
      } else {
        toast.error("Impossible de modifier le statut (tâche d'un autre admin ?)");
      }
    } catch {
      toast.error("Erreur serveur");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/admin/tasks/${deleteTarget.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (response.ok) {
        toast.success("Tâche supprimée");
        setDeleteTarget(null);
        fetchTasks();
      } else {
        toast.error("Suppression impossible (tâche d'un autre admin ?)");
        setDeleteTarget(null);
      }
    } catch {
      toast.error("Erreur serveur");
      setDeleteTarget(null);
    } finally {
      setDeleteLoading(false);
    }
  };

  const resetFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setMineOnly(false);
  };

  const filtersActive = search.trim() !== "" || statusFilter !== "all" || mineOnly;

  const filteredTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      const matchesSearch = !q || t.title.toLowerCase().includes(q) || (t.description ?? "").toLowerCase().includes(q);
      const matchesStatus = statusFilter === "all" || t.status === statusFilter;
      const matchesMine = !mineOnly || t.admin_id === user?.id;
      return matchesSearch && matchesStatus && matchesMine;
    });
  }, [tasks, search, statusFilter, mineOnly, user?.id]);

  // ── Regroupements temporels — mêmes règles pour les KPI, la vue liste et
  // les listes compactes du calendrier. Calculés une fois par changement de
  // filtre, pas à chaque rendu de cellule. ────────────────────────────────
  const { buckets, kpis } = useMemo(() => {
    const now = new Date();
    const today = dayKey(now);
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const grouped: Record<Bucket, AdminTask[]> = { overdue: [], today: [], week: [], later: [], done: [] };

    for (const t of filteredTasks) {
      if (t.status === "done") {
        grouped.done.push(t);
        continue;
      }
      const end = new Date(t.end_time);
      if (end < now) {
        grouped.overdue.push(t);
      } else if (taskDayKeys(t).includes(today)) {
        grouped.today.push(t);
      } else if (new Date(t.start_time) <= weekEnd) {
        grouped.week.push(t);
      } else {
        grouped.later.push(t);
      }
    }

    return {
      buckets: grouped,
      kpis: {
        overdue: grouped.overdue.length,
        today: grouped.today.length,
        week: grouped.week.length,
        pending: filteredTasks.filter((t) => t.status === "pending").length,
        recentlyDone: grouped.done.filter((t) => new Date(t.updated_at) >= sevenDaysAgo).length,
      },
    };
  }, [filteredTasks]);

  // ── Grille du mois — chaque tâche est indexée sur tous les jours qu'elle
  // couvre, pas seulement son jour de début. ──────────────────────────────
  const tasksByDay = useMemo(() => {
    const map = new Map<string, AdminTask[]>();
    for (const t of filteredTasks) {
      for (const key of taskDayKeys(t)) {
        const existing = map.get(key);
        if (existing) existing.push(t);
        else map.set(key, [t]);
      }
    }
    return map;
  }, [filteredTasks]);

  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const startDate = new Date(firstDayOfMonth);
  startDate.setDate(startDate.getDate() - startDate.getDay());
  const calendarDays = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    return d;
  });

  const isOwner = (task: AdminTask) => task.admin_id === user?.id;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-9 w-48 rounded-lg" />
          <Skeleton className="h-10 w-32 rounded-xl" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className={`h-28 rounded-2xl ${i === 4 ? "col-span-2 lg:col-span-1" : ""}`} />
          ))}
        </div>
        <Skeleton className="h-[600px] w-full rounded-2xl" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Planning admin" description="Activité et tâches de l'équipe backoffice." />
        <ErrorState title="Impossible de charger le planning" onRetry={() => fetchTasks()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Planning admin"
        description={`${filteredTasks.length} élément${filteredTasks.length > 1 ? "s" : ""} actif${filteredTasks.length > 1 ? "s" : ""}${filtersActive ? " · filtré" : ""} — visibles par toute l'équipe`}
        actions={
          <>
            <div className="flex items-center gap-1 rounded-xl border-2 border-border bg-card p-1">
              <button
                onClick={() => setView("calendar")}
                aria-pressed={view === "calendar"}
                className={`h-8 px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${view === "calendar" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Grid3x3 size={14} aria-hidden="true" /> Calendrier
              </button>
              <button
                onClick={() => setView("list")}
                aria-pressed={view === "list"}
                className={`h-8 px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${view === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                <List size={14} aria-hidden="true" /> Liste
              </button>
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => fetchTasks(true)}
              disabled={refreshing}
              aria-label="Rafraîchir le planning"
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} aria-hidden="true" />
            </Button>
            <Button onClick={() => openCreate()}>
              <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
              Nouvelle tâche
            </Button>
          </>
        }
      />

      {/* KPI — comparables, même hauteur. La dernière comble la rangée
          incomplète (mobile 2 cols, tablette 3 cols) pour ne jamais laisser
          de trou ; en desktop (5 cols) elle reprend sa place normale. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard icon={AlertTriangle} label="En retard" value={kpis.overdue} />
        <KpiCard icon={CalendarClock} label="Aujourd'hui" value={kpis.today} />
        <KpiCard icon={CalendarDays} label="Cette semaine" value={kpis.week} />
        <KpiCard icon={ListChecks} label="En attente" value={kpis.pending} />
        <KpiCard
          icon={CheckCircle2}
          label="Terminées (7j)"
          value={kpis.recentlyDone}
          className="col-span-2 lg:col-span-1"
        />
      </div>

      {/* Barre d'outils */}
      <div className="flex flex-wrap items-center gap-3 bg-card rounded-2xl border-2 border-border p-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher une tâche..."
            className="pl-9"
            aria-label="Rechercher une tâche par titre ou description"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "all" | TaskStatus)}
          aria-label="Filtrer par statut"
          className="h-10 px-3 rounded-xl border-2 border-border bg-background text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="all">Tous les statuts</option>
          <option value="pending">À faire</option>
          <option value="in_progress">En cours</option>
          <option value="done">Terminées</option>
        </select>
        <button
          onClick={() => setMineOnly((v) => !v)}
          aria-pressed={mineOnly}
          className={`h-10 px-3 rounded-xl border-2 text-sm font-semibold transition-colors ${mineOnly ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
        >
          Mes tâches
        </button>
        {filtersActive && (
          <Button variant="ghost" size="sm" onClick={resetFilters}>
            <X size={14} className="mr-1.5" aria-hidden="true" />
            Réinitialiser
          </Button>
        )}
      </div>

      {view === "calendar" ? (
        <div className="grid lg:grid-cols-3 gap-6 lg:items-start">
          <div className="lg:col-span-2 space-y-3">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
                aria-label="Mois précédent"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </Button>
              <span className="text-lg font-bold text-foreground min-w-[160px] text-center capitalize" aria-live="polite">
                {currentDate.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
              </span>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
                aria-label="Mois suivant"
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>
                Aujourd'hui
              </Button>
            </div>

            <Card className="overflow-hidden">
              <div className="grid grid-cols-7 border-b">
                {["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"].map((d) => (
                  <div key={d} className="border-r p-2 text-center text-xs font-medium text-muted-foreground last:border-r-0">
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {calendarDays.map((day, index) => {
                  const dayTasks = tasksByDay.get(dayKey(day)) ?? [];
                  const isCurrentMonth = day.getMonth() === currentDate.getMonth();
                  const isToday = dayKey(day) === dayKey(new Date());

                  const dateLabel = day.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

                  return (
                    // Pas un <button> : des tâches cliquables vivent à l'intérieur, et un
                    // bouton ne peut pas contenir d'autres éléments interactifs (HTML
                    // invalide + focus/clavier cassés). role="button" + onKeyDown reproduit
                    // le même comportement clavier sans cet imbriquement.
                    <div
                      key={index}
                      role="button"
                      tabIndex={0}
                      onClick={() => openCreate(day)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openCreate(day);
                        }
                      }}
                      aria-label={`${dateLabel} — ${dayTasks.length} tâche${dayTasks.length > 1 ? "s" : ""}, créer une tâche`}
                      className={`min-h-24 border-b border-r p-1.5 last:border-r-0 text-left hover:bg-muted/40 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:z-10 relative ${!isCurrentMonth ? "bg-muted/30" : ""}`}
                    >
                      <div
                        className={`mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                          isToday ? "bg-primary text-primary-foreground font-bold" : "text-muted-foreground"
                        }`}
                      >
                        {day.getDate()}
                      </div>
                      <div className="space-y-1">
                        {dayTasks.slice(0, 3).map((task) => (
                          <button
                            key={task.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              openEdit(task);
                            }}
                            className="w-full flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[11px] font-medium truncate hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            title={task.title}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${COLOR_DOT[task.color]}`} aria-hidden="true" />
                            <span className={`truncate ${task.status === "done" ? "line-through text-muted-foreground" : ""}`}>
                              {task.title}
                            </span>
                          </button>
                        ))}
                        {dayTasks.length > 3 && (
                          <p className="text-[10px] text-muted-foreground px-1.5">+{dayTasks.length - 3}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          {/* Aperçu compact — en retard / aujourd'hui */}
          <div className="space-y-6">
            <div className="bg-card rounded-2xl border-2 border-border p-5">
              <h2 className="text-sm font-bold text-foreground mb-3">En retard</h2>
              {buckets.overdue.length === 0 ? (
                <p className="text-sm text-muted-foreground">Rien en retard.</p>
              ) : (
                <div className="space-y-2">
                  {buckets.overdue.slice(0, 5).map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      isOwner={isOwner(t)}
                      overdue
                      compact
                      onOpen={openEdit}
                      onAdvanceStatus={handleAdvanceStatus}
                      onDelete={setDeleteTarget}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="bg-card rounded-2xl border-2 border-border p-5">
              <h2 className="text-sm font-bold text-foreground mb-3">Aujourd'hui</h2>
              {buckets.today.length === 0 ? (
                <p className="text-sm text-muted-foreground">Rien de prévu aujourd'hui.</p>
              ) : (
                <div className="space-y-2">
                  {buckets.today.slice(0, 5).map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      isOwner={isOwner(t)}
                      compact
                      onOpen={openEdit}
                      onAdvanceStatus={handleAdvanceStatus}
                      onDelete={setDeleteTarget}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {filteredTasks.length === 0 ? (
            <EmptyState
              icon={Clock}
              title={filtersActive ? "Aucune tâche ne correspond à ces filtres" : "Aucune tâche pour le moment"}
              description={filtersActive ? "Essaie une autre recherche ou réinitialise les filtres." : "Crée la première tâche de l'équipe."}
              action={
                filtersActive ? (
                  <Button variant="outline" size="sm" onClick={resetFilters}>Réinitialiser les filtres</Button>
                ) : (
                  <Button size="sm" onClick={() => openCreate()}>Nouvelle tâche</Button>
                )
              }
              className="py-16"
            />
          ) : (
            (
              [
                ["overdue", "En retard"],
                ["today", "Aujourd'hui"],
                ["week", "Cette semaine"],
                ["later", "À venir"],
                ["done", "Terminées"],
              ] as [Bucket, string][]
            ).map(([key, label]) =>
              buckets[key].length === 0 ? null : (
                <div key={key}>
                  <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-2">
                    {label} ({buckets[key].length})
                  </h2>
                  <div className="space-y-2">
                    {buckets[key].map((t) => (
                      <TaskRow
                        key={t.id}
                        task={t}
                        isOwner={isOwner(t)}
                        overdue={key === "overdue"}
                        onOpen={openEdit}
                        onAdvanceStatus={handleAdvanceStatus}
                        onDelete={setDeleteTarget}
                      />
                    ))}
                  </div>
                </div>
              )
            )
          )}
        </div>
      )}

      <TaskFormDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        task={selectedTask}
        defaultDate={createDate}
        submitting={submitting}
        onSubmit={handleSubmit}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Supprimer cette tâche ?"
        description={`"${deleteTarget?.title}" sera définitivement supprimée.`}
        confirmLabel="Supprimer"
        loading={deleteLoading}
        onConfirm={handleDelete}
      />
    </div>
  );
};

export default AdminTasks;
