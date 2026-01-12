import { useNavigate, useParams } from "react-router-dom";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import MobileLayout from "@/components/MobileLayout";
import { ArrowLeft, Calendar, Clock, MapPin, Star, MessageSquare, Euro } from "lucide-react";
import logo from "@/assets/logo.png";

const avatarsById: Record<number, string> = {
  1: "https://randomuser.me/api/portraits/women/1.jpg",
  2: "https://randomuser.me/api/portraits/women/2.jpg",
  3: "https://randomuser.me/api/portraits/women/3.jpg",
  4: "https://randomuser.me/api/portraits/women/4.jpg",
  5: "https://randomuser.me/api/portraits/women/5.jpg",
  6: "https://randomuser.me/api/portraits/women/6.jpg",
};

const BookingDetail = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [hoveredStar, setHoveredStar] = useState(0);

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
      <div className="min-h-screen bg-background pb-6">
        {/* Header */}
        <motion.div
          className="flex items-center gap-4 px-6 pt-6 pb-4"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <button
            onClick={() => navigate(-1)}
            className="
              w-11 h-11 rounded-2xl bg-card border border-muted
              flex items-center justify-center
              hover:bg-muted/50
              transition-all duration-300
              active:scale-95
            "
          >
            <ArrowLeft size={20} className="text-foreground" />
          </button>
          <h1 className="text-2xl font-display font-bold text-foreground">
            Détail réservation
          </h1>
        </motion.div>

        <div className="px-6 space-y-5">
          {/* Status Badge */}
          <motion.div
            className="flex justify-center"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
          >
            <span
              className={`
                px-6 py-2.5 rounded-full text-sm font-semibold
                ${
                  isPast
                    ? "bg-muted text-muted-foreground"
                    : "bg-primary/10 text-primary border-2 border-primary/20"
                }
              `}
            >
              {isPast ? "Prestation passée" : "À venir"}
            </span>
          </motion.div>

          {/* Specialist Card */}
          <motion.button
            onClick={() => navigate(`/client/specialist/${booking.specialist.id}`)}
            className="
              w-full bg-card rounded-3xl p-5
              flex items-center gap-4
              shadow-lg shadow-black/5 border border-muted
              hover:shadow-xl hover:-translate-y-0.5
              transition-all duration-300
              active:scale-[0.98]
            "
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
          >
            <div className="w-16 h-16 rounded-2xl overflow-hidden flex-shrink-0 shadow-md">
              <img
                src={avatarsById[booking.specialist.id] || logo}
                alt={booking.specialist.name}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex-1 text-left">
              <h3 className="font-semibold text-foreground text-lg mb-0.5">
                {booking.specialist.name}
              </h3>
              <p className="text-sm text-muted-foreground">
                {booking.specialist.specialty}
              </p>
            </div>
            <ArrowLeft size={20} className="text-muted-foreground rotate-180" />
          </motion.button>

          {/* Booking Details Card */}
          <motion.div
            className="bg-card rounded-3xl p-6 shadow-lg shadow-black/5 border border-muted space-y-5"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.5 }}
          >
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-1">
                {booking.service}
              </h3>
              <p className="text-sm text-muted-foreground">
                Réservation #{booking.id}
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Calendar size={20} className="text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground mb-0.5">Date</p>
                  <p className="text-sm font-medium text-foreground">
                    {booking.date}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Clock size={20} className="text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground mb-0.5">Horaire</p>
                  <p className="text-sm font-medium text-foreground">
                    {booking.time} • {booking.duration}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <MapPin size={20} className="text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground mb-0.5">Lieu</p>
                  <p className="text-sm font-medium text-foreground">
                    {booking.location}
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-5 border-t border-muted flex items-center justify-between">
              <span className="text-muted-foreground font-medium">Total</span>
              <div className="flex items-center gap-2">
                <span className="text-3xl font-bold text-foreground">
                  {booking.price}
                </span>
                <Euro size={24} className="text-foreground" />
              </div>
            </div>
          </motion.div>

          {/* Review Button (only for past bookings) */}
          {isPast && (
            <motion.button
              onClick={() => setShowReviewModal(true)}
              className="
                w-full h-14 rounded-2xl
                bg-primary hover:bg-primary/90
                text-primary-foreground font-semibold
                shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40
                flex items-center justify-center gap-2
                transition-all duration-300
                active:scale-[0.98]
              "
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.5 }}
            >
              <MessageSquare size={20} />
              Laisser un avis
            </motion.button>
          )}
        </div>
      </div>

      {/* Review Modal */}
      <AnimatePresence>
        {showReviewModal && (
          <>
            <motion.div
              className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowReviewModal(false)}
            />
            <motion.div
              className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-4"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
            >
              <div
                className="w-full max-w-lg bg-card rounded-3xl p-6 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="w-12 h-1.5 bg-muted rounded-full mx-auto mb-6" />

                <h3 className="text-2xl font-display font-bold text-foreground text-center mb-2">
                  Laisser un avis
                </h3>
                <p className="text-sm text-muted-foreground text-center mb-6">
                  Partage ton expérience avec {booking.specialist.name}
                </p>

                {/* Star Rating */}
                <div className="flex items-center justify-center gap-3 mb-8">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <motion.button
                      key={star}
                      onClick={() => setRating(star)}
                      onMouseEnter={() => setHoveredStar(star)}
                      onMouseLeave={() => setHoveredStar(0)}
                      className="p-1 transition-transform active:scale-90"
                      whileHover={{ scale: 1.2 }}
                      whileTap={{ scale: 0.9 }}
                    >
                      <Star
                        size={40}
                        className={`transition-all duration-200 ${
                          star <= (hoveredStar || rating)
                            ? "text-yellow-400 fill-yellow-400"
                            : "text-muted-foreground"
                        }`}
                      />
                    </motion.button>
                  ))}
                </div>

                {/* Comment */}
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Décris ton expérience (optionnel)..."
                  className="
                    w-full h-32 px-4 py-3 rounded-2xl
                    bg-muted border-2 border-transparent
                    text-foreground placeholder:text-muted-foreground
                    resize-none
                    focus:outline-none focus:border-primary
                    transition-all duration-300
                    mb-6
                  "
                  maxLength={500}
                />

                {comment && (
                  <p className="text-xs text-muted-foreground text-right mb-4">
                    {comment.length}/500 caractères
                  </p>
                )}

                {/* Actions */}
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowReviewModal(false)}
                    className="
                      flex-1 h-12 rounded-xl
                      bg-muted text-foreground font-medium
                      hover:bg-muted/80
                      transition-all duration-300
                      active:scale-95
                    "
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleSubmitReview}
                    disabled={rating === 0}
                    className="
                      flex-1 h-12 rounded-xl
                      bg-primary text-primary-foreground font-semibold
                      hover:bg-primary/90
                      shadow-lg shadow-primary/30
                      disabled:opacity-50 disabled:cursor-not-allowed
                      transition-all duration-300
                      active:scale-95
                    "
                  >
                    Envoyer
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </MobileLayout>
  );
};

export default BookingDetail;
