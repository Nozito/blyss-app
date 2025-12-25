import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import MobileLayout from "@/components/MobileLayout";
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

  const greeting = user?.firstName
    ? `Salut ${user.firstName} 👋`
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

  const Separator = () => (
    <div className="h-px bg-border/50 my-5 mx-4" aria-hidden="true" />
  );

  return (
    <MobileLayout>
      <div className="animate-fade-in space-y-6">
        {/* HERO Blyss */}
        <header className="flex flex-col items-center text-center space-y-2 px-4">
          <img
            src={logo}
            alt="Blyss"
            className="w-36 h-36 object-contain rounded-xl"
          />
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{greeting}</p>
            <p className="text-sm font-semibold text-foreground">
              Tes nails, sans prise de tête.
            </p>
          </div>
          <span className="inline-flex items-center px-4 py-1.5 rounded-full bg-muted text-[11px] text-muted-foreground">
            Plateforme Blyss · Spécialistes nails vérifiées
          </span>
        </header>

        {/* RECHERCHE */}
        <section className="space-y-2 px-4">
          <div className="relative">
            <Search
              size={18}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher une experte, une prestation, un quartier..."
              className="w-full pl-11 pr-4 py-3.5 rounded-2xl bg-card shadow-card border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-shadow"
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Ex. : "pose gel République", "Emma", "manucure Paris 11".
          </p>
        </section>

        <Separator />

        {/* TES NAILS À VENIR */}
        <section className="space-y-2 px-4">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-sm font-semibold text-foreground">
              Tes nails à venir
            </h2>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Retrouve ici tes prochains rendez-vous Blyss.
            </p>
          </div>

          {upcomingAppointments.length === 0 ? (
            <div className="py-3.5 px-3 rounded-2xl bg-muted text-[11px] text-muted-foreground flex items-center gap-2">
              <Calendar size={14} className="text-muted-foreground" />
              <span>
                Aucun rendez-vous prévu pour l'instant. Choisis une experte et
                réserve ton prochain Blyss.
              </span>
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto no-scrollbar py-1">
              {upcomingAppointments.map((appt) => (
                <button
                  key={appt.id}
                  type="button"
                  onClick={() => navigate("/client/appointments")}
                  className="min-w-[230px] bg-card rounded-2xl p-3.5 shadow-card text-left active:scale-[0.98] transition-transform"
                >
                  {/* ... */}
                </button>
              ))}
            </div>
          )}
        </section>

        <Separator />

        {/* SÉLECTION BLYSS */}
        <section className="space-y-3 mb-4">
          {/* Header avec padding */}
          <div className="flex items-center justify-between gap-2 px-4">
            <div className="flex flex-1 min-w-0 flex-col gap-0.5">
              <h2 className="text-sm font-semibold text-foreground truncate">
                Sélection Blyss
              </h2>
              <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2">
                Une sélection d'expertes nails bien notées, proche de toi.
              </p>
            </div>

            <button
              type="button"
              onClick={() => navigate("/client/specialists")}
              className="flex-shrink-0 text-[11px] text-primary"
            >
              Tout voir
            </button>
          </div>

          {/* Loading */}
          {isLoading ? (
            <div className="flex gap-3 overflow-x-auto no-scrollbar py-1 pl-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="min-w-[240px] bg-card rounded-3xl shadow-card animate-pulse"
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
            /* Carousel - edge to edge à droite, marge à gauche */
            <div className="flex gap-3 overflow-x-auto no-scrollbar py-1 pl-4 pr-4">
              {filteredSpecialists.map((s, index) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => navigate(`/client/specialist/${s.id}`)}
                  className={`
                    min-w-[240px] max-w-[240px]
                    bg-card rounded-3xl overflow-hidden shadow-card
                    text-left active:scale-[0.98] transition-transform
                    ${index === filteredSpecialists.length - 1 ? "mr-0" : ""}
                  `}
                >
                  {/* Banner */}
                  <div className="relative h-32">
                    <img
                      src={s.cover}
                      alt={`Travaux de ${s.name}`}
                      className="h-full w-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/15 to-transparent" />

                    <div className="absolute bottom-2 left-3 right-3 flex items-center gap-2 text-white">
                      <div className="h-9 w-9 flex-shrink-0 overflow-hidden rounded-2xl border border-white/40">
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
                        <p className="text-[11px] text-white/85 truncate">
                          {s.specialty}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Infos */}
                  <div className="px-4 py-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <MapPin size={11} className="text-muted-foreground" />
                        <span className="text-[11px] text-muted-foreground truncate">
                          {s.location}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <Star
                          size={11}
                          className="fill-blyss-gold text-blyss-gold"
                        />
                        <span className="text-[11px] font-medium text-foreground">
                          {s.rating}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          ({s.reviews})
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <p className="text-[11px] text-muted-foreground">
                        Voir les créneaux disponibles
                      </p>
                      <ChevronRight
                        size={16}
                        className="text-muted-foreground"
                      />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center py-10 px-6 bg-card rounded-2xl shadow-card mx-4">
              <p className="text-sm font-medium text-foreground mb-1">
                Aucun résultat pour "{searchQuery}"
              </p>
              <p className="text-xs text-muted-foreground mb-3">
                Essaie un autre quartier, une autre experte, ou efface la
                recherche.
              </p>
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="text-xs px-3 py-1.5 rounded-full bg-muted text-foreground active:scale-[0.98] transition-transform"
              >
                Effacer la recherche
              </button>
            </div>
          )}
        </section>
      </div>
    </MobileLayout>
  );
};

export default ClientHome;
