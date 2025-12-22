import { useState, useEffect } from "react";
import logo from "@/assets/logo.png";

interface SplashScreenProps {
  onComplete: () => void;
}

const SplashScreen = ({ onComplete }: SplashScreenProps) => {
  const [animationPhase, setAnimationPhase] = useState<"fade" | "bounce" | "exit">("fade");

  useEffect(() => {
    // Fade in phase
    const bounceTimer = setTimeout(() => {
      setAnimationPhase("bounce");
    }, 600);

    // Exit phase
    const exitTimer = setTimeout(() => {
      setAnimationPhase("exit");
    }, 1600);

    // Complete
    const completeTimer = setTimeout(() => {
      onComplete();
    }, 2000);

    return () => {
      clearTimeout(bounceTimer);
      clearTimeout(exitTimer);
      clearTimeout(completeTimer);
    };
  }, [onComplete]);

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-background transition-opacity duration-400 ${
        animationPhase === "exit" ? "opacity-0" : "opacity-100"
      }`}
    >
      <div className="flex flex-col items-center">
        <img
          src={logo}
          alt="Blyss"
          className={`w-28 h-28 object-contain transition-all duration-500 ${
            animationPhase === "fade"
              ? "opacity-0 scale-75"
              : animationPhase === "bounce"
              ? "opacity-100 scale-100 animate-logo-bounce"
              : "opacity-100 scale-100"
          }`}
        />
        <h1
          className={`font-display text-4xl font-semibold text-foreground mt-4 transition-all duration-500 ${
            animationPhase === "fade"
              ? "opacity-0 translate-y-4"
              : "opacity-100 translate-y-0"
          }`}
        >
          Blyss
        </h1>
      </div>
    </div>
  );
};

export default SplashScreen;
