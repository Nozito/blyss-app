import MobileLayout from "@/components/MobileLayout";
import { ChevronLeft, Check, AlertCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { toast } from "sonner";

const ProSettings = () => {
  const navigate = useNavigate();

  // Infos pro
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [activityName, setActivityName] = useState("");
  const [city, setCity] = useState("");
  const [instagramAccount, setInstagramAccount] = useState("");

  const [initialFirstName, setInitialFirstName] = useState("");
  const [initialLastName, setInitialLastName] = useState("");
  const [initialActivityName, setInitialActivityName] = useState("");
  const [initialCity, setInitialCity] = useState("");
  const [initialInstagramAccount, setInitialInstagramAccount] = useState("");

  // Sécurité
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");

  // UX states
  const [fieldErrors, setFieldErrors] = useState<{ [key: string]: string }>({});
  const [touched, setTouched] = useState<{ [key: string]: boolean }>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState<"weak" | "medium" | "strong" | null>(null);

  useEffect(() => {
    const fetchUserData = async () => {
      setIsLoading(true);
      try {
        const token = localStorage.getItem("auth_token");
        if (!token) return;

        const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
        const response = await fetch(`${BASE_URL}/api/users`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const data = await response.json();

        setActivityName(data.data.activity_name || "");
        setFirstName(data.data.first_name || "");
        setLastName(data.data.last_name || "");
        setCity(data.data.city || "");
        setInstagramAccount(data.data.instagram_account || "");

        setInitialActivityName(data.data.activity_name || "");
        setInitialFirstName(data.data.first_name || "");
        setInitialLastName(data.data.last_name || "");
        setInitialCity(data.data.city || "");
        setInitialInstagramAccount(data.data.instagram_account || "");
      } catch (error) {
        toast.error("Impossible de charger tes données");
      } finally {
        setIsLoading(false);
      }
    };
    fetchUserData();
  }, []);

  // Détection des changements
  useEffect(() => {
    const changed = 
      firstName !== initialFirstName ||
      lastName !== initialLastName ||
      activityName !== initialActivityName ||
      city !== initialCity ||
      instagramAccount !== initialInstagramAccount ||
      !!currentPassword || !!newPassword || !!newPasswordConfirm;
    setHasChanges(changed);
  }, [firstName, lastName, activityName, city, instagramAccount, currentPassword, newPassword, newPasswordConfirm]);

  // Validation en temps réel du mot de passe
  useEffect(() => {
    if (!newPassword) {
      setPasswordStrength(null);
      return;
    }

    const hasLength = newPassword.length >= 8;
    const hasUpper = /[A-Z]/.test(newPassword);
    const hasLower = /[a-z]/.test(newPassword);
    const hasDigit = /\d/.test(newPassword);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(newPassword);

    const score = [hasLength, hasUpper, hasLower, hasDigit, hasSpecial].filter(Boolean).length;

    if (score <= 2) setPasswordStrength("weak");
    else if (score <= 4) setPasswordStrength("medium");
    else setPasswordStrength("strong");
  }, [newPassword]);

  const validatePassword = (pwd: string) => {
    const hasLength = pwd.length >= 8;
    const hasUpper = /[A-Z]/.test(pwd);
    const hasDigit = /\d/.test(pwd);
    return hasLength && hasUpper && hasDigit;
  };

  // Validation individuelle des champs
  const validateField = (name: string, value: string) => {
    const errors: { [key: string]: string } = { ...fieldErrors };

    switch (name) {
      case "activityName":
        if (value && value.length < 2) {
          errors[name] = "Le nom doit contenir au moins 2 caractères";
        } else {
          delete errors[name];
        }
        break;
      case "firstName":
      case "lastName":
        if (value && value.length < 2) {
          errors[name] = "Doit contenir au moins 2 caractères";
        } else {
          delete errors[name];
        }
        break;
      case "instagramAccount":
        if (value && !value.startsWith("@")) {
          errors[name] = "Le compte doit commencer par @";
        } else {
          delete errors[name];
        }
        break;
      case "currentPassword":
        if ((newPassword || newPasswordConfirm) && !value) {
          errors[name] = "Requis pour changer le mot de passe";
        } else {
          delete errors[name];
        }
        break;
      case "newPassword":
        if (value && !validatePassword(value)) {
          errors[name] = "8 caractères min, 1 majuscule, 1 chiffre";
        } else if (value && value === currentPassword) {
          errors[name] = "Doit être différent de l'ancien";
        } else {
          delete errors[name];
        }
        break;
      case "newPasswordConfirm":
        if (value && value !== newPassword) {
          errors[name] = "Les mots de passe ne correspondent pas";
        } else {
          delete errors[name];
        }
        break;
    }

    setFieldErrors(errors);
  };

  const handleBlur = (name: string, value: string) => {
    setTouched({ ...touched, [name]: true });
    validateField(name, value);
  };

  const handleSave = async () => {
    // Validation finale
    const errors: { [key: string]: string } = {};

    if (newPassword || newPasswordConfirm || currentPassword) {
      if (!currentPassword) {
        errors.currentPassword = "Renseigne ton ancien mot de passe";
      }
      if (!validatePassword(newPassword)) {
        errors.newPassword = "8 caractères min, 1 majuscule, 1 chiffre";
      }
      if (newPassword !== newPasswordConfirm) {
        errors.newPasswordConfirm = "Les mots de passe ne correspondent pas";
      }
      if (newPassword && newPassword === currentPassword) {
        errors.newPassword = "Doit être différent de l'ancien";
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      toast.error("Corrige les erreurs avant d'enregistrer");
      return;
    }

    setIsSaving(true);

    const payload: any = {};
    if (firstName !== initialFirstName) payload.first_name = firstName;
    if (lastName !== initialLastName) payload.last_name = lastName;
    if (activityName !== initialActivityName) payload.activity_name = activityName;
    if (city !== initialCity) payload.city = city;
    if (instagramAccount !== initialInstagramAccount) payload.instagram_account = instagramAccount;
    if (currentPassword && newPassword) {
      payload.currentPassword = currentPassword;
      payload.newPassword = newPassword;
    }

    try {
      const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
      const response = await fetch(`${BASE_URL}/api/users/update`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        toast.error(errorData.message || "Une erreur est survenue");
        return;
      }

      const result = await response.json();
      if (result?.data) {
        localStorage.setItem("user", JSON.stringify(result.data));
        
        // Mise à jour des valeurs initiales
        setInitialFirstName(result.data.first_name || "");
        setInitialLastName(result.data.last_name || "");
        setInitialActivityName(result.data.activity_name || "");
        setInitialCity(result.data.city || "");
        setInitialInstagramAccount(result.data.instagram_account || "");
      }

      toast.success("Profil mis à jour avec succès !");
      setCurrentPassword("");
      setNewPassword("");
      setNewPasswordConfirm("");
      setPasswordStrength(null);
      setHasChanges(false);
    } catch (error) {
      toast.error("Une erreur réseau est survenue");
    } finally {
      setIsSaving(false);
    }
  };

  const handleForgotPassword = () => {
    navigate("/forgot-password");
  };

  // Composant Input avec animations
  const InputField = ({
    label,
    name,
    type = "text",
    value,
    onChange,
    placeholder,
    helpText,
  }: {
    label: string;
    name: string;
    type?: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    helpText?: string;
  }) => {
    const error = touched[name] && fieldErrors[name];
    const hasValue = value.length > 0;

    return (
      <div className="flex flex-col relative">
        <label className="text-xs text-muted-foreground mb-1 transition-colors">
          {label}
        </label>
        <div className="relative">
          <input
            type={type}
            autoComplete={type === "password" ? "current-password" : "off"}
            className={`
              border rounded-xl px-3 h-11 w-full text-sm bg-background
              transition-all duration-200 ease-out
              focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary
              ${error ? "border-destructive focus:ring-destructive/20" : "border-muted"}
              ${hasValue ? "pl-3" : ""}
            `}
            placeholder={placeholder}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              if (touched[name]) validateField(name, e.target.value);
            }}
            onBlur={(e) => handleBlur(name, e.target.value)}
          />
          {hasValue && !error && (
            <Check 
              size={16} 
              className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500 animate-in fade-in zoom-in duration-200" 
            />
          )}
          {error && (
            <AlertCircle 
              size={16} 
              className="absolute right-3 top-1/2 -translate-y-1/2 text-destructive animate-in fade-in zoom-in duration-200" 
            />
          )}
        </div>
        {error && (
          <p className="mt-1 text-[11px] text-destructive animate-in slide-in-from-top-1 duration-200">
            {error}
          </p>
        )}
        {helpText && !error && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            {helpText}
          </p>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <MobileLayout showNav={false}>
        <div className="flex items-center justify-center h-screen">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout showNav={false}>
      <div className="py-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center mb-2">
          <button
            onClick={() => navigate("/pro/profile")}
            className="p-2 hover:bg-muted/50 rounded-lg transition-colors active:scale-95"
          >
            <ChevronLeft size={24} className="text-foreground" />
          </button>
          <h1 className="font-display text-2xl font-semibold text-foreground ml-2">
            Paramètres pro
          </h1>
        </div>
        <p className="text-muted-foreground text-sm mb-5">
          Gère ton profil, ton activité et ta sécurité sur Blyss.
        </p>

        {/* SECTION : Profil pro */}
        <div className="space-y-4 mb-6 animate-in slide-in-from-bottom-4 duration-300">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
            Profil pro
          </h2>

          <div className="blyss-card flex flex-col gap-4">
            <InputField
              label="Nom de ton activité"
              name="activityName"
              value={activityName}
              onChange={setActivityName}
              placeholder={initialActivityName || "Ex : Nails by Emma"}
            />

            <InputField
              label="Ton prénom"
              name="firstName"
              value={firstName}
              onChange={setFirstName}
              placeholder={initialFirstName || "Ex : Emma"}
            />

            <InputField
              label="Ton nom"
              name="lastName"
              value={lastName}
              onChange={setLastName}
              placeholder={initialLastName || "Ex : Bernard"}
            />
          </div>
        </div>

        {/* SECTION : Localisation & réseaux */}
        <div className="space-y-4 mb-6 animate-in slide-in-from-bottom-4 duration-300 delay-75">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
            Localisation & réseaux
          </h2>

          <div className="blyss-card flex flex-col gap-4">
            <InputField
              label="Ville / zone"
              name="city"
              value={city}
              onChange={setCity}
              placeholder={initialCity || "Ex : Paris 11e, Lyon centre..."}
            />

            <InputField
              label="Instagram (optionnel)"
              name="instagramAccount"
              value={instagramAccount}
              onChange={setInstagramAccount}
              placeholder={initialInstagramAccount || "@toncompte"}
              helpText="Ton compte pourra être affiché sur ton profil Blyss."
            />
          </div>
        </div>

        {/* SECTION : Sécurité */}
        <div className="space-y-4 mb-6 animate-in slide-in-from-bottom-4 duration-300 delay-150">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
            Sécurité
          </h2>

          <div className="blyss-card flex flex-col gap-4">
            <InputField
              label="Ancien mot de passe"
              name="currentPassword"
              type="password"
              value={currentPassword}
              onChange={setCurrentPassword}
              placeholder="Ton mot de passe actuel"
            />

            <div className="space-y-2">
              <InputField
                label="Nouveau mot de passe"
                name="newPassword"
                type="password"
                value={newPassword}
                onChange={setNewPassword}
                placeholder="Nouveau mot de passe"
              />
              
              {/* Indicateur de force du mot de passe */}
              {passwordStrength && (
                <div className="animate-in slide-in-from-top-1 duration-200">
                  <div className="flex gap-1 mb-1">
                    <div className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                      passwordStrength === "weak" ? "bg-red-500" :
                      passwordStrength === "medium" ? "bg-orange-500" :
                      "bg-green-500"
                    }`} />
                    <div className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                      passwordStrength === "medium" || passwordStrength === "strong" ? 
                      (passwordStrength === "medium" ? "bg-orange-500" : "bg-green-500") :
                      "bg-muted"
                    }`} />
                    <div className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                      passwordStrength === "strong" ? "bg-green-500" : "bg-muted"
                    }`} />
                  </div>
                  <p className={`text-[11px] ${
                    passwordStrength === "weak" ? "text-red-500" :
                    passwordStrength === "medium" ? "text-orange-500" :
                    "text-green-500"
                  }`}>
                    {passwordStrength === "weak" && "Mot de passe faible"}
                    {passwordStrength === "medium" && "Mot de passe moyen"}
                    {passwordStrength === "strong" && "Mot de passe fort"}
                  </p>
                </div>
              )}
            </div>

            <InputField
              label="Confirme le nouveau mot de passe"
              name="newPasswordConfirm"
              type="password"
              value={newPasswordConfirm}
              onChange={setNewPasswordConfirm}
              placeholder="Répète le nouveau mot de passe"
              helpText="Ton mot de passe doit contenir au moins 8 caractères, une majuscule et un chiffre."
            />

            <button
              type="button"
              onClick={handleForgotPassword}
              className="self-start text-xs text-primary hover:underline active:opacity-80 transition-opacity"
            >
              Mot de passe oublié ?
            </button>
          </div>
        </div>

        {/* Bouton Enregistrer avec animation */}
        <button
          onClick={handleSave}
          disabled={!hasChanges || isSaving}
          className={`
            w-full py-3 rounded-xl font-medium mt-2 
            transition-all duration-200 ease-out
            ${hasChanges && !isSaving
              ? "gradient-gold text-secondary-foreground active:scale-[0.98] shadow-md hover:shadow-lg"
              : "bg-muted text-muted-foreground cursor-not-allowed"
            }
          `}
        >
          {isSaving ? (
            <span className="flex items-center justify-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
              Enregistrement...
            </span>
          ) : (
            "Enregistrer les modifications"
          )}
        </button>
      </div>
    </MobileLayout>
  );
};

export default ProSettings;
