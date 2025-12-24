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

    if (response.success && response.data) {
      toast.success("Connexion réussie !");
      // Redirect based on user role
      if (response.data.user.role === 'pro') {
        navigate("/pro/dashboard");
      } else {
        navigate("/client");
      }
    } else {
      setError(response.error || "Email ou mot de passe incorrect");
    }
  };

  return (
    <MobileLayout showNav={false}>
      <div className="py-6 animate-fade-in">
        <div className="w-full max-w-md bg-card rounded-2xl shadow-lg p-8 animate-fade-in-up">
          <div className="flex flex-col items-center mb-8 animate-fade-in">
            <img
              src={logo}
              alt="Blyss"
              className="w-24 h-24 object-contain mb-4"
            />
            <h1 className="font-display text-3xl font-semibold text-foreground">
              Bon retour 💖
            </h1>
          </div>

          <form onSubmit={handleLogin} className="space-y-6 animate-fade-in-up">
            {error && (
              <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20">
                <p className="text-destructive text-sm text-center">{error}</p>
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-muted-foreground mb-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError("");
                }}
                className="w-full px-4 py-3 rounded-xl bg-muted border border-transparent text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition"
                placeholder="ton@email.com"
                required
                disabled={isLoading}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-muted-foreground mb-2">
                Mot de passe
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError("");
                  }}
                  className="w-full px-4 py-3 rounded-xl bg-muted border border-transparent text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition pr-12"
                  placeholder="••••••••"
                  required
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition"
                  aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-primary to-primary-dark text-primary-foreground font-semibold text-lg shadow-lg hover:shadow-xl transition-shadow duration-300 touch-button disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? "Connexion..." : "Se connecter"}
            </button>
          </form>

          <p className="text-center mt-6 text-muted-foreground text-sm">
            Pas encore de compte ?{" "}
            <button
              onClick={() => navigate("/signup")}
              className="text-primary font-semibold hover:underline"
              disabled={isLoading}
            >
              S'inscrire
            </button>
          </p>
        </div>
      </div>
    </MobileLayout>
  );
};

export default Login;
