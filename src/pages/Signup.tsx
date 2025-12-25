import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import MobileLayout from "@/components/MobileLayout";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const Signup = () => {
  const navigate = useNavigate();
  const { signup, isLoading } = useAuth();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    birthDate: "",
    email: "",
    password: "",
    confirmPassword: "",
    role: "client" as "client" | "pro",
    activityName: "",
    city: "",
    instagramAccount: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const totalSteps = formData.role === "pro" ? 8 : 6;

  const formatPhoneNumber = (value: string) => {
    const digits = value.replace(/\D/g, "");
    return digits.replace(/(\d{2})(?=\d)/g, "$1 ");
  };

  const getAgeFromBirthDate = (birthDate: string) => {
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  const validateEmail = (email: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const handleNext = async () => {
    setError("");

    if (step === 3) {
      if (!validateEmail(formData.email)) {
        setError("Email invalide");
        return;
      }
    }

    if (step === 4) {
      const age = getAgeFromBirthDate(formData.birthDate);
      if (isNaN(age) || age < 16) {
        setError("Tu dois avoir au moins 16 ans pour utiliser Blyss");
        return;
      }
    }

    if ((formData.role === "client" && step === 6) || (formData.role === "pro" && step === 8)) {
      if (formData.password !== formData.confirmPassword) {
        setError("Les mots de passe ne correspondent pas");
        return;
      }
      if (formData.password.length < 8) {
        setError("Le mot de passe doit contenir au moins 8 caractères");
        return;
      }

      // Submit to API
      const response = await signup({
        first_name: formData.firstName.trim(),
        last_name: formData.lastName.trim(),
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
        phone_number: formData.phone.replace(/\s/g, ""),
        birth_date: formData.birthDate,
        role: formData.role,
        ...(formData.role === "pro" && {
          activity_name: formData.activityName.trim(),
          city: formData.city.trim(),
          instagram_account: formData.instagramAccount.trim(),
        }),
      });

      if (response.success) {
  toast.success("Compte créé avec succès !");
  if (formData.role === "pro") {
    navigate("/pro/dashboard");
  } else {
    navigate("/client");
  }
} else {
  setError(response.error || "Erreur lors de la création du compte");
}
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
        return formData.phone.replace(/\s/g, "").length === 10;
      case 3:
        return validateEmail(formData.email.trim());
      case 4:
        return (
          !!formData.birthDate &&
          getAgeFromBirthDate(formData.birthDate) >= 16
        );
      case 5:
        return formData.role === "client" || formData.role === "pro";
      case 6:
        if (formData.role === "pro") {
          return formData.activityName.trim().length > 0;
        }
        return formData.password.length >= 8 && formData.confirmPassword;
      case 7:
        return formData.city.trim().length > 0;
      case 8:
        return formData.password.length >= 8 && formData.confirmPassword;
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
                disabled={isLoading}
              />
              <input
                type="text"
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                className="w-full px-4 py-4 rounded-xl bg-muted border-0 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="Nom"
                disabled={isLoading}
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
              onChange={(e) => setFormData({ ...formData, phone: formatPhoneNumber(e.target.value) })}
              className="w-full px-4 py-4 rounded-xl bg-muted border-0 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="06 12 34 56 78"
              autoFocus
              disabled={isLoading}
            />
          </div>
        );

      case 3:
        return (
          <div className="animate-slide-up">
            <h1 className="font-display text-2xl font-semibold text-foreground mb-2">
              Super ! ✉️
            </h1>
            <p className="text-muted-foreground mb-8">Ton email ?</p>

            <input
              type="email"
              value={formData.email}
              onChange={(e) => {
                setFormData({ ...formData, email: e.target.value });
                setError("");
              }}
              className="w-full max-w-lg px-4 py-4 rounded-xl bg-muted border-0 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="ton@email.com"
              autoFocus
              disabled={isLoading}
            />
            {error && <p className="text-destructive text-sm mt-2">{error}</p>}
          </div>
        );

      case 4:
        return (
          <div className="animate-slide-up">
            <h1 className="font-display text-2xl font-semibold text-foreground mb-2">
              Ta date de naissance 🎂
            </h1>
            <p className="text-muted-foreground mb-8">
              Tu dois avoir au moins 16 ans
            </p>

            <input
              type="date"
              value={formData.birthDate}
              onChange={(e) =>
                setFormData({ ...formData, birthDate: e.target.value })
              }
              className="w-full px-4 py-4 rounded-xl bg-muted border-0 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              autoFocus
              disabled={isLoading}
            />

            {error && <p className="text-destructive text-sm mt-2">{error}</p>}
          </div>
        );

      case 5:
        return (
          <div className="animate-slide-up">
            <h1 className="font-display text-2xl font-semibold text-foreground mb-2">
              Tu es plutôt… 👀
            </h1>
            <p className="text-muted-foreground mb-8">
              Choisis le type de compte
            </p>

            <div className="space-y-4">
              <button
                onClick={() => setFormData({ ...formData, role: "client" })}
                className={`w-full py-4 rounded-xl border text-lg font-medium transition ${
                  formData.role === "client"
                    ? "border-primary bg-primary/10"
                    : "border-muted"
                }`}
              >
                🙋 Client
              </button>

              <button
                onClick={() => setFormData({ ...formData, role: "pro" })}
                className={`w-full py-4 rounded-xl border text-lg font-medium transition ${
                  formData.role === "pro"
                    ? "border-primary bg-primary/10"
                    : "border-muted"
                }`}
              >
                💼 Professionnel
              </button>
            </div>
          </div>
        );

      case 6:
        if (formData.role !== "pro") {
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
                    onChange={(e) => {
                      setFormData({ ...formData, password: e.target.value });
                      setError("");
                    }}
                    className="w-full px-4 py-4 rounded-xl bg-muted border-0 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 pr-12"
                    placeholder="Mot de passe (min. 8 caractères)"
                    autoFocus
                    disabled={isLoading}
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
                  onChange={(e) => {
                    setFormData({ ...formData, confirmPassword: e.target.value });
                    setError("");
                  }}
                  className="w-full px-4 py-4 rounded-xl bg-muted border-0 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="Confirmer le mot de passe"
                  disabled={isLoading}
                />
                {error && <p className="text-destructive text-sm mt-2">{error}</p>}
              </div>
            </div>
          );
        }
        return (
          <div className="animate-slide-up">
            <h1 className="font-display text-2xl font-semibold mb-2">
              Ton activité 💼
            </h1>
            <input
              value={formData.activityName}
              onChange={(e) =>
                setFormData({ ...formData, activityName: e.target.value })
              }
              className="w-full px-4 py-4 rounded-xl bg-muted"
              placeholder="Nom de ton activité"
            />
          </div>
        );

      case 7:
        if (formData.role !== "pro") return null;
        return (
          <div className="animate-slide-up">
            <h1 className="font-display text-2xl font-semibold mb-2">
              Ta ville 📍
            </h1>
            <input
              value={formData.city}
              onChange={(e) =>
                setFormData({ ...formData, city: e.target.value })
              }
              className="w-full px-4 py-4 rounded-xl bg-muted"
              placeholder="Ville"
            />
          </div>
        );

      case 8:
        if (formData.role !== "pro") return null;
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
                  onChange={(e) => {
                    setFormData({ ...formData, password: e.target.value });
                    setError("");
                  }}
                  className="w-full px-4 py-4 rounded-xl bg-muted border-0 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 pr-12"
                  placeholder="Mot de passe (min. 8 caractères)"
                  autoFocus
                  disabled={isLoading}
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
                onChange={(e) => {
                  setFormData({ ...formData, confirmPassword: e.target.value });
                  setError("");
                }}
                className="w-full px-4 py-4 rounded-xl bg-muted border-0 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="Confirmer le mot de passe"
                disabled={isLoading}
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
    <MobileLayout showNav={false}>
      <div className="relative flex flex-col flex-1 min-h-screen max-w-lg mx-auto w-full bg-background">
        {/* Header with back button and progress - fixed at top */}
        <div className="fixed top-0 left-1/2 -translate-x-1/2 z-10 w-full max-w-lg bg-background">
          <div className="flex items-center justify-between px-6 pt-4 pb-2">
            <button
              onClick={handleBack}
              className="touch-button -ml-2"
              disabled={isLoading}
            >
              <ArrowLeft size={24} className="text-foreground" />
            </button>
            <div className="flex-grow mx-4 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-2 bg-primary rounded-full transition-all duration-300"
                style={{ width: `${(step / totalSteps) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* Form content centered vertically and horizontally, between header and button */}
        <div
          className="flex flex-1 flex-col items-center justify-center px-6"
          style={{
            minHeight: "calc(100vh - 136px)",
            marginTop: "64px",
            marginBottom: "72px",
          }}
        >
          <div className="w-full max-w-lg flex flex-col items-center justify-center">
            {renderStep()}
          </div>
        </div>

        {/* Continue button fixed at bottom with safe padding */}
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg bg-background px-6 pb-4 pt-2 z-10">
          <button
            onClick={handleNext}
            disabled={!isStepValid() || isLoading}
            className="w-full py-4 rounded-2xl gradient-primary text-primary-foreground font-medium text-lg shadow-soft touch-button disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading
              ? "Chargement..."
              : (formData.role === "client" && step === 6) ||
                (formData.role === "pro" && step === 8)
              ? "Créer mon compte"
              : "Continuer"}
          </button>
        </div>
      </div>
    </MobileLayout>
  );
};

export default Signup;
