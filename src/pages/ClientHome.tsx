import { useState, useMemo, MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin, Star, ChevronRight, Search, Sparkles, Calendar, Clock, Heart, ArrowRight, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import logo from "@/assets/logo.png";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { specialistsApi, favoritesApi, clientApi } from "@/services/api";
import { toast } from "sonner";
import { getImageUrl } from "@/utils/imageUrl";

interface Specialist {
  id: number;
  business_name: string;
  specialty: string;
  city: string;
  rating: number;
  reviews_count: number;
  profile_image_url: string | null;
  cover_image_url: string | null;
  user: { first_name: string; last_name: string };
}

interface Booking {
  id: number;
  start_datetime: string;
  end_datetime: string;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  price: number;
  prestation_name: string;
  pro_first_name: string;
  pro_last_name: string;
  activity_name: string | null;
  profile_photo: string | null;
}

const ClientHome = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");

  const greeting = user?.first_name ? `Salut ${user.first_name}` : "Bienvenue sur Blyss";

  // Specialists (shared cache with ClientSpecialists)
  const { data: specialists = [], isLoading } = useQuery<Specialist[]>({
    queryKey: ["specialists"],
    queryFn: async () => {
      const res = await specialistsApi.getPros();
      if (!res.success || !res.data) return [];
      return res.data.map((pro: any) => ({
        id: pro.id,
        business_name: pro.activity_name || `${pro.first_name} ${pro.last_name}`,
        specialty: pro.specialty || "Prothésiste ongulaire",
        city: pro.city || "Paris",
        rating: Number(pro.avg_rating) || 0,
        reviews_count: Number(pro.reviews_count) || 0,
        profile_image_url: getImageUrl(pro.profile_photo),
        cover_image_url: getImageUrl(pro.banner_photo),
        user: { first_name: pro.first_name, last_name: pro.last_name },
      }));
    },
    staleTime: 2 * 60_000,
  });

  // Favorites (shared cache with ClientSpecialists and ClientFavorites)
  const { data: favoriteIds = new Set<number>() } = useQuery<Set<number>>({
    queryKey: ["favorites-ids"],
    queryFn: async () => {
      const res = await favoritesApi.getAll();
      if (!res.success || !res.data) return new Set<number>();
      return new Set<number>(res.data.map((f: any) => f.pro_id));
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  // Upcoming bookings (shared cache with ClientMyBooking)
  const { data: allBookings = [], isLoading: isLoadingBookings } = useQuery<Booking[]>({
    queryKey: ["client-bookings"],
    queryFn: async () => {
      const res = await clientApi.getMyBookings();
      if (!res.success || !res.data) return [];
      return res.data.map((b: any) => ({
        id: b.id,
        start_datetime: b.start_datetime,
        end_datetime: b.end_datetime,
        status: b.status,
        price: b.price,
        prestation_name: b.prestation?.name || "Prestation",
        pro_first_name: b.pro?.first_name || "",
        pro_last_name: b.pro?.last_name || "",
        activity_name: b.pro?.activity_name || null,
        profile_photo: b.pro?.profile_photo || null,
      }));
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  const upcomingBookings = useMemo(() => {
    const now = new Date();
    return allBookings
      .filter(b => (b.status === "confirmed" || b.status === "pending") && new Date(b.start_datetime) > now)
      .sort((a, b) => new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime());
  }, [allBookings]);

  // Toggle favorite with optimistic update
  const toggleFavMutation = useMutation({
    mutationFn: async (proId: number) => {
      if (favoriteIds.has(proId)) {
        await favoritesApi.remove(proId);
      } else {
        await favoritesApi.add(proId);
      }
    },
    onMutate: async (proId: number) => {
      await queryClient.cancelQueries({ queryKey: ["favorites-ids"] });
      const prev = queryClient.getQueryData<Set<number>>(["favorites-ids"]);
      queryClient.setQueryData<Set<number>>(["favorites-ids"], (old = new Set()) => {
        const next = new Set(old);
        if (next.has(proId)) next.delete(proId); else next.add(proId);
        return next;
      });
      return { prev };
    },
    onError: (_err, _proId, ctx: any) => {
      if (ctx?.prev) queryClient.setQueryData(["favorites-ids"], ctx.prev);
      toast.error("Impossible de modifier le favori.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["favorites-ids"] });
      queryClient.invalidateQueries({ queryKey: ["favorites"] });
    },
  });

  const filteredSpecialists = useMemo(() => {
    if (!searchQuery) return specialists;
    const q = searchQuery.toLowerCase().trim();
    return specialists.filter(s =>
      [s.business_name, s.specialty, s.city, s.user.first_name, s.user.last_name]
        .filter(Boolean).join(" ").toLowerCase().includes(q)
    );
  }, [searchQuery, specialists]);

  const handleSpecialistClick = (proId: number) => navigate(`/client/specialist/${proId}`);

  const toggleFavorite = (proId: number, e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (!user) {
      navigate("/login", { state: { message: "Connectez-vous pour ajouter aux favoris", returnUrl: "/client" } });
      return;
    }
    toggleFavMutation.mutate(proId);
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
            <Loader2 className="w-12 h-12 text-primary mx-auto animate-spin" />
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
              <h1 className="text-3xl font-display font-bold text-foreground">
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
                bg-card border-2 border-border
                text-foreground placeholder:text-muted-foreground
                focus:outline-none focus:border-primary
                transition-all duration-300
                shadow-sm
              "
              aria-label="Recherche"
            />
            <AnimatePresence>
              {searchQuery && (
                <motion.button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-4 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center transition-colors z-10"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  aria-label="Effacer la recherche"
                >
                  <span className="text-foreground text-lg leading-none">×</span>
                </motion.button>
              )}
            </AnimatePresence>
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
                  : `${specialists.length} experte${specialists.length > 1 ? 's' : ''} disponible${specialists.length > 1 ? 's' : ''}`
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
                  bg-primary
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
                    const isFavorite = favoriteIds.has(s.id);

                    return (
                      <motion.div
                        key={s.id}
                        className="
                          min-w-[320px] sm:min-w-[340px] flex-shrink-0 snap-center
                          bg-card rounded-3xl overflow-hidden
                          border-2 border-border
                          shadow-lg
                          text-left group
                          hover:shadow-xl
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
                        <div className="relative h-52 overflow-hidden bg-muted">
                          {s.cover_image_url ? (
                            <img
                              src={s.cover_image_url}
                              alt={`Bannière de ${s.business_name}`}
                              className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                              loading="lazy"
                            />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-primary/5">
                              <Sparkles className="w-16 h-16 text-primary/30" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

                          {/* Favorite button */}
                          <motion.button
                            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-lg z-10"
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={(e) => toggleFavorite(s.id, e)}
                            aria-label={isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"}
                          >
                            <Heart
                              size={18}
                              className={`transition-all duration-300 ${isFavorite
                                ? 'text-red-500 fill-red-500'
                                : 'text-muted-foreground'
                                }`}
                            />
                          </motion.button>

                          {/* Avatar & Name */}
                          <div className="absolute bottom-4 left-4 right-4 flex items-center gap-3 text-white z-10">
                            <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-white/90 shadow-2xl flex-shrink-0 bg-card">
                              {s.profile_image_url ? (
                                <img
                                  src={s.profile_image_url}
                                  alt={s.business_name}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary to-primary/70">
                                  <span className="text-2xl font-bold text-white">
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
                              <div className="flex items-center gap-1.5 bg-yellow-50 px-2.5 py-1 rounded-full">
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

                          <div className="flex items-center justify-between pt-2 border-t border-border">
                            <span className="text-xs font-semibold text-primary group-hover:text-primary/80 transition-colors">
                              Réserver
                            </span>
                            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary transition-all">
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
                        aria-hidden="true"
                      />
                    ))}
                  </div>
                )}

                {/* Bouton "Voir toutes les expertes" */}
                {specialists.length > 0 && !searchQuery && (
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
                        bg-primary
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
                className="mx-6 text-center py-12 px-6 bg-card rounded-3xl border-2 border-dashed border-border"
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
                      bg-primary
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

          {isLoadingBookings ? (
            <div className="p-5 rounded-2xl bg-card border-2 border-border flex items-center justify-center">
              <Loader2 className="w-6 h-6 text-primary animate-spin" />
            </div>
          ) : upcomingBookings.length > 0 ? (
            <div className="space-y-3">
              {upcomingBookings.slice(0, 2).map((booking) => {
                const proName = booking.activity_name ||
                  `${booking.pro_first_name} ${booking.pro_last_name}`.trim();
                const bookingDate = new Date(booking.start_datetime);
                const avatarUrl = getImageUrl(booking.profile_photo);

                return (
                  <motion.div
                    key={booking.id}
                    className="bg-card rounded-2xl overflow-hidden border-2 border-primary/20 shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => navigate(`/client/booking-detail/${booking.id}`)}
                  >
                    <div className="p-4 flex items-center gap-4">
                      {avatarUrl ? (
                        <img
                          src={avatarUrl}
                          alt={proName}
                          className="w-14 h-14 rounded-xl object-cover shadow-md"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-md">
                          <span className="text-xl font-bold text-white">
                            {proName[0]}
                          </span>
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-foreground mb-1">{proName}</h3>
                        <p className="text-sm text-muted-foreground mb-2">
                          {booking.prestation_name}
                        </p>

                        <div className="flex items-center gap-3 text-xs">
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Calendar size={12} />
                            <span>{bookingDate.toLocaleDateString('fr-FR', {
                              day: 'numeric',
                              month: 'short'
                            })}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-primary font-semibold">
                            <Clock size={12} />
                            <span>{bookingDate.toLocaleTimeString('fr-FR', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}</span>
                          </div>
                        </div>
                      </div>

                      <ChevronRight size={20} className="text-muted-foreground flex-shrink-0" />
                    </div>
                  </motion.div>
                );
              })}

              {/* Bouton pour voir toutes les réservations */}
              {upcomingBookings.length > 2 && (
                <button
                  onClick={() => navigate("/client/my-booking")}
                  className="w-full py-3 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-sm font-semibold transition-all duration-300 active:scale-95"
                >
                  Voir toutes mes réservations ({upcomingBookings.length})
                </button>
              )}
            </div>
          ) : (
            <motion.div
              className="relative overflow-hidden p-5 rounded-2xl bg-gradient-to-br from-primary/5 to-primary/10 border-2 border-dashed border-primary/30"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              whileHover={{ scale: 1.02 }}
              transition={{ duration: 0.5 }}
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center flex-shrink-0 shadow-lg">
                  <Calendar size={22} className="text-white" />
                </div>
                <div className="flex-1 space-y-2">
                  <p className="text-sm font-semibold text-foreground">Aucun rendez-vous prévu</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Réserve dès maintenant auprès d'une experte près de chez toi
                  </p>
                  <button
                    onClick={() => navigate("/client/specialists")}
                    className="mt-2 px-4 py-2 rounded-xl bg-primary text-white text-xs font-semibold shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 transition-all duration-300 active:scale-95 inline-flex items-center gap-2"
                  >
                    <Sparkles size={14} />
                    Découvrir les expertes
                  </button>
                </div>
              </div>
            </motion.div>
          )}
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
