import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Search, X, Star, MapPin, Sparkles, ChevronLeft, Heart
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface Specialist {
  id: number;
  business_name: string;
  specialty: string;
  city: string;
  rating: number;
  reviews_count: number;
  profile_image_url: string | null;
  cover_image_url: string | null;
  user: {
    first_name: string;
    last_name: string;
  };
}

// Helper pour construire les URLs d'images
const getImageUrl = (imagePath: string | null): string | null => {
  if (!imagePath) return null;
  if (imagePath.startsWith('http')) return imagePath;
  return `${API_BASE_URL}/${imagePath}`;
};

const ClientSpecialists = () => {
  const navigate = useNavigate();

  const [specialists, setSpecialists] = useState<Specialist[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [favorites, setFavorites] = useState<Set<number>>(new Set());

  const filteredSpecialists = useMemo(
    () =>
      specialists.filter(
        (s) =>
          s.business_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.specialty.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.city.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [specialists, searchQuery]
  );

  useEffect(() => {
    const fetchSpecialists = async () => {
      try {
        setLoading(true);

        // Appeler la route GET /api/users/pros
        const response = await fetch(`${API_BASE_URL}/api/users/pros`);
        const data = await response.json();

        if (data.success && data.data) {
          // Mapper les données du backend vers le format du composant
          const formattedSpecialists: Specialist[] = data.data.map((pro: any) => ({
            id: pro.id,
            business_name: pro.activity_name || `${pro.first_name} ${pro.last_name}`,
            specialty: 'Prothésiste ongulaire', // Par défaut
            city: pro.city || 'Non spécifié',
            rating: Number(pro.avg_rating) || 0,
            reviews_count: Number(pro.reviews_count) || 0,
            profile_image_url: getImageUrl(pro.profile_photo),
            cover_image_url: getImageUrl(pro.banner_photo),
            user: {
              first_name: pro.first_name,
              last_name: pro.last_name
            }
          }));

          setSpecialists(formattedSpecialists);
        } else {
          console.error('API response error:', data);
          setSpecialists([]);
        }
      } catch (error) {
        console.error("Error fetching specialists:", error);
        setSpecialists([]);
      } finally {
        setLoading(false);
      }
    };

    fetchSpecialists();
  }, []);

  const toggleFavorite = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites(prev => {
      const newFavs = new Set(prev);
      if (newFavs.has(id)) {
        newFavs.delete(id);
      } else {
        newFavs.add(id);
      }
      return newFavs;
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center"
        >
          <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Chargement...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* HEADER SIMPLE */}
      <div className="bg-background pb-6">
        {/* Navigation + Titre */}
        <div className="px-4 pt-4 pb-4 flex items-center gap-3">
            <button
            onClick={() => {
              if (window.history.length > 1) {
              navigate(-1);
              } else {
              navigate("/client");
              }
            }}
            className="w-10 h-10 rounded-xl bg-background border-2 border-white flex items-center justify-center hover:bg-muted transition-all shadow-sm"
            >
            <ChevronLeft size={20} className="text-foreground" />
            </button>
          <h1 className="text-xl font-bold text-foreground">
            Découvre nos expertes
          </h1>
        </div>

        {/* Search Bar avec bordure blanche */}
        <div className="px-4">
          <div className="relative group">
            <Search
              size={18}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher une spécialiste..."
              className="w-full pl-11 pr-11 py-3.5 rounded-2xl bg-background border-2 border-white text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-all shadow-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-muted flex items-center justify-center hover:bg-muted-foreground/20 transition-all"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* GRID DE CARTES */}
      <div className="px-4">
        <AnimatePresence mode="popLayout">
          {filteredSpecialists.length > 0 ? (
            <div className="grid grid-cols-2 gap-3">
              {filteredSpecialists.map((specialist, index) => (
                <motion.div
                  key={specialist.id}
                  onClick={() => navigate(`/client/specialist/${specialist.id}`)}
                  className="relative cursor-pointer group"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ delay: index * 0.05, duration: 0.3 }}
                  whileHover={{ y: -4 }}
                >
                  {/* Cover Image */}
                  <div className="relative w-full aspect-square overflow-hidden rounded-t-2xl bg-muted">
                    {specialist.cover_image_url ? (
                      <img
                        src={specialist.cover_image_url}
                        alt={specialist.business_name}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
                        <Sparkles size={40} className="text-primary/40" />
                      </div>
                    )}
                    
                    {/* Overlay gradient */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />

                    {/* Favorite button */}
                    <button
                      onClick={(e) => toggleFavorite(specialist.id, e)}
                      className={`
                        absolute top-2 right-2 w-8 h-8 rounded-full backdrop-blur-md flex items-center justify-center transition-all z-10
                        ${favorites.has(specialist.id)
                          ? 'bg-primary shadow-lg scale-110'
                          : 'bg-black/30 hover:bg-black/50'
                        }
                      `}
                    >
                      <Heart 
                        size={14} 
                        className={favorites.has(specialist.id) ? 'text-white fill-white' : 'text-white'}
                      />
                    </button>

                    {/* Rating badge */}
                    {specialist.rating > 0 && (
                      <div className="absolute top-2 left-2 px-2 py-1 rounded-full bg-black/50 backdrop-blur-md flex items-center gap-1">
                        <Star size={11} className="fill-yellow-400 text-yellow-400" />
                        <span className="text-xs font-bold text-white">
                          {specialist.rating.toFixed(1)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* White Card - Avatar passe devant */}
                  <div className="relative bg-white rounded-b-2xl shadow-sm border-2 border-white">
                    {/* Avatar circulaire qui chevauche */}
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-12 h-12 rounded-full border-3 border-white overflow-hidden shadow-lg z-10">
                      {specialist.profile_image_url ? (
                        <img
                          src={specialist.profile_image_url}
                          alt={specialist.business_name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full gradient-primary flex items-center justify-center bg-gradient-to-br from-primary to-primary/80">
                          <span className="text-white font-bold text-sm">
                            {specialist.user.first_name[0]}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Info Section */}
                    <div className="pt-8 pb-3 px-3 text-center">
                      <h3 className="font-bold text-sm text-foreground mb-1 truncate">
                        {specialist.business_name}
                      </h3>
                      
                      <p className="text-xs text-muted-foreground mb-2 truncate flex items-center justify-center gap-1">
                        <Sparkles size={10} className="text-primary" />
                        {specialist.specialty}
                      </p>

                      <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground mb-2">
                        <MapPin size={10} />
                        <span className="truncate">{specialist.city}</span>
                      </div>

                      {/* Reviews count - bien espacé */}
                      {specialist.reviews_count > 0 && (
                        <p className="text-[10px] text-muted-foreground mb-3">
                          {specialist.reviews_count} avis
                        </p>
                      )}

                      {/* CTA Button */}
                      <button
                        className="w-full py-2 rounded-xl bg-primary/10 text-primary text-xs font-bold hover:bg-primary hover:text-white transition-all group-hover:bg-primary group-hover:text-white"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/client/specialist/${specialist.id}`);
                        }}
                      >
                        Réserver
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <motion.div
              className="text-center py-16"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <Search size={32} className="text-muted-foreground" />
              </div>
              <h3 className="text-lg font-bold text-foreground mb-2">
                Aucun résultat
              </h3>
              <p className="text-sm text-muted-foreground mb-6">
                {searchQuery ? "Essaie avec d'autres mots-clés" : "Aucune experte disponible pour le moment"}
              </p>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="px-6 py-3 rounded-xl bg-primary text-white font-semibold hover:shadow-lg transition-all"
                >
                  Voir toutes les expertes
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default ClientSpecialists;
