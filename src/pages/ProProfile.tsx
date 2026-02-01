import MobileLayout from "@/components/MobileLayout";
import { useTheme } from '@/hooks/useTheme';
import { useNavigate } from "react-router-dom";
import {
  Settings,
  ChevronRight,
  CreditCard,
  Bell,
  HelpCircle,
  LogOut,
  BadgeCheck,
  Camera,
  Edit,
  MapPin,
  Instagram,
  Star,
  Eye,
  TrendingUp,
  Calendar,
  User,
  Briefcase,
  SunIcon,
  MoonIcon,
  Sun,
  Moon, // Nouvel import pour l'icône des prestations
} from "lucide-react";
import logo from "@/assets/logo.png";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import React, { useState, useEffect, useCallback, useRef } from "react";
import Cropper from "react-easy-crop";
import getCroppedImg from "@/utils/cropImage";
import { proApi } from "@/services/api";
import { set } from "date-fns";

const ProProfile = () => {
  const { theme, toggleTheme } = useTheme();
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const navigate = useNavigate();

  const baseUrl = import.meta.env.VITE_SERVER_BASE || 'http://localhost:3001';
  const initialPhoto =
    user?.profile_photo && user.profile_photo.startsWith("http")
      ? user.profile_photo
      : user?.profile_photo
        ? `${baseUrl}${user.profile_photo}`
        : logo;

  const [profileImage, setProfileImage] = useState(initialPhoto);
  const [tempProfileImage, setTempProfileImage] = useState<string | null>(null);
  const [showCropModal, setShowCropModal] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
  const inputFileRef = useRef<HTMLInputElement>(null);

  // Upload state
  const [isUploadingPhoto, setIsUploadingPhoto] = useState<boolean>(false);

  const [subscription, setSubscription] = useState<{
    id: number;
    plan: "start" | "serenite" | "signature";
    billingType: "monthly" | "one_time";
    monthlyPrice: number;
    totalPrice: number | null;
    commitmentMonths: number | null;
    startDate: string;
    endDate: string | null;
    status: string;
  } | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate("/login");
    }
  }, [isLoading, isAuthenticated, navigate]);

  useEffect(() => {
    if (user?.profile_photo) {
      const url = user.profile_photo.startsWith("http")
        ? user.profile_photo
        : `http://localhost:3001/${user.profile_photo}`;
      setProfileImage(`${url}?t=${Date.now()}`);
    }
  }, [user?.profile_photo]);

  useEffect(() => {
    if (!isLoading && isAuthenticated && user?.role === "pro") {
      proApi.getSubscription().then((res) => {
        if (res.success) {
          setSubscription(res.data ?? null);
        }
      });
    }
  }, [isLoading, isAuthenticated, user]);

  const displayActivity = user?.activity_name || "Non renseignée";
  const displayName = user
    ? `${user.first_name} ${user.last_name}`
    : "Marie Beauté";
  const displayCity = user?.city || "Non renseigné";
  const displayInstagram = user?.instagram_account || null;

  const onCropComplete = useCallback((_: any, cropped: any) => {
    setCroppedAreaPixels(cropped);
  }, []);

  const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast.error('Format non supporté. Utilise JPG, PNG ou WebP');
      return;
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error("L'image ne doit pas dépasser 5MB");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setTempProfileImage(reader.result as string);
      setShowCropModal(true);
    };
    reader.readAsDataURL(file);
  };

  const uploadCroppedPhoto = async () => {
    if (!tempProfileImage || !croppedAreaPixels) {
      toast.error("Aucune image sélectionnée ou zone de crop manquante");
      return;
    }

    try {
      setIsUploadingPhoto(true);

      const croppedBase64 = await getCroppedImg(tempProfileImage, croppedAreaPixels);
      if (!croppedBase64) {
        toast.error("Impossible de générer l'image recadrée");
        return;
      }

      const blob = await fetch(croppedBase64).then((res) => res.blob());

      const formData = new FormData();
      formData.append('photo', blob, 'profile-photo.jpg');

      const token = localStorage.getItem('auth_token');
      if (!token) {
        toast.error('Session expirée. Reconnectez-vous.');
        navigate('/login');
        return;
      }

      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

      const response = await fetch(`${API_URL}/users/upload-photo`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const result = await response.json();

      if (result.success) {
        toast.success('Photo de profil mise à jour !');
        setProfileImage(result.photo);
        setShowCropModal(false);
        setTempProfileImage(null);
      } else {
        toast.error(result.message || 'Erreur lors de l\'upload');
      }

    } catch (error) {
      console.error('Error uploading photo:', error);
      toast.error('Erreur lors de l\'upload de la photo');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const hasActiveSubscription =
    user?.pro_status === "active" && subscription?.status === "active";

  const currentPlanLabel = subscription
    ? subscription.plan === "serenite"
      ? "Formule Sérénité"
      : subscription.plan === "start"
        ? "Formule Start"
        : "Formule Signature"
    : "Aucune formule";

  const currentBillingLabel = subscription
    ? subscription.billingType === "monthly"
      ? "Mensuel"
      : "Paiement unique"
    : "";

  const nextBillingDate = subscription?.endDate
    ? new Date(subscription.endDate).toLocaleDateString("fr-FR", {
      year: "numeric",
      month: "long",
      day: "2-digit",
    })
    : "";

  // Menu items mis à jour avec l'ajout de "Mes prestations"
  const menuItems = [
    { icon: Briefcase, label: "Mes prestations", path: "/pro/services" }, // Nouveau
    { icon: Settings, label: "Paramètres", path: "/pro/settings" },
    { icon: CreditCard, label: "Encaissements", path: "/pro/payment" },
    { icon: Bell, label: "Notifications", path: "/pro/notifications" },
    { icon: HelpCircle, label: "Aide", path: "/pro/help" },
  ];

  const calculateProfileCompleteness = () => {
    let score = 0;
    let maxScore = 0;

    maxScore += 10;
    if (user?.profile_photo && user.profile_photo !== logo) {
      score += 10;
    }

    maxScore += 15;
    if (user?.activity_name && user.activity_name.trim().length >= 2) {
      score += 15;
    }

    maxScore += 15;
    if (user?.city && user.city.trim().length >= 2) {
      score += 15;
    }

    maxScore += 15;
    if (user?.bio && user.bio.trim().length >= 20) {
      score += 15;
    }

    maxScore += 10;
    if (user?.instagram_account && user.instagram_account.startsWith('@')) {
      score += 10;
    }

    maxScore += 10;
    if (user?.banner_photo) {
      score += 10;
    }

    maxScore += 5;
    if (user?.profile_visibility === 'public') {
      score += 5;
    }

    if (user?.accept_online_payment === 1) {
      maxScore += 20;

      if (user?.bankaccountname && user.bankaccountname.trim().length >= 2) {
        score += 10;
      }

      if (user?.IBAN && user.IBAN.length > 10) {
        score += 10;
      }
    }

    return maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  };

  const profileCompleteness = calculateProfileCompleteness();

  return (
    <MobileLayout>
      <div className="min-h-screen pb-6">
        {/* Header */}
        <div className="relative -mx-4 px-4 pt-6 pb-6 mb-6 animate-fade-in">
          <h1 className="text-2xl font-bold text-foreground mb-1">
            Mon profil pro
          </h1>
          <p className="text-sm text-muted-foreground" style={{ animationDelay: "0.1s" }}>
            Gère ton compte et ton activité
          </p>
        </div>

        {/* Profile Card avec photo */}
        <div
          className="blyss-card mb-6 animate-scale-in group hover:shadow-lg transition-all duration-300"
          style={{ animationDelay: "0.1s" }}
        >
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center overflow-hidden ring-2 ring-primary/10 transition-all duration-300 group-hover:ring-primary/30 group-hover:scale-105">
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
                  onChange={handleProfileChange}
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
              <p className="text-sm text-muted-foreground mb-2">
                {displayActivity}
              </p>
              <div className="flex items-center gap-2">
                <div className="h-1.5 flex-1 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-primary to-primary/60 rounded-full transition-all duration-500"
                    style={{ width: `${profileCompleteness}%` }}
                  />
                </div>
                <span className="text-[10px] font-semibold text-primary">{profileCompleteness}%</span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                Profil complété
              </p>
            </div>
          </div>
        </div>

        {/* Modal crop */}
        {showCropModal && tempProfileImage && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-3xl p-6 w-[90%] max-w-sm flex flex-col items-center shadow-2xl animate-scale-in">
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
            </div>
          </div>
        )}

        {/* Stats */}
        <div
          className="blyss-card mb-6 animate-slide-up hover:shadow-lg transition-shadow duration-300"
          style={{ animationDelay: "0.2s" }}
        >
          <div className="grid grid-cols-3 divide-x divide-border">
            <div className="text-center px-3 py-3 group cursor-pointer">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition-transform">
                <Calendar size={18} className="text-primary" />
              </div>
              <p className="text-2xl font-bold text-foreground mb-1">
                {user?.clients_count ?? "–"}
              </p>
              <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">
                Clientes
              </p>
            </div>

            <div className="text-center px-3 py-3 group cursor-pointer">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition-transform">
                <Star size={18} className="text-primary" />
              </div>
              <p className="text-2xl font-bold text-foreground mb-1">
                {user?.avg_rating != null ? user.avg_rating.toFixed(1) : "–"}
              </p>
              <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">
                Note moy.
              </p>
            </div>

            <div className="text-center px-3 py-3 group cursor-pointer">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition-transform">
                <TrendingUp size={18} className="text-primary" />
              </div>
              <p className="text-lg font-bold text-foreground mb-1">
                {user?.years_on_blyss ?? "–"}
              </p>
              <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">
                Sur Blyss
              </p>
            </div>
          </div>
        </div>

        {/* Abonnement */}
        <div
          className="relative overflow-hidden rounded-2xl mb-6 animate-slide-up group cursor-pointer"
          style={{ animationDelay: "0.3s" }}
          onClick={() => {
            if (isAuthenticated && hasActiveSubscription) {
              navigate("/pro/subscription-settings");
            } else {
              navigate("/pro/subscription");
            }
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent" />
          <div className="relative blyss-card border-primary/20 group-hover:shadow-lg group-active:scale-[0.98] transition-all duration-300">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg shadow-primary/20 group-hover:scale-110 transition-transform">
                <CreditCard size={24} className="text-white" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-base font-bold text-foreground">
                    Mon abonnement
                  </p>
                  {hasActiveSubscription && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 text-[10px] px-2 py-1 font-semibold animate-pulse-soft">
                      <BadgeCheck size={12} />
                      Actif
                    </span>
                  )}
                </div>

                <p className="text-sm text-muted-foreground font-medium">
                  {currentPlanLabel}
                  {currentBillingLabel && ` · ${currentBillingLabel}`}
                </p>

                {nextBillingDate && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Prochain: {nextBillingDate}
                  </p>
                )}
              </div>

              <ChevronRight
                size={20}
                className="text-muted-foreground group-hover:translate-x-1 transition-transform"
              />
            </div>
          </div>
        </div>

        {/* Profil Public - Version Compacte */}
        <button
          onClick={() => navigate("/pro/public-profile")}
          className="w-full blyss-card mb-6 animate-slide-up group hover:shadow-lg active:scale-[0.98] transition-all duration-300 text-left"
          style={{ animationDelay: "0.4s" }}
        >
          <div className="flex items-center gap-4 mb-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Eye size={20} className="text-primary" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-foreground">
                    Profil public
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Vu par tes clientes
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <Edit size={14} className="text-primary" />
                  </div>
                  <ChevronRight size={20} className="text-muted-foreground group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/50">
              <MapPin size={12} className="text-muted-foreground" />
              <span className="text-xs font-medium text-foreground">{displayCity}</span>
            </div>

            {displayInstagram && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/50">
                <Instagram size={12} className="text-muted-foreground" />
                <span className="text-xs font-medium text-primary">{displayInstagram}</span>
              </div>
            )}

            {profileCompleteness < 100 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10">
                <TrendingUp size={12} className="text-primary" />
                <span className="text-xs font-semibold text-primary">
                  Complète ton profil
                </span>
              </div>
            )}
          </div>
        </button>

        {/* Menu */}
        <div
          className="blyss-card p-0 overflow-hidden mb-6 animate-slide-up"
          style={{ animationDelay: "0.5s" }}
        >
          {menuItems.map((item, index) => (
            <button
              key={index}
              onClick={() => navigate(item.path)}
              className="w-full flex items-center gap-4 px-4 py-4 hover:bg-muted/50 active:bg-muted active:scale-[0.99] transition-all border-b border-border last:border-b-0 group"
            >
              <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                <item.icon size={20} className="text-primary" />
              </div>
              <span className="flex-1 text-left font-semibold text-foreground">
                {item.label}
              </span>
              <ChevronRight size={20} className="text-muted-foreground group-hover:translate-x-1 transition-transform" />
            </button>
          ))}
        </div>

        {/* Toggle Thème - FONCTIONNEL */}
      <div className="relative mb-6 animate-slide-up" style={{ animationDelay: "0.55s" }}>
        <button
          onClick={toggleTheme}  // ← React handler (pas data-theme-toggler)
          className="group w-full blyss-card flex items-center gap-4 px-4 py-4 hover:shadow-lg active:scale-[0.98] transition-all duration-300 border border-border/50 hover:border-primary/30"
          title="Mode sombre/clair"
        >
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/10 to-secondary/10 group-hover:from-primary/20 group-hover:to-secondary/20 flex items-center justify-center transition-all duration-300 group-hover:scale-110">
            {theme === 'dark' ? 
              <Sun size={20} className="text-primary group-hover:rotate-12 transition-transform duration-300" /> : 
              <Moon size={20} className="text-primary group-hover:rotate-[-12px] transition-transform duration-300" />
            }
          </div>
          <div className="flex-1 text-left">
            <span className="block font-bold text-foreground text-base mb-0.5">
              Mode {theme === 'dark' ? 'clair' : 'sombre'}
            </span>
            <span className="text-sm text-muted-foreground font-medium">
              {theme === 'dark' ? 'Activez le mode jour' : 'Activez le mode nuit'}
            </span>
          </div>
          <ChevronRight size={20} className="text-muted-foreground group-hover:translate-x-1 transition-transform" />
        </button>
      </div>


        {/* Déconnexion */}
        <button
          onClick={handleLogout}
          className="blyss-card w-full flex items-center gap-4 animate-slide-up active:scale-[0.98] transition-all border-2 border-transparent hover:border-destructive/20 group"
          style={{ animationDelay: "0.6s" }}
        >
          <div className="w-11 h-11 rounded-xl bg-destructive/10 flex items-center justify-center group-hover:bg-destructive group-hover:scale-110 transition-all">
            <LogOut size={20} className="text-destructive group-hover:text-white transition-colors" />
          </div>
          <span className="flex-1 text-left font-semibold text-destructive">
            Se déconnecter
          </span>
        </button>

        <p
          className="text-center text-xs text-muted-foreground mt-8 animate-fade-in"
          style={{ animationDelay: "0.7s" }}
        >
          Blyss Pro v1.0.0
        </p>
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

        @keyframes scale-in {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }

        @keyframes pulse-soft {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.8; }
        }

        .animate-fade-in {
          animation: fade-in 0.5s ease-out forwards;
        }

        .animate-slide-up {
          animation: slide-up 0.5s ease-out forwards;
        }

        .animate-scale-in {
          animation: scale-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }

        .animate-pulse-soft {
          animation: pulse-soft 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
      `}</style>
    </MobileLayout>
  );
};

export default ProProfile;
