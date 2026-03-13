import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, ArrowLeft } from "lucide-react";
import MobileLayout from "@/components/MobileLayout";
import { toast } from "sonner";

const ForgotPassword = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Adresse email invalide");
      return;
    }
    // Placeholder: réinitialisation non implémentée
    setSubmitted(true);
    toast.success("Si ce compte existe, un email a été envoyé.");
  };

  return (
    <MobileLayout showNav={false}>
      <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-gradient-to-b from-background to-muted/20">
        <div className="w-full max-w-md space-y-8">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={16} />
            Retour
          </button>

          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
              <Mail size={28} className="text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Mot de passe oublié</h1>
            <p className="text-sm text-muted-foreground">
              Saisis ton email pour recevoir un lien de réinitialisation.
            </p>
          </div>

          {!submitted ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <label htmlFor="reset-email" className="text-sm font-semibold text-foreground pl-1">
                  Email
                </label>
                <div className="relative">
                  <Mail size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  <input
                    id="reset-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ton@email.com"
                    autoComplete="email"
                    className="w-full h-14 pl-12 pr-4 rounded-2xl bg-card/50 border-2 border-border text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full h-14 rounded-2xl bg-gradient-to-r from-primary to-primary/90 text-primary-foreground font-bold text-base shadow-lg shadow-primary/30 hover:shadow-xl transition-all active:scale-[0.98]"
              >
                Envoyer le lien
              </button>
            </form>
          ) : (
            <div className="text-center p-6 rounded-2xl bg-primary/5 border border-primary/20">
              <p className="text-sm text-foreground font-medium">
                ✅ Vérifie ta boîte email.
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Si un compte existe avec cette adresse, tu recevras un email dans quelques minutes.
              </p>
              <button
                onClick={() => navigate("/login")}
                className="mt-4 text-sm text-primary hover:underline font-medium"
              >
                Retour à la connexion
              </button>
            </div>
          )}
        </div>
      </div>
    </MobileLayout>
  );
};

export default ForgotPassword;
