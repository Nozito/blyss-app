import { useEffect, useState } from "react";
import logo from "@/assets/logo.png";

interface SplashScreenProps {
  onComplete: () => void;
}

const SplashScreen = ({ onComplete }: SplashScreenProps) => {
  const [phase, setPhase] = useState<"enter" | "exit">("enter");

  useEffect(() => {
    // Phase d'entrée : 800ms
    const exitTimer = setTimeout(() => {
      setPhase("exit");
    }, 800);

    // Fin de l'animation : 1.3s total
    const completeTimer = setTimeout(() => {
      onComplete();
    }, 1300);

    return () => {
      clearTimeout(exitTimer);
      clearTimeout(completeTimer);
    };
  }, [onComplete]);

  return (
    <div
      className={`
        fixed inset-0 z-[100] flex flex-col items-center justify-center
        bg-background
        transition-opacity duration-500 ease-out
        ${phase === "exit" ? "opacity-0" : "opacity-100"}
      `}
    >
      {/* Logo avec animation */}
      <div
        className={`
          flex flex-col items-center gap-4
          transition-all duration-700 ease-out
          ${phase === "enter" 
            ? "opacity-100 scale-100 translate-y-0" 
            : "opacity-0 scale-95 -translate-y-4"
          }
        `}
        style={{
          animation: phase === "enter" ? "splashEnter 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards" : undefined
        }}
      >
        <img
          src={logo}
          alt="Blyss"
          className="w-24 h-24 object-contain rounded-2xl shadow-lg"
        />
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">
            Blyss
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Beauté. Business. Sérénité.
          </p>
        </div>
      </div>

      {/* Indicateur de chargement subtil */}
      <div
        className={`
          absolute bottom-20 transition-opacity duration-300
          ${phase === "exit" ? "opacity-0" : "opacity-100"}
        `}
      >
        <div className="flex gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-pulse" style={{ animationDelay: "0ms" }} />
          <span className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-pulse" style={{ animationDelay: "150ms" }} />
          <span className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-pulse" style={{ animationDelay: "300ms" }} />
        </div>
      </div>

      <style>{`
        @keyframes splashEnter {
          0% {
            opacity: 0;
            transform: scale(0.8) translateY(20px);
          }
          100% {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
    </div>
  );
};

export default SplashScreen;
