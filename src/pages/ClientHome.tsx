import { useState, useMemo, useEffect, MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin, Star, ChevronRight, Search, Sparkles, Calendar, Clock, Heart, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import logo from "@/assets/logo.png";
import { useAuth } from "@/contexts/AuthContext";
import api from "@/services/api";

interface Pro {
  id: number;
  first_name: string;
  last_name: string;
  activity_name: string | null;
  city: string | null;
  instagram_account: string | null;
  profile_photo: string | null;
  banner_photo: string | null;
  bio: string | null;
  pro_status: 'active' | 'inactive';
}

interface Review {
  id: number;
  pro_id: number;
  rating: number;
}

const ClientHome = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [pros, setPros] = useState<Pro[]>([]);
  const [reviewsByPro, setReviewsByPro] = useState<Record<number, Review[]>>({});
  const [favorites, setFavorites] = useState<Set<number>>(new Set());

  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

  const greeting = user?.first_name ? `Salut ${user.first_name}` : "Bienvenue sur Blyss";

  // Formater les données pour affichage
  const specialists = pros.map(pro => {
    const proReviews = reviewsByPro[pro.id] || [];
    const avgRating = proReviews.length > 0
      ? proReviews.reduce((sum, r) => sum + r.rating, 0) / proReviews.length
      : 0;

    const profilePhotoUrl = pro.profile_photo
      ? (pro.profile_photo.startsWith('http')
        ? pro.profile_photo
        : `${API_BASE_URL}/${pro.profile_photo}`)
      : null;

    const bannerPhotoUrl = pro.banner_photo
      ? (pro.banner_photo.startsWith('http')
        ? pro.banner_photo
        : `${API_BASE_URL}/${pro.banner_photo}`)
      : null;

    return {
      id: pro.id,
      business_name: pro.activity_name || `${pro.first_name} ${pro.last_name}`,
      specialty: 'Prothésiste ongulaire',
      city: pro.city || 'Paris',
      rating: avgRating,
      reviews_count: proReviews.length,
      profile_image_url: profilePhotoUrl,
      cover_image_url: bannerPhotoUrl,
      user: {
        first_name: pro.first_name,
        last_name: pro.last_name
      }
    };
  });


  const filteredSpecialists = useMemo(() => {
    if (!searchQuery) return specialists;
    const q = searchQuery.toLowerCase();
    return specialists.filter(
      (s) =>
        s.business_name?.toLowerCase().includes(q) ||
        s.specialty?.toLowerCase().includes(q) ||
        s.city?.toLowerCase().includes(q) ||
        `${s.user?.first_name || ''} ${s.user?.last_name || ''}`.toLowerCase().includes(q)
    );
  }, [searchQuery, specialists]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);

        const usersRes = await fetch(`${API_BASE_URL}/users/pros`);
        const usersData = await usersRes.json();

        if (usersData?.success && usersData?.data) {
          const activePros = usersData.data;
          setPros(activePros);

          // Charger les avis pour chaque pro
          const reviewsData: Record<number, Review[]> = {};

          for (const pro of activePros) {
            try {
              const reviewsRes = await fetch(`${API_BASE_URL}/reviews/pro/${pro.id}`);
              const reviewsJson = await reviewsRes.json();

              if (reviewsJson?.success && reviewsJson?.data) {
                reviewsData[pro.id] = Array.isArray(reviewsJson.data)
                  ? reviewsJson.data
                  : [];
              } else {
                reviewsData[pro.id] = [];
              }
            } catch (error) {
              reviewsData[pro.id] = [];
            }
          }

          setReviewsByPro(reviewsData);
        }

      } catch (error) {
        setPros([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleSpecialistClick = (proId: number) => {
    navigate(`/client/specialist/${proId}`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="text-center space-y-6"
        >
          <motion.img
            src={logo}
            alt="Blyss"
            className="w-24 h-24 object-contain mx-auto"
            animate={{ rotate: [0, 10, -10, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
          <div className="space-y-3">
            <motion.div
              className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full mx-auto"
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            />
            <p className="text-sm font-medium text-muted-foreground">Chargement de ton espace...</p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="space-y-6 pt-6">
        {/* HERO */}
        <motion.header
          className="flex flex-col items-center text-center space-y-4 px-6"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <motion.img
            src={logo}
            alt="Blyss"
            className="w-20 h-20 object-contain"
            initial={{ scale: 0.8, rotate: -10 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ duration: 0.6, type: "spring", stiffness: 200 }}
          />
          <div className="space-y-2">
            <motion.div
              className="flex items-center justify-center gap-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              <h1 className="text-3xl font-display font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                {greeting}
              </h1>
              <motion.span
                className="text-2xl"
                animate={{ rotate: [0, 14, -8, 14, -4, 10, 0] }}
                transition={{ duration: 0.5, delay: 0.3 }}
              >
                👋
              </motion.span>
            </motion.div>
            <p className="text-muted-foreground text-sm">
              Tes nails parfaites, en quelques clics ✨
            </p>
          </div>
        </motion.header>

        {/* RECHERCHE */}
        <motion.section
          className="px-6 space-y-2"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.6 }}
        >
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-primary/5 rounded-2xl blur-xl opacity-50" />
            <div className="relative">
              <Search
                size={20}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none z-10"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher une experte, quartier..."
                className="
                  w-full h-14 pl-12 pr-12 rounded-2xl
                  bg-card/80 backdrop-blur-xl border-2 border-muted
                  text-foreground placeholder:text-muted-foreground/60
                  focus:outline-none focus:border-primary focus:shadow-lg focus:shadow-primary/20
                  transition-all duration-300
                "
              />
              <AnimatePresence>
                {searchQuery && (
                  <motion.button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-4 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-muted hover:bg-muted-foreground/20 flex items-center justify-center transition-colors z-10"
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                  >
                    <span className="text-foreground text-lg leading-none">×</span>
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </div>
          <p className="text-xs text-muted-foreground px-1">
            Ex. : "pose gel", "Emma", "Paris 11"
          </p>
        </motion.section>

        {/* SÉLECTION BLYSS */}
        <section className="space-y-4">
          <motion.div
            className="flex items-center justify-between px-6"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4, duration: 0.6 }}
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-foreground">
                  {searchQuery ? 'Résultats de recherche' : 'Sélection Blyss'}
                </h2>
                {!searchQuery && (
                  <motion.div
                    animate={{
                      scale: [1, 1.2, 1],
                      rotate: [0, 5, -5, 0]
                    }}
                    transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                  >
                    <Sparkles className="w-5 h-5 text-primary" />
                  </motion.div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {searchQuery
                  ? `${filteredSpecialists.length} résultat(s) trouvé(s)`
                  : `${specialists.length} expertes disponibles`
                }
              </p>
            </div>
            {!searchQuery && specialists.length > 3 && (
              <button
                type="button"
                onClick={() => navigate("/client/specialists")}
                className="
                  px-4 py-2 rounded-full
                  text-xs font-semibold
                  bg-gradient-to-r from-primary to-primary/80
                  text-white
                  shadow-lg shadow-primary/30
                  hover:shadow-xl hover:shadow-primary/40
                  transition-all duration-300
                  active:scale-95
                  flex items-center gap-1.5
                "
              >
                Tout voir
                <ArrowRight size={14} />
              </button>
            )}
          </motion.div>

          {/* Carrousel */}
          <AnimatePresence mode="wait">
            {filteredSpecialists.length > 0 ? (
              <motion.div
                key="specialists"
                className="space-y-6"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <div className="flex gap-4 overflow-x-auto no-scrollbar px-6 py-2 snap-x snap-mandatory">
                  {filteredSpecialists.slice(0, 6).map((s, index) => {
                    const isFavorite = favorites.has(s.id);

                    function toggleFavorite(id: number, e: MouseEvent<HTMLButtonElement>): void {
                      e.stopPropagation();
                      setFavorites((prev) => {
                        const next = new Set(prev);
                        if (next.has(id)) next.delete(id);
                        else next.add(id);
                        return next;
                      });
                    }

                    return (
                      <motion.div
                        key={s.id}
                        className="
                          min-w-[320px] sm:min-w-[340px] flex-shrink-0 snap-center
                          bg-card/80 backdrop-blur-xl rounded-3xl overflow-hidden
                          border-2 border-muted
                          shadow-xl shadow-black/5
                          text-left group
                          hover:shadow-2xl hover:shadow-primary/10
                          hover:border-primary/30
                          hover:-translate-y-2
                          transition-all duration-500
                          cursor-pointer
                        "
                        initial={{ opacity: 0, x: 50 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 * index, duration: 0.5 }}
                        onClick={() => handleSpecialistClick(s.id)}
                      >
                        {/* Cover Image */}
                        <div className="relative h-52 overflow-hidden bg-gradient-to-br from-primary/20 to-primary/5">
                          {s.cover_image_url ? (
                            <img
                              src={s.cover_image_url}
                              alt={s.business_name}
                              className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                              style={{ objectPosition: 'center' }}
                            />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center">
                              <Sparkles className="w-16 h-16 text-primary/30" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />


                          {/* Favorite button */}
                          <motion.button
                            className={`
                              absolute top-4 right-4 w-10 h-10 rounded-full 
                              bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-lg
                              ${isFavorite ? 'bg-red-50' : ''}
                            `}
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={(e) => toggleFavorite(s.id, e)}
                          >
                            <Heart
                              size={18}
                              className={`transition-colors ${isFavorite
                                  ? 'text-red-500 fill-red-500'
                                  : 'text-muted-foreground'
                                }`}
                            />
                          </motion.button>

                          {/* Avatar & Name */}
                          <div className="absolute bottom-4 left-4 right-4 flex items-center gap-3 text-white">
                            <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-white/90 shadow-2xl flex-shrink-0 bg-white">
                              {s.profile_image_url ? (
                                <img
                                  src={s.profile_image_url}
                                  alt={s.business_name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center bg-primary/10">
                                  <span className="text-2xl font-bold text-primary">
                                    {s.user?.first_name?.[0] || s.business_name?.[0] || '?'}
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-lg font-bold truncate drop-shadow-lg">
                                {s.business_name}
                              </p>
                              <p className="text-sm text-white/95 truncate drop-shadow">
                                {s.specialty}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Info */}
                        <div className="p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <MapPin size={14} />
                              <span className="text-xs font-medium">{s.city}</span>
                            </div>
                            {s.rating > 0 && (
                              <div className="flex items-center gap-1.5 bg-gradient-to-r from-yellow-50 to-yellow-100 px-2.5 py-1 rounded-full shadow-sm">
                                <Star size={14} className="fill-yellow-400 text-yellow-400" />
                                <span className="text-xs font-bold text-foreground">
                                  {s.rating.toFixed(1)}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  ({s.reviews_count})
                                </span>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-muted">
                            <span className="text-xs font-semibold text-primary group-hover:text-primary/80 transition-colors">
                              Voir les créneaux
                            </span>
                            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary group-hover:shadow-lg transition-all">
                              <ChevronRight
                                size={16}
                                className="text-primary group-hover:text-white transition-all group-hover:translate-x-0.5"
                              />
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

                {/* Scroll indicators */}
                {filteredSpecialists.length > 1 && (
                  <div className="flex justify-center gap-1.5 px-6">
                    {filteredSpecialists.slice(0, Math.min(6, filteredSpecialists.length)).map((_, i) => (
                      <div
                        key={i}
                        className="w-1.5 h-1.5 rounded-full bg-muted"
                      />
                    ))}
                  </div>
                )}

                {/* Bouton "Voir toutes les expertes" */}
                {specialists.length > 0 && (
                  <motion.div
                    className="px-6"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                  >
                    <button
                      onClick={() => navigate("/client/specialists")}
                      className="
                        w-full py-3.5 rounded-2xl
                        bg-gradient-to-r from-primary to-primary/90
                        text-white font-semibold text-sm
                        shadow-lg shadow-primary/30
                        hover:shadow-xl hover:shadow-primary/40
                        transition-all duration-300
                        active:scale-[0.98]
                        flex items-center justify-center gap-2
                      "
                    >
                      Voir toutes les expertes
                      <ArrowRight size={18} />
                    </button>
                  </motion.div>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="no-results"
                className="mx-6 text-center py-12 px-6 bg-card/80 backdrop-blur-xl rounded-3xl border-2 border-dashed border-muted"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
              >
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                  <Search className="w-8 h-8 text-primary" />
                </div>
                <p className="text-sm font-bold text-foreground mb-2">
                  {searchQuery ? `Aucun résultat pour "${searchQuery}"` : 'Aucune spécialiste disponible'}
                </p>
                <p className="text-xs text-muted-foreground mb-4">
                  {searchQuery
                    ? 'Essaie un autre quartier ou une autre experte'
                    : 'Reviens bientôt pour découvrir nos expertes'
                  }
                </p>
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="
                      px-6 py-2.5 rounded-full
                      bg-gradient-to-r from-primary to-primary/90
                      text-white text-xs font-semibold
                      shadow-lg shadow-primary/30
                      hover:shadow-xl hover:shadow-primary/40
                      transition-all duration-300
                      active:scale-95
                    "
                  >
                    Effacer la recherche
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* TES NAILS À VENIR */}
        <motion.section
          className="space-y-4 px-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.6 }}
        >
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-foreground">Tes nails à venir</h2>
            <p className="text-xs text-muted-foreground">Tes prochains rendez-vous beauté</p>
          </div>

          <motion.div
            className="relative overflow-hidden p-5 rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-2 border-dashed border-primary/30"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ scale: 1.02 }}
            transition={{ duration: 0.5 }}
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl" />
            <div className="relative flex items-start gap-4">
              <motion.div
                className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center flex-shrink-0 shadow-lg"
                animate={{
                  boxShadow: [
                    "0 10px 25px -5px rgba(var(--primary), 0.3)",
                    "0 10px 35px -5px rgba(var(--primary), 0.5)",
                    "0 10px 25px -5px rgba(var(--primary), 0.3)"
                  ]
                }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <Calendar size={22} className="text-white" />
              </motion.div>
              <div className="flex-1 space-y-2">
                <p className="text-sm font-semibold text-foreground">Aucun rendez-vous prévu</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Réserve dès maintenant auprès d'une experte près de chez toi
                </p>
                <button
                  onClick={() => navigate("/client/specialists")}
                  className="
                    mt-2 px-4 py-2 rounded-xl
                    bg-gradient-to-r from-primary to-primary/90
                    text-white text-xs font-semibold
                    shadow-lg shadow-primary/30
                    hover:shadow-xl hover:shadow-primary/40
                    transition-all duration-300
                    active:scale-95
                    inline-flex items-center gap-2
                  "
                >
                  <Clock size={14} />
                  Réserver un créneau
                </button>
              </div>
            </div>
          </motion.div>
        </motion.section>
      </div>

      <style>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .snap-x {
          scroll-snap-type: x mandatory;
        }
        .snap-center {
          scroll-snap-align: center;
        }
      `}</style>
    </div>
  );
};

export default ClientHome;
