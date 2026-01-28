import React from "react";
import MobileLayout from "@/components/MobileLayout";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence, useMotionValue, useTransform, PanInfo } from "framer-motion";
import {
  Plus,
  ChevronLeft,
  Edit2,
  Trash2,
  X,
  Check,
  Copy,
  Eye,
  TrendingUp,
  Zap,
  Sparkles,
  EyeOff,
  Info,
  ChevronRight,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Share2,
  MoreVertical,
  AlertCircle,
} from "lucide-react";
import { useState, useEffect } from "react";

// ===== INTERFACES =====
interface Notification {
  id: string;
  type: "success" | "error" | "warning" | "info";
  title: string;
  message: string;
  action?: { label: string; onClick: () => void };
  duration?: number;
}

interface OptionPrestation {
  id?: number;
  nom: string;
  supplement: number;
}

interface Prestation {
  id: number;
  nom: string;
  typePrestation: string;
  description: string;
  prixBase: number;
  tempsBloque: number;
  reservable: boolean;
  options: OptionPrestation[];
  analytics?: {
    reservationsMois: number;
    tauxReservation: number;
    dernierUtilisation?: string;
  };
}

// ===== HELPER POUR NOTIFICATIONS =====
const showNotification = (notification: Omit<Notification, "id">) => {
  window.dispatchEvent(new CustomEvent("showNotification", { detail: notification }));
};

// ===== COMPOSANT NOTIFICATION ITEM =====
const NotificationItem: React.FC<{
  notif: Notification;
  iconMap: Record<string, React.ReactNode>;
  bgMap: Record<string, string>;
  removeNotification: (id: string) => void;
}> = ({ notif, iconMap, bgMap, removeNotification }) => {
  const x = useMotionValue(0);
  const opacity = useTransform(x, [-200, 0, 200], [0, 1, 0]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 300, scale: 0.8 }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.7}
      onDragEnd={(_, info: PanInfo) => {
        if (Math.abs(info.offset.x) > 100) {
          removeNotification(notif.id);
        }
      }}
      style={{ x, opacity }}
      className="pointer-events-auto"
    >
      <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${bgMap[notif.type]} backdrop-blur-xl border shadow-lg`}>
        <motion.div
          initial={{ width: "100%" }}
          animate={{ width: "0%" }}
          transition={{ duration: (notif.duration || 4000) / 1000, ease: "linear" }}
          className={`absolute top-0 left-0 h-0.5 ${notif.type === "success" ? "bg-green-500" :
            notif.type === "error" ? "bg-red-500" :
              notif.type === "warning" ? "bg-orange-500" : "bg-blue-500"
            }`}
        />

        <div className="p-4">
          <div className="flex items-start gap-3">
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", delay: 0.1 }}
            >
              {iconMap[notif.type]}
            </motion.div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground mb-0.5">{notif.title}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{notif.message}</p>

              {notif.action && (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={notif.action.onClick}
                  className="mt-2 text-xs font-bold text-primary hover:text-primary/80 transition-colors"
                >
                  {notif.action.label} →
                </motion.button>
              )}
            </div>

            <motion.button
              whileHover={{ scale: 1.1, rotate: 90 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => removeNotification(notif.id)}
              className="w-6 h-6 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 flex items-center justify-center transition-colors"
            >
              <X size={14} className="text-muted-foreground" />
            </motion.button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

// ===== SYSTÈME DE NOTIFICATIONS =====
const NotificationSystem = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    const handler = (e: CustomEvent<Notification>) => {
      const notif = { ...e.detail, id: Math.random().toString(36) };
      setNotifications((prev) => [...prev, notif]);

      const duration = notif.duration || 4000;
      setTimeout(() => {
        setNotifications((prev) => prev.filter((n) => n.id !== notif.id));
      }, duration);
    };

    window.addEventListener("showNotification" as any, handler);
    return () => window.removeEventListener("showNotification" as any, handler);
  }, []);

  const removeNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const iconMap = {
    success: <CheckCircle2 size={20} className="text-green-500" />,
    error: <XCircle size={20} className="text-red-500" />,
    warning: <AlertTriangle size={20} className="text-orange-500" />,
    info: <Info size={20} className="text-blue-500" />,
  };

  const bgMap = {
    success: "from-green-50 to-emerald-50 dark:from-green-950/50 dark:to-emerald-950/30 border-green-200/50 dark:border-green-800/50",
    error: "from-red-50 to-rose-50 dark:from-red-950/50 dark:to-rose-950/30 border-red-200/50 dark:border-red-800/50",
    warning: "from-orange-50 to-amber-50 dark:from-orange-950/50 dark:to-amber-950/30 border-orange-200/50 dark:border-orange-800/50",
    info: "from-blue-50 to-cyan-50 dark:from-blue-950/50 dark:to-cyan-950/30 border-blue-200/50 dark:border-blue-800/50",
  };

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 w-[90%] pointer-events-none">
      <AnimatePresence>
        {notifications.map((notif) => (
          <NotificationItem
            key={notif.id}
            notif={notif}
            iconMap={iconMap}
            bgMap={bgMap}
            removeNotification={removeNotification}
          />
        ))}
      </AnimatePresence>
    </div>
  );
};

// ===== COMPOSANT CARD PRESTATION =====
interface PrestationCardProps {
  prestation: Prestation;
  index: number;
  quickActionsOpen: number | null;
  setQuickActionsOpen: (id: number | null) => void;
  openEditModal: (service: Prestation) => void;
  openDeleteModal: (service: Prestation) => void;
  openPreview: (service: Prestation) => void;
  duplicateService: (service: Prestation) => void;
  shareService: (service: Prestation) => void;
  toggleReservable: (id: number) => void;
  getPrixAffiche: (prestation: Prestation) => string;
  getPrixComparison: (prix: number, type: string) => { label: string; color: string };
  formatDuration: (minutes: number) => string;
}

const PrestationCard: React.FC<PrestationCardProps> = ({
  prestation,
  index,
  quickActionsOpen,
  setQuickActionsOpen,
  openEditModal,
  openDeleteModal,
  openPreview,
  duplicateService,
  shareService,
  toggleReservable,
  getPrixAffiche,
  getPrixComparison,
  formatDuration,
}) => {
  const x = useMotionValue(0);
  const actionTriggered = useTransform(x, [-150, 0, 150], [1, 0, 1]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 * index }}
      whileHover={{ y: -2 }}
      className="group relative"
    >
      {/* Swipe actions */}
      <div className="absolute inset-0 flex items-center justify-between px-6 rounded-2xl overflow-hidden">
        <motion.div style={{ opacity: actionTriggered }} className="flex items-center gap-2 text-red-500">
          <Trash2 size={20} />
          <span className="font-semibold text-sm">Supprimer</span>
        </motion.div>
        <motion.div style={{ opacity: actionTriggered }} className="flex items-center gap-2 text-blue-500">
          <span className="font-semibold text-sm">Modifier</span>
          <Edit2 size={20} />
        </motion.div>
      </div>

      {/* Card */}
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.7}
        style={{ x }}
        onDragEnd={(_, info: PanInfo) => {
          if (info.offset.x < -150) {
            openDeleteModal(prestation);
          } else if (info.offset.x > 150) {
            openEditModal(prestation);
          }
        }}
        className="relative overflow-hidden rounded-2xl bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl border border-white/20 shadow-sm hover:shadow-md transition-all duration-200"
      >
        <div className="absolute inset-x-0 top-0 h-px" />

        <div className="p-4">
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1 min-w-0 pr-3">
              <div className="flex items-center gap-2 mb-1.5">
                <h3 className="text-base font-bold text-foreground truncate">{prestation.nom}</h3>
                {prestation.analytics && prestation.analytics.reservationsMois > 10 && (
                  <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-950/30">
                    <Zap size={10} className="text-green-600 dark:text-green-400" />
                    <span className="text-[9px] font-bold text-green-600 dark:text-green-400">TOP</span>
                  </div>
                )}
              </div>
            </div>

            {/* Menu */}
            <div className="relative">
              <motion.button
                whileHover={{ scale: 1.08, rotate: 90 }}
                whileTap={{ scale: 0.92 }}
                onClick={() => setQuickActionsOpen(quickActionsOpen === prestation.id ? null : prestation.id)}
                className="w-9 h-9 rounded-lg bg-muted/50 hover:bg-muted flex items-center justify-center transition-colors"
              >
                <MoreVertical size={16} className="text-foreground" />
              </motion.button>

              <AnimatePresence>
                {quickActionsOpen === prestation.id && (
                  <>
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => setQuickActionsOpen(null)}
                      className="fixed inset-0 z-40"
                    />
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9, y: -10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, y: -10 }}
                      transition={{ type: "spring", damping: 25 }}
                      className="absolute right-0 top-12 z-50 w-48 rounded-xl bg-white/95 dark:bg-gray-900/95 backdrop-blur-2xl border border-white/20 shadow-xl overflow-hidden"
                    >
                      <div className="p-1">
                        <button
                          onClick={() => openPreview(prestation)}
                          className="w-full px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium text-foreground hover:bg-muted/50"
                        >
                          <Eye size={16} />
                          Vue cliente
                        </button>
                        <button
                          onClick={() => duplicateService(prestation)}
                          className="w-full px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium text-foreground hover:bg-muted/50"
                        >
                          <Copy size={16} />
                          Dupliquer
                        </button>
                        <button
                          onClick={() => shareService(prestation)}
                          className="w-full px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium text-foreground hover:bg-muted/50"
                        >
                          <Share2 size={16} />
                          Partager
                        </button>
                        <div className="h-px bg-border/50 my-1" />
                        <button
                          onClick={() => openEditModal(prestation)}
                          className="w-full px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium text-primary hover:bg-primary/5"
                        >
                          <Edit2 size={16} />
                          Modifier
                        </button>
                        <button
                          onClick={() => openDeleteModal(prestation)}
                          className="w-full px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium text-destructive hover:bg-destructive/5"
                        >
                          <Trash2 size={16} />
                          Supprimer
                        </button>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Description */}
          {prestation.description && (
            <p className="text-sm text-muted-foreground mb-3 line-clamp-1">{prestation.description}</p>
          )}

          {/* Prix & Durée */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary/5 to-primary/10 p-3 border border-primary/10">
              <div className="flex items-start justify-between mb-1">
                <p className="text-[10px] font-semibold text-primary/60 uppercase tracking-wide">Prix</p>
                <span className={`text-[9px] font-bold ${getPrixComparison(prestation.prixBase, prestation.typePrestation).color}`}>
                  {getPrixComparison(prestation.prixBase, prestation.typePrestation).label}
                </span>
              </div>
              <p className="text-lg font-bold text-foreground">{getPrixAffiche(prestation)}</p>
              {prestation.options.length > 0 && <p className="text-[9px] text-primary/50 mt-0.5 font-medium">Selon options</p>}
            </div>

            <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-muted/40 to-muted/20 p-3 border border-border/30">
              <p className="text-[10px] font-semibold text-muted-foreground mb-1 uppercase tracking-wide">Durée</p>
              <p className="text-lg font-bold text-foreground">{formatDuration(prestation.tempsBloque)}</p>
            </div>
          </div>

          {/* Options */}
          {prestation.options.length > 0 && (
            <div className="mb-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                {prestation.options.length} option{prestation.options.length > 1 ? "s" : ""}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {prestation.options.map((opt, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/50 dark:bg-gray-700/50 backdrop-blur-sm border border-border/40 text-[11px] font-medium text-foreground"
                  >
                    {opt.nom} <span className="text-primary font-semibold">+{opt.supplement}€</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* État */}
          <div className="flex items-center justify-between">
            <div
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${prestation.reservable
                ? "bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400 border border-green-200/50 dark:border-green-800/50"
                : "bg-orange-50 dark:bg-orange-950/20 text-orange-700 dark:text-orange-400 border border-orange-200/50 dark:border-orange-800/50"
                }`}
            >
              <div className={`w-1.5 h-1.5 rounded-full ${prestation.reservable ? "bg-green-500" : "bg-orange-500"}`} />
              {prestation.reservable ? "Réservable" : "Masquée"}
            </div>

            <button
              onClick={() => toggleReservable(prestation.id)}
              className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
            >
              {prestation.reservable ? (
                <>
                  <EyeOff size={12} />
                  Masquer
                </>
              ) : (
                <>
                  <Eye size={12} />
                  Activer
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

// ===== COMPOSANT PRINCIPAL =====
const ProServices = () => {
  const navigate = useNavigate();
  const [prestations, setPrestations] = useState<Prestation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [quickActionsOpen, setQuickActionsOpen] = useState<number | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<Prestation | null>(null);
  const [confetti, setConfetti] = useState(false);

  const MARKET_DATA = {
    Pose: { prixMoyen: 55, tempsStandard: 90, description: "Extension complète en gel ou résine" },
    Remplissage: { prixMoyen: 38, tempsStandard: 60, description: "Comblement de la repousse" },
    "Nail art": { prixMoyen: 68, tempsStandard: 120, description: "Design personnalisé avec décorations" },
    Dépose: { prixMoyen: 22, tempsStandard: 30, description: "Retrait complet sans abîmer l'ongle" },
    Soin: { prixMoyen: 32, tempsStandard: 45, description: "Soin réparateur et nourrissant" },
  };

  useEffect(() => {
    loadServices();
  }, []);

  const loadServices = async () => {
    try {
      setIsLoading(true);
      await new Promise((resolve) => setTimeout(resolve, 800));

      setPrestations([
        {
          id: 1,
          nom: "Pose complète gel",
          typePrestation: "Pose",
          description: "Extension complète en gel ou résine",
          prixBase: 55,
          tempsBloque: 90,
          reservable: true,
          options: [
            { id: 1, nom: "Longueur XL", supplement: 10 },
            { id: 2, nom: "Babyboomer", supplement: 8 },
          ],
          analytics: { reservationsMois: 14, tauxReservation: 87, dernierUtilisation: "Il y a 2 jours" },
        },
        {
          id: 2,
          nom: "Remplissage",
          typePrestation: "Remplissage",
          description: "Comblement de la repousse",
          prixBase: 40,
          tempsBloque: 60,
          reservable: true,
          options: [],
          analytics: { reservationsMois: 22, tauxReservation: 94, dernierUtilisation: "Aujourd'hui" },
        },
        {
          id: 3,
          nom: "Dépose complète",
          typePrestation: "Dépose",
          description: "",
          prixBase: 25,
          tempsBloque: 30,
          reservable: false,
          options: [],
          analytics: { reservationsMois: 0, tauxReservation: 0 },
        },
      ]);
    } catch (error) {
      showNotification({ type: "error", title: "Erreur", message: "Impossible de charger les prestations" });
    } finally {
      setIsLoading(false);
    }
  };

  const openEditModal = (service: Prestation) => {
    setSelectedService(service);
    setEditModalOpen(true);
    setQuickActionsOpen(null);
  };

  const openDeleteModal = (service: Prestation) => {
    setSelectedService(service);
    setDeleteModalOpen(true);
    setQuickActionsOpen(null);
  };

  const openPreview = (service: Prestation) => {
    setSelectedService(service);
    setPreviewModalOpen(true);
    setQuickActionsOpen(null);
  };

  const closeModals = () => {
    setEditModalOpen(false);
    setDeleteModalOpen(false);
    setPreviewModalOpen(false);
    setSelectedService(null);
  };

  const duplicateService = (service: Prestation) => {
    const copie = {
      ...service,
      id: Math.max(...prestations.map((p) => p.id), 0) + 1,
      nom: `${service.nom} (copie)`,
      reservable: false,
      analytics: { reservationsMois: 0, tauxReservation: 0 },
    };
    setPrestations((prev) => [...prev, copie]);
    setQuickActionsOpen(null);

    showNotification({
      type: "success",
      title: "✨ Prestation dupliquée",
      message: "Tu peux maintenant la modifier avant de la rendre réservable",
      action: { label: "Modifier maintenant", onClick: () => openEditModal(copie) },
    });
  };

  const toggleReservable = (id: number) => {
    const service = prestations.find((p) => p.id === id);
    const wasReservable = service?.reservable;

    setPrestations((prev) => prev.map((p) => (p.id === id ? { ...p, reservable: !p.reservable } : p)));
    setQuickActionsOpen(null);

    if (wasReservable) {
      showNotification({
        type: "warning",
        title: "Prestation masquée",
        message: "Elle n'est plus visible dans le catalogue client",
        action: { label: "Annuler", onClick: () => toggleReservable(id) },
      });
    } else {
      setConfetti(true);
      setTimeout(() => setConfetti(false), 3000);
      showNotification({
        type: "success",
        title: "🎉 Prestation activée !",
        message: "Tes clientes peuvent maintenant la réserver en ligne",
      });
    }
  };

  const shareService = (service: Prestation) => {
    navigator.clipboard.writeText(`${service.nom} - ${service.prixBase}€`);
    setQuickActionsOpen(null);
    showNotification({ type: "info", title: "Lien copié", message: "Tu peux maintenant partager cette prestation" });
  };

  const handleDeleteService = async () => {
    if (!selectedService) return;

    try {
      await new Promise((resolve) => setTimeout(resolve, 400));
      setPrestations((prev) => prev.filter((service) => service.id !== selectedService.id));
      showNotification({
        type: "success",
        title: "Prestation supprimée",
        message: "Les rendez-vous existants sont conservés",
      });
      closeModals();
    } catch (error) {
      showNotification({ type: "error", title: "Erreur", message: "Impossible de supprimer cette prestation" });
    }
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0 && mins > 0) return `${hours}h${mins}`;
    if (hours > 0) return `${hours}h`;
    return `${mins}min`;
  };

  const getPrixAffiche = (prestation: Prestation): string => {
    if (prestation.options.length === 0) return `${prestation.prixBase}€`;
    const prixMax = prestation.prixBase + Math.max(...prestation.options.map((o) => o.supplement));
    return `${prestation.prixBase} - ${prixMax}€`;
  };

  const getPrixComparison = (prix: number, type: string) => {
    const marketData = MARKET_DATA[type as keyof typeof MARKET_DATA];
    const diff = prix - marketData.prixMoyen;
    const pct = Math.abs((diff / marketData.prixMoyen) * 100);

    if (Math.abs(diff) < 3) return { label: "Prix marché", color: "text-green-600 dark:text-green-400" };
    if (diff > 0) return { label: `+${pct.toFixed(0)}% vs marché`, color: "text-orange-600 dark:text-orange-400" };
    return { label: `-${pct.toFixed(0)}% vs marché`, color: "text-blue-600 dark:text-blue-400" };
  };

  const statsGlobales = {
    totalReservations: prestations.reduce((acc, p) => acc + (p.analytics?.reservationsMois || 0), 0),
    tauxMoyenReservation: Math.round(
      prestations.reduce((acc, p) => acc + (p.analytics?.tauxReservation || 0), 0) / prestations.length
    ),
    prestationsActives: prestations.filter((p) => p.reservable).length,
  };

  const ConfettiPiece = ({ delay }: { delay: number }) => (
    <motion.div
      initial={{ y: -20, opacity: 1, rotate: 0 }}
      animate={{ y: window.innerHeight, opacity: 0, rotate: 360, x: Math.random() * 200 - 100 }}
      transition={{ duration: 2 + Math.random(), delay, ease: "easeOut" }}
      className="absolute left-1/2 w-2 h-2 rounded-full"
      style={{ backgroundColor: ["#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A", "#98D8C8"][Math.floor(Math.random() * 5)] }}
    />
  );

  return (
    <MobileLayout>
      <NotificationSystem />

      <AnimatePresence>
        {confetti && (
          <div className="fixed inset-0 pointer-events-none z-50">
            {[...Array(30)].map((_, i) => (
              <ConfettiPiece key={i} delay={i * 0.05} />
            ))}
          </div>
        )}
      </AnimatePresence>

      <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/10 pb-20">
        {/* Header */}
        <div className="relative pt-6 pb-5 px-4 mb-6">
          <motion.button
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => navigate(-1)}
            className="absolute left-4 top-6 w-10 h-10 rounded-xl bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl border border-white/20 shadow-sm flex items-center justify-center"
          >
            <ChevronLeft size={20} className="text-foreground" />
          </motion.button>

          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground mb-1">Mes Prestations</h1>
          </div>
        </div>

        <div className="px-4 space-y-3">
          {/* CTA */}
          <button
            onClick={() => navigate("/pro/services/create")}
            className="group relative w-full overflow-hidden rounded-2xl"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary to-primary/90" />
            <div className="relative px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-white/15 backdrop-blur-xl flex items-center justify-center">
                  <Plus size={20} className="text-white" strokeWidth={2.5} />
                </div>
                <div className="text-left">
                  <p className="text-base font-bold text-white">Nouvelle prestation</p>
                  <p className="text-xs text-white/70 font-medium">Pré-remplie avec suggestions IA</p>
                </div>
              </div>
              <ChevronRight size={18} className="text-white/50" />
            </div>
          </button>

          {/* Liste */}
          {isLoading ? (
            <div className="flex flex-col gap-3 mt-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-52 rounded-2xl bg-gradient-to-br from-muted/40 to-muted/20 animate-pulse" />
              ))}
            </div>
          ) : prestations.length === 0 ? (
            <div className="text-center py-16 px-6">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 mx-auto mb-5 flex items-center justify-center">
                <Sparkles size={32} className="text-primary" />
              </div>
              <h3 className="text-lg font-bold text-foreground mb-2">Commence maintenant</h3>
              <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto">
                Crée ta première prestation en quelques clics
              </p>
              <button
                onClick={() => navigate("/pro/services/create")}
                className="px-6 py-3 rounded-xl bg-primary text-white font-semibold shadow-lg shadow-primary/20"
              >
                Créer ma première prestation
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {prestations.map((prestation, index) => (
                <PrestationCard
                  key={prestation.id}
                  prestation={prestation}
                  index={index}
                  quickActionsOpen={quickActionsOpen}
                  setQuickActionsOpen={setQuickActionsOpen}
                  openEditModal={openEditModal}
                  openDeleteModal={openDeleteModal}
                  openPreview={openPreview}
                  duplicateService={duplicateService}
                  shareService={shareService}
                  toggleReservable={toggleReservable}
                  getPrixAffiche={getPrixAffiche}
                  getPrixComparison={getPrixComparison}
                  formatDuration={formatDuration}
                />
              ))}
            </div>
          )}
        </div>

        {/* Modal Preview */}
        <AnimatePresence>
          {previewModalOpen && selectedService && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={closeModals}
                className="fixed inset-0 bg-black/60 backdrop-blur-md z-50"
              />

              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="w-full max-w-md pointer-events-auto bg-white/95 dark:bg-gray-900/95 backdrop-blur-2xl rounded-2xl shadow-2xl border border-white/20 overflow-hidden"
                >
                  <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-b border-border/50 px-5 py-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                          <Eye size={16} className="text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-foreground">Vue cliente</p>
                          <p className="text-[10px] text-muted-foreground">Ce que voit la cliente</p>
                        </div>
                      </div>
                      <button
                        onClick={closeModals}
                        className="w-8 h-8 rounded-lg bg-muted/60 hover:bg-muted flex items-center justify-center transition-colors"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>

                  <div className="p-5">
                    <div className="mb-4">
                      <h3 className="text-xl font-bold text-foreground mb-2">{selectedService.nom}</h3>
                      <span className="inline-block px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-xs font-semibold">
                        {selectedService.typePrestation}
                      </span>
                    </div>

                    {selectedService.description && (
                      <p className="text-sm text-muted-foreground mb-4 leading-relaxed">{selectedService.description}</p>
                    )}

                    <div className="flex items-center gap-4 mb-4 pb-4 border-b border-border/50">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Prix</p>
                        <p className="text-2xl font-bold text-primary">{getPrixAffiche(selectedService)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Durée</p>
                        <p className="text-lg font-semibold text-foreground">{formatDuration(selectedService.tempsBloque)}</p>
                      </div>
                    </div>

                    {selectedService.options.length > 0 && (
                      <div>
                        <p className="text-sm font-bold text-foreground mb-2">Options disponibles</p>
                        <div className="space-y-2">
                          {selectedService.options.map((opt, idx) => (
                            <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/40">
                              <span className="text-sm font-medium text-foreground">{opt.nom}</span>
                              <span className="text-sm font-bold text-primary">+{opt.supplement}€</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <button className="w-full mt-5 py-3.5 rounded-xl bg-primary text-white font-bold shadow-lg shadow-primary/20">
                      Réserver
                    </button>
                  </div>
                </motion.div>
              </div>
            </>
          )}
        </AnimatePresence>

        {/* Modal Delete */}
        <AnimatePresence>
          {deleteModalOpen && selectedService && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={closeModals}
                className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
              />

              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="w-full max-w-sm pointer-events-auto bg-white/95 dark:bg-gray-900/95 backdrop-blur-2xl rounded-2xl shadow-xl border border-white/20 overflow-hidden"
                >
                  <div className="p-6 text-center">
                    <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-destructive/15 to-destructive/10 flex items-center justify-center mx-auto mb-4">
                      <Trash2 size={28} className="text-destructive" />
                    </div>

                    <h2 className="text-lg font-bold text-foreground mb-2">Supprimer cette prestation ?</h2>
                    <p className="text-base font-semibold text-foreground mb-1">{selectedService.nom}</p>
                    <p className="text-xs text-muted-foreground">Cette action est irréversible</p>
                  </div>

                  <div className="border-t border-border/50 p-4 flex gap-2.5">
                    <button
                      onClick={closeModals}
                      className="flex-1 py-3 rounded-xl bg-muted/60 hover:bg-muted text-foreground font-semibold text-sm transition-colors"
                    >
                      Annuler
                    </button>
                    <button
                      onClick={handleDeleteService}
                      className="flex-1 py-3 rounded-xl bg-destructive text-white font-semibold text-sm shadow-lg shadow-destructive/20 flex items-center justify-center gap-2"
                    >
                      <Trash2 size={16} />
                      Supprimer
                    </button>
                  </div>
                </motion.div>
              </div>
            </>
          )}
        </AnimatePresence>
      </div>
    </MobileLayout>
  );
};

export default ProServices;
