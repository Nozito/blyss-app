import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import MobileLayout from "@/components/MobileLayout";
import { 
  Calendar, Clock, XCircle, ChevronRight, Star, Loader2, 
  Sparkles, CheckCircle2, AlertCircle
} from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const getImageUrl = (imagePath: string | null): string | null => {
  if (!imagePath) return null;
  if (imagePath.startsWith('http')) return imagePath;
  return `${API_BASE_URL}/${imagePath}`;
};

interface Booking {
  id: number;
  start_datetime: string;
  end_datetime: string;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  price: number;
  paid_online: number;
  prestation_name: string;
  duration_minutes: number;
  pro_first_name: string;
  pro_last_name: string;
  activity_name: string | null;
  profile_photo: string | null;
  city: string | null;
}

const ClientMyBooking = () => {
  const navigate = useNavigate();
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchBookings = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const token = localStorage.getItem('auth_token');
        if (!token) {
          navigate('/login', { 
            replace: true,
            state: { message: 'Connectez-vous pour voir vos réservations' }
          });
          return;
        }

        const response = await fetch(`${API_BASE_URL}/api/client/my-booking`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.status === 401) {
          localStorage.removeItem('auth_token');
          navigate('/login', { 
            replace: true,
            state: { message: 'Session expirée, veuillez vous reconnecter' }
          });
          return;
        }

        if (!response.ok) {
          throw new Error(`Erreur ${response.status}`);
        }

        const data = await response.json();

        if (data.success && Array.isArray(data.data)) {
          setBookings(data.data);
        } else {
          setBookings([]);
        }

      } catch (err) {
        console.error('❌ Erreur lors du chargement:', err);
        setError(err instanceof Error ? err.message : 'Erreur de chargement');
      } finally {
        setIsLoading(false);
      }
    };

    fetchBookings();
  }, [navigate]);

  const handleCancelBooking = async (bookingId: number) => {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        navigate('/login');
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/client/booking/${bookingId}/cancel`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Erreur ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        setBookings(prev => prev.map(b => 
          b.id === bookingId 
            ? { ...b, status: 'cancelled' as const }
            : b
        ));
        setConfirmId(null);
      } else {
        alert(data?.message || 'Erreur lors de l\'annulation');
      }

    } catch (err) {
      console.error('❌ Erreur annulation:', err);
      alert('Erreur lors de l\'annulation');
    }
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const options: Intl.DateTimeFormatOptions = { 
      day: 'numeric', 
      month: 'long', 
      year: 'numeric',
      weekday: 'short'
    };
    return date.toLocaleDateString('fr-FR', options);
  };

  const formatTime = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('fr-FR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const upcomingBookings = bookings.filter(b => {
    const bookingDate = new Date(b.start_datetime);
    const now = new Date();
    return (b.status === 'confirmed' || b.status === 'pending') && bookingDate > now;
  });
  
  const pastBookings = bookings.filter(b => {
    const bookingDate = new Date(b.start_datetime);
    const now = new Date();
    return b.status === 'completed' || b.status === 'cancelled' || bookingDate <= now;
  });

  const hasOnlyPastBookings = upcomingBookings.length === 0 && pastBookings.length > 0;

  // ✅ Skeleton Loader amélioré
  if (isLoading) {
    return (
      <MobileLayout>
        <div className="min-h-screen bg-background">
          {/* Header Skeleton */}
          <div className="pt-6 pb-6 text-center px-6">
            <div className="h-8 w-48 bg-muted rounded-xl mx-auto mb-2 animate-pulse" />
            <div className="h-4 w-32 bg-muted rounded-lg mx-auto animate-pulse" />
          </div>

          {/* Cards Skeleton */}
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

  // Error state
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
            <button
              onClick={() => window.location.reload()}
              className="mt-6 px-8 py-3 rounded-2xl bg-primary text-white font-semibold shadow-lg hover:shadow-xl transition-all active:scale-95"
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
      <div className="min-h-screen bg-background pb-32">
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
        </motion.div>

        {/* ✅ NOUVEAU: Banner CTA si historique seulement */}
        {hasOnlyPastBookings && (
          <motion.div
            className="mx-6 mb-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent rounded-3xl p-6 border-2 border-primary/20 relative overflow-hidden">
              {/* Sparkles d'arrière-plan */}
              <div className="absolute top-2 right-2 opacity-20">
                <Sparkles className="w-12 h-12 text-primary" />
              </div>
              
              <div className="relative z-10">
                <h3 className="text-xl font-bold text-foreground mb-2">
                  Prête pour un nouveau soin ?
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Retrouve nos expertes et réserve ta prochaine prestation en quelques clics !
                </p>
                <button
                  onClick={() => navigate("/client/specialists")}
                  className="
                    w-full px-6 py-3 rounded-2xl
                    bg-primary text-white font-semibold
                    shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40
                    transition-all duration-300
                    active:scale-95
                    flex items-center justify-center gap-2
                  "
                >
                  <Sparkles size={18} />
                  Réserve dès mainteant
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Empty state - Aucune réservation */}
        {bookings.length === 0 ? (
          <motion.div
            className="flex flex-col items-center justify-center py-20 px-6 text-center"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6 }}
          >
            <motion.div 
              className="w-32 h-32 rounded-full bg-primary/10 flex items-center justify-center mb-6"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            >
              <Calendar size={64} className="text-primary" />
            </motion.div>
            <h2 className="text-2xl font-bold text-foreground mb-2">
              Aucune réservation
            </h2>
            <p className="text-muted-foreground mb-8 max-w-sm">
              Ajoute des prothésistes à tes réservations pour les retrouver facilement
            </p>
            <button
              onClick={() => navigate("/client")}
              className="
                px-10 py-4 rounded-3xl
                bg-primary hover:bg-primary/90
                text-white font-semibold text-lg
                shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40
                transition-all duration-300
                active:scale-95
                flex items-center gap-2
              "
            >
              <Sparkles size={20} />
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
                    const proName = booking.activity_name || `${booking.pro_first_name} ${booking.pro_last_name}`;
                    const avatarUrl = getImageUrl(booking.profile_photo);

                    return (
                      <motion.div
                        key={booking.id}
                        className="bg-card rounded-3xl overflow-hidden shadow-lg shadow-black/5 border-2 border-primary/20 hover:border-primary/40 transition-all duration-300"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2 + index * 0.1, duration: 0.5 }}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        {/* Header */}
                        <button
                          onClick={() => navigate(`/client/booking-detail/${booking.id}`)}
                          className="w-full p-5 text-left hover:bg-primary/5 transition-all duration-300"
                        >
                          <div className="flex items-center gap-4">
                            <div className="relative">
                              {avatarUrl ? (
                                <img
                                  src={avatarUrl}
                                  alt={proName}
                                  className="w-16 h-16 rounded-2xl object-cover shadow-md"
                                />
                              ) : (
                                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-md">
                                  <span className="text-2xl font-bold text-white">
                                    {proName[0]}
                                  </span>
                                </div>
                              )}
                              <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-green-500 border-2 border-card flex items-center justify-center">
                                <CheckCircle2 size={12} className="text-white" />
                              </div>
                            </div>
                            
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2 mb-1">
                                <h3 className="font-bold text-foreground text-lg">
                                  {proName}
                                </h3>
                                <ChevronRight size={20} className="text-muted-foreground flex-shrink-0" />
                              </div>
                              <p className="text-sm text-muted-foreground mb-2 font-medium">
                                {booking.prestation_name}
                              </p>

                              <div className="flex items-center gap-3 text-xs">
                                <div className="flex items-center gap-1.5 text-muted-foreground bg-muted/50 px-2 py-1 rounded-lg">
                                  <Calendar size={12} />
                                  <span className="font-medium">{formatDate(booking.start_datetime).split(' ').slice(0, 3).join(' ')}</span>
                                </div>

                                <div className="flex items-center gap-1.5 bg-primary/10 px-2 py-1 rounded-lg">
                                  <Clock size={12} className="text-primary" />
                                  <span className="font-bold text-primary">
                                    {formatTime(booking.start_datetime)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </button>

                        {/* Actions */}
                        <div className="flex border-t border-muted">
                          <button
                            onClick={() => navigate(`/client/booking-detail/${booking.id}`)}
                            className="
                              flex-1 px-5 py-3
                              flex items-center justify-center gap-2
                              text-sm font-semibold text-primary
                              hover:bg-primary/10
                              transition-all duration-300
                              active:scale-95
                              border-r border-muted
                            "
                          >
                            <Calendar size={16} />
                            Voir détails
                          </button>

                          <button
                            onClick={() => setConfirmId(booking.id)}
                            className="
                              flex-1 px-5 py-3
                              flex items-center justify-center gap-2
                              text-sm font-semibold text-destructive
                              hover:bg-destructive/10
                              transition-all duration-300
                              active:scale-95
                            "
                          >
                            <XCircle size={16} />
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
                <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                  Historique
                  <span className="text-xs font-normal text-muted-foreground">
                    ({pastBookings.length})
                  </span>
                </h2>

                <div className="space-y-2">
                  {pastBookings.map((booking, index) => {
                    const proName = booking.activity_name || `${booking.pro_first_name} ${booking.pro_last_name}`;
                    const avatarUrl = getImageUrl(booking.profile_photo);
                    const isCompleted = booking.status === 'completed';

                    return (
                      <motion.div
                        key={booking.id}
                        className="bg-card rounded-3xl overflow-hidden shadow-md shadow-black/5 border border-muted hover:shadow-lg transition-all duration-300"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.4 + index * 0.05, duration: 0.5 }}
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                      >
                        <button
                          onClick={() => navigate(`/client/booking-detail/${booking.id}`)}
                          className="w-full p-4 text-left hover:bg-muted/30 transition-all duration-300"
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
                                <span className={`
                                  px-2 py-0.5 rounded-full text-[10px] font-bold
                                  ${isCompleted
                                    ? 'bg-green-100 text-green-700' 
                                    : 'bg-gray-100 text-gray-600'
                                  }
                                `}>
                                  {isCompleted ? '✓ Terminé' : '✕ Annulé'}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground mb-2">
                                {booking.prestation_name} • {Number(booking.price).toFixed(2)}€
                              </p>

                              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Calendar size={10} />
                                  {formatDate(booking.start_datetime).split(' ').slice(0, 3).join(' ')}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Clock size={10} />
                                  {formatTime(booking.start_datetime)}
                                </span>
                              </div>
                            </div>

                            <ChevronRight size={16} className="text-muted-foreground flex-shrink-0" />
                          </div>
                        </button>
                      </motion.div>
                    );
                  })}
                </div>
              </motion.section>
            )}
          </div>
        )}
      </div>

      {/* Modal d'annulation */}
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
                <AlertCircle className="w-7 h-7 text-destructive" />
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
