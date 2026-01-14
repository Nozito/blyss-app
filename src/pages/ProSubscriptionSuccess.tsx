import { useEffect, useState } from "react";
import MobileLayout from "@/components/MobileLayout";
import {
  Sparkles,
  Crown,
  Calendar,
  TrendingUp,
  Bell,
  CreditCard,
  Star,
  Zap,
  ArrowRight,
} from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import Confetti from "react-confetti";

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

  const [showConfetti, setShowConfetti] = useState(true);
  const [animationStep, setAnimationStep] = useState(0);

  useEffect(() => {
    // Animation en cascade
    const timer1 = setTimeout(() => setAnimationStep(1), 500);
    const timer2 = setTimeout(() => setAnimationStep(2), 1000);
    const timer3 = setTimeout(() => setAnimationStep(3), 1500);
    const confettiTimer = setTimeout(() => setShowConfetti(false), 5000);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(confettiTimer);
    };
  }, []);

  if (!plan) {
    navigate("/pro/subscription");
    return null;
  }

  const features = [
    {
      icon: Calendar,
      title: "Agenda intelligent",
      description: "Gère tes rendez-vous en toute simplicité",
      color: "from-blue-500 to-cyan-500",
    },
    {
      icon: TrendingUp,
      title: "Tableau de bord",
      description: "Suis ton activité en temps réel",
      color: "from-purple-500 to-pink-500",
    },
    {
      icon: Bell,
      title: "Notifications smart",
      description: "Ne rate plus jamais un rendez-vous",
      color: "from-emerald-500 to-teal-500",
    },
    {
      icon: CreditCard,
      title: "Paiements en ligne",
      description: "Encaisse directement via Blyss",
      color: "from-amber-500 to-orange-500",
    },
  ];

  return (
    <MobileLayout showNav={false}>
      {showConfetti && (
        <Confetti
          width={window.innerWidth}
          height={window.innerHeight}
          recycle={false}
          numberOfPieces={500}
          gravity={0.3}
        />
      )}

      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8">
        {/* Animation unlock centrale */}
        <div className="relative mb-8">
          {/* Glow effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-primary via-purple-500 to-pink-500 blur-3xl opacity-30 animate-pulse-slow" />

          {/* Cercle principal avec animation */}
          <div
            className={`
              relative w-32 h-32 rounded-full 
              bg-gradient-to-br from-primary via-purple-500 to-pink-500
              flex items-center justify-center
              shadow-2xl shadow-primary/50
              transition-all duration-1000 ease-out
              ${animationStep >= 1 ? "scale-100 opacity-100 rotate-0" : "scale-0 opacity-0 rotate-180"}
            `}
          >
            {/* Cercle intérieur */}
            <div className="w-28 h-28 rounded-full bg-white flex items-center justify-center">
              <Crown
                size={48}
                className="text-primary animate-bounce-slow"
                strokeWidth={2}
              />
            </div>

            {/* Particules autour */}
            {[0, 60, 120, 180, 240, 300].map((angle, i) => (
              <div
                key={i}
                className={`
                  absolute w-3 h-3 rounded-full bg-gradient-to-r from-primary to-pink-500
                  transition-all duration-1000 ease-out
                  ${animationStep >= 1 ? "opacity-100" : "opacity-0"}
                `}
                style={{
                  top: `calc(50% + ${Math.sin((angle * Math.PI) / 180) * 70}px)`,
                  left: `calc(50% + ${Math.cos((angle * Math.PI) / 180) * 70}px)`,
                  transform: "translate(-50%, -50%)",
                  animationDelay: `${i * 100}ms`,
                }}
              />
            ))}
          </div>
        </div>

        {/* Texte de bienvenue */}
        <div
          className={`
            text-center mb-8 transition-all duration-700 ease-out
            ${animationStep >= 1 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}
          `}
        >
          <div className="flex items-center justify-center gap-2 mb-3">
            <Sparkles size={24} className="text-primary animate-pulse" />
            <h1 className="text-3xl font-black bg-gradient-to-r from-primary via-purple-600 to-pink-600 bg-clip-text text-transparent">
              Bienvenue Premium !
            </h1>
            <Sparkles size={24} className="text-primary animate-pulse" />
          </div>

          <p className="text-base text-muted-foreground mb-2">
            Ton compte <span className="font-bold text-foreground">{plan.name}</span> est
            maintenant actif
          </p>

          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-primary/10 to-pink-500/10 border border-primary/20">
            <Star size={16} className="text-primary fill-primary" />
            <span className="text-sm font-semibold text-foreground">
              Tous les outils pro débloqués
            </span>
          </div>
        </div>

        {/* Fonctionnalités en grille */}
        <div
          className={`
            w-full max-w-md mb-8 grid grid-cols-2 gap-3
            transition-all duration-700 ease-out delay-300
            ${animationStep >= 2 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}
          `}
        >
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <div
                key={index}
                className="group blyss-card p-4 hover:shadow-lg transition-all duration-300 cursor-default"
                style={{
                  animationDelay: `${index * 100}ms`,
                }}
              >
                <div
                  className={`
                    w-12 h-12 rounded-xl 
                    bg-gradient-to-br ${feature.color}
                    flex items-center justify-center mb-3
                    shadow-lg group-hover:scale-110 transition-transform
                  `}
                >
                  <Icon size={20} className="text-white" strokeWidth={2.5} />
                </div>
                <h3 className="text-sm font-bold text-foreground mb-1">
                  {feature.title}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>

        {/* Message motivant */}
        <div
          className={`
            w-full max-w-md blyss-card bg-gradient-to-br from-primary/5 to-pink-500/5 border-2 border-primary/20 mb-6
            transition-all duration-700 ease-out delay-500
            ${animationStep >= 3 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}
          `}
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-pink-500 flex items-center justify-center flex-shrink-0">
              <Zap size={18} className="text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-foreground mb-1">
                🚀 Prête à décoller ?
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Configure ton profil, ajoute tes prestations et commence à recevoir tes
                premières réservations en ligne dès aujourd'hui !
              </p>
            </div>
          </div>
        </div>

        {/* Boutons d'action */}
        <div
          className={`
            w-full max-w-md space-y-3
            transition-all duration-700 ease-out delay-700
            ${animationStep >= 3 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}
          `}
        >
          <button
            onClick={() => navigate("/pro/profile")}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-primary via-purple-500 to-pink-500 text-white font-bold text-base shadow-xl shadow-primary/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2 group"
          >
            Accéder à mon profil
            <ArrowRight
              size={20}
              className="group-hover:translate-x-1 transition-transform"
            />
          </button>

          <button
            onClick={() => navigate("/pro/public-profile")}
            className="w-full py-3 rounded-xl border-2 border-primary/30 text-primary font-semibold text-sm active:scale-95 transition-all hover:bg-primary/5"
          >
            Compléter mon profil public
          </button>
        </div>
      </div>

      <style>{`
        @keyframes pulse-slow {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.5; }
        }

        @keyframes bounce-slow {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }

        .animate-pulse-slow {
          animation: pulse-slow 3s ease-in-out infinite;
        }

        .animate-bounce-slow {
          animation: bounce-slow 2s ease-in-out infinite;
        }
      `}</style>
    </MobileLayout>
  );
};

export default ProSubscriptionSuccess;
