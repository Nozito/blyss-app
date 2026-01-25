import { useState, useEffect } from "react";
import {
    Send,
    User,
    Users,
    Bell,
    CheckCircle,
    AlertCircle,
    Calendar,
    Clock,
    Search,
    Filter,
    Sparkles,
    BellOff,
    MessageSquare,
    CreditCard,
    BarChart3,
    AlertTriangle,
    Gift,
    Mail,
    TrendingUp,
    Zap,
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

interface User {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
    role: "pro" | "client";
}

// ✅ Configuration des types de notifications
const notificationTypesForPro = [
    { value: "new_booking", label: "Nouvelle réservation", icon: Calendar, gradient: "from-green-500 to-emerald-600", column: "new_reservation" },
    { value: "booking_cancelled", label: "Annulation/Modification", icon: AlertCircle, gradient: "from-red-500 to-rose-600", column: "cancel_change" },
    { value: "booking_reminder", label: "Rappel quotidien", icon: Clock, gradient: "from-blue-500 to-indigo-600", column: "daily_reminder" },
    { value: "message_received", label: "Message client", icon: MessageSquare, gradient: "from-purple-500 to-violet-600", column: "client_message" },
    { value: "payment_received", label: "Alerte paiement", icon: CreditCard, gradient: "from-emerald-500 to-teal-600", column: "payment_alert" },
    { value: "activity_summary", label: "Résumé d'activité", icon: BarChart3, gradient: "from-indigo-500 to-purple-600", column: "activity_summary" },
];

const notificationTypesForClient = [
    { value: "booking_reminder", label: "Rappels", icon: Bell, gradient: "from-blue-500 to-indigo-600", column: "reminders" },
    { value: "booking_confirmed", label: "Changements RDV", icon: CheckCircle, gradient: "from-green-500 to-emerald-600", column: "changes" },
    { value: "message_received", label: "Messages", icon: MessageSquare, gradient: "from-purple-500 to-violet-600", column: "messages" },
    { value: "late_alert", label: "Alerte retard", icon: AlertTriangle, gradient: "from-orange-500 to-amber-600", column: "late" },
    { value: "promotional", label: "Offres promo", icon: Gift, gradient: "from-pink-500 to-rose-600", column: "offers" },
    { value: "email_summary", label: "Résumé email", icon: Mail, gradient: "from-gray-500 to-slate-600", column: "email_summary" },
];

const templates: { [key: string]: { title: string; message: string } } = {
    new_booking: {
        title: "Nouvelle réservation",
        message: "Tu as une nouvelle réservation pour [date] à [heure]",
    },
    booking_cancelled: {
        title: "Réservation modifiée",
        message: "Une réservation a été modifiée ou annulée",
    },
    booking_reminder: {
        title: "Rappel de rendez-vous",
        message: "N'oublie pas ton RDV demain à [heure]",
    },
    message_received: {
        title: "Nouveau message",
        message: "Tu as reçu un nouveau message",
    },
    payment_received: {
        title: "Paiement reçu",
        message: "Un paiement de [montant]€ a été reçu",
    },
    activity_summary: {
        title: "Résumé de la journée",
        message: "Tu as eu [nombre] réservations aujourd'hui",
    },
    late_alert: {
        title: "Alerte retard",
        message: "Ton pro t'informe d'un léger retard",
    },
    promotional: {
        title: "Offre spéciale",
        message: "-20% sur ta prochaine prestation ! 💅",
    },
    booking_confirmed: {
        title: "Réservation confirmée",
        message: "Ta réservation pour [date] est confirmée",
    },
    email_summary: {
        title: "Résumé hebdomadaire",
        message: "Voici ton résumé de la semaine",
    },
};

const AdminNotifications = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
    const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
    const [type, setType] = useState("new_booking");
    const [title, setTitle] = useState("");
    const [message, setMessage] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [roleFilter, setRoleFilter] = useState<"all" | "pro" | "client">("all");
    const [recentNotifications, setRecentNotifications] = useState<any[]>([]);
    const [userNotificationSettings, setUserNotificationSettings] = useState<any>(null);

    // Charger les utilisateurs
    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const token = localStorage.getItem("auth_token");
                const response = await fetch(`${API_URL}/api/admin/users`, {
                    headers: { Authorization: `Bearer ${token}` },
                });

                if (response.ok) {
                    const data = await response.json();
                    setUsers(data.data || []);
                    setFilteredUsers(data.data || []);
                }
            } catch (error) {
                console.error("Fetch users error:", error);
                toast.error("Impossible de charger les utilisateurs");
            }
        };

        fetchUsers();
    }, []);

    // Charger les préférences de notification
    useEffect(() => {
        if (!selectedUserId) {
            setUserNotificationSettings(null);
            return;
        }

        const fetchUserSettings = async () => {
            try {
                const token = localStorage.getItem("auth_token");
                const response = await fetch(
                    `${API_URL}/api/admin/users/${selectedUserId}/notification-settings`,
                    {
                        headers: { Authorization: `Bearer ${token}` },
                    }
                );

                if (response.ok) {
                    const data = await response.json();
                    setUserNotificationSettings(data.data);
                }
            } catch (error) {
                console.error("Fetch settings error:", error);
            }
        };

        fetchUserSettings();
    }, [selectedUserId]);

    // Filtrer les utilisateurs
    useEffect(() => {
        let filtered = users;

        if (roleFilter !== "all") {
            filtered = filtered.filter((u) => u.role === roleFilter);
        }

        if (searchQuery) {
            filtered = filtered.filter(
                (u) =>
                    u.first_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    u.last_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    u.email.toLowerCase().includes(searchQuery.toLowerCase())
            );
        }

        setFilteredUsers(filtered);
    }, [searchQuery, roleFilter, users]);

    const applyTemplate = (templateType: string) => {
        const template = templates[templateType];
        if (template) {
            setTitle(template.title);
            setMessage(template.message);
        }
    };

    // Envoyer la notification
    const handleSend = async () => {
        if (!selectedUserId || !title || !message) {
            toast.error("Remplis tous les champs obligatoires");
            return;
        }

        setIsLoading(true);

        try {
            const token = localStorage.getItem("auth_token");
            const response = await fetch(`${API_URL}/api/admin/notifications/create`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    user_id: selectedUserId,
                    type,
                    title,
                    message,
                }),
            });

            const result = await response.json();

            if (response.ok) {
                toast.success("✅ Notification envoyée !");

                const selectedUser = users.find((u) => u.id === selectedUserId);
                setRecentNotifications([
                    {
                        user: `${selectedUser?.first_name} ${selectedUser?.last_name}`,
                        title,
                        type,
                        timestamp: new Date().toISOString(),
                    },
                    ...recentNotifications.slice(0, 4),
                ]);

                setTitle("");
                setMessage("");
            } else {
                toast.error(result.message || "Erreur lors de l'envoi");
            }
        } catch (error) {
            console.error("Send notification error:", error);
            toast.error("Erreur réseau");
        } finally {
            setIsLoading(false);
        }
    };

    const selectedUser = users.find((u) => u.id === selectedUserId);
    const availableTypes = selectedUser?.role === "pro" ? notificationTypesForPro : notificationTypesForClient;
    const selectedTypeData = availableTypes.find((t) => t.value === type);
    const isTypeEnabled = userNotificationSettings && selectedTypeData
        ? userNotificationSettings[selectedTypeData.column] === 1
        : true;

    // Réinitialiser le type si on change de rôle
    useEffect(() => {
        if (selectedUser) {
            const defaultType = selectedUser.role === "pro" ? "new_booking" : "booking_reminder";
            setType(defaultType);
            applyTemplate(defaultType);
        }
    }, [selectedUser?.id]);

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-7xl mx-auto">
                {/* 🎨 Header moderne */}
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-8"
                >
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-pink-500 flex items-center justify-center shadow-xl">
                                <Zap size={32} className="text-white" />
                            </div>
                            <div>
                                <h1 className="text-4xl font-bold text-gray-900">Notifications</h1>
                                <p className="text-gray-600 mt-1">Envoi en temps réel via WebSocket</p>
                            </div>
                        </div>

                        {/* Stats rapides */}
                        <div className="flex gap-3">
                            <div className="px-4 py-2 rounded-xl bg-white border-2 border-gray-200">
                                <p className="text-xs text-gray-500">Total</p>
                                <p className="text-2xl font-bold text-gray-900">{users.length}</p>
                            </div>
                            <div className="px-4 py-2 rounded-xl bg-white border-2 border-primary/20">
                                <p className="text-xs text-primary">Envoyées</p>
                                <p className="text-2xl font-bold text-primary">{recentNotifications.length}</p>
                            </div>
                        </div>
                    </div>
                </motion.div>

                <div className="grid lg:grid-cols-3 gap-6">
                    {/* 📝 Formulaire principal */}
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 }}
                        className="lg:col-span-2"
                    >
                        <div className="rounded-3xl bg-white border-2 border-gray-200 shadow-xl p-8 space-y-8">
                            {/* Sélection utilisateur */}
                            <div>
                                <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                        <User size={20} className="text-primary" />
                                    </div>
                                    Destinataire
                                </h2>

                                {/* Filtres */}
                                <div className="flex gap-3 mb-4">
                                    <div className="relative flex-1">
                                        <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                        <input
                                            type="text"
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            placeholder="Rechercher..."
                                            className="w-full pl-12 pr-4 py-3.5 rounded-xl border-2 border-gray-200 bg-gray-50 focus:border-primary focus:bg-white outline-none transition-all text-sm"
                                        />
                                    </div>
                                    <select
                                        value={roleFilter}
                                        onChange={(e) => setRoleFilter(e.target.value as any)}
                                        className="px-5 py-3.5 rounded-xl border-2 border-gray-200 bg-gray-50 focus:border-primary focus:bg-white outline-none text-sm font-medium"
                                    >
                                        <option value="all">Tous</option>
                                        <option value="pro">Pros</option>
                                        <option value="client">Clients</option>
                                    </select>
                                </div>

                                {/* Liste utilisateurs */}
                                <div className="max-h-80 overflow-y-auto space-y-2 p-2">
                                    <AnimatePresence mode="popLayout">
                                        {filteredUsers.length === 0 ? (
                                            <p className="text-center text-gray-500 py-8">Aucun utilisateur trouvé</p>
                                        ) : (
                                            filteredUsers.map((user) => (
                                                <motion.button
                                                    key={user.id}
                                                    layout
                                                    initial={{ opacity: 0, scale: 0.9 }}
                                                    animate={{ opacity: 1, scale: 1 }}
                                                    exit={{ opacity: 0, scale: 0.9 }}
                                                    whileHover={{ scale: 1.02 }}
                                                    whileTap={{ scale: 0.98 }}
                                                    onClick={() => setSelectedUserId(user.id)}
                                                    className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all ${
                                                        selectedUserId === user.id
                                                            ? "bg-gradient-to-r from-primary to-pink-500 text-white shadow-xl"
                                                            : "bg-gray-50 hover:bg-gray-100 border-2 border-gray-200"
                                                    }`}
                                                >
                                                    <div
                                                        className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg ${
                                                            selectedUserId === user.id ? "bg-white/20 text-white" : "bg-primary/10 text-primary"
                                                        }`}
                                                    >
                                                        {user.first_name[0]}{user.last_name[0]}
                                                    </div>
                                                    <div className="flex-1 text-left">
                                                        <p className="font-bold">
                                                            {user.first_name} {user.last_name}
                                                        </p>
                                                        <p className={`text-sm ${selectedUserId === user.id ? "text-white/80" : "text-gray-500"}`}>
                                                            {user.email}
                                                        </p>
                                                    </div>
                                                    <span
                                                        className={`px-3 py-1 rounded-lg text-xs font-bold ${
                                                            selectedUserId === user.id
                                                                ? "bg-white/20 text-white"
                                                                : user.role === "pro"
                                                                ? "bg-purple-100 text-purple-700"
                                                                : "bg-blue-100 text-blue-700"
                                                        }`}
                                                    >
                                                        {user.role}
                                                    </span>
                                                </motion.button>
                                            ))
                                        )}
                                    </AnimatePresence>
                                </div>
                            </div>

                            {/* Type de notification */}
                            <div>
                                <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                        <Filter size={20} className="text-primary" />
                                    </div>
                                    Type
                                    {selectedUser && (
                                        <span className="text-sm text-gray-500 font-normal">
                                            ({selectedUser.role === "pro" ? "Professionnel" : "Client"})
                                        </span>
                                    )}
                                </h2>

                                <div className="grid grid-cols-2 gap-3">
                                    {availableTypes.map((t) => {
                                        const Icon = t.icon;
                                        const isEnabled = userNotificationSettings ? userNotificationSettings[t.column] === 1 : true;

                                        return (
                                            <motion.button
                                                key={t.value}
                                                whileHover={{ scale: 1.02 }}
                                                whileTap={{ scale: 0.98 }}
                                                onClick={() => {
                                                    setType(t.value);
                                                    applyTemplate(t.value);
                                                }}
                                                className={`relative p-4 rounded-2xl border-2 transition-all ${
                                                    type === t.value
                                                        ? "border-primary bg-primary/5 shadow-lg"
                                                        : "border-gray-200 bg-gray-50 hover:border-gray-300"
                                                } ${!isEnabled ? "opacity-50" : ""}`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${t.gradient} flex items-center justify-center shadow-md`}>
                                                        <Icon size={18} className="text-white" />
                                                    </div>
                                                    <span className="text-sm font-bold text-gray-900 text-left flex-1">{t.label}</span>
                                                    {!isEnabled && selectedUserId && <BellOff size={16} className="text-red-500" />}
                                                </div>
                                            </motion.button>
                                        );
                                    })}
                                </div>

                                {selectedUserId && !isTypeEnabled && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="mt-4 p-4 rounded-xl bg-yellow-50 border-2 border-yellow-200 flex items-start gap-3"
                                    >
                                        <AlertCircle size={20} className="text-yellow-600 flex-shrink-0 mt-0.5" />
                                        <p className="text-sm text-yellow-800">
                                            <strong>Attention :</strong> Ce type de notification est désactivé pour cet utilisateur.
                                        </p>
                                    </motion.div>
                                )}
                            </div>

                            {/* Contenu */}
                            <div className="space-y-4">
                                <div>
                                    <label className="text-sm font-bold text-gray-700 mb-2 block">Titre</label>
                                    <input
                                        type="text"
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        placeholder="Titre de la notification"
                                        maxLength={100}
                                        className="w-full p-4 rounded-xl border-2 border-gray-200 bg-gray-50 focus:border-primary focus:bg-white outline-none transition-all"
                                    />
                                </div>

                                <div>
                                    <label className="text-sm font-bold text-gray-700 mb-2 block">Message</label>
                                    <textarea
                                        value={message}
                                        onChange={(e) => setMessage(e.target.value)}
                                        placeholder="Contenu du message"
                                        rows={4}
                                        maxLength={500}
                                        className="w-full p-4 rounded-xl border-2 border-gray-200 bg-gray-50 focus:border-primary focus:bg-white outline-none resize-none transition-all"
                                    />
                                    <p className="text-xs text-gray-500 mt-2">{message.length} / 500 caractères</p>
                                </div>
                            </div>

                            {/* Bouton d'envoi */}
                            <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={handleSend}
                                disabled={isLoading || !selectedUserId || !title || !message}
                                className="w-full py-5 rounded-2xl bg-gradient-to-r from-primary to-pink-500 text-white font-bold text-lg flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed shadow-2xl hover:shadow-3xl transition-all"
                            >
                                {isLoading ? (
                                    <>
                                        <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin" />
                                        Envoi en cours...
                                    </>
                                ) : (
                                    <>
                                        <Send size={22} />
                                        Envoyer la notification
                                    </>
                                )}
                            </motion.button>
                        </div>
                    </motion.div>

                    {/* 📊 Colonne droite - Stats & Preview */}
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2 }}
                        className="space-y-6"
                    >
                        {/* Aperçu */}
                        <div className="rounded-3xl bg-white border-2 border-gray-200 shadow-xl p-6">
                            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                                <Sparkles size={20} className="text-primary" />
                                Aperçu
                            </h3>

                            {selectedUserId && selectedUser ? (
                                <div className="space-y-4">
                                    <div className="p-4 rounded-2xl bg-gray-50 border-2 border-gray-200">
                                        <p className="text-xs text-gray-500 mb-2">Destinataire</p>
                                        <p className="font-bold text-gray-900">
                                            {selectedUser.first_name} {selectedUser.last_name}
                                        </p>
                                        <p className="text-sm text-gray-600">{selectedUser.email}</p>
                                    </div>

                                    {selectedTypeData && (
                                        <div className="p-5 rounded-2xl bg-gradient-to-br from-gray-50 to-white border-2 border-gray-200">
                                            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${selectedTypeData.gradient} flex items-center justify-center mb-3 shadow-lg`}>
                                                <selectedTypeData.icon size={22} className="text-white" />
                                            </div>
                                            <p className="font-bold text-gray-900 mb-2">{title || "Titre..."}</p>
                                            <p className="text-sm text-gray-600 leading-relaxed">{message || "Message..."}</p>
                                            <p className="text-xs text-gray-400 mt-3 flex items-center gap-1">
                                                <Clock size={12} />
                                                À l'instant
                                            </p>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="text-center py-12">
                                    <Bell size={48} className="text-gray-300 mx-auto mb-3" />
                                    <p className="text-sm text-gray-500">Sélectionne un utilisateur</p>
                                </div>
                            )}
                        </div>

                        {/* Stats */}
                        <div className="rounded-3xl bg-white border-2 border-gray-200 shadow-xl p-6">
                            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                                <TrendingUp size={20} className="text-primary" />
                                Statistiques
                            </h3>
                            <div className="space-y-3">
                                <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-50 to-blue-100 border-2 border-blue-200">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <Users size={20} className="text-blue-600" />
                                            <span className="font-semibold text-gray-900">Utilisateurs</span>
                                        </div>
                                        <span className="text-2xl font-bold text-blue-600">{users.length}</span>
                                    </div>
                                </div>

                                <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-50 to-purple-100 border-2 border-purple-200">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <Sparkles size={20} className="text-purple-600" />
                                            <span className="font-semibold text-gray-900">Pros</span>
                                        </div>
                                        <span className="text-2xl font-bold text-purple-600">
                                            {users.filter((u) => u.role === "pro").length}
                                        </span>
                                    </div>
                                </div>

                                <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-50 to-emerald-100 border-2 border-emerald-200">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <User size={20} className="text-emerald-600" />
                                            <span className="font-semibold text-gray-900">Clients</span>
                                        </div>
                                        <span className="text-2xl font-bold text-emerald-600">
                                            {users.filter((u) => u.role === "client").length}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Historique */}
                        {recentNotifications.length > 0 && (
                            <div className="rounded-3xl bg-white border-2 border-gray-200 shadow-xl p-6">
                                <h3 className="text-lg font-bold text-gray-900 mb-4">Récemment envoyées</h3>
                                <div className="space-y-2">
                                    {recentNotifications.map((notif, idx) => (
                                        <div key={idx} className="p-3 rounded-xl bg-gray-50 border border-gray-200">
                                            <p className="text-xs font-bold text-gray-900">{notif.user}</p>
                                            <p className="text-xs text-gray-600">{notif.title}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </motion.div>
                </div>
            </div>
        </div>
    );
};

export default AdminNotifications;
