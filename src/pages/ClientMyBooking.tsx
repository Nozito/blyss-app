import { useNavigate } from "react-router-dom";
import { useState } from "react";
import MobileLayout from "@/components/MobileLayout";
import { Calendar, Clock, MapPin, ChevronRight, RotateCcw, XCircle } from "lucide-react";

const avatarsByName: Record<string, string> = {
  "Marie Beauté": "https://randomuser.me/api/portraits/women/1.jpg",
  "Sophie Nails": "https://randomuser.me/api/portraits/women/2.jpg",
  "Emma Style": "https://randomuser.me/api/portraits/women/3.jpg",
  "Léa Chic": "https://randomuser.me/api/portraits/women/4.jpg",
  "Julie Glam": "https://randomuser.me/api/portraits/women/5.jpg",
  "Camille Art": "https://randomuser.me/api/portraits/women/6.jpg",
};

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

  return (
    <MobileLayout>
      <div className="animate-fade-in">
        {/* Header */}
        <div className="pt-6 pb-4 animate-fade-in text-center">
          <h1 className="text-2xl font-semibold text-foreground mb-1">
            Mes réservations
          </h1>
          <p className="text-muted-foreground text-sm">
            Gère et retrouve toutes tes prestations
          </p>
        </div>

        {bookings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
            <Calendar size={48} className="text-muted-foreground mb-4" />
            <h2 className="text-lg font-semibold text-foreground mb-1">
              Aucune réservation
            </h2>
            <p className="text-muted-foreground text-sm mb-6">
              Tu n'as pas encore réservé de prestation
            </p>
            <button
              onClick={() => navigate("/client")}
              className="px-6 py-3 rounded-xl gradient-gold text-secondary-foreground font-medium active:scale-95 transition-transform"
            >
              Découvrir des pros
            </button>
          </div>
        ) : (
          <div className="space-y-3 animate-slide-up">
            {bookings.map((booking) => (
              <button
                key={booking.id}
                onClick={() => navigate(`/client/booking-detail/${booking.id}`)}
                className="bg-card rounded-2xl p-4 shadow-card w-full text-left active:scale-[0.98] transition-transform"
              >
                <img
                  src={avatarsByName[booking.name] || "/default-avatar.png"}
                  alt={booking.name}
                  className="w-16 h-16 rounded-full object-cover mb-3"
                />
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-semibold text-foreground">
                    {booking.name}
                  </h3>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${booking.status === "upcoming"
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                      }`}
                  >
                    {booking.status === "upcoming" ? "À venir" : "Passée"}
                  </span>
                </div>

                <p className="text-sm text-muted-foreground mb-2">
                  {booking.service}
                </p>

                <div className="flex flex-wrap items-center gap-3">
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
                  <div className="mt-3 pt-3 border-t border-border flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/client/booking/${booking.id}`);
                      }}
                      className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-primary/10 text-primary text-xs font-medium active:scale-95 transition-transform"
                    >
                      <RotateCcw size={14} />
                      Modifier
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmId(booking.id);
                      }}
                      className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-destructive/10 text-destructive text-xs font-medium active:scale-95 transition-transform"
                    >
                      <XCircle size={14} />
                      Annuler
                    </button>
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Cancel Confirmation Modal */}
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
                className="flex-1 py-3 rounded-xl bg-muted text-foreground font-medium active:scale-95 transition-transform"
              >
                Retour
              </button>
              <button
                onClick={() => {
                  alert("Réservation annulée");
                  setConfirmId(null);
                }}
                className="flex-1 py-3 rounded-xl bg-destructive text-destructive-foreground font-medium active:scale-95 transition-transform"
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
