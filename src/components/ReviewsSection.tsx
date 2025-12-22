import { useState } from "react";
import { Star, ChevronDown, ChevronUp } from "lucide-react";

interface Review {
  id: number;
  author: string;
  rating: number;
  comment: string;
  date: string;
  avatar: string;
}

interface ReviewsSectionProps {
  reviews: Review[];
}

const ReviewsSection = ({ reviews }: ReviewsSectionProps) => {
  const [showAll, setShowAll] = useState(false);
  const displayedReviews = showAll ? reviews : reviews.slice(0, 3);

  const renderStars = (rating: number) => {
    return (
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            size={12}
            className={`${
              star <= rating
                ? "text-blyss-gold fill-blyss-gold"
                : "text-muted-foreground/30"
            }`}
          />
        ))}
      </div>
    );
  };

  if (reviews.length === 0) {
    return (
      <div className="animate-slide-up" style={{ animationDelay: "0.2s" }}>
        <h2 className="font-display text-lg font-semibold text-foreground mb-3">Avis clients</h2>
        <p className="text-muted-foreground text-sm">Aucun avis pour le moment</p>
      </div>
    );
  }

  return (
    <div className="animate-slide-up" style={{ animationDelay: "0.2s" }}>
      <h2 className="font-display text-lg font-semibold text-foreground mb-3">
        Avis clients ({reviews.length})
      </h2>
      
      <div className="space-y-3">
        {displayedReviews.map((review) => (
          <div key={review.id} className="bg-card rounded-2xl p-4 shadow-card">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blyss-pink-light to-blyss-gold-light flex items-center justify-center flex-shrink-0">
                <span className="text-foreground font-medium text-sm">{review.avatar}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <h4 className="font-medium text-foreground text-sm">{review.author}</h4>
                  <span className="text-xs text-muted-foreground">{review.date}</span>
                </div>
                {renderStars(review.rating)}
                <p className="text-muted-foreground text-sm mt-2 leading-relaxed">
                  {review.comment}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {reviews.length > 3 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="w-full mt-4 py-3 rounded-xl border-2 border-primary text-primary font-medium flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
        >
          {showAll ? (
            <>
              <ChevronUp size={18} />
              Voir moins
            </>
          ) : (
            <>
              <ChevronDown size={18} />
              Voir plus d'avis
            </>
          )}
        </button>
      )}
    </div>
  );
};

export default ReviewsSection;
