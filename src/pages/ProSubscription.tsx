import { useState } from "react";
import MobileLayout from "@/components/MobileLayout";
import { Check, ArrowLeft, Zap, Heart, Sparkles, TrendingDown, Calendar } from "lucide-react";
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
    savingsAmount?: number;
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
        savingsAmount: 10,
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
        savingsAmount: 50,
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

    const displayPrice = isAnnual && plan.oneTimePrice
      ? plan.oneTimePrice
      : plan.monthlyPrice;

    navigate("/pro/subscription/payment", {
      state: {
        plan: {
          id: plan.id,
          name: plan.name,
          price: displayPrice,
          commitment: plan.commitment,
          billingType: billingType,
        },
      },
    });

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
                Jusqu'à 50€ d'économies par an
              </span>
            </div>
          </div>

          {/* Plans avec animations en cascade */}
          <div className="space-y-3">
            {plans.map((plan, index) => {
              const isSelected = selectedPlan === plan.id;
              const Icon = plan.icon;

              // Calculs pour l'affichage annuel
              const monthlyTotal = plan.monthlyPrice * (plan.commitment || 1);
              const annualPrice = plan.oneTimePrice || monthlyTotal;
              const monthlyEquivalent = plan.commitment
                ? (annualPrice / plan.commitment)
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
          animate-slide-up relative overflow-hidden
          ${isSelected
                      ? "border-primary bg-white shadow-xl shadow-primary/20 scale-[1.02] ring-2 ring-primary/20"
                      : "border-border bg-card hover:border-primary/30 hover:shadow-md"
                    }
          active:scale-[0.98]
        `}
                >
                  {/* Gradient de fond subtil pour la sélection */}
                  {isSelected && (
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.02] via-transparent to-primary/[0.03] pointer-events-none" />
                  )}

                  {/* Header */}
                  <div className="relative flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`
              w-12 h-12 rounded-xl flex items-center justify-center
              transition-all duration-300 shadow-sm
              ${isSelected
                          ? "bg-gradient-to-br from-primary to-primary/70 scale-110 shadow-primary/30"
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

                    {/* Checkbox amélioré */}
                    <div className={`
            w-6 h-6 rounded-full border-2 flex items-center justify-center 
            transition-all duration-300 shadow-sm
            ${isSelected
                        ? "border-primary bg-primary scale-110 shadow-lg shadow-primary/30"
                        : "border-muted-foreground/30 scale-100 bg-background"
                      }
          `}>
                      <Check
                        size={14}
                        className={`text-white transition-all duration-200 ${isSelected ? "scale-100 opacity-100" : "scale-0 opacity-0"}`}
                        strokeWidth={3}
                      />
                    </div>
                  </div>

                  {/* Prix - Version MENSUELLE (design simple conservé) */}
                  {!isAnnual && (
                    <div className="relative mb-4 animate-fade-in">
                      <div className="flex items-baseline gap-1 mb-1">
                        <span className="text-3xl font-bold text-foreground">
                          {Math.floor(plan.monthlyPrice)}
                        </span>
                        <span className="text-lg font-semibold text-foreground">
                          €
                        </span>
                        <span className="text-sm text-muted-foreground">
                          / mois
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {plan.commitment
                          ? `Engagement ${plan.commitment} mois`
                          : "Sans engagement"
                        }
                      </p>
                    </div>
                  )}

                  {/* Prix - Version ANNUELLE (redesign avec meilleur contraste) */}
                  {isAnnual && (
                    <div className="relative mb-4 space-y-3 animate-fade-in">
                      {/* Badge économies repositionné */}
                      {plan.savingsAmount && (
                        <div className="absolute -top-3 -right-3 z-10">
                          <div className="relative">
                            {/* Glow effect */}
                            <div className="absolute inset-0 bg-emerald-500 blur-lg opacity-30 animate-pulse-soft" />
                            <div className="relative flex items-center gap-1 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white text-[10px] font-bold px-2.5 py-1.5 rounded-full shadow-lg animate-bounce-in">
                              <TrendingDown size={11} />
                              -{plan.savingsAmount}€
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Bloc prix annuel avec meilleur contraste */}
                      <div className={`
              relative rounded-xl p-4 border-2 transition-all duration-300
              ${isSelected
                          ? "bg-gradient-to-br from-primary/8 via-primary/5 to-transparent border-primary/30 shadow-inner"
                          : "bg-muted/30 border-muted"
                        }
            `}>
                        {/* Header du bloc prix */}
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                            Paiement unique
                          </span>
                          {plan.commitment && (
                            <div className={`
                    flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full
                    ${isSelected
                                ? "bg-primary/15 text-primary"
                                : "bg-muted text-muted-foreground"
                              }
                  `}>
                              <Calendar size={11} />
                              {plan.commitment} mois
                            </div>
                          )}
                        </div>

                        {/* Prix total en très gros */}
                        <div className="flex items-baseline gap-1.5 mb-3">
                          <span className={`
                  text-4xl font-black transition-colors
                  ${isSelected ? "text-foreground" : "text-foreground/90"}
                `}>
                            {Math.floor(annualPrice)}
                          </span>
                          <span className={`
                  text-xl font-bold
                  ${isSelected ? "text-foreground" : "text-foreground/90"}
                `}>
                            €
                          </span>
                        </div>

                        {/* Séparateur avec style */}
                        <div className={`
                h-px w-full mb-3 transition-colors
                ${isSelected
                            ? "bg-gradient-to-r from-primary/30 via-primary/50 to-primary/30"
                            : "bg-border"
                          }
              `} />

                        {/* Comparaison mensuelle améliorée */}
                        <div className="space-y-2">
                          {/* Équivalent mensuel */}
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">
                              Équivalent mensuel
                            </span>
                            <div className="flex items-baseline gap-1">
                              <span className={`
                      text-xl font-bold transition-colors
                      ${isSelected ? "text-primary" : "text-foreground"}
                    `}>
                                {monthlyEquivalent.toFixed(2)}
                              </span>
                              <span className="text-xs font-semibold text-muted-foreground">
                                €/mois
                              </span>
                            </div>
                          </div>

                          {/* Prix barré si économies */}
                          {plan.savingsAmount && (
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-muted-foreground/80">
                                Au lieu de
                              </span>
                              <span className="text-sm line-through text-muted-foreground/60 font-medium">
                                {plan.monthlyPrice.toFixed(2)}€/mois
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Bandeau récapitulatif de l'économie */}
                      {plan.savingsAmount && (
                        <div className={`
                flex items-center justify-center gap-2 px-3 py-2 rounded-xl transition-all
                ${isSelected
                            ? "bg-emerald-50 border border-emerald-200"
                            : "bg-muted/50 border border-transparent"
                          }
              `}>
                          <div className={`
                  w-5 h-5 rounded-full flex items-center justify-center
                  ${isSelected ? "bg-emerald-500" : "bg-emerald-500/20"}
                `}>
                            <Check
                              size={12}
                              className={isSelected ? "text-white" : "text-emerald-600"}
                              strokeWidth={3}
                            />
                          </div>
                          <span className={`
                  text-xs font-semibold
                  ${isSelected ? "text-emerald-700" : "text-emerald-600"}
                `}>
                            Tu économises {plan.savingsAmount}€ sur {plan.commitment} mois
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Features (inchangé) */}
                  <div className="relative space-y-2">
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
                          className={`mt-0.5 flex-shrink-0 transition-colors ${isSelected ? "text-primary" : "text-muted-foreground"
                            }`}
                          strokeWidth={2.5}
                        />
                        <span className="text-sm text-muted-foreground leading-relaxed">
                          {feature}
                        </span>
                      </div>
                    ))}
                  </div>
                </button>
              );
            })}
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
                {isAnnual ? "Paiement unique • " : ""}Annule à tout moment • Paiement sécurisé
              </p>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes bounce-in {
          0% { transform: scale(0) rotate(-5deg); opacity: 0; }
          50% { transform: scale(1.1) rotate(2deg); }
          100% { transform: scale(1) rotate(0); }
        }
        
        @keyframes fade-in {
          0% { opacity: 0; transform: translateY(10px); }
          100% { opacity: 1; transform: translateY(0); }
        }

        @keyframes slide-up {
          0% { opacity: 0; transform: translateY(20px); }
          100% { opacity: 1; transform: translateY(0); }
        }

        .animate-bounce-in {
          animation: bounce-in 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        }

        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }

        .animate-slide-up {
          animation: slide-up 0.5s ease-out;
        }
      `}</style>
    </MobileLayout>
  );
};

export default ProSubscription;