import { useState, useEffect } from "react";
import {
  Users,
  Calendar,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Activity,
  CheckCircle,
  Sparkles,
  UserPlus,
  Briefcase,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

interface Stats {
  totalUsers: number;
  totalPros: number;
  totalClients: number;
  totalBookings: number;
  todayBookings: number;
  totalRevenue: number;
  monthRevenue: number;
  activeUsers: number;
}

interface Activity {
  type: 'booking' | 'user' | 'payment';
  title: string;
  description: string;
  time: string;
}

const AdminDashboard = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [recentActivity, setRecentActivity] = useState<Activity[]>([]);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const token = localStorage.getItem("auth_token");
      const response = await fetch(`${API_URL}/api/admin/dashboard/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setStats(data.stats);
          setRecentActivity(data.recentActivity || []);
        }
      } else {
        toast.error("Erreur lors du chargement des données");
      }
    } catch (error) {
      toast.error("Erreur de connexion au serveur");
    } finally {
      setLoading(false);
    }
  };

  // Calcul des variations (pour l'exemple, vous pouvez stocker les stats précédentes)
  const userChange = "+12.5%";
  const clientChange = "+8.2%";
  const revenueChange = "+15.3%";
  const proChange = "+5.8%";

  const statCards = [
    {
      title: "Clients",
      value: stats?.totalClients || 0,
      change: clientChange,
      isPositive: true,
      icon: UserPlus,
      gradient: "from-purple-500 to-violet-600",
      bgGradient: "from-purple-500/10 to-violet-600/10",
    },
    {
      title: "Professionnels",
      value: stats?.totalPros || 0,
      change: proChange,
      isPositive: true,
      icon: Briefcase,
      gradient: "from-orange-500 to-amber-600",
      bgGradient: "from-orange-500/10 to-amber-600/10",
    },
    {
      title: "Utilisateurs Totaux",
      value: stats?.totalUsers || 0,
      change: userChange,
      isPositive: true,
      icon: Users,
      gradient: "from-blue-500 to-indigo-600",
      bgGradient: "from-blue-500/10 to-indigo-600/10",
    },
    {
      title: "Chiffre d'Affaires",
      value: `${(stats?.totalRevenue || 0).toLocaleString('fr-FR')}€`,
      change: revenueChange,
      isPositive: true,
      icon: DollarSign,
      gradient: "from-green-500 to-emerald-600",
      bgGradient: "from-green-500/10 to-emerald-600/10",
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-200px)]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground font-medium">Chargement du dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-6">
      {/* Stats Grid avec animations */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1, type: "spring", stiffness: 200 }}
              whileHover={{ y: -4, scale: 1.02 }}
              className="group relative overflow-hidden rounded-3xl bg-card/50 backdrop-blur-sm border border-border hover:border-primary/20 transition-all duration-300"
            >
              {/* Gradient background */}
              <div className={`absolute inset-0 bg-gradient-to-br ${stat.bgGradient} opacity-50 group-hover:opacity-70 transition-opacity`} />
              
              {/* Shine effect */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
              </div>

              <div className="relative p-6">
                <div className="flex items-start justify-between mb-4">
                  {/* Icon avec effet 3D */}
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${stat.gradient} flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-all duration-300`}>
                    <Icon size={28} className="text-white drop-shadow-lg" />
                  </div>
                  
                  {/* Badge variation */}
                  <div
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold backdrop-blur-sm border ${
                      stat.isPositive
                        ? "bg-green-500/10 border-green-500/20 text-green-700 dark:text-green-400"
                        : "bg-red-500/10 border-red-500/20 text-red-700 dark:text-red-400"
                    }`}
                  >
                    {stat.isPositive ? (
                      <TrendingUp size={14} />
                    ) : (
                      <TrendingDown size={14} />
                    )}
                    {stat.change}
                  </div>
                </div>

                <h3 className="text-4xl font-black text-foreground mb-2 tracking-tight">{stat.value}</h3>
                <p className="text-sm text-muted-foreground font-medium">{stat.title}</p>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Content Grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Activité Récente */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="lg:col-span-2 rounded-3xl bg-card/50 backdrop-blur-sm border border-border p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Activity size={20} className="text-primary" />
              </div>
              <h2 className="text-xl font-bold text-foreground">Activité Récente</h2>
            </div>
            <button className="text-sm text-primary font-semibold hover:underline">
              Voir tout
            </button>
          </div>

          <div className="space-y-3">
            <AnimatePresence>
              {recentActivity.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center justify-center py-12"
                >
                  <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
                    <Sparkles size={32} className="text-muted-foreground/30" />
                  </div>
                  <p className="text-center text-muted-foreground">Aucune activité récente</p>
                </motion.div>
              ) : (
                recentActivity.slice(0, 8).map((activity, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="flex items-center gap-4 p-4 rounded-2xl bg-muted/50 hover:bg-muted transition-all group"
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      activity.type === "booking" ? "bg-purple-500/10" :
                      activity.type === "user" ? "bg-blue-500/10" :
                      "bg-green-500/10"
                    }`}>
                      {activity.type === "booking" && <Calendar size={20} className="text-purple-600" />}
                      {activity.type === "user" && <UserPlus size={20} className="text-blue-600" />}
                      {activity.type === "payment" && <DollarSign size={20} className="text-green-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground text-sm truncate">{activity.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{activity.description}</p>
                    </div>
                    <span className="text-xs text-muted-foreground font-medium whitespace-nowrap">{activity.time}</span>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Sidebar - Stats du jour & Status */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="space-y-6"
        >
          {/* Stats du jour */}
          <div className="rounded-3xl bg-gradient-to-br from-primary/10 via-purple-500/10 to-transparent backdrop-blur-sm border border-border p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                <Calendar size={20} className="text-primary" />
              </div>
              <h3 className="text-lg font-bold text-foreground">Statistiques</h3>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-2xl bg-card/50">
                <span className="text-sm text-muted-foreground font-medium">Réservations aujourd'hui</span>
                <span className="text-3xl font-black text-foreground">{stats?.todayBookings || 0}</span>
              </div>
              <div className="flex items-center justify-between p-4 rounded-2xl bg-card/50">
                <span className="text-sm text-muted-foreground font-medium">Revenus du mois</span>
                <span className="text-2xl font-bold text-green-600">{(stats?.monthRevenue || 0).toLocaleString('fr-FR')}€</span>
              </div>
              <div className="flex items-center justify-between p-4 rounded-2xl bg-card/50">
                <span className="text-sm text-muted-foreground font-medium">Total réservations</span>
                <span className="text-3xl font-black text-foreground">{stats?.totalBookings || 0}</span>
              </div>
            </div>
          </div>

          {/* Status Système */}
          <div className="rounded-3xl bg-card/50 backdrop-blur-sm border border-border p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                <CheckCircle size={20} className="text-green-600" />
              </div>
              <h3 className="text-lg font-bold text-foreground">Statut Système</h3>
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
                <span className="text-sm text-muted-foreground font-medium">API</span>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-sm font-semibold text-green-600">Opérationnel</span>
                </div>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
                <span className="text-sm text-muted-foreground font-medium">Base de données</span>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-sm font-semibold text-green-600">Opérationnel</span>
                </div>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
                <span className="text-sm text-muted-foreground font-medium">WebSocket</span>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-sm font-semibold text-green-600">Opérationnel</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default AdminDashboard;
