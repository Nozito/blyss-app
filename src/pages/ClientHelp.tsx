import MobileLayout from "@/components/MobileLayout";
import { ChevronRight, Mail, HelpCircle, ChevronLeft } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

const ClientHelp = () => {
    const navigate = useNavigate();

    const faqs = [
        { question: "Comment réserver une prestation ?", answer: "Il suffit de choisir une PO et un créneau disponible." },
        { question: "Comment annuler une réservation ?", answer: "Vous pouvez annuler via votre espace client jusqu'à 24h avant la prestation." },
        { question: "Quels sont les modes de paiement acceptés ?", answer: "Nous acceptons les cartes bancaires, PayPal et Apple Pay." },
        { question: "Comment contacter le prestataire ?", answer: "Une fois la réservation confirmée, vous recevrez les coordonnées du prestataire." },
    ];

    const [openIndex, setOpenIndex] = useState<number | null>(null);

    const toggleFAQ = (index: number) => {
        setOpenIndex(openIndex === index ? null : index);
    };

    return (
        <MobileLayout showNav={false}>
            <div className="py-6 animate-fade-in">
                <div className="flex items-center mb-4 animate-fade-in">
                    <button
                        onClick={() => navigate("/client/profile")}
                        className="p-2"
                    >
                        <ChevronLeft size={24} className="text-foreground" />
                    </button>
                    <div className="ml-2">
                        <h1 className="font-display text-2xl font-semibold text-foreground">
                            Aide
                        </h1>
                        <p className="text-muted-foreground text-sm">
                            Besoin d’aide ?
                        </p>
                    </div>
                </div>

                <div className="space-y-3">
                    {faqs.map((faq, index) => (
                        <div
                            key={index}
                            className="rounded-2xl shadow-card p-4 hover:shadow-lg cursor-pointer select-none"
                            onClick={() => toggleFAQ(index)}
                        >
                            <div className="flex justify-between items-center">
                                <h3 className="font-semibold text-foreground">{faq.question}</h3>
                                <ChevronRight
                                    size={18}
                                    className={`transform transition-transform duration-300 ${openIndex === index ? "rotate-90" : ""}`}
                                />
                            </div>
                            {openIndex === index && (
                                <div className="mt-2 text-muted-foreground text-sm animate-slide-down">
                                    {faq.answer}
                                </div>
                            )}
                        </div>
                    ))}

                    <button className="mt-4 flex items-center justify-between rounded-2xl p-4 bg-blyss-pink text-white shadow-card hover:opacity-90 active:scale-95 transition" onClick={() => window.location.href = "mailto:contact@blyssapp.fr"}>
                        <div className="flex items-center gap-3">
                            <Mail size={18} />
                            <span>Contacter le support</span>
                        </div>
                    </button>
                </div>
            </div>
        </MobileLayout>
    );
};

export default ClientHelp;