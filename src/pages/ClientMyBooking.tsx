import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import MobileLayout from "@/components/MobileLayout";
import { Calendar, Clock, MapPin, RotateCcw, XCircle, Sparkles } from "lucide-react";

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

  const upcomingBookings = bookings.filter((b) => b.status === "upcoming");
  const pastBookings = bookings.filter((b) => b.status === "past");

  return (
    <MobileLayout>
      <div className="min-h-screen bg-background pb-6">
        {/* Header */}
        <motion.div
          className="pt-6 pb-6 text-center px-6"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="text-3xl font-display font-bold text-foreground mb-2">
            Mes réservations
          </h1>
          <p className="text-muted-foreground">
            Gère et retrouve toutes tes prestations
          </p>
        </motion.div>

        {bookings.length === 0 ? (
          <motion.div
            className="flex flex-col items-center justify-center py-20 px-6 text-center"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6 }}
          >
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
              <Calendar size={40} className="text-primary" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">
              Aucune réservation
            </h2>
            <p className="text-muted-foreground mb-8 max-w-sm">
              Tu n'as pas encore réservé de prestation. Découvre nos expertes !
            </p>
            <button
              onClick={() => navigate("/client")}
              className="
                px-8 py-3 rounded-2xl
                bg-primary hover:bg-primary/90
                text-primary-foreground font-semibold
                shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40
                transition-all duration-300
                active:scale-95
              "
            >
              Découvrir des pros
            </button>
          </motion.div>
        ) : (
          <div className="space-y-6 px-6">
            {/* À venir */}
            {upcomingBookings.length > 0 && (
              <motion.section
                className="space-y-3"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.6 }}
              >
                <div className="flex items-center gap-2 px-1">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <h2 className="text-lg font-semibold text-foreground">
                    À venir
                  </h2>
                </div>

                <div className="space-y-3">
                  {upcomingBookings.map((booking, index) => (
                    <motion.button
                      key={booking.id}
                      onClick={() => navigate(`/client/booking-detail/${booking.id}`)}
                      className="
                        w-full bg-card rounded-3xl p-5 
                        shadow-lg shadow-black/5 border-2 border-primary/20
                        text-left group
                        hover:shadow-xl hover:shadow-primary/10
                        hover:-translate-y-1
                        transition-all duration-300
                        active:scale-[0.98]
                      "
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 + index * 0.1, duration: 0.5 }}
                    >
                      <div className="flex items-start gap-4 mb-4">
                        <img
                          src={avatarsByName[booking.name] || "/default-avatar.png"}
                          alt={booking.name}
                          className="w-16 h-16 rounded-2xl object-cover shadow-md"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <h3 className="font-semibold text-foreground text-base">
                              {booking.name}
                            </h3>
                            <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium whitespace-nowrap">
                              À venir
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {booking.service}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3 mb-4">
                        <div className="flex items-center gap-2">
                          <Calendar size={16} className="text-primary flex-shrink-0" />
                          <span className="text-xs text-foreground truncate">
                            {booking.date}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock size={16} className="text-primary flex-shrink-0" />
                          <span className="text-xs text-foreground truncate">
                            {booking.time}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <MapPin size={16} className="text-primary flex-shrink-0" />
                          <span className="text-xs text-foreground truncate">
                            {booking.location}
                          </span>
                        </div>
                      </div>

                      <div className="flex gap-2 pt-4 border-t border-muted">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/client/booking/${booking.id}`);
                          }}
                          className="
                            flex-1 flex items-center justify-center gap-2
                            px-4 py-2.5 rounded-xl
                            bg-primary/10 text-primary
                            text-sm font-medium
                            hover:bg-primary/20
                            transition-all duration-300
                            active:scale-95
                          "
                        >
                          <RotateCcw size={16} />
                          Modifier
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmId(booking.id);
                          }}
                          className="
                            flex-1 flex items-center justify-center gap-2
                            px-4 py-2.5 rounded-xl
                            bg-destructive/10 text-destructive
                            text-sm font-medium
                            hover:bg-destructive/20
                            transition-all duration-300
                            active:scale-95
                          "
                        >
                          <XCircle size={16} />
                          Annuler
                        </button>
                      </div>
                    </motion.button>
                  ))}
                </div>
              </motion.section>
            )}

            {/* Historique */}
            {pastBookings.length > 0 && (
              <motion.section
                className="space-y-3"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.6 }}
              >
                <h2 className="text-lg font-semibold text-foreground px-1">
                  Historique
                </h2>

                <div className="space-y-3">
                  {pastBookings.map((booking, index) => (
                    <motion.button
                      key={booking.id}
                      onClick={() => navigate(`/client/booking-detail/${booking.id}`)}
                      className="
                        w-full bg-card rounded-3xl p-5
                        shadow-md shadow-black/5 border border-muted
                        text-left
                        hover:shadow-lg
                        transition-all duration-300
                        active:scale-[0.98]
                      "
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.5 + index * 0.1, duration: 0.5 }}
                    >
                      <div className="flex items-start gap-4">
                        <img
                          src={avatarsByName[booking.name] || "/default-avatar.png"}
                          alt={booking.name}
                          className="w-14 h-14 rounded-2xl object-cover opacity-80"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <h3 className="font-medium text-foreground">
                              {booking.name}
                            </h3>
                            <span className="px-2.5 py-0.5 rounded-full bg-muted text-muted-foreground text-xs whitespace-nowrap">
                              Passée
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground mb-3">
                            {booking.service}
                          </p>

                          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1.5">
                              <Calendar size={14} />
                              <span>{booking.date}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Clock size={14} />
                              <span>{booking.time}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.button>
                  ))}
                </div>
              </motion.section>
            )}
          </div>
        )}
      </div>

      {/* Cancel Confirmation Modal */}
      <AnimatePresence>
        {confirmId !== null && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setConfirmId(null)}
          >
            <motion.div
              className="bg-card rounded-3xl p-6 w-full max-w-sm shadow-2xl"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                <XCircle className="w-6 h-6 text-destructive" />
              </div>

              <h3 className="text-xl font-semibold text-foreground mb-2">
                Annuler le rendez-vous ?
              </h3>
              <p className="text-sm text-muted-foreground mb-6">
                Cette action est définitive et ne pourra pas être annulée.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmId(null)}
                  className="
                    flex-1 h-12 rounded-xl
                    bg-muted text-foreground font-medium
                    hover:bg-muted/80
                    transition-all duration-300
                    active:scale-95
                  "
                >
                  Retour
                </button>
                <button
                  onClick={() => {
                    alert("Réservation annulée");
                    setConfirmId(null);
                  }}
                  className="
                    flex-1 h-12 rounded-xl
                    bg-destructive text-destructive-foreground font-medium
                    hover:bg-destructive/90
                    shadow-lg shadow-destructive/30
                    transition-all duration-300
                    active:scale-95
                  "
                >
                  Confirmer
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </MobileLayout>
  );
};

export default ClientMyBooking;