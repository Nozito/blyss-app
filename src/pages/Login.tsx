import { useState, useCallback, forwardRef, FormEvent, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

const API_URL = import.meta.env.VITE_API_URL || "";

// ✅ Constantes de validation centralisées [web:82]
const VALIDATION_RULES = {
  EMAIL_REGEX: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PASSWORD_MIN_LENGTH: 6,
  PASSWORD_MAX_LENGTH: 128, // Prévention DoS
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

interface FormErrors {
  email?: string;
  password?: string;
}

interface BlobConfig {
  size: number;
  left: number;
  top: number;
  animationDelay: number;
  animationDuration: number;
}

const Login = forwardRef<HTMLDivElement>((_, ref) => {
  const navigate = useNavigate();
  const { login, logout, refreshProfile, isLoading, isAuthenticated, user } = useAuth();

  // ✅ État du formulaire
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [attemptCount, setAttemptCount] = useState(0);

  // Second facteur (comptes admin avec 2FA activée)
  const [stage, setStage] = useState<"credentials" | "2fa">("credentials");
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [otpSubmitting, setOtpSubmitting] = useState(false);

  // Fond liquide — valeurs aléatoires générées une seule fois au montage
  const blobsData: BlobConfig[] = useMemo(
    () =>
      Array.from({ length: 6 }).map(() => ({
        size: Math.random() * 200 + 150,
        left: Math.random() * 80 + 10,
        top: Math.random() * 80 + 10,
        animationDelay: Math.random() * -20,
        animationDuration: Math.random() * 15 + 15,
      })),
    []
  );
  const blobRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const x = e.clientX / window.innerWidth;
      const y = e.clientY / window.innerHeight;
      blobRefs.current.forEach((blob, index) => {
        if (blob) {
          const speed = (index + 1) * 20;
          blob.style.marginLeft = `${x * speed}px`;
          blob.style.marginTop = `${y * speed}px`;
        }
      });
    };
    document.addEventListener("mousemove", handleMouseMove);
    return () => document.removeEventListener("mousemove", handleMouseMove);
  }, []);

  // Redirect already-authenticated admins straight to the admin panel.
  // Client/pro accounts are no longer served by the web app (mobile-only) — log them out.
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

  // ✅ Validation sécurisée de l'email [web:82]
  const validateEmail = useCallback((value: string): string | undefined => {
    const trimmedEmail = value.trim();
    if (!trimmedEmail) return ERROR_MESSAGES.EMAIL_REQUIRED;
    if (!VALIDATION_RULES.EMAIL_REGEX.test(trimmedEmail)) return ERROR_MESSAGES.EMAIL_INVALID;
    if (trimmedEmail.length > 254) return ERROR_MESSAGES.EMAIL_INVALID; // RFC 5321
    return undefined;
  }, []);

  // ✅ Validation sécurisée du mot de passe [web:82]
  const validatePassword = useCallback((value: string): string | undefined => {
    if (!value) return ERROR_MESSAGES.PASSWORD_REQUIRED;
    if (value.length < VALIDATION_RULES.PASSWORD_MIN_LENGTH) return ERROR_MESSAGES.PASSWORD_TOO_SHORT;
    if (value.length > VALIDATION_RULES.PASSWORD_MAX_LENGTH) return ERROR_MESSAGES.PASSWORD_TOO_LONG;
    return undefined;
  }, []);

  const handleEmailBlur = useCallback(() => {
    setErrors((prev) => ({ ...prev, email: validateEmail(email) }));
  }, [email, validateEmail]);

  const handlePasswordBlur = useCallback(() => {
    setErrors((prev) => ({ ...prev, password: validatePassword(password) }));
  }, [password, validatePassword]);

  const handleEmailChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
    setErrors((prev) => (prev.email ? { ...prev, email: undefined } : prev));
  }, []);

  const handlePasswordChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
    setErrors((prev) => (prev.password ? { ...prev, password: undefined } : prev));
  }, []);

  const togglePasswordVisibility = useCallback(() => setShowPassword((prev) => !prev), []);

  // ✅ Soumission du formulaire avec validation complète — connecté à l'API réelle [web:80][web:82]
  const handleLogin = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();

      if (attemptCount >= 5) {
        toast.error("Trop de tentatives. Attends 1 minute.");
        return;
      }

      const emailError = validateEmail(email);
      const passwordError = validatePassword(password);

      if (emailError || passwordError) {
        setErrors({ email: emailError, password: passwordError });
        toast.error(emailError || passwordError || ERROR_MESSAGES.LOGIN_FAILED);
        return;
      }

      setErrors({});

      try {
        const sanitizedEmail = email.trim().toLowerCase();
        const response = await login({ email: sanitizedEmail, password });

        // Compte admin avec 2FA activée — le backend ne pose pas de cookies,
        // il renvoie un challenge à vérifier via /2fa/verify.
        if ((response as any).data?.requires_2fa) {
          setChallengeToken((response as any).data.challenge_token);
          setStage("2fa");
          setAttemptCount(0);
          return;
        }

        if (response.success && response.data?.user) {
          const loggedUser = response.data.user;

          // Le web n'est plus ouvert qu'aux comptes admin — client/pro passent par l'app mobile
          if (!(loggedUser as any).is_admin) {
            await logout();
            setAttemptCount((prev) => prev + 1);
            toast.error("L'espace client/pro n'est plus disponible sur le web. Utilise l'application mobile Blyss.");
            return;
          }

          setAttemptCount(0);
          setTimeout(() => navigate("/admin/dashboard", { replace: true }), 300);
        } else {
          setAttemptCount((prev) => prev + 1);
          if ((response as any).error === "account_disabled") {
            toast.error("Ton compte a été désactivé. Contacte le support.");
          } else {
            toast.error(ERROR_MESSAGES.LOGIN_FAILED);
          }
        }
      } catch (error) {
        console.error("Login error:", error);
        setAttemptCount((prev) => prev + 1);
        toast.error(ERROR_MESSAGES.NETWORK_ERROR);
      }
    },
    [email, password, attemptCount, login, logout, navigate, validateEmail, validatePassword]
  );

  const handleVerify2fa = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!challengeToken || otpCode.length < 6) return;

      setOtpSubmitting(true);
      try {
        const response = await fetch(`${API_URL}/api/auth/2fa/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ challenge_token: challengeToken, code: otpCode }),
        });
        const data = await response.json();

        if (response.ok && data.success) {
          await refreshProfile();
          navigate("/admin/dashboard", { replace: true });
        } else {
          setOtpCode("");
          toast.error(data.error === "invalid_code" ? "Code invalide" : "Session expirée, reconnecte-toi.");
          if (data.error === "invalid_challenge") {
            setStage("credentials");
            setChallengeToken(null);
          }
        }
      } catch {
        toast.error(ERROR_MESSAGES.NETWORK_ERROR);
      } finally {
        setOtpSubmitting(false);
      }
    },
    [challengeToken, otpCode, navigate, refreshProfile]
  );

  const handleNavigateToForgotPassword = useCallback(() => {
    if (!isLoading) navigate("/forgot-password");
  }, [isLoading, navigate]);

  return (
    <div className="mercury-wrapper" ref={ref}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;800&family=Space+Mono&display=swap');

        .mercury-wrapper {
          --bg: #050505;
          --mercury: #e0e0e0;
          --accent: #ffffff;
          --text-dim: rgba(255, 255, 255, 0.5);
          --filter-goo: url('#gooey');

          background-color: var(--bg);
          color: var(--accent);
          font-family: 'Inter', sans-serif;
          min-height: 100vh;
          width: 100%;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
        }

        .mercury-wrapper * {
          box-sizing: border-box;
          -webkit-font-smoothing: antialiased;
        }

        .mercury-wrapper .stage {
          position: absolute;
          width: 100%;
          height: 100%;
          z-index: 0;
          filter: var(--filter-goo);
          opacity: 0.6;
        }

        .mercury-wrapper .blob {
          position: absolute;
          background: linear-gradient(135deg, var(--mercury), #888);
          border-radius: 50%;
          filter: blur(20px);
          animation: mercuryFloat 20s infinite alternate ease-in-out;
          box-shadow: inset -10px -10px 20px rgba(0,0,0,0.5),
                      10px 10px 30px rgba(255,255,255,0.2);
          transition: margin 0.1s ease-out;
        }

        @keyframes mercuryFloat {
          0% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(10vw, 20vh) scale(1.2); }
          66% { transform: translate(-5vw, 10vh) scale(0.8); }
          100% { transform: translate(5vw, -10vh) scale(1.1); }
        }

        .mercury-wrapper .auth-container {
          position: relative;
          z-index: 10;
          width: 100%;
          max-width: 440px;
          padding: 40px;
        }

        .mercury-wrapper .header {
          margin-bottom: 48px;
          text-align: left;
        }

        .mercury-wrapper .brand-id {
          font-family: 'Space Mono', monospace;
          font-size: 10px;
          letter-spacing: 4px;
          text-transform: uppercase;
          color: var(--text-dim);
          margin-bottom: 8px;
          display: block;
        }

        .mercury-wrapper .header h1 {
          font-weight: 800;
          font-size: 3rem;
          line-height: 0.9;
          letter-spacing: -2px;
          margin-left: -4px;
          margin-top: 0;
        }

        .mercury-wrapper .form-group {
          position: relative;
          margin-bottom: 30px;
          transition: transform 0.4s cubic-bezier(0.2, 1, 0.3, 1);
        }

        .mercury-wrapper .form-group:focus-within {
          transform: translateX(10px);
        }

        .mercury-wrapper .form-group label {
          display: flex;
          align-items: center;
          gap: 6px;
          font-family: 'Space Mono', monospace;
          font-size: 11px;
          color: var(--text-dim);
          margin-bottom: 12px;
          text-transform: uppercase;
        }

        .mercury-wrapper .field-error {
          color: #ff6b6b;
          text-transform: none;
          font-family: 'Inter', sans-serif;
          font-size: 11px;
        }

        .mercury-wrapper .field-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .mercury-wrapper .forgot-link {
          background: none;
          border: none;
          padding: 0;
          font-family: 'Space Mono', monospace;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: var(--text-dim);
          cursor: pointer;
          transition: color 0.3s;
        }

        .mercury-wrapper .forgot-link:hover {
          color: var(--accent);
        }

        .mercury-wrapper .input-row {
          position: relative;
        }

        .mercury-wrapper .form-group input {
          width: 100%;
          background: transparent;
          border: none;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          color: var(--accent);
          padding: 12px 0;
          font-size: 18px;
          outline: none;
          transition: border-color 0.4s;
        }

        .mercury-wrapper .form-group input:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .mercury-wrapper .input-row input {
          padding-right: 32px;
        }

        .mercury-wrapper .input-glow {
          position: absolute;
          bottom: 0;
          left: 0;
          width: 0%;
          height: 2px;
          background: var(--mercury);
          transition: width 0.6s cubic-bezier(0.2, 1, 0.3, 1);
          box-shadow: 0 0 15px var(--mercury);
        }

        .mercury-wrapper .form-group input:focus + .input-glow {
          width: 100%;
        }

        .mercury-wrapper .pw-toggle {
          position: absolute;
          right: 0;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          color: var(--text-dim);
          cursor: pointer;
          display: flex;
          align-items: center;
          padding: 4px;
        }

        .mercury-wrapper .pw-toggle:hover {
          color: var(--accent);
        }

        .mercury-wrapper .submit-wrap {
          margin-top: 46px;
          position: relative;
          filter: var(--filter-goo);
        }

        .mercury-wrapper .btn-base {
          background: var(--accent);
          color: #000;
          border: none;
          padding: 20px 40px;
          font-size: 14px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 2px;
          cursor: pointer;
          width: 100%;
          position: relative;
          z-index: 2;
          transition: letter-spacing 0.3s, opacity 0.3s;
        }

        .mercury-wrapper .btn-base:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .mercury-wrapper .btn-base:not(:disabled):hover {
          letter-spacing: 4px;
        }

        .mercury-wrapper .mercury-drop {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 100%;
          height: 100%;
          background: var(--mercury);
          transform: translate(-50%, -50%);
          z-index: 1;
          border-radius: 50px;
          transition: all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }

        .mercury-wrapper .submit-wrap:hover .mercury-drop {
          transform: translate(-50%, -50%) scale(1.05, 1.2);
          filter: brightness(1.2);
        }

        .mercury-wrapper .footer-nav {
          margin-top: 36px;
          display: flex;
          justify-content: space-between;
          font-family: 'Space Mono', monospace;
          font-size: 10px;
        }

        .mercury-wrapper .footer-nav a,
        .mercury-wrapper .footer-nav button {
          background: none;
          border: none;
          padding: 0;
          color: var(--text-dim);
          text-decoration: none;
          cursor: pointer;
          font-family: 'Space Mono', monospace;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 1px;
          transition: color 0.3s;
        }

        .mercury-wrapper .footer-nav a:hover,
        .mercury-wrapper .footer-nav button:hover {
          color: var(--accent);
        }

        .svg-filter-hidden {
          position: absolute;
          width: 0;
          height: 0;
        }
      `}</style>

      <svg className="svg-filter-hidden">
        <defs>
          <filter id="gooey">
            <feGaussianBlur in="SourceGraphic" stdDeviation="12" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -9"
              result="goo"
            />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>
      </svg>

      <div className="stage">
        {blobsData.map((data, index) => (
          <div
            key={index}
            ref={(el) => (blobRefs.current[index] = el)}
            className="blob"
            style={{
              width: `${data.size}px`,
              height: `${data.size}px`,
              left: `${data.left}%`,
              top: `${data.top}%`,
              animationDelay: `${data.animationDelay}s`,
              animationDuration: `${data.animationDuration}s`,
            }}
          />
        ))}
      </div>

      <main className="auth-container">
        <header className="header">
          <span className="brand-id">Blyss · Console Admin</span>
          <h1>
            ADMIN
            <br />
            ACCESS
          </h1>
        </header>

        {stage === "2fa" ? (
          <form onSubmit={handleVerify2fa} className="flex flex-col items-start gap-6">
            <p className="text-sm" style={{ color: "var(--text-dim)" }}>
              Entre le code à 6 chiffres de ton application d'authentification.
            </p>
            <InputOTP maxLength={6} value={otpCode} onChange={setOtpCode} disabled={otpSubmitting} autoFocus>
              <InputOTPGroup>
                {Array.from({ length: 6 }).map((_, i) => (
                  <InputOTPSlot
                    key={i}
                    index={i}
                    className="border-white/15 bg-transparent text-white text-lg"
                  />
                ))}
              </InputOTPGroup>
            </InputOTP>
            <div className="submit-wrap w-full">
              <div className="mercury-drop" />
              <button type="submit" className="btn-base" disabled={otpSubmitting || otpCode.length < 6}>
                {otpSubmitting ? "Vérification..." : "Valider"}
              </button>
            </div>
            <button type="button" className="forgot-link" onClick={() => { setStage("credentials"); setOtpCode(""); }}>
              ← Retour
            </button>
          </form>
        ) : (
        <form onSubmit={handleLogin} noValidate autoComplete="off">
          <div className="form-group">
            <label htmlFor="login-email">
              Email
              {errors.email && <span className="field-error">· {errors.email}</span>}
            </label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={handleEmailChange}
              onBlur={handleEmailBlur}
              placeholder="admin@blyssapp.fr"
              disabled={isLoading}
              autoComplete="email"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck="false"
              aria-required="true"
              aria-invalid={!!errors.email}
              maxLength={254}
              required
            />
            <div className="input-glow" />
          </div>

          <div className="form-group">
            <div className="field-row">
              <label htmlFor="login-password">
                Mot de passe
                {errors.password && <span className="field-error">· {errors.password}</span>}
              </label>
              <button
                type="button"
                onClick={handleNavigateToForgotPassword}
                className="forgot-link"
                disabled={isLoading}
                aria-label="Mot de passe oublié"
              >
                Oublié ?
              </button>
            </div>
            <div className="input-row">
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={handlePasswordChange}
                onBlur={handlePasswordBlur}
                placeholder="••••••••"
                disabled={isLoading}
                autoComplete="current-password"
                aria-required="true"
                aria-invalid={!!errors.password}
                maxLength={VALIDATION_RULES.PASSWORD_MAX_LENGTH}
                required
              />
              <div className="input-glow" />
              <button
                type="button"
                onClick={togglePasswordVisibility}
                className="pw-toggle"
                disabled={isLoading}
                aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="submit-wrap">
            <div className="mercury-drop" />
            <button type="submit" className="btn-base" disabled={isLoading || attemptCount >= 5} aria-busy={isLoading}>
              {isLoading ? "Connexion..." : "Se connecter"}
            </button>
          </div>
        </form>
        )}

        <footer className="footer-nav">
          <button type="button" onClick={handleNavigateToForgotPassword}>
            Mot de passe oublié
          </button>
          <a href="https://blyssapp.fr/mentions-legales" target="_blank" rel="noopener noreferrer">Mentions légales</a>
        </footer>
      </main>
    </div>
  );
});

Login.displayName = "Login";

export default Login;
