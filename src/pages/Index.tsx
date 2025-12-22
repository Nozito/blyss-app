import { useNavigate } from "react-router-dom";
import logo from "@/assets/logo.png";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-8">
      <div className="animate-fade-in flex flex-col items-center">
        <img 
          src={logo} 
          alt="Blyss" 
          className="w-32 h-32 object-contain mb-8"
        />
        <h1 className="font-display text-4xl font-semibold text-foreground mb-2">
          Blyss
        </h1>
        <p className="text-muted-foreground text-center mb-12">
          Beauty. Business. Serenity.
        </p>
      </div>

      <div className="w-full max-w-xs space-y-4 animate-slide-up" style={{ animationDelay: "0.2s" }}>
        <button
          onClick={() => navigate("/login")}
          className="w-full py-4 rounded-2xl gradient-primary text-primary-foreground font-medium text-lg shadow-soft touch-button"
        >
          Se connecter
        </button>
        
        <button
          onClick={() => navigate("/signup")}
          className="w-full py-4 rounded-2xl bg-muted text-foreground font-medium text-lg touch-button"
        >
          Créer un compte
        </button>
      </div>

      <p className="text-xs text-muted-foreground mt-12 text-center animate-fade-in" style={{ animationDelay: "0.4s" }}>
        Pour les professionnels de la beauté
      </p>
    </div>
  );
};

export default Index;
