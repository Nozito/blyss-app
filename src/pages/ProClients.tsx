import { useState, useEffect, useMemo } from "react";
import MobileLayout from "@/components/MobileLayout";
import ClientEditModal from "@/components/ClientEditModal";
import { Search, Edit2, Users, X, TrendingUp, Calendar } from "lucide-react";
import api from "@/services/api";

interface Client {
  id: number;
  name: string;
  phone: string;
  lastVisit: string;
  totalVisits: number;
  notes: string;
  avatar: string;
}

const ProClients = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchClients = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await api.pro.getClients();
        if (!res.success) {
          throw new Error(res.error || "Erreur serveur");
        }
        setClients(res.data || []);
      } catch (e: any) {
        setError(e.message ?? "Erreur inattendue");
      } finally {
        setLoading(false);
      }
    };

    fetchClients();
  }, []);

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

      setClients((prev) =>
        prev.map((c) =>
          c.id === updatedClient.id ? { ...c, notes: updatedClient.notes } : c
        )
      );
    } catch (e) {
      console.error("Erreur sauvegarde notes:", e);
    }
  };

  const clientsThisWeek = useMemo(() => {
    return clients.filter(
      (c) =>
        c.lastVisit.includes("Aujourd'hui") || c.lastVisit.includes("Il y a")
    ).length;
  }, [clients]);

  const topClients = useMemo(() => {
    return [...clients].sort((a, b) => b.totalVisits - a.totalVisits).slice(0, 3);
  }, [clients]);

  return (
    <MobileLayout showNav={!isEditModalOpen}>
      <div className="pb-6">
        {/* Header avec gradient */}
        <div className="relative -mx-4 px-4 pt-6 pb-4 mb-5">
          <h1 className="text-2xl font-bold text-foreground mb-1 animate-fade-in">
            Mes clientes
          </h1>
          <p
            className="text-sm text-muted-foreground animate-fade-in"
            style={{ animationDelay: "0.1s" }}
          >
            {filteredClients.length} {filteredClients.length > 1 ? "clientes" : "cliente"}
            {searchQuery && " trouvée(s)"}
          </p>
        </div>

        {/* Search Bar améliorée */}
        <div className="relative mb-5 animate-slide-up group">
          <Search
            size={20}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher par nom ou téléphone..."
            className="w-full pl-12 pr-4 py-4 rounded-2xl bg-muted border-2 border-transparent text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/30 focus:bg-background transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-4 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-muted-foreground/10 flex items-center justify-center hover:bg-muted-foreground/20 active:scale-95 transition-all"
            >
              <X size={14} className="text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Stats Cards - Style professionnel épuré */}
        <div
          className="blyss-card mb-5 animate-slide-up"
          style={{ animationDelay: "0.1s" }}
        >
          <div className="grid grid-cols-3 divide-x divide-border">
            <div className="text-center px-3 py-3">
              <p className="text-3xl font-bold text-foreground mb-1">
                {clients.length}
              </p>
              <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">
                Total
              </p>
            </div>
            <div className="text-center px-3 py-3">
              <p className="text-3xl font-bold text-foreground mb-1">
                {clientsThisWeek}
              </p>
              <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">
                Semaine
              </p>
            </div>
            <div className="text-center px-3 py-3">
              <p className="text-3xl font-bold text-foreground mb-1">
                {clients.length}
              </p>
              <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">
                Mois
              </p>
            </div>
          </div>
        </div>

        {/* Top Clientes - Section optionnelle */}
        {!searchQuery && topClients.length > 0 && (
          <div
            className="mb-5 animate-slide-up"
            style={{ animationDelay: "0.15s" }}
          >
            <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
              <TrendingUp size={16} className="text-primary" />
              Clientes les plus fidèles
            </h2>
            <div className="flex gap-3 overflow-x-auto hide-scrollbar pb-2">
              {topClients.map((client, index) => (
                <div
                  key={client.id}
                  onClick={() => handleEditClient(client)}
                  className="flex-shrink-0 w-32 blyss-card text-center cursor-pointer hover:shadow-lg hover:-translate-y-1 active:scale-95 transition-all duration-300"
                  style={{ animationDelay: `${0.2 + index * 0.05}s` }}
                >
                  <div className="w-14 h-14 rounded-full gradient-primary flex items-center justify-center mx-auto mb-2 shadow-lg shadow-primary/20">
                    <span className="text-white font-bold text-lg">
                      {client.avatar}
                    </span>
                  </div>
                  <p className="font-bold text-sm text-foreground truncate mb-1">
                    {client.name.split(" ")[0]}
                  </p>
                  <p className="text-xs text-primary font-semibold">
                    {client.totalVisits} visites
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Liste des clientes */}
        <div
          className="animate-slide-up"
          style={{ animationDelay: "0.2s" }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-foreground">
              {searchQuery ? "Résultats" : "Toutes les clientes"}
            </h2>
            {filteredClients.length > 0 && (
              <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold">
                {filteredClients.length}
              </span>
            )}
          </div>

          <div className="space-y-3">
            {loading ? (
              <div className="blyss-card text-center py-12">
                <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  Chargement des clientes...
                </p>
              </div>
            ) : error ? (
              <div className="blyss-card text-center py-12">
                <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-3">
                  <X size={24} className="text-destructive" />
                </div>
                <p className="text-sm text-destructive font-medium">{error}</p>
              </div>
            ) : filteredClients.length > 0 ? (
              filteredClients.map((client, index) => (
                <div
                  key={client.id}
                  className="blyss-card group hover:shadow-lg hover:-translate-y-1 transition-all duration-300 cursor-pointer animate-slide-up"
                  style={{ animationDelay: `${0.25 + index * 0.03}s` }}
                  onClick={() => handleEditClient(client)}
                >
                  <div className="flex items-center gap-4">
                    {/* Avatar avec animation */}
                    <div className="w-14 h-14 rounded-2xl gradient-primary flex items-center justify-center flex-shrink-0 shadow-md shadow-primary/20 group-hover:scale-110 transition-transform">
                      <span className="text-white font-bold text-lg">
                        {client.avatar}
                      </span>
                    </div>

                    {/* Infos */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-foreground mb-0.5">
                        {client.name}
                      </h3>
                      <p className="text-sm text-muted-foreground mb-1">
                        {client.phone}
                      </p>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground">
                          {client.lastVisit}
                        </span>
                        <span className="text-muted-foreground">•</span>
                        <span className="text-primary font-semibold">
                          {client.totalVisits} {client.totalVisits > 1 ? "visites" : "visite"}
                        </span>
                      </div>
                      {client.notes && (
                        <div className="mt-2 px-3 py-2 rounded-lg bg-muted/50 border border-border/50">
                          <p className="text-xs text-muted-foreground italic line-clamp-2">
                            "{client.notes}"
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Bouton edit */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditClient(client);
                      }}
                      className="w-11 h-11 rounded-xl bg-accent flex items-center justify-center flex-shrink-0 group-hover:bg-primary group-hover:shadow-lg group-hover:shadow-primary/20 active:scale-95 transition-all"
                    >
                      <Edit2 size={18} className="text-primary group-hover:text-white transition-colors" />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="blyss-card text-center py-12">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                  <Users size={28} className="text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground mb-1">
                  {searchQuery
                    ? "Aucune cliente trouvée"
                    : "Aucune cliente"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {searchQuery
                    ? "Essaye un autre mot-clé"
                    : "Tes clientes apparaîtront ici"}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedClient && (
        <div className="fixed inset-0 z-[9999]">
          <ClientEditModal
            client={selectedClient}
            isOpen={isEditModalOpen}
            onClose={() => {
              setIsEditModalOpen(false);
              setSelectedClient(null);
            }}
            onSave={handleSaveClient}
          />
        </div>
      )}

      <style>{`
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }

        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </MobileLayout>
  );
};

export default ProClients;
