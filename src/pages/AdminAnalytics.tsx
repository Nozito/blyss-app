import { useState, useEffect } from "react";
import {
  TrendingUp,
  Users,
  Calendar,
  DollarSign,
  BarChart3,
  PieChart,
  Activity,
  Download,
} from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

const AdminAnalytics = () => {
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState("week");
  const [analyticsData, setAnalyticsData] = useState<any>(null);

  useEffect(() => {
    fetchAnalytics();
  }, [timeRange]);

  const fetchAnalytics = async () => {
    try {
      const token = localStorage.getItem("auth_token");
      const response = await fetch(`${API_URL}/api/admin/analytics?range=${timeRange}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setAnalyticsData(data);
      }
    } catch (error) {
      toast.error("Erreur lors du chargement des analytics");
    } finally {
      setLoading(false);
    }
  };

  // Données factices pour la démo
  const stats = {
    totalUsers: 1234,
    userGrowth: "+12.5%",
    totalBookings: 5678,
    bookingGrowth: "+8.2%",
    totalRevenue: 45678,
    revenueGrowth: "+15.3%",
    avgBookingValue: 45,
    avgGrowth: "+3.1%",
  };

  const topServices = [
    { name: "Pose complète", bookings: 234, revenue: 10530 },
    { name: "Remplissage", bookings: 189, revenue: 7560 },
    { name: "Dépose", bookings: 145, revenue: 2900 },
    { name: "Nail art", bookings: 98, revenue: 2940 },
  ];

  const topPros = [
    { name: "Marie Dubois", bookings: 156, revenue: 7020, rating: 4.9 },
    { name: "Sophie Martin", bookings: 142, revenue: 6390, rating: 4.8 },
    { name: "Laura Bernard", bookings: 128, revenue: 5760, rating: 4.7 },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Analytics</h1>
          <p className="text-gray-600">Vue d'ensemble des performances</p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="px-4 py-2.5 rounded-xl border-2 border-gray-200 bg-white font-semibold outline-none focus:border-primary transition-all"
          >
            <option value="week">Cette semaine</option>
            <option value="month">Ce mois</option>
            <option value="quarter">Ce trimestre</option>
            <option value="year">Cette année</option>
          </select>

          <button className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-primary to-pink-500 text-white font-semibold flex items-center gap-2 hover:shadow-lg transition-shadow">
            <Download size={18} />
            Exporter
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          {
            title: "Utilisateurs",
            value: stats.totalUsers,
            change: stats.userGrowth,
            icon: Users,
            gradient: "from-blue-500 to-indigo-600",
          },
          {
            title: "Réservations",
            value: stats.totalBookings,
            change: stats.bookingGrowth,
            icon: Calendar,
            gradient: "from-purple-500 to-violet-600",
          },
          {
            title: "Chiffre d'Affaires",
            value: `${stats.totalRevenue}€`,
            change: stats.revenueGrowth,
            icon: DollarSign,
            gradient: "from-green-500 to-emerald-600",
          },
          {
            title: "Panier Moyen",
            value: `${stats.avgBookingValue}€`,
            change: stats.avgGrowth,
            icon: TrendingUp,
            gradient: "from-orange-500 to-amber-600",
          },
        ].map((stat, index) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`bg-gradient-to-br ${stat.gradient} rounded-2xl p-6 text-white`}
            >
              <div className="flex items-start justify-between mb-4">
                <Icon size={32} />
                <span className="px-2 py-1 rounded-lg bg-white/20 text-xs font-bold">
                  {stat.change}
                </span>
              </div>
              <p className="text-3xl font-bold mb-1">{stat.value}</p>
              <p className="text-sm opacity-90">{stat.title}</p>
            </motion.div>
          );
        })}
      </div>

      {/* Charts Grid */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Top Services */}
        <div className="bg-white rounded-2xl p-6 border-2 border-gray-100">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900">Services Populaires</h2>
            <BarChart3 size={20} className="text-gray-400" />
          </div>

          <div className="space-y-4">
            {topServices.map((service, index) => (
              <div key={index} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-gray-900">{service.name}</span>
                  <span className="text-gray-600">{service.bookings} réservations</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-primary to-pink-500 rounded-full"
                      style={{ width: `${(service.bookings / topServices[0].bookings) * 100}%` }}
                    />
                  </div>
                  <span className="font-bold text-gray-900 text-sm">{service.revenue}€</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Pros */}
        <div className="bg-white rounded-2xl p-6 border-2 border-gray-100">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900">Top Professionnels</h2>
            <Activity size={20} className="text-gray-400" />
          </div>

          <div className="space-y-4">
            {topPros.map((pro, index) => (
              <div
                key={index}
                className="flex items-center gap-4 p-4 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-pink-500 flex items-center justify-center text-white font-bold text-lg">
                  {index + 1}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-900">{pro.name}</p>
                  <p className="text-sm text-gray-600">{pro.bookings} réservations</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-gray-900">{pro.revenue}€</p>
                  <p className="text-sm text-yellow-600">★ {pro.rating}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Graphique temporel (placeholder) */}
      <div className="bg-white rounded-2xl p-6 border-2 border-gray-100">
        <h2 className="text-xl font-bold text-gray-900 mb-6">Évolution du Chiffre d'Affaires</h2>
        <div className="h-64 flex items-center justify-center bg-gray-50 rounded-xl">
          <p className="text-gray-500">Graphique à implémenter avec Chart.js ou Recharts</p>
        </div>
      </div>
    </div>
  );
};

export default AdminAnalytics;
