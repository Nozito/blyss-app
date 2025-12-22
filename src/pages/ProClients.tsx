import { useState } from "react";
import MobileLayout from "@/components/MobileLayout";
import { Search, Plus, ChevronRight } from "lucide-react";

const ProClients = () => {
  const [searchQuery, setSearchQuery] = useState("");

  const clients = [
    {
      id: 1,
      name: "Marie Dupont",
      phone: "06 12 34 56 78",
      lastVisit: "Il y a 2 jours",
      totalVisits: 12,
      notes: "Préfère les couleurs nude",
      avatar: "MD",
    },
    {
      id: 2,
      name: "Sophie Martin",
      phone: "06 23 45 67 89",
      lastVisit: "Il y a 1 semaine",
      totalVisits: 8,
      notes: "Allergique au gel",
      avatar: "SM",
    },
    {
      id: 3,
      name: "Emma Bernard",
      phone: "06 34 56 78 90",
      lastVisit: "Il y a 3 jours",
      totalVisits: 15,
      notes: "",
      avatar: "EB",
    },
    {
      id: 4,
      name: "Claire Petit",
      phone: "06 45 67 89 01",
      lastVisit: "Il y a 2 semaines",
      totalVisits: 5,
      notes: "Aime le nail art",
      avatar: "CP",
    },
    {
      id: 5,
      name: "Julie Moreau",
      phone: "06 56 78 90 12",
      lastVisit: "Aujourd'hui",
      totalVisits: 20,
      notes: "Cliente fidèle",
      avatar: "JM",
    },
  ];

  const filteredClients = clients.filter(client =>
    client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    client.phone.includes(searchQuery)
  );

  return (
    <MobileLayout>
      <div className="px-5 pt-safe-top pb-6">
        {/* Header */}
        <div className="flex items-center justify-between py-6 animate-fade-in">
          <h1 className="font-display text-2xl font-semibold text-foreground">
            Mes clientes
          </h1>
          <button className="touch-button w-10 h-10 rounded-full gradient-primary flex items-center justify-center active:scale-95 transition-transform">
            <Plus size={20} className="text-primary-foreground" />
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-5 animate-slide-up">
          <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher une cliente..."
            className="w-full pl-12 pr-4 py-4 rounded-xl bg-muted border-0 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {/* Stats */}
        <div className="blyss-card mb-5 animate-slide-up" style={{ animationDelay: "0.1s" }}>
          <div className="flex items-center justify-between">
            <div className="text-center flex-1">
              <p className="text-2xl font-bold text-foreground">{clients.length}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
            <div className="w-px h-10 bg-border" />
            <div className="text-center flex-1">
              <p className="text-2xl font-bold text-foreground">3</p>
              <p className="text-xs text-muted-foreground">Cette semaine</p>
            </div>
            <div className="w-px h-10 bg-border" />
            <div className="text-center flex-1">
              <p className="text-2xl font-bold text-foreground">12</p>
              <p className="text-xs text-muted-foreground">Ce mois</p>
            </div>
          </div>
        </div>

        {/* Client List */}
        <div className="space-y-3 animate-slide-up" style={{ animationDelay: "0.15s" }}>
          {filteredClients.map((client, index) => (
            <button
              key={client.id}
              className="blyss-card w-full flex items-center gap-4 active:scale-[0.98] transition-transform text-left"
              style={{ animationDelay: `${0.2 + index * 0.05}s` }}
            >
              <div className="w-12 h-12 rounded-full gradient-primary flex items-center justify-center flex-shrink-0">
                <span className="text-primary-foreground font-medium text-sm">
                  {client.avatar}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground">{client.name}</h3>
                <p className="text-sm text-muted-foreground">{client.phone}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-muted-foreground">{client.lastVisit}</span>
                  <span className="text-xs text-muted-foreground">•</span>
                  <span className="text-xs text-primary font-medium">{client.totalVisits} visites</span>
                </div>
              </div>
              <ChevronRight size={20} className="text-muted-foreground flex-shrink-0" />
            </button>
          ))}
        </div>

        {filteredClients.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Aucune cliente trouvée</p>
          </div>
        )}
      </div>
    </MobileLayout>
  );
};

export default ProClients;
