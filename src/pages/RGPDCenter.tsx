import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Download, Pencil, Trash2, Mail, Bell, ShieldCheck, AlertTriangle } from "lucide-react";
import MobileLayout from "@/components/MobileLayout";
import { useAuth } from "@/contexts/AuthContext";
import { authApi } from "@/services/api";
import { toast } from "sonner";

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

function DeleteDialog({
  onConfirm,
  onCancel,
  isLoading,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md bg-card rounded-3xl p-6 space-y-4 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-red-100">
            <AlertTriangle size={20} className="text-red-600" />
          </div>
          <h3 className="font-bold text-foreground text-base">Supprimer mon compte</h3>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Cette action est irréversible. Toutes tes données personnelles seront supprimées dans les 30 jours suivant la demande.
        </p>
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
            className="flex-1 h-11 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-50 bg-red-600 hover:bg-red-700"
          >
            {isLoading ? "..." : "Supprimer"}
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
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

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

  const handleDelete = async () => {
    setIsLoading(true);
    try {
      const res = await authApi.deleteAccount();
      if (!res.success) throw new Error();
      toast.success("Compte supprimé. À bientôt !");
      await logout();
      navigate("/", { replace: true });
    } catch {
      toast.error("Une erreur est survenue");
    } finally {
      setIsLoading(false);
      setShowDeleteDialog(false);
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
            <p className="text-xs text-muted-foreground">Confidentialité & compte</p>
          </div>
        </div>

        <div className="px-4 py-6 space-y-6 pb-24">
          {/* Intro */}
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-primary/5 border border-primary/15">
            <ShieldCheck size={20} className="text-primary flex-shrink-0" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              Chez Blyss, tes données t'appartiennent. Tu peux les consulter, les modifier ou les supprimer à tout moment.
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
                description="Récupère une copie complète de tes informations au format JSON"
                onClick={handleExport}
              />
              <RGPDRow
                icon={Pencil}
                label="Modifier mes informations"
                description="Nom, email, téléphone, photo de profil"
                onClick={() => navigate(userRoute)}
              />
              <RGPDRow
                icon={Bell}
                label="Gérer les notifications"
                description="Choisis quelles notifications tu souhaites recevoir"
                onClick={() => navigate(
                  user?.role === "pro" ? "/pro/notifications" : "/client/notifications"
                )}
              />
            </div>
          </div>

          {/* Section : Besoin d'aide */}
          <div className="space-y-2">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
              Une question ?
            </h2>
            <RGPDRow
              icon={Mail}
              label="Contacter l'équipe Blyss"
              description="privacy@blyssapp.fr — on répond sous 48h"
              onClick={() => { window.location.href = "mailto:privacy@blyssapp.fr"; }}
            />
          </div>

          {/* Section : Supprimer le compte */}
          <div className="space-y-2">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
              Supprimer mon compte
            </h2>
            <RGPDRow
              icon={Trash2}
              label="Supprimer mon compte"
              description="Efface définitivement toutes tes données de Blyss"
              onClick={() => setShowDeleteDialog(true)}
              variant="destructive"
            />
          </div>

          {/* Footer discret */}
          <p className="text-center text-[11px] text-muted-foreground/60 px-4 leading-relaxed">
            <button
              onClick={() => navigate("/legal#confidentialite")}
              className="text-primary underline"
            >
              Politique de confidentialité
            </button>
          </p>
        </div>

        {showDeleteDialog && (
          <DeleteDialog
            onConfirm={handleDelete}
            onCancel={() => setShowDeleteDialog(false)}
            isLoading={isLoading}
          />
        )}
      </div>
    </MobileLayout>
  );
};

export default RGPDCenter;
