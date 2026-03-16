import MobileLayout from "@/components/MobileLayout";
import {
  ChevronLeft,
  Save,
  MapPin,
  Instagram,
  User,
  Info,
  Check,
  AlertCircle,
  Eye,
  EyeOff,
  Sparkles,
  Star,
  Calendar,
  X,
  Clock,
  Upload // Import manquant ajouté
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useRevenueCat } from "@/contexts/RevenueCatContext";
import { instagramApi, InstagramStatus } from "@/services/api";
import { getImageUrl } from "@/utils/imageUrl";
import { set } from "date-fns";

export interface ConditionItem {
  text: string;
  accepted: boolean;
}

// ── InputField hissé hors du composant pour éviter le remount à chaque frappe ──
interface InputFieldProps {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  helpText?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon?: any;
  maxLength?: number;
  isTouched?: boolean;
  error?: string;
  onBlur: (name: string, value: string) => void;
  onValidate: (name: string, value: string) => void;
}

const InputField = ({
  label, name, value, onChange, placeholder, helpText, icon: Icon,
  maxLength, isTouched, error, onBlur, onValidate,
}: InputFieldProps) => {
  const hasValue = value.length > 0;
  return (
    <div className="flex flex-col relative animate-slide-up">
      <label className={`text-xs font-medium mb-2 transition-colors duration-200 ${error ? "text-destructive" : hasValue ? "text-primary" : "text-muted-foreground"}`}>
        {label}
      </label>
      <div className="relative group">
        {Icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2">
            <Icon size={18} className={`transition-colors ${error ? "text-destructive" : hasValue ? "text-primary" : "text-muted-foreground"}`} />
          </div>
        )}
        <input
          type="text"
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
            ${Icon ? "pl-11" : ""}
          `}
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            const newValue = maxLength ? e.target.value.slice(0, maxLength) : e.target.value;
            onChange(newValue);
            if (isTouched) onValidate(name, newValue);
          }}
          onBlur={(e) => onBlur(name, e.target.value)}
          maxLength={maxLength}
        />
        {hasValue && !error && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-green-500/10 flex items-center justify-center animate-in zoom-in duration-200">
            <Check size={14} className="text-green-600" />
          </div>
        )}
        {error && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-destructive/10 flex items-center justify-center animate-in zoom-in duration-200">
            <AlertCircle size={14} className="text-destructive" />
          </div>
        )}
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

const ProPublicProfile = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activePlan } = useRevenueCat();

  // ── Instagram OAuth ──
  const [igStatus, setIgStatus] = useState<InstagramStatus | null>(null);
  const [igLoading, setIgLoading] = useState(false);
  const isSignature = activePlan === "signature";

  const fetchIgStatus = useCallback(async () => {
    if (!isSignature) return;
    try {
      const res = await instagramApi.getStatus();
      if (res.success && res.data) setIgStatus(res.data);
    } catch {
      // Silencieux — statut non critique
    }
  }, [isSignature]);

  useEffect(() => {
    fetchIgStatus();
  }, [fetchIgStatus]);

  // Lire le résultat du callback OAuth depuis l'URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const igConnected = params.get("ig_connected");
    const igError = params.get("ig_error");

    if (igConnected === "true") {
      toast.success("Instagram connecté avec succès !");
      window.history.replaceState({}, "", window.location.pathname);
      fetchIgStatus();
    } else if (igError) {
      const messages: Record<string, string> = {
        denied: "Connexion Instagram annulée.",
        invalid_state: "Lien expiré, réessaie.",
        plan_required: "Abonnement Signature requis.",
        server_error: "Erreur serveur, réessaie plus tard.",
      };
      toast.error(messages[igError] ?? "Erreur de connexion Instagram.");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [fetchIgStatus]);

  const handleIgConnect = async () => {
    setIgLoading(true);
    try {
      const res = await instagramApi.getConnectUrl();
      if (res.success && res.data?.authUrl) {
        window.location.href = res.data.authUrl;
      } else {
        toast.error("Impossible d'initier la connexion Instagram.");
      }
    } catch {
      toast.error("Erreur réseau, réessaie.");
    } finally {
      setIgLoading(false);
    }
  };

  const handleIgDisconnect = async () => {
    setIgLoading(true);
    try {
      await instagramApi.disconnect();
      setIgStatus({ connected: false });
      toast.success("Instagram déconnecté.");
    } catch {
      toast.error("Erreur lors de la déconnexion.");
    } finally {
      setIgLoading(false);
    }
  };

  const handleIgSync = async () => {
    setIgLoading(true);
    try {
      const res = await instagramApi.sync();
      if (res.success) {
        toast.success("Photos synchronisées !");
      } else if ((res as any).retryAfterSeconds) {
        toast.error(`Réessaie dans ${(res as any).retryAfterSeconds}s.`);
      } else {
        toast.error("Synchronisation échouée.");
      }
    } catch {
      toast.error("Erreur réseau.");
    } finally {
      setIgLoading(false);
    }
  };

  // États pour la gestion de la photo de bannière
  const [bannerPhoto, setBannerPhoto] = useState<string>("");
  const [initialBannerPhoto, setInitialBannerPhoto] = useState<string>("");
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string>("");
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);

  // États du formulaire
  const [activityName, setActivityName] = useState("");
  const [city, setCity] = useState("");
  const [bio, setBio] = useState("");
  const [conditions, setConditions] = useState<ConditionItem[]>([]);
  const [instagramAccount, setInstagramAccount] = useState("");
  const [profileVisibility, setProfileVisibility] = useState<"public" | "private">("public");

  // États initiaux pour détecter les changements
  const [initialActivityName, setInitialActivityName] = useState("");
  const [initialCity, setInitialCity] = useState("");
  const [initialBio, setInitialBio] = useState("");
  const [initialConditions, setInitialConditions] = useState<ConditionItem[]>([]);
  const [initialInstagramAccount, setInitialInstagramAccount] = useState("");
  const [initialProfileVisibility, setInitialProfileVisibility] = useState<"public" | "private">("public");

  // UX states
  const [fieldErrors, setFieldErrors] = useState<{ [key: string]: string }>({});
  const [touched, setTouched] = useState<{ [key: string]: boolean }>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const MAX_BIO_LENGTH = 500;
  const bioCharsRemaining = MAX_BIO_LENGTH - bio.length;

  const [profilePhoto, setProfilePhoto] = useState<string>("");
  const [initialProfilePhoto, setInitialProfilePhoto] = useState<string>("");

  useEffect(() => {
    const fetchUserData = async () => {
      setIsLoading(true);
      try {
        const BASE_URL = import.meta.env.VITE_API_URL || "";
        const response = await fetch(`${BASE_URL}/api/users`, {
          credentials: "include",
        });

        const data = await response.json();

        setActivityName(data.data.activity_name || "");
        setCity(data.data.city || "");
        setBio(data.data.bio || "");
        const parsedConditions: ConditionItem[] = data.data.acceptance_conditions
          ? (typeof data.data.acceptance_conditions === "string"
            ? JSON.parse(data.data.acceptance_conditions)
            : data.data.acceptance_conditions)
          : [];
        setConditions(parsedConditions);
        setInstagramAccount(data.data.instagram_account || "");
        setProfileVisibility(data.data.profile_visibility || "public");
        setBannerPhoto(data.data.banner_photo || ""); // NOUVEAU
        setProfilePhoto(data.data.profile_photo || "");

        setInitialActivityName(data.data.activity_name || "");
        setInitialCity(data.data.city || "");
        setInitialBio(data.data.bio || "");
        setInitialConditions(parsedConditions);
        setInitialInstagramAccount(data.data.instagram_account || "");
        setInitialProfileVisibility(data.data.profile_visibility || "public");
        setInitialBannerPhoto(data.data.banner_photo || ""); // NOUVEAU
        setInitialProfilePhoto(data.data.profile_photo || "");
      } catch (error) {
        toast.error("Impossible de charger tes données");
      } finally {
        setIsLoading(false);
      }
    };
    fetchUserData();
  }, []);


  // Détection des changements
  useEffect(() => {
    const changed =
      activityName !== initialActivityName ||
      city !== initialCity ||
      bio !== initialBio ||
      JSON.stringify(conditions) !== JSON.stringify(initialConditions) ||
      instagramAccount !== initialInstagramAccount ||
      profileVisibility !== initialProfileVisibility ||
      bannerFile !== null; // NOUVEAU
    setHasChanges(changed);
  }, [activityName, city, bio, conditions, instagramAccount, profileVisibility, bannerFile,
    initialActivityName, initialCity, initialBio, initialConditions, initialInstagramAccount,
    initialProfileVisibility]);


  // Lock scroll when preview is open
  useEffect(() => {
    if (showPreview) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [showPreview]);

  // Validation des champs
  const validateField = (name: string, value: string) => {
    const errors: { [key: string]: string } = { ...fieldErrors };

    switch (name) {
      case "activityName":
        if (!value.trim()) {
          errors[name] = "Le nom de ton activité est requis";
        } else if (value.length < 2) {
          errors[name] = "Le nom doit contenir au moins 2 caractères";
        } else if (value.length > 100) {
          errors[name] = "Maximum 100 caractères";
        } else {
          delete errors[name];
        }
        break;
      case "city":
        if (!value.trim()) {
          errors[name] = "La ville est requise";
        } else if (value.length < 2) {
          errors[name] = "Minimum 2 caractères";
        } else if (value.length > 100) {
          errors[name] = "Maximum 100 caractères";
        } else {
          delete errors[name];
        }
        break;
      case "bio":
        if (value.length > MAX_BIO_LENGTH) {
          errors[name] = `Maximum ${MAX_BIO_LENGTH} caractères`;
        } else {
          delete errors[name];
        }
        break;
      case "instagramAccount":
        if (value && !value.startsWith("@")) {
          errors[name] = "Le compte doit commencer par @";
        } else if (value && value.length > 50) {
          errors[name] = "Maximum 50 caractères";
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

  const addCondition = () => {
    if (conditions.length >= 8) return;
    setConditions(prev => [...prev, { text: "", accepted: true }]);
  };

  const removeCondition = (index: number) => {
    setConditions(prev => prev.filter((_, i) => i !== index));
  };

  const updateConditionText = (index: number, text: string) => {
    setConditions(prev => prev.map((c, i) => i === index ? { ...c, text: text.slice(0, 150) } : c));
  };

  const updateConditionAccepted = (index: number, accepted: boolean) => {
    setConditions(prev => prev.map((c, i) => i === index ? { ...c, accepted } : c));
  };

  const handleBannerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validation du fichier
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast.error("Format non supporté. Utilise JPG, PNG ou WebP");
      return;
    }

    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      toast.error("L'image ne doit pas dépasser 5MB");
      return;
    }

    setBannerFile(file);

    // Créer un aperçu local
    const reader = new FileReader();
    reader.onloadend = () => {
      setBannerPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const uploadBanner = async (): Promise<string | null> => {
    if (!bannerFile) return null;

    setIsUploadingBanner(true);
    const formData = new FormData();
    formData.append('banner', bannerFile);

    try {
      const BASE_URL = import.meta.env.VITE_API_URL || "";
      const response = await fetch(`${BASE_URL}/api/users/upload-banner`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Erreur lors de l'upload");
      }

      const result = await response.json();
      return result.data.banner_photo;
    } catch (error) {
      toast.error("Erreur lors de l'upload de la bannière");
      return null;
    } finally {
      setIsUploadingBanner(false);
    }
  };


  const handleSave = async () => {
    // Validation finale (garde le code existant)
    const errors: { [key: string]: string } = {};

    if (!activityName.trim()) {
      errors.activityName = "Le nom de ton activité est requis";
    }
    if (!city.trim()) {
      errors.city = "La ville est requise";
    }
    if (bio.length > MAX_BIO_LENGTH) {
      errors.bio = `Maximum ${MAX_BIO_LENGTH} caractères`;
    }
    if (instagramAccount && !instagramAccount.startsWith("@")) {
      errors.instagramAccount = "Le compte doit commencer par @";
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      toast.error("Corrige les erreurs avant d'enregistrer");
      return;
    }

    setIsSaving(true);

    // Upload de la bannière si elle a changé
    let bannerPath = bannerPhoto;
    if (bannerFile) {
      const uploadedPath = await uploadBanner();
      if (uploadedPath) {
        bannerPath = uploadedPath;
      } else {
        setIsSaving(false);
        return;
      }
    }

    const payload: any = {};
    if (activityName !== initialActivityName) payload.activity_name = activityName;
    if (city !== initialCity) payload.city = city;
    if (bio !== initialBio) payload.bio = bio;
    if (JSON.stringify(conditions) !== JSON.stringify(initialConditions)) payload.acceptance_conditions = conditions;
    if (instagramAccount !== initialInstagramAccount) payload.instagram_account = instagramAccount;
    if (profileVisibility !== initialProfileVisibility) payload.profile_visibility = profileVisibility;
    if (bannerPath !== initialBannerPhoto) payload.banner_photo = bannerPath; // NOUVEAU

    try {
      const BASE_URL = import.meta.env.VITE_API_URL || "";
      const response = await fetch(`${BASE_URL}/api/users/update`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        toast.error(errorData.message || "Une erreur est survenue");
        return;
      }

      const result = await response.json();
      if (result?.data) {
        localStorage.setItem("user", JSON.stringify(result.data));

        setInitialActivityName(result.data.activity_name || "");
        setInitialCity(result.data.city || "");
        setInitialBio(result.data.bio || "");
        const raw = result.data.acceptance_conditions;
        const savedConditions: ConditionItem[] = (() => {
          if (!raw) return [...conditions];
          const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
          if (!Array.isArray(parsed) || (parsed.length === 0 && conditions.length > 0)) return [...conditions];
          return parsed;
        })();
        setConditions(savedConditions);
        setInitialConditions(savedConditions);
        setInitialInstagramAccount(result.data.instagram_account || "");
        setInitialProfileVisibility(result.data.profile_visibility || "public");
        setInitialBannerPhoto(result.data.banner_photo || ""); // NOUVEAU
        setBannerPhoto(result.data.banner_photo || ""); // NOUVEAU
        setBannerFile(null); // NOUVEAU
        setBannerPreview(""); // NOUVEAU
      }

      toast.success("Profil public mis à jour !");
      setHasChanges(false);
      setTouched({});
    } catch (error) {
      toast.error("Une erreur réseau est survenue");
    } finally {
      setIsSaving(false);
    }
  };



  if (isLoading) {
    return (
      <MobileLayout showNav={false}>
        <div className="flex flex-col items-center justify-center h-screen">
          <div className="w-16 h-16 rounded-full border-4 border-primary/20 border-t-primary animate-spin mb-4"></div>
          <p className="text-sm text-muted-foreground animate-pulse">Chargement...</p>
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
              onClick={() => navigate("/pro/profile")}
              className="w-10 h-10 rounded-xl bg-muted hover:bg-muted-foreground/10 flex items-center justify-center active:scale-95 transition-all mr-3"
            >
              <ChevronLeft size={20} className="text-foreground" />
            </button>
            <div className="flex-1">
              <h1 className="font-display text-2xl font-bold text-foreground">
                Profil public
              </h1>
            </div>
            {/* Bouton Aperçu */}
            <button
              onClick={() => setShowPreview(true)}
              className="w-10 h-10 rounded-xl bg-primary/10 hover:bg-primary/20 flex items-center justify-center active:scale-95 transition-all"
            >
              <Eye size={20} className="text-primary" />
            </button>
          </div>
          <p className="text-muted-foreground text-sm animate-fade-in" style={{ animationDelay: "0.1s" }}>
            Informations visibles par tes clientes
          </p>
        </div>

        {/* Modal Aperçu - Version fidèle au SpecialistProfile */}
        {showPreview && (
          <div className="fixed inset-0 z-50 bg-white overflow-y-auto animate-fade-in">
            {/* Bannière */}
            <div className="relative h-64 w-full overflow-hidden bg-muted">
              {(bannerPreview || bannerPhoto) ? (
                <img
                  src={bannerPreview || getImageUrl(bannerPhoto) || ""}
                  alt="Bannière"
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Sparkles size={48} className="text-muted-foreground/30" />
                </div>
              )}

              {/* Overlay sombre */}
              <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />

              {/* Back button */}
              <button
                onClick={() => setShowPreview(false)}
                className="absolute left-4 top-4 w-10 h-10 rounded-full bg-white/90 backdrop-blur-sm shadow-lg flex items-center justify-center z-30 active:scale-95 transition-transform"
              >
                <X size={20} className="text-foreground" />
              </button>

              {/* Badge aperçu */}
              <div className="absolute right-4 top-4 px-3 py-1.5 rounded-full bg-primary/90 backdrop-blur-sm flex items-center gap-2 z-30">
                <Eye size={14} className="text-white" />
                <span className="text-xs font-semibold text-white">Aperçu</span>
              </div>
            </div>

            {/* Avatar */}
            <div className="absolute top-[200px] left-1/2 -translate-x-1/2 z-[100]">
              <div className="w-32 h-32 rounded-2xl bg-background border-4 border-background shadow-xl overflow-hidden">
                {profilePhoto ? (
                  <img
                    src={getImageUrl(profilePhoto) || ""}
                    alt="Profile"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-primary/10 flex items-center justify-center">
                    <span className="text-5xl font-bold text-primary">
                      {user?.first_name?.[0] || 'P'}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Contenu */}
            <div className="pt-20 space-y-6 px-4">
              {/* Header infos */}
              <section className="text-center space-y-3">
                <div>
                  <h1 className="text-2xl font-bold text-foreground mb-1">
                    {activityName || "Nom de l'activité"}
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    Prothésiste ongulaire
                  </p>
                </div>

                {/* Stats */}
                <div className="flex items-center justify-center gap-2">
                  <Star size={16} className="text-yellow-400 fill-yellow-400" />
                  <span className="font-semibold text-foreground">
                    {user?.avg_rating ? Number(user.avg_rating).toFixed(1) : "5.0"}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    ({user?.clients_count || "0"} avis)
                  </span>
                </div>


                {city && (
                  <div className="flex items-center justify-center gap-1.5">
                    <MapPin size={14} className="text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">{city}</span>
                  </div>
                )}

                {/* Instagram */}
                {instagramAccount && (
                  <a
                    href={`https://instagram.com/${instagramAccount.replace('@', '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-primary font-medium hover:underline active:scale-95 transition-transform"
                  >
                    <Instagram size={16} />
                    {instagramAccount.startsWith('@') ? instagramAccount : `@${instagramAccount}`}
                  </a>
                )}
              </section>

              {/* À propos */}
              {bio && (
                <section className="bg-card rounded-2xl p-4 shadow-sm border-2 border-border">
                  <h2 className="text-base font-bold text-foreground mb-2">
                    À propos
                  </h2>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {bio}
                  </p>
                </section>
              )}

              {/* Conditions de réservation - preview */}
              {conditions.filter(c => c.text.trim()).length > 0 && (
                <section className="space-y-2">
                  <h2 className="text-base font-bold text-foreground">
                    Conditions de réservation
                  </h2>
                  <div className="space-y-1.5">
                    {conditions.filter(c => c.text.trim()).map((c, i) => (
                      <div
                        key={i}
                        className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 border ${
                          c.accepted
                            ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800/40"
                            : "bg-rose-50/60 border-rose-200 dark:bg-rose-950/20 dark:border-rose-800/40"
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${c.accepted ? "bg-emerald-500" : "bg-rose-400"}`}>
                          {c.accepted
                            ? <Check size={10} className="text-white" strokeWidth={3} />
                            : <X size={10} className="text-white" strokeWidth={3} />
                          }
                        </div>
                        <span className={`text-xs font-medium ${c.accepted ? "text-emerald-800 dark:text-emerald-200" : "text-rose-700 dark:text-rose-300"}`}>
                          {c.text}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Prestations - Exemple */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-foreground">
                    Prestations
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    3 services
                  </span>
                </div>

                <div className="space-y-3">
                  <div className="bg-card rounded-2xl p-4 shadow-sm border-2 border-border">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <h3 className="font-semibold text-foreground text-sm mb-1">
                          Pose complète
                        </h3>
                        <p className="text-xs text-muted-foreground mb-2">
                          Extension gel ou résine avec forme au choix
                        </p>
                        <div className="flex items-center gap-1">
                          <Clock size={12} className="text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">
                            1h30
                          </span>
                        </div>
                      </div>
                      <span className="font-bold text-lg text-foreground">
                        65€
                      </span>
                    </div>
                  </div>

                  <div className="bg-card rounded-2xl p-4 shadow-sm border-2 border-border">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <h3 className="font-semibold text-foreground text-sm mb-1">
                          Remplissage
                        </h3>
                        <p className="text-xs text-muted-foreground mb-2">
                          Remplissage 3 semaines + vernis semi-permanent
                        </p>
                        <div className="flex items-center gap-1">
                          <Clock size={12} className="text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">
                            1h
                          </span>
                        </div>
                      </div>
                      <span className="font-bold text-lg text-foreground">
                        45€
                      </span>
                    </div>
                  </div>

                  <div className="bg-card rounded-2xl p-4 shadow-sm border-2 border-border">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <h3 className="font-semibold text-foreground text-sm mb-1">
                          Manucure simple
                        </h3>
                        <p className="text-xs text-muted-foreground mb-2">
                          Soin des mains et pose de vernis semi-permanent
                        </p>
                        <div className="flex items-center gap-1">
                          <Clock size={12} className="text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">
                            45min
                          </span>
                        </div>
                      </div>
                      <span className="font-bold text-lg text-foreground">
                        35€
                      </span>
                    </div>
                  </div>
                </div>
              </section>

              {/* CTA principal */}
              <section>
                <button
                  disabled
                  className="w-full py-4 rounded-2xl bg-primary text-white font-semibold shadow-lg shadow-primary/30 opacity-60 cursor-not-allowed"
                >
                  Réserver avec {activityName?.split(' ')[0] || user?.first_name}
                </button>
                <p className="text-center text-xs text-muted-foreground mt-2">
                  Le bouton sera actif pour tes clientes
                </p>
              </section>

              {/* Avis clients */}
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-foreground">
                    Avis clients
                  </h2>
                  <div className="flex items-center gap-1">
                    <Star size={14} className="text-yellow-400 fill-yellow-400" />
                    <span className="font-semibold text-foreground text-sm">
                      {user?.avg_rating ? Number(user.avg_rating).toFixed(1) : "5.0"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ({user?.clients_count || "0"})
                    </span>
                  </div>
                </div>


                <div className="space-y-3">
                  {/* Exemple d'avis 1 */}
                  <div className="bg-card rounded-2xl p-4 shadow-sm border-2 border-border">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-semibold text-primary">SM</span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-foreground text-sm">
                            Sophie M.
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Il y a 2 jours
                          </span>
                        </div>

                        <div className="flex items-center gap-0.5 mb-2">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              size={12}
                              className="text-yellow-400 fill-yellow-400"
                            />
                          ))}
                        </div>

                        <p className="text-sm text-muted-foreground leading-relaxed">
                          Prestation impeccable ! Très professionnelle et à l'écoute. Je recommande vivement 💖
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Exemple d'avis 2 */}
                  <div className="bg-card rounded-2xl p-4 shadow-sm border-2 border-border">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-semibold text-primary">JD</span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-foreground text-sm">
                            Julie D.
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Il y a 1 semaine
                          </span>
                        </div>

                        <div className="flex items-center gap-0.5 mb-2">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              size={12}
                              className="text-yellow-400 fill-yellow-400"
                            />
                          ))}
                        </div>

                        <p className="text-sm text-muted-foreground leading-relaxed">
                          Mes ongles sont magnifiques ! Travail soigné et ambiance très agréable.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Exemple d'avis 3 */}
                  <div className="bg-card rounded-2xl p-4 shadow-sm border-2 border-border">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-semibold text-primary">CL</span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-foreground text-sm">
                            Camille L.
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Il y a 2 semaines
                          </span>
                        </div>

                        <div className="flex items-center gap-0.5 mb-2">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              size={12}
                              className={`${star <= 4
                                ? "text-yellow-400 fill-yellow-400"
                                : "text-muted-foreground/30"
                                }`}
                            />
                          ))}
                        </div>

                        <p className="text-sm text-muted-foreground leading-relaxed">
                          Super expérience, je reviendrai sans hésiter !
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  disabled
                  className="w-full py-3 rounded-xl border-2 border-primary text-primary font-medium opacity-60 cursor-not-allowed text-sm"
                >
                  Laisser un avis
                </button>
              </section>

              {/* Message si profil privé */}
              {profileVisibility === "private" && (
                <section>
                  <div className="bg-destructive/5 border-2 border-destructive/20 rounded-2xl p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center flex-shrink-0">
                        <EyeOff size={18} className="text-destructive" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground mb-1">
                          Profil actuellement privé
                        </p>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Ton profil n'est pas visible par les clientes. Active la visibilité publique pour apparaître dans les recherches Blyss.
                        </p>
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {/* Footer */}
              <div className="pt-4 pb-8">
                <button
                  onClick={() => setShowPreview(false)}
                  className="w-full py-4 rounded-2xl bg-primary text-white font-semibold shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 active:scale-[0.98] transition-all"
                >
                  Fermer l'aperçu
                </button>
                <p className="text-xs text-muted-foreground mt-3 text-center">
                  Ceci est un aperçu. Tes vraies prestations et avis s'afficheront automatiquement.
                </p>
              </div>
            </div>
          </div>
        )}



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

        {/* Info card */}
        <div className="blyss-card mb-6 animate-scale-in overflow-hidden relative group hover:shadow-lg transition-all duration-300" style={{ animationDelay: "0.1s" }}>
          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <div className="relative flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center flex-shrink-0 shadow-lg">
              <Info size={20} className="text-white" />
            </div>
            <div className="flex-1 pt-1">
              <p className="text-base font-semibold text-foreground mb-1">
                Optimise ton profil
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Un profil complet et détaillé augmente tes chances d'être réservée de 3x. Prends le temps de bien remplir chaque champ.
              </p>
            </div>
          </div>
        </div>

        {/* SECTION : Bannière */}
        <div className="space-y-4 mb-6 animate-slide-up" style={{ animationDelay: "0.55s" }}>
          <div className="flex items-center gap-2 px-1">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Photo de bannière
            </h2>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
          </div>

          <div className="blyss-card hover:shadow-lg transition-shadow duration-300">
            <label className="text-xs font-medium mb-2 block text-muted-foreground">
              Bannière du profil
            </label>

            {/* Aperçu de la bannière */}
            <div className="relative w-full h-40 rounded-2xl overflow-hidden bg-muted mb-3 group">
              {(bannerPreview || bannerPhoto) ? (
                <img
                  src={bannerPreview || getImageUrl(bannerPhoto) || ""}
                  alt="Bannière"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                  <Sparkles size={32} className="mb-2 opacity-30" />
                  <p className="text-sm">Aucune bannière</p>
                </div>
              )}

              {/* Overlay au survol */}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <label htmlFor="banner-upload" className="cursor-pointer px-4 py-2 bg-white rounded-xl text-sm font-semibold text-foreground">
                  {bannerPhoto || bannerPreview ? "Changer" : "Ajouter"}
                </label>
              </div>
            </div>

            {/* Input caché */}
            <input
              id="banner-upload"
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp"
              onChange={handleBannerChange}
              className="hidden"
            />

            {/* Bouton visible */}
            <label
              htmlFor="banner-upload"
              className="w-full py-3 rounded-xl border-2 border-primary/30 text-primary font-medium flex items-center justify-center gap-2 cursor-pointer hover:bg-primary/5 transition-colors active:scale-95"
            >
              <Upload size={18} />
              {bannerPhoto || bannerPreview ? "Changer la bannière" : "Ajouter une bannière"}
            </label>

            <p className="text-xs text-muted-foreground mt-2">
              Format : JPG, PNG ou WebP • Taille max : 5MB • Dimension recommandée : 1200x400px
            </p>

            {isUploadingBanner && (
              <div className="mt-3 flex items-center gap-2 text-primary">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent"></div>
                <span className="text-sm">Upload en cours...</span>
              </div>
            )}
          </div>
        </div>


        {/* SECTION : Informations principales */}
        <div className="space-y-4 mb-6 animate-slide-up" style={{ animationDelay: "0.2s" }}>
          <div className="flex items-center gap-2 px-1">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Informations principales
            </h2>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
          </div>

          <div className="blyss-card flex flex-col gap-5 hover:shadow-lg transition-shadow duration-300">
            <InputField
              label="Nom de ton activité *"
              name="activityName"
              value={activityName}
              onChange={setActivityName}
              placeholder="Ex : Nails by Emma"
              icon={User}
              helpText="Le nom sous lequel tes clientes te trouveront sur Blyss."
              maxLength={100}
              isTouched={touched.activityName}
              error={fieldErrors.activityName}
              onBlur={handleBlur}
              onValidate={validateField}
            />

            <InputField
              label="Ville / Zone *"
              name="city"
              value={city}
              onChange={setCity}
              placeholder="Ex : Paris 11e, Lyon centre"
              icon={MapPin}
              helpText="Aide tes clientes à te localiser facilement."
              maxLength={100}
              isTouched={touched.city}
              error={fieldErrors.city}
              onBlur={handleBlur}
              onValidate={validateField}
            />
          </div>
        </div>

        {/* SECTION : Bio + Conditions */}
        <div className="space-y-4 mb-6 animate-slide-up" style={{ animationDelay: "0.3s" }}>
          <div className="flex items-center gap-2 px-1">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              À propos de toi
            </h2>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
          </div>

          <div className="blyss-card hover:shadow-lg transition-shadow duration-300">
            <label className={`text-xs font-medium mb-2 block transition-colors duration-200 ${touched.bio && fieldErrors.bio ? "text-destructive" : bio.length > 0 ? "text-primary" : "text-muted-foreground"
              }`}>
              Biographie
            </label>
            <div className="relative group">
              <textarea
                className={`
                  border-2 rounded-2xl px-4 py-3 w-full text-sm bg-background resize-none
                  transition-all duration-300 ease-out
                  focus:outline-none focus:ring-4 focus:scale-[1.02]
                  ${touched.bio && fieldErrors.bio
                    ? "border-destructive focus:ring-destructive/10 focus:border-destructive"
                    : bio.length > 0
                      ? "border-primary/30 focus:ring-primary/10 focus:border-primary"
                      : "border-muted focus:ring-primary/10 focus:border-primary/50"
                  }
                `}
                rows={4}
                placeholder="Parle de ton parcours, tes spécialités, ce qui te passionne..."
                value={bio}
                onChange={(e) => {
                  const newValue = e.target.value.slice(0, MAX_BIO_LENGTH);
                  setBio(newValue);
                  if (touched.bio) validateField("bio", newValue);
                }}
                onBlur={(e) => handleBlur("bio", e.target.value)}
                maxLength={MAX_BIO_LENGTH}
              />
            </div>

            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-muted-foreground">
                Aide tes clientes à mieux te connaître
              </p>
              <p className={`text-xs font-medium ${bioCharsRemaining < 50 ? "text-destructive" : "text-muted-foreground"
                }`}>
                {bioCharsRemaining} / {MAX_BIO_LENGTH}
              </p>
            </div>

            {touched.bio && fieldErrors.bio && (
              <div className="mt-2 flex items-start gap-2 animate-in slide-in-from-top-1 duration-200">
                <AlertCircle size={14} className="text-destructive mt-0.5 flex-shrink-0" />
                <p className="text-xs text-destructive leading-relaxed">
                  {fieldErrors.bio}
                </p>
              </div>
            )}
          </div>

          {/* Conditions d'acceptation */}
        </div>

        {/* SECTION : Conditions de réservation */}
        <div className="space-y-4 mb-6 animate-slide-up" style={{ animationDelay: "0.35s" }}>
          <div className="flex items-center gap-2 px-1">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Conditions de réservation
            </h2>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
          </div>

          <p className="text-xs text-muted-foreground px-1 leading-relaxed">
            Écris tes propres conditions. Les clientes les verront sur ton profil.
          </p>

          <div className="space-y-2">
            {conditions.map((cond, index) => (
              <div
                key={index}
                className={`rounded-2xl border-2 p-3 transition-all duration-200 ${
                  cond.accepted
                    ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-800/40 dark:bg-emerald-950/20"
                    : "border-rose-200 bg-rose-50/40 dark:border-rose-800/40 dark:bg-rose-950/20"
                }`}
              >
                {/* Ligne 1 : toggle + delete */}
                <div className="flex items-center gap-2 mb-2.5">
                  <div className="flex rounded-xl overflow-hidden border-2 border-border bg-background flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => updateConditionAccepted(index, true)}
                      className={`flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold transition-all duration-150 ${
                        cond.accepted
                          ? "bg-emerald-500 text-white"
                          : "text-muted-foreground hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950/40"
                      }`}
                    >
                      <Check size={11} strokeWidth={3} />
                      J'accepte
                    </button>
                    <div className="w-px bg-border" />
                    <button
                      type="button"
                      onClick={() => updateConditionAccepted(index, false)}
                      className={`flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold transition-all duration-150 ${
                        !cond.accepted
                          ? "bg-rose-500 text-white"
                          : "text-muted-foreground hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
                      }`}
                    >
                      <X size={11} strokeWidth={3} />
                      J'accepte pas
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeCondition(index)}
                    className="ml-auto w-7 h-7 rounded-xl bg-muted hover:bg-destructive/10 hover:text-destructive flex items-center justify-center text-muted-foreground transition-colors flex-shrink-0"
                    aria-label="Supprimer"
                  >
                    <X size={13} />
                  </button>
                </div>

                {/* Ligne 2 : champ texte */}
                <input
                  type="text"
                  value={cond.text}
                  onChange={(e) => updateConditionText(index, e.target.value)}
                  placeholder="Ex : Déplacement possible, Test allergie requis..."
                  maxLength={150}
                  className={`w-full text-sm bg-transparent border-none outline-none placeholder:text-muted-foreground/50 font-medium ${
                    cond.accepted ? "text-emerald-800 dark:text-emerald-200" : "text-rose-700 dark:text-rose-300"
                  }`}
                />

                {cond.text.length > 120 && (
                  <p className="text-[10px] text-muted-foreground mt-1 text-right">
                    {150 - cond.text.length} restants
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Bouton ajouter */}
          {conditions.length < 8 && (
            <button
              type="button"
              onClick={addCondition}
              className="w-full py-3 rounded-2xl border-2 border-dashed border-primary/30 text-primary text-sm font-medium hover:border-primary/60 hover:bg-primary/5 active:scale-[0.98] transition-all duration-150 flex items-center justify-center gap-2"
            >
              <span className="text-lg leading-none">+</span>
              Ajouter une condition
            </button>
          )}

          {conditions.length > 0 && (
            <p className="text-xs text-center text-muted-foreground">
              {conditions.length} / 8 condition{conditions.length > 1 ? "s" : ""}
            </p>
          )}
        </div>

        {/* SECTION : Réseaux sociaux */}
        <div className="space-y-4 mb-6 animate-slide-up" style={{ animationDelay: "0.4s" }}>
          <div className="flex items-center gap-2 px-1">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Réseaux sociaux
            </h2>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
          </div>

          <div className="blyss-card hover:shadow-lg transition-shadow duration-300">
            <InputField
              label="Instagram (optionnel)"
              name="instagramAccount"
              value={instagramAccount}
              onChange={setInstagramAccount}
              placeholder="@toncompte"
              icon={Instagram}
              helpText="Ton compte Instagram sera affiché sur ton profil Blyss."
              maxLength={50}
              isTouched={touched.instagramAccount}
              error={fieldErrors.instagramAccount}
              onBlur={handleBlur}
              onValidate={validateField}
            />
          </div>

          {/* ── Instagram Photos (Signature only) ── */}
          {isSignature ? (
            <div className="blyss-card hover:shadow-lg transition-shadow duration-300">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center flex-shrink-0">
                  <Instagram size={18} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    Photos Instagram
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {igStatus?.connected
                      ? `Connecté en tant que @${igStatus.username}`
                      : "Affiche tes 6 dernières photos sur ton profil"}
                  </p>
                </div>
                {igStatus?.connected && (
                  <span className="text-xs font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 flex-shrink-0">
                    Actif
                  </span>
                )}
              </div>

              {igStatus?.connected ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleIgSync}
                    disabled={igLoading}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium border-2 border-primary text-primary active:scale-95 transition-all disabled:opacity-50"
                  >
                    {igLoading ? "..." : "Synchroniser"}
                  </button>
                  <button
                    type="button"
                    onClick={handleIgDisconnect}
                    disabled={igLoading}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium border-2 border-destructive/30 text-destructive active:scale-95 transition-all disabled:opacity-50"
                  >
                    Déconnecter
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleIgConnect}
                  disabled={igLoading}
                  className="w-full py-3 rounded-xl text-sm font-semibold bg-primary text-white active:scale-95 transition-all shadow-sm shadow-primary/25 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {igLoading ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  ) : (
                    <Instagram size={16} />
                  )}
                  {igLoading ? "Connexion..." : "Connecter Instagram"}
                </button>
              )}
            </div>
          ) : (
            <div className="blyss-card border-2 border-dashed border-muted bg-muted/20">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
                  <Instagram size={18} className="text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-muted-foreground">
                    Photos Instagram
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Disponible avec le plan{" "}
                    <span
                      className="font-semibold text-foreground cursor-pointer underline underline-offset-2"
                      onClick={() => navigate("/pro/subscription")}
                    >
                      Signature
                    </span>
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* SECTION : Visibilité */}
        <div className="space-y-4 mb-6 animate-slide-up" style={{ animationDelay: "0.5s" }}>
          <div className="flex items-center gap-2 px-1">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Visibilité du profil
            </h2>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
          </div>

          <div className="blyss-card hover:shadow-lg transition-shadow duration-300">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-start gap-3 flex-1">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors duration-300 ${profileVisibility === "public" ? "bg-primary/10" : "bg-muted"
                  }`}>
                  {profileVisibility === "public" ? (
                    <Eye size={18} className="text-primary" />
                  ) : (
                    <EyeOff size={18} className="text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1">
                  <span className="text-sm font-semibold text-foreground block mb-1">
                    Profil {profileVisibility === "public" ? "public" : "privé"}
                  </span>
                  <span className="text-xs text-muted-foreground leading-relaxed block">
                    {profileVisibility === "public"
                      ? "Ton profil est visible par toutes les clientes sur Blyss."
                      : "Ton profil n'est visible que par toi."}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setProfileVisibility(profileVisibility === "public" ? "private" : "public")}
                className={`
                  relative w-14 h-8 rounded-full transition-all duration-300 flex-shrink-0
                  ${profileVisibility === "public" ? "bg-primary shadow-lg shadow-primary/30" : "bg-muted"}
                  active:scale-95
                `}
              >
                <div className={`
                  absolute top-1 w-6 h-6 rounded-full bg-white shadow-md
                  transition-all duration-300 ease-out
                  ${profileVisibility === "public" ? "left-7 scale-110" : "left-1"}
                `} />
              </button>
            </div>
          </div>
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
                ? "bg-blyss-pink text-white active:scale-[0.97] shadow-lg shadow-blyss-pink/30 hover:bg-blyss-pink/90 scale-105"
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
                Enregistrer le profil public
              </>
            ) : (
              <>
                <Check size={18} />
                Profil à jour
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

        @keyframes slide-up-modal {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }

        @keyframes scale-in {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }

        .animate-fade-in {
          animation: fade-in 0.5s ease-out forwards;
        }

        .animate-slide-up {
          animation: slide-up 0.5s ease-out forwards;
        }

        .animate-slide-up-modal {
          animation: slide-up-modal 0.3s ease-out forwards;
        }

        .animate-scale-in {
          animation: scale-in 0.4s ease-out forwards;
        }
      `}</style>
    </MobileLayout>
  );
};

export default ProPublicProfile;
