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

  // 6 étapes pour client, 9 pour pro
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

    // step final : 6 pour client, 9 pour pro
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
        // Si pro : on l’envoie sur la page d’abonnement
        if (formData.role === "pro") {
          navigate("/pro/abonnement"); // adapte le chemin à ta route réelle (ex: "/pro/subscription")
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
        return true; // choix rôle
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
      // steps 6–8 (pro) sont optionnels, 6 client = password (validé plus tard)
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
    // mapping :
    // 1: rôle
    // 2: nom/prénom
    // 3: téléphone
    // 4: email
    // 5: date de naissance
    // 6: client => mot de passe / pro => activité
    // 7: pro => ville
    // 8: pro => Instagram
    // 9: pro => mot de passe

    if (step === 1) {
      const canContinue = !!formData.role;

      return (
        <div className="animate-slide-up space-y-8">
          <div>
            <h1 className="font-display text-2xl font-semibold text-foreground mb-2">
              Bienvenue sur Blyss 💖
            </h1>
            <p className="text-muted-foreground text-sm">
              Choisis comment tu utilises Blyss. Tu pourras ajuster certains réglages plus tard.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <button
              type="button"
              onClick={() =>
                setFormData((prev) => ({ ...prev, role: "client" as Role }))
              }
              className={`flex items-center gap-3 rounded-2xl px-4 py-4 border transition-all text-left ${formData.role === "client"
                ? "bg-primary/10 border-primary shadow-soft"
                : "bg-muted border-border hover:bg-muted/80"
                }`}
              disabled={isLoading}
            >
              <div className="flex-1">
                <div className="text-sm font-semibold text-foreground">
                  Cliente
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Je réserve des prestations manucure sur Blyss.
                </p>
              </div>
              <div
                className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${formData.role === "client"
                  ? "border-primary"
                  : "border-muted-foreground/40"
                  }`}
              >
                {formData.role === "client" && (
                  <div className="w-2 h-2 rounded-full bg-primary" />
                )}
              </div>
            </button>

            <button
              type="button"
              onClick={() =>
                setFormData((prev) => ({ ...prev, role: "pro" as Role }))
              }
              className={`flex items-center gap-3 rounded-2xl px-4 py-4 border transition-all text-left ${formData.role === "pro"
                ? "bg-primary/10 border-primary shadow-soft"
                : "bg-muted border-border hover:bg-muted/80"
                }`}
              disabled={isLoading}
            >
              <div className="flex-1">
                <div className="text-sm font-semibold text-foreground">
                  Prothésiste
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Je propose mes prestations et gère mes clientes sur Blyss.
                </p>
              </div>
              <div
                className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${formData.role === "pro"
                  ? "border-primary"
                  : "border-muted-foreground/40"
                  }`}
              >
                {formData.role === "pro" && (
                  <div className="w-2 h-2 rounded-full bg-primary" />
                )}
              </div>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setStep(2)}
            disabled={!canContinue || isLoading}
            className="w-full mt-2 py-3 rounded-xl gradient-primary text-primary-foreground font-medium text-sm shadow-soft disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Valider mon choix
          </button>
        </div>
      );
    }

    if (step === 2) {
      return (
        <div className="animate-slide-up">
          <h1 className="font-display text-2xl font-semibold text-foreground mb-2">
            Enchanté, moi c&apos;est Blyss 💖
          </h1>
          <p className="text-muted-foreground mb-8">Et toi ?</p>

          <div className="space-y-4">
            <input
              type="text"
              value={formData.firstName}
              onChange={(e) =>
                setFormData({ ...formData, firstName: e.target.value })
              }
              className="w-full px-4 py-4 rounded-xl bg-white border-0 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
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
              className="w-full px-4 py-4 rounded-xl bg-white border-0 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Nom"
              disabled={isLoading}
            />
          </div>
        </div>
      );
    }

    if (step === 3) {
      return (
        <div className="animate-slide-up">
          <h1 className="font-display text-2xl font-semibold text-foreground mb-2">
            Enchanté {formData.firstName} 🙂
          </h1>
          <p className="text-muted-foreground mb-8">Un 06 ?</p>

          <input
            type="tel"
            value={formData.phone}
            onChange={(e) => {
              const raw = e.target.value.replace(/\D/g, ""); // seulement les chiffres
              const limited = raw.slice(0, 10);              // max 10 chiffres
              setFormData({
                ...formData,
                phone: formatPhoneNumber(limited),
              });
            }}
            className="w-full px-4 py-4 rounded-xl bg-white border-0 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="06 12 34 56 78"
            autoFocus
            disabled={isLoading}
          />
        </div>
      );
    }

    if (step === 4) {
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
            className="w-full max-w-lg px-4 py-4 rounded-xl bg-white border-0 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="ton@email.com"
            autoFocus
            disabled={isLoading}
          />
          {error && (
            <p className="text-destructive text-sm mt-2">{error}</p>
          )}
        </div>
      );
    }

    if (step === 5) {
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
            className="w-full px-4 py-4 rounded-xl bg-white border-0 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            autoFocus
            disabled={isLoading}
          />

          {error && (
            <p className="text-destructive text-sm mt-2">{error}</p>
          )}
        </div>
      );
    }

    // CLIENT : step 6 = mot de passe
    if (formData.role === "client") {
      if (step === 6) {
        return (
          <div className="animate-slide-up space-y-6">
            <div>
              <h1 className="font-display text-2xl font-semibold text-foreground mb-2">
                Dernière étape ✨
              </h1>
              <p className="text-muted-foreground">
                Choisis ton mot de passe.
              </p>
            </div>

            <div className="space-y-4">
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={(e) => {
                    setFormData({
                      ...formData,
                      password: e.target.value,
                    });
                    setError("");
                  }}
                  className="w-full px-4 py-4 rounded-xl bg-white border-0 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 pr-12"
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
                  setFormData({
                    ...formData,
                    confirmPassword: e.target.value,
                  });
                  setError("");
                }}
                className="w-full px-4 py-4 rounded-xl bg-white border-0 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="Confirmer le mot de passe"
                disabled={isLoading}
              />
              {error && (
                <p className="text-destructive text-sm mt-2">{error}</p>
              )}
            </div>
          </div>
        );
      }

      return null;
    }

    // PRO : steps 6–9
    if (formData.role === "pro") {
      if (step === 6) {
        return (
          <div className="animate-slide-up space-y-4">
            <h1 className="font-display text-2xl font-semibold text-foreground mb-2">
              Ton activité 💅
            </h1>
            <p className="text-muted-foreground mb-4 text-sm">
              Nom de ton activité. Tu pourras le modifier plus tard.
            </p>

            <input
              type="text"
              value={formData.activityName}
              onChange={(e) =>
                setFormData({ ...formData, activityName: e.target.value })
              }
              className="w-full px-4 py-4 rounded-xl bg-white border-0 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Ex. : Studio Blyss"
              autoFocus
              disabled={isLoading}
            />
          </div>
        );
      }

      if (step === 7) {
        return (
          <div className="animate-slide-up space-y-4">
            <h1 className="font-display text-2xl font-semibold text-foreground mb-2">
              Où exerces-tu ? 📍
            </h1>
            <p className="text-muted-foreground mb-4 text-sm">
              Ville ou quartier. Tu pourras préciser plus tard.
            </p>

            <input
              type="text"
              value={formData.city}
              onChange={(e) =>
                setFormData({ ...formData, city: e.target.value })
              }
              className="w-full px-4 py-4 rounded-xl bg-white border-0 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Ex. : Paris 11"
              autoFocus
              disabled={isLoading}
            />
          </div>
        );
      }

      if (step === 8) {
        return (
          <div className="animate-slide-up space-y-4">
            <h1 className="font-display text-2xl font-semibold text-foreground mb-2">
              Ton Instagram 📸
            </h1>
            <p className="text-muted-foreground mb-4 text-sm">
              Ça aide les clientes à te découvrir.
            </p>

            <input
              type="text"
              value={formData.instagramAccount}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  instagramAccount: e.target.value,
                })
              }
              className="w-full px-4 py-4 rounded-xl bg-white border-0 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="@ton_instagram"
              autoFocus
              disabled={isLoading}
            />
          </div>
        );
      }

      if (step === 9) {
        return (
          <div className="animate-slide-up space-y-6">
            <div>
              <h1 className="font-display text-2xl font-semibold text-foreground mb-2">
                Dernière étape ✨
              </h1>
              <p className="text-muted-foreground">
                Choisis ton mot de passe.
              </p>
            </div>

            <div className="space-y-4">
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={(e) => {
                    setFormData({
                      ...formData,
                      password: e.target.value,
                    });
                    setError("");
                  }}
                  className="w-full px-4 py-4 rounded-xl bg-white border-0 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 pr-12"
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
                  setFormData({
                    ...formData,
                    confirmPassword: e.target.value,
                  });
                  setError("");
                }}
                className="w-full px-4 py-4 rounded-xl bg-white border-0 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="Confirmer le mot de passe"
                disabled={isLoading}
              />
              {error && (
                <p className="text-destructive text-sm mt-2">{error}</p>
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
        {/* Header with back button and progress */}
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

        {/* Form content */}
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

        {/* Barre d’action en bas (sauf step 1) */}
        {step !== 1 && (
          <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg px-6 pb-4 pt-2 bg-background/90 backdrop-blur-sm">
            <button
              onClick={handleNext}
              disabled={!isStepValid() || isLoading}
              className="w-full py-4 rounded-2xl gradient-primary text-primary-foreground font-medium text-lg shadow-soft touch-button disabled:opacity-50 disabled:cursor-not-allowed"
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
