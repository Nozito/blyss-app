import { useState, useEffect, useMemo } from "react";
import MobileLayout from "@/components/MobileLayout";
import ClientEditModal from "@/components/ClientEditModal";
import { Search, Edit2 } from "lucide-react";
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
      // persistance en bdd
      await api.pro.updateClientNotes(updatedClient.id, updatedClient.notes);

      // mise à jour du state local
      setClients((prev) =>
        prev.map((c) =>
          c.id === updatedClient.id
            ? { ...c, notes: updatedClient.notes }
            : c
        )
      );
    } catch (e) {
      console.error("Erreur sauvegarde notes:", e);
      // optionnel: afficher un toast d'erreur
    }
  };

  const clientsThisWeek = useMemo(() => {
    return clients.filter(
      (c) =>
        c.lastVisit.includes("Aujourd'hui") ||
        c.lastVisit.includes("Il y a")
    ).length;
  }, [clients]);

  return (
    <MobileLayout showNav={!isEditModalOpen}>
      <div className="py-6 animate-fade-in">
        <h1 className="font-display text-2xl font-semibold text-foreground">
          Mes clientes
        </h1>
      </div>

      <div className="relative mb-5 animate-slide-up">
        <Search
          size={20}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Rechercher une cliente..."
          className="w-full pl-12 pr-4 py-4 rounded-xl bg-muted border-0 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      <div
        className="blyss-card mb-5 animate-slide-up"
        style={{ animationDelay: "0.1s" }}
      >
        <div className="flex items-center justify-between">
          <div className="text-center flex-1">
            <p className="text-2xl font-bold text-foreground">
              {clients.length}
            </p>
            <p className="text-xs text-muted-foreground">Total</p>
          </div>
          <div className="w-px h-10 bg-border" />
          <div className="text-center flex-1">
            <p className="text-2xl font-bold text-foreground">
              {clientsThisWeek}
            </p>
            <p className="text-xs text-muted-foreground">Cette semaine</p>
          </div>
          <div className="w-px h-10 bg-border" />
          <div className="text-center flex-1">
            <p className="text-2xl font-bold text-foreground">
              {clients.length}
            </p>
            <p className="text-xs text-muted-foreground">Ce mois</p>
          </div>
        </div>
      </div>

      <div
        className="space-y-3 animate-slide-up"
        style={{ animationDelay: "0.15s" }}
      >
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">
            Chargement des clientes...
          </div>
        ) : error ? (
          <div className="text-center py-12 text-destructive">{error}</div>
        ) : filteredClients.length > 0 ? (
          filteredClients.map((client, index) => (
            <div
              key={client.id}
              className="blyss-card flex items-center gap-4"
              style={{ animationDelay: `${0.2 + index * 0.05}s` }}
            >
              <div className="w-12 h-12 rounded-full gradient-primary flex items-center justify-center flex-shrink-0">
                <span className="text-primary-foreground font-medium text-sm">
                  {client.avatar}
                </span>
              </div>
              <div className="flex-1 min-w-0 flex flex-col justify-center items-start">
                <h3 className="font-semibold text-foreground text-left">
                  {client.name}
                </h3>
                <p className="text-sm text-muted-foreground text-left">
                  {client.phone}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-muted-foreground">
                    {client.lastVisit}
                  </span>
                  <span className="text-xs text-muted-foreground">•</span>
                  <span className="text-xs text-primary font-medium">
                    {client.totalVisits} visites
                  </span>
                </div>
                {client.notes && (
                  <p className="text-xs text-muted-foreground mt-1 truncate italic">
                    "{client.notes}"
                  </p>
                )}
              </div>
              <button
                onClick={() => handleEditClient(client)}
                className="w-10 h-10 rounded-full bg-accent flex items-center justify-center flex-shrink-0 active:scale-95 transition-transform"
              >
                <Edit2 size={16} className="text-primary" />
              </button>
            </div>
          ))
        ) : (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Aucune cliente trouvée</p>
          </div>
        )}
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
    </MobileLayout>
  );
};

export default ProClients;