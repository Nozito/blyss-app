import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, MapPin, Star, Clock, Heart, Loader2, Instagram, Sparkles, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { favoritesApi, API_URL } from "@/services/api";

const getImageUrl = (imagePath: string | null): string | null => {
  if (!imagePath) return null;
  if (imagePath.startsWith('http')) return imagePath;
  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  return `${API_BASE_URL}/${imagePath}`;
};

const getInstagramUrl = (username: string): string => {
  const cleanUsername = username.replace('@', '').trim();
  return `https://instagram.com/${cleanUsername}`;
};

const formatDuration = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0 && mins > 0) return `${hours}h${mins}`;
  if (hours > 0) return `${hours}h`;
  return `${mins}min`;
};

const formatReviewDate = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Aujourd'hui";
  if (diffDays === 1) return "Hier";
  if (diffDays < 7) return `Il y a ${diffDays} jours`;
  if (diffDays < 30) return `Il y a ${Math.floor(diffDays / 7)} semaine(s)`;
  if (diffDays < 365) return `Il y a ${Math.floor(diffDays / 30)} mois`;
  return `Il y a ${Math.floor(diffDays / 365)} an(s)`;
};

interface Pro {
  id: number;
  first_name: string;
  last_name: string;
  activity_name: string | null;
  city: string | null;
  profile_photo: string | null;
  banner_photo: string | null;
  instagram_account: string | null;
  bio: string | null;
  pro_status: string;
}

interface Prestation {
  id: number;
  name: string;
  description: string | null;
  price: number;
  duration_minutes: number;
  active: boolean;
}

interface Review {
  id: number;
  pro_id: number;
  client_id: number;
  rating: number;
  comment: string | null;
  created_at: string;
}

const SpecialistProfile = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [pro, setPro] = useState<Pro | null>(null);
  const [prestations, setPrestations] = useState<Prestation[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAllReviews, setShowAllReviews] = useState(false);

  const avgRating = useMemo(() =>
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0,
    [reviews]
  );

  const reviewsCount = reviews.length;

  const displayedReviews = useMemo(() => {
    const sorted = [...reviews].sort((a, b) => b.rating - a.rating);
    return showAllReviews ? sorted : sorted.slice(0, 3);
  }, [reviews, showAllReviews]);

  const formattedReviews = useMemo(() =>
    displayedReviews.map(review => ({
      id: review.id,
      author: 'Client',
      rating: review.rating,
      comment: review.comment || '',
      date: formatReviewDate(review.created_at),
      avatar: 'C'
    })),
    [displayedReviews]
  );

  const displayName = useMemo(() =>
    pro ? (pro.activity_name || `${pro.first_name} ${pro.last_name}`) : '',
    [pro]
  );

  // ✅ Chargement avec les routes backend directes
  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;

      try {
        setIsLoading(true);
        setError(null);

        // ✅ Route: GET /api/users/pros/:id
        const proRes = await fetch(`${API_URL}/api/users/pros/${id}`);
        const proData = await proRes.json();

        if (!proData.success || !proData.data) {
          throw new Error("Professionnel non trouvé");
        }
        setPro(proData.data);

        // ✅ Route: GET /api/prestations/pro/:id
        const prestationsRes = await fetch(`${API_URL}/api/prestations/pro/${id}`);
        if (prestationsRes.ok) {
          const prestationsData = await prestationsRes.json();
          if (prestationsData.success && prestationsData.data) {
            const activePrestations = prestationsData.data
              .filter((p: Prestation) => p.active)
              .map((p: any) => ({
                id: p.id,
                name: p.name,
                description: p.description,
                price: Number(p.price),
                duration_minutes: Number(p.duration_minutes),
                active: p.active
              }));
            setPrestations(activePrestations);
          }
        }

        // ✅ Route: GET /api/reviews/pro/:proId
        const reviewsRes = await fetch(`${API_URL}/api/reviews/pro/${id}`);
        const reviewsData = await reviewsRes.json();

        // Tolérance aux différentes structures de l'API
        const reviewsArray = Array.isArray(reviewsData)
          ? reviewsData
          : Array.isArray(reviewsData?.data)
            ? reviewsData.data
            : [];

        console.log("reviewsArray:", reviewsArray); // Vérification en prod
        setReviews(reviewsArray);

        if (reviewsData.success && reviewsData.data) {
          setReviews(reviewsData.data);
        }

        // ✅ Favoris via api.ts (celui-là marche)
        const token = localStorage.getItem('auth_token');
        if (token) {
          try {
            const favoritesResponse = await favoritesApi.getAll();
            if (favoritesResponse.success && favoritesResponse.data) {
              const favoriteIds = favoritesResponse.data.map((fav: { pro_id: number }) => fav.pro_id);
              setIsFavorite(favoriteIds.includes(Number(id)));
            }
          } catch {
            setIsFavorite(false);
          }
        }

      } catch (err) {
        console.error("Error fetching specialist:", err);
        setError(err instanceof Error ? err.message : "Erreur de chargement");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [id]);

  useEffect(() => {
    const pendingAction = localStorage.getItem('pendingAction');
    const token = localStorage.getItem('auth_token');

    if (pendingAction === 'review' && token) {
      localStorage.removeItem('pendingAction');
      setShowReviewModal(true);
    }
  }, []);

  const handleToggleFavorite = useCallback(async () => {
    if (!id) return;

    const token = localStorage.getItem('auth_token');
    if (!token) {
      const returnUrl = `/client/specialist/${id}`;
      localStorage.setItem('returnUrl', returnUrl);
      navigate('/login', {
        state: {
          message: 'Connectez-vous pour ajouter aux favoris',
          returnUrl
        }
      });
      return;
    }

    if (navigator.vibrate) navigator.vibrate(5);

    const previousState = isFavorite;
    setIsFavorite(!previousState);

    try {
      if (previousState) {
        const response = await favoritesApi.remove(Number(id));
        if (!response.success) {
          throw new Error("Erreur lors de la suppression");
        }
      } else {
        const response = await favoritesApi.add(Number(id));
        if (!response.success) {
          throw new Error("Erreur lors de l'ajout");
        }
      }
    } catch (error) {
      console.error("Error toggling favorite:", error);
      setIsFavorite(previousState);
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    }
  }, [id, isFavorite, navigate]);

  const handleReservationClick = useCallback(() => {
    const token = localStorage.getItem('auth_token');

    if (!token) {
      localStorage.setItem('returnUrl', `/client/booking/${id}`);
      navigate('/login', {
        state: {
          message: 'Connectez-vous pour réserver',
          returnUrl: `/client/booking/${id}`
        },
        replace: true
      });
      return;
    }

    navigate(`/client/booking/${id}`, { replace: true });
  }, [id, navigate]);

  const handleReviewClick = useCallback(() => {
    const token = localStorage.getItem('auth_token');

    if (!token) {
      localStorage.setItem('returnUrl', `/client/specialist/${id}`);
      localStorage.setItem('pendingAction', 'review');

      navigate('/login', {
        state: {
          message: 'Connectez-vous pour laisser un avis',
          returnUrl: `/client/specialist/${id}`
        }
      });
      return;
    }

    setShowReviewModal(true);
  }, [id, navigate]);

  // ✅ Soumettre avis avec route directe
  const handleSubmitReview = useCallback(async () => {
    if (rating === 0 || !id) return;

    const token = localStorage.getItem('auth_token');
    if (!token) {
      localStorage.setItem('returnUrl', `/client/specialist/${id}`);
      localStorage.setItem('pendingAction', 'review');

      navigate('/login', {
        state: {
          message: 'Connectez-vous pour laisser un avis',
          returnUrl: `/client/specialist/${id}`
        }
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // ✅ Route: POST /api/reviews
      const response = await fetch(`${API_URL}/api/reviews`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          pro_id: Number(id),
          rating,
          comment: comment.trim() || null
        })
      });

      if (response.status === 401) {
        localStorage.removeItem('auth_token');
        localStorage.setItem('returnUrl', `/client/specialist/${id}`);
        localStorage.setItem('pendingAction', 'review');

        navigate('/login', {
          state: {
            message: 'Session expirée. Reconnectez-vous.',
            returnUrl: `/client/specialist/${id}`
          }
        });
        return;
      }

      const data = await response.json();

      if (data.success) {
        setShowReviewModal(false);
        setRating(0);
        setComment("");

        // Recharger les avis
        const reviewsRes = await fetch(`${API_URL}/api/reviews/pro/${id}`);
        const reviewsData = await reviewsRes.json();

        if (reviewsData.success && reviewsData.data) {
          setReviews(reviewsData.data);
        }
      } else {
        throw new Error(data.message || "Erreur");
      }
    } catch (error) {
      console.error("Error submitting review:", error);
      alert("Erreur lors de l'envoi de l'avis");
    } finally {
      setIsSubmitting(false);
    }
  }, [id, rating, comment, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
        <p className="text-sm text-muted-foreground">Chargement du profil...</p>
      </div>
    );
  }

  if (error || !pro) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
        <div className="text-center space-y-4">
          <p className="text-lg font-semibold text-foreground">Professionnel introuvable</p>
          <p className="text-sm text-muted-foreground">{error || "Ce professionnel n'existe pas"}</p>
          <button
            onClick={() => navigate(-1)}
            className="px-6 py-3 rounded-xl bg-primary text-white font-medium active:scale-95 transition-transform"
          >
            Retour
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="relative min-h-[100dvh] w-full bg-background text-foreground pb-24">
        {/* Bannière */}
        <div className="relative h-64 w-full overflow-hidden bg-muted">
          {pro.banner_photo ? (
            <img
              src={getImageUrl(pro.banner_photo) || undefined}
              alt="Bannière"
              className="absolute inset-0 w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Sparkles size={48} className="text-muted-foreground/30" />
            </div>
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />

          <button
            onClick={() => navigate(-1)}
            className="absolute left-4 top-4 w-10 h-10 rounded-full bg-white/90 backdrop-blur-sm shadow-lg flex items-center justify-center z-30 active:scale-95 transition-transform"
            aria-label="Retour"
          >
            <ArrowLeft size={20} className="text-foreground" />
          </button>

          <button
            onClick={handleToggleFavorite}
            className="absolute right-4 top-4 w-10 h-10 rounded-full bg-white/90 backdrop-blur-sm shadow-lg flex items-center justify-center z-30 active:scale-95 transition-all"
            aria-label={isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"}
          >
            <Heart
              size={20}
              className={`transition-colors ${isFavorite ? "text-red-500 fill-red-500" : "text-foreground"}`}
            />
          </button>
        </div>

        {/* Avatar */}
        <div className="absolute top-[200px] left-1/2 -translate-x-1/2 z-[100]">
          <div className="w-32 h-32 rounded-2xl bg-background border-4 border-background shadow-xl overflow-hidden">
            {pro.profile_photo ? (
              <img
                src={getImageUrl(pro.profile_photo) || undefined}
                alt={displayName}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full bg-primary/10 flex items-center justify-center">
                <span className="text-5xl font-bold text-primary">
                  {pro.first_name[0]}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Contenu */}
        <div className="pt-20 space-y-6 px-4">
          {/* Header infos */}
          <section className="text-center space-y-3">
            <div>
              <h1 className="text-2xl font-bold text-foreground mb-1">
                {displayName}
              </h1>
            </div>

            {reviewsCount > 0 && (
              <div className="flex items-center justify-center gap-2">
                <Star size={16} className="text-yellow-400 fill-yellow-400" />
                <span className="font-semibold text-foreground">
                  {avgRating.toFixed(1)}
                </span>
                <span className="text-sm text-muted-foreground">
                  ({reviewsCount} avis)
                </span>
              </div>
            )}

            {pro.city && (
              <div className="flex items-center justify-center gap-1.5">
                <MapPin size={14} className="text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{pro.city}</span>
              </div>
            )}

            {pro.instagram_account && (
              <a
                href={getInstagramUrl(pro.instagram_account)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-primary font-medium hover:underline active:scale-95 transition-transform"
              >
                <Instagram size={16} />
                {pro.instagram_account.startsWith('@') ? pro.instagram_account : `@${pro.instagram_account}`}
              </a>
            )}
          </section>

          {/* À propos */}
          {pro.bio && (
            <section className="bg-card rounded-2xl p-4 shadow-sm border-2 border-border">
              <h2 className="text-base font-bold text-foreground mb-2">
                À propos
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {pro.bio}
              </p>
            </section>
          )}

          {/* Prestations */}
          {prestations.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-foreground">
                  Prestations
                </h2>
                <span className="text-xs text-muted-foreground">
                  {prestations.length} service{prestations.length > 1 ? 's' : ''}
                </span>
              </div>

              <div className="space-y-3">
                {prestations.map((prestation) => (
                  <div
                    key={prestation.id}
                    className="bg-card rounded-2xl p-4 shadow-sm border-2 border-border"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <h3 className="font-semibold text-foreground text-sm mb-1">
                          {prestation.name}
                        </h3>
                        {prestation.description && (
                          <p className="text-xs text-muted-foreground mb-2">
                            {prestation.description}
                          </p>
                        )}
                        <div className="flex items-center gap-1">
                          <Clock size={12} className="text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">
                            {formatDuration(prestation.duration_minutes)}
                          </span>
                        </div>
                      </div>
                      <span className="font-bold text-lg text-foreground">
                        {prestation.price.toFixed(2)}€
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* CTA principal */}
          <section>
            <button
              onClick={handleReservationClick}
              className="w-full py-4 rounded-2xl bg-primary text-white font-semibold shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 active:scale-[0.98] transition-all"
            >
              Réserver avec {pro.first_name}
            </button>
          </section>

          {/* Avis - Toujours afficher cette section */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-foreground">
                Avis clients
              </h2>
              {reviewsCount > 0 && (
                <div className="flex items-center gap-1">
                  <Star size={14} className="text-yellow-400 fill-yellow-400" />
                  <span className="font-semibold text-foreground text-sm">
                    {avgRating.toFixed(1)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ({reviewsCount})
                  </span>
                </div>
              )}
            </div>

            {/* Afficher les avis s'il y en a */}
            {formattedReviews.length > 0 && (
              <>
                <div className="space-y-3">
                  {formattedReviews.map((review) => (
                    <div
                      key={review.id}
                      className="bg-card rounded-2xl p-4 shadow-sm border-2 border-border"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-sm font-semibold text-primary">
                            {review.avatar}
                          </span>
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-foreground text-sm">
                              {review.author}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {review.date}
                            </span>
                          </div>

                          <div className="flex items-center gap-0.5 mb-2">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Star
                                key={star}
                                size={12}
                                className={star <= review.rating
                                  ? "text-yellow-400 fill-yellow-400"
                                  : "text-muted-foreground/30"
                                }
                              />
                            ))}
                          </div>

                          {review.comment && (
                            <p className="text-sm text-muted-foreground leading-relaxed">
                              {review.comment}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {reviewsCount > 3 && (
                  <button
                    onClick={() => setShowAllReviews(!showAllReviews)}
                    className="w-full py-3 rounded-xl bg-muted text-foreground font-medium active:scale-[0.98] transition-transform text-sm flex items-center justify-center gap-2"
                  >
                    {showAllReviews ? 'Voir moins' : `Voir ${reviewsCount - 3} avis de plus`}
                    <ChevronRight size={16} className={`transition-transform ${showAllReviews ? 'rotate-90' : ''}`} />
                  </button>
                )}
              </>
            )}

            {/* Message si aucun avis */}
            {formattedReviews.length === 0 && (
              <div className="bg-card rounded-2xl p-6 shadow-sm border-2 border-border text-center">
                <Star size={32} className="text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  Aucun avis pour le moment. Soyez le premier à partager votre expérience !
                </p>
              </div>
            )}

            {/* Bouton pour laisser un avis - Toujours visible */}
            <button
              onClick={handleReviewClick}
              className="w-full py-3 rounded-xl border-2 border-primary text-primary font-medium active:scale-[0.98] transition-transform text-sm"
            >
              Laisser un avis
            </button>
          </section>
        </div>
      </div>

      {/* Modal avis - EN DEHORS de la div principale */}
      <AnimatePresence>
        {showReviewModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 backdrop-blur-sm"
            onClick={() => setShowReviewModal(false)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[430px] bg-card rounded-t-3xl p-6 pb-10 shadow-2xl"
            >
              <div className="w-12 h-1 bg-muted rounded-full mx-auto mb-6" />

              <h3 className="text-xl font-bold text-foreground text-center mb-6">
                Laisser un avis
              </h3>

              <div className="flex items-center justify-center gap-2 mb-6">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => setRating(star)}
                    className="p-1 active:scale-90 transition-transform"
                    disabled={isSubmitting}
                    aria-label={`${star} étoile${star > 1 ? 's' : ''}`}
                  >
                    <Star
                      size={32}
                      className={star <= rating
                        ? "text-yellow-400 fill-yellow-400"
                        : "text-muted-foreground"
                      }
                    />
                  </button>
                ))}
              </div>

              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Décrivez votre expérience... (optionnel)"
                className="w-full h-32 px-4 py-3 rounded-xl bg-muted border-2 border-transparent focus:border-primary text-foreground placeholder:text-muted-foreground resize-none focus:outline-none transition-all mb-6 text-sm"
                disabled={isSubmitting}
                maxLength={500}
              />

              <div className="flex gap-3">
                <button
                  onClick={() => setShowReviewModal(false)}
                  className="flex-1 py-3 rounded-xl bg-muted text-foreground font-medium active:scale-95 transition-transform text-sm"
                  disabled={isSubmitting}
                >
                  Annuler
                </button>
                <button
                  onClick={handleSubmitReview}
                  disabled={rating === 0 || isSubmitting}
                  className="flex-1 py-3 rounded-xl bg-primary text-white font-medium active:scale-95 transition-transform disabled:opacity-50 text-sm flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Envoi...
                    </>
                  ) : (
                    "Envoyer"
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default SpecialistProfile;