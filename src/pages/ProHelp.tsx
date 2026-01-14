import MobileLayout from "@/components/MobileLayout";
import {
  ChevronRight,
  Mail,
  HelpCircle,
  ChevronLeft,
  MessageCircle,
  Shield,
  Calendar,
  CreditCard,
  User,
  Sparkles
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
        "Depuis l'app, choisis le mode Pro, puis suis les étapes : infos personnelles, nom de ton activité, spécialité et zone géographique."
    },
    {
      category: "compte",
      question: "Comment modifier mon profil (photo, bio, Instagram) ?",
      answer:
        "Depuis ton onglet Profil, va dans Paramètres pro pour mettre à jour ton nom d'activité, ta bio, ta photo et ton compte Instagram."
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
        "Depuis ton tableau de bord, clique sur \"Créneaux\" ou va dans ton calendrier pour ajouter les plages disponibles aux clientes."
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
        "Signale le no‑show depuis le détail du rendez‑vous afin que Blyss puisse prendre en compte l'incident et appliquer tes conditions."
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
        "Depuis le détail d'un rendez‑vous ou la fiche cliente, utilise le bouton de contact pour envoyer un message via Blyss."
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

  const categoryIcons = {
    reservations: Calendar,
    paiement: CreditCard,
    compte: User,
    divers: Sparkles
  };

  const categoryLabels = {
    reservations: "Rendez‑vous",
    paiement: "Paiement",
    compte: "Compte pro",
    divers: "Autres"
  };

  return (
    <MobileLayout showNav={false}>
      <div className="min-h-screen py-6 animate-fade-in">
        {/* Header */}
        <div className="relative -mx-4 px-4 pt-2 pb-6 mb-6">
          <div className="flex items-center mb-3 animate-slide-down">
            <button
              onClick={() => navigate("/pro/profile")}
              className="w-10 h-10 rounded-xl bg-muted hover:bg-muted-foreground/10 flex items-center justify-center active:scale-95 transition-all mr-3"
            >
              <ChevronLeft size={20} className="text-foreground" />
            </button>
            <div className="flex-1">
              <h1 className="font-display text-2xl font-bold text-foreground">
                Centre d'aide pro
              </h1>
            </div>
          </div>
          <p className="text-muted-foreground text-sm animate-fade-in" style={{ animationDelay: "0.1s" }}>
            Toutes les réponses pour gérer ton activité sur Blyss.
          </p>
        </div>

        {/* Bloc intro avec animation */}
        <div className="blyss-card mb-6 animate-scale-in overflow-hidden relative group hover:shadow-lg transition-all duration-300" style={{ animationDelay: "0.1s" }}>
          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <div className="relative flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center flex-shrink-0 shadow-lg">
              <HelpCircle size={20} className="text-white" />
            </div>
            <div className="flex-1 pt-1">
              <p className="text-base font-semibold text-foreground mb-1">
                Besoin d'aide ?
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Parcours les questions fréquentes ou contacte le support si tu ne
                trouves pas ta réponse.
              </p>
            </div>
          </div>
        </div>

        {/* Onglets améliorés avec icônes */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar mb-6 px-1 animate-slide-up" style={{ animationDelay: "0.2s" }}>
          {(Object.keys(categoryLabels) as Array<keyof typeof categoryLabels>).map((cat, idx) => {
            const Icon = categoryIcons[cat];
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={`
                  px-4 py-2.5 rounded-2xl text-sm font-medium flex items-center gap-2 whitespace-nowrap
                  transition-all duration-300 animate-scale-in
                  ${
                    activeCategory === cat
                      ? "gradient-primary text-white shadow-lg shadow-primary/30 scale-105"
                      : "bg-muted text-muted-foreground hover:bg-muted-foreground/10 active:scale-95"
                  }
                `}
                style={{ animationDelay: `${0.25 + idx * 0.05}s` }}
              >
                <Icon size={16} />
                {categoryLabels[cat]}
              </button>
            );
          })}
        </div>

        {/* Liste FAQ avec animations améliorées */}
        <div className="space-y-3 mb-6">
          {filteredFaqs.map((faq, index) => {
            const globalIndex = faqs.indexOf(faq);
            const isOpen = openIndex === globalIndex;

            return (
              <div
                key={globalIndex}
                className="animate-slide-up"
                style={{ animationDelay: `${0.3 + index * 0.05}s` }}
              >
                <button
                  type="button"
                  className={`
                    blyss-card w-full text-left transition-all duration-300
                    ${isOpen ? "shadow-lg ring-2 ring-primary/20" : "hover:shadow-md active:scale-[0.99]"}
                  `}
                  onClick={() => toggleFAQ(globalIndex)}
                >
                  <div className="flex justify-between items-start gap-3">
                    <h3 className="font-semibold text-sm text-foreground flex-1 text-left leading-relaxed">
                      {faq.question}
                    </h3>
                    <div className={`
                      w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0
                      transition-all duration-300
                      ${isOpen ? "bg-primary rotate-90" : "bg-muted group-hover:bg-muted-foreground/10"}
                    `}>
                      <ChevronRight
                        size={16}
                        className={`transition-colors duration-300 ${isOpen ? "text-white" : "text-muted-foreground"}`}
                      />
                    </div>
                  </div>
                  <div
                    className={`
                      grid transition-all duration-300 ease-in-out
                      ${isOpen ? "grid-rows-[1fr] opacity-100 mt-3" : "grid-rows-[0fr] opacity-0"}
                    `}
                  >
                    <div className="overflow-hidden">
                      <div className="text-sm text-muted-foreground leading-relaxed pb-1">
                        {faq.answer}
                      </div>
                    </div>
                  </div>
                </button>
              </div>
            );
          })}

          {filteredFaqs.length === 0 && (
            <div className="blyss-card text-center py-12 animate-fade-in">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                <HelpCircle size={28} className="text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground mb-1">
                Aucune question disponible
              </p>
              <p className="text-xs text-muted-foreground">
                Cette catégorie sera bientôt enrichie.
              </p>
            </div>
          )}
        </div>

        {/* Contact support avec animation hover */}
        <button
          className="blyss-card w-full flex items-center justify-between bg-gradient-to-r from-blyss-pink to-primary text-white hover:shadow-xl active:scale-[0.98] transition-all duration-300 mb-4 group overflow-hidden relative animate-slide-up"
          style={{ animationDelay: "0.5s" }}
          onClick={() => (window.location.href = "mailto:pro@blyssapp.fr")}
        >
          <div className="absolute inset-0 bg-white/10 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
          <div className="relative flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center">
              <Mail size={20} />
            </div>
            <div className="flex flex-col text-left">
              <span className="text-sm font-semibold">
                Contacter le support pro
              </span>
              <span className="text-xs text-white/90">
                Réponse sous 24h ouvrées
              </span>
            </div>
          </div>
          <ChevronRight size={20} className="relative" />
        </button>

        {/* Blocs info améliorés */}
        <div className="grid grid-cols-2 gap-3 text-xs animate-fade-in" style={{ animationDelay: "0.6s" }}>
          <button className="blyss-card flex flex-col items-center gap-2 py-4 hover:shadow-md active:scale-95 transition-all duration-300 group">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
              <MessageCircle size={18} className="text-primary" />
            </div>
            <span className="text-muted-foreground font-medium text-center">
              Chat pro
            </span>
            <span className="text-[10px] text-primary font-semibold">
              Bientôt disponible
            </span>
          </button>
          <button className="blyss-card flex flex-col items-center gap-2 py-4 hover:shadow-md active:scale-95 transition-all duration-300 group">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center group-hover:bg-muted-foreground/10 transition-colors">
              <Shield size={18} className="text-muted-foreground" />
            </div>
            <span className="text-muted-foreground font-medium text-center">
              Centre de confiance
            </span>
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes slide-down {
          from { transform: translateY(-10px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        @keyframes slide-up {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        @keyframes scale-in {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }

        .animate-fade-in {
          animation: fade-in 0.5s ease-out forwards;
        }

        .animate-slide-down {
          animation: slide-down 0.5s ease-out forwards;
        }

        .animate-slide-up {
          animation: slide-up 0.5s ease-out forwards;
        }

        .animate-scale-in {
          animation: scale-in 0.4s ease-out forwards;
        }

        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </MobileLayout>
  );
};

export default ProHelp;