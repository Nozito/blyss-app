import { useState, forwardRef } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Mail, Lock, Sparkles } from "lucide-react";
import logo from "@/assets/logo.png";
import MobileLayout from "@/components/MobileLayout";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const Login = forwardRef<HTMLDivElement>((_, ref) => {
  const navigate = useNavigate();
  const { login, isLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleEmailBlur = () => {
    setFocusedField(null);
    if (email && !validateEmail(email)) {
      setErrors(prev => ({ ...prev, email: "Format d'email invalide" }));
    } else {
      setErrors(prev => ({ ...prev, email: undefined }));
    }
  };

  const handlePasswordBlur = () => {
    setFocusedField(null);
    if (password && password.length < 6) {
      setErrors(prev => ({ ...prev, password: "Minimum 6 caractères" }));
    } else {
      setErrors(prev => ({ ...prev, password: undefined }));
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation [web:54]
    if (!email.trim()) {
      toast.error("Entre ton email");
      setErrors(prev => ({ ...prev, email: "Email requis" }));
      return;
    }

    if (!validateEmail(email)) {
      toast.error("Format d'email invalide");
      setErrors(prev => ({ ...prev, email: "Format d'email invalide" }));
      return;
    }

    if (!password) {
      toast.error("Entre ton mot de passe");
      setErrors(prev => ({ ...prev, password: "Mot de passe requis" }));
      return;
    }

    setErrors({});
    const response = await login({ email: email.trim(), password });

    if (response.success && response.data?.user) {
      setTimeout(() => {
        navigate(response.data.user.role === "pro" ? "/pro/dashboard" : "/client");
      }, 300);
    } else {
      toast.error("Email ou mot de passe incorrect");
    }
  };

  return (
    <MobileLayout showNav={false}>
      <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-gradient-to-b from-background to-muted/20">
        {/* Logo & titre [web:55] */}
        <div className="text-center mb-10 space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="inline-block mb-2 relative">
            <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full animate-pulse" />
            <img
              src={logo}
              alt="Blyss"
              className="w-32 h-32 object-contain relative z-10"
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

        {/* Formulaire [web:51][web:53] */}
        <div className="w-full max-w-md space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-150">
          <form onSubmit={handleLogin} className="space-y-5">
            {/* Email [web:54] */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground pl-1 flex items-center gap-1.5">
                Email
                {errors.email && (
                  <span className="text-xs text-destructive font-normal">
                    · {errors.email}
                  </span>
                )}
              </label>
              <div className="relative group">
                {/* ✅ Icône avec z-index pour rester visible [web:56] */}
                <div className={`absolute left-4 top-1/2 -translate-y-1/2 z-10 transition-colors duration-200 ${
                  focusedField === "email" ? "text-primary" : "text-muted-foreground"
                }`}>
                  <Mail size={20} />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errors.email) setErrors(prev => ({ ...prev, email: undefined }));
                  }}
                  onFocus={() => setFocusedField("email")}
                  onBlur={handleEmailBlur}
                  placeholder="ton@email.com"
                  disabled={isLoading}
                  autoComplete="email"
                  className={`
                    w-full h-14 pl-12 pr-4 rounded-2xl
                    bg-card/50 backdrop-blur-sm border-2 
                    text-foreground placeholder:text-muted-foreground/50
                    transition-all duration-300 ease-out
                    focus:outline-none focus:scale-[1.02]
                    disabled:opacity-50 disabled:cursor-not-allowed
                    ${
                      errors.email
                        ? "border-destructive/50 bg-destructive/5"
                        : focusedField === "email"
                        ? "border-primary shadow-lg shadow-primary/10 bg-card"
                        : "border-border hover:border-muted-foreground/30"
                    }
                  `}
                />
              </div>
            </div>

            {/* Password [web:54] */}
            <div className="space-y-2">
              <div className="flex items-center justify-between pl-1">
                <label className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  Mot de passe
                  {errors.password && (
                    <span className="text-xs text-destructive font-normal">
                      · {errors.password}
                    </span>
                  )}
                </label>
                <button
                  type="button"
                  onClick={() => navigate("/forgot-password")}
                  className="text-xs text-primary hover:underline transition-all active:scale-95 font-medium"
                  disabled={isLoading}
                >
                  Oublié ?
                </button>
              </div>
              <div className="relative group">
                {/* ✅ Icône lock avec z-index [web:56] */}
                <div className={`absolute left-4 top-1/2 -translate-y-1/2 z-10 transition-colors duration-200 ${
                  focusedField === "password" ? "text-primary" : "text-muted-foreground"
                }`}>
                  <Lock size={20} />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errors.password) setErrors(prev => ({ ...prev, password: undefined }));
                  }}
                  onFocus={() => setFocusedField("password")}
                  onBlur={handlePasswordBlur}
                  placeholder="••••••••"
                  disabled={isLoading}
                  autoComplete="current-password"
                  className={`
                    w-full h-14 pl-12 pr-12 rounded-2xl
                    bg-card/50 backdrop-blur-sm border-2 
                    text-foreground placeholder:text-muted-foreground/50
                    transition-all duration-300 ease-out
                    focus:outline-none focus:scale-[1.02]
                    disabled:opacity-50 disabled:cursor-not-allowed
                    ${
                      errors.password
                        ? "border-destructive/50 bg-destructive/5"
                        : focusedField === "password"
                        ? "border-primary shadow-lg shadow-primary/10 bg-card"
                        : "border-border hover:border-muted-foreground/30"
                    }
                  `}
                />
                {/* ✅ Bouton eye avec z-index [web:59] */}
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 z-10 text-muted-foreground hover:text-primary transition-all p-1.5 rounded-lg hover:bg-primary/10 active:scale-90"
                  disabled={isLoading}
                  aria-label={showPassword ? "Masquer" : "Afficher"}
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {/* Bouton connexion [web:51][web:55] */}
            <button
              type="submit"
              disabled={isLoading}
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
                    <div className="w-5 h-5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                    Connexion...
                  </>
                ) : (
                  <>
                    <Lock size={18} />
                    Se connecter
                  </>
                )}
              </span>
            </button>
          </form>

          {/* Séparateur [web:55] */}
          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center">
              <span className="px-4 bg-background text-xs font-medium text-muted-foreground">
                Pas encore de compte ?
              </span>
            </div>
          </div>

          {/* Bouton inscription [web:51] */}
          <button
            type="button"
            onClick={() => navigate("/signup")}
            disabled={isLoading}
            className="
              w-full h-14 rounded-2xl
              bg-card/50 backdrop-blur-sm border-2 border-border
              text-foreground font-semibold
              hover:bg-card hover:border-primary/30 hover:shadow-lg
              transition-all duration-300
              active:scale-[0.98]
              disabled:opacity-50
              group
            "
          >
            <span className="flex items-center justify-center gap-2">
              <Sparkles size={18} className="group-hover:text-primary transition-colors" />
              Créer un compte
            </span>
          </button>

          {/* Mentions légales [web:51] */}
          <p className="text-center text-[10px] text-muted-foreground/70 leading-relaxed mt-6 px-4">
            En te connectant, tu acceptes les{" "}
            <button 
              type="button"
              className="underline hover:text-foreground transition-colors font-medium"
              onClick={() => window.open("/terms", "_blank")}
            >
              Conditions générales
            </button>{" "}
            et la{" "}
            <button 
              type="button"
              className="underline hover:text-foreground transition-colors font-medium"
              onClick={() => window.open("/privacy", "_blank")}
            >
              Politique de confidentialité
            </button>
          </p>
        </div>
      </div>
    </MobileLayout>
  );
});

Login.displayName = "Login";

export default Login;
