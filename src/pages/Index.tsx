import { useNavigate } from "react-router-dom";
import logo from "@/assets/logo.png";
import MobileLayout from "@/components/MobileLayout";

const Index = () => {
  const navigate = useNavigate();

  return (
    <MobileLayout showNav={false}>
      <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-background">
        {/* Logo & Branding */}
        <div className="flex flex-col items-center mb-16 animate-in fade-in slide-in-from-top-4 duration-700">
          <div className="mb-6">
            <img
              src={logo}
              alt="Blyss"
              className="w-40 h-40 object-contain animate-in zoom-in duration-700"
            />
          </div>
          <h1 className="font-display text-5xl font-bold text-primary mb-3 animate-in fade-in duration-700 delay-150">
            Blyss
          </h1>
          <p className="text-muted-foreground text-center text-base animate-in fade-in duration-700 delay-300">
            Beauté. Business. Sérénité.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="w-full max-w-sm space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-500">
          <button
            onClick={() => navigate("/login")}
            className="
              w-full h-14 rounded-2xl 
              bg-primary hover:bg-primary/90
              text-primary-foreground font-semibold text-base
              shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40
              transition-all duration-300
              active:scale-[0.98]
            "
          >
            Se connecter
          </button>

          <button
            onClick={() => navigate("/signup")}
            className="
              w-full h-14 rounded-2xl
              bg-card border-2 border-foreground/20
              text-foreground font-semibold text-base
              hover:bg-foreground/5 hover:border-foreground/40
              shadow-sm hover:shadow-md
              transition-all duration-300
              active:scale-[0.98]
            "
          >
            Créer un compte
          </button>
        </div>

        {/* Footer Text */}
        <p className="text-center text-xs text-muted-foreground/70 mt-12 px-8 leading-relaxed animate-in fade-in duration-700 delay-700">
          En continuant, tu acceptes nos{" "}
          <button className="underline hover:text-foreground transition-colors">
            Conditions générales
          </button>
        </p>
      </div>
    </MobileLayout>
  );
};

export default Index;
