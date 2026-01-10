import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import MobileLayout from "@/components/MobileLayout";
import { useAuth } from "@/contexts/AuthContext";
import api from "@/services/api";

import {
  TrendingUp,
  TrendingDown,
  Plus,
  Ban,
  Eye,
  Calendar,
  Users,
  X
} from "lucide-react";

type WeeklyRevenuePoint = {
  day: string;
  amount: number;
};

type TopService = {
  name: string;
  percentage: number;
};

type UpcomingClient = {
  id: number;
  name: string;
  service: string;
  time: string;
  price: number;
  status: "ongoing" | "upcoming" | "completed";
  avatar: string;
};

type ProDashboardData = {
  weeklyStats: {
    services: number;
    change: number;
    isUp: boolean;
  };
  todayForecast: number;
  upcomingClients: UpcomingClient[];
  fillRate: number;
  clientsThisWeek: number;
  topServices: TopService[];
  weeklyRevenue: WeeklyRevenuePoint[];
};

const ProDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [data, setData] = useState<ProDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showSlotsModal, setShowSlotsModal] = useState(false);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);


  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await api.pro.getDashboard();

        if (!res.success) {
          throw new Error(res.error || "Erreur serveur");
        }

        setData(res.data);
      } catch (e: any) {
        setError(e.message ?? "Erreur inattendue");
      } finally {
        setLoading(false);
      }
    };

    fetchDashboard();
  }, []);

  const weeklyStats = data?.weeklyStats ?? {
    services: 0,
    change: 0,
    isUp: true
  };

  const todayForecast = data?.todayForecast ?? 0;
  const upcomingClients = data?.upcomingClients ?? [];
  const fillRate = data?.fillRate ?? 0;
  const clientsThisWeek = data?.clientsThisWeek ?? 0;
  const topServices = data?.topServices ?? [];
  const weeklyRevenue = data?.weeklyRevenue ?? [];

  const maxRevenue = useMemo(
    () =>
      Math.max(
        1,
        ...weeklyRevenue.map((d) => d.amount)
      ),
    [weeklyRevenue]
  );

  const getBarHeight = (amount: number) => {
    if (amount <= 0) return 8;
    const minPct = 20;
    const rawPct = (amount / maxRevenue) * 100;
    return Math.max(minPct, rawPct);
  };

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

  if (loading) {
    return (
      <MobileLayout showNav={false}>
        <div className="py-6 flex justify-center items-center">
          <p className="text-sm text-muted-foreground">
            Chargement du tableau de bord...
          </p>
        </div>
      </MobileLayout>
    );
  }

  if (error) {
    return (
      <MobileLayout showNav={true}>
        <div className="py-6 flex flex-col items-center gap-3">
          <p className="text-sm text-destructive">
            Une erreur est survenue.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="text-xs text-primary underline"
          >
            Réessayer
          </button>
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout showNav={!(showSlotsModal || showBlockModal)}>
      <div className="py-6 animate-fade-in space-y-5">
        {/* Header */}
        <header className="space-y-1 text-center">
          <p className="text-xs text-muted-foreground">
            Bonjour {user?.first_name} {user?.last_name} ✨
          </p>
          <h1 className="text-xl font-semibold text-foreground">
            Ton tableau de bord
          </h1>
          <p className="text-[11px] text-muted-foreground">
            Suis tes prestations, ton planning et tes revenus en un coup d’œil.
          </p>
        </header>

        {/* Weekly Performance Card */}
        <section className="blyss-card gradient-primary flex items-center justify-between animate-slide-up">
          <div>
            <p className="text-primary-foreground/80 text-xs">
              Cette semaine
            </p>
            <p className="text-3xl font-bold text-primary-foreground mt-1">
              {weeklyStats.services}
            </p>
            <p className="text-primary-foreground/80 text-xs">
              prestations
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary-foreground/20">
              {weeklyStats.isUp ? (
                <TrendingUp
                  size={16}
                  className="text-primary-foreground"
                />
              ) : (
                <TrendingDown
                  size={16}
                  className="text-primary-foreground"
                />
              )}
              <span className="text-primary-foreground font-medium text-xs">
                {weeklyStats.isUp ? "+" : "-"}
                {weeklyStats.change}%
              </span>
            </div>
            <p className="text-[11px] text-primary-foreground/80">
              vs semaine dernière
            </p>
          </div>
        </section>

        {/* Quick Actions */}
        <section className="grid grid-cols-3 gap-3 animate-slide-up">
          <button
            onClick={() => setShowSlotsModal(true)}
            className="blyss-card flex flex-col items-center justify-center py-4 active:scale-95 transition-transform"
          >
            <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center mb-2">
              <Plus size={20} className="text-primary" />
            </div>
            <span className="text-xs text-muted-foreground text-center">
              Créneaux
            </span>
          </button>
          <button
            onClick={() => setShowBlockModal(true)}
            className="blyss-card flex flex-col items-center justify-center py-4 active:scale-95 transition-transform"
          >
            <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center mb-2">
              <Ban size={20} className="text-primary" />
            </div>
            <span className="text-xs text-muted-foreground text-center">
              Bloquer
            </span>
          </button>
          <button
            onClick={() => navigate("/pro/calendar")}
            className="blyss-card flex flex-col items-center justify-center py-4 active:scale-95 transition-transform"
          >
            <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center mb-2">
              <Eye size={20} className="text-primary" />
            </div>
            <span className="text-xs text-muted-foreground text-center">
              Planning
            </span>
          </button>
        </section>

        {/* Today's Forecast */}
        <section className="blyss-card flex items-center justify-between animate-slide-up">
          <span className="text-xs text-muted-foreground font-medium">
            Estimation du jour
          </span>
          <span className="text-2xl font-bold text-foreground">
            {todayForecast}€
          </span>
        </section>

        {/* Upcoming Clients */}
        <section className="space-y-3 animate-slide-up">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">
              Prochaines clientes
            </h2>
            <button
              type="button"
              onClick={() => navigate("/pro/calendar")}
              className="text-[11px] text-primary"
            >
              Voir tout
            </button>
          </div>
          <div className="space-y-3">
            {upcomingClients.map((client) => (
              <div
                key={client.id}
                className="client-card flex items-center gap-4"
              >
                <div className="w-11 h-11 rounded-full gradient-primary flex items-center justify-center flex-shrink-0">
                  <span className="text-primary-foreground font-medium text-xs">
                    {client.avatar}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1 gap-2">
                    <h3 className="font-semibold text-sm text-foreground truncate">
                      {client.name}
                    </h3>
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap ${getStatusColor(
                        client.status
                      )}`}
                    >
                      {getStatusLabel(client.status)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate text-left">
                    {client.service}
                  </p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[11px] text-muted-foreground">
                      {client.time}
                    </span>
                    <span className="text-sm font-semibold text-foreground">
                      {client.price}€
                    </span>
                  </div>
                </div>
              </div>
            ))}
            {upcomingClients.length === 0 && (
              <p className="text-[11px] text-muted-foreground text-center">
                Aucune cliente à venir pour le moment.
              </p>
            )}
          </div>
        </section>

        {/* Stats Cards */}
        <section className="grid grid-cols-2 gap-3 animate-slide-up">
          <div className="stat-card">
            <div className="flex items-center gap-2 mb-1">
              <Calendar size={16} className="text-primary" />
              <span className="text-[11px] text-muted-foreground">
                Taux de remplissage
              </span>
            </div>
            <p className="text-3xl font-bold text-foreground">
              {fillRate}%
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              Sur tes créneaux ouverts cette semaine.
            </p>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-2 mb-1">
              <Users size={16} className="text-primary" />
              <span className="text-[11px] text-muted-foreground">
                Clientes cette semaine
              </span>
            </div>
            <p className="text-3xl font-bold text-foreground">
              {clientsThisWeek}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              Uniques ou récurrentes.
            </p>
          </div>
        </section>

        {/* Top Services */}
        <section className="blyss-card animate-slide-up">
          <h3 className="font-semibold text-sm text-foreground mb-3">
            Top prestations
          </h3>
          {topServices.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              Pas encore assez de données sur tes prestations.
            </p>
          ) : (
            <div className="space-y-3">
              {topServices.map((service, index) => (
                <div key={index}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted-foreground">
                      {service.name}
                    </span>
                    <span className="text-xs font-medium text-foreground">
                      {service.percentage}%
                    </span>
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
          )}
        </section>

        {/* Weekly Revenue Graph */}
        <section className="blyss-card animate-slide-up">
          <h3 className="font-semibold text-sm text-foreground mb-3">
            Revenus de la semaine
          </h3>

          {weeklyRevenue.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              Aucun revenu enregistré pour cette semaine pour l’instant.
            </p>
          ) : (() => {
            // Bar graph in px, tallest bar is pink, others gray, proportional height, minHeight 8px, parent h-32 (128px)
            const parentHeightPx = 128;
            const minBarPx = 8;
            const maxAmount = Math.max(...weeklyRevenue.map(d => d.amount ?? 0, 1));
            // Find all indexes with max value for pink bar
            const maxIndexes = weeklyRevenue
              .map((d, idx) => (d.amount === maxAmount && d.amount > 0 ? idx : -1))
              .filter(idx => idx !== -1);

            return (
              <div className="flex items-end justify-between gap-2 h-32">
                {weeklyRevenue.map((day, index) => {
                  const amount = day.amount ?? 0;
                  // Height in px, at least minBarPx
                  const barPx =
                    maxAmount > 0
                      ? Math.max(Math.round((amount / maxAmount) * parentHeightPx), minBarPx)
                      : minBarPx;
                  const isMax = amount === maxAmount && amount > 0;
                  return (
                    <div key={index} className="flex-1 flex flex-col items-center gap-1 group">
                      {/* Tooltip */}
                      <span
                        className="mb-1 px-2 py-0.5 rounded bg-black/80 text-xs text-white font-medium transition-opacity duration-150 opacity-0 group-hover:opacity-100 group-active:opacity-100 select-none"
                      >
                        {amount}€
                      </span>
                      {/* Bar */}
                      <div
                        className={`w-full rounded-t-lg transition-all duration-300 ${isMax ? "bg-pink-500" : "bg-gray-300"
                          } cursor-pointer`}
                        style={{
                          height: `${barPx}px`,
                          minHeight: `${minBarPx}px`,
                          maxHeight: `${parentHeightPx}px`,
                        }}
                        tabIndex={0}
                      />
                      {/* Day */}
                      <span className="text-[11px] text-muted-foreground">{day.day}</span>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </section>
      </div>

      {/* Add Slots Modal */}
      {showSlotsModal && (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/40">
          <div className="w-full max-w-[430px] bg-card rounded-t-3xl p-6 pb-8 animate-slide-up-modal">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">
                Ajouter des créneaux
              </h3>
              <button
                onClick={() => setShowSlotsModal(false)}
                className="w-9 h-9 rounded-full bg-muted flex items-center justify-center"
              >
                <X size={18} className="text-foreground" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mb-5">
              Ouvre de nouveaux créneaux pour la semaine à venir depuis ton
              calendrier Blyss.
            </p>
            <button
              onClick={() => {
                setShowSlotsModal(false);
                navigate("/pro/calendar");
              }}
              className="w-full py-3.5 rounded-2xl gradient-primary text-primary-foreground font-semibold active:scale-[0.98] transition-transform text-sm"
            >
              Aller au calendrier
            </button>
          </div>
        </div>
      )}

      {/* Block Day Modal */}
      {showBlockModal && (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/40">
          <div className="w-full max-w-[430px] bg-card rounded-t-3xl p-6 pb-8 animate-slide-up-modal">

            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">
                Bloquer une journée
              </h3>
              <button
                onClick={() => setShowBlockModal(false)}
                className="w-9 h-9 rounded-full bg-muted flex items-center justify-center"
              >
                <X size={18} className="text-foreground" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mb-5">
              Bloque une journée entière pour ne plus recevoir de réservations
              sur ce créneau.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowBlockModal(false)}
                className="flex-1 py-3.5 rounded-2xl bg-muted text-foreground font-semibold active:scale-[0.98] transition-transform text-sm"
              >
                Annuler
              </button>
              <button
                onClick={() => {
                  setToastMessage("Journée bloquée");
                  setShowBlockModal(false);
                  setTimeout(() => setToastMessage(null), 2000);
                }}
                className="flex-1 py-3.5 rounded-2xl bg-destructive text-destructive-foreground font-semibold active:scale-[0.98] transition-transform text-sm"
              >
                Bloquer
              </button>
            </div>
          </div>
        </div>
      )}

      {toastMessage && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-card py-2 px-4 rounded-xl shadow-lg animate-fade-in-out z-[9999]">
          <span className="text-foreground text-sm">{toastMessage}</span>
        </div>
      )}
    </MobileLayout>
  );
};

export default ProDashboard;
