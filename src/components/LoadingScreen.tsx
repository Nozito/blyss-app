import { motion } from "framer-motion";
import logo from "@/assets/logo.png";

const LoadingScreen = () => {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{ backgroundColor: "#ffeaf1" }}
    >
      <motion.div
        className="flex flex-col items-center gap-6"
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Logo avec glow doux */}
        <div className="relative">
          <motion.div
            className="absolute -inset-6 rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(236,72,153,0.18) 0%, transparent 70%)",
            }}
            animate={{ scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
          <img
            src={logo}
            alt="Blyss"
            className="w-16 h-16 object-contain relative z-10"
          />
        </div>

        {/* Dots */}
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-primary/50"
              animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1, 0.8] }}
              transition={{
                duration: 1,
                repeat: Infinity,
                delay: i * 0.18,
                ease: "easeInOut",
              }}
            />
          ))}
        </div>
      </motion.div>
    </div>
  );
};

export default LoadingScreen;
