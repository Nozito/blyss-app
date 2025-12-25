import MobileLayout from "@/components/MobileLayout";
import { CreditCard, Plus, ChevronRight, ChevronLeft } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

const ClientPaymentMethods = () => {
    const navigate = useNavigate();
    const TEST_MODE = true;
    const [showModal, setShowModal] = useState(false);
    const [confirmCancel, setConfirmCancel] = useState(false);
    const [cards, setCards] = useState<
        { brand: "visa" | "mastercard"; last2: string; isDefault: boolean }[]
    >([]);
    const [cardNumber, setCardNumber] = useState("");
    const [expiry, setExpiry] = useState("");
    const [cvc, setCvc] = useState("");
    const [toast, setToast] = useState<string | null>(null);
    const [swipedIndex, setSwipedIndex] = useState<number | null>(null);
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [confirmDeleteIndex, setConfirmDeleteIndex] = useState<number | null>(null);
    const [showSuccess, setShowSuccess] = useState(false);

    const showToast = (message: string) => {
        setToast(message);
        setTimeout(() => setToast(null), 2000);
    };

    const isValidCard = (num: string) => {
        const arr = num.split("").reverse().map(Number);
        const sum = arr.reduce((acc, val, idx) => {
            if (idx % 2) {
                val *= 2;
                if (val > 9) val -= 9;
            }
            return acc + val;
        }, 0);
        return sum % 10 === 0;
    };

    return (
        <MobileLayout showNav={false}>
            <div className="animate-fade-in">
                <div className="flex items-center mb-4">
                    <button
                        onClick={() => navigate("/client/profile")}
                        className="p-2"
                    >
                        <ChevronLeft size={24} className="text-foreground" />
                    </button>
                    <h1 className="font-display text-2xl font-semibold text-foreground ml-2">
                        Méthodes de paiement
                    </h1>
                </div>
                <p className="text-muted-foreground text-sm mb-4">
                    Gère tes moyens de paiement
                </p>

                <div className="space-y-3">
                    {cards.map((card, index) => (
                        <div key={index} className="relative">
                            <div
                                className={`blyss-card flex items-center justify-between transition-transform duration-300 ${swipedIndex === index ? "-translate-x-20" : "translate-x-0"
                                    }`}
                                onTouchStart={() => setSwipedIndex(null)}
                                onClick={() => {
                                    setEditingIndex(index);
                                    setCardNumber(
                                        card.brand === "visa"
                                            ? "4" + "000 0000 0026" + card.last2
                                            : "5" + "000 0000 0047" + card.last2
                                    );
                                    setExpiry("12/2026");
                                    setCvc("123");
                                    setShowModal(true);
                                }}
                                onTouchMove={(e) => {
                                    const touch = e.touches[0];
                                    if (touch.clientX < window.innerWidth / 2) {
                                        setSwipedIndex(index);
                                    } else {
                                        setSwipedIndex(null);
                                    }
                                }}
                            >
                                <div className="flex items-center gap-3">
                                    <img
                                        src={card.brand === "visa" ? "/visa.svg" : "/mastercard.svg"}
                                        alt={card.brand}
                                        className="h-5"
                                    />
                                    <span className="font-medium">
                                        {card.brand === "visa" ? "Visa" : "Mastercard"} **{card.last2}
                                    </span>
                                    {card.isDefault ? (
                                        <span
                                            onClick={(e) => e.stopPropagation()}
                                            className="ml-2 rounded-full bg-blyss-pink px-2 py-0.5 text-xs text-white cursor-pointer select-none"
                                        >
                                            Par défaut
                                        </span>
                                    ) : (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setCards((prev) =>
                                                    prev.map((c, i) => ({
                                                        ...c,
                                                        isDefault: i === index,
                                                    }))
                                                );
                                                showToast("Carte définie par défaut");
                                            }}
                                            className="ml-2 text-xs text-primary"
                                        >
                                            Définir par défaut
                                        </button>
                                    )}
                                </div>
                                <ChevronRight size={18} />
                            </div>
                            {swipedIndex === index && (
                                <div className="absolute inset-y-0 right-0 w-20 bg-destructive flex items-center justify-center">
                                    <button
                                        onClick={() => {
                                            setConfirmDeleteIndex(index);
                                        }}
                                        className="text-white text-sm font-medium"
                                    >
                                        Supprimer
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}

                    <div className="blyss-card flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <CreditCard size={18} />
                            <span>Apple Pay</span>
                        </div>
                        <ChevronRight size={18} />
                    </div>

                    <button
                        onClick={() => {
                            setEditingIndex(null);
                            setCardNumber("");
                            setExpiry("");
                            setCvc("");
                            setShowModal(true);
                        }}
                        className="blyss-card flex items-center justify-center gap-2 text-primary"
                    >
                        <Plus size={18} />
                        Ajouter un moyen de paiement
                    </button>
                </div>
            </div>

            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-fade-in">
                    <div className="bg-white rounded-3xl w-[90%] max-w-sm p-6 animate-scale-in">
                        <h2 className="font-display text-lg font-semibold text-foreground mb-4">
                            {editingIndex !== null ? "Modifier la carte" : "Ajouter une carte"}
                        </h2>

                        <div className="space-y-4">
                            <div className="flex flex-col">
                                <label className="text-sm text-muted-foreground mb-1">
                                    Numéro de carte
                                </label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    value={cardNumber}
                                    onChange={(e) => {
                                        let digits = e.target.value.replace(/\D/g, "");
                                        digits = digits.slice(0, 16); // inclut le premier chiffre (4 ou 5)
                                        const formatted = digits.replace(/(.{4})/g, "$1 ").trim();
                                        setCardNumber(formatted);
                                    }}
                                    placeholder="1234 5678 9012 3456"
                                    className="border border-muted rounded-xl px-3 h-12"
                                />
                            </div>

                            <div className="flex gap-3">
                                <div className="flex-1 flex flex-col">
                                    <label className="text-sm text-muted-foreground mb-1">
                                        Expiration
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
                                        className="border border-muted rounded-xl px-3 h-12"
                                    />
                                </div>

                                <div className="w-24 flex flex-col">
                                    <label className="text-sm text-muted-foreground mb-1">
                                        CVC
                                    </label>
                                    <input
                                        type="password"
                                        inputMode="numeric"
                                        maxLength={4}
                                        placeholder="123"
                                        className="border border-muted rounded-xl px-3 h-12"
                                        value={cvc}
                                        onChange={(e) => setCvc(e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setConfirmCancel(true);
                                }}
                                className="flex-1 h-12 rounded-xl bg-muted text-foreground font-medium"
                            >
                                Annuler
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const raw = cardNumber.replace(/\s/g, "");
                                    if (!TEST_MODE && !isValidCard(raw)) {
                                        showToast("Carte invalide");
                                        return;
                                    }
                                    // si TEST_MODE = true, on ignore la validation Luhn
                                    showToast("Face ID...");
                                    setTimeout(() => {
                                        let brand: "visa" | "mastercard" = "visa";
                                        if (raw.startsWith("4")) {
                                            brand = "visa";
                                        } else if (raw.startsWith("5")) {
                                            brand = "mastercard";
                                        } else {
                                            // par défaut, assigner visa si non reconnu
                                            brand = "visa";
                                        }
                                        const last2 = raw.slice(-2);

                                        if (editingIndex !== null) {
                                            setCards((prev) =>
                                                prev.map((c, i) =>
                                                    i === editingIndex
                                                        ? { brand, last2, isDefault: true }
                                                        : { ...c, isDefault: false }
                                                )
                                            );
                                            showToast("Carte mise à jour avec succès");
                                        } else {
                                            setCards((prev) => [
                                                ...prev.map((c) => ({ ...c, isDefault: false })),
                                                { brand, last2, isDefault: true },
                                            ]);
                                            showToast("Carte enregistrée avec succès");
                                        }

                                        setShowSuccess(true);
                                        setTimeout(() => setShowSuccess(false), 1200);

                                        setCardNumber("");
                                        setExpiry("");
                                        setCvc("");
                                        setShowModal(false);
                                        setEditingIndex(null);
                                    }, 1000);
                                }}
                                className="flex-1 h-12 rounded-xl bg-blyss-pink text-white font-medium active:scale-95 transition"
                            >
                                {editingIndex !== null ? "Mettre à jour" : "Enregistrer"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {confirmCancel && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-fade-in">
                    <div className="bg-white rounded-3xl w-[90%] max-w-sm p-6 animate-scale-in">
                        <h3 className="font-display text-lg font-semibold text-foreground mb-2">
                            {editingIndex !== null
                                ? "Annuler les modifications ?"
                                : "Annuler l’ajout de la carte ?"}
                        </h3>
                        <p className="text-sm text-muted-foreground mb-6">
                            {editingIndex !== null
                                ? "Aucune modification a été effectuée sur votre carte"
                                : "La carte ne sera pas enregistrée."}
                        </p>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setConfirmCancel(false)}
                                className="flex-1 h-12 rounded-xl bg-muted text-foreground font-medium"
                            >
                                Retour
                            </button>
                            <button
                                onClick={() => {
                                    if (editingIndex !== null) {
                                        showToast("Aucune modification a été effectuée sur votre carte");
                                    } else {
                                        showToast("La carte n’a pas été enregistrée");
                                    }
                                    setConfirmCancel(false);
                                    setShowModal(false);
                                    setEditingIndex(null);
                                }}
                                className="flex-1 h-12 rounded-xl bg-destructive text-white font-medium active:scale-95 transition"
                            >
                                Annuler
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {confirmDeleteIndex !== null && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-fade-in">
                    <div className="bg-white rounded-3xl w-[90%] max-w-sm p-6 animate-scale-in">
                        <h3 className="font-display text-lg font-semibold text-foreground mb-2">
                            Supprimer cette carte ?
                        </h3>
                        <p className="text-sm text-muted-foreground mb-6">
                            Cette action est définitive.
                        </p>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setConfirmDeleteIndex(null)}
                                className="flex-1 h-12 rounded-xl bg-muted text-foreground font-medium"
                            >
                                Annuler
                            </button>
                            <button
                                onClick={() => {
                                    setCards((prev) =>
                                        prev.filter((_, i) => i !== confirmDeleteIndex)
                                    );
                                    setConfirmDeleteIndex(null);
                                    setSwipedIndex(null);
                                    showToast("Carte supprimée");
                                }}
                                className="flex-1 h-12 rounded-xl bg-destructive text-white font-medium active:scale-95 transition"
                            >
                                Supprimer
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showSuccess && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="bg-white rounded-full w-24 h-24 flex items-center justify-center animate-scale-in">
                        <svg
                            className="w-12 h-12 text-green-500"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            viewBox="0 0 24 24"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                </div>
            )}

            {toast && (
                <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-black/80 text-white px-4 py-2 rounded-full text-sm animate-fade-in shadow-lg">
                    {toast}
                </div>
            )}
        </MobileLayout>
    );
};

export default ClientPaymentMethods;