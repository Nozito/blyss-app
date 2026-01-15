import MobileLayout from "@/components/MobileLayout";
import { ArrowLeft, AlertCircle, Check, Lock, CreditCard, Shield, Sparkles } from "lucide-react";
import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";

interface LocationState {
  plan: {
    id: string;
    name: string;
    price: number;
    billingType: "monthly" | "one_time";
    commitment?: number;
    monthlyPrice?: number;
    totalPrice?: number;
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
  const [isValidating, setIsValidating] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [cardType, setCardType] = useState<"visa" | "mastercard" | null>(null);

  if (!plan) {
    navigate("/pro/subscription");
    return null;
  }

  const detectCardType = (number: string): "visa" | "mastercard" | null => {
    const cleaned = number.replace(/\s/g, "");
    if (/^4/.test(cleaned)) return "visa";
    if (/^5[1-5]/.test(cleaned) || /^2[2-7]/.test(cleaned)) return "mastercard";
    return null;
  };

  const handleCardNumberChange = (value: string) => {
    const cleaned = value.replace(/\D/g, "");
    const formatted = cleaned.match(/.{1,4}/g)?.join(" ") || cleaned;
    setCardNumber(formatted.slice(0, 19));
    setCardType(detectCardType(cleaned));
    if (errors.cardNumber) setErrors({ ...errors, cardNumber: "" });
  };

  const handleExpiryChange = (value: string) => {
    const cleaned = value.replace(/\D/g, "");
    if (cleaned.length >= 2) {
      setExpiryDate(`${cleaned.slice(0, 2)}/${cleaned.slice(2, 4)}`);
    } else {
      setExpiryDate(cleaned);
    }
    if (errors.expiryDate) setErrors({ ...errors, expiryDate: "" });
  };

  const validate = () => {
    const newErrors: { [key: string]: string } = {};
    const cleanedCard = cardNumber.replace(/\s/g, "");

    if (cleanedCard.length !== 16) {
      newErrors.cardNumber = "Le numéro doit contenir 16 chiffres";
    } else if (!cardType) {
      newErrors.cardNumber = "Commencez par 4 (Visa) ou 5 (Mastercard)";
    }

    if (!expiryDate.match(/^\d{2}\/\d{2}$/)) {
      newErrors.expiryDate = "Format: MM/AA";
    } else {
      const [month, year] = expiryDate.split('/').map(Number);
      const now = new Date();
      const currentYear = now.getFullYear() % 100;
      const currentMonth = now.getMonth() + 1;

      if (month < 1 || month > 12) {
        newErrors.expiryDate = "Mois invalide (01-12)";
      } else if (year < currentYear || (year === currentYear && month < currentMonth)) {
        newErrors.expiryDate = "Carte expirée";
      }
    }

    if (cvv.length !== 3) {
      newErrors.cvv = "Le CVV doit contenir 3 chiffres";
    }

    if (cardHolder.trim().length < 3) {
      newErrors.cardHolder = "Le nom doit contenir au moins 3 caractères";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handlePayment = async () => {
    if (!validate()) return;

    setIsProcessing(true);
    setErrors({});

    try {
      const token = localStorage.getItem("access_token");
      if (!token) {
        throw new Error("Non authentifié");
      }

      // ✅ Afficher l'overlay de validation
      setIsValidating(true);
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const paymentResult = await simulatePayment({
        cardNumber: cardNumber.replace(/\s/g, ""),
        expiryDate,
        cvv,
        cardHolder,
        amount: plan.price,
        cardType,
      });

      if (!paymentResult.success) {
        setIsValidating(false);
        throw new Error(paymentResult.error || "Paiement refusé");
      }

      const today = new Date();
      const startDate = today.toISOString().slice(0, 10);

      let endDate: string | null = null;
      if (plan.billingType === "one_time" && plan.commitment) {
        const end = new Date(today);
        end.setMonth(end.getMonth() + plan.commitment);
        endDate = end.toISOString().slice(0, 10);
      }

      // ✅ CORRECTION : Envoyer monthlyPrice et totalPrice correctement
      const res = await fetch("http://localhost:3001/api/subscriptions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          plan: plan.id,
          billingType: plan.billingType,
          monthlyPrice: plan.billingType === "monthly" ? plan.price : (plan.monthlyPrice || plan.price),
          totalPrice: plan.billingType === "one_time" ? plan.price : null,
          commitmentMonths: plan.commitment || null,
          startDate,
          endDate,
          status: "active",
          paymentId: paymentResult.paymentId,
        }),
      });

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.message || "Échec création abonnement");
      }

      await new Promise((resolve) => setTimeout(resolve, 800));

      navigate("/pro/subscription-success", {
        state: {
          plan,
          subscriptionId: data.data.id,
        },
      });
    } catch (error: any) {
      console.error("Erreur paiement:", error);
      setErrors({
        general: error.message || "Erreur lors du paiement. Réessaye.",
      });
      setIsValidating(false);
    } finally {
      setIsProcessing(false);
    }
  };

  const simulatePayment = async (paymentData: any): Promise<{
    success: boolean;
    paymentId?: string;
    error?: string;
  }> => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return {
      success: true,
      paymentId: `pay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };
  };

  return (
    <MobileLayout showNav={false}>
      <div className="min-h-screen pb-6 relative">
        {/* Header */}
        <div className="sticky top-0 bg-background/95 backdrop-blur-lg z-10 border-b border-border/50 -mx-4 px-4 py-4 mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              disabled={isProcessing}
              className="w-9 h-9 rounded-full bg-muted/50 flex items-center justify-center active:scale-95 transition-transform disabled:opacity-50"
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
          {errors.general && (
            <div className="blyss-card bg-destructive/10 border-2 border-destructive/30 animate-shake">
              <div className="flex items-start gap-3">
                <AlertCircle size={20} className="text-destructive flex-shrink-0 mt-0.5" />
                <p className="text-sm text-destructive font-medium">{errors.general}</p>
              </div>
            </div>
          )}

          {/* Récapitulatif */}
          <div className="blyss-card bg-gradient-to-br from-primary/5 to-transparent border-2 border-primary/20">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-base font-bold text-foreground">{plan.name}</h3>
                <p className="text-xs text-muted-foreground">
                  {plan.commitment ? `Engagement ${plan.commitment} mois` : "Sans engagement"}
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
              <h3 className="text-sm font-bold text-foreground">Informations de paiement</h3>
            </div>

            {/* Numéro de carte */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-2 block">
                Numéro de carte
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="4111 1111 1111 1111"
                  value={cardNumber}
                  onChange={(e) => handleCardNumberChange(e.target.value)}
                  disabled={isProcessing}
                  className={`w-full px-4 py-3 pr-16 rounded-xl border-2 transition-all ${errors.cardNumber
                      ? "border-destructive"
                      : cardType
                        ? "border-emerald-500"
                        : "border-muted focus:border-primary"
                    }`}
                />

                {/* Logos de cartes améliorés */}
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {cardType === "visa" && (
                    <div className="w-12 h-8 bg-white rounded flex items-center justify-center shadow-sm">
                      <img
                        src="/public/visa.svg"
                        alt="Visa Logo"
                        width={40}
                        height={13}
                      />
                    </div>
                  )}

                  {cardType === "mastercard" && (
                    <div className="w-12 h-8 bg-black rounded flex items-center justify-center shadow-sm px-1">
                      <img
                        src="/public/mastercard.svg"
                        alt="Mastercard Logo"
                        width={32}
                        height={20}
                        className="absolute"
                      />
                    </div>
                  )}

                  {!cardType && cardNumber.length > 0 && (
                    <div className="text-xs text-muted-foreground font-medium">
                      4→Visa | 5→MC
                    </div>
                  )}
                </div>

              </div>
              {errors.cardNumber && (
                <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                  <AlertCircle size={12} />
                  {errors.cardNumber}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1.5">
                💡 Test : Commence par <span className="font-semibold">4</span> pour Visa ou <span className="font-semibold">5</span> pour Mastercard
              </p>
            </div>

            {/* Expiration + CVV */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-2 block">Expiration</label>
                <input
                  type="text"
                  placeholder="12/28"
                  value={expiryDate}
                  onChange={(e) => handleExpiryChange(e.target.value)}
                  maxLength={5}
                  disabled={isProcessing}
                  className={`w-full px-4 py-3 rounded-xl border-2 transition-all ${errors.expiryDate ? "border-destructive" : "border-muted focus:border-primary"
                    }`}
                />
                {errors.expiryDate && <p className="text-xs text-destructive mt-1">{errors.expiryDate}</p>}
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-2 block">CVV</label>
                <input
                  type="text"
                  placeholder="123"
                  value={cvv}
                  onChange={(e) => {
                    setCvv(e.target.value.replace(/\D/g, "").slice(0, 3));
                    if (errors.cvv) setErrors({ ...errors, cvv: "" });
                  }}
                  maxLength={3}
                  disabled={isProcessing}
                  className={`w-full px-4 py-3 rounded-xl border-2 transition-all ${errors.cvv ? "border-destructive" : "border-muted focus:border-primary"
                    }`}
                />
                {errors.cvv && <p className="text-xs text-destructive mt-1">{errors.cvv}</p>}
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
                onChange={(e) => {
                  setCardHolder(e.target.value.toUpperCase());
                  if (errors.cardHolder) setErrors({ ...errors, cardHolder: "" });
                }}
                disabled={isProcessing}
                className={`w-full px-4 py-3 rounded-xl border-2 transition-all ${errors.cardHolder ? "border-destructive" : "border-muted focus:border-primary"
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
                <p className="text-xs font-semibold text-foreground mb-1">Paiement 100% sécurisé</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Tes données bancaires sont chiffrées et conformes aux normes PCI-DSS.
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
            {!isValidating && (
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

        {/* ✅ OVERLAY PLEIN ÉCRAN AVEC BLUR */}
        {isValidating && (
          <div className="fixed inset-0 z-50 flex items-center justify-center animate-fadeIn"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.6)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)'
            }}>
            <div className="flex flex-col items-center gap-6 animate-scaleIn">
              {/* Cercles animés */}
              <div className="relative w-24 h-24">
                {/* Cercle externe pulsant */}
                <div className="absolute inset-0 rounded-full border-4 border-white/20 animate-ping" />

                {/* Cercle rotatif */}
                <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-white border-l-white animate-spin" />

                {/* Cercle interne */}
                <div className="absolute inset-3 rounded-full bg-white/10 flex items-center justify-center">
                  <img
                    src="/src/assets/logo.png"
                    alt="Logo Blyss"
                    width={120}
                    height={120}
                    className="animate-shake"
                  />
                </div>
              </div>

              {/* Texte */}
              <div className="text-center space-y-2 px-6">
                <h3 className="text-xl font-bold text-white">
                  Validation de votre paiement
                </h3>
                <p className="text-sm text-white/80">
                  Veuillez patienter quelques instants...
                </p>

                {/* Points animés */}
                <div className="flex items-center justify-center gap-2 pt-2">
                  <div className="w-2 h-2 rounded-full bg-white animate-bounce" style={{ animationDelay: '0s' }} />
                  <div className="w-2 h-2 rounded-full bg-white animate-bounce" style={{ animationDelay: '0.2s' }} />
                  <div className="w-2 h-2 rounded-full bg-white animate-bounce" style={{ animationDelay: '0.4s' }} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-10px); }
          75% { transform: translateX(10px); }
        }
        
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes scaleIn {
          from { 
            opacity: 0; 
            transform: scale(0.8) translateY(20px);
          }
          to { 
            opacity: 1; 
            transform: scale(1) translateY(0);
          }
        }
        
        .animate-shake {
          animation: shake 0.5s ease-in-out;
        }
        
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
        
        .animate-scaleIn {
          animation: scaleIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
      `}</style>
    </MobileLayout>
  );
};

export default ProSubscriptionPayment;
