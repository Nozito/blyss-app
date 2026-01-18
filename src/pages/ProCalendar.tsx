import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
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
  Settings,
  Grid3x3,
  Eye,
  Copy,
  Sparkles,
} from "lucide-react";
import api from "@/services/api";

// ========== TYPES ==========
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

interface WeekSlotData {
  [date: string]: TimeSlot[];
}

interface TemplateSlot {
  id: string;
  time: string;
  duration: number;
}

// ========== NOTIFICATION COMPONENT ==========
const Notification = ({ message, type = "success", onClose }: { message: string; type?: "success" | "error"; onClose: () => void }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 2000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center pointer-events-none">
      <div className="pointer-events-auto bg-card/95 backdrop-blur-xl rounded-2xl p-6 shadow-2xl border border-border max-w-xs mx-4 animate-notification">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center animate-bounce-in ${
            type === "success" ? "bg-emerald-500" : "bg-red-500"
          }`}>
            {type === "success" ? (
              <Check size={24} className="text-white" strokeWidth={2.5} />
            ) : (
              <X size={24} className="text-white" strokeWidth={2.5} />
            )}
          </div>
          <p className="text-sm font-semibold text-foreground flex-1">{message}</p>
        </div>
      </div>
    </div>
  );
};

// ========== UTILS ==========
const parseDuration = (duration: any): number => {
  if (!duration) return 0;
  if (typeof duration === 'number') return Math.abs(duration);
  if (typeof duration === 'string') {
    const cleaned = duration.replace(/[^\d-]/g, '');
    const num = parseInt(cleaned, 10);
    return Math.abs(num) || 0;
  }
  return 0;
};

const formatDuration = (minutes: number): string => {
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h${mins}` : `${hours}h`;
  }
  return `${minutes}min`;
};

const toISODate = (d: Date) => d.toISOString().slice(0, 10);

const canCreateSlot = (date: string, time: string): boolean => {
  const now = new Date();
  const slotDateTime = new Date(`${date} ${time}:00`);
  return slotDateTime > now;
};

const timeToMinutes = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

const checkSlotOverlap = (slots: TimeSlot[], newTime: string, newDuration: number, excludeId?: string): boolean => {
  const newStart = timeToMinutes(newTime);
  const newEnd = newStart + newDuration;

  for (const slot of slots) {
    if (excludeId && slot.id === excludeId) continue;
    if (slot.isPast) continue;

    const existingStart = timeToMinutes(slot.time);
    const existingEnd = existingStart + slot.duration;

    if (
      (newStart >= existingStart && newStart < existingEnd) ||
      (newEnd > existingStart && newEnd <= existingEnd) ||
      (newStart <= existingStart && newEnd >= existingEnd)
    ) {
      return true;
    }
  }

  return false;
};

// ========== COMPONENT ==========
const ProCalendar = () => {
  const navigate = useNavigate();
  
  // Calendar states
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [viewMode, setViewMode] = useState<"month" | "week">("month");
  
  // UI states
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSlotsModal, setShowSlotsModal] = useState(false);
  const [showWeeklyModal, setShowWeeklyModal] = useState(false);
  const [showWeekViewModal, setShowWeekViewModal] = useState(false);
  const [showActionsModal, setShowActionsModal] = useState(false);
  const [showAddSlot, setShowAddSlot] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" } | null>(null);
  
  // Data states
  const [appointments, setAppointments] = useState<any[]>([]);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [weekSlots, setWeekSlots] = useState<WeekSlotData>({});
  const [selectedAppointment, setSelectedAppointment] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form states
  const [newSlotTime, setNewSlotTime] = useState("09:00");
  const [newSlotDuration, setNewSlotDuration] = useState(60);

  // Weekly planning states
  const [templateSlots, setTemplateSlots] = useState<TemplateSlot[]>([]);
  const [selectedDays, setSelectedDays] = useState<boolean[]>([true, true, true, true, true, false, false]);

  // Constants
  const daysOfWeek = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
  const daysOfWeekFull = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
  const months = [
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
  ];

  const notify = (message: string, type: "success" | "error" = "success") => {
    setNotification({ message, type });
  };

  // ========== COMPUTED ==========
  const getAppointmentStatus = useMemo(() => (apt: any): AppointmentStatus => {
    if (apt.status === "completed") {
      return {
        status: "completed",
        label: "Terminé",
        color: "emerald",
        icon: CheckCircle2,
        canComplete: false,
        canCancel: false
      };
    }

    if (apt.status === "cancelled") {
      return {
        status: "cancelled",
        label: "Annulé",
        color: "red",
        icon: XCircle,
        canComplete: false,
        canCancel: false
      };
    }

    const now = new Date();
    const aptDate = new Date(apt.date);
    const [hours, minutes] = apt.time.split(':');
    aptDate.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);

    const diffMs = aptDate.getTime() - now.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    const durationMinutes = parseDuration(apt.duration);

    if (diffMinutes > 0) {
      const hours = Math.floor(diffMinutes / 60);
      const days = Math.floor(hours / 24);

      let timeInfo;
      if (days > 0) {
        timeInfo = `Dans ${days}j`;
      } else if (hours > 0) {
        const remainingMins = diffMinutes % 60;
        timeInfo = remainingMins > 0 ? `Dans ${hours}h${remainingMins}` : `Dans ${hours}h`;
      } else {
        timeInfo = `Dans ${diffMinutes}min`;
      }

      return {
        status: "pending",
        label: "En attente",
        color: "amber",
        icon: AlertCircle,
        timeInfo,
        canComplete: false,
        canCancel: true
      };
    }

    if (diffMinutes <= 0 && diffMinutes >= -durationMinutes) {
      const remaining = durationMinutes + diffMinutes;
      return {
        status: "ongoing",
        label: "En cours",
        color: "blue",
        icon: Clock,
        timeInfo: `${remaining}min restantes`,
        canComplete: true,
        canCancel: false
      };
    }

    return {
      status: "past_pending",
      label: "À valider",
      color: "blue",
      icon: Clock,
      timeInfo: null,
      canComplete: true,
      canCancel: true
    };
  }, []);

  const getStatusClasses = (color: string) => {
    const colorMap: Record<string, string> = {
      emerald: "bg-emerald-500/15 text-emerald-700 border-emerald-200",
      blue: "bg-blue-500/15 text-blue-700 border-blue-200",
      amber: "bg-amber-500/15 text-amber-700 border-amber-200",
      red: "bg-red-500/15 text-red-700 border-red-200",
    };
    return colorMap[color] || colorMap.amber;
  };

  const filteredAppointments = useMemo(() => {
    let list = appointments;

    if (selectedDate) {
      const key = toISODate(selectedDate);
      list = list.filter((apt) => toISODate(new Date(apt.date)) === key);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      list = list.filter((apt) =>
        apt.client_name?.toLowerCase().includes(query) ||
        apt.prestation_name?.toLowerCase().includes(query)
      );
    }

    return list;
  }, [appointments, selectedDate, searchQuery]);

  const activeCount = useMemo(() => {
    return slots.filter(s => s.isActive && !s.isPast).length;
  }, [slots]);

  const getWeekDates = () => {
    const base = selectedDate || new Date();
    const monday = new Date(base);
    const dayOfWeek = monday.getDay();
    const diff = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
    monday.setDate(monday.getDate() + diff);

    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(monday);
      date.setDate(date.getDate() + i);
      return date;
    });
  };

  // ========== CALENDAR HELPERS ==========
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDay = (firstDay.getDay() + 6) % 7;

    const days: (number | null)[] = Array(startingDay).fill(null);
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }
    return days;
  };

  const hasAppointments = (day: number) => {
    const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    const key = toISODate(date);
    return appointments.some((apt) => toISODate(new Date(apt.date)) === key);
  };

  const isToday = (day: number) => {
    const today = new Date();
    return (
      day === today.getDate() &&
      currentDate.getMonth() === today.getMonth() &&
      currentDate.getFullYear() === today.getFullYear()
    );
  };

  const isSelected = (day: number) => {
    if (!selectedDate) return false;
    return (
      day === selectedDate.getDate() &&
      currentDate.getMonth() === selectedDate.getMonth() &&
      currentDate.getFullYear() === selectedDate.getFullYear()
    );
  };

  const navigateMonth = (direction: number) => {
    setCurrentDate(prev =>
      new Date(prev.getFullYear(), prev.getMonth() + direction, 1)
    );
  };

  const getWeekDays = () => {
    const base = selectedDate || new Date();
    return Array.from({ length: 5 }, (_, i) => {
      const date = new Date(base);
      date.setDate(date.getDate() + i - 2);
      return date;
    });
  };

  // ========== ACTIONS ==========
  const handleCompleteAppointment = async (apt: any) => {
    try {
      setAppointments(prev => prev.map(a =>
        a.id === apt.id ? { ...a, status: "completed" } : a
      ));
      notify("Rendez-vous marqué comme terminé");
      setShowActionsModal(false);
      setSelectedAppointment(null);
    } catch (error) {
      notify("Erreur lors de la mise à jour", "error");
    }
  };

  const handleCancelAppointment = async (apt: any) => {
    try {
      setAppointments(prev => prev.map(a =>
        a.id === apt.id ? { ...a, status: "cancelled" } : a
      ));
      notify("Rendez-vous annulé");
      setShowActionsModal(false);
      setSelectedAppointment(null);
    } catch (error) {
      notify("Erreur lors de l'annulation", "error");
    }
  };

  const toggleSlot = async (id: string) => {
    const slot = slots.find(s => s.id === id);
    if (!slot || slot.isPast) return;

    try {
      const newStatus = slot.isActive ? 'blocked' : 'available';
      await api.pro.updateSlot(parseInt(id), { status: newStatus });

      setSlots(prev => prev.map(s =>
        s.id === id ? { ...s, isActive: !s.isActive } : s
      ));
      notify(slot.isActive ? "Créneau désactivé" : "Créneau activé");
    } catch (error) {
      notify("Erreur lors de la mise à jour", "error");
    }
  };

  const addSlot = async () => {
    if (!newSlotTime || !selectedDate) return;

    const date = toISODate(selectedDate);
    
    if (!canCreateSlot(date, newSlotTime)) {
      notify("Impossible de créer un créneau dans le passé", "error");
      return;
    }

    if (checkSlotOverlap(slots, newSlotTime, newSlotDuration)) {
      notify("Ce créneau chevauche un créneau existant", "error");
      return;
    }

    try {
      await api.pro.createSlot({
        date,
        time: newSlotTime,
        duration: newSlotDuration
      });

      const res = await api.pro.getSlots({ date });
      if (res.success && res.data) {
        setSlots(res.data.map((s: any) => ({
          id: s.id.toString(),
          time: s.time,
          duration: s.duration,
          isActive: Boolean(s.isActive),
          isAvailable: Boolean(s.isAvailable),
          isPast: s.computed_status === 'past'
        })));
      }

      setShowAddSlot(false);
      setNewSlotTime("09:00");
      setNewSlotDuration(60);
      notify("Créneau ajouté");
    } catch (error) {
      notify("Erreur lors de l'ajout", "error");
    }
  };

  const deleteSlot = async (id: string) => {
    try {
      await api.pro.deleteSlot(parseInt(id));
      setSlots(prev => prev.filter(slot => slot.id !== id));
      notify("Créneau supprimé");
    } catch (error) {
      notify("Erreur lors de la suppression", "error");
    }
  };

  const addTemplateSlot = () => {
    setTemplateSlots(prev => [...prev, {
      id: Date.now().toString(),
      time: "09:00",
      duration: 60
    }]);
  };

  const updateTemplateSlot = (id: string, field: 'time' | 'duration', value: any) => {
    setTemplateSlots(prev => prev.map(slot => 
      slot.id === id ? { ...slot, [field]: value } : slot
    ));
  };

  const removeTemplateSlot = (id: string) => {
    setTemplateSlots(prev => prev.filter(slot => slot.id !== id));
  };

  const toggleDay = (index: number) => {
    setSelectedDays(prev => prev.map((selected, i) => i === index ? !selected : selected));
  };

  const selectAllDays = () => {
    setSelectedDays([true, true, true, true, true, true, true]);
  };

  const selectWeekDays = () => {
    setSelectedDays([true, true, true, true, true, false, false]);
  };

  const applyWeeklyTemplate = async () => {
    if (templateSlots.length === 0) {
      notify("Ajoute au moins un créneau", "error");
      return;
    }

    if (!selectedDays.some(d => d)) {
      notify("Sélectionne au moins un jour", "error");
      return;
    }

    const weekDates = getWeekDates();
    let created = 0;
    let errors = 0;

    for (const template of templateSlots) {
      for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
        if (!selectedDays[dayIndex]) continue;

        const date = weekDates[dayIndex];
        const dateStr = toISODate(date);

        if (!canCreateSlot(dateStr, template.time)) continue;

        try {
          await api.pro.createSlot({
            date: dateStr,
            time: template.time,
            duration: template.duration
          });
          created++;
        } catch (error) {
          errors++;
        }
      }
    }

    if (created > 0) {
      notify(`${created} créneau${created > 1 ? 'x' : ''} créé${created > 1 ? 's' : ''}`);
      setShowWeeklyModal(false);
      setTemplateSlots([]);
      setSelectedDays([true, true, true, true, true, false, false]);
      await fetchWeekSlots();
    } else if (errors > 0) {
      notify("Erreur lors de la création", "error");
    } else {
      notify("Aucun créneau à créer", "error");
    }
  };

  const fetchWeekSlots = async () => {
    try {
      const weekDates = getWeekDates();
      const slotsPromises = weekDates.map(date => 
        api.pro.getSlots({ date: toISODate(date) })
      );

      const results = await Promise.all(slotsPromises);
      
      const weekData: WeekSlotData = {};
      results.forEach((res, index) => {
        const dateKey = toISODate(weekDates[index]);
        if (res.success && res.data) {
          weekData[dateKey] = res.data.map((s: any) => ({
            id: s.id.toString(),
            time: s.time,
            duration: s.duration,
            isActive: Boolean(s.isActive),
            isAvailable: Boolean(s.isAvailable),
            isPast: s.computed_status === 'past'
          }));
        } else {
          weekData[dateKey] = [];
        }
      });

      setWeekSlots(weekData);
    } catch (error) {
      console.error("Error fetching week slots:", error);
      notify("Erreur lors du chargement", "error");
    }
  };

  // ========== EFFECTS ==========
  useEffect(() => {
    document.body.style.overflow = (showSlotsModal || showActionsModal || showWeeklyModal || showWeekViewModal)
      ? 'hidden'
      : 'unset';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [showSlotsModal, showActionsModal, showWeeklyModal, showWeekViewModal]);

  useEffect(() => {
    const fetchAppointments = async () => {
      try {
        setLoading(true);
        setError(null);

        const base = selectedDate || new Date();
        const monday = new Date(base);
        const dayOfWeek = monday.getDay();
        const diff = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
        monday.setDate(monday.getDate() + diff);

        const sunday = new Date(monday);
        sunday.setDate(sunday.getDate() + 6);

        const res = await api.pro.getCalendar({
          from: toISODate(monday),
          to: toISODate(sunday),
        });

        if (!res.success) {
          throw new Error(res.error || "Erreur serveur");
        }

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
    if (!showSlotsModal || !selectedDate) return;

    const fetchSlots = async () => {
      try {
        const date = toISODate(selectedDate);
        const res = await api.pro.getSlots({ date });

        if (res.success && res.data) {
          setSlots(res.data.map((s: any) => ({
            id: s.id.toString(),
            time: s.time,
            duration: s.duration,
            isActive: Boolean(s.isActive),
            isAvailable: Boolean(s.isAvailable),
            isPast: s.computed_status === 'past'
          })));
        }
      } catch (error) {
        console.error('Error fetching slots:', error);
        notify("Erreur lors du chargement", "error");
      }
    };

    fetchSlots();
  }, [showSlotsModal, selectedDate]);

  useEffect(() => {
    if (!selectedDate) return;

    const fetchCurrentDaySlots = async () => {
      try {
        const date = toISODate(selectedDate);
        const res = await api.pro.getSlots({ date });

        if (res.success && res.data) {
          setSlots(res.data.map((s: any) => ({
            id: s.id.toString(),
            time: s.time,
            duration: s.duration,
            isActive: Boolean(s.isActive),
            isAvailable: Boolean(s.isAvailable),
            isPast: s.computed_status === 'past'
          })));
        }
      } catch (error) {
        console.error('Error fetching current day slots:', error);
      }
    };

    fetchCurrentDaySlots();
  }, [selectedDate]);

  useEffect(() => {
    if (showWeekViewModal) {
      fetchWeekSlots();
    }
  }, [showWeekViewModal, selectedDate]);

  useEffect(() => {
    if (showWeeklyModal) {
      setTemplateSlots([]);
      setSelectedDays([true, true, true, true, true, false, false]);
    }
  }, [showWeeklyModal]);

  // ========== RENDER ==========
  return (
    <MobileLayout hideNav={showSlotsModal || showActionsModal || showWeeklyModal || showWeekViewModal}>
      {notification && (
        <Notification
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification(null)}
        />
      )}

      <div className="pb-6 min-h-screen">
        {/* Header */}
        <div className="relative -mx-4 px-4 pt-5 pb-4 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h1 className="text-xl font-bold text-foreground mb-1 tracking-tight animate-fade-in">
                Calendrier
              </h1>
              <p className="text-xs text-muted-foreground animate-fade-in" style={{ animationDelay: "0.05s" }}>
                {filteredAppointments.length} rendez-vous
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewMode(prev => prev === "month" ? "week" : "month")}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 ${
                  viewMode === "week" ? "bg-primary shadow-lg shadow-primary/30" : "bg-muted hover:bg-muted/80"
                } active:scale-90`}
              >
                <CalendarIcon size={18} className={viewMode === "week" ? "text-white" : "text-foreground"} strokeWidth={2} />
              </button>
              <button
                onClick={() => setIsSearchOpen(prev => !prev)}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 ${
                  isSearchOpen ? "bg-primary text-white shadow-lg shadow-primary/30" : "bg-muted hover:bg-muted/80"
                } active:scale-90`}
              >
                {isSearchOpen ? <X size={18} strokeWidth={2} /> : <Search size={18} strokeWidth={2} />}
              </button>
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className={`overflow-hidden transition-all duration-300 ${isSearchOpen ? "max-h-16 mb-4 opacity-100" : "max-h-0 opacity-0"}`}>
          <div className="animate-slide-down">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher une cliente..."
              className="w-full px-4 py-2.5 rounded-xl bg-card border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-all"
              autoFocus={isSearchOpen}
            />
          </div>
        </div>

        {/* Calendar View */}
        {viewMode === "month" ? (
          <>
            <div className="flex items-center justify-between mb-4 animate-slide-up">
              <button onClick={() => navigateMonth(-1)} className="w-9 h-9 rounded-lg bg-muted hover:bg-muted/80 flex items-center justify-center active:scale-90 transition-all duration-200">
                <ChevronLeft size={18} className="text-foreground" strokeWidth={2} />
              </button>
              <h2 className="text-base font-bold text-foreground tracking-tight">
                {months[currentDate.getMonth()]} {currentDate.getFullYear()}
              </h2>
              <button onClick={() => navigateMonth(1)} className="w-9 h-9 rounded-lg bg-muted hover:bg-muted/80 flex items-center justify-center active:scale-90 transition-all duration-200">
                <ChevronRight size={18} className="text-foreground" strokeWidth={2} />
              </button>
            </div>

            <div className="bg-card rounded-xl p-3 mb-5 animate-slide-up border border-border shadow-sm" style={{ animationDelay: "0.05s" }}>
              <div className="grid grid-cols-7 gap-1.5 mb-2">
                {daysOfWeek.map((day, index) => (
                  <div key={day} className="text-center text-[10px] text-muted-foreground font-bold py-1.5 animate-fade-in" style={{ animationDelay: `${index * 0.01}s` }}>
                    {day}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1.5">
                {getDaysInMonth(currentDate).map((day, index) => {
                  const hasApt = day && hasAppointments(day);
                  return (
                    <button
                      key={index}
                      onClick={() => day && setSelectedDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), day))}
                      disabled={!day}
                      className={`
                        aspect-square rounded-lg flex flex-col items-center justify-center text-sm font-semibold
                        transition-all duration-300 relative animate-scale-in
                        ${!day ? "invisible" : ""}
                        ${day && isSelected(day) ? "bg-gradient-to-br from-primary to-primary/90 text-white shadow-lg shadow-primary/30 scale-110" : ""}
                        ${day && isToday(day) && !isSelected(day) ? "bg-primary/10 text-primary ring-1 ring-primary/30" : ""}
                        ${day && !isSelected(day) && !isToday(day) ? "hover:bg-muted hover:scale-105 active:scale-95 text-foreground" : ""}
                      `}
                      style={{ animationDelay: `${index * 0.01}s` }}
                    >
                      {day}
                      {hasApt && (
                        <div className="absolute bottom-1 flex gap-0.5">
                          <div className={`w-1 h-1 rounded-full ${isSelected(day) ? "bg-white" : "bg-primary"} animate-pulse`} />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <div className="mb-5 animate-fade-in">
            <div className="flex items-center justify-center gap-2 overflow-x-auto hide-scrollbar pb-2">
              {getWeekDays().map((date, index) => {
                const isActive = selectedDate && date.getDate() === selectedDate.getDate() && date.getMonth() === selectedDate.getMonth();
                const isTodayDate = date.getDate() === new Date().getDate() && date.getMonth() === new Date().getMonth();

                return (
                  <button
                    key={index}
                    onClick={() => setSelectedDate(date)}
                    className={`
                      flex flex-col items-center px-4 py-2.5 rounded-xl transition-all duration-300 min-w-[65px] animate-scale-in
                      ${isActive ? "bg-gradient-to-br from-primary to-primary/90 shadow-lg shadow-primary/30 scale-110"
                        : isTodayDate ? "bg-primary/10 ring-1 ring-primary/30"
                        : "bg-card border border-border hover:border-primary/30 hover:scale-105"}
                      active:scale-90
                    `}
                    style={{ animationDelay: `${index * 0.05}s` }}
                  >
                    <span className={`text-[10px] font-bold mb-1 ${isActive ? "text-white" : "text-muted-foreground"}`}>
                      {daysOfWeek[(date.getDay() + 6) % 7]}
                    </span>
                    <span className={`text-xl font-bold ${isActive ? "text-white" : "text-foreground"}`}>
                      {date.getDate()}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Slots Management Section */}
        <div className="mb-4 animate-slide-up" style={{ animationDelay: "0.08s" }}>
          <h3 className="text-xs font-bold text-muted-foreground mb-2 uppercase tracking-wide">Gestion des créneaux</h3>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => setShowSlotsModal(true)}
              className="bg-card rounded-xl p-3 border border-border hover:border-primary/40 hover:shadow-lg hover:scale-105 active:scale-95 transition-all duration-300"
            >
              <div className="flex flex-col items-center gap-2">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Settings size={18} className="text-primary" strokeWidth={2} />
                </div>
                <div className="text-center">
                  <p className="text-xs font-bold text-foreground">Aujourd'hui</p>
                  <p className="text-[10px] text-primary font-bold animate-number-change">
                    {activeCount} créneaux
                  </p>
                </div>
              </div>
            </button>

            <button
              onClick={() => setShowWeekViewModal(true)}
              className="bg-card rounded-xl p-3 border border-border hover:border-blue-500/40 hover:shadow-lg hover:scale-105 active:scale-95 transition-all duration-300"
            >
              <div className="flex flex-col items-center gap-2">
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <Eye size={18} className="text-blue-600" strokeWidth={2} />
                </div>
                <div className="text-center">
                  <p className="text-xs font-bold text-foreground">Voir</p>
                  <p className="text-[10px] text-muted-foreground">Semaine</p>
                </div>
              </div>
            </button>

            <button
              onClick={() => setShowWeeklyModal(true)}
              className="bg-card rounded-xl p-3 border border-border hover:border-emerald-500/40 hover:shadow-lg hover:scale-105 active:scale-95 transition-all duration-300"
            >
              <div className="flex flex-col items-center gap-2">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <Sparkles size={18} className="text-emerald-600" strokeWidth={2} />
                </div>
                <div className="text-center">
                  <p className="text-xs font-bold text-foreground">Créer</p>
                  <p className="text-[10px] text-muted-foreground">Planning</p>
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Appointments List */}
        <div className="animate-slide-up" style={{ animationDelay: "0.12s" }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Rendez-vous du jour</h3>
            {filteredAppointments.length > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold animate-bounce-in">
                {filteredAppointments.length}
              </span>
            )}
          </div>

          <div className="space-y-2.5">
            {loading ? (
              <div className="bg-card rounded-xl p-10 text-center border border-border">
                <div className="w-9 h-9 border-3 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-2" />
                <p className="text-xs text-muted-foreground font-medium">Chargement...</p>
              </div>
            ) : error ? (
              <div className="bg-card rounded-xl p-10 text-center border border-border">
                <div className="w-11 h-11 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-2">
                  <X size={22} className="text-destructive" strokeWidth={2} />
                </div>
                <p className="text-xs text-destructive font-semibold">{error}</p>
              </div>
            ) : filteredAppointments.length > 0 ? (
              filteredAppointments.map((apt, index) => {
                const statusInfo = getAppointmentStatus(apt);
                const StatusIcon = statusInfo.icon;
                const duration = parseDuration(apt.duration);

                return (
                  <div
                    key={apt.id}
                    className="bg-card rounded-xl p-3.5 border border-border hover:border-primary/40 hover:shadow-lg transition-all duration-300 animate-slide-up group hover:scale-[1.02]"
                    style={{ animationDelay: `${0.15 + index * 0.05}s` }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col items-center min-w-[55px]">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-1 group-hover:bg-primary/20 transition-colors duration-300">
                          <Clock size={18} className="text-primary" strokeWidth={2} />
                        </div>
                        <p className="text-sm font-bold text-foreground leading-none">{apt.time}</p>
                        <p className="text-[9px] text-muted-foreground font-medium mt-0.5">
                          {formatDuration(duration)}
                        </p>
                      </div>

                      <div className="h-12 w-px bg-border" />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                          <User size={12} className="text-muted-foreground flex-shrink-0" strokeWidth={2} />
                          <h3 className="font-bold text-sm text-foreground truncate">{apt.client_name}</h3>
                        </div>
                        <p className="text-xs text-muted-foreground truncate mb-1.5">{apt.prestation_name}</p>

                        <div className="flex items-center gap-2">
                          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-bold ${getStatusClasses(statusInfo.color)}`}>
                            <StatusIcon size={10} strokeWidth={2.5} />
                            <span>{statusInfo.label}</span>
                          </div>
                          {statusInfo.timeInfo && (
                            <span className="text-[9px] text-muted-foreground font-medium">{statusInfo.timeInfo}</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <p className="text-lg font-bold text-primary whitespace-nowrap">{apt.price}€</p>
                        {(statusInfo.canComplete || statusInfo.canCancel) && (
                          <button
                            onClick={() => {
                              setSelectedAppointment(apt);
                              setShowActionsModal(true);
                            }}
                            className="w-8 h-8 rounded-lg bg-muted/50 hover:bg-muted flex items-center justify-center active:scale-90 transition-all duration-200"
                          >
                            <MoreVertical size={16} className="text-foreground" strokeWidth={2} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="bg-card rounded-xl p-10 text-center border border-dashed border-border">
                <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                  <CalendarIcon size={24} className="text-muted-foreground" strokeWidth={2} />
                </div>
                <p className="text-sm font-semibold text-foreground mb-1">
                  {searchQuery ? "Aucun résultat" : "Aucun rendez-vous"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {searchQuery ? "Essaye un autre mot-clé" : "Les rendez-vous s'afficheront ici"}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

{/* Week View Modal */}
      {showWeekViewModal && (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-[430px] bg-card rounded-t-2xl shadow-2xl animate-slide-up-modal max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div>
                <h3 className="text-lg font-bold text-foreground tracking-tight">Planning de la semaine</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Tous tes créneaux de la semaine
                </p>
              </div>
              <button onClick={() => setShowWeekViewModal(false)} className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center active:scale-90 transition-all duration-200">
                <X size={18} className="text-foreground" strokeWidth={2} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {getWeekDates().map((date, dayIndex) => {
                const dateKey = toISODate(date);
                const daySlots = weekSlots[dateKey] || [];
                const activeSlots = daySlots.filter(s => s.isActive && !s.isPast);
                const isToday = dateKey === toISODate(new Date());

                return (
                  <div
                    key={dayIndex}
                    className="bg-muted/30 rounded-xl p-3 animate-slide-up"
                    style={{ animationDelay: `${dayIndex * 0.05}s` }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h4 className={`text-sm font-bold ${isToday ? 'text-primary' : 'text-foreground'}`}>
                          {daysOfWeekFull[dayIndex]}
                        </h4>
                        <p className="text-[10px] text-muted-foreground">
                          {date.getDate()} {months[date.getMonth()]}
                        </p>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${
                        activeSlots.length > 0 ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                      }`}>
                        {activeSlots.length} créneaux
                      </span>
                    </div>

                    {daySlots.length > 0 ? (
                      <div className="space-y-1.5">
                        {daySlots.map((slot, slotIndex) => (
                          <div
                            key={slot.id}
                            className={`
                              flex items-center justify-between p-2 rounded-lg transition-all duration-200
                              ${slot.isPast ? 'bg-muted/50 opacity-50' :
                                slot.isActive ? 'bg-card shadow-sm' :
                                'bg-muted/70'}
                            `}
                          >
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${
                                slot.isPast ? 'bg-muted-foreground' :
                                slot.isActive ? 'bg-primary animate-pulse' :
                                'bg-muted-foreground/50'
                              }`} />
                              <p className={`text-sm font-bold ${
                                slot.isPast ? 'text-muted-foreground line-through' :
                                'text-foreground'
                              }`}>
                                {slot.time}
                              </p>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {formatDuration(slot.duration)}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-center text-muted-foreground py-3">
                        Aucun créneau
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="p-4 border-t border-border">
              <button
                onClick={() => setShowWeekViewModal(false)}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-primary to-primary/90 text-white font-semibold text-sm active:scale-95 transition-all duration-200 shadow-lg shadow-primary/20"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Actions Modal */}
      {showActionsModal && selectedAppointment && (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-[430px] bg-card rounded-t-2xl p-5 pb-6 shadow-2xl animate-slide-up-modal">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-foreground tracking-tight">Actions</h3>
              <button
                onClick={() => {
                  setShowActionsModal(false);
                  setSelectedAppointment(null);
                }}
                className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center active:scale-90 transition-all duration-200"
              >
                <X size={18} className="text-foreground" strokeWidth={2} />
              </button>
            </div>

            <div className="mb-4 p-3 rounded-xl bg-muted/30">
              <p className="text-sm font-semibold text-foreground mb-0.5">{selectedAppointment.client_name}</p>
              <p className="text-xs text-muted-foreground">{selectedAppointment.time} • {selectedAppointment.prestation_name}</p>
            </div>

            <div className="space-y-2">
              {getAppointmentStatus(selectedAppointment).canComplete && (
                <button
                  onClick={() => handleCompleteAppointment(selectedAppointment)}
                  className="w-full p-4 rounded-xl bg-emerald-500/10 border border-emerald-200 hover:bg-emerald-500/20 active:scale-95 transition-all duration-200 flex items-center gap-3"
                >
                  <div className="w-10 h-10 rounded-lg bg-emerald-500 flex items-center justify-center">
                    <CheckCircle2 size={20} className="text-white" strokeWidth={2} />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-bold text-foreground">Marquer comme terminé</p>
                    <p className="text-xs text-muted-foreground">La prestation a été réalisée</p>
                  </div>
                </button>
              )}

              {getAppointmentStatus(selectedAppointment).canCancel && (
                <button
                  onClick={() => handleCancelAppointment(selectedAppointment)}
                  className="w-full p-4 rounded-xl bg-red-500/10 border border-red-200 hover:bg-red-500/20 active:scale-95 transition-all duration-200 flex items-center gap-3"
                >
                  <div className="w-10 h-10 rounded-lg bg-red-500 flex items-center justify-center">
                    <XCircle size={20} className="text-white" strokeWidth={2} />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-bold text-foreground">Annuler le rendez-vous</p>
                    <p className="text-xs text-muted-foreground">La cliente ou toi avez annulé</p>
                  </div>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Daily Slots Modal */}
      {showSlotsModal && (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-[430px] bg-card rounded-t-2xl shadow-2xl animate-slide-up-modal max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div>
                <h3 className="text-lg font-bold text-foreground tracking-tight">Créneaux du jour</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {selectedDate?.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
              </div>
              <button onClick={() => setShowSlotsModal(false)} className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center active:scale-90 transition-all duration-200">
                <X size={18} className="text-foreground" strokeWidth={2} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
              {slots.map((slot, index) => (
                <div
                  key={slot.id}
                  className={`
                    rounded-xl p-3 border-2 transition-all duration-300 animate-slide-up
                    ${slot.isPast
                      ? 'bg-muted/20 border-muted opacity-50'
                      : slot.isActive
                        ? 'bg-card border-primary/30 shadow-md hover:shadow-lg'
                        : 'bg-muted/30 border-border opacity-60'}
                  `}
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleSlot(slot.id)}
                      disabled={slot.isPast}
                      className={`
                        relative w-12 h-7 rounded-full transition-all duration-300 flex-shrink-0
                        ${slot.isPast
                          ? 'bg-muted-foreground/10 cursor-not-allowed'
                          : slot.isActive
                            ? 'bg-primary shadow-md shadow-primary/30'
                            : 'bg-muted-foreground/20'}
                      `}
                    >
                      <div
                        className={`
                          absolute top-1 w-5 h-5 rounded-full bg-white shadow-md transition-all duration-300
                          ${slot.isActive ? 'left-6' : 'left-1'}
                        `}
                      />
                    </button>

                    <div className="flex-1">
                      <p className={`text-lg font-bold tracking-tight ${
                        slot.isPast
                          ? 'text-muted-foreground line-through'
                          : slot.isActive
                            ? 'text-foreground'
                            : 'text-muted-foreground'
                      }`}>
                        {slot.time}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {slot.isPast
                          ? 'Passé'
                          : slot.isAvailable
                            ? `Disponible • ${formatDuration(slot.duration)}`
                            : `Réservé • ${formatDuration(slot.duration)}`
                        }
                      </p>
                    </div>

                    {!slot.isPast && (
                      <button
                        onClick={() => deleteSlot(slot.id)}
                        className="w-8 h-8 rounded-lg bg-destructive/10 hover:bg-destructive/20 flex items-center justify-center active:scale-90 transition-all duration-200"
                      >
                        <Trash2 size={16} className="text-destructive" strokeWidth={2} />
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {!showAddSlot ? (
                <button
                  onClick={() => setShowAddSlot(true)}
                  className="w-full rounded-xl p-4 border-2 border-dashed border-border hover:border-primary/40 bg-card/50 hover:bg-card transition-all duration-300 active:scale-95 group"
                >
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors duration-300">
                      <Plus size={18} className="text-primary" strokeWidth={2} />
                    </div>
                    <span className="text-sm font-semibold text-foreground">Ajouter un créneau</span>
                  </div>
                </button>
              ) : (
                <div className="rounded-xl p-4 bg-card border-2 border-primary/30 animate-slide-up">
                  <p className="text-xs font-semibold text-foreground mb-3">Nouveau créneau</p>

                  <div className="mb-3">
                    <label className="text-[10px] text-muted-foreground font-medium mb-1 block">
                      Heure de début
                    </label>
                    <input
                      type="time"
                      value={newSlotTime}
                      onChange={(e) => setNewSlotTime(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-foreground text-sm font-semibold focus:outline-none focus:border-primary/50 transition-all duration-200"
                    />
                  </div>

                  <div className="mb-3">
                    <label className="text-[10px] text-muted-foreground font-medium mb-1 block">
                      Durée
                    </label>
                    <select
                      value={newSlotDuration}
                      onChange={(e) => setNewSlotDuration(parseInt(e.target.value))}
                      className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-foreground text-sm font-semibold focus:outline-none focus:border-primary/50 transition-all duration-200"
                    >
                      <option value={30}>30 minutes</option>
                      <option value={45}>45 minutes</option>
                      <option value={60}>1 heure</option>
                      <option value={90}>1h30</option>
                      <option value={120}>2 heures</option>
                      <option value={150}>2h30</option>
                      <option value={180}>3 heures</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={addSlot}
                      className="flex-1 py-2.5 rounded-lg bg-primary flex items-center justify-center gap-1.5 active:scale-90 transition-all duration-200 shadow-md shadow-primary/20"
                    >
                      <Check size={16} className="text-white" strokeWidth={2.5} />
                      <span className="text-sm font-semibold text-white">Ajouter</span>
                    </button>
                    <button
                      onClick={() => {
                        setShowAddSlot(false);
                        setNewSlotTime("09:00");
                        setNewSlotDuration(60);
                      }}
                      className="px-4 py-2.5 rounded-lg bg-muted hover:bg-muted/80 active:scale-90 transition-all duration-200"
                    >
                      <X size={16} className="text-foreground" strokeWidth={2} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Weekly Planning Modal - NEW IMPROVED VERSION */}
      {showWeeklyModal && (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-[430px] bg-card rounded-t-2xl shadow-2xl animate-slide-up-modal max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-border">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-lg font-bold text-foreground tracking-tight flex items-center gap-2">
                    <Sparkles size={20} className="text-emerald-500" />
                    Planning hebdomadaire
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Configure et applique en un clic
                  </p>
                </div>
                <button onClick={() => setShowWeeklyModal(false)} className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center active:scale-90 transition-all duration-200">
                  <X size={18} className="text-foreground" strokeWidth={2} />
                </button>
              </div>

              {/* Days Selection */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-foreground">Jours actifs</p>
                  <div className="flex gap-1">
                    <button
                      onClick={selectWeekDays}
                      className="px-2 py-1 rounded-md bg-primary/10 text-primary text-[10px] font-semibold hover:bg-primary/20 active:scale-95 transition-all"
                    >
                      Semaine
                    </button>
                    <button
                      onClick={selectAllDays}
                      className="px-2 py-1 rounded-md bg-muted text-foreground text-[10px] font-semibold hover:bg-muted/80 active:scale-95 transition-all"
                    >
                      Tous
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-1.5">
                  {daysOfWeek.map((day, index) => (
                    <button
                      key={index}
                      onClick={() => toggleDay(index)}
                      className={`
                        py-2 rounded-lg text-[11px] font-bold transition-all duration-300 active:scale-90
                        ${selectedDays[index]
                          ? 'bg-gradient-to-br from-primary to-primary/90 text-white shadow-md shadow-primary/30'
                          : 'bg-muted text-muted-foreground'}
                      `}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Slots List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              <p className="text-xs font-semibold text-foreground mb-2">Créneaux à créer</p>
              
              {templateSlots.map((slot, index) => (
                <div key={slot.id} className="bg-gradient-to-br from-muted/50 to-muted/30 rounded-xl p-3 animate-slide-up" style={{ animationDelay: `${index * 0.05}s` }}>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 flex items-center gap-2">
                      <input
                        type="time"
                        value={slot.time}
                        onChange={(e) => updateTemplateSlot(slot.id, 'time', e.target.value)}
                        className="flex-1 px-3 py-2.5 rounded-lg bg-card border-2 border-border text-foreground text-sm font-bold focus:outline-none focus:border-primary/50 transition-all duration-200"
                      />
                      <select
                        value={slot.duration}
                        onChange={(e) => updateTemplateSlot(slot.id, 'duration', parseInt(e.target.value))}
                        className="flex-1 px-3 py-2.5 rounded-lg bg-card border-2 border-border text-foreground text-sm font-bold focus:outline-none focus:border-primary/50 transition-all duration-200"
                      >
                        <option value={30}>30min</option>
                        <option value={45}>45min</option>
                        <option value={60}>1h</option>
                        <option value={90}>1h30</option>
                        <option value={120}>2h</option>
                        <option value={150}>2h30</option>
                        <option value={180}>3h</option>
                      </select>
                    </div>
                    <button
                      onClick={() => removeTemplateSlot(slot.id)}
                      className="w-10 h-10 rounded-lg bg-destructive/10 hover:bg-destructive/20 flex items-center justify-center active:scale-90 transition-all duration-200"
                    >
                      <Trash2 size={16} className="text-destructive" strokeWidth={2} />
                    </button>
                  </div>
                </div>
              ))}

              <button
                onClick={addTemplateSlot}
                className="w-full rounded-xl p-3.5 border-2 border-dashed border-border hover:border-emerald-500/40 bg-card/50 hover:bg-card transition-all duration-300 active:scale-95 group"
              >
                <div className="flex items-center justify-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center group-hover:bg-emerald-500/20 transition-colors duration-300">
                    <Plus size={18} className="text-emerald-600" strokeWidth={2} />
                  </div>
                  <span className="text-sm font-semibold text-foreground">Ajouter un créneau</span>
                </div>
              </button>

              {templateSlots.length === 0 && (
                <div className="text-center py-8">
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                    <Clock size={28} className="text-muted-foreground" strokeWidth={2} />
                  </div>
                  <p className="text-sm font-semibold text-foreground mb-1">Aucun créneau</p>
                  <p className="text-xs text-muted-foreground">Ajoute tes créneaux pour commencer</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-border bg-gradient-to-t from-muted/20 to-transparent">
              {templateSlots.length > 0 && selectedDays.some(d => d) && (
                <div className="mb-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-200">
                  <p className="text-xs font-semibold text-foreground mb-1">
                    ✨ {templateSlots.length} créneau{templateSlots.length > 1 ? 'x' : ''} × {selectedDays.filter(d => d).length} jour{selectedDays.filter(d => d).length > 1 ? 's' : ''}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    = {templateSlots.length * selectedDays.filter(d => d).length} créneaux seront créés
                  </p>
                </div>
              )}

              <button
                onClick={applyWeeklyTemplate}
                disabled={templateSlots.length === 0 || !selectedDays.some(d => d)}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold text-sm active:scale-95 transition-all duration-200 shadow-lg shadow-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2"
              >
                <Sparkles size={18} strokeWidth={2.5} />
                Appliquer le planning
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slide-up {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes scale-in {
          from { transform: scale(0.9); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        @keyframes slide-down {
          from { transform: translateY(-10px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes slide-up-modal {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes bounce-in {
          0% { transform: scale(0); opacity: 0; }
          50% { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(1); }
        }
        @keyframes notification {
          0% { transform: scale(0.8) translateY(20px); opacity: 0; }
          10% { transform: scale(1.05) translateY(0); opacity: 1; }
          90% { transform: scale(1) translateY(0); opacity: 1; }
          100% { transform: scale(0.8) translateY(-20px); opacity: 0; }
        }
        @keyframes number-change {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.2); color: var(--primary); }
        }
        .animate-fade-in { animation: fade-in 0.4s ease-out forwards; }
        .animate-slide-up { animation: slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) backwards; }
        .animate-scale-in { animation: scale-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
        .animate-slide-down { animation: slide-down 0.3s ease-out; }
        .animate-slide-up-modal { animation: slide-up-modal 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
        .animate-bounce-in { animation: bounce-in 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55); }
        .animate-notification { animation: notification 2s ease-in-out; }
        .animate-number-change { animation: number-change 0.5s ease-in-out; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </MobileLayout>
  );
};

export default ProCalendar;
