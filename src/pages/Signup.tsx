import { useState, useMemo, forwardRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import MobileLayout from "@/components/MobileLayout";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

type Role = "client" | "pro";

const Signup = forwardRef<HTMLDivElement>((_, ref) => {
  const navigate = useNavigate();
  const { signup, isLoading } = useAuth();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    role: "client" as Role,
    firstName: "",
    lastName: "",
    phone: "",
    birthDate: "",
    email: "",
    password: "",
    confirmPassword: "",
    activityName: "",
    city: "",
    instagramAccount: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const totalSteps = useMemo(
    () => (formData.role === "pro" ? 9 : 6),
    [formData.role]
  );

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

    if (step === 4) {
      if (!validateEmail(formData.email)) {
        setError("Email invalide");
        return;
      }
    }

    if (step === 5) {
      const age = getAgeFromBirthDate(formData.birthDate);
      if (isNaN(age) || age < 16) {
        setError("Tu dois avoir au moins 16 ans pour utiliser Blyss");
        return;
      }
    }

    const isClientLastStep = formData.role === "client" && step === 6;
    const isProLastStep = formData.role === "pro" && step === 9;

    if (isClientLastStep || isProLastStep) {
      if (formData.password !== formData.confirmPassword) {
        setError("Les mots de passe ne correspondent pas");
        return;
      }
      if (formData.password.length < 8) {
        setError("Le mot de passe doit contenir au moins 8 caractères");
        return;
      }

      const payload = {
        first_name: formData.firstName.trim(),
        last_name: formData.lastName.trim(),
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
        phone_number: formData.phone.replace(/\s/g, ""),
        birth_date: formData.birthDate,
        role: formData.role,
        activity_name:
          formData.role === "pro" && formData.activityName.trim()
            ? formData.activityName.trim()
            : null,
        city:
          formData.role === "pro" && formData.city.trim()
            ? formData.city.trim()
            : null,
        instagram_account:
          formData.role === "pro" && formData.instagramAccount.trim()
            ? formData.instagramAccount.trim()
            : null,
      };

      const response = await signup(payload);

      if (response.success) {
        toast.success("Compte créé avec succès !");
        if (formData.role === "pro") {
          navigate("/pro/new-subscription");
        } else {
          navigate("/client");
        }
      } else {
        setError(response.error || "Erreur lors de la création du compte");
      }
      return;
    }

    setStep((prev) => prev + 1);
  };

  const handleBack = () => {
    if (step === 1) {
      navigate("/");
    } else {
      setStep((prev) => prev - 1);
    }
  };

  const isStepValid = () => {
    switch (step) {
      case 1:
        return true;
      case 2:
        return formData.firstName.trim() && formData.lastName.trim();
      case 3:
        return formData.phone.replace(/\s/g, "").length === 10;
      case 4:
        return validateEmail(formData.email.trim());
      case 5:
        return (
          !!formData.birthDate &&
          getAgeFromBirthDate(formData.birthDate) >= 16
        );
      case 6:
      case 7:
      case 8:
      case 9:
        return true;
      default:
        return false;
    }
  };

  const renderStep = () => {
    if (step === 1) {
      return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8 w-full">
          <div className="text-center">
            <h1 className="font-display text-3xl font-bold text-foreground mb-3">
              Bienvenue sur Blyss 💖
            </h1>
            <p className="text-muted-foreground">
              Choisis comment tu utilises Blyss
            </p>
          </div>

          <div className="space-y-4">
            <button
              type="button"
              onClick={() =>
                setFormData((prev) => ({ ...prev, role: "client" as Role }))
              }
              className={`
                w-full flex items-center gap-4 rounded-2xl px-5 py-5 border-2 
                transition-all duration-300 text-left
                ${
                  formData.role === "client"
                    ? "bg-primary/5 border-primary shadow-lg shadow-primary/10 scale-[1.02]"
                    : "bg-card border-muted hover:border-muted-foreground/30 hover:scale-[1.01]"
                }
              `}
              disabled={isLoading}
            >
              <div className="flex-1">
                <div className="text-base font-semibold text-foreground mb-1">
                  Cliente
                </div>
                <p className="text-sm text-muted-foreground">
                  Je réserve des prestations manucure
                </p>
              </div>
              <div
                className={`
                  w-6 h-6 rounded-full border-2 flex items-center justify-center
                  transition-all duration-300
                  ${
                    formData.role === "client"
                      ? "border-primary bg-primary"
                      : "border-muted-foreground/40"
                  }
                `}
              >
                {formData.role === "client" && (
                  <div className="w-2.5 h-2.5 rounded-full bg-white animate-in zoom-in duration-200" />
                )}
              </div>
            </button>

            <button
              type="button"
              onClick={() =>
                setFormData((prev) => ({ ...prev, role: "pro" as Role }))
              }
              className={`
                w-full flex items-center gap-4 rounded-2xl px-5 py-5 border-2 
                transition-all duration-300 text-left
                ${
                  formData.role === "pro"
                    ? "bg-primary/5 border-primary shadow-lg shadow-primary/10 scale-[1.02]"
                    : "bg-card border-muted hover:border-muted-foreground/30 hover:scale-[1.01]"
                }
              `}
              disabled={isLoading}
            >
              <div className="flex-1">
                <div className="text-base font-semibold text-foreground mb-1">
                  Prothésiste
                </div>
                <p className="text-sm text-muted-foreground">
                  Je propose mes prestations sur Blyss
                </p>
              </div>
              <div
                className={`
                  w-6 h-6 rounded-full border-2 flex items-center justify-center
                  transition-all duration-300
                  ${
                    formData.role === "pro"
                      ? "border-primary bg-primary"
                      : "border-muted-foreground/40"
                  }
                `}
              >
                {formData.role === "pro" && (
                  <div className="w-2.5 h-2.5 rounded-full bg-white animate-in zoom-in duration-200" />
                )}
              </div>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setStep(2)}
            disabled={isLoading}
            className="
              w-full h-14 rounded-2xl 
              bg-primary hover:bg-primary/90
              text-primary-foreground font-semibold
              shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40
              transition-all duration-300
              disabled:opacity-50
              active:scale-[0.98]
            "
          >
            Continuer
          </button>
        </div>
      );
    }

    if (step === 2) {
      return (
        <div className="animate-in fade-in slide-in-from-right-4 duration-300 w-full">
          <h1 className="font-display text-3xl font-bold text-foreground mb-2">
            Enchanté 💖
          </h1>
          <p className="text-muted-foreground mb-8">Et toi, c'est ?</p>

          <div className="space-y-4">
            <input
              type="text"
              value={formData.firstName}
              onChange={(e) =>
                setFormData({ ...formData, firstName: e.target.value })
              }
              className="
                w-full h-14 px-4 rounded-2xl 
                bg-card border-2 border-muted
                text-foreground placeholder:text-muted-foreground/50
                focus:outline-none focus:border-primary focus:scale-[1.02]
                transition-all duration-300
              "
              placeholder="Prénom"
              autoFocus
              disabled={isLoading}
            />
            <input
              type="text"
              value={formData.lastName}
              onChange={(e) =>
                setFormData({ ...formData, lastName: e.target.value })
              }
              className="
                w-full h-14 px-4 rounded-2xl 
                bg-card border-2 border-muted
                text-foreground placeholder:text-muted-foreground/50
                focus:outline-none focus:border-primary focus:scale-[1.02]
                transition-all duration-300
              "
              placeholder="Nom"
              disabled={isLoading}
            />
          </div>
        </div>
      );
    }

    if (step === 3) {
      return (
        <div className="animate-in fade-in slide-in-from-right-4 duration-300 w-full">
          <h1 className="font-display text-3xl font-bold text-foreground mb-2">
            Enchanté {formData.firstName} 🙂
          </h1>
          <p className="text-muted-foreground mb-8">Un 06 ?</p>

          <input
            type="tel"
            value={formData.phone}
            onChange={(e) => {
              const raw = e.target.value.replace(/\D/g, "");
              const limited = raw.slice(0, 10);
              setFormData({
                ...formData,
                phone: formatPhoneNumber(limited),
              });
            }}
            className="
              w-full h-14 px-4 rounded-2xl 
              bg-card border-2 border-muted
              text-foreground placeholder:text-muted-foreground/50
              focus:outline-none focus:border-primary focus:scale-[1.02]
              transition-all duration-300
            "
            placeholder="06 12 34 56 78"
            autoFocus
            disabled={isLoading}
          />
        </div>
      );
    }

    if (step === 4) {
      return (
        <div className="animate-in fade-in slide-in-from-right-4 duration-300 w-full">
          <h1 className="font-display text-3xl font-bold text-foreground mb-2">
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
            className="
              w-full h-14 px-4 rounded-2xl 
              bg-card border-2 border-muted
              text-foreground placeholder:text-muted-foreground/50
              focus:outline-none focus:border-primary focus:scale-[1.02]
              transition-all duration-300
            "
            placeholder="ton@email.com"
            autoFocus
            disabled={isLoading}
          />
          {error && (
            <p className="text-destructive text-sm mt-3 animate-in slide-in-from-top-2 duration-200">
              {error}
            </p>
          )}
        </div>
      );
    }

    if (step === 5) {
      return (
        <div className="animate-in fade-in slide-in-from-right-4 duration-300 w-full">
          <h1 className="font-display text-3xl font-bold text-foreground mb-2">
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
            className="
              w-full h-14 px-4 rounded-2xl 
              bg-card border-2 border-muted
              text-foreground
              focus:outline-none focus:border-primary focus:scale-[1.02]
              transition-all duration-300
            "
            autoFocus
            disabled={isLoading}
          />

          {error && (
            <p className="text-destructive text-sm mt-3 animate-in slide-in-from-top-2 duration-200">
              {error}
            </p>
          )}
        </div>
      );
    }

    // CLIENT : step 6 = mot de passe
    if (formData.role === "client" && step === 6) {
      return (
        <div className="animate-in fade-in slide-in-from-right-4 duration-300 w-full space-y-6">
          <div>
            <h1 className="font-display text-3xl font-bold text-foreground mb-2">
              Dernière étape ✨
            </h1>
            <p className="text-muted-foreground">
              Choisis ton mot de passe
            </p>
          </div>

          <div className="space-y-4">
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={formData.password}
                onChange={(e) => {
                  setFormData({ ...formData, password: e.target.value });
                  setError("");
                }}
                className="
                  w-full h-14 px-4 pr-12 rounded-2xl 
                  bg-card border-2 border-muted
                  text-foreground placeholder:text-muted-foreground/50
                  focus:outline-none focus:border-primary focus:scale-[1.02]
                  transition-all duration-300
                "
                placeholder="Mot de passe (min. 8 caractères)"
                autoFocus
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="
                  absolute right-4 top-1/2 -translate-y-1/2 
                  text-muted-foreground hover:text-primary
                  p-1 rounded-lg hover:bg-muted/50
                  transition-all active:scale-90
                "
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
              className="
                w-full h-14 px-4 rounded-2xl 
                bg-card border-2 border-muted
                text-foreground placeholder:text-muted-foreground/50
                focus:outline-none focus:border-primary focus:scale-[1.02]
                transition-all duration-300
              "
              placeholder="Confirmer le mot de passe"
              disabled={isLoading}
            />
            {error && (
              <p className="text-destructive text-sm animate-in slide-in-from-top-2 duration-200">
                {error}
              </p>
            )}
          </div>
        </div>
      );
    }

    // PRO : steps 6–9
    if (formData.role === "pro") {
      if (step === 6) {
        return (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300 w-full">
            <h1 className="font-display text-3xl font-bold text-foreground mb-2">
              Ton activité 💅
            </h1>
            <p className="text-muted-foreground mb-8 text-sm">
              Nom de ton activité (modifiable plus tard)
            </p>

            <input
              type="text"
              value={formData.activityName}
              onChange={(e) =>
                setFormData({ ...formData, activityName: e.target.value })
              }
              className="
                w-full h-14 px-4 rounded-2xl 
                bg-card border-2 border-muted
                text-foreground placeholder:text-muted-foreground/50
                focus:outline-none focus:border-primary focus:scale-[1.02]
                transition-all duration-300
              "
              placeholder="Ex. : Studio Blyss"
              autoFocus
              disabled={isLoading}
            />
          </div>
        );
      }

      if (step === 7) {
        return (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300 w-full">
            <h1 className="font-display text-3xl font-bold text-foreground mb-2">
              Où exerces-tu ? 📍
            </h1>
            <p className="text-muted-foreground mb-8 text-sm">
              Ville ou quartier
            </p>

            <input
              type="text"
              value={formData.city}
              onChange={(e) =>
                setFormData({ ...formData, city: e.target.value })
              }
              className="
                w-full h-14 px-4 rounded-2xl 
                bg-card border-2 border-muted
                text-foreground placeholder:text-muted-foreground/50
                focus:outline-none focus:border-primary focus:scale-[1.02]
                transition-all duration-300
              "
              placeholder="Ex. : Paris 11"
              autoFocus
              disabled={isLoading}
            />
          </div>
        );
      }

      if (step === 8) {
        return (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300 w-full">
            <h1 className="font-display text-3xl font-bold text-foreground mb-2">
              Ton Instagram 📸
            </h1>
            <p className="text-muted-foreground mb-8 text-sm">
              Aide les clientes à te découvrir
            </p>

            <input
              type="text"
              value={formData.instagramAccount}
              onChange={(e) =>
                setFormData({ ...formData, instagramAccount: e.target.value })
              }
              className="
                w-full h-14 px-4 rounded-2xl 
                bg-card border-2 border-muted
                text-foreground placeholder:text-muted-foreground/50
                focus:outline-none focus:border-primary focus:scale-[1.02]
                transition-all duration-300
              "
              placeholder="@ton_instagram"
              autoFocus
              disabled={isLoading}
            />
          </div>
        );
      }

      if (step === 9) {
        return (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300 w-full space-y-6">
            <div>
              <h1 className="font-display text-3xl font-bold text-foreground mb-2">
                Dernière étape ✨
              </h1>
              <p className="text-muted-foreground">
                Choisis ton mot de passe
              </p>
            </div>

            <div className="space-y-4">
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={(e) => {
                    setFormData({ ...formData, password: e.target.value });
                    setError("");
                  }}
                  className="
                    w-full h-14 px-4 pr-12 rounded-2xl 
                    bg-card border-2 border-muted
                    text-foreground placeholder:text-muted-foreground/50
                    focus:outline-none focus:border-primary focus:scale-[1.02]
                    transition-all duration-300
                  "
                  placeholder="Mot de passe (min. 8 caractères)"
                  autoFocus
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="
                    absolute right-4 top-1/2 -translate-y-1/2 
                    text-muted-foreground hover:text-primary
                    p-1 rounded-lg hover:bg-muted/50
                    transition-all active:scale-90
                  "
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              <input
                type={showPassword ? "text" : "password"}
                value={formData.confirmPassword}
                onChange={(e) => {
                  setFormData({
                    ...formData,
                    confirmPassword: e.target.value,
                  });
                  setError("");
                }}
                className="
                  w-full h-14 px-4 rounded-2xl 
                  bg-card border-2 border-muted
                  text-foreground placeholder:text-muted-foreground/50
                  focus:outline-none focus:border-primary focus:scale-[1.02]
                  transition-all duration-300
                "
                placeholder="Confirmer le mot de passe"
                disabled={isLoading}
              />
              {error && (
                <p className="text-destructive text-sm animate-in slide-in-from-top-2 duration-200">
                  {error}
                </p>
              )}
            </div>
          </div>
        );
      }
    }

    return null;
  };

  const isLastStep =
    (formData.role === "client" && step === 6) ||
    (formData.role === "pro" && step === 9);

  const isProOptionalStep =
    formData.role === "pro" && (step === 6 || step === 7 || step === 8);

  const currentOptionalFieldValue =
    formData.role === "pro" && step === 6
      ? formData.activityName
      : formData.role === "pro" && step === 7
      ? formData.city
      : formData.role === "pro" && step === 8
      ? formData.instagramAccount
      : "";

  const primaryButtonLabel = isLoading
    ? "Chargement..."
    : isLastStep
    ? "Créer mon compte"
    : isProOptionalStep && !currentOptionalFieldValue.trim()
    ? "Remplir plus tard"
    : "Continuer";

  return (
    <MobileLayout showNav={false}>
      <div className="relative flex flex-col flex-1 min-h-screen max-w-lg mx-auto w-full bg-background">
        {/* Header */}
        <div className="fixed top-0 left-1/2 -translate-x-1/2 z-10 w-full max-w-lg bg-background/95 backdrop-blur-sm">
          <div className="flex items-center gap-4 px-6 pt-6 pb-4">
            <button
              onClick={handleBack}
              className="
                p-2 -ml-2 rounded-xl
                hover:bg-muted/50 
                transition-all active:scale-90
              "
              disabled={isLoading}
            >
              <ArrowLeft size={24} className="text-foreground" />
            </button>
            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
                style={{ width: `${(step / totalSteps) * 100}%` }}
              />
            </div>
            <span className="text-sm font-medium text-muted-foreground min-w-[3rem] text-right">
              {step}/{totalSteps}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex items-center justify-center px-6 pt-24 pb-28">
          {renderStep()}
        </div>

        {/* Bottom Button */}
        {step !== 1 && (
          <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg px-6 pb-6 pt-4 bg-gradient-to-t from-background via-background to-transparent">
            <button
              onClick={handleNext}
              disabled={!isStepValid() || isLoading}
              className="
                w-full h-14 rounded-2xl 
                bg-primary hover:bg-primary/90
                text-primary-foreground font-semibold text-base
                shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40
                transition-all duration-300
                disabled:opacity-50 disabled:cursor-not-allowed
                active:scale-[0.98]
              "
            >
              {primaryButtonLabel}
            </button>
          </div>
        )}
      </div>
    </MobileLayout>
  );
});

Signup.displayName = "Signup";

export default Signup;
