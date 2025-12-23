import { useNavigate } from "react-router-dom";
import logo from "@/assets/logo.png";
import MobileLayout from "@/components/MobileLayout";

const Index = () => {
  const navigate = useNavigate();

  return (
    <MobileLayout showNav={false}>
        <div className="py-6 animate-fade-in">
        <div className="flex flex-col items-center mt-12">
          <div className="animate-fade-in flex flex-col items-center">
            <img 
              src={logo} 
              alt="Blyss" 
              className="w-32 h-32 object-contain mb-8"
            />
            <h1 className="font-display text-4xl font-semibold text-pink-500 mb-2">
              Blyss
            </h1>
            <p className="text-muted-foreground text-center mb-12">
              Beauté. Business. Sérénité.
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
        </div>
      </div>
    </MobileLayout>
  );
};

export default Index;
