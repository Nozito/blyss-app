import { useNavigate } from "react-router-dom";
import MobileLayout from "@/components/MobileLayout";
import { MapPin, Star, ChevronRight, Heart } from "lucide-react";
import logo from "@/assets/logo.png";
import { useFavorites } from "@/hooks/useFavorites";

const ClientFavorites = () => {
  const navigate = useNavigate();
  const { favorites, removeFavorite } = useFavorites();

  const avatarsById: Record<number, string> = {
    1: "https://randomuser.me/api/portraits/women/1.jpg",
    2: "https://randomuser.me/api/portraits/women/2.jpg",
    3: "https://randomuser.me/api/portraits/women/3.jpg",
    4: "https://randomuser.me/api/portraits/women/4.jpg",
    5: "https://randomuser.me/api/portraits/women/5.jpg",
    6: "https://randomuser.me/api/portraits/women/6.jpg",
  };

  return (
    <MobileLayout>
      <div className="py-6 animate-fade-in">
        {/* Header */}
        <div className="pt-2 pb-4 animate-fade-in">
          <h1 className="text-2xl font-semibold text-foreground">
            Mes favoris
          </h1>
        </div>

        {/* Favorites list */}
        {favorites.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
            <Heart size={48} className="text-muted-foreground mb-4" />
            <h2 className="text-lg font-semibold text-foreground mb-1">
              Aucun favori pour le moment
            </h2>
            <p className="text-muted-foreground text-sm mb-6">
              Ajoute des prothésistes à tes favoris pour les retrouver ici
            </p>
            <button
              onClick={() => navigate("/client")}
              className="px-6 py-3 rounded-xl gradient-gold text-secondary-foreground font-medium active:scale-95 transition-transform"
            >
              Découvrir des pros
            </button>
          </div>
        ) : (
          <div className="space-y-3 animate-slide-up">
            {favorites.map((specialist) => (
              <div
                key={specialist.id}
                className="bg-card rounded-2xl p-4 shadow-card"
              >
                <button
                  onClick={() => navigate(`/client/specialist/${specialist.id}`)}
                  className="w-full text-left"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center overflow-hidden gradient-gold">
                      <img
                        src={avatarsById[specialist.id] || logo}
                        alt={specialist.name}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground">
                        {specialist.name}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {specialist.specialty}
                      </p>

                      <div className="flex items-center gap-3 mt-1.5">
                        <div className="flex items-center gap-1">
                          <MapPin size={12} className="text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">
                            {specialist.location}
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          <Star
                            size={12}
                            className="text-blyss-gold fill-blyss-gold"
                          />
                          <span className="text-xs font-medium text-foreground">
                            {specialist.rating}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            ({specialist.reviews})
                          </span>
                        </div>
                      </div>
                    </div>

                    <ChevronRight
                      size={20}
                      className="text-muted-foreground flex-shrink-0"
                    />
                  </div>
                </button>

                <button
                  onClick={() => removeFavorite(specialist.id)}
                  className="mt-3 pt-3 border-t border-border w-full flex items-center justify-center gap-2 text-sm text-destructive active:scale-95 transition-transform"
                >
                  <Heart size={14} className="fill-destructive" />
                  Retirer des favoris
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </MobileLayout>
  );
};

export default ClientFavorites;
