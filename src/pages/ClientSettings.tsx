import MobileLayout from "@/components/MobileLayout";
import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";

const ClientSettings = () => {
  const navigate = useNavigate();

  // Exemple de state local (à connecter plus tard à ton backend / contexte)
  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [birthDate, setBirthDate] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");

  const [errors, setErrors] = useState<string | null>(null);

  const validatePassword = (pwd: string) => {
    // Exemple simple : 8+ caractères, 1 maj, 1 chiffre
    const hasLength = pwd.length >= 8;
    const hasUpper = /[A-Z]/.test(pwd);
    const hasDigit = /\d/.test(pwd);
    return hasLength && hasUpper && hasDigit;
  };

  const handleSave = () => {
    setErrors(null);

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

    // TODO : appeler ton API pour sauvegarder
    // puis afficher un toast / message de succès
  };

  const handleForgotPassword = () => {
    // TODO : rediriger vers ton flow “mot de passe oublié”
    navigate("/forgot-password");
  };

  return (
    <MobileLayout showNav={false}>
      <div className="animate-fade-in">
        {/* Header comme ClientPaymentMethods */}
        <div className="flex items-center mb-2">
          <button
            onClick={() => navigate("/client/profile")}
            className="p-2"
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
              <label className="text-xs text-muted-foreground mb-1">
                Nom
              </label>
              <input
                type="text"
                className="border border-muted rounded-xl px-3 h-11 w-full text-sm bg-background"
                placeholder="Ton nom"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>

            <div className="flex flex-col">
              <label className="text-xs text-muted-foreground mb-1">
                Prénom
              </label>
              <input
                type="text"
                className="border border-muted rounded-xl px-3 h-11 w-full text-sm bg-background"
                placeholder="Ton prénom"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>

            <div className="flex flex-col">
              <label className="text-xs text-muted-foreground mb-1">
                Date de naissance
              </label>
              <input
                type="date"
                className="border border-muted rounded-xl px-3 h-11 w-full text-sm bg-background appearance-none"
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
              <label className="text-xs text-muted-foreground mb-1">
                Ancien mot de passe
              </label>
              <input
                type="password"
                autoComplete="current-password"
                className="border border-muted rounded-xl px-3 h-11 w-full text-sm bg-background"
                placeholder="Ton mot de passe actuel"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>

            <div className="flex flex-col">
              <label className="text-xs text-muted-foreground mb-1">
                Nouveau mot de passe
              </label>
              <input
                type="password"
                autoComplete="new-password"
                className="border border-muted rounded-xl px-3 h-11 w-full text-sm bg-background"
                placeholder="Nouveau mot de passe"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>

            <div className="flex flex-col">
              <label className="text-xs text-muted-foreground mb-1">
                Confirme le nouveau mot de passe
              </label>
              <input
                type="password"
                autoComplete="new-password"
                className="border border-muted rounded-xl px-3 h-11 w-full text-sm bg-background"
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
              className="self-start text-xs text-primary active:opacity-80"
            >
              Mot de passe oublié ?
            </button>
          </div>

          {errors && (
            <p className="text-[11px] text-destructive px-1">
              {errors}
            </p>
          )}
        </div>

        {/* Bouton Enregistrer */}
        <button
          onClick={handleSave}
          className="w-full py-3 rounded-xl gradient-gold text-secondary-foreground font-medium mt-2 active:scale-[0.98] transition-transform"
        >
          Enregistrer les modifications
        </button>
      </div>
    </MobileLayout>
  );
};

export default ClientSettings;
