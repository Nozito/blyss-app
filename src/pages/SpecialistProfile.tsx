import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, MapPin, Star, Clock, Heart } from "lucide-react";
import ReviewsSection from "@/components/ReviewsSection";
import MobileLayout from "@/components/MobileLayout";
import { useFavorites } from "@/hooks/useFavorites";

import banner1 from "@/assets/banners/banner1.jpg";
import banner2 from "@/assets/banners/banner2.jpg";
import banner3 from "@/assets/banners/banner3.jpg";
import banner4 from "@/assets/banners/banner4.jpg";
import banner5 from "@/assets/banners/banner5.jpg";
import banner6 from "@/assets/banners/banner6.jpg";

const SpecialistProfile = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { isFavorite, toggleFavorite } = useFavorites();
  const [isAnimating, setIsAnimating] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");

  const specialistsData = [
    { id: 1, name: "Marie Beauté", specialty: "Nail Artist", location: "Paris 11ème", avatar: "https://randomuser.me/api/portraits/women/1.jpg" },
    { id: 2, name: "Sophie Nails", specialty: "Prothésiste ongulaire", location: "Paris 9ème", avatar: "https://randomuser.me/api/portraits/women/2.jpg" },
    { id: 3, name: "Emma Style", specialty: "Nail Art Specialist", location: "Paris 15ème", avatar: "https://randomuser.me/api/portraits/women/3.jpg" },
    { id: 4, name: "Léa Chic", specialty: "Manucure", location: "Paris 5ème", avatar: "https://randomuser.me/api/portraits/women/4.jpg" },
    { id: 5, name: "Julie Glam", specialty: "Pose gel", location: "Paris 12ème", avatar: "https://randomuser.me/api/portraits/women/5.jpg" },
    { id: 6, name: "Camille Art", specialty: "Nail Art Specialist", location: "Paris 8ème", avatar: "https://randomuser.me/api/portraits/women/6.jpg" },
  ];

  const bannersById: Record<number, string> = {
    1: banner1,
    2: banner2,
    3: banner3,
    4: banner4,
    5: banner5,
    6: banner6,
  };

  const selectedSpecialist = specialistsData.find(s => s.id === Number(id)) || specialistsData[0];

  // Mock data
  const specialist = {
    ...selectedSpecialist,
    bio: "Passionnée par l'art des ongles depuis plus de 8 ans. Spécialisée dans les poses gel, le nail art créatif et les manucures de luxe. Votre satisfaction est ma priorité ✨",
    rating: 4.9,
    reviews: 156,
    services: [
      { name: "Pose complète gel", duration: "1h30", price: 65 },
      { name: "Remplissage", duration: "1h", price: 45 },
      { name: "Manucure simple", duration: "45min", price: 35 },
      { name: "Nail art", duration: "2h", price: 85 },
    ],
    portfolio: [1, 2, 3, 4, 5, 6],
  };

  const isFav = isFavorite(specialist.id);

  const handleToggleFavorite = () => {
    setIsAnimating(true);
    toggleFavorite({
      id: specialist.id,
      name: specialist.name,
      specialty: specialist.specialty,
      location: specialist.location.split(",")[1]?.trim() || specialist.location,
      rating: specialist.rating,
      reviews: specialist.reviews,
    });
    setTimeout(() => setIsAnimating(false), 300);
  };

  const handleSubmitReview = () => {
    if (rating === 0) return;
    console.log("Review submitted:", { rating, comment });
    setShowReviewModal(false);
    setRating(0);
    setComment("");
  };

  // Mock reviews data
  const reviewsData = [
    {
      id: 1,
      author: "Sophie M.",
      rating: 5,
      comment: "Marie est une artiste ! Mes ongles n'ont jamais été aussi beaux. Je recommande à 100%",
      date: "Il y a 2 jours",
      avatar: "SM",
    },
    {
      id: 2,
      author: "Julie R.",
      rating: 5,
      comment: "Superbe travail, très professionnelle et à l'écoute. Le nail art est magnifique !",
      date: "Il y a 1 semaine",
      avatar: "JR",
    },
    {
      id: 3,
      author: "Emma L.",
      rating: 4,
      comment: "Très satisfaite de ma manucure. Seul petit bémol, un peu d'attente à l'arrivée.",
      date: "Il y a 2 semaines",
      avatar: "EL",
    },
    {
      id: 4,
      author: "Claire D.",
      rating: 5,
      comment: "Toujours au top ! Cela fait 2 ans que je viens chez Marie et je ne changerai pour rien au monde.",
      date: "Il y a 3 semaines",
      avatar: "CD",
    },
    {
      id: 5,
      author: "Laura P.",
      rating: 5,
      comment: "Un vrai plaisir à chaque visite. Ambiance zen et résultat impeccable.",
      date: "Il y a 1 mois",
      avatar: "LP",
    },
  ];

  return (
    <>
      <MobileLayout showNav={false}>
        {/* Header Image */}
        <div className="relative h-48 rounded-t-2xl z-0">
          <img
            src={bannersById[selectedSpecialist.id] || banner1}
            alt="Bannière"
            className="w-full h-full object-cover"
          />
          <button
            onClick={() => navigate(-1)}
            className="absolute top-safe-top left-4 mt-4 w-10 h-10 rounded-full bg-card/80 backdrop-blur-sm flex items-center justify-center z-10 active:scale-95 transition-transform"
          >
            <ArrowLeft size={20} className="text-foreground" />
          </button>
          <button 
            onClick={handleToggleFavorite}
            className={`absolute top-safe-top right-4 mt-4 w-10 h-10 rounded-full bg-card/80 backdrop-blur-sm flex items-center justify-center z-10 active:scale-95 transition-all duration-200 ${
              isAnimating ? "scale-125" : "scale-100"
            }`}
          >
            <Heart 
              size={20} 
              className={`transition-colors duration-200 ${
                isFav ? "text-primary fill-primary" : "text-foreground"
              }`} 
            />
          </button>
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 z-50">
            <div className="w-24 h-24 rounded-full bg-card shadow-elevated flex items-center justify-center border-4 border-blyss-gold-light">
              <img src={specialist.avatar} alt={specialist.name} className="w-full h-full object-cover rounded-full" />
            </div>
          </div>
        </div>

        {/* Profile Content */}
        <div className="px-5 pt-16 pb-32">
          {/* Name & Info */}
          <div className="text-center mb-6 animate-fade-in">
            <h1 className="text-2xl font-semibold text-foreground">
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
            <h2 className="text-lg font-semibold text-foreground mb-2">À propos</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">{specialist.bio}</p>
          </div>

          {/* Services */}
          <div className="mb-6 animate-slide-up" style={{ animationDelay: "0.1s" }}>
            <h2 className="text-lg font-semibold text-foreground mb-3">Prestations</h2>
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
          <div className="mb-6 animate-slide-up" style={{ animationDelay: "0.15s" }}>
            <h2 className="text-lg font-semibold text-foreground mb-3">Portfolio</h2>
            <div className="grid grid-cols-3 gap-2">
              {specialist.portfolio.map((_, index) => (
                <div
                  key={index}
                  className="aspect-square rounded-xl bg-gradient-to-br from-blyss-pink-light to-blyss-gold-light"
                />
              ))}
            </div>
          </div>

          {/* Reviews Section */}
          <ReviewsSection reviews={reviewsData} />

          {/* Add Review Button */}
          <button
            onClick={() => setShowReviewModal(true)}
            className="w-full py-3 mt-4 rounded-xl border-2 border-primary text-primary font-medium active:scale-[0.98] transition-transform"
          >
            Laisser un avis
          </button>
        </div>
      </MobileLayout>

      {/* CTA Button */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] p-5 pb-8 safe-bottom bg-gradient-to-t from-blyss-gold-light via-blyss-gold-light to-transparent">
        <button
          onClick={() => navigate("/client/booking")}
          className="w-full py-4 rounded-2xl gradient-gold text-secondary-foreground font-semibold text-lg shadow-elevated active:scale-[0.98] transition-transform"
        >
          Réserver
        </button>
      </div>

      {/* Review Modal */}
      {showReviewModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
          <div className="w-full max-w-[430px] bg-card rounded-t-3xl p-6 pb-10 animate-slide-up-modal">
            <div className="w-12 h-1 bg-muted rounded-full mx-auto mb-6" />
            
            <h3 className="text-xl font-semibold text-foreground text-center mb-6">
              Laisser un avis
            </h3>

            {/* Star Rating */}
            <div className="flex items-center justify-center gap-2 mb-6">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setRating(star)}
                  className="p-1 active:scale-90 transition-transform"
                >
                  <Star
                    size={36}
                    className={`transition-colors ${
                      star <= rating
                        ? "text-blyss-gold fill-blyss-gold"
                        : "text-muted-foreground"
                    }`}
                  />
                </button>
              ))}
            </div>

            {/* Comment */}
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Décrivez votre expérience..."
              className="w-full h-32 px-4 py-3 rounded-xl bg-muted border-0 text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 mb-6"
            />

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowReviewModal(false)}
                className="flex-1 py-3 rounded-xl bg-muted text-foreground font-medium active:scale-95 transition-transform"
              >
                Annuler
              </button>
              <button
                onClick={handleSubmitReview}
                disabled={rating === 0}
                className="flex-1 py-3 rounded-xl gradient-primary text-primary-foreground font-medium active:scale-95 transition-transform disabled:opacity-50"
              >
                Envoyer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SpecialistProfile;
