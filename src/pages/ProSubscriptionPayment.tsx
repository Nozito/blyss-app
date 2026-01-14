import { useState } from "react";
import MobileLayout from "@/components/MobileLayout";
import {
  ArrowLeft,
  CreditCard,
  Lock,
  Shield,
  Check,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";

interface LocationState {
  plan: {
    id: string;
    name: string;
    price: number;
    commitment: number | null;
    billingType: "monthly" | "one_time";
  };
}

const ProSubscriptionPayment = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { plan } = (location.state as LocationState) || {};

  const [cardNumber, setCardNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [cvv, setCvv] = useState("");
  const [cardHolder, setCardHolder] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  if (!plan) {
    navigate("/pro/subscription");
    return null;
  }

  // Formatage automatique du numéro de carte
  const handleCardNumberChange = (value: string) => {
    const cleaned = value.replace(/\s/g, "");
    const formatted = cleaned.match(/.{1,4}/g)?.join(" ") || cleaned;
    setCardNumber(formatted.slice(0, 19)); // 16 chiffres + 3 espaces
  };

  // Formatage de la date d'expiration
  const handleExpiryChange = (value: string) => {
    const cleaned = value.replace(/\D/g, "");
    if (cleaned.length >= 2) {
      setExpiryDate(`${cleaned.slice(0, 2)}/${cleaned.slice(2, 4)}`);
    } else {
      setExpiryDate(cleaned);
    }
  };

  // Validation simple
  const validate = () => {
    const newErrors: { [key: string]: string } = {};

    if (cardNumber.replace(/\s/g, "").length !== 16) {
      newErrors.cardNumber = "Numéro de carte invalide";
    }
    if (!expiryDate.match(/^\d{2}\/\d{2}$/)) {
      newErrors.expiryDate = "Format: MM/AA";
    }
    if (cvv.length !== 3) {
      newErrors.cvv = "CVV invalide";
    }
    if (cardHolder.trim().length < 3) {
      newErrors.cardHolder = "Nom requis";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handlePayment = async () => {
    if (!validate()) return;

    setIsProcessing(true);

    // Simulation de paiement (2 secondes)
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Appel API pour créer l'abonnement
    try {
      const token = localStorage.getItem("access_token");
      const today = new Date();
      const startDate = today.toISOString().slice(0, 10);

      let endDate: string | null = null;
      if (plan.billingType === "one_time" && plan.commitment) {
        const end = new Date(today);
        end.setMonth(end.getMonth() + plan.commitment);
        endDate = end.toISOString().slice(0, 10);
      }

      const res = await fetch("http://localhost:3001/api/subscriptions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          plan: plan.id,
          billingType: plan.billingType,
          monthlyPrice: plan.price,
          totalPrice: plan.billingType === "one_time" ? plan.price : null,
          commitmentMonths: plan.commitment,
          startDate,
          endDate,
        }),
      });

      const data = await res.json();
      if (data.success) {
        // Redirection vers la confirmation
        navigate("/pro/subscription/success", {
          state: { plan },
        });
      } else {
        throw new Error("Payment failed");
      }
    } catch (error) {
      alert("Erreur lors du paiement. Réessaye.");
      setIsProcessing(false);
    }
  };

  return (
    <MobileLayout showNav={false}>
      <div className="min-h-screen pb-6">
        {/* Header */}
        <div className="sticky top-0 bg-background/95 backdrop-blur-lg z-10 border-b border-border/50 -mx-4 px-4 py-4 mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="w-9 h-9 rounded-full bg-muted/50 flex items-center justify-center active:scale-95 transition-transform"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="flex-1">
              <h1 className="text-lg font-semibold text-foreground">Paiement</h1>
              <p className="text-xs text-muted-foreground">
                Formule {plan.name} · {plan.price}€
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* Récapitulatif */}
          <div className="blyss-card bg-gradient-to-br from-primary/5 to-transparent border-2 border-primary/20">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-base font-bold text-foreground">
                  {plan.name}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {plan.commitment
                    ? `Engagement ${plan.commitment} mois`
                    : "Sans engagement"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-primary">{plan.price}€</p>
                <p className="text-xs text-muted-foreground">
                  {plan.billingType === "one_time" ? "Paiement unique" : "Par mois"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200">
              <Check size={14} className="text-emerald-600" />
              <span className="text-xs font-semibold text-emerald-700">
                Annulation à tout moment
              </span>
            </div>
          </div>

          {/* Formulaire de carte */}
          <div className="blyss-card space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <CreditCard size={20} className="text-primary" />
              <h3 className="text-sm font-bold text-foreground">
                Informations de paiement
              </h3>
            </div>

            {/* Numéro de carte */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-2 block">
                Numéro de carte
              </label>
              <input
                type="text"
                placeholder="1234 5678 9012 3456"
                value={cardNumber}
                onChange={(e) => handleCardNumberChange(e.target.value)}
                className={`w-full px-4 py-3 rounded-xl border-2 transition-all ${
                  errors.cardNumber
                    ? "border-destructive"
                    : "border-muted focus:border-primary"
                }`}
              />
              {errors.cardNumber && (
                <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                  <AlertCircle size={12} />
                  {errors.cardNumber}
                </p>
              )}
            </div>

            {/* Expiration + CVV */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-2 block">
                  Expiration
                </label>
                <input
                  type="text"
                  placeholder="MM/AA"
                  value={expiryDate}
                  onChange={(e) => handleExpiryChange(e.target.value)}
                  maxLength={5}
                  className={`w-full px-4 py-3 rounded-xl border-2 transition-all ${
                    errors.expiryDate
                      ? "border-destructive"
                      : "border-muted focus:border-primary"
                  }`}
                />
                {errors.expiryDate && (
                  <p className="text-xs text-destructive mt-1">
                    {errors.expiryDate}
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-2 block">
                  CVV
                </label>
                <input
                  type="text"
                  placeholder="123"
                  value={cvv}
                  onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").slice(0, 3))}
                  maxLength={3}
                  className={`w-full px-4 py-3 rounded-xl border-2 transition-all ${
                    errors.cvv
                      ? "border-destructive"
                      : "border-muted focus:border-primary"
                  }`}
                />
                {errors.cvv && (
                  <p className="text-xs text-destructive mt-1">{errors.cvv}</p>
                )}
              </div>
            </div>

            {/* Titulaire */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-2 block">
                Titulaire de la carte
              </label>
              <input
                type="text"
                placeholder="MARIE BEAUTE"
                value={cardHolder}
                onChange={(e) => setCardHolder(e.target.value.toUpperCase())}
                className={`w-full px-4 py-3 rounded-xl border-2 transition-all ${
                  errors.cardHolder
                    ? "border-destructive"
                    : "border-muted focus:border-primary"
                }`}
              />
              {errors.cardHolder && (
                <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                  <AlertCircle size={12} />
                  {errors.cardHolder}
                </p>
              )}
            </div>
          </div>

          {/* Sécurité */}
          <div className="blyss-card bg-muted/30">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Shield size={18} className="text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold text-foreground mb-1">
                  Paiement 100% sécurisé
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Tes données bancaires sont chiffrées et conformes aux normes PCI-DSS.
                  Nous ne stockons jamais ton numéro de carte.
                </p>
              </div>
            </div>
          </div>

          {/* Bouton payer */}
          <button
            onClick={handlePayment}
            disabled={isProcessing}
            className="w-full py-4 rounded-2xl bg-primary text-white font-semibold text-base disabled:opacity-50 active:scale-[0.98] transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
          >
            {isProcessing ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Paiement en cours...
              </>
            ) : (
              <>
                <Lock size={18} />
                Payer {plan.price}€
              </>
            )}
          </button>

          <p className="text-xs text-center text-muted-foreground">
            En continuant, tu acceptes les{" "}
            <span className="text-primary underline">conditions générales</span>
          </p>
        </div>
      </div>
    </MobileLayout>
  );
};

export default ProSubscriptionPayment;