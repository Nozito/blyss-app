import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import MobileLayout from "@/components/MobileLayout";
import ClientEditModal from "@/components/ClientEditModal";
import {
  Search, Edit2, Users, X, TrendingUp, ShieldBan,
  Shield, AlertTriangle, TestTube2, Scissors, Leaf,
  ChevronRight, Save, Loader2
} from "lucide-react";
import { toast } from "sonner";
import api, { nailTechApi, type ClientNote, type BlockedClient } from "@/services/api";

interface Client {
  id: number;
  name: string;
  phone: string;
  lastVisit: string;
  totalVisits: number;
  notes: string;
  avatar: string;
}

type Tab = "clients" | "blocked";

const SHAPES = ["round", "square", "oval", "almond", "coffin", "stiletto", "squoval"] as const;
const SHAPE_LABELS: Record<string, string> = {
  round: "Ronde", square: "Carrée", oval: "Ovale", almond: "Amande",
  coffin: "Cercueil", stiletto: "Stiletto", squoval: "Squoval",
};

// ── Fiche cliente bottom sheet ────────────────────────────────────────────────

interface FicheModalProps {
  client: Client;
  onClose: () => void;
  onBlock: (clientId: number) => void;
  isBlocking: boolean;
}

const FicheModal = ({ client, onClose, onBlock, isBlocking }: FicheModalProps) => {
  const queryClient = useQueryClient();

  const { data: note, isLoading } = useQuery<ClientNote>({
    queryKey: ["client-note", client.id],
    queryFn: async () => {
      const res = await nailTechApi.getClientNotes(client.id);
      if (!res.success) throw new Error(res.message || "Erreur");
      return res.data!;
    },
  });

  const [localNotes, setLocalNotes] = useState<string>("");
  const [localAllergies, setLocalAllergies] = useState<string>("");
  const [localShape, setLocalShape] = useState<string | null>(null);
  const [localStyle, setLocalStyle] = useState<string>("");
  const [patchDone, setPatchDone] = useState(false);
  const [patchDate, setPatchDate] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // Init local state once note loads
  const [initialized, setInitialized] = useState(false);
  if (note && !initialized) {
    setLocalNotes(note.notes ?? "");
    setLocalAllergies(note.allergies ?? "");
    setLocalShape(note.preferred_shape ?? null);
    setLocalStyle(note.preferred_style ?? "");
    setPatchDone(note.patch_test_done ?? false);
    setPatchDate(note.patch_test_date ?? "");
    setInitialized(true);
  }

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await nailTechApi.updateClientNotes(client.id, {
        notes: localNotes || null,
        allergies: localAllergies || null,
        preferred_shape: localShape as any ?? null,
        preferred_style: localStyle || null,
        patch_test_done: patchDone,
        patch_test_date: patchDate || null,
      });
      if (!res.success) throw new Error(res.message);
      queryClient.invalidateQueries({ queryKey: ["client-note", client.id] });
      toast.success("Fiche mise à jour");
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Erreur");
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 300 }}
        className="w-full max-w-[430px] bg-card rounded-t-3xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: "92dvh" }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/20" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-md shadow-primary/20">
              <span className="text-white font-bold">{client.avatar}</span>
            </div>
            <div>
              <p className="font-bold text-foreground text-sm">{client.name}</p>
              <p className="text-xs text-muted-foreground">{client.totalVisits} visite{client.totalVisits > 1 ? "s" : ""}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center active:scale-90 transition-all">
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto px-5 py-4 space-y-5" style={{ maxHeight: "calc(92dvh - 200px)" }}>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : (
            <>
              {/* Notes libres */}
              <div>
                <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  <Edit2 size={12} /> Notes libres
                </label>
                <textarea
                  value={localNotes}
                  onChange={(e) => setLocalNotes(e.target.value)}
                  maxLength={2000}
                  rows={3}
                  placeholder="Notes personnalisées sur cette cliente..."
                  className="w-full px-3 py-2.5 rounded-xl bg-muted text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                />
              </div>

              {/* Allergies */}
              <div>
                <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  <AlertTriangle size={12} className="text-amber-500" /> Allergies connues
                </label>
                <textarea
                  value={localAllergies}
                  onChange={(e) => setLocalAllergies(e.target.value)}
                  maxLength={500}
                  rows={2}
                  placeholder="Ex: latex, gel UV, parfum..."
                  className="w-full px-3 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-300/50 resize-none"
                />
              </div>

              {/* Forme préférée */}
              <div>
                <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  <Scissors size={12} /> Forme préférée
                </label>
                <div className="flex flex-wrap gap-2">
                  {SHAPES.map((s) => (
                    <button
                      key={s}
                      onClick={() => setLocalShape(localShape === s ? null : s)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all active:scale-95 ${
                        localShape === s
                          ? "bg-primary text-white shadow-sm"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      }`}
                    >
                      {SHAPE_LABELS[s]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Style */}
              <div>
                <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  <Leaf size={12} className="text-primary" /> Style préféré
                </label>
                <input
                  value={localStyle}
                  onChange={(e) => setLocalStyle(e.target.value)}
                  maxLength={100}
                  placeholder="Ex: naturel, nude, art floral..."
                  className="w-full px-3 py-2.5 rounded-xl bg-muted text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              {/* Patch test */}
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-muted/50 border border-border">
                <div className="flex items-center gap-2">
                  <TestTube2 size={16} className={patchDone ? "text-emerald-500" : "text-muted-foreground"} />
                  <div>
                    <p className="text-sm font-medium text-foreground">Patch test réalisé</p>
                    {patchDone && patchDate && (
                      <p className="text-xs text-muted-foreground">Le {new Date(patchDate).toLocaleDateString("fr-FR")}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {patchDone && (
                    <input
                      type="date"
                      value={patchDate}
                      onChange={(e) => setPatchDate(e.target.value)}
                      className="text-xs px-2 py-1 rounded-lg bg-card border border-border focus:outline-none focus:ring-1 focus:ring-primary/30"
                    />
                  )}
                  <button
                    onClick={() => { setPatchDone(!patchDone); if (patchDone) setPatchDate(""); }}
                    className={`relative w-11 h-6 rounded-full transition-all ${patchDone ? "bg-emerald-500" : "bg-muted-foreground/30"}`}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all ${patchDone ? "left-[22px]" : "left-0.5"}`} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-6 pt-3 border-t border-border space-y-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3.5 rounded-2xl bg-primary text-white font-semibold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-70"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Enregistrer la fiche
          </button>
          <button
            onClick={() => onBlock(client.id)}
            disabled={isBlocking}
            className="w-full py-3 rounded-2xl bg-red-500/10 text-red-600 font-semibold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all border border-red-200 disabled:opacity-70"
          >
            {isBlocking ? <Loader2 size={14} className="animate-spin" /> : <ShieldBan size={14} />}
            Bloquer cette cliente
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

const ProClients = () => {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [ficheClient, setFicheClient] = useState<Client | null>(null);
  const [tab, setTab] = useState<Tab>("clients");
  const [blocking, setBlocking] = useState(false);
  const [unblocking, setUnblocking] = useState<number | null>(null);

  const { data: clients = [], isLoading: loading, error: queryError } = useQuery<Client[]>({
    queryKey: ["pro-clients"],
    queryFn: async () => {
      const res = await api.pro.getClients();
      if (!res.success) throw new Error(res.error || "Erreur serveur");
      return res.data || [];
    },
    staleTime: 2 * 60_000,
  });

  const { data: blockedClients = [], isLoading: loadingBlocked } = useQuery<BlockedClient[]>({
    queryKey: ["pro-blocked-clients"],
    queryFn: async () => {
      const res = await nailTechApi.getBlockedClients();
      if (!res.success) throw new Error(res.message || "Erreur");
      return res.data ?? [];
    },
    staleTime: 2 * 60_000,
  });

  const error = queryError ? (queryError as Error).message : null;

  const filteredClients = useMemo(
    () =>
      clients.filter(
        (client) =>
          client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          client.phone.includes(searchQuery)
      ),
    [clients, searchQuery]
  );

  const handleEditClient = (client: Client) => {
    setSelectedClient(client);
    setIsEditModalOpen(true);
  };

  const handleSaveClient = async (updatedClient: Client) => {
    try {
      await api.pro.updateClientNotes(updatedClient.id, updatedClient.notes);
      queryClient.setQueryData<Client[]>(["pro-clients"], (prev = []) =>
        prev.map((c) => c.id === updatedClient.id ? { ...c, notes: updatedClient.notes } : c)
      );
    } catch (e) {
      console.error("Erreur sauvegarde notes:", e);
    }
  };

  const handleBlock = async (clientId: number) => {
    setBlocking(true);
    try {
      const res = await nailTechApi.blockClient(clientId);
      if (!res.success) throw new Error(res.message);
      queryClient.invalidateQueries({ queryKey: ["pro-blocked-clients"] });
      setFicheClient(null);
      toast.success("Cliente bloquée");
    } catch (e: any) {
      toast.error(e?.message || "Erreur");
    } finally {
      setBlocking(false);
    }
  };

  const handleUnblock = async (clientId: number) => {
    setUnblocking(clientId);
    try {
      const res = await nailTechApi.unblockClient(clientId);
      if (!res.success) throw new Error(res.message);
      queryClient.invalidateQueries({ queryKey: ["pro-blocked-clients"] });
      toast.success("Cliente débloquée");
    } catch (e: any) {
      toast.error(e?.message || "Erreur");
    } finally {
      setUnblocking(null);
    }
  };

  const parseLastVisit = (lastVisit: string): number => {
    const visit = lastVisit.toLowerCase();
    if (visit.includes("aujourd'hui")) return 0;
    if (visit.includes("hier")) return 1;
    const jourMatch = visit.match(/il y a (\d+) jours?/);
    if (jourMatch) return parseInt(jourMatch[1]);
    const semaineMatch = visit.match(/il y a (\d+) semaines?/);
    if (semaineMatch) return parseInt(semaineMatch[1]) * 7;
    const moisMatch = visit.match(/il y a (\d+) mois/);
    if (moisMatch) return parseInt(moisMatch[1]) * 30;
    return 999;
  };

  const clientsThisWeek = useMemo(() => clients.filter((c) => parseLastVisit(c.lastVisit) <= 7).length, [clients]);
  const clientsThisMonth = useMemo(() => clients.filter((c) => parseLastVisit(c.lastVisit) <= 30).length, [clients]);
  const topClients = useMemo(() => [...clients].sort((a, b) => b.totalVisits - a.totalVisits).slice(0, 3), [clients]);

  return (
    <MobileLayout showNav={!isEditModalOpen && !ficheClient}>
      <div className="pb-6">
        {/* Header */}
        <div className="relative -mx-4 px-4 pt-6 pb-4 mb-5">
          <h1 className="text-2xl font-bold text-foreground mb-1 animate-fade-in">Mes clientes</h1>
          <p className="text-sm text-muted-foreground animate-fade-in" style={{ animationDelay: "0.1s" }}>
            {searchQuery && "Recherche en cours"}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-muted rounded-2xl mb-5">
          {(["clients", "blocked"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "clients" ? (
                <span className="flex items-center justify-center gap-1.5">
                  <Users size={14} /> Clientes {clients.length > 0 && <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold">{clients.length}</span>}
                </span>
              ) : (
                <span className="flex items-center justify-center gap-1.5">
                  <ShieldBan size={14} /> Bloquées {blockedClients.length > 0 && <span className="px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 text-[10px] font-bold">{blockedClients.length}</span>}
                </span>
              )}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {tab === "clients" ? (
            <motion.div key="clients" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
              {/* Search */}
              <div className="relative mb-5 group">
                <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Rechercher par nom ou téléphone..."
                  className="w-full pl-12 pr-4 py-4 rounded-2xl bg-muted border-2 border-transparent text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/30 focus:bg-background transition-all"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")} className="absolute right-4 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-muted-foreground/10 flex items-center justify-center hover:bg-muted-foreground/20 active:scale-95 transition-all">
                    <X size={14} className="text-muted-foreground" />
                  </button>
                )}
              </div>

              {/* Stats */}
              <div className="blyss-card mb-5">
                <div className="grid grid-cols-3 divide-x divide-border">
                  <div className="text-center px-3 py-3">
                    <p className="text-3xl font-bold text-foreground mb-1">{clients.length}</p>
                    <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Total</p>
                  </div>
                  <div className="text-center px-3 py-3">
                    <p className="text-3xl font-bold text-foreground mb-1">{clientsThisWeek}</p>
                    <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Semaine</p>
                  </div>
                  <div className="text-center px-3 py-3">
                    <p className="text-3xl font-bold text-foreground mb-1">{clientsThisMonth}</p>
                    <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Mois</p>
                  </div>
                </div>
              </div>

              {/* Top clients */}
              {!searchQuery && topClients.length > 0 && (
                <div className="mb-5 -mx-4">
                  <div className="px-4 mb-3">
                    <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                      <TrendingUp size={16} className="text-primary" />
                      Clientes les plus fidèles
                    </h2>
                  </div>
                  <div className="flex gap-3 overflow-x-auto hide-scrollbar pb-2 px-4 snap-x snap-mandatory">
                    {topClients.map((client, index) => (
                      <div
                        key={client.id}
                        onClick={() => setFicheClient(client)}
                        className="flex-shrink-0 w-32 blyss-card text-center cursor-pointer hover:shadow-lg hover:-translate-y-1 active:scale-95 transition-all duration-300 snap-start"
                        style={{ animationDelay: `${0.2 + index * 0.05}s` }}
                      >
                        <div className="w-14 h-14 rounded-full gradient-primary flex items-center justify-center mx-auto mb-2 shadow-lg shadow-primary/20">
                          <span className="text-white font-bold text-lg">{client.avatar}</span>
                        </div>
                        <p className="font-bold text-sm text-foreground truncate mb-1">{client.name.split(" ")[0]}</p>
                        <p className="text-xs text-primary font-semibold">{client.totalVisits} visites</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Client list */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-bold text-foreground">{searchQuery ? "Résultats" : "Toutes les clientes"}</h2>
                  {filteredClients.length > 0 && (
                    <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold">{filteredClients.length}</span>
                  )}
                </div>
                <div className="space-y-3">
                  {loading ? (
                    <div className="blyss-card text-center py-12">
                      <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground">Chargement...</p>
                    </div>
                  ) : error ? (
                    <div className="blyss-card text-center py-12">
                      <X size={24} className="text-destructive mx-auto mb-2" />
                      <p className="text-sm text-destructive font-medium">{error}</p>
                    </div>
                  ) : filteredClients.length > 0 ? (
                    filteredClients.map((client, index) => (
                      <div
                        key={client.id}
                        className="blyss-card group hover:shadow-lg hover:-translate-y-1 transition-all duration-300 cursor-pointer animate-slide-up"
                        style={{ animationDelay: `${0.25 + index * 0.03}s` }}
                        onClick={() => setFicheClient(client)}
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-14 h-14 rounded-2xl gradient-primary flex items-center justify-center flex-shrink-0 shadow-md shadow-primary/20 group-hover:scale-110 transition-transform">
                            <span className="text-white font-bold text-lg">{client.avatar}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-foreground mb-0.5">{client.name}</h3>
                            <p className="text-sm text-muted-foreground mb-1">{client.phone}</p>
                            <div className="flex items-center gap-2 text-xs">
                              <span className="text-muted-foreground">{client.lastVisit}</span>
                              <span className="text-muted-foreground">•</span>
                              <span className="text-primary font-semibold">{client.totalVisits} {client.totalVisits > 1 ? "visites" : "visite"}</span>
                            </div>
                            {client.notes && (
                              <div className="mt-2 px-3 py-2 rounded-lg bg-muted/50 border border-border/50">
                                <p className="text-xs text-muted-foreground italic line-clamp-2">"{client.notes}"</p>
                              </div>
                            )}
                          </div>
                          <div className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center flex-shrink-0 group-hover:bg-primary/10 transition-all">
                            <ChevronRight size={16} className="text-muted-foreground group-hover:text-primary transition-colors" />
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="blyss-card text-center py-12">
                      <Users size={28} className="text-muted-foreground mx-auto mb-3" />
                      <p className="text-sm font-medium text-foreground mb-1">{searchQuery ? "Aucune cliente trouvée" : "Aucune cliente"}</p>
                      <p className="text-xs text-muted-foreground">{searchQuery ? "Essaye un autre mot-clé" : "Tes clientes apparaîtront ici"}</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div key="blocked" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
              {loadingBlocked ? (
                <div className="blyss-card text-center py-12">
                  <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Chargement...</p>
                </div>
              ) : blockedClients.length === 0 ? (
                <div className="blyss-card text-center py-12">
                  <Shield size={28} className="text-emerald-500 mx-auto mb-3" />
                  <p className="text-sm font-medium text-foreground mb-1">Aucune cliente bloquée</p>
                  <p className="text-xs text-muted-foreground">Les clientes bloquées ne pourront plus réserver</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {blockedClients.map((bc) => (
                    <div key={bc.id} className="blyss-card flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                        <span className="text-red-600 font-bold text-sm">
                          {bc.first_name.charAt(0)}{bc.last_name.charAt(0)}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-foreground text-sm">{bc.first_name} {bc.last_name}</p>
                        <p className="text-xs text-muted-foreground">{bc.email}</p>
                        {bc.reason && <p className="text-xs text-muted-foreground italic mt-0.5 line-clamp-1">"{bc.reason}"</p>}
                      </div>
                      <button
                        onClick={() => handleUnblock(bc.client_id)}
                        disabled={unblocking === bc.client_id}
                        className="px-3 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-600 text-xs font-semibold border border-emerald-200 active:scale-95 transition-all flex items-center gap-1 disabled:opacity-70"
                      >
                        {unblocking === bc.client_id ? <Loader2 size={12} className="animate-spin" /> : <Shield size={12} />}
                        Débloquer
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Legacy edit modal */}
      {selectedClient && (
        <div className="fixed inset-0 z-[9999]">
          <ClientEditModal
            client={selectedClient}
            isOpen={isEditModalOpen}
            onClose={() => { setIsEditModalOpen(false); setSelectedClient(null); }}
            onSave={handleSaveClient}
          />
        </div>
      )}

      {/* Fiche cliente modal */}
      <AnimatePresence>
        {ficheClient && (
          <FicheModal
            client={ficheClient}
            onClose={() => setFicheClient(null)}
            onBlock={handleBlock}
            isBlocking={blocking}
          />
        )}
      </AnimatePresence>

      <style>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .line-clamp-1 { display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; }
        .line-clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      `}</style>
    </MobileLayout>
  );
};

export default ProClients;
