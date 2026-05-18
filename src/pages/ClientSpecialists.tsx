import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Search, X, Star, MapPin, Navigation, List, Heart,
  Loader2, AlertTriangle, ChevronLeft, Check, Map, ChevronRight,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import MarkerClusterGroup from "@changey/react-leaflet-markercluster";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

import MobileLayout from "@/components/MobileLayout";
import { favoritesApi, specialistsApi } from "@/services/api";
import { getImageUrl } from "@/utils/imageUrl";

// ── Marqueurs carte ───────────────────────────────────────────────────────────

const BOUNCE_KF = `@keyframes mk-bounce{0%{transform:rotate(-45deg) scale(.6)}55%{transform:rotate(-45deg) scale(1.22)}78%{transform:rotate(-45deg) scale(.93)}100%{transform:rotate(-45deg) scale(1)}}`;

function makePreciseIcon(initial: string, selected = false): L.DivIcon {
  const s = selected ? 48 : 38;
  return L.divIcon({
    className: "",
    html: `${selected ? `<style>${BOUNCE_KF}</style>` : ""}
      <div style="
        width:${s}px;height:${s}px;border-radius:50% 50% 50% 0;
        background:${selected ? "#C2185B" : "#E91E8C"};
        border:${selected ? "3px" : "2px"} solid #fff;
        box-shadow:${selected
          ? "0 0 0 4px rgba(233,30,140,.22),0 6px 18px rgba(233,30,140,.55)"
          : "0 2px 10px rgba(233,30,140,.4)"};
        transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;
        ${selected ? "animation:mk-bounce .38s cubic-bezier(.36,.07,.19,.97) forwards;" : ""}
      "><span style="transform:rotate(45deg);color:#fff;font-weight:700;
        font-size:${selected ? 15 : 13}px;line-height:1;font-family:sans-serif;">
        ${initial.toUpperCase()}
      </span></div>`,
    iconSize: [s, s], iconAnchor: [s / 2, s],
  });
}

function makeCityIcon(initial: string, selected = false): L.DivIcon {
  const s = selected ? 48 : 38;
  return L.divIcon({
    className: "",
    html: `${selected ? `<style>${BOUNCE_KF}</style>` : ""}
      <div style="
        width:${s}px;height:${s}px;border-radius:50% 50% 50% 0;
        background:rgba(233,30,140,${selected ? ".2" : ".1"});
        border:${selected ? "3px" : "2px"} dashed #E91E8C;
        box-shadow:${selected
          ? "0 0 0 4px rgba(233,30,140,.12),0 4px 12px rgba(233,30,140,.3)"
          : "0 2px 8px rgba(233,30,140,.18)"};
        transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;
        ${selected ? "animation:mk-bounce .38s cubic-bezier(.36,.07,.19,.97) forwards;" : ""}
      "><span style="transform:rotate(45deg);color:#E91E8C;font-weight:700;
        font-size:${selected ? 15 : 13}px;line-height:1;font-family:sans-serif;">
        ${initial.toUpperCase()}
      </span></div>`,
    iconSize: [s, s], iconAnchor: [s / 2, s],
  });
}

const USER_ICON = L.divIcon({
  className: "",
  html: `<div style="position:relative;width:20px;height:20px;">
    <div style="position:absolute;inset:0;border-radius:50%;background:rgba(59,130,246,.25);animation:pulse-ring 1.8s ease-out infinite;"></div>
    <div style="position:absolute;inset:3px;border-radius:50%;background:#3b82f6;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3);"></div>
  </div>
  <style>@keyframes pulse-ring{0%{transform:scale(.8);opacity:.9}100%{transform:scale(2.2);opacity:0}}</style>`,
  iconSize: [20, 20], iconAnchor: [10, 10],
});

// ── Types ─────────────────────────────────────────────────────────────────────

interface Specialist {
  id: number; business_name: string; specialty: string; city: string;
  rating: number; reviews_count: number;
  profile_image_url: string | null; cover_image_url: string | null;
  user: { first_name: string; last_name: string };
  latitude: number | null; longitude: number | null;
  geo_precision: "address" | "city"; distance_km: number | null;
}
interface UserLocation { lat: number; lng: number }

const SERVICE_CHIPS = [
  { label: "Gel", query: "gel" },
  { label: "Manucure", query: "manucure" },
  { label: "French", query: "french" },
  { label: "Nail art", query: "nail art" },
  { label: "Semi-perm.", query: "semi-permanent" },
  { label: "Baby boomer", query: "baby boomer" },
];
const RATING_OPTIONS = [{ label: "4+", value: 4 }, { label: "4.5+", value: 4.5 }];

// ── Helpers MapContainer ──────────────────────────────────────────────────────

const MapResizer = ({ active }: { active: boolean }) => {
  const map = useMap();
  useEffect(() => {
    if (!active) return;
    const raf = requestAnimationFrame(() => map.invalidateSize(false));
    return () => cancelAnimationFrame(raf);
  }, [active, map]);
  return null;
};

const MapRefCapture = ({ mapRef }: { mapRef: React.MutableRefObject<L.Map | null> }) => {
  const map = useMap();
  useEffect(() => { mapRef.current = map; }, [map, mapRef]);
  return null;
};

const MapFitBounds = ({ markers, userLocation, active }: {
  markers: [number, number][]; userLocation: UserLocation | null; active: boolean;
}) => {
  const map = useMap();
  const prevKey = useRef("");
  useEffect(() => {
    if (!active) return;
    const key = markers.map((m) => m.join(",")).join("|");
    if (key === prevKey.current) return;
    prevKey.current = key;
    const t = setTimeout(() => {
      if (markers.length >= 2)       map.fitBounds(L.latLngBounds(markers), { padding: [60, 60], maxZoom: 13 });
      else if (markers.length === 1) map.setView(markers[0], 13);
      else if (userLocation)         map.setView([userLocation.lat, userLocation.lng], 10);
    }, 120);
    return () => clearTimeout(t);
  }, [markers, userLocation, active, map]);
  return null;
};

const MapTapBackground = ({ onTap }: { onTap: () => void }) => {
  const map = useMap();
  useEffect(() => { map.on("click", onTap); return () => { map.off("click", onTap); }; }, [map, onTap]);
  return null;
};

function useDebounce<T>(value: T, delay: number): T {
  const [d, setD] = useState(value);
  useEffect(() => { const t = setTimeout(() => setD(value), delay); return () => clearTimeout(t); }, [value, delay]);
  return d;
}

// ── Chip helper ───────────────────────────────────────────────────────────────

function chip(active: boolean, compact = false) {
  const base = compact
    ? "flex-shrink-0 flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium transition-colors whitespace-nowrap"
    : "flex-shrink-0 flex items-center gap-1.5 h-9 px-4 rounded-full text-[13px] font-medium transition-colors whitespace-nowrap";
  return `${base} ${active ? "bg-primary text-white" : "bg-muted text-foreground"}`;
}

// ═════════════════════════════════════════════════════════════════════════════

const ClientSpecialists = () => {
  const navigate    = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  const [searchInput,   setSearchInput]   = useState(searchParams.get("search") ?? "");
  const debouncedSearch                   = useDebounce(searchInput, 350);
  const [cityFilter,    setCityFilter]    = useState(searchParams.get("city") ?? "");
  const [serviceFilter, setServiceFilter] = useState(searchParams.get("service") ?? "");
  const [ratingFilter,  setRatingFilter]  = useState(0);
  const [showCityPanel, setShowCityPanel] = useState(false);

  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [selectedMarkerId, setSelectedMarkerId] = useState<number | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [geoLoading,   setGeoLoading]   = useState(false);
  const [geoError,     setGeoError]     = useState<string | null>(null);
  const [nearbyMode,   setNearbyMode]   = useState(false);

  const requestLocation = useCallback((onSuccess?: () => void, enableNearby = true) => {
    if (!navigator.geolocation) { setGeoError("Géolocalisation non disponible."); return; }
    setGeoLoading(true); setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        if (enableNearby) setNearbyMode(true);
        setGeoLoading(false); onSuccess?.();
      },
      () => { setGeoError("Position indisponible. Vérifie tes autorisations."); setGeoLoading(false); },
      { timeout: 8000, maximumAge: 300_000 }
    );
  }, []);

  const centerOnMe = useCallback(() => {
    if (userLocation && mapRef.current) {
      mapRef.current.flyTo([userLocation.lat, userLocation.lng], 13, { duration: 0.8 });
    } else {
      requestLocation(undefined, false);
    }
  }, [userLocation, requestLocation]);

  useEffect(() => {
    if (userLocation && mapRef.current && viewMode === "map") {
      mapRef.current.flyTo([userLocation.lat, userLocation.lng], 13, { duration: 0.8 });
    }
  }, [userLocation, viewMode]);

  const handleViewModeChange = useCallback((mode: "list" | "map") => {
    setViewMode(mode);
    if (mode === "list") setSelectedMarkerId(null);
    if (mode === "map" && !userLocation && !geoLoading) requestLocation(undefined, false);
  }, [userLocation, geoLoading, requestLocation]);

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data: specialists = [], isLoading, isError, isFetching } = useQuery<Specialist[]>({
    queryKey: ["specialists", debouncedSearch, cityFilter, serviceFilter, ratingFilter,
               userLocation?.lat, userLocation?.lng, nearbyMode],
    queryFn: async () => {
      const res = await specialistsApi.getPros({
        limit: 100,
        ...(debouncedSearch  ? { search: debouncedSearch } : {}),
        ...(cityFilter        ? { city: cityFilter }        : {}),
        ...(serviceFilter     ? { service: serviceFilter }  : {}),
        ...(ratingFilter > 0  ? { min_rating: ratingFilter }: {}),
        ...(userLocation      ? { lat: userLocation.lat, lng: userLocation.lng } : {}),
        ...(nearbyMode        ? { nearby: true, radius: 50 }: {}),
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
        cover_image_url:   getImageUrl(pro.banner_photo),
        user: { first_name: pro.first_name, last_name: pro.last_name },
        latitude:  pro.latitude  != null ? Number(pro.latitude)  : null,
        longitude: pro.longitude != null ? Number(pro.longitude) : null,
        geo_precision: (pro.geo_precision as "address" | "city") ?? "city",
        distance_km: pro.distance_km ?? null,
      }));
    },
    staleTime: 2 * 60_000,
    placeholderData: (prev) => prev,
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

  const toggleFav = useMutation({
    mutationFn: async (proId: number) => {
      if (favoriteIds.has(proId)) await favoritesApi.remove(proId);
      else await favoritesApi.add(proId);
    },
    onMutate: async (proId: number) => {
      await queryClient.cancelQueries({ queryKey: ["favorites-ids"] });
      const prev = queryClient.getQueryData<Set<number>>(["favorites-ids"]);
      queryClient.setQueryData<Set<number>>(["favorites-ids"], (old = new Set()) => {
        const next = new Set(old); next.has(proId) ? next.delete(proId) : next.add(proId); return next;
      });
      return { prev };
    },
    onError: (_e: unknown, _id: number, ctx: any) => {
      if (ctx?.prev) queryClient.setQueryData(["favorites-ids"], ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["favorites-ids"] });
      queryClient.invalidateQueries({ queryKey: ["favorites"] });
    },
  });

  // ── Derived ───────────────────────────────────────────────────────────────
  const uniqueCities = useMemo(() =>
    [...new Set(specialists.map((s) => s.city).filter(Boolean))].sort(), [specialists]);

  const displaySpecialists = useMemo(() => {
    if (!userLocation) return specialists;
    return [...specialists].sort((a, b) => {
      if (a.distance_km == null && b.distance_km == null) return 0;
      if (a.distance_km == null) return 1; if (b.distance_km == null) return -1;
      return a.distance_km - b.distance_km;
    });
  }, [specialists, userLocation]);

  const mappableSpecialists = useMemo(
    () => displaySpecialists.filter((s) => s.latitude != null && s.longitude != null),
    [displaySpecialists]
  );

  const selectedSpecialist = useMemo(
    () => selectedMarkerId != null ? mappableSpecialists.find((s) => s.id === selectedMarkerId) ?? null : null,
    [selectedMarkerId, mappableSpecialists]
  );

  const activeFiltersCount = (cityFilter ? 1 : 0) + (serviceFilter ? 1 : 0) + (ratingFilter > 0 ? 1 : 0) + (nearbyMode ? 1 : 0);
  const hasActiveFilters   = !!(searchInput || cityFilter || serviceFilter || ratingFilter > 0 || nearbyMode);
  const clearAll = () => { setSearchInput(""); setCityFilter(""); setServiceFilter(""); setRatingFilter(0); setNearbyMode(false); };

  // Handlers communs chips
  const handleNearby    = () => nearbyMode ? setNearbyMode(false) : requestLocation();
  const handleRating    = (v: number) => setRatingFilter(ratingFilter === v ? 0 : v);
  const handleCityPanel = () => setShowCityPanel((p) => !p);
  const handleCity      = (c: string) => { setCityFilter(c === cityFilter ? "" : c); setShowCityPanel(false); };
  const handleService   = (s: string) => setServiceFilter(serviceFilter === s ? "" : s);

  // ── Loading / Error ───────────────────────────────────────────────────────
  if (isLoading) return (
    <MobileLayout>
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Chargement des expertes…</p>
        </div>
      </div>
    </MobileLayout>
  );

  if (isError) return (
    <MobileLayout>
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-6 text-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center">
          <AlertTriangle size={28} className="text-destructive" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-foreground mb-1">Erreur de chargement</h2>
          <p className="text-sm text-muted-foreground">Vérifie ta connexion et réessaie.</p>
        </div>
        <button onClick={() => window.location.reload()}
          className="px-6 py-3 rounded-2xl bg-primary text-white font-semibold text-sm">
          Réessayer
        </button>
      </div>
    </MobileLayout>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <>
      {/* ── Carte — toujours montée, cachée en mode liste ─────────────────── */}
      <div
        className="fixed inset-0 z-[40]"
        aria-hidden={viewMode !== "map"}
        style={{
          opacity:       viewMode === "map" ? 1 : 0,
          visibility:    viewMode === "map" ? "visible" : "hidden",
          pointerEvents: viewMode === "map" ? "auto" : "none",
          transition:    "opacity .25s ease, visibility .25s ease",
        }}
      >
        <motion.div
          className="w-full h-full"
          animate={{ scale: selectedSpecialist ? 0.984 : 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 26 }}
        >
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
            <MapResizer active={viewMode === "map"} />
            <MapRefCapture mapRef={mapRef} />
            <MapFitBounds
              markers={mappableSpecialists.map((s) => [s.latitude!, s.longitude!])}
              userLocation={userLocation}
              active={viewMode === "map"}
            />
            <MapTapBackground onTap={() => setSelectedMarkerId(null)} />
            {userLocation && <Marker position={[userLocation.lat, userLocation.lng]} icon={USER_ICON} />}
            <MarkerClusterGroup chunkedLoading maxClusterRadius={50} showCoverageOnHover={false}>
              {mappableSpecialists.map((s) => {
                const sel = selectedMarkerId === s.id;
                return (
                  <Marker
                    key={s.id}
                    position={[s.latitude!, s.longitude!]}
                    icon={s.geo_precision === "address"
                      ? makePreciseIcon(s.user.first_name[0], sel)
                      : makeCityIcon(s.user.first_name[0], sel)}
                    zIndexOffset={sel ? 1000 : 0}
                    eventHandlers={{
                      click: () => {
                        const next = sel ? null : s.id;
                        setSelectedMarkerId(next);
                        if (next != null && mapRef.current) {
                          mapRef.current.flyTo(
                            [s.latitude!, s.longitude!],
                            Math.max(mapRef.current.getZoom(), 13),
                            { duration: 0.6 }
                          );
                        }
                      },
                    }}
                  />
                );
              })}
            </MarkerClusterGroup>
          </MapContainer>
        </motion.div>
      </div>

      {/* ── Dim overlay quand une fiche est ouverte ───────────────────────── */}
      <AnimatePresence>
        {viewMode === "map" && selectedSpecialist && (
          <motion.div
            className="fixed inset-0 z-[45] pointer-events-none"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            style={{ background: "rgba(0,0,0,.10)" }}
          />
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════════════════════════
          OVERLAYS MODE CARTE
      ══════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {viewMode === "map" && (
          <motion.div
            key="map-overlays"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* ── Header flottant ────────────────────────────────────────── */}
            <div
              className="fixed left-0 right-0 z-[60] flex justify-center"
              style={{ top: "calc(env(safe-area-inset-top, 0px) + 10px)" }}
            >
              <div className="w-full max-w-[600px] px-4">
                <div
                  className="rounded-2xl overflow-hidden"
                  style={{
                    background: "rgba(255,255,255,.94)",
                    backdropFilter: "blur(20px)",
                    WebkitBackdropFilter: "blur(20px)",
                    boxShadow: "0 4px 24px rgba(0,0,0,.12),0 1px 4px rgba(0,0,0,.06)",
                  }}
                >
                  {/* Ligne titre — même structure que la vue liste */}
                  <div className="flex items-center gap-2.5 px-3 pt-3 pb-2">
                    <button
                      onClick={() => handleViewModeChange("list")}
                      className="w-9 h-9 rounded-2xl bg-black/[.06] flex items-center justify-center flex-shrink-0 active:bg-black/10 transition-colors"
                    >
                      <ChevronLeft size={19} className="text-foreground" />
                    </button>
                    <div className="flex-1 min-w-0">
                      <h1 className="text-[16px] font-bold text-foreground leading-tight">Expertes ongulaires</h1>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {isFetching
                          ? "Recherche en cours…"
                          : `${mappableSpecialists.length} experte${mappableSpecialists.length > 1 ? "s" : ""} sur la carte`}
                      </p>
                    </div>
                    <button
                      onClick={() => handleViewModeChange("list")}
                      className="w-9 h-9 rounded-2xl bg-black/[.06] flex items-center justify-center flex-shrink-0 active:bg-black/10 transition-colors"
                      aria-label="Vue liste"
                    >
                      <List size={16} className="text-foreground" />
                    </button>
                  </div>

                  {/* Barre de recherche */}
                  <div className="px-3 pb-2">
                    <div className="relative">
                      {isFetching
                        ? <Loader2 size={13} className="absolute left-3 top-1/2 -translate-y-1/2 animate-spin text-primary pointer-events-none" />
                        : <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />}
                      <input
                        type="text" value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
                        placeholder="Nom, spécialité, ville…"
                        className="w-full h-9 pl-8 pr-7 rounded-xl bg-black/[.06] text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:bg-black/[.09] transition-colors"
                      />
                      {searchInput && (
                        <button onClick={() => setSearchInput("")}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-black/[.10] flex items-center justify-center">
                          <X size={10} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Chips compacts */}
                  <div className="overflow-x-auto flex gap-1.5 px-3 pb-3 scrollbar-hide">
                    <button onClick={handleNearby} disabled={geoLoading} className={chip(nearbyMode, true)}>
                      {geoLoading ? <Loader2 size={10} className="animate-spin" /> : <Navigation size={10} className={nearbyMode ? "fill-white" : ""} />}
                      Près de moi
                    </button>
                    {RATING_OPTIONS.map((opt) => (
                      <button key={opt.value} onClick={() => handleRating(opt.value)} className={chip(ratingFilter === opt.value, true)}>
                        <Star size={9} className={ratingFilter === opt.value ? "fill-white" : "fill-yellow-400 text-yellow-400"} />
                        {opt.label}
                      </button>
                    ))}
                    <button onClick={handleCityPanel} className={chip(!!cityFilter, true)}>
                      <MapPin size={10} />{cityFilter || "Ville"}
                    </button>
                    {SERVICE_CHIPS.map((c) => (
                      <button key={c.query} onClick={() => handleService(c.query)} className={chip(serviceFilter === c.query, true)}>
                        {serviceFilter === c.query && <Check size={9} />}{c.label}
                      </button>
                    ))}
                  </div>

                  {hasActiveFilters && (
                    <div className="px-3 pb-2.5 border-t border-black/[.05] pt-2 flex items-center justify-between">
                      <p className="text-[10px] text-muted-foreground">{nearbyMode ? "Rayon 50 km" : `${activeFiltersCount} filtre${activeFiltersCount > 1 ? "s" : ""}`}</p>
                      <button onClick={clearAll} className="text-[10px] text-primary font-semibold flex items-center gap-0.5">
                        <X size={8} /> Effacer
                      </button>
                    </div>
                  )}
                  {geoError && <p className="px-3 pb-2 text-[11px] text-destructive">{geoError}</p>}
                </div>
              </div>
            </div>

            {/* ── FAB centrer ─────────────────────────────────────────────── */}
            <motion.button
              onClick={centerOnMe}
              disabled={geoLoading}
              className="fixed right-4 z-[60] w-11 h-11 rounded-full bg-white flex items-center justify-center active:scale-90 transition-transform"
              style={{ bottom: 88, boxShadow: "0 2px 14px rgba(0,0,0,.18)" }}
              animate={{ y: selectedSpecialist ? -175 : 0 }}
              transition={{ type: "spring", stiffness: 340, damping: 28 }}
              aria-label="Centrer sur ma position"
            >
              {geoLoading
                ? <Loader2 size={18} className="animate-spin text-primary" />
                : <Navigation size={18} className={userLocation ? "text-primary" : "text-muted-foreground"} />}
            </motion.button>

            {/* ── Légende ─────────────────────────────────────────────────── */}
            <AnimatePresence>
              {!selectedSpecialist && (
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="fixed left-4 z-[60] bg-white/90 backdrop-blur-md rounded-xl px-3 py-2 text-[11px] flex flex-col gap-1"
                  style={{ bottom: 88, boxShadow: "0 2px 10px rgba(0,0,0,.1)" }}
                >
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-primary border border-white shadow-sm" />
                    <span className="text-foreground font-medium">Adresse précise</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full border-2 border-dashed border-primary bg-primary/10" />
                    <span className="text-muted-foreground">Ville uniquement</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Hint ────────────────────────────────────────────────────── */}
            <AnimatePresence>
              {!selectedSpecialist && mappableSpecialists.length > 0 && (
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.9 } }}
                  exit={{ opacity: 0, transition: { duration: 0.15 } }}
                  className="fixed z-[60] pointer-events-none"
                  style={{ bottom: 100, left: "50%", transform: "translateX(-50%)" }}
                >
                  <div className="bg-black/38 backdrop-blur-sm rounded-full px-3 py-1.5 whitespace-nowrap">
                    <span className="text-[10px] font-medium text-white">Appuie sur un marqueur</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── État vide ────────────────────────────────────────────────── */}
            {!isFetching && mappableSpecialists.length === 0 && (
              <div className="fixed inset-0 z-[55] flex items-center justify-center pointer-events-none">
                <div className="bg-white/96 backdrop-blur-md rounded-2xl px-5 py-5 shadow-2xl text-center max-w-[220px] pointer-events-auto mx-4">
                  <MapPin size={26} className="text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm font-bold text-foreground mb-1">Aucune experte</p>
                  <p className="text-xs text-muted-foreground mb-3">
                    {nearbyMode ? "Aucune experte dans ce périmètre." : "Modifie tes critères."}
                  </p>
                  {hasActiveFilters && (
                    <button onClick={clearAll} className="text-xs font-semibold text-primary">Effacer les filtres</button>
                  )}
                </div>
              </div>
            )}

            {/* ── Fiche sélectionnée ───────────────────────────────────────── */}
            <AnimatePresence>
              {selectedSpecialist && (
                <motion.div
                  key={selectedSpecialist.id}
                  className="fixed left-0 right-0 z-[60] flex justify-center"
                  style={{ bottom: 80 }}
                  initial={{ y: 130, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 130, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                >
                  <div className="w-full max-w-[600px] px-4">
                    <div className="bg-card rounded-2xl overflow-hidden relative"
                      style={{ boxShadow: "0 8px 32px rgba(0,0,0,.18),0 2px 8px rgba(0,0,0,.08)" }}>
                      <button onClick={() => setSelectedMarkerId(null)}
                        className="absolute top-3 right-3 z-10 w-7 h-7 rounded-full bg-black/20 backdrop-blur-sm flex items-center justify-center active:scale-90 transition-transform"
                        aria-label="Fermer">
                        <X size={13} className="text-white" />
                      </button>
                      <div className="flex cursor-pointer active:bg-muted/20 transition-colors"
                        onClick={() => navigate(`/client/specialist/${selectedSpecialist.id}`)}>
                        <div className="relative w-28 flex-shrink-0 bg-muted" style={{ minHeight: 115 }}>
                          {(selectedSpecialist.cover_image_url || selectedSpecialist.profile_image_url) ? (
                            <img
                              src={selectedSpecialist.cover_image_url ?? selectedSpecialist.profile_image_url!}
                              alt={selectedSpecialist.business_name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 via-primary/10 to-transparent">
                              <span className="text-3xl font-bold text-primary/30">{selectedSpecialist.user.first_name[0]}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex-1 p-4 flex flex-col justify-between">
                          <div>
                            <h3 className="font-semibold text-[15px] text-foreground leading-snug line-clamp-1 pr-6">{selectedSpecialist.business_name}</h3>
                            <p className="text-[12px] text-primary font-medium mt-0.5 line-clamp-1">{selectedSpecialist.specialty}</p>
                            {selectedSpecialist.rating > 0 && (
                              <div className="flex items-center gap-1 mt-1.5">
                                <Star size={11} className="fill-amber-400 text-amber-400 flex-shrink-0" />
                                <span className="text-[12px] font-semibold text-foreground">{selectedSpecialist.rating.toFixed(1)}</span>
                                {selectedSpecialist.reviews_count > 0 && (
                                  <span className="text-[11px] text-muted-foreground">({selectedSpecialist.reviews_count})</span>
                                )}
                              </div>
                            )}
                            <div className="flex items-center gap-1 mt-1">
                              <MapPin size={11} className="text-muted-foreground flex-shrink-0" />
                              <span className="text-[12px] text-muted-foreground truncate">{selectedSpecialist.city}</span>
                              {selectedSpecialist.distance_km != null && (
                                <span className="ml-auto text-[12px] font-semibold text-primary whitespace-nowrap">{selectedSpecialist.distance_km} km</span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); navigate(`/client/specialist/${selectedSpecialist.id}`); }}
                            className="mt-3 w-full h-9 rounded-xl bg-primary text-white text-[13px] font-semibold flex items-center justify-center active:scale-[.97] transition-transform"
                          >
                            Voir le profil & réserver
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════════════════════════
          VUE LISTE
      ══════════════════════════════════════════════════════════════════════ */}
      <MobileLayout hideNav={viewMode === "map"}>
        {viewMode === "list" && (
          <div className="pb-28">

            {/* ── Top bar ────────────────────────────────────────────────── */}
            <div className="flex items-center gap-3 pt-3 pb-5">
              <button
                onClick={() => window.history.length > 1 ? navigate(-1) : navigate("/client")}
                className="w-10 h-10 rounded-2xl bg-muted flex items-center justify-center flex-shrink-0 active:bg-muted/70 transition-colors"
              >
                <ChevronLeft size={20} className="text-foreground" />
              </button>
              <div className="flex-1 min-w-0">
                <h1 className="text-[18px] font-bold text-foreground leading-tight">Expertes ongulaires</h1>
                <p className="text-[12px] text-muted-foreground mt-0.5">
                  {isFetching
                    ? "Recherche en cours…"
                    : `${displaySpecialists.length} experte${displaySpecialists.length > 1 ? "s" : ""} trouvée${displaySpecialists.length > 1 ? "s" : ""}`
                  }
                </p>
              </div>
              <button
                onClick={() => handleViewModeChange("map")}
                className="w-10 h-10 rounded-2xl bg-muted flex items-center justify-center flex-shrink-0 active:bg-muted/70 transition-colors"
                aria-label="Vue carte"
              >
                <Map size={18} className="text-foreground" />
              </button>
            </div>

            {/* ── Barre de recherche ─────────────────────────────────────── */}
            <div className="relative mb-4">
              {isFetching
                ? <Loader2 size={16} className="absolute left-4 top-1/2 -translate-y-1/2 animate-spin text-primary pointer-events-none" />
                : <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              }
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Nom, spécialité, ville…"
                className="w-full h-12 pl-11 pr-10 rounded-2xl bg-muted text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition"
              />
              {searchInput && (
                <button
                  onClick={() => setSearchInput("")}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-foreground/10 flex items-center justify-center"
                >
                  <X size={12} className="text-foreground" />
                </button>
              )}
            </div>

            {/* ── Filtres ────────────────────────────────────────────────── */}
            <div className="overflow-x-auto flex gap-2 scrollbar-hide pb-0.5">
              <button onClick={handleNearby} disabled={geoLoading} className={chip(nearbyMode)}>
                {geoLoading
                  ? <Loader2 size={13} className="animate-spin" />
                  : <Navigation size={13} className={nearbyMode ? "fill-white" : ""} />}
                Près de moi
              </button>
              {RATING_OPTIONS.map((opt) => (
                <button key={opt.value} onClick={() => handleRating(opt.value)} className={chip(ratingFilter === opt.value)}>
                  <Star size={12} className={ratingFilter === opt.value ? "fill-white" : "fill-amber-400 text-amber-400"} />
                  {opt.label}
                </button>
              ))}
              <button onClick={handleCityPanel} className={chip(!!cityFilter)}>
                <MapPin size={13} />
                {cityFilter || "Ville"}
              </button>
              {SERVICE_CHIPS.map((c) => (
                <button key={c.query} onClick={() => handleService(c.query)} className={chip(serviceFilter === c.query)}>
                  {serviceFilter === c.query && <Check size={12} />}
                  {c.label}
                </button>
              ))}
            </div>

            {/* Panneau villes */}
            <AnimatePresence>
              {showCityPanel && uniqueCities.length > 0 && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }}
                  className="overflow-hidden"
                >
                  <div className="pt-3 flex flex-wrap gap-2">
                    {["", ...uniqueCities].map((city) => (
                      <button
                        key={city || "__all"}
                        onClick={() => handleCity(city)}
                        className={chip(!city ? !cityFilter : cityFilter === city)}
                      >
                        {city || "Toutes les villes"}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Filtres actifs */}
            {hasActiveFilters && (
              <div className="flex items-center justify-between mt-3">
                <p className="text-[12px] text-muted-foreground">
                  {nearbyMode ? "Rayon 50 km" : `${activeFiltersCount} filtre${activeFiltersCount > 1 ? "s" : ""} actif${activeFiltersCount > 1 ? "s" : ""}`}
                </p>
                <button onClick={clearAll} className="text-[12px] text-primary font-semibold flex items-center gap-1">
                  <X size={10} /> Tout effacer
                </button>
              </div>
            )}
            {geoError && <p className="mt-2 text-[12px] text-destructive">{geoError}</p>}

            {/* ── CTA Carte ──────────────────────────────────────────────── */}
            <AnimatePresence>
              {mappableSpecialists.length > 0 && (
                <motion.button
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18, delay: 0.08 }}
                  onClick={() => handleViewModeChange("map")}
                  className="mt-4 w-full flex items-center gap-3 px-4 py-3 rounded-2xl border border-primary/20 bg-primary/[.06] active:bg-primary/10 transition-colors"
                >
                  <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center flex-shrink-0">
                    <MapPin size={15} className="text-white" />
                  </div>
                  <span className="text-[13px] font-semibold text-foreground flex-1 text-left">
                    {mappableSpecialists.length} experte{mappableSpecialists.length > 1 ? "s" : ""} sur la carte
                  </span>
                  <ChevronRight size={16} className="text-primary flex-shrink-0" />
                </motion.button>
              )}
            </AnimatePresence>

            {/* ── Liste des spécialistes ─────────────────────────────────── */}
            <div className={`mt-5 transition-opacity duration-200 ${
              isFetching && displaySpecialists.length > 0 ? "opacity-50 pointer-events-none" : "opacity-100"
            }`}>
              {displaySpecialists.length > 0 ? (
                <div className="space-y-3">
                  {displaySpecialists.map((s, index) => {
                    const isFav = favoriteIds.has(s.id);
                    const photo = s.cover_image_url ?? s.profile_image_url;
                    return (
                      <motion.div
                        key={s.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.18, delay: Math.min(index * 0.04, 0.28) }}
                        whileTap={{ scale: 0.985 }}
                        onClick={() => navigate(`/client/specialist/${s.id}`)}
                        className="flex bg-card rounded-2xl overflow-hidden cursor-pointer border border-border/40"
                        style={{ boxShadow: "0 1px 6px rgba(0,0,0,.05)" }}
                      >
                        {/* Photo */}
                        <div className="relative w-[108px] flex-shrink-0 bg-muted self-stretch">
                          {photo ? (
                            <img src={photo} alt={s.business_name} className="w-full h-full object-cover absolute inset-0" />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/15 via-primary/8 to-transparent">
                              <span className="text-3xl font-bold text-primary/25">{s.user.first_name[0]}</span>
                            </div>
                          )}
                          {/* Favori */}
                          <motion.button
                            whileTap={{ scale: 0.8 }}
                            onClick={(e) => { e.stopPropagation(); toggleFav.mutate(s.id); }}
                            className={`absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center backdrop-blur-sm transition-colors ${
                              isFav ? "bg-primary/90" : "bg-black/25"
                            }`}
                          >
                            <Heart size={12} className={isFav ? "fill-white text-white" : "text-white"} />
                          </motion.button>
                        </div>

                        {/* Infos */}
                        <div className="flex-1 p-4 flex flex-col min-h-[130px]">
                          <div className="flex-1">
                            <h3 className="text-[15px] font-semibold text-foreground leading-tight line-clamp-1">
                              {s.business_name}
                            </h3>
                            <p className="text-[12px] text-primary font-medium mt-0.5 line-clamp-1">{s.specialty}</p>

                            {/* Note */}
                            {s.rating > 0 && (
                              <div className="flex items-center gap-1 mt-2">
                                <Star size={11} className="fill-amber-400 text-amber-400 flex-shrink-0" />
                                <span className="text-[12px] font-semibold text-foreground">{s.rating.toFixed(1)}</span>
                                {s.reviews_count > 0 && (
                                  <span className="text-[11px] text-muted-foreground ml-0.5">· {s.reviews_count} avis</span>
                                )}
                              </div>
                            )}

                            {/* Ville + distance */}
                            <div className="flex items-center gap-1 mt-1.5">
                              <MapPin size={11} className="text-muted-foreground flex-shrink-0" />
                              <span className="text-[12px] text-muted-foreground truncate">{s.city}</span>
                              {s.distance_km != null && (
                                <span className="ml-auto text-[12px] font-semibold text-primary whitespace-nowrap flex-shrink-0">
                                  {s.distance_km} km
                                </span>
                              )}
                            </div>
                          </div>

                          <button
                            onClick={(e) => { e.stopPropagation(); navigate(`/client/specialist/${s.id}`); }}
                            className="mt-3 w-full h-9 rounded-xl bg-primary text-white text-[13px] font-semibold active:scale-[.97] transition-transform"
                          >
                            Réserver
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              ) : (
                !isFetching && (
                  <motion.div className="text-center py-16" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                      <Search size={24} className="text-muted-foreground" />
                    </div>
                    <h3 className="text-[16px] font-bold text-foreground mb-1.5">Aucun résultat</h3>
                    <p className="text-[13px] text-muted-foreground mb-6 max-w-[240px] mx-auto leading-relaxed">
                      {nearbyMode
                        ? "Aucune experte dans un rayon de 50 km."
                        : hasActiveFilters
                        ? "Aucune experte ne correspond à ces critères."
                        : "Aucune experte disponible pour le moment."}
                    </p>
                    {hasActiveFilters && (
                      <button onClick={clearAll}
                        className="px-6 h-11 rounded-2xl bg-primary text-white font-semibold text-[14px]">
                        Voir toutes les expertes
                      </button>
                    )}
                  </motion.div>
                )
              )}
            </div>

            {/* Skeletons au premier chargement */}
            {isFetching && displaySpecialists.length === 0 && (
              <div className="mt-5 space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="flex bg-card rounded-2xl overflow-hidden border border-border/40 animate-pulse" style={{ minHeight: 130 }}>
                    <div className="w-[108px] bg-muted flex-shrink-0" />
                    <div className="flex-1 p-4 space-y-2.5">
                      <div className="h-4 bg-muted rounded-lg w-3/4" />
                      <div className="h-3 bg-muted rounded-lg w-1/2" />
                      <div className="h-3 bg-muted rounded-lg w-2/3" />
                      <div className="h-9 bg-muted rounded-xl w-full mt-auto" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Placeholder hauteur en mode carte */}
        {viewMode === "map" && <div style={{ height: "100dvh" }} />}
      </MobileLayout>
    </>
  );
};

export default ClientSpecialists;
