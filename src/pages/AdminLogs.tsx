import { useState, useEffect } from "react";
import {
  Activity,
  User,
  Calendar,
  DollarSign,
  AlertCircle,
  Info,
  CheckCircle,
  XCircle,
  Search,
  Filter,
  Download,
  Clock,
} from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

interface Log {
  id: number;
  action: string;
  description: string;
  user_name?: string;
  user_id?: number;
  type: "info" | "success" | "warning" | "error";
  ip_address?: string;
  created_at: string;
}

const AdminLogs = () => {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("today");

  useEffect(() => {
    fetchLogs();
  }, [dateFilter]);

  const fetchLogs = async () => {
    try {
      const token = localStorage.getItem("auth_token");
      const response = await fetch(`${API_URL}/api/admin/logs?date=${dateFilter}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setLogs(data.data || []);
      }
    } catch (error) {
      toast.error("Erreur lors du chargement des logs");
    } finally {
      setLoading(false);
    }
  };

  const typeConfig: any = {
    info: { icon: Info, color: "blue", label: "Info" },
    success: { icon: CheckCircle, color: "green", label: "Succès" },
    warning: { icon: AlertCircle, color: "orange", label: "Attention" },
    error: { icon: XCircle, color: "red", label: "Erreur" },
  };

  const filteredLogs = logs.filter((log) => {
    const matchesType = typeFilter === "all" || log.type === typeFilter;
    const matchesSearch =
      log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.user_name?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesSearch;
  });

  const stats = {
    total: logs.length,
    info: logs.filter((l) => l.type === "info").length,
    success: logs.filter((l) => l.type === "success").length,
    warning: logs.filter((l) => l.type === "warning").length,
    error: logs.filter((l) => l.type === "error").length,
  };

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
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Logs Système</h1>
          <p className="text-gray-600">{filteredLogs.length} événement(s)</p>
        </div>

        <button className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-primary to-pink-500 text-white font-semibold flex items-center gap-2 hover:shadow-lg transition-shadow">
          <Download size={18} />
          Exporter
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-4">
        <div className="bg-white rounded-xl p-4 border-2 border-gray-100">
          <p className="text-sm text-gray-600 mb-1">Total</p>
          <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
        </div>
        <div className="bg-blue-50 rounded-xl p-4 border-2 border-blue-100">
          <p className="text-sm text-blue-600 mb-1">Info</p>
          <p className="text-2xl font-bold text-blue-900">{stats.info}</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4 border-2 border-green-100">
          <p className="text-sm text-green-600 mb-1">Succès</p>
          <p className="text-2xl font-bold text-green-900">{stats.success}</p>
        </div>
        <div className="bg-orange-50 rounded-xl p-4 border-2 border-orange-100">
          <p className="text-sm text-orange-600 mb-1">Attention</p>
          <p className="text-2xl font-bold text-orange-900">{stats.warning}</p>
        </div>
        <div className="bg-red-50 rounded-xl p-4 border-2 border-red-100">
          <p className="text-sm text-red-600 mb-1">Erreurs</p>
          <p className="text-2xl font-bold text-red-900">{stats.error}</p>
        </div>
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-2xl p-6 border-2 border-gray-100">
        <div className="grid grid-cols-3 gap-4">
          <div className="relative">
            <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher..."
              className="w-full pl-12 pr-4 py-3 rounded-xl border-2 border-gray-200 bg-gray-50 focus:border-primary focus:bg-white outline-none transition-all"
            />
          </div>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-4 py-3 rounded-xl border-2 border-gray-200 bg-gray-50 focus:border-primary focus:bg-white outline-none font-semibold"
          >
            <option value="all">Tous les types</option>
            <option value="info">Info</option>
            <option value="success">Succès</option>
            <option value="warning">Attention</option>
            <option value="error">Erreur</option>
          </select>

          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="px-4 py-3 rounded-xl border-2 border-gray-200 bg-gray-50 focus:border-primary focus:bg-white outline-none font-semibold"
          >
            <option value="today">Aujourd'hui</option>
            <option value="week">Cette semaine</option>
            <option value="month">Ce mois</option>
            <option value="all">Tout</option>
          </select>
        </div>
      </div>

      {/* Logs Timeline */}
      <div className="bg-white rounded-2xl p-6 border-2 border-gray-100">
        <div className="space-y-4">
          {filteredLogs.map((log) => {
            const config = typeConfig[log.type];
            const Icon = config.icon;

            return (
              <motion.div
                key={log.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-start gap-4 p-4 rounded-xl hover:bg-gray-50 transition-colors"
              >
                <div className={`w-10 h-10 rounded-xl bg-${config.color}-100 flex items-center justify-center flex-shrink-0`}>
                  <Icon size={20} className={`text-${config.color}-600`} />
                </div>

                <div className="flex-1">
                  <div className="flex items-start justify-between mb-1">
                    <h3 className="font-semibold text-gray-900">{log.action}</h3>
                    <span className={`px-2 py-1 rounded-lg text-xs font-bold bg-${config.color}-100 text-${config.color}-700`}>
                      {config.label}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">{log.description}</p>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    {log.user_name && (
                      <div className="flex items-center gap-1">
                        <User size={12} />
                        {log.user_name}
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <Clock size={12} />
                      {new Date(log.created_at).toLocaleString("fr-FR")}
                    </div>
                    {log.ip_address && (
                      <div className="flex items-center gap-1">
                        <Activity size={12} />
                        {log.ip_address}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}

          {filteredLogs.length === 0 && (
            <div className="text-center py-12">
              <Activity size={48} className="text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">Aucun log trouvé</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminLogs;
