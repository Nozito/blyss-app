import { useNavigate } from "react-router-dom";
import MobileLayout from "@/components/MobileLayout";
import { MapPin, Star, ChevronRight, Heart } from "lucide-react";
import logo from "@/assets/logo.png";
import { useState } from "react";

const ClientFavorites = () => {
    const navigate = useNavigate();

    const [favorites, setFavorites] = useState([
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
    ]);

    const [swipedId, setSwipedId] = useState<number | null>(null);

    return (
        <MobileLayout>
            <div className="py-6 animate-fade-in">
                {/* Header */}
                <div className="pt-2 pb-4 animate-fade-in">
                    <h1 className="font-display text-2xl font-semibold text-foreground">
                        Mes favoris
                    </h1>
                </div>

                {/* Favorites list */}
                {favorites.length === 0 ? (
                    <div className="flex flex-col items-center justify-center flex-1 text-center animate-fade-in">
                        <Heart size={48} className="text-muted-foreground mb-4" />
                        <h2 className="font-display text-lg font-semibold text-foreground mb-1">
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
                    <div className="space-y-4 animate-slide-up">
                        {favorites.map((specialist) => (
                            <div
                                key={specialist.id}
                                className="relative overflow-hidden rounded-2xl"
                                onTouchStart={(e) => {
                                    const startX = e.touches[0].clientX;
                                    (e.currentTarget as any).startX = startX;
                                }}
                                onTouchMove={(e) => {
                                    const startX = (e.currentTarget as any).startX;
                                    const currentX = e.touches[0].clientX;
                                    if (startX - currentX > 40) {
                                        setSwipedId(specialist.id);
                                    }
                                    if (currentX - startX > 10) {
                                        setSwipedId(null);
                                    }
                                }}
                            >
                                <div className="absolute inset-y-0 right-0 w-20 bg-red-500 flex items-center justify-center">
                                    <button
                                        onClick={() =>
                                            setFavorites((prev) => prev.filter((f) => f.id !== specialist.id))
                                        }
                                        className="text-white font-medium"
                                    >
                                        Supprimer
                                    </button>
                                </div>

                                <button
                                    onClick={() => navigate(`/client/specialist/${specialist.id}`)}
                                    className={`bg-card rounded-2xl p-4 shadow-card w-full text-left transition-transform duration-200 ${swipedId === specialist.id ? "-translate-x-20" : "translate-x-0"
                                        }`}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-16 h-16 rounded-2xl gradient-gold flex items-center justify-center flex-shrink-0">
                                            <img
                                                src={logo}
                                                alt={specialist.name}
                                                className="w-10 h-10 object-contain"
                                            />
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-semibold text-foreground">
                                                {specialist.name}
                                            </h3>
                                            <p className="text-sm text-muted-foreground">
                                                {specialist.specialty}
                                            </p>

                                            <div className="flex items-center gap-3 mt-1">
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
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </MobileLayout>
    );
};

export default ClientFavorites;