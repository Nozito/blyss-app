import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Lock,
  Activity,
  Camera,
  X,
  Mail,
  Phone,
  Calendar,
  Clock,
  Monitor,
  LogOut,
  Trash2,
  ShieldAlert,
} from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";
import { PageHeader } from "@/components/admin/PageHeader";
import { SectionCard } from "@/components/admin/SectionCard";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { PasswordField } from "@/components/admin/PasswordField";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { EmptyState } from "@/components/admin/EmptyState";
import { ErrorState } from "@/components/admin/ErrorState";
import { TwoFactorSetup } from "@/components/admin/TwoFactorSetup";
import { useAuth } from "@/contexts/AuthContext";
import { usersApi, authApi } from "@/services/api";
import { getImageUrl } from "@/utils/imageUrl";

const API_URL = import.meta.env.VITE_API_URL || "";

interface ActivityPoint {
  day: string;
  logins: number;
}

interface SessionsData {
  active_sessions: number;
  recent_logins: string[];
}

const activityChartConfig: ChartConfig = {
  logins: { label: "Connexions", color: "hsl(var(--primary))" },
};

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];

function formatDateTime(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (isNaN(date.getTime())) return null;
  return date.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (isNaN(date.getTime())) return null;
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * Centre de gestion du compte administrateur. Tout ce qui touche à la
 * sécurité (2FA, sessions, activité de connexion) est strictement personnel
 * — req.user courant côté API — jamais comparé ni visible par les autres
 * admins.
 */
const AdminProfile = () => {
  const { user, refreshProfile, logout } = useAuth();

  // ── Informations personnelles ────────────────────────────────────────────
  const [firstName, setFirstName] = useState(user?.first_name ?? "");
  const [lastName, setLastName] = useState(user?.last_name ?? "");
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoErrors, setInfoErrors] = useState<{ first_name?: string; last_name?: string }>({});

  useEffect(() => {
    setFirstName(user?.first_name ?? "");
    setLastName(user?.last_name ?? "");
  }, [user?.first_name, user?.last_name]);

  const infoDirty = firstName.trim() !== (user?.first_name ?? "") || lastName.trim() !== (user?.last_name ?? "");

  // Ferme l'onglet / recharge avec des champs modifiés mais pas encore
  // enregistrés (bouton "Enregistrer" cliqué) → la maj n'est jamais partie
  // en DB, perte silencieuse sans ce garde-fou natif du navigateur.
  useEffect(() => {
    if (!infoDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [infoDirty]);

  const saveInfo = async () => {
    const errors: typeof infoErrors = {};
    if (!firstName.trim()) errors.first_name = "Le prénom est requis";
    if (!lastName.trim()) errors.last_name = "Le nom est requis";
    setInfoErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSavingInfo(true);
    try {
      const response = await usersApi.update({ first_name: firstName.trim(), last_name: lastName.trim() });
      if (response.success) {
        toast.success("Informations mises à jour");
        await refreshProfile();
      } else {
        toast.error(response.message || "Impossible de mettre à jour le profil");
      }
    } catch {
      toast.error("Erreur serveur — réessaie dans un instant");
    } finally {
      setSavingInfo(false);
    }
  };

  // ── Avatar ────────────────────────────────────────────────────────────────
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setAvatarError(false);
  }, [user?.profile_photo]);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      toast.error("Format non supporté — utilise une image JPEG, PNG ou WebP");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error("Image trop lourde — 2 Mo maximum");
      return;
    }

    setAvatarUploading(true);
    try {
      const formData = new FormData();
      formData.append("photo", file);
      const response = await fetch(`${API_URL}/api/users/upload-photo`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const data = await response.json();
      if (response.ok && data.success) {
        toast.success("Photo de profil mise à jour");
        await refreshProfile();
      } else {
        toast.error(data.message || "Échec de l'envoi de la photo");
      }
    } catch {
      toast.error("Erreur serveur — réessaie dans un instant");
    } finally {
      setAvatarUploading(false);
    }
  };

  const removeAvatar = async () => {
    setAvatarUploading(true);
    try {
      const response = await fetch(`${API_URL}/api/users/profile-photo`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await response.json();
      if (response.ok && data.success) {
        toast.success("Photo de profil supprimée");
        await refreshProfile();
      } else {
        toast.error("Impossible de supprimer la photo");
      }
    } catch {
      toast.error("Erreur serveur — réessaie dans un instant");
    } finally {
      setAvatarUploading(false);
    }
  };

  // ── Mot de passe ──────────────────────────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState<{ current?: string; next?: string; confirm?: string }>({});

  const savePassword = async () => {
    const errors: typeof passwordErrors = {};
    if (!currentPassword) errors.current = "Requis";
    if (!newPassword) errors.next = "Requis";
    else if (newPassword.length < 8) errors.next = "8 caractères minimum";
    if (newPassword && confirmPassword !== newPassword) errors.confirm = "Les mots de passe ne correspondent pas";
    setPasswordErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSavingPassword(true);
    try {
      const response = await usersApi.update({ currentPassword, newPassword });
      if (response.success) {
        toast.success("Mot de passe mis à jour");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setPasswordErrors({});
      } else {
        setPasswordErrors({ current: response.message || "Mot de passe actuel invalide" });
      }
    } catch {
      toast.error("Erreur serveur — réessaie dans un instant");
    } finally {
      setSavingPassword(false);
    }
  };

  const totpEnabled = user?.totp_enabled === true;

  // ── Sessions ──────────────────────────────────────────────────────────────
  const [sessions, setSessions] = useState<SessionsData | null>(null);
  const [sessionsError, setSessionsError] = useState(false);
  const [revokeAllOpen, setRevokeAllOpen] = useState(false);
  const [revokeAllLoading, setRevokeAllLoading] = useState(false);

  const fetchSessions = () => {
    setSessionsError(false);
    fetch(`${API_URL}/api/admin/profile/sessions`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setSessions(data.data);
        else setSessionsError(true);
      })
      .catch(() => setSessionsError(true));
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const revokeAllSessions = async () => {
    setRevokeAllLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/admin/profile/sessions/revoke-all`, {
        method: "POST",
        credentials: "include",
      });
      if (response.ok) {
        toast.success("Tous les appareils ont été déconnectés");
        await logout();
      } else {
        toast.error("Impossible de déconnecter les appareils");
        setRevokeAllOpen(false);
      }
    } catch {
      toast.error("Erreur serveur — réessaie dans un instant");
      setRevokeAllOpen(false);
    } finally {
      setRevokeAllLoading(false);
    }
  };

  // ── Suppression du compte ─────────────────────────────────────────────────
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const deleteAccount = async () => {
    setDeleteLoading(true);
    try {
      const response = await authApi.deleteAccount();
      if (response.success) {
        toast.success("Compte supprimé");
        await logout();
      } else {
        toast.error(response.message || response.error || "Impossible de supprimer ce compte");
        setDeleteOpen(false);
      }
    } catch {
      toast.error("Erreur serveur — réessaie dans un instant");
      setDeleteOpen(false);
    } finally {
      setDeleteLoading(false);
    }
  };

  // ── Activité (connexions des 14 derniers jours) ──────────────────────────
  const [activity, setActivity] = useState<ActivityPoint[] | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/admin/profile/activity`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setActivity(data.data);
      })
      .catch(() => {});
  }, []);

  const initials = `${user?.first_name?.[0] ?? ""}${user?.last_name?.[0] ?? ""}`.toUpperCase();
  const accountTypeLabel = user?.role === "pro" ? "Professionnel" : "Client";

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <PageHeader
        title="Profil"
        description="Gère les informations, la sécurité et les préférences de ton compte administrateur."
      />

      {/* Vue d'ensemble */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card rounded-2xl border-2 border-border p-5 sm:p-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="relative shrink-0 self-start">
            <div className="h-20 w-20 rounded-2xl bg-primary/15 flex items-center justify-center overflow-hidden">
              {user?.profile_photo && !avatarError ? (
                <img
                  src={getImageUrl(user.profile_photo) ?? undefined}
                  alt=""
                  className="h-full w-full object-cover"
                  onError={() => setAvatarError(true)}
                />
              ) : (
                <span className="text-2xl font-black text-primary">{initials}</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarUploading}
              aria-label="Changer la photo de profil"
              className="absolute -bottom-1.5 -right-1.5 h-8 w-8 rounded-full bg-foreground text-background flex items-center justify-center border-2 border-card hover:opacity-90 transition-opacity disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Camera size={14} aria-hidden="true" />
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleAvatarChange}
              className="sr-only"
              aria-label="Téléverser une photo de profil"
            />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold text-foreground truncate">
                {user?.first_name} {user?.last_name}
              </h2>
              <StatusBadge tone="neutral" label="Administrateur" />
            </div>
            <p className="text-sm text-muted-foreground mt-0.5 truncate flex items-center gap-1.5">
              <Mail size={13} className="shrink-0" aria-hidden="true" />
              {user?.email}
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Calendar size={12} aria-hidden="true" />
                Compte créé le {formatDate(user?.created_at) ?? "—"}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock size={12} aria-hidden="true" />
                Dernière connexion : {formatDateTime(user?.last_login_at) ?? "—"}
              </span>
            </div>
          </div>

          <div className="flex sm:flex-col gap-2 shrink-0">
            {user?.profile_photo ? (
              <Button variant="ghost" size="sm" onClick={removeAvatar} disabled={avatarUploading} className="text-muted-foreground">
                <X size={14} className="mr-1.5" aria-hidden="true" />
                Retirer la photo
              </Button>
            ) : null}
          </div>
        </div>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        {/* Colonne principale : ce qu'on modifie réellement ici */}
        <div className="space-y-6">
          <SectionCard title="Informations personnelles" description="Ton identité affichée dans le backoffice.">
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="profile-first-name">Prénom</Label>
                  <Input
                    id="profile-first-name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    aria-invalid={!!infoErrors.first_name}
                    aria-describedby={infoErrors.first_name ? "profile-first-name-error" : undefined}
                  />
                  {infoErrors.first_name ? (
                    <p id="profile-first-name-error" className="text-xs text-foreground/80">{infoErrors.first_name}</p>
                  ) : null}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="profile-last-name">Nom</Label>
                  <Input
                    id="profile-last-name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    aria-invalid={!!infoErrors.last_name}
                    aria-describedby={infoErrors.last_name ? "profile-last-name-error" : undefined}
                  />
                  {infoErrors.last_name ? (
                    <p id="profile-last-name-error" className="text-xs text-foreground/80">{infoErrors.last_name}</p>
                  ) : null}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="profile-email" className="flex items-center gap-1.5">
                  <Mail size={13} aria-hidden="true" /> Email
                </Label>
                <Input id="profile-email" value={user?.email ?? ""} disabled className="text-muted-foreground" />
                <p className="text-xs text-muted-foreground">
                  Cette adresse est utilisée pour la connexion et ne peut pas être modifiée ici.
                </p>
              </div>

              {user?.phone_number ? (
                <div className="space-y-1.5">
                  <Label htmlFor="profile-phone" className="flex items-center gap-1.5">
                    <Phone size={13} aria-hidden="true" /> Téléphone
                  </Label>
                  <Input id="profile-phone" value={user.phone_number} disabled className="text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">
                    La modification du numéro de téléphone n'est pas encore disponible depuis cette page.
                  </p>
                </div>
              ) : null}

              <div className="flex items-center gap-3 pt-1">
                <Button onClick={saveInfo} disabled={savingInfo || !infoDirty} className="font-semibold">
                  {savingInfo ? "Enregistrement..." : "Enregistrer les modifications"}
                </Button>
                {infoDirty && !savingInfo ? (
                  <span className="text-xs text-muted-foreground">Modifications non enregistrées</span>
                ) : null}
              </div>
            </div>
          </SectionCard>

          <SectionCard icon={Lock} title="Mot de passe" description="Change ton mot de passe de connexion.">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="profile-current-password">Mot de passe actuel</Label>
                <PasswordField
                  id="profile-current-password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  aria-invalid={!!passwordErrors.current}
                  aria-describedby={passwordErrors.current ? "profile-current-password-error" : undefined}
                />
                {passwordErrors.current ? (
                  <p id="profile-current-password-error" className="text-xs text-foreground/80">{passwordErrors.current}</p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="profile-new-password">Nouveau mot de passe</Label>
                <PasswordField
                  id="profile-new-password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  aria-invalid={!!passwordErrors.next}
                  aria-describedby="profile-new-password-hint"
                />
                <p id="profile-new-password-hint" className="text-xs text-muted-foreground">
                  {passwordErrors.next ?? "8 caractères minimum."}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="profile-confirm-password">Confirmation</Label>
                <PasswordField
                  id="profile-confirm-password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  aria-invalid={!!passwordErrors.confirm}
                  aria-describedby={passwordErrors.confirm ? "profile-confirm-password-error" : undefined}
                />
                {passwordErrors.confirm ? (
                  <p id="profile-confirm-password-error" className="text-xs text-foreground/80">{passwordErrors.confirm}</p>
                ) : null}
              </div>
              <Button
                onClick={savePassword}
                disabled={savingPassword || !currentPassword || !newPassword}
                className="font-semibold"
              >
                {savingPassword ? "Enregistrement..." : "Changer le mot de passe"}
              </Button>
            </div>
          </SectionCard>
        </div>

        {/* Colonne secondaire : statut et sécurité */}
        <div className="space-y-6">
          <SectionCard
            icon={ShieldAlert}
            title="Rôle et permissions"
            description="Lecture seule — le rôle n'est pas modifiable depuis cette page."
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 py-2 border-b border-border">
                <span className="text-sm text-muted-foreground">Accès backoffice</span>
                <StatusBadge tone="neutral" label="Administrateur" />
              </div>
              <div className="flex items-center justify-between gap-3 py-2 border-b border-border">
                <span className="text-sm text-muted-foreground">Type de compte sous-jacent</span>
                <StatusBadge tone="neutral" label={accountTypeLabel} />
              </div>
              <p className="text-sm text-muted-foreground pt-1">
                L'accès administrateur donne la gestion complète des utilisateurs, réservations, paiements et analytics du backoffice.
                Seul un autre administrateur peut accorder ou retirer cet accès, depuis la page Utilisateurs.
              </p>
            </div>
          </SectionCard>

          <TwoFactorSetup enabled={totpEnabled} onChange={refreshProfile} />

          <SectionCard
            icon={Monitor}
            title="Sessions et connexions"
            description="Appareils connectés à ton compte."
          >
            {sessionsError ? (
              <ErrorState description="Impossible de charger les sessions." onRetry={fetchSessions} />
            ) : sessions === null ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full rounded-lg" />
                <Skeleton className="h-10 w-full rounded-lg" />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <span className="text-sm text-muted-foreground">Sessions actives</span>
                  <span className="text-sm font-bold text-foreground">{sessions.active_sessions}</span>
                </div>

                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Historique de connexion</p>
                  {sessions.recent_logins.length === 0 ? (
                    <EmptyState icon={Clock} title="Aucune activité récente à afficher" className="py-6" />
                  ) : (
                    <ul className="space-y-1.5">
                      {sessions.recent_logins.map((ts, i) => (
                        <li key={i} className="text-sm text-foreground/80 flex items-center gap-2">
                          <Clock size={12} className="text-muted-foreground shrink-0" aria-hidden="true" />
                          {formatDateTime(ts)}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="text-xs text-muted-foreground mt-3">
                    L'appareil, le navigateur et la localisation ne sont pas encore suivis pour ces connexions.
                  </p>
                </div>

                <Button variant="outline" size="sm" onClick={() => setRevokeAllOpen(true)}>
                  <LogOut size={14} className="mr-1.5" aria-hidden="true" />
                  Déconnecter tous les appareils
                </Button>
              </div>
            )}
          </SectionCard>
        </div>

        {/* Activité — pleine largeur, informatif */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-2xl p-5 sm:p-6 border-2 border-border lg:col-span-2"
        >
          <h2 className="text-lg font-bold text-foreground mb-1 flex items-center gap-2">
            <Activity size={18} className="text-muted-foreground shrink-0" aria-hidden="true" />
            Mon activité
          </h2>
          <p className="text-sm text-muted-foreground mb-4">Connexions au backoffice sur les 14 derniers jours.</p>
          {activity === null ? (
            <Skeleton className="h-40 w-full rounded-xl" />
          ) : (
            <ChartContainer config={activityChartConfig} className="h-40 w-full">
              <AreaChart data={activity} margin={{ left: -20 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={11} interval="preserveStartEnd" minTickGap={24} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  type="monotone"
                  dataKey="logins"
                  stroke="var(--color-logins)"
                  fill="var(--color-logins)"
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
              </AreaChart>
            </ChartContainer>
          )}
        </motion.div>

        {/* Zone d'actions sensibles — pleine largeur */}
        <SectionCard
          title="Actions sensibles"
          description="Ces actions affectent l'ensemble de ton compte."
          className="lg:col-span-2"
        >
          <div className="divide-y divide-border">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-3 first:pt-0">
              <div>
                <p className="text-sm font-semibold text-foreground">Se déconnecter</p>
                <p className="text-xs text-muted-foreground">Termine ta session actuelle sur cet appareil.</p>
              </div>
              <Button variant="outline" size="sm" onClick={logout} className="shrink-0">
                <LogOut size={14} className="mr-1.5" aria-hidden="true" />
                Se déconnecter
              </Button>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-3 last:pb-0">
              <div>
                <p className="text-sm font-semibold text-foreground">Supprimer mon compte</p>
                <p className="text-xs text-muted-foreground">
                  Action irréversible. Ton accès administrateur et ton compte seront définitivement supprimés.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setDeleteOpen(true)} className="shrink-0">
                <Trash2 size={14} className="mr-1.5" aria-hidden="true" />
                Supprimer mon compte
              </Button>
            </div>
          </div>
        </SectionCard>
      </div>

      <ConfirmDialog
        open={revokeAllOpen}
        onOpenChange={setRevokeAllOpen}
        title="Déconnecter tous les appareils ?"
        description="Toutes les sessions actives seront terminées, y compris celle-ci. Tu devras te reconnecter."
        confirmLabel="Déconnecter tout"
        loading={revokeAllLoading}
        onConfirm={revokeAllSessions}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Supprimer définitivement ton compte ?"
        description="Cette action est irréversible. Ton compte, ton accès administrateur et tes données personnelles seront supprimés. Les données que la loi impose de conserver (paiements, réservations) seront anonymisées plutôt que supprimées."
        confirmLabel="Supprimer mon compte"
        loading={deleteLoading}
        requireText="SUPPRIMER"
        onConfirm={deleteAccount}
      />
    </div>
  );
};

export default AdminProfile;
