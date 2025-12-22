import { useState } from "react";
import MobileLayout from "@/components/MobileLayout";
import { ChevronLeft, ChevronRight } from "lucide-react";

const ProCalendar = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());

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
    // Mock: Some days have appointments
    return [5, 8, 12, 15, 18, 22, 25].includes(day);
  };

  // Mock appointments for selected date
  const appointments = [
    { id: 1, time: "09:00", name: "Claire Petit", service: "Pose complète", duration: "1h30", price: 65 },
    { id: 2, time: "11:00", name: "Julie Moreau", service: "Remplissage", duration: "1h", price: 45 },
    { id: 3, time: "14:00", name: "Marie Dupont", service: "Manucure", duration: "45min", price: 35 },
    { id: 4, time: "16:00", name: "Sophie Martin", service: "Nail art", duration: "2h", price: 85 },
  ];

  // Get nearby days for the day view header
  const getNearbyDays = () => {
    if (!selectedDate) return [];
    const days = [];
    for (let i = -2; i <= 2; i++) {
      const date = new Date(selectedDate);
      date.setDate(date.getDate() + i);
      days.push(date);
    }
    return days;
  };

  return (
    <MobileLayout>
      <div className="px-5 pt-safe-top pb-6">
        {/* Header */}
        <div className="py-6 animate-fade-in">
          <h1 className="font-display text-2xl font-semibold text-foreground">
            Calendrier
          </h1>
        </div>

        {/* Month Navigation */}
        <div className="flex items-center justify-between mb-4 animate-slide-up">
          <button
            onClick={() => navigateMonth(-1)}
            className="touch-button p-2 rounded-xl hover:bg-muted active:scale-95 transition-all"
          >
            <ChevronLeft size={24} className="text-foreground" />
          </button>
          <h2 className="font-display text-lg font-semibold text-foreground">
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
          {/* Days of week header */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {daysOfWeek.map((day) => (
              <div key={day} className="text-center text-xs text-muted-foreground font-medium py-2">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar days */}
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

        {/* Selected Date - Day View */}
        {selectedDate && (
          <div className="animate-slide-up" style={{ animationDelay: "0.2s" }}>
            {/* Nearby days selector */}
            <div className="flex items-center justify-center gap-2 mb-4 overflow-x-auto hide-scrollbar">
              {getNearbyDays().map((date, index) => {
                const isActive = date.getDate() === selectedDate.getDate() && 
                                 date.getMonth() === selectedDate.getMonth();
                return (
                  <button
                    key={index}
                    onClick={() => setSelectedDate(date)}
                    className={`
                      flex flex-col items-center px-3 py-2 rounded-xl transition-all min-w-[48px]
                      ${isActive ? "gradient-primary" : "bg-muted"}
                    `}
                  >
                    <span className={`text-xs ${isActive ? "text-primary-foreground" : "text-muted-foreground"}`}>
                      {daysOfWeek[(date.getDay() + 6) % 7]}
                    </span>
                    <span className={`text-lg font-semibold ${isActive ? "text-primary-foreground" : "text-foreground"}`}>
                      {date.getDate()}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Day's appointments */}
            <div className="space-y-3">
              {appointments.map((apt) => (
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
              ))}
            </div>
          </div>
        )}
      </div>
    </MobileLayout>
  );
};

export default ProCalendar;
