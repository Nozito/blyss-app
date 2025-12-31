import MobileLayout from "@/components/MobileLayout";
import { useNavigate } from "react-router-dom";
import { Settings, ChevronRight, CreditCard, Bell, HelpCircle, LogOut } from "lucide-react";
import logo from "@/assets/logo.png";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import React, { useState, useEffect, useCallback, useRef } from "react";
import Cropper from "react-easy-crop";
import getCroppedImg from "@/utils/cropImage";
import { BadgeCheck } from "lucide-react";

const ProProfile = () => {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/login');
    }
  }, [isLoading, isAuthenticated, navigate]);
  const displayActivity = user?.activity_name || "Non renseignée";

  const [profileImage, setProfileImage] = useState(user?.profile_photo || logo);
  const [tempProfileImage, setTempProfileImage] = useState<string | null>(null);
  const [showCropModal, setShowCropModal] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const inputFileRef = useRef<HTMLInputElement>(null);

  const onCropComplete = useCallback((croppedArea, croppedAreaPixels) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const imageDataUrl = URL.createObjectURL(file);
      setTempProfileImage(imageDataUrl);
      setShowCropModal(true);
      e.target.value = "";
    }
  };

  const handleUpload = async () => {
    try {
      if (!user?.id) {
        toast.error("Impossible d’uploader : l'utilisateur n'est pas défini");
        return;
      }
      if (!tempProfileImage || !croppedAreaPixels) return;

      const croppedImageResult = await getCroppedImg(tempProfileImage, croppedAreaPixels);
      // getCroppedImg may return a Blob or a data URL string; normalize to Blob
      const croppedImageBlob =
        typeof croppedImageResult === "string"
          ? await (await fetch(croppedImageResult)).blob()
          : croppedImageResult;

      const formData = new FormData();
      formData.append("photo", croppedImageBlob, "profile.jpg");

      // Assurez-vous que user.id existe
      if (user?.id) {
        formData.append("userId", user.id.toString());
      } else {
        console.error("User ID is undefined!");
      }

      const response = await fetch("http://localhost:3001/api/users/upload-photo", {
        method: "POST",
        body: formData,
      });

      console.log("Raw response:", response);

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      const data = await response.json();

      console.log("Parsed response data:", data);

      if (data?.photo) {
        setProfileImage("http://localhost:3001" + data.photo + "?t=" + Date.now());
        setShowCropModal(false);
        setTempProfileImage(null);
        toast.success("Photo de profil mise à jour");
      } else {
        throw new Error("URL de la photo non reçue");
      }
    } catch (error) {
      toast.error((error as Error).message || "Erreur lors de la mise à jour de la photo");
    }
  };

  const handleProfileImageClick = () => {
    if (inputFileRef.current) {
      inputFileRef.current.click();
    }
  };

  const menuItems = [
    { icon: Settings, label: "Paramètres", path: "/pro/settings" },
    { icon: CreditCard, label: "Encaissements", path: "/pro/payment" },
    { icon: Bell, label: "Notifications", path: "/pro/notifications" },
    { icon: HelpCircle, label: "Aide", path: "/pro/help" },
  ];

  const handleLogout = async () => {
    await logout();
    toast.success("Déconnexion réussie");
    navigate("/");
  };

  const displayName = user ? `${user?.first_name} ${user?.last_name}` : "Marie Beauté";

  const currentPlanLabel = "Formule Sérénité";
  const currentBillingLabel = "Mensuel";
  const nextBillingDate = "15 janvier 2026";

  return (
    <MobileLayout>
      <div className="py-6 animate-fade-in">
        {/* Header */}
        <div className="mb-5">
          <h1 className="text-2xl font-semibold text-foreground">
            Mon profil
          </h1>
        </div>

        {/* Profile Card */}
        <div className="blyss-card flex items-center gap-4 mb-6 animate-slide-up">
          <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center relative cursor-pointer overflow-hidden">
            <img src={profileImage} alt="Profile" className="w-20 h-20 object-contain" />
            <input
              type="file"
              accept="image/*"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  const file = e.target.files[0];
                  const reader = new FileReader();
                  reader.onload = () => {
                    setTempProfileImage(reader.result as string);
                    setShowCropModal(true);
                  };
                  reader.readAsDataURL(file);
                }
              }}
            />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-foreground">
              {displayName}
            </h2>
            {user?.email && (
              <p className="text-sm text-muted-foreground">{user?.email}</p>
            )}
            <p className="text-sm text-muted-foreground">{displayActivity}</p>
            <p className="text-xs text-primary mt-1">Profil complété à 95%</p>
          </div>
        </div>

        {showCropModal && tempProfileImage && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="bg-white rounded-3xl p-4 w-[90%] max-w-sm flex flex-col items-center">
              <h3 className="font-semibold text-foreground mb-4">Ajustez votre photo</h3>
              <div className="relative w-full h-64 rounded-xl overflow-hidden mb-4">
                <Cropper
                  image={tempProfileImage}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={(_, croppedAreaPixels) => setCroppedAreaPixels(croppedAreaPixels)}
                />
              </div>

              {/* Zoom Slider */}
              <input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-full mt-2"
              />

              <div className="flex gap-4 w-full mt-4">
                <button
                  onClick={() => { setTempProfileImage(null); setShowCropModal(false); }}
                  className="flex-1 py-3 rounded-xl bg-muted text-foreground font-medium"
                >
                  Annuler
                </button>
                <button
                  onClick={async () => {
                    if (!user?.id) {
                      toast.error("Impossible d’uploader : l'utilisateur n'est pas défini");
                      return;
                    }
                    if (!croppedAreaPixels) return;
                    try {
                      const croppedImage = await getCroppedImg(tempProfileImage, croppedAreaPixels);
                      const blob =
                        typeof croppedImage === "string"
                          ? await (await fetch(croppedImage)).blob()
                          : croppedImage;
                      const formData = new FormData();
                      formData.append("photo", blob, "profile.jpg");
                      if (user?.id) {
                        formData.append("userId", user.id.toString());
                      }
                      // Log FormData entries
                      console.log("FormData entries:");
                      for (const pair of formData.entries()) {
                        console.log(pair[0], pair[1]);
                      }
                      // Upload to correct backend URL
                      console.log("Uploading photo with FormData entries:");
                      for (const pair of formData.entries()) {
                        console.log(pair[0], pair[1]);
                      }
                      const response = await fetch("http://localhost:3001/api/users/upload-photo", {
                        method: "POST",
                        body: formData,
                      });
                      console.log("Raw response:", response);
                      const data = await response.json();
                      console.log("Parsed response data:", data);
                      if (data?.photo) {
                        setProfileImage("http://localhost:3001" + data.photo + "?t=" + Date.now());
                        toast.success("Photo de profil mise à jour");
                        setShowCropModal(false);
                        setTempProfileImage(null);
                      } else {
                        throw new Error("URL de la photo non reçue");
                      }
                    } catch (error) {
                      toast.error((error as Error).message || "Erreur lors de la mise à jour de la photo");
                    }
                  }}
                  className="flex-1 py-3 rounded-xl bg-blyss-pink text-white font-medium"
                >
                  Valider
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6 animate-slide-up" style={{ animationDelay: "0.1s" }}>
          <div className="stat-card text-center">
            <p className="text-2xl font-bold text-primary">156</p>
            <p className="text-xs text-muted-foreground">Clientes</p>
          </div>
          <div className="stat-card text-center">
            <p className="text-2xl font-bold text-primary">4.9</p>
            <p className="text-xs text-muted-foreground">Note</p>
          </div>
          <div className="stat-card text-center">
            <p className="text-2xl font-bold text-primary">2 ans</p>
            <p className="text-xs text-muted-foreground">Sur Blyss</p>
          </div>
        </div>

         {/* ENCARDS ABONNEMENT */}
        <div
          className="blyss-card flex items-center gap-4 animate-slide-up active:scale-[0.99] transition-all cursor-pointer mb-6"
          style={{ animationDelay: "0.12s" }}
          onClick={() => navigate("/pro/subscription")}
        >
          <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center">
            <CreditCard size={20} className="text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-foreground truncate">
          Mon abonnement
              </p>
              <span className="inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 text-[10px] px-2 py-0.5">
          <BadgeCheck size={12} className="mr-1" />
          Actif
              </span>
            </div>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              {currentPlanLabel} · {currentBillingLabel}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Prochain prélèvement le {nextBillingDate}
            </p>
          </div>
          <ChevronRight size={18} className="text-muted-foreground flex-shrink-0" />
        </div>


        {/* Menu Items */}
        <div className="blyss-card p-0 overflow-hidden mb-6 animate-slide-up" style={{ animationDelay: "0.15s" }}>
          {menuItems.map((item, index) => (
            <button
              key={index}
              onClick={() => navigate(item.path)}
              className="w-full flex items-center gap-4 px-4 py-4 hover:bg-muted/50 active:bg-muted active:scale-[0.99] transition-all border-b border-border last:border-b-0"
            >
              <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center">
                <item.icon size={20} className="text-primary" />
              </div>
              <span className="flex-1 text-left font-medium text-foreground">{item.label}</span>
              <ChevronRight size={20} className="text-muted-foreground" />
            </button>
          ))}
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="blyss-card w-full flex items-center gap-4 animate-slide-up active:scale-[0.98] transition-transform"
          style={{ animationDelay: "0.2s" }}
        >
          <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
            <LogOut size={20} className="text-destructive" />
          </div>
          <span className="flex-1 text-left font-medium text-destructive">Se déconnecter</span>
        </button>

        {/* App Version */}
        <p className="text-center text-xs text-muted-foreground mt-8 animate-fade-in" style={{ animationDelay: "0.3s" }}>
          Blyss v1.0.0
        </p>
      </div>
    </MobileLayout>
  );
};

export default ProProfile;
