import { useNavigate, useParams } from "react-router-dom";
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import MobileLayout from "@/components/MobileLayout";
import {
  ArrowLeft, Calendar, Clock, MapPin, Star, MessageSquare,
  Euro, Loader2, AlertCircle, CheckCircle2, Phone
} from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const getImageUrl = (imagePath: string | null): string | null => {
  if (!imagePath) return null;
  if (imagePath.startsWith('http')) return imagePath;
  return `${API_BASE_URL}/${imagePath}`;
};

interface BookingDetail {
  id: number;
  start_datetime: string;
  end_datetime: string;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  price: number;
  paid_online: number;
  prestation_name: string;
  prestation_description: string | null;
  duration_minutes: number;
  pro_first_name: string;
  pro_last_name: string;
  activity_name: string | null;
  profile_photo: string | null;
  city: string | null;
  pro_phone: string | null;
}

const BookingDetail = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [hoveredStar, setHoveredStar] = useState(0);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  // Parse id and validate
  const bookingId = id && !isNaN(Number(id)) ? Number(id) : null;

  const checkAuth = useCallback(() => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      navigate('/login', {
        replace: true,
        state: {
          message: 'Connectez-vous pour voir vos réservations',
          returnUrl: `/client/booking-detail/${id}`
        }
      });
      return null;
    }
    return token;
  }, [navigate, id]);

  useEffect(() => {
  let ignore = false;
  const fetchBookingDetail = async () => {
    setIsLoading(true);
    setError(null);

    // Validate id
    if (!bookingId) {
      setIsLoading(false);
      setError('ID invalide');
      return;
    }

    // Get token
    const token = localStorage.getItem('auth_token');
    if (!token) {
      navigate('/login', {
        replace: true,
        state: {
          message: 'Connectez-vous pour voir vos réservations',
          returnUrl: `/client/booking-detail/${bookingId}`
        }
      });
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/client/booking-detail/${bookingId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.status === 401) {
        localStorage.removeItem('auth_token');
        navigate('/login', {
          replace: true,
          state: {
            message: 'Session expirée. Reconnectez-vous.',
            returnUrl: `/client/booking-detail/${bookingId}`
          }
        });
        setIsLoading(false);
        return;
      }

      if (!response.ok) {
        if (response.status === 404) throw new Error('Réservation introuvable');
        throw new Error(`Erreur ${response.status}`);
      }

      const data = await response.json();
      if (data.success && data.data) {
        const b = data.data;

        // Convertir les champs numériques pour éviter les erreurs
        b.price = Number(b.price) || 0;
        b.paid_online = Number(b.paid_online) || 0;
        b.duration_minutes = Number(b.duration_minutes) || 0;

        if (!ignore) setBooking(b);
      } else {
        throw new Error('Données invalides');
      }
    } catch (err) {
      if (!ignore) setError(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      if (!ignore) setIsLoading(false);
    }
  };
  fetchBookingDetail();
  return () => { ignore = true; };
}, [bookingId, navigate]);

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const options: Intl.DateTimeFormatOptions = {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      weekday: 'long'
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

  const formatDuration = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0 && mins > 0) return `${hours}h${mins}`;
    if (hours > 0) return `${hours}h`;
    return `${mins}min`;
  };

  const handleSubmitReview = async () => {
    if (rating === 0 || !booking) return;
    const token = checkAuth();
    if (!token) return;
    setIsSubmittingReview(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/reviews`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          reservation_id: booking.id,
          pro_id: booking.id,
          rating,
          comment: comment.trim() || null
        })
      });
      if (!response.ok) {
        throw new Error('Erreur lors de l\'envoi de l\'avis');
      }
      const data = await response.json();
      if (data.success) {
        setShowReviewModal(false);
        setRating(0);
        setComment("");
        alert('Merci pour ton avis ! 🌟');
      }
    } catch (error) {
      alert('Impossible d\'envoyer ton avis. Réessaie plus tard.');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  if (isLoading) {
    return (
      <MobileLayout showNav={false}>
        <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
          <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
          <p className="text-sm text-muted-foreground">Chargement des détails...</p>
        </div>
      </MobileLayout>
    );
  }

  if (error || !booking) {
    return (
      <MobileLayout showNav={false}>
        <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
          <div className="text-center space-y-4">
            <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-10 h-10 text-destructive" />
            </div>
            <h2 className="text-xl font-bold text-foreground">Oups !</h2>
            <p className="text-sm text-muted-foreground max-w-sm">
              {error || 'Réservation introuvable'}
            </p>
            <button
              onClick={() => navigate('/client/my-booking')}
              className="mt-6 px-8 py-3 rounded-2xl bg-primary text-white font-semibold shadow-lg hover:shadow-xl transition-all active:scale-95"
            >
              Retour à mes réservations
            </button>
          </div>
        </div>
      </MobileLayout>
    );
  }

  const isPast = booking.status === 'completed' || booking.status === 'cancelled';
  const isCancelled = booking.status === 'cancelled';
  const proName = booking.activity_name || `${booking.pro_first_name} ${booking.pro_last_name}`;
  const profilePhotoUrl = getImageUrl(booking.profile_photo);

  return (
    <MobileLayout showNav={false}>
      <div className="min-h-screen bg-background pb-6">
        <motion.div
          className="flex items-center gap-4 px-6 pt-6 pb-4"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <button
            onClick={() => navigate('/client/my-booking')}
            className="
              w-11 h-11 rounded-2xl bg-card border border-muted
              flex items-center justify-center
              hover:bg-muted/50
              transition-all duration-300
              active:scale-95
            "
            aria-label="Retour"
          >
            <ArrowLeft size={20} className="text-foreground" />
          </button>
          <h1 className="text-2xl font-display font-bold text-foreground">
            Détail réservation
          </h1>
        </motion.div>

        <div className="px-6 space-y-5">
          <motion.div
            className="flex justify-center"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
          >
            <span
              className={`
                px-6 py-2.5 rounded-full text-sm font-bold flex items-center gap-2
                ${
                  isCancelled
                    ? "bg-gray-100 text-gray-600"
                    : isPast
                    ? "bg-green-100 text-green-700"
                    : "bg-primary/10 text-primary border-2 border-primary/20"
                }
              `}
            >
              {isCancelled ? (
                <>
                  <AlertCircle size={16} />
                  Annulée
                </>
              ) : isPast ? (
                <>
                  <CheckCircle2 size={16} />
                  Terminée
                </>
              ) : (
                <>
                  <Calendar size={16} />
                  À venir
                </>
              )}
            </span>
          </motion.div>

          <motion.div
            className="
              w-full bg-card rounded-3xl p-5
              shadow-lg shadow-black/5 border-2 border-border
            "
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 rounded-2xl overflow-hidden flex-shrink-0 shadow-md">
                {profilePhotoUrl ? (
                  <img
                    src={profilePhotoUrl}
                    alt={proName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
                    <span className="text-2xl font-bold text-white">
                      {proName[0]}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-foreground text-lg mb-0.5">
                  {proName}
                </h3>
                <p className="text-sm text-muted-foreground">
                  Prothésiste ongulaire
                </p>
              </div>
            </div>
            {booking.pro_phone && (
              <div className="flex gap-2">
                <a
                  href={`tel:${booking.pro_phone}`}
                  className="
                    flex-1 px-4 py-2.5 rounded-xl
                    bg-primary/10 text-primary
                    font-semibold text-sm
                    flex items-center justify-center gap-2
                    hover:bg-primary/20
                    transition-all duration-300
                    active:scale-95
                  "
                >
                  <Phone size={16} />
                  Appeler
                </a>
                <a
                  href={`sms:${booking.pro_phone}`}
                  className="
                    flex-1 px-4 py-2.5 rounded-xl
                    bg-muted text-foreground
                    font-semibold text-sm
                    flex items-center justify-center gap-2
                    hover:bg-muted/80
                    transition-all duration-300
                    active:scale-95
                  "
                >
                  <MessageSquare size={16} />
                  SMS
                </a>
              </div>
            )}
          </motion.div>

          <motion.div
            className="bg-card rounded-3xl p-6 shadow-lg shadow-black/5 border-2 border-border space-y-5"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.5 }}
          >
            <div>
              <h3 className="text-lg font-bold text-foreground mb-1">
                {booking.prestation_name}
              </h3>
              {booking.prestation_description && (
                <p className="text-sm text-muted-foreground mb-2">
                  {booking.prestation_description}
                </p>
              )}
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Calendar size={20} className="text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground mb-0.5 font-medium">Date</p>
                    <p className="text-sm font-semibold text-foreground">
                    {(() => {
                      const s = formatDate(booking.start_datetime);
                      return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
                    })()}
                    </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Clock size={20} className="text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground mb-0.5 font-medium">Horaire & Durée</p>
                  <p className="text-sm font-semibold text-foreground">
                    {formatTime(booking.start_datetime)} • {formatDuration(booking.duration_minutes)}
                  </p>
                </div>
              </div>
              {booking.city && (
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <MapPin size={20} className="text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground mb-0.5 font-medium">Ville</p>
                    <p className="text-sm font-semibold text-foreground">
                      {booking.city}
                    </p>
                  </div>
                </div>
              )}
            </div>
            <div className="pt-5 border-t-2 border-border flex items-center justify-between">
              <span className="text-muted-foreground font-semibold">Total</span>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold text-foreground">
                  {booking.price.toFixed(2)}
                </span>
                <span className="text-lg font-bold text-foreground">€</span>
              </div>
            </div>
            <div className="flex items-center justify-between pt-3">
              <span className="text-xs text-muted-foreground">Paiement</span>
              <span className={`
                text-xs font-bold px-3 py-1 rounded-full
                ${booking.paid_online
                  ? 'bg-green-100 text-green-700'
                  : 'bg-yellow-100 text-yellow-700'
                }
              `}>
                {booking.paid_online ? 'Payé en ligne' : 'Sur place'}
              </span>
            </div>
          </motion.div>

          {booking.status === 'completed' && (
            <motion.button
              onClick={() => setShowReviewModal(true)}
              className="
                w-full h-14 rounded-2xl
                bg-gradient-to-r from-primary to-primary/90
                text-white font-bold
                shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40
                flex items-center justify-center gap-2
                transition-all duration-300
                active:scale-[0.98]
              "
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.5 }}
            >
              <Star size={20} />
              Laisser un avis
            </motion.button>
          )}
        </div>
      </div>
      <AnimatePresence>
        {showReviewModal && (
          <>
            <motion.div
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowReviewModal(false)}
            />
            <motion.div
              className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-4"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
            >
              <div
                className="w-full max-w-lg bg-card rounded-3xl p-6 shadow-2xl border-2 border-border"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="w-12 h-1.5 bg-muted rounded-full mx-auto mb-6" />
                <h3 className="text-2xl font-display font-bold text-foreground text-center mb-2">
                  Laisser un avis
                </h3>
                <p className="text-sm text-muted-foreground text-center mb-6">
                  Partage ton expérience avec {proName}
                </p>
                <div className="flex items-center justify-center gap-2 mb-8">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <motion.button
                      key={star}
                      onClick={() => setRating(star)}
                      onMouseEnter={() => setHoveredStar(star)}
                      onMouseLeave={() => setHoveredStar(0)}
                      className="p-1 transition-transform active:scale-90"
                      whileHover={{ scale: 1.15 }}
                      whileTap={{ scale: 0.9 }}
                      aria-label={`${star} étoile${star > 1 ? 's' : ''}`}
                    >
                      <Star
                        size={42}
                        className={`transition-all duration-200 ${
                          star <= (hoveredStar || rating)
                            ? "text-yellow-400 fill-yellow-400 drop-shadow-lg"
                            : "text-muted-foreground"
                        }`}
                      />
                    </motion.button>
                  ))}
                </div>
                {rating > 0 && (
                  <p className="text-center text-sm font-semibold text-primary mb-4">
                    {rating === 5 ? "Exceptionnel ! 🌟" :
                      rating === 4 ? "Très bien ! 👍" :
                        rating === 3 ? "Correct 👌" :
                          rating === 2 ? "Peut mieux faire 😐" :
                            "Décevant 😞"}
                  </p>
                )}
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Décris ton expérience (optionnel)..."
                  className="
                    w-full h-32 px-4 py-3 rounded-2xl
                    bg-muted border-2 border-transparent
                    text-foreground placeholder:text-muted-foreground
                    resize-none
                    focus:outline-none focus:border-primary
                    transition-all duration-300
                    mb-2
                  "
                  maxLength={500}
                  disabled={isSubmittingReview}
                />
                {comment && (
                  <p className="text-xs text-muted-foreground text-right mb-4">
                    {comment.length}/500 caractères
                  </p>
                )}
                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => setShowReviewModal(false)}
                    disabled={isSubmittingReview}
                    className="
                      flex-1 h-12 rounded-xl
                      bg-muted text-foreground font-semibold
                      hover:bg-muted/80
                      disabled:opacity-50
                      transition-all duration-300
                      active:scale-95
                    "
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleSubmitReview}
                    disabled={rating === 0 || isSubmittingReview}
                    className="
                      flex-1 h-12 rounded-xl
                      bg-primary text-white font-bold
                      hover:bg-primary/90
                      shadow-lg shadow-primary/30
                      disabled:opacity-50 disabled:cursor-not-allowed
                      transition-all duration-300
                      active:scale-95
                      flex items-center justify-center gap-2
                    "
                  >
                    {isSubmittingReview ? (
                      <>
                        <Loader2 size={18} className="animate-spin" />
                        Envoi...
                      </>
                    ) : (
                      'Envoyer'
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </MobileLayout>
  );
};

export default BookingDetail;