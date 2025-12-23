import { useState } from "react";
import { useNavigate } from "react-router-dom";
import MobileLayout from "@/components/MobileLayout";
import AddAppointmentModal from "@/components/AddAppointmentModal";
import { ChevronLeft, ChevronRight, Plus, Search, X, Calendar as CalendarIcon } from "lucide-react";

const ProCalendar = () => {
  const navigate = useNavigate();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"month" | "week">("month");

  const daysOfWeek = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
  const months = [
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
  ];

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    let startingDay = firstDay.getDay() - 1;
    if (startingDay < 0) startingDay = 6;
    
    const days: (number | null)[] = [];
    for (let i = 0; i < startingDay; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }
    return days;
  };

  const navigateMonth = (direction: number) => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + direction, 1));
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

  const hasAppointments = (day: number) => {
    return [5, 8, 12, 15, 18, 22, 25].includes(day);
  };

  // Mock appointments
  const [appointments] = useState([
    { id: 1, time: "09:00", name: "Claire Petit", service: "Pose complète", duration: "1h30", price: 65 },
    { id: 2, time: "11:00", name: "Julie Moreau", service: "Remplissage", duration: "1h", price: 45 },
    { id: 3, time: "14:00", name: "Marie Dupont", service: "Manucure", duration: "45min", price: 35 },
    { id: 4, time: "16:00", name: "Sophie Martin", service: "Nail art", duration: "2h", price: 85 },
  ]);

  const filteredAppointments = searchQuery
    ? appointments.filter(apt =>
        apt.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        apt.service.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : appointments;

  // Get 5 days for week view
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
  };

  return (
    <MobileLayout>
      <div className="py-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold text-foreground">
            Calendrier
          </h1>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setViewMode(viewMode === "month" ? "week" : "month")}
              className={`w-10 h-10 rounded-full flex items-center justify-center active:scale-95 transition-all ${
                viewMode === "week" ? "gradient-primary" : "bg-muted"
              }`}
            >
              <CalendarIcon size={20} className={viewMode === "week" ? "text-primary-foreground" : "text-foreground"} />
            </button>
            <button 
              onClick={() => setIsSearchOpen(!isSearchOpen)}
              className="w-10 h-10 rounded-full bg-muted flex items-center justify-center active:scale-95 transition-transform"
            >
              {isSearchOpen ? (
                <X size={20} className="text-foreground" />
              ) : (
                <Search size={20} className="text-foreground" />
              )}
            </button>
            <button 
              onClick={() => setIsAddModalOpen(true)}
              className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center active:scale-95 transition-transform"
            >
              <Plus size={20} className="text-primary-foreground" />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        {isSearchOpen && (
          <div className="mb-4 animate-fade-in">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher un rendez-vous..."
              className="w-full px-4 py-3 rounded-xl bg-muted border-0 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              autoFocus
            />
          </div>
        )}

        {viewMode === "month" ? (
          <>
            {/* Month Navigation */}
            <div className="flex items-center justify-between mb-4 animate-slide-up">
              <button
                onClick={() => navigateMonth(-1)}
                className="touch-button p-2 rounded-xl hover:bg-muted active:scale-95 transition-all"
              >
                <ChevronLeft size={24} className="text-foreground" />
              </button>
              <h2 className="text-lg font-semibold text-foreground">
                {months[currentDate.getMonth()]} {currentDate.getFullYear()}
              </h2>
              <button
                onClick={() => navigateMonth(1)}
                className="touch-button p-2 rounded-xl hover:bg-muted active:scale-95 transition-all"
              >
                <ChevronRight size={24} className="text-foreground" />
              </button>
            </div>

            {/* Calendar Grid */}
            <div className="blyss-card mb-6 animate-slide-up" style={{ animationDelay: "0.1s" }}>
              <div className="grid grid-cols-7 gap-1 mb-2">
                {daysOfWeek.map((day) => (
                  <div key={day} className="text-center text-xs text-muted-foreground font-medium py-2">
                    {day}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {getDaysInMonth(currentDate).map((day, index) => (
                  <button
                    key={index}
                    onClick={() => day && setSelectedDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), day))}
                    disabled={!day}
                    className={`
                      aspect-square rounded-xl flex flex-col items-center justify-center text-sm font-medium
                      transition-all duration-200 relative
                      ${!day ? "invisible" : ""}
                      ${isSelected(day!) ? "gradient-primary text-primary-foreground" : ""}
                      ${isToday(day!) && !isSelected(day!) ? "bg-accent text-primary" : ""}
                      ${!isSelected(day!) && !isToday(day!) && day ? "hover:bg-muted active:scale-95" : ""}
                    `}
                  >
                    {day}
                    {day && hasAppointments(day) && !isSelected(day) && (
                      <div className="absolute bottom-1 w-1 h-1 rounded-full bg-primary" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          /* Week View */
          <div className="animate-fade-in">
            <div className="flex items-center justify-center gap-2 mb-6 overflow-x-auto hide-scrollbar">
              {getWeekDays().map((date, index) => {
                const isActive = selectedDate && date.getDate() === selectedDate.getDate() && 
                                 date.getMonth() === selectedDate.getMonth();
                return (
                  <button
                    key={index}
                    onClick={() => setSelectedDate(date)}
                    className={`
                      flex flex-col items-center px-4 py-3 rounded-2xl transition-all min-w-[60px]
                      ${isActive ? "gradient-primary" : "bg-card shadow-card"}
                    `}
                  >
                    <span className={`text-xs ${isActive ? "text-primary-foreground" : "text-muted-foreground"}`}>
                      {daysOfWeek[(date.getDay() + 6) % 7]}
                    </span>
                    <span className={`text-xl font-semibold ${isActive ? "text-primary-foreground" : "text-foreground"}`}>
                      {date.getDate()}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Appointments List */}
        <div className="animate-slide-up" style={{ animationDelay: "0.2s" }}>
          <h3 className="text-lg font-semibold text-foreground mb-3">
            {viewMode === "week" ? "Rendez-vous du jour" : "Rendez-vous"}
          </h3>
          <div className="space-y-3">
            {filteredAppointments.length > 0 ? (
              filteredAppointments.map((apt) => (
                <div key={apt.id} className="blyss-card flex items-center gap-4">
                  <div className="text-center min-w-[50px]">
                    <p className="text-lg font-bold text-foreground">{apt.time}</p>
                    <p className="text-xs text-muted-foreground">{apt.duration}</p>
                  </div>
                  <div className="h-12 w-px bg-border" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-foreground">{apt.name}</h3>
                    <p className="text-sm text-muted-foreground">{apt.service}</p>
                  </div>
                  <p className="font-bold text-foreground">{apt.price}€</p>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                {searchQuery ? "Aucun rendez-vous trouvé" : "Aucun rendez-vous"}
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
    </MobileLayout>
  );
};

export default ProCalendar;
