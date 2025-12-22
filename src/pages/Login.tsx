import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import logo from "@/assets/logo.png";

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Implement actual login with Supabase
    navigate("/pro/dashboard");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col px-6 pt-safe-top">
      <div className="flex-1 flex flex-col justify-center">
        <div className="animate-fade-in flex flex-col items-center mb-10">
          <img 
            src={logo} 
            alt="Blyss" 
            className="w-20 h-20 object-contain mb-4"
          />
          <h1 className="font-display text-3xl font-semibold text-foreground">
            Bon retour 💖
          </h1>
        </div>

        <form onSubmit={handleLogin} className="space-y-5 animate-slide-up">
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 block">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-4 rounded-xl bg-muted border-0 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="ton@email.com"
              required
            />
          </div>

          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 block">
              Mot de passe
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-4 rounded-xl bg-muted border-0 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 pr-12"
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground touch-button"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-4 rounded-2xl gradient-primary text-primary-foreground font-medium text-lg shadow-soft touch-button mt-8"
          >
            Se connecter
          </button>
        </form>

        <p className="text-center mt-6 text-muted-foreground">
          Pas encore de compte ?{" "}
          <button
            onClick={() => navigate("/signup")}
            className="text-primary font-medium"
          >
            S'inscrire
          </button>
        </p>
      </div>
    </div>
  );
};

export default Login;
