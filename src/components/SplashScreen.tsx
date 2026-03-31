/**
 * SplashScreen — Blyss (Apple-level)
 * Ultra minimal, fluide, premium.
 */

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import logo from "@/assets/logo.png";

// ═══════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════

const C = {
  bg: "#fff1f5",
  rgb: "219, 39, 119",
};

const T = {
  min: 2000,
  exit: 350,

  logo: 0.6,
  textDelay: 0.4,
  loaderDelay: 0.6,
};

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════

interface SplashScreenProps {
  onComplete: () => void;
  isAuthReady: boolean;
}

const SplashScreen = ({ onComplete, isAuthReady }: SplashScreenProps) => {
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(true);

  const timerDone = useRef(false);
  const authReady = useRef(isAuthReady);
  const completed = useRef(false);

  const tryComplete = () => {
    if (completed.current) return;
    if (!timerDone.current || !authReady.current) return;

    completed.current = true;
    setProgress(100);

    setTimeout(() => setVisible(false), T.exit);
  };

  useEffect(() => {
    authReady.current = isAuthReady;
    if (isAuthReady) tryComplete();
  }, [isAuthReady]);

  useEffect(() => {
    const start = Date.now();
    let raf: number;

    const tick = () => {
      const t = Math.min((Date.now() - start) / T.min, 1);
      const eased = 1 - Math.pow(1 - t, 3);

      setProgress(Math.round(eased * 90));

      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        timerDone.current = true;
        tryComplete();
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <AnimatePresence onExitComplete={onComplete}>
      {visible && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{
            background: `
              radial-gradient(circle at 30% 20%, rgba(${C.rgb},0.06), transparent 40%),
              ${C.bg}
            `,
          }}
          initial={{ opacity: 1 }}
          exit={{
            opacity: 0,
            scale: 1.03,
            filter: "brightness(1.04)",
          }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >

          {/* CONTENT */}
          <div className="flex flex-col items-center">

            {/* LOGO */}
            <motion.div
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{
                opacity: 1,
                scale: progress === 100 ? 1.06 : 1,
              }}
              transition={{
                duration: T.logo,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="relative"
            >
              {/* soft glow */}
              <motion.div
                className="absolute inset-[-30px] rounded-full"
                style={{
                  background: `radial-gradient(circle, rgba(${C.rgb},0.12), transparent 70%)`,
                }}
                animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0.7, 0.4] }}
                transition={{ duration: 3, repeat: Infinity }}
              />

              <img
                src={logo}
                alt="Blyss"
                className="w-24 h-24 object-contain"
                style={{
                  filter: `drop-shadow(0 10px 30px rgba(${C.rgb},0.25))`,
                }}
              />
            </motion.div>

            {/* TEXT */}
            <motion.div
              className="mt-8 text-center"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: T.textDelay,
                duration: 0.5,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              <h1 className="text-4xl font-bold tracking-tight text-pink-600">
                Blyss
              </h1>

              <p
                className="mt-2 text-xs tracking-[0.25em]"
                style={{ color: `rgba(${C.rgb},0.45)` }}
              >
                BEAUTÉ · BUSINESS · SÉRÉNITÉ
              </p>
            </motion.div>

            {/* LOADER */}
            <motion.div
              className="mt-8 w-24 h-[2px] rounded-full overflow-hidden"
              style={{ background: `rgba(${C.rgb},0.15)` }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: T.loaderDelay }}
            >
              <motion.div
                className="h-full"
                style={{
                  background: `rgba(${C.rgb},0.7)`,
                }}
                animate={{
                  width: `${progress}%`,
                }}
                transition={{ ease: "easeOut", duration: 0.2 }}
              />
            </motion.div>

            {/* MICRO TEXT */}
            <motion.p
              className="mt-3 text-[11px]"
              style={{ color: `rgba(${C.rgb},0.4)` }}
              initial={{ opacity: 0 }}
              animate={{ opacity: progress > 20 ? 1 : 0 }}
            >
              Chargement...
            </motion.p>

          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SplashScreen;