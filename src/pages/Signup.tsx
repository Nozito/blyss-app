import { useState, useMemo, useCallback, forwardRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import MobileLayout from "@/components/MobileLayout";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

// ✅ Types
type Role = "client" | "pro";

interface FormData {
  role: Role;
  firstName: string;
  lastName: string;
  phone: string;
  birthDate: string;
  email: string;
  password: string;
  confirmPassword: string;
  activityName: string;
  city: string;
  instagramAccount: string;
}

// ✅ Constantes de validation
const VALIDATION = {
  PHONE_LENGTH: 10,
  MIN_AGE: 16,
  PASSWORD_MIN_LENGTH: 8,
  PASSWORD_MAX_LENGTH: 128,
  EMAIL_MAX_LENGTH: 254,
  NAME_MAX_LENGTH: 50,
  TEXT_MAX_LENGTH: 100,
  EMAIL_REGEX: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE_REGEX: /^[0-9]{10}$/,
  PASSWORD_REGEX: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/,
} as const;

const ERROR_MESSAGES = {
  EMAIL_INVALID: "Email invalide",
  EMAIL_TOO_LONG: "Email trop long",
  PASSWORD_TOO_SHORT: "Le mot de passe doit contenir au moins 8 caractères",
  PASSWORD_TOO_LONG: "Mot de passe trop long",
  PASSWORD_WEAK: "Mot de passe trop faible (minuscule, majuscule, chiffre requis)",
  PASSWORD_MISMATCH: "Les mots de passe ne correspondent pas",
  AGE_RESTRICTION: "Tu dois avoir au moins 16 ans pour utiliser Blyss",
  PHONE_INVALID: "Numéro de téléphone invalide",
  NAME_TOO_LONG: "Nom trop long",
  SIGNUP_FAILED: "Erreur lors de la création du compte",
  NETWORK_ERROR: "Erreur de connexion. Vérifie ta connexion internet.",
} as const;

const Signup = forwardRef<HTMLDivElement>((_, ref) => {
  const navigate = useNavigate();
  const { signup, isLoading } = useAuth();

  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<FormData>({
    role: "client",
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

  // ✅ Formatage du téléphone sécurisé [web:106][web:107]
  const formatPhoneNumber = useCallback((value: string): string => {
    const digits = value.replace(/\D/g, "").slice(0, VALIDATION.PHONE_LENGTH);
    return digits.replace(/(\d{2})(?=\d)/g, "$1 ");
  }, []);

  // ✅ Calcul de l'âge sécurisé [web:106]
  const getAgeFromBirthDate = useCallback((birthDate: string): number => {
    if (!birthDate) return 0;

    const today = new Date();
    const birth = new Date(birthDate);

    if (isNaN(birth.getTime())) return 0;

    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }

    return age;
  }, []);

  // ✅ Validation email sécurisée [web:106]
  const validateEmail = useCallback((email: string): boolean => {
    const trimmed = email.trim();
    return (
      trimmed.length > 0 &&
      trimmed.length <= VALIDATION.EMAIL_MAX_LENGTH &&
      VALIDATION.EMAIL_REGEX.test(trimmed)
    );
  }, []);

  // ✅ Validation mot de passe fort [web:106]
  const validatePassword = useCallback((password: string): string | null => {
    if (password.length < VALIDATION.PASSWORD_MIN_LENGTH) {
      return ERROR_MESSAGES.PASSWORD_TOO_SHORT;
    }

    if (password.length > VALIDATION.PASSWORD_MAX_LENGTH) {
      return ERROR_MESSAGES.PASSWORD_TOO_LONG;
    }

    if (!VALIDATION.PASSWORD_REGEX.test(password)) {
      return ERROR_MESSAGES.PASSWORD_WEAK;
    }

    return null;
  }, []);

  // ✅ Validation téléphone [web:106]
  const validatePhone = useCallback((phone: string): boolean => {
    const cleaned = phone.replace(/\s/g, "");
    return VALIDATION.PHONE_REGEX.test(cleaned);
  }, []);

  // ✅ Sanitization des entrées [web:106]
  const sanitizeInput = useCallback((value: string, maxLength: number): string => {
    return value
      .trim()
      .slice(0, maxLength)
      .replace(/[<>]/g, "");
  }, []);

  // ✅ Mise à jour du formulaire [web:102][web:104]
  const updateFormData = useCallback((updates: Partial<FormData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
    setError("");
  }, []);

  // ✅ Toggle password visibility [web:107]
  const togglePasswordVisibility = useCallback(() => {
    setShowPassword(prev => !prev);
  }, []);

  // ✅ Navigation arrière sécurisée [web:102][web:104]
  const handleBack = useCallback(() => {
    if (step === 1) {
      navigate("/", { replace: true });
    } else {
      setStep(prev => prev - 1);
      setError("");
    }
  }, [step, navigate]);

  // ✅ Validation de l'étape courante [web:102][web:104]
  const isStepValid = useCallback((): boolean => {
    switch (step) {
      case 1:
        return true;
      case 2:
        return (
          formData.firstName.trim().length > 0 &&
          formData.lastName.trim().length > 0 &&
          formData.firstName.length <= VALIDATION.NAME_MAX_LENGTH &&
          formData.lastName.length <= VALIDATION.NAME_MAX_LENGTH
        );
      case 3:
        return validatePhone(formData.phone);
      case 4:
        return validateEmail(formData.email);
      case 5:
        return (
          !!formData.birthDate &&
          getAgeFromBirthDate(formData.birthDate) >= VALIDATION.MIN_AGE
        );
      case 6:
      case 7:
      case 8:
      case 9:
        return true;
      default:
        return false;
    }
  }, [step, formData, validatePhone, validateEmail, getAgeFromBirthDate]);

  // ✅ Navigation et soumission [web:102][web:104][web:105]
  const handleNext = useCallback(async () => {
    setError("");

    // Validation email (step 4)
    if (step === 4) {
      if (!validateEmail(formData.email)) {
        setError(ERROR_MESSAGES.EMAIL_INVALID);
        return;
      }
    }

    // Validation âge (step 5)
    if (step === 5) {
      const age = getAgeFromBirthDate(formData.birthDate);
      if (age < VALIDATION.MIN_AGE) {
        setError(ERROR_MESSAGES.AGE_RESTRICTION);
        return;
      }
    }

    const isClientLastStep = formData.role === "client" && step === 6;
    const isProLastStep = formData.role === "pro" && step === 9;

    // ✅ Validation finale et soumission
    if (isClientLastStep || isProLastStep) {
      if (formData.password !== formData.confirmPassword) {
        setError(ERROR_MESSAGES.PASSWORD_MISMATCH);
        return;
      }

      const passwordError = validatePassword(formData.password);
      if (passwordError) {
        setError(passwordError);
        return;
      }

      try {
        const payload = {
          first_name: sanitizeInput(formData.firstName, VALIDATION.NAME_MAX_LENGTH),
          last_name: sanitizeInput(formData.lastName, VALIDATION.NAME_MAX_LENGTH),
          email: formData.email.trim().toLowerCase(),
          password: formData.password,
          phone_number: formData.phone.replace(/\s/g, ""),
          birth_date: formData.birthDate,
          role: formData.role,
          activity_name:
            formData.role === "pro" && formData.activityName.trim()
              ? sanitizeInput(formData.activityName, VALIDATION.TEXT_MAX_LENGTH)
              : null,
          city:
            formData.role === "pro" && formData.city.trim()
              ? sanitizeInput(formData.city, VALIDATION.TEXT_MAX_LENGTH)
              : null,
          instagram_account:
            formData.role === "pro" && formData.instagramAccount.trim()
              ? sanitizeInput(formData.instagramAccount, VALIDATION.TEXT_MAX_LENGTH)
              : null,
        };

        const response = await signup(payload);

        if (response.success) {
          toast.success("Compte créé avec succès !");

          const targetRoute = formData.role === "pro"
            ? "/pro/new-subscription"
            : "/client";

          setTimeout(() => {
            navigate(targetRoute, { replace: true });
          }, 300);
        } else {
          // ✅ Gestion des erreurs [web:105][web:108]
          switch (response.error) {
            case "email_exists":
              setError("Cet email est déjà utilisé");
              toast.error("Cet email est déjà utilisé");
              break;
            case "weak_password":
              setError("Mot de passe trop faible");
              toast.error("Le mot de passe doit contenir minuscule, majuscule et chiffre");
              break;
            case "age_restriction":
              setError("Tu dois avoir au moins 16 ans");
              toast.error("Tu dois avoir au moins 16 ans pour utiliser Blyss");
              break;
            case "invalid_phone":
              setError("Numéro de téléphone invalide");
              toast.error("Format de téléphone invalide");
              break;
            case "invalid_email":
              setError("Email invalide");
              toast.error("Format d'email invalide");
              break;
            case "missing_fields":
              setError("Champs obligatoires manquants");
              toast.error("Veuillez remplir tous les champs obligatoires");
              break;
            case "data_too_long":
              setError("Un ou plusieurs champs sont trop longs");
              toast.error("Informations trop longues");
              break;
            default:
              setError(response.message || ERROR_MESSAGES.SIGNUP_FAILED);
              toast.error(response.message || "Une erreur est survenue");
          }
        }
      } catch (error) {
        console.error("Signup error:", error);
        setError(ERROR_MESSAGES.NETWORK_ERROR);
        toast.error("Erreur de connexion. Vérifie ta connexion internet.");
      }

      return;
    }

    // Étape suivante
    setStep(prev => prev + 1);
  }, [
    step,
    formData,
    validateEmail,
    validatePassword,
    getAgeFromBirthDate,
    sanitizeInput,
    signup,
    navigate,
  ]);

  // ✅ Rendu des étapes
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

          <div className="space-y-4" role="radiogroup" aria-label="Type de compte">
            <button
              type="button"
              onClick={() => updateFormData({ role: "client" })}
              role="radio"
              aria-checked={formData.role === "client"}
              className={`
                w-full flex items-center gap-4 rounded-2xl px-5 py-5 border-2 
                transition-all duration-300 text-left
                ${formData.role === "client"
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
                  ${formData.role === "client"
                    ? "border-primary bg-primary"
                    : "border-muted-foreground/40"
                  }
                `}
                aria-hidden="true"
              >
                {formData.role === "client" && (
                  <div className="w-2.5 h-2.5 rounded-full bg-white animate-in zoom-in duration-200" />
                )}
              </div>
            </button>

            <button
              type="button"
              onClick={() => updateFormData({ role: "pro" })}
              role="radio"
              aria-checked={formData.role === "pro"}
              className={`
                w-full flex items-center gap-4 rounded-2xl px-5 py-5 border-2 
                transition-all duration-300 text-left
                ${formData.role === "pro"
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
                  ${formData.role === "pro"
                    ? "border-primary bg-primary"
                    : "border-muted-foreground/40"
                  }
                `}
                aria-hidden="true"
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
              id="firstName"
              type="text"
              value={formData.firstName}
              onChange={(e) => updateFormData({ firstName: e.target.value })}
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
              maxLength={VALIDATION.NAME_MAX_LENGTH}
              autoComplete="given-name"
              aria-label="Prénom"
              aria-required="true"
            />
            <input
              id="lastName"
              type="text"
              value={formData.lastName}
              onChange={(e) => updateFormData({ lastName: e.target.value })}
              className="
                w-full h-14 px-4 rounded-2xl 
                bg-card border-2 border-muted
                text-foreground placeholder:text-muted-foreground/50
                focus:outline-none focus:border-primary focus:scale-[1.02]
                transition-all duration-300
              "
              placeholder="Nom"
              disabled={isLoading}
              maxLength={VALIDATION.NAME_MAX_LENGTH}
              autoComplete="family-name"
              aria-label="Nom"
              aria-required="true"
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
            id="phone"
            type="tel"
            value={formData.phone}
            onChange={(e) => {
              const formatted = formatPhoneNumber(e.target.value);
              updateFormData({ phone: formatted });
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
            autoComplete="tel"
            inputMode="numeric"
            aria-label="Numéro de téléphone"
            aria-required="true"
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
            id="email"
            type="email"
            value={formData.email}
            onChange={(e) => updateFormData({ email: e.target.value })}
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
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck="false"
            maxLength={VALIDATION.EMAIL_MAX_LENGTH}
            aria-label="Email"
            aria-required="true"
            aria-invalid={!!error}
          />
          {error && (
            <p
              className="text-destructive text-sm mt-3 animate-in slide-in-from-top-2 duration-200"
              role="alert"
              aria-live="polite"
            >
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
            id="birthDate"
            type="date"
            value={formData.birthDate}
            onChange={(e) => updateFormData({ birthDate: e.target.value })}
            className="
              w-full h-14 px-4 rounded-2xl 
              bg-card border-2 border-muted
              text-foreground
              focus:outline-none focus:border-primary focus:scale-[1.02]
              transition-all duration-300
            "
            autoFocus
            disabled={isLoading}
            max={new Date().toISOString().split('T')[0]}
            autoComplete="bday"
            aria-label="Date de naissance"
            aria-required="true"
            aria-invalid={!!error}
          />

          {error && (
            <p
              className="text-destructive text-sm mt-3 animate-in slide-in-from-top-2 duration-200"
              role="alert"
              aria-live="polite"
            >
              {error}
            </p>
          )}
        </div>
      );
    }

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
                id="password"
                type={showPassword ? "text" : "password"}
                value={formData.password}
                onChange={(e) => updateFormData({ password: e.target.value })}
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
                autoComplete="new-password"
                maxLength={VALIDATION.PASSWORD_MAX_LENGTH}
                aria-label="Mot de passe"
                aria-required="true"
                aria-describedby="password-hint"
              />
              <button
                type="button"
                onClick={togglePasswordVisibility}
                className="
                  absolute right-4 top-1/2 -translate-y-1/2 
                  text-muted-foreground hover:text-primary
                  p-1 rounded-lg hover:bg-muted/50
                  transition-all active:scale-90
                "
                aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
              </button>
            </div>
            <p id="password-hint" className="text-xs text-muted-foreground">
              1 minuscule, 1 majuscule, 1 chiffre minimum
            </p>
            <input
              id="confirmPassword"
              type={showPassword ? "text" : "password"}
              value={formData.confirmPassword}
              onChange={(e) => updateFormData({ confirmPassword: e.target.value })}
              className="
                w-full h-14 px-4 rounded-2xl 
                bg-card border-2 border-muted
                text-foreground placeholder:text-muted-foreground/50
                focus:outline-none focus:border-primary focus:scale-[1.02]
                transition-all duration-300
              "
              placeholder="Confirmer le mot de passe"
              disabled={isLoading}
              autoComplete="new-password"
              maxLength={VALIDATION.PASSWORD_MAX_LENGTH}
              aria-label="Confirmer le mot de passe"
              aria-required="true"
            />
            {error && (
              <p
                className="text-destructive text-sm animate-in slide-in-from-top-2 duration-200"
                role="alert"
                aria-live="polite"
              >
                {error}
              </p>
            )}
          </div>
        </div>
      );
    }

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
              id="activityName"
              type="text"
              value={formData.activityName}
              onChange={(e) => updateFormData({ activityName: e.target.value })}
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
              maxLength={VALIDATION.TEXT_MAX_LENGTH}
              autoComplete="organization"
              aria-label="Nom de l'activité"
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
              id="city"
              type="text"
              value={formData.city}
              onChange={(e) => updateFormData({ city: e.target.value })}
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
              maxLength={VALIDATION.TEXT_MAX_LENGTH}
              autoComplete="address-level2"
              aria-label="Ville"
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
              id="instagram"
              type="text"
              value={formData.instagramAccount}
              onChange={(e) => updateFormData({ instagramAccount: e.target.value })}
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
              maxLength={VALIDATION.TEXT_MAX_LENGTH}
              autoComplete="off"
              aria-label="Compte Instagram"
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
                  id="password-pro"
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={(e) => updateFormData({ password: e.target.value })}
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
                  autoComplete="new-password"
                  maxLength={VALIDATION.PASSWORD_MAX_LENGTH}
                  aria-label="Mot de passe"
                  aria-required="true"
                  aria-describedby="password-hint-pro"
                />
                <button
                  type="button"
                  onClick={togglePasswordVisibility}
                  className="
                    absolute right-4 top-1/2 -translate-y-1/2 
                    text-muted-foreground hover:text-primary
                    p-1 rounded-lg hover:bg-muted/50
                    transition-all active:scale-90
                  "
                  aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
                </button>
              </div>
              <p id="password-hint-pro" className="text-xs text-muted-foreground">
                1 minuscule, 1 majuscule, 1 chiffre minimum
              </p>
              <input
                id="confirmPassword-pro"
                type={showPassword ? "text" : "password"}
                value={formData.confirmPassword}
                onChange={(e) => updateFormData({ confirmPassword: e.target.value })}
                className="
                  w-full h-14 px-4 rounded-2xl 
                  bg-card border-2 border-muted
                  text-foreground placeholder:text-muted-foreground/50
                  focus:outline-none focus:border-primary focus:scale-[1.02]
                  transition-all duration-300
                "
                placeholder="Confirmer le mot de passe"
                disabled={isLoading}
                autoComplete="new-password"
                maxLength={VALIDATION.PASSWORD_MAX_LENGTH}
                aria-label="Confirmer le mot de passe"
                aria-required="true"
              />
              {error && (
                <p
                  className="text-destructive text-sm animate-in slide-in-from-top-2 duration-200"
                  role="alert"
                  aria-live="polite"
                >
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
              aria-label={step === 1 ? "Retour à l'accueil" : "Étape précédente"}
            >
              <ArrowLeft size={24} className="text-foreground" aria-hidden="true" />
            </button>
            <div
              className="flex-1 h-2 rounded-full bg-muted overflow-hidden"
              role="progressbar"
              aria-valuenow={step}
              aria-valuemin={1}
              aria-valuemax={totalSteps}
              aria-label={`Étape ${step} sur ${totalSteps}`}
            >
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

        <div className="flex-1 flex items-center justify-center px-6 pt-24 pb-28">
          {renderStep()}
        </div>

        {step !== 1 && (
          <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg px-6 pb-6 pt-4 bg-gradient-to-t from-background via-background to-transparent">
            <button
              onClick={handleNext}
              disabled={!isStepValid() || isLoading}
              aria-busy={isLoading}
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
