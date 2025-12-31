import { useState } from "react";
import MobileLayout from "@/components/MobileLayout";
import { Check } from "lucide-react";

type BillingType = "monthly" | "one_time";
type PlanId = "start" | "serenite" | "signature";

/**
 * Hypothèse : prix de base mensuel "sans engagement"
 * utilisé comme référence pour calculer l'économie annuelle.
 * Tu peux l'ajuster selon ta vraie offre.
 */
const BASE_MONTHLY_NO_COMMITMENT = 34.90;

const ProSubscription = () => {
  const [billingType, setBillingType] = useState<BillingType>("monthly");
  const [selectedPlan, setSelectedPlan] = useState<PlanId | null>("serenite");
  const [isLoading, setIsLoading] = useState(false);

  const plans: {
    id: PlanId;
    name: string;
    monthlyPrice: number;
    commitment: number | null;
    oneTimePrice?: number;
    features: string[];
    highlight?: boolean;
    badge?: string;
  }[] = [
    {
      id: "start",
      name: "Start",
      monthlyPrice: 34.90,
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
      monthlyPrice: 29.90,
      commitment: 3,
      oneTimePrice: 79.90,
      features: [
        "Module finance",
        "Portfolio photos",
        "Rappels automatiques",
        "+ fonctionnalités Start"
      ],
      highlight: true,
      badge: "Meilleure offre"
    },
    {
      id: "signature",
      name: "Signature",
      monthlyPrice: 24.90,
      commitment: 12,
      oneTimePrice: 249.00,
      features: [
        "Visibilité premium",
        "Rappels post-prestation",
        "Encaissement en ligne*",
        "+ fonctionnalités Start & Sérénité"
      ],
      badge: "Économies max"
    }
  ];

  const getWithoutCommitmentPrice = (months: number) =>
    (34.90 * months).toFixed(2);

  const handleSelectPlan = (planId: PlanId) => {
    setSelectedPlan(planId);
  };

  const formatPrice = (price: number) =>
    price.toLocaleString("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

  const handleSubscribe = async () => {
    if (!selectedPlan) return;
    const plan = plans.find((p) => p.id === selectedPlan);
    if (!plan) return;

    // Récupérer le token JWT (adaptation selon ta logique d'auth)
    const token = localStorage.getItem("token");
    if (!token) {
      alert("Tu dois être connecté pour t’abonner.");
      return;
    }

    setIsLoading(true);
    try {
      const today = new Date();
      const startDate = today.toISOString().slice(0, 10); // YYYY-MM-DD

      let endDate: string | null = null;
      let totalPrice: number | null = null;
      let commitmentMonths: number | null = plan.commitment ?? null;

      if (billingType === "monthly") {
        // Abonnement mensuel : end_date et total_price peuvent rester null.
        endDate = null;
        totalPrice = null;
      } else {
        // Paiement en une fois
        if (!plan.oneTimePrice) throw new Error("oneTimePrice manquant");
        totalPrice = plan.oneTimePrice;

        // Si tu considères que le paiement en une fois couvre la durée d'engagement
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
        alert("Une erreur est survenue lors de l’activation de ton abonnement.");
        return;
      }

      // À ce stade, ton backend a déjà :
      // - créé la ligne dans `subscriptions`
      // - mis users.pro_status = 'active'
      alert("Ton compte pro est maintenant actif ✅");
      // Tu peux ajouter une redirection ici (ex: router.push("/pro"))
    } catch (error) {
      console.error(error);
      alert("Impossible de finaliser l’abonnement pour le moment.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <MobileLayout showNav={false}>
      <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted">
        <div className="py-6 px-4 space-y-6 max-w-md mx-auto animate-fade-in">
          {/* Header */}
          <header className="text-center space-y-1.5">
            <h1 className="text-[20px] font-semibold text-foreground">
              Active ton compte professionnel
            </h1>
            <p className="text-[13px] text-muted-foreground">
              Choisis la formule adaptée à ton activité, avec ou sans engagement.
            </p>
          </header>

          {/* Billing segmented control (rose DA en accent) */}
          <div className="flex flex-col items-center gap-4">
            <div
              className="inline-flex w-full max-w-xs rounded-[999px] bg-muted p-1 shadow-sm transition"
              role="tablist"
              aria-label="Sélection du mode de paiement"
            >
              <button
                type="button"
                role="tab"
                aria-selected={billingType === "monthly"}
                onClick={() => setBillingType("monthly")}
                className={`flex-1 rounded-[999px] text-[13px] font-medium transition-all px-3 py-1.5
                  ${
                    billingType === "monthly"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground"
                  }`}
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                Mensuel
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={billingType === "one_time"}
                onClick={() => setBillingType("one_time")}
                className={`flex-1 rounded-[999px] text-[13px] font-medium transition-all px-3 py-1.5
                  ${
                    billingType === "one_time"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground"
                  }`}
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                En une fois
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground text-center">
              Mensuel pour plus de flexibilité, une fois pour plus d’économies.
            </p>
          </div>

          {/* Plans */}
          <section className="space-y-3">
            {plans.map((plan) => {
              const isSelected = selectedPlan === plan.id;
              const isOneTime = billingType === "one_time" && plan.oneTimePrice;
              const isHighlighted = plan.highlight;

              const yearlyWithThisPlan = plan.monthlyPrice * 12;
              const yearlyWithBase = BASE_MONTHLY_NO_COMMITMENT * 12;
              const yearlySaving = yearlyWithBase - yearlyWithThisPlan;

              return (
                <button
                  type="button"
                  key={plan.id}
                  onClick={() => handleSelectPlan(plan.id)}
                  aria-pressed={isSelected}
                  className={`
                    w-full text-left rounded-[16px] relative overflow-hidden
                    border transition-all duration-180 ease-out
                    ${
                      isHighlighted
                        ? "border-primary/80 bg-primary/5"
                        : "border-border bg-card"
                    }
                    ${
                      isSelected
                        ? "ring-2 ring-primary shadow-lg translate-y-[-1px]"
                        : "hover:border-primary/40 hover:shadow-sm active:scale-[0.99]"
                    }
                  `}
                  style={{
                    WebkitTapHighlightColor: "transparent"
                  }}
                >
                  <div className="px-4 py-4 space-y-3 relative z-10">
                    {/* Ligne titre + badge */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div
                          className={`h-4 w-4 rounded-full border flex items-center justify-center transition
                            ${
                              isSelected
                                ? "border-primary bg-primary/10"
                                : "border-muted-foreground/40 bg-background"
                            }
                          `}
                        >
                          {isSelected && (
                            <span className="h-2 w-2 rounded-full bg-primary" />
                          )}
                        </div>
                        <h2 className="text-[15px] font-semibold text-foreground">
                          Formule {plan.name}
                        </h2>
                      </div>
                      {(plan.badge || isHighlighted) && (
                        <span className="rounded-full bg-primary text-primary-foreground text-[11px] px-2 py-0.5 font-semibold shadow-sm border border-primary/80">
                          {plan.badge ?? "Populaire"}
                        </span>
                      )}
                    </div>

                    {/* Bloc prix */}
                    <div className="flex items-end justify-between gap-4">
                      <div className="space-y-1">
                        <span className="text-[11px] uppercase tracking-wide text-primary font-semibold">
                          {isOneTime
                            ? "Paiement unique"
                            : plan.commitment
                            ? "Tarif engagé"
                            : "Sans engagement"}
                        </span>
                        <div className="flex items-baseline gap-1">
                          <p className="text-[24px] font-bold text-foreground leading-none">
                            {isOneTime
                              ? formatPrice(plan.oneTimePrice!)
                              : formatPrice(plan.monthlyPrice)}
                          </p>
                          <span className="text-[13px] font-semibold text-foreground">
                            €
                          </span>
                          {!isOneTime && (
                            <span className="text-[12px] font-normal text-muted-foreground">
                              / mois
                            </span>
                          )}
                        </div>
                        <p className="text-[12px] text-muted-foreground">
                          {isOneTime
                            ? "Accès illimité après paiement."
                            : plan.commitment
                            ? `Engagement ${plan.commitment} mois`
                            : "Résiliable à tout moment"}
                        </p>

                        {/* Ligne d’impact annuel subtile */}
                        {!isOneTime && (
                          <p className="text-[11px] text-muted-foreground">
                            Soit {formatPrice(yearlyWithThisPlan)}€ / an
                            {yearlySaving > 0 && (
                              <>
                                {" "}au lieu de {formatPrice(yearlyWithBase)}€,
                                tu économises ~{formatPrice(yearlySaving)}€ / an.
                              </>
                            )}
                          </p>
                        )}

                        {isOneTime && plan.oneTimePrice && (
                          <p className="text-[11px] text-muted-foreground">
                            Équivaut à {formatPrice(plan.oneTimePrice / 12)}€ / mois
                            la première année.
                          </p>
                        )}
                      </div>

                      {isOneTime && plan.commitment && (
                        <div className="text-right text-[11px] text-muted-foreground">
                          <p>
                            au lieu de{" "}
                            <span className="line-through">
                              {getWithoutCommitmentPrice(plan.commitment)}€
                            </span>
                          </p>
                          <p>sans engagement</p>
                        </div>
                      )}
                    </div>

                    {/* Séparateur */}
                    <div className="h-px bg-border/70" />

                    {/* Features */}
                    <ul className="space-y-1.5">
                      {plan.features.map((feature, i) => (
                        <li
                          key={i}
                          className="flex items-center gap-2 text-[13px] text-muted-foreground"
                        >
                          <Check
                            size={18}
                            className="shrink-0 text-primary"
                          />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Halo rose sur la meilleure offre */}
                  {isHighlighted && (
                    <span className="pointer-events-none absolute -right-14 -top-14 h-28 w-28 rounded-full bg-primary/18 blur-3xl" />
                  )}
                </button>
              );
            })}
          </section>

          {/* Spacer before fixed footer */}
          <div className="h-16" />
        </div>

        {/* Fixed CTA footer optimisé iOS */}
        <footer
          className="fixed inset-x-0 bottom-0 bg-background/95 border-t backdrop-blur px-4"
          style={{
            paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))"
          }}
        >
          <div className="max-w-md mx-auto flex flex-col gap-2 pt-2">
            <button
              disabled={!selectedPlan || isLoading}
              onClick={handleSubscribe}
              className="w-full py-3 rounded-[14px] bg-primary text-primary-foreground font-semibold text-[15px] disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] transition-transform shadow-md"
              style={{ WebkitTapHighlightColor: "transparent" }}
            >
              {isLoading
                ? "Activation en cours..."
                : selectedPlan
                ? "Continuer vers le paiement"
                : "Sélectionne une formule pour continuer"}
            </button>
            <p className="text-[11px] text-muted-foreground text-center pb-1">
              * Des frais s’appliquent à l’encaissement en ligne. Tu peux changer d’offre plus tard.
            </p>
          </div>
        </footer>
      </div>
    </MobileLayout>
  );
};

export default ProSubscription;
