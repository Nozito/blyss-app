import { useState, useEffect } from "react";
import logo from "@/assets/logo.png";

interface SplashScreenProps {
  onComplete: () => void;
}

const SplashScreen = ({ onComplete }: SplashScreenProps) => {
  const [phase, setPhase] = useState<"enter" | "hold" | "exit">("enter");

  useEffect(() => {
    const enterTimer = setTimeout(() => setPhase("hold"), 200);   // fade-in
    const exitTimer = setTimeout(() => setPhase("exit"), 1100);   // fade-out
    const completeTimer = setTimeout(() => onComplete(), 1400);   // remove

    return () => {
      clearTimeout(enterTimer);
      clearTimeout(exitTimer);
      clearTimeout(completeTimer);
    };
  }, [onComplete]);

  const wrapperBase =
    "fixed inset-0 z-[100] flex items-center justify-center bg-background transition-opacity duration-300 ease-out";
  const wrapperState =
    phase === "exit" ? "opacity-0" : "opacity-100";

  const logoWrapperBase =
    "flex flex-col items-center transition-transform transition-opacity duration-400 ease-out";
  const logoWrapperState =
    phase === "enter"
      ? "opacity-0 scale-95"
      : phase === "hold"
      ? "opacity-100 scale-100"
      : "opacity-0 scale-100";

  return (
    <div className={`${wrapperBase} ${wrapperState}`}>
      <div className={`${logoWrapperBase} ${logoWrapperState}`}>
        <img
          src={logo}
          alt="Blyss"
          className="w-20 h-20 object-contain rounded-2xl shadow-sm"
        />
        <h1 className="text-xl font-semibold text-foreground mt-3 tracking-wide">
          Blyss
        </h1>
      </div>
    </div>
  );
};

export default SplashScreen;
