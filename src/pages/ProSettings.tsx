import MobileLayout from "@/components/MobileLayout";
import { ChevronLeft, Check, AlertCircle, Eye, EyeOff, Save, Download, Trash2, Shield } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { usersApi, authApi } from "@/services/api";

// ── Hissé hors du composant pour éviter le remount à chaque frappe ──
interface SettingsInputFieldProps {
  label: string;
  name: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  helpText?: string;
  showPassword?: boolean;
  onTogglePassword?: () => void;
  isTouched?: boolean;
  error?: string;
  onBlur: (name: string, value: string) => void;
  onValidate: (name: string, value: string) => void;
}

const SettingsInputField = ({
  label, name, type = "text", value, onChange, placeholder, helpText,
  showPassword, onTogglePassword, isTouched, error, onBlur, onValidate,
}: SettingsInputFieldProps) => {
  const hasValue = value.length > 0;
  const isPassword = type === "password";

  return (
    <div className="flex flex-col relative animate-slide-up">
      <label className={`text-xs font-medium mb-2 transition-colors duration-200 ${
        error ? "text-destructive" : hasValue ? "text-primary" : "text-muted-foreground"
      }`}>
        {label}
      </label>
      <div className="relative group">
        <input
          type={isPassword && !showPassword ? "password" : "text"}
          autoComplete={type === "password" ? "current-password" : "off"}
          className={`
            border-2 rounded-2xl px-4 h-12 w-full text-sm bg-background
            transition-all duration-300 ease-out
            focus:outline-none focus:ring-4 focus:scale-[1.02]
            ${error
              ? "border-destructive focus:ring-destructive/10 focus:border-destructive"
              : hasValue
              ? "border-primary/30 focus:ring-primary/10 focus:border-primary"
              : "border-muted focus:ring-primary/10 focus:border-primary/50"
            }
            ${isPassword ? "pr-20" : "pr-10"}
          `}
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            if (isTouched) onValidate(name, e.target.value);
          }}
          onBlur={(e) => onBlur(name, e.target.value)}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
          {isPassword && onTogglePassword && (
            <button
              type="button"
              onClick={onTogglePassword}
              className="p-1 hover:bg-muted rounded-lg transition-colors active:scale-95"
            >
              {showPassword
                ? <EyeOff size={18} className="text-muted-foreground" />
                : <Eye size={18} className="text-muted-foreground" />
              }
            </button>
          )}
          {!isPassword && hasValue && !error && (
            <div className="w-6 h-6 rounded-full bg-green-500/10 flex items-center justify-center animate-in zoom-in duration-200">
              <Check size={14} className="text-green-600" />
            </div>
          )}
          {error && (
            <div className="w-6 h-6 rounded-full bg-destructive/10 flex items-center justify-center animate-in zoom-in duration-200">
              <AlertCircle size={14} className="text-destructive" />
            </div>
          )}
        </div>
      </div>
      {error && (
        <div className="mt-2 flex items-start gap-2 animate-in slide-in-from-top-1 duration-200">
          <AlertCircle size={14} className="text-destructive mt-0.5 flex-shrink-0" />
          <p className="text-xs text-destructive leading-relaxed">{error}</p>
        </div>
      )}
      {helpText && !error && (
        <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{helpText}</p>
      )}
    </div>
  );
};

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
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // UX states
  const [fieldErrors, setFieldErrors] = useState<{ [key: string]: string }>({});
  const [touched, setTouched] = useState<{ [key: string]: boolean }>({});
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const [isExporting, setIsExporting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleExportData = async () => {
    setIsExporting(true);
    try {
      await authApi.exportData();
      toast.success("Tes données ont été téléchargées");
    } catch {
      toast.error("Impossible d'exporter tes données");
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      const res = await authApi.deleteAccount();
      if (res.success) {
        toast.success("Compte supprimé");
        await authApi.logout();
        navigate("/");
      } else {
        toast.error("Impossible de supprimer le compte");
      }
    } catch {
      toast.error("Une erreur est survenue");
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };
  const [passwordStrength, setPasswordStrength] = useState<"weak" | "medium" | "strong" | null>(null);

  const { isLoading } = useQuery({
    queryKey: ["pro-settings-user"],
    queryFn: async () => {
      const res = await usersApi.getMe();
      if (!res.success || !res.data) throw new Error("Impossible de charger tes données");
      const d = res.data as any;
      setFirstName(d.first_name || "");
      setLastName(d.last_name || "");
      setActivityName(d.activity_name || "");
      setCity(d.city || "");
      setInstagramAccount(d.instagram_account || "");
      setInitialFirstName(d.first_name || "");
      setInitialLastName(d.last_name || "");
      setInitialActivityName(d.activity_name || "");
      setInitialCity(d.city || "");
      setInitialInstagramAccount(d.instagram_account || "");
      return d;
    },
    staleTime: 60_000,
    retry: 1,
  });

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
      const result = await usersApi.update(payload);

      if (!result.success) {
        toast.error(result.error || "Une erreur est survenue");
        return;
      }

      if (result.data) {
        const d = result.data as any;
        setInitialFirstName(d.first_name || "");
        setInitialLastName(d.last_name || "");
        setInitialActivityName(d.activity_name || "");
        setInitialCity(d.city || "");
        setInitialInstagramAccount(d.instagram_account || "");
      }

      toast.success("Profil mis à jour avec succès !");
      setCurrentPassword("");
      setNewPassword("");
      setNewPasswordConfirm("");
      setPasswordStrength(null);
      setHasChanges(false);
      setTouched({});
    } catch (error) {
      toast.error("Une erreur réseau est survenue");
    } finally {
      setIsSaving(false);
    }
  };

  const handleForgotPassword = () => {
    navigate("/forgot-password");
  };


  if (isLoading) {
    return (
      <MobileLayout showNav={false}>
        <div className="flex flex-col items-center justify-center h-screen">
          <div className="w-16 h-16 rounded-full border-4 border-primary/20 border-t-primary animate-spin mb-4"></div>
          <p className="text-sm text-muted-foreground animate-pulse">Chargement de tes données...</p>
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout showNav={false}>
      <div className="min-h-screen py-6">
        {/* Header */}
        <div className="relative -mx-4 px-4 pt-2 pb-6 mb-6 animate-fade-in">
          <div className="flex items-center mb-3">
            <button
              onClick={() => navigate("/pro/dashboard")}
              className="w-10 h-10 rounded-xl bg-muted hover:bg-muted-foreground/10 flex items-center justify-center active:scale-95 transition-all mr-3"
            >
              <ChevronLeft size={20} className="text-foreground" />
            </button>
            <div className="flex-1">
              <h1 className="font-display text-2xl font-bold text-foreground">
                Paramètres pro
              </h1>
            </div>
          </div>
          <p className="text-muted-foreground text-sm animate-fade-in" style={{ animationDelay: "0.1s" }}>
            Gère ton profil, ton activité et ta sécurité sur Blyss.
          </p>
        </div>

        {/* Badge de modifications en attente */}
        {hasChanges && (
          <div className="blyss-card mb-6 bg-primary/5 border-2 border-primary/20 animate-in slide-in-from-top-2 duration-300">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <AlertCircle size={18} className="text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">
                  Modifications non enregistrées
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  N'oublie pas de sauvegarder tes changements
                </p>
              </div>
            </div>
          </div>
        )}

        {/* SECTION : Profil pro */}
        <div className="space-y-4 mb-6 animate-slide-up" style={{ animationDelay: "0.1s" }}>
          <div className="flex items-center gap-2 px-1">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Profil pro
            </h2>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
          </div>

          <div className="blyss-card flex flex-col gap-5 hover:shadow-lg transition-shadow duration-300">
            <SettingsInputField
              label="Nom de ton activité"
              name="activityName"
              value={activityName}
              onChange={setActivityName}
              placeholder={initialActivityName || "Ex : Nails by Emma"}
              isTouched={touched.activityName}
              error={fieldErrors.activityName}
              onBlur={handleBlur}
              onValidate={validateField}
            />

            <SettingsInputField
              label="Ton prénom"
              name="firstName"
              value={firstName}
              onChange={setFirstName}
              placeholder={initialFirstName || "Ex : Emma"}
              isTouched={touched.firstName}
              error={fieldErrors.firstName}
              onBlur={handleBlur}
              onValidate={validateField}
            />

            <SettingsInputField
              label="Ton nom"
              name="lastName"
              value={lastName}
              onChange={setLastName}
              placeholder={initialLastName || "Ex : Bernard"}
              isTouched={touched.lastName}
              error={fieldErrors.lastName}
              onBlur={handleBlur}
              onValidate={validateField}
            />
          </div>
        </div>

        {/* SECTION : Localisation & réseaux */}
        <div className="space-y-4 mb-6 animate-slide-up" style={{ animationDelay: "0.2s" }}>
          <div className="flex items-center gap-2 px-1">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Localisation & réseaux
            </h2>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
          </div>

          <div className="blyss-card flex flex-col gap-5 hover:shadow-lg transition-shadow duration-300">
            <SettingsInputField
              label="Ville / zone"
              name="city"
              value={city}
              onChange={setCity}
              placeholder={initialCity || "Ex : Paris 11e, Lyon centre..."}
              isTouched={touched.city}
              error={fieldErrors.city}
              onBlur={handleBlur}
              onValidate={validateField}
            />

            <SettingsInputField
              label="Instagram (optionnel)"
              name="instagramAccount"
              value={instagramAccount}
              onChange={setInstagramAccount}
              placeholder={initialInstagramAccount || "@toncompte"}
              helpText="Ton compte pourra être affiché sur ton profil Blyss."
              isTouched={touched.instagramAccount}
              error={fieldErrors.instagramAccount}
              onBlur={handleBlur}
              onValidate={validateField}
            />
          </div>
        </div>

        {/* SECTION : Sécurité */}
        <div className="space-y-4 mb-6 animate-slide-up" style={{ animationDelay: "0.3s" }}>
          <div className="flex items-center gap-2 px-1">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Sécurité
            </h2>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
          </div>

          <div className="blyss-card flex flex-col gap-5 hover:shadow-lg transition-shadow duration-300">
            <SettingsInputField
              label="Ancien mot de passe"
              name="currentPassword"
              type="password"
              value={currentPassword}
              onChange={setCurrentPassword}
              placeholder="Ton mot de passe actuel"
              showPassword={showCurrentPassword}
              onTogglePassword={() => setShowCurrentPassword(!showCurrentPassword)}
              isTouched={touched.currentPassword}
              error={fieldErrors.currentPassword}
              onBlur={handleBlur}
              onValidate={validateField}
            />

            <div className="space-y-3">
              <SettingsInputField
                label="Nouveau mot de passe"
                name="newPassword"
                type="password"
                value={newPassword}
                onChange={setNewPassword}
                placeholder="Nouveau mot de passe"
                showPassword={showNewPassword}
                onTogglePassword={() => setShowNewPassword(!showNewPassword)}
                isTouched={touched.newPassword}
                error={fieldErrors.newPassword}
                onBlur={handleBlur}
                onValidate={validateField}
              />
              
              {/* Indicateur de force du mot de passe */}
              {passwordStrength && (
                <div className="animate-in slide-in-from-top-2 duration-300 p-3 rounded-xl bg-muted/50">
                  <div className="flex gap-1.5 mb-2">
                    <div className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
                      passwordStrength === "weak" ? "bg-red-500 scale-105" :
                      passwordStrength === "medium" ? "bg-orange-500" :
                      "bg-green-500"
                    }`} />
                    <div className={`h-1.5 flex-1 rounded-full transition-all duration-500 delay-75 ${
                      passwordStrength === "medium" || passwordStrength === "strong" ? 
                      (passwordStrength === "medium" ? "bg-orange-500 scale-105" : "bg-green-500") :
                      "bg-muted"
                    }`} />
                    <div className={`h-1.5 flex-1 rounded-full transition-all duration-500 delay-150 ${
                      passwordStrength === "strong" ? "bg-green-500 scale-105" : "bg-muted"
                    }`} />
                  </div>
                  <p className={`text-xs font-semibold ${
                    passwordStrength === "weak" ? "text-red-600" :
                    passwordStrength === "medium" ? "text-orange-600" :
                    "text-green-600"
                  }`}>
                    {passwordStrength === "weak" && "⚠️ Mot de passe faible"}
                    {passwordStrength === "medium" && "🔒 Mot de passe moyen"}
                    {passwordStrength === "strong" && "✅ Mot de passe fort"}
                  </p>
                </div>
              )}
            </div>

            <SettingsInputField
              label="Confirme le nouveau mot de passe"
              name="newPasswordConfirm"
              type="password"
              value={newPasswordConfirm}
              onChange={setNewPasswordConfirm}
              placeholder="Répète le nouveau mot de passe"
              showPassword={showConfirmPassword}
              onTogglePassword={() => setShowConfirmPassword(!showConfirmPassword)}
              helpText="Ton mot de passe doit contenir au moins 8 caractères, une majuscule et un chiffre."
              isTouched={touched.newPasswordConfirm}
              error={fieldErrors.newPasswordConfirm}
              onBlur={handleBlur}
              onValidate={validateField}
            />

            <button
              type="button"
              onClick={handleForgotPassword}
              className="self-start text-xs text-primary hover:underline active:opacity-80 transition-opacity font-medium"
            >
              Mot de passe oublié ?
            </button>
          </div>
        </div>

        {/* Données & confidentialité */}
        <div className="rounded-2xl border border-border bg-card p-5 space-y-3 mb-4">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
            Données & confidentialité
          </p>

          <button
            onClick={() => navigate("/pro/rgpd")}
            className="w-full flex items-center gap-3 py-3 px-4 rounded-xl bg-muted/50 hover:bg-muted transition-colors text-sm font-medium text-foreground active:scale-[0.98]"
          >
            <Shield size={16} className="text-primary flex-shrink-0" />
            Mes droits RGPD
          </button>

          <button
            onClick={handleExportData}
            disabled={isExporting}
            className="w-full flex items-center gap-3 py-3 px-4 rounded-xl bg-muted/50 hover:bg-muted transition-colors text-sm font-medium text-foreground disabled:opacity-50 active:scale-[0.98]"
          >
            <Download size={16} className="text-primary flex-shrink-0" />
            {isExporting ? "Export en cours..." : "Exporter mes données"}
          </button>

          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full flex items-center gap-3 py-3 px-4 rounded-xl bg-destructive/5 hover:bg-destructive/10 transition-colors text-sm font-medium text-destructive active:scale-[0.98]"
            >
              <Trash2 size={16} className="flex-shrink-0" />
              Supprimer mon compte
            </button>
          ) : (
            <div className="rounded-xl border-2 border-destructive/30 bg-destructive/5 p-4 space-y-3">
              <p className="text-sm font-semibold text-destructive">Supprimer le compte</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-2 rounded-xl bg-muted text-sm font-semibold text-foreground hover:bg-muted/80 transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={isDeleting}
                  className="flex-1 py-2 rounded-xl bg-destructive text-sm font-semibold text-white hover:bg-destructive/90 transition-colors disabled:opacity-50"
                >
                  {isDeleting ? "Suppression..." : "Confirmer"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Bouton Enregistrer fixe en bas */}
        <div className={`
          sticky bottom-0 -mx-4 px-4 pt-4 pb-6 bg-gradient-to-t from-background via-background to-transparent
          transition-all duration-300
          ${hasChanges ? "animate-in slide-in-from-bottom-4" : ""}
        `}>
          <button
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            className={`
              w-full py-4 rounded-2xl font-semibold text-sm
              transition-all duration-300 ease-out
              flex items-center justify-center gap-2
              ${hasChanges && !isSaving
                ? "bg-blyss-pink text-white shadow-blyss-pink/30 active:scale-[0.97] shadow-lg hover:shadow-xl hover:bg-blyss-pink/90 scale-105"
                : "bg-muted text-muted-foreground cursor-not-allowed scale-100"
              }
            `}
          >
            {isSaving ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-current border-t-transparent"></div>
                Enregistrement en cours...
              </>
            ) : hasChanges ? (
              <>
                <Save size={18} />
                Enregistrer les modifications
              </>
            ) : (
              <>
                <Check size={18} />
                Tout est à jour
              </>
            )}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes slide-up {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        .animate-fade-in {
          animation: fade-in 0.5s ease-out forwards;
        }

        .animate-slide-up {
          animation: slide-up 0.5s ease-out forwards;
        }
      `}</style>
    </MobileLayout>
  );
};

export default ProSettings;
