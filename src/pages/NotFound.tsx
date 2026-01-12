import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { motion } from "framer-motion";
import { Home, Search } from "lucide-react";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-white">
      {/* Illustration animée */}
      <motion.div
        className="relative mb-8"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Cercle rose en arrière-plan */}
        <motion.div
          className="absolute inset-0 -z-10 bg-primary/5 rounded-full blur-3xl"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        {/* 404 stylisé */}
        <motion.div
          className="relative"
          initial={{ y: 20 }}
          animate={{ y: 0 }}
          transition={{
            duration: 0.8,
            ease: [0.34, 1.56, 0.64, 1],
          }}
        >
          <h1 className="text-[120px] font-display font-bold text-primary leading-none">
            404
          </h1>
          
          {/* Icône de recherche animée */}
          <motion.div
            className="absolute -top-4 -right-4 bg-white rounded-full p-3 shadow-lg"
            animate={{
              rotate: [0, -10, 10, -10, 0],
              y: [0, -5, 0],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            <Search className="w-8 h-8 text-primary" />
          </motion.div>
        </motion.div>

        {/* Petites particules décoratives */}
        {[...Array(3)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-2 h-2 rounded-full bg-primary/30"
            style={{
              left: `${20 + i * 40}%`,
              top: `${10 + i * 20}%`,
            }}
            animate={{
              y: [0, -20, 0],
              opacity: [0.3, 1, 0.3],
            }}
            transition={{
              duration: 2 + i * 0.5,
              repeat: Infinity,
              ease: "easeInOut",
              delay: i * 0.3,
            }}
          />
        ))}
      </motion.div>

      {/* Contenu textuel */}
      <motion.div
        className="text-center space-y-3 mb-10"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.6 }}
      >
        <h2 className="text-2xl font-bold text-foreground">
          Page introuvable
        </h2>
        <p className="text-muted-foreground max-w-sm">
          Oups ! On dirait que cette page n'existe pas ou a été déplacée.
        </p>
      </motion.div>

      {/* Boutons d'action */}
      <motion.div
        className="w-full max-w-sm space-y-3"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.6 }}
      >
        <button
          onClick={() => navigate("/")}
          className="
            w-full h-14 rounded-2xl 
            bg-primary hover:bg-primary/90
            text-primary-foreground font-semibold
            shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40
            transition-all duration-300
            active:scale-[0.98]
            flex items-center justify-center gap-2
          "
        >
          <Home size={20} />
          Retour à l'accueil
        </button>

        <button
          onClick={() => navigate(-1)}
          className="
            w-full h-14 rounded-2xl
            bg-card border-2 border-muted
            text-foreground font-medium
            hover:bg-foreground/5 hover:border-foreground/30
            transition-all duration-300
            active:scale-[0.98]
          "
        >
          Page précédente
        </button>
      </motion.div>
    </div>
  );
};

export default NotFound;
