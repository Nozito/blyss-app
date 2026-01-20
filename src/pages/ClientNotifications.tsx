import MobileLayout from "@/components/MobileLayout";
import { ArrowLeft, Info, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import api, { type ClientNotificationSettings } from "@/services/api";

type NotificationKey = keyof ClientNotificationSettings;

const ClientNotifications = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [preferences, setPreferences] = useState<ClientNotificationSettings>({
    reminders: true,
    changes: true,
    messages: true,
    late: true,
    offers: true,
    email_summary: false
  });

  useEffect(() => {
    const fetchPreferences = async () => {
      try {
        const response = await api.notifications.getSettings();
        if (response.success && response.data) {
          setPreferences(response.data);
        }
      } catch (error) {
        console.error("Erreur lors du chargement des préférences:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPreferences();
  }, []);

  const togglePreference = async (key: NotificationKey) => {
    const newValue = !preferences[key];
    
    setPreferences((prev) => ({ ...prev, [key]: newValue }));
    
    setIsSaving(true);
    try {
      const payload = { [key]: newValue };
      await api.notifications.updateSettings(payload);
    } catch (error) {
      console.error("Erreur lors de la sauvegarde:", error);
      setPreferences((prev) => ({ ...prev, [key]: !newValue }));
    } finally {
      setIsSaving(false);
    }
  };

  const goToSystemSettings = () => {
    if (window.confirm("Ouvrir les réglages système de ton téléphone ?")) {
      console.log("Redirection vers les paramètres système");
    }
  };

  if (isLoading) {
    return (
      <MobileLayout showNav={false}>
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary" />
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout showNav={false}>
      <div className="min-h-screen bg-background">
        {/* ✅ Header fixe avec fond */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border">
          <div className="px-5 py-4">
            <div className="flex items-center gap-3 mb-2">
              <button
                onClick={() => navigate("/client/profile")}
                className="p-2 -ml-2 rounded-xl hover:bg-muted active:scale-95 transition-all"
              >
                <ArrowLeft size={24} className="text-foreground" />
              </button>
              <h1 className="text-2xl font-bold text-foreground">
                Notifications
              </h1>
              {isSaving && (
                <div className="ml-auto flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span className="text-xs text-muted-foreground">Enregistrement...</span>
                </div>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Personnalise tes préférences de notifications
            </p>
          </div>
        </div>

        {/* ✅ Contenu avec padding */}
        <div className="px-5 py-6 space-y-6">
          {/* ✅ Bloc info amélioré */}
          <div className="bg-gradient-to-br from-primary/5 to-primary/10 rounded-2xl p-4 border border-primary/20">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                <Info size={20} className="text-primary" />
              </div>
              <div className="flex-1 pt-1">
                <p className="text-sm font-semibold text-foreground mb-1">
                  Rappels importants
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Garde activés les rappels de rendez-vous et les messages de tes expertes pour ne rien manquer.
                </p>
              </div>
            </div>
          </div>

          {/* ✅ SECTION 1 : Rendez-vous */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-border" />
              <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Rendez-vous
              </h2>
              <div className="h-px flex-1 bg-border" />
            </div>

            <div className="space-y-3">
              {[
                {
                  key: "reminders" as NotificationKey,
                  label: "Confirmation & rappels",
                  description: "Confirmation, rappel la veille et 1h avant"
                },
                {
                  key: "changes" as NotificationKey,
                  label: "Modifications & annulations",
                  description: "Si l'experte modifie ou annule"
                },
                {
                  key: "late" as NotificationKey,
                  label: "Retard de l'experte",
                  description: "Si ton rendez-vous prend du retard"
                }
              ].map(({ key, label, description }) => (
                <div 
                  key={key} 
                  className="bg-card rounded-2xl p-4 border-2 border-muted shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1">
                      <p className="font-semibold text-sm text-foreground mb-0.5">
                        {label}
                      </p>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {description}
                      </p>
                    </div>
                    
                    <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={preferences[key]}
                        onChange={() => togglePreference(key)}
                        disabled={isSaving}
                      />
                      <div className="w-11 h-6 bg-muted peer-checked:bg-primary rounded-full transition-all peer-disabled:opacity-50 peer-checked:shadow-lg peer-checked:shadow-primary/30" />
                      <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow-md peer-checked:translate-x-5 transition-transform" />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ✅ SECTION 2 : Messages */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-border" />
              <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Messages
              </h2>
              <div className="h-px flex-1 bg-border" />
            </div>

            <div className="space-y-3">
              <div className="bg-card rounded-2xl p-4 border-2 border-muted shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex-1">
                    <p className="font-semibold text-sm text-foreground mb-0.5">
                      Nouveaux messages
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Quand une experte t'envoie un message
                    </p>
                  </div>
                  
                  <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={preferences.messages}
                      onChange={() => togglePreference("messages")}
                      disabled={isSaving}
                    />
                    <div className="w-11 h-6 bg-muted peer-checked:bg-primary rounded-full transition-all peer-disabled:opacity-50 peer-checked:shadow-lg peer-checked:shadow-primary/30" />
                    <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow-md peer-checked:translate-x-5 transition-transform" />
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* ✅ SECTION 3 : Offres */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-border" />
              <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Promotions
              </h2>
              <div className="h-px flex-1 bg-border" />
            </div>

            <div className="space-y-3">
              {[
                {
                  key: "offers" as NotificationKey,
                  label: "Offres & promotions",
                  description: "Codes promo et offres de tes expertes favorites"
                },
                {
                  key: "email_summary" as NotificationKey,
                  label: "Résumé par email",
                  description: "Résumé de tes rendez-vous et nouveautés"
                }
              ].map(({ key, label, description }) => (
                <div 
                  key={key} 
                  className="bg-card rounded-2xl p-4 border-2 border-muted shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1">
                      <p className="font-semibold text-sm text-foreground mb-0.5">
                        {label}
                      </p>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {description}
                      </p>
                    </div>
                    
                    <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={preferences[key]}
                        onChange={() => togglePreference(key)}
                        disabled={isSaving}
                      />
                      <div className="w-11 h-6 bg-muted peer-checked:bg-primary rounded-full transition-all peer-disabled:opacity-50 peer-checked:shadow-lg peer-checked:shadow-primary/30" />
                      <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow-md peer-checked:translate-x-5 transition-transform" />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ✅ SECTION 4 : Réglages système */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-border" />
              <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Système
              </h2>
              <div className="h-px flex-1 bg-border" />
            </div>

            <div className="bg-gradient-to-br from-muted/50 to-muted/30 rounded-2xl p-4 border-2 border-muted">
              <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                Si les notifications sont désactivées dans les réglages de ton téléphone, 
                certains paramètres ci-dessus ne fonctionneront pas.
              </p>
              <button
                type="button"
                onClick={goToSystemSettings}
                className="w-full py-2.5 px-4 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary font-semibold text-sm active:scale-95 transition-all"
              >
                Ouvrir les réglages système
              </button>
            </div>
          </div>

          <div className="h-6" />
        </div>
      </div>
    </MobileLayout>
  );
};

export default ClientNotifications;
