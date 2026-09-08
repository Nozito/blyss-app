import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, CheckCircle2, Loader2 } from "lucide-react";
import MobileLayout from "@/components/MobileLayout";

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
      // Envoi de la demande — on affiche toujours le succès pour ne pas révéler
      // si l'adresse email est associée à un compte (bonne pratique de sécurité)
      await fetch(`${API_URL}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      }).catch(() => {});
    } finally {
      setIsSending(false);
      setSent(true);
    }
  };

  return (
    <MobileLayout>
      <div className="auth-choc">
        <div className="box">
          <button className="back" onClick={() => navigate(-1)}>
            <ChevronLeft size={13} strokeWidth={3} />
            Retour
          </button>

          {sent ? (
            <>
              <span className="brand">Blyss · Console admin</span>
              <div className="tick"><CheckCircle2 size={26} strokeWidth={2.6} /></div>
              <h1>C'est<br />parti</h1>
              <p>
                Si cette adresse est associée à un compte, tu recevras un lien de réinitialisation dans
                quelques minutes. Pense à vérifier tes spams.
              </p>
              <button className="btn" onClick={() => navigate("/login")}>Retour à la connexion</button>
            </>
          ) : (
            <>
              <span className="brand">Blyss · Console admin</span>
              <h1>Mot de passe<br />oublié</h1>
              <p>Saisis ton email, on t'envoie un lien de réinitialisation.</p>

              <form onSubmit={handleSubmit} style={{ marginTop: 34 }}>
                <label htmlFor="fp-email">Adresse email</label>
                <div className="field">
                  <input
                    id="fp-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@blyssapp.fr"
                    required
                    autoComplete="email"
                  />
                </div>
                <button type="submit" className="btn" disabled={isSending || !email.trim()}>
                  {isSending ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      Envoi…
                    </>
                  ) : (
                    "Envoyer le lien"
                  )}
                </button>
              </form>

              <button className="btn-ghost" onClick={() => navigate("/login")}>Retour à la connexion</button>
            </>
          )}
        </div>
      </div>
    </MobileLayout>
  );
};

export default ForgotPassword;
