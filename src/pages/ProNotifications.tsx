import MobileLayout from "@/components/MobileLayout";
import { ChevronLeft, Info, Bell, Calendar, MessageSquare, CreditCard, TrendingUp, Settings, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { getApiEndpoint } from "@/services/api";

type ProNotificationKey =
  | "newBookings"
  | "changes"
  | "todayReminders"
  | "clientMessages"
  | "paymentAlerts"
  | "activitySummary";

const ProNotifications = () => {
  const navigate = useNavigate();

  const [preferences, setPreferences] = useState<Record<ProNotificationKey, boolean>>({
    newBookings: true,
    changes: true,
    todayReminders: true,
    clientMessages: true,
    paymentAlerts: true,
    activitySummary: false
  });

  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // ✅ Charger les préférences au montage
  useEffect(() => {
    const fetchNotificationSettings = async () => {
      setIsLoading(true);
      try {
        const token = localStorage.getItem("access_token");
        if (!token) {
          console.warn("Pas de token d'authentification trouvé");
          setIsLoading(false);
          return;
        }

        // ✅ Utilise getApiEndpoint au lieu de construire l'URL manuellement
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(getApiEndpoint('/api/pro/notification-settings'), {
          headers: { 
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || "Erreur lors du chargement");
        }

        const data = await response.json();
        
        // ✅ Mapping BDD -> React State
        if (data.success && data.data) {
          setPreferences({
            newBookings: Boolean(data.data.new_reservation),
            changes: Boolean(data.data.cancel_change),
            todayReminders: Boolean(data.data.daily_reminder),
            clientMessages: Boolean(data.data.client_message),
            paymentAlerts: Boolean(data.data.payment_alert),
            activitySummary: Boolean(data.data.activity_summary),
          });
        }
      } catch (error: any) {
        console.error("Erreur lors du chargement des préférences:", error);
        
        if (error.name === 'AbortError') {
          toast.error("Le serveur met trop de temps à répondre");
        } else if (error.message.includes('Failed to fetch')) {
          toast.error("Impossible de se connecter au serveur");
        } else {
          toast.error("Impossible de charger tes préférences");
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchNotificationSettings();
  }, []);

  const togglePreference = (key: ProNotificationKey) => {
    setPreferences((prev) => ({ ...prev, [key]: !prev[key] }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    setSaving(true);
    
    try {
      const token = localStorage.getItem("access_token");
      
      if (!token) {
        toast.error("Session expirée, veuillez vous reconnecter");
        navigate("/login");
        return;
      }
      
      // ✅ Mapping React State -> BDD (format attendu par le backend)
      const payload = {
        new_reservation: preferences.newBookings ? 1 : 0,
        cancel_change: preferences.changes ? 1 : 0,
        daily_reminder: preferences.todayReminders ? 1 : 0,
        client_message: preferences.clientMessages ? 1 : 0,
        payment_alert: preferences.paymentAlerts ? 1 : 0,
        activity_summary: preferences.activitySummary ? 1 : 0,
      };

      console.log("Envoi des préférences:", payload);

      // ✅ Utilise getApiEndpoint au lieu de construire l'URL manuellement
      const response = await fetch(getApiEndpoint('/api/pro/notification-settings'), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Une erreur est survenue");
      }

      console.log("Réponse du serveur:", data);

      toast.success("Préférences enregistrées avec succès !");
      setHasChanges(false);
      
    } catch (error: any) {
      console.error("Erreur lors de la sauvegarde:", error);
      
      if (error.message.includes('Failed to fetch')) {
        toast.error("Impossible de se connecter au serveur");
      } else {
        toast.error(error.message || "Une erreur est survenue");
      }
    } finally {
      setSaving(false);
    }
  };

  const goToSystemSettings = () => {
    toast.info("Ouvre les réglages de ton téléphone pour activer les notifications Blyss");
  };

  // Composant Toggle
  const NotificationToggle = ({
    icon: Icon,
    title,
    description,
    prefKey,
    isEnabled,
    recommended = false,
  }: {
    icon: any;
    title: string;
    description: string;
    prefKey: ProNotificationKey;
    isEnabled: boolean;
    recommended?: boolean;
  }) => {
    return (
      <div className={`
        blyss-card group hover:shadow-lg transition-all duration-300
        ${isEnabled ? "bg-gradient-to-br from-primary/5 to-transparent" : ""}
      `}>
        <div className="flex items-start gap-4">
          <div className={`
            w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0
            transition-all duration-300
            ${isEnabled 
              ? "bg-primary/10 scale-110" 
              : "bg-muted group-hover:bg-muted-foreground/10"
            }
          `}>
            <Icon size={20} className={isEnabled ? "text-primary" : "text-muted-foreground"} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold text-sm text-foreground">
                {title}
              </span>
              {recommended && (
                <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-wide animate-in zoom-in duration-200">
                  Recommandé
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {description}
            </p>
          </div>

          <button
            type="button"
            onClick={() => togglePreference(prefKey)}
            className={`
              relative w-14 h-8 rounded-full flex-shrink-0
              transition-all duration-300 ease-out
              ${isEnabled 
                ? "bg-primary shadow-lg shadow-primary/30" 
                : "bg-muted hover:bg-muted-foreground/10"
              }
              active:scale-95
            `}
          >
            <div className={`
              absolute top-1 w-6 h-6 rounded-full bg-white shadow-md
              transition-all duration-300 ease-out
              ${isEnabled ? "left-7 scale-110" : "left-1"}
              flex items-center justify-center
            `}>
              {isEnabled && (
                <div className="w-2 h-2 rounded-full bg-primary animate-in zoom-in duration-200" />
              )}
            </div>
          </button>
        </div>
      </div>
    );
  };

  const enabledCount = Object.values(preferences).filter(Boolean).length;
  const totalCount = Object.keys(preferences).length;

  if (isLoading) {
    return (
      <MobileLayout showNav={false}>
        <div className="flex flex-col items-center justify-center h-screen">
          <div className="w-16 h-16 rounded-full border-4 border-primary/20 border-t-primary animate-spin mb-4"></div>
          <p className="text-sm text-muted-foreground animate-pulse">Chargement de tes préférences...</p>
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout showNav={false}>
      <div className="min-h-screen py-6">
        {/* ... Reste du JSX identique ... */}
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
                Notifications pro
              </h1>
            </div>
          </div>
          <p className="text-muted-foreground text-sm animate-fade-in" style={{ animationDelay: "0.1s" }}>
            Gère tes alertes pour ne rien manquer de ton activité.
          </p>
        </div>

        {/* Badge de modifications en attente */}
        {hasChanges && (
          <div className="blyss-card mb-6 bg-primary/5 border-2 border-primary/20 animate-in slide-in-from-top-2 duration-300">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Bell size={18} className="text-primary animate-pulse" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">
                  Modifications non enregistrées
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  N'oublie pas de sauvegarder tes préférences
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Stats card */}
        <div className="blyss-card mb-6 animate-scale-in overflow-hidden relative group hover:shadow-lg transition-all duration-300" style={{ animationDelay: "0.1s" }}>
          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <div className="relative flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center flex-shrink-0 shadow-lg">
              <Bell size={20} className="text-white" />
            </div>
            <div className="flex-1 pt-1">
              <div className="flex items-baseline gap-2 mb-1">
                <p className="text-2xl font-bold text-foreground">
                  {enabledCount}/{totalCount}
                </p>
                <p className="text-sm text-muted-foreground">notifications actives</p>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Les notifications te permettent de rester informée en temps réel de ton activité Blyss et d'éviter les no-shows.
              </p>
            </div>
          </div>
        </div>

        {/* SECTION : Rendez-vous & clientes */}
        <div className="space-y-3 mb-6 animate-slide-up" style={{ animationDelay: "0.2s" }}>
          <div className="flex items-center gap-2 px-1">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Calendar size={12} />
              Rendez-vous & clientes
            </h2>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
          </div>

          <div className="space-y-3">
            <NotificationToggle
              icon={Bell}
              title="Nouvelles réservations"
              description="Notification dès qu'une cliente réserve un nouveau créneau chez toi."
              prefKey="newBookings"
              isEnabled={preferences.newBookings}
              recommended={true}
            />

            <NotificationToggle
              icon={Calendar}
              title="Changements & annulations"
              description="Alertes en cas de modification d'horaire ou d'annulation par la cliente."
              prefKey="changes"
              isEnabled={preferences.changes}
              recommended={true}
            />

            <NotificationToggle
              icon={Sparkles}
              title="Rappels du jour"
              description="Récap' de tes rendez-vous du jour et premiers créneaux à venir."
              prefKey="todayReminders"
              isEnabled={preferences.todayReminders}
            />

            <NotificationToggle
              icon={MessageSquare}
              title="Messages clientes"
              description="Notification quand une cliente t'écrit ou répond à un message."
              prefKey="clientMessages"
              isEnabled={preferences.clientMessages}
              recommended={true}
            />
          </div>
        </div>

        {/* SECTION : Paiement & activité */}
        <div className="space-y-3 mb-6 animate-slide-up" style={{ animationDelay: "0.3s" }}>
          <div className="flex items-center gap-2 px-1">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <CreditCard size={12} />
              Paiement & activité
            </h2>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
          </div>

          <div className="space-y-3">
            <NotificationToggle
              icon={CreditCard}
              title="Paiement & réservations garanties"
              description="Alertes quand un acompte est encaissé ou qu'une réservation est garantie."
              prefKey="paymentAlerts"
              isEnabled={preferences.paymentAlerts}
            />

            <NotificationToggle
              icon={TrendingUp}
              title="Résumé d'activité"
              description="Un résumé occasionnel (jour/semaine) avec ton nombre de rendez-vous et ton CA estimé."
              prefKey="activitySummary"
              isEnabled={preferences.activitySummary}
            />
          </div>
        </div>

        {/* SECTION : Réglages système */}
        <div className="space-y-3 mb-6 animate-slide-up" style={{ animationDelay: "0.4s" }}>
          <div className="flex items-center gap-2 px-1">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Settings size={12} />
              Réglages système
            </h2>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
          </div>

          <div className="blyss-card bg-gradient-to-br from-muted/50 to-transparent hover:shadow-lg transition-all duration-300">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Info size={18} className="text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground mb-1">
                  Autorisations système
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Si les notifications sont désactivées pour Blyss dans les réglages de ton téléphone, les paramètres ci-dessus ne fonctionneront pas.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={goToSystemSettings}
              className="w-full py-3 px-4 rounded-xl bg-muted hover:bg-muted-foreground/10 text-sm font-medium text-foreground flex items-center justify-center gap-2 active:scale-95 transition-all"
            >
              <Settings size={16} />
              Ouvrir les réglages de notifications
            </button>
          </div>
        </div>

        {/* Info supplémentaire */}
        <div className="blyss-card bg-gradient-to-br from-primary/5 to-transparent border border-primary/10 animate-slide-up" style={{ animationDelay: "0.5s" }}>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Sparkles size={16} className="text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-semibold text-foreground mb-1">
                💡 Conseil pro
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Active au minimum les notifications de nouvelles réservations, changements et messages clientes pour réduire les no-shows et améliorer ton taux de remplissage.
              </p>
            </div>
          </div>
        </div>

        {/* Bouton Enregistrer fixe en bas */}
        <div className={`
          sticky bottom-0 -mx-4 px-4 pt-6 pb-6 bg-gradient-to-t from-background via-background to-transparent
          transition-all duration-300
          ${hasChanges ? "animate-in slide-in-from-bottom-4" : ""}
        `}>
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className={`
              w-full py-4 rounded-2xl font-semibold text-sm
              transition-all duration-300 ease-out
              flex items-center justify-center gap-2
              ${hasChanges && !saving
                ? "bg-primary text-white active:scale-[0.97] shadow-lg hover:shadow-xl scale-105"
                : "bg-muted text-muted-foreground cursor-not-allowed scale-100"
              }
            `}
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-current border-t-transparent"></div>
                Enregistrement en cours...
              </>
            ) : hasChanges ? (
              <>
                <Bell size={18} />
                Enregistrer les préférences
              </>
            ) : (
              <>
                <Bell size={18} />
                Préférences à jour
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

        .animate-scale-in {
          animation: scale-in 0.4s ease-out forwards;
        }
      `}</style>
    </MobileLayout>
  );
};

export default ProNotifications;
