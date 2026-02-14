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
  Euro,
  Activity,
  Star,
  ArrowUpRight,
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
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);

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

  const totalWeeklyRevenue = useMemo(
    () => weeklyRevenue.reduce((sum, day) => sum + (day.amount ?? 0), 0),
    [weeklyRevenue]
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ongoing":
        return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-300/50 dark:border-emerald-500/30";
      case "upcoming":
        return "bg-blue-500/15 text-blue-700 dark:text-blue-400 border border-blue-300/50 dark:border-blue-500/30";
      case "completed":
        return "bg-gray-500/15 text-gray-600 dark:text-gray-400 border border-gray-300/50 dark:border-gray-500/30";
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "ongoing":
        return <Activity size={10} strokeWidth={2.5} />;
      case "upcoming":
        return <Clock size={10} strokeWidth={2.5} />;
      case "completed":
        return <Star size={10} strokeWidth={2.5} />;
      default:
        return null;
    }
  };

  // Skeleton Loader Component
  const SkeletonCard = ({ className = "" }: { className?: string }) => (
    <div className={`animate-pulse ${className}`}>
      <div className="h-full bg-gradient-to-br from-muted/60 to-muted/30 rounded-xl" />
    </div>
  );

  if (loading) {
    return (
      <MobileLayout showNav={false}>
        <div className="py-5 space-y-4 animate-fade-in">
          {/* Header Skeleton */}
          <div className="space-y-3">
            <div className="h-4 w-32 bg-muted/60 rounded-lg animate-pulse" />
            <div className="h-7 w-48 bg-muted/60 rounded-lg animate-pulse" />
            <div className="h-3 w-64 bg-muted/40 rounded-lg animate-pulse" />
          </div>

          {/* Weekly Performance Skeleton */}
          <SkeletonCard className="h-32" />

          {/* Quick Actions Skeleton */}
          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3].map((i) => (
              <SkeletonCard key={i} className="h-24" />
            ))}
          </div>

          {/* Stats Skeleton */}
          <SkeletonCard className="h-24" />
          
          <div className="grid grid-cols-2 gap-2">
            {[1, 2].map((i) => (
              <SkeletonCard key={i} className="h-28" />
            ))}
          </div>

          {/* Clients Skeleton */}
          <div className="space-y-2">
            <div className="h-5 w-40 bg-muted/60 rounded-lg animate-pulse" />
            {[1, 2, 3].map((i) => (
              <SkeletonCard key={i} className="h-20" />
            ))}
          </div>
        </div>
      </MobileLayout>
    );
  }

  if (error) {
    return (
      <MobileLayout showNav={true}>
        <div className="py-16 flex flex-col items-center gap-5 animate-fade-in px-6">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-destructive/20 to-destructive/5 flex items-center justify-center shadow-lg">
            <X size={36} className="text-destructive" strokeWidth={2} />
          </div>
          <div className="text-center space-y-2">
            <h3 className="text-base font-bold text-foreground">
              Une erreur est survenue
            </h3>
            <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
              {error}
            </p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="px-8 py-3 rounded-xl bg-primary text-white text-sm font-bold active:scale-95 transition-all shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30"
          >
            Réessayer
          </button>
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout showNav={!(showSlotsModal || showBlockModal)}>
      <div className="py-5 space-y-5">
        {/* Header amélioré avec date */}
        <header className="space-y-3 animate-fade-in">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
              </div>
              <h1 className="text-2xl font-black text-foreground tracking-tight">
                Bonjour {user?.first_name} 👋
              </h1>
            </div>
          </div>
        </header>

        {/* Weekly Performance - Design premium */}
        <section
          className="relative overflow-hidden rounded-2xl p-5 bg-gradient-to-br from-primary via-primary/95 to-primary/80 shadow-xl shadow-primary/25 animate-slide-up"
          style={{ animationDelay: "0.05s" }}
        >
          {/* Pattern de fond subtil */}
          <div className="absolute inset-0 opacity-[0.08]">
            <div className="absolute inset-0" style={{
              backgroundImage: "radial-gradient(circle at 25% 50%, white 2px, transparent 2px)",
              backgroundSize: "24px 24px",
            }} />
          </div>

          {/* Effet de brillance */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl" />

          <div className="relative space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Activity size={14} className="text-white/70" strokeWidth={2.5} />
                  <p className="text-white/80 text-[10px] font-bold uppercase tracking-widest">
                    Cette semaine
                  </p>
                </div>
                <div className="flex items-baseline gap-2">
                  <p className="text-4xl font-black text-white tracking-tight">
                    {weeklyStats.services}
                  </p>
                  <span className="text-base text-white/90 font-semibold">
                    {weeklyStats.services > 1 ? "prestations" : "prestation"}
                  </span>
                </div>
              </div>
              
              <div className="flex flex-col items-end gap-2">
                <div className={`
                  flex items-center gap-2 px-3.5 py-2 rounded-xl backdrop-blur-xl border shadow-lg
                  ${weeklyStats.isUp 
                    ? "bg-white/20 border-white/30" 
                    : "bg-white/15 border-white/25"
                  }
                `}>
                  {weeklyStats.isUp ? (
                    <TrendingUp size={18} className="text-white" strokeWidth={2.5} />
                  ) : (
                    <TrendingDown size={18} className="text-white" strokeWidth={2.5} />
                  )}
                  <span className="text-white font-black text-base">
                    {weeklyStats.isUp ? "+" : "-"}
                    {weeklyStats.change}%
                  </span>
                </div>
              </div>
            </div>

            <div className="h-px bg-white/20" />

            <div className="flex items-center justify-between text-white/70 text-xs">
              <span className="font-medium">vs semaine dernière</span>
              <span className="font-semibold">
                {weeklyStats.isUp ? "En progression" : "En baisse"}
              </span>
            </div>
          </div>
        </section>

        {/* Quick Actions - Plus visuels */}
        <section
          className="grid grid-cols-3 gap-2.5 animate-slide-up"
          style={{ animationDelay: "0.1s" }}
        >
          <button
            onClick={() => setShowSlotsModal(true)}
            className="group relative overflow-hidden rounded-xl p-4 bg-card border border-border hover:border-primary/50 active:scale-[0.97] transition-all shadow-sm hover:shadow-md"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative flex flex-col items-center gap-2.5">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center group-hover:scale-110 transition-transform shadow-md shadow-primary/10">
                <Plus size={20} className="text-primary" strokeWidth={2.5} />
              </div>
              <span className="text-[11px] font-bold text-foreground">
                Créneaux
              </span>
            </div>
          </button>

          <button
            onClick={() => setShowBlockModal(true)}
            className="group relative overflow-hidden rounded-xl p-4 bg-card border border-border hover:border-destructive/50 active:scale-[0.97] transition-all shadow-sm hover:shadow-md"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-destructive/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative flex flex-col items-center gap-2.5">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-destructive/15 to-destructive/5 flex items-center justify-center group-hover:scale-110 transition-transform shadow-md shadow-destructive/10">
                <Ban size={20} className="text-destructive" strokeWidth={2.5} />
              </div>
              <span className="text-[11px] font-bold text-foreground">
                Bloquer
              </span>
            </div>
          </button>

          <button
            onClick={() => navigate("/pro/calendar")}
            className="group relative overflow-hidden rounded-xl p-4 bg-card border border-border hover:border-primary/50 active:scale-[0.97] transition-all shadow-sm hover:shadow-md"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative flex flex-col items-center gap-2.5">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center group-hover:scale-110 transition-transform shadow-md shadow-primary/10">
                <Eye size={20} className="text-primary" strokeWidth={2.5} />
              </div>
              <span className="text-[11px] font-bold text-foreground">
                Planning
              </span>
            </div>
          </button>
        </section>

        {/* Today's Forecast - Plus visible */}
        <section
          className="relative overflow-hidden rounded-xl p-4 bg-gradient-to-br from-emerald-50 to-emerald-50/30 dark:from-emerald-950/30 dark:to-emerald-950/10 border border-emerald-200/60 dark:border-emerald-800/40 animate-slide-up shadow-sm"
          style={{ animationDelay: "0.15s" }}
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-400/10 rounded-full blur-2xl" />
          
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                <Target size={20} className="text-white" strokeWidth={2.5} />
              </div>
              <div>
                <p className="text-[10px] font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-wider mb-0.5">
                  Prévision du jour
                </p>
                <p className="text-[11px] text-emerald-600/80 dark:text-emerald-500/80">
                  Revenu estimé
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-3xl font-black text-emerald-700 dark:text-emerald-400 tracking-tight">
                {todayForecast.toFixed(2).replace(".", ",")}€
              </p>
            </div>
          </div>
        </section>

        {/* Stats Cards - Plus lisibles */}
        <section
          className="grid grid-cols-2 gap-2.5 animate-slide-up"
          style={{ animationDelay: "0.2s" }}
        >
          <div className="relative overflow-hidden rounded-xl p-4 bg-card border border-border shadow-sm hover:shadow-md transition-shadow">
            <div className="absolute top-0 right-0 w-20 h-20 bg-primary/5 rounded-full blur-2xl" />
            
            <div className="relative space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center">
                  <Calendar size={16} className="text-primary" strokeWidth={2.5} />
                </div>
                <span className="text-[9px] text-muted-foreground font-black uppercase tracking-wider">
                  Taux de remplissage
                </span>
              </div>
              <div>
                <div className="flex items-baseline gap-1.5">
                  <p className="text-3xl font-black text-foreground tracking-tight">
                    {fillRate.toFixed(0)}
                  </p>
                  <span className="text-xl font-black text-primary">%</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5 leading-snug font-medium">
                  De tes créneaux sont réservés
                </p>
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-xl p-4 bg-card border border-border shadow-sm hover:shadow-md transition-shadow">
            <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/5 rounded-full blur-2xl" />
            
            <div className="relative space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-500/15 to-emerald-500/5 flex items-center justify-center">
                  <Users size={16} className="text-emerald-600" strokeWidth={2.5} />
                </div>
                <span className="text-[9px] text-muted-foreground font-black uppercase tracking-wider">
                  Clientes
                </span>
              </div>
              <div>
                <p className="text-3xl font-black text-foreground tracking-tight">
                  {clientsThisWeek}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1.5 leading-snug font-medium">
                  Servies cette semaine
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Upcoming Clients - Plus moderne */}
        <section
          className="space-y-3 animate-slide-up"
          style={{ animationDelay: "0.25s" }}
        >
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-black text-foreground tracking-tight flex items-center gap-2">
              <div className="w-1 h-5 bg-primary rounded-full" />
              Prochaines clientes
            </h2>
            <button
              onClick={() => navigate("/pro/calendar")}
              className="flex items-center gap-1 text-[11px] text-primary font-bold group hover:gap-1.5 transition-all"
            >
              Voir tout
              <ArrowUpRight size={14} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" strokeWidth={2.5} />
            </button>
          </div>
          
          <div className="space-y-2.5">
            {upcomingClients.length === 0 ? (
              <div className="rounded-xl p-8 bg-gradient-to-br from-muted/30 to-muted/10 border-2 border-dashed border-border">
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center">
                    <Calendar size={24} className="text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground mb-1">
                      Aucune cliente prévue
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Les prochains rendez-vous apparaîtront ici
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              upcomingClients.map((client, index) => (
                <button
                  key={client.id}
                  onClick={() => navigate(`/pro/appointments/${client.id}`)}
                  className="w-full rounded-xl p-4 bg-card border border-border hover:border-primary/40 active:scale-[0.98] transition-all shadow-sm hover:shadow-md group"
                  style={{ animationDelay: `${0.3 + index * 0.05}s` }}
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform shadow-lg shadow-primary/25">
                      <span className="text-white font-black text-sm">
                        {client.avatar}
                      </span>
                    </div>
                    
                    <div className="flex-1 min-w-0 text-left">
                      <div className="flex items-center justify-between mb-1.5 gap-2">
                        <h3 className="font-bold text-sm text-foreground truncate">
                          {client.name}
                        </h3>
                        <span className={`
                          flex items-center gap-1 text-[9px] px-2.5 py-1 rounded-full font-bold whitespace-nowrap
                          ${getStatusColor(client.status)}
                        `}>
                          {getStatusIcon(client.status)}
                          {getStatusLabel(client.status)}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate mb-2 font-medium">
                        {client.service}
                      </p>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Clock size={12} className="text-muted-foreground" strokeWidth={2} />
                          <span className="text-[11px] text-muted-foreground font-semibold">
                            {client.time}
                          </span>
                        </div>
                        <div className="flex items-center gap-0.5">
                          <Euro size={14} className="text-primary" strokeWidth={2.5} />
                          <span className="text-sm font-black text-primary">
                            {client.price.toFixed(2).replace(".", ",")}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </section>

        {/* Top Services - Plus visuels */}
        <section
          className="rounded-xl p-4 bg-card border border-border shadow-sm animate-slide-up"
          style={{ animationDelay: "0.3s" }}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-black text-sm text-foreground tracking-tight flex items-center gap-2">
              <div className="w-1 h-5 bg-primary rounded-full" />
              Top prestations
            </h3>
            <Star size={16} className="text-primary" strokeWidth={2} />
          </div>
          
          {topServices.length === 0 ? (
            <div className="rounded-xl p-6 bg-gradient-to-br from-muted/20 to-transparent border-2 border-dashed border-border">
              <p className="text-xs text-muted-foreground text-center font-medium">
                Les données apparaîtront après vos premières prestations
              </p>
            </div>
          ) : (
            <div className="space-y-3.5">
              {topServices.slice(0, 3).map((service, index) => (
                <div key={index} className="group">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-md bg-primary/10 flex items-center justify-center text-[10px] font-black text-primary">
                        {index + 1}
                      </span>
                      <span className="text-xs text-foreground font-bold">
                        {service.name}
                      </span>
                    </div>
                    <span className="text-xs font-black text-primary">
                      {service.percentage}%
                    </span>
                  </div>
                  <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-primary via-primary/90 to-primary/80 rounded-full transition-all duration-1000 ease-out shadow-sm"
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

        {/* Weekly Revenue - Graphique amélioré */}
        <section
          className="rounded-xl p-4 bg-card border border-border shadow-sm animate-slide-up"
          style={{ animationDelay: "0.35s" }}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-black text-sm text-foreground tracking-tight flex items-center gap-2">
              <div className="w-1 h-5 bg-primary rounded-full" />
              Revenus de la semaine
            </h3>
            {totalWeeklyRevenue > 0 && (
              <div className="flex items-center gap-1 text-xs font-black text-primary">
                <Euro size={14} strokeWidth={2.5} />
                {totalWeeklyRevenue.toFixed(0)}
              </div>
            )}
          </div>

          {weeklyRevenue.length === 0 ? (
            <div className="rounded-xl p-8 bg-gradient-to-br from-muted/20 to-transparent border-2 border-dashed border-border">
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center">
                  <Euro size={24} className="text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground mb-1">
                    Aucun revenu enregistré
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Les données apparaîtront après vos premières prestations
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="pt-10 pb-2">
              <div className="flex items-end justify-between gap-2 h-[120px] relative">
                {weeklyRevenue.map((day, index) => {
                  const amount = day.amount ?? 0;
                  const parentHeightPx = 120;
                  const minBarPx = 8;
                  const barPx = maxRevenue > 0
                    ? Math.max((amount / maxRevenue) * parentHeightPx, minBarPx)
                    : minBarPx;
                  const isMax = amount === maxRevenue && amount > 0;
                  const isHovered = hoveredBar === index;

                  return (
                    <div
                      key={index}
                      className="flex-1 flex flex-col items-center gap-2 group relative"
                      onMouseEnter={() => setHoveredBar(index)}
                      onMouseLeave={() => setHoveredBar(null)}
                    >
                      {/* Tooltip amélioré */}
                      <div className={`
                        absolute -top-10 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg 
                        bg-foreground text-background text-[11px] font-black
                        transition-all duration-200 shadow-xl pointer-events-none whitespace-nowrap z-10
                        ${isHovered ? "opacity-100 -top-11 scale-100" : "opacity-0 scale-95"}
                      `}>
                        {amount.toFixed(0)}€
                        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[5px] border-t-foreground" />
                      </div>

                      <div
                        className={`
                          w-full rounded-t-xl transition-all duration-500 cursor-pointer relative overflow-hidden
                          ${isMax
                            ? "bg-gradient-to-t from-primary via-primary/90 to-primary/70 shadow-lg shadow-primary/30 scale-105"
                            : isHovered
                              ? "bg-gradient-to-t from-primary/70 to-primary/40 scale-105"
                              : "bg-gradient-to-t from-muted to-muted/50"
                          }
                        `}
                        style={{
                          height: `${barPx}px`,
                          minHeight: `${minBarPx}px`,
                          maxHeight: `${parentHeightPx}px`,
                        }}
                      >
                        {isMax && (
                          <div className="absolute inset-0 bg-gradient-to-t from-white/20 to-transparent" />
                        )}
                      </div>

                      <span className={`
                        text-[10px] font-bold transition-colors
                        ${isMax || isHovered ? "text-primary" : "text-muted-foreground"}
                      `}>
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

      {/* Modals améliorés */}
      {showSlotsModal && (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-[430px] bg-card rounded-t-3xl p-6 pb-7 shadow-2xl animate-slide-up-modal border-t-2 border-primary/20">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black text-foreground tracking-tight">
                Ajouter des créneaux
              </h3>
              <button
                onClick={() => setShowSlotsModal(false)}
                className="w-10 h-10 rounded-xl bg-muted/70 hover:bg-muted flex items-center justify-center active:scale-95 transition-all"
                aria-label="Fermer"
              >
                <X size={20} className="text-foreground" strokeWidth={2} />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mb-5 leading-relaxed">
              Ouvrez de nouveaux créneaux depuis votre calendrier pour permettre à vos clientes de réserver.
            </p>
            <button
              onClick={() => {
                setShowSlotsModal(false);
                navigate("/pro/calendar");
              }}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-primary to-primary/90 text-white font-bold active:scale-[0.98] transition-all text-sm shadow-lg shadow-primary/25 flex items-center justify-center gap-2"
            >
              <Calendar size={18} strokeWidth={2.5} />
              Aller au calendrier
            </button>
          </div>
        </div>
      )}

      {showBlockModal && (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-[430px] bg-card rounded-t-3xl p-6 pb-7 shadow-2xl animate-slide-up-modal border-t-2 border-destructive/20">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black text-foreground tracking-tight">
                Bloquer une journée
              </h3>
              <button
                onClick={() => setShowBlockModal(false)}
                className="w-10 h-10 rounded-xl bg-muted/70 hover:bg-muted flex items-center justify-center active:scale-95 transition-all"
                aria-label="Fermer"
              >
                <X size={20} className="text-foreground" strokeWidth={2} />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mb-5 leading-relaxed">
              Bloquez une journée complète pour ne plus recevoir de nouvelles réservations. Vos rendez-vous existants seront maintenus.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowBlockModal(false)}
                className="flex-1 py-3.5 rounded-xl bg-muted hover:bg-muted/80 text-foreground font-bold active:scale-[0.98] transition-all text-sm"
              >
                Annuler
              </button>
              <button
                onClick={() => {
                  setToastMessage("✓ Journée bloquée avec succès");
                  setShowBlockModal(false);
                  setTimeout(() => setToastMessage(null), 3000);
                }}
                className="flex-1 py-3.5 rounded-xl bg-gradient-to-r from-destructive to-destructive/90 text-white font-bold active:scale-[0.98] transition-all text-sm shadow-lg shadow-destructive/25 flex items-center justify-center gap-2"
              >
                <Ban size={18} strokeWidth={2.5} />
                Bloquer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast amélioré */}
      {toastMessage && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-foreground text-background py-3 px-5 rounded-xl shadow-2xl animate-fade-in-out z-[9999] font-bold text-xs flex items-center gap-2">
          {toastMessage}
        </div>
      )}

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes slide-up {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes slide-up-modal {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }

        @keyframes fade-in-out {
          0%, 100% { opacity: 0; transform: translate(-50%, -12px); }
          10%, 90% { opacity: 1; transform: translate(-50%, 0); }
        }

        .animate-fade-in {
          animation: fade-in 0.4s ease-out;
        }

        .animate-slide-up {
          animation: slide-up 0.5s ease-out backwards;
        }

        .animate-slide-up-modal {
          animation: slide-up-modal 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .animate-fade-in-out {
          animation: fade-in-out 3s ease-in-out;
        }
      `}</style>
    </MobileLayout>
  );
};

export default ProDashboard;
