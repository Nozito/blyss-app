import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Download, Pencil, Lock, Trash2, Mail, Bell, ShieldCheck, AlertTriangle } from "lucide-react";
import MobileLayout from "@/components/MobileLayout";
import { useAuth } from "@/contexts/AuthContext";
import { authApi } from "@/services/api";
import { toast } from "sonner";

// ── Types ────────────────────────────────────────────────────────────────────

type ConfirmAction = "restrict" | "unrestrict" | "delete" | null;

// ── Sub-components ───────────────────────────────────────────────────────────

function RGPDRow({
  icon: Icon,
  label,
  description,
  onClick,
  variant = "default",
}: {
  icon: React.ElementType;
  label: string;
  description: string;
  onClick: () => void;
  variant?: "default" | "destructive";
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-4 rounded-2xl border transition-all active:scale-[0.98] text-left ${
        variant === "destructive"
          ? "border-red-200 bg-red-50/50 hover:bg-red-50 dark:border-red-900/30 dark:bg-red-900/10 dark:hover:bg-red-900/20"
          : "border-border bg-card/50 hover:bg-card"
      }`}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
        variant === "destructive" ? "bg-red-100 dark:bg-red-900/30" : "bg-primary/10"
      }`}>
        <Icon size={18} className={variant === "destructive" ? "text-red-600" : "text-primary"} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${variant === "destructive" ? "text-red-700 dark:text-red-400" : "text-foreground"}`}>
          {label}
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{description}</p>
      </div>
      <ChevronLeft size={16} className="text-muted-foreground rotate-180 flex-shrink-0" />
    </button>
  );
}

function ConfirmDialog({
  action,
  onConfirm,
  onCancel,
  isLoading,
}: {
  action: ConfirmAction;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  if (!action) return null;

  const config = {
    restrict: {
      title: "Restreindre le traitement",
      body: "Vos données seront conservées mais ne seront plus utilisées pour des traitements non essentiels (analytics, personnalisation). Vous pouvez lever la restriction à tout moment.",
      confirm: "Restreindre",
      variant: "default" as const,
    },
    unrestrict: {
      title: "Lever la restriction",
      body: "Vos données pourront à nouveau être utilisées normalement pour le bon fonctionnement du service.",
      confirm: "Lever la restriction",
      variant: "default" as const,
    },
    delete: {
      title: "Supprimer mon compte",
      body: "Cette action est irréversible. Toutes vos données personnelles seront supprimées dans un délai de 30 jours. Les données nécessaires à des obligations légales (comptabilité) seront anonymisées.",
      confirm: "Supprimer définitivement",
      variant: "destructive" as const,
    },
  }[action];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md bg-background rounded-3xl p-6 space-y-4 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            config.variant === "destructive" ? "bg-red-100" : "bg-primary/10"
          }`}>
            <AlertTriangle size={20} className={config.variant === "destructive" ? "text-red-600" : "text-primary"} />
          </div>
          <h3 className="font-bold text-foreground text-base">{config.title}</h3>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">{config.body}</p>
        <div className="flex gap-3 pt-2">
          <button
            onClick={onCancel}
            className="flex-1 h-11 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`flex-1 h-11 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-50 ${
              config.variant === "destructive"
                ? "bg-red-600 hover:bg-red-700"
                : "bg-primary hover:bg-primary/90"
            }`}
          >
            {isLoading ? "..." : config.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

const RGPDCenter = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRestricted, setIsRestricted] = useState(false);

  const handleExport = async () => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || "";
      const res = await fetch(`${API_URL}/api/auth/export-data`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `blyss-export-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Données exportées");
    } catch {
      toast.error("Erreur lors de l'export");
    }
  };

  const handleConfirm = async () => {
    if (!confirmAction) return;
    setIsLoading(true);
    try {
      const API_URL = import.meta.env.VITE_API_URL || "";
      if (confirmAction === "delete") {
        const res = await fetch(`${API_URL}/api/auth/delete-account`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok) throw new Error();
        toast.success("Compte supprimé. À bientôt !");
        await logout();
        navigate("/", { replace: true });
      } else if (confirmAction === "restrict") {
        const res = await fetch(`${API_URL}/api/auth/restrict-account`, {
          method: "PATCH",
          credentials: "include",
        });
        if (!res.ok) throw new Error();
        setIsRestricted(true);
        toast.success("Traitement restreint");
      } else if (confirmAction === "unrestrict") {
        const res = await fetch(`${API_URL}/api/auth/unrestrict-account`, {
          method: "PATCH",
          credentials: "include",
        });
        if (!res.ok) throw new Error();
        setIsRestricted(false);
        toast.success("Restriction levée");
      }
    } catch {
      toast.error("Une erreur est survenue");
    } finally {
      setIsLoading(false);
      setConfirmAction(null);
    }
  };

  const userRoute = user?.role === "pro" ? "/pro/settings" : "/client/settings";

  return (
    <MobileLayout showNav={false}>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate(userRoute)}
            className="p-2 -ml-2 rounded-xl hover:bg-muted/50 transition-colors"
            aria-label="Retour"
          >
            <ChevronLeft size={20} className="text-foreground" />
          </button>
          <div>
            <h1 className="font-semibold text-foreground text-base">Mes données personnelles</h1>
            <p className="text-xs text-muted-foreground">Droits RGPD</p>
          </div>
        </div>

        <div className="px-4 py-6 space-y-6 pb-24">
          {/* Intro */}
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-primary/5 border border-primary/15">
            <ShieldCheck size={20} className="text-primary flex-shrink-0" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              Conformément au RGPD (UE 2016/679), vous disposez de droits sur vos données personnelles.
              Exercez-les ici ou contactez notre DPO.
            </p>
          </div>

          {/* Section : Mes données */}
          <div className="space-y-2">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
              Mes données
            </h2>
            <div className="space-y-2">
              <RGPDRow
                icon={Download}
                label="Télécharger mes données"
                description="Export JSON complet — profil, réservations, avis (Art. 20)"
                onClick={handleExport}
              />
              <RGPDRow
                icon={Pencil}
                label="Modifier mes informations"
                description="Nom, email, téléphone, photo (Art. 16)"
                onClick={() => navigate(userRoute)}
              />
            </div>
          </div>

          {/* Section : Contrôle du traitement */}
          <div className="space-y-2">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
              Contrôle du traitement
            </h2>
            <div className="space-y-2">
              <RGPDRow
                icon={Lock}
                label={isRestricted ? "Lever la restriction" : "Restreindre le traitement"}
                description={
                  isRestricted
                    ? "Votre compte est actuellement restreint — cliquez pour lever la restriction (Art. 18)"
                    : "Limiter l'usage de vos données aux seules fonctions essentielles (Art. 18)"
                }
                onClick={() => setConfirmAction(isRestricted ? "unrestrict" : "restrict")}
              />
              <RGPDRow
                icon={Bell}
                label="Gérer les notifications"
                description="Retirer le consentement aux notifications push et emails"
                onClick={() => navigate(
                  user?.role === "pro" ? "/pro/notifications" : "/client/notifications"
                )}
              />
            </div>
          </div>

          {/* Section : Contact & réclamation */}
          <div className="space-y-2">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
              Contact & réclamation
            </h2>
            <div className="space-y-2">
              <RGPDRow
                icon={Mail}
                label="Contacter le DPO"
                description="privacy@blyssapp.fr — réponse sous 30 jours (Art. 12)"
                onClick={() => { window.location.href = "mailto:privacy@blyssapp.fr"; }}
              />
              <RGPDRow
                icon={ShieldCheck}
                label="Réclamation CNIL"
                description="Déposer une plainte sur cnil.fr (Art. 77)"
                onClick={() => window.open("https://www.cnil.fr/fr/plaintes", "_blank", "noopener,noreferrer")}
              />
            </div>
          </div>

          {/* Section : Zone de danger */}
          <div className="space-y-2">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
              Zone de danger
            </h2>
            <RGPDRow
              icon={Trash2}
              label="Supprimer mon compte"
              description="Suppression irréversible de toutes vos données dans 30 jours (Art. 17)"
              onClick={() => setConfirmAction("delete")}
              variant="destructive"
            />
          </div>

          {/* Legal footer */}
          <p className="text-center text-[11px] text-muted-foreground/60 px-4 leading-relaxed">
            Base légale selon les traitements : contrat, obligation légale, intérêt légitime ou consentement.{" "}
            <button
              onClick={() => navigate("/legal#confidentialite")}
              className="text-primary underline"
            >
              Politique de confidentialité
            </button>
          </p>
        </div>

        {/* Confirm dialog */}
        <ConfirmDialog
          action={confirmAction}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmAction(null)}
          isLoading={isLoading}
        />
      </div>
    </MobileLayout>
  );
};

export default RGPDCenter;
