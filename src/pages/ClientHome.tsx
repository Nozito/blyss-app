import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin, Star, ChevronRight, Search, Calendar, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import logo from "@/assets/logo.png";
import { useAuth } from "@/contexts/AuthContext";

const ClientHome = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading] = useState(false);

  const [specialists] = useState([
    {
      id: 1,
      name: "Marie Beauté",
      specialty: "Pose gel & nail art",
      location: "Paris 11ème",
      rating: 4.9,
      reviews: 156,
      avatar: "https://randomuser.me/api/portraits/women/1.jpg",
      cover: "src/assets/banners/banner1.jpg"
    },
    {
      id: 2,
      name: "Sophie Nails",
      specialty: "Prothésiste ongulaire",
      location: "Paris 9ème",
      rating: 4.8,
      reviews: 89,
      avatar: "https://randomuser.me/api/portraits/women/2.jpg",
      cover: "src/assets/banners/banner2.jpg"
    },
    {
      id: 3,
      name: "Emma Style",
      specialty: "Nail art détaillé",
      location: "Paris 15ème",
      rating: 4.7,
      reviews: 124,
      avatar: "https://randomuser.me/api/portraits/women/3.jpg",
      cover: "src/assets/banners/banner3.jpg"
    },
    {
      id: 4,
      name: "Léa Chic",
      specialty: "Manucure classique",
      location: "Paris 5ème",
      rating: 4.6,
      reviews: 102,
      avatar: "https://randomuser.me/api/portraits/women/4.jpg",
      cover: "src/assets/banners/banner4.jpg"
    }
  ]);

  const upcomingAppointments: Array<{
    id: number;
    specialistName: string;
    date: string;
    time: string;
    location: string;
  }> = [];

  const greeting = user?.first_name
    ? `Salut ${user.first_name}`
    : "Bienvenue sur Blyss";

  const filteredSpecialists = useMemo(() => {
    if (!searchQuery) return specialists;
    const q = searchQuery.toLowerCase();
    return specialists.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.specialty.toLowerCase().includes(q) ||
        s.location.toLowerCase().includes(q)
    );
  }, [searchQuery, specialists]);

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="space-y-6 pt-6">
        {/* HERO */}
        <motion.header
          className="flex flex-col items-center text-center space-y-4 px-6"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <motion.img
            src={logo}
            alt="Blyss"
            className="w-24 h-24 object-contain"
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
          />
          <div className="space-y-1">
            <motion.div
              className="flex items-center justify-center gap-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              <p className="text-2xl font-display font-bold text-foreground">
                {greeting}
              </p>
              <motion.span
                animate={{ rotate: [0, 14, -8, 14, -4, 10, 0] }}
                transition={{ duration: 0.5, delay: 0.3 }}
              >
                👋
              </motion.span>
            </motion.div>
            <p className="text-muted-foreground">
              Tes nails, sans prise de tête.
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
            <Search
              size={20}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher une experte..."
              className="
                w-full h-14 pl-12 pr-12 rounded-2xl
                bg-card border-2 border-muted
                text-foreground placeholder:text-muted-foreground/50
                focus:outline-none focus:border-primary focus:scale-[1.01]
                transition-all duration-300
              "
            />
            {searchQuery && (
              <motion.button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
              >
                <span className="text-2xl leading-none">×</span>
              </motion.button>
            )}
          </div>
          <p className="text-xs text-muted-foreground px-1">
            Ex. : "pose gel République", "Emma", "manucure Paris 11"
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
                <h2 className="text-lg font-semibold text-foreground">
                  Sélection Blyss
                </h2>
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <p className="text-xs text-muted-foreground">
                Des expertes nails bien notées, proche de toi
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate("/client/specialists")}
              className="
                px-4 py-2 rounded-full
                text-xs font-medium text-primary
                border-2 border-primary/30
                hover:bg-primary/5 hover:border-primary/50
                transition-all duration-300
                active:scale-95
              "
            >
              Tout voir
            </button>
          </motion.div>

          {/* Carrousel */}
          {isLoading ? (
            <div className="flex gap-4 overflow-x-auto no-scrollbar px-6 py-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="min-w-[280px] bg-card rounded-3xl overflow-hidden animate-pulse"
                >
                  <div className="h-40 bg-muted" />
                  <div className="p-4 space-y-3">
                    <div className="h-4 bg-muted rounded w-2/3" />
                    <div className="h-3 bg-muted rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredSpecialists.length > 0 ? (
            <div className="flex gap-4 overflow-x-auto no-scrollbar px-6 py-2">
              {filteredSpecialists.map((s, index) => (
                <motion.button
                  key={s.id}
                  type="button"
                  onClick={() => navigate(`/client/specialist/${s.id}`)}
                  className="
                    min-w-[280px] flex-shrink-0
                    bg-card rounded-3xl overflow-hidden
                    shadow-lg shadow-black/5 border border-muted
                    text-left group
                    hover:shadow-xl hover:shadow-primary/10
                    hover:-translate-y-1
                    transition-all duration-300
                    active:scale-[0.98]
                  "
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + index * 0.1, duration: 0.5 }}
                >
                  {/* Cover Image */}
                  <div className="relative h-40 overflow-hidden">
                    <img
                      src={s.cover}
                      alt={s.name}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

                    {/* Avatar & Name on Cover */}
                    <div className="absolute bottom-3 left-3 right-3 flex items-center gap-3 text-white">
                      <div className="w-12 h-12 rounded-2xl overflow-hidden border-2 border-white/80 shadow-lg flex-shrink-0">
                        <img
                          src={s.avatar}
                          alt={s.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate">
                          {s.name}
                        </p>
                        <p className="text-xs text-white/90 truncate">
                          {s.specialty}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="p-4 space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <MapPin size={14} />
                        <span className="text-xs">{s.location}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Star size={14} className="fill-yellow-400 text-yellow-400" />
                        <span className="text-xs font-semibold text-foreground">
                          {s.rating}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          ({s.reviews})
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-muted">
                      <span className="text-xs text-muted-foreground group-hover:text-primary transition-colors">
                        Voir les créneaux
                      </span>
                      <ChevronRight
                        size={16}
                        className="text-primary transition-transform group-hover:translate-x-1"
                      />
                    </div>
                  </div>
                </motion.button>
              ))}
            </div>
          ) : (
            <motion.div
              className="mx-6 text-center py-12 px-6 bg-card rounded-3xl border border-muted"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
            >
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                <Search className="w-8 h-8 text-primary" />
              </div>
              <p className="text-sm font-semibold text-foreground mb-2">
                Aucun résultat pour "{searchQuery}"
              </p>
              <p className="text-xs text-muted-foreground mb-4">
                Essaie un autre quartier ou une autre experte
              </p>
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="
                  px-6 py-2 rounded-full
                  bg-primary text-primary-foreground
                  text-xs font-medium
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
        </section>

        {/* TES NAILS À VENIR */}
        <motion.section
          className="space-y-3 px-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.6 }}
        >
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-foreground">
              Tes nails à venir
            </h2>
            <p className="text-xs text-muted-foreground">
              Retrouve ici tes prochains rendez-vous
            </p>
          </div>

          {upcomingAppointments.length === 0 ? (
            <div className="p-5 rounded-2xl bg-card border-2 border-dashed border-muted">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Calendar size={20} className="text-primary" />
                </div>
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    Aucun rendez-vous prévu
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Planifie ta prochaine séance nails dès maintenant
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex gap-4 overflow-x-auto no-scrollbar">
              {upcomingAppointments.map((appt) => (
                <button
                  key={appt.id}
                  type="button"
                  onClick={() => navigate("/client/appointments")}
                  className="
                    min-w-[260px] p-4 rounded-2xl
                    bg-card border border-muted
                    shadow-sm hover:shadow-md
                    text-left transition-all
                    active:scale-95
                  "
                >
                  {/* Appointment details */}
                </button>
              ))}
            </div>
          )}
        </motion.section>
      </div>
    </div>
  );
};

export default ClientHome;
