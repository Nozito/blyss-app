import MobileLayout from "@/components/MobileLayout";
import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const ClientSettings = () => {
  const navigate = useNavigate();
  const { user, updateUser, isAuthenticated, isLoading } = useAuth();

  // Redirect if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate("/login");
    }
  }, [isLoading, isAuthenticated, navigate]);

  // Pre-fill with user data
  const [lastName, setLastName] = useState(user?.last_name || "");
  const [firstName, setFirstName] = useState(user?.first_name || "");
  const [birthDate, setBirthDate] = useState(user?.birth_date || "");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");

  const [errors, setErrors] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Update local state when user changes
  useEffect(() => {
    if (user) {
      setLastName(user.last_name || "");
      setFirstName(user.first_name || "");
      setBirthDate(user.birth_date || "");
    }
  }, [user]);

  const validatePassword = (pwd: string) => {
    const hasLength = pwd.length >= 8;
    const hasUpper = /[A-Z]/.test(pwd);
    const hasDigit = /\d/.test(pwd);
    return hasLength && hasUpper && hasDigit;
  };

  const sanitizeInput = (input: string) => {
    return input.trim().slice(0, 100);
  };

  const handleSave = async () => {
    setErrors(null);

    // Validate name inputs
    const cleanFirstName = sanitizeInput(firstName);
    const cleanLastName = sanitizeInput(lastName);

    if (!cleanFirstName || !cleanLastName) {
      setErrors("Le prénom et le nom sont requis.");
      return;
    }

    // Password validation
    if (newPassword || newPasswordConfirm || currentPassword) {
      if (!currentPassword) {
        setErrors("Renseigne ton ancien mot de passe pour le modifier.");
        return;
      }
      if (!validatePassword(newPassword)) {
        setErrors(
          "Ton nouveau mot de passe doit contenir au moins 8 caractères, une majuscule et un chiffre."
        );
        return;
      }
      if (newPassword !== newPasswordConfirm) {
        setErrors("Les deux nouveaux mots de passe ne correspondent pas.");
        return;
      }
    }

    setIsSaving(true);

    try {
      const response = await updateUser({
        first_name: cleanFirstName,
        last_name: cleanLastName,
        birth_date: birthDate,
      });

      if (response.success) {
        toast.success("Modifications enregistrées");
        // Reset password fields on success
        setCurrentPassword("");
        setNewPassword("");
        setNewPasswordConfirm("");
      } else {
        setErrors(response.message || "Erreur lors de la sauvegarde");
      }
    } catch {
      setErrors("Erreur lors de la sauvegarde");
    } finally {
      setIsSaving(false);
    }
  };

  const handleForgotPassword = () => {
    navigate("/forgot-password");
  };

  return (
    <MobileLayout showNav={false}>
      <div className="animate-fade-in">
        {/* Header */}
        <div className="flex items-center mb-2">
          <button
            onClick={() => navigate("/client/profile")}
            className="p-2 -ml-2"
            aria-label="Retour au profil"
          >
            <ChevronLeft size={24} className="text-foreground" />
          </button>
          <h1 className="font-display text-2xl font-semibold text-foreground ml-2">
            Paramètres
          </h1>
        </div>
        <p className="text-muted-foreground text-sm mb-5">
          Gère ton compte, tes infos et ta sécurité.
        </p>

        {/* SECTION : Infos personnelles */}
        <div className="space-y-4 mb-6">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
            Infos personnelles
          </h2>

          <div className="blyss-card flex flex-col gap-3">
            <div className="flex flex-col">
              <label htmlFor="lastName" className="text-xs text-muted-foreground mb-1">
                Nom
              </label>
              <input
                id="lastName"
                type="text"
                maxLength={100}
                className="border border-muted rounded-xl px-3 h-11 w-full text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
                placeholder="Ton nom"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>

            <div className="flex flex-col">
              <label htmlFor="firstName" className="text-xs text-muted-foreground mb-1">
                Prénom
              </label>
              <input
                id="firstName"
                type="text"
                maxLength={100}
                className="border border-muted rounded-xl px-3 h-11 w-full text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
                placeholder="Ton prénom"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>

            <div className="flex flex-col">
              <label htmlFor="birthDate" className="text-xs text-muted-foreground mb-1">
                Date de naissance
              </label>
              <input
                id="birthDate"
                type="date"
                className="border border-muted rounded-xl px-3 h-11 w-full text-sm bg-background text-foreground appearance-none focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* SECTION : Sécurité / mot de passe */}
        <div className="space-y-4 mb-6">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
            Sécurité
          </h2>

          <div className="blyss-card flex flex-col gap-3">
            <div className="flex flex-col">
              <label htmlFor="currentPassword" className="text-xs text-muted-foreground mb-1">
                Ancien mot de passe
              </label>
              <input
                id="currentPassword"
                type="password"
                autoComplete="current-password"
                className="border border-muted rounded-xl px-3 h-11 w-full text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
                placeholder="Ton mot de passe actuel"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>

            <div className="flex flex-col">
              <label htmlFor="newPassword" className="text-xs text-muted-foreground mb-1">
                Nouveau mot de passe
              </label>
              <input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                className="border border-muted rounded-xl px-3 h-11 w-full text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
                placeholder="Nouveau mot de passe"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>

            <div className="flex flex-col">
              <label htmlFor="newPasswordConfirm" className="text-xs text-muted-foreground mb-1">
                Confirme le nouveau mot de passe
              </label>
              <input
                id="newPasswordConfirm"
                type="password"
                autoComplete="new-password"
                className="border border-muted rounded-xl px-3 h-11 w-full text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
                placeholder="Répète le nouveau mot de passe"
                value={newPasswordConfirm}
                onChange={(e) => setNewPasswordConfirm(e.target.value)}
              />
            </div>

            <p className="text-[11px] text-muted-foreground">
              Ton mot de passe doit contenir au moins 8 caractères, une
              majuscule et un chiffre.
            </p>

            <button
              type="button"
              onClick={handleForgotPassword}
              className="self-start text-xs text-primary active:opacity-80 focus:outline-none focus-visible:underline"
            >
              Mot de passe oublié ?
            </button>
          </div>

          {errors && (
            <div 
              role="alert"
              className="p-3 rounded-xl bg-destructive/10 border border-destructive/20"
            >
              <p className="text-[11px] text-destructive">{errors}</p>
            </div>
          )}
        </div>

        {/* Bouton Enregistrer */}
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full py-3 rounded-xl gradient-gold text-secondary-foreground font-medium mt-2 active:scale-[0.98] transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? "Enregistrement..." : "Enregistrer les modifications"}
        </button>
      </div>
    </MobileLayout>
  );
};

export default ClientSettings;