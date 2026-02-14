import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import MobileLayout from "@/components/MobileLayout";
import {
  Calendar,
  ChevronRight,
  Sparkles,
  ArrowLeft,
  Zap,
  Heart,
  RefreshCw,
  ExternalLink,
  AlertCircle,
  Crown,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useRevenueCat } from "@/contexts/RevenueCatContext";
import { toast } from "sonner";
import type { PlanId } from "@/services/revenuecat";

const ProSubscriptionSettings = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const { activePlan, customerInfo, backendSubscription, isLoading: rcLoading, restorePurchases } = useRevenueCat();
  const navigate = useNavigate();
  const [isRestoring, setIsRestoring] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate("/login");
    }
  }, [isLoading, isAuthenticated, navigate]);

  const getPlanLabel = (plan: PlanId) => {
    if (plan === "start") return "Start";
    if (plan === "serenite") return "Sérénité";
    return "Signature";
  };

  const getPlanIcon = (plan: PlanId) => {
    if (plan === "start") return Zap;
    if (plan === "serenite") return Heart;
    return Crown;
  };

  const getPlanColor = (plan: PlanId) => {
    if (plan === "start") return "from-blue-500 to-blue-600";
    if (plan === "serenite") return "from-purple-500 to-purple-600";
    return "from-amber-500 to-amber-600";
  };

  const handleChangePlan = () => {
    navigate("/pro/subscription");
  };

  const handleViewHistory = () => {
    toast.info("L'historique des factures arrive bientôt.", {
      description: "Cette fonctionnalité sera disponible prochainement.",
    });
  };

  const handleRestore = async () => {
    setIsRestoring(true);
    try {
      await restorePurchases();
      toast.success("Achats restaurés avec succès", {
        description: "Votre abonnement a été synchronisé.",
      });
    } catch {
      toast.error("Impossible de restaurer les achats", {
        description: "Veuillez réessayer dans quelques instants.",
      });
    } finally {
      setIsRestoring(false);
    }
  };

  const handleManageSubscription = () => {
    const mgmtUrl = customerInfo?.managementURL;
    if (mgmtUrl) {
      window.open(mgmtUrl, "_blank", "noopener,noreferrer");
    } else {
      toast.info("Gestion non disponible", {
        description: "Le lien de gestion sera disponible sous peu.",
      });
    }
  };

  const isActive = activePlan !== null;
  const PlanIcon = activePlan ? getPlanIcon(activePlan) : Sparkles;
  const planGradient = activePlan ? getPlanColor(activePlan) : "from-primary to-primary/60";

  // Get active entitlement details
  const activeEntitlement = activePlan
    ? customerInfo?.entitlements?.active?.[activePlan]
    : null;
  const expirationDate = activeEntitlement?.expirationDate
    ? new Date(activeEntitlement.expirationDate).toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : backendSubscription?.endDate
      ? new Date(backendSubscription.endDate).toLocaleDateString("fr-FR", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        })
      : null;

  const billingLabel = backendSubscription?.billingType === "one_time" ? "Paiement unique" : "Mensuel";
  const priceLabel = backendSubscription?.monthlyPrice != null
    ? `${Number(backendSubscription.monthlyPrice).toFixed(2)} €/mois`
    : null;

  // Calculer les jours restants
  const daysRemaining = expirationDate 
    ? Math.ceil((new Date(activeEntitlement?.expirationDate || backendSubscription?.endDate || "").getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  if (rcLoading || isLoading) {
    return (
      <MobileLayout showNav={false}>
        <div className="flex items-center justify-center min-h-[70vh]">
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
              <div className="absolute inset-0 w-16 h-16 border-4 border-transparent border-b-primary/40 rounded-full animate-spin" style={{ animationDirection: "reverse", animationDuration: "1s" }} />
            </div>
            <p className="text-sm font-medium text-muted-foreground animate-pulse">
              Chargement de votre abonnement...
            </p>
          </div>
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout showNav={false}>
      <div className="pb-8 animate-fade-in">
        {/* Header avec effet glassmorphism */}
        <div className="sticky top-0 bg-background/80 backdrop-blur-xl z-10 -mx-4 px-4 py-4 mb-6 border-b border-border/40 shadow-sm">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="w-10 h-10 rounded-xl bg-muted/70 hover:bg-muted flex items-center justify-center active:scale-95 transition-all duration-200"
              aria-label="Retour"
            >
              <ArrowLeft size={20} className="text-foreground" />
            </button>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-foreground">
                Mon abonnement
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Gérez votre formule et vos paiements
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* Carte abonnement principale - Design amélioré */}
          <section className="relative">
            <div className={`
              blyss-card overflow-hidden
              ${isActive 
                ? "bg-gradient-to-br from-primary/8 via-background to-accent/8 border-primary/20" 
                : "bg-gradient-to-br from-muted/30 to-background border-border"
              }
            `}>
              {/* Badge statut amélioré */}
              <div className="absolute right-4 top-4 z-10">
                <div className={`
                  inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-bold backdrop-blur-xl shadow-lg
                  ${isActive
                    ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-2 border-emerald-400/50 shadow-emerald-500/25"
                    : "bg-muted/90 text-muted-foreground border-2 border-border/50"
                  }
                `}>
                  <div className={`
                    w-2 h-2 rounded-full
                    ${isActive ? "bg-emerald-500 animate-pulse shadow-sm shadow-emerald-500" : "bg-muted-foreground"}
                  `} />
                  {isActive ? "Actif" : "Inactif"}
                </div>
              </div>

              {/* Contenu principal avec meilleur espacement */}
              <div className="space-y-6">
                <div className="flex items-start gap-4 pr-24">
                  <div className={`
                    w-16 h-16 rounded-2xl bg-gradient-to-br ${planGradient}
                    flex items-center justify-center shadow-xl
                    ${isActive ? "shadow-primary/30 animate-pulse" : "shadow-muted/20"}
                  `}>
                    <PlanIcon size={28} className="text-white" strokeWidth={2.5} />
                  </div>
                  <div className="flex-1 space-y-2 pt-1.5">
                    <p className="text-lg font-bold text-foreground leading-tight">
                      {activePlan ? getPlanLabel(activePlan) : "Aucun abonnement"}
                    </p>
                    {activePlan ? (
                      <p className="text-sm text-muted-foreground font-medium">
                        Abonnement actif et opérationnel
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground font-medium">
                        Choisissez une formule pour commencer
                      </p>
                    )}
                  </div>
                </div>

                {/* État sans abonnement - CTA clair */}
                {!activePlan && (
                  <>
                    <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />
                    <button
                      onClick={handleChangePlan}
                      className="w-full group"
                    >
                      <div className="flex items-center justify-between p-4 rounded-xl bg-primary/5 border-2 border-primary/20 hover:border-primary/40 transition-all duration-200 group-active:scale-[0.98]">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Sparkles size={20} className="text-primary" />
                          </div>
                          <div className="text-left">
                            <p className="text-sm font-bold text-foreground">
                              Découvrir nos formules
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Start, Sérénité ou Signature
                            </p>
                          </div>
                        </div>
                        <ChevronRight size={20} className="text-primary group-hover:translate-x-1 transition-transform" />
                      </div>
                    </button>
                  </>
                )}

                {/* Détails abonnement - Grid amélioré */}
                {activePlan && (
                  <>
                    <div className="h-px bg-gradient-to-r from-transparent via-border/60 to-transparent" />
                    
                    {/* Alerte expiration proche */}
                    {daysRemaining !== null && daysRemaining <= 7 && daysRemaining > 0 && (
                      <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                        <AlertCircle size={18} className="text-amber-600 dark:text-amber-500 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-amber-700 dark:text-amber-500">
                            Renouvellement proche
                          </p>
                          <p className="text-xs text-amber-600/80 dark:text-amber-500/80 mt-1">
                            Votre abonnement expire dans {daysRemaining} jour{daysRemaining > 1 ? "s" : ""}
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">
                          Formule
                        </p>
                        <p className="text-base font-bold text-foreground">
                          {getPlanLabel(activePlan)}
                        </p>
                      </div>
                      {priceLabel && (
                        <div className="space-y-2">
                          <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">
                            Tarif
                          </p>
                          <p className="text-base font-bold text-foreground">
                            {priceLabel}
                          </p>
                        </div>
                      )}
                      {backendSubscription && (
                        <div className="space-y-2">
                          <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">
                            Facturation
                          </p>
                          <p className="text-base font-bold text-foreground">
                            {billingLabel}
                          </p>
                        </div>
                      )}
                      {expirationDate && (
                        <div className="space-y-2">
                          <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">
                            Renouvellement
                          </p>
                          <p className="text-base font-bold text-foreground">
                            {expirationDate}
                          </p>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </section>

          {/* Actions - Design plus moderne */}
          <section className="space-y-4">
            <h2 className="text-xs font-extrabold text-foreground uppercase tracking-wider px-1 flex items-center gap-2">
              <div className="w-1 h-4 bg-primary rounded-full" />
              Gérer mon abonnement
            </h2>

            <div className="space-y-2.5">
              {/* Changer de formule - Mise en avant */}
              <button
                type="button"
                onClick={handleChangePlan}
                className="w-full group"
              >
                <div className="blyss-card flex items-center gap-4 bg-gradient-to-r from-primary/5 to-transparent border-primary/15 group-hover:border-primary/30 group-active:scale-[0.98] transition-all duration-200">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Sparkles size={22} className="text-primary" strokeWidth={2.5} />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-base font-bold text-foreground">
                      Changer de formule
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Passez à une offre supérieure
                    </p>
                  </div>
                  <ChevronRight
                    size={22}
                    className="text-primary group-hover:translate-x-1 transition-transform"
                  />
                </div>
              </button>

              {/* Gérer via Stripe */}
              {/* {customerInfo?.managementURL && (
                <button
                  type="button"
                  onClick={handleManageSubscription}
                  className="w-full group"
                >
                  <div className="blyss-card flex items-center gap-4 group-hover:border-primary/20 group-active:scale-[0.98] transition-all duration-200">
                    <div className="w-12 h-12 rounded-xl bg-muted/60 flex items-center justify-center group-hover:bg-muted transition-colors">
                      <ExternalLink size={20} className="text-muted-foreground" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-[15px] font-semibold text-foreground">
                        Gérer mon abonnement
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Modifier ou annuler via Stripe
                      </p>
                    </div>
                    <ChevronRight
                      size={20}
                      className="text-muted-foreground group-hover:translate-x-1 transition-transform"
                    />
                  </div>
                </button>
              )} */}

              {/* Historique */}
              <button
                type="button"
                onClick={handleViewHistory}
                className="w-full group"
              >
                <div className="blyss-card flex items-center gap-4 group-hover:border-primary/20 group-active:scale-[0.98] transition-all duration-200">
                  <div className="w-12 h-12 rounded-xl bg-muted/60 flex items-center justify-center group-hover:bg-muted transition-colors">
                    <Calendar size={20} className="text-muted-foreground" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-[15px] font-semibold text-foreground">
                      Historique & factures
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Consultez vos paiements passés
                    </p>
                  </div>
                  <ChevronRight
                    size={20}
                    className="text-muted-foreground group-hover:translate-x-1 transition-transform"
                  />
                </div>
              </button>

              {/* Restaurer les achats */}
              {/* <button
                type="button"
                onClick={handleRestore}
                disabled={isRestoring}
                className="w-full group disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="blyss-card flex items-center gap-4 group-hover:border-primary/20 group-active:scale-[0.98] transition-all duration-200">
                  <div className="w-12 h-12 rounded-xl bg-muted/60 flex items-center justify-center group-hover:bg-muted transition-colors">
                    <RefreshCw 
                      size={20} 
                      className={`text-muted-foreground transition-transform ${isRestoring ? "animate-spin" : "group-hover:rotate-180"}`}
                    />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-[15px] font-semibold text-foreground">
                      {isRestoring ? "Restauration en cours..." : "Restaurer les achats"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Récupérer un abonnement existant
                    </p>
                  </div>
                  <ChevronRight
                    size={20}
                    className="text-muted-foreground group-hover:translate-x-1 transition-transform"
                  />
                </div>
              </button> */}
            </div>
          </section>

          {/* Info supplémentaire */}
          <section className="pt-2">
            <div className="blyss-card bg-muted/30 border-border/50">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <AlertCircle size={16} className="text-primary" />
                </div>
                <div className="flex-1 space-y-1">
                  <p className="text-xs font-semibold text-foreground">
                    Besoin d'aide ?
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Pour toute question sur votre abonnement, contactez notre support à{" "}
                    <a href="mailto:support@blyssapp.fr" className="text-primary font-medium hover:underline">
                      support@blyssapp.fr
                    </a>
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </MobileLayout>
  );
};

export default ProSubscriptionSettings;
