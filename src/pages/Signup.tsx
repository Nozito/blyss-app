import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";

const Signup = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    age: "",
    password: "",
    confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const totalSteps = 4;

  const handleNext = () => {
    setError("");
    
    if (step === 3) {
      const age = parseInt(formData.age);
      if (age < 16) {
        setError("Tu dois avoir au moins 16 ans pour utiliser Blyss");
        return;
      }
    }
    
    if (step === 4) {
      if (formData.password !== formData.confirmPassword) {
        setError("Les mots de passe ne correspondent pas");
        return;
      }
      if (formData.password.length < 8) {
        setError("Le mot de passe doit contenir au moins 8 caractères");
        return;
      }
      // TODO: Implement actual signup with Supabase
      navigate("/pro/dashboard");
      return;
    }
    
    setStep(step + 1);
  };

  const handleBack = () => {
    if (step === 1) {
      navigate("/");
    } else {
      setStep(step - 1);
    }
  };

  const isStepValid = () => {
    switch (step) {
      case 1:
        return formData.firstName.trim() && formData.lastName.trim();
      case 2:
        return formData.phone.trim().length >= 10;
      case 3:
        return formData.age && parseInt(formData.age) > 0;
      case 4:
        return formData.password && formData.confirmPassword;
      default:
        return false;
    }
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <div className="animate-slide-up">
            <h1 className="font-display text-2xl font-semibold text-foreground mb-2">
              Enchanté, moi c'est Blyss 💖
            </h1>
            <p className="text-muted-foreground mb-8">Et toi ?</p>
            
            <div className="space-y-4">
              <input
                type="text"
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                className="w-full px-4 py-4 rounded-xl bg-muted border-0 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="Prénom"
                autoFocus
              />
              <input
                type="text"
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                className="w-full px-4 py-4 rounded-xl bg-muted border-0 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="Nom"
              />
            </div>
          </div>
        );
      
      case 2:
        return (
          <div className="animate-slide-up">
            <h1 className="font-display text-2xl font-semibold text-foreground mb-2">
              Enchanté {formData.firstName} 🙂
            </h1>
            <p className="text-muted-foreground mb-8">Un 06 ?</p>
            
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="w-full px-4 py-4 rounded-xl bg-muted border-0 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="06 12 34 56 78"
              autoFocus
            />
          </div>
        );
      
      case 3:
        return (
          <div className="animate-slide-up">
            <h1 className="font-display text-2xl font-semibold text-foreground mb-2">
              Pour continuer, quel âge as-tu ?
            </h1>
            <p className="text-muted-foreground mb-8">Minimum 16 ans</p>
            
            <input
              type="number"
              value={formData.age}
              onChange={(e) => setFormData({ ...formData, age: e.target.value })}
              className="w-full px-4 py-4 rounded-xl bg-muted border-0 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Ton âge"
              min="1"
              max="120"
              autoFocus
            />
            {error && <p className="text-destructive text-sm mt-2">{error}</p>}
          </div>
        );
      
      case 4:
        return (
          <div className="animate-slide-up">
            <h1 className="font-display text-2xl font-semibold text-foreground mb-2">
              Dernière étape ✨
            </h1>
            <p className="text-muted-foreground mb-8">Choisis ton mot de passe</p>
            
            <div className="space-y-4">
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-4 py-4 rounded-xl bg-muted border-0 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 pr-12"
                  placeholder="Mot de passe"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground touch-button"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              <input
                type={showPassword ? "text" : "password"}
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                className="w-full px-4 py-4 rounded-xl bg-muted border-0 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="Confirmer le mot de passe"
              />
              {error && <p className="text-destructive text-sm mt-2">{error}</p>}
            </div>
          </div>
        );
      
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col px-6 pt-safe-top">
      {/* Header with back button and progress */}
      <div className="py-4">
        <button
          onClick={handleBack}
          className="touch-button -ml-2 mb-4"
        >
          <ArrowLeft size={24} className="text-foreground" />
        </button>
        
        {/* Progress bar */}
        <div className="progress-bar">
          <div 
            className="progress-bar-fill"
            style={{ width: `${(step / totalSteps) * 100}%` }}
          />
        </div>
      </div>

      {/* Form content */}
      <div className="flex-1 flex flex-col justify-center pb-8">
        {renderStep()}
      </div>

      {/* Continue button */}
      <div className="pb-8 safe-bottom">
        <button
          onClick={handleNext}
          disabled={!isStepValid()}
          className="w-full py-4 rounded-2xl gradient-primary text-primary-foreground font-medium text-lg shadow-soft touch-button disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {step === 4 ? "Créer mon compte" : "Continuer"}
        </button>
      </div>
    </div>
  );
};

export default Signup;
