import React, { useState, useMemo, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search, X, Star, MapPin, Sparkles, ChevronLeft, Heart,
  Loader2, SlidersHorizontal, AlertTriangle, Navigation, Map, List,
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

// ── Custom DivIcon markers (no external CDN) ──────────────────────────────────

/** Pink branded pin for a pro — shows their initial */
function makeProIcon(initial: string): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `
      <div style="
        width:36px;height:36px;border-radius:50% 50% 50% 0;
        background:#E91E8C;border:2px solid #fff;
        box-shadow:0 2px 8px rgba(233,30,140,.45);
        transform:rotate(-45deg);
        display:flex;align-items:center;justify-content:center;
      ">
        <span style="
          transform:rotate(45deg);
          color:#fff;font-weight:700;font-size:13px;
          line-height:1;font-family:sans-serif;
        ">${initial.toUpperCase()}</span>
      </div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -38],
  });
}

/** Pulsing blue dot for user's own position */
const USER_ICON = L.divIcon({
  className: "",
  html: `
    <div style="position:relative;width:20px;height:20px;">
      <div style="
        position:absolute;inset:0;border-radius:50%;
        background:rgba(59,130,246,.25);
        animation:pulse-ring 1.8s ease-out infinite;
      "></div>
      <div style="
        position:absolute;inset:3px;border-radius:50%;
        background:#3b82f6;border:2px solid #fff;
        box-shadow:0 1px 4px rgba(0,0,0,.3);
      "></div>
    </div>
    <style>
      @keyframes pulse-ring{0%{transform:scale(.8);opacity:.9}100%{transform:scale(2.2);opacity:0}}
    </style>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
  popupAnchor: [0, -14],
});

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
  distance_km: number | null;
}

interface UserLocation {
  lat: number;
  lng: number;
}

const RATING_OPTIONS = [
  { label: "Toutes", value: 0 },
  { label: "4+", value: 4 },
  { label: "4.5+", value: 4.5 },
];

/**
 * Fits the map view to show all markers whenever the marker set changes.
 * Falls back to the user's location if there are no mappable specialists.
 */
const MapFitBounds = ({
  markers,
  userLocation,
}: {
  markers: Array<[number, number]>;
  userLocation: { lat: number; lng: number } | null;
}) => {
  const map = useMap();
  const prevMarkersRef = React.useRef<string>("");

  useEffect(() => {
    const key = markers.map((m) => m.join(",")).join("|");
    if (key === prevMarkersRef.current) return;
    prevMarkersRef.current = key;

    if (markers.length >= 2) {
      map.fitBounds(L.latLngBounds(markers), { padding: [40, 40], maxZoom: 13 });
    } else if (markers.length === 1) {
      map.setView(markers[0], 13);
    } else if (userLocation) {
      map.setView([userLocation.lat, userLocation.lng], 11);
    }
  }, [markers, userLocation, map]);

  return null;
};

const ClientSpecialists = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [ratingFilter, setRatingFilter] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "map">("list");

  // Geolocation state
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  // nearbyMode: active in list view when user presses "Près de moi"
  // In map view, proximity is ALWAYS active when location is known
  const [nearbyMode, setNearbyMode] = useState(false);

  const requestLocation = useCallback((onSuccess?: () => void) => {
    if (!navigator.geolocation) {
      setGeoError("La géolocalisation n'est pas disponible sur votre appareil.");
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
        setGeoError("Position indisponible. Vérifiez vos autorisations.");
        setGeoLoading(false);
      },
      { timeout: 8000, maximumAge: 300_000 }
    );
  }, []);

  // Switching to map view: auto-request location if not already known
  const handleViewModeChange = useCallback((mode: "list" | "map") => {
    setViewMode(mode);
    if (mode === "map" && !userLocation && !geoLoading) {
      requestLocation();
    }
  }, [userLocation, geoLoading, requestLocation]);

  // In map view, proximity is always active when location is known
  const effectiveNearby = nearbyMode || (viewMode === "map" && !!userLocation);

  const { data: specialists = [], isLoading, isError } = useQuery<Specialist[]>({
    queryKey: ["specialists", userLocation, effectiveNearby],
    queryFn: async () => {
      const res = await specialistsApi.getPros({
        limit: 100,
        ...(userLocation && effectiveNearby
          ? { lat: userLocation.lat, lng: userLocation.lng, nearby: true, radius: 50 }
          : userLocation
          ? { lat: userLocation.lat, lng: userLocation.lng }
          : {}),
      });
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
        latitude: pro.latitude != null ? Number(pro.latitude) : null,
        longitude: pro.longitude != null ? Number(pro.longitude) : null,
        distance_km: pro.distance_km ?? null,
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
      if (
        q &&
        !s.business_name.toLowerCase().includes(q) &&
        !s.specialty.toLowerCase().includes(q) &&
        !s.city.toLowerCase().includes(q)
      )
        return false;
      if (cityFilter && s.city !== cityFilter) return false;
      if (ratingFilter > 0 && s.rating < ratingFilter) return false;
      return true;
    });
  }, [specialists, searchQuery, cityFilter, ratingFilter]);

  const activeFiltersCount = (cityFilter ? 1 : 0) + (ratingFilter > 0 ? 1 : 0) + (effectiveNearby ? 1 : 0);

  const clearAllFilters = () => {
    setCityFilter("");
    setRatingFilter(0);
    setSearchQuery("");
    setNearbyMode(false);
  };

  // Specialists sorted by distance for display (when location is known)
  const sortedFilteredSpecialists = useMemo(() => {
    if (!userLocation) return filteredSpecialists;
    return [...filteredSpecialists].sort((a, b) => {
      if (a.distance_km == null && b.distance_km == null) return 0;
      if (a.distance_km == null) return 1;
      if (b.distance_km == null) return -1;
      return a.distance_km - b.distance_km;
    });
  }, [filteredSpecialists, userLocation]);

  // Map center: user location or France center
  const mapCenter: [number, number] = userLocation
    ? [userLocation.lat, userLocation.lng]
    : [46.6, 2.2];

  const mappableSpecialists = sortedFilteredSpecialists.filter(
    (s) => s.latitude != null && s.longitude != null
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

  if (isError) {
    return (
      <MobileLayout>
        <div className="min-h-[60vh] flex flex-col items-center justify-center px-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mb-4">
            <AlertTriangle size={28} className="text-destructive" />
          </div>
          <h2 className="text-lg font-bold text-foreground mb-2">
            Impossible de charger les expertes
          </h2>
          <p className="text-sm text-muted-foreground mb-6">Vérifie ta connexion et réessaie.</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 rounded-xl bg-primary text-white font-semibold text-sm active:scale-95 transition-all"
          >
            Réessayer
          </button>
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

            {/* View toggle: list / map */}
            <div className="flex rounded-xl overflow-hidden border-2 border-white shadow-sm">
              <button
                onClick={() => handleViewModeChange("list")}
                className={`w-9 h-9 flex items-center justify-center transition-all ${
                  viewMode === "list" ? "bg-primary text-white" : "bg-background text-foreground"
                }`}
              >
                <List size={16} />
              </button>
              <button
                onClick={() => handleViewModeChange("map")}
                className={`w-9 h-9 flex items-center justify-center transition-all ${
                  viewMode === "map" ? "bg-primary text-white" : "bg-background text-foreground"
                }`}
              >
                <Map size={16} />
              </button>
            </div>

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
              <Search
                size={18}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher une spécialiste, ville..."
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

          {/* "Près de moi" button — list view only (map auto-activates it) */}
          {viewMode === "list" && (
            <div className="px-4 pt-3">
              <button
                onClick={nearbyMode ? () => setNearbyMode(false) : () => requestLocation()}
                disabled={geoLoading}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                  nearbyMode
                    ? "bg-primary text-white shadow-md shadow-primary/30"
                    : "bg-muted text-foreground hover:bg-muted/70"
                }`}
              >
                {geoLoading ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Navigation size={15} className={nearbyMode ? "fill-white" : ""} />
                )}
                {geoLoading ? "Localisation..." : nearbyMode ? "Près de moi (actif)" : "Près de moi"}
              </button>
              {geoError && (
                <p className="text-xs text-destructive mt-1.5 px-1">{geoError}</p>
              )}
            </div>
          )}

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
                          {opt.value > 0 && (
                            <Star size={9} className="inline mr-0.5 fill-current -mt-0.5" />
                          )}
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* City pills */}
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
          {(activeFiltersCount > 0 || searchQuery) && (
            <div className="px-4 pt-2 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {filteredSpecialists.length} résultat
                {filteredSpecialists.length !== 1 ? "s" : ""}
                {nearbyMode && userLocation && " à moins de 50 km"}
              </span>
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

        {/* MAP VIEW — always mounted to avoid leaflet context-consumer crash on unmount */}
        <div className={`px-4 ${viewMode !== "map" ? "hidden" : ""}`}>
          {/* Geo loading overlay — shown while waiting for location */}
          {geoLoading && (
            <div className="rounded-2xl bg-muted flex items-center justify-center gap-3 py-8 mb-3">
              <Loader2 size={20} className="animate-spin text-primary" />
              <span className="text-sm font-medium text-foreground">Localisation en cours...</span>
            </div>
          )}
          {geoError && viewMode === "map" && (
            <div className="rounded-2xl bg-destructive/10 px-4 py-3 mb-3 flex items-center gap-2">
              <span className="text-sm text-destructive">{geoError}</span>
              <button
                onClick={() => requestLocation()}
                className="ml-auto text-xs text-primary font-semibold underline"
              >
                Réessayer
              </button>
            </div>
          )}
          <div className="rounded-2xl overflow-hidden shadow-md border-2 border-white" style={{ height: "55vh" }}>
            <MapContainer
              center={userLocation ? [userLocation.lat, userLocation.lng] : [46.6, 2.2]}
              zoom={userLocation ? 11 : 6}
              style={{ height: "100%", width: "100%" }}
              scrollWheelZoom={false}
              zoomControl={false}
            >
              {/* Cartographie douce, en français */}
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                subdomains="abcd"
              />

              {/* Fit bounds to all markers, or to user location */}
              <MapFitBounds
                markers={mappableSpecialists.map((s) => [s.latitude!, s.longitude!] as [number, number])}
                userLocation={userLocation}
              />

              {/* User position */}
              {userLocation && (
                <Marker position={[userLocation.lat, userLocation.lng]} icon={USER_ICON}>
                  <Popup>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Ma position</span>
                  </Popup>
                </Marker>
              )}

              {/* Pro markers with automatic clustering */}
              <MarkerClusterGroup
                chunkedLoading
                maxClusterRadius={50}
                showCoverageOnHover={false}
              >
                {mappableSpecialists.map((s) => (
                  <Marker
                    key={s.id}
                    position={[s.latitude!, s.longitude!]}
                    icon={makeProIcon(s.user.first_name[0])}
                  >
                    <Popup minWidth={160} maxWidth={200}>
                      <div style={{ fontFamily: "sans-serif", padding: "2px 0" }}>
                        {s.profile_image_url && (
                          <img
                            src={s.profile_image_url}
                            alt={s.business_name}
                            style={{ width: "100%", height: 72, objectFit: "cover", borderRadius: 8, marginBottom: 6 }}
                          />
                        )}
                        <p style={{ fontWeight: 700, fontSize: 13, margin: "0 0 2px" }}>{s.business_name}</p>
                        {s.city && (
                          <p style={{ fontSize: 11, color: "#6b7280", margin: "0 0 3px" }}>📍 {s.city}</p>
                        )}
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
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
                            width: "100%", padding: "6px 0", borderRadius: 8,
                            background: "#E91E8C", color: "#fff",
                            border: "none", fontWeight: 700, fontSize: 12,
                            cursor: "pointer",
                          }}
                        >
                          Réserver
                        </button>
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </MarkerClusterGroup>
            </MapContainer>
          </div>

          {sortedFilteredSpecialists.length > mappableSpecialists.length && (
            <p className="text-xs text-muted-foreground text-center mt-2 px-2">
              {sortedFilteredSpecialists.length - mappableSpecialists.length} experte
              {sortedFilteredSpecialists.length - mappableSpecialists.length > 1 ? "s" : ""} sans
              coordonnées géographiques ne s'affiche
              {sortedFilteredSpecialists.length - mappableSpecialists.length > 1 ? "nt" : ""} pas sur la carte.
            </p>
          )}

          {sortedFilteredSpecialists.length === 0 && !geoLoading && (
            <div className="text-center py-10">
              <p className="text-sm font-semibold text-foreground mb-1">Aucune experte trouvée</p>
              <p className="text-xs text-muted-foreground">
                {effectiveNearby ? "Aucune experte à moins de 50 km de votre position." : "Aucune experte disponible pour le moment."}
              </p>
            </div>
          )}

          <div className="mt-4 space-y-3">
            {sortedFilteredSpecialists.map((s) => (
              <div
                key={s.id}
                onClick={() => navigate(`/client/specialist/${s.id}`)}
                className="flex items-center gap-3 bg-card rounded-2xl p-3 shadow-sm border-2 border-card cursor-pointer active:scale-[0.98] transition-transform"
              >
                <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 bg-muted">
                  {s.profile_image_url ? (
                    <img src={s.profile_image_url} alt={s.business_name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary to-primary/80">
                      <span className="text-white font-bold">{s.user.first_name[0]}</span>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-foreground truncate">{s.business_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{s.city}</p>
                  {s.distance_km != null && (
                    <p className="text-xs text-primary font-semibold">{s.distance_km} km</p>
                  )}
                </div>
                {s.rating > 0 && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Star size={12} className="fill-yellow-400 text-yellow-400" />
                    <span className="text-xs font-bold text-foreground">{s.rating.toFixed(1)}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* LIST VIEW */}
        <div className={`px-4 ${viewMode !== "list" ? "hidden" : ""}`}>
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
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />

                        <button
                          onClick={(e) => { e.stopPropagation(); toggleFavoriteMutation.mutate(specialist.id); }}
                          className={`absolute top-2 right-2 w-8 h-8 rounded-full backdrop-blur-md flex items-center justify-center transition-all z-10 ${
                            isFav ? "bg-primary shadow-lg scale-110" : "bg-black/30 hover:bg-black/50"
                          }`}
                        >
                          <Heart size={14} className={isFav ? "text-white fill-white" : "text-white"} />
                        </button>

                        {specialist.rating > 0 && (
                          <div className="absolute top-2 left-2 px-2 py-1 rounded-full bg-black/50 backdrop-blur-md flex items-center gap-1">
                            <Star size={11} className="fill-yellow-400 text-yellow-400" />
                            <span className="text-xs font-bold text-white">{specialist.rating.toFixed(1)}</span>
                          </div>
                        )}

                        {specialist.distance_km != null && (
                          <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full bg-primary/90 backdrop-blur-md flex items-center gap-1">
                            <Navigation size={9} className="text-white" />
                            <span className="text-[10px] font-bold text-white">{specialist.distance_km} km</span>
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
                  {nearbyMode
                    ? "Aucune experte à moins de 50 km. Essaie sans le filtre de proximité."
                    : searchQuery || cityFilter || ratingFilter > 0
                    ? "Essaie avec d'autres critères"
                    : "Aucune experte disponible pour le moment"}
                </p>
                {(searchQuery || cityFilter || ratingFilter > 0 || nearbyMode) && (
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
