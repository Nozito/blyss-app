import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import MobileLayout from "@/components/MobileLayout";
import { MapPin, Star, ChevronRight, Search } from "lucide-react";
import logo from "@/assets/logo.png";
import { useAuth } from "@/contexts/AuthContext";
import { specialistsApi } from "@/services/api";

const ClientHome = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Mock data - will be replaced with API data when backend is connected
  const [specialists] = useState([
    {
      id: 1,
      name: "Marie Beauté",
      specialty: "Nail Artist",
      location: "Paris 11ème",
      rating: 4.9,
      reviews: 156,
      avatar: "https://randomuser.me/api/portraits/women/1.jpg"
    },
    {
      id: 2,
      name: "Sophie Nails",
      specialty: "Prothésiste ongulaire",
      location: "Paris 9ème",
      rating: 4.8,
      reviews: 89,
      avatar: "https://randomuser.me/api/portraits/women/2.jpg"
    },
    {
      id: 3,
      name: "Emma Style",
      specialty: "Nail Art Specialist",
      location: "Paris 15ème",
      rating: 4.7,
      reviews: 124,
      avatar: "https://randomuser.me/api/portraits/women/3.jpg"
    },
    {
      id: 4,
      name: "Léa Chic",
      specialty: "Manucure",
      location: "Paris 5ème",
      rating: 4.6,
      reviews: 102,
      avatar: "https://randomuser.me/api/portraits/women/4.jpg"
    },
    {
      id: 5,
      name: "Julie Glam",
      specialty: "Pose gel",
      location: "Paris 12ème",
      rating: 4.9,
      reviews: 98,
      avatar: "https://randomuser.me/api/portraits/women/5.jpg"
    },
    {
      id: 6,
      name: "Camille Art",
      specialty: "Nail Art Specialist",
      location: "Paris 8ème",
      rating: 4.5,
      reviews: 87,
      avatar: "https://randomuser.me/api/portraits/women/6.jpg"
    }
  ]);

  // Redirect to login if not authenticated (optional - depends on your app flow)
  useEffect(() => {
    // Uncomment this if you want to require authentication
    // if (!isAuthenticated) {
    //   navigate('/login');
    // }
  }, [isAuthenticated, navigate]);

  const filteredSpecialists = searchQuery
    ? specialists.filter(
        (s) =>
          s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.specialty.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.location.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : specialists;

  const greeting = user?.firstName ? `Salut ${user.firstName} 👋` : "Blyss";

  return (
    <MobileLayout>
      <div className="py-6 animate-fade-in">
        {/* Header */}
        <div className="pt-2 pb-4 animate-fade-in">
          <div className="flex items-center gap-3 mb-1">
            <img src={logo} alt="Blyss" className="w-12 h-12 object-contain" />
            <h1 className="text-2xl font-semibold text-foreground">
              {greeting}
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

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-card rounded-2xl p-4 shadow-card animate-pulse">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-muted" />
                    <div className="flex-1">
                      <div className="h-4 bg-muted rounded w-1/2 mb-2" />
                      <div className="h-3 bg-muted rounded w-1/3" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
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
                        <img src={specialist.avatar} alt={specialist.name} className="w-full h-full object-cover rounded-2xl" />
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
          )}
        </div>
      </div>
    </MobileLayout>
  );
};

export default ClientHome;
