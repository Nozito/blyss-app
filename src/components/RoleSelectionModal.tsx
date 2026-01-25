import { motion, AnimatePresence } from "framer-motion";
import { Briefcase, Shield, X, Sparkles, TrendingUp, Users } from "lucide-react";

interface RoleSelectionModalProps {
  isOpen: boolean;
  userName: string;
  onSelectRole: (role: 'pro' | 'admin') => void;
  onClose: () => void;
}

const RoleSelectionModal = ({ 
  isOpen, 
  userName, 
  onSelectRole,
  onClose 
}: RoleSelectionModalProps) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          onClick={onClose}
        >
          {/* Background avec blur réduit */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-md"
          />
          
          {/* Orbes animés en arrière-plan (réduits) */}
          <motion.div 
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 0.15 }}
            transition={{ delay: 0.1, duration: 0.8 }}
            className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/30 rounded-full blur-[100px]" 
          />
          <motion.div 
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 0.1 }}
            transition={{ delay: 0.2, duration: 0.8 }}
            className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-orange-500/20 rounded-full blur-[100px]" 
          />

          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            transition={{ 
              type: "spring", 
              damping: 25, 
              stiffness: 300,
              duration: 0.4 
            }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md"
          >
            {/* Container principal - fond plus opaque */}
            <div className="relative bg-background backdrop-blur-sm rounded-[2rem] p-8 shadow-2xl border border-border overflow-hidden">
              {/* Gradient overlay très subtil */}
              <div className="absolute inset-0 bg-gradient-to-br from-primary/3 via-transparent to-orange-500/3 pointer-events-none" />
              
              {/* Bouton fermer moderne */}
              <motion.button
                whileHover={{ scale: 1.1, rotate: 90 }}
                whileTap={{ scale: 0.9 }}
                onClick={onClose}
                className="absolute right-4 top-4 w-10 h-10 rounded-full bg-muted/80 backdrop-blur-sm border border-border flex items-center justify-center hover:bg-muted transition-all z-10 group"
                aria-label="Fermer"
              >
                <X size={18} className="text-muted-foreground group-hover:text-foreground transition-colors" />
              </motion.button>

              {/* En-tête avec typographie massive */}
              <div className="text-center mb-8 relative z-10">
                {/* Icône décorative animée */}
                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                  className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-purple-500/20 backdrop-blur-sm border border-primary/20 mb-5"
                >
                  <Sparkles size={28} className="text-primary" />
                </motion.div>

                <motion.h2 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="text-3xl font-white text-white mb-2 tracking-tight"
                >
                  Bienvenue {userName} !
                </motion.h2>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="text-sm text-white font-medium"
                >
                  Choisis ton espace de travail
                </motion.p>
              </div>

              {/* Options en cards */}
              <div className="space-y-3 relative z-10">
                {/* Interface Pro */}
                <motion.button
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 }}
                  whileHover={{ scale: 1.02, x: 4 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => onSelectRole('pro')}
                  className="relative group overflow-hidden rounded-3xl w-full text-left transition-all duration-300 shadow-lg hover:shadow-xl"
                >
                  {/* Fond avec gradient - opacité totale */}
                  <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary to-purple-600 opacity-100" />
                  
                  {/* Effet de brillance au survol */}
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700">
                    <motion.div 
                      className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                      animate={{ x: ['-100%', '200%'] }}
                      transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 2 }}
                    />
                  </div>

                  {/* Contenu */}
                  <div className="relative flex items-center gap-4 p-5">
                    {/* Icône avec effet 3D */}
                    <motion.div 
                      whileHover={{ rotate: 5, scale: 1.05 }}
                      className="flex-shrink-0 w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center shadow-lg"
                    >
                      <Briefcase size={26} className="text-white drop-shadow-lg" />
                    </motion.div>
                    
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-lg text-white mb-1 tracking-tight drop-shadow-sm">
                        Espace Professionnel
                      </h3>
                      <div className="flex items-center gap-1.5 text-white/90 text-xs mb-1 drop-shadow-sm">
                        <Users size={12} />
                        <span className="font-medium">Gestion clients & rendez-vous</span>
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-white/75 drop-shadow-sm">
                        <TrendingUp size={11} />
                        <span className="font-medium">Dashboard optimisé</span>
                      </div>
                    </div>

                    {/* Flèche indicatrice */}
                    <motion.div
                      animate={{ x: [0, 4, 0] }}
                      transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                      className="text-white drop-shadow-md"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12h14M12 5l7 7-7 7"/>
                      </svg>
                    </motion.div>
                  </div>
                </motion.button>

                {/* Interface Admin */}
                <motion.button
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.6 }}
                  whileHover={{ scale: 1.02, x: 4 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => onSelectRole('admin')}
                  className="relative group overflow-hidden rounded-3xl w-full text-left transition-all duration-300 shadow-lg hover:shadow-xl"
                >
                  {/* Fond avec gradient orange - opacité totale */}
                  <div className="absolute inset-0 bg-gradient-to-br from-orange-500 via-orange-600 to-red-500 opacity-100" />
                  
                  {/* Effet de brillance au survol */}
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700">
                    <motion.div 
                      className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                      animate={{ x: ['-100%', '200%'] }}
                      transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 2, delay: 0.3 }}
                    />
                  </div>

                  {/* Badge "Premium" */}
                  <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.8, type: "spring", stiffness: 500 }}
                    className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-white/30 backdrop-blur-sm border border-white/40 text-[10px] font-bold text-white uppercase tracking-wider shadow-lg"
                  >
                    Premium
                  </motion.div>

                  {/* Contenu */}
                  <div className="relative flex items-center gap-4 p-5">
                    {/* Icône avec effet 3D */}
                    <motion.div 
                      whileHover={{ rotate: 5, scale: 1.05 }}
                      className="flex-shrink-0 w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center shadow-lg"
                    >
                      <Shield size={26} className="text-white drop-shadow-lg" />
                    </motion.div>
                    
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-lg text-white mb-1 tracking-tight drop-shadow-sm">
                        Administration Blyss
                      </h3>
                      <div className="flex items-center gap-1.5 text-white/90 text-xs mb-1 drop-shadow-sm">
                        <Shield size={12} />
                        <span className="font-medium">Gestion plateforme complète</span>
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-white/75 drop-shadow-sm">
                        <Sparkles size={11} />
                        <span className="font-medium">Accès privilégié</span>
                      </div>
                    </div>

                    {/* Flèche indicatrice */}
                    <motion.div
                      animate={{ x: [0, 4, 0] }}
                      transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut", delay: 0.2 }}
                      className="text-white drop-shadow-md"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12h14M12 5l7 7-7 7"/>
                      </svg>
                    </motion.div>
                  </div>
                </motion.button>
              </div>

              {/* Note en bas avec fond plus opaque */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 }}
                className="mt-6 p-3 rounded-2xl bg-muted/80 backdrop-blur-sm border border-border relative z-10"
              >
                <p className="text-[11px] text-muted-foreground text-center leading-relaxed font-medium">
                  💡 Tu pourras basculer entre les interfaces à tout moment depuis tes paramètres
                </p>
              </motion.div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default RoleSelectionModal;
