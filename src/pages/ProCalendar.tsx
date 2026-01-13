import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import MobileLayout from "@/components/MobileLayout";
import AddAppointmentModal from "@/components/AddAppointmentModal";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  X,
  Calendar as CalendarIcon,
  Clock,
  User,
} from "lucide-react";
import api from "@/services/api";

const ProCalendar = () => {
  const navigate = useNavigate();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"month" | "week">("month");

  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toISODate = (d: Date) => d.toISOString().slice(0, 10); // "YYYY-MM-DD"

  const daysOfWeek = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
  const months = [
    "Janvier",
    "Février",
    "Mars",
    "Avril",
    "Mai",
    "Juin",
    "Juillet",
    "Août",
    "Septembre",
    "Octobre",
    "Novembre",
    "Décembre",
  ];

  // Lock scroll when modal is open
  useEffect(() => {
    if (isAddModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isAddModalOpen]);

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    let startingDay = firstDay.getDay(); // 0=Dim, 1=Lun,...
    startingDay = (startingDay + 6) % 7; // Lundi=0,...Dimanche=6

    const days: (number | null)[] = [];
    for (let i = 0; i < startingDay; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }
    return days;
  };

  const hasAppointments = (day: number) => {
    const date = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      day
    );
    const key = toISODate(date);
    return appointments.some((apt) => toISODate(new Date(apt.date)) === key);
  };

  const filteredAppointments = useMemo(() => {
    const key = selectedDate ? toISODate(selectedDate) : null;

    let list = appointments;
    if (key) {
      list = list.filter((apt) => toISODate(new Date(apt.date)) === key);
    }

    if (searchQuery) {
      list = list.filter(
        (apt) =>
          apt.client_name
            .toLowerCase()
            .includes(searchQuery.toLowerCase()) ||
          apt.prestation_name
            .toLowerCase()
            .includes(searchQuery.toLowerCase())
      );
    }

    return list;
  }, [appointments, selectedDate, searchQuery]);

  const navigateMonth = (direction: number) => {
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() + direction, 1)
    );
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

  useEffect(() => {
    const fetchAppointments = async () => {
      try {
        setLoading(true);
        setError(null);

        const base = selectedDate || new Date();
        const monday = new Date(base);
        const day = monday.getDay();
        const diff = (day === 0 ? -6 : 1) - day;
        monday.setDate(monday.getDate() + diff);

        const sunday = new Date(monday);
        sunday.setDate(sunday.getDate() + 6);

        console.log("[CALENDAR FRONT] selectedDate =", selectedDate);
        console.log("[CALENDAR FRONT] from =", toISODate(monday), "to =", toISODate(sunday));

        const res = await api.pro.getCalendar({
          from: toISODate(monday),
          to: toISODate(sunday),
        });

        console.log("[CALENDAR FRONT] api response =", res);

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

  const getWeekDays = () => {
    const today = selectedDate || new Date();
    const days = [];
    for (let i = -2; i <= 2; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      days.push(date);
    }
    return days;
  };

  const handleAddAppointment = (appointment: any) => {
    console.log("New appointment:", appointment);
    // Refresh appointments after adding
    const fetchAppointments = async () => {
      try {
        setLoading(true);
        const base = selectedDate || new Date();
        const monday = new Date(base);
        const day = monday.getDay();
        const diff = (day === 0 ? -6 : 1) - day;
        monday.setDate(monday.getDate() + diff);

        const sunday = new Date(monday);
        sunday.setDate(sunday.getDate() + 6);

        const res = await api.pro.getCalendar({
          from: toISODate(monday),
          to: toISODate(sunday),
        });

        if (res.success) {
          setAppointments(res.data || []);
        }
      } catch (e: any) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchAppointments();
  };

  return (
    <MobileLayout hideNav={isAddModalOpen}>
      <div className="pb-6 min-h-screen">
        {/* Header */}
        <div className="relative -mx-4 px-4 pt-6 pb-4 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-foreground mb-1 animate-fade-in">
                Calendrier
              </h1>
              <p className="text-sm text-muted-foreground animate-fade-in" style={{ animationDelay: "0.1s" }}>
                {filteredAppointments.length} rendez-vous {selectedDate ? `le ${selectedDate.getDate()} ${months[selectedDate.getMonth()].toLowerCase()}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewMode(viewMode === "month" ? "week" : "month")}
                className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-300 ${
                  viewMode === "week"
                    ? "gradient-primary shadow-lg shadow-primary/20 scale-110"
                    : "bg-muted hover:bg-muted-foreground/10"
                } active:scale-95`}
              >
                <CalendarIcon
                  size={20}
                  className={viewMode === "week" ? "text-white" : "text-foreground"}
                />
              </button>
              <button
                onClick={() => setIsSearchOpen(!isSearchOpen)}
                className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-300 ${
                  isSearchOpen
                    ? "bg-primary text-white"
                    : "bg-muted hover:bg-muted-foreground/10"
                } active:scale-95`}
              >
                {isSearchOpen ? (
                  <X size={20} />
                ) : (
                  <Search size={20} />
                )}
              </button>
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="w-11 h-11 rounded-xl gradient-primary flex items-center justify-center active:scale-95 transition-all shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30"
              >
                <Plus size={20} className="text-white" />
              </button>
            </div>
          </div>
        </div>

        {/* Search Bar avec animation */}
        <div
          className={`overflow-hidden transition-all duration-300 ${
            isSearchOpen ? "max-h-20 mb-4 opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          <div className="animate-slide-down">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher une cliente ou prestation..."
              className="w-full px-4 py-3 rounded-2xl bg-muted border-2 border-transparent text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/30 transition-all"
              autoFocus={isSearchOpen}
            />
          </div>
        </div>

        {viewMode === "month" ? (
          <>
            {/* Month Navigation améliorée */}
            <div className="flex items-center justify-between mb-5 animate-slide-up">
              <button
                onClick={() => navigateMonth(-1)}
                className="w-10 h-10 rounded-xl bg-muted hover:bg-muted-foreground/10 flex items-center justify-center active:scale-95 transition-all"
              >
                <ChevronLeft size={20} className="text-foreground" />
              </button>
              <h2 className="text-lg font-bold text-foreground">
                {months[currentDate.getMonth()]} {currentDate.getFullYear()}
              </h2>
              <button
                onClick={() => navigateMonth(1)}
                className="w-10 h-10 rounded-xl bg-muted hover:bg-muted-foreground/10 flex items-center justify-center active:scale-95 transition-all"
              >
                <ChevronRight size={20} className="text-foreground" />
              </button>
            </div>

            {/* Calendar Grid avec animations */}
            <div
              className="blyss-card mb-6 animate-slide-up overflow-hidden"
              style={{ animationDelay: "0.1s" }}
            >
              <div className="grid grid-cols-7 gap-2 mb-3">
                {daysOfWeek.map((day, index) => (
                  <div
                    key={day}
                    className="text-center text-xs text-muted-foreground font-bold py-2 animate-fade-in"
                    style={{ animationDelay: `${index * 0.02}s` }}
                  >
                    {day}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-2">
                {getDaysInMonth(currentDate).map((day, index) => {
                  const hasApt = day && hasAppointments(day);
                  return (
                    <button
                      key={index}
                      onClick={() =>
                        day &&
                        setSelectedDate(
                          new Date(
                            currentDate.getFullYear(),
                            currentDate.getMonth(),
                            day
                          )
                        )
                      }
                      disabled={!day}
                      className={`
                        aspect-square rounded-xl flex flex-col items-center justify-center text-sm font-semibold
                        transition-all duration-300 relative group
                        animate-scale-in
                        ${!day ? "invisible" : ""}
                        ${day && isSelected(day) ? "gradient-primary text-white shadow-lg shadow-primary/30 scale-110" : ""}
                        ${day && isToday(day) && !isSelected(day) ? "bg-primary/10 text-primary ring-2 ring-primary/20" : ""}
                        ${
                          day && !isSelected(day) && !isToday(day)
                            ? "hover:bg-muted hover:scale-110 active:scale-95"
                            : ""
                        }
                      `}
                      style={{ animationDelay: `${index * 0.01}s` }}
                    >
                      {day}
                      {hasApt && (
                        <div className={`absolute bottom-1.5 flex gap-0.5 ${isSelected(day) ? "" : "group-hover:scale-125 transition-transform"}`}>
                          <div className={`w-1 h-1 rounded-full ${isSelected(day) ? "bg-white" : "bg-primary"}`} />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          /* Week View améliorée */
          <div className="mb-6 animate-fade-in">
            <div className="flex items-center justify-center gap-2 overflow-x-auto hide-scrollbar pb-2">
              {getWeekDays().map((date, index) => {
                const isActive =
                  selectedDate &&
                  date.getDate() === selectedDate.getDate() &&
                  date.getMonth() === selectedDate.getMonth();
                const isTodayDate =
                  date.getDate() === new Date().getDate() &&
                  date.getMonth() === new Date().getMonth();
                return (
                  <button
                    key={index}
                    onClick={() => setSelectedDate(date)}
                    className={`
                      flex flex-col items-center px-5 py-3 rounded-2xl transition-all min-w-[70px]
                      animate-scale-in
                      ${
                        isActive
                          ? "gradient-primary shadow-lg shadow-primary/30 scale-110"
                          : isTodayDate
                          ? "bg-primary/10 ring-2 ring-primary/20"
                          : "bg-card shadow-card hover:shadow-lg hover:scale-105"
                      }
                      active:scale-95
                    `}
                    style={{ animationDelay: `${index * 0.05}s` }}
                  >
                    <span
                      className={`text-xs font-medium mb-1 ${
                        isActive ? "text-white" : "text-muted-foreground"
                      }`}
                    >
                      {daysOfWeek[(date.getDay() + 6) % 7]}
                    </span>
                    <span
                      className={`text-2xl font-bold ${
                        isActive ? "text-white" : "text-foreground"
                      }`}
                    >
                      {date.getDate()}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Appointments List améliorée */}
        <div className="animate-slide-up" style={{ animationDelay: "0.2s" }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-foreground">
              {viewMode === "week" ? "Rendez-vous du jour" : "Rendez-vous"}
            </h3>
            {filteredAppointments.length > 0 && (
              <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold">
                {filteredAppointments.length}
              </span>
            )}
          </div>

          <div className="space-y-3">
            {loading ? (
              <div className="blyss-card text-center py-12">
                <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  Chargement des rendez-vous...
                </p>
              </div>
            ) : error ? (
              <div className="blyss-card text-center py-12">
                <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-3">
                  <X size={24} className="text-destructive" />
                </div>
                <p className="text-sm text-destructive font-medium">{error}</p>
              </div>
            ) : filteredAppointments.length > 0 ? (
              filteredAppointments.map((apt, index) => (
                <div
                  key={apt.id}
                  className="blyss-card group hover:shadow-lg hover:-translate-y-1 transition-all duration-300 cursor-pointer animate-slide-up"
                  style={{ animationDelay: `${0.3 + index * 0.05}s` }}
                >
                  <div className="flex items-center gap-4">
                    {/* Heure */}
                    <div className="text-center min-w-[60px]">
                      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-1 group-hover:bg-primary/20 transition-colors">
                        <Clock size={20} className="text-primary" />
                      </div>
                      <p className="text-sm font-bold text-foreground">
                        {apt.time}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {apt.duration}
                      </p>
                    </div>

                    <div className="h-14 w-px bg-border" />

                    {/* Détails */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <User size={14} className="text-muted-foreground flex-shrink-0" />
                        <h3 className="font-bold text-foreground truncate">
                          {apt.client_name}
                        </h3>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {apt.prestation_name}
                      </p>
                    </div>

                    {/* Prix */}
                    <div className="text-right">
                      <p className="text-xl font-bold text-primary">
                        {apt.price}€
                      </p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="blyss-card text-center py-12">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                  <CalendarIcon size={28} className="text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground mb-1">
                  {searchQuery
                    ? "Aucun rendez-vous trouvé"
                    : "Aucun rendez-vous"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {searchQuery
                    ? "Essaye un autre mot-clé"
                    : "Ajoute un rendez-vous pour commencer"}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <AddAppointmentModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSave={handleAddAppointment}
        selectedDate={selectedDate || undefined}
      />

      <style>{`
        @keyframes scale-in {
          from { transform: scale(0.8); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }

        @keyframes slide-down {
          from { transform: translateY(-10px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        .animate-scale-in {
          animation: scale-in 0.3s ease-out forwards;
        }

        .animate-slide-down {
          animation: slide-down 0.3s ease-out;
        }

        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </MobileLayout>
  );
};

export default ProCalendar;
