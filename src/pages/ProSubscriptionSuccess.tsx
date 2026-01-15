import { useEffect, useState } from "react";
import MobileLayout from "@/components/MobileLayout";
import {
  CheckCircle2,
  Calendar,
  Users,
  BarChart3,
  Camera,
  CreditCard,
  ArrowRight,
  X,
  Sparkles,
  Zap,
  TrendingUp,
} from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import Confetti from "react-confetti";

import calendarImg from "@/assets/phone/calendar.jpg";
import clientsImg from "@/assets/phone/clients.jpg";
import dashboardImg from "@/assets/phone/dashboard.jpg";


interface LocationState {
  plan: {
    id: string;
    name: string;
    price: number;
  };
}

const ProSubscriptionSuccess = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { plan } = (location.state as LocationState) || {};

  const [showOnboarding, setShowOnboarding] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [slideDirection, setSlideDirection] = useState<"next" | "prev">("next");
  const [showConfetti, setShowConfetti] = useState(true);

  const onboardingSlides = [
    {
      icon: Calendar,
      title: "Gestion d'agenda",
      description:
        "Créez vos créneaux de disponibilité et laissez vos clientes réserver directement en ligne. Plus besoin de gérer les messages pour planifier vos rendez-vous.",
      features: [
        "Créneaux personnalisables",
        "Synchronisation automatique",
        "Notifications de réservation",
      ],
      screenshot: calendarImg,
      bgColor: "bg-blue-50",
      iconColor: "text-blue-600",
      iconBg: "bg-blue-100",
    },
    {
      icon: Users,
      title: "Base de données clientes",
      description:
        "Centralisez toutes les informations de vos clientes : coordonnées, historique des prestations et notes personnelles accessibles en un clic.",
      features: [
        "Fiches clientes complètes",
        "Historique des rendez-vous",
        "Notes et rappels privés",
      ],
      screenshot: clientsImg,
      bgColor: "bg-purple-50",
      iconColor: "text-purple-600",
      iconBg: "bg-purple-100",
    },
    {
      icon: BarChart3,
      title: "Tableau de bord analytique",
      description:
        "Suivez votre activité en temps réel : chiffre d'affaires, taux de remplissage, prestations les plus demandées et évolution de votre clientèle.",
      features: [
        "Vue d'ensemble du CA",
        "Statistiques détaillées",
        "Graphiques hebdomadaires",
      ],
      screenshot: dashboardImg,
      bgColor: "bg-emerald-50",
      iconColor: "text-emerald-600",
      iconBg: "bg-emerald-100",
    },
    {
      icon: Camera,
      title: "Portfolio professionnel",
      description:
        "Mettez en avant vos réalisations avec un portfolio photo optimisé pour attirer de nouvelles clientes et valoriser votre expertise.",
      features: [
        "Galerie personnalisable",
        "Mise en avant des travaux",
        "Profil public optimisé",
      ],
      screenshot: "✨",
      bgColor: "bg-amber-50",
      iconColor: "text-amber-600",
      iconBg: "bg-amber-100",
    },
    {
      icon: CreditCard,
      title: "Encaissement en ligne",
      description:
        "Recevez vos paiements directement sur votre compte bancaire de manière sécurisée. Simplifiez votre comptabilité et évitez les impayés.",
      features: [
        "Paiements sécurisés",
        "Virement automatique",
        "Suivi des transactions",
      ],
      screenshot: "💳",
      bgColor: "bg-rose-50",
      iconColor: "text-rose-600",
      iconBg: "bg-rose-100",
    },
  ];

  useEffect(() => {
    const confettiTimer = setTimeout(() => setShowConfetti(false), 5000);
    return () => clearTimeout(confettiTimer);
  }, []);

  useEffect(() => {
    if (!showOnboarding) return;

    const interval = setInterval(() => {
      setSlideDirection("next");
      setCurrentSlide((prev) => {
        if (prev === onboardingSlides.length - 1) {
          return prev;
        }
        return prev + 1;
      });
    }, 6000);

    return () => clearInterval(interval);
  }, [showOnboarding, onboardingSlides.length]);

  if (!plan) {
    navigate("/pro/subscription");
    return null;
  }

  const handleNextSlide = () => {
    if (currentSlide < onboardingSlides.length - 1) {
      setSlideDirection("next");
      setCurrentSlide((prev) => prev + 1);
    } else {
      navigate("/pro/profile");
    }
  };

  const handlePrevSlide = () => {
    if (currentSlide > 0) {
      setSlideDirection("prev");
      setCurrentSlide((prev) => prev - 1);
    }
  };

  const handleSkip = () => {
    navigate("/pro/profile");
  };

  const currentSlideData = onboardingSlides[currentSlide];
  const Icon = currentSlideData.icon;
  const isLastSlide = currentSlide === onboardingSlides.length - 1;

  // Page de confirmation initiale - ULTRA SIMPLIFIÉE
  if (!showOnboarding) {
    return (
      <MobileLayout showNav={false}>
        {showConfetti && (
          <Confetti
            width={window.innerWidth}
            height={window.innerHeight}
            recycle={false}
            numberOfPieces={400}
            gravity={0.25}
          />
        )}

        <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8">
          <div className="w-full max-w-md">
            {/* Titre avec animation subtile */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 mb-4">
                <Sparkles size={16} className="text-primary" />
                <span className="text-xs font-bold text-primary uppercase tracking-wide">
                  Compte Pro Activé
                </span>
              </div>

              <h1 className="text-3xl font-black text-foreground mb-3 leading-tight animate-fade-in-up">
                Félicitations !<br />
                <span className="inline-block animate-gradient bg-gradient-to-r from-primary via-purple-600 to-primary bg-[length:200%_auto] bg-clip-text text-transparent">
                  Votre espace pro est prêt
                </span>
              </h1>

              <p className="text-base text-muted-foreground leading-relaxed animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
                Vous avez maintenant accès à tous les outils pour développer votre activité et gérer
                vos clientes efficacement.
              </p>
            </div>

            {/* Stats cards */}
            <div className="grid grid-cols-3 gap-3 mb-8">
              <div className="blyss-card p-4 text-center bg-white">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-2">
                  <Calendar size={20} className="text-primary" />
                </div>
                <p className="text-xs font-semibold text-foreground">Agenda illimité</p>
              </div>

              <div className="blyss-card p-4 text-center bg-white">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center mx-auto mb-2">
                  <TrendingUp size={20} className="text-purple-600" />
                </div>
                <p className="text-xs font-semibold text-foreground">Analytics pro</p>
              </div>

              <div className="blyss-card p-4 text-center bg-white">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-2">
                  <Zap size={20} className="text-emerald-600" />
                </div>
                <p className="text-xs font-semibold text-foreground">Sans limite</p>
              </div>
            </div>

            {/* Récapitulatif */}
            <div className="blyss-card bg-white border-2 border-primary/10 mb-8">
              <div className="flex items-center gap-3 mb-4 pb-4 border-b border-border">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Sparkles size={24} className="text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground mb-0.5">Votre formule</p>
                  <p className="text-lg font-bold text-foreground">{plan.name}</p>
                </div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-bold text-emerald-700">Actif</span>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Accès aux fonctionnalités</span>
                  <span className="font-semibold text-foreground">Complet</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Support prioritaire</span>
                  <span className="font-semibold text-foreground">Inclus</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Mises à jour</span>
                  <span className="font-semibold text-foreground">Automatiques</span>
                </div>
              </div>
            </div>

            {/* Boutons */}
            <div className="space-y-3">
              <button
                onClick={() => setShowOnboarding(true)}
                className="w-full py-4 rounded-2xl bg-primary text-white font-bold text-base shadow-xl shadow-primary/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                <Sparkles size={20} />
                Découvrir mon espace pro
                <ArrowRight size={20} />
              </button>

              <button
                onClick={() => navigate("/pro/dashboard")}
                className="w-full py-3 rounded-xl text-muted-foreground font-medium text-sm active:scale-95 transition-all hover:text-foreground hover:bg-muted/30"
              >
                Accéder directement à l'espace
              </button>
            </div>
          </div>
        </div>

        <style>{`
          @keyframes fade-in-up {
            from {
              opacity: 0;
              transform: translateY(20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }

          @keyframes gradient-flow {
            0% {
              background-position: 0% center;
            }
            100% {
              background-position: 200% center;
            }
          }

          .animate-fade-in-up {
            animation: fade-in-up 0.8s ease-out backwards;
          }

          .animate-gradient {
            animation: gradient-flow 3s linear infinite;
          }
        `}</style>
      </MobileLayout>
    );
  }

  // Onboarding plein écran avec effet transparent
  return (
    <div className="fixed inset-0 bg-background z-50 overflow-hidden flex flex-col">
      {/* ✅ HEADER TRANSPARENT */}
      <div className="flex-shrink-0 bg-background/80 backdrop-blur-md border-b border-border/50">
        <div className="px-4 py-4">
          {/* Barres de progression */}
          <div className="flex gap-1.5 mb-4">
            {onboardingSlides.map((_, index) => (
              <div key={index} className="flex-1 h-1 rounded-full bg-muted/50 overflow-hidden">
                <div
                  className={`h-full bg-primary transition-all duration-300 ${index < currentSlide
                      ? "w-full"
                      : index === currentSlide
                        ? "w-full animate-progress"
                        : "w-0"
                    }`}
                />
              </div>
            ))}
          </div>

          {/* Header actions */}
          <div className="flex items-center justify-between">
            <button
              onClick={handleSkip}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors font-medium"
            >
              Passer
            </button>
            <span className="text-sm font-semibold text-foreground">
              {currentSlide + 1} / {onboardingSlides.length}
            </span>
            <button
              onClick={handleSkip}
              className="w-8 h-8 rounded-full bg-muted/50 flex items-center justify-center hover:bg-muted transition-colors"
            >
              <X size={18} className="text-foreground" />
            </button>
          </div>
        </div>
      </div>

      {/* Contenu scrollable */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div
          key={currentSlide}
          className={`w-full max-w-md mx-auto animate-slide-in-${slideDirection} space-y-6`}
        >
          {/* Téléphone */}
          <div className="relative mx-auto w-48 h-[360px] flex items-center justify-center">
            <div className="absolute inset-0 bg-foreground rounded-[2.5rem] shadow-2xl p-2">
              <div className={`w-full h-full rounded-[2rem] ${currentSlideData.bgColor} overflow-hidden relative flex items-center justify-center`}>
                {typeof currentSlideData.screenshot === 'string' && currentSlideData.screenshot.includes('http') || currentSlideData.screenshot.includes('/') ? (
                  <img
                    src={currentSlideData.screenshot}
                    alt={currentSlideData.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="text-6xl opacity-20">{currentSlideData.screenshot}</div>
                )}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-5 bg-foreground rounded-b-2xl" />
              </div>
            </div>
          </div>

          {/* Contenu */}
          <div className="text-center">
            <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl ${currentSlideData.iconBg} mb-4`}>
              <Icon size={32} className={currentSlideData.iconColor} strokeWidth={2} />
            </div>

            <h2 className="text-2xl font-bold text-foreground mb-3">{currentSlideData.title}</h2>
            <p className="text-base text-muted-foreground leading-relaxed mb-6">
              {currentSlideData.description}
            </p>

            {/* Features */}
            <div className="space-y-2">
              {currentSlideData.features.map((feature, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 animate-fade-in"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 size={14} className="text-primary" strokeWidth={2.5} />
                  </div>
                  <span className="text-sm font-medium text-foreground text-left">{feature}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ✅ FOOTER TRANSPARENT */}
      <div className="flex-shrink-0 bg-background/80 backdrop-blur-md border-t border-border/50 p-4">
        <div className="max-w-md mx-auto flex items-center gap-3">
          {currentSlide > 0 && (
            <button
              onClick={handlePrevSlide}
              className="px-6 py-3 rounded-xl border-2 border-muted text-foreground font-semibold text-sm active:scale-95 transition-all hover:bg-muted/30"
            >
              Précédent
            </button>
          )}

          <button
            onClick={handleNextSlide}
            className="flex-1 py-4 rounded-2xl bg-primary text-white font-semibold text-base shadow-lg shadow-primary/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            {isLastSlide ? "Commencer" : "Suivant"}
            <ArrowRight size={20} />
          </button>
        </div>
      </div>

      <style>{`
        @keyframes slide-in-next {
          from { opacity: 0; transform: translateX(30px); }
          to { opacity: 1; transform: translateX(0); }
        }

        @keyframes slide-in-prev {
          from { opacity: 0; transform: translateX(-30px); }
          to { opacity: 1; transform: translateX(0); }
        }

        @keyframes fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes progress {
          from { width: 0%; }
          to { width: 100%; }
        }

        .animate-slide-in-next {
          animation: slide-in-next 0.4s ease-out;
        }

        .animate-slide-in-prev {
          animation: slide-in-prev 0.4s ease-out;
        }

        .animate-fade-in {
          animation: fade-in 0.5s ease-out backwards;
        }

        .animate-progress {
          animation: progress 6s linear;
        }
      `}</style>
    </div>
  );
};

export default ProSubscriptionSuccess;