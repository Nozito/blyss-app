import { useState } from "react";
import MobileLayout from "@/components/MobileLayout";
import { Check, ArrowLeft, Zap, Heart, Sparkles, TrendingDown } from "lucide-react";
import { useNavigate } from "react-router-dom";

type BillingType = "monthly" | "one_time";
type PlanId = "start" | "serenite" | "signature";

const ProSubscription = () => {
  const navigate = useNavigate();
  const [billingType, setBillingType] = useState<BillingType>("monthly");
  const [selectedPlan, setSelectedPlan] = useState<PlanId | null>("serenite");
  const [isLoading, setIsLoading] = useState(false);

  const plans: {
    id: PlanId;
    name: string;
    icon: any;
    monthlyPrice: number;
    commitment: number | null;
    oneTimePrice?: number;
    features: string[];
    popular?: boolean;
    savings?: string;
  }[] = [
    {
      id: "start",
      name: "Start",
      icon: Zap,
      monthlyPrice: 34.90,
      commitment: null,
      features: [
        "Réservation en ligne",
        "Gestion agenda",
        "Notifications clients",
        "Tableau de bord"
      ]
    },
    {
      id: "serenite",
      name: "Sérénité",
      icon: Heart,
      monthlyPrice: 29.90,
      commitment: 3,
      oneTimePrice: 79.90,
      savings: "Économise 10€",
      features: [
        "Module finance",
        "Portfolio photos",
        "Rappels automatiques",
        "Tout Start inclus"
      ],
      popular: true
    },
    {
      id: "signature",
      name: "Signature",
      icon: Sparkles,
      monthlyPrice: 24.90,
      commitment: 12,
      oneTimePrice: 249.00,
      savings: "Économise 50€",
      features: [
        "Visibilité premium",
        "Rappels post-prestation",
        "Encaissement en ligne",
        "Tout Sérénité inclus"
      ]
    }
  ];

  const handleSelectPlan = (planId: PlanId) => {
    setSelectedPlan(planId);
  };

  const handleSubscribe = async () => {
    if (!selectedPlan) return;
    const plan = plans.find((p) => p.id === selectedPlan);
    if (!plan) return;

    const token = localStorage.getItem("access_token");
    if (!token) {
      alert("Tu dois être connecté pour t'abonner.");
      return;
    }

    setIsLoading(true);
    try {
      const today = new Date();
      const startDate = today.toISOString().slice(0, 10);

      let endDate: string | null = null;
      let totalPrice: number | null = null;
      let commitmentMonths: number | null = plan.commitment ?? null;

      if (billingType === "monthly") {
        endDate = null;
        totalPrice = null;
      } else {
        if (!plan.oneTimePrice) throw new Error("oneTimePrice manquant");
        totalPrice = plan.oneTimePrice;

        if (commitmentMonths && commitmentMonths > 0) {
          const end = new Date(today);
          end.setMonth(end.getMonth() + commitmentMonths);
          endDate = end.toISOString().slice(0, 10);
        } else {
          endDate = null;
        }
      }

      const res = await fetch("http://localhost:3001/api/subscriptions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          plan: plan.id,
          billingType,
          monthlyPrice: plan.monthlyPrice,
          totalPrice,
          commitmentMonths,
          startDate,
          endDate
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        console.error("Subscription error", data);
        alert("Une erreur est survenue lors de l'activation de ton abonnement.");
        return;
      }

      alert("Ton compte pro est maintenant actif ✅");
      navigate("/pro");
    } catch (error) {
      console.error(error);
      alert("Impossible de finaliser l'abonnement pour le moment.");
    } finally {
      setIsLoading(false);
    }
  };

  const isAnnual = billingType === "one_time";

  return (
    <MobileLayout showNav={false}>
      <div className="min-h-screen bg-background">
        {/* Header fixe */}
        <div className="sticky top-0 bg-background/95 backdrop-blur-lg z-10 border-b border-border/50 -mx-4 px-4 py-4 mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="w-9 h-9 rounded-full bg-muted/50 flex items-center justify-center active:scale-95 transition-transform"
            >
              <ArrowLeft size={18} className="text-foreground" />
            </button>
            <div className="flex-1">
              <h1 className="text-lg font-semibold text-foreground">
                Choisis ta formule
              </h1>
            </div>
          </div>
        </div>

        <div className="pb-32 space-y-6">
          {/* Toggle avec effet accentué */}
          <div className="flex flex-col items-center gap-3 animate-fade-in">
            <div className="relative inline-flex rounded-full bg-muted p-1 shadow-sm">
              <button
                type="button"
                onClick={() => setBillingType("monthly")}
                className={`
                  relative z-10 px-6 py-2.5 rounded-full text-sm font-semibold transition-all duration-300
                  ${billingType === "monthly"
                    ? "text-white"
                    : "text-muted-foreground"
                  }
                `}
              >
                Mensuel
              </button>
              <button
                type="button"
                onClick={() => setBillingType("one_time")}
                className={`
                  relative z-10 px-6 py-2.5 rounded-full text-sm font-semibold transition-all duration-300
                  ${billingType === "one_time"
                    ? "text-white"
                    : "text-muted-foreground"
                  }
                `}
              >
                Annuel
              </button>
              {/* Slider animé */}
              <div
                className={`
                  absolute top-1 bottom-1 rounded-full bg-primary shadow-md
                  transition-all duration-300 ease-out
                  ${billingType === "monthly" 
                    ? "left-1 right-[50%]" 
                    : "left-[50%] right-1"
                  }
                `}
              />
            </div>
            
            {/* Badge économies avec animation */}
            <div 
              className={`
                flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200
                transition-all duration-300
                ${isAnnual 
                  ? "opacity-100 translate-y-0 scale-100" 
                  : "opacity-0 -translate-y-2 scale-95 pointer-events-none"
                }
              `}
            >
              <TrendingDown size={14} className="text-emerald-600" />
              <span className="text-xs font-semibold text-emerald-700">
                Jusqu'à 50€ d'économies
              </span>
            </div>
          </div>

          {/* Plans avec animations en cascade */}
          <div className="space-y-3">
            {plans.map((plan, index) => {
              const isSelected = selectedPlan === plan.id;
              const Icon = plan.icon;
              const displayPrice = isAnnual && plan.oneTimePrice 
                ? plan.oneTimePrice 
                : plan.monthlyPrice;

              return (
                <button
                  key={plan.id}
                  onClick={() => handleSelectPlan(plan.id)}
                  style={{ 
                    animationDelay: `${index * 100}ms`,
                  }}
                  className={`
                    w-full text-left rounded-2xl p-5 border-2 
                    transition-all duration-300 ease-out
                    animate-slide-up
                    ${isSelected 
                      ? "border-primary bg-primary/5 shadow-lg shadow-primary/10 scale-[1.02]" 
                      : "border-border bg-card hover:border-primary/30 hover:shadow-md"
                    }
                    active:scale-[0.98]
                  `}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`
                        w-12 h-12 rounded-xl flex items-center justify-center
                        transition-all duration-300
                        ${isSelected 
                          ? "bg-gradient-to-br from-primary to-primary/60 scale-110" 
                          : "bg-muted"
                        }
                      `}>
                        <Icon 
                          size={24} 
                          className={`transition-all duration-300 ${isSelected ? "text-white" : "text-muted-foreground"}`} 
                        />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-foreground">
                          {plan.name}
                        </h3>
                        {plan.popular && (
                          <span className="inline-block mt-1 text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                            POPULAIRE
                          </span>
                        )}
                      </div>
                    </div>
                    <div className={`
                      w-5 h-5 rounded-full border-2 flex items-center justify-center 
                      transition-all duration-300
                      ${isSelected 
                        ? "border-primary bg-primary scale-110" 
                        : "border-muted-foreground/30 scale-100"
                      }
                    `}>
                      <Check 
                        size={12} 
                        className={`text-white transition-all duration-200 ${isSelected ? "scale-100 opacity-100" : "scale-0 opacity-0"}`}
                        strokeWidth={3} 
                      />
                    </div>
                  </div>

                  {/* Prix avec animation de changement */}
                  <div className="mb-4 relative">
                    {/* Badge économies annuel */}
                    {isAnnual && plan.savings && (
                      <div 
                        className="absolute -top-2 -right-2 bg-emerald-500 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-md animate-bounce-in"
                      >
                        {plan.savings}
                      </div>
                    )}
                    
                    <div className="flex items-baseline gap-1 mb-1">
                      <span 
                        key={displayPrice}
                        className="text-3xl font-bold text-foreground animate-scale-in"
                      >
                        {Math.floor(displayPrice)}
                      </span>
                      <span className="text-lg font-semibold text-foreground">
                        €
                      </span>
                      {!isAnnual && (
                        <span className="text-sm text-muted-foreground">
                          / mois
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground transition-all duration-300">
                      {isAnnual 
                        ? `${plan.commitment} mois • Paiement unique`
                        : plan.commitment 
                          ? `Engagement ${plan.commitment} mois`
                          : "Sans engagement"
                      }
                    </p>
                  </div>

                  {/* Features */}
                  <div className="space-y-2">
                    {plan.features.map((feature, i) => (
                      <div 
                        key={i} 
                        className="flex items-start gap-2"
                        style={{ 
                          animationDelay: `${(index * 100) + (i * 50)}ms` 
                        }}
                      >
                        <Check 
                          size={16} 
                          className="text-primary mt-0.5 flex-shrink-0" 
                          strokeWidth={2.5} 
                        />
                        <span className="text-sm text-muted-foreground">
                          {feature}
                        </span>
                      </div>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer fixe */}
        <div 
          className="fixed inset-x-0 bottom-0 bg-background/95 backdrop-blur-lg border-t border-border/50 px-4 py-4"
          style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}
        >
          <div className="max-w-md mx-auto">
            <button
              disabled={!selectedPlan || isLoading}
              onClick={handleSubscribe}
              className="w-full py-4 rounded-2xl bg-primary text-white font-semibold text-base disabled:opacity-50 active:scale-[0.98] transition-all shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Activation...
                </span>
              ) : (
                "Continuer"
              )}
            </button>
            <p className="text-xs text-center text-muted-foreground mt-3">
              Annule à tout moment • Paiement sécurisé
            </p>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes bounce-in {
          0% { transform: scale(0) rotate(-5deg); opacity: 0; }
          50% { transform: scale(1.1) rotate(2deg); }
          100% { transform: scale(1) rotate(0); }
        }
        
        @keyframes scale-in {
          0% { transform: scale(0.8); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }

        .animate-bounce-in {
          animation: bounce-in 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        }

        .animate-scale-in {
          animation: scale-in 0.3s ease-out;
        }
      `}</style>
    </MobileLayout>
  );
};

export default ProSubscription;
