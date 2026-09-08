import { useState, useCallback, FormEvent, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Loader2, AlertCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const VALIDATION_RULES = {
  EMAIL_REGEX: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PASSWORD_MIN_LENGTH: 6,
  PASSWORD_MAX_LENGTH: 128,
} as const;

const ERROR_MESSAGES = {
  EMAIL_REQUIRED: "Email requis",
  EMAIL_INVALID: "Format d'email invalide",
  PASSWORD_REQUIRED: "Mot de passe requis",
  PASSWORD_TOO_SHORT: `Minimum ${VALIDATION_RULES.PASSWORD_MIN_LENGTH} caractères`,
  PASSWORD_TOO_LONG: `Maximum ${VALIDATION_RULES.PASSWORD_MAX_LENGTH} caractères`,
  LOGIN_FAILED: "Email ou mot de passe incorrect",
  NETWORK_ERROR: "Erreur de connexion. Vérifie ta connexion internet.",
} as const;

const MAX_ATTEMPTS = 5;

interface FormErrors {
  email?: string;
  password?: string;
}

const Login = () => {
  const navigate = useNavigate();
  const { login, logout, isLoading, isAuthenticated, user } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [attemptCount, setAttemptCount] = useState(0);

  // Un admin déjà connecté file droit au backoffice.
  // Le web ne sert plus les comptes client/pro (mobile only) — on les déconnecte.
  useEffect(() => {
    if (!isLoading && isAuthenticated && user) {
      if (user.is_admin === true) {
        navigate("/admin/dashboard", { replace: true });
        return;
      }
      logout();
      toast.error("L'espace client/pro n'est plus disponible sur le web. Utilise l'application mobile Blyss.");
    }
  }, [isLoading, isAuthenticated, user, navigate, logout]);

  const validateEmail = useCallback((value: string): string | undefined => {
    const trimmed = value.trim();
    if (!trimmed) return ERROR_MESSAGES.EMAIL_REQUIRED;
    if (!VALIDATION_RULES.EMAIL_REGEX.test(trimmed)) return ERROR_MESSAGES.EMAIL_INVALID;
    if (trimmed.length > 254) return ERROR_MESSAGES.EMAIL_INVALID; // RFC 5321
    return undefined;
  }, []);

  const validatePassword = useCallback((value: string): string | undefined => {
    if (!value) return ERROR_MESSAGES.PASSWORD_REQUIRED;
    if (value.length < VALIDATION_RULES.PASSWORD_MIN_LENGTH) return ERROR_MESSAGES.PASSWORD_TOO_SHORT;
    if (value.length > VALIDATION_RULES.PASSWORD_MAX_LENGTH) return ERROR_MESSAGES.PASSWORD_TOO_LONG;
    return undefined;
  }, []);

  const handleEmailChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
    setErrors((prev) => (prev.email ? { ...prev, email: undefined } : prev));
    setFormError(null);
  }, []);

  const handlePasswordChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
    setErrors((prev) => (prev.password ? { ...prev, password: undefined } : prev));
    setFormError(null);
  }, []);

  const handleLogin = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();

      if (attemptCount >= MAX_ATTEMPTS) {
        setFormError("Trop de tentatives. Patiente une minute avant de réessayer.");
        return;
      }

      const emailError = validateEmail(email);
      const passwordError = validatePassword(password);
      if (emailError || passwordError) {
        setErrors({ email: emailError, password: passwordError });
        return;
      }
      setErrors({});
      setFormError(null);

      try {
        const sanitizedEmail = email.trim().toLowerCase();
        const response = await login({ email: sanitizedEmail, password });

        if (response.success && response.data?.user) {
          const loggedUser = response.data.user;
          if (!loggedUser.is_admin) {
            await logout();
            setAttemptCount((prev) => prev + 1);
            setFormError("L'espace client/pro n'est plus disponible sur le web. Utilise l'application mobile Blyss.");
            return;
          }
          setAttemptCount(0);
          setTimeout(() => navigate("/admin/dashboard", { replace: true }), 200);
        } else {
          setAttemptCount((prev) => prev + 1);
          setFormError(
            response.error === "account_disabled"
              ? "Ton compte a été désactivé. Contacte le support."
              : ERROR_MESSAGES.LOGIN_FAILED,
          );
        }
      } catch (error) {
        console.error("Login error:", error);
        setAttemptCount((prev) => prev + 1);
        setFormError(ERROR_MESSAGES.NETWORK_ERROR);
      }
    },
    [email, password, attemptCount, login, logout, navigate, validateEmail, validatePassword],
  );

  const goToForgot = useCallback(() => {
    if (!isLoading) navigate("/forgot-password");
  }, [isLoading, navigate]);

  return (
    <div className="auth-choc">
      <div className="box">
        <span className="brand" style={{ marginTop: 0 }}>Blyss · Console admin</span>

        <h1>Accès<br />administrateur</h1>
        <p>Réservé à l'équipe Blyss. Connecte-toi pour accéder au backoffice.</p>

        <form onSubmit={handleLogin} noValidate autoComplete="off" style={{ marginTop: 34 }}>
          <div className="field" style={{ marginBottom: 24 }}>
            <label htmlFor="login-email">Adresse email</label>
            <input
              id="login-email"
              type="email"
              className={errors.email ? "err" : undefined}
              value={email}
              onChange={handleEmailChange}
              onBlur={() => setErrors((p) => ({ ...p, email: validateEmail(email) }))}
              placeholder="admin@blyssapp.fr"
              disabled={isLoading}
              autoComplete="email"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck="false"
              aria-invalid={!!errors.email}
              maxLength={254}
              required
            />
            {errors.email && <div className="hint err">{errors.email}</div>}
          </div>

          <div className="field">
            <label htmlFor="login-password">Mot de passe</label>
            <input
              id="login-password"
              type={showPassword ? "text" : "password"}
              className={errors.password ? "err" : undefined}
              value={password}
              onChange={handlePasswordChange}
              onBlur={() => setErrors((p) => ({ ...p, password: validatePassword(password) }))}
              placeholder="••••••••"
              disabled={isLoading}
              autoComplete="current-password"
              aria-invalid={!!errors.password}
              maxLength={VALIDATION_RULES.PASSWORD_MAX_LENGTH}
              required
            />
            <button
              type="button"
              className="toggle"
              onClick={() => setShowPassword((p) => !p)}
              disabled={isLoading}
              aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
              aria-pressed={showPassword}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
            {errors.password && <div className="hint err">{errors.password}</div>}
          </div>

          {formError && (
            <div className="alert"><AlertCircle size={15} strokeWidth={2.5} />{formError}</div>
          )}

          <button
            type="submit"
            className="btn"
            disabled={isLoading || attemptCount >= MAX_ATTEMPTS}
            aria-busy={isLoading}
          >
            {isLoading ? (<><Loader2 size={15} className="animate-spin" />Connexion…</>) : "Se connecter"}
          </button>
        </form>

        <button className="btn-ghost" onClick={goToForgot} disabled={isLoading}>
          Mot de passe oublié
        </button>
      </div>
    </div>
  );
};

export default Login;
