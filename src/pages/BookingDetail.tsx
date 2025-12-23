import { useNavigate, useParams } from "react-router-dom";
import { useState } from "react";
import MobileLayout from "@/components/MobileLayout";
import { ArrowLeft, Calendar, Clock, MapPin, Star, MessageSquare } from "lucide-react";
import logo from "@/assets/logo.png";

const BookingDetail = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");

  // Mock booking data
  const booking = {
    id: Number(id),
    specialist: {
      id: 1,
      name: "Marie Beauté",
      specialty: "Nail Artist",
      avatar: "MB",
    },
    service: "Pose complète gel",
    date: "12 juin 2024",
    time: "14:00",
    duration: "1h30",
    location: "12 Rue de la Beauté, Paris 11ème",
    price: 65,
    status: id === "2" || id === "3" ? "past" : "upcoming",
  };

  const isPast = booking.status === "past";

  const handleSubmitReview = () => {
    if (rating === 0) return;
    console.log("Review submitted:", { rating, comment });
    setShowReviewModal(false);
    setRating(0);
    setComment("");
  };

  return (
    <MobileLayout showNav={false}>
      <div className="px-5 py-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full bg-muted flex items-center justify-center active:scale-95 transition-transform"
          >
            <ArrowLeft size={20} className="text-foreground" />
          </button>
          <h1 className="text-xl font-semibold text-foreground">
            Détail réservation
          </h1>
        </div>

        {/* Status Badge */}
        <div className="flex justify-center mb-6">
          <span
            className={`px-4 py-2 rounded-full text-sm font-medium ${
              isPast
                ? "bg-muted text-muted-foreground"
                : "bg-primary/10 text-primary"
            }`}
          >
            {isPast ? "Prestation passée" : "À venir"}
          </span>
        </div>

        {/* Specialist Card */}
        <button
          onClick={() => navigate(`/client/specialist/${booking.specialist.id}`)}
          className="w-full blyss-card flex items-center gap-4 mb-4 active:scale-[0.98] transition-transform"
        >
          <div className="w-14 h-14 rounded-full gradient-gold flex items-center justify-center flex-shrink-0">
            <img src={logo} alt={booking.specialist.name} className="w-8 h-8 object-contain" />
          </div>
          <div className="flex-1 text-left">
            <h3 className="font-semibold text-foreground">{booking.specialist.name}</h3>
            <p className="text-sm text-muted-foreground">{booking.specialist.specialty}</p>
          </div>
        </button>

        {/* Booking Details */}
        <div className="blyss-card space-y-4 mb-4">
          <h3 className="font-semibold text-foreground">{booking.service}</h3>
          
          <div className="flex items-center gap-3 text-sm">
            <Calendar size={16} className="text-muted-foreground" />
            <span className="text-foreground">{booking.date}</span>
          </div>
          
          <div className="flex items-center gap-3 text-sm">
            <Clock size={16} className="text-muted-foreground" />
            <span className="text-foreground">{booking.time} ({booking.duration})</span>
          </div>
          
          <div className="flex items-center gap-3 text-sm">
            <MapPin size={16} className="text-muted-foreground" />
            <span className="text-foreground">{booking.location}</span>
          </div>

          <div className="pt-3 border-t border-border flex items-center justify-between">
            <span className="text-muted-foreground">Total</span>
            <span className="text-xl font-bold text-foreground">{booking.price}€</span>
          </div>
        </div>

        {/* Review Button (only for past bookings) */}
        {isPast && (
          <button
            onClick={() => setShowReviewModal(true)}
            className="w-full py-4 rounded-2xl gradient-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
          >
            <MessageSquare size={20} />
            Laisser un avis
          </button>
        )}
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
    </MobileLayout>
  );
};

export default BookingDetail;
