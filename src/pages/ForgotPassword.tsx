import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import MobileLayout from "@/components/MobileLayout";
import { toast } from "sonner";

const API_URL = import.meta.env.VITE_API_URL || "";

const ForgotPassword = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setIsSending(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const json = await res.json();
      if (json.success) {
        setSent(true);
      } else {
        toast.error("Une erreur est survenue. Réessaie dans quelques instants.");
      }
    } catch {
      toast.error("Impossible de contacter le serveur.");
    } finally {
      setIsSending(false);
    }
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

          {sent ? (
            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
                <CheckCircle2 size={28} className="text-primary" />
              </div>
              <h1 className="text-2xl font-bold text-foreground">Email envoyé</h1>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Si cette adresse est associée à un compte, tu recevras un lien de réinitialisation dans quelques minutes.
              </p>
              <p className="text-xs text-muted-foreground">Pense à vérifier tes spams.</p>
              <button
                onClick={() => navigate("/login")}
                className="w-full h-12 rounded-xl bg-blyss-pink text-white font-semibold text-sm shadow-lg shadow-blyss-pink/30 hover:bg-blyss-pink/90 transition-all active:scale-[0.98] mt-4"
              >
                Retour à la connexion
              </button>
            </div>
          ) : (
            <>
              <div className="text-center space-y-2">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
                  <Mail size={28} className="text-primary" />
                </div>
                <h1 className="text-2xl font-bold text-foreground">Mot de passe oublié</h1>
                <p className="text-sm text-muted-foreground">
                  Saisis ton email et on t'envoie un lien de réinitialisation.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Adresse email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ton@email.fr"
                    required
                    autoComplete="email"
                    className="w-full h-12 px-4 rounded-xl border-2 border-border bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSending || !email.trim()}
                  className="flex items-center justify-center gap-2 w-full h-12 rounded-xl bg-blyss-pink text-white font-semibold text-sm shadow-lg shadow-blyss-pink/30 hover:bg-blyss-pink/90 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSending ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Envoi en cours...
                    </>
                  ) : (
                    <>
                      <Mail size={16} />
                      Envoyer le lien
                    </>
                  )}
                </button>
              </form>

              <button
                onClick={() => navigate("/login")}
                className="w-full text-sm text-primary hover:underline font-medium text-center"
              >
                Retour à la connexion
              </button>
            </>
          )}
        </div>
      </div>
    </MobileLayout>
  );
};

export default ForgotPassword;
