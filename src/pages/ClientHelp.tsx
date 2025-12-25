import MobileLayout from "@/components/MobileLayout";
import {
  ChevronRight,
  Mail,
  HelpCircle,
  ChevronLeft,
  MessageCircle,
  Shield
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

type FAQItem = {
  question: string;
  answer: string;
  category: "compte" | "reservations" | "paiement" | "divers";
};

const ClientHelp = () => {
  const navigate = useNavigate();

  const faqs: FAQItem[] = [
    // COMPTE
    {
      category: "compte",
      question: "Comment créer un compte Blyss ?",
      answer:
        "Depuis l’écran de connexion, clique sur “Créer un compte” et suis les étapes : email, mot de passe, puis validation via le code reçu."
    },
    {
      category: "compte",
      question: "J’ai oublié mon mot de passe, que faire ?",
      answer:
        "Sur l’écran de connexion, clique sur “Mot de passe oublié ?” puis saisis ton email pour recevoir un lien de réinitialisation."
    },

    // RÉSERVATIONS
    {
      category: "reservations",
      question: "Comment réserver une prestation ?",
      answer:
        "Choisis une experte nails, sélectionne la prestation souhaitée, puis un créneau disponible. Valide ta réservation pour recevoir une confirmation."
    },
    {
      category: "reservations",
      question: "Où voir mes réservations à venir ?",
      answer:
        "Tes rendez-vous à venir sont visibles dans l’onglet dédié à tes réservations, accessible depuis la barre de navigation."
    },
    {
      category: "reservations",
      question: "Comment annuler une réservation ?",
      answer:
        "Tu peux annuler depuis le détail du rendez-vous, jusqu’à X heures avant l’horaire prévu (selon les conditions de l’experte)."
    },
    {
      category: "reservations",
      question: "Comment modifier l’horaire d’un rendez-vous ?",
      answer:
        "Si l’experte l’autorise, tu peux modifier l’horaire depuis le détail du rendez-vous. Sinon, contacte directement l’experte via la messagerie."
    },
    {
      category: "reservations",
      question: "Comment laisser un avis après une prestation ?",
      answer:
        "Une fois le rendez-vous terminé, tu recevras une notification pour noter l’experte et laisser un commentaire visible sur son profil."
    },

    // PAIEMENT
    {
      category: "paiement",
      question: "Quels sont les moyens de paiement acceptés ?",
      answer:
        "Selon les expertes, tu peux payer directement via Blyss (carte bancaire, Apple Pay, etc.) ou sur place. Les options sont indiquées lors de la réservation."
    },
    {
      category: "paiement",
      question: "Quand suis-je débitée ?",
      answer:
        "Le débit peut être effectué au moment de la confirmation ou à la fin de la prestation, en fonction des paramètres de l’experte."
    },
    {
      category: "paiement",
      question: "Comment obtenir une facture ?",
      answer:
        "Tu peux télécharger ta facture depuis le détail de la réservation, une fois la prestation effectuée."
    },

    // DIVERS / SÉCURITÉ
    {
      category: "divers",
      question: "Comment contacter une experte avant de réserver ?",
      answer:
        "Certaines expertes permettent l’échange de messages avant réservation. Si c’est le cas, un bouton “Contacter” apparaît sur leur profil."
    },
    {
      category: "divers",
      question: "Que faire si la pro ne se présente pas ?",
      answer:
        "Signale le rendez-vous depuis l’écran de détail. L’équipe Blyss reviendra vers toi pour t’aider et trouver une solution."
    },
    {
      category: "divers",
      question: "Mes données sont-elles protégées ?",
      answer:
        "Tes données personnelles et tes informations de paiement sont chiffrées et traitées conformément à la réglementation en vigueur."
    }
  ];

  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [activeCategory, setActiveCategory] =
    useState<FAQItem["category"]>("reservations");

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  const filteredFaqs = faqs.filter((f) => f.category === activeCategory);

  return (
    <MobileLayout showNav={false}>
      <div className="animate-fade-in">
        {/* Header aligné comme ClientPaymentMethods */}
        <div className="flex items-center mb-2">
          <button
            onClick={() => navigate("/client/profile")}
            className="p-2"
          >
            <ChevronLeft size={24} className="text-foreground" />
          </button>
          <h1 className="font-display text-2xl font-semibold text-foreground ml-2">
            Aide & support
          </h1>
        </div>
        <p className="text-muted-foreground text-sm mb-4">
          Toutes les réponses pour profiter de Blyss sereinement
        </p>

        {/* Bloc intro, même largeur / style que tes cartes paiement */}
        <div className="blyss-card flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <HelpCircle size={16} className="text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">
              Une question sur Blyss ?
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
              Parcours les questions fréquentes ou contacte le support si tu ne
              trouves pas ta réponse.
            </p>
          </div>
        </div>

        {/* Onglets / catégories FAQ – même largeur que le reste */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar mb-4 px-1">
          <button
            type="button"
            onClick={() => setActiveCategory("reservations")}
            className={`px-3 py-1.5 rounded-full text-xs ${
              activeCategory === "reservations"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            Réservations
          </button>
          <button
            type="button"
            onClick={() => setActiveCategory("paiement")}
            className={`px-3 py-1.5 rounded-full text-xs ${
              activeCategory === "paiement"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            Paiement
          </button>
          <button
            type="button"
            onClick={() => setActiveCategory("compte")}
            className={`px-3 py-1.5 rounded-full text-xs ${
              activeCategory === "compte"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            Compte
          </button>
          <button
            type="button"
            onClick={() => setActiveCategory("divers")}
            className={`px-3 py-1.5 rounded-full text-xs ${
              activeCategory === "divers"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            Autres
          </button>
        </div>

        {/* Liste des FAQ – mêmes cartes que paiement (blyss-card) */}
        <div className="space-y-3 mb-4">
          {filteredFaqs.map((faq) => {
            const globalIndex = faqs.indexOf(faq);
            const isOpen = openIndex === globalIndex;

            return (
              <button
                key={globalIndex}
                type="button"
                className="blyss-card w-full text-left active:scale-[0.99] transition-transform"
                onClick={() => toggleFAQ(globalIndex)}
              >
                <div className="flex justify-between items-center gap-3">
                  <h3 className="font-medium text-sm text-foreground flex-1 text-left">
                    {faq.question}
                  </h3>
                  <ChevronRight
                    size={18}
                    className={`flex-shrink-0 text-muted-foreground transform transition-transform duration-200 ${
                      isOpen ? "rotate-90" : ""
                    }`}
                  />
                </div>
                {isOpen && (
                  <div className="mt-2.5 text-xs text-muted-foreground animate-slide-down">
                    {faq.answer}
                  </div>
                )}
              </button>
            );
          })}

          {filteredFaqs.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">
              Aucune question pour cette catégorie pour le moment.
            </p>
          )}
        </div>

        {/* Bloc contact / support – même largeur / style que cartes paiement */}
        <button
          className="blyss-card w-full flex items-center justify-between bg-blyss-pink text-white active:scale-95 transition"
          onClick={() =>
            (window.location.href = "mailto:contact@blyssapp.fr")
          }
        >
          <div className="flex items-center gap-3">
            <Mail size={18} />
            <div className="flex flex-col text-left">
              <span className="text-sm font-medium">
                Écrire au support Blyss
              </span>
              <span className="text-[11px] text-white/80">
                Réponse sous 24h ouvrées.
              </span>
            </div>
          </div>
          <ChevronRight size={18} />
        </button>

        {/* Petits blocs informatifs comme en bas de ta page paiement */}
        <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
          <div className="blyss-card flex items-center gap-2">
            <MessageCircle size={16} className="text-primary" />
            <span className="text-muted-foreground">
              Chat in-app (bientôt)
            </span>
          </div>
          <div className="blyss-card flex items-center gap-2">
            <Shield size={16} className="text-muted-foreground" />
            <span className="text-muted-foreground">
              Centre de confiance Blyss
            </span>
          </div>
        </div>
      </div>
    </MobileLayout>
  );
};

export default ClientHelp;
