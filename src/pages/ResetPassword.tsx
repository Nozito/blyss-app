import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, ChevronLeft, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import MobileLayout from "@/components/MobileLayout";
import { toast } from "sonner";

const API_URL = import.meta.env.VITE_API_URL || "";

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

const ResetPassword = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) navigate("/forgot-password", { replace: true });
  }, [token, navigate]);

  const passwordError = password && !PASSWORD_REGEX.test(password)
    ? "8 caractères min., une majuscule, une minuscule, un chiffre"
    : null;

  const confirmError = confirm && password !== confirm
    ? "Les mots de passe ne correspondent pas"
    : null;

  const canSubmit = password && confirm && !passwordError && !confirmError;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const json = await res.json();

      if (json.success) {
        setDone(true);
      } else {
        const msgs: Record<string, string> = {
          invalid_token: "Ce lien est invalide ou a expiré.",
          token_expired: "Ce lien a expiré. Fais une nouvelle demande.",
          token_already_used: "Ce lien a déjà été utilisé.",
        };
        setError(msgs[json.error] ?? "Une erreur est survenue. Réessaie.");
      }
    } catch {
      toast.error("Impossible de contacter le serveur.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <MobileLayout>
      <div className="auth-choc">
        <div className="box">
          {!done && (
            <button className="back" onClick={() => navigate("/login")}>
              <ChevronLeft size={13} strokeWidth={3} />
              Retour à la connexion
            </button>
          )}

          {done ? (
            <>
              <span className="brand">Blyss · Console admin</span>
              <div className="tick"><CheckCircle2 size={26} strokeWidth={2.6} /></div>
              <h1>Mot de passe<br />à jour</h1>
              <p>Tu peux te connecter avec ton nouveau mot de passe.</p>
              <button className="btn" onClick={() => navigate("/login", { replace: true })}>Se connecter</button>
            </>
          ) : (
            <>
              <span className="brand">Blyss · Console admin</span>
              <h1>Nouveau<br />mot de passe</h1>
              <p>Choisis un mot de passe sécurisé pour ton compte admin.</p>

              {error && (
                <div className="alert">
                  <AlertCircle size={16} className="shrink-0" />
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} style={{ marginTop: 32 }}>
                <label htmlFor="rp-pw">Nouveau mot de passe</label>
                <div className="field">
                  <input
                    id="rp-pw"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    className={passwordError ? "err" : ""}
                  />
                  <button type="button" className="toggle" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "Masquer" : "Afficher"}>
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
                {passwordError && <p className="hint err">{passwordError}</p>}

                <div style={{ height: 24 }} />

                <label htmlFor="rp-confirm">Confirmer</label>
                <div className="field">
                  <input
                    id="rp-confirm"
                    type={showConfirm ? "text" : "password"}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                    className={confirmError ? "err" : ""}
                  />
                  <button type="button" className="toggle" onClick={() => setShowConfirm((v) => !v)} aria-label={showConfirm ? "Masquer" : "Afficher"}>
                    {showConfirm ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
                {confirmError && <p className="hint err">{confirmError}</p>}

                <button type="submit" className="btn" disabled={!canSubmit || isSaving}>
                  {isSaving ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      Enregistrement…
                    </>
                  ) : (
                    "Enregistrer"
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </MobileLayout>
  );
};

export default ResetPassword;
