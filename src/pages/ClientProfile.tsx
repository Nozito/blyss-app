import MobileLayout from "@/components/MobileLayout";
import { useNavigate } from "react-router-dom";
import { Settings, ChevronRight, CreditCard, Bell, HelpCircle, LogOut } from "lucide-react";
import logo from "@/assets/logo.png";
import { useState } from "react";
import Cropper from "react-easy-crop";
import getCroppedImg from "@/utils/cropImage";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const ClientProfile = () => {
  const navigate = useNavigate();
  const { user, logout, isAuthenticated } = useAuth();
  const [profileImage, setProfileImage] = useState(logo);
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

  const handleLogout = async () => {
    await logout();
    toast.success("Déconnexion réussie");
    navigate("/");
  };

  const displayName = user ? `${user.firstName} ${user.lastName}` : "Marie Dubois";

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
              <p className="text-sm text-muted-foreground">{user.email}</p>
            )}
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
                    if (!croppedAreaPixels) return;
                    const croppedImage = await getCroppedImg(tempProfileImage, croppedAreaPixels);
                    setProfileImage(croppedImage);
                    setTempProfileImage(null);
                    setShowCropModal(false);
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
            <p className="text-2xl font-bold text-foreground">156</p>
            <p className="text-xs text-muted-foreground">Réservations</p>
          </div>
          <div className="stat-card text-center">
            <p className="text-2xl font-bold text-foreground">4.9</p>
            <p className="text-xs text-muted-foreground">Note</p>
          </div>
          <div className="stat-card text-center">
            <p className="text-2xl font-bold text-foreground">2 ans</p>
            <p className="text-xs text-muted-foreground">Sur Blyss</p>
          </div>
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

export default ClientProfile;
