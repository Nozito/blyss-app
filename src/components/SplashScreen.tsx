/**
 * SplashScreen — Blyss (Apple-level)
 * Ultra minimal, fluide, premium. Pas de logo : juste un fond dégradé "dust"
 * et un mot qui tourne toutes les 10s ("cooking", "whisking", ...).
 */

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LoadingBreadcrumb } from "@/components/ui/animated-loading-svg-text-shimmer";

// ═══════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════

const C = {
  bg: "#0a0a0b",
  rgb: "255, 107, 156", // rose Dusk (#ff6b9c)
};

const T = {
  min: 2000,
  exit: 350,

  logo: 0.6,
  loaderDelay: 0.6,
  wordInterval: 10000,
};

const LOADING_WORDS = [
  "cooking",
  "whisking",
  "plating",
  "simmering",
  "polishing",
  "brewing",
];

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
  const [wordIndex, setWordIndex] = useState(0);

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

  useEffect(() => {
    const interval = setInterval(() => {
      setWordIndex((i) => (i + 1) % LOADING_WORDS.length);
    }, T.wordInterval);
    return () => clearInterval(interval);
  }, []);

  return (
    <AnimatePresence onExitComplete={onComplete}>
      {visible && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{
            background: `
              radial-gradient(circle at 30% 20%, rgba(${C.rgb},0.10), transparent 45%),
              linear-gradient(160deg, #0a0a0b 0%, #141416 55%, #1c1c1e 100%)
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

            {/* ROTATING WORD */}
            <motion.div
              className="min-w-[10rem] text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: T.logo }}
            >
              <AnimatePresence mode="wait">
                <motion.span
                  key={LOADING_WORDS[wordIndex]}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  className="block text-lg font-medium tracking-wide text-white/70"
                >
                  {LOADING_WORDS[wordIndex]}
                </motion.span>
              </AnimatePresence>
            </motion.div>

            {/* LOADER */}
            <motion.div
              className="mt-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: progress > 20 ? 1 : 0 }}
              transition={{ delay: T.loaderDelay }}
            >
              <LoadingBreadcrumb text="" showChevron={false} className="text-[#ff6b9c]" />
            </motion.div>

          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SplashScreen;