import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import MobileLayout from "@/components/MobileLayout";
import {
  CreditCard,
  Calendar,
  AlertTriangle,
  ChevronRight,
  Settings,
  Sparkles,
  ArrowLeft,
  Zap,
  Heart,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import api from "@/services/api";

type SubscriptionStatus = "active" | "cancelled" | "expired";

interface Subscription {
  plan: "start" | "serenite" | "signature";
  billingType: "monthly" | "one_time";
  monthlyPrice: number;
  totalPrice: number | null;
  nextBillingDate: string | null;
  status: SubscriptionStatus;
  commitmentMonths: number | null;
}

const ProSubscriptionSettings = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [loadingSub, setLoadingSub] = useState(true);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate("/login");
    }
  }, [isLoading, isAuthenticated, navigate]);

  useEffect(() => {
    const fetchSubscription = async () => {
      try {
        if (!isAuthenticated) return;

        setLoadingSub(true);
        const res = await api.pro.getSubscription();
        if (!res.success) {
          throw new Error(res.error || "Erreur serveur");
        }

        const data = res.data;
        if (!data) {
          setSubscription(null);
          return;
        }

        const nextBillingDate = null;

        setSubscription({
          plan: data.plan,
          billingType: data.billingType,
          monthlyPrice: data.monthlyPrice,
          totalPrice: data.totalPrice,
          status: data.status as SubscriptionStatus,
          commitmentMonths: data.commitmentMonths,
          nextBillingDate,
        });
      } catch (e) {
        console.error(e);
        toast.error("Impossible de charger ton abonnement.");
      } finally {
        setLoadingSub(false);
      }
    };

    fetchSubscription();
  }, [isAuthenticated]);

  const formatDate = (iso: string | null) => {
    if (!iso) return null;
    const d = new Date(iso);
    return d.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  };

  const getPlanLabel = (plan: Subscription["plan"]) => {
    if (plan === "start") return "Formule Start";
    if (plan === "serenite") return "Formule Sérénité";
    return "Formule Signature";
  };

  const getPlanIcon = (plan: Subscription["plan"]) => {
    if (plan === "start") return Zap;
    if (plan === "serenite") return Heart;
    return Sparkles;
  };

  const getBillingLabel = (billingType: Subscription["billingType"]) =>
    billingType === "monthly" ? "Mensuel" : "Paiement en une fois";

  const handleCancelSubscription = async () => {
    if (!subscription || subscription.status !== "active") return;
    if (!window.confirm("Tu es sûre de vouloir résilier ton abonnement ?")) {
      return;
    }

    try {
      setIsWorking(true);
      const res = await api.pro.cancelSubscription();
      if (!res.success) {
        throw new Error(res.error || "Erreur serveur");
      }

      setSubscription((prev) =>
        prev ? { ...prev, status: "cancelled", nextBillingDate: null } : prev
      );
      toast.success("Ton abonnement a bien été résilié.");
    } catch (e) {
      console.error(e);
      toast.error("Impossible de résilier l'abonnement pour le moment.");
    } finally {
      setIsWorking(false);
    }
  };

  const handleChangePlan = () => {
    navigate("/pro/subscription");
  };

  const handleViewHistory = () => {
    toast.info("L'historique des factures arrive bientôt.");
  };

  const isActive = subscription?.status === "active";
  const PlanIcon = subscription ? getPlanIcon(subscription.plan) : Sparkles;

  if (loadingSub) {
    return (
      <MobileLayout showNav={false}>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">Chargement...</p>
          </div>
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout showNav={false}>
      <div className="pb-6 animate-fade-in">
        {/* Header iOS-style avec bouton retour */}
        <div className="sticky top-0 bg-background/95 backdrop-blur-lg z-10 -mx-4 px-4 py-4 mb-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="w-9 h-9 rounded-full bg-muted/50 flex items-center justify-center active:scale-95 transition-transform"
            >
              <ArrowLeft size={18} className="text-foreground" />
            </button>
            <div className="flex-1">
              <h1 className="text-lg font-semibold text-foreground">
                Mon abonnement
              </h1>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* Carte abonnement premium */}
          <section className="relative">
            <div className="blyss-card bg-gradient-to-br from-primary/5 via-background to-accent/5 border-primary/10 space-y-5 overflow-hidden">
              {/* Badge statut flottant */}
              {subscription && (
                <div className="absolute right-3 top-3">
                  <div
                    className={`
                      inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold backdrop-blur-xl
                      ${subscription.status === "active"
                        ? "bg-emerald-500/10 text-emerald-700 border border-emerald-200/50 shadow-sm"
                        : "bg-muted/80 text-muted-foreground border border-border/50"
                      }
                    `}
                  >
                    <div
                      className={`w-1.5 h-1.5 rounded-full ${subscription.status === "active"
                        ? "bg-emerald-500 animate-pulse"
                        : "bg-muted-foreground"
                        }`}
                    />
                    {subscription.status === "active" ? "Actif" : "Résilié"}
                  </div>
                </div>
              )}

              {/* Contenu principal */}
              <div className="flex items-start gap-4 pr-20">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg shadow-primary/20">
                  <PlanIcon size={26} className="text-white" />
                </div>
                <div className="flex-1 space-y-1.5 pt-1">
                  <p className="text-base font-bold text-foreground">
                    {subscription
                      ? getPlanLabel(subscription.plan)
                      : "Chargement..."}
                  </p>
                  {subscription && (
                    <>
                      <p className="text-[13px] text-muted-foreground font-medium">
                        {getBillingLabel(subscription.billingType)}
                      </p>
                      <p className="text-xl font-bold text-primary">
                        {subscription.billingType === "monthly"
                          ? `${Number(subscription.monthlyPrice || 0).toFixed(0)}€`
                          : subscription.totalPrice !== null
                            ? `${Number(subscription.totalPrice).toFixed(0)}€`
                            : ''}
                        {subscription.billingType === "monthly" && (
                          <span className="text-sm text-muted-foreground font-normal">
                            {" "}
                            / mois
                          </span>
                        )}
                      </p>

                    </>
                  )}
                </div>
              </div>

              {/* Détails */}
              {subscription && (
                <>
                  <div className="h-px bg-gradient-to-r from-transparent via-border/50 to-transparent" />
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">
                        Engagement
                      </p>
                      <p className="text-sm font-semibold text-foreground">
                        {subscription.commitmentMonths
                          ? `${subscription.commitmentMonths} mois`
                          : "Sans engagement"}
                      </p>
                    </div>
                    {isActive && subscription.nextBillingDate && (
                      <div className="space-y-1">
                        <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">
                          Prochain paiement
                        </p>
                        <p className="text-sm font-semibold text-foreground">
                          {formatDate(subscription.nextBillingDate)}
                        </p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </section>

          {/* Actions groupées */}
          <section className="space-y-3">
            <h2 className="text-[13px] font-bold text-foreground uppercase tracking-wide px-1">
              Gérer mon abonnement
            </h2>

            <div className="space-y-2">
              {/* Modifier l'offre */}
              <button
                type="button"
                onClick={handleChangePlan}
                className="w-full group"
              >
                <div className="blyss-card flex items-center gap-4 group-active:scale-[0.98] transition-all">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center group-active:scale-95 transition-transform">
                    <Sparkles size={20} className="text-primary" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-[15px] font-semibold text-foreground">
                      Changer de formule
                    </p>
                    <p className="text-[12px] text-muted-foreground mt-0.5">
                      Passe à une offre supérieure
                    </p>
                  </div>
                  <ChevronRight
                    size={20}
                    className="text-muted-foreground group-active:translate-x-1 transition-transform"
                  />
                </div>
              </button>

              {/* Historique */}
              <button
                type="button"
                onClick={handleViewHistory}
                className="w-full group"
              >
                <div className="blyss-card flex items-center gap-4 group-active:scale-[0.98] transition-all">
                  <div className="w-11 h-11 rounded-xl bg-muted/50 flex items-center justify-center group-active:scale-95 transition-transform">
                    <Calendar size={20} className="text-muted-foreground" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-[15px] font-semibold text-foreground">
                      Historique & factures
                    </p>
                    <p className="text-[12px] text-muted-foreground mt-0.5">
                      Consulte tes paiements
                    </p>
                  </div>
                  <ChevronRight
                    size={20}
                    className="text-muted-foreground group-active:translate-x-1 transition-transform"
                  />
                </div>
              </button>
            </div>
          </section>

          {/* Zone danger */}
          {isActive && subscription && (
            <section className="space-y-3 pt-4">
              <h2 className="text-[13px] font-bold text-destructive uppercase tracking-wide px-1">
                Zone sensible
              </h2>

              <button
                type="button"
                onClick={handleCancelSubscription}
                disabled={isWorking}
                className="w-full group disabled:opacity-50 disabled:pointer-events-none"
              >
                <div className="bg-destructive/10 border-2 border-destructive/30 rounded-2xl p-4 flex items-center gap-4 group-active:scale-[0.98] transition-all shadow-sm">
                  <div className="w-11 h-11 rounded-xl bg-destructive flex items-center justify-center group-active:scale-95 transition-transform shadow-md">
                    <AlertTriangle size={20} className="text-white" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-[15px] font-bold text-destructive">
                      Résilier mon abonnement
                    </p>
                    <p className="text-[12px] text-destructive/70 mt-0.5 font-medium">
                      Accès maintenu jusqu'à la fin de période
                    </p>
                  </div>
                </div>
              </button>
            </section>
          )}

          {/* Footer info */}
          <div className="pt-6 pb-2">
            <div className="blyss-card bg-accent/30 border-accent/50">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Sparkles size={16} className="text-primary" />
                </div>
                <p className="text-[12px] text-muted-foreground leading-relaxed">
                  Tu peux revenir sur{" "}
                  <span className="font-semibold text-foreground">
                    Blyss Pro
                  </span>{" "}
                  quand tu le souhaites. Ton profil et tes clientes restent
                  sauvegardés.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </MobileLayout>
  );
};

export default ProSubscriptionSettings;
