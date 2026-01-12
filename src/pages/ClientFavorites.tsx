import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
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
      <div className="min-h-screen bg-background pb-6">
        {/* Header */}
        <motion.div
          className="pt-6 pb-6 text-center px-6"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="text-3xl font-display font-bold text-foreground mb-2">
            Mes favoris
          </h1>
          <p className="text-muted-foreground">
            {favorites.length > 0
              ? `${favorites.length} experte${favorites.length > 1 ? "s" : ""} sauvegardée${favorites.length > 1 ? "s" : ""}`
              : "Retrouve ici tes expertes préférées"}
          </p>
        </motion.div>

        {/* Favorites list */}
        {favorites.length === 0 ? (
          <motion.div
            className="flex flex-col items-center justify-center py-20 px-6 text-center"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6 }}
          >
            <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center mb-6">
              <Heart size={48} className="text-primary" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">
              Aucun favori
            </h2>
            <p className="text-muted-foreground mb-8 max-w-sm">
              Ajoute des prothésistes à tes favoris pour les retrouver facilement
            </p>
            <button
              onClick={() => navigate("/client")}
              className="
                px-8 py-3 rounded-2xl
                bg-primary hover:bg-primary/90
                text-primary-foreground font-semibold
                shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40
                transition-all duration-300
                active:scale-95
              "
            >
              Découvrir des pros
            </button>
          </motion.div>
        ) : (
          <div className="space-y-3 px-6">
            {favorites.map((specialist, index) => (
              <motion.div
                key={specialist.id}
                className="bg-card rounded-3xl overflow-hidden shadow-lg shadow-black/5 border border-muted"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1, duration: 0.5 }}
              >
                <button
                  onClick={() => navigate(`/client/specialist/${specialist.id}`)}
                  className="
                    w-full p-5 text-left
                    hover:bg-muted/30
                    transition-all duration-300
                    active:scale-[0.98]
                  "
                >
                  <div className="flex items-center gap-4">
                    {/* Avatar */}
                    <div className="w-16 h-16 rounded-2xl overflow-hidden flex-shrink-0 shadow-md">
                      <img
                        src={avatarsById[specialist.id] || logo}
                        alt={specialist.name}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground text-lg mb-0.5">
                        {specialist.name}
                      </h3>
                      <p className="text-sm text-muted-foreground mb-2">
                        {specialist.specialty}
                      </p>

                      <div className="flex items-center gap-3 text-xs">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <MapPin size={14} />
                          <span>{specialist.location}</span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <Star size={14} className="text-yellow-400 fill-yellow-400" />
                          <span className="font-medium text-foreground">
                            {specialist.rating}
                          </span>
                          <span className="text-muted-foreground">
                            ({specialist.reviews})
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Arrow */}
                    <ChevronRight
                      size={20}
                      className="text-muted-foreground flex-shrink-0"
                    />
                  </div>
                </button>

                {/* Remove button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFavorite(specialist.id);
                  }}
                  className="
                    w-full px-5 py-3 border-t border-muted
                    flex items-center justify-center gap-2
                    text-sm font-medium text-destructive
                    hover:bg-destructive/5
                    transition-all duration-300
                    active:scale-[0.98]
                  "
                >
                  <Heart size={16} className="fill-destructive" />
                  Retirer des favoris
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </MobileLayout>
  );
};

export default ClientFavorites;
