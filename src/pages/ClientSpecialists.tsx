import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Search, X, Star, MapPin, Navigation, Map, List, Heart,
  Loader2, AlertTriangle, ChevronLeft, SlidersHorizontal, Check,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import MarkerClusterGroup from "@changey/react-leaflet-markercluster";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import MobileLayout from "@/components/MobileLayout";
import { favoritesApi, specialistsApi } from "@/services/api";
import { getImageUrl } from "@/utils/imageUrl";

// ── Map markers ───────────────────────────────────────────────────────────────

/** Solid pink teardrop = adresse précise */
function makePreciseIcon(initial: string): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="
      width:38px;height:38px;border-radius:50% 50% 50% 0;
      background:#E91E8C;border:2px solid #fff;
      box-shadow:0 2px 10px rgba(233,30,140,.5);
      transform:rotate(-45deg);
      display:flex;align-items:center;justify-content:center;
    "><span style="
      transform:rotate(45deg);color:#fff;font-weight:700;font-size:13px;
      line-height:1;font-family:sans-serif;
    ">${initial.toUpperCase()}</span></div>`,
    iconSize: [38, 38],
    iconAnchor: [19, 38],
    popupAnchor: [0, -40],
  });
}

/** Outlined/dashed teardrop = centre-ville seulement */
function makeCityIcon(initial: string): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="
      width:38px;height:38px;border-radius:50% 50% 50% 0;
      background:rgba(233,30,140,.15);
      border:2px dashed #E91E8C;
      box-shadow:0 2px 8px rgba(233,30,140,.2);
      transform:rotate(-45deg);
      display:flex;align-items:center;justify-content:center;
    "><span style="
      transform:rotate(45deg);color:#E91E8C;font-weight:700;font-size:13px;
      line-height:1;font-family:sans-serif;
    ">${initial.toUpperCase()}</span></div>`,
    iconSize: [38, 38],
    iconAnchor: [19, 38],
    popupAnchor: [0, -40],
  });
}

const USER_ICON = L.divIcon({
  className: "",
  html: `<div style="position:relative;width:20px;height:20px;">
    <div style="position:absolute;inset:0;border-radius:50%;background:rgba(59,130,246,.25);animation:pulse-ring 1.8s ease-out infinite;"></div>
    <div style="position:absolute;inset:3px;border-radius:50%;background:#3b82f6;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3);"></div>
  </div>
  <style>@keyframes pulse-ring{0%{transform:scale(.8);opacity:.9}100%{transform:scale(2.2);opacity:0}}</style>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
  popupAnchor: [0, -14],
});

// ── Types ─────────────────────────────────────────────────────────────────────

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
  latitude: number | null;
  longitude: number | null;
  geo_precision: "address" | "city";
  distance_km: number | null;
}

interface UserLocation { lat: number; lng: number }

// ── Service categories (same as home chips) ───────────────────────────────────

const SERVICE_CHIPS = [
  { label: "Gel", query: "gel" },
  { label: "Manucure", query: "manucure" },
  { label: "French", query: "french" },
  { label: "Nail art", query: "nail art" },
  { label: "Semi-perm.", query: "semi-permanent" },
  { label: "Baby boomer", query: "baby boomer" },
];

const RATING_OPTIONS = [
  { label: "Toutes", value: 0 },
  { label: "4+", value: 4 },
  { label: "4.5+", value: 4.5 },
];

// ── Map bounds fitter ─────────────────────────────────────────────────────────

const MapFitBounds = ({
  markers,
  userLocation,
}: {
  markers: Array<[number, number]>;
  userLocation: UserLocation | null;
}) => {
  const map = useMap();
  const prevKey = useRef("");
  useEffect(() => {
    const key = markers.map((m) => m.join(",")).join("|");
    if (key === prevKey.current) return;
    prevKey.current = key;
    if (markers.length >= 2) {
      map.fitBounds(L.latLngBounds(markers), { padding: [50, 50], maxZoom: 13 });
    } else if (markers.length === 1) {
      map.setView(markers[0], 13);
    } else if (userLocation) {
      map.setView([userLocation.lat, userLocation.lng], 10);
    }
  }, [markers, userLocation, map]);
  return null;
};

// ── Debounce ──────────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ═════════════════════════════════════════════════════════════════════════════
const ClientSpecialists = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  // ── Filters (initialised from URL params set by ClientHome) ──────────────
  const [searchInput, setSearchInput] = useState(searchParams.get("search") ?? "");
  const debouncedSearch = useDebounce(searchInput, 350);
  const [cityFilter, setCityFilter] = useState(searchParams.get("city") ?? "");
  const [serviceFilter, setServiceFilter] = useState(searchParams.get("service") ?? "");
  const [ratingFilter, setRatingFilter] = useState(0);
  const [showFilterPanel, setShowFilterPanel] = useState(false);

  // ── View ─────────────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<"list" | "map">("list");

  // ── Geolocation ───────────────────────────────────────────────────────────
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [nearbyMode, setNearbyMode] = useState(false);

  const requestLocation = useCallback((onSuccess?: () => void) => {
    if (!navigator.geolocation) {
      setGeoError("Géolocalisation non disponible sur cet appareil.");
      return;
    }
    setGeoLoading(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setNearbyMode(true);
        setGeoLoading(false);
        onSuccess?.();
      },
      () => {
        setGeoError("Position indisponible. Vérifie tes autorisations.");
        setGeoLoading(false);
      },
      { timeout: 8000, maximumAge: 300_000 }
    );
  }, []);

  const handleViewModeChange = useCallback((mode: "list" | "map") => {
    setViewMode(mode);
    if (mode === "map" && !userLocation && !geoLoading) requestLocation();
  }, [userLocation, geoLoading, requestLocation]);

  const effectiveNearby = nearbyMode || (viewMode === "map" && !!userLocation);

  // ── Data ─────────────────────────────────────────────────────────────────
  const { data: specialists = [], isLoading, isError, isFetching } = useQuery<Specialist[]>({
    queryKey: [
      "specialists",
      debouncedSearch,
      cityFilter,
      serviceFilter,
      ratingFilter,
      userLocation?.lat,
      userLocation?.lng,
      effectiveNearby,
    ],
    queryFn: async () => {
      const res = await specialistsApi.getPros({
        limit: 100,
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
        ...(cityFilter ? { city: cityFilter } : {}),
        ...(serviceFilter ? { service: serviceFilter } : {}),
        ...(ratingFilter > 0 ? { min_rating: ratingFilter } : {}),
        ...(userLocation ? { lat: userLocation.lat, lng: userLocation.lng } : {}),
        ...(effectiveNearby ? { nearby: true, radius: 50 } : {}),
      });
      if (!res.success || !res.data) return [];
      return res.data.map((pro: any) => ({
        id: pro.id,
        business_name: pro.activity_name || `${pro.first_name} ${pro.last_name}`,
        specialty: pro.specialty || pro.activity_name || "Prothésiste ongulaire",
        city: pro.city || "",
        rating: Number(pro.avg_rating) || 0,
        reviews_count: Number(pro.reviews_count) || 0,
        profile_image_url: getImageUrl(pro.profile_photo),
        cover_image_url: getImageUrl(pro.banner_photo),
        user: { first_name: pro.first_name, last_name: pro.last_name },
        latitude: pro.latitude != null ? Number(pro.latitude) : null,
        longitude: pro.longitude != null ? Number(pro.longitude) : null,
        // geo_precision: null until migration 20260419000001 is applied
        geo_precision: (pro.geo_precision as "address" | "city") ?? "city",
        distance_km: pro.distance_km ?? null,
      }));
    },
    staleTime: 2 * 60_000,
    placeholderData: (prev) => prev,
  });

  // ── Favorites ─────────────────────────────────────────────────────────────
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
        if (next.has(proId)) next.delete(proId); else next.add(proId);
        return next;
      });
      return { prev };
    },
    onError: (_err: unknown, _proId: number, ctx: any) => {
      if (ctx?.prev) queryClient.setQueryData(["favorites-ids"], ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["favorites-ids"] });
      queryClient.invalidateQueries({ queryKey: ["favorites"] });
    },
  });

  // ── Derived ───────────────────────────────────────────────────────────────
  const uniqueCities = useMemo(() => {
    const cities = specialists.map((s) => s.city).filter(Boolean);
    return [...new Set(cities)].sort();
  }, [specialists]);

  const displaySpecialists = useMemo(() => {
    if (!userLocation) return specialists;
    return [...specialists].sort((a, b) => {
      if (a.distance_km == null && b.distance_km == null) return 0;
      if (a.distance_km == null) return 1;
      if (b.distance_km == null) return -1;
      return a.distance_km - b.distance_km;
    });
  }, [specialists, userLocation]);

  const mappableSpecialists = useMemo(
    () => displaySpecialists.filter((s) => s.latitude != null && s.longitude != null),
    [displaySpecialists]
  );

  const activeFiltersCount =
    (cityFilter ? 1 : 0) +
    (serviceFilter ? 1 : 0) +
    (ratingFilter > 0 ? 1 : 0) +
    (effectiveNearby ? 1 : 0);

  const hasActiveFilters = !!(searchInput || cityFilter || serviceFilter || ratingFilter > 0 || effectiveNearby);

  const clearAllFilters = () => {
    setSearchInput("");
    setCityFilter("");
    setServiceFilter("");
    setRatingFilter(0);
    setNearbyMode(false);
  };

  // ── Loading / Error ───────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <MobileLayout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Chargement des expertes…</p>
          </div>
        </div>
      </MobileLayout>
    );
  }

  if (isError) {
    return (
      <MobileLayout>
        <div className="min-h-[60vh] flex flex-col items-center justify-center px-6 text-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center">
            <AlertTriangle size={28} className="text-destructive" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground mb-1">Erreur de chargement</h2>
            <p className="text-sm text-muted-foreground">Vérifie ta connexion et réessaie.</p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 rounded-2xl bg-primary text-white font-semibold text-sm"
          >
            Réessayer
          </button>
        </div>
      </MobileLayout>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <MobileLayout>
      <div className="pb-24">

        {/* ══ HEADER ═══════════════════════════════════════════════════════════ */}
        <div className="bg-background">

          {/* Title row */}
          <div className="px-4 pt-4 pb-2 flex items-center gap-3">
            <button
              onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/client"))}
              className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center flex-shrink-0"
            >
              <ChevronLeft size={20} className="text-foreground" />
            </button>
            <div className="flex-1">
              <h1 className="text-lg font-bold text-foreground leading-tight">Nos expertes</h1>
              <p className="text-xs text-muted-foreground">
                {isFetching
                  ? "Recherche…"
                  : `${displaySpecialists.length} spécialiste${displaySpecialists.length !== 1 ? "s" : ""}`}
              </p>
            </div>
            {/* View toggle */}
            <div className="flex rounded-xl overflow-hidden border border-border">
              <button
                onClick={() => handleViewModeChange("list")}
                className={`w-9 h-9 flex items-center justify-center transition-colors ${
                  viewMode === "list" ? "bg-primary text-white" : "bg-background text-muted-foreground"
                }`}
              >
                <List size={16} />
              </button>
              <button
                onClick={() => handleViewModeChange("map")}
                className={`w-9 h-9 flex items-center justify-center transition-colors ${
                  viewMode === "map" ? "bg-primary text-white" : "bg-background text-muted-foreground"
                }`}
              >
                <Map size={16} />
              </button>
            </div>
          </div>

          {/* Search bar */}
          <div className="px-4 pb-2">
            <div className="relative">
              {isFetching
                ? <Loader2 size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 animate-spin text-primary" />
                : <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />}
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Nom, spécialité, ville…"
                className="w-full pl-10 pr-10 py-3 rounded-2xl bg-muted border border-transparent text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40 transition-all text-sm"
              />
              {searchInput && (
                <button
                  onClick={() => setSearchInput("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-muted-foreground/20 flex items-center justify-center"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {/* ── Horizontal filter chips (always visible) ─────────────────── */}
          <div className="px-4 pb-3 overflow-x-auto flex gap-2 scrollbar-hide">

            {/* Près de moi */}
            <button
              onClick={nearbyMode ? () => setNearbyMode(false) : () => requestLocation()}
              disabled={geoLoading}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all border ${
                nearbyMode
                  ? "bg-primary text-white border-primary"
                  : "bg-background text-foreground border-border"
              }`}
            >
              {geoLoading
                ? <Loader2 size={13} className="animate-spin" />
                : <Navigation size={13} className={nearbyMode ? "fill-white" : ""} />}
              {geoLoading ? "Localisation…" : "Près de moi"}
            </button>

            {/* Rating */}
            {RATING_OPTIONS.filter((o) => o.value > 0).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setRatingFilter(ratingFilter === opt.value ? 0 : opt.value)}
                className={`flex-shrink-0 flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold transition-all border ${
                  ratingFilter === opt.value
                    ? "bg-primary text-white border-primary"
                    : "bg-background text-foreground border-border"
                }`}
              >
                <Star size={11} className={ratingFilter === opt.value ? "fill-white text-white" : "fill-yellow-400 text-yellow-400"} />
                {opt.label}
              </button>
            ))}

            {/* Ville filter trigger */}
            <button
              onClick={() => setShowFilterPanel((v) => !v)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all border ${
                cityFilter
                  ? "bg-primary text-white border-primary"
                  : "bg-background text-foreground border-border"
              }`}
            >
              <MapPin size={13} />
              {cityFilter || "Ville"}
              {activeFiltersCount > 0 && (
                <span className="ml-0.5 w-4 h-4 rounded-full bg-white/25 text-[9px] flex items-center justify-center font-bold">
                  {activeFiltersCount}
                </span>
              )}
            </button>

            {/* Service chips */}
            {SERVICE_CHIPS.map((chip) => (
              <button
                key={chip.query}
                onClick={() => setServiceFilter(serviceFilter === chip.query ? "" : chip.query)}
                className={`flex-shrink-0 flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold transition-all border whitespace-nowrap ${
                  serviceFilter === chip.query
                    ? "bg-primary text-white border-primary"
                    : "bg-background text-foreground border-border"
                }`}
              >
                {serviceFilter === chip.query && <Check size={11} />}
                {chip.label}
              </button>
            ))}
          </div>

          {/* ── Expanded filter panel (city) ───────────────────────────────── */}
          <AnimatePresence>
            {showFilterPanel && uniqueCities.length > 0 && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden border-t border-border"
              >
                <div className="px-4 py-3">
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Ville</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => { setCityFilter(""); setShowFilterPanel(false); }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
                        !cityFilter ? "bg-primary text-white border-primary" : "bg-muted text-foreground border-transparent"
                      }`}
                    >
                      Toutes
                    </button>
                    {uniqueCities.map((city) => (
                      <button
                        key={city}
                        onClick={() => { setCityFilter(city === cityFilter ? "" : city); setShowFilterPanel(false); }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
                          cityFilter === city
                            ? "bg-primary text-white border-primary"
                            : "bg-muted text-foreground border-transparent"
                        }`}
                      >
                        {city}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Active filters summary + clear */}
          {hasActiveFilters && (
            <div className="px-4 pb-2 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {effectiveNearby ? "Dans un rayon de 50 km" : "Filtres actifs"}
              </p>
              <button
                onClick={clearAllFilters}
                className="text-xs text-primary font-semibold flex items-center gap-1"
              >
                <X size={11} /> Effacer tout
              </button>
            </div>
          )}

          {geoError && (
            <p className="px-4 pb-2 text-xs text-destructive">{geoError}</p>
          )}
        </div>

        {/* ══ MAP VIEW ══════════════════════════════════════════════════════════ */}
        {/* Always mounted — never inside AnimatePresence */}
        <div className={viewMode !== "map" ? "hidden" : ""}>
          <div className="relative" style={{ height: "45vh" }}>
            <MapContainer
              center={userLocation ? [userLocation.lat, userLocation.lng] : [46.6, 2.2]}
              zoom={userLocation ? 11 : 6}
              style={{ height: "100%", width: "100%" }}
              scrollWheelZoom={false}
              zoomControl={false}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                subdomains="abcd"
              />
              <MapFitBounds
                markers={mappableSpecialists.map((s) => [s.latitude!, s.longitude!] as [number, number])}
                userLocation={userLocation}
              />
              {userLocation && (
                <Marker position={[userLocation.lat, userLocation.lng]} icon={USER_ICON}>
                  <Popup><span style={{ fontSize: 13, fontWeight: 600 }}>Ma position</span></Popup>
                </Marker>
              )}
              <MarkerClusterGroup chunkedLoading maxClusterRadius={50} showCoverageOnHover={false}>
                {mappableSpecialists.map((s) => (
                  <Marker
                    key={s.id}
                    position={[s.latitude!, s.longitude!]}
                    icon={s.geo_precision === "address"
                      ? makePreciseIcon(s.user.first_name[0])
                      : makeCityIcon(s.user.first_name[0])}
                  >
                    <Popup minWidth={170} maxWidth={210}>
                      <div style={{ fontFamily: "sans-serif", padding: "2px 0" }}>
                        {s.profile_image_url && (
                          <img
                            src={s.profile_image_url}
                            alt={s.business_name}
                            style={{ width: "100%", height: 68, objectFit: "cover", borderRadius: 8, marginBottom: 6 }}
                          />
                        )}
                        <p style={{ fontWeight: 700, fontSize: 13, margin: "0 0 2px" }}>{s.business_name}</p>
                        <p style={{ fontSize: 11, color: "#9333ea", margin: "0 0 2px" }}>{s.specialty}</p>
                        {s.city && (
                          <p style={{ fontSize: 11, color: "#6b7280", margin: "0 0 3px" }}>
                            {s.geo_precision === "address" ? "📍" : "🏙️"} {s.city}
                            {s.geo_precision === "city" && (
                              <span style={{ color: "#9ca3af", fontSize: 10 }}> (zone)</span>
                            )}
                          </p>
                        )}
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                          {s.rating > 0 && (
                            <span style={{ fontSize: 11, color: "#d97706", fontWeight: 600 }}>
                              ★ {s.rating.toFixed(1)}
                              {s.reviews_count > 0 && (
                                <span style={{ color: "#9ca3af", fontWeight: 400 }}> ({s.reviews_count})</span>
                              )}
                            </span>
                          )}
                          {s.distance_km != null && (
                            <span style={{ fontSize: 11, color: "#E91E8C", fontWeight: 600, marginLeft: "auto" }}>
                              {s.distance_km} km
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => navigate(`/client/specialist/${s.id}`)}
                          style={{
                            width: "100%", padding: "7px 0", borderRadius: 8,
                            background: "#E91E8C", color: "#fff",
                            border: "none", fontWeight: 700, fontSize: 12, cursor: "pointer",
                          }}
                        >
                          Voir le profil
                        </button>
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </MarkerClusterGroup>
            </MapContainer>

            {/* Map legend */}
            <div className="absolute bottom-3 left-3 z-[1000] bg-white/90 backdrop-blur-sm rounded-xl px-3 py-2 shadow-md text-[11px] flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-primary border border-white shadow-sm" />
                <span className="text-foreground font-medium">Adresse précise</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full border-2 border-dashed border-primary bg-primary/10" />
                <span className="text-muted-foreground">Ville uniquement</span>
              </div>
            </div>
          </div>

          {/* Scrollable list under map */}
          <div className="px-4 pt-3 space-y-2.5">
            {displaySpecialists.length === 0 && !isFetching ? (
              <div className="text-center py-8">
                <p className="text-sm font-semibold text-foreground mb-1">Aucune experte trouvée</p>
                <p className="text-xs text-muted-foreground">
                  {effectiveNearby ? "Essaie sans le filtre de proximité." : "Modifie tes critères."}
                </p>
              </div>
            ) : (
              displaySpecialists.map((s) => (
                <button
                  key={s.id}
                  onClick={() => navigate(`/client/specialist/${s.id}`)}
                  className="w-full flex items-center gap-3 bg-card rounded-2xl p-3 shadow-sm text-left active:scale-[0.98] transition-transform"
                >
                  <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-muted">
                    {s.profile_image_url ? (
                      <img src={s.profile_image_url} alt={s.business_name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary to-primary/70">
                        <span className="text-white font-bold text-sm">{s.user.first_name[0]}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-foreground truncate">{s.business_name}</p>
                    <p className="text-xs text-primary/80 truncate">{s.specialty}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.geo_precision === "address" ? "📍" : "🏙️"} {s.city}
                      {s.distance_km != null && (
                        <span className="ml-1.5 text-primary font-semibold">{s.distance_km} km</span>
                      )}
                    </p>
                  </div>
                  {s.rating > 0 && (
                    <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                      <div className="flex items-center gap-0.5">
                        <Star size={11} className="fill-yellow-400 text-yellow-400" />
                        <span className="text-xs font-bold text-foreground">{s.rating.toFixed(1)}</span>
                      </div>
                      {s.reviews_count > 0 && (
                        <span className="text-[10px] text-muted-foreground">{s.reviews_count} avis</span>
                      )}
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        {/* ══ LIST VIEW ══════════════════════════════════════════════════════════ */}
        <div className={viewMode !== "list" ? "hidden" : "px-4"}>
          {/* Subtle fetching overlay */}
          <div
            className={`transition-opacity duration-200 ${
              isFetching && displaySpecialists.length > 0 ? "opacity-60 pointer-events-none" : "opacity-100"
            }`}
          >
            {displaySpecialists.length > 0 ? (
              <div className="space-y-3">
                {displaySpecialists.map((s, index) => {
                  const isFav = favoriteIds.has(s.id);
                  return (
                    <motion.div
                      key={s.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, delay: Math.min(index * 0.04, 0.3) }}
                    >
                      {/* ── Horizontal card (Treatwell-style) ─────────────── */}
                      <div
                        onClick={() => navigate(`/client/specialist/${s.id}`)}
                        className="bg-card rounded-2xl overflow-hidden shadow-sm flex cursor-pointer active:scale-[0.98] transition-transform border border-border/40"
                      >
                        {/* Cover image — square left panel */}
                        <div className="relative w-28 flex-shrink-0 bg-muted">
                          {s.cover_image_url ? (
                            <img
                              src={s.cover_image_url}
                              alt={s.business_name}
                              className="w-full h-full object-cover"
                            />
                          ) : s.profile_image_url ? (
                            <img
                              src={s.profile_image_url}
                              alt={s.business_name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 via-primary/10 to-transparent min-h-[110px]">
                              <span className="text-2xl font-bold text-primary/40">
                                {s.user.first_name[0]}
                              </span>
                            </div>
                          )}
                          {/* Rating badge */}
                          {s.rating > 0 && (
                            <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded-lg bg-black/55 backdrop-blur-sm flex items-center gap-0.5">
                              <Star size={9} className="fill-yellow-400 text-yellow-400" />
                              <span className="text-[10px] font-bold text-white">{s.rating.toFixed(1)}</span>
                            </div>
                          )}
                          {/* Distance badge */}
                          {s.distance_km != null && (
                            <div className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded-lg bg-primary/90 backdrop-blur-sm flex items-center gap-0.5">
                              <Navigation size={8} className="text-white" />
                              <span className="text-[10px] font-bold text-white">{s.distance_km} km</span>
                            </div>
                          )}
                        </div>

                        {/* Info — right panel */}
                        <div className="flex-1 p-3 flex flex-col justify-between min-h-[110px]">
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <h3 className="font-bold text-sm text-foreground leading-tight truncate">
                                  {s.business_name}
                                </h3>
                                <p className="text-xs text-primary font-medium mt-0.5 truncate">
                                  {s.specialty}
                                </p>
                              </div>
                              {/* Favorite */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleFavoriteMutation.mutate(s.id);
                                }}
                                className={`w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center transition-all ${
                                  isFav ? "bg-primary/10" : "bg-muted"
                                }`}
                              >
                                <Heart
                                  size={14}
                                  className={isFav ? "text-primary fill-primary" : "text-muted-foreground"}
                                />
                              </button>
                            </div>

                            {/* Location */}
                            <div className="flex items-center gap-1 mt-2">
                              {s.geo_precision === "address" ? (
                                <MapPin size={11} className="text-muted-foreground flex-shrink-0" />
                              ) : (
                                <span className="text-[11px] leading-none">🏙️</span>
                              )}
                              <span className="text-xs text-muted-foreground truncate">{s.city}</span>
                              {s.geo_precision === "city" && (
                                <span className="text-[10px] text-muted-foreground/60">(zone)</span>
                              )}
                            </div>

                            {/* Reviews count */}
                            {s.reviews_count > 0 && (
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                {s.reviews_count} avis client{s.reviews_count > 1 ? "s" : ""}
                              </p>
                            )}
                          </div>

                          {/* Book button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/client/specialist/${s.id}`);
                            }}
                            className="mt-2 w-full py-2 rounded-xl bg-primary text-white text-xs font-bold transition-all hover:bg-primary/90 active:scale-95"
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
              !isFetching && (
                <motion.div
                  className="text-center py-16"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                    <Search size={30} className="text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-bold text-foreground mb-2">Aucun résultat</h3>
                  <p className="text-sm text-muted-foreground mb-6 max-w-[240px] mx-auto">
                    {nearbyMode
                      ? "Aucune experte dans un rayon de 50 km. Essaie sans proximité."
                      : hasActiveFilters
                      ? "Aucune experte ne correspond à ces critères."
                      : "Aucune experte disponible pour le moment."}
                  </p>
                  {hasActiveFilters && (
                    <button
                      onClick={clearAllFilters}
                      className="px-6 py-3 rounded-2xl bg-primary text-white font-semibold text-sm"
                    >
                      Voir toutes les expertes
                    </button>
                  )}
                </motion.div>
              )
            )}
          </div>

          {/* Initial loading (no placeholder data yet) */}
          {isFetching && displaySpecialists.length === 0 && (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-card rounded-2xl overflow-hidden flex border border-border/40 animate-pulse">
                  <div className="w-28 h-28 bg-muted flex-shrink-0" />
                  <div className="flex-1 p-3 space-y-2">
                    <div className="h-4 bg-muted rounded-lg w-3/4" />
                    <div className="h-3 bg-muted rounded-lg w-1/2" />
                    <div className="h-3 bg-muted rounded-lg w-2/3" />
                    <div className="h-7 bg-muted rounded-xl w-full mt-auto" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </MobileLayout>
  );
};

export default ClientSpecialists;
