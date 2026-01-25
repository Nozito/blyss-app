import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
  AlertCircle,
  Info,
  Shield,
  Cake,
  ChevronLeft,
} from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

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
  created_at: string;
  activity_name?: string;
  city?: string;
}

interface Notification {
  id: number;
  type: 'success' | 'error' | 'info';
  message: string;
}

const AdminUsers = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<'all' | 'client' | 'pro'>('all');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
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
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [nextNotifId, setNextNotifId] = useState(1);

  const showNotification = (type: 'success' | 'error' | 'info', message: string) => {
    const id = nextNotifId;
    setNextNotifId(id + 1);
    setNotifications(prev => [...prev, { id, type, message }]);

    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 3000);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const token = localStorage.getItem("auth_token");
      const response = await fetch(`${API_URL}/api/admin/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setUsers(data.data || []);
        if (showRefresh) showNotification('success', 'Liste actualisée');
      }
    } catch (error) {
      console.error("❌ ERROR fetching users:", error);
      showNotification('error', 'Erreur lors du chargement');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const formatDate = (dateString: string | undefined | null) => {
    if (!dateString) {
      console.log("⚠️ Date vide ou undefined:", dateString);
      return null;
    }

    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        console.log("⚠️ Date invalide:", dateString);
        return null;
      }

      const formatted = date.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
      return formatted;
    } catch (error) {
      console.error("❌ Erreur formatage date:", error);
      return null;
    }
  };

  const openEditModal = (user: User) => {
    console.log("✏️ EDIT USER:", {
      id: user.id,
      phone_number: user.phone_number,
      birth_date: user.birth_date
    });

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

    console.log("📤 SUBMITTING FORM DATA:", formData);

    try {
      const token = localStorage.getItem("auth_token");
      const url = modalMode === 'create'
        ? `${API_URL}/api/admin/users/create`
        : `${API_URL}/api/admin/users/${selectedUser?.id}`;

      const response = await fetch(url, {
        method: modalMode === 'create' ? 'POST' : 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      const responseData = await response.json();
      console.log("📥 SERVER RESPONSE:", responseData);

      if (response.ok) {
        showNotification('success', modalMode === 'create' ? 'Utilisateur créé avec succès' : 'Modifications enregistrées');
        setIsModalOpen(false);
        fetchUsers();
      } else {
        console.error("❌ ERROR RESPONSE:", responseData);
        showNotification('error', responseData.message || 'Une erreur est survenue');
      }
    } catch (error) {
      console.error("❌ NETWORK ERROR:", error);
      showNotification('error', 'Erreur de connexion au serveur');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (userId: number, userName: string) => {
    if (!confirm(`Supprimer ${userName} ?`)) return;

    try {
      const token = localStorage.getItem("auth_token");
      const response = await fetch(`${API_URL}/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        showNotification('success', 'Utilisateur supprimé');
        fetchUsers();
      } else {
        showNotification('error', 'Impossible de supprimer cet utilisateur');
      }
    } catch (error) {
      showNotification('error', 'Erreur serveur');
    }
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = `${user.first_name} ${user.last_name} ${user.email}`.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        >
          <Loader2 size={40} className="text-primary" />
        </motion.div>
        <p className="text-sm text-muted-foreground font-medium">Chargement des utilisateurs...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Notifications flottantes */}
      <div className="fixed top-24 right-6 z-50 space-y-2 w-80 max-w-[calc(100vw-3rem)]">
        <AnimatePresence>
          {notifications.map((notif) => {
            const icons = { success: CheckCircle, error: AlertCircle, info: Info };
            const colors = {
              success: 'bg-green-50 border-green-200 text-green-800',
              error: 'bg-red-50 border-red-200 text-red-800',
              info: 'bg-blue-50 border-blue-200 text-blue-800',
            };
            const iconColors = {
              success: 'text-green-600',
              error: 'text-red-600',
              info: 'text-blue-600',
            };

            const Icon = icons[notif.type];

            return (
              <motion.div
                key={notif.id}
                initial={{ opacity: 0, y: -20, x: 100, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 100, scale: 0.8 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className={`flex items-center gap-3 px-4 py-3 rounded-2xl border-2 shadow-lg backdrop-blur-sm ${colors[notif.type]}`}
              >
                <Icon size={20} className={iconColors[notif.type]} strokeWidth={2.5} />
                <p className="flex-1 font-bold text-sm">{notif.message}</p>
                <motion.button
                  whileHover={{ scale: 1.1, rotate: 90 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setNotifications(prev => prev.filter(n => n.id !== notif.id))}
                  className="w-6 h-6 rounded-lg hover:bg-black/5 flex items-center justify-center transition-colors"
                >
                  <X size={14} />
                </motion.button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Utilisateurs</h1>
          <p className="text-sm text-muted-foreground mt-1 font-medium">
            {filteredUsers.length} utilisateur{filteredUsers.length > 1 ? 's' : ''}
            {roleFilter !== 'all' && ` · ${roleFilter === 'pro' ? 'Professionnels' : 'Clients'}`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => fetchUsers(true)}
            disabled={refreshing}
            className="px-4 py-2.5 rounded-xl bg-white border-2 border-gray-200 hover:border-primary/30 hover:bg-gray-50 font-bold text-sm transition-all flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Actualiser</span>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={openCreateModal}
            className="px-6 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl font-bold shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all flex items-center gap-2"
          >
            <Plus size={20} strokeWidth={2.5} />
            <span className="hidden sm:inline">Nouvel utilisateur</span>
            <span className="sm:hidden">Nouveau</span>
          </motion.button>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="bg-white rounded-2xl border-2 border-gray-100 p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative group">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-hover:text-gray-600 transition-colors" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher par nom ou email..."
              className="w-full pl-11 pr-4 py-3 rounded-xl border-2 border-gray-200 bg-gray-50 focus:border-primary focus:bg-white outline-none transition-all font-medium text-sm"
            />
          </div>

          <div className="flex gap-2 bg-gray-100 p-1 rounded-xl">
            {(['all', 'client', 'pro'] as const).map((role) => (
              <motion.button
                key={role}
                whileTap={{ scale: 0.95 }}
                onClick={() => setRoleFilter(role)}
                className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${roleFilter === role
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
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
          { label: 'Total', value: users.length, icon: User },
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
              whileHover={{ y: -2 }}
              className="bg-white rounded-2xl border-2 border-gray-100 p-4 hover:border-primary/20 hover:shadow-lg transition-all group cursor-pointer"
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{stat.label}</p>
                <Icon size={16} className="text-gray-400 group-hover:text-primary transition-colors" />
              </div>
              <p className="text-3xl font-black text-gray-900">{stat.value}</p>
            </motion.div>
          );
        })}
      </div>

      {/* Users Grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredUsers.map((user, index) => (
          <motion.div
            key={user.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.02 }}
            whileHover={{ y: -6, scale: 1.02 }}
            className="bg-white rounded-2xl border-2 border-gray-100 hover:border-primary/30 hover:shadow-2xl transition-all duration-300 group overflow-hidden cursor-pointer"
          >

            {/* Header Compact */}
            <div className="relative p-5 bg-gradient-to-br from-gray-50 via-transparent to-transparent">
              {/* Badges top-right */}
              {!!(user.is_verified || user.is_admin) && (
                <div className="absolute top-3 right-3 flex gap-1.5">
                  {user.is_verified && (
                    <motion.div
                      initial={{ scale: 0, rotate: -180 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ delay: index * 0.02 + 0.1 }}
                      className="w-7 h-7 rounded-lg bg-green-100 flex items-center justify-center group-hover:scale-110 transition-transform"
                      title="Vérifié"
                    >
                      <CheckCircle size={14} className="text-green-600" strokeWidth={2.5} />
                    </motion.div>
                  )}
                  {user.is_admin && (
                    <motion.div
                      initial={{ scale: 0, rotate: -180 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ delay: index * 0.02 + 0.15 }}
                      className="w-7 h-7 rounded-lg bg-purple-100 flex items-center justify-center group-hover:scale-110 transition-transform"
                      title="Administrateur"
                    >
                      <Shield size={14} className="text-purple-600" strokeWidth={2.5} />
                    </motion.div>
                  )}
                </div>
              )}


              {/* Avatar + Nom */}
              <div className="flex items-center gap-3 mb-4">
                <motion.div
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white font-black text-lg shadow-lg flex-shrink-0 ${user.role === 'pro'
                    ? 'bg-gradient-to-br from-primary via-purple-500 to-pink-500'
                    : 'bg-gradient-to-br from-gray-600 via-gray-700 to-gray-900'
                    }`}
                >
                  {user.first_name[0]}{user.last_name[0]}
                </motion.div>

                <div className="flex-1 min-w-0">
                  <h3 className="font-black text-gray-900 truncate text-base leading-tight">
                    {user.first_name} {user.last_name}
                  </h3>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${user.role === 'pro'
                      ? 'bg-gradient-to-r from-primary/10 to-pink-500/10 text-primary'
                      : 'bg-gray-100 text-gray-700'
                      }`}>
                      {user.role === 'pro' ? '💼 Pro' : '👤 Client'}
                    </span>
                  </div>
                </div>
              </div>


              {/* Infos essentielles */}
              <div className="space-y-2">
                {/* Email */}
                <motion.div
                  whileHover={{ x: 3 }}
                  className="flex items-center gap-2 text-sm text-gray-700 group/item"
                >
                  <div className="w-6 h-6 rounded-lg bg-gray-100 group-hover/item:bg-primary/10 flex items-center justify-center flex-shrink-0 transition-colors">
                    <Mail size={12} className="text-gray-500 group-hover/item:text-primary transition-colors" />
                  </div>
                  <span className="truncate font-medium text-xs">{user.email}</span>
                </motion.div>

                {/* Téléphone */}
                {user.phone_number && (
                  <motion.div
                    whileHover={{ x: 3 }}
                    className="flex items-center gap-2 text-sm text-gray-700 group/item"
                  >
                    <div className="w-6 h-6 rounded-lg bg-gray-100 group-hover/item:bg-primary/10 flex items-center justify-center flex-shrink-0 transition-colors">
                      <Phone size={12} className="text-gray-500 group-hover/item:text-primary transition-colors" />
                    </div>
                    <span className="font-medium text-xs">{user.phone_number}</span>
                  </motion.div>
                )}

                {/* Infos PRO */}
                {user.role === 'pro' && (user.activity_name || user.city) && (
                  <div className="pt-2 border-t border-gray-100 mt-2 space-y-1.5">
                    {user.activity_name && (
                      <motion.div
                        whileHover={{ x: 3 }}
                        className="flex items-center gap-2 text-sm text-gray-600 group/item"
                      >
                        <Briefcase size={12} className="text-gray-400 group-hover/item:text-primary transition-colors flex-shrink-0" />
                        <span className="truncate text-xs font-medium">{user.activity_name}</span>
                      </motion.div>
                    )}
                    {user.city && (
                      <motion.div
                        whileHover={{ x: 3 }}
                        className="flex items-center gap-2 text-sm text-gray-600 group/item"
                      >
                        <MapPin size={12} className="text-gray-400 group-hover/item:text-primary transition-colors flex-shrink-0" />
                        <span className="truncate text-xs font-medium">{user.city}</span>
                      </motion.div>
                    )}
                  </div>
                )}
              </div>
            </div>


            {/* Footer avec actions */}
            <div className="px-5 py-3 bg-gray-50/50 border-t border-gray-100 flex items-center justify-between">
              {/* Date création compacte */}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Calendar size={11} className="flex-shrink-0" />
                <span className="font-medium">
                  {new Date(user.created_at).toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'short'
                  })}
                </span>
              </div>

              {/* Actions buttons */}
              <div className="flex gap-1.5">
                <motion.button
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    openEditModal(user);
                  }}
                  className="w-8 h-8 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-100 hover:border-blue-200 flex items-center justify-center transition-all group/btn"
                  title="Modifier"
                >
                  <Edit size={13} className="text-blue-600 group-hover/btn:scale-110 transition-transform" strokeWidth={2.5} />
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(user.id, `${user.first_name} ${user.last_name}`);
                  }}
                  className="w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 border border-red-100 hover:border-red-200 flex items-center justify-center transition-all group/btn"
                  title="Supprimer"
                >
                  <Trash2 size={13} className="text-red-600 group-hover/btn:scale-110 transition-transform" strokeWidth={2.5} />
                </motion.button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Modal Ultra Premium */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setIsModalOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 30 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-hidden shadow-2xl"
            >
              {/* Header */}
              <div className="relative border-b border-gray-100 px-8 py-6">
                <div className="absolute top-0 left-0 w-full h-1" />

                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    {/* Avatar preview */}
                    {(formData.first_name || formData.last_name) && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className={`w-16 h-16 rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-lg ${formData.role === 'pro'
                          ? 'bg-gradient-to-br from-primary to-pink-500'
                          : 'bg-gradient-to-br from-gray-700 to-gray-900'
                          }`}
                      >
                        {formData.first_name[0]?.toUpperCase() || '?'}
                        {formData.last_name[0]?.toUpperCase() || '?'}
                      </motion.div>
                    )}

                    <div>
                      <h2 className="text-2xl font-black text-gray-900">
                        {modalMode === 'create' ? 'Nouvel utilisateur' : 'Modifier l\'utilisateur'}
                      </h2>
                      <p className="text-sm text-muted-foreground mt-0.5 font-medium">
                        {modalMode === 'create'
                          ? 'Complétez les informations du nouvel utilisateur'
                          : `Modification de ${formData.first_name} ${formData.last_name}`}
                      </p>
                    </div>
                  </div>

                  <motion.button
                    whileHover={{ scale: 1.1, rotate: 90 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setIsModalOpen(false)}
                    className="w-10 h-10 rounded-xl bg-white hover:bg-gray-100 flex items-center justify-center transition-colors shadow-sm border border-gray-200"
                  >
                    <X size={20} className="text-gray-600" />
                  </motion.button>
                </div>
              </div>

              {/* Form content avec scroll */}
              <div className="overflow-y-auto max-h-[calc(90vh-200px)] px-8 py-6">
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Section Identité */}
                  <div>
                    <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                      <User size={16} className="text-primary" />
                      Identité
                    </h3>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <motion.div whileFocus={{ scale: 1.01 }}>
                        <label className="block text-sm font-bold text-gray-900 mb-2">
                          Prénom <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={formData.first_name}
                          onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                          className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-primary focus:ring-4 focus:ring-primary/10 bg-white outline-none transition-all font-medium placeholder:text-gray-400"
                          placeholder="Jean"
                        />
                      </motion.div>
                      <motion.div whileFocus={{ scale: 1.01 }}>
                        <label className="block text-sm font-bold text-gray-900 mb-2">
                          Nom <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={formData.last_name}
                          onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                          className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-primary focus:ring-4 focus:ring-primary/10 bg-white outline-none transition-all font-medium placeholder:text-gray-400"
                          placeholder="Dupont"
                        />
                      </motion.div>
                    </div>
                  </div>

                  {/* Section Contact */}
                  <div>
                    <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                      <Mail size={16} className="text-primary" />
                      Contact
                    </h3>
                    <div className="space-y-4">
                      <motion.div whileFocus={{ scale: 1.01 }}>
                        <label className="block text-sm font-bold text-gray-900 mb-2">
                          Email <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                          <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                          <input
                            type="email"
                            required
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            className="w-full pl-12 pr-4 py-3 rounded-xl border-2 border-gray-200 focus:border-primary focus:ring-4 focus:ring-primary/10 bg-white outline-none transition-all font-medium placeholder:text-gray-400"
                            placeholder="jean.dupont@example.com"
                          />
                        </div>
                      </motion.div>

                      <motion.div whileFocus={{ scale: 1.01 }}>
                        <label className="block text-sm font-bold text-gray-900 mb-2">
                          Téléphone <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                          <Phone size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                          <input
                            type="tel"
                            required
                            value={formData.phone_number}
                            onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                            className="w-full pl-12 pr-4 py-3 rounded-xl border-2 border-gray-200 focus:border-primary focus:ring-4 focus:ring-primary/10 bg-white outline-none transition-all font-medium placeholder:text-gray-400"
                            placeholder="+33 6 12 34 56 78"
                          />
                        </div>
                      </motion.div>

                      <motion.div whileFocus={{ scale: 1.01 }}>
                        <label className="block text-sm font-bold text-gray-900 mb-2 flex items-center gap-2">
                          <Cake size={14} className="text-gray-600" />
                          Date de naissance
                        </label>
                        <div className="relative">
                          <Calendar size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                          <input
                            type="date"
                            value={formData.birth_date ? new Date(formData.birth_date).toISOString().split('T')[0] : ''}
                            onChange={(e) => {
                              console.log("📅 DATE INPUT CHANGE:", e.target.value);
                              setFormData({ ...formData, birth_date: e.target.value });
                            }}
                            className="w-full pl-12 pr-4 py-3 rounded-xl border-2 border-gray-200 focus:border-primary focus:ring-4 focus:ring-primary/10 bg-white outline-none transition-all font-medium"
                          />
                        </div>
                      </motion.div>
                    </div>
                  </div>

                  {/* Section Rôle & Permissions */}
                  <div>
                    <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                      <Shield size={16} className="text-primary" />
                      Rôle & Permissions
                    </h3>
                    <div className="space-y-4">
                      <motion.div whileFocus={{ scale: 1.01 }}>
                        <label className="block text-sm font-bold text-gray-900 mb-2">
                          Rôle <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                          <Briefcase size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                          <select
                            required
                            value={formData.role}
                            onChange={(e) => setFormData({ ...formData, role: e.target.value as 'client' | 'pro' })}
                            className="w-full pl-12 pr-4 py-3 rounded-xl border-2 border-gray-200 focus:border-primary focus:ring-4 focus:ring-primary/10 bg-white outline-none transition-all font-medium appearance-none cursor-pointer"
                          >
                            <option value="client">👤 Client</option>
                            <option value="pro">💼 Professionnel</option>
                          </select>
                          <ChevronLeft size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 rotate-[-90deg] pointer-events-none" />
                        </div>
                      </motion.div>

                      {/* Checkboxes avec design premium */}
                      <div className="grid sm:grid-cols-2 gap-4">
                        <motion.label
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${formData.is_admin
                            ? 'bg-purple-50 border-purple-200'
                            : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                            }`}
                        >
                          <input
                            type="checkbox"
                            checked={formData.is_admin}
                            onChange={(e) => setFormData({ ...formData, is_admin: e.target.checked })}
                            className="w-5 h-5 rounded-lg border-2 border-gray-300 text-purple-600 focus:ring-2 focus:ring-purple-500/20"
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <Shield size={16} className={formData.is_admin ? 'text-purple-600' : 'text-gray-600'} />
                              <span className="text-sm font-bold text-gray-900">Administrateur</span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">Accès total au panel admin</p>
                          </div>
                        </motion.label>

                        <motion.label
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${formData.is_verified
                            ? 'bg-green-50 border-green-200'
                            : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                            }`}
                        >
                          <input
                            type="checkbox"
                            checked={formData.is_verified}
                            onChange={(e) => setFormData({ ...formData, is_verified: e.target.checked })}
                            className="w-5 h-5 rounded-lg border-2 border-gray-300 text-green-600 focus:ring-2 focus:ring-green-500/20"
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <CheckCircle size={16} className={formData.is_verified ? 'text-green-600' : 'text-gray-600'} />
                              <span className="text-sm font-bold text-gray-900">Vérifié</span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">Compte validé par l'équipe</p>
                          </div>
                        </motion.label>
                      </div>
                    </div>
                  </div>
                </form>
              </div>

              {/* Footer avec actions */}
              <div className="border-t border-gray-100 bg-gray-50/50 px-8 py-5">
                <div className="flex flex-col-reverse sm:flex-row gap-3">
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 px-6 py-3.5 rounded-xl border-2 border-gray-200 bg-white hover:bg-gray-50 font-bold transition-all flex items-center justify-center gap-2 group"
                  >
                    <X size={18} className="group-hover:rotate-90 transition-transform" />
                    Annuler
                  </motion.button>
                  <motion.button
                    type="submit"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="flex-1 px-6 py-3.5 rounded-xl bg-gradient-to-r from-primary to-pink-500 hover:from-primary/90 hover:to-pink-500/90 text-white font-bold shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {submitting ? (
                      <>
                        <Loader2 size={20} className="animate-spin" />
                        <span>En cours...</span>
                      </>
                    ) : (
                      <>
                        <Check size={20} strokeWidth={2.5} />
                        <span>{modalMode === 'create' ? 'Créer l\'utilisateur' : 'Enregistrer les modifications'}</span>
                      </>
                    )}
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminUsers;
