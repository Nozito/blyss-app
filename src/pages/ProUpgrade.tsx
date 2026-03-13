/**
 * ProUpgrade — Page affichée quand un pro tente d'accéder à une fonctionnalité
 * non incluse dans son abonnement actuel.
 */

import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Lock, Sparkles, Zap, Heart } from "lucide-react";
import MobileLayout from "@/components/MobileLayout";
import { useRevenueCat } from "@/contexts/RevenueCatContext";
import {
  PLAN_LABELS,
  PLAN_PRICES,
  PLAN_FEATURES,
  FEATURE_LABELS,
  getMinPlanForRoute,
  type PlanId,
} from "@/config/subscriptionConfig";

const PLAN_ICONS: Record<PlanId, React.ElementType> = {
  start:    Zap,
  serenite: Heart,
  signature: Sparkles,
};

const PLAN_COLORS: Record<PlanId, string> = {
  start:    "from-blue-500 to-blue-600",
  serenite: "from-primary to-pink-500",
  signature: "from-amber-500 to-orange-500",
};

const ProUpgrade = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { activePlan } = useRevenueCat();

  const fromPath: string = (location.state as any)?.from?.pathname ?? "";
  const requiredPlan: PlanId = getMinPlanForRoute(fromPath) ?? "serenite";
  const RequiredIcon = PLAN_ICONS[requiredPlan];
  const gradient = PLAN_COLORS[requiredPlan];

  const featuresIncluded = PLAN_FEATURES[requiredPlan];
  const currentPlanLabel = activePlan ? PLAN_LABELS[activePlan] : "Aucun";

  return (
    <MobileLayout showNav={false}>
      <div className="min-h-screen flex flex-col pb-8">

        {/* Header */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">
          <div className="px-4 py-4 flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-2 -ml-2 rounded-xl hover:bg-muted active:scale-95 transition-all"
            >
              <ArrowLeft size={22} className="text-foreground" />
            </button>
            <h1 className="text-lg font-bold text-foreground">Upgrade requis</h1>
          </div>
        </div>

        <div className="px-4 pt-4 space-y-6">

          {/* Bloc principal */}
          <div className="rounded-3xl overflow-hidden">
            <div className={`bg-gradient-to-br ${gradient} px-6 py-8 text-white text-center`}>
              <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center mx-auto mb-4">
                <Lock size={28} className="text-white" />
              </div>
              <h2 className="text-xl font-bold mb-2">
                Fonctionnalité non incluse
              </h2>
              <p className="text-white/80 text-sm leading-relaxed">
                Cette page nécessite le plan{" "}
                <span className="font-bold text-white">
                  {PLAN_LABELS[requiredPlan]}
                </span>
                .<br />
                Ton abonnement actuel : <span className="font-semibold">{currentPlanLabel}</span>
              </p>
            </div>
          </div>

          {/* Plan cible */}
          <div className="blyss-card">
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center`}>
                <RequiredIcon size={18} className="text-white" />
              </div>
              <div>
                <h3 className="font-bold text-foreground">
                  Formule {PLAN_LABELS[requiredPlan]}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {PLAN_PRICES[requiredPlan]}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {featuresIncluded.map((feature) => (
                <div key={feature} className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <div className="w-2 h-2 rounded-full bg-primary" />
                  </div>
                  <span className="text-sm text-foreground">
                    {FEATURE_LABELS[feature]}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <button
            onClick={() => navigate("/pro/subscription-settings")}
            className={`w-full py-4 rounded-2xl bg-gradient-to-r ${gradient} text-white font-bold text-base shadow-lg active:scale-[0.98] transition-all`}
          >
            Passer au plan {PLAN_LABELS[requiredPlan]}
          </button>

          <button
            onClick={() => navigate("/pro/dashboard")}
            className="w-full py-3 rounded-2xl bg-muted text-foreground font-semibold text-sm active:scale-[0.98] transition-all"
          >
            Retour au tableau de bord
          </button>

        </div>
      </div>
    </MobileLayout>
  );
};

export default ProUpgrade;
