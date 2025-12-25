import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import logo from "@/assets/logo.png";
import MobileLayout from "@/components/MobileLayout";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const Login = () => {
  const navigate = useNavigate();
  const { login, isLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const validateForm = (): boolean => {
    if (!email.trim()) {
      setError("L'email est requis");
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Email invalide");
      return false;
    }
    if (!password) {
      setError("Le mot de passe est requis");
      return false;
    }
    return true;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!validateForm()) return;

    const response = await login({ email: email.trim(), password });

    if (response.success && response.data && response.data.user) {
      // Redirection selon rôle
      if (response.data.user.role === "pro") {
        navigate("/pro/dashboard");
      } else {
        navigate("/client");
      }
    } else {
      // Si l'utilisateur n'existe pas ou le mot de passe est incorrect
      if (response.error === "user_not_found") {
        setError("Compte inexistant");
      } else if (response.error === "invalid_password") {
        setError("Email ou mot de passe incorrect");
      } else {
        setError("Email ou mot de passe incorrect");
      }
    }
  };

  return (
    <MobileLayout showNav={false}>
      <div className="py-8 px-4 animate-fade-in flex flex-col items-center">
        {/* Logo + accroche */}
        <div className="flex flex-col items-center mb-6">
          <img
            src={logo}
            alt="Blyss"
            className="w-16 h-16 object-contain mb-3 rounded-xl"
          />
          <h1 className="font-display text-2xl font-semibold text-foreground">
            Bon retour ✨
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Connecte-toi pour gérer tes nails en quelques taps.
          </p>
        </div>

        {/* Carte formulaire plus légère */}
        <div className="w-full max-w-md bg-card rounded-2xl shadow-card px-5 py-6">
          <form onSubmit={handleLogin} className="space-y-5">
            {error && (
              <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20">
                <p className="text-destructive text-xs text-center">
                  {error}
                </p>
              </div>
            )}

            <div className="space-y-2">
              <label
                htmlFor="email"
                className="block text-xs font-medium text-muted-foreground"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                inputMode="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError("");
                }}
                className="w-full px-4 h-11 rounded-xl bg-muted border border-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition"
                placeholder="ton@email.com"
                required
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="block text-xs font-medium text-muted-foreground"
                >
                  Mot de passe
                </label>
                <button
                  type="button"
                  onClick={() => navigate("/forgot-password")}
                  className="text-[11px] text-primary active:opacity-80"
                  disabled={isLoading}
                >
                  Mot de passe oublié ?
                </button>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError("");
                  }}
                  className="w-full px-4 h-11 rounded-xl bg-muted border border-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition pr-11"
                  placeholder="••••••••"
                  required
                  disabled={isLoading}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition"
                  aria-label={
                    showPassword
                      ? "Masquer le mot de passe"
                      : "Afficher le mot de passe"
                  }
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 rounded-xl bg-gradient-to-r from-primary to-primary-dark text-primary-foreground font-semibold text-sm shadow-lg hover:shadow-xl transition-shadow duration-200 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
            >
              {isLoading ? "Connexion..." : "Se connecter"}
            </button>
          </form>

          <p className="text-center mt-5 text-xs text-muted-foreground">
            Pas encore de compte ?{" "}
            <button
              onClick={() => navigate("/signup")}
              className="text-primary font-semibold hover:underline"
              disabled={isLoading}
            >
              S'inscrire
            </button>
          </p>

          <p className="text-[10px] text-muted-foreground text-center mt-4">
            En te connectant, tu acceptes les Conditions générales et la
            Politique de confidentialité Blyss.
          </p>
        </div>
      </div>
    </MobileLayout>
  );
};

export default Login;
