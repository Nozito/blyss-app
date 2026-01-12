import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import logo from "@/assets/logo.png";

interface SplashScreenProps {
  onComplete: () => void;
}

const SplashScreen = ({ onComplete }: SplashScreenProps) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
    }, 2800);

    return () => clearTimeout(timer);
  }, []);

  return (
    <AnimatePresence onExitComplete={onComplete}>
      {isVisible && (
        <motion.div
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white overflow-hidden"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Cercles animés en arrière-plan */}
          <motion.div
            className="absolute top-1/4 -right-32 w-96 h-96 rounded-full"
            style={{
              background: "radial-gradient(circle, rgba(236, 72, 153, 0.08) 0%, transparent 70%)",
            }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ 
              scale: [0, 1.2, 1],
              opacity: [0, 1, 0.6],
              x: [0, -20, 0],
              y: [0, 20, 0],
            }}
            transition={{
              duration: 2.5,
              ease: [0.22, 1, 0.36, 1],
            }}
          />
          <motion.div
            className="absolute -bottom-32 -left-32 w-80 h-80 rounded-full"
            style={{
              background: "radial-gradient(circle, rgba(236, 72, 153, 0.06) 0%, transparent 70%)",
            }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ 
              scale: [0, 1.3, 1],
              opacity: [0, 1, 0.5],
              x: [0, 30, 0],
              y: [0, -30, 0],
            }}
            transition={{
              duration: 2.8,
              ease: [0.22, 1, 0.36, 1],
              delay: 0.1,
            }}
          />

          {/* Contenu principal */}
          <motion.div
            className="relative flex flex-col items-center gap-8 z-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.5 }}
          >
            {/* Logo avec effet de particules */}
            <motion.div className="relative">
              {/* Anneaux concentriques autour du logo */}
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="absolute inset-0 rounded-full border-2 border-primary/20"
                  style={{
                    width: `${132 + i * 20}px`,
                    height: `${132 + i * 20}px`,
                    left: `${-10 - i * 10}px`,
                    top: `${-10 - i * 10}px`,
                  }}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ 
                    scale: [0, 1.2, 1],
                    opacity: [0, 0.6, 0],
                  }}
                  transition={{
                    duration: 1.5,
                    delay: 0.2 + i * 0.15,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                />
              ))}

              {/* Glow pulsant */}
              <motion.div
                className="absolute -inset-8 bg-primary/5 rounded-full blur-2xl"
                animate={{
                  scale: [1, 1.3, 1],
                  opacity: [0.3, 0.6, 0.3],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />
              
              {/* Logo */}
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{
                  duration: 0.8,
                  ease: [0.34, 1.56, 0.64, 1],
                  scale: {
                    type: "spring",
                    stiffness: 200,
                    damping: 15,
                  },
                }}
              >
                <motion.img
                  src={logo}
                  alt="Blyss"
                  className="w-32 h-32 object-contain relative z-10"
                  animate={{
                    y: [0, -8, 0],
                  }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                />
              </motion.div>

              {/* Particules flottantes autour du logo */}
              {[...Array(6)].map((_, i) => {
                const angle = (i * 60) * (Math.PI / 180);
                const radius = 70;
                const x = Math.cos(angle) * radius;
                const y = Math.sin(angle) * radius;
                
                return (
                  <motion.div
                    key={i}
                    className="absolute w-1.5 h-1.5 rounded-full bg-primary/40"
                    style={{
                      left: `calc(50% + ${x}px)`,
                      top: `calc(50% + ${y}px)`,
                    }}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{
                      scale: [0, 1, 0],
                      opacity: [0, 1, 0],
                      x: [0, x * 0.3, 0],
                      y: [0, y * 0.3, 0],
                    }}
                    transition={{
                      duration: 2,
                      delay: 0.5 + i * 0.1,
                      repeat: Infinity,
                      repeatDelay: 0.5,
                      ease: "easeInOut",
                    }}
                  />
                );
              })}
            </motion.div>

            {/* Texte avec effet de révélation */}
            <div className="text-center space-y-2">
              <motion.h1
                className="font-display text-5xl font-bold text-primary overflow-hidden"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
              >
                {["B", "l", "y", "s", "s"].map((letter, i) => (
                  <motion.span
                    key={i}
                    className="inline-block"
                    initial={{ y: 100, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{
                      delay: 0.5 + i * 0.08,
                      duration: 0.6,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                  >
                    {letter}
                  </motion.span>
                ))}
              </motion.h1>
              
              <motion.p
                className="text-sm text-muted-foreground"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ 
                  delay: 1, 
                  duration: 0.5,
                  ease: [0.22, 1, 0.36, 1]
                }}
              >
                Beauté. Business. Sérénité.
              </motion.p>
            </div>
          </motion.div>

          {/* Barre de progression stylée */}
          <motion.div
            className="absolute bottom-0 left-0 right-0 h-1 overflow-hidden"
          >
            <motion.div
              className="h-full bg-gradient-to-r from-primary via-pink-400 to-primary bg-[length:200%_100%]"
              initial={{ x: "-100%" }}
              animate={{ 
                x: "0%",
              }}
              transition={{ 
                duration: 2.5, 
                ease: [0.22, 1, 0.36, 1],
              }}
            />
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent"
              animate={{
                x: ["-100%", "200%"],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: "linear",
              }}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SplashScreen;
