import { useNavigate } from "react-router-dom";
import { useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import MobileLayout from "@/components/MobileLayout";
import PullToRefresh from "@/components/PullToRefresh";
import CancelAppointmentButton from "@/components/client/CancelAppointmentButton";
import {
  Calendar, Clock, XCircle, ChevronRight, ChevronLeft,
  Sparkles, CheckCircle2, AlertCircle, CalendarClock, Loader2
} from "lucide-react";
import { toast } from "sonner";
import { getImageUrl } from "@/utils/imageUrl";

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const fetchWithCredentials = async (url: string, options: RequestInit = {}): Promise<Response> => {
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: { ...options.headers, 'Content-Type': 'application/json' },
  });
  if (response.status === 401) throw new Error('REFRESH_FAILED');
  return response;
};

interface Booking {
  id: number;
  pro_id: number;
  start_datetime: string;
  end_datetime: string;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  price: number;
  paid_online: boolean;
  prestation_name: string;
  duration_minutes: number;
  pro_first_name: string;
  pro_last_name: string;
  activity_name: string | null;
  profile_photo: string | null;
  city: string | null;
  cancellation_notice_hours: number;
}

// ── Mini Calendar ────────────────────────────────────────────────────────────

const MONTH_NAMES = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const DAY_NAMES = ['D','L','M','M','J','V','S'];

interface MiniCalendarProps {
  selectedDate: Date | null;
  onSelect: (d: Date) => void;
  availableDates: Set<string>;
  onMonthChange: (year: number, month: number) => void;
}

const MiniCalendar = ({ selectedDate, onSelect, availableDates, onMonthChange }: MiniCalendarProps) => {
  const [current, setCurrent] = useState(new Date());
  const today = new Date(); today.setHours(0,0,0,0);

  const days = useMemo(() => {
    const year = current.getFullYear();
    const month = current.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const arr: (Date | null)[] = Array(firstDay).fill(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(new Date(year, month, d));
    return arr;
  }, [current]);

  const prevMonth = () => {
    const d = new Date(current.getFullYear(), current.getMonth() - 1, 1);
    setCurrent(d);
    onMonthChange(d.getFullYear(), d.getMonth() + 1);
  };
  const nextMonth = () => {
    const d = new Date(current.getFullYear(), current.getMonth() + 1, 1);
    setCurrent(d);
    onMonthChange(d.getFullYear(), d.getMonth() + 1);
  };

  return (
    <div className="select-none">
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMonth} className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center hover:bg-muted/70 active:scale-95 transition-all">
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm font-bold text-foreground">
          {MONTH_NAMES[current.getMonth()]} {current.getFullYear()}
        </span>
        <button onClick={nextMonth} className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center hover:bg-muted/70 active:scale-95 transition-all">
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {DAY_NAMES.map((d, i) => (
          <div key={i} className="text-center text-[10px] font-semibold text-muted-foreground py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {days.map((day, i) => {
          if (!day) return <div key={i} />;
          const isPast = day < today;
          const key = `${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`;
          const isAvailable = availableDates.has(key);
          const isSelected = selectedDate && day.toDateString() === selectedDate.toDateString();
          return (
            <button
              key={i}
              disabled={isPast || !isAvailable}
              onClick={() => onSelect(day)}
              className={`w-full aspect-square rounded-lg text-xs font-medium transition-all ${
                isSelected ? "bg-primary text-white shadow-sm shadow-primary/30 scale-110"
                : isPast || !isAvailable ? "text-muted-foreground/40 cursor-not-allowed"
                : "hover:bg-primary/10 text-foreground"
              }`}
            >
              {day.getDate()}
              {isAvailable && !isPast && !isSelected && (
                <span className="block w-1 h-1 rounded-full bg-primary mx-auto mt-0.5" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ── Reschedule Modal ─────────────────────────────────────────────────────────

interface RescheduleModalProps {
  booking: Booking;
  onClose: () => void;
  onConfirm: (startDt: string, endDt: string, slotId: number | null) => Promise<void>;
}

const RescheduleModal = ({ booking, onClose, onConfirm }: RescheduleModalProps) => {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<{ id: number; time: string } | null>(null);
  const [availableDates, setAvailableDates] = useState<Set<string>>(new Set());
  const [slots, setSlots] = useState<Array<{ id: number; time: string }>>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchDates = useCallback(async (year: number, month: number) => {
    try {
      const ym = `${year}-${String(month).padStart(2, '0')}`;
      const res = await fetch(`${API_BASE_URL}/api/slots/available-dates/${booking.pro_id}/${ym}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setAvailableDates(new Set(data.data.map(String)));
      }
    } catch { /* silent */ }
  }, [booking.pro_id]);

  // Load current month on mount
  useState(() => {
    const now = new Date();
    fetchDates(now.getFullYear(), now.getMonth() + 1);
  });

  const handleSelectDate = async (date: Date) => {
    setSelectedDate(date);
    setSelectedSlot(null);
    setLoadingSlots(true);
    try {
      const dateStr = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
      const res = await fetch(`${API_BASE_URL}/api/slots/available/${booking.pro_id}/${dateStr}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setSlots(data.data.map((s: any) => ({ id: s.id, time: s.time })));
      } else {
        setSlots([]);
      }
    } catch {
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  };

  const handleConfirm = async () => {
    if (!selectedDate || !selectedSlot) return;
    setIsSubmitting(true);
    try {
      const [h, m] = selectedSlot.time.split(':').map(Number);
      const start = new Date(selectedDate);
      start.setHours(h, m, 0, 0);
      const end = new Date(start.getTime() + booking.duration_minutes * 60_000);
      await onConfirm(
        start.toISOString().slice(0, 19).replace('T', ' '),
        end.toISOString().slice(0, 19).replace('T', ' '),
        selectedSlot.id
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="bg-card rounded-t-3xl w-full max-w-lg p-6 pb-8 shadow-2xl border-t-2 border-border max-h-[85vh] overflow-y-auto"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full bg-muted mx-auto mb-5" />

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
            <CalendarClock size={20} className="text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-foreground">Reporter le RDV</h3>
            <p className="text-xs text-muted-foreground">{booking.prestation_name}</p>
          </div>
        </div>

        {/* Calendar */}
        <div className="bg-background rounded-2xl p-4 mb-4 border border-muted">
          <MiniCalendar
            selectedDate={selectedDate}
            onSelect={handleSelectDate}
            availableDates={availableDates}
            onMonthChange={fetchDates}
          />
        </div>

        {/* Slots */}
        {selectedDate && (
          <div className="mb-5">
            <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
              <Clock size={12} />
              Créneaux disponibles
            </p>
            {loadingSlots ? (
              <div className="flex justify-center py-4">
                <Loader2 size={20} className="animate-spin text-primary" />
              </div>
            ) : slots.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4 bg-muted/30 rounded-xl">
                Aucun créneau disponible ce jour
              </p>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {slots.map((slot) => (
                  <button
                    key={slot.id}
                    onClick={() => setSelectedSlot(slot)}
                    className={`py-2.5 rounded-xl text-xs font-bold transition-all ${
                      selectedSlot?.id === slot.id
                        ? "bg-primary text-white shadow-sm shadow-primary/30"
                        : "bg-muted text-foreground hover:bg-muted/70"
                    }`}
                  >
                    {slot.time}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 h-12 rounded-xl bg-muted text-foreground font-semibold hover:bg-muted/80 transition-all active:scale-95"
          >
            Annuler
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedDate || !selectedSlot || isSubmitting}
            className="flex-1 h-12 rounded-xl bg-primary text-white font-semibold shadow-lg shadow-primary/30 hover:bg-primary/90 transition-all active:scale-95 disabled:opacity-40"
          >
            {isSubmitting ? <Loader2 size={18} className="animate-spin mx-auto" /> : "Confirmer"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

// ── Main component ───────────────────────────────────────────────────────────

const ClientMyBooking = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [rescheduleBooking, setRescheduleBooking] = useState<Booking | null>(null);

  const { data: bookings = [], isLoading, error: queryError, refetch } = useQuery<Booking[]>({
    queryKey: ["client-bookings"],
    queryFn: async () => {
      const response = await fetchWithCredentials(`${API_BASE_URL}/api/client/my-booking`);
      if (!response.ok) {
        if (response.status === 401) throw new Error("REFRESH_FAILED");
        throw new Error(`Erreur ${response.status}`);
      }
      const data = await response.json();
      if (!data.success || !Array.isArray(data.data)) return [];
      return data.data.map((b: any) => ({
        id: b.id,
        pro_id: b.pro?.id || b.pro_id,
        start_datetime: b.start_datetime,
        end_datetime: b.end_datetime,
        status: b.status,
        price: b.price,
        paid_online: b.paid_online,
        prestation_name: b.prestation?.name || "Prestation",
        duration_minutes: b.prestation?.duration_minutes || 60,
        pro_first_name: b.pro?.first_name || "",
        pro_last_name: b.pro?.last_name || "",
        activity_name: b.pro?.activity_name || null,
        profile_photo: b.pro?.profile_photo || null,
        city: b.pro?.city || null,
        cancellation_notice_hours: b.pro?.cancellation_notice_hours ?? 24,
      }));
    },
    staleTime: 30_000,
    onError: (err: any) => {
      if (err?.message === "REFRESH_FAILED") {
        navigate("/login", { replace: true, state: { message: "Session expirée, veuillez vous reconnecter" } });
      }
    },
  } as any);

  const error = queryError ? (queryError as Error).message : null;


  const handleReschedule = useCallback(async (bookingId: number, startDt: string, endDt: string, slotId: number | null) => {
    // Snapshot for rollback
    const snapshot = queryClient.getQueryData<Booking[]>(["client-bookings"]);
    // Optimistic: update cache + close modal immediately
    queryClient.setQueryData<Booking[]>(["client-bookings"], (prev = []) =>
      prev.map((b) => b.id === bookingId ? { ...b, start_datetime: startDt, end_datetime: endDt } : b)
    );
    setRescheduleBooking(null);
    try {
      const response = await fetchWithCredentials(`${API_BASE_URL}/api/client/my-booking/${bookingId}/reschedule`, {
        method: 'PATCH',
        body: JSON.stringify({ start_datetime: startDt, end_datetime: endDt, slot_id: slotId }),
      });
      const data = await response.json();
      if (!data.success) throw new Error(data?.message || "Erreur");
      toast.success("Rendez-vous reporté !");
    } catch (err) {
      // Rollback
      if (snapshot) queryClient.setQueryData(["client-bookings"], snapshot);
      toast.error(err instanceof Error ? err.message : "Erreur lors du report");
    }
  }, [queryClient]);

  const formatDate = useCallback((dateString: string): string =>
    new Date(dateString).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', weekday: 'short' }), []);

  const formatTime = useCallback((dateString: string): string =>
    new Date(dateString).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }), []);

  const { upcomingBookings, pastBookings, hasOnlyPastBookings } = useMemo(() => {
    const now = new Date();
    const upcoming = bookings.filter(b => (b.status === 'confirmed' || b.status === 'pending') && new Date(b.start_datetime) > now);
    const past = bookings.filter(b => b.status === 'completed' || b.status === 'cancelled' || new Date(b.start_datetime) <= now);
    return { upcomingBookings: upcoming, pastBookings: past, hasOnlyPastBookings: upcoming.length === 0 && past.length > 0 };
  }, [bookings]);

  if (isLoading) {
    return (
      <MobileLayout>
        <div className="min-h-screen bg-background">
          <div className="pt-6 pb-6 text-center px-6">
            <div className="h-8 w-48 bg-muted rounded-xl mx-auto mb-2 animate-pulse" />
            <div className="h-4 w-32 bg-muted rounded-lg mx-auto animate-pulse" />
          </div>
          <div className="px-6 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-card rounded-3xl p-5 border border-muted animate-pulse">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-5 w-32 bg-muted rounded" />
                    <div className="h-4 w-24 bg-muted rounded" />
                    <div className="h-3 w-40 bg-muted rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </MobileLayout>
    );
  }

  if (error) {
    return (
      <MobileLayout>
        <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
          <div className="text-center space-y-4">
            <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-10 h-10 text-destructive" />
            </div>
            <p className="text-xl font-bold text-foreground">Oups !</p>
            <p className="text-sm text-muted-foreground max-w-sm">{error}</p>
            <button onClick={() => refetch()} className="mt-6 px-8 py-3 rounded-2xl bg-primary text-white font-semibold shadow-lg hover:shadow-xl transition-all active:scale-95">
              Réessayer
            </button>
          </div>
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout>
      <PullToRefresh onRefresh={() => refetch()}>
      <div className="min-h-screen bg-background pb-32">
        <motion.div className="pt-6 pb-6 text-center px-6" initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <h1 className="text-3xl font-display font-bold text-foreground mb-2">Mes réservations</h1>
        </motion.div>

        {hasOnlyPastBookings && (
          <motion.div className="mx-6 mb-6" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent rounded-3xl p-6 border-2 border-primary/20 relative overflow-hidden">
              <div className="absolute top-2 right-2 opacity-20"><Sparkles className="w-12 h-12 text-primary" /></div>
              <div className="relative z-10">
                <h3 className="text-xl font-bold text-foreground mb-2">Prête pour un nouveau soin ?</h3>
                <p className="text-sm text-muted-foreground mb-4">Retrouve nos expertes et réserve ta prochaine prestation en quelques clics !</p>
                <button
                  onClick={() => navigate("/client/specialists")}
                  className="w-full px-6 py-3 rounded-2xl bg-primary text-white font-semibold shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 transition-all duration-300 active:scale-95 flex items-center justify-center gap-2"
                >
                  <Sparkles size={18} />
                  Réserve dès maintenant
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {bookings.length === 0 ? (
          <EmptyState onNavigate={() => navigate("/client/specialists")} />
        ) : (
          <div className="space-y-6 px-6">
            {upcomingBookings.length > 0 && (
              <BookingSection
                title="À venir"
                bookings={upcomingBookings}
                formatDate={formatDate}
                formatTime={formatTime}
                onNavigate={navigate}
                onReschedule={setRescheduleBooking}
                getImageUrl={getImageUrl}
                isUpcoming
              />
            )}
            {pastBookings.length > 0 && (
              <BookingSection
                title="Historique"
                bookings={pastBookings}
                formatDate={formatDate}
                formatTime={formatTime}
                onNavigate={navigate}
                getImageUrl={getImageUrl}
                isUpcoming={false}
              />
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {rescheduleBooking && (
          <RescheduleModal
            booking={rescheduleBooking}
            onClose={() => setRescheduleBooking(null)}
            onConfirm={(startDt, endDt, slotId) => handleReschedule(rescheduleBooking.id, startDt, endDt, slotId)}
          />
        )}
      </AnimatePresence>
      </PullToRefresh>
    </MobileLayout>
  );
};

// ── Sub-components ───────────────────────────────────────────────────────────

const EmptyState = ({ onNavigate }: { onNavigate: () => void }) => (
  <motion.div className="flex flex-col items-center justify-center py-20 px-6 text-center" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6 }}>
    <motion.div className="w-32 h-32 rounded-full bg-primary/10 flex items-center justify-center mb-6" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: "spring", stiffness: 200 }}>
      <Calendar size={64} className="text-primary" />
    </motion.div>
    <h2 className="text-2xl font-bold text-foreground mb-2">Aucune réservation</h2>
    <p className="text-muted-foreground mb-8 max-w-sm">Réserve auprès de nos expertes pour retrouver tes rendez-vous ici</p>
    <button onClick={onNavigate} className="px-10 py-4 rounded-3xl bg-primary hover:bg-primary/90 text-white font-semibold text-lg shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 transition-all duration-300 active:scale-95 flex items-center gap-2">
      <Sparkles size={20} />
      Découvrir les expertes
    </button>
  </motion.div>
);

interface BookingSectionProps {
  title: string;
  bookings: Booking[];
  formatDate: (d: string) => string;
  formatTime: (d: string) => string;
  onNavigate: (path: string) => void;
  onReschedule?: (booking: Booking) => void;
  getImageUrl: (path: string | null) => string | null;
  isUpcoming: boolean;
}

const BookingSection = ({ title, bookings, formatDate, formatTime, onNavigate, onReschedule, getImageUrl, isUpcoming }: BookingSectionProps) => (
  <motion.section className="space-y-3" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.5 }}>
    <div className="flex items-center gap-2">
      {isUpcoming && <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />}
      <h2 className="text-base font-bold text-foreground">
        {title}
        {!isUpcoming && <span className="text-xs font-normal text-muted-foreground ml-2">({bookings.length})</span>}
      </h2>
    </div>
    <div className={isUpcoming ? "space-y-3" : "space-y-2"}>
      {bookings.map((booking, index) => (
        <BookingCard
          key={booking.id}
          booking={booking}
          index={index}
          formatDate={formatDate}
          formatTime={formatTime}
          onNavigate={onNavigate}
          onReschedule={onReschedule}
          getImageUrl={getImageUrl}
          isUpcoming={isUpcoming}
        />
      ))}
    </div>
  </motion.section>
);

interface BookingCardProps {
  booking: Booking;
  index: number;
  formatDate: (d: string) => string;
  formatTime: (d: string) => string;
  onNavigate: (path: string) => void;
  onReschedule?: (booking: Booking) => void;
  getImageUrl: (path: string | null) => string | null;
  isUpcoming: boolean;
}

const BookingCard = ({ booking, index, formatDate, formatTime, onNavigate, onReschedule, getImageUrl, isUpcoming }: BookingCardProps) => {
  const proName = booking.activity_name || `${booking.pro_first_name} ${booking.pro_last_name}`.trim() || 'Professionnel';
  const avatarUrl = getImageUrl(booking.profile_photo);
  const isCompleted = booking.status === 'completed';

  if (isUpcoming) {
    return (
      <motion.div
        className="bg-card rounded-3xl overflow-hidden shadow-lg shadow-black/5 border-2 border-primary/20 hover:border-primary/40 transition-all duration-300"
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.2 + index * 0.1, duration: 0.5 }}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        <button onClick={() => onNavigate(`/client/booking-detail/${booking.id}`)} className="w-full p-5 text-left hover:bg-primary/5 transition-all duration-300">
          <div className="flex items-center gap-4">
            <div className="relative">
              {avatarUrl ? (
                <img src={avatarUrl} alt={proName} className="w-16 h-16 rounded-2xl object-cover shadow-md" />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-md">
                  <span className="text-2xl font-bold text-white">{proName[0]}</span>
                </div>
              )}
              <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-green-500 border-2 border-card flex items-center justify-center">
                <CheckCircle2 size={12} className="text-white" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2 mb-1">
                <h3 className="font-bold text-foreground text-lg">{proName}</h3>
                <ChevronRight size={20} className="text-muted-foreground flex-shrink-0" />
              </div>
              <p className="text-sm text-muted-foreground mb-2 font-medium">{booking.prestation_name}</p>
              <div className="flex items-center gap-3 text-xs">
                <div className="flex items-center gap-1.5 text-muted-foreground bg-muted/50 px-2 py-1 rounded-lg">
                  <Calendar size={12} />
                  <span className="font-medium">{formatDate(booking.start_datetime).split(' ').slice(0, 3).join(' ')}</span>
                </div>
                <div className="flex items-center gap-1.5 bg-primary/10 px-2 py-1 rounded-lg">
                  <Clock size={12} className="text-primary" />
                  <span className="font-bold text-primary">{formatTime(booking.start_datetime)}</span>
                </div>
              </div>
            </div>
          </div>
        </button>

        {onReschedule && (
          <div className="flex border-t border-muted">
            <button
              onClick={() => onNavigate(`/client/booking-detail/${booking.id}`)}
              className="flex-1 px-4 py-3 flex items-center justify-center gap-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted/30 transition-all duration-300 active:scale-95 border-r border-muted"
            >
              <Calendar size={14} />
              Détails
            </button>
            <button
              onClick={() => onReschedule(booking)}
              className="flex-1 px-4 py-3 flex items-center justify-center gap-1.5 text-xs font-semibold text-primary hover:bg-primary/10 transition-all duration-300 active:scale-95"
            >
              <CalendarClock size={14} />
              Reporter
            </button>
          </div>
        )}
        <div className="px-4 pb-4 pt-2 border-t border-muted">
          <CancelAppointmentButton
            reservationId={booking.id}
            appointmentStartAt={booking.start_datetime}
            cancellationNoticeHours={booking.cancellation_notice_hours}
            queryKeyToInvalidate={["client-bookings"]}
          />
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="bg-card rounded-3xl overflow-hidden shadow-md shadow-black/5 border border-muted hover:shadow-lg transition-all duration-300"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.4 + index * 0.05, duration: 0.5 }}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
    >
      <button onClick={() => onNavigate(`/client/booking-detail/${booking.id}`)} className="w-full p-4 text-left hover:bg-muted/30 transition-all duration-300">
        <div className="flex items-center gap-3">
          {avatarUrl ? (
            <img src={avatarUrl} alt={proName} className="w-12 h-12 rounded-xl object-cover opacity-70" />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center opacity-70">
              <span className="text-lg font-bold text-primary">{proName[0]}</span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <h3 className="font-semibold text-foreground text-sm">{proName}</h3>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${isCompleted ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                {isCompleted ? '✓ Terminé' : '✕ Annulé'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mb-2">{booking.prestation_name} • {Number(booking.price).toFixed(2)}€</p>
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><Calendar size={10} />{formatDate(booking.start_datetime).split(' ').slice(0, 3).join(' ')}</span>
              <span className="flex items-center gap-1"><Clock size={10} />{formatTime(booking.start_datetime)}</span>
            </div>
          </div>
          <ChevronRight size={16} className="text-muted-foreground flex-shrink-0" />
        </div>
      </button>
    </motion.div>
  );
};

const CancelModal = ({ onClose, onConfirm }: { onClose: () => void; onConfirm: () => void }) => (
  <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
    <motion.div
      className="bg-card rounded-3xl p-6 w-full max-w-sm shadow-2xl border-2 border-border"
      initial={{ scale: 0.9, y: 20, opacity: 0 }}
      animate={{ scale: 1, y: 0, opacity: 1 }}
      exit={{ scale: 0.9, y: 20, opacity: 0 }}
      transition={{ type: "spring", damping: 25, stiffness: 300 }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mb-4 mx-auto">
        <AlertCircle className="w-7 h-7 text-destructive" />
      </div>
      <h3 className="text-xl font-bold text-foreground mb-2 text-center">Annuler le rendez-vous ?</h3>
      <p className="text-sm text-muted-foreground mb-6 text-center">
        Cette action est définitive. Tu devras reprendre un nouveau rendez-vous si tu changes d'avis.
      </p>
      <div className="flex gap-3">
        <button onClick={onClose} className="flex-1 h-12 rounded-xl bg-muted text-foreground font-semibold hover:bg-muted/80 transition-all duration-300 active:scale-95">Retour</button>
        <button onClick={onConfirm} className="flex-1 h-12 rounded-xl bg-destructive text-white font-semibold hover:bg-destructive/90 shadow-lg shadow-destructive/30 transition-all duration-300 active:scale-95">Confirmer</button>
      </div>
    </motion.div>
  </motion.div>
);

export default ClientMyBooking;
