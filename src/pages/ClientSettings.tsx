import MobileLayout from "@/components/MobileLayout";
import { motion } from "framer-motion";
import { ArrowLeft, User, Lock, Eye, EyeOff } from "lucide-react";
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

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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
      <div className="pb-6">
        {/* Header */}
        <motion.div
          className="flex items-center gap-3 mb-6 pt-6"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <button
            onClick={() => navigate("/client/profile")}
            className="
              w-11 h-11 rounded-2xl bg-card border border-muted
              flex items-center justify-center
              hover:bg-muted/50
              transition-all duration-300
              active:scale-95
            "
            aria-label="Retour"
          >
            <ArrowLeft size={20} className="text-foreground" />
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-display font-bold text-foreground">
              Paramètres
            </h1>
            <p className="text-sm text-muted-foreground">
              Gère ton compte et ta sécurité
            </p>
          </div>
        </motion.div>

        {/* SECTION : Infos personnelles */}
        <motion.div
          className="space-y-3 mb-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5 }}
        >
          <div className="flex items-center gap-2 px-1">
            <User size={16} className="text-primary" />
            <h2 className="text-sm font-semibold text-foreground">
              Infos personnelles
            </h2>
          </div>

          <div className="bg-card rounded-3xl p-5 shadow-lg shadow-black/5 border border-muted space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="lastName"
                className="text-xs font-medium text-muted-foreground"
              >
                Nom
              </label>
              <input
                id="lastName"
                type="text"
                maxLength={100}
                className="
                  w-full h-12 px-4 rounded-2xl
                  border-2 border-muted
                  bg-background text-foreground
                  focus:outline-none focus:border-primary
                  transition-all duration-300
                "
                placeholder="Ton nom"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="firstName"
                className="text-xs font-medium text-muted-foreground"
              >
                Prénom
              </label>
              <input
                id="firstName"
                type="text"
                maxLength={100}
                className="
                  w-full h-12 px-4 rounded-2xl
                  border-2 border-muted
                  bg-background text-foreground
                  focus:outline-none focus:border-primary
                  transition-all duration-300
                "
                placeholder="Ton prénom"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="birthDate"
                className="text-xs font-medium text-muted-foreground"
              >
                Date de naissance
              </label>
              <input
                id="birthDate"
                type="date"
                className="
                  w-full h-12 px-4 rounded-2xl
                  border-2 border-muted
                  bg-background text-foreground
                  focus:outline-none focus:border-primary
                  transition-all duration-300
                "
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
              />
            </div>
          </div>
        </motion.div>

        {/* SECTION : Sécurité / mot de passe */}
        <motion.div
          className="space-y-3 mb-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
        >
          <div className="flex items-center gap-2 px-1">
            <Lock size={16} className="text-primary" />
            <h2 className="text-sm font-semibold text-foreground">
              Sécurité
            </h2>
          </div>

          <div className="bg-card rounded-3xl p-5 shadow-lg shadow-black/5 border border-muted space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="currentPassword"
                className="text-xs font-medium text-muted-foreground"
              >
                Ancien mot de passe
              </label>
              <div className="relative">
                <input
                  id="currentPassword"
                  type={showCurrentPassword ? "text" : "password"}
                  autoComplete="current-password"
                  className="
                    w-full h-12 px-4 pr-12 rounded-2xl
                    border-2 border-muted
                    bg-background text-foreground
                    focus:outline-none focus:border-primary
                    transition-all duration-300
                  "
                  placeholder="Mot de passe actuel"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showCurrentPassword ? (
                    <EyeOff size={18} />
                  ) : (
                    <Eye size={18} />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="newPassword"
                className="text-xs font-medium text-muted-foreground"
              >
                Nouveau mot de passe
              </label>
              <div className="relative">
                <input
                  id="newPassword"
                  type={showNewPassword ? "text" : "password"}
                  autoComplete="new-password"
                  className="
                    w-full h-12 px-4 pr-12 rounded-2xl
                    border-2 border-muted
                    bg-background text-foreground
                    focus:outline-none focus:border-primary
                    transition-all duration-300
                  "
                  placeholder="Nouveau mot de passe"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showNewPassword ? (
                    <EyeOff size={18} />
                  ) : (
                    <Eye size={18} />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="newPasswordConfirm"
                className="text-xs font-medium text-muted-foreground"
              >
                Confirme le nouveau mot de passe
              </label>
              <div className="relative">
                <input
                  id="newPasswordConfirm"
                  type={showConfirmPassword ? "text" : "password"}
                  autoComplete="new-password"
                  className="
                    w-full h-12 px-4 pr-12 rounded-2xl
                    border-2 border-muted
                    bg-background text-foreground
                    focus:outline-none focus:border-primary
                    transition-all duration-300
                  "
                  placeholder="Répète le nouveau mot de passe"
                  value={newPasswordConfirm}
                  onChange={(e) => setNewPasswordConfirm(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showConfirmPassword ? (
                    <EyeOff size={18} />
                  ) : (
                    <Eye size={18} />
                  )}
                </button>
              </div>
            </div>

            <div className="pt-2 space-y-2">
              <p className="text-xs text-muted-foreground">
                Ton mot de passe doit contenir au moins 8 caractères, une
                majuscule et un chiffre.
              </p>

              <button
                type="button"
                onClick={handleForgotPassword}
                className="text-xs text-primary font-medium hover:underline active:opacity-80"
              >
                Mot de passe oublié ?
              </button>
            </div>
          </div>

          {errors && (
            <motion.div
              role="alert"
              className="p-4 rounded-2xl bg-destructive/10 border-2 border-destructive/20"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
            >
              <p className="text-sm text-destructive font-medium">{errors}</p>
            </motion.div>
          )}
        </motion.div>

        {/* Bouton Enregistrer */}
        <motion.button
          onClick={handleSave}
          disabled={isSaving}
          className="
            w-full h-14 rounded-2xl
            bg-primary text-primary-foreground font-semibold text-base
            shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-all duration-300
            active:scale-[0.98]
          "
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          whileHover={{ scale: isSaving ? 1 : 1.02 }}
          whileTap={{ scale: isSaving ? 1 : 0.98 }}
        >
          {isSaving ? "Enregistrement..." : "Enregistrer les modifications"}
        </motion.button>
      </div>
    </MobileLayout>
  );
};

export default ClientSettings;