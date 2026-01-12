import { useState, forwardRef } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Mail, Lock } from "lucide-react";
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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim() || !password) {
      toast.error("Remplis tous les champs");
      return;
    }

    const response = await login({ email: email.trim(), password });

    if (response.success && response.data?.user) {
      toast.success("Connexion réussie ! 🎉");
      setTimeout(() => {
        navigate(response.data.user.role === "pro" ? "/pro/dashboard" : "/client");
      }, 300);
    } else {
      toast.error("Email ou mot de passe incorrect");
    }
  };

  return (
    <MobileLayout showNav={false}>
      <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-background">
        {/* Logo & titre */}
        <div className="text-center mb-10 space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="inline-block mb-2">
            <img
              src={logo}
              alt="Blyss"
              className="w-32 h-32 object-contain"
            />
          </div>
          <h1 className="font-display text-3xl font-bold text-foreground">
            Bon retour ✨
          </h1>
          <p className="text-muted-foreground text-sm">
            Connecte-toi pour gérer tes nails en quelques taps
          </p>
        </div>

        {/* Formulaire */}
        <div className="w-full max-w-md space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-150">
          <form onSubmit={handleLogin} className="space-y-5">
            {/* Email */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground pl-1">
                Email
              </label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                  <Mail size={20} />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setFocusedField("email")}
                  onBlur={() => setFocusedField(null)}
                  placeholder="ton@email.com"
                  disabled={isLoading}
                  autoComplete="email"
                  className={`
                    w-full h-14 pl-12 pr-4 rounded-2xl
                    bg-card border-2 
                    text-foreground placeholder:text-muted-foreground/50
                    transition-all duration-300 ease-out
                    focus:outline-none focus:scale-[1.02]
                    disabled:opacity-50 disabled:cursor-not-allowed
                    ${
                      focusedField === "email"
                        ? "border-primary shadow-lg shadow-primary/10"
                        : "border-muted hover:border-muted-foreground/30"
                    }
                  `}
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-2">
              <div className="flex items-center justify-between pl-1">
                <label className="text-sm font-medium text-foreground">
                  Mot de passe
                </label>
                <button
                  type="button"
                  onClick={() => navigate("/forgot-password")}
                  className="text-xs text-primary hover:underline transition-all active:scale-95"
                  disabled={isLoading}
                >
                  Mot de passe oublié ?
                </button>
              </div>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                  <Lock size={20} />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setFocusedField("password")}
                  onBlur={() => setFocusedField(null)}
                  placeholder="••••••••"
                  disabled={isLoading}
                  autoComplete="current-password"
                  className={`
                    w-full h-14 pl-12 pr-12 rounded-2xl
                    bg-card border-2 
                    text-foreground placeholder:text-muted-foreground/50
                    transition-all duration-300 ease-out
                    focus:outline-none focus:scale-[1.02]
                    disabled:opacity-50 disabled:cursor-not-allowed
                    ${
                      focusedField === "password"
                        ? "border-primary shadow-lg shadow-primary/10"
                        : "border-muted hover:border-muted-foreground/30"
                    }
                  `}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-all p-1 rounded-lg hover:bg-muted/50 active:scale-90"
                  disabled={isLoading}
                  aria-label={showPassword ? "Masquer" : "Afficher"}
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {/* Bouton connexion */}
            <button
              type="submit"
              disabled={isLoading}
              className="
                w-full h-14 rounded-2xl mt-8
                bg-primary hover:bg-primary/90
                text-primary-foreground
                font-semibold text-base
                shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40
                transition-all duration-300 ease-out
                disabled:opacity-50 disabled:cursor-not-allowed
                active:scale-[0.98]
              "
            >
              <span className="flex items-center justify-center gap-2">
                {isLoading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                    Connexion...
                  </>
                ) : (
                  "Se connecter"
                )}
              </span>
            </button>
          </form>

          {/* Séparateur */}
          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-muted" />
            </div>
            <div className="relative flex justify-center">
              <span className="px-4 bg-background text-xs text-muted-foreground">
                Pas encore de compte ?
              </span>
            </div>
          </div>

          {/* Bouton inscription */}
          <button
            type="button"
            onClick={() => navigate("/signup")}
            disabled={isLoading}
            className="
              w-full h-14 rounded-2xl
              bg-card border-2 border-foreground/20
              text-foreground font-semibold
              hover:bg-foreground/5 hover:border-foreground/40
              transition-all duration-300
              active:scale-[0.98]
              disabled:opacity-50
              shadow-sm
            "
          >
            Créer un compte
          </button>

          {/* Mentions légales */}
          <p className="text-center text-[10px] text-muted-foreground/70 leading-relaxed mt-6">
            En te connectant, tu acceptes les{" "}
            <button className="underline hover:text-foreground transition-colors">
              Conditions générales
            </button>{" "}
            et la{" "}
            <button className="underline hover:text-foreground transition-colors">
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
