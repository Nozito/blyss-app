import MobileLayout from "@/components/MobileLayout";
import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { toast } from "sonner";

const ProSettings = () => {
  const navigate = useNavigate();

  // Infos pro (à connecter à ton backend plus tard)
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

  const [errors, setErrors] = useState<string | null>(null);

  useEffect(() => {
  const fetchUserData = async () => {
    try {
      const token = localStorage.getItem("auth_token");
      console.log("Token from localStorage:", token); // <-- debug token
      if (!token) {
        console.log("No token found, skipping fetch");
        return;
      }

      const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
      console.log("Fetching from:", `${BASE_URL}/api/users`); // <-- debug URL

      const response = await fetch(`${BASE_URL}/api/users`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      console.log("Response status:", response.status); // <-- debug status
      const data = await response.json();
      console.log("Fetched user data:", data); // <-- debug data

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
      console.error("Fetch error:", error); // <-- debug error
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
      if (newPassword && newPassword === currentPassword) {
        setErrors("Le nouveau mot de passe doit être différent de l'ancien.");
        return;
      }
    }

    const payload: any = {};
    if (firstName !== "") payload.first_name = firstName;
    if (lastName !== "") payload.last_name = lastName;
    if (activityName !== "") payload.activity_name = activityName;
    if (city !== "") payload.city = city;
    if (instagramAccount !== "") payload.instagram_account = instagramAccount;
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
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json();
        setErrors(errorData.message || "Une erreur est survenue lors de la sauvegarde.");
        return;
      }

      const result = await response.json();
      if (result?.data) {
        localStorage.setItem("user", JSON.stringify(result.data));
      }

      toast.success("Profil mis à jour avec succès !");
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
                placeholder={initialActivityName || "Ex : Nails by Emma"}
                value={activityName}
                onChange={(e) => setActivityName(e.target.value)}
              />
            </div>

            <div className="flex flex-col">
              <label className="text-xs text-muted-foreground mb-1">
                Ton prénom
              </label>
              <input
                type="text"
                className="border border-muted rounded-xl px-3 h-11 w-full text-sm bg-background"
                placeholder={initialFirstName || "Ex : Emma"}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>

            <div className="flex flex-col">
              <label className="text-xs text-muted-foreground mb-1">
                Ton nom
              </label>
              <input
                type="text"
                className="border border-muted rounded-xl px-3 h-11 w-full text-sm bg-background"
                placeholder={initialLastName || "Ex : Bernard"}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
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
                placeholder={initialCity || "Ex : Paris 11e, Lyon centre..."}
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
                placeholder={initialInstagramAccount || "@toncompte"}
                value={instagramAccount}
                onChange={(e) => setInstagramAccount(e.target.value)}
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
