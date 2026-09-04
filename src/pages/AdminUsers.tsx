import { useState, useEffect, useCallback, useMemo } from "react";
import { fetchAllPages } from "@/utils/fetchAllPages";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Plus,
  Search,
  Edit,
  Trash2,
  X,
  Mail,
  Phone,
  Briefcase,
  MapPin,
  Calendar,
  Check,
  Loader2,
  User,
  RefreshCw,
  CheckCircle,
  Shield,
  Cake,
  ChevronLeft,
  Ban,
  RotateCcw,
  KeyRound,
  Users as UsersIcon,
  Flag,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import AdminAccessDialog from "@/components/admin/AdminAccessDialog";
import ClientOnboardingDialog from "@/components/admin/ClientOnboardingDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/admin/PageHeader";
import { EmptyState } from "@/components/admin/EmptyState";
import { ErrorState } from "@/components/admin/ErrorState";

const API_URL = import.meta.env.VITE_API_URL || "";

interface User {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string;
  birth_date: string;
  role: 'client' | 'pro';
  is_admin: boolean;
  is_verified: boolean;
  is_active: boolean;
  created_at: string;
  activity_name?: string;
  city?: string;
  // Modération — voir GET /api/admin/users (backend/routes/admin.routes.ts)
  reported_count?: number;
  is_vigilant?: boolean;
  abusive_reports_count?: number;
  is_abusive_reporter?: boolean;
}

const AdminUsers = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState(searchParams.get("search") ?? "");
  const [roleFilter, setRoleFilter] = useState<'all' | 'client' | 'pro'>(
    (searchParams.get("role") as 'all' | 'client' | 'pro') ?? 'all'
  );

  const updateParams = useCallback((search: string, role: string) => {
    const p: Record<string, string> = {};
    if (search) p.search = search;
    if (role && role !== 'all') p.role = role;
    setSearchParams(p, { replace: true });
  }, [setSearchParams]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [onboardingClient, setOnboardingClient] = useState<User | null>(null);
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone_number: '',
    birth_date: '',
    role: 'client' as 'client' | 'pro',
    is_admin: false,
    is_verified: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [confirmAction, setConfirmAction] = useState<
    { type: 'delete' | 'toggle'; user: User } | null
  >(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [accessDialogOpen, setAccessDialogOpen] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      // L'API pagine (défaut 50/page) — la recherche et les filtres ci-dessous
      // sont faits côté client sur `users`, donc il faut TOUT charger, sinon
      // un compte hors des N plus récents devient invisible (peu importe la
      // recherche) sans jamais qu'aucune erreur ne le signale. Les pages sont
      // chargées en parallèle (fetchAllPages), pas une par une en séquence.
      const all = await fetchAllPages<User>(`${API_URL}/api/admin/users`);
      setUsers(all);
      if (showRefresh) toast.success('Liste actualisée');
    } catch (error) {
      toast.error('Erreur lors du chargement');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const formatDate = (dateString: string | undefined | null) => {
    if (!dateString) return null;
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return null;
      return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
      return null;
    }
  };

  const openEditModal = (user: User) => {
    setModalMode('edit');
    setSelectedUser(user);
    setFormData({
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      phone_number: user.phone_number || '',
      birth_date: user.birth_date || '',
      role: user.role,
      is_admin: user.is_admin,
      is_verified: user.is_verified,
    });
    setIsModalOpen(true);
  };

  const openCreateModal = () => {
    setModalMode('create');
    setFormData({
      first_name: '',
      last_name: '',
      email: '',
      phone_number: '',
      birth_date: '',
      role: 'client',
      is_admin: false,
      is_verified: false,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const url = modalMode === 'create'
        ? `${API_URL}/api/admin/users/create`
        : `${API_URL}/api/admin/users/${selectedUser?.id}`;

      const response = await fetch(url, {
        method: modalMode === 'create' ? 'POST' : 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(formData),
      });

      const responseData = await response.json();

      if (response.ok) {
        toast.success(modalMode === 'create' ? 'Utilisateur créé avec succès' : 'Modifications enregistrées');
        setIsModalOpen(false);
        fetchUsers();
      } else {
        toast.error(responseData.message || 'Une erreur est survenue');
      }
    } catch (error) {
      toast.error('Erreur de connexion au serveur');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (userId: number) => {
    try {
      const response = await fetch(`${API_URL}/api/admin/users/${userId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (response.ok) {
        toast.success('Utilisateur supprimé');
        fetchUsers();
      } else {
        toast.error('Impossible de supprimer cet utilisateur');
      }
    } catch (error) {
      toast.error('Erreur serveur');
    }
  };

  const handleToggleActive = async (userId: number, currentlyActive: boolean) => {
    const action = currentlyActive ? 'désactiver' : 'réactiver';
    try {
      const endpoint = currentlyActive ? 'deactivate' : 'reactivate';
      const response = await fetch(`${API_URL}/api/admin/users/${userId}/${endpoint}`, {
        method: 'PATCH',
        credentials: 'include',
      });

      if (response.ok) {
        toast.success(currentlyActive ? 'Compte désactivé' : 'Compte réactivé');
        fetchUsers();
      } else {
        toast.error(`Impossible de ${action} ce compte`);
      }
    } catch {
      toast.error('Erreur serveur');
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmAction) return;
    setConfirmLoading(true);
    try {
      if (confirmAction.type === 'delete') {
        await handleDelete(confirmAction.user.id);
      } else {
        await handleToggleActive(confirmAction.user.id, confirmAction.user.is_active !== false);
      }
    } finally {
      setConfirmLoading(false);
      setConfirmAction(null);
    }
  };

  const filteredUsers = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return users.filter(user => {
      const matchesSearch = `${user.first_name} ${user.last_name} ${user.email}`.toLowerCase().includes(q);
      const matchesRole = roleFilter === 'all' || user.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [users, searchQuery, roleFilter]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-9 w-48 rounded-lg" />
          <Skeleton className="h-10 w-40 rounded-xl" />
        </div>
        <Skeleton className="h-16 w-full rounded-2xl" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-56 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Utilisateurs"
        description={`${filteredUsers.length} utilisateur${filteredUsers.length > 1 ? 's' : ''}${
          roleFilter !== 'all' ? ` · ${roleFilter === 'pro' ? 'Professionnels' : 'Clients'}` : ''
        }`}
        actions={
          <>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => fetchUsers(true)}
              disabled={refreshing}
              aria-label="Actualiser la liste des utilisateurs"
              className="px-4 py-2.5 rounded-xl bg-card border border-border hover:bg-accent font-semibold text-sm transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} aria-hidden="true" />
              <span className="hidden sm:inline">Actualiser</span>
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => setAccessDialogOpen(true)}
              aria-label="Gérer les accès admin"
              className="px-4 py-2.5 rounded-xl bg-card border border-border hover:bg-accent font-semibold text-sm transition-colors flex items-center gap-2"
            >
              <KeyRound size={16} aria-hidden="true" />
              <span className="hidden sm:inline">Accès admin</span>
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={openCreateModal}
              aria-label="Créer un nouvel utilisateur"
              className="px-6 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl font-semibold transition-colors flex items-center gap-2"
            >
              <Plus size={20} strokeWidth={2.5} aria-hidden="true" />
              <span className="hidden sm:inline">Nouvel utilisateur</span>
              <span className="sm:hidden">Nouveau</span>
            </motion.button>
          </>
        }
      />

      {/* Filters & Search */}
      <div className="bg-card rounded-2xl border border-border p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative group">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/60 group-hover:text-muted-foreground transition-colors" aria-hidden="true" />
            <label htmlFor="users-search" className="sr-only">Rechercher un utilisateur par nom ou email</label>
            <input
              id="users-search"
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); updateParams(e.target.value, roleFilter); }}
              placeholder="Rechercher par nom ou email..."
              className="w-full pl-11 pr-4 py-3 rounded-xl border border-border bg-muted/40 focus:border-ring focus:ring-2 focus:ring-ring/30 focus:bg-card outline-none transition-all font-medium text-sm"
            />
          </div>

          <div className="flex gap-2 bg-muted p-1 rounded-xl" role="group" aria-label="Filtrer par rôle">
            {(['all', 'client', 'pro'] as const).map((role) => (
              <motion.button
                key={role}
                whileTap={{ scale: 0.97 }}
                onClick={() => { setRoleFilter(role); updateParams(searchQuery, role); }}
                aria-pressed={roleFilter === role}
                className={`px-4 py-2 rounded-lg font-semibold text-sm transition-colors ${roleFilter === role
                  ? 'bg-card text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
                  }`}
              >
                {role === 'all' ? 'Tous' : role === 'pro' ? 'Pros' : 'Clients'}
              </motion.button>
            ))}
          </div>
        </div>
      </div>

      {/* Stats rapides */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total', value: users.length, icon: UsersIcon },
          { label: 'Clients', value: users.filter(u => u.role === 'client').length, icon: User },
          { label: 'Pros', value: users.filter(u => u.role === 'pro').length, icon: Briefcase },
          { label: 'Nouveaux (30j)', value: users.filter(u => new Date(u.created_at) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).length, icon: Calendar },
        ].map((stat, i) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-card rounded-2xl border border-border p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{stat.label}</p>
                <Icon size={16} className="text-muted-foreground/60" aria-hidden="true" />
              </div>
              <p className="text-3xl font-bold text-foreground">{stat.value}</p>
            </motion.div>
          );
        })}
      </div>

      {/* Users Grid */}
      {filteredUsers.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border">
          <EmptyState
            icon={UsersIcon}
            title={searchQuery || roleFilter !== 'all' ? "Aucun utilisateur ne correspond" : "Aucun utilisateur"}
            description={
              searchQuery || roleFilter !== 'all'
                ? "Essaie d'élargir ta recherche ou de changer de filtre de rôle."
                : "Les nouveaux comptes créés apparaîtront ici."
            }
          />
        </div>
      ) : (
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredUsers.map((user, index) => (
          <motion.div
            key={user.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(index, 20) * 0.02 }}
            className="bg-card rounded-2xl border border-border hover:border-foreground/20 transition-colors duration-200 group overflow-hidden"
          >

            {/* Header Compact */}
            <div className="relative p-5">
              {/* Badges top-right */}
              {!!(user.is_verified || user.is_admin || !user.is_active || user.is_vigilant || user.is_abusive_reporter) && (
                <div className="absolute top-3 right-3 flex gap-1.5">
                  {user.is_vigilant && (
                    <div
                      className="w-7 h-7 rounded-lg bg-foreground/10 border border-foreground/30 flex items-center justify-center"
                      title={`${user.reported_count} signalement(s) fondés — voir Modération`}
                      aria-label="Compte sous vigilance (signalements fondés)"
                    >
                      <Flag size={14} className="text-foreground" strokeWidth={2.5} aria-hidden="true" />
                    </div>
                  )}
                  {user.is_abusive_reporter && (
                    <div
                      className="w-7 h-7 rounded-lg bg-muted border border-border flex items-center justify-center"
                      title={`${user.abusive_reports_count} signalement(s) abusifs déposés`}
                      aria-label="A déposé des signalements abusifs"
                    >
                      <Flag size={14} className="text-foreground/50" strokeWidth={2.5} aria-hidden="true" />
                    </div>
                  )}
                  {!user.is_active && (
                    <div
                      className="w-7 h-7 rounded-lg bg-muted border border-border flex items-center justify-center"
                      title="Inactif"
                      aria-label="Compte inactif"
                    >
                      <Ban size={14} className="text-foreground/70" strokeWidth={2.5} aria-hidden="true" />
                    </div>
                  )}
                  {user.is_verified && (
                    <div
                      className="w-7 h-7 rounded-lg bg-muted border border-border flex items-center justify-center"
                      title="Vérifié"
                      aria-label="Compte vérifié"
                    >
                      <CheckCircle size={14} className="text-foreground/70" strokeWidth={2.5} aria-hidden="true" />
                    </div>
                  )}
                  {user.is_admin && (
                    <div
                      className="w-7 h-7 rounded-lg bg-foreground/10 border border-foreground/20 flex items-center justify-center"
                      title="Administrateur"
                      aria-label="Compte administrateur"
                    >
                      <Shield size={14} className="text-foreground" strokeWidth={2.5} aria-hidden="true" />
                    </div>
                  )}
                </div>
              )}

              {/* Avatar + Nom */}
              <div className="flex items-center gap-3 mb-4">
                <div
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center font-bold text-lg flex-shrink-0 ${user.role === 'pro'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground border border-border'
                    }`}
                >
                  {user.first_name[0]}{user.last_name[0]}
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-foreground truncate text-base leading-tight">
                    {user.first_name} {user.last_name}
                  </h3>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-muted text-foreground/80">
                      {user.role === 'pro' ? <Briefcase size={10} aria-hidden="true" /> : <User size={10} aria-hidden="true" />}
                      {user.role === 'pro' ? 'Pro' : 'Client'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Infos essentielles */}
              <div className="space-y-2">
                {/* Email */}
                <div className="flex items-center gap-2 text-sm text-foreground/80">
                  <div className="w-6 h-6 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                    <Mail size={12} className="text-muted-foreground" aria-hidden="true" />
                  </div>
                  <span className="truncate font-medium text-xs">{user.email}</span>
                </div>

                {/* Téléphone */}
                {user.phone_number && (
                  <div className="flex items-center gap-2 text-sm text-foreground/80">
                    <div className="w-6 h-6 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                      <Phone size={12} className="text-muted-foreground" aria-hidden="true" />
                    </div>
                    <span className="font-medium text-xs">{user.phone_number}</span>
                  </div>
                )}

                {/* Infos PRO */}
                {user.role === 'pro' && (user.activity_name || user.city) && (
                  <div className="pt-2 border-t border-border mt-2 space-y-1.5">
                    {user.activity_name && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Briefcase size={12} className="text-muted-foreground/60 flex-shrink-0" aria-hidden="true" />
                        <span className="truncate text-xs font-medium">{user.activity_name}</span>
                      </div>
                    )}
                    {user.city && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <MapPin size={12} className="text-muted-foreground/60 flex-shrink-0" aria-hidden="true" />
                        <span className="truncate text-xs font-medium">{user.city}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Footer avec actions */}
            <div className="px-5 py-3 bg-muted/30 border-t border-border flex items-center justify-between">
              {/* Date création compacte */}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Calendar size={11} className="flex-shrink-0" aria-hidden="true" />
                <span className="font-medium">
                  {new Date(user.created_at).toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'short'
                  })}
                </span>
              </div>

              {/* Actions buttons */}
              <div className="flex gap-1.5">
                {user.role === 'client' && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOnboardingClient(user);
                    }}
                    className="w-8 h-8 rounded-lg bg-muted hover:bg-accent border border-border flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    title="Voir l'onboarding"
                    aria-label={`Voir l'onboarding de ${user.first_name} ${user.last_name}`}
                  >
                    <Sparkles size={13} className="text-foreground/70" strokeWidth={2.5} aria-hidden="true" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openEditModal(user);
                  }}
                  className="w-8 h-8 rounded-lg bg-muted hover:bg-accent border border-border flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  title="Modifier"
                  aria-label={`Modifier ${user.first_name} ${user.last_name}`}
                >
                  <Edit size={13} className="text-foreground/70" strokeWidth={2.5} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmAction({ type: 'toggle', user });
                  }}
                  className="w-8 h-8 rounded-lg bg-muted hover:bg-accent border border-border flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  title={user.is_active !== false ? 'Désactiver' : 'Réactiver'}
                  aria-label={`${user.is_active !== false ? 'Désactiver' : 'Réactiver'} ${user.first_name} ${user.last_name}`}
                >
                  {user.is_active !== false
                    ? <Ban size={13} className="text-foreground/70" strokeWidth={2.5} aria-hidden="true" />
                    : <RotateCcw size={13} className="text-foreground/70" strokeWidth={2.5} aria-hidden="true" />
                  }
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmAction({ type: 'delete', user });
                  }}
                  className="w-8 h-8 rounded-lg bg-background hover:bg-muted border border-foreground/25 flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  title="Supprimer"
                  aria-label={`Supprimer ${user.first_name} ${user.last_name}`}
                >
                  <Trash2 size={13} className="text-foreground" strokeWidth={2.5} aria-hidden="true" />
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
      )}

      {/* Modal Ultra Premium */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl w-full max-h-[90vh] overflow-hidden p-0 rounded-3xl gap-0">
          {/* Header */}
          <div className="relative border-b border-border px-8 py-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    {/* Avatar preview */}
                    {(formData.first_name || formData.last_name) && (
                      <div
                        className={`w-16 h-16 rounded-2xl flex items-center justify-center font-bold text-xl flex-shrink-0 ${formData.role === 'pro'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-foreground border border-border'
                          }`}
                      >
                        {formData.first_name[0]?.toUpperCase() || '?'}
                        {formData.last_name[0]?.toUpperCase() || '?'}
                      </div>
                    )}

                    <div>
                      <h2 className="text-2xl font-bold text-foreground">
                        {modalMode === 'create' ? 'Nouvel utilisateur' : 'Modifier l\'utilisateur'}
                      </h2>
                      <p className="text-sm text-muted-foreground mt-0.5 font-medium">
                        {modalMode === 'create'
                          ? 'Complétez les informations du nouvel utilisateur'
                          : `Modification de ${formData.first_name} ${formData.last_name}`}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Form content avec scroll */}
              <div className="overflow-y-auto max-h-[calc(90vh-200px)] px-8 py-6">
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Section Identité */}
                  <div>
                    <h3 className="text-sm font-black text-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
                      <User size={16} className="text-primary" />
                      Identité
                    </h3>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <motion.div whileFocus={{ scale: 1.01 }}>
                        <label className="block text-sm font-bold text-foreground mb-2">
                          Prénom <span className="text-muted-foreground" aria-hidden="true">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={formData.first_name}
                          onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                          className="w-full px-4 py-3 rounded-xl border-2 border-border focus:border-primary focus:ring-4 focus:ring-primary/10 bg-card outline-none transition-all font-medium placeholder:text-muted-foreground/60"
                          placeholder="Jean"
                        />
                      </motion.div>
                      <motion.div whileFocus={{ scale: 1.01 }}>
                        <label className="block text-sm font-bold text-foreground mb-2">
                          Nom <span className="text-muted-foreground" aria-hidden="true">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={formData.last_name}
                          onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                          className="w-full px-4 py-3 rounded-xl border-2 border-border focus:border-primary focus:ring-4 focus:ring-primary/10 bg-card outline-none transition-all font-medium placeholder:text-muted-foreground/60"
                          placeholder="Dupont"
                        />
                      </motion.div>
                    </div>
                  </div>

                  {/* Section Contact */}
                  <div>
                    <h3 className="text-sm font-black text-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
                      <Mail size={16} className="text-primary" />
                      Contact
                    </h3>
                    <div className="space-y-4">
                      <motion.div whileFocus={{ scale: 1.01 }}>
                        <label className="block text-sm font-bold text-foreground mb-2">
                          Email <span className="text-muted-foreground" aria-hidden="true">*</span>
                        </label>
                        <div className="relative">
                          <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
                          <input
                            type="email"
                            required
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            className="w-full pl-12 pr-4 py-3 rounded-xl border-2 border-border focus:border-primary focus:ring-4 focus:ring-primary/10 bg-card outline-none transition-all font-medium placeholder:text-muted-foreground/60"
                            placeholder="jean.dupont@example.com"
                          />
                        </div>
                      </motion.div>

                      <motion.div whileFocus={{ scale: 1.01 }}>
                        <label className="block text-sm font-bold text-foreground mb-2">
                          Téléphone <span className="text-muted-foreground" aria-hidden="true">*</span>
                        </label>
                        <div className="relative">
                          <Phone size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
                          <input
                            type="tel"
                            required
                            value={formData.phone_number}
                            onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                            className="w-full pl-12 pr-4 py-3 rounded-xl border-2 border-border focus:border-primary focus:ring-4 focus:ring-primary/10 bg-card outline-none transition-all font-medium placeholder:text-muted-foreground/60"
                            placeholder="+33 6 12 34 56 78"
                          />
                        </div>
                      </motion.div>

                      <motion.div whileFocus={{ scale: 1.01 }}>
                        <label className="block text-sm font-bold text-foreground mb-2 flex items-center gap-2">
                          <Cake size={14} className="text-muted-foreground" />
                          Date de naissance
                        </label>
                        <div className="relative">
                          <Calendar size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
                          <input
                            type="date"
                            value={formData.birth_date ? new Date(formData.birth_date).toISOString().split('T')[0] : ''}
                            onChange={(e) => setFormData({ ...formData, birth_date: e.target.value })}
                            className="w-full pl-12 pr-4 py-3 rounded-xl border-2 border-border focus:border-primary focus:ring-4 focus:ring-primary/10 bg-card outline-none transition-all font-medium"
                          />
                        </div>
                      </motion.div>
                    </div>
                  </div>

                  {/* Section Rôle & Permissions */}
                  <div>
                    <h3 className="text-sm font-black text-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
                      <Shield size={16} className="text-primary" />
                      Rôle & Permissions
                    </h3>
                    <div className="space-y-4">
                      <motion.div whileFocus={{ scale: 1.01 }}>
                        <label className="block text-sm font-bold text-foreground mb-2">
                          Rôle <span className="text-muted-foreground" aria-hidden="true">*</span>
                        </label>
                        <div className="relative">
                          <Briefcase size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
                          <select
                            required
                            value={formData.role}
                            onChange={(e) => setFormData({ ...formData, role: e.target.value as 'client' | 'pro' })}
                            className="w-full pl-12 pr-4 py-3 rounded-xl border-2 border-border focus:border-primary focus:ring-4 focus:ring-primary/10 bg-card outline-none transition-all font-medium appearance-none cursor-pointer"
                          >
                            <option value="client">👤 Client</option>
                            <option value="pro">💼 Professionnel</option>
                          </select>
                          <ChevronLeft size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground/60 rotate-[-90deg] pointer-events-none" />
                        </div>
                      </motion.div>

                      {/* Checkboxes avec design premium */}
                      <div className="grid sm:grid-cols-2 gap-4">
                        <label
                          className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors ${formData.is_admin
                            ? 'bg-accent border-foreground/20'
                            : 'bg-muted/40 border-border hover:border-foreground/15'
                            }`}
                        >
                          <input
                            type="checkbox"
                            checked={formData.is_admin}
                            onChange={(e) => setFormData({ ...formData, is_admin: e.target.checked })}
                            className="w-5 h-5 rounded-lg border-2 border-border text-foreground focus:ring-2 focus:ring-ring/40"
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <Shield size={16} className={formData.is_admin ? 'text-foreground' : 'text-muted-foreground'} aria-hidden="true" />
                              <span className="text-sm font-bold text-foreground">Administrateur</span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">Accès total au panel admin</p>
                          </div>
                        </label>

                        <label
                          className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors ${formData.is_verified
                            ? 'bg-accent border-foreground/20'
                            : 'bg-muted/40 border-border hover:border-foreground/15'
                            }`}
                        >
                          <input
                            type="checkbox"
                            checked={formData.is_verified}
                            onChange={(e) => setFormData({ ...formData, is_verified: e.target.checked })}
                            className="w-5 h-5 rounded-lg border-2 border-border text-foreground focus:ring-2 focus:ring-ring/40"
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <CheckCircle size={16} className={formData.is_verified ? 'text-foreground' : 'text-muted-foreground'} aria-hidden="true" />
                              <span className="text-sm font-bold text-foreground">Vérifié</span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">Compte validé par l'équipe</p>
                          </div>
                        </label>
                      </div>
                    </div>
                  </div>
                </form>
              </div>

              {/* Footer avec actions */}
              <div className="border-t border-border bg-muted/30 px-8 py-5">
                <div className="flex flex-col-reverse sm:flex-row gap-3">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 px-6 py-3.5 rounded-xl border-2 border-border bg-card hover:bg-muted/40 font-bold transition-colors flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X size={18} aria-hidden="true" />
                    Annuler
                  </button>
                  <button
                    type="submit"
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="flex-1 px-6 py-3.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {submitting ? (
                      <>
                        <Loader2 size={20} className="animate-spin" aria-hidden="true" />
                        <span>En cours...</span>
                      </>
                    ) : (
                      <>
                        <Check size={20} strokeWidth={2.5} aria-hidden="true" />
                        <span>{modalMode === 'create' ? 'Créer l\'utilisateur' : 'Enregistrer les modifications'}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation destructrice (suppression / activation) */}
      <AlertDialog open={!!confirmAction} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.type === 'delete'
                ? `Supprimer ${confirmAction.user.first_name} ${confirmAction.user.last_name} ?`
                : `${confirmAction?.user.is_active !== false ? 'Désactiver' : 'Réactiver'} ${confirmAction?.user.first_name} ${confirmAction?.user.last_name} ?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.type === 'delete'
                ? "Cette action est irréversible et supprimera définitivement ce compte."
                : "Cette action peut être annulée à tout moment depuis la fiche utilisateur."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirmLoading}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmAction}
              disabled={confirmLoading}
              className={confirmAction?.type === 'delete' ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground" : ""}
            >
              {confirmLoading
                ? "En cours..."
                : confirmAction?.type === 'delete'
                  ? "Supprimer"
                  : confirmAction?.user.is_active !== false ? "Désactiver" : "Réactiver"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AdminAccessDialog open={accessDialogOpen} onOpenChange={setAccessDialogOpen} />

      <ClientOnboardingDialog
        clientId={onboardingClient?.id ?? null}
        clientName={onboardingClient ? `${onboardingClient.first_name} ${onboardingClient.last_name}`.trim() : undefined}
        open={!!onboardingClient}
        onOpenChange={(v) => { if (!v) setOnboardingClient(null); }}
      />
    </div>
  );
};

export default AdminUsers;
