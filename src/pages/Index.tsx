import { useNavigate } from "react-router-dom";
import { Sparkles, ArrowRight, Shield, Zap, Heart } from "lucide-react";
import logo from "@/assets/logo.png";
import MobileLayout from "@/components/MobileLayout";

const Index = () => {
  const navigate = useNavigate();

  return (
    <MobileLayout showNav={false}>
      <div className="min-h-screen flex flex-col items-center justify-between px-6 py-8 relative overflow-hidden">
        
        {/* ✅ Effets de fond animés [web:67][web:70] */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 right-10 w-72 h-72 bg-primary/20 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-32 left-10 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse delay-1000" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-primary/5 rounded-full blur-2xl animate-pulse delay-500" />
        </div>

        {/* Logo & Branding [web:66][web:69] */}
        <div className="flex flex-col items-center mt-12 mb-8 animate-in fade-in slide-in-from-top-4 duration-700 relative z-10">
          <div className="relative mb-6">
            {/* Glow effect derrière le logo */}
            <div className="absolute inset-0 bg-primary/30 blur-3xl rounded-full scale-150 animate-pulse" />
            <div className="relative">
              <img
                src={logo}
                alt="Blyss"
                className="w-40 h-40 object-contain animate-in zoom-in duration-700 drop-shadow-2xl"
              />
            </div>
          </div>
          
          <div className="text-center space-y-3">
            <h1 className="font-display text-6xl text-primary text-foreground mb-2 animate-in fade-in duration-700 delay-150 tracking-tight">
              Blyss
            </h1>
            <div className="flex items-center justify-center gap-2 animate-in fade-in duration-700 delay-300">
              <p className="text-lg font-semibold text-primary">
                Beauté. Business. Sérénité.
              </p>
            </div>
            <p className="text-muted-foreground text-sm max-w-xs mx-auto leading-relaxed animate-in fade-in duration-700 delay-500 px-4">
              La plateforme tout-en-un pour gérer ton salon de nail art comme une pro
            </p>
          </div>
        </div>

        {/* ✅ Features cards [web:65][web:66] */}
        <div className="w-full max-w-md space-y-3 mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-700 relative z-10">
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-card/50 backdrop-blur-sm border border-border/50 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Zap size={20} className="text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">Réservations en un clic</p>
              <p className="text-xs text-muted-foreground">Gestion simplifiée de ton agenda</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-4 rounded-2xl bg-card/50 backdrop-blur-sm border border-border/50 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
              <Heart size={20} className="text-emerald-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">Clients fidèles</p>
              <p className="text-xs text-muted-foreground">Historique et préférences sauvegardés</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-4 rounded-2xl bg-card/50 backdrop-blur-sm border border-border/50 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center flex-shrink-0">
              <Shield size={20} className="text-blue-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">Paiements sécurisés</p>
              <p className="text-xs text-muted-foreground">Conformité PCI-DSS garantie</p>
            </div>
          </div>
        </div>

        {/* Action Buttons [web:65][web:68] */}
        <div className="w-full max-w-md space-y-4 mb-6 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-1000 relative z-10">
          <button
            onClick={() => navigate("/signup")}
            className="
              w-full h-16 rounded-2xl 
              bg-gradient-to-r from-primary to-primary/90
              hover:from-primary/90 hover:to-primary
              text-primary-foreground font-bold text-lg
              shadow-xl shadow-primary/30 hover:shadow-2xl hover:shadow-primary/40
              transition-all duration-300
              active:scale-[0.98]
              relative overflow-hidden
              group
            "
          >
            <span className="absolute inset-0 bg-white/20 translate-x-full group-hover:translate-x-0 transition-transform duration-500" />
            <span className="relative flex items-center justify-center gap-2">
              Commencer gratuitement
              <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </span>
          </button>

          <button
            onClick={() => navigate("/login")}
            className="
              w-full h-14 rounded-2xl
              bg-card/70 backdrop-blur-sm border-2 border-border
              text-foreground font-semibold text-base
              hover:bg-card hover:border-primary/30 hover:shadow-lg
              shadow-sm
              transition-all duration-300
              active:scale-[0.98]
              group
            "
          >
            <span className="flex items-center justify-center gap-2">
              J'ai déjà un compte
              <ArrowRight size={18} className="opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
            </span>
          </button>
        </div>

        {/* ✅ Social proof badge [web:62][web:65] */}
        <div className="animate-in fade-in duration-700 delay-1200 relative z-10 mb-4">
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20">
            <div className="flex -space-x-2">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-pink-400 to-pink-600 border-2 border-background" />
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 border-2 border-background" />
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 border-2 border-background" />
            </div>
            <p className="text-xs font-semibold text-primary">
              Rejoins 2 500+ nail artists
            </p>
          </div>
        </div>

        {/* Footer Text [web:66] */}
        <p className="text-center text-[10px] text-muted-foreground/70 leading-relaxed animate-in fade-in duration-700 delay-1400 relative z-10 px-8">
          En continuant, tu acceptes nos{" "}
          <button 
            type="button"
            className="underline hover:text-foreground transition-colors font-medium"
            onClick={() => window.open("/terms", "_blank")}
          >
            Conditions générales
          </button>{" "}
          et notre{" "}
          <button 
            type="button"
            className="underline hover:text-foreground transition-colors font-medium"
            onClick={() => window.open("/privacy", "_blank")}
          >
            Politique de confidentialité
          </button>
        </p>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.05); }
        }
        
        .delay-500 {
          animation-delay: 500ms;
        }
        
        .delay-1000 {
          animation-delay: 1000ms;
        }
        
        .delay-1200 {
          animation-delay: 1200ms;
        }
        
        .delay-1400 {
          animation-delay: 1400ms;
        }
      `}</style>
    </MobileLayout>
  );
};

export default Index;
