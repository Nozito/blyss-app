import { useState, useCallback, forwardRef, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Mail, Lock, Sparkles } from "lucide-react";
import logo from "@/assets/logo.png";
import MobileLayout from "@/components/MobileLayout";
import { useAuth } from "@/contexts/AuthContext";
import RoleSelectionModal from "@/components/RoleSelectionModal";
import { toast } from "sonner";

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

const Login = forwardRef<HTMLDivElement>((_, ref) => {
  const navigate = useNavigate();
  const { login, isLoading } = useAuth();

  // ✅ État du formulaire
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [attemptCount, setAttemptCount] = useState(0);

  // ✅ États pour la modal de sélection de rôle
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [loggedUserName, setLoggedUserName] = useState("");
  const [loggedUserRole, setLoggedUserRole] = useState<"pro" | "client">("client");

  // ✅ Validation sécurisée de l'email [web:82]
  const validateEmail = useCallback((value: string): string | undefined => {
    const trimmedEmail = value.trim();

    if (!trimmedEmail) {
      return ERROR_MESSAGES.EMAIL_REQUIRED;
    }

    if (!VALIDATION_RULES.EMAIL_REGEX.test(trimmedEmail)) {
      return ERROR_MESSAGES.EMAIL_INVALID;
    }

    // Protection contre les emails trop longs (DoS)
    if (trimmedEmail.length > 254) { // RFC 5321
      return ERROR_MESSAGES.EMAIL_INVALID;
    }

    return undefined;
  }, []);

  // ✅ Validation sécurisée du mot de passe [web:82]
  const validatePassword = useCallback((value: string): string | undefined => {
    if (!value) {
      return ERROR_MESSAGES.PASSWORD_REQUIRED;
    }

    if (value.length < VALIDATION_RULES.PASSWORD_MIN_LENGTH) {
      return ERROR_MESSAGES.PASSWORD_TOO_SHORT;
    }

    if (value.length > VALIDATION_RULES.PASSWORD_MAX_LENGTH) {
      return ERROR_MESSAGES.PASSWORD_TOO_LONG;
    }

    return undefined;
  }, []);

  // ✅ Gestion du blur email avec validation [web:85]
  const handleEmailBlur = useCallback(() => {
    setFocusedField(null);
    const error = validateEmail(email);
    setErrors(prev => ({ ...prev, email: error }));
  }, [email, validateEmail]);

  // ✅ Gestion du blur password avec validation [web:85]
  const handlePasswordBlur = useCallback(() => {
    setFocusedField(null);
    const error = validatePassword(password);
    setErrors(prev => ({ ...prev, password: error }));
  }, [password, validatePassword]);

  // ✅ Gestion du changement d'email avec nettoyage [web:82]
  const handleEmailChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setEmail(value);

    // Clear error when user starts typing
    if (errors.email) {
      setErrors(prev => ({ ...prev, email: undefined }));
    }
  }, [errors.email]);

  // ✅ Gestion du changement de password avec nettoyage [web:82]
  const handlePasswordChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPassword(value);

    // Clear error when user starts typing
    if (errors.password) {
      setErrors(prev => ({ ...prev, password: undefined }));
    }
  }, [errors.password]);

  // ✅ Toggle password visibility [web:86]
  const togglePasswordVisibility = useCallback(() => {
    setShowPassword(prev => !prev);
  }, []);

  // ✅ Gestion de la sélection du rôle dans la modal
  const handleRoleSelection = useCallback((selectedRole: 'pro' | 'admin') => {
    setShowRoleModal(false);

    // Navigation selon le rôle sélectionné
    const targetRoute = selectedRole === 'admin' 
      ? '/admin/dashboard' 
      : '/pro/dashboard';

    navigate(targetRoute, { replace: true });
  }, [navigate]);

  // ✅ Fermeture de la modal (redirection par défaut vers Pro)
  const handleCloseModal = useCallback(() => {
    setShowRoleModal(false);

    const targetRoute = loggedUserRole === "pro" 
      ? "/pro/dashboard" 
      : "/client";

    navigate(targetRoute, { replace: true });
  }, [loggedUserRole, navigate]);

  // ✅ Soumission du formulaire avec validation complète [web:80][web:82]
  const handleLogin = useCallback(async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Protection contre les attaques par force brute (rate limiting côté client)
    if (attemptCount >= 5) {
      toast.error("Trop de tentatives. Attends 1 minute.");
      return;
    }

    // Validation complète
    const emailError = validateEmail(email);
    const passwordError = validatePassword(password);

    if (emailError || passwordError) {
      setErrors({
        email: emailError,
        password: passwordError,
      });

      if (emailError) toast.error(emailError);
      else if (passwordError) toast.error(passwordError);

      return;
    }

    // Reset errors
    setErrors({});

    try {
      // ✅ Sanitize input avant envoi [web:82]
      const sanitizedEmail = email.trim().toLowerCase();

      const response = await login({
        email: sanitizedEmail,
        password: password
      });

      if (response.success && response.data?.user) {
        // Reset attempt count on success
        setAttemptCount(0);

        const user = response.data.user;

        // ✅ Si Pro avec admin, afficher la modal de sélection
        if (user.role === "pro" && user.is_admin) {
          setLoggedUserName(user.first_name);
          setLoggedUserRole("pro");
          setShowRoleModal(true);
        } else {
          // ✅ Navigation normale selon le rôle
          setTimeout(() => {
            const targetRoute = user.role === "pro"
              ? "/pro/dashboard"
              : "/client";
            navigate(targetRoute, { replace: true });
          }, 300);
        }
      } else {
        // Increment attempt count
        setAttemptCount(prev => prev + 1);
        toast.error(ERROR_MESSAGES.LOGIN_FAILED);
      }
    } catch (error) {
      console.error("Login error:", error);
      setAttemptCount(prev => prev + 1);
      toast.error(ERROR_MESSAGES.NETWORK_ERROR);
    }
  }, [email, password, attemptCount, login, navigate, validateEmail, validatePassword]);

  // ✅ Navigation sécurisée vers signup
  const handleNavigateToSignup = useCallback(() => {
    if (!isLoading) {
      navigate("/signup");
    }
  }, [isLoading, navigate]);

  // ✅ Navigation sécurisée vers forgot password
  const handleNavigateToForgotPassword = useCallback(() => {
    if (!isLoading) {
      navigate("/forgot-password");
    }
  }, [isLoading, navigate]);

  return (
    <>
      <MobileLayout showNav={false}>
        <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-gradient-to-b from-background to-muted/20">
          {/* Logo & titre */}
          <div className="text-center mb-10 space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="inline-block mb-2 relative">
              <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full animate-pulse" />
              <img
                src={logo}
                alt="Blyss - Application de gestion de rendez-vous beauté"
                className="w-32 h-32 object-contain relative z-10"
                loading="eager"
              />
            </div>
            <div className="space-y-2">
              <h1 className="font-display text-3xl font-bold text-primary text-foreground flex items-center justify-center gap-2">
                Bon retour
              </h1>
              <p className="text-muted-foreground text-sm">
                Connecte-toi pour gérer tes nails en quelques taps
              </p>
            </div>
          </div>

          {/* Formulaire */}
          <div className="w-full max-w-md space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-150">
            {/* ✅ Ajout de noValidate pour gérer la validation manuellement [web:85] */}
            <form onSubmit={handleLogin} className="space-y-5" noValidate>
              {/* Email */}
              <div className="space-y-2">
                <label
                  htmlFor="login-email"
                  className="text-sm font-semibold text-foreground pl-1 flex items-center gap-1.5"
                >
                  Email
                  {errors.email && (
                    <span
                      className="text-xs text-destructive font-normal"
                      role="alert"
                      aria-live="polite"
                    >
                      · {errors.email}
                    </span>
                  )}
                </label>
                <div className="relative group">
                  <div className={`absolute left-4 top-1/2 -translate-y-1/2 z-10 transition-colors duration-200 pointer-events-none ${focusedField === "email" ? "text-primary" : "text-muted-foreground"
                    }`}>
                    <Mail size={20} aria-hidden="true" />
                  </div>
                  <input
                    id="login-email"
                    type="email"
                    value={email}
                    onChange={handleEmailChange}
                    onFocus={() => setFocusedField("email")}
                    onBlur={handleEmailBlur}
                    placeholder="ton@email.com"
                    disabled={isLoading}
                    autoComplete="email"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck="false"
                    aria-required="true"
                    aria-invalid={!!errors.email}
                    aria-describedby={errors.email ? "email-error" : undefined}
                    maxLength={254}
                    className={`
                      w-full h-14 pl-12 pr-4 rounded-2xl
                      bg-card/50 backdrop-blur-sm border-2 
                      text-foreground placeholder:text-muted-foreground/50
                      transition-all duration-300 ease-out
                      focus:outline-none focus:scale-[1.02]
                      disabled:opacity-50 disabled:cursor-not-allowed
                      ${errors.email
                        ? "border-destructive/50 bg-destructive/5"
                        : focusedField === "email"
                          ? "border-primary shadow-lg shadow-primary/10 bg-card"
                          : "border-border hover:border-muted-foreground/30"
                      }
                    `}
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-2">
                <div className="flex items-center justify-between pl-1">
                  <label
                    htmlFor="login-password"
                    className="text-sm font-semibold text-foreground flex items-center gap-1.5"
                  >
                    Mot de passe
                    {errors.password && (
                      <span
                        className="text-xs text-destructive font-normal"
                        role="alert"
                        aria-live="polite"
                      >
                        · {errors.password}
                      </span>
                    )}
                  </label>
                  <button
                    type="button"
                    onClick={handleNavigateToForgotPassword}
                    className="text-xs text-primary hover:underline transition-all active:scale-95 font-medium"
                    disabled={isLoading}
                    aria-label="Mot de passe oublié"
                  >
                    Oublié ?
                  </button>
                </div>
                <div className="relative group">
                  <div className={`absolute left-4 top-1/2 -translate-y-1/2 z-10 transition-colors duration-200 pointer-events-none ${focusedField === "password" ? "text-primary" : "text-muted-foreground"
                    }`}>
                    <Lock size={20} aria-hidden="true" />
                  </div>
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={handlePasswordChange}
                    onFocus={() => setFocusedField("password")}
                    onBlur={handlePasswordBlur}
                    placeholder="••••••••"
                    disabled={isLoading}
                    autoComplete="current-password"
                    aria-required="true"
                    aria-invalid={!!errors.password}
                    aria-describedby={errors.password ? "password-error" : "password-toggle"}
                    maxLength={VALIDATION_RULES.PASSWORD_MAX_LENGTH}
                    className={`
                      w-full h-14 pl-12 pr-12 rounded-2xl
                      bg-card/50 backdrop-blur-sm border-2 
                      text-foreground placeholder:text-muted-foreground/50
                      transition-all duration-300 ease-out
                      focus:outline-none focus:scale-[1.02]
                      disabled:opacity-50 disabled:cursor-not-allowed
                      ${errors.password
                        ? "border-destructive/50 bg-destructive/5"
                        : focusedField === "password"
                          ? "border-primary shadow-lg shadow-primary/10 bg-card"
                          : "border-border hover:border-muted-foreground/30"
                      }
                    `}
                  />
                  {/* ✅ Bouton toggle accessible [web:86] */}
                  <button
                    id="password-toggle"
                    type="button"
                    onClick={togglePasswordVisibility}
                    className="absolute right-4 top-1/2 -translate-y-1/2 z-10 text-muted-foreground hover:text-primary transition-all p-1.5 rounded-lg hover:bg-primary/10 active:scale-90"
                    disabled={isLoading}
                    aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                    aria-pressed={showPassword}
                    tabIndex={0}
                  >
                    {showPassword ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
                  </button>
                </div>
              </div>

              {/* Bouton connexion */}
              <button
                type="submit"
                disabled={isLoading || attemptCount >= 5}
                aria-busy={isLoading}
                className="
                  w-full h-14 rounded-2xl mt-8
                  bg-gradient-to-r from-primary to-primary/90
                  hover:from-primary/90 hover:to-primary
                  text-primary-foreground
                  font-bold text-base
                  shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40
                  transition-all duration-300 ease-out
                  disabled:opacity-50 disabled:cursor-not-allowed
                  active:scale-[0.98]
                  relative overflow-hidden
                  group
                "
              >
                <span className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                <span className="relative flex items-center justify-center gap-2">
                  {isLoading ? (
                    <>
                      <div
                        className="w-5 h-5 border-2 border-current/30 border-t-current rounded-full animate-spin"
                        role="status"
                        aria-label="Connexion en cours"
                      />
                      Connexion...
                    </>
                  ) : (
                    <>
                      <Lock size={18} aria-hidden="true" />
                      Se connecter
                    </>
                  )}
                </span>
              </button>
            </form>

            {/* Séparateur */}
            <div className="relative my-8" role="separator" aria-label="Ou">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center">
                <span className="px-4 bg-background text-xs font-medium text-muted-foreground">
                  Pas encore de compte ?
                </span>
              </div>
            </div>

            {/* Bouton inscription */}
            <button
              type="button"
              onClick={handleNavigateToSignup}
              disabled={isLoading}
              aria-label="Créer un nouveau compte"
              className="
                w-full h-14 rounded-2xl
                bg-card/50 backdrop-blur-sm border-2 border-border
                text-foreground font-semibold
                hover:bg-card hover:border-primary/30 hover:shadow-lg
                transition-all duration-300
                active:scale-[0.98]
                disabled:opacity-50 disabled:cursor-not-allowed
                group
              "
            >
              <span className="flex items-center justify-center gap-2">
                <Sparkles size={18} className="group-hover:text-primary transition-colors" aria-hidden="true" />
                Créer un compte
              </span>
            </button>

            {/* Mentions légales */}
            <p className="text-center text-[10px] text-muted-foreground/70 leading-relaxed mt-6 px-4">
              En te connectant, tu acceptes les{" "}
              <button
                type="button"
                className="underline hover:text-foreground transition-colors font-medium focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded"
                onClick={() => window.open("/terms", "_blank", "noopener,noreferrer")}
                aria-label="Lire les conditions générales (ouvre dans un nouvel onglet)"
              >
                Conditions générales
              </button>{" "}
              et la{" "}
              <button
                type="button"
                className="underline hover:text-foreground transition-colors font-medium focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded"
                onClick={() => window.open("/privacy", "_blank", "noopener,noreferrer")}
                aria-label="Lire la politique de confidentialité (ouvre dans un nouvel onglet)"
              >
                Politique de confidentialité
              </button>
            </p>
          </div>
        </div>
      </MobileLayout>

      {/* ✅ Modal de sélection de rôle */}
      <RoleSelectionModal
        isOpen={showRoleModal}
        userName={loggedUserName}
        onSelectRole={handleRoleSelection}
        onClose={handleCloseModal}
      />
    </>
  );
});

Login.displayName = "Login";

export default Login;
