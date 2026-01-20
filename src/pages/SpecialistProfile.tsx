import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, MapPin, Star, Clock, Heart, Loader2 } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// ✅ Fonction helper en dehors du composant
const getImageUrl = (imagePath: string | null): string | null => {
  if (!imagePath) return null;
  if (imagePath.startsWith('http')) return imagePath;

  const API_BASE_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3001';
  return `${API_BASE_URL}/${imagePath}`;
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
  client_id: number;
  rating: number;
  comment: string | null;
  created_at: string;
  client_name?: string;
}

const SpecialistProfile = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  // ✅ Tous les useState ensemble
  const [pro, setPro] = useState<Pro | null>(null);
  const [prestations, setPrestations] = useState<Prestation[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAllReviews, setShowAllReviews] = useState(false); // ✅ NOUVEAU

  // Calculer rating et nombre d'avis
  const avgRating = reviews.length > 0
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
    : 0;
  const reviewsCount = reviews.length;

  // ✅ Trier les avis par rating décroissant et prendre les 3 meilleurs
  const sortedReviews = [...reviews].sort((a, b) => b.rating - a.rating);
  const displayedReviews = showAllReviews ? sortedReviews : sortedReviews.slice(0, 3);

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;

      try {
        setIsLoading(true);
        setError(null);

        // 1. Récupérer le pro
        const proRes = await fetch(`${API_URL}/users/pros/${id}`);
        const proData = await proRes.json();

        if (!proData.success || !proData.data) {
          throw new Error("Professionnel non trouvé");
        }

        setPro(proData.data);

        // 2. Récupérer les prestations
        const prestationsRes = await fetch(`${API_URL}/prestations/pro/${id}`);
        if (prestationsRes.ok) {
          const prestationsData = await prestationsRes.json();

          if (prestationsData.success && prestationsData.data) {
            const activePrestations = prestationsData.data
              .filter((p: any) => p.active)
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

        // 3. Récupérer les avis
        const reviewsRes = await fetch(`${API_URL}/reviews/pro/${id}`);
        const reviewsData = await reviewsRes.json();

        if (reviewsData.success && reviewsData.data) {
          setReviews(reviewsData.data);
        }

        // 4. Vérifier favoris
        const token = localStorage.getItem('auth_token');
        if (token) {
          try {
            const favoritesRes = await fetch(`${API_URL}/favorites`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });

            // ✅ Vérifier si la route existe AVANT de parser
            if (favoritesRes.ok) {
              const favoritesData = await favoritesRes.json();

              if (favoritesData.success && favoritesData.data) {
                const favoriteIds = favoritesData.data.map((fav: any) => fav.pro_id);
                setIsFavorite(favoriteIds.includes(Number(id)));
              }
            } else if (favoritesRes.status === 404) {
              console.log("Route /api/favorites non implémentée");
              setIsFavorite(false);
            }
          } catch (err) {
            console.log("Erreur favoris (non bloquante):", err);
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

  const handleToggleFavorite = async () => {
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

    setIsAnimating(true);
    const previousState = isFavorite;
    setIsFavorite(!isFavorite);

    try {
      const method = isFavorite ? 'DELETE' : 'POST';
      const url = isFavorite
        ? `${API_URL}/favorites/${id}`
        : `${API_URL}/favorites`;

      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        ...(method === 'POST' && {
          body: JSON.stringify({ pro_id: Number(id) })
        })
      });

      if (response.status === 401) {
        localStorage.removeItem('auth_token');
        navigate('/login', {
          state: {
            message: 'Session expirée. Reconnectez-vous.',
            returnUrl: `/client/specialist/${id}`
          }
        });
        return;
      }

      if (!response.ok) {
        throw new Error("Erreur lors de la mise à jour");
      }
    } catch (error) {
      console.error("Error toggling favorite:", error);
      setIsFavorite(previousState);
    } finally {
      setTimeout(() => setIsAnimating(false), 250);
    }
  };

  const handleReservationClick = () => {
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
  };


  const handleReviewClick = () => {
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
  };

  useEffect(() => {
    const pendingAction = localStorage.getItem('pendingAction');
    const token = localStorage.getItem('auth_token');

    if (pendingAction === 'review' && token) {
      localStorage.removeItem('pendingAction');
      setShowReviewModal(true);
    }
  }, []);

  const handleSubmitReview = async () => {
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
      const response = await fetch(`${API_URL}/reviews`, {
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
        const reviewsRes = await fetch(`${API_URL}/reviews/pro/${id}`);
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

  const formattedReviews = displayedReviews.map(review => ({
    id: review.id,
    author: review.client_name || 'Client',
    rating: review.rating,
    comment: review.comment || '',
    date: formatReviewDate(review.created_at),
    avatar: (review.client_name || 'C').split(' ').map(n => n[0]).join('').toUpperCase()
  }));

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

  const displayName = pro.activity_name || `${pro.first_name} ${pro.last_name}`;

  return (
    <>
      <div className="relative min-h-[100dvh] w-full bg-background text-foreground">
        {/* Bannière */}
        <div className="relative h-64 w-full overflow-hidden bg-gradient-to-br from-primary/20 to-primary/5">
          {pro.banner_photo ? (
            <img
              src={getImageUrl(pro.banner_photo) || undefined}
              alt="Bannière"
              className="absolute inset-0 w-full h-full object-cover"
              style={{ objectPosition: 'center' }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Star size={64} className="text-primary/30" />
            </div>
          )}

          {/* Back button */}
          <button
            onClick={() => navigate(-1)}
            className="absolute left-4 top-4 w-10 h-10 rounded-full bg-white/12 border border-white/30 backdrop-blur-xl shadow-[0_10px_30px_rgba(0,0,0,0.25)] flex items-center justify-center z-30 active:scale-95 transition-transform"
          >
            <ArrowLeft size={20} className="text-white drop-shadow" />
          </button>

          {/* Favorite button */}
          <button
            onClick={handleToggleFavorite}
            className={`absolute right-4 top-4 w-10 h-10 rounded-full bg-white/12 border border-white/30 backdrop-blur-xl shadow-[0_10px_30px_rgba(0,0,0,0.25)] flex items-center justify-center z-30 active:scale-95 transition-all duration-200 ${isAnimating ? "scale-115" : "scale-100"}`}
          >
            <Heart
              size={20}
              className={`drop-shadow transition-colors duration-200 ${isFavorite ? "text-primary fill-primary" : "text-white"}`}
            />
          </button>

          {/* ✅ Avatar parfaitement positionné comme l'image */}
          <div className="absolute -bottom-16 left-1/2 -translate-x-1/2 z-50">
            <div className="w-32 h-32 rounded-full bg-background border-4 border-background shadow-[0_10px_40px_rgba(0,0,0,0.2)] overflow-hidden">
              {pro.profile_photo ? (
                <img
                  src={getImageUrl(pro.profile_photo) || undefined}
                  alt={displayName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                  <span className="text-5xl font-bold text-primary">
                    {pro.first_name[0]}
                  </span>
                </div>
              )}
            </div>
          </div>



          {/* Favorite button */}
          <button
            onClick={handleToggleFavorite}
            className={`absolute right-4 top-4 w-10 h-10 rounded-full bg-white/12 border border-white/30 backdrop-blur-xl shadow-[0_10px_30px_rgba(0,0,0,0.25)] flex items-center justify-center z-30 active:scale-95 transition-all duration-200 ${isAnimating ? "scale-115" : "scale-100"}`}
          >
            <Heart
              size={20}
              className={`drop-shadow transition-colors duration-200 ${isFavorite ? "text-primary fill-primary" : "text-white"}`}
            />
          </button>
        </div>

        {/* Contenu */}
        <div className="pt-16 pb-24 space-y-6 px-4">
          {/* Header infos */}
          <section className="text-center space-y-2">
            <div>
              <h1 className="text-2xl font-semibold text-foreground">
                {displayName}
              </h1>
              <p className="text-sm text-muted-foreground">
                Prothésiste ongulaire
              </p>
            </div>

            {/* ✅ Afficher SEULEMENT 1 étoile + note moyenne */}
            {reviewsCount > 0 && (
              <div className="flex items-center justify-center gap-3">
                <div className="flex items-center gap-1.5">
                  {/* 1 étoile fixe */}
                  <Star size={16} className="text-yellow-400 fill-yellow-400" />
                  <span className="font-semibold text-foreground">
                    {avgRating.toFixed(1)}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    ({reviewsCount} avis)
                  </span>
                </div>
              </div>
            )}

            {pro.city && (
              <div className="flex items-center justify-center gap-1">
                <MapPin size={14} className="text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{pro.city}</span>
              </div>
            )}

            {pro.instagram_account && (
              <div className="flex items-center justify-center gap-1">
                <span className="text-sm text-primary font-medium">
                  {pro.instagram_account}
                </span>
              </div>
            )}
          </section>

          {/* À propos */}
          {pro.bio && (
            <section className="bg-card rounded-2xl p-4 shadow-card">
              <h2 className="text-lg font-semibold text-foreground mb-2">
                À propos
              </h2>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {pro.bio}
              </p>
            </section>
          )}

          {/* Prestations */}
          {prestations.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-foreground">
                  Prestations
                </h2>
                <span className="text-xs text-muted-foreground">
                  {prestations.length} service(s)
                </span>
              </div>

              <div className="space-y-3">
                {prestations.map((prestation) => (
                  <div
                    key={prestation.id}
                    className="bg-card rounded-2xl p-4 shadow-card flex items-center justify-between"
                  >
                    <div className="flex-1">
                      <h3 className="font-medium text-foreground text-sm">
                        {prestation.name}
                      </h3>
                      {prestation.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {prestation.description}
                        </p>
                      )}
                      <div className="flex items-center gap-1 mt-1">
                        <Clock size={12} className="text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                          {formatDuration(prestation.duration_minutes)}
                        </span>
                      </div>
                    </div>
                    <span className="font-semibold text-lg text-foreground ml-4">
                      {prestation.price.toFixed(2)}€
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* CTA principal */}
          <section>
            <button
              onClick={handleReservationClick}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-primary to-primary/90 text-white font-semibold text-base shadow-lg shadow-primary/30 active:scale-[0.98] transition-transform"
            >
              Réserver avec {pro.first_name}
            </button>
          </section>

          {/* Avis - ✅ Afficher 3 meilleurs + bouton "Voir plus" */}
          {formattedReviews.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-foreground">
                  Avis clients
                </h2>
                <div className="flex items-center gap-1">
                  <Star size={16} className="text-yellow-400 fill-yellow-400" />
                  <span className="font-semibold text-foreground">
                    {avgRating.toFixed(1)}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    ({reviewsCount})
                  </span>
                </div>
              </div>

              {/* Afficher les avis (3 meilleurs ou tous) */}
              <div className="space-y-3">
                {formattedReviews.map((review) => (
                  <div
                    key={review.id}
                    className="bg-card rounded-2xl p-4 shadow-card space-y-3"
                  >
                    <div className="flex items-start gap-3">
                      {/* Avatar */}
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-semibold text-primary">
                          {review.avatar}
                        </span>
                      </div>

                      <div className="flex-1 min-w-0">
                        {/* Nom et date */}
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-foreground text-sm">
                            {review.author}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {review.date}
                          </span>
                        </div>

                        {/* Étoiles */}
                        <div className="flex items-center gap-1 mb-2">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              size={12}
                              className={`${star <= review.rating
                                ? "text-yellow-400 fill-yellow-400"
                                : "text-muted-foreground/30 fill-muted-foreground/30"
                                }`}
                            />
                          ))}
                        </div>

                        {/* Commentaire */}
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

              {/* ✅ Bouton "Voir plus d'avis" si plus de 3 avis */}
              {reviewsCount > 3 && (
                <button
                  onClick={() => setShowAllReviews(!showAllReviews)}
                  className="w-full py-3 mt-4 rounded-xl bg-muted text-foreground font-medium active:scale-[0.98] transition-transform text-sm"
                >
                  {showAllReviews ? `Voir moins d'avis` : `Voir plus d'avis (${reviewsCount - 3})`}
                </button>
              )}

              {/* Bouton laisser un avis */}
              <button
                onClick={handleReviewClick}
                className="w-full py-3 mt-3 rounded-xl border-2 border-primary text-primary font-medium active:scale-[0.98] transition-transform text-sm"
              >
                Laisser un avis
              </button>
            </section>
          )}
        </div>
      </div>

      {/* Modal avis */}
      {showReviewModal && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-[430px] bg-card rounded-t-3xl p-6 pb-10 shadow-2xl animate-slide-up-modal">
            <div className="w-12 h-1 bg-muted rounded-full mx-auto mb-6" />

            <h3 className="text-xl font-semibold text-foreground text-center mb-6">
              Laisser un avis
            </h3>

            {/* Stars */}
            <div className="flex items-center justify-center gap-2 mb-6">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setRating(star)}
                  className="p-1 active:scale-90 transition-transform"
                  disabled={isSubmitting}
                >
                  <Star
                    size={32}
                    className={`transition-colors ${star <= rating
                      ? "text-yellow-400 fill-yellow-400"
                      : "text-muted-foreground"
                      }`}
                  />
                </button>
              ))}
            </div>

            {/* Commentaire */}
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Décrivez votre expérience..."
              className="w-full h-32 px-4 py-3 rounded-xl bg-muted border-0 text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 mb-6 text-sm"
              disabled={isSubmitting}
              maxLength={500}
            />

            {/* Actions */}
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
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-primary to-primary/90 text-white font-medium active:scale-95 transition-transform disabled:opacity-50 text-sm flex items-center justify-center gap-2"
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
          </div>
        </div>
      )}

      <style>{`
        @keyframes slide-up-modal {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .animate-slide-up-modal {
          animation: slide-up-modal 0.3s ease-out;
        }
      `}</style>
    </>
  );
};

export default SpecialistProfile;