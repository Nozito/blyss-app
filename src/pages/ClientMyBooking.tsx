import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import MobileLayout from "@/components/MobileLayout";
import { Calendar, Clock, MapPin, RotateCcw, XCircle, Sparkles, ChevronRight, Star, Loader2 } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// ✅ Helper pour construire les URLs des images
const getImageUrl = (imagePath: string | null): string | null => {
  if (!imagePath) return null;
  if (imagePath.startsWith('http')) return imagePath;
  
  const API_BASE_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3001';
  return `${API_BASE_URL}/${imagePath}`;
};

interface Booking {
  id: number;
  pro_id: number;
  prestation_id: number;
  slot_id: number;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  created_at: string;
  // Données jointes
  pro_name: string;
  pro_activity_name: string | null;
  pro_profile_photo: string | null;
  prestation_name: string;
  prestation_price: number;
  slot_date: string;
  slot_start_time: string;
  pro_city: string | null;
}

const ClientMyBooking = () => {
  const navigate = useNavigate();
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ✅ Récupérer les réservations depuis l'API
  useEffect(() => {
    const fetchBookings = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const token = localStorage.getItem('auth_token');
        if (!token) {
          navigate('/login');
          return;
        }

        const response = await fetch(`${API_URL}/bookings/my-bookings`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (response.status === 401) {
          localStorage.removeItem('auth_token');
          navigate('/login');
          return;
        }

        const data = await response.json();

        if (data.success && data.data) {
          setBookings(data.data);
        } else {
          throw new Error(data.message || 'Erreur lors du chargement');
        }

      } catch (err) {
        console.error('Error fetching bookings:', err);
        setError(err instanceof Error ? err.message : 'Erreur de chargement');
      } finally {
        setIsLoading(false);
      }
    };

    fetchBookings();
  }, [navigate]);

  // ✅ Annuler une réservation
  const handleCancelBooking = async (bookingId: number) => {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        navigate('/login');
        return;
      }

      const response = await fetch(`${API_URL}/bookings/${bookingId}/cancel`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (data.success) {
        // Mettre à jour localement
        setBookings(bookings.map(b => 
          b.id === bookingId 
            ? { ...b, status: 'cancelled' as const }
            : b
        ));
        setConfirmId(null);
      } else {
        alert(data.message || 'Erreur lors de l\'annulation');
      }

    } catch (err) {
      console.error('Error canceling booking:', err);
      alert('Erreur lors de l\'annulation');
    }
  };

  // ✅ Formater la date
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', { 
      day: 'numeric', 
      month: 'long', 
      year: 'numeric' 
    });
  };

  // ✅ Formater l'heure
  const formatTime = (timeString: string): string => {
    return timeString.slice(0, 5); // "14:00:00" → "14:00"
  };

  // ✅ Filtrer les réservations
  const upcomingBookings = bookings.filter(b => 
    b.status === 'confirmed' || b.status === 'pending'
  );
  
  const pastBookings = bookings.filter(b => 
    b.status === 'completed' || b.status === 'cancelled'
  );

  // ✅ Loading state
  if (isLoading) {
    return (
      <MobileLayout>
        <div className="min-h-screen bg-background flex flex-col items-center justify-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
          <p className="text-sm text-muted-foreground">Chargement de tes réservations...</p>
        </div>
      </MobileLayout>
    );
  }

  // ✅ Error state
  if (error) {
    return (
      <MobileLayout>
        <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
          <div className="text-center space-y-4">
            <p className="text-lg font-semibold text-foreground">Erreur de chargement</p>
            <p className="text-sm text-muted-foreground">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 rounded-xl bg-primary text-white font-medium"
            >
              Réessayer
            </button>
          </div>
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout>
      <div className="min-h-screen bg-background pb-20">
        {/* Header */}
        <motion.div
          className="pt-6 pb-5 px-5"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-2xl font-bold text-foreground mb-1">
            Mes réservations
          </h1>
          <p className="text-sm text-muted-foreground">
            {bookings.length > 0 
              ? `${upcomingBookings.length} à venir • ${pastBookings.length} passée${pastBookings.length > 1 ? 's' : ''}`
              : "Aucune réservation pour le moment"
            }
          </p>
        </motion.div>

        {bookings.length === 0 ? (
          <motion.div
            className="flex flex-col items-center justify-center py-16 px-6 text-center"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
          >
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center mb-6">
              <Calendar size={40} className="text-primary" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2">
              Aucune réservation
            </h2>
            <p className="text-sm text-muted-foreground mb-8 max-w-sm">
              Tu n'as pas encore réservé de prestation. Découvre nos expertes et prends ton premier rendez-vous !
            </p>
            <button
              onClick={() => navigate("/client/specialists")}
              className="px-8 py-3 rounded-xl bg-primary text-white font-semibold shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 transition-all duration-300 active:scale-95"
            >
              Découvrir les expertes
            </button>
          </motion.div>
        ) : (
          <div className="space-y-6 px-5">
            {/* À venir */}
            {upcomingBookings.length > 0 && (
              <motion.section
                className="space-y-3"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.5 }}
              >
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  <h2 className="text-base font-bold text-foreground">
                    À venir
                  </h2>
                </div>

                <div className="space-y-3">
                  {upcomingBookings.map((booking, index) => {
                    const proName = booking.pro_activity_name || booking.pro_name;
                    const avatarUrl = getImageUrl(booking.pro_profile_photo);

                    return (
                      <motion.div
                        key={booking.id}
                        className="bg-gradient-to-br from-card to-card/50 rounded-2xl p-4 border-2 border-primary/20 shadow-lg shadow-primary/5 hover:shadow-xl hover:shadow-primary/10 transition-all duration-300"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2 + index * 0.1, duration: 0.4 }}
                      >
                        {/* Header Card */}
                        <button
                          onClick={() => navigate(`/client/booking-detail/${booking.id}`)}
                          className="w-full text-left mb-4"
                        >
                          <div className="flex items-start gap-3">
                            <div className="relative">
                              {avatarUrl ? (
                                <img
                                  src={avatarUrl}
                                  alt={proName}
                                  className="w-14 h-14 rounded-xl object-cover shadow-md"
                                />
                              ) : (
                                <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center shadow-md">
                                  <span className="text-xl font-bold text-primary">
                                    {proName[0]}
                                  </span>
                                </div>
                              )}
                              <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary border-2 border-card" />
                            </div>
                            
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2 mb-1">
                                <h3 className="font-bold text-foreground">
                                  {proName}
                                </h3>
                                <ChevronRight size={18} className="text-muted-foreground flex-shrink-0" />
                              </div>
                              <p className="text-sm text-muted-foreground mb-2">
                                {booking.prestation_name}
                              </p>
                              <div className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-primary/10 text-primary text-xs font-semibold">
                                <Sparkles size={10} />
                                {Number(booking.prestation_price).toFixed(2)}€
                              </div>
                            </div>
                          </div>
                        </button>

                        {/* Info Grid */}
                        <div className="bg-background/50 rounded-xl p-3 mb-3">
                          <div className="grid grid-cols-3 gap-2 text-xs">
                            <div className="flex flex-col items-center text-center gap-1">
                              <Calendar size={14} className="text-primary" />
                              <span className="text-foreground font-medium">
                                {formatDate(booking.slot_date)}
                              </span>
                            </div>
                            <div className="flex flex-col items-center text-center gap-1">
                              <Clock size={14} className="text-primary" />
                              <span className="text-foreground font-medium">
                                {formatTime(booking.slot_start_time)}
                              </span>
                            </div>
                            <div className="flex flex-col items-center text-center gap-1">
                              <MapPin size={14} className="text-primary" />
                              <span className="text-foreground font-medium truncate w-full">
                                {booking.pro_city || 'N/A'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2">
                          <button
                            onClick={() => navigate(`/client/booking/${booking.pro_id}`)}
                            className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-primary/10 text-primary text-sm font-semibold hover:bg-primary/20 transition-all duration-300 active:scale-95"
                          >
                            <RotateCcw size={14} />
                            Modifier
                          </button>

                          <button
                            onClick={() => setConfirmId(booking.id)}
                            className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-destructive/10 text-destructive text-sm font-semibold hover:bg-destructive/20 transition-all duration-300 active:scale-95"
                          >
                            <XCircle size={14} />
                            Annuler
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </motion.section>
            )}

            {/* Historique */}
            {pastBookings.length > 0 && (
              <motion.section
                className="space-y-3"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.5 }}
              >
                <h2 className="text-base font-bold text-foreground">
                  Historique
                </h2>

                <div className="space-y-2">
                  {pastBookings.map((booking, index) => {
                    const proName = booking.pro_activity_name || booking.pro_name;
                    const avatarUrl = getImageUrl(booking.pro_profile_photo);

                    return (
                      <motion.button
                        key={booking.id}
                        onClick={() => navigate(`/client/booking-detail/${booking.id}`)}
                        className="w-full bg-card rounded-2xl p-4 border-2 border-muted shadow-sm hover:shadow-md text-left transition-all duration-300 active:scale-[0.98]"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.4 + index * 0.1, duration: 0.4 }}
                      >
                        <div className="flex items-center gap-3">
                          {avatarUrl ? (
                            <img
                              src={avatarUrl}
                              alt={proName}
                              className="w-12 h-12 rounded-xl object-cover opacity-70"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center opacity-70">
                              <span className="text-lg font-bold text-primary">
                                {proName[0]}
                              </span>
                            </div>
                          )}
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <h3 className="font-semibold text-foreground text-sm">
                                {proName}
                              </h3>
                              <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] font-medium">
                                {booking.status === 'completed' ? 'Terminé' : 'Annulé'}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mb-2">
                              {booking.prestation_name} • {Number(booking.prestation_price).toFixed(2)}€
                            </p>

                            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Calendar size={10} />
                                {formatDate(booking.slot_date)}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock size={10} />
                                {formatTime(booking.slot_start_time)}
                              </span>
                            </div>
                          </div>

                          <ChevronRight size={16} className="text-muted-foreground flex-shrink-0" />
                        </div>

                        {/* Action CTA - Seulement si completed */}
                        {booking.status === 'completed' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/client/specialist/${booking.pro_id}`);
                            }}
                            className="w-full mt-3 py-2 rounded-lg bg-primary/5 text-primary text-xs font-semibold hover:bg-primary/10 transition-all flex items-center justify-center gap-1.5"
                          >
                            <Star size={12} />
                            Laisser un avis
                          </button>
                        )}
                      </motion.button>
                    );
                  })}
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
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setConfirmId(null)}
          >
            <motion.div
              className="bg-card rounded-3xl p-6 w-full max-w-sm shadow-2xl border-2 border-border"
              initial={{ scale: 0.9, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 20, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mb-4 mx-auto">
                <XCircle className="w-7 h-7 text-destructive" />
              </div>

              <h3 className="text-xl font-bold text-foreground mb-2 text-center">
                Annuler le rendez-vous ?
              </h3>
              <p className="text-sm text-muted-foreground mb-6 text-center">
                Cette action est définitive. Tu devras reprendre un nouveau rendez-vous si tu changes d'avis.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmId(null)}
                  className="flex-1 h-12 rounded-xl bg-muted text-foreground font-semibold hover:bg-muted/80 transition-all duration-300 active:scale-95"
                >
                  Retour
                </button>
                <button
                  onClick={() => handleCancelBooking(confirmId)}
                  className="flex-1 h-12 rounded-xl bg-destructive text-white font-semibold hover:bg-destructive/90 shadow-lg shadow-destructive/30 transition-all duration-300 active:scale-95"
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
