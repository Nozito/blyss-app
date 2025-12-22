import { useNavigate } from "react-router-dom";
import MobileLayout from "@/components/MobileLayout";
import { MapPin, Star, ChevronRight } from "lucide-react";
import logo from "@/assets/logo.png";

const ClientHome = () => {
  const navigate = useNavigate();

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

  return (
    <MobileLayout>
      <div className="px-5 pt-safe-top pb-6 bg-blyss-gold-light min-h-screen">
        {/* Header */}
        <div className="py-6 animate-fade-in">
          <div className="flex items-center gap-3 mb-2">
            <img src={logo} alt="Blyss" className="w-8 h-8 object-contain" />
            <h1 className="font-display text-2xl font-semibold text-foreground">
              Blyss
            </h1>
          </div>
          <p className="text-muted-foreground">Trouve ta prochaine prestation</p>
        </div>

        {/* Search */}
        <div className="mb-6 animate-slide-up">
          <div className="bg-card rounded-2xl p-4 shadow-card">
            <p className="text-sm text-muted-foreground mb-2">Où ?</p>
            <div className="flex items-center gap-2">
              <MapPin size={20} className="text-blyss-gold" />
              <span className="font-medium text-foreground">Paris, France</span>
            </div>
          </div>
        </div>

        {/* Featured Section */}
        <div className="mb-6 animate-slide-up" style={{ animationDelay: "0.1s" }}>
          <h2 className="font-display text-lg font-semibold text-foreground mb-4">
            À proximité
          </h2>

          <div className="space-y-4">
            {specialists.map((specialist, index) => (
              <button
                key={specialist.id}
                onClick={() => navigate(`/client/specialist/${specialist.id}`)}
                className="bg-card rounded-2xl p-4 shadow-card w-full text-left active:scale-[0.98] transition-transform"
                style={{ animationDelay: `${0.15 + index * 0.05}s` }}
              >
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl gradient-gold flex items-center justify-center flex-shrink-0">
                    <img src={logo} alt={specialist.name} className="w-10 h-10 object-contain" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground">{specialist.name}</h3>
                    <p className="text-sm text-muted-foreground">{specialist.specialty}</p>
                    <div className="flex items-center gap-3 mt-1">
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
            ))}
          </div>
        </div>

        {/* Categories */}
        <div className="animate-slide-up" style={{ animationDelay: "0.25s" }}>
          <h2 className="font-display text-lg font-semibold text-foreground mb-4">
            Catégories
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {["Manucure", "Pose gel", "Nail art", "Pédicure"].map((category, index) => (
              <button
                key={index}
                className="bg-card rounded-2xl p-4 shadow-card text-center active:scale-95 transition-transform"
              >
                <span className="font-medium text-foreground">{category}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </MobileLayout>
  );
};

export default ClientHome;
