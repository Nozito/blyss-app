import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import MobileLayout from "@/components/MobileLayout";
import { MapPin, Star, ChevronRight, Heart, Loader2, Sparkles, AlertCircle } from "lucide-react";
import { favoritesApi, API_URL } from "@/services/api";

interface FavoriteFromApi {
  id: number;
  pro_id: number;
  first_name: string;
  last_name: string;
  activity_name: string | null;
  city: string | null;
  profile_photo: string | null;
  specialty: string | null;
  avg_rating: number;
  reviews_count: number;
}

interface FavoriteWithDetails {
  id: number;
  name: string;
  specialty: string;
  location: string;
  rating: number;
  reviews: number;
  profile_image_url: string | null;
}

const getImageUrl = (imagePath: string | null): string | null => {
  if (!imagePath) return null;
  if (imagePath.startsWith('http')) return imagePath;
  return `${API_URL}/${imagePath}`;
};

const ClientFavorites = () => {
  const navigate = useNavigate();
  const [favorites, setFavorites] = useState<FavoriteWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkAuth = useCallback(() => {
    const token = localStorage.getItem('auth_token');

    if (!token) {
      navigate('/login', {
        replace: true,
        state: {
          message: 'Connectez-vous pour voir vos favoris',
          returnUrl: '/client/favorites'
        }
      });
      return false;
    }

    return true;
  }, [navigate]);

  useEffect(() => {
    const fetchFavorites = async () => {
      if (!checkAuth()) return;

      try {
        setIsLoading(true);
        setError(null);

        const response = await favoritesApi.getAll();

        if (!response.success) {
          throw new Error(response.error || "Erreur lors de la récupération des favoris");
        }

        const favoritesRaw = response.data || [];

        if (favoritesRaw.length === 0) {
          setFavorites([]);
          return;
        }

        const formattedFavorites: FavoriteWithDetails[] = favoritesRaw.map((fav: FavoriteFromApi) => ({
          id: fav.pro_id,
          name: fav.activity_name || `${fav.first_name} ${fav.last_name}`,
          specialty: fav.specialty || 'Prothésiste ongulaire',
          location: fav.city || 'Paris',
          rating: Number(fav.avg_rating) || 0,
          reviews: Number(fav.reviews_count) || 0,
          profile_image_url: getImageUrl(fav.profile_photo)
        }));

        setFavorites(formattedFavorites);

      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur de chargement');
        setFavorites([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchFavorites();
  }, [checkAuth]);

  const removeFavorite = useCallback(async (proId: number, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!checkAuth()) return;

    const previousFavorites = [...favorites];
    setFavorites(favorites.filter(f => f.id !== proId));

    try {
      const response = await favoritesApi.remove(proId);

      if (!response.success) {
        throw new Error("Erreur lors de la suppression");
      }
    } catch {
      setFavorites(previousFavorites);
      alert('Impossible de retirer ce favori. Vérifie ta connexion et réessaie.');
    }
  }, [favorites, checkAuth]);

  if (isLoading) {
    return (
      <MobileLayout>
        <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
          <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
          <p className="text-sm text-muted-foreground">Chargement de tes favoris...</p>
        </div>
      </MobileLayout>
    );
  }

  if (error) {
    return (
      <MobileLayout>
        <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
          <div className="text-center space-y-4">
            <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-10 h-10 text-destructive" />
            </div>
            <h2 className="text-xl font-bold text-foreground">Oups !</h2>
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
      <div className="min-h-screen bg-background pb-24">
        <motion.div
          className="pt-6 pb-6 text-center px-6"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="text-3xl font-display font-bold text-foreground mb-2">
            Mes favoris
          </h1>
          <p className="text-muted-foreground">
            {favorites.length > 0
              ? `${favorites.length} experte${favorites.length > 1 ? "s" : ""} sauvegardée${favorites.length > 1 ? "s" : ""}`
              : "Retrouve ici tes expertes préférées"}
          </p>
        </motion.div>

        {favorites.length === 0 ? (
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
              <Heart size={64} className="text-primary" />
            </motion.div>
            <h2 className="text-2xl font-bold text-foreground mb-2">
              Aucun favori
            </h2>
            <p className="text-muted-foreground mb-8 max-w-sm">
              Ajoute des prothésistes à tes favoris pour les retrouver facilement
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
          <div className="space-y-3 px-6">
            <AnimatePresence mode="popLayout">
              {favorites.map((specialist, index) => (
                <motion.div
                  key={specialist.id}
                  className="bg-card rounded-3xl overflow-hidden shadow-lg border-2 border-border hover:border-primary/30 transition-all duration-300"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20, height: 0 }}
                  transition={{ delay: index * 0.05, duration: 0.5 }}
                  layout
                >
                  <button
                    onClick={() => navigate(`/client/specialist/${specialist.id}`)}
                    className="
                      w-full p-5 text-left
                      hover:bg-primary/5
                      transition-all duration-300
                      active:scale-[0.98]
                    "
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 rounded-2xl overflow-hidden flex-shrink-0 shadow-md">
                        {specialist.profile_image_url ? (
                          <img
                            src={specialist.profile_image_url}
                            alt={specialist.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
                            <span className="text-2xl font-bold text-white">
                              {specialist.name[0]}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-foreground text-lg mb-0.5 truncate">
                          {specialist.name}
                        </h3>
                        <p className="text-sm text-muted-foreground mb-2 truncate">
                          {specialist.specialty}
                        </p>

                        <div className="flex items-center gap-3 text-xs">
                          <div className="flex items-center gap-1.5 text-muted-foreground bg-muted/50 px-2 py-1 rounded-lg">
                            <MapPin size={12} />
                            <span className="font-medium">{specialist.location}</span>
                          </div>

                          {specialist.rating > 0 && (
                            <div className="flex items-center gap-1.5 bg-yellow-50 px-2 py-1 rounded-lg">
                              <Star size={12} className="text-yellow-400 fill-yellow-400" />
                              <span className="font-bold text-foreground">
                                {specialist.rating.toFixed(1)}
                              </span>
                              <span className="text-muted-foreground">
                                ({specialist.reviews})
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      <ChevronRight
                        size={20}
                        className="text-muted-foreground flex-shrink-0"
                      />
                    </div>
                  </button>

                  <button
                    onClick={(e) => removeFavorite(specialist.id, e)}
                    className="
                      w-full px-5 py-3 border-t-2 border-border
                      flex items-center justify-center gap-2
                      text-sm font-semibold text-destructive
                      hover:bg-destructive/10
                      transition-all duration-300
                      active:scale-[0.98]
                    "
                  >
                    <Heart size={16} className="fill-destructive" />
                    Retirer des favoris
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </MobileLayout>
  );
};

export default ClientFavorites;
