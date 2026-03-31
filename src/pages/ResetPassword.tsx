import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Lock, Eye, EyeOff, ChevronLeft, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
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

  // If no token in URL, redirect immediately
  useEffect(() => {
    if (!token) navigate("/forgot-password", { replace: true });
  }, [token, navigate]);

  const passwordError = password && !PASSWORD_REGEX.test(password)
    ? "Au moins 8 caractères, une majuscule, une minuscule et un chiffre"
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
    <MobileLayout showNav={false}>
      <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-gradient-to-b from-background to-muted/20">
        <div className="w-full max-w-md space-y-8">
          {!done && (
            <button
              onClick={() => navigate("/login")}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft size={16} />
              Retour à la connexion
            </button>
          )}

          {done ? (
            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
                <CheckCircle2 size={28} className="text-primary" />
              </div>
              <h1 className="text-2xl font-bold text-foreground">Mot de passe mis à jour</h1>
              <p className="text-sm text-muted-foreground">
                Tu peux maintenant te connecter avec ton nouveau mot de passe.
              </p>
              <button
                onClick={() => navigate("/login", { replace: true })}
                className="w-full h-12 rounded-xl bg-blyss-pink text-white font-semibold text-sm shadow-lg shadow-blyss-pink/30 hover:bg-blyss-pink/90 transition-all active:scale-[0.98] mt-4"
              >
                Se connecter
              </button>
            </div>
          ) : (
            <>
              <div className="text-center space-y-2">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
                  <Lock size={28} className="text-primary" />
                </div>
                <h1 className="text-2xl font-bold text-foreground">Nouveau mot de passe</h1>
                <p className="text-sm text-muted-foreground">
                  Choisis un mot de passe sécurisé pour ton compte.
                </p>
              </div>

              {error && (
                <div className="flex items-center gap-3 p-4 rounded-2xl bg-destructive/10 border border-destructive/20">
                  <AlertCircle size={18} className="text-destructive flex-shrink-0" />
                  <p className="text-sm text-destructive font-medium">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Password */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Nouveau mot de passe
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
                      className={`w-full h-12 pl-4 pr-11 rounded-xl border-2 bg-background text-sm focus:outline-none focus:ring-4 transition-all ${
                        passwordError
                          ? "border-destructive focus:ring-destructive/10"
                          : password
                          ? "border-primary focus:ring-primary/10"
                          : "border-border focus:border-primary focus:ring-primary/10"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {passwordError && (
                    <p className="text-xs text-destructive">{passwordError}</p>
                  )}
                </div>

                {/* Confirm */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Confirmer le mot de passe
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirm ? "text" : "password"}
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      autoComplete="new-password"
                      className={`w-full h-12 pl-4 pr-11 rounded-xl border-2 bg-background text-sm focus:outline-none focus:ring-4 transition-all ${
                        confirmError
                          ? "border-destructive focus:ring-destructive/10"
                          : confirm
                          ? "border-primary focus:ring-primary/10"
                          : "border-border focus:border-primary focus:ring-primary/10"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {confirmError && (
                    <p className="text-xs text-destructive">{confirmError}</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={!canSubmit || isSaving}
                  className="flex items-center justify-center gap-2 w-full h-12 rounded-xl bg-blyss-pink text-white font-semibold text-sm shadow-lg shadow-blyss-pink/30 hover:bg-blyss-pink/90 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Enregistrement...
                    </>
                  ) : (
                    <>
                      <Lock size={16} />
                      Enregistrer le nouveau mot de passe
                    </>
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
