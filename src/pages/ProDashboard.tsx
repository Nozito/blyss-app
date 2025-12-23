import { useState } from "react";
import { useNavigate } from "react-router-dom";
import MobileLayout from "@/components/MobileLayout";
import { TrendingUp, TrendingDown, Plus, Ban, Eye, Calendar, Users, X } from "lucide-react";

const ProDashboard = () => {
  const navigate = useNavigate();
  const [showSlotsModal, setShowSlotsModal] = useState(false);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Mock data
  const weeklyStats = {
    services: 24,
    change: 12,
    isUp: true,
  };

  const todayForecast = 320;

  const upcomingClients = [
    {
      id: 1,
      name: "Marie Dupont",
      service: "Pose complète gel",
      time: "14:00",
      price: 65,
      status: "ongoing",
      avatar: "MD",
    },
    {
      id: 2,
      name: "Sophie Martin",
      service: "Remplissage",
      time: "15:30",
      price: 45,
      status: "upcoming",
      avatar: "SM",
    },
    {
      id: 3,
      name: "Emma Bernard",
      service: "Manucure simple",
      time: "17:00",
      price: 35,
      status: "upcoming",
      avatar: "EB",
    },
  ];

  const fillRate = 78;
  const clientsThisWeek = 18;

  const topServices = [
    { name: "Pose gel", percentage: 45 },
    { name: "Remplissage", percentage: 30 },
    { name: "Manucure", percentage: 25 },
  ];

  const weeklyRevenue = [
    { day: "Lun", amount: 180 },
    { day: "Mar", amount: 240 },
    { day: "Mer", amount: 0 },
    { day: "Jeu", amount: 320 },
    { day: "Ven", amount: 280 },
    { day: "Sam", amount: 420 },
    { day: "Dim", amount: 0 },
  ];

  const maxRevenue = Math.max(...weeklyRevenue.map(d => d.amount));

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ongoing":
        return "bg-primary text-primary-foreground";
      case "upcoming":
        return "bg-blyss-gold-light text-blyss-gold";
      case "completed":
        return "bg-muted text-muted-foreground";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "ongoing":
        return "En cours";
      case "upcoming":
        return "À venir";
      case "completed":
        return "Terminé";
      default:
        return status;
    }
  };

  return (
    <MobileLayout showNav={!(showSlotsModal || showBlockModal)}>
      <div className="py-6 animate-fade-in">
        {/* Header */}
        <div className="mb-5">
          <p className="text-muted-foreground text-sm">Bonjour ✨</p>
          <h1 className="text-2xl font-semibold text-foreground">
            Ton tableau de bord
          </h1>
        </div>

        {/* Weekly Performance Card */}
        <div className="blyss-card gradient-primary mb-5 animate-slide-up">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-primary-foreground/80 text-sm">Cette semaine</p>
              <p className="text-4xl font-bold text-primary-foreground mt-1">
                {weeklyStats.services}
              </p>
              <p className="text-primary-foreground/80 text-sm">prestations</p>
            </div>
            <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary-foreground/20">
              {weeklyStats.isUp ? (
                <TrendingUp size={16} className="text-primary-foreground" />
              ) : (
                <TrendingDown size={16} className="text-primary-foreground" />
              )}
              <span className="text-primary-foreground font-medium text-sm">
                {weeklyStats.isUp ? "+" : "-"}{weeklyStats.change}%
              </span>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-3 gap-3 mb-5 animate-slide-up" style={{ animationDelay: "0.1s" }}>
          <button 
            onClick={() => setShowSlotsModal(true)}
            className="blyss-card flex flex-col items-center justify-center py-4 active:scale-95 transition-transform"
          >
            <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center mb-2">
              <Plus size={20} className="text-primary" />
            </div>
            <span className="text-xs text-muted-foreground text-center">Créneaux</span>
          </button>
          <button 
            onClick={() => setShowBlockModal(true)}
            className="blyss-card flex flex-col items-center justify-center py-4 active:scale-95 transition-transform"
          >
            <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center mb-2">
              <Ban size={20} className="text-primary" />
            </div>
            <span className="text-xs text-muted-foreground text-center">Bloquer</span>
          </button>
          <button 
            onClick={() => navigate("/pro/calendar")}
            className="blyss-card flex flex-col items-center justify-center py-4 active:scale-95 transition-transform"
          >
            <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center mb-2">
              <Eye size={20} className="text-primary" />
            </div>
            <span className="text-xs text-muted-foreground text-center">Planning</span>
          </button>
        </div>

        {/* Today's Forecast */}
        <div className="blyss-card flex items-center justify-between mb-5 animate-slide-up" style={{ animationDelay: "0.15s" }}>
          <span className="text-muted-foreground font-medium">Aujourd'hui</span>
          <span className="text-2xl font-bold text-foreground">{todayForecast}€</span>
        </div>

        {/* Upcoming Clients */}
        <div className="mb-5 animate-slide-up" style={{ animationDelay: "0.2s" }}>
          <h2 className="text-lg font-semibold text-foreground mb-3">
            Prochaines clientes
          </h2>
          <div className="space-y-3">
            {upcomingClients.map((client) => (
              <div key={client.id} className="client-card flex items-center gap-4">
                <div className="w-12 h-12 rounded-full gradient-primary flex items-center justify-center flex-shrink-0">
                  <span className="text-primary-foreground font-medium text-sm">
                    {client.avatar}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between mb-1">
                    <h3 className="font-semibold text-foreground truncate">
                      {client.name}
                    </h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusColor(client.status)}`}>
                      {getStatusLabel(client.status)}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{client.service}</p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-muted-foreground">{client.time}</span>
                    <span className="text-sm font-semibold text-foreground">{client.price}€</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-3 mb-5 animate-slide-up" style={{ animationDelay: "0.25s" }}>
          <div className="stat-card">
            <div className="flex items-center gap-2 mb-2">
              <Calendar size={16} className="text-primary" />
              <span className="text-xs text-muted-foreground">Taux de remplissage</span>
            </div>
            <p className="text-3xl font-bold text-foreground">{fillRate}%</p>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-2 mb-2">
              <Users size={16} className="text-primary" />
              <span className="text-xs text-muted-foreground">Clientes cette semaine</span>
            </div>
            <p className="text-3xl font-bold text-foreground">{clientsThisWeek}</p>
          </div>
        </div>

        {/* Top Services */}
        <div className="blyss-card mb-5 animate-slide-up" style={{ animationDelay: "0.3s" }}>
          <h3 className="font-semibold text-foreground mb-4">Top prestations</h3>
          <div className="space-y-3">
            {topServices.map((service, index) => (
              <div key={index}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-muted-foreground">{service.name}</span>
                  <span className="text-sm font-medium text-foreground">{service.percentage}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full gradient-primary rounded-full transition-all duration-500"
                    style={{ width: `${service.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Weekly Revenue Graph */}
        <div className="blyss-card animate-slide-up" style={{ animationDelay: "0.35s" }}>
          <h3 className="font-semibold text-foreground mb-4">Revenus de la semaine</h3>
          <div className="flex items-end justify-between gap-2 h-32">
            {weeklyRevenue.map((day, index) => (
              <div key={index} className="flex-1 flex flex-col items-center gap-2">
                <div 
                  className={`w-full rounded-t-lg transition-all duration-300 ${
                    day.amount > 0 ? "gradient-primary" : "bg-muted"
                  }`}
                  style={{ 
                    height: day.amount > 0 ? `${(day.amount / maxRevenue) * 100}%` : "8px",
                    minHeight: "8px"
                  }}
                />
                <span className="text-xs text-muted-foreground">{day.day}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Add Slots Modal */}
      {showSlotsModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
          <div className="w-full max-w-[430px] bg-card rounded-t-3xl p-6 pb-10 animate-slide-up-modal">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-foreground">Ajouter des créneaux</h3>
              <button 
                onClick={() => setShowSlotsModal(false)}
                className="w-10 h-10 rounded-full bg-muted flex items-center justify-center z-0"
              >
                <X size={20} className="text-foreground" />
              </button>
            </div>
            <p className="text-muted-foreground mb-6">
              Sélectionnez les créneaux que vous souhaitez ouvrir à la réservation.
            </p>
            <button
              onClick={() => {
                setShowSlotsModal(false);
                navigate("/pro/calendar");
              }}
              className="w-full py-4 rounded-2xl gradient-primary text-primary-foreground font-semibold active:scale-[0.98] transition-transform"
            >
              Aller au calendrier
            </button>
          </div>
        </div>
      )}

      {/* Block Day Modal */}
      {showBlockModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
          <div className="w-full max-w-[430px] bg-card rounded-t-3xl p-6 pb-10 animate-slide-up-modal">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-foreground">Bloquer une journée</h3>
              <button 
                onClick={() => setShowBlockModal(false)}
                className="w-10 h-10 rounded-full bg-muted flex items-center justify-center"
              >
                <X size={20} className="text-foreground" />
              </button>
            </div>
            <p className="text-muted-foreground mb-6">
              Bloquez une journée pour ne plus recevoir de réservations.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowBlockModal(false)}
                className="flex-1 py-4 rounded-2xl bg-muted text-foreground font-semibold active:scale-[0.98] transition-transform"
              >
                Annuler
              </button>
              <button
                onClick={() => {
                  setToastMessage("Journée bloquée");
                  setShowBlockModal(false);
                  setTimeout(() => setToastMessage(null), 2000); // auto-hide après 2s
                }}
                className="flex-1 py-4 rounded-2xl bg-destructive text-destructive-foreground font-semibold active:scale-[0.98] transition-transform"
              >
                Bloquer
              </button>
            </div>
          </div>
        </div>
      )}

      {toastMessage && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-card py-2 px-4 rounded-xl shadow-lg animate-fade-in-out z-[9999]">
          <span className="text-foreground">{toastMessage}</span>
        </div>
      )}
    </MobileLayout>
  );
};

export default ProDashboard;
