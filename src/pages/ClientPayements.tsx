import { CreditCard, Plus, ChevronLeft, Trash2, Check, Loader2, AlertCircle, CheckCircle, X, Edit2, Star } from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/services/api";
import type { SavedCard } from "@/services/api";

type ToastType = "success" | "error" | "info";

interface Toast {
  message: string;
  type: ToastType;
}

const ClientPaymentMethods = () => {
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingCard, setEditingCard] = useState<SavedCard | null>(null);
  const [cards, setCards] = useState<SavedCard[]>([]);
  const [toast, setToast] = useState<Toast | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [cardholderName, setCardholderName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");

  useEffect(() => {
    fetchPaymentMethods();
  }, []);

  const fetchPaymentMethods = async () => {
    try {
      const response = await api.paymentMethods.getAll();

      if (response.success && response.data) {
        setCards(response.data);
      }
    } catch (error) {
      console.error("Erreur:", error);
      showToast("Erreur de chargement", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const showToast = (message: string, type: ToastType = "info") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const validateCard = () => {
    if (!cardholderName.trim()) {
      showToast("Le nom du titulaire est requis", "error");
      return false;
    }

    if (cardholderName.trim().length < 3) {
      showToast("Le nom doit contenir au moins 3 caractères", "error");
      return false;
    }

    const digits = cardNumber.replace(/\s/g, "");
    
    const isVisa = digits.startsWith("4");
    const isMastercard = digits.startsWith("51") || digits.startsWith("52") || 
                         digits.startsWith("53") || digits.startsWith("54") || 
                         digits.startsWith("55");

    if (!isVisa && !isMastercard) {
      showToast("Seules les cartes Visa et Mastercard sont acceptées", "error");
      return false;
    }

    if (digits.length !== 16) {
      showToast("Le numéro de carte doit contenir 16 chiffres", "error");
      return false;
    }

    const luhnCheck = (num: string) => {
      let sum = 0;
      let isEven = false;
      for (let i = num.length - 1; i >= 0; i--) {
        let digit = parseInt(num[i]);
        if (isEven) {
          digit *= 2;
          if (digit > 9) digit -= 9;
        }
        sum += digit;
        isEven = !isEven;
      }
      return sum % 10 === 0;
    };

    if (!luhnCheck(digits)) {
      showToast("Numéro de carte invalide", "error");
      return false;
    }

    if (!expiry.match(/^\d{2}\/\d{4}$/)) {
      showToast("Format d'expiration invalide (MM/AAAA)", "error");
      return false;
    }

    const [monthStr, yearStr] = expiry.split("/");
    const expMonth = parseInt(monthStr);
    const expYear = parseInt(yearStr);
    
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    if (expMonth < 1 || expMonth > 12) {
      showToast("Mois invalide (doit être entre 01 et 12)", "error");
      return false;
    }

    if (expYear < currentYear || (expYear === currentYear && expMonth < currentMonth)) {
      showToast("Cette carte est expirée", "error");
      return false;
    }

    if (expYear > currentYear + 10) {
      showToast("Date d'expiration trop éloignée", "error");
      return false;
    }

    if (cvc.length < 3) {
      showToast("Le CVC doit contenir 3 ou 4 chiffres", "error");
      return false;
    }

    return true;
  };

  const handleSaveCard = async () => {
    if (!validateCard()) return;

    setIsSaving(true);

    try {
      const [exp_month, exp_year] = expiry.split("/");
      const digits = cardNumber.replace(/\s/g, "");

      const response = await api.paymentMethods.create({
        card_number: digits,
        cardholder_name: cardholderName.trim(),
        exp_month,
        exp_year,
        cvc,
        set_default: cards.length === 0,
      });

      if (response.success) {
        setShowModal(false);
        setShowSuccess(true);
        fetchPaymentMethods();
        setTimeout(() => setShowSuccess(false), 1500);
        showToast("Carte enregistrée avec succès", "success");
        resetForm();
      } else {
        showToast(response.error || "Erreur lors de l'enregistrement", "error");
      }
    } catch (error: any) {
      console.error("Erreur:", error);
      showToast("Une erreur est survenue", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditCard = (card: SavedCard) => {
    setEditingCard(card);
    setCardholderName(card.cardholder_name);
    setExpiry(`${card.exp_month}/${card.exp_year}`);
    setCardNumber("•••• •••• •••• " + card.last4);
    setCvc("");
    setShowEditModal(true);
  };

  const handleUpdateCard = async () => {
    if (!editingCard) return;

    // Validation simplifiée pour l'édition (pas besoin du numéro complet)
    if (!cardholderName.trim() || cardholderName.trim().length < 3) {
      showToast("Le nom du titulaire est requis (min. 3 caractères)", "error");
      return;
    }

    if (!expiry.match(/^\d{2}\/\d{4}$/)) {
      showToast("Format d'expiration invalide (MM/AAAA)", "error");
      return;
    }

    const [monthStr, yearStr] = expiry.split("/");
    const expMonth = parseInt(monthStr);
    const expYear = parseInt(yearStr);
    
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    if (expMonth < 1 || expMonth > 12) {
      showToast("Mois invalide", "error");
      return;
    }

    if (expYear < currentYear || (expYear === currentYear && expMonth < currentMonth)) {
      showToast("Cette carte est expirée", "error");
      return;
    }

    setIsSaving(true);

    try {
      const [exp_month, exp_year] = expiry.split("/");

      // Appel API pour mettre à jour
      const response = await (api.paymentMethods as any).update(editingCard.id, {
        cardholder_name: cardholderName.trim(),
        exp_month,
        exp_year,
      });

      if (response.success) {
        setShowEditModal(false);
        setShowSuccess(true);
        fetchPaymentMethods();
        setTimeout(() => setShowSuccess(false), 1500);
        showToast("Carte mise à jour avec succès", "success");
        resetForm();
        setEditingCard(null);
      } else {
        showToast(response.error || "Erreur lors de la mise à jour", "error");
      }
    } catch (error: any) {
      console.error("Erreur:", error);
      showToast("Une erreur est survenue", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const resetForm = () => {
    setCardholderName("");
    setCardNumber("");
    setExpiry("");
    setCvc("");
  };

  const handleSetDefault = async (id: number) => {
    try {
      const response = await api.paymentMethods.setDefault(id);

      if (response.success) {
        setCards((prev) =>
          prev.map((c) => ({
            ...c,
            is_default: c.id === id,
          }))
        );
        showToast("Carte définie par défaut", "success");
      }
    } catch (error) {
      showToast("Une erreur est survenue", "error");
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const response = await api.paymentMethods.delete(id);

      if (response.success) {
        setCards((prev) => prev.filter((c) => c.id !== id));
        showToast("Carte supprimée", "success");
      }
    } catch (error) {
      showToast("Une erreur est survenue", "error");
    } finally {
      setConfirmDeleteId(null);
    }
  };

  const getBrandLogo = (brand: string) => {
    const logos = {
      visa: "/visa.svg",
      mastercard: "/mastercard.svg",
    };
    return logos[brand as keyof typeof logos] || "/card.svg";
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="flex items-center justify-center h-screen">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-lg mx-auto p-4 animate-fade-in pb-8">
        <div className="flex items-center mb-4">
          <button onClick={() => navigate("/client/profile")} className="p-2 -ml-2">
            <ChevronLeft size={24} className="text-foreground" />
          </button>
          <h1 className="font-display text-2xl font-semibold text-foreground ml-2">
            Méthodes de paiement
          </h1>
        </div>
        <p className="text-muted-foreground text-sm mb-6">
          Gère tes moyens de paiement de manière sécurisée
        </p>

        <div className="blyss-card bg-blue-50 border-blue-200 mb-6">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
            <div className="flex-1">
              <p className="text-sm text-blue-900 font-medium mb-1">Cartes acceptées</p>
              <p className="text-xs text-blue-700 leading-relaxed">
                Visa et Mastercard uniquement
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {cards.length === 0 && (
            <div className="blyss-card text-center py-12">
              <CreditCard size={48} className="mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground text-sm">
                Aucune carte enregistrée
              </p>
            </div>
          )}

          {cards.map((card) => (
            <div
              key={card.id}
              className="blyss-card flex items-center justify-between group hover:shadow-md transition-all"
            >
              <div className="flex items-center gap-3 flex-1">
                <img
                  src={getBrandLogo(card.brand)}
                  alt={card.brand}
                  className="h-8 w-12 object-contain"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-foreground">
                      {card.cardholder_name}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    •••• {card.last4} • Expire {card.exp_month}/{card.exp_year}
                  </p>
                  {card.is_default ? (
                    <div className="inline-flex items-center gap-1 mt-1 rounded-full bg-blyss-pink/10 px-2 py-0.5 text-xs text-blyss-pink font-medium">
                      <Star size={12} fill="currentColor" />
                      Par défaut
                    </div>
                  ) : (
                    <button
                      onClick={() => handleSetDefault(card.id)}
                      className="inline-flex items-center gap-1 mt-1 rounded-full border border-muted-foreground/30 px-2 py-0.5 text-xs text-muted-foreground hover:bg-blyss-pink/10 hover:text-blyss-pink hover:border-blyss-pink transition font-medium"
                    >
                      <Star size={12} />
                      Définir par défaut
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleEditCard(card)}
                  className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition"
                  title="Modifier"
                >
                  <Edit2 size={18} />
                </button>
                <button
                  onClick={() => setConfirmDeleteId(card.id)}
                  className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition"
                  title="Supprimer"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))}

          <button
            onClick={() => setShowModal(true)}
            className="blyss-card flex items-center justify-center gap-2 text-primary hover:bg-primary/5 transition active:scale-95"
          >
            <Plus size={18} />
            Ajouter une carte
          </button>
        </div>
      </div>

      {/* Modal Ajout */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 animate-scale-in shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display text-xl font-semibold text-foreground">
                Ajouter une carte
              </h2>
              <button 
                onClick={() => {
                  setShowModal(false);
                  resetForm();
                }}
                className="p-1 hover:bg-gray-100 rounded-full transition"
              >
                <X size={20} className="text-muted-foreground" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex flex-col">
                <label className="text-sm text-muted-foreground mb-2 font-medium">
                  Nom du titulaire *
                </label>
                <input
                  type="text"
                  value={cardholderName}
                  onChange={(e) => setCardholderName(e.target.value)}
                  placeholder="Jean Dupont"
                  className="border border-muted rounded-xl px-4 h-12 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary transition"
                />
              </div>

              <div className="flex flex-col">
                <label className="text-sm text-muted-foreground mb-2 font-medium">
                  Numéro de carte (Visa ou Mastercard) *
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={cardNumber}
                  onChange={(e) => {
                    let digits = e.target.value.replace(/\D/g, "").slice(0, 16);
                    const formatted = digits.replace(/(.{4})/g, "$1 ").trim();
                    setCardNumber(formatted);
                  }}
                  placeholder="1234 5678 9012 3456"
                  className="border border-muted rounded-xl px-4 h-12 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary transition"
                />
              </div>

              <div className="flex gap-3">
                <div className="flex-1 flex flex-col">
                  <label className="text-sm text-muted-foreground mb-2 font-medium">
                    Expiration *
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={expiry}
                    onChange={(e) => {
                      let digits = e.target.value.replace(/\D/g, "").slice(0, 6);
                      if (digits.length > 2) {
                        digits = `${digits.slice(0, 2)}/${digits.slice(2)}`;
                      }
                      setExpiry(digits);
                    }}
                    placeholder="MM/AAAA"
                    className="border border-muted rounded-xl px-4 h-12 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary transition"
                  />
                </div>

                <div className="w-24 flex flex-col">
                  <label className="text-sm text-muted-foreground mb-2 font-medium">
                    CVC *
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="123"
                    className="border border-muted rounded-xl px-4 h-12 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary transition"
                    value={cvc}
                    onChange={(e) => setCvc(e.target.value.replace(/\D/g, ""))}
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowModal(false);
                  resetForm();
                }}
                className="flex-1 h-12 rounded-xl bg-muted text-foreground font-medium hover:bg-muted/80 transition active:scale-95"
              >
                Annuler
              </button>
              <button
                onClick={handleSaveCard}
                disabled={isSaving}
                className="flex-1 h-12 rounded-xl bg-blyss-pink text-white font-medium hover:bg-blyss-pink/90 transition active:scale-95 disabled:opacity-50"
              >
                {isSaving ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Enregistrement...
                  </span>
                ) : (
                  "Enregistrer"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Modification */}
      {showEditModal && editingCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 animate-scale-in shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display text-xl font-semibold text-foreground">
                Modifier la carte
              </h2>
              <button 
                onClick={() => {
                  setShowEditModal(false);
                  resetForm();
                  setEditingCard(null);
                }}
                className="p-1 hover:bg-gray-100 rounded-full transition"
              >
                <X size={20} className="text-muted-foreground" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex flex-col">
                <label className="text-sm text-muted-foreground mb-2 font-medium">
                  Nom du titulaire *
                </label>
                <input
                  type="text"
                  value={cardholderName}
                  onChange={(e) => setCardholderName(e.target.value)}
                  placeholder="Jean Dupont"
                  className="border border-muted rounded-xl px-4 h-12 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary transition"
                />
              </div>

              <div className="flex flex-col">
                <label className="text-sm text-muted-foreground mb-2 font-medium">
                  Numéro de carte
                </label>
                <input
                  type="text"
                  value={cardNumber}
                  disabled
                  className="border border-muted rounded-xl px-4 h-12 text-muted-foreground bg-muted/30 cursor-not-allowed"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Le numéro de carte ne peut pas être modifié
                </p>
              </div>

              <div className="flex gap-3">
                <div className="flex-1 flex flex-col">
                  <label className="text-sm text-muted-foreground mb-2 font-medium">
                    Expiration *
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={expiry}
                    onChange={(e) => {
                      let digits = e.target.value.replace(/\D/g, "").slice(0, 6);
                      if (digits.length > 2) {
                        digits = `${digits.slice(0, 2)}/${digits.slice(2)}`;
                      }
                      setExpiry(digits);
                    }}
                    placeholder="MM/AAAA"
                    className="border border-muted rounded-xl px-4 h-12 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary transition"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowEditModal(false);
                  resetForm();
                  setEditingCard(null);
                }}
                className="flex-1 h-12 rounded-xl bg-muted text-foreground font-medium hover:bg-muted/80 transition active:scale-95"
              >
                Annuler
              </button>
              <button
                onClick={handleUpdateCard}
                disabled={isSaving}
                className="flex-1 h-12 rounded-xl bg-blyss-pink text-white font-medium hover:bg-blyss-pink/90 transition active:scale-95 disabled:opacity-50"
              >
                {isSaving ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Mise à jour...
                  </span>
                ) : (
                  "Mettre à jour"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Suppression */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 animate-scale-in shadow-2xl">
            <h3 className="font-display text-lg font-semibold text-foreground mb-2">
              Supprimer cette carte ?
            </h3>
            <p className="text-sm text-muted-foreground mb-6">
              Cette action est définitive et ne peut pas être annulée.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="flex-1 h-12 rounded-xl bg-muted text-foreground font-medium hover:bg-muted/80 transition active:scale-95"
              >
                Annuler
              </button>
              <button
                onClick={() => confirmDeleteId && handleDelete(confirmDeleteId)}
                className="flex-1 h-12 rounded-xl bg-destructive text-white font-medium hover:bg-destructive/90 transition active:scale-95"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success */}
      {showSuccess && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-full w-24 h-24 flex items-center justify-center animate-scale-in shadow-2xl">
            <Check size={48} className="text-green-500" strokeWidth={3} />
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] animate-bounce-in px-4 w-full max-w-md">
          <div
            className={`
              bg-white rounded-2xl shadow-2xl border-2 p-4 flex items-start gap-3
              ${toast.type === "success" ? "border-green-500" : ""}
              ${toast.type === "error" ? "border-red-500" : ""}
              ${toast.type === "info" ? "border-blue-500" : ""}
            `}
          >
            {toast.type === "success" && (
              <CheckCircle size={24} className="text-green-500 flex-shrink-0 mt-0.5" strokeWidth={2} />
            )}
            {toast.type === "error" && (
              <AlertCircle size={24} className="text-red-500 flex-shrink-0 mt-0.5" strokeWidth={2} />
            )}
            {toast.type === "info" && (
              <AlertCircle size={24} className="text-blue-500 flex-shrink-0 mt-0.5" strokeWidth={2} />
            )}
            <p className="text-sm font-medium text-gray-900 flex-1 leading-relaxed">
              {toast.message}
            </p>
            <button
              onClick={() => setToast(null)}
              className="p-1 hover:bg-gray-100 rounded-full transition flex-shrink-0"
            >
              <X size={16} className="text-gray-500" />
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes bounce-in {
          0% {
            transform: translate(-50%, -100%);
            opacity: 0;
          }
          60% {
            transform: translate(-50%, 10px);
            opacity: 1;
          }
          80% {
            transform: translate(-50%, -5px);
          }
          100% {
            transform: translate(-50%, 0);
          }
        }
        .animate-bounce-in {
          animation: bounce-in 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        }
      `}</style>
    </div>
  );
};

export default ClientPaymentMethods;
