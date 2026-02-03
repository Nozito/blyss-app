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
  X,
  ChevronRight,
  Sparkles,
  Target,
  Clock,
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
    isUp: true,
  };

  const todayForecast = data?.todayForecast ?? 0;
  const upcomingClients = data?.upcomingClients ?? [];
  const fillRate = data?.fillRate ?? 0;
  const clientsThisWeek = data?.clientsThisWeek ?? 0;
  const topServices = data?.topServices ?? [];
  const weeklyRevenue = data?.weeklyRevenue ?? [];

  const maxRevenue = useMemo(
    () => Math.max(1, ...weeklyRevenue.map((d) => d.amount)),
    [weeklyRevenue]
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ongoing":
        return "bg-emerald-500/15 text-emerald-700 border border-emerald-200";
      case "upcoming":
        return "bg-amber-500/15 text-amber-700 border border-amber-200";
      case "completed":
        return "bg-gray-500/15 text-gray-600 border border-gray-200";
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
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 animate-fade-in">
          <div className="w-14 h-14 relative">
            <div className="absolute inset-0 border-4 border-primary/20 rounded-full" />
            <div className="absolute inset-0 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
          <p className="text-sm text-muted-foreground animate-pulse font-medium">
            Chargement de ton tableau de bord...
          </p>
        </div>
      </MobileLayout>
    );
  }

  if (error) {
    return (
      <MobileLayout showNav={true}>
        <div className="py-12 flex flex-col items-center gap-4 animate-fade-in">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-destructive/20 to-destructive/5 flex items-center justify-center">
            <X size={32} className="text-destructive" />
          </div>
          <p className="text-sm text-destructive font-semibold">
            Une erreur est survenue
          </p>
          <p className="text-xs text-muted-foreground">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold active:scale-95 transition-transform shadow-lg shadow-primary/20"
          >
            Réessayer
          </button>
        </div>
      </MobileLayout>
    );
  }

  const maxAmount = Math.max(...weeklyRevenue.map((d) => d.amount ?? 0), 1);

  return (
    <MobileLayout showNav={!(showSlotsModal || showBlockModal)}>
      <div className="py-5 space-y-4">
        {/* ✅ Header raffiné */}
        <header className="space-y-2 animate-fade-in">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] text-muted-foreground font-medium">
                Bonjour {user?.first_name} ✨
              </p>
              <h1 className="text-xl font-bold text-foreground mt-0.5 tracking-tight">
                Ton tableau de bord
              </h1>
            </div>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Suis tes prestations et revenus en temps réel
          </p>
        </header>

        {/* ✅ Weekly Performance - Plus compact et élégant */}
        <section
          className="relative overflow-hidden rounded-2xl p-4 bg-gradient-to-br from-primary via-primary/95 to-primary/85 shadow-lg shadow-primary/20 animate-slide-up"
          style={{ animationDelay: "0.05s" }}
        >
          <div className="absolute inset-0 opacity-[0.07]">
            <div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 20% 50%, white 1px, transparent 1px)",
                backgroundSize: "20px 20px",
              }}
            />
          </div>

          <div className="relative flex items-center justify-between">
            <div className="flex-1">
              <p className="text-white/70 text-[10px] font-semibold uppercase tracking-wider mb-1.5">
                Cette semaine
              </p>
              <div className="flex items-baseline gap-1.5 mb-0.5">
                <p className="text-3xl font-bold text-white tracking-tight">
                  {weeklyStats.services}
                </p>
                <span className="text-sm text-white/80 font-medium">
                  prestations
                </span>
              </div>
              <p className="text-white/60 text-[10px] font-medium">
                vs semaine dernière
              </p>
            </div>
            <div className="flex flex-col items-end">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/15 backdrop-blur-xl border border-white/20 shadow-md">
                {weeklyStats.isUp ? (
                  <TrendingUp size={16} className="text-white" strokeWidth={2} />
                ) : (
                  <TrendingDown size={16} className="text-white" strokeWidth={2} />
                )}
                <span className="text-white font-bold text-sm">
                  {weeklyStats.isUp ? "+" : "-"}
                  {weeklyStats.change}%
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ✅ Quick Actions - Plus compact */}
        <section
          className="grid grid-cols-3 gap-2 animate-slide-up"
          style={{ animationDelay: "0.1s" }}
        >
          <button
            onClick={() => setShowSlotsModal(true)}
            className="group rounded-xl p-4 bg-card border border-border hover:border-primary/40 active:scale-[0.97] transition-all shadow-sm hover:shadow-md"
          >
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center group-hover:scale-105 transition-transform">
                <Plus size={18} className="text-primary" strokeWidth={2} />
              </div>
              <span className="text-[11px] font-semibold text-foreground">
                Créneaux
              </span>
            </div>
          </button>

          <button
            onClick={() => setShowBlockModal(true)}
            className="group rounded-xl p-4 bg-card border border-border hover:border-destructive/40 active:scale-[0.97] transition-all shadow-sm hover:shadow-md"
          >
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-destructive/10 to-destructive/5 flex items-center justify-center group-hover:scale-105 transition-transform">
                <Ban size={18} className="text-destructive" strokeWidth={2} />
              </div>
              <span className="text-[11px] font-semibold text-foreground">
                Bloquer
              </span>
            </div>
          </button>

          <button
            onClick={() => navigate("/pro/calendar")}
            className="group rounded-xl p-4 bg-card border border-border hover:border-primary/40 active:scale-[0.97] transition-all shadow-sm hover:shadow-md"
          >
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center group-hover:scale-105 transition-transform">
                <Eye size={18} className="text-primary" strokeWidth={2} />
              </div>
              <span className="text-[11px] font-semibold text-foreground">
                Planning
              </span>
            </div>
          </button>
        </section>

        {/* ✅ Today's Forecast - Plus subtil */}
        <section
          className="rounded-xl p-4 bg-gradient-to-br from-emerald-50 to-emerald-50/20 border border-emerald-200/60 animate-slide-up shadow-sm"
          style={{ animationDelay: "0.15s" }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-emerald-500 flex items-center justify-center shadow-md shadow-emerald-500/25">
                <Target size={16} className="text-white" strokeWidth={2} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide">
                  Estimation du jour
                </p>
                <p className="text-[10px] text-emerald-600 mt-0.5">
                  Revenu prévisionnel
                </p>
              </div>
            </div>
            <p className="text-2xl font-bold text-emerald-700 tracking-tight">
              {todayForecast.toFixed(2).replace('.', ',')}€
            </p>
          </div>
        </section>

        {/* ✅ Stats Cards - Plus compact */}
        <section
          className="grid grid-cols-2 gap-2 animate-slide-up"
          style={{ animationDelay: "0.2s" }}
        >
          <div className="rounded-xl p-4 bg-card border border-border shadow-sm">
            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
                  <Calendar size={16} className="text-primary" strokeWidth={2} />
                </div>
                <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wide">
                  Taux remplissage
                </span>
              </div>
              <div>
                <p className="text-3xl font-bold text-foreground tracking-tight">
                  {fillRate.toFixed(0)}%
                </p>
                <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                  De tes créneaux ouverts
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl p-4 bg-card border border-border shadow-sm">
            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 flex items-center justify-center">
                  <Users size={16} className="text-emerald-600" strokeWidth={2} />
                </div>
                <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wide">
                  Clientes
                </span>
              </div>
              <div>
                <p className="text-3xl font-bold text-foreground tracking-tight">
                  {clientsThisWeek}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                  Servies cette semaine
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ✅ Upcoming Clients - Plus raffiné */}
        <section
          className="space-y-2.5 animate-slide-up"
          style={{ animationDelay: "0.25s" }}
        >
          <div className="flex items-center justify-between px-0.5">
            <h2 className="text-sm font-bold text-foreground tracking-tight">
              Prochaines clientes
            </h2>
            <button
              onClick={() => navigate("/pro/calendar")}
              className="flex items-center gap-0.5 text-[11px] text-primary font-bold group"
            >
              Voir tout
              <ChevronRight
                size={14}
                className="group-hover:translate-x-0.5 transition-transform"
                strokeWidth={2}
              />
            </button>
          </div>
          <div className="space-y-2">
            {upcomingClients.map((client, index) => (
              <div
                key={client.id}
                className="rounded-xl p-3.5 bg-card border border-border hover:border-primary/40 active:scale-[0.98] transition-all shadow-sm hover:shadow-md group cursor-pointer"
                style={{ animationDelay: `${0.3 + index * 0.05}s` }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform shadow-md shadow-primary/20">
                    <span className="text-white font-bold text-xs">
                      {client.avatar}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1 gap-2">
                      <h3 className="font-bold text-sm text-foreground truncate">
                        {client.name}
                      </h3>
                      <span
                        className={`text-[9px] px-2 py-0.5 rounded-full font-bold whitespace-nowrap ${getStatusColor(
                          client.status
                        )}`}
                      >
                        {getStatusLabel(client.status)}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate mb-1.5">
                      {client.service}
                    </p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <Clock size={11} className="text-muted-foreground" />
                        <span className="text-[11px] text-muted-foreground font-medium">
                          {client.time}
                        </span>
                      </div>
                      <span className="text-sm font-bold text-primary">
                        {client.price.toFixed(2).replace('.', ',')}€
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {upcomingClients.length === 0 && (
              <div className="rounded-xl p-6 bg-muted/20 border border-dashed border-border">
                <p className="text-xs text-muted-foreground text-center font-medium">
                  Aucune cliente à venir
                </p>
              </div>
            )}
          </div>
        </section>

        {/* ✅ Top Services - Plus compact */}
        <section
          className="rounded-xl p-4 bg-card border border-border shadow-sm animate-slide-up"
          style={{ animationDelay: "0.3s" }}
        >
          <h3 className="font-bold text-sm text-foreground mb-3 tracking-tight">
            Top prestations
          </h3>
          {topServices.length === 0 ? (
            <div className="rounded-lg p-5 bg-muted/20 border border-dashed border-border">
              <p className="text-[11px] text-muted-foreground text-center font-medium">
                Pas encore de données
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {topServices.slice(0, 3).map((service, index) => (
                <div key={index}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-foreground font-semibold">
                      {service.name}
                    </span>
                    <span className="text-xs font-bold text-primary">
                      {service.percentage}%
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-primary to-primary/80 rounded-full transition-all duration-1000 ease-out"
                      style={{
                        width: `${service.percentage}%`,
                        animationDelay: `${index * 0.1}s`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ✅ Weekly Revenue - Tooltip avec espace suffisant */}
        <section
          className="rounded-xl p-4 bg-card border border-border shadow-sm animate-slide-up"
          style={{ animationDelay: "0.35s" }}
        >
          <h3 className="font-bold text-sm text-foreground mb-3 tracking-tight">
            Revenus de la semaine
          </h3>

          {weeklyRevenue.length === 0 ? (
            <div className="rounded-lg p-6 bg-muted/20 border border-dashed border-border">
              <p className="text-[11px] text-muted-foreground text-center font-medium">
                Aucun revenu enregistré
              </p>
            </div>
          ) : (
            <div className="pt-8 pb-2"> {/* ✅ Ajoute du padding en haut pour le tooltip */}
              <div className="flex items-end justify-between gap-1.5 h-[110px] relative">
                {weeklyRevenue.map((day, index) => {
                  const amount = day.amount ?? 0;
                  const parentHeightPx = 110;
                  const minBarPx = 10;
                  const barPx =
                    maxAmount > 0
                      ? Math.max((amount / maxAmount) * parentHeightPx, minBarPx)
                      : minBarPx;
                  const isMax = amount === maxAmount && amount > 0;

                  return (
                    <div
                      key={index}
                      className="flex-1 flex flex-col items-center gap-1.5 group relative"
                    >
                      {/* ✅ Tooltip avec position corrigée */}
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-lg bg-foreground text-background text-[10px] font-bold transition-all duration-150 opacity-0 group-hover:opacity-100 group-hover:-top-9 select-none shadow-lg pointer-events-none whitespace-nowrap z-10">
                        {amount.toFixed(0)}€
                        {/* ✅ Petit triangle pointant vers le bas */}
                        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[4px] border-t-foreground" />
                      </div>

                      <div
                        className={`w-full rounded-t-lg transition-all duration-500 cursor-pointer ${isMax
                            ? "bg-gradient-to-t from-primary to-primary/70 shadow-md shadow-primary/20 scale-105"
                            : "bg-gradient-to-t from-muted to-muted/60 group-hover:from-primary/40 group-hover:to-primary/20"
                          }`}
                        style={{
                          height: `${barPx}px`,
                          minHeight: `${minBarPx}px`,
                          maxHeight: `${parentHeightPx}px`,
                        }}
                      />

                      <span className="text-[10px] text-muted-foreground font-semibold mt-0.5">
                        {day.day}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

      </div>

      {/* ✅ Modals - Plus raffinés */}
      {showSlotsModal && (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-[430px] bg-card rounded-t-2xl p-5 pb-6 shadow-2xl animate-slide-up-modal border-t border-border">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold text-foreground tracking-tight">
                Ajouter des créneaux
              </h3>
              <button
                onClick={() => setShowSlotsModal(false)}
                className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center active:scale-95 transition-transform"
              >
                <X size={18} className="text-foreground" strokeWidth={2} />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
              Ouvre de nouveaux créneaux depuis ton calendrier Blyss.
            </p>
            <button
              onClick={() => {
                setShowSlotsModal(false);
                navigate("/pro/calendar");
              }}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-primary to-primary/90 text-white font-semibold active:scale-[0.98] transition-all text-sm shadow-lg shadow-primary/20"
            >
              Aller au calendrier
            </button>
          </div>
        </div>
      )}

      {showBlockModal && (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-[430px] bg-card rounded-t-2xl p-5 pb-6 shadow-2xl animate-slide-up-modal border-t border-border">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold text-foreground tracking-tight">
                Bloquer une journée
              </h3>
              <button
                onClick={() => setShowBlockModal(false)}
                className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center active:scale-95 transition-transform"
              >
                <X size={18} className="text-foreground" strokeWidth={2} />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
              Bloque une journée pour ne plus recevoir de réservations.
            </p>
            <div className="flex gap-2.5">
              <button
                onClick={() => setShowBlockModal(false)}
                className="flex-1 py-3 rounded-xl bg-muted text-foreground font-semibold active:scale-[0.98] transition-all text-sm"
              >
                Annuler
              </button>
              <button
                onClick={() => {
                  setToastMessage("Journée bloquée");
                  setShowBlockModal(false);
                  setTimeout(() => setToastMessage(null), 2000);
                }}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-destructive to-destructive/90 text-white font-semibold active:scale-[0.98] transition-all text-sm shadow-lg shadow-destructive/20"
              >
                Bloquer
              </button>
            </div>
          </div>
        </div>
      )}

      {toastMessage && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-foreground text-background py-2 px-4 rounded-xl shadow-xl animate-fade-in-out z-[9999] font-semibold text-xs">
          {toastMessage}
        </div>
      )}

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes slide-up {
          from { opacity: 0; transform: translateY(15px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes slide-up-modal {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }

        @keyframes fade-in-out {
          0%, 100% { opacity: 0; transform: translate(-50%, -8px); }
          10%, 90% { opacity: 1; transform: translate(-50%, 0); }
        }

        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }

        .animate-slide-up {
          animation: slide-up 0.4s ease-out backwards;
        }

        .animate-slide-up-modal {
          animation: slide-up-modal 0.25s ease-out;
        }

        .animate-fade-in-out {
          animation: fade-in-out 2s ease-in-out;
        }
      `}</style>
    </MobileLayout>
  );
};

export default ProDashboard;