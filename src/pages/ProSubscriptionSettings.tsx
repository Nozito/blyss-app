import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import MobileLayout from "@/components/MobileLayout";
import { CreditCard, Calendar, AlertTriangle, ChevronRight, Settings } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

type SubscriptionStatus = "active" | "cancelled" | "expired";

interface Subscription {
  plan: "start" | "serenite" | "signature";
  billingType: "monthly" | "one_time";
  monthlyPrice: number;
  totalPrice: number | null;
  nextBillingDate: string | null; // ISO string ou null
  status: SubscriptionStatus;
  commitmentMonths: number | null;
}

const ProSubscriptionSettings = () => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate("/login");
    }
  }, [isLoading, isAuthenticated, navigate]);

  // TODO: remplacer par un vrai fetch de ton backend
  useEffect(() => {
    // Mock pour l’UI
    setSubscription({
      plan: "serenite",
      billingType: "monthly",
      monthlyPrice: 29.9,
      totalPrice: null,
      nextBillingDate: "2026-01-15",
      status: "active",
      commitmentMonths: 3
    });
  }, []);

  const formatDate = (iso: string | null) => {
    if (!iso) return null;
    const d = new Date(iso);
    return d.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric"
    });
  };

  const getPlanLabel = (plan: Subscription["plan"]) => {
    if (plan === "start") return "Formule Start";
    if (plan === "serenite") return "Formule Sérénité";
    return "Formule Signature";
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
      // TODO: call backend /api/subscriptions/cancel
      await new Promise((res) => setTimeout(res, 800));
      setSubscription((prev) =>
        prev ? { ...prev, status: "cancelled", nextBillingDate: null } : prev
      );
      toast.success("Ton abonnement a bien été résilié.");
    } catch (e) {
      toast.error("Impossible de résilier l’abonnement pour le moment.");
    } finally {
      setIsWorking(false);
    }
  };

  const handleChangePlan = () => {
    // Redirige vers ton écran de pricing / upgrade
    navigate("/pro/abonnement"); // adapte selon ta route réelle
  };

  const handleViewHistory = () => {
    // TODO: plus tard -> page historique factures
    toast.info("L’historique des factures arrive bientôt.");
  };

  const isActive = subscription?.status === "active";

  return (
    <MobileLayout>
      <div className="py-6 space-y-6 animate-fade-in">
        {/* Header */}
        <header className="space-y-1">
          <h1 className="text-xl font-semibold text-foreground">
            Mon abonnement
          </h1>
          <p className="text-xs text-muted-foreground">
            Gère ton offre Blyss Pro en toute autonomie.
          </p>
        </header>

        {/* Carte principale */}
        <section className="blyss-card space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <CreditCard size={20} className="text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {subscription
                    ? getPlanLabel(subscription.plan)
                    : "Chargement de ton offre..."}
                </p>
                {subscription && (
                  <p className="text-[11px] text-muted-foreground">
                    {getBillingLabel(subscription.billingType)} ·{" "}
                    {subscription.billingType === "monthly"
                      ? `${subscription.monthlyPrice.toFixed(2)}€ / mois`
                      : subscription.totalPrice
                      ? `${subscription.totalPrice.toFixed(2)}€ payé`
                      : ""}
                  </p>
                )}
              </div>
            </div>
            {subscription && (
              <span
                className={`
                  inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium
                  ${
                    subscription.status === "active"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-muted text-muted-foreground"
                  }
                `}
              >
                {subscription.status === "active" ? "Actif" : "Résilié"}
              </span>
            )}
          </div>

          {subscription && (
            <div className="space-y-1 text-[11px] text-muted-foreground">
              {subscription.commitmentMonths && (
                <p>
                  Engagement : {subscription.commitmentMonths} mois.
                </p>
              )}
              {isActive && subscription.nextBillingDate && (
                <p>
                  Prochain prélèvement le{" "}
                  <span className="font-medium text-foreground">
                    {formatDate(subscription.nextBillingDate)}
                  </span>
                  .
                </p>
              )}
              {!isActive && (
                <p>
                  Ton abonnement est résilié. Tu gardes l’accès jusqu’à la fin
                  de ta période en cours.
                </p>
              )}
            </div>
          )}
        </section>

        {/* Actions */}
        <section className="space-y-3">
          <button
            type="button"
            onClick={handleChangePlan}
            className="w-full flex items-center justify-between px-4 py-3 rounded-2xl bg-card border border-border active:scale-[0.98] transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                <Settings size={18} className="text-primary" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-foreground">
                  Modifier mon offre
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Passe à une formule supérieure ou inférieure.
                </p>
              </div>
            </div>
            <ChevronRight size={18} className="text-muted-foreground" />
          </button>

          <button
            type="button"
            onClick={handleViewHistory}
            className="w-full flex items-center justify-between px-4 py-3 rounded-2xl bg-card border border-border active:scale-[0.98] transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
                <Calendar size={18} className="text-muted-foreground" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-foreground">
                  Historique & factures
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Consulte tes anciennes factures et paiements.
                </p>
              </div>
            </div>
            <ChevronRight size={18} className="text-muted-foreground" />
          </button>

          <button
            type="button"
            onClick={handleCancelSubscription}
            disabled={!isActive || isWorking}
            className="w-full flex items-center justify-between px-4 py-3 rounded-2xl bg-destructive/5 border border-destructive/30 active:scale-[0.98] transition-all disabled:opacity-60"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertTriangle size={18} className="text-destructive" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-destructive">
                  Résilier mon abonnement
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Tu garderas l’accès jusqu’à la fin de la période en cours.
                </p>
              </div>
            </div>
          </button>
        </section>

        {/* Texte rassurant */}
        <p className="text-[11px] text-muted-foreground text-center mt-4 px-6">
          Tu peux revenir à tout moment sur Blyss Pro en réactivant un
          abonnement.
        </p>
      </div>
    </MobileLayout>
  );
};

export default ProSubscriptionSettings;
