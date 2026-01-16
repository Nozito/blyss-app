import MobileLayout from "@/components/MobileLayout";
import { getApiEndpoint } from "@/services/api";
import { ArrowLeft, AlertCircle, Check, Lock, CreditCard, Shield, Sparkles, Eye, EyeOff } from "lucide-react";
import { useState, useEffect } from "react";
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
  const [showCvv, setShowCvv] = useState(false);
  const [touchedFields, setTouchedFields] = useState<{ [key: string]: boolean }>({});
  const [validatedFields, setValidatedFields] = useState<{ [key: string]: boolean }>({});

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);

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

  const validateField = (field: string, value: string): boolean => {
    switch (field) {
      case "cardNumber":
        const cleaned = value.replace(/\s/g, "");
        return cleaned.length === 16 && detectCardType(cleaned) !== null;
      case "expiryDate":
        if (!value.match(/^\d{2}\/\d{2}$/)) return false;
        const [month, year] = value.split('/').map(Number);
        const now = new Date();
        const currentYear = now.getFullYear() % 100;
        const currentMonth = now.getMonth() + 1;
        return month >= 1 && month <= 12 && (year > currentYear || (year === currentYear && month >= currentMonth));
      case "cvv":
        return value.length === 3;
      case "cardHolder":
        return value.trim().length >= 3;
      default:
        return false;
    }
  };

  const handleCardNumberChange = (value: string) => {
    const cleaned = value.replace(/\D/g, "");
    const formatted = cleaned.match(/.{1,4}/g)?.join(" ") || cleaned;
    setCardNumber(formatted.slice(0, 19));
    setCardType(detectCardType(cleaned));

    const isValid = validateField("cardNumber", formatted);
    setValidatedFields(prev => ({ ...prev, cardNumber: isValid }));

    if (touchedFields.cardNumber) {
      if (!isValid && cleaned.length === 16) {
        setErrors(prev => ({ ...prev, cardNumber: "Numéro de carte invalide" }));
      } else {
        setErrors(prev => ({ ...prev, cardNumber: "" }));
      }
    }
  };

  const handleExpiryChange = (value: string) => {
    const cleaned = value.replace(/\D/g, "");
    let formatted = cleaned;
    if (cleaned.length >= 2) {
      formatted = `${cleaned.slice(0, 2)}/${cleaned.slice(2, 4)}`;
    }
    setExpiryDate(formatted);

    if (formatted.length === 5) {
      const isValid = validateField("expiryDate", formatted);
      setValidatedFields(prev => ({ ...prev, expiryDate: isValid }));

      if (touchedFields.expiryDate) {
        if (!isValid) {
          setErrors(prev => ({ ...prev, expiryDate: "Date d'expiration invalide" }));
        } else {
          setErrors(prev => ({ ...prev, expiryDate: "" }));
        }
      }
    }
  };

  const handleCvvChange = (value: string) => {
    const cleaned = value.replace(/\D/g, "").slice(0, 3);
    setCvv(cleaned);

    const isValid = cleaned.length === 3;
    setValidatedFields(prev => ({ ...prev, cvv: isValid }));

    if (touchedFields.cvv && isValid) {
      setErrors(prev => ({ ...prev, cvv: "" }));
    }
  };

  const handleCardHolderChange = (value: string) => {
    setCardHolder(value);

    const isValid = value.trim().length >= 3;
    setValidatedFields(prev => ({ ...prev, cardHolder: isValid }));

    if (touchedFields.cardHolder && isValid) {
      setErrors(prev => ({ ...prev, cardHolder: "" }));
    }
  };

  const handleBlur = (field: string) => {
    setTouchedFields(prev => ({ ...prev, [field]: true }));

    let value = "";
    switch (field) {
      case "cardNumber": value = cardNumber; break;
      case "expiryDate": value = expiryDate; break;
      case "cvv": value = cvv; break;
      case "cardHolder": value = cardHolder; break;
    }

    const isValid = validateField(field, value);
    setValidatedFields(prev => ({ ...prev, [field]: isValid }));

    if (!isValid) {
      let errorMessage = "";
      switch (field) {
        case "cardNumber":
          errorMessage = cardNumber.replace(/\s/g, "").length === 16 ? "Numéro de carte invalide" : "Le numéro doit contenir 16 chiffres";
          break;
        case "expiryDate":
          errorMessage = "Date d'expiration invalide";
          break;
        case "cvv":
          errorMessage = "Le CVV doit contenir 3 chiffres";
          break;
        case "cardHolder":
          errorMessage = "Nom incomplet (minimum 3 caractères)";
          break;
      }
      setErrors(prev => ({ ...prev, [field]: errorMessage }));
    }
  };

  const validate = () => {
    const newErrors: { [key: string]: string } = {};
    const cleanedCard = cardNumber.replace(/\s/g, "");

    if (cleanedCard.length !== 16) {
      newErrors.cardNumber = "Le numéro doit contenir 16 chiffres";
    } else if (!cardType) {
      newErrors.cardNumber = "Type de carte non supporté";
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
      newErrors.cardHolder = "Nom incomplet";
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

      const res = await fetch(getApiEndpoint('/api/subscriptions'), {
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

  const formProgress = () => {
    let completed = 0;
    if (validatedFields.cardNumber) completed += 25;
    if (validatedFields.expiryDate) completed += 25;
    if (validatedFields.cvv) completed += 25;
    if (validatedFields.cardHolder) completed += 25;
    return completed;
  };

  const progress = formProgress();
  const isFormComplete = progress === 100;

  return (
    <MobileLayout showNav={false}>
      <div className="min-h-screen pb-6 relative">
        {/* ✅ Header simplifié sans barre de progression */}
        <div className="sticky top-0 bg-background/98 backdrop-blur-xl z-20 border-b border-border/50 -mx-4 px-4 py-4 mb-6 shadow-sm">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              disabled={isProcessing}
              className="w-10 h-10 rounded-full bg-muted/60 hover:bg-muted flex items-center justify-center active:scale-95 transition-all disabled:opacity-50 shadow-sm"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex-1">
              <h1 className="text-lg font-bold text-foreground">Paiement sécurisé</h1>
              <p className="text-xs text-muted-foreground">
                {plan.name} · <span className="font-semibold text-primary">{plan.price}€</span>
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          {errors.general && (
            <div className="blyss-card bg-destructive/10 border-2 border-destructive/30 animate-shake">
              <div className="flex items-start gap-3">
                <AlertCircle size={20} className="text-destructive flex-shrink-0 mt-0.5" />
                <p className="text-sm text-destructive font-medium">{errors.general}</p>
              </div>
            </div>
          )}

          {/* Récapitulatif optimisé */}
          <div className="blyss-card bg-gradient-to-br from-primary/8 via-primary/5 to-transparent border-2 border-primary/25 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles size={16} className="text-primary" />
                  <h3 className="text-base font-bold text-foreground">{plan.name}</h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  {plan.commitment ? `Engagement ${plan.commitment} mois` : "Sans engagement"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-black text-primary tracking-tight">{plan.price}€</p>
                <p className="text-xs text-muted-foreground font-medium">
                  {plan.billingType === "one_time" ? "Paiement unique" : "/mois"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
              <Check size={16} className="text-emerald-600" />
              <span className="text-xs font-semibold text-emerald-700">
                Annulation en un clic à tout moment
              </span>
            </div>
          </div>

          {/* Formulaire avec micro-interactions */}
          <div className="blyss-card space-y-5 shadow-lg">
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                <CreditCard size={18} className="text-primary" />
              </div>
              <h3 className="text-sm font-bold text-foreground">Informations de paiement</h3>
            </div>

            {/* Numéro de carte avec clavier numérique */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-2 block">
                Numéro de carte
              </label>
              <div className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="4111 1111 1111 1111"
                  value={cardNumber}
                  onChange={(e) => handleCardNumberChange(e.target.value)}
                  onBlur={() => handleBlur("cardNumber")}
                  disabled={isProcessing}
                  autoComplete="cc-number"
                  autoFocus
                  className={`w-full px-4 py-3.5 pr-16 rounded-xl border-2 transition-all duration-300 font-mono text-base ${errors.cardNumber && touchedFields.cardNumber
                      ? "border-destructive bg-destructive/5 animate-shake"
                      : validatedFields.cardNumber
                        ? "border-emerald-500 bg-emerald-50/50"
                        : "border-muted focus:border-primary focus:ring-2 focus:ring-primary/20"
                    }`}
                />

                {/* ✅ Logos de cartes avec vraies images */}
                <div className="absolute right-3 top-1/2 -translate-y-1/2 transition-all duration-300">
                  {cardType === "visa" && (
                    <div className="w-12 h-8 bg-white rounded-md flex items-center justify-center shadow-md animate-scaleIn border border-gray-200 px-1">
                      <img
                        src="/visa.svg"
                        alt="Visa"
                        className="w-full h-auto"
                      />
                    </div>
                  )}

                  {cardType === "mastercard" && (
                    <div className="w-12 h-8 bg-white rounded-md flex items-center justify-center shadow-md animate-scaleIn border border-gray-200 px-1">
                      <img
                        src="/mastercard.svg"
                        alt="Mastercard"
                        className="w-full h-auto"
                      />
                    </div>
                  )}

                  {!cardType && cardNumber.length > 0 && (
                    <div className="text-[10px] text-muted-foreground font-semibold animate-fadeIn">
                      4→V | 5→MC
                    </div>
                  )}

                  {validatedFields.cardNumber && (
                    <div className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center animate-scaleIn shadow-sm">
                      <Check size={12} className="text-white" />
                    </div>
                  )}
                </div>
              </div>
              {errors.cardNumber && touchedFields.cardNumber ? (
                <p className="text-xs text-destructive mt-2 flex items-center gap-1 animate-fadeIn">
                  <AlertCircle size={12} />
                  {errors.cardNumber}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground mt-2">
                  💡 Test : <span className="font-semibold">4</span> pour Visa ou <span className="font-semibold">5</span> pour Mastercard
                </p>
              )}
            </div>

            {/* Expiration + CVV avec grid responsive */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-2 block">Expiration</label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="12/28"
                    value={expiryDate}
                    onChange={(e) => handleExpiryChange(e.target.value)}
                    onBlur={() => handleBlur("expiryDate")}
                    maxLength={5}
                    disabled={isProcessing}
                    autoComplete="cc-exp"
                    className={`w-full px-4 py-3.5 rounded-xl border-2 transition-all duration-300 font-mono ${errors.expiryDate && touchedFields.expiryDate
                        ? "border-destructive bg-destructive/5"
                        : validatedFields.expiryDate
                          ? "border-emerald-500 bg-emerald-50/50"
                          : "border-muted focus:border-primary focus:ring-2 focus:ring-primary/20"
                      }`}
                  />
                  {validatedFields.expiryDate && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <Check size={16} className="text-emerald-500 animate-scaleIn" />
                    </div>
                  )}
                </div>
                {errors.expiryDate && touchedFields.expiryDate && (
                  <p className="text-xs text-destructive mt-1.5 animate-fadeIn">{errors.expiryDate}</p>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-2 block">CVV</label>
                <div className="relative">
                  <input
                    type={showCvv ? "text" : "password"}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="123"
                    value={cvv}
                    onChange={(e) => handleCvvChange(e.target.value)}
                    onBlur={() => handleBlur("cvv")}
                    maxLength={3}
                    disabled={isProcessing}
                    autoComplete="cc-csc"
                    className={`w-full px-4 py-3.5 pr-10 rounded-xl border-2 transition-all duration-300 font-mono ${errors.cvv && touchedFields.cvv
                        ? "border-destructive bg-destructive/5"
                        : validatedFields.cvv
                          ? "border-emerald-500 bg-emerald-50/50"
                          : "border-muted focus:border-primary focus:ring-2 focus:ring-primary/20"
                      }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCvv(!showCvv)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showCvv ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {errors.cvv && touchedFields.cvv && (
                  <p className="text-xs text-destructive mt-1.5 animate-fadeIn">{errors.cvv}</p>
                )}
              </div>
            </div>

            {/* Titulaire sans transformation forcée */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-2 block">
                Titulaire de la carte
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Marie Beauté"
                  value={cardHolder}
                  onChange={(e) => handleCardHolderChange(e.target.value)}
                  onBlur={() => handleBlur("cardHolder")}
                  disabled={isProcessing}
                  autoComplete="cc-name"
                  className={`w-full px-4 py-3.5 rounded-xl border-2 transition-all duration-300 ${errors.cardHolder && touchedFields.cardHolder
                      ? "border-destructive bg-destructive/5"
                      : validatedFields.cardHolder
                        ? "border-emerald-500 bg-emerald-50/50"
                        : "border-muted focus:border-primary focus:ring-2 focus:ring-primary/20"
                    }`}
                />
                {validatedFields.cardHolder && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Check size={16} className="text-emerald-500 animate-scaleIn" />
                  </div>
                )}
              </div>
              {errors.cardHolder && touchedFields.cardHolder && (
                <p className="text-xs text-destructive mt-2 flex items-center gap-1 animate-fadeIn">
                  <AlertCircle size={12} />
                  {errors.cardHolder}
                </p>
              )}
            </div>
          </div>

          {/* Badge sécurité redesigné */}
          <div className="blyss-card bg-gradient-to-br from-emerald-50 to-blue-50 border-2 border-emerald-200/50">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center flex-shrink-0 shadow-md">
                <Shield size={20} className="text-white" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-bold text-foreground mb-1">Paiement 100% sécurisé</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Chiffrement SSL/TLS + norme PCI-DSS. Tes données bancaires sont protégées.
                </p>
              </div>
            </div>
          </div>

          {/* Bouton payer amélioré */}
          <button
            onClick={handlePayment}
            disabled={isProcessing || !isFormComplete}
            className={`w-full py-4 rounded-2xl font-bold text-base disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-all shadow-xl flex items-center justify-center gap-2.5 ${isFormComplete
                ? "bg-gradient-to-r from-primary to-primary/90 text-white shadow-primary/30 hover:shadow-2xl"
                : "bg-muted text-muted-foreground"
              }`}
          >
            {!isValidating && (
              <>
                <Lock size={20} />
                {isFormComplete ? `Payer ${plan.price}€` : "Complète le formulaire"}
              </>
            )}
          </button>

          <p className="text-xs text-center text-muted-foreground leading-relaxed">
            En continuant, tu acceptes les{" "}
            <button className="text-primary underline font-semibold hover:text-primary/80 transition-colors">
              conditions générales
            </button>
          </p>
        </div>

        {/* Overlay de validation redesigné */}
        {isValidating && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center animate-fadeIn"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.75)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)'
            }}
          >
            <div className="flex flex-col items-center gap-8 animate-scaleIn px-6">
              {/* Animation de paiement */}
              <div className="relative w-28 h-28">
                <div className="absolute inset-0 rounded-full border-4 border-white/20 animate-ping" />
                <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-white border-l-white animate-spin"
                  style={{ animationDuration: '1s' }} />
                <div className="absolute inset-4 rounded-full bg-gradient-to-br from-white/20 to-white/10 flex items-center justify-center backdrop-blur-sm">
                  <Lock size={32} className="text-white animate-pulse" />
                </div>
              </div>

              <div className="text-center space-y-3 max-w-xs">
                <h3 className="text-2xl font-black text-white">
                  Validation en cours
                </h3>
                <p className="text-base text-white/90 font-medium">
                  Vérification sécurisée de votre paiement...
                </p>

                {/* Animation de points */}
                <div className="flex items-center justify-center gap-2 pt-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-white animate-bounce" style={{ animationDelay: '0s' }} />
                  <div className="w-2.5 h-2.5 rounded-full bg-white animate-bounce" style={{ animationDelay: '0.15s' }} />
                  <div className="w-2.5 h-2.5 rounded-full bg-white animate-bounce" style={{ animationDelay: '0.3s' }} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-8px); }
          75% { transform: translateX(8px); }
        }
        
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes scaleIn {
          from { 
            opacity: 0; 
            transform: scale(0.85) translateY(10px);
          }
          to { 
            opacity: 1; 
            transform: scale(1) translateY(0);
          }
        }
        
        .animate-shake {
          animation: shake 0.4s ease-in-out;
        }
        
        .animate-fadeIn {
          animation: fadeIn 0.25s ease-out;
        }
        
        .animate-scaleIn {
          animation: scaleIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
      `}</style>
    </MobileLayout>
  );
};

export default ProSubscriptionPayment;
