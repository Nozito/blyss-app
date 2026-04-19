import { useState, useRef, useEffect, useMemo, MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  MapPin, Star, ChevronRight, Search, Sparkles, Calendar, Clock,
  Heart, ArrowRight, Loader2, X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import logo from "@/assets/logo.png";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { specialistsApi, favoritesApi, clientApi } from "@/services/api";
import { toast } from "sonner";
import { getImageUrl } from "@/utils/imageUrl";

// ── Types ──────────────────────────────────────────────────────────────────────
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
  status: "pending" | "confirmed" | "completed" | "cancelled";
  price: number;
  prestation_name: string;
  pro_first_name: string;
  pro_last_name: string;
  activity_name: string | null;
  profile_photo: string | null;
}

// ── Catégories style Booksy ────────────────────────────────────────────────────
const CATEGORIES = [
  { label: "Pose gel", emoji: "💅", query: "gel" },
  { label: "Semi-perm.", emoji: "✨", query: "semi-permanent" },
  { label: "French", emoji: "🤍", query: "french" },
  { label: "Nail art", emoji: "🎨", query: "nail art" },
  { label: "Manucure", emoji: "💎", query: "manucure" },
  { label: "Baby boomer", emoji: "🌸", query: "baby boomer" },
];

// ── Debounce hook ──────────────────────────────────────────────────────────────
function useDebounce<T>(value: T, ms: number): T {
  const [d, setD] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setD(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return d;
}

// ═════════════════════════════════════════════════════════════════════════════
const ClientHome = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Search state
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebounce(searchInput, 220);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const greeting = user?.first_name ? `Salut ${user.first_name}` : "Bienvenue sur Blyss";

  // ── Close dropdown on outside click ────────────────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Specialists (featured carousel — no search filter) ─────────────────────
  const { data: featuredSpecialists = [], isLoading } = useQuery<Specialist[]>({
    queryKey: ["specialists", "", 0, 0],   // shared cache key (no filters)
    queryFn: async () => {
      const res = await specialistsApi.getPros({ limit: 6 });
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

  // ── Suggestions dropdown (live search, max 5) ───────────────────────────────
  const { data: suggestions = [], isFetching: isSuggesting } = useQuery<Specialist[]>({
    queryKey: ["search-suggestions", debouncedSearch],
    queryFn: async () => {
      const res = await specialistsApi.getPros({ search: debouncedSearch, limit: 5 });
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
    enabled: debouncedSearch.trim().length >= 2,
    staleTime: 30_000,
    placeholderData: [],
  });

  // ── Favorites ───────────────────────────────────────────────────────────────
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

  // ── Upcoming bookings ───────────────────────────────────────────────────────
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
      .filter(
        (b) =>
          (b.status === "confirmed" || b.status === "pending") &&
          new Date(b.start_datetime) > now
      )
      .sort(
        (a, b) =>
          new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime()
      );
  }, [allBookings]);

  // ── Favorite toggle ─────────────────────────────────────────────────────────
  const toggleFavMutation = useMutation({
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
    onError: (_err: unknown, _id: number, ctx: any) => {
      if (ctx?.prev) queryClient.setQueryData(["favorites-ids"], ctx.prev);
      toast.error("Impossible de modifier le favori.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["favorites-ids"] });
      queryClient.invalidateQueries({ queryKey: ["favorites"] });
    },
  });

  const toggleFavorite = (proId: number, e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (!user) {
      navigate("/login", { state: { returnUrl: "/client" } });
      return;
    }
    toggleFavMutation.mutate(proId);
  };

  // ── Search actions ──────────────────────────────────────────────────────────
  const goToResults = (query: string) => {
    setDropdownOpen(false);
    setSearchInput("");
    if (query.trim()) {
      navigate(`/client/specialists?search=${encodeURIComponent(query.trim())}`);
    } else {
      navigate("/client/specialists");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") goToResults(searchInput);
    if (e.key === "Escape") { setDropdownOpen(false); inputRef.current?.blur(); }
  };

  const handleCategoryClick = (query: string) => {
    navigate(`/client/specialists?search=${encodeURIComponent(query)}`);
  };

  // ── Loading screen ──────────────────────────────────────────────────────────
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
          <Loader2 className="w-10 h-10 text-primary mx-auto animate-spin" />
        </motion.div>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="space-y-6 pt-6">
        {/* ── HERO ─────────────────────────────────────────────────────── */}
        <motion.header
          className="flex flex-col items-center text-center space-y-3 px-6"
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <motion.img
            src={logo}
            alt="Blyss"
            className="w-16 h-16 object-contain"
            initial={{ scale: 0.8, rotate: -10 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ duration: 0.5, type: "spring", stiffness: 200 }}
          />
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-2 justify-center">
              {greeting}
              <motion.span
                animate={{ rotate: [0, 14, -8, 14, -4, 10, 0] }}
                transition={{ duration: 0.5, delay: 0.3 }}
              >
                👋
              </motion.span>
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Tes nails parfaites, en quelques clics ✨
            </p>
          </div>
        </motion.header>

        {/* ── BARRE DE RECHERCHE + DROPDOWN ────────────────────────────── */}
        <motion.section
          className="px-6"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.5 }}
        >
          <div ref={searchRef} className="relative">
            {/* Input */}
            <div className="relative">
              <Search
                size={20}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none z-10"
              />
              <input
                ref={inputRef}
                type="text"
                value={searchInput}
                onChange={(e) => {
                  setSearchInput(e.target.value);
                  setDropdownOpen(true);
                }}
                onFocus={() => setDropdownOpen(true)}
                onKeyDown={handleKeyDown}
                placeholder="Experte, ville, prestation..."
                className="w-full h-14 pl-12 pr-12 rounded-2xl bg-card border-2 border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-all shadow-sm"
              />
              <AnimatePresence>
                {searchInput && (
                  <motion.button
                    type="button"
                    onClick={() => { setSearchInput(""); setDropdownOpen(false); }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-muted flex items-center justify-center z-10"
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                  >
                    <X size={14} />
                  </motion.button>
                )}
              </AnimatePresence>
            </div>

            {/* Dropdown suggestions */}
            <AnimatePresence>
              {dropdownOpen && searchInput.trim().length >= 2 && (
                <motion.div
                  className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 bg-card rounded-2xl shadow-xl border-2 border-border overflow-hidden"
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                >
                  {isSuggesting && suggestions.length === 0 ? (
                    <div className="flex items-center justify-center gap-2 py-5 text-sm text-muted-foreground">
                      <Loader2 size={16} className="animate-spin text-primary" />
                      Recherche…
                    </div>
                  ) : suggestions.length > 0 ? (
                    <>
                      {suggestions.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setDropdownOpen(false);
                            setSearchInput("");
                            navigate(`/client/specialist/${s.id}`);
                          }}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors text-left border-b border-border last:border-0"
                        >
                          <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 bg-muted">
                            {s.profile_image_url ? (
                              <img
                                src={s.profile_image_url}
                                alt={s.business_name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary to-primary/80">
                                <span className="text-white font-bold text-sm">
                                  {s.user.first_name[0]}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm text-foreground truncate">
                              {s.business_name}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {s.specialty}
                              {s.city && ` · ${s.city}`}
                            </p>
                          </div>
                          {s.rating > 0 && (
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <Star size={11} className="fill-yellow-400 text-yellow-400" />
                              <span className="text-xs font-bold text-foreground">
                                {s.rating.toFixed(1)}
                              </span>
                            </div>
                          )}
                        </button>
                      ))}
                      {/* "Voir tous les résultats" */}
                      <button
                        type="button"
                        onClick={() => goToResults(searchInput)}
                        className="w-full flex items-center justify-between px-4 py-3 bg-primary/5 hover:bg-primary/10 transition-colors"
                      >
                        <span className="text-sm font-semibold text-primary">
                          Voir tous les résultats pour « {searchInput} »
                        </span>
                        <ArrowRight size={16} className="text-primary flex-shrink-0" />
                      </button>
                    </>
                  ) : (
                    <div className="px-4 py-5 text-center">
                      <p className="text-sm font-semibold text-foreground mb-1">
                        Aucun résultat pour « {searchInput} »
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Essaie un autre nom ou une autre ville
                      </p>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── CATÉGORIES RAPIDES ──────────────────────────────────── */}
          <div className="flex gap-2 mt-3 overflow-x-auto no-scrollbar pb-1">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.query}
                type="button"
                onClick={() => handleCategoryClick(cat.query)}
                className="flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-card border-2 border-border text-xs font-semibold text-foreground hover:border-primary hover:text-primary transition-all whitespace-nowrap shadow-sm"
              >
                <span className="text-base leading-none">{cat.emoji}</span>
                {cat.label}
              </button>
            ))}
          </div>
        </motion.section>

        {/* ── SÉLECTION BLYSS ──────────────────────────────────────────── */}
        <section className="space-y-4">
          <motion.div
            className="flex items-center justify-between px-6"
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.25, duration: 0.5 }}
          >
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-foreground">Sélection Blyss</h2>
                <motion.div
                  animate={{ scale: [1, 1.2, 1], rotate: [0, 5, -5, 0] }}
                  transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                >
                  <Sparkles className="w-5 h-5 text-primary" />
                </motion.div>
              </div>
              <p className="text-xs text-muted-foreground">
                {featuredSpecialists.length} experte
                {featuredSpecialists.length > 1 ? "s" : ""} disponible
                {featuredSpecialists.length > 1 ? "s" : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate("/client/specialists")}
              className="px-4 py-2 rounded-full text-xs font-semibold bg-primary text-white shadow-lg shadow-primary/30 hover:shadow-xl transition-all active:scale-95 flex items-center gap-1.5"
            >
              Tout voir
              <ArrowRight size={14} />
            </button>
          </motion.div>

          {/* Carrousel horizontal */}
          {featuredSpecialists.length > 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              <div className="flex gap-4 overflow-x-auto no-scrollbar px-6 py-2 snap-x snap-mandatory">
                {featuredSpecialists.map((s, index) => {
                  const isFavorite = favoriteIds.has(s.id);
                  return (
                    <motion.div
                      key={s.id}
                      className="min-w-[300px] sm:min-w-[320px] flex-shrink-0 snap-center bg-card rounded-3xl overflow-hidden border-2 border-border shadow-lg hover:shadow-xl hover:border-primary/30 hover:-translate-y-1.5 transition-all duration-300 cursor-pointer group"
                      initial={{ opacity: 0, x: 40 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.08 * index, duration: 0.4 }}
                      onClick={() => navigate(`/client/specialist/${s.id}`)}
                    >
                      {/* Cover */}
                      <div className="relative h-48 overflow-hidden bg-muted">
                        {s.cover_image_url ? (
                          <img
                            src={s.cover_image_url}
                            alt={s.business_name}
                            className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                            loading="lazy"
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-primary/5">
                            <Sparkles className="w-14 h-14 text-primary/30" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />

                        {/* Favorite */}
                        <motion.button
                          className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-md z-10"
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={(e) => toggleFavorite(s.id, e)}
                        >
                          <Heart
                            size={16}
                            className={
                              isFavorite
                                ? "text-red-500 fill-red-500"
                                : "text-muted-foreground"
                            }
                          />
                        </motion.button>

                        {/* Info overlay */}
                        <div className="absolute bottom-3 left-3 right-3 flex items-center gap-3 text-white z-10">
                          <div className="w-14 h-14 rounded-2xl overflow-hidden border-2 border-white/90 shadow-xl flex-shrink-0 bg-card">
                            {s.profile_image_url ? (
                              <img
                                src={s.profile_image_url}
                                alt={s.business_name}
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary to-primary/70">
                                <span className="text-xl font-bold text-white">
                                  {s.user?.first_name?.[0] || "?"}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-base font-bold truncate drop-shadow-lg">
                              {s.business_name}
                            </p>
                            <p className="text-xs text-white/90 truncate">{s.specialty}</p>
                          </div>
                        </div>
                      </div>

                      {/* Footer */}
                      <div className="px-4 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <MapPin size={13} />
                          <span className="text-xs font-medium">{s.city || "—"}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          {s.rating > 0 && (
                            <div className="flex items-center gap-1 bg-yellow-50 px-2 py-0.5 rounded-full">
                              <Star size={12} className="fill-yellow-400 text-yellow-400" />
                              <span className="text-xs font-bold text-foreground">
                                {s.rating.toFixed(1)}
                              </span>
                            </div>
                          )}
                          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary transition-all">
                            <ChevronRight
                              size={15}
                              className="text-primary group-hover:text-white transition-all"
                            />
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* CTA pleine largeur */}
              <motion.div
                className="px-6 mt-2"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45 }}
              >
                <button
                  onClick={() => navigate("/client/specialists")}
                  className="w-full py-3.5 rounded-2xl bg-primary text-white font-semibold text-sm shadow-lg shadow-primary/30 hover:shadow-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  Voir toutes les expertes
                  <ArrowRight size={18} />
                </button>
              </motion.div>
            </motion.div>
          ) : null}
        </section>

        {/* ── TES NAILS À VENIR ─────────────────────────────────────────── */}
        <motion.section
          className="space-y-4 px-6"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.5 }}
        >
          <div>
            <h2 className="text-xl font-bold text-foreground">Tes nails à venir</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Tes prochains rendez-vous beauté</p>
          </div>

          {isLoadingBookings ? (
            <div className="p-5 rounded-2xl bg-card border-2 border-border flex items-center justify-center">
              <Loader2 className="w-6 h-6 text-primary animate-spin" />
            </div>
          ) : upcomingBookings.length > 0 ? (
            <div className="space-y-3">
              {upcomingBookings.slice(0, 2).map((booking) => {
                const proName =
                  booking.activity_name ||
                  `${booking.pro_first_name} ${booking.pro_last_name}`.trim();
                const bookingDate = new Date(booking.start_datetime);
                const avatarUrl = getImageUrl(booking.profile_photo);

                return (
                  <motion.div
                    key={booking.id}
                    className="bg-card rounded-2xl overflow-hidden border-2 border-primary/20 shadow-md hover:shadow-lg transition-all cursor-pointer"
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
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
                          <span className="text-xl font-bold text-white">{proName[0]}</span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-foreground mb-0.5">{proName}</h3>
                        <p className="text-sm text-muted-foreground mb-2">
                          {booking.prestation_name}
                        </p>
                        <div className="flex items-center gap-3 text-xs">
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Calendar size={12} />
                            <span>
                              {bookingDate.toLocaleDateString("fr-FR", {
                                day: "numeric",
                                month: "short",
                              })}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-primary font-semibold">
                            <Clock size={12} />
                            <span>
                              {bookingDate.toLocaleTimeString("fr-FR", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                        </div>
                      </div>
                      <ChevronRight size={20} className="text-muted-foreground flex-shrink-0" />
                    </div>
                  </motion.div>
                );
              })}
              {upcomingBookings.length > 2 && (
                <button
                  onClick={() => navigate("/client/my-booking")}
                  className="w-full py-3 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-sm font-semibold transition-all active:scale-95"
                >
                  Voir toutes mes réservations ({upcomingBookings.length})
                </button>
              )}
            </div>
          ) : (
            <motion.div
              className="p-5 rounded-2xl bg-gradient-to-br from-primary/5 to-primary/10 border-2 border-dashed border-primary/30"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center flex-shrink-0 shadow-md">
                  <Calendar size={22} className="text-white" />
                </div>
                <div className="flex-1 space-y-2">
                  <p className="text-sm font-semibold text-foreground">
                    Aucun rendez-vous prévu
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Réserve dès maintenant auprès d'une experte près de chez toi
                  </p>
                  <button
                    onClick={() => navigate("/client/specialists")}
                    className="mt-2 px-4 py-2 rounded-xl bg-primary text-white text-xs font-semibold shadow-md shadow-primary/30 transition-all active:scale-95 inline-flex items-center gap-2"
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
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
};

export default ClientHome;
