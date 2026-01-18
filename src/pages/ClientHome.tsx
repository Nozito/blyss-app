import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin, Star, ChevronRight, Search, Calendar, Sparkles, TrendingUp, Clock, Heart } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import logo from "@/assets/logo.png";
import { useAuth } from "@/contexts/AuthContext";
import api from "@/services/api";

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

// Mock data
const MOCK_SPECIALISTS: Specialist[] = [
  {
    id: 1,
    business_name: "Marie Beauté",
    specialty: "Pose gel & nail art",
    city: "Paris 11ème",
    rating: 4.9,
    reviews_count: 156,
    profile_image_url: "https://randomuser.me/api/portraits/women/1.jpg",
    cover_image_url: "https://images.unsplash.com/photo-1604654894610-df63bc536371?w=800&q=80",
    user: { first_name: "Marie", last_name: "Dupont" }
  },
  {
    id: 2,
    business_name: "Sophie Nails",
    specialty: "Prothésiste ongulaire",
    city: "Paris 9ème",
    rating: 4.8,
    reviews_count: 89,
    profile_image_url: "https://randomuser.me/api/portraits/women/2.jpg",
    cover_image_url: "https://images.unsplash.com/photo-1610992015732-2449b76344bc?w=800&q=80",
    user: { first_name: "Sophie", last_name: "Martin" }
  },
  {
    id: 3,
    business_name: "Emma Style",
    specialty: "Nail art détaillé",
    city: "Paris 15ème",
    rating: 4.7,
    reviews_count: 124,
    profile_image_url: "https://randomuser.me/api/portraits/women/3.jpg",
    cover_image_url: "https://images.unsplash.com/photo-1519014816548-bf5fe059798b?w=800&q=80",
    user: { first_name: "Emma", last_name: "Bernard" }
  },
  {
    id: 4,
    business_name: "Léa Chic",
    specialty: "Manucure classique",
    city: "Paris 5ème",
    rating: 4.6,
    reviews_count: 102,
    profile_image_url: "https://randomuser.me/api/portraits/women/4.jpg",
    cover_image_url: "https://images.unsplash.com/photo-1522338242992-e1a54906a8da?w=800&q=80",
    user: { first_name: "Léa", last_name: "Petit" }
  }
];

const ClientHome = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [specialists, setSpecialists] = useState<Specialist[]>([]);

  const greeting = user?.first_name ? `Salut ${user.first_name}` : "Bienvenue sur Blyss";

  const filteredSpecialists = useMemo(() => {
    if (!searchQuery) return specialists.slice(0, 6);
    const q = searchQuery.toLowerCase();
    return specialists.filter(
      (s) =>
        s.business_name.toLowerCase().includes(q) ||
        s.specialty.toLowerCase().includes(q) ||
        s.city.toLowerCase().includes(q) ||
        `${s.user.first_name} ${s.user.last_name}`.toLowerCase().includes(q)
    );
  }, [searchQuery, specialists]);

  useEffect(() => {
    const fetchSpecialists = async () => {
      try {
        setIsLoading(true);
        const clientGetSpecialists = (api as any).client?.getSpecialists ?? (api as any).getSpecialists;
        if (typeof clientGetSpecialists === "function") {
          const response = await clientGetSpecialists({ limit: 10 });
          if (response?.success && response?.data) {
            setSpecialists(response.data);
          } else {
            setSpecialists(MOCK_SPECIALISTS);
          }
        } else {
          setSpecialists(MOCK_SPECIALISTS);
        }
      } catch (error) {
        console.error("Error fetching specialists:", error);
        setSpecialists(MOCK_SPECIALISTS);
      } finally {
        setTimeout(() => setIsLoading(false), 1000);
      }
    };

    fetchSpecialists();
  }, []);

  useEffect(() => {
    console.log("🏠 ClientHome loaded");
  }, []);

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

        {/* SÉLECTION BLYSS - CARROUSEL PLEINE LARGEUR */}
        <section className="space-y-4">
          <motion.div
            className="flex items-center justify-between px-6"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4, duration: 0.6 }}
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-foreground">Sélection Blyss</h2>
                <motion.div
                  animate={{ 
                    scale: [1, 1.2, 1],
                    rotate: [0, 5, -5, 0]
                  }}
                  transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                >
                  <Sparkles className="w-5 h-5 text-primary" />
                </motion.div>
              </div>
              <p className="text-xs text-muted-foreground">Les meilleures expertes près de toi</p>
            </div>
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
              "
            >
              Tout voir
            </button>
          </motion.div>

          {/* Carrousel */}
          <AnimatePresence mode="wait">
            {filteredSpecialists.length > 0 ? (
              <motion.div
                key="specialists"
                className="relative"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <div className="flex gap-4 overflow-x-auto no-scrollbar px-6 py-2 snap-x snap-mandatory -mx-6 px-6">
                  {filteredSpecialists.map((s, index) => (
                    <motion.div
                      key={s.id}
                      onClick={() => navigate(`/client/specialist/${s.id}`)}
                      className="
                        min-w-[320px] sm:min-w-[340px] flex-shrink-0 snap-center
                        bg-card/80 backdrop-blur-xl rounded-3xl overflow-hidden
                        border-2 border-muted
                        shadow-xl shadow-black/5
                        cursor-pointer group
                        hover:shadow-2xl hover:shadow-primary/10
                        hover:border-primary/30
                        hover:-translate-y-2
                        transition-all duration-500
                        active:scale-[0.98]
                      "
                      initial={{ opacity: 0, x: 50 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.5 + index * 0.1, duration: 0.5 }}
                    >
                      {/* Cover Image */}
                      <div className="relative h-52 overflow-hidden bg-gradient-to-br from-primary/20 to-primary/5">
                        {s.cover_image_url ? (
                          <img
                            src={s.cover_image_url}
                            alt={s.business_name}
                            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center">
                            <Sparkles className="w-16 h-16 text-primary/30" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

                        {/* Favorite button - CORRIGÉ : div au lieu de button */}
                        <motion.div
                          className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-lg cursor-pointer"
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            // Add to favorites logic
                          }}
                        >
                          <Heart size={18} className="text-muted-foreground" />
                        </motion.div>

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
                                  {s.user.first_name[0]}
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
                          <div className="flex items-center gap-1.5 bg-gradient-to-r from-yellow-50 to-yellow-100 px-2.5 py-1 rounded-full shadow-sm">
                            <Star size={14} className="fill-yellow-400 text-yellow-400" />
                            <span className="text-xs font-bold text-foreground">
                              {s.rating.toFixed(1)}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              ({s.reviews_count})
                            </span>
                          </div>
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
                  ))}
                </div>

                {/* Scroll indicators */}
                <div className="flex justify-center gap-1.5 mt-4 px-6">
                  {filteredSpecialists.slice(0, 6).map((_, i) => (
                    <div
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-muted"
                    />
                  ))}
                </div>
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
                  Aucun résultat pour "{searchQuery}"
                </p>
                <p className="text-xs text-muted-foreground mb-4">
                  Essaie un autre quartier ou une autre experte
                </p>
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
