import MobileLayout from "@/components/MobileLayout";
import { ChevronLeft, CreditCard, Banknote, Info } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";

type OnlineMode = "none" | "optional" | "deposit" | "full";

const ProPayments = () => {
  const navigate = useNavigate();

  // Mock local state – à connecter à ton backend plus tard
  const [iban, setIban] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [onlineEnabled, setOnlineEnabled] = useState(true);
  const [onlineMode, setOnlineMode] = useState<OnlineMode>("optional");
  const [depositPercent, setDepositPercent] = useState("30");

  const [errors, setErrors] = useState<string | null>(null);

  const handleSave = () => {
    setErrors(null);

    if (onlineEnabled) {
      if (!iban.trim() || !accountHolder.trim()) {
        setErrors("Renseigne le titulaire et l’IBAN pour recevoir tes paiements.");
        return;
      }
    }

    if (onlineMode === "deposit") {
      const value = Number(depositPercent);
      if (isNaN(value) || value <= 0 || value > 100) {
        setErrors("Le pourcentage d’acompte doit être entre 1% et 100%.");
        return;
      }
    }

    // TODO : appel API pour sauvegarder les paramètres de paiement
  };

  return (
    <MobileLayout showNav={false}>
      <div className="py-6 px-4 animate-fade-in space-y-5">
        {/* Header */}
        <div className="flex items-center mb-1">
          <button
            onClick={() => navigate("/pro/profile")}
            className="p-2 -ml-2"
          >
            <ChevronLeft size={24} className="text-foreground" />
          </button>
          <h1 className="font-display text-2xl font-semibold text-foreground ml-2">
            Paiements
          </h1>
        </div>
        <p className="text-muted-foreground text-sm">
          Configure comment tu es payée via Blyss.
        </p>

        {/* Bloc info */}
        <div className="blyss-card flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Info size={16} className="text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">
              Comptes & paiements en ligne
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
              Ajoutez un compte de versement et choisissez d’accepter les paiements en ligne pour sécuriser vos rendez-vous.
            </p>
          </div>
        </div>

        {/* SECTION : Compte de versement */}
        <div className="space-y-3">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
            Compte de versement
          </h2>

          <div className="blyss-card flex flex-col gap-3">
            <div className="flex items-center gap-2 mb-1">
              <Banknote size={16} className="text-primary" />
              <span className="text-xs text-muted-foreground">
                Coordonnées pour recevoir tes paiements Blyss.
              </span>
            </div>

            <div className="flex flex-col">
              <label className="text-xs text-muted-foreground mb-1">
                Titulaire du compte
              </label>
              <input
                type="text"
                className="border border-muted rounded-xl px-3 h-11 w-full text-sm bg-background"
                placeholder="Ton nom ou le nom de ton activité"
                value={accountHolder}
                onChange={(e) => setAccountHolder(e.target.value)}
              />
            </div>

            <div className="flex flex-col">
              <label className="text-xs text-muted-foreground mb-1">
                IBAN
              </label>
              <input
                type="text"
                className="border border-muted rounded-xl px-3 h-11 w-full text-sm bg-background tracking-wide"
                placeholder="FR76 3000 4000 5000 0000 0000 000"
                value={iban}
                onChange={(e) => setIban(e.target.value)}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Ces informations sont utilisées pour te verser les montants qui
                te reviennent.
              </p>
            </div>
          </div>
        </div>

        {/* SECTION : Paiements en ligne */}
        <div className="space-y-3">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
            Paiements en ligne
          </h2>

          <div className="blyss-card flex flex-col gap-3">
            {/* Toggle général */}
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-sm font-medium text-foreground">
                  Accepter les paiements en ligne
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Carte bancaire, Apple Pay, etc. via Blyss (selon tes
                  intégrations).
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={onlineEnabled}
                  onChange={() => setOnlineEnabled((v) => !v)}
                />
                <div className="w-11 h-6 bg-muted peer-checked:bg-primary rounded-full transition-colors" />
                <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow peer-checked:translate-x-5 transition-transform" />
              </label>
            </div>

            {/* Modes de paiement en ligne */}
            {onlineEnabled && (
              <div className="space-y-2 pt-1 border-t border-border/60 mt-2 pt-3">
                <p className="text-[11px] text-muted-foreground mb-1">
                  Choisis comment tu souhaites utiliser les paiements en ligne.
                </p>

                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => setOnlineMode("optional")}
                    className={`flex items-start justify-between rounded-xl px-3 py-2 text-left border ${
                      onlineMode === "optional"
                        ? "border-primary bg-primary/5"
                        : "border-border bg-muted/60"
                    }`}
                  >
                    <div className="flex flex-col pr-3">
                      <span className="text-xs font-medium text-foreground">
                        Paiement en ligne facultatif
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        La cliente peut payer en ligne ou sur place au rendez‑vous.
                      </span>
                    </div>
                    <div
                      className={`w-3 h-3 rounded-full border ${
                        onlineMode === "optional"
                          ? "border-primary bg-primary"
                          : "border-muted-foreground"
                      }`}
                    />
                  </button>

                  <button
                    type="button"
                    onClick={() => setOnlineMode("deposit")}
                    className={`flex items-start justify-between rounded-xl px-3 py-2 text-left border ${
                      onlineMode === "deposit"
                        ? "border-primary bg-primary/5"
                        : "border-border bg-muted/60"
                    }`}
                  >
                    <div className="flex flex-col pr-3">
                      <span className="text-xs font-medium text-foreground">
                        Acompte obligatoire
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        Une partie du montant est réglée en ligne pour limiter
                        les annulations et no‑shows.
                      </span>
                      {onlineMode === "deposit" && (
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-[11px] text-muted-foreground">
                            Pourcentage d’acompte :
                          </span>
                          <input
                            type="number"
                            min={1}
                            max={100}
                            className="w-16 h-8 border border-muted rounded-lg px-2 text-xs bg-background"
                            value={depositPercent}
                            onChange={(e) => setDepositPercent(e.target.value)}
                          />
                          <span className="text-[11px] text-muted-foreground">
                            %
                          </span>
                        </div>
                      )}
                    </div>
                    <div
                      className={`w-3 h-3 rounded-full border ${
                        onlineMode === "deposit"
                          ? "border-primary bg-primary"
                          : "border-muted-foreground"
                      }`}
                    />
                  </button>

                  <button
                    type="button"
                    onClick={() => setOnlineMode("full")}
                    className={`flex items-start justify-between rounded-xl px-3 py-2 text-left border ${
                      onlineMode === "full"
                        ? "border-primary bg-primary/5"
                        : "border-border bg-muted/60"
                    }`}
                  >
                    <div className="flex flex-col pr-3">
                      <span className="text-xs font-medium text-foreground">
                        Paiement complet obligatoire
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        Le montant total est payé en ligne pour confirmer la
                        réservation.
                      </span>
                    </div>
                    <div
                      className={`w-3 h-3 rounded-full border ${
                        onlineMode === "full"
                          ? "border-primary bg-primary"
                          : "border-muted-foreground"
                      }`}
                    />
                  </button>
                </div>
              </div>
            )}

            {/* Paiement sur place seulement */}
            {!onlineEnabled && (
              <p className="text-[11px] text-muted-foreground">
                Les clientes paieront uniquement sur place. Aucune somme ne sera
                encaissée en ligne via Blyss.
              </p>
            )}
          </div>
        </div>

        {/* SECTION : Autres infos (placeholder si tu ajoutes plus tard) */}
        <div className="space-y-2">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
            Autres paramètres
          </h2>

          <div className="blyss-card flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <CreditCard size={16} className="text-primary" />
              <span className="text-xs text-muted-foreground">
                Détails des frais et délais de versement disponibles dans ton
                espace pro.
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Blyss s’appuie sur un prestataire de paiement sécurisé pour gérer
              les encaissements et les versements.
            </p>
          </div>
        </div>

        {errors && (
          <p className="text-[11px] text-destructive mt-1 px-1">
            {errors}
          </p>
        )}

        {/* Bouton Enregistrer */}
        <button
          onClick={handleSave}
          className="w-full mt-3 py-3 rounded-xl gradient-gold text-secondary-foreground font-medium active:scale-[0.98] transition-transform text-sm"
        >
          Enregistrer les paramètres de paiement
        </button>
      </div>
    </MobileLayout>
  );
};

export default ProPayments;
