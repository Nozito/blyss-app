import { useState, useEffect } from "react";
import MobileLayout from "@/components/MobileLayout";
import { Check, ArrowLeft, Zap, Heart, Sparkles, TrendingDown, Calendar, CheckCircle2, ArrowUpRight, AlertCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getApiEndpoint } from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";

type BillingType = "monthly" | "one_time";
type PlanId = "start" | "serenite" | "signature";

interface CurrentSubscription {
  plan: PlanId;
  billingType: BillingType;
  status: "active" | "cancelled";
  endDate?: string;
}

const ProSubscription = () => {
  const navigate = useNavigate();
  const [billingType, setBillingType] = useState<BillingType>("monthly");
  const [selectedPlan, setSelectedPlan] = useState<PlanId | null>("serenite");
  const [isLoading, setIsLoading] = useState(false);
  const [currentSubscription, setCurrentSubscription] = useState<CurrentSubscription | null>(null);
  const [loadingSubscription, setLoadingSubscription] = useState(true);
  const [connectionError, setConnectionError] = useState(false);
  const { token } = useAuth();

  const plans = [
    {
      id: "start",
      name: "Start",
      icon: Zap,
      monthlyPrice: 39.90,
      commitment: null,
      features: [
        "Réservation en ligne",
        "Gestion des rendez-vous",
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
      oneTimePrice: 79.90, // Au lieu de 89.70€
      savings: "Économise 10€",
      savingsAmount: 10,
      features: [
        "Module finance",
        "Statistiques & Facturation",
        "Portfolio photos intégré",
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
      oneTimePrice: 249.00, // Au lieu de 298.80€
      savings: "Économise 50€",
      savingsAmount: 50,
      features: [
        "Visibilité premium",
        "Rappels post-prestation",
        "Encaissement en ligne*",
        "Tout Sérénité inclus"
      ]
    }
  ];


  //  Récupérer l'abonnement actuel avec gestion d'erreur robuste
  useEffect(() => {
    const fetchCurrentSubscription = async () => {
      setLoadingSubscription(true); // ✅ Déplacé ici

      try {
        // ✅ Utilise le token du context
        if (!token) {
          console.warn("Pas de token d'authentification");
          setLoadingSubscription(false);
          return;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        console.log("🔍 Récupération de l'abonnement actuel..."); // ✅ Debug

        const res = await fetch(getApiEndpoint("/api/subscriptions/current"), {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json", // ✅ Ajouté
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        console.log("📊 Statut de la réponse:", res.status); // ✅ Debug

        if (res.ok) {
          const data = await res.json();
          console.log("📦 Données reçues:", data); // ✅ Debug

          if (data.success && data.data) {
            setCurrentSubscription({
              plan: data.data.plan,
              billingType: data.data.billingType,
              status: data.data.status,
              endDate: data.data.endDate,
            });
            setConnectionError(false);
            console.log("✅ Abonnement chargé:", data.data);
          }
        } else if (res.status === 404) {
          console.log("ℹ️ Pas d'abonnement actuel (404)");
          setConnectionError(false);
        } else {
          const errorData = await res.json();
          console.error("❌ Erreur serveur:", errorData);
        }
      } catch (error: any) {
        if (error.name === 'AbortError') {
          console.warn("⏱️ Timeout lors de la récupération de l'abonnement");
          setConnectionError(true);
        } else if (error.message.includes('Failed to fetch') || error.message.includes('ERR_CONNECTION_REFUSED')) {
          console.warn("🔌 Backend non accessible");
          setConnectionError(true);
        } else {
          console.error("❌ Erreur:", error);
          setConnectionError(true);
        }
      } finally {
        setLoadingSubscription(false);
      }
    };

    fetchCurrentSubscription();
  }, [token]);

  const handleSelectPlan = (planId: PlanId) => {
    setSelectedPlan(planId);
  };

  const handleSubscribe = async () => {
    if (!selectedPlan) return;
    const plan = plans.find((p) => p.id === selectedPlan);
    if (!plan) return;

    // Si c'est le plan actuel, rediriger vers la gestion
    if (currentSubscription && currentSubscription.plan === selectedPlan) {
      navigate("/pro/dashboard");
      return;
    }

    const displayPrice = isAnnual && plan.oneTimePrice ? plan.oneTimePrice : plan.monthlyPrice;

    navigate("/pro/subscription-payment", {
      state: {
        plan: {
          id: plan.id,
          name: plan.name,
          price: displayPrice,
          commitment: plan.commitment,
          billingType: billingType,
          monthlyPrice: plan.monthlyPrice,
          totalPrice: isAnnual && plan.oneTimePrice ? plan.oneTimePrice : null,
        },
        isUpgrade: currentSubscription !== null,
      },
    });
  };

  const isCurrentPlan = (planId: PlanId) => {
    return currentSubscription?.plan === planId && currentSubscription.status === "active";
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
                {currentSubscription ? "Modifier ta formule" : "Choisis ta formule"}
              </h1>
              {currentSubscription && (
                <p className="text-xs text-muted-foreground">
                  Actuellement : {plans.find(p => p.id === currentSubscription.plan)?.name}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="pb-32 space-y-6">
          {/* ✅ Bannière d'avertissement si backend hors ligne */}
          {connectionError && (
            <div className="blyss-card bg-amber-50 border-2 border-amber-200 animate-fade-in">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center flex-shrink-0">
                  <AlertCircle size={20} className="text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-foreground mb-1">
                    Mode hors ligne
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Impossible de récupérer ton abonnement actuel. Vérifie que le backend est démarré sur le port 3001.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Bannière abonnement actif */}
          {currentSubscription && currentSubscription.status === "active" && (
            <div className="blyss-card bg-gradient-to-br from-emerald-50 to-transparent border-2 border-emerald-200 animate-fade-in">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 size={20} className="text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-foreground mb-1">
                    Abonnement actif
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Tu es actuellement sur le plan{" "}
                    <span className="font-semibold text-foreground">
                      {plans.find(p => p.id === currentSubscription.plan)?.name}
                    </span>
                    {currentSubscription.billingType === "one_time" && currentSubscription.endDate && (
                      <span> • Valable jusqu'au {new Date(currentSubscription.endDate).toLocaleDateString('fr-FR')}</span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Toggle avec effet accentué */}
          <div className="flex flex-col items-center gap-3 animate-fade-in">
            <div className="relative inline-flex rounded-full bg-muted p-1 shadow-sm">
              <button
                type="button"
                onClick={() => setBillingType("monthly")}
                className={`
                  relative z-10 px-6 py-2.5 rounded-full text-sm font-semibold transition-all duration-300
                  ${billingType === "monthly" ? "text-white" : "text-muted-foreground"}
                `}
              >
                Mensuel
              </button>
              <button
                type="button"
                onClick={() => setBillingType("one_time")}
                className={`
                  relative z-10 px-6 py-2.5 rounded-full text-sm font-semibold transition-all duration-300
                  ${billingType === "one_time" ? "text-white" : "text-muted-foreground"}
                `}
              >
                Annuel
              </button>
              <div
                className={`
                  absolute top-1 bottom-1 rounded-full bg-primary shadow-md
                  transition-all duration-300 ease-out
                  ${billingType === "monthly" ? "left-1 right-[50%]" : "left-[50%] right-1"}
                `}
              />
            </div>

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


          {/* Plans */}
          <div className="space-y-3">
            {plans
              .filter(plan => {
                // ✅ En mode annuel, cache les plans sans option de paiement unique
                if (isAnnual && !plan.oneTimePrice) {
                  return false;
                }
                return true;
              })
              .map((plan, index) => {
                const isSelected = selectedPlan === plan.id;
                const isCurrent = isCurrentPlan(plan.id as PlanId);
                const Icon = plan.icon;

                const monthlyTotal = plan.monthlyPrice * (plan.commitment || 1);
                const annualPrice = plan.oneTimePrice || monthlyTotal;
                const monthlyEquivalent = plan.commitment
                  ? (annualPrice / plan.commitment)
                  : plan.monthlyPrice;

                return (
                  <button
                    key={plan.id}
                    onClick={() => handleSelectPlan(plan.id as PlanId)}
                    style={{ animationDelay: `${index * 100}ms` }}
                    disabled={isCurrent}
                    className={`
          w-full text-left rounded-2xl p-5 border-2 
          transition-all duration-300 ease-out
          animate-slide-up relative overflow-hidden
          ${isCurrent
                        ? "border-muted bg-muted/30 opacity-60 cursor-default"
                        : isSelected
                          ? "border-primary bg-white shadow-xl shadow-primary/20 scale-[1.02] ring-2 ring-primary/20"
                          : "border-border bg-card hover:border-primary/30 hover:shadow-md hover:scale-[1.01]"
                      }
          ${!isCurrent && "active:scale-[0.98]"}
        `}
                  >
                    {isCurrent && (
                      <div className="absolute top-0 left-0 right-0 z-10">
                        <div className="flex items-center justify-center gap-1.5 bg-gradient-to-r from-muted via-muted/80 to-muted text-muted-foreground text-[11px] font-bold px-4 py-2 rounded-t-2xl border-b border-border">
                          <CheckCircle2 size={12} />
                          TON ABONNEMENT ACTUEL
                        </div>
                      </div>
                    )}

                    {isCurrent && <div className="h-4" />}

                    {/* Header */}
                    <div className="relative flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className={`
              w-12 h-12 rounded-xl flex items-center justify-center
              transition-all duration-300 shadow-sm
              ${isCurrent
                            ? "bg-muted/50"
                            : isSelected
                              ? "bg-gradient-to-br from-primary to-primary/70 scale-110 shadow-primary/30"
                              : "bg-muted"
                          }
            `}>
                          <Icon
                            size={24}
                            className={`transition-all duration-300 ${isCurrent
                              ? "text-muted-foreground"
                              : isSelected
                                ? "text-white"
                                : "text-muted-foreground"
                              }`}
                          />
                        </div>
                        <div>
                          <h3 className={`text-base font-bold ${isCurrent ? "text-muted-foreground" : "text-foreground"
                            }`}>
                            {plan.name}
                          </h3>
                          {plan.popular && !isCurrent && (
                            <span className="inline-block mt-1 text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full animate-pulse">
                              ⭐ POPULAIRE
                            </span>
                          )}
                        </div>
                      </div>

                      {!isCurrent && (
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
                            className={`text-white transition-all duration-200 ${isSelected ? "scale-100 opacity-100" : "scale-0 opacity-0"
                              }`}
                            strokeWidth={3}
                          />
                        </div>
                      )}
                    </div>

                    {/* Prix - Version MENSUELLE */}
                    {!isAnnual && (
                      <div className="relative mb-4 animate-fade-in">
                        <div className="flex items-baseline gap-1 mb-1">
                          <span className={`text-3xl font-bold`}>
                            {plan.monthlyPrice.toFixed(2).replace('.', ',')}
                          </span>
                          <span className={`text-lg font-semibold ${isCurrent ? "text-muted-foreground" : "text-foreground"
                            }`}>
                            €
                          </span>
                          <span className="text-sm text-muted-foreground">/ mois</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {plan.commitment
                            ? `Engagement ${plan.commitment} mois`
                            : "Sans engagement"
                          }
                        </p>
                      </div>
                    )}

                    {/* Prix - Version ANNUELLE */}
                    {isAnnual && (
                      <div className="relative mb-4 space-y-3 animate-fade-in">
                        {plan.savingsAmount && !isCurrent && (
                          <div className="absolute -top-3 -right-3 z-10">
                            <div className="relative">
                              <div className="absolute inset-0 bg-emerald-500 blur-lg opacity-30 animate-pulse-soft" />
                              <div className="relative flex items-center gap-1 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white text-[10px] font-bold px-2.5 py-1.5 rounded-full shadow-lg animate-bounce-in">
                                <TrendingDown size={11} />
                                -{plan.savingsAmount}€
                              </div>
                            </div>
                          </div>
                        )}

                        <div className={`
              relative rounded-xl p-4 border-2 transition-all duration-300
              ${isCurrent
                            ? "bg-muted/20 border-muted"
                            : isSelected
                              ? "bg-gradient-to-br from-primary/8 via-primary/5 to-transparent border-primary/30 shadow-inner"
                              : "bg-muted/30 border-muted"
                          }
            `}>
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                              Paiement unique
                            </span>
                            {plan.commitment && (
                              <div className={`
                    flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full
                    ${isCurrent
                                  ? "bg-muted/50 text-muted-foreground"
                                  : isSelected
                                    ? "bg-primary/15 text-primary"
                                    : "bg-muted text-muted-foreground"
                                }
                  `}>
                                <Calendar size={11} />
                                {plan.commitment} mois
                              </div>
                            )}
                          </div>

                          <div className="flex items-baseline gap-1.5 mb-3">
                            <span className={`text-4xl font-black transition-colors ${isCurrent
                              ? "text-muted-foreground"
                              : isSelected
                                ? "text-foreground"
                                : "text-foreground/90"
                              }`}>
                              {Math.floor(annualPrice)}
                            </span>
                            <span className={`text-xl font-bold ${isCurrent
                              ? "text-muted-foreground"
                              : isSelected
                                ? "text-foreground"
                                : "text-foreground/90"
                              }`}>
                              €
                            </span>
                          </div>

                          <div className={`h-px w-full mb-3 transition-colors ${isCurrent
                            ? "bg-border"
                            : isSelected
                              ? "bg-gradient-to-r from-primary/30 via-primary/50 to-primary/30"
                              : "bg-border"
                            }`} />

                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-muted-foreground">
                                Équivalent mensuel
                              </span>
                              <div className="flex items-baseline gap-1">
                                <span className={`text-xl font-bold transition-colors ${isCurrent
                                  ? "text-muted-foreground"
                                  : isSelected
                                    ? "text-primary"
                                    : "text-foreground"
                                  }`}>
                                  {monthlyEquivalent.toFixed(2)}
                                </span>
                                <span className="text-xs font-semibold text-muted-foreground">
                                  €/mois
                                </span>
                              </div>
                            </div>

                            {plan.savingsAmount && !isCurrent && (
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

                        {plan.savingsAmount && !isCurrent && (
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
                            <span className={`text-xs font-semibold ${isSelected ? "text-emerald-700" : "text-emerald-600"
                              }`}>
                              Tu économises {plan.savingsAmount}€ sur {plan.commitment} mois
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Features */}
                    <div className="relative space-y-2">
                      {plan.features.map((feature, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-2"
                          style={{ animationDelay: `${(index * 100) + (i * 50)}ms` }}
                        >
                          <Check
                            size={16}
                            className={`mt-0.5 flex-shrink-0 transition-colors ${isCurrent
                              ? "text-muted-foreground/50"
                              : isSelected
                                ? "text-primary"
                                : "text-muted-foreground"
                              }`}
                            strokeWidth={2.5}
                          />
                          <span className={`text-sm leading-relaxed ${isCurrent
                            ? "text-muted-foreground/70"
                            : "text-muted-foreground"
                            }`}>
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
            className="fixed inset-x-0 bottom-0 bg-background/95 backdrop-blur-lg border-t border-border/50 px-4 py-4 z-50"
            style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}
          >
            <div className="max-w-md mx-auto">
              <button
                disabled={!selectedPlan || isLoading || loadingSubscription}
                onClick={handleSubscribe}
                className={`
                  w-full py-4 rounded-2xl font-semibold text-base 
                  disabled:opacity-50 active:scale-[0.98] transition-all 
                  shadow-lg hover:shadow-xl flex items-center justify-center gap-2
                  ${selectedPlan && isCurrentPlan(selectedPlan)
                    ? "bg-emerald-500 text-white shadow-emerald-500/20 hover:shadow-emerald-500/30"
                    : "bg-primary text-white shadow-primary/20 hover:shadow-primary/30"
                  }
                `}
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {currentSubscription ? "Modification..." : "Activation..."}
                  </span>
                ) : selectedPlan && isCurrentPlan(selectedPlan) ? (
                  <>
                    <CheckCircle2 size={18} />
                    Gérer mon abonnement
                  </>
                ) : currentSubscription ? (
                  <>
                    <ArrowUpRight size={18} />
                    Changer de formule
                  </>
                ) : (
                  "Continuer"
                )}
              </button>
              <p className="text-xs text-center text-muted-foreground mt-3">
                {currentSubscription && selectedPlan && !isCurrentPlan(selectedPlan) && (
                  <span className="font-medium text-primary">Changement immédiat • </span>
                )}
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
