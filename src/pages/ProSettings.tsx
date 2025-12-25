import MobileLayout from "@/components/MobileLayout";
import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";

const ProSettings = () => {
  const navigate = useNavigate();

  // Infos pro (à connecter à ton backend plus tard)
  const [brandName, setBrandName] = useState("");
  const [proName, setProName] = useState("");
  const [specialty, setSpecialty] = useState(""); // ex : Prothésiste ongulaire
  const [city, setCity] = useState("");
  const [instagram, setInstagram] = useState("");

  // Sécurité
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");

  const [errors, setErrors] = useState<string | null>(null);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const response = await fetch("/api/users/me");
        if (!response.ok) {
          throw new Error("Failed to fetch user data");
        }
        const data = await response.json();
        setBrandName(data.activity_name || "");
        setProName(`${data.first_name || ""} ${data.last_name || ""}`.trim());
        setCity(data.city || "");
        setInstagram(data.instagram_account || "");
      } catch (error) {
        // Optionally handle errors here
      }
    };
    fetchUserData();
  }, []);

  const validatePassword = (pwd: string) => {
    const hasLength = pwd.length >= 8;
    const hasUpper = /[A-Z]/.test(pwd);
    const hasDigit = /\d/.test(pwd);
    return hasLength && hasUpper && hasDigit;
  };

  const handleSave = async () => {
    setErrors(null);

    // Si la pro touche au mot de passe
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

    try {
      const response = await fetch("/api/pro/update-profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          brandName,
          proName,
          specialty,
          city,
          instagram,
          currentPassword,
          newPassword
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        setErrors(errorData.message || "Une erreur est survenue lors de la sauvegarde.");
        return;
      }

      alert("Profil mis à jour avec succès !");
      setCurrentPassword("");
      setNewPassword("");
      setNewPasswordConfirm("");
    } catch (error) {
      setErrors("Une erreur réseau est survenue. Veuillez réessayer.");
    }
  };

  const handleForgotPassword = () => {
    // TODO : rediriger vers ton flow “mot de passe oublié” pro
    navigate("/forgot-password");
  };

  return (
    <MobileLayout showNav={false}>
      <div className="py-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center mb-2">
          <button
            onClick={() => navigate("/pro/profile")}
            className="p-2"
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
        <div className="space-y-4 mb-6">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
            Profil pro
          </h2>

          <div className="blyss-card flex flex-col gap-3">
            <div className="flex flex-col">
              <label className="text-xs text-muted-foreground mb-1">
                Nom de ton activité
              </label>
              <input
                type="text"
                className="border border-muted rounded-xl px-3 h-11 w-full text-sm bg-background"
                placeholder="Ex : Nails by Emma"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
              />
            </div>

            <div className="flex flex-col">
              <label className="text-xs text-muted-foreground mb-1">
                Ton prénom et nom
              </label>
              <input
                type="text"
                className="border border-muted rounded-xl px-3 h-11 w-full text-sm bg-background"
                placeholder="Ex : Emma Bernard"
                value={proName}
                onChange={(e) => setProName(e.target.value)}
              />
            </div>

            <div className="flex flex-col">
              <label className="text-xs text-muted-foreground mb-1">
                Spécialité
              </label>
              <input
                type="text"
                className="border border-muted rounded-xl px-3 h-11 w-full text-sm bg-background"
                placeholder="Ex : Prothésiste ongulaire, nail art..."
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* SECTION : Localisation & réseaux */}
        <div className="space-y-4 mb-6">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
            Localisation & réseaux
          </h2>

          <div className="blyss-card flex flex-col gap-3">
            <div className="flex flex-col">
              <label className="text-xs text-muted-foreground mb-1">
                Ville / zone
              </label>
              <input
                type="text"
                className="border border-muted rounded-xl px-3 h-11 w-full text-sm bg-background"
                placeholder="Ex : Paris 11e, Lyon centre..."
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </div>

            <div className="flex flex-col">
              <label className="text-xs text-muted-foreground mb-1">
                Instagram (optionnel)
              </label>
              <input
                type="text"
                className="border border-muted rounded-xl px-3 h-11 w-full text-sm bg-background"
                placeholder="@toncompte"
                value={instagram}
                onChange={(e) => setInstagram(e.target.value)}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Ton compte pourra être affiché sur ton profil Blyss.
              </p>
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

export default ProSettings;
