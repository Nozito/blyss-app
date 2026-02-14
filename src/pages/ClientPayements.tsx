import { CreditCard, ChevronLeft, Shield } from "lucide-react";
import { useNavigate } from "react-router-dom";

const ClientPaymentMethods = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-lg mx-auto p-4 pb-8">
        <div className="flex items-center mb-4">
          <button onClick={() => navigate("/client/profile")} className="p-2 -ml-2">
            <ChevronLeft size={24} className="text-foreground" />
          </button>
          <h1 className="font-display text-2xl font-semibold text-foreground ml-2">
            Paiements
          </h1>
        </div>
        <p className="text-muted-foreground text-sm mb-6">
          Tes paiements sont gérés de manière sécurisée par Stripe
        </p>

        <div className="blyss-card flex flex-col gap-4 mb-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center flex-shrink-0 shadow-lg">
              <CreditCard size={20} className="text-white" />
            </div>
            <div className="flex-1 pt-1">
              <p className="text-base font-semibold text-foreground mb-1">
                Paiement sécurisé
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Tes informations de paiement sont saisies directement sur Stripe lors de chaque réservation. Aucune donnée bancaire n'est stockée sur Blyss.
              </p>
            </div>
          </div>
        </div>

        <div className="blyss-card flex flex-col gap-3 mb-6">
          <div className="flex items-start gap-3">
            <Shield size={18} className="text-primary mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-foreground mb-1">
                Comment ça marche ?
              </p>
              <ul className="text-xs text-muted-foreground leading-relaxed space-y-2">
                <li>Lors d'une réservation en ligne, tu saisis ta carte directement sur le formulaire sécurisé Stripe.</li>
                <li>Les paiements sont traités en temps réel, tu reçois une confirmation immédiate.</li>
                <li>Tu peux aussi payer le solde restant depuis le détail de ta réservation.</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="blyss-card bg-gradient-to-br from-muted/50 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Shield size={18} className="text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-semibold text-foreground mb-1">
                Conforme PCI-DSS
              </p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Stripe est certifié PCI Level 1. Tes données bancaires ne transitent jamais par les serveurs Blyss.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClientPaymentMethods;
