import MobileLayout from "@/components/MobileLayout";
import { ChevronLeft, Check, AlertCircle, CreditCard, Shield, ExternalLink, Loader2 } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { stripeApi } from "@/services/api";
import { toast } from "sonner";

const DEPOSIT_OPTIONS = [0, 30, 50, 100] as const;

const ProPayments = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [onboarding, setOnboarding] = useState(false);
  const [hasAccount, setHasAccount] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [depositPercentage, setDepositPercentage] = useState(50);
  const [savingDeposit, setSavingDeposit] = useState(false);

  const fetchAccount = async () => {
    try {
      const res = await stripeApi.getAccount();
      if (res.success && res.data) {
        setHasAccount(res.data.has_account);
        setOnboardingComplete(res.data.onboarding_complete);
        setDepositPercentage(res.data.deposit_percentage);
      }
    } catch (error) {
      console.error("Error fetching Stripe account:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccount();
  }, []);

  // Handle Stripe return/refresh from onboarding
  useEffect(() => {
    if (searchParams.get("stripe_return") === "true" || searchParams.get("stripe_refresh") === "true") {
      setLoading(true);
      stripeApi.checkOnboardReturn().then((res) => {
        if (res.success && res.data) {
          setOnboardingComplete(res.data.onboarding_complete);
          setHasAccount(true);
          if (res.data.onboarding_complete) {
            toast.success("Paiements configurés avec succès !");
          } else {
            toast.info("Configuration en cours. Complète ton inscription Stripe.");
          }
        }
        setLoading(false);
      });
      // Clean URL params
      window.history.replaceState({}, "", "/pro/payments");
    }
  }, [searchParams]);

  const handleStartOnboarding = async () => {
    setOnboarding(true);
    try {
      const res = await stripeApi.onboard();
      if (res.success && res.data?.url) {
        window.location.href = res.data.url;
      } else {
        toast.error("Impossible de lancer la configuration Stripe.");
        setOnboarding(false);
      }
    } catch (error) {
      console.error("Onboarding error:", error);
      toast.error("Erreur de connexion.");
      setOnboarding(false);
    }
  };

  const handleDepositChange = async (pct: number) => {
    setSavingDeposit(true);
    try {
      const res = await stripeApi.updateDeposit(pct);
      if (res.success) {
        setDepositPercentage(pct);
        toast.success(`Acompte mis à jour : ${pct}%`);
      } else {
        toast.error("Erreur de mise à jour");
      }
    } catch {
      toast.error("Erreur de connexion");
    } finally {
      setSavingDeposit(false);
    }
  };

  if (loading) {
    return (
      <MobileLayout showNav={false}>
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="animate-spin text-primary" size={32} />
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout showNav={false}>
      <div className="min-h-screen py-6">
        {/* Header */}
        <div className="relative -mx-4 px-4 pt-2 pb-6 mb-6">
          <div className="flex items-center mb-3">
            <button
              onClick={() => navigate("/pro/profile")}
              className="w-10 h-10 rounded-xl bg-muted hover:bg-muted-foreground/10 flex items-center justify-center active:scale-95 transition-all mr-3"
            >
              <ChevronLeft size={20} className="text-foreground" />
            </button>
            <div className="flex-1">
              <h1 className="font-display text-2xl font-bold text-foreground">
                Encaissements
              </h1>
            </div>
          </div>
          <p className="text-muted-foreground text-sm">
            Configure tes paiements via Stripe Connect.
          </p>
        </div>

        {/* Stripe Connect Status */}
        <div className="space-y-4 mb-6">
          <div className="flex items-center gap-2 px-1">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Compte Stripe
            </h2>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
          </div>

          <div className="blyss-card flex flex-col gap-4 hover:shadow-lg transition-shadow duration-300">
            {!hasAccount ? (
              /* No account - show setup button */
              <>
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center flex-shrink-0 shadow-lg">
                    <CreditCard size={20} className="text-white" />
                  </div>
                  <div className="flex-1 pt-1">
                    <p className="text-base font-semibold text-foreground mb-1">
                      Configure tes paiements
                    </p>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Connecte ton compte bancaire via Stripe pour recevoir les paiements de tes clientes directement sur ton compte.
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleStartOnboarding}
                  disabled={onboarding}
                  className="w-full py-4 rounded-2xl font-semibold text-sm gradient-gold text-secondary-foreground active:scale-[0.97] shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center gap-2"
                >
                  {onboarding ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Redirection vers Stripe...
                    </>
                  ) : (
                    <>
                      <ExternalLink size={18} />
                      Configurer mes paiements
                    </>
                  )}
                </button>
              </>
            ) : !onboardingComplete ? (
              /* Account exists but onboarding incomplete */
              <>
                <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
                  <div className="flex items-start gap-2">
                    <AlertCircle size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-amber-700 mb-1">
                        Configuration incomplète
                      </p>
                      <p className="text-xs text-amber-600 leading-relaxed">
                        Ton compte Stripe nécessite des informations supplémentaires pour activer les paiements.
                      </p>
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleStartOnboarding}
                  disabled={onboarding}
                  className="w-full py-4 rounded-2xl font-semibold text-sm gradient-gold text-secondary-foreground active:scale-[0.97] shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center gap-2"
                >
                  {onboarding ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Redirection...
                    </>
                  ) : (
                    <>
                      <ExternalLink size={18} />
                      Compléter la configuration
                    </>
                  )}
                </button>
              </>
            ) : (
              /* Onboarding complete - show active status */
              <div className="p-3 rounded-xl bg-green-500/5 border border-green-500/20">
                <div className="flex items-start gap-2">
                  <Check size={16} className="text-green-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-green-700 mb-1">
                      Paiements actifs
                    </p>
                    <p className="text-xs text-green-600 leading-relaxed">
                      Ton compte Stripe est configuré. Tu peux recevoir les paiements de tes clientes.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Deposit configuration - only show when onboarding is complete */}
        {onboardingComplete && (
          <div className="space-y-4 mb-6">
            <div className="flex items-center gap-2 px-1">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
              <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Acompte
              </h2>
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
            </div>

            <div className="blyss-card flex flex-col gap-4 hover:shadow-lg transition-shadow duration-300">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <CreditCard size={18} className="text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foreground mb-1">
                    Pourcentage d'acompte
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Le montant que tes clientes paieront à la réservation en ligne. Le solde sera réglé sur place ou via l'app.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {DEPOSIT_OPTIONS.map((pct) => (
                  <button
                    key={pct}
                    onClick={() => handleDepositChange(pct)}
                    disabled={savingDeposit}
                    className={`
                      py-3 rounded-xl text-sm font-semibold transition-all duration-200
                      ${depositPercentage === pct
                        ? "bg-primary text-white shadow-lg shadow-primary/30 scale-105"
                        : "bg-muted text-muted-foreground hover:bg-muted-foreground/10"
                      }
                    `}
                  >
                    {pct === 0 ? "Aucun" : `${pct}%`}
                  </button>
                ))}
              </div>

              <p className="text-xs text-muted-foreground text-center">
                {depositPercentage === 0
                  ? "Pas d'acompte. Les clientes paient uniquement sur place."
                  : depositPercentage === 100
                  ? "Paiement intégral à la réservation."
                  : `${depositPercentage}% du montant sera payé à la réservation. Le solde sera réglé après la prestation.`}
              </p>
            </div>
          </div>
        )}

        {/* Security block */}
        <div className="blyss-card mb-6 bg-gradient-to-br from-muted/50 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Shield size={18} className="text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-semibold text-foreground mb-1">
                Sécurité Stripe
              </p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Tes paiements sont gérés par Stripe, leader mondial du paiement en ligne. Tes données bancaires ne transitent jamais par Blyss.
              </p>
            </div>
          </div>
        </div>
      </div>
    </MobileLayout>
  );
};

export default ProPayments;
