import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, MapPin, Star, Clock, Heart } from "lucide-react";
import logo from "@/assets/logo.png";

const SpecialistProfile = () => {
  const navigate = useNavigate();
  const { id } = useParams();

  // Mock data
  const specialist = {
    id: id,
    name: "Marie Beauté",
    specialty: "Nail Artist",
    location: "12 Rue de la Beauté, Paris 11ème",
    rating: 4.9,
    reviews: 156,
    bio: "Passionnée par l'art des ongles depuis plus de 8 ans. Spécialisée dans les poses gel, le nail art créatif et les manucures de luxe. Votre satisfaction est ma priorité ✨",
    services: [
      { name: "Pose complète gel", duration: "1h30", price: 65 },
      { name: "Remplissage", duration: "1h", price: 45 },
      { name: "Manucure simple", duration: "45min", price: 35 },
      { name: "Nail art", duration: "2h", price: 85 },
    ],
    portfolio: [1, 2, 3, 4, 5, 6],
  };

  return (
    <div className="min-h-screen bg-blyss-gold-light max-w-[430px] mx-auto">
      {/* Header Image */}
      <div className="relative h-48 gradient-gold">
        <button
          onClick={() => navigate(-1)}
          className="absolute top-safe-top left-4 mt-4 w-10 h-10 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center z-10"
        >
          <ArrowLeft size={20} className="text-foreground" />
        </button>
        <button className="absolute top-safe-top right-4 mt-4 w-10 h-10 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center z-10">
          <Heart size={20} className="text-foreground" />
        </button>
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2">
          <div className="w-24 h-24 rounded-full bg-card shadow-elevated flex items-center justify-center border-4 border-blyss-gold-light">
            <img src={logo} alt={specialist.name} className="w-14 h-14 object-contain" />
          </div>
        </div>
      </div>

      {/* Profile Content */}
      <div className="px-5 pt-16 pb-32">
        {/* Name & Info */}
        <div className="text-center mb-6 animate-fade-in">
          <h1 className="font-display text-2xl font-semibold text-foreground">
            {specialist.name}
          </h1>
          <p className="text-muted-foreground">{specialist.specialty}</p>
          
          <div className="flex items-center justify-center gap-4 mt-3">
            <div className="flex items-center gap-1">
              <Star size={16} className="text-blyss-gold fill-blyss-gold" />
              <span className="font-semibold text-foreground">{specialist.rating}</span>
              <span className="text-sm text-muted-foreground">({specialist.reviews} avis)</span>
            </div>
          </div>
          
          <div className="flex items-center justify-center gap-1 mt-2">
            <MapPin size={14} className="text-muted-foreground" />
            <span className="text-sm text-muted-foreground">{specialist.location}</span>
          </div>
        </div>

        {/* Bio */}
        <div className="bg-card rounded-2xl p-4 shadow-card mb-6 animate-slide-up">
          <h2 className="font-display text-lg font-semibold text-foreground mb-2">À propos</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">{specialist.bio}</p>
        </div>

        {/* Services */}
        <div className="mb-6 animate-slide-up" style={{ animationDelay: "0.1s" }}>
          <h2 className="font-display text-lg font-semibold text-foreground mb-3">Prestations</h2>
          <div className="space-y-3">
            {specialist.services.map((service, index) => (
              <div key={index} className="bg-card rounded-2xl p-4 shadow-card flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-foreground">{service.name}</h3>
                  <div className="flex items-center gap-1 mt-1">
                    <Clock size={12} className="text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{service.duration}</span>
                  </div>
                </div>
                <span className="font-bold text-lg text-foreground">{service.price}€</span>
              </div>
            ))}
          </div>
        </div>

        {/* Portfolio */}
        <div className="animate-slide-up" style={{ animationDelay: "0.15s" }}>
          <h2 className="font-display text-lg font-semibold text-foreground mb-3">Portfolio</h2>
          <div className="grid grid-cols-3 gap-2">
            {specialist.portfolio.map((_, index) => (
              <div
                key={index}
                className="aspect-square rounded-xl bg-gradient-to-br from-blyss-pink-light to-blyss-gold-light"
              />
            ))}
          </div>
        </div>
      </div>

      {/* CTA Button */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] p-5 pb-8 safe-bottom bg-gradient-to-t from-blyss-gold-light via-blyss-gold-light to-transparent">
        <button
          onClick={() => navigate("/client/booking")}
          className="w-full py-4 rounded-2xl gradient-gold text-secondary-foreground font-semibold text-lg shadow-elevated active:scale-[0.98] transition-transform"
        >
          Réserver
        </button>
      </div>
    </div>
  );
};

export default SpecialistProfile;
