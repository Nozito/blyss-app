import { useState, useEffect } from "react";
import logo from "@/assets/logo.png";

interface SplashScreenProps {
  onComplete: () => void;
}

const SplashScreen = ({ onComplete }: SplashScreenProps) => {
  const [phase, setPhase] = useState<"initial" | "visible" | "exit">("initial");

  useEffect(() => {
    // Start visible phase
    const visibleTimer = setTimeout(() => {
      setPhase("visible");
    }, 100);

    // Start exit phase
    const exitTimer = setTimeout(() => {
      setPhase("exit");
    }, 1400);

    // Complete
    const completeTimer = setTimeout(() => {
      onComplete();
    }, 1800);

    return () => {
      clearTimeout(visibleTimer);
      clearTimeout(exitTimer);
      clearTimeout(completeTimer);
    };
  }, [onComplete]);

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-background transition-all duration-400 ease-out ${
        phase === "exit" ? "opacity-0 scale-105" : "opacity-100 scale-100"
      }`}
    >
      <div className="flex flex-col items-center">
        <div
          className={`transition-all duration-500 ease-out ${
            phase === "initial"
              ? "opacity-0 scale-90"
              : "opacity-100 scale-100"
          }`}
        >
          <img
            src={logo}
            alt="Blyss"
            className={`w-24 h-24 object-contain ${
              phase === "visible" ? "animate-logo-bounce" : ""
            }`}
          />
        </div>
        <h1
          className={`text-3xl font-semibold text-foreground mt-3 transition-all duration-500 ease-out ${
            phase === "initial"
              ? "opacity-0 translate-y-4"
              : "opacity-100 translate-y-0"
          }`}
          style={{ transitionDelay: "150ms" }}
        >
          Blyss
        </h1>
      </div>
    </div>
  );
};

export default SplashScreen;
