import { useState, useEffect, useCallback, useMemo } from "react";
import { fetchAllPages } from "@/utils/fetchAllPages";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Calendar,
  Clock,
  User,
  Check,
  Loader2,
  CalendarRange,
  RefreshCw,
  DollarSign,
  List,
  Grid3x3,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
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
import { StatusBadge, type StatusTone } from "@/components/admin/StatusBadge";
import { EmptyState } from "@/components/admin/EmptyState";

const API_URL = import.meta.env.VITE_API_URL || "";

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

const AdminBookings = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState(searchParams.get("search") ?? "");
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'confirmed' | 'cancelled' | 'completed'>(
    (searchParams.get("status") as 'all' | 'pending' | 'confirmed' | 'cancelled' | 'completed') ?? 'all'
  );

  const updateParams = useCallback((search: string, status: string) => {
    const p: Record<string, string> = {};
    if (search) p.search = search;
    if (status && status !== 'all') p.status = status;
    setSearchParams(p, { replace: true });
  }, [setSearchParams]);
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
  const [deleteTarget, setDeleteTarget] = useState<Booking | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [proFilter, setProFilter] = useState<string>('all');
  const [calendarMonth, setCalendarMonth] = useState(new Date());

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
      // L'API pagine (défaut 50/page) — la recherche/les filtres sont faits
      // côté client sur `bookings`, donc il faut TOUT charger, sinon une
      // réservation hors des N plus récentes devient invisible. Les pages
      // sont chargées en parallèle (fetchAllPages), pas une par une.
      const all = await fetchAllPages<Booking>(`${API_URL}/api/admin/bookings`);
      setBookings(all);
      if (showRefresh) toast.success('Liste actualisée');
    } catch (error) {
      toast.error('Erreur lors du chargement');
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
      const url = modalMode === 'create'
        ? `${API_URL}/api/admin/bookings/create`
        : `${API_URL}/api/admin/bookings/${selectedBooking?.id}`;

      const response = await fetch(url, {
        method: modalMode === 'create' ? 'POST' : 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        toast.success(modalMode === 'create' ? 'Réservation créée avec succès' : 'Modifications enregistrées');
        setIsModalOpen(false);
        fetchBookings();
      } else {
        const data = await response.json();
        toast.error(data.message || 'Une erreur est survenue');
      }
    } catch (error) {
      toast.error('Erreur de connexion au serveur');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (bookingId: number) => {
    setDeleteLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/admin/bookings/${bookingId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (response.ok) {
        toast.success('Réservation supprimée');
        fetchBookings();
      } else {
        toast.error('Impossible de supprimer cette réservation');
      }
    } catch (error) {
      toast.error('Erreur serveur');
    } finally {
      setDeleteLoading(false);
      setDeleteTarget(null);
    }
  };

  const filteredBookings = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return bookings.filter(booking => {
      const matchesSearch = `${booking.client_name} ${booking.pro_name}`.toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'all' || booking.status === statusFilter;
      const matchesPro = proFilter === 'all' || String(booking.pro_id) === proFilter;
      return matchesSearch && matchesStatus && matchesPro;
    });
  }, [bookings, searchQuery, statusFilter, proFilter]);

  // Liste réelle des pros ayant au moins une réservation — dérivée des données, pas inventée
  const proOptions = useMemo(
    () => Array.from(new Map(bookings.map((b) => [b.pro_id, b.pro_name || `Pro #${b.pro_id}`])).entries()),
    [bookings]
  );

  // Distingués uniquement par la luminosité (clair → foncé), jamais par la teinte.
  const statusDot: Record<Booking['status'], string> = {
    pending: 'bg-foreground/40',
    confirmed: 'bg-foreground/70',
    completed: 'bg-foreground',
    cancelled: 'bg-muted-foreground/30',
  };

  const firstDayOfCalMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
  const calStartDate = new Date(firstDayOfCalMonth);
  calStartDate.setDate(calStartDate.getDate() - calStartDate.getDay());
  const calendarDays = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(calStartDate);
    d.setDate(calStartDate.getDate() + i);
    return d;
  });

  // Regroupées une seule fois par jour (clé YYYY-MM-DD) plutôt que de
  // rescanner tout filteredBookings pour chacune des 42 cases du calendrier.
  const bookingsByDay = useMemo(() => {
    const map = new Map<string, Booking[]>();
    for (const b of filteredBookings) {
      const d = new Date(b.start_datetime);
      if (isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const existing = map.get(key);
      if (existing) existing.push(b);
      else map.set(key, [b]);
    }
    return map;
  }, [filteredBookings]);

  const getBookingsForDay = (date: Date) =>
    bookingsByDay.get(`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`) ?? [];

  const statusConfig: Record<Booking['status'], { label: string; tone: StatusTone }> = {
    pending: { label: 'En attente', tone: 'warning' },
    confirmed: { label: 'Confirmée', tone: 'info' },
    cancelled: { label: 'Annulée', tone: 'neutral' },
    completed: { label: 'Terminée', tone: 'success' },
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-9 w-48 rounded-lg" />
          <Skeleton className="h-10 w-44 rounded-xl" />
        </div>
        <Skeleton className="h-16 w-full rounded-2xl" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Réservations"
        description={`${filteredBookings.length} réservation${filteredBookings.length > 1 ? 's' : ''}${
          statusFilter !== 'all' ? ` · ${statusConfig[statusFilter].label}` : ''
        }`}
        actions={
          <>
            <div className="flex items-center gap-1 rounded-xl border-2 border-border bg-card p-1">
              <button
                onClick={() => setViewMode('list')}
                aria-pressed={viewMode === 'list'}
                className={`h-8 px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <List size={14} /> Liste
              </button>
              <button
                onClick={() => setViewMode('calendar')}
                aria-pressed={viewMode === 'calendar'}
                className={`h-8 px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${viewMode === 'calendar' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <Grid3x3 size={14} /> Calendrier
              </button>
            </div>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => fetchBookings(true)}
              disabled={refreshing}
              aria-label="Actualiser la liste des réservations"
              className="px-4 py-2.5 rounded-xl bg-card border-2 border-border hover:bg-muted/40 font-bold text-sm transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">Actualiser</span>
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={openCreateModal}
              className="px-6 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl font-bold transition-colors flex items-center gap-2"
            >
              <Plus size={20} strokeWidth={2.5} />
              <span className="hidden sm:inline">Nouvelle réservation</span>
              <span className="sm:hidden">Nouveau</span>
            </motion.button>
          </>
        }
      />

      {/* Filters & Search */}
      <div className="bg-card rounded-2xl border-2 border-border p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); updateParams(e.target.value, statusFilter); }}
              placeholder="Rechercher une réservation..."
              className="w-full pl-11 pr-4 py-3 rounded-xl border-2 border-border bg-muted/40 focus:border-primary focus:bg-card outline-none transition-all font-medium text-sm"
            />
          </div>

          {/* Status Filter */}
          <div className="flex flex-wrap gap-2 bg-muted p-1 rounded-xl">
            {(['all', 'pending', 'confirmed', 'completed', 'cancelled'] as const).map((status) => (
              <motion.button
                key={status}
                whileTap={{ scale: 0.95 }}
                onClick={() => { setStatusFilter(status); updateParams(searchQuery, status); }}
                className={`px-3 py-2 rounded-lg font-bold text-xs transition-all ${
                  statusFilter === status
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {status === 'all' ? 'Tous' : statusConfig[status].label}
              </motion.button>
            ))}
          </div>

          {/* Pro Filter */}
          <select
            value={proFilter}
            onChange={(e) => setProFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border-2 border-border bg-muted/40 focus:border-primary outline-none font-bold text-xs text-foreground/80"
          >
            <option value="all">Tous les pros</option>
            {proOptions.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
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
            className="bg-card rounded-2xl border-2 border-border p-4 hover:border-primary/20 transition-all"
          >
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">{stat.label}</p>
            <p className="text-3xl font-black text-foreground">{stat.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Vue Calendrier — tous les pros et leurs RDV */}
      {viewMode === 'calendar' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCalendarMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
              className="w-9 h-9 rounded-lg border-2 border-border flex items-center justify-center hover:bg-muted/40"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-lg font-bold text-foreground min-w-[160px] text-center capitalize">
              {calendarMonth.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
            </span>
            <button
              onClick={() => setCalendarMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
              className="w-9 h-9 rounded-lg border-2 border-border flex items-center justify-center hover:bg-muted/40"
            >
              <ChevronRight size={16} />
            </button>
            <button
              onClick={() => setCalendarMonth(new Date())}
              className="px-3 py-1.5 rounded-lg border-2 border-border text-xs font-bold hover:bg-muted/40"
            >
              Aujourd'hui
            </button>
          </div>

          <Card className="overflow-hidden">
            <div className="grid grid-cols-7 border-b">
              {['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'].map((d) => (
                <div key={d} className="border-r p-2 text-center text-xs font-medium text-muted-foreground last:border-r-0">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {calendarDays.map((day, index) => {
                const dayBookings = getBookingsForDay(day);
                const isCurrentMonth = day.getMonth() === calendarMonth.getMonth();
                const isToday = day.toDateString() === new Date().toDateString();
                return (
                  <div key={index} className={`min-h-24 border-b border-r p-1.5 last:border-r-0 ${!isCurrentMonth ? 'bg-muted/30' : ''}`}>
                    <div className={`mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs ${isToday ? 'bg-primary text-primary-foreground font-bold' : 'text-muted-foreground'}`}>
                      {day.getDate()}
                    </div>
                    <div className="space-y-1">
                      {dayBookings.slice(0, 3).map((b) => (
                        <button
                          key={b.id}
                          onClick={() => openEditModal(b)}
                          className="w-full flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[11px] font-medium truncate hover:bg-muted transition-colors text-left"
                          title={`${b.pro_name} · ${b.client_name}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot[b.status]}`} />
                          <span className="truncate">{formatDateTime(b.start_datetime).time} {b.pro_name}</span>
                        </button>
                      ))}
                      {dayBookings.length > 3 && (
                        <p className="text-[10px] text-muted-foreground px-1.5">+{dayBookings.length - 3}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {/* Bookings Grid */}
      {viewMode === 'list' && (filteredBookings.length === 0 ? (
        <div className="bg-card rounded-2xl border-2 border-dashed border-border">
          <EmptyState
            icon={CalendarRange}
            title="Aucune réservation trouvée"
            description={searchQuery ? 'Essayez une autre recherche' : 'Commencez par ajouter une réservation'}
          />
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredBookings.map((booking, index) => (
            <motion.div
              key={booking.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(index, 20) * 0.03 }}
              whileHover={{ y: -4 }}
              className="bg-card rounded-2xl border-2 border-border hover:border-primary/30 hover:shadow-xl transition-all group overflow-hidden"
            >
              {/* Header */}
              <div className="p-5 border-b border-border">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-black text-foreground truncate text-lg">
                      Réservation #{booking.id}
                    </h3>
                    <StatusBadge
                      tone={statusConfig[booking.status].tone}
                      label={statusConfig[booking.status].label}
                      className="mt-1"
                    />
                  </div>

                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <motion.button
                      whileHover={{ scale: 1.15 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => openEditModal(booking)}
                      aria-label={`Modifier la réservation #${booking.id}`}
                      title="Modifier"
                      className="w-8 h-8 rounded-lg bg-muted hover:bg-accent flex items-center justify-center transition-colors"
                    >
                      <Edit size={14} className="text-foreground/70" aria-hidden="true" />
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.15 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => setDeleteTarget(booking)}
                      aria-label={`Supprimer la réservation #${booking.id}`}
                      title="Supprimer"
                      className="w-8 h-8 rounded-lg bg-muted hover:bg-accent flex items-center justify-center transition-colors"
                    >
                      <Trash2 size={14} className="text-foreground/70" aria-hidden="true" />
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
                <div className="flex items-center gap-2 text-sm text-muted-foreground group/item">
                  <Calendar size={14} className="flex-shrink-0 text-muted-foreground/60 group-hover/item:text-primary transition-colors" />
                  <span className="font-medium">{formatDateTime(booking.start_datetime).date}</span>
                </div>
                
                <div className="flex items-center gap-2 text-sm text-muted-foreground group/item">
                  <Clock size={14} className="flex-shrink-0 text-muted-foreground/60 group-hover/item:text-primary transition-colors" />
                  <span className="font-medium">
                    {formatDateTime(booking.start_datetime).time} - {formatDateTime(booking.end_datetime).time}
                  </span>
                </div>
                
                {booking.client_name && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground group/item">
                    <User size={14} className="flex-shrink-0 text-muted-foreground/60 group-hover/item:text-primary transition-colors" />
                    <span className="truncate font-medium">Client: {booking.client_name}</span>
                  </div>
                )}
                
                {booking.pro_name && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground group/item">
                    <User size={14} className="flex-shrink-0 text-muted-foreground/60 group-hover/item:text-primary transition-colors" />
                    <span className="truncate font-medium">Pro: {booking.pro_name}</span>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      ))}

      {/* Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl w-full max-h-[90vh] overflow-y-auto rounded-3xl p-6 sm:p-8">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-black text-foreground">
                    {modalMode === 'create' ? 'Nouvelle réservation' : 'Modifier la réservation'}
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {modalMode === 'create' ? 'Ajoutez une nouvelle réservation' : 'Modifiez les informations'}
                  </p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Identifiants</p>
                  <p className="text-xs text-muted-foreground -mt-2 mb-3">
                    Identifiants internes (visibles sur la fiche client/pro concernée).
                  </p>
                </div>
                <div className="grid sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-foreground mb-2">ID Client *</label>
                    <input
                      type="number"
                      required
                      value={formData.client_id}
                      onChange={(e) => setFormData({...formData, client_id: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border-2 border-border focus:border-primary bg-card outline-none transition-all font-medium"
                      placeholder="1"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-foreground mb-2">ID Pro *</label>
                    <input
                      type="number"
                      required
                      value={formData.pro_id}
                      onChange={(e) => setFormData({...formData, pro_id: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border-2 border-border focus:border-primary bg-card outline-none transition-all font-medium"
                      placeholder="2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-foreground mb-2">ID Prestation *</label>
                    <input
                      type="number"
                      required
                      value={formData.prestation_id}
                      onChange={(e) => setFormData({...formData, prestation_id: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border-2 border-border focus:border-primary bg-card outline-none transition-all font-medium"
                      placeholder="1"
                    />
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-foreground mb-2">Début *</label>
                    <input
                      type="datetime-local"
                      required
                      value={formData.start_datetime}
                      onChange={(e) => setFormData({...formData, start_datetime: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border-2 border-border focus:border-primary bg-card outline-none transition-all font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-foreground mb-2">Fin *</label>
                    <input
                      type="datetime-local"
                      required
                      value={formData.end_datetime}
                      onChange={(e) => setFormData({...formData, end_datetime: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border-2 border-border focus:border-primary bg-card outline-none transition-all font-medium"
                    />
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-foreground mb-2">Prix (€) *</label>
                    <input
                      type="number"
                      required
                      step="0.01"
                      value={formData.price}
                      onChange={(e) => setFormData({...formData, price: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border-2 border-border focus:border-primary bg-card outline-none transition-all font-medium"
                      placeholder="50.00"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-foreground mb-2">Statut *</label>
                    <select
                      required
                      value={formData.status}
                      onChange={(e) => setFormData({...formData, status: e.target.value as any})}
                      className="w-full px-4 py-3 rounded-xl border-2 border-border focus:border-primary bg-card outline-none transition-all font-medium"
                    >
                      <option value="pending">En attente</option>
                      <option value="confirmed">Confirmée</option>
                      <option value="completed">Terminée</option>
                      <option value="cancelled">Annulée</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-col-reverse sm:flex-row gap-3 pt-4 border-t border-border">
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 px-6 py-3.5 rounded-xl border-2 border-border font-bold hover:bg-muted/40 transition-all"
                  >
                    Annuler
                  </motion.button>
                  <motion.button
                    type="submit"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    disabled={submitting}
                    className="flex-1 px-6 py-3.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
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
        </DialogContent>
      </Dialog>

      {/* Confirmation de suppression */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette réservation ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible et supprimera définitivement la réservation
              {deleteTarget ? ` #${deleteTarget.id}` : ""}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLoading}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && handleDelete(deleteTarget.id)}
              disabled={deleteLoading}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {deleteLoading ? "Suppression..." : "Supprimer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminBookings;
