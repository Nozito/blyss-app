import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Search,
  Edit,
  Trash2,
  X,
  Calendar,
  Clock,
  User,
  Check,
  Loader2,
  CalendarRange,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Info,
  DollarSign,
} from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

interface Booking {
  id: number;
  client_id: number;
  pro_id: number;
  prestation_id: number;
  start_datetime: string;
  end_datetime: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  price: number;
  client_name?: string;
  pro_name?: string;
  created_at: string;
}

interface Notification {
  id: number;
  type: 'success' | 'error' | 'info';
  message: string;
}

const AdminBookings = () => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'confirmed' | 'cancelled' | 'completed'>('all');
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [formData, setFormData] = useState({
    client_id: '',
    pro_id: '',
    prestation_id: '',
    start_datetime: '',
    end_datetime: '',
    status: 'pending' as 'pending' | 'confirmed' | 'cancelled' | 'completed',
    price: '',
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

  const formatDateTime = (datetimeString: string | undefined) => {
    if (!datetimeString) return { date: '', time: '' };
    
    try {
      const date = new Date(datetimeString);
      if (isNaN(date.getTime())) return { date: '', time: '' };
      
      const dateStr = date.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
      
      const timeStr = date.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit'
      });
      
      return { date: dateStr, time: timeStr };
    } catch {
      return { date: '', time: '' };
    }
  };

  const formatForInput = (datetime: string) => {
    if (!datetime) return '';
    try {
      const date = new Date(datetime);
      if (isNaN(date.getTime())) return '';
      return date.toISOString().slice(0, 16); // "YYYY-MM-DDTHH:mm"
    } catch {
      return '';
    }
  };

  const isRecentBooking = (dateString: string) => {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return false;
      
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      return date > thirtyDaysAgo;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    fetchBookings();
  }, []);

  const fetchBookings = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const token = localStorage.getItem("auth_token");
      const response = await fetch(`${API_URL}/api/admin/bookings`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setBookings(data.data || []);
        if (showRefresh) showNotification('success', 'Liste actualisée');
      }
    } catch (error) {
      showNotification('error', 'Erreur lors du chargement');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const openCreateModal = () => {
    setModalMode('create');
    setFormData({
      client_id: '',
      pro_id: '',
      prestation_id: '',
      start_datetime: '',
      end_datetime: '',
      status: 'pending',
      price: '',
    });
    setIsModalOpen(true);
  };

  const openEditModal = (booking: Booking) => {
    setModalMode('edit');
    setSelectedBooking(booking);
    setFormData({
      client_id: booking.client_id.toString(),
      pro_id: booking.pro_id.toString(),
      prestation_id: booking.prestation_id.toString(),
      start_datetime: formatForInput(booking.start_datetime),
      end_datetime: formatForInput(booking.end_datetime),
      status: booking.status,
      price: booking.price.toString(),
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const token = localStorage.getItem("auth_token");
      const url = modalMode === 'create' 
        ? `${API_URL}/api/admin/bookings/create`
        : `${API_URL}/api/admin/bookings/${selectedBooking?.id}`;

      const response = await fetch(url, {
        method: modalMode === 'create' ? 'POST' : 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        showNotification('success', modalMode === 'create' ? 'Réservation créée avec succès' : 'Modifications enregistrées');
        setIsModalOpen(false);
        fetchBookings();
      } else {
        const data = await response.json();
        showNotification('error', data.message || 'Une erreur est survenue');
      }
    } catch (error) {
      showNotification('error', 'Erreur de connexion au serveur');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (bookingId: number) => {
    if (!confirm(`Supprimer cette réservation ?`)) return;

    try {
      const token = localStorage.getItem("auth_token");
      const response = await fetch(`${API_URL}/api/admin/bookings/${bookingId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        showNotification('success', 'Réservation supprimée');
        fetchBookings();
      } else {
        showNotification('error', 'Impossible de supprimer cette réservation');
      }
    } catch (error) {
      showNotification('error', 'Erreur serveur');
    }
  };

  const filteredBookings = bookings.filter(booking => {
    const matchesSearch = `${booking.client_name} ${booking.pro_name}`.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || booking.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statusConfig = {
    pending: { label: 'En attente', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
    confirmed: { label: 'Confirmée', color: 'bg-green-100 text-green-700 border-green-200' },
    cancelled: { label: 'Annulée', color: 'bg-red-100 text-red-700 border-red-200' },
    completed: { label: 'Terminée', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <Loader2 size={40} className="animate-spin text-primary" />
        <p className="text-sm text-muted-foreground font-medium">Chargement...</p>
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
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Réservations</h1>
          <p className="text-sm text-muted-foreground mt-1 font-medium">
            {filteredBookings.length} réservation{filteredBookings.length > 1 ? 's' : ''} 
            {statusFilter !== 'all' && ` · ${statusConfig[statusFilter].label}`}
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => fetchBookings(true)}
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
            <span className="hidden sm:inline">Nouvelle réservation</span>
            <span className="sm:hidden">Nouveau</span>
          </motion.button>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="bg-white rounded-2xl border-2 border-gray-100 p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher une réservation..."
              className="w-full pl-11 pr-4 py-3 rounded-xl border-2 border-gray-200 bg-gray-50 focus:border-primary focus:bg-white outline-none transition-all font-medium text-sm"
            />
          </div>

          {/* Status Filter */}
          <div className="flex gap-2 bg-gray-100 p-1 rounded-xl overflow-x-auto">
            {(['all', 'pending', 'confirmed', 'completed', 'cancelled'] as const).map((status) => (
              <motion.button
                key={status}
                whileTap={{ scale: 0.95 }}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-2 rounded-lg font-bold text-xs whitespace-nowrap transition-all ${
                  statusFilter === status
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {status === 'all' ? 'Tous' : statusConfig[status].label}
              </motion.button>
            ))}
          </div>
        </div>
      </div>

      {/* Stats rapides */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Total', value: bookings.length },
          { label: 'En attente', value: bookings.filter(b => b.status === 'pending').length },
          { label: 'Confirmées', value: bookings.filter(b => b.status === 'confirmed').length },
          { label: 'Terminées', value: bookings.filter(b => b.status === 'completed').length },
          { label: 'Nouvelles (30j)', value: bookings.filter(b => isRecentBooking(b.created_at)).length },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-white rounded-2xl border-2 border-gray-100 p-4 hover:border-primary/20 transition-all"
          >
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">{stat.label}</p>
            <p className="text-3xl font-black text-gray-900">{stat.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Bookings Grid */}
      {filteredBookings.length === 0 ? (
        <div className="bg-white rounded-2xl border-2 border-dashed border-gray-200 p-12 text-center">
          <CalendarRange size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-600 font-medium">Aucune réservation trouvée</p>
          <p className="text-sm text-muted-foreground mt-1">
            {searchQuery ? 'Essayez une autre recherche' : 'Commencez par ajouter une réservation'}
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredBookings.map((booking, index) => (
            <motion.div
              key={booking.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03 }}
              whileHover={{ y: -4 }}
              className="bg-white rounded-2xl border-2 border-gray-100 hover:border-primary/30 hover:shadow-xl transition-all group overflow-hidden"
            >
              {/* Header */}
              <div className="p-5 border-b border-gray-100">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-black text-gray-900 truncate text-lg">
                      Réservation #{booking.id}
                    </h3>
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border-2 ${statusConfig[booking.status].color}`}>
                      {statusConfig[booking.status].label}
                    </span>
                  </div>

                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <motion.button
                      whileHover={{ scale: 1.15 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => openEditModal(booking)}
                      className="w-8 h-8 rounded-lg bg-blue-50 hover:bg-blue-100 flex items-center justify-center transition-colors"
                    >
                      <Edit size={14} className="text-blue-600" />
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.15 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => handleDelete(booking.id)}
                      className="w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 flex items-center justify-center transition-colors"
                    >
                      <Trash2 size={14} className="text-red-600" />
                    </motion.button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 text-primary font-bold">
                    <DollarSign size={16} />
                    <span>{booking.price} €</span>
                  </div>
                </div>
              </div>

              {/* Infos */}
              <div className="p-4 space-y-2.5">
                <div className="flex items-center gap-2 text-sm text-gray-600 group/item">
                  <Calendar size={14} className="flex-shrink-0 text-gray-400 group-hover/item:text-primary transition-colors" />
                  <span className="font-medium">{formatDateTime(booking.start_datetime).date}</span>
                </div>
                
                <div className="flex items-center gap-2 text-sm text-gray-600 group/item">
                  <Clock size={14} className="flex-shrink-0 text-gray-400 group-hover/item:text-primary transition-colors" />
                  <span className="font-medium">
                    {formatDateTime(booking.start_datetime).time} - {formatDateTime(booking.end_datetime).time}
                  </span>
                </div>
                
                {booking.client_name && (
                  <div className="flex items-center gap-2 text-sm text-gray-600 group/item">
                    <User size={14} className="flex-shrink-0 text-gray-400 group-hover/item:text-primary transition-colors" />
                    <span className="truncate font-medium">Client: {booking.client_name}</span>
                  </div>
                )}
                
                {booking.pro_name && (
                  <div className="flex items-center gap-2 text-sm text-gray-600 group/item">
                    <User size={14} className="flex-shrink-0 text-gray-400 group-hover/item:text-primary transition-colors" />
                    <span className="truncate font-medium">Pro: {booking.pro_name}</span>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Modal */}
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
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-3xl p-6 sm:p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-black text-gray-900">
                    {modalMode === 'create' ? 'Nouvelle réservation' : 'Modifier la réservation'}
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {modalMode === 'create' ? 'Ajoutez une nouvelle réservation' : 'Modifiez les informations'}
                  </p>
                </div>
                <motion.button
                  whileHover={{ scale: 1.1, rotate: 90 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setIsModalOpen(false)}
                  className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
                >
                  <X size={20} />
                </motion.button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-2">ID Client *</label>
                    <input
                      type="number"
                      required
                      value={formData.client_id}
                      onChange={(e) => setFormData({...formData, client_id: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-primary bg-white outline-none transition-all font-medium"
                      placeholder="1"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-2">ID Pro *</label>
                    <input
                      type="number"
                      required
                      value={formData.pro_id}
                      onChange={(e) => setFormData({...formData, pro_id: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-primary bg-white outline-none transition-all font-medium"
                      placeholder="2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-2">ID Prestation *</label>
                    <input
                      type="number"
                      required
                      value={formData.prestation_id}
                      onChange={(e) => setFormData({...formData, prestation_id: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-primary bg-white outline-none transition-all font-medium"
                      placeholder="1"
                    />
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-2">Début *</label>
                    <input
                      type="datetime-local"
                      required
                      value={formData.start_datetime}
                      onChange={(e) => setFormData({...formData, start_datetime: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-primary bg-white outline-none transition-all font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-2">Fin *</label>
                    <input
                      type="datetime-local"
                      required
                      value={formData.end_datetime}
                      onChange={(e) => setFormData({...formData, end_datetime: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-primary bg-white outline-none transition-all font-medium"
                    />
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-2">Prix (€) *</label>
                    <input
                      type="number"
                      required
                      step="0.01"
                      value={formData.price}
                      onChange={(e) => setFormData({...formData, price: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-primary bg-white outline-none transition-all font-medium"
                      placeholder="50.00"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-2">Statut *</label>
                    <select
                      required
                      value={formData.status}
                      onChange={(e) => setFormData({...formData, status: e.target.value as any})}
                      className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-primary bg-white outline-none transition-all font-medium"
                    >
                      <option value="pending">En attente</option>
                      <option value="confirmed">Confirmée</option>
                      <option value="completed">Terminée</option>
                      <option value="cancelled">Annulée</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-col-reverse sm:flex-row gap-3 pt-4 border-t border-gray-100">
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 px-6 py-3.5 rounded-xl border-2 border-gray-200 font-bold hover:bg-gray-50 transition-all"
                  >
                    Annuler
                  </motion.button>
                  <motion.button
                    type="submit"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    disabled={submitting}
                    className="flex-1 px-6 py-3.5 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {submitting ? (
                      <>
                        <Loader2 size={20} className="animate-spin" />
                        <span>En cours...</span>
                      </>
                    ) : (
                      <>
                        <Check size={20} strokeWidth={2.5} />
                        <span>{modalMode === 'create' ? 'Créer la réservation' : 'Enregistrer'}</span>
                      </>
                    )}
                  </motion.button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminBookings;
