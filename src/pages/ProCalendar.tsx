import { useState, useEffect, useMemo } from "react";
import MobileLayout from "@/components/MobileLayout";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  Calendar as CalendarIcon,
  Clock,
  User,
  Check,
  Trash2,
  CheckCircle2,
  AlertCircle,
  XCircle,
  MoreVertical,
  Plus,
  Sparkles,
  CalendarOff,
  LayoutList,
  Lock,
  Pencil,
} from "lucide-react";
import api from "@/services/api";

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface TimeSlot {
  id: string;
  time: string;
  duration: number;
  isActive: boolean;
  isAvailable: boolean;
  isPast?: boolean;
}

interface AppointmentStatus {
  status: string;
  label: string;
  color: string;
  icon: any;
  timeInfo?: string | null;
  canComplete: boolean;
  canCancel: boolean;
}

interface TemplateSlot {
  id: string;
  time: string;
  duration: number;
}

interface Unavailability {
  id: number;
  start_date: string;
  end_date: string;
  reason: string | null;
}

// ─── UTILS ────────────────────────────────────────────────────────────────────

/** Formate une Date en YYYY-MM-DD en heure locale (évite le décalage UTC). */
const toLocalDate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const parseDuration = (duration: any): number => {
  if (!duration) return 0;
  if (typeof duration === "number") return Math.abs(duration);
  if (typeof duration === "string") {
    const num = parseInt(duration.replace(/[^\d-]/g, ""), 10);
    return Math.abs(num) || 0;
  }
  return 0;
};

const formatDuration = (minutes: number): string => {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h${m}` : `${h}h`;
  }
  return `${minutes}min`;
};

const canCreateSlot = (date: string, time: string): boolean =>
  new Date(`${date}T${time}:00`) > new Date();

const timeToMinutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

const checkOverlap = (slots: TimeSlot[], time: string, duration: number, excludeId?: string) => {
  const start = timeToMinutes(time);
  const end = start + duration;
  for (const s of slots) {
    if (excludeId && s.id === excludeId) continue;
    if (s.isPast) continue;
    const es = timeToMinutes(s.time);
    const ee = es + parseDuration(s.duration);
    if ((start >= es && start < ee) || (end > es && end <= ee) || (start <= es && end >= ee))
      return true;
  }
  return false;
};

const QUICK_TIMES = ["08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00"];

const mapSlot = (s: any): TimeSlot => ({
  id: s.id.toString(),
  time: s.time,
  duration: parseDuration(s.duration),
  // PostgreSQL lowercases unquoted aliases — read snake_case fields
  isActive: Boolean(s.is_active ?? s.isActive),
  isAvailable: Boolean(s.is_available ?? s.isAvailable),
  isPast: s.computed_status === "past",
});

// ─── NOTIFICATION ─────────────────────────────────────────────────────────────

const Toast = ({ message, type, onClose }: { message: string; type: "success" | "error"; onClose: () => void }) => {
  useEffect(() => { const t = setTimeout(onClose, 2200); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className="fixed bottom-24 left-0 right-0 z-[10000] flex justify-center pointer-events-none px-4">
      <div className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl backdrop-blur-xl border max-w-xs w-full ${
        type === "success" ? "bg-emerald-500/95 border-emerald-400/30" : "bg-red-500/95 border-red-400/30"
      }`} style={{ animation: "toastIn 0.3s cubic-bezier(0.34,1.56,0.64,1)" }}>
        <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
          {type === "success" ? <Check size={14} className="text-white" strokeWidth={3} /> : <X size={14} className="text-white" strokeWidth={3} />}
        </div>
        <p className="text-sm font-semibold text-white">{message}</p>
      </div>
    </div>
  );
};

// ─── BENTO SLOT ────────────────────────────────────────────────────────────────

const BentoSlot = ({
  slot,
  onToggle,
  onDelete,
  onStartEdit,
  isEditing,
}: {
  slot: TimeSlot;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onStartEdit: (id: string) => void;
  isEditing: boolean;
}) => {
  const endMin = timeToMinutes(slot.time) + parseDuration(slot.duration);
  const endTime = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;
  const dur = formatDuration(parseDuration(slot.duration));

  const isBooked = !slot.isAvailable && !slot.isPast;
  const isOpen   = slot.isAvailable && slot.isActive && !slot.isPast;
  const canEdit  = !slot.isPast && !isBooked;

  const cardClass = isEditing
    ? "bg-primary/5 border-primary/40 ring-2 ring-primary/20 cursor-default"
    : slot.isPast
    ? "bg-muted/30 border-border opacity-40 cursor-default"
    : isBooked
    ? "bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200/70 cursor-default"
    : isOpen
    ? "bg-gradient-to-br from-pink-50 to-rose-50/60 border-primary/25 active:scale-[0.97] cursor-pointer"
    : "bg-muted/50 border-border/60 active:scale-[0.97] cursor-pointer opacity-70";

  const dotClass = slot.isPast
    ? "bg-muted-foreground/25"
    : isBooked
    ? "bg-blue-400 shadow-[0_0_6px_1px] shadow-blue-300/60"
    : isOpen
    ? "bg-primary shadow-[0_0_6px_1px] shadow-primary/40"
    : "bg-muted-foreground/35";

  const timeColor = isEditing ? "text-primary" : isBooked ? "text-blue-700" : isOpen ? "text-primary" : "text-muted-foreground";

  const handleCardClick = () => {
    if (!slot.isPast && slot.isAvailable && !isEditing) onToggle(slot.id);
  };

  return (
    <div
      className={`relative rounded-2xl p-3.5 border transition-all duration-200 select-none ${cardClass}`}
      onClick={handleCardClick}
    >
      {/* Actions — edit + delete for non-booked, non-past slots */}
      {canEdit && (
        <div className="absolute top-2 right-2 flex gap-1 z-10">
          <button
            onClick={(e) => { e.stopPropagation(); onStartEdit(slot.id); }}
            className={`w-6 h-6 rounded-full flex items-center justify-center active:scale-90 transition-all ${isEditing ? "bg-primary text-white" : "hover:bg-black/10"}`}
          >
            <Pencil size={9} className={isEditing ? "text-white" : "text-foreground/40"} strokeWidth={2.5} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(slot.id); }}
            className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-destructive/10 active:scale-90 transition-all"
          >
            <X size={10} className="text-foreground/30" strokeWidth={2.5} />
          </button>
        </div>
      )}

      {/* Status dot */}
      <div className={`w-2 h-2 rounded-full mb-3 mt-0.5 ${dotClass}`} />

      {/* Time */}
      <p className={`text-2xl font-black leading-none tracking-tight ${slot.isPast ? "line-through text-muted-foreground" : timeColor}`}>
        {slot.time}
      </p>
      <p className="text-[10px] text-muted-foreground/70 mt-1 mb-3 font-medium">
        → {endTime} · {dur}
      </p>

      {/* Status pill */}
      <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
        slot.isPast
          ? "bg-muted text-muted-foreground"
          : isBooked
          ? "bg-blue-100 text-blue-600"
          : isOpen
          ? "bg-primary/15 text-primary"
          : "bg-muted text-muted-foreground/60"
      }`}>
        {slot.isPast ? "Passé" : isBooked ? (<><Lock size={7} strokeWidth={3} />Réservé</>) : isOpen ? "Ouvert" : "Bloqué"}
      </div>
    </div>
  );
};

// ─── COMPONENT ────────────────────────────────────────────────────────────────

const ProCalendar = () => {
  const months = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
  const daysOfWeek = ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];
  const daysOfWeekFull = ["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"];

  // ── calendar state
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<"month" | "week">("month");

  // ── ui state
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddSlot, setShowAddSlot] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // ── modal state
  const [showActionsModal, setShowActionsModal] = useState(false);
  const [showWeeklyModal, setShowWeeklyModal] = useState(false);
  const [showUnavailModal, setShowUnavailModal] = useState(false);

  // ── weekly modal quick-add
  const [showTemplateAdd, setShowTemplateAdd] = useState(false);
  const [templateNewTime, setTemplateNewTime] = useState("09:00");
  const [templateNewDur, setTemplateNewDur] = useState(60);

  // ── data
  const [appointments, setAppointments] = useState<any[]>([]);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [selectedAppointment, setSelectedAppointment] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── add-slot form
  const [newSlotTime, setNewSlotTime] = useState("09:00");
  const [newSlotDuration, setNewSlotDuration] = useState(60);

  // ── edit-slot
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [editTime, setEditTime] = useState("09:00");
  const [editDur, setEditDur] = useState(60);

  // ── unavailabilities
  const [unavailabilities, setUnavailabilities] = useState<Unavailability[]>([]);
  const [unavailStartDate, setUnavailStartDate] = useState("");
  const [unavailEndDate, setUnavailEndDate] = useState("");
  const [unavailReason, setUnavailReason] = useState("");
  const [unavailSaving, setUnavailSaving] = useState(false);

  // ── weekly planning
  const [templateSlots, setTemplateSlots] = useState<TemplateSlot[]>([]);
  const [selectedDays, setSelectedDays] = useState<boolean[]>([true,true,true,true,true,false,false]);

  // ─── helpers
  const notify = (message: string, type: "success" | "error" = "success") => setToast({ message, type });

  const getWeekDates = (base?: Date) => {
    const d = base || selectedDate;
    const monday = new Date(d);
    const dow = monday.getDay();
    monday.setDate(monday.getDate() - (dow === 0 ? 6 : dow - 1));
    return Array.from({ length: 7 }, (_, i) => {
      const x = new Date(monday);
      x.setDate(x.getDate() + i);
      return x;
    });
  };

  // ─── calendar helpers
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const startingDay = (firstDay.getDay() + 6) % 7;
    const total = new Date(year, month + 1, 0).getDate();
    const days: (number | null)[] = Array(startingDay).fill(null);
    for (let i = 1; i <= total; i++) days.push(i);
    return days;
  };

  const hasAppointments = (day: number) => {
    const key = toLocalDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), day));
    return appointments.some((apt) => toLocalDate(new Date(apt.date)) === key);
  };

  const isToday = (day: number) => {
    const t = new Date();
    return day === t.getDate() && currentDate.getMonth() === t.getMonth() && currentDate.getFullYear() === t.getFullYear();
  };

  const isSelected = (day: number) =>
    day === selectedDate.getDate() &&
    currentDate.getMonth() === selectedDate.getMonth() &&
    currentDate.getFullYear() === selectedDate.getFullYear();

  const isUnavailableDay = (day: number) => {
    const d = toLocalDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), day));
    return unavailabilities.some((u) => d >= u.start_date && d <= u.end_date);
  };

  const navigateMonth = (dir: number) =>
    setCurrentDate((p) => new Date(p.getFullYear(), p.getMonth() + dir, 1));

  const navigateWeek = (dir: number) => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + dir * 7);
    setSelectedDate(next);
  };

  const goToToday = () => {
    const t = new Date();
    setSelectedDate(t);
    setCurrentDate(new Date(t.getFullYear(), t.getMonth(), 1));
  };

  // ─── appointment status
  const getAppointmentStatus = useMemo(() => (apt: any): AppointmentStatus => {
    if (apt.status === "completed") return { status: "completed", label: "Terminé", color: "emerald", icon: CheckCircle2, canComplete: false, canCancel: false };
    if (apt.status === "cancelled") return { status: "cancelled", label: "Annulé", color: "red", icon: XCircle, canComplete: false, canCancel: false };

    const now = new Date();
    const aptDate = new Date(apt.date);
    const [h, m] = apt.time.split(":");
    aptDate.setHours(parseInt(h, 10), parseInt(m, 10), 0, 0);
    const diffMin = Math.floor((aptDate.getTime() - now.getTime()) / 60000);
    const dur = parseDuration(apt.duration);

    if (diffMin > 0) {
      const days = Math.floor(diffMin / 1440);
      const hours = Math.floor(diffMin / 60);
      const timeInfo = days > 0 ? `Dans ${days}j` : hours > 0 ? `Dans ${hours}h${diffMin % 60 > 0 ? diffMin % 60 : ""}` : `Dans ${diffMin}min`;
      return { status: "pending", label: "À venir", color: "amber", icon: AlertCircle, timeInfo, canComplete: false, canCancel: true };
    }
    if (diffMin <= 0 && diffMin >= -dur) {
      return { status: "ongoing", label: "En cours", color: "blue", icon: Clock, timeInfo: `${dur + diffMin}min restantes`, canComplete: true, canCancel: false };
    }
    return { status: "past_pending", label: "À valider", color: "violet", icon: Clock, timeInfo: null, canComplete: true, canCancel: true };
  }, []);

  const getStatusClasses = (color: string) => ({
    emerald: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
    blue: "bg-blue-500/10 text-blue-700 border-blue-200",
    violet: "bg-violet-500/10 text-violet-700 border-violet-200",
    amber: "bg-amber-500/10 text-amber-700 border-amber-200",
    red: "bg-red-500/10 text-red-700 border-red-200",
  }[color] || "bg-amber-500/10 text-amber-700 border-amber-200");

  const filteredAppointments = useMemo(() => {
    let list = appointments.filter((apt) => toLocalDate(new Date(apt.date)) === toLocalDate(selectedDate));
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((a) => a.client_name?.toLowerCase().includes(q) || a.prestation_name?.toLowerCase().includes(q));
    }
    return list;
  }, [appointments, selectedDate, searchQuery]);

  const activeCount = useMemo(() => slots.filter((s) => s.isActive && !s.isPast).length, [slots]);

  // ─── data actions
  const toggleSlot = async (id: string) => {
    const slot = slots.find((s) => s.id === id);
    if (!slot || slot.isPast || !slot.isAvailable) return;
    setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, isActive: !s.isActive } : s)));
    try {
      await api.pro.updateSlot(parseInt(id), { status: slot.isActive ? "blocked" : "available" });
    } catch {
      setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, isActive: slot.isActive } : s)));
      notify("Erreur lors de la mise à jour", "error");
    }
  };

  const startEditSlot = (id: string) => {
    if (editingSlotId === id) { setEditingSlotId(null); return; }
    const slot = slots.find((s) => s.id === id);
    if (!slot) return;
    setEditTime(slot.time);
    setEditDur(parseDuration(slot.duration));
    setEditingSlotId(id);
    setShowAddSlot(false);
  };

  const confirmEditSlot = async () => {
    if (!editingSlotId || !selectedDate) return;
    const date = toLocalDate(selectedDate);
    if (!canCreateSlot(date, editTime)) {
      notify("Heure déjà passée", "error");
      return;
    }
    if (checkOverlap(slots, editTime, editDur, editingSlotId)) {
      notify("Chevauchement avec un autre créneau", "error");
      return;
    }
    const prev = slots.find((s) => s.id === editingSlotId);
    setEditingSlotId(null);
    try {
      await api.pro.updateSlot(parseInt(editingSlotId), { date, time: editTime, duration: editDur });
      const res = await api.pro.getSlots({ date });
      if (res.success && res.data) setSlots(res.data.map(mapSlot));
      notify("Créneau modifié ✓");
    } catch {
      if (prev) setSlots((p) => p.map((s) => (s.id === prev.id ? prev : s)));
      notify("Erreur lors de la modification", "error");
    }
  };

  const addSlot = async () => {
    if (!selectedDate || !newSlotTime) return;
    const date = toLocalDate(selectedDate);

    if (!canCreateSlot(date, newSlotTime)) {
      notify("Impossible de créer un créneau dans le passé", "error");
      return;
    }
    if (checkOverlap(slots, newSlotTime, newSlotDuration)) {
      notify("Ce créneau chevauche un créneau existant", "error");
      return;
    }

    try {
      await api.pro.createSlot({ date, time: newSlotTime, duration: newSlotDuration });
      const res = await api.pro.getSlots({ date });
      if (res.success && res.data) setSlots(res.data.map(mapSlot));
      setShowAddSlot(false);
      notify("Créneau ajouté ✓");
    } catch {
      notify("Erreur lors de l'ajout", "error");
    }
  };

  const deleteSlot = async (id: string) => {
    const deleted = slots.find((s) => s.id === id);
    setSlots((prev) => prev.filter((s) => s.id !== id));
    notify("Créneau supprimé");
    try {
      await api.pro.deleteSlot(parseInt(id));
    } catch {
      if (deleted) setSlots((prev) => [...prev, deleted].sort((a, b) => a.time.localeCompare(b.time)));
      notify("Erreur lors de la suppression", "error");
    }
  };

  const handleCompleteAppointment = async (apt: any) => {
    setShowActionsModal(false);
    setAppointments((prev) => prev.map((a) => (a.id === apt.id ? { ...a, status: "completed" } : a)));
    try {
      await api.pro.updateReservationStatus(apt.id, "completed");
      notify("Rendez-vous terminé ✓");
    } catch {
      setAppointments((prev) => prev.map((a) => (a.id === apt.id ? { ...a, status: apt.status } : a)));
      notify("Erreur lors de la mise à jour", "error");
    }
  };

  const handleCancelAppointment = async (apt: any) => {
    setShowActionsModal(false);
    setAppointments((prev) => prev.map((a) => (a.id === apt.id ? { ...a, status: "cancelled" } : a)));
    try {
      await api.pro.updateReservationStatus(apt.id, "cancelled");
      notify("Rendez-vous annulé");
    } catch {
      setAppointments((prev) => prev.map((a) => (a.id === apt.id ? { ...a, status: apt.status } : a)));
      notify("Erreur lors de l'annulation", "error");
    }
  };

  // ─── unavailabilities
  const fetchUnavailabilities = async () => {
    try {
      const res = await api.pro.getUnavailabilities();
      if (res.success && res.data) setUnavailabilities(res.data);
    } catch {}
  };

  const createUnavailability = async () => {
    if (!unavailStartDate || !unavailEndDate) { notify("Sélectionne une période", "error"); return; }
    if (unavailEndDate < unavailStartDate) { notify("La date de fin doit être après le début", "error"); return; }
    setUnavailSaving(true);
    try {
      const res = await api.pro.createUnavailability({ start_date: unavailStartDate, end_date: unavailEndDate, reason: unavailReason || undefined });
      if (res.success) {
        await fetchUnavailabilities();
        setUnavailStartDate(""); setUnavailEndDate(""); setUnavailReason("");
        notify("Période bloquée ✓");
      }
    } catch {
      notify("Erreur lors de l'enregistrement", "error");
    } finally {
      setUnavailSaving(false);
    }
  };

  const removeUnavailability = async (id: number) => {
    const deleted = unavailabilities.find((u) => u.id === id);
    setUnavailabilities((prev) => prev.filter((u) => u.id !== id));
    notify("Période supprimée");
    try {
      await api.pro.deleteUnavailability(id);
    } catch {
      if (deleted) setUnavailabilities((prev) => [...prev, deleted].sort((a, b) => a.start_date.localeCompare(b.start_date)));
      notify("Erreur lors de la suppression", "error");
    }
  };

  const formatUnavailDate = (dateStr: string) => {
    const d = new Date(dateStr.split("T")[0] + "T00:00:00");
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  };

  // ─── weekly template
  const applyWeeklyTemplate = async () => {
    if (templateSlots.length === 0) { notify("Ajoute au moins un créneau", "error"); return; }
    if (!selectedDays.some((d) => d)) { notify("Sélectionne au moins un jour", "error"); return; }

    const weekDates = getWeekDates();
    let created = 0;

    for (const template of templateSlots) {
      for (let i = 0; i < 7; i++) {
        if (!selectedDays[i]) continue;
        const dateStr = toLocalDate(weekDates[i]);
        if (!canCreateSlot(dateStr, template.time)) continue;
        try {
          await api.pro.createSlot({ date: dateStr, time: template.time, duration: template.duration });
          created++;
        } catch {}
      }
    }

    if (created > 0) {
      notify(`${created} créneau${created > 1 ? "x" : ""} créé${created > 1 ? "s" : ""} ✓`);
      setShowWeeklyModal(false);
      setTemplateSlots([]);
      setSelectedDays([true,true,true,true,true,false,false]);
      const res = await api.pro.getSlots({ date: toLocalDate(selectedDate) });
      if (res.success && res.data) setSlots(res.data.map(mapSlot));
    } else {
      notify("Aucun créneau à créer (passés ignorés)", "error");
    }
  };

  // ─── effects
  useEffect(() => { fetchUnavailabilities(); }, []);

  useEffect(() => {
    const fetchAppointments = async () => {
      try {
        setLoading(true);
        setError(null);
        const [mon] = [new Date(selectedDate)];
        const dow = mon.getDay();
        mon.setDate(mon.getDate() - (dow === 0 ? 6 : dow - 1));
        const sun = new Date(mon);
        sun.setDate(sun.getDate() + 6);
        const res = await api.pro.getCalendar({ from: toLocalDate(mon), to: toLocalDate(sun) });
        if (!res.success) throw new Error(res.error || "Erreur serveur");
        setAppointments(res.data || []);
      } catch (e: any) {
        setError(e.message ?? "Erreur inattendue");
      } finally {
        setLoading(false);
      }
    };
    fetchAppointments();
  }, [selectedDate]);

  useEffect(() => {
    const fetchSlots = async () => {
      setSlotsLoading(true);
      try {
        const res = await api.pro.getSlots({ date: toLocalDate(selectedDate) });
        if (res.success && res.data) setSlots(res.data.map(mapSlot));
        else setSlots([]);
      } catch {
        setSlots([]);
      } finally {
        setSlotsLoading(false);
      }
    };
    fetchSlots();
    setShowAddSlot(false);
  }, [selectedDate]);

  useEffect(() => {
    document.body.style.overflow = (showActionsModal || showWeeklyModal || showUnavailModal) ? "hidden" : "unset";
    return () => { document.body.style.overflow = "unset"; };
  }, [showActionsModal, showWeeklyModal, showUnavailModal]);

  // ─── render
  const selectedDateLabel = selectedDate.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const isInCurrentMonthView = selectedDate.getMonth() === currentDate.getMonth() && selectedDate.getFullYear() === currentDate.getFullYear();

  return (
    <MobileLayout hideNav={showActionsModal || showWeeklyModal || showUnavailModal}>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="pb-24">
        {/* ── HEADER ── */}
        <div className="flex items-center justify-between pt-5 pb-4">
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">Agenda</h1>
            <p className="text-xs text-muted-foreground capitalize">{selectedDateLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode((p) => p === "month" ? "week" : "month")}
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-90 ${viewMode === "week" ? "bg-primary shadow-lg shadow-primary/30" : "bg-muted"}`}
            >
              <CalendarIcon size={17} className={viewMode === "week" ? "text-white" : "text-foreground"} strokeWidth={2} />
            </button>
            <button
              onClick={() => setIsSearchOpen((p) => !p)}
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-90 ${isSearchOpen ? "bg-primary text-white shadow-lg shadow-primary/30" : "bg-muted"}`}
            >
              {isSearchOpen ? <X size={17} strokeWidth={2} /> : <Search size={17} strokeWidth={2} />}
            </button>
          </div>
        </div>

        {/* Search */}
        <div className={`overflow-hidden transition-all duration-300 ${isSearchOpen ? "max-h-14 mb-3 opacity-100" : "max-h-0 opacity-0"}`}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher une cliente..."
            className="w-full px-4 py-2.5 rounded-xl bg-card border border-border text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-all"
            autoFocus={isSearchOpen}
          />
        </div>

        {/* ── MONTH VIEW ── */}
        {viewMode === "month" && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => navigateMonth(-1)} className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center active:scale-90 transition-all">
                <ChevronLeft size={18} strokeWidth={2} />
              </button>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-foreground">{months[currentDate.getMonth()]} {currentDate.getFullYear()}</span>
                {!isInCurrentMonthView && (
                  <button onClick={goToToday} className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold active:scale-95 transition-all">
                    Auj.
                  </button>
                )}
              </div>
              <button onClick={() => navigateMonth(1)} className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center active:scale-90 transition-all">
                <ChevronRight size={18} strokeWidth={2} />
              </button>
            </div>

            <div className="bg-card rounded-2xl p-3 border border-border shadow-sm">
              <div className="grid grid-cols-7 gap-1 mb-2">
                {daysOfWeek.map((d) => (
                  <div key={d} className="text-center text-[10px] text-muted-foreground font-bold py-1">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {getDaysInMonth(currentDate).map((day, i) => {
                  const hasApt = day ? hasAppointments(day) : false;
                  const hasUnavail = day ? isUnavailableDay(day) : false;
                  return (
                    <button
                      key={i}
                      onClick={() => {
                        if (!day) return;
                        const d = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
                        setSelectedDate(d);
                      }}
                      disabled={!day}
                      className={`aspect-square rounded-xl flex flex-col items-center justify-center text-sm font-semibold transition-all duration-200 relative
                        ${!day ? "invisible" : ""}
                        ${day && isSelected(day) ? "bg-primary text-white shadow-lg shadow-primary/25 scale-105" : ""}
                        ${day && isToday(day) && !isSelected(day) ? "bg-primary/10 text-primary ring-1 ring-primary/30" : ""}
                        ${day && !isSelected(day) && !isToday(day) && !hasUnavail ? "hover:bg-muted active:scale-95 text-foreground" : ""}
                        ${day && hasUnavail && !isSelected(day) ? "bg-orange-50 text-orange-400 hover:bg-orange-100 active:scale-95" : ""}
                      `}
                    >
                      {day}
                      {(hasApt || hasUnavail) && (
                        <div className="absolute bottom-1 flex gap-0.5">
                          {hasApt && <div className={`w-1 h-1 rounded-full ${isSelected(day!) ? "bg-white" : "bg-primary"}`} />}
                          {hasUnavail && <div className={`w-1 h-1 rounded-full ${isSelected(day!) ? "bg-white" : "bg-orange-400"}`} />}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── WEEK VIEW ── */}
        {viewMode === "week" && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <button onClick={() => navigateWeek(-1)} className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center active:scale-90 transition-all">
                <ChevronLeft size={16} strokeWidth={2} />
              </button>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-muted-foreground">
                  {(() => {
                    const days = getWeekDates();
                    const f = days[0], l = days[6];
                    return f.getMonth() === l.getMonth()
                      ? `${f.getDate()} – ${l.getDate()} ${months[f.getMonth()]}`
                      : `${f.getDate()} ${months[f.getMonth()].slice(0,3)} – ${l.getDate()} ${months[l.getMonth()].slice(0,3)}`;
                  })()}
                </span>
                {!getWeekDates().some((d) => toLocalDate(d) === toLocalDate(new Date())) && (
                  <button onClick={goToToday} className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold active:scale-95 transition-all">
                    Auj.
                  </button>
                )}
              </div>
              <button onClick={() => navigateWeek(1)} className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center active:scale-90 transition-all">
                <ChevronRight size={16} strokeWidth={2} />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {getWeekDates().map((date, i) => {
                const isActiveDay = toLocalDate(date) === toLocalDate(selectedDate);
                const isTodayDate = toLocalDate(date) === toLocalDate(new Date());
                const hasApt = appointments.some((a) => toLocalDate(new Date(a.date)) === toLocalDate(date));
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedDate(date)}
                    className={`flex flex-col items-center py-2.5 rounded-xl transition-all duration-200 relative active:scale-90
                      ${isActiveDay ? "bg-primary shadow-lg shadow-primary/25" : isTodayDate ? "bg-primary/10 ring-1 ring-primary/20" : "bg-card border border-border"}
                    `}
                  >
                    <span className={`text-[9px] font-bold mb-0.5 ${isActiveDay ? "text-white/70" : "text-muted-foreground"}`}>
                      {daysOfWeek[(date.getDay() + 6) % 7]}
                    </span>
                    <span className={`text-base font-black ${isActiveDay ? "text-white" : isTodayDate ? "text-primary" : "text-foreground"}`}>
                      {date.getDate()}
                    </span>
                    {hasApt && <div className={`w-1 h-1 rounded-full mt-0.5 ${isActiveDay ? "bg-white" : "bg-primary"}`} />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── CRÉNEAUX DU JOUR ── */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-bold text-foreground">Créneaux</h3>
              <p className="text-[11px] text-muted-foreground">
                {slotsLoading ? "Chargement..." : `${activeCount} ouvert${activeCount !== 1 ? "s" : ""} · ${slots.filter(s => !s.isAvailable && !s.isPast).length} réservé${slots.filter(s => !s.isAvailable && !s.isPast).length !== 1 ? "s" : ""}`}
              </p>
            </div>
            <button
              onClick={() => { setShowAddSlot((p) => !p); if (!showAddSlot) setNewSlotTime("09:00"); }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all active:scale-90 shadow-sm ${
                showAddSlot ? "bg-muted text-foreground" : "bg-primary text-white shadow-primary/25"
              }`}
            >
              {showAddSlot ? <X size={14} strokeWidth={2.5} /> : <Plus size={14} strokeWidth={2.5} />}
              {showAddSlot ? "Annuler" : "Ajouter"}
            </button>
          </div>

          {/* Add slot form */}
          {showAddSlot && (
            <div className="bg-card rounded-2xl p-4 border-2 border-primary/20 mb-3 shadow-sm">
              {/* Quick time presets */}
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-2">Heure de début</p>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {QUICK_TIMES.map((t) => (
                  <button
                    key={t}
                    onClick={() => setNewSlotTime(t)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all active:scale-90 ${
                      newSlotTime === t ? "bg-primary text-white shadow-sm shadow-primary/25" : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {/* Custom time input */}
              <div className="flex items-center gap-2 mb-3">
                <input
                  type="time"
                  value={newSlotTime}
                  onChange={(e) => setNewSlotTime(e.target.value)}
                  className="flex-1 px-3 py-2.5 rounded-xl bg-muted border border-border text-foreground text-sm font-bold focus:outline-none focus:border-primary/50 transition-all"
                />
                <select
                  value={newSlotDuration}
                  onChange={(e) => setNewSlotDuration(parseInt(e.target.value))}
                  className="flex-1 px-3 py-2.5 rounded-xl bg-muted border border-border text-foreground text-sm font-bold focus:outline-none focus:border-primary/50 transition-all"
                >
                  <option value={30}>30 min</option>
                  <option value={45}>45 min</option>
                  <option value={60}>1 heure</option>
                  <option value={90}>1h30</option>
                  <option value={120}>2 heures</option>
                  <option value={150}>2h30</option>
                  <option value={180}>3 heures</option>
                </select>
              </div>

              <button
                onClick={addSlot}
                className="w-full py-3 rounded-xl bg-primary text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-primary/25 active:scale-95 transition-all"
              >
                <Check size={16} strokeWidth={2.5} />
                Créer le créneau · {newSlotTime} ({formatDuration(newSlotDuration)})
              </button>
            </div>
          )}

          {/* Slots loading */}
          {slotsLoading && (
            <div className="flex items-center justify-center py-6">
              <div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
            </div>
          )}

          {/* Slots bento grid */}
          {!slotsLoading && slots.filter((s) => !s.isPast).length > 0 && (
            <>
              <div className="grid grid-cols-2 gap-3">
                {slots.filter((slot) => !slot.isPast).map((slot) => (
                  <BentoSlot
                    key={slot.id}
                    slot={slot}
                    onToggle={toggleSlot}
                    onDelete={deleteSlot}
                    onStartEdit={startEditSlot}
                    isEditing={editingSlotId === slot.id}
                  />
                ))}
              </div>

              {/* Edit panel — full width, below the grid */}
              {editingSlotId && (() => {
                const editingSlot = slots.find((s) => s.id === editingSlotId);
                return editingSlot ? (
                  <div className="mt-3 bg-card border-2 border-primary/25 rounded-2xl p-4 shadow-sm">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2.5">
                      Modifier · {editingSlot.time}
                    </p>
                    {/* Time chips */}
                    <div className="grid grid-cols-4 gap-1.5 mb-3">
                      {QUICK_TIMES.map((t) => (
                        <button
                          key={t}
                          onClick={() => setEditTime(t)}
                          className={`py-2 rounded-xl text-xs font-bold transition-all active:scale-90 ${
                            editTime === t
                              ? "bg-primary text-white shadow-sm shadow-primary/30"
                              : "bg-muted text-muted-foreground hover:bg-muted/80"
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                    {/* Duration pills */}
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {[30, 45, 60, 90, 120, 150, 180].map((d) => (
                        <button
                          key={d}
                          onClick={() => setEditDur(d)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-90 ${
                            editDur === d
                              ? "bg-primary text-white shadow-sm shadow-primary/30"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {formatDuration(d)}
                        </button>
                      ))}
                    </div>
                    {/* Actions */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditingSlotId(null)}
                        className="flex-1 py-2.5 rounded-xl bg-muted text-foreground font-bold text-sm active:scale-95 transition-all"
                      >
                        Annuler
                      </button>
                      <button
                        onClick={confirmEditSlot}
                        className="flex-[2] py-2.5 rounded-xl bg-primary text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-primary/25 active:scale-95 transition-all"
                      >
                        <Check size={15} strokeWidth={2.5} />
                        {editTime} · {formatDuration(editDur)}
                      </button>
                    </div>
                  </div>
                ) : null;
              })()}
            </>
          )}

          {/* Empty state */}
          {!slotsLoading && slots.filter((s) => !s.isPast).length === 0 && !showAddSlot && (
            <button
              onClick={() => setShowAddSlot(true)}
              className="w-full rounded-2xl p-5 border-2 border-dashed border-border hover:border-primary/40 bg-card/50 hover:bg-card transition-all duration-200 active:scale-[0.99] group"
            >
              <div className="flex flex-col items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <Plus size={20} className="text-primary" strokeWidth={2} />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-foreground">Aucun créneau ce jour</p>
                  <p className="text-xs text-muted-foreground">Appuie pour en ajouter</p>
                </div>
              </div>
            </button>
          )}
        </div>

        {/* ── RENDEZ-VOUS ── */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-bold text-foreground">Rendez-vous</h3>
              <p className="text-[11px] text-muted-foreground">
                {loading ? "Chargement..." : `${filteredAppointments.length} rendez-vous`}
              </p>
            </div>
            {filteredAppointments.length > 0 && (
              <button
                onClick={() => setShowTimeline((v) => !v)}
                className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all active:scale-90 ${showTimeline ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}
              >
                {showTimeline ? <LayoutList size={15} strokeWidth={2} /> : <CalendarIcon size={15} strokeWidth={2} />}
              </button>
            )}
          </div>

          {/* Timeline view */}
          {showTimeline && !loading && filteredAppointments.length > 0 && (
            <div className="bg-card rounded-2xl border border-border p-3 mb-3 overflow-x-hidden">
              <div className="relative" style={{ height: `${14 * 52}px` }}>
                {Array.from({ length: 15 }, (_, i) => i + 8).map((hour) => (
                  <div key={hour} className="absolute left-0 right-0 flex items-start" style={{ top: `${(hour - 8) * 52}px` }}>
                    <span className="text-[9px] text-muted-foreground font-medium w-9 flex-shrink-0 -mt-2">{hour}h</span>
                    <div className="flex-1 border-t border-dashed border-border" />
                  </div>
                ))}
                {filteredAppointments.map((apt) => {
                  const [h, m] = apt.time.split(":").map(Number);
                  const dur = parseDuration(apt.duration);
                  const top = (h - 8) * 52 + (m / 60) * 52;
                  const height = Math.max(28, (dur / 60) * 52);
                  const si = getAppointmentStatus(apt);
                  const colors: Record<string, string> = { emerald: "bg-emerald-100 border-emerald-300 text-emerald-800", blue: "bg-blue-100 border-blue-300 text-blue-800", amber: "bg-amber-100 border-amber-300 text-amber-800", red: "bg-red-100 border-red-300 text-red-700", violet: "bg-violet-100 border-violet-300 text-violet-800" };
                  return (
                    <div
                      key={apt.id}
                      className={`absolute left-10 right-0 rounded-lg border px-2 py-1 cursor-pointer hover:shadow-md transition-shadow overflow-hidden ${colors[si.color] || colors.amber}`}
                      style={{ top: `${top}px`, height: `${height}px` }}
                      onClick={() => { setSelectedAppointment(apt); setShowActionsModal(true); }}
                    >
                      <p className="text-[10px] font-bold truncate">{apt.time} {apt.client_name}</p>
                      {height > 36 && <p className="text-[9px] truncate opacity-70">{apt.prestation_name}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* List view */}
          {!showTimeline && (
            <div className="space-y-2.5">
              {loading ? (
                <div className="bg-card rounded-2xl p-8 text-center border border-border">
                  <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">Chargement...</p>
                </div>
              ) : error ? (
                <div className="bg-card rounded-2xl p-8 text-center border border-border">
                  <p className="text-xs text-destructive font-semibold">{error}</p>
                </div>
              ) : filteredAppointments.length > 0 ? (
                filteredAppointments.map((apt, index) => {
                  const si = getAppointmentStatus(apt);
                  const StatusIcon = si.icon;
                  return (
                    <div
                      key={apt.id}
                      className="bg-card rounded-2xl p-3.5 border border-border hover:border-primary/30 hover:shadow-md transition-all duration-200 group"
                      style={{ animationDelay: `${index * 0.04}s` }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col items-center min-w-[52px]">
                          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-1 group-hover:bg-primary/20 transition-colors">
                            <Clock size={17} className="text-primary" strokeWidth={2} />
                          </div>
                          <p className="text-sm font-black text-foreground leading-none">{apt.time}</p>
                          <p className="text-[9px] text-muted-foreground mt-0.5">{formatDuration(parseDuration(apt.duration))}</p>
                        </div>
                        <div className="w-px h-12 bg-border" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <User size={11} className="text-muted-foreground flex-shrink-0" strokeWidth={2} />
                            <h3 className="font-bold text-sm text-foreground truncate">{apt.client_name}</h3>
                          </div>
                          <p className="text-xs text-muted-foreground truncate mb-1.5">{apt.prestation_name}</p>
                          <div className="flex items-center gap-2">
                            <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-bold ${getStatusClasses(si.color)}`}>
                              <StatusIcon size={9} strokeWidth={2.5} />
                              <span>{si.label}</span>
                            </div>
                            {si.timeInfo && <span className="text-[9px] text-muted-foreground">{si.timeInfo}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="text-base font-black text-primary">{apt.price}€</p>
                          <button
                            onClick={() => { setSelectedAppointment(apt); setShowActionsModal(true); }}
                            className="w-8 h-8 rounded-xl bg-muted/60 hover:bg-muted flex items-center justify-center active:scale-90 transition-all"
                          >
                            <MoreVertical size={15} className="text-foreground" strokeWidth={2} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="bg-card rounded-2xl p-8 text-center border border-dashed border-border">
                  <CalendarIcon size={28} className="text-muted-foreground/40 mx-auto mb-2" strokeWidth={1.5} />
                  <p className="text-sm font-semibold text-foreground mb-1">
                    {searchQuery ? "Aucun résultat" : "Aucun rendez-vous"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {searchQuery ? "Essaye un autre mot-clé" : "Les RDV réservés s'afficheront ici"}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── QUICK ACTIONS ── */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => { setTemplateSlots([]); setSelectedDays([true,true,true,true,true,false,false]); setShowTemplateAdd(false); setTemplateNewTime("09:00"); setTemplateNewDur(60); setShowWeeklyModal(true); }}
            className="bg-card rounded-2xl p-3.5 border border-border hover:border-emerald-300 hover:shadow-md transition-all active:scale-95 group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center group-hover:bg-emerald-500/20 transition-colors">
                <Sparkles size={18} className="text-emerald-600" strokeWidth={2} />
              </div>
              <div className="text-left">
                <p className="text-xs font-bold text-foreground">Planning</p>
                <p className="text-[10px] text-muted-foreground">Semaine type</p>
              </div>
            </div>
          </button>
          <button
            onClick={() => setShowUnavailModal(true)}
            className="bg-card rounded-2xl p-3.5 border border-border hover:border-orange-300 hover:shadow-md transition-all active:scale-95 group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center group-hover:bg-orange-200 transition-colors relative">
                <CalendarOff size={18} className="text-orange-500" strokeWidth={2} />
                {unavailabilities.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-orange-500 text-white text-[9px] font-bold flex items-center justify-center">
                    {unavailabilities.length}
                  </span>
                )}
              </div>
              <div className="text-left">
                <p className="text-xs font-bold text-foreground">Absences</p>
                <p className="text-[10px] text-muted-foreground">Congés, repos</p>
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* ── ACTIONS MODAL (appointment) ── */}
      {showActionsModal && selectedAppointment && (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/50 backdrop-blur-sm" onClick={() => { setShowActionsModal(false); setSelectedAppointment(null); }}>
          <div className="w-full max-w-[430px] bg-card rounded-t-2xl p-5 pb-7 shadow-2xl" style={{ animation: "slideUpModal 0.28s cubic-bezier(0.16,1,0.3,1)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-foreground">Rendez-vous</h3>
              <button onClick={() => { setShowActionsModal(false); setSelectedAppointment(null); }} className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center active:scale-90 transition-all">
                <X size={16} strokeWidth={2} />
              </button>
            </div>
            <div className="mb-4 p-3 rounded-xl bg-muted/30">
              <p className="text-sm font-bold text-foreground">{selectedAppointment.client_name}</p>
              <p className="text-xs text-muted-foreground mb-2">{selectedAppointment.prestation_name}</p>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <Clock size={11} className="text-muted-foreground" strokeWidth={2} />
                  <span className="text-xs font-bold text-foreground">
                    {selectedAppointment.time}
                    {(() => {
                      const dur = parseDuration(selectedAppointment.duration);
                      if (!dur) return null;
                      const [h, m] = selectedAppointment.time.split(":").map(Number);
                      const end = h * 60 + m + dur;
                      return ` → ${String(Math.floor(end / 60)).padStart(2,"0")}:${String(end % 60).padStart(2,"0")}`;
                    })()}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">{formatDuration(parseDuration(selectedAppointment.duration))}</span>
                <span className="text-sm font-black text-primary ml-auto">{selectedAppointment.price}€</span>
              </div>
            </div>
            <div className="space-y-2">
              {(() => {
                const s = getAppointmentStatus(selectedAppointment);
                if (!s.canComplete && !s.canCancel) {
                  return (
                    <div className="p-3 rounded-xl bg-muted/30 text-center">
                      <p className="text-xs text-muted-foreground">
                        {s.status === "completed" ? "✅ Rendez-vous terminé" : s.status === "cancelled" ? "❌ Rendez-vous annulé" : "Aucune action disponible"}
                      </p>
                    </div>
                  );
                }
                return (
                  <>
                    {s.canComplete && (
                      <button onClick={() => handleCompleteAppointment(selectedAppointment)} className="w-full p-4 rounded-xl bg-emerald-500/10 border border-emerald-200 hover:bg-emerald-500/20 active:scale-95 transition-all flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center"><CheckCircle2 size={20} className="text-white" strokeWidth={2} /></div>
                        <div className="text-left"><p className="text-sm font-bold text-foreground">Marquer comme terminé</p><p className="text-xs text-muted-foreground">La prestation a été réalisée</p></div>
                      </button>
                    )}
                    {s.canCancel && (
                      <button onClick={() => handleCancelAppointment(selectedAppointment)} className="w-full p-4 rounded-xl bg-red-500/10 border border-red-200 hover:bg-red-500/20 active:scale-95 transition-all flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-red-500 flex items-center justify-center"><XCircle size={20} className="text-white" strokeWidth={2} /></div>
                        <div className="text-left"><p className="text-sm font-bold text-foreground">Annuler le rendez-vous</p><p className="text-xs text-muted-foreground">La cliente ou toi avez annulé</p></div>
                      </button>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── WEEKLY PLANNING MODAL ── */}
      {showWeeklyModal && (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowWeeklyModal(false)}>
          <div className="w-full max-w-[430px] bg-card rounded-t-3xl shadow-2xl max-h-[92vh] flex flex-col" style={{ animation: "slideUpModal 0.28s cubic-bezier(0.16,1,0.3,1)" }} onClick={(e) => e.stopPropagation()}>

            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 rounded-full bg-border" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-2 pb-4 flex-shrink-0">
              <div>
                <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                  <div className="w-7 h-7 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                    <Sparkles size={14} className="text-emerald-600" strokeWidth={2} />
                  </div>
                  Planning semaine type
                </h3>
                <p className="text-[11px] text-muted-foreground mt-0.5 ml-9">Crée tes créneaux habituels en un geste</p>
              </div>
              <button onClick={() => setShowWeeklyModal(false)} className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center active:scale-90 transition-all">
                <X size={15} strokeWidth={2} />
              </button>
            </div>

            {/* ── JOURS ── */}
            <div className="px-5 pb-4 flex-shrink-0 border-b border-border">
              <div className="flex items-center justify-between mb-2.5">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Jours actifs</p>
                <div className="flex gap-1.5">
                  <button onClick={() => setSelectedDays([true,true,true,true,true,false,false])} className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-700 text-[10px] font-bold active:scale-95 transition-all">Lun–Ven</button>
                  <button onClick={() => setSelectedDays([true,true,true,true,true,true,true])} className="px-2.5 py-1 rounded-lg bg-muted text-muted-foreground text-[10px] font-bold active:scale-95 transition-all">Tous</button>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-1.5">
                {daysOfWeek.map((d, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedDays((prev) => prev.map((v, j) => j === i ? !v : v))}
                    className={`py-2.5 rounded-2xl text-[11px] font-bold transition-all active:scale-90 ${
                      selectedDays[i]
                        ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/25"
                        : "bg-muted/60 text-muted-foreground"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            {/* ── HORAIRES ── */}
            <div className="flex-1 overflow-y-auto px-5 pt-4 pb-2">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Horaires</p>
                <button
                  onClick={() => setShowTemplateAdd((p) => !p)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-90 shadow-sm ${
                    showTemplateAdd ? "bg-muted text-foreground" : "bg-emerald-500 text-white shadow-emerald-500/25"
                  }`}
                >
                  {showTemplateAdd ? <X size={12} strokeWidth={2.5} /> : <Plus size={12} strokeWidth={2.5} />}
                  {showTemplateAdd ? "Annuler" : "Ajouter"}
                </button>
              </div>

              {/* Quick-add panel */}
              {showTemplateAdd && (
                <div className="bg-emerald-50 border-2 border-emerald-200/70 rounded-2xl p-4 mb-3">
                  <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider mb-2.5">Heure de début</p>
                  <div className="grid grid-cols-4 gap-1.5 mb-4">
                    {QUICK_TIMES.map((t) => (
                      <button
                        key={t}
                        onClick={() => setTemplateNewTime(t)}
                        className={`py-2 rounded-xl text-xs font-bold transition-all active:scale-90 ${
                          templateNewTime === t
                            ? "bg-emerald-500 text-white shadow-sm shadow-emerald-500/30"
                            : "bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider mb-2.5">Durée</p>
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {[30, 45, 60, 90, 120, 150, 180].map((d) => (
                      <button
                        key={d}
                        onClick={() => setTemplateNewDur(d)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-90 ${
                          templateNewDur === d
                            ? "bg-emerald-500 text-white shadow-sm shadow-emerald-500/30"
                            : "bg-white border border-emerald-200 text-emerald-700"
                        }`}
                      >
                        {formatDuration(d)}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => {
                      setTemplateSlots((prev) => [...prev, { id: Date.now().toString(), time: templateNewTime, duration: templateNewDur }]);
                      setShowTemplateAdd(false);
                    }}
                    className="w-full py-3 rounded-xl bg-emerald-500 text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-emerald-500/25"
                  >
                    <Check size={15} strokeWidth={2.5} />
                    Ajouter {templateNewTime} · {formatDuration(templateNewDur)}
                  </button>
                </div>
              )}

              {/* Empty state */}
              {templateSlots.length === 0 && !showTemplateAdd && (
                <div className="text-center py-10">
                  <div className="w-12 h-12 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto mb-3">
                    <Clock size={22} className="text-muted-foreground/40" strokeWidth={1.5} />
                  </div>
                  <p className="text-sm font-semibold text-foreground mb-1">Aucun horaire</p>
                  <p className="text-xs text-muted-foreground">Appuie sur Ajouter pour créer tes horaires habituels</p>
                </div>
              )}

              {/* Slot list */}
              <div className="space-y-2 mb-2">
                {templateSlots.map((slot, i) => {
                  const endMin = timeToMinutes(slot.time) + slot.duration;
                  const endTime = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;
                  return (
                    <div key={slot.id} className="flex items-center gap-2" style={{ animationDelay: `${i * 0.04}s` }}>
                      <div className="flex-1 bg-card border border-border rounded-2xl px-4 py-3 flex items-center gap-2.5">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_5px_1px] shadow-emerald-300/60 flex-shrink-0" />
                        <span className="text-base font-black text-foreground">{slot.time}</span>
                        <span className="text-xs text-muted-foreground/40">→</span>
                        <span className="text-xs font-semibold text-muted-foreground">{endTime}</span>
                        <div className="ml-auto px-2 py-0.5 rounded-full bg-emerald-500/10 text-[10px] font-bold text-emerald-600 flex-shrink-0">
                          {formatDuration(slot.duration)}
                        </div>
                      </div>
                      <button
                        onClick={() => setTemplateSlots((prev) => prev.filter((s) => s.id !== slot.id))}
                        className="w-9 h-9 flex-shrink-0 rounded-2xl bg-muted flex items-center justify-center active:scale-90 transition-all hover:bg-destructive/10"
                      >
                        <X size={14} className="text-muted-foreground" strokeWidth={2} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── FOOTER ── */}
            <div className="px-5 pt-3 pb-6 border-t border-border flex-shrink-0">
              {templateSlots.length > 0 && selectedDays.some((d) => d) && (
                <div className="flex items-center gap-2.5 mb-3 px-3.5 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-200/60">
                  <Sparkles size={13} className="text-emerald-600 flex-shrink-0" strokeWidth={2} />
                  <p className="text-xs text-emerald-700 font-semibold">
                    <span className="font-black text-emerald-800">{templateSlots.length * selectedDays.filter((d) => d).length} créneaux</span>
                    {" · "}{templateSlots.length} horaire{templateSlots.length > 1 ? "s" : ""} × {selectedDays.filter((d) => d).length} jour{selectedDays.filter((d) => d).length > 1 ? "s" : ""}
                  </p>
                </div>
              )}
              <button
                onClick={applyWeeklyTemplate}
                disabled={templateSlots.length === 0 || !selectedDays.some((d) => d)}
                className="w-full py-3.5 rounded-2xl bg-emerald-500 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Sparkles size={16} strokeWidth={2.5} />
                Appliquer le planning
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── UNAVAILABILITIES MODAL ── */}
      {showUnavailModal && (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowUnavailModal(false)}>
          <div className="w-full max-w-[430px] bg-card rounded-t-2xl shadow-2xl max-h-[90vh] flex flex-col" style={{ animation: "slideUpModal 0.28s cubic-bezier(0.16,1,0.3,1)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div>
                <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                  <CalendarOff size={18} className="text-orange-500" />
                  Absences & congés
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">Bloque les périodes où tu n'es pas disponible</p>
              </div>
              <button onClick={() => setShowUnavailModal(false)} className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center active:scale-90 transition-all"><X size={16} strokeWidth={2} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="bg-orange-50 rounded-xl p-4 border border-orange-200">
                <p className="text-xs font-bold text-foreground mb-3">Bloquer une période</p>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground font-medium mb-1 block">Du</label>
                    <input type="date" value={unavailStartDate} onChange={(e) => setUnavailStartDate(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-card border border-border text-sm font-semibold focus:outline-none focus:border-orange-400 transition-all" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground font-medium mb-1 block">Au</label>
                    <input type="date" value={unavailEndDate} min={unavailStartDate} onChange={(e) => setUnavailEndDate(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-card border border-border text-sm font-semibold focus:outline-none focus:border-orange-400 transition-all" />
                  </div>
                </div>
                <input
                  type="text"
                  value={unavailReason}
                  onChange={(e) => setUnavailReason(e.target.value)}
                  placeholder="Motif (optionnel) — vacances, formation…"
                  className="w-full px-3 py-2.5 rounded-xl bg-card border border-border text-sm mb-3 focus:outline-none focus:border-orange-400 transition-all placeholder:text-muted-foreground"
                />
                <button
                  onClick={createUnavailability}
                  disabled={!unavailStartDate || !unavailEndDate || unavailSaving}
                  className="w-full py-3 rounded-xl bg-orange-500 text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {unavailSaving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Plus size={16} strokeWidth={2.5} />}
                  Bloquer cette période
                </button>
              </div>

              {unavailabilities.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">Périodes bloquées</p>
                  {unavailabilities.map((u, i) => (
                    <div key={u.id} className="flex items-center gap-3 bg-card rounded-xl px-3 py-2.5 border border-border" style={{ animationDelay: `${i * 0.04}s` }}>
                      <div className="w-8 h-8 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
                        <CalendarOff size={14} className="text-orange-500" strokeWidth={2} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground">
                          {formatUnavailDate(u.start_date)}{u.start_date !== u.end_date ? ` → ${formatUnavailDate(u.end_date)}` : ""}
                        </p>
                        {u.reason && <p className="text-[10px] text-muted-foreground truncate">{u.reason}</p>}
                      </div>
                      <button onClick={() => removeUnavailability(u.id)} className="w-8 h-8 rounded-xl bg-destructive/10 hover:bg-destructive/20 flex items-center justify-center active:scale-90 transition-all flex-shrink-0">
                        <Trash2 size={13} className="text-destructive" strokeWidth={2} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-5">
                  <CalendarOff size={28} className="text-muted-foreground/30 mx-auto mb-2" strokeWidth={1.5} />
                  <p className="text-sm font-semibold text-foreground mb-1">Aucune absence planifiée</p>
                  <p className="text-xs text-muted-foreground">Tes clientes peuvent réserver tous les jours</p>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-border">
              <button onClick={() => setShowUnavailModal(false)} className="w-full py-3 rounded-xl bg-muted text-foreground font-semibold text-sm active:scale-95 transition-all">
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideUpModal { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes toastIn { from { opacity: 0; transform: translateY(16px) scale(0.9); } to { opacity: 1; transform: translateY(0) scale(1); } }
      `}</style>
    </MobileLayout>
  );
};

export default ProCalendar;
