import { useCallback, useEffect, useRef, useState } from "react";
import MobileLayout from "@/components/MobileLayout";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion, PanInfo, useMotionValue, useTransform } from "framer-motion";
import {
  Plus,
  ChevronLeft,
  Edit2,
  Trash2,
  X,
  Copy,
  Eye,
  Sparkles,
  EyeOff,
  ChevronRight,
  Share2,
  MoreVertical,
  Zap,
} from "lucide-react";
import { proApi } from "@/services/api";
import { toast } from "sonner";

// ===== TYPES =====
export interface Prestation {
  id: number;
  name: string;
  description: string;
  price: number | string;
  duration_minutes: number;
  active: boolean;
  created_at: string;
}

// ===== PRESTATION CARD =====
interface PrestationCardProps {
  prestation: Prestation;
  index: number;
  quickActionsOpen: number | null;
  setQuickActionsOpen: (id: number | null) => void;
  onEdit: (service: Prestation) => void;
  onQuickEdit: (service: Prestation) => void;
  onDelete: (service: Prestation) => void;
  onPreview: (service: Prestation) => void;
  onDuplicate: (service: Prestation) => void;
  onShare: (service: Prestation) => void;
  onToggleActive: (id: number) => void;
  formatDuration: (minutes: number) => string;
}

const PrestationCard: React.FC<PrestationCardProps> = ({ prestation, index, quickActionsOpen, setQuickActionsOpen, onEdit, onQuickEdit, onDelete, onPreview, onDuplicate, onShare, onToggleActive, formatDuration }) => {
  const x = useMotionValue(0);
  const actionTriggered = useTransform(x, [-150, 0, 150], [1, 0, 1]);
  const isMenuOpen = quickActionsOpen === prestation.id;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * index }} className="group relative">
      {/* Swipe actions background */}
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
          if (info.offset.x < -150) onDelete(prestation);
          if (info.offset.x > 150) onEdit(prestation);
        }}
        className="relative overflow-hidden rounded-2xl bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl border border-white/20 shadow-sm hover:shadow-md transition-all duration-200"
      >
        <div className="p-4">
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1 min-w-0 pr-3">
              <h3 className="text-base font-bold text-foreground truncate mb-1.5">{prestation.name}</h3>
            </div>

            {/* Quick actions menu */}
            <div className="relative">
              <motion.button whileHover={{ scale: 1.06, rotate: 90 }} whileTap={{ scale: 0.92 }} onClick={() => setQuickActionsOpen(isMenuOpen ? null : prestation.id)} className="w-9 h-9 rounded-lg bg-muted/50 hover:bg-muted flex items-center justify-center transition-colors">
                <MoreVertical size={16} className="text-foreground" />
              </motion.button>

              <AnimatePresence>
                {isMenuOpen && (
                  <>
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setQuickActionsOpen(null)} className="fixed inset-0 z-40" />
                    <motion.div
                      initial={{ opacity: 0, scale: 0.92, y: -8 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.92, y: -8 }}
                      transition={{ type: "spring", damping: 25 }}
                      className="absolute right-0 top-12 z-50 w-48 rounded-xl bg-white/95 dark:bg-gray-900/95 backdrop-blur-2xl border border-white/20 shadow-xl overflow-hidden"
                    >
                      <div className="p-1">
                        <button onClick={() => onPreview(prestation)} className="w-full px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium text-foreground hover:bg-muted/50">
                          <Eye size={16} />
                          Vue cliente
                        </button>
                        <button onClick={() => onQuickEdit(prestation)} className="w-full px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium text-foreground hover:bg-muted/50">
                          <Zap size={16} />
                          Édition rapide
                        </button>
                        <button onClick={() => onDuplicate(prestation)} className="w-full px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium text-foreground hover:bg-muted/50">
                          <Copy size={16} />
                          Dupliquer
                        </button>
                        <button onClick={() => onShare(prestation)} className="w-full px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium text-foreground hover:bg-muted/50">
                          <Share2 size={16} />
                          Partager
                        </button>

                        <div className="h-px bg-border/50 my-1" />

                        <button onClick={() => onEdit(prestation)} className="w-full px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium text-primary hover:bg-primary/5">
                          <Edit2 size={16} />
                          Modifier tout
                        </button>
                        <button onClick={() => onDelete(prestation)} className="w-full px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium text-destructive hover:bg-destructive/5">
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
          {!!prestation.description && <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{prestation.description}</p>}

          {/* Prix & Durée */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary/5 to-primary/10 p-3 border border-primary/10">
              <p className="text-[10px] font-semibold text-primary/60 uppercase tracking-wide mb-1">Prix</p>
              <p className="text-lg font-bold text-foreground">{Number(prestation.price).toFixed(2)}€</p>
            </div>

            <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-muted/40 to-muted/20 p-3 border border-border/30">
              <p className="text-[10px] font-semibold text-muted-foreground mb-1 uppercase tracking-wide">Durée</p>
              <p className="text-lg font-bold text-foreground">{formatDuration(prestation.duration_minutes)}</p>
            </div>
          </div>

          {/* Active toggle */}
          <div className="flex items-center justify-between">
            <div
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${
                prestation.active ? "bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400 border border-green-200/50 dark:border-green-800/50" : "bg-orange-50 dark:bg-orange-950/20 text-orange-700 dark:text-orange-400 border border-orange-200/50 dark:border-orange-800/50"
              }`}
            >
              <div className={`w-1.5 h-1.5 rounded-full ${prestation.active ? "bg-green-500" : "bg-orange-500"}`} />
              {prestation.active ? "Réservable" : "Masquée"}
            </div>

            <button onClick={() => onToggleActive(prestation.id)} className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors flex items-center gap-1">
              {prestation.active ? (
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

// ===== PAGE =====
const ProServices = () => {
  const navigate = useNavigate();

  const [prestations, setPrestations] = useState<Prestation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [quickActionsOpen, setQuickActionsOpen] = useState<number | null>(null);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [quickEditModalOpen, setQuickEditModalOpen] = useState(false);

  const [selectedService, setSelectedService] = useState<Prestation | null>(null);

  // Quick Edit states
  const [quickEditPrice, setQuickEditPrice] = useState("");
  const [quickEditDuration, setQuickEditDuration] = useState(60);
  const [isSavingQuickEdit, setIsSavingQuickEdit] = useState(false);

  const [confetti, setConfetti] = useState(false);
  const confettiTimeoutRef = useRef<number | null>(null);

  const loadServices = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await proApi.getServices();
      if (!res?.success) throw new Error(res?.error || "Erreur serveur");
      setPrestations(res.data || []);
    } catch {
      toast.error("Impossible de charger les prestations");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadServices();
    return () => {
      if (confettiTimeoutRef.current) window.clearTimeout(confettiTimeoutRef.current);
    };
  }, [loadServices]);

  const closeModals = () => {
    setDeleteModalOpen(false);
    setPreviewModalOpen(false);
    setQuickEditModalOpen(false);
    setSelectedService(null);
  };

  const onEdit = (service: Prestation) => {
    navigate(`/pro/prestations/${service.id}/edit`);
    setQuickActionsOpen(null);
  };

  const onQuickEdit = (service: Prestation) => {
    setSelectedService(service);
    setQuickEditPrice(service.price.toString());
    setQuickEditDuration(service.duration_minutes);
    setQuickEditModalOpen(true);
    setQuickActionsOpen(null);
  };

  const handleQuickEditSave = async () => {
    if (!selectedService) return;

    try {
      setIsSavingQuickEdit(true);
      const res = await proApi.updateService(selectedService.id, {
        price: parseFloat(quickEditPrice),
        duration_minutes: quickEditDuration,
      });

      if (!res?.success) throw new Error(res?.error || "Erreur serveur");

      // Update local state
      setPrestations((prev) =>
        prev.map((p) =>
          p.id === selectedService.id
            ? { ...p, price: parseFloat(quickEditPrice), duration_minutes: quickEditDuration }
            : p
        )
      );

      toast.success("Prix et durée mis à jour");

      closeModals();
    } catch {
      toast.error("Impossible de modifier");
    } finally {
      setIsSavingQuickEdit(false);
    }
  };

  const onDelete = (service: Prestation) => {
    setSelectedService(service);
    setDeleteModalOpen(true);
    setQuickActionsOpen(null);
  };

  const onPreview = (service: Prestation) => {
    setSelectedService(service);
    setPreviewModalOpen(true);
    setQuickActionsOpen(null);
  };

  const onDuplicate = async (service: Prestation) => {
    setQuickActionsOpen(null);

    try {
      const res = await proApi.duplicateService(service.id);
      if (!res?.success) throw new Error(res?.error || "Erreur serveur");

      const created = res.data as Prestation;
      setPrestations((prev) => [created, ...prev]);

      toast.success("Prestation dupliquée — modifie-la avant de la rendre réservable");
    } catch {
      toast.error("Impossible de dupliquer la prestation");
    }
  };

  const onShare = (service: Prestation) => {
    navigator.clipboard.writeText(`${service.name} - ${service.price}€`);
    setQuickActionsOpen(null);
    toast.info("Prestation copiée dans le presse-papier");
  };

  const onToggleActive = async (id: number) => {
    const current = prestations.find((p) => p.id === id);
    if (!current) return;

    const next = !current.active;

    // Optimistic UI
    setPrestations((prev) => prev.map((p) => (p.id === id ? { ...p, active: next } : p)));
    setQuickActionsOpen(null);

    try {
      const res = await proApi.updateService(id, { active: next });
      if (!res?.success) throw new Error(res?.error || "Erreur serveur");

      if (!current.active && next) {
        setConfetti(true);
        if (confettiTimeoutRef.current) window.clearTimeout(confettiTimeoutRef.current);
        confettiTimeoutRef.current = window.setTimeout(() => setConfetti(false), 2500);

        toast.success("Prestation activée — visible côté clientes");
      } else {
        toast("Prestation masquée — cachée côté clientes");
      }
    } catch {
      // rollback
      setPrestations((prev) => prev.map((p) => (p.id === id ? { ...p, active: current.active } : p)));
      toast.error("Impossible de modifier la visibilité");
    }
  };

  const handleDeleteService = async () => {
    if (!selectedService) return;

    try {
      const res = await proApi.deleteService(selectedService.id);
      if (!res?.success) throw new Error(res?.error || "Erreur serveur");

      setPrestations((prev) => prev.filter((s) => s.id !== selectedService.id));

      toast.success("Prestation supprimée — les rendez-vous existants sont conservés");

      closeModals();
    } catch {
      toast.error("Impossible de supprimer cette prestation");
    }
  };

  const formatDuration = useCallback((minutes: number) => {
    const m = Math.max(0, minutes || 0);
    const hours = Math.floor(m / 60);
    const mins = m % 60;
    if (hours > 0 && mins > 0) return `${hours}h${mins}`;
    if (hours > 0) return `${hours}h`;
    return `${mins}min`;
  }, []);

  const ConfettiPiece = ({ delay }: { delay: number }) => (
    <motion.div
      initial={{ y: -20, opacity: 1, rotate: 0 }}
      animate={{
        y: window.innerHeight,
        opacity: 0,
        rotate: 360,
        x: Math.random() * 240 - 120,
      }}
      transition={{ duration: 2 + Math.random(), delay, ease: "easeOut" }}
      className="absolute left-1/2 w-2 h-2 rounded-full"
      style={{
        backgroundColor: ["#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A", "#98D8C8"][Math.floor(Math.random() * 5)],
      }}
    />
  );

  return (
    <MobileLayout>
      <AnimatePresence>
        {confetti && (
          <div className="fixed inset-0 pointer-events-none z-50">
            {Array.from({ length: 26 }).map((_, i) => (
              <ConfettiPiece key={i} delay={i * 0.04} />
            ))}
          </div>
        )}
      </AnimatePresence>

      <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/10 pb-20">
        {/* Header */}
        <div className="relative pt-6 pb-5 px-4 mb-6">
          <motion.button initial={{ opacity: 0, x: -18 }} animate={{ opacity: 1, x: 0 }} whileTap={{ scale: 0.95 }} onClick={() => navigate("/pro/dashboard")} className="absolute left-4 top-6 w-10 h-10 rounded-xl bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl border border-white/20 shadow-sm flex items-center justify-center">
            <ChevronLeft size={20} className="text-foreground" />
          </motion.button>

          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground mb-1">Mes Prestations</h1>
          </div>
        </div>

        <div className="px-4 space-y-3">
          {/* CTA */}
          <button onClick={() => navigate("/pro/prestations/create")} className="group relative w-full overflow-hidden rounded-2xl">
            <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary to-primary/90" />
            <div className="relative px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-white/15 backdrop-blur-xl flex items-center justify-center">
                  <Plus size={20} className="text-white" strokeWidth={2.5} />
                </div>
                <div className="text-left">
                  <p className="text-base font-bold text-white">Nouvelle prestation</p>
                  <p className="text-xs text-white/70 font-medium">Créer et publier en quelques clics</p>
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
              <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto">Crée ta première prestation en quelques clics</p>
              <button onClick={() => navigate("/pro/prestations/create")} className="px-6 py-3 rounded-xl bg-primary text-white font-semibold shadow-lg shadow-primary/20">
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
                  onEdit={onEdit}
                  onQuickEdit={onQuickEdit}
                  onDelete={onDelete}
                  onPreview={onPreview}
                  onDuplicate={onDuplicate}
                  onShare={onShare}
                  onToggleActive={onToggleActive}
                  formatDuration={formatDuration}
                />
              ))}
            </div>
          )}
        </div>

        {/* Modal Quick Edit */}
        <AnimatePresence>
          {quickEditModalOpen && selectedService && (
            <>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closeModals} className="fixed inset-0 bg-black/60 backdrop-blur-md z-50" />

              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
                <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} className="w-full max-w-md pointer-events-auto bg-white/95 dark:bg-gray-900/95 backdrop-blur-2xl rounded-2xl shadow-2xl border border-white/20 overflow-hidden">
                  <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-b border-border/50 px-5 py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                          <Zap size={16} className="text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-foreground">Édition rapide</p>
                          <p className="text-xs text-muted-foreground">{selectedService.name}</p>
                        </div>
                      </div>
                      <button onClick={closeModals} className="w-8 h-8 rounded-lg bg-muted/60 hover:bg-muted flex items-center justify-center transition-colors">
                        <X size={16} />
                      </button>
                    </div>
                  </div>

                  <div className="p-5 space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-foreground mb-2">Prix (€)</label>
                      <div className="relative">
                        <input
                          type="number"
                          step="0.5"
                          value={quickEditPrice}
                          onChange={(e) => setQuickEditPrice(e.target.value)}
                          className="w-full px-4 py-3 pr-10 rounded-xl border-2 border-border focus:border-primary focus:outline-none bg-card text-foreground font-semibold"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">€</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-foreground mb-2">Durée</label>
                      <select
                        value={quickEditDuration}
                        onChange={(e) => setQuickEditDuration(parseInt(e.target.value))}
                        className="w-full px-4 py-3 rounded-xl border-2 border-border focus:border-primary focus:outline-none bg-card text-foreground"
                      >
                        <option value={15}>15 min</option>
                        <option value={30}>30 min</option>
                        <option value={45}>45 min</option>
                        <option value={60}>1h</option>
                        <option value={75}>1h15</option>
                        <option value={90}>1h30</option>
                        <option value={120}>2h</option>
                        <option value={150}>2h30</option>
                        <option value={180}>3h</option>
                      </select>
                    </div>
                  </div>

                  <div className="border-t border-border/50 p-4 flex gap-2.5">
                    <button onClick={closeModals} className="flex-1 py-3 rounded-xl bg-muted/60 hover:bg-muted text-foreground font-semibold text-sm transition-colors">
                      Annuler
                    </button>
                    <button
                      onClick={handleQuickEditSave}
                      disabled={isSavingQuickEdit}
                      className="flex-1 py-3 rounded-xl bg-primary text-white font-semibold text-sm shadow-lg shadow-primary/20 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isSavingQuickEdit ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Enregistrement...
                        </>
                      ) : (
                        "Enregistrer"
                      )}
                    </button>
                  </div>
                </motion.div>
              </div>
            </>
          )}
        </AnimatePresence>

        {/* Modal Preview */}
        <AnimatePresence>
          {previewModalOpen && selectedService && (
            <>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closeModals} className="fixed inset-0 bg-black/60 backdrop-blur-md z-50" />

              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
                <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} className="w-full max-w-md pointer-events-auto bg-white/95 dark:bg-gray-900/95 backdrop-blur-2xl rounded-2xl shadow-2xl border border-white/20 overflow-hidden">
                  <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-b border-border/50 px-5 py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                          <Eye size={16} className="text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-foreground">Vue cliente</p>
                          <p className="text-[10px] text-muted-foreground">Ce que verra la cliente</p>
                        </div>
                      </div>
                      <button onClick={closeModals} className="w-8 h-8 rounded-lg bg-muted/60 hover:bg-muted flex items-center justify-center transition-colors">
                        <X size={16} />
                      </button>
                    </div>
                  </div>

                  <div className="p-5">
                    <div className="mb-4">
                      <h3 className="text-xl font-bold text-foreground mb-2">{selectedService.name}</h3>
                    </div>

                    {!!selectedService.description && <p className="text-sm text-muted-foreground mb-4 leading-relaxed">{selectedService.description}</p>}

                    <div className="flex items-center gap-4 mb-4 pb-4 border-b border-border/50">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Prix</p>
                        <p className="text-2xl font-bold text-primary">{Number(selectedService.price).toFixed(2)}€</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Durée</p>
                        <p className="text-lg font-semibold text-foreground">{formatDuration(selectedService.duration_minutes)}</p>
                      </div>
                    </div>

                    <button className="w-full mt-5 py-3.5 rounded-xl bg-primary text-white font-bold shadow-lg shadow-primary/20">Réserver</button>
                    <p className="text-[10px] text-muted-foreground mt-2 text-center">(Bouton démo côté pro)</p>
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
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closeModals} className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />

              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
                <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} className="w-full max-w-sm pointer-events-auto bg-white/95 dark:bg-gray-900/95 backdrop-blur-2xl rounded-2xl shadow-xl border border-white/20 overflow-hidden">
                  <div className="p-6 text-center">
                    <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-destructive/15 to-destructive/10 flex items-center justify-center mx-auto mb-4">
                      <Trash2 size={28} className="text-destructive" />
                    </div>

                    <h2 className="text-lg font-bold text-foreground mb-2">Supprimer cette prestation ?</h2>
                    <p className="text-base font-semibold text-foreground mb-1">{selectedService.name}</p>
                    <p className="text-xs text-muted-foreground">Cette action est irréversible</p>
                  </div>

                  <div className="border-t border-border/50 p-4 flex gap-2.5">
                    <button onClick={closeModals} className="flex-1 py-3 rounded-xl bg-muted/60 hover:bg-muted text-foreground font-semibold text-sm transition-colors">
                      Annuler
                    </button>
                    <button onClick={handleDeleteService} className="flex-1 py-3 rounded-xl bg-destructive text-white font-semibold text-sm shadow-lg shadow-destructive/20 flex items-center justify-center gap-2">
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

      <style>{`
        .line-clamp-2{
          display:-webkit-box;
          -webkit-line-clamp:2;
          -webkit-box-orient:vertical;
          overflow:hidden;
        }
      `}</style>
    </MobileLayout>
  );
};

export default ProServices;
