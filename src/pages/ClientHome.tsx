import { useState } from "react";
import { useNavigate } from "react-router-dom";
import MobileLayout from "@/components/MobileLayout";
import { MapPin, Star, ChevronRight, Search } from "lucide-react";
import logo from "@/assets/logo.png";

const ClientHome = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");

  const specialists = [
    {
      id: 1,
      name: "Marie Beauté",
      specialty: "Nail Artist",
      location: "Paris 11ème",
      rating: 4.9,
      reviews: 156,
    },
    {
      id: 2,
      name: "Sophie Nails",
      specialty: "Prothésiste ongulaire",
      location: "Paris 9ème",
      rating: 4.8,
      reviews: 89,
    },
    {
      id: 3,
      name: "Emma Style",
      specialty: "Nail Art Specialist",
      location: "Paris 15ème",
      rating: 4.7,
      reviews: 124,
    },
  ];

  const filteredSpecialists = searchQuery
    ? specialists.filter(
        (s) =>
          s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.specialty.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.location.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : specialists;

  return (
    <MobileLayout>
      <div className="px-5 py-6 animate-fade-in">
        {/* Header */}
        <div className="pt-2 pb-4 animate-fade-in">
          <div className="flex items-center gap-3 mb-1">
            <img src={logo} alt="Blyss" className="w-8 h-8 object-contain" />
            <h1 className="text-2xl font-semibold text-foreground">
              Blyss
            </h1>
          </div>
          <p className="text-muted-foreground text-sm">Trouve ta prochaine prestation</p>
        </div>

        {/* Search Bar */}
        <div className="mb-6 animate-slide-up">
          <div className="relative">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher un spécialiste..."
              className="w-full pl-11 pr-4 py-3.5 rounded-2xl bg-card shadow-card border-0 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-shadow"
            />
          </div>
        </div>

        {/* Specialists List */}
        <div className="animate-slide-up" style={{ animationDelay: "0.1s" }}>
          <h2 className="text-lg font-semibold text-foreground mb-4">
            À proximité
          </h2>

          <div className="space-y-3">
            {filteredSpecialists.length > 0 ? (
              filteredSpecialists.map((specialist, index) => (
                <button
                  key={specialist.id}
                  onClick={() => navigate(`/client/specialist/${specialist.id}`)}
                  className="bg-card rounded-2xl p-4 shadow-card w-full text-left active:scale-[0.98] transition-transform"
                  style={{ animationDelay: `${0.15 + index * 0.05}s` }}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl gradient-gold flex items-center justify-center flex-shrink-0">
                      <img src={logo} alt={specialist.name} className="w-9 h-9 object-contain" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground">{specialist.name}</h3>
                      <p className="text-sm text-muted-foreground">{specialist.specialty}</p>
                      <div className="flex items-center gap-3 mt-1.5">
                        <div className="flex items-center gap-1">
                          <MapPin size={12} className="text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">{specialist.location}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Star size={12} className="text-blyss-gold fill-blyss-gold" />
                          <span className="text-xs font-medium text-foreground">{specialist.rating}</span>
                          <span className="text-xs text-muted-foreground">({specialist.reviews})</span>
                        </div>
                      </div>
                    </div>
                    <ChevronRight size={20} className="text-muted-foreground flex-shrink-0" />
                  </div>
                </button>
              ))
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                Aucun résultat trouvé
              </div>
            )}
          </div>
        </div>
      </div>
    </MobileLayout>
  );
};

export default ClientHome;
