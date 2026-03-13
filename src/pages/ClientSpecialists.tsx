import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X, Star, MapPin, Sparkles, ChevronLeft, Heart, Loader2 } from "lucide-react";
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

const ClientSpecialists = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");

  // Chargement des spécialistes avec cache 2min
  const { data: specialists = [], isLoading } = useQuery<Specialist[]>({
    queryKey: ["specialists"],
    queryFn: async () => {
      const res = await specialistsApi.getPros();
      if (!res.success || !res.data) return [];
      return res.data.map((pro: any) => ({
        id: pro.id,
        business_name: pro.activity_name || `${pro.first_name} ${pro.last_name}`,
        specialty: pro.specialty || "Prothésiste ongulaire",
        city: pro.city || "Non spécifié",
        rating: Number(pro.avg_rating) || 0,
        reviews_count: Number(pro.reviews_count) || 0,
        profile_image_url: getImageUrl(pro.profile_photo),
        cover_image_url: getImageUrl(pro.banner_photo),
        user: { first_name: pro.first_name, last_name: pro.last_name },
      }));
    },
    staleTime: 2 * 60_000,
  });

  // Chargement des favoris depuis l'API (synchronisé avec ClientFavorites et ClientHome)
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
      if (favoriteIds.has(proId)) {
        await favoritesApi.remove(proId);
      } else {
        await favoritesApi.add(proId);
      }
    },
    onMutate: async (proId: number) => {
      // Optimistic update
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
        <div className="bg-background pb-6">
          <div className="px-4 pt-4 pb-4 flex items-center gap-3">
            <button
              onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/client"))}
              className="w-10 h-10 rounded-xl bg-background border-2 border-white flex items-center justify-center hover:bg-muted transition-all shadow-sm"
            >
              <ChevronLeft size={20} className="text-foreground" />
            </button>
            <h1 className="text-xl font-bold text-foreground">Découvre nos expertes</h1>
          </div>

          {/* Barre de recherche */}
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
        </div>

        {/* Grille de cartes */}
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
                      {/* Cover image */}
                      <div className="relative w-full aspect-square overflow-hidden rounded-t-2xl bg-muted">
                        {specialist.cover_image_url ? (
                          <img src={specialist.cover_image_url} alt={specialist.business_name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
                            <Sparkles size={40} className="text-primary/40" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />

                        {/* Bouton favori */}
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleFavoriteMutation.mutate(specialist.id); }}
                          className={`absolute top-2 right-2 w-8 h-8 rounded-full backdrop-blur-md flex items-center justify-center transition-all z-10 ${isFav ? "bg-primary shadow-lg scale-110" : "bg-black/30 hover:bg-black/50"}`}
                        >
                          <Heart size={14} className={isFav ? "text-white fill-white" : "text-white"} />
                        </button>

                        {/* Note */}
                        {specialist.rating > 0 && (
                          <div className="absolute top-2 left-2 px-2 py-1 rounded-full bg-black/50 backdrop-blur-md flex items-center gap-1">
                            <Star size={11} className="fill-yellow-400 text-yellow-400" />
                            <span className="text-xs font-bold text-white">{specialist.rating.toFixed(1)}</span>
                          </div>
                        )}
                      </div>

                      {/* Carte info */}
                      <div className="relative bg-card rounded-b-2xl shadow-sm border-2 border-card">
                        {/* Avatar */}
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
                          <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground mb-2">
                            <MapPin size={10} />
                            <span className="truncate">{specialist.city}</span>
                          </div>
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
                  {searchQuery ? "Essaie avec d'autres mots-clés" : "Aucune experte disponible pour le moment"}
                </p>
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")} className="px-6 py-3 rounded-xl bg-primary text-white font-semibold hover:shadow-lg transition-all">
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
