import MobileLayout from "@/components/MobileLayout";
import { ChevronLeft, Banknote, Info, Check, AlertCircle, CreditCard, Shield, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { paymentsApi } from "@/services/api";
import { toast } from "sonner";

type OnlineMode = "none" | "optional" | "deposit" | "full";

const ProPayments = () => {
  const navigate = useNavigate();

  const [iban, setIban] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [onlineEnabled, setOnlineEnabled] = useState(true);
  const [onlineMode, setOnlineMode] = useState<OnlineMode>("optional");
  const [depositPercent, setDepositPercent] = useState("30");

  const [errors, setErrors] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [touched, setTouched] = useState<{ [key: string]: boolean }>({});

  // Détection des changements
  const [initialIban, setInitialIban] = useState("");
  const [initialAccountHolder, setInitialAccountHolder] = useState("");
  const [initialOnlineEnabled, setInitialOnlineEnabled] = useState(true);

  useEffect(() => {
    const changed = 
      iban !== initialIban ||
      accountHolder !== initialAccountHolder ||
      onlineEnabled !== initialOnlineEnabled;
    setHasChanges(changed);
  }, [iban, accountHolder, onlineEnabled]);

  // Formatage automatique IBAN
  const formatIban = (value: string) => {
    // Retire les espaces et met en majuscule
    const cleaned = value.replace(/\s/g, '').toUpperCase();
    // Ajoute un espace tous les 4 caractères
    return cleaned.match(/.{1,4}/g)?.join(' ') || cleaned;
  };

  const handleIbanChange = (value: string) => {
    const formatted = formatIban(value);
    setIban(formatted);
    if (touched.iban) validateIban(formatted);
  };

  // Validation IBAN simplifiée
  const validateIban = (value: string) => {
    if (!value) return true;
    const cleaned = value.replace(/\s/g, '');
    
    // Vérification basique de longueur (entre 15 et 34 caractères)
    if (cleaned.length < 15 || cleaned.length > 34) {
      return false;
    }
    
    // Vérification du format (commence par 2 lettres)
    if (!/^[A-Z]{2}[0-9]{2}/.test(cleaned)) {
      return false;
    }
    
    return true;
  };

  const handleSave = async () => {
    setErrors(null);
    setSuccess(null);

    if (onlineEnabled) {
      if (!iban.trim() || !accountHolder.trim()) {
        setErrors("Renseigne le titulaire et l'IBAN pour recevoir tes paiements.");
        toast.error("Complète tous les champs obligatoires");
        return;
      }

      if (!validateIban(iban)) {
        setErrors("L'IBAN saisi n'est pas valide.");
        toast.error("IBAN invalide");
        return;
      }
    }

    try {
      setSaving(true);

      const res = await paymentsApi.updateProPayments({
        bankaccountname: accountHolder,
        IBAN: iban.replace(/\s/g, ''), // Retire les espaces avant l'envoi
        accept_online_payment: onlineEnabled,
      });

      if (!res.success) {
        setErrors(res.message || res.error || "Impossible d'enregistrer les paramètres de paiement.");
        toast.error("Échec de l'enregistrement");
        return;
      }

      setSuccess("Paramètres de paiement enregistrés.");
      toast.success("Paramètres enregistrés avec succès !");
      
      // Mise à jour des valeurs initiales
      setInitialIban(iban);
      setInitialAccountHolder(accountHolder);
      setInitialOnlineEnabled(onlineEnabled);
      setHasChanges(false);
      setTouched({});
    } catch (e) {
      console.error(e);
      setErrors("Erreur de connexion au serveur.");
      toast.error("Erreur de connexion");
    } finally {
      setSaving(false);
    }
  };

  // Composant Input amélioré
  const InputField = ({
    label,
    name,
    value,
    onChange,
    placeholder,
    helpText,
    type = "text",
  }: {
    label: string;
    name: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    helpText?: string;
    type?: string;
  }) => {
    const hasValue = value.length > 0;
    const hasError = name === "iban" && touched.iban && hasValue && !validateIban(value);

    return (
      <div className="flex flex-col animate-slide-up">
        <label className={`text-xs font-medium mb-2 transition-colors duration-200 ${
          hasError ? "text-destructive" : hasValue ? "text-primary" : "text-muted-foreground"
        }`}>
          {label}
        </label>
        <div className="relative group">
          <input
            type={type}
            className={`
              border-2 rounded-2xl px-4 h-12 w-full text-sm bg-background
              transition-all duration-300 ease-out
              focus:outline-none focus:ring-4 focus:scale-[1.02]
              ${hasError 
                ? "border-destructive focus:ring-destructive/10 focus:border-destructive" 
                : hasValue
                ? "border-primary/30 focus:ring-primary/10 focus:border-primary"
                : "border-muted focus:ring-primary/10 focus:border-primary/50"
              }
              ${name === "iban" ? "tracking-wider font-mono" : ""}
            `}
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={() => setTouched({ ...touched, [name]: true })}
          />
          
          {/* Icône de validation */}
          {hasValue && !hasError && name === "iban" && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-green-500/10 flex items-center justify-center animate-in zoom-in duration-200">
              <Check size={14} className="text-green-600" />
            </div>
          )}
          
          {hasError && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-destructive/10 flex items-center justify-center animate-in zoom-in duration-200">
              <AlertCircle size={14} className="text-destructive" />
            </div>
          )}
        </div>
        
        {hasError && (
          <div className="mt-2 flex items-start gap-2 animate-in slide-in-from-top-1 duration-200">
            <AlertCircle size={14} className="text-destructive mt-0.5 flex-shrink-0" />
            <p className="text-xs text-destructive leading-relaxed">
              L'IBAN doit commencer par 2 lettres suivies de chiffres (15-34 caractères)
            </p>
          </div>
        )}
        
        {helpText && !hasError && (
          <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
            {helpText}
          </p>
        )}
      </div>
    );
  };

  return (
    <MobileLayout showNav={false}>
      <div className="min-h-screen py-6">
        {/* Header avec gradient */}
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
                Paiements
              </h1>
            </div>
          </div>
          <p className="text-muted-foreground text-sm animate-fade-in" style={{ animationDelay: "0.1s" }}>
            Configure comment tu es payée via Blyss.
          </p>
        </div>

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

        {/* Bloc info avec animation */}
        <div className="blyss-card mb-6 animate-scale-in overflow-hidden relative group hover:shadow-lg transition-all duration-300" style={{ animationDelay: "0.1s" }}>
          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <div className="relative flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center flex-shrink-0 shadow-lg">
              <Info size={20} className="text-white" />
            </div>
            <div className="flex-1 pt-1">
              <p className="text-base font-semibold text-foreground mb-1">
                Sécurise tes revenus
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Ajoute un compte de versement et active les paiements en ligne pour sécuriser tes rendez-vous et éviter les annulations.
              </p>
            </div>
          </div>
        </div>

        {/* SECTION : Compte de versement */}
        <div className="space-y-4 mb-6 animate-slide-up" style={{ animationDelay: "0.2s" }}>
          <div className="flex items-center gap-2 px-1">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Compte de versement
            </h2>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
          </div>

          <div className="blyss-card flex flex-col gap-5 hover:shadow-lg transition-shadow duration-300">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Banknote size={18} className="text-primary" />
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed flex-1">
                Coordonnées bancaires pour recevoir tes paiements Blyss en toute sécurité.
              </p>
            </div>

            <InputField
              label="Titulaire du compte"
              name="accountHolder"
              value={accountHolder}
              onChange={setAccountHolder}
              placeholder="Ton nom ou le nom de ton activité"
              helpText="Le nom doit correspondre au titulaire du compte bancaire."
            />

            <InputField
              label="IBAN"
              name="iban"
              value={iban}
              onChange={handleIbanChange}
              placeholder="FR76 3000 4000 5000 0000 0000 000"
              helpText="L'IBAN sera automatiquement formaté. Ces informations sont chiffrées et sécurisées."
              type="text"
            />
          </div>
        </div>

        {/* SECTION : Paiements en ligne */}
        <div className="space-y-4 mb-6 animate-slide-up" style={{ animationDelay: "0.3s" }}>
          <div className="flex items-center gap-2 px-1">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Paiements en ligne
            </h2>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
          </div>

          <div className="blyss-card flex flex-col gap-4 hover:shadow-lg transition-shadow duration-300">
            {/* Toggle amélioré */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-start gap-3 flex-1">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors duration-300 ${
                  onlineEnabled ? "bg-primary/10" : "bg-muted"
                }`}>
                  <CreditCard size={18} className={onlineEnabled ? "text-primary" : "text-muted-foreground"} />
                </div>
                <div className="flex-1">
                  <span className="text-sm font-semibold text-foreground block mb-1">
                    Accepter les paiements en ligne
                  </span>
                  <span className="text-xs text-muted-foreground leading-relaxed block">
                    Carte bancaire, Apple Pay, Google Pay via Blyss (sécurisé par Stripe).
                  </span>
                </div>
              </div>
              
              {/* Toggle switch animé */}
              <button
                type="button"
                onClick={() => setOnlineEnabled(!onlineEnabled)}
                className={`
                  relative w-14 h-8 rounded-full transition-all duration-300 flex-shrink-0
                  ${onlineEnabled ? "bg-primary shadow-lg shadow-primary/30" : "bg-muted"}
                  active:scale-95
                `}
              >
                <div className={`
                  absolute top-1 w-6 h-6 rounded-full bg-white shadow-md
                  transition-all duration-300 ease-out
                  ${onlineEnabled ? "left-7 scale-110" : "left-1"}
                `} />
              </button>
            </div>

            {/* Message contextuel */}
            {onlineEnabled ? (
              <div className="p-3 rounded-xl bg-green-500/5 border border-green-500/20 animate-in slide-in-from-top-2 duration-200">
                <div className="flex items-start gap-2">
                  <Check size={16} className="text-green-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-green-700 mb-1">
                      Paiements en ligne activés
                    </p>
                    <p className="text-xs text-green-600 leading-relaxed">
                      Tes clientes pourront payer en ligne. Tu recevras les montants sur ton compte bancaire selon ton intégration de paiement.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-muted/50 animate-in slide-in-from-top-2 duration-200">
                <div className="flex items-start gap-2">
                  <AlertCircle size={16} className="text-muted-foreground mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Les clientes paieront uniquement sur place. Aucune somme ne sera encaissée en ligne via Blyss.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bloc sécurité */}
        <div className="blyss-card mb-6 bg-gradient-to-br from-muted/50 to-transparent animate-slide-up" style={{ animationDelay: "0.4s" }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Shield size={18} className="text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-semibold text-foreground mb-1">
                Sécurité & confidentialité
              </p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Tes données bancaires sont chiffrées et conformes aux normes PCI-DSS. Elles ne sont jamais partagées.
              </p>
            </div>
          </div>
        </div>

        {/* Messages d'erreur/succès */}
        {errors && (
          <div className="blyss-card mb-6 bg-destructive/5 border-2 border-destructive/20 animate-in slide-in-from-top-2 duration-200">
            <div className="flex items-start gap-3">
              <AlertCircle size={18} className="text-destructive mt-0.5 flex-shrink-0" />
              <p className="text-sm text-destructive leading-relaxed">
                {errors}
              </p>
            </div>
          </div>
        )}

        {success && (
          <div className="blyss-card mb-6 bg-green-500/5 border-2 border-green-500/20 animate-in slide-in-from-top-2 duration-200">
            <div className="flex items-start gap-3">
              <Check size={18} className="text-green-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-green-700 leading-relaxed font-medium">
                {success}
              </p>
            </div>
          </div>
        )}

        {/* Bouton Enregistrer fixe en bas */}
        <div className={`
          sticky bottom-0 -mx-4 px-4 pt-4 pb-6 bg-gradient-to-t from-background via-background to-transparent
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
                ? "gradient-gold text-secondary-foreground active:scale-[0.97] shadow-lg hover:shadow-xl scale-105"
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
                <Banknote size={18} />
                Enregistrer les paramètres de paiement
              </>
            ) : (
              <>
                <Check size={18} />
                Paramètres à jour
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

export default ProPayments;
