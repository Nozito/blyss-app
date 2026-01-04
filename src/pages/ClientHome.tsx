import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin, Star, ChevronRight, Search, Calendar } from "lucide-react";
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
    ? `Salut ${user.first_name} 👋`
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
    <div
      className="
        relative
        min-h-[100dvh]
        w-full
        bg-background
        text-foreground
      "
      style={{
        paddingTop: "calc(14px + env(safe-area-inset-top, 0px))",
        paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))"
      }}
    >
      <div className="motion-safe:animate-[fadeIn_0.5s_ease-out] space-y-5">
        {/* HERO Blyss */}
        <header className="flex flex-col items-center text-center space-y-1 px-4 motion-safe:animate-[fadeInUp_0.6s_ease-out]">
          <img
            src={logo}
            alt="Blyss"
            className="w-28 h-28 object-contain"
          />
          <div className="space-y-0.5">
            <p className="text-xs text-foreground/80">{greeting}</p>
            <p className="text-sm font-semibold text-foreground">Tes nails, sans prise de tête.</p>
            <p className="text-[11px] text-foreground/70">Trouve une experte près de chez toi.</p>
          </div>
        </header>

        {/* RECHERCHE */}
        <section className="space-y-2 px-4">
          <div className="sticky top-[calc(14px+env(safe-area-inset-top))] z-20 flex items-center bg-white rounded-2xl border border-black/10 px-3 transition-shadow focus-within:shadow-md focus-within:border-primary/40 motion-safe:transition-all motion-safe:duration-300 hover:shadow-md backdrop-blur-xl bg-white/80 supports-[backdrop-filter]:bg-white/60">
            <Search
              size={18}
              className="text-foreground/50 mr-2 flex-shrink-0"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher une experte, une prestation, un quartier..."
              className="
                w-full py-3 bg-transparent text-sm text-foreground
                placeholder:text-foreground/40
                focus:outline-none
                transition-shadow
              "
              onFocus={() => navigator.vibrate?.(5)}
            />
            {searchQuery.length > 0 && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="ml-2 text-foreground/40 hover:text-foreground transition-transform duration-200 active:scale-90"
                aria-label="Effacer la recherche"
              >
                ×
              </button>
            )}
          </div>
          <p className="text-[11px] text-foreground/70">
            Ex. : "pose gel République", "Emma", "manucure Paris 11".
          </p>
        </section>

        {/* SÉLECTION BLYSS */}
        <section className="space-y-3 mb-4">
          {/* Header pleine largeur */}
          <div className="flex items-center justify-between gap-2 px-4">
            <div className="flex flex-1 min-w-0 flex-col gap-0.5">
              <h2 className="text-sm font-semibold text-foreground truncate">
                Sélection Blyss
              </h2>
              <p className="text-[11px] text-foreground/75 leading-snug line-clamp-2">
                Une sélection d&apos;expertes nails bien notées, proche de toi.
              </p>
            </div>

            <button
              type="button"
              onClick={() => { navigator.vibrate?.(10); navigate("/client/specialists"); }}
              className="flex-shrink-0 text-[11px] px-3 py-1 rounded-full border border-primary text-primary font-medium active:scale-[0.98] transition"
            >
              Tout voir
            </button>
          </div>

          {/* Carrousel FULL WIDTH */}
          {isLoading ? (
            <div className="flex gap-3 overflow-x-auto no-scrollbar py-1 px-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="
                    min-w-[260px]
                    bg-white
                    rounded-3xl
                    shadow-md shadow-black/15
                    border border-black/8
                    animate-pulse
                  "
                >
                  <div className="h-32 bg-muted rounded-t-3xl" />
                  <div className="px-4 py-3.5 space-y-2">
                    <div className="h-4 bg-muted rounded w-2/3" />
                    <div className="h-3 bg-muted rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredSpecialists.length > 0 ? (
            <div className="flex gap-3 overflow-x-auto no-scrollbar py-1 px-4">
              {filteredSpecialists.map((s, index) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => { navigator.vibrate?.(10); navigate(`/client/specialist/${s.id}`); }}
                  className="
                    min-w-[260px] max-w-[260px]
                    bg-white
                    rounded-3xl overflow-hidden
                    shadow-md shadow-black/15
                    border border-black/8
                    text-left active:scale-[0.98] transition-transform
                    group
                    hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20 transition-all duration-300
                    motion-safe:animate-[fadeInUp_0.6s_ease-out_both]
                  "
                  style={{ animationDelay: `${index * 80}ms` }}
                >
                  {/* Banner */}
                  <div className="relative h-32">
                    <img
                      src={s.cover}
                      alt={`Travaux de ${s.name}`}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/25 to-transparent" />

                    <div className="absolute bottom-2 left-3 right-3 flex items-center gap-2 text-white">
                      <div className="h-9 w-9 flex-shrink-0 overflow-hidden rounded-2xl border border-white/60 shadow-sm">
                        <img
                          src={s.avatar}
                          alt={s.name}
                          className="h-full w-full object-cover"
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-semibold truncate">
                          {s.name}
                        </p>
                        <p className="text-[11px] text-white/90 truncate">
                          {s.specialty}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Infos */}
                  <div className="px-4 py-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <MapPin size={11} className="text-foreground/70" />
                        <span className="text-[11px] text-foreground/75 truncate">
                          {s.location}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <Star
                          size={11}
                          className="fill-blyss-gold text-blyss-gold"
                        />
                        <span className="text-[11px] font-semibold text-foreground">
                          {s.rating}
                        </span>
                        <span className="text-[10px] text-foreground/70">
                          ({s.reviews})
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <p className="text-[11px] text-foreground/75 transition-colors duration-300 group-hover:text-foreground">
                        Voir les créneaux disponibles
                      </p>
                      <ChevronRight
                        size={16}
                        className="text-primary transition-transform duration-300 group-hover:translate-x-0.5"
                      />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center py-10 px-6 bg-white rounded-2xl shadow-md shadow-black/10 border border-black/8 mx-4">
              <p className="text-sm font-medium text-foreground mb-1">
                Aucun résultat pour &quot;{searchQuery}&quot;
              </p>
              <p className="text-xs text-foreground/75 mb-3">
                Essaie un autre quartier, une autre experte, ou efface la
                recherche.
              </p>
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="
                  text-xs px-3 py-1.5 rounded-full
                  bg-white
                  text-primary
                  border border-black/10
                  shadow-sm
                  hover:shadow-md
                  active:scale-[0.98]
                  transition-all duration-200
                "
              >
                Effacer la recherche
              </button>
            </div>
          )}
        </section>

        {/* TES NAILS À VENIR */}
        <section className="space-y-2 px-4">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-sm font-semibold text-foreground">
              Tes nails à venir
            </h2>
            <p className="text-[11px] text-foreground/75 leading-snug">
              Retrouve ici tes prochains rendez-vous Blyss.
            </p>
          </div>

          {upcomingAppointments.length === 0 ? (
            <div className="py-3 px-3 rounded-xl bg-white text-foreground text-[11px] flex items-center gap-2 border border-black/10 transition-all duration-300 hover:shadow-sm shadow-md shadow-black/10">
              <Calendar size={14} className="text-primary" />
              <span>
                Aucun rendez-vous prévu pour l&apos;instant. 
                <br/>Planifie ta prochaine séance nails !
              </span>
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto no-scrollbar py-1">
              {upcomingAppointments.map((appt) => (
                <button
                  key={appt.id}
                  type="button"
                  onClick={() => navigate("/client/appointments")}
                  className="
                    min-w-[230px]
                    bg-white
                    rounded-2xl
                    p-3.5
                    border border-black/8
                    shadow-sm
                    text-left active:scale-[0.98] transition-transform
                  "
                >
                  {/* ... */}
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default ClientHome;
