import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X, Star, MapPin, Sparkles, ChevronLeft, Heart, Loader2, SlidersHorizontal } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import MobileLayout from "@/components/MobileLayout";
import { favoritesApi, specialistsApi } from "@/services/api";
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

const RATING_OPTIONS = [
  { label: "Toutes", value: 0 },
  { label: "4+", value: 4 },
  { label: "4.5+", value: 4.5 },
];

const ClientSpecialists = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [ratingFilter, setRatingFilter] = useState(0);
  const [showFilters, setShowFilters] = useState(false);

  const { data: specialists = [], isLoading } = useQuery<Specialist[]>({
    queryKey: ["specialists"],
    queryFn: async () => {
      const res = await specialistsApi.getPros();
      if (!res.success || !res.data) return [];
      return res.data.map((pro: any) => ({
        id: pro.id,
        business_name: pro.activity_name || `${pro.first_name} ${pro.last_name}`,
        specialty: pro.specialty || "Prothésiste ongulaire",
        city: pro.city || "",
        rating: Number(pro.avg_rating) || 0,
        reviews_count: Number(pro.reviews_count) || 0,
        profile_image_url: getImageUrl(pro.profile_photo),
        cover_image_url: getImageUrl(pro.banner_photo),
        user: { first_name: pro.first_name, last_name: pro.last_name },
      }));
    },
    staleTime: 2 * 60_000,
  });

  const { data: favoriteIds = new Set<number>() } = useQuery<Set<number>>({
    queryKey: ["favorites-ids"],
    queryFn: async () => {
      const res = await favoritesApi.getAll();
      if (!res.success || !res.data) return new Set<number>();
      return new Set<number>(res.data.map((f: any) => f.pro_id));
    },
    staleTime: 60_000,
  });

  const toggleFavoriteMutation = useMutation({
    mutationFn: async (proId: number) => {
      if (favoriteIds.has(proId)) await favoritesApi.remove(proId);
      else await favoritesApi.add(proId);
    },
    onMutate: async (proId: number) => {
      await queryClient.cancelQueries({ queryKey: ["favorites-ids"] });
      const prev = queryClient.getQueryData<Set<number>>(["favorites-ids"]);
      queryClient.setQueryData<Set<number>>(["favorites-ids"], (old = new Set()) => {
        const next = new Set(old);
        if (next.has(proId)) next.delete(proId);
        else next.add(proId);
        return next;
      });
      return { prev };
    },
    onError: (_err, _proId, ctx: any) => {
      if (ctx?.prev) queryClient.setQueryData(["favorites-ids"], ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["favorites-ids"] });
      queryClient.invalidateQueries({ queryKey: ["favorites"] });
    },
  });

  const uniqueCities = useMemo(() => {
    const cities = specialists.map((s) => s.city).filter(Boolean);
    return [...new Set(cities)].sort();
  }, [specialists]);

  const filteredSpecialists = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return specialists.filter((s) => {
      if (q && !s.business_name.toLowerCase().includes(q) &&
          !s.specialty.toLowerCase().includes(q) &&
          !s.city.toLowerCase().includes(q)) return false;
      if (cityFilter && s.city !== cityFilter) return false;
      if (ratingFilter > 0 && s.rating < ratingFilter) return false;
      return true;
    });
  }, [specialists, searchQuery, cityFilter, ratingFilter]);

  const activeFiltersCount = (cityFilter ? 1 : 0) + (ratingFilter > 0 ? 1 : 0);

  const clearAllFilters = () => {
    setCityFilter("");
    setRatingFilter(0);
    setSearchQuery("");
  };

  if (isLoading) {
    return (
      <MobileLayout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
            <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Chargement...</p>
          </motion.div>
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout>
      <div className="pb-24">
        {/* Header */}
        <div className="bg-background pb-4">
          <div className="px-4 pt-4 pb-3 flex items-center gap-3">
            <button
              onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/client"))}
              className="w-10 h-10 rounded-xl bg-background border-2 border-white flex items-center justify-center hover:bg-muted transition-all shadow-sm"
            >
              <ChevronLeft size={20} className="text-foreground" />
            </button>
            <h1 className="text-xl font-bold text-foreground flex-1">Découvre nos expertes</h1>
            <button
              onClick={() => setShowFilters((v) => !v)}
              className={`relative w-10 h-10 rounded-xl flex items-center justify-center transition-all shadow-sm ${
                showFilters || activeFiltersCount > 0
                  ? "bg-primary text-white"
                  : "bg-background border-2 border-white text-foreground hover:bg-muted"
              }`}
            >
              <SlidersHorizontal size={18} />
              {activeFiltersCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-white text-primary text-[9px] font-bold flex items-center justify-center border border-primary/20">
                  {activeFiltersCount}
                </span>
              )}
            </button>
          </div>

          {/* Search bar */}
          <div className="px-4">
            <div className="relative group">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" />
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

          {/* Filter panel */}
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="px-4 pt-3 space-y-3">
                  {/* Rating filter */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Star size={12} className="text-yellow-400 fill-yellow-400" />
                      Note minimale
                    </p>
                    <div className="flex gap-2">
                      {RATING_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setRatingFilter(opt.value)}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                            ratingFilter === opt.value
                              ? "bg-primary text-white shadow-sm shadow-primary/30"
                              : "bg-muted text-muted-foreground hover:bg-muted/70"
                          }`}
                        >
                          {opt.value > 0 && <Star size={9} className="inline mr-0.5 fill-current -mt-0.5" />}
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* City filter */}
                  {uniqueCities.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                        <MapPin size={12} />
                        Ville
                      </p>
                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={() => setCityFilter("")}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                            cityFilter === ""
                              ? "bg-primary text-white shadow-sm shadow-primary/30"
                              : "bg-muted text-muted-foreground hover:bg-muted/70"
                          }`}
                        >
                          Toutes
                        </button>
                        {uniqueCities.map((city) => (
                          <button
                            key={city}
                            onClick={() => setCityFilter(city === cityFilter ? "" : city)}
                            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                              cityFilter === city
                                ? "bg-primary text-white shadow-sm shadow-primary/30"
                                : "bg-muted text-muted-foreground hover:bg-muted/70"
                            }`}
                          >
                            {city}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Active filters summary */}
          {activeFiltersCount > 0 && (
            <div className="px-4 pt-2 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{filteredSpecialists.length} résultat{filteredSpecialists.length !== 1 ? "s" : ""}</span>
              <button
                onClick={clearAllFilters}
                className="text-xs text-primary font-semibold flex items-center gap-1 ml-auto"
              >
                <X size={12} />
                Effacer les filtres
              </button>
            </div>
          )}
        </div>

        {/* Grid */}
        <div className="px-4">
          <AnimatePresence mode="popLayout">
            {filteredSpecialists.length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {filteredSpecialists.map((specialist, index) => {
                  const isFav = favoriteIds.has(specialist.id);
                  return (
                    <motion.div
                      key={specialist.id}
                      onClick={() => navigate(`/client/specialist/${specialist.id}`)}
                      className="relative cursor-pointer group"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ delay: index * 0.04, duration: 0.3 }}
                      whileHover={{ y: -4 }}
                    >
                      <div className="relative w-full aspect-square overflow-hidden rounded-t-2xl bg-muted">
                        {specialist.cover_image_url ? (
                          <img src={specialist.cover_image_url} alt={specialist.business_name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
                            <Sparkles size={40} className="text-primary/40" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />

                        <button
                          onClick={(e) => { e.stopPropagation(); toggleFavoriteMutation.mutate(specialist.id); }}
                          className={`absolute top-2 right-2 w-8 h-8 rounded-full backdrop-blur-md flex items-center justify-center transition-all z-10 ${isFav ? "bg-primary shadow-lg scale-110" : "bg-black/30 hover:bg-black/50"}`}
                        >
                          <Heart size={14} className={isFav ? "text-white fill-white" : "text-white"} />
                        </button>

                        {specialist.rating > 0 && (
                          <div className="absolute top-2 left-2 px-2 py-1 rounded-full bg-black/50 backdrop-blur-md flex items-center gap-1">
                            <Star size={11} className="fill-yellow-400 text-yellow-400" />
                            <span className="text-xs font-bold text-white">{specialist.rating.toFixed(1)}</span>
                          </div>
                        )}
                      </div>

                      <div className="relative bg-card rounded-b-2xl shadow-sm border-2 border-card">
                        <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-12 h-12 rounded-full border-2 border-white overflow-hidden shadow-lg z-10">
                          {specialist.profile_image_url ? (
                            <img src={specialist.profile_image_url} alt={specialist.business_name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary to-primary/80">
                              <span className="text-white font-bold text-sm">{specialist.user.first_name[0]}</span>
                            </div>
                          )}
                        </div>
                        <div className="pt-8 pb-3 px-3 text-center">
                          <h3 className="font-bold text-sm text-foreground mb-1 truncate">{specialist.business_name}</h3>
                          <p className="text-xs text-muted-foreground mb-2 truncate flex items-center justify-center gap-1">
                            <Sparkles size={10} className="text-primary" />
                            {specialist.specialty}
                          </p>
                          {specialist.city && (
                            <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground mb-2">
                              <MapPin size={10} />
                              <span className="truncate">{specialist.city}</span>
                            </div>
                          )}
                          {specialist.reviews_count > 0 && (
                            <p className="text-[10px] text-muted-foreground mb-3">{specialist.reviews_count} avis</p>
                          )}
                          <button
                            className="w-full py-2 rounded-xl bg-primary/10 text-primary text-xs font-bold hover:bg-primary hover:text-white transition-all group-hover:bg-primary group-hover:text-white"
                            onClick={(e) => { e.stopPropagation(); navigate(`/client/specialist/${specialist.id}`); }}
                          >
                            Réserver
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <motion.div className="text-center py-16" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                  <Search size={32} className="text-muted-foreground" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">Aucun résultat</h3>
                <p className="text-sm text-muted-foreground mb-6">
                  {searchQuery || cityFilter || ratingFilter > 0
                    ? "Essaie avec d'autres critères"
                    : "Aucune experte disponible pour le moment"}
                </p>
                {(searchQuery || cityFilter || ratingFilter > 0) && (
                  <button onClick={clearAllFilters} className="px-6 py-3 rounded-xl bg-primary text-white font-semibold hover:shadow-lg transition-all">
                    Voir toutes les expertes
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </MobileLayout>
  );
};

export default ClientSpecialists;
