import { useNavigate } from "react-router-dom";
import { useState } from "react";
import MobileLayout from "@/components/MobileLayout";
import { Calendar, Clock, MapPin, ChevronRight, Heart, RotateCcw, XCircle, Bell } from "lucide-react";
import logo from "@/assets/logo.png";

const ClientMyBooking = () => {
    const navigate = useNavigate();

    const [confirmId, setConfirmId] = useState<number | null>(null);

    const [bookings] = useState([
        {
            id: 1,
            name: "Marie Beauté",
            service: "Pose complète gel",
            date: "12 juin 2024",
            time: "14:00",
            location: "Paris 11ème",
            status: "upcoming",
        },
        {
            id: 2,
            name: "Sophie Nails",
            service: "Remplissage",
            date: "5 juin 2024",
            time: "16:30",
            location: "Paris 9ème",
            status: "past",
        },
        {
            id: 3,
            name: "Emma Style",
            service: "Nail art",
            date: "28 mai 2024",
            time: "11:00",
            location: "Paris 15ème",
            status: "past",
        },
    ]);

    const isTooCloseToStart = (dateStr: string, time: string) => {
      const months = [
        "janvier","février","mars","avril","mai","juin",
        "juillet","août","septembre","octobre","novembre","décembre"
      ];
      const [day, monthName, year] = dateStr.split(" ");
      const [hours, minutes] = time.split(":");
      const month = months.indexOf(monthName);
      const date = new Date(
        Number(year),
        month,
        Number(day),
        Number(hours),
        Number(minutes)
      );

      const diff = date.getTime() - Date.now();
      return diff < 60 * 60 * 1000; // moins d’1h
    };

    return (
        <MobileLayout>
            <div className="flex flex-col flex-1 px-6">
                {/* Header */}
                <div className="pt-2 pb-4 animate-fade-in">
                    <h1 className="font-display text-2xl font-semibold text-foreground">
                        Mes réservations
                    </h1>
                    <p className="text-muted-foreground text-sm">
                        Gère et retrouve toutes tes prestations
                    </p>
                </div>

                {bookings.length === 0 ? (
                    <div className="flex flex-col items-center justify-center flex-1 text-center animate-fade-in">
                        <Calendar size={48} className="text-muted-foreground mb-4" />
                        <h2 className="font-display text-lg font-semibold text-foreground mb-1">
                            Aucune réservation
                        </h2>
                        <p className="text-muted-foreground text-sm mb-6">
                            Tu n’as pas encore réservé de prestation
                        </p>
                        <button
                            onClick={() => navigate("/client")}
                            className="px-6 py-3 rounded-xl gradient-gold text-secondary-foreground font-medium active:scale-95 transition-transform"
                        >
                            Découvrir des pros
                        </button>
                    </div>
                ) : (
                    <div className="space-y-4 animate-slide-up">
                        {bookings.map((booking) => (
                            <button
                                key={booking.id}
                                onClick={() => navigate(`/client/specialist/${booking.id}`)}
                                className="bg-card rounded-2xl p-4 shadow-card w-full text-left active:scale-[0.98] transition-transform"
                            >
                                <div className="flex items-start justify-between gap-2 mb-1">
                                    <h3 className="font-semibold text-foreground truncate">
                                        {booking.name}
                                    </h3>
                                    <div className="flex items-center">
                                        {booking.status === "upcoming" && booking.date === "12 juin 2024" && (
                                            <Bell size={14} className="text-primary mr-1" />
                                        )}
                                        <span
                                            className={`text-xs px-2 py-0.5 rounded-full ${booking.status === "upcoming"
                                                ? "bg-primary/10 text-primary"
                                                : "bg-muted text-muted-foreground"
                                                }`}
                                        >
                                            {booking.status === "upcoming" ? "À venir" : "Passée"}
                                        </span>
                                    </div>
                                </div>

                                <p className="text-sm text-muted-foreground">
                                    {booking.service}
                                </p>

                                <div className="flex flex-wrap items-center gap-3 mt-2">
                                    <div className="flex items-center gap-1">
                                        <Calendar size={12} className="text-muted-foreground" />
                                        <span className="text-xs text-muted-foreground">
                                            {booking.date}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Clock size={12} className="text-muted-foreground" />
                                        <span className="text-xs text-muted-foreground">
                                            {booking.time}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <MapPin size={12} className="text-muted-foreground" />
                                        <span className="text-xs text-muted-foreground">
                                            {booking.location}
                                        </span>
                                    </div>
                                </div>

                                {booking.status === "upcoming" && (
                                  <div className="mt-3 pt-3 border-t border-border/60 flex items-center gap-2 animate-slide-in">
                                    <button
                                      disabled={isTooCloseToStart(booking.date, booking.time)}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        navigate(`/client/booking/${booking.id}`);
                                      }}
                                      className={`flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-xl text-xs font-medium transition ${
                                        isTooCloseToStart(booking.date, booking.time)
                                          ? "bg-muted text-muted-foreground cursor-not-allowed"
                                          : "bg-primary/10 text-primary active:scale-95"
                                      }`}
                                    >
                                      <RotateCcw size={14} />
                                      Reprendre
                                    </button>

                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setConfirmId(booking.id);
                                      }}
                                      className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-destructive/10 text-destructive text-xs font-medium active:scale-95 transition"
                                    >
                                      <XCircle size={14} />
                                      Annuler
                                    </button>

                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        alert("Ajouté aux favoris ❤️ (mock)");
                                      }}
                                      className="p-2 rounded-xl bg-background/70 active:scale-90 transition"
                                    >
                                      <Heart size={14} className="text-blyss-gold fill-blyss-gold" />
                                    </button>
                                  </div>
                                )}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {confirmId !== null && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                <div className="bg-card rounded-2xl p-6 w-[90%] max-w-sm animate-scale-in">
                  <h3 className="font-semibold text-foreground mb-2">
                    Annuler le rendez-vous ?
                  </h3>
                  <p className="text-sm text-muted-foreground mb-6">
                    Cette action est définitive.
                  </p>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setConfirmId(null)}
                      className="flex-1 py-2 rounded-xl bg-muted text-foreground font-medium"
                    >
                      Retour
                    </button>
                    <button
                      onClick={() => {
                        alert("Réservation annulée (mock)");
                        setConfirmId(null);
                      }}
                      className="flex-1 py-2 rounded-xl bg-destructive text-destructive-foreground font-medium"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              </div>
            )}
        </MobileLayout>
    );
};

export default ClientMyBooking;