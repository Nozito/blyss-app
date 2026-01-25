import MobileLayout from "@/components/MobileLayout";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Settings,
  ChevronRight,
  CreditCard,
  Bell,
  HelpCircle,
  LogOut,
  Camera,
  Star,
} from "lucide-react";
import logo from "@/assets/logo.png";
import { useState, useEffect, useCallback, useRef } from "react";
import Cropper from "react-easy-crop";
import getCroppedImg from "@/utils/cropImage";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const ClientProfile = () => {
  const navigate = useNavigate();
  const { user, logout, isAuthenticated } = useAuth();
  const inputFileRef = useRef<HTMLInputElement>(null);

  const initialPhoto =
    user?.profile_photo && user.profile_photo.startsWith("http")
      ? user.profile_photo
      : user?.profile_photo
      ? `http://localhost:3001${user.profile_photo}`
      : logo;

  const [profileImage, setProfileImage] = useState(initialPhoto);
  const [tempProfileImage, setTempProfileImage] = useState<string | null>(null);
  const [showCropModal, setShowCropModal] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);

  const menuItems = [
    { icon: Settings, label: "Paramètres", path: "/client/settings" },
    { icon: CreditCard, label: "Méthodes de paiement", path: "/client/payment-methods" },
    { icon: Bell, label: "Notifications", path: "/client/notifications" },
    { icon: HelpCircle, label: "Aide", path: "/client/help" },
  ];

  useEffect(() => {
    if (user?.profile_photo) {
      const url = user.profile_photo.startsWith("http")
        ? user.profile_photo
        : `http://localhost:3001${user.profile_photo}`;
      setProfileImage(`${url}?t=${Date.now()}`);
    }
  }, [user?.profile_photo]);

  const onCropComplete = useCallback((_: any, cropped: any) => {
    setCroppedAreaPixels(cropped);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const imageDataUrl = URL.createObjectURL(file);
    setTempProfileImage(imageDataUrl);
    setShowCropModal(true);
    e.target.value = "";
  };

  const uploadCroppedPhoto = async () => {
    try {
      if (!user?.id) {
        toast.error("Impossible d'uploader : l'utilisateur n'est pas défini");
        return;
      }
      if (!tempProfileImage || !croppedAreaPixels) return;

      const croppedImageResult = await getCroppedImg(
        tempProfileImage,
        croppedAreaPixels
      );
      const croppedImageBlob =
        typeof croppedImageResult === "string"
          ? await (await fetch(croppedImageResult)).blob()
          : croppedImageResult;

      const formData = new FormData();
      formData.append("photo", croppedImageBlob, "profile.jpg");
      formData.append("userId", String(user.id));

      const response = await fetch(
        "http://localhost:3001/api/users/upload-photo",
        {
          method: "POST",
          body: formData,
        }
      );

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      const data = await response.json();

      if (data?.photo) {
        const url = `http://localhost:3001${data.photo}`;
        setProfileImage(`${url}?t=${Date.now()}`);
        setShowCropModal(false);
        setTempProfileImage(null);
        toast.success("Photo de profil mise à jour");
      } else {
        throw new Error("URL de la photo non reçue");
      }
    } catch (error) {
      toast.error(
        (error as Error).message ||
          "Erreur lors de la mise à jour de la photo"
      );
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const displayName = user
    ? `${user.first_name} ${user.last_name}`
    : "Marie Dubois";

  return (
    <MobileLayout>
      <div className="pb-6">
        {/* Header */}
        <motion.div
          className="relative -mx-4 px-4 pt-6 pb-4 mb-3"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="text-2xl font-bold text-foreground mb-1">
            Mon profil
          </h1>
          <p className="text-sm text-muted-foreground">
            Gère ton compte Blyss
          </p>
        </motion.div>

        {/* Profile Card */}
        <motion.div
          className="bg-card rounded-3xl p-5 shadow-lg shadow-black/5 border border-muted mb-6 group hover:shadow-xl transition-all duration-300"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5 }}
        >
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center overflow-hidden ring-2 ring-primary/10 transition-all duration-300 group-hover:ring-primary/30">
                <img
                  src={profileImage}
                  alt="Profile"
                  className="w-full h-full object-cover"
                />
                <input
                  ref={inputFileRef}
                  type="file"
                  accept="image/*"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  onChange={handleFileChange}
                />
              </div>
              <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-primary shadow-lg flex items-center justify-center cursor-pointer group-hover:scale-110 transition-transform">
                <Camera size={14} className="text-white" />
              </div>
            </div>

            <div className="flex-1">
              <h2 className="text-lg font-bold text-foreground mb-0.5">
                {displayName}
              </h2>
              {user?.email && (
                <p className="text-sm text-muted-foreground mb-2">
                  {user.email}
                </p>
              )}
              <div className="flex items-center gap-1.5">
                <div className="h-1.5 flex-1 bg-muted rounded-full overflow-hidden">
                  <div className="h-full w-[95%] bg-gradient-to-r from-primary to-primary/60 rounded-full" />
                </div>
                <span className="text-[10px] font-semibold text-primary">
                  95%
                </span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Modal crop */}
        {showCropModal && tempProfileImage && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="bg-white rounded-3xl p-6 w-[90%] max-w-sm flex flex-col items-center shadow-2xl"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
            >
              <h3 className="font-bold text-foreground mb-4 text-lg">
                Ajuste ta photo
              </h3>
              <div className="relative w-full h-64 rounded-2xl overflow-hidden mb-4 ring-2 ring-border">
                <Cropper
                  image={tempProfileImage}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={onCropComplete}
                />
              </div>

              <input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-full mt-2 mb-6"
              />

              <div className="flex gap-3 w-full">
                <button
                  onClick={() => {
                    setTempProfileImage(null);
                    setShowCropModal(false);
                  }}
                  className="flex-1 py-3 rounded-xl bg-muted text-foreground font-semibold active:scale-95 transition-transform"
                >
                  Annuler
                </button>
                <button
                  onClick={uploadCroppedPhoto}
                  className="flex-1 py-3 rounded-xl bg-primary text-white font-semibold shadow-lg shadow-primary/30 active:scale-95 transition-transform"
                >
                  Valider
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Menu Items */}
        <motion.div
          className="bg-card rounded-3xl p-0 overflow-hidden shadow-lg shadow-black/5 border border-muted mb-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
        >
          {menuItems.map((item, index) => (
            <button
              key={index}
              onClick={() => navigate(item.path)}
              className="w-full flex items-center gap-4 px-4 py-4 hover:bg-muted/50 active:bg-muted active:scale-[0.99] transition-all border-b border-border last:border-b-0 group"
            >
              <div className="w-11 h-11 rounded-xl bg-accent flex items-center justify-center group-hover:scale-110 transition-transform">
                <item.icon size={20} className="text-primary" />
              </div>
              <span className="flex-1 text-left font-semibold text-foreground">
                {item.label}
              </span>
              <ChevronRight
                size={20}
                className="text-muted-foreground group-hover:translate-x-1 transition-transform"
              />
            </button>
          ))}
        </motion.div>

        {/* Logout */}
        <motion.button
          onClick={handleLogout}
          className="bg-card rounded-3xl p-4 shadow-lg shadow-black/5 border-2 border-transparent hover:border-destructive/20 w-full flex items-center gap-4 active:scale-[0.98] transition-all group"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
        >
          <div className="w-11 h-11 rounded-xl bg-destructive/10 flex items-center justify-center group-hover:bg-destructive group-hover:scale-110 transition-all">
            <LogOut
              size={20}
              className="text-destructive group-hover:text-white transition-colors"
            />
          </div>
          <span className="flex-1 text-left font-semibold text-destructive">
            Se déconnecter
          </span>
        </motion.button>

        {/* App Version */}
        <motion.p
          className="text-center text-xs text-muted-foreground mt-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.5 }}
        >
          Blyss v1.0.0
        </motion.p>
      </div>
    </MobileLayout>
  );
};

export default ClientProfile;
