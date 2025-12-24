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

type ProFAQItem = {
  question: string;
  answer: string;
  category: "compte" | "reservations" | "paiement" | "divers";
};

const ProHelp = () => {
  const navigate = useNavigate();

  const faqs: ProFAQItem[] = [
    // COMPTE / PROFIL
    {
      category: "compte",
      question: "Comment créer mon profil pro Blyss ?",
      answer:
        "Depuis l’app, choisis le mode Pro, puis suis les étapes : infos personnelles, nom de ton activité, spécialité et zone géographique."
    },
    {
      category: "compte",
      question: "Comment modifier mon profil (photo, bio, Instagram) ?",
      answer:
        "Depuis ton onglet Profil, va dans Paramètres pro pour mettre à jour ton nom d’activité, ta bio, ta photo et ton compte Instagram."
    },
    {
      category: "compte",
      question: "Comment changer mon mot de passe pro ?",
      answer:
        "Rends‑toi dans Paramètres pro > Sécurité, saisis ton ancien mot de passe, puis ton nouveau mot de passe et confirme-le."
    },

    // RÉSERVATIONS / PLANNING
    {
      category: "reservations",
      question: "Comment ouvrir des créneaux à la réservation ?",
      answer:
        "Depuis ton tableau de bord, clique sur “Créneaux” ou va dans ton calendrier pour ajouter les plages disponibles aux clientes."
    },
    {
      category: "reservations",
      question: "Comment bloquer une journée ou une plage horaire ?",
      answer:
        "Depuis le calendrier pro, sélectionne la journée ou la plage horaire à bloquer pour empêcher les nouvelles réservations."
    },
    {
      category: "reservations",
      question: "Comment confirmer ou refuser une réservation ?",
      answer:
        "Tu peux gérer chaque réservation depuis ton calendrier ou la liste de rendez‑vous, en la confirmant ou en la refusant selon tes conditions."
    },
    {
      category: "reservations",
      question: "Que faire si une cliente ne se présente pas ?",
      answer:
        "Signale le no‑show depuis le détail du rendez‑vous afin que Blyss puisse prendre en compte l’incident et appliquer tes conditions."
    },

    // PAIEMENT
    {
      category: "paiement",
      question: "Comment sont gérés les paiements sur Blyss ?",
      answer:
        "Selon ta configuration, tu peux demander un acompte en ligne ou être payée directement par la cliente. Les options apparaissent dans tes Paramètres pro."
    },
    {
      category: "paiement",
      question: "Quand est‑ce que je reçois mes paiements ?",
      answer:
        "Les paiements en ligne sont versés sur ton compte selon le calendrier de ton prestataire de paiement (Stripe ou équivalent, si activé)."
    },
    {
      category: "paiement",
      question: "Comment obtenir un récapitulatif de mes revenus ?",
      answer:
        "Tu peux consulter tes revenus estimés dans ton tableau de bord pro et, selon les intégrations, télécharger des exports depuis ton espace pro."
    },

    // DIVERS / SÉCURITÉ
    {
      category: "divers",
      question: "Comment contacter une cliente via Blyss ?",
      answer:
        "Depuis le détail d’un rendez‑vous ou la fiche cliente, utilise le bouton de contact pour envoyer un message via Blyss."
    },
    {
      category: "divers",
      question: "Comment gérer les avis laissés sur mon profil ?",
      answer:
        "Les avis sont visibles sur ton profil pro. Tu peux les consulter depuis ton espace pro et, si besoin, signaler un avis inapproprié au support Blyss."
    },
    {
      category: "divers",
      question: "Mes données et celles de mes clientes sont‑elles protégées ?",
      answer:
        "Les données sont chiffrées et traitées conformément à la réglementation en vigueur. Seules les informations nécessaires à tes prestations sont partagées."
    }
  ];

  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [activeCategory, setActiveCategory] =
    useState<ProFAQItem["category"]>("reservations");

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  const filteredFaqs = faqs.filter((f) => f.category === activeCategory);

  return (
    <MobileLayout showNav={false}>
      <div className="py-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center mb-2">
          <button
            onClick={() => navigate("/pro/profile")}
            className="p-2"
          >
            <ChevronLeft size={24} className="text-foreground" />
          </button>
          <h1 className="font-display text-2xl font-semibold text-foreground ml-2">
            Aide pro
          </h1>
        </div>
        <p className="text-muted-foreground text-sm mb-4">
          Toutes les réponses pour gérer ton activité sur Blyss.
        </p>

        {/* Bloc intro */}
        <div className="blyss-card flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <HelpCircle size={16} className="text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">
              Une question en tant que pro ?
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
              Parcours les questions fréquentes ou contacte le support si tu ne
              trouves pas ta réponse.
            </p>
          </div>
        </div>

        {/* Onglets */}
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
            Rendez‑vous
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
            Compte pro
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

        {/* Liste FAQ */}
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

        {/* Contact support */}
        <button
          className="blyss-card w-full flex items-center justify-between bg-blyss-pink text-white active:scale-95 transition"
          onClick={() =>
            (window.location.href = "mailto:pro@blyssapp.fr")
          }
        >
          <div className="flex items-center gap-3">
            <Mail size={18} />
            <div className="flex flex-col text-left">
              <span className="text-sm font-medium">
                Contacter le support pro
              </span>
              <span className="text-[11px] text-white/80">
                Réponse sous 24h ouvrées.
              </span>
            </div>
          </div>
          <ChevronRight size={18} />
        </button>

        {/* Blocs info */}
        <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
          <div className="blyss-card flex items-center gap-2">
            <MessageCircle size={16} className="text-primary" />
            <span className="text-muted-foreground">
              Chat pro (bientôt)
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

export default ProHelp;
