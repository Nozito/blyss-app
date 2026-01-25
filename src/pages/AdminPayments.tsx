import { useState, useEffect } from "react";
import {
  DollarSign,
  CreditCard,
  TrendingUp,
  TrendingDown,
  Download,
  Search,
  Filter,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  RefreshCw,
} from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

interface Transaction {
  id: number;
  booking_id: number;
  client_name: string;
  pro_name: string;
  amount: number;
  fee: number;
  net_amount: number;
  status: "success" | "pending" | "failed" | "refunded";
  payment_method: "card" | "paypal" | "stripe";
  created_at: string;
}

const AdminPayments = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    fetchTransactions();
  }, []);

  const fetchTransactions = async () => {
    try {
      const token = localStorage.getItem("auth_token");
      const response = await fetch(`${API_URL}/api/admin/payments`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setTransactions(data.data || []);
      }
    } catch (error) {
      toast.error("Erreur lors du chargement des paiements");
    } finally {
      setLoading(false);
    }
  };

  const stats = {
    totalRevenue: transactions
      .filter((t) => t.status === "success")
      .reduce((sum, t) => sum + t.amount, 0),
    totalFees: transactions
      .filter((t) => t.status === "success")
      .reduce((sum, t) => sum + t.fee, 0),
    netRevenue: transactions
      .filter((t) => t.status === "success")
      .reduce((sum, t) => sum + t.net_amount, 0),
    pendingCount: transactions.filter((t) => t.status === "pending").length,
  };

  const statusConfig: any = {
    success: { label: "Réussi", icon: CheckCircle, color: "green" },
    pending: { label: "En attente", icon: Clock, color: "orange" },
    failed: { label: "Échoué", icon: XCircle, color: "red" },
    refunded: { label: "Remboursé", icon: RefreshCw, color: "blue" },
  };

  const filteredTransactions = transactions.filter((t) => {
    const matchesStatus = statusFilter === "all" || t.status === statusFilter;
    const matchesSearch =
      t.client_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.pro_name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

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
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Paiements</h1>
          <p className="text-gray-600">{filteredTransactions.length} transaction(s)</p>
        </div>

        <button className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-primary to-pink-500 text-white font-semibold flex items-center gap-2 hover:shadow-lg transition-shadow">
          <Download size={18} />
          Rapport Financier
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl p-6 text-white"
        >
          <div className="flex items-center justify-between mb-4">
            <DollarSign size={32} />
            <TrendingUp size={20} />
          </div>
          <p className="text-3xl font-bold">{stats.totalRevenue.toFixed(2)}€</p>
          <p className="text-sm opacity-90 mt-1">Revenus Total</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl p-6 border-2 border-gray-100"
        >
          <div className="flex items-center justify-between mb-2">
            <CreditCard size={20} className="text-blue-600" />
            <span className="text-xs font-bold text-gray-500">FRAIS</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">{stats.totalFees.toFixed(2)}€</p>
          <p className="text-sm text-gray-600 mt-1">Commissions</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-2xl p-6 border-2 border-gray-100"
        >
          <div className="flex items-center justify-between mb-2">
            <TrendingUp size={20} className="text-green-600" />
            <span className="text-xs font-bold text-gray-500">NET</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">{stats.netRevenue.toFixed(2)}€</p>
          <p className="text-sm text-gray-600 mt-1">Revenu Net</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-2xl p-6 border-2 border-gray-100"
        >
          <div className="flex items-center justify-between mb-2">
            <Clock size={20} className="text-orange-600" />
            <span className="text-xs font-bold text-gray-500">EN ATTENTE</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">{stats.pendingCount}</p>
          <p className="text-sm text-gray-600 mt-1">Paiements</p>
        </motion.div>
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-2xl p-6 border-2 border-gray-100">
        <div className="flex gap-4">
          <div className="relative flex-1">
            <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher par nom..."
              className="w-full pl-12 pr-4 py-3 rounded-xl border-2 border-gray-200 bg-gray-50 focus:border-primary focus:bg-white outline-none transition-all"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-3 rounded-xl border-2 border-gray-200 bg-gray-50 focus:border-primary focus:bg-white outline-none font-semibold"
          >
            <option value="all">Tous les statuts</option>
            <option value="success">Réussi</option>
            <option value="pending">En attente</option>
            <option value="failed">Échoué</option>
            <option value="refunded">Remboursé</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border-2 border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b-2 border-gray-100">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase">ID</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase">Client</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase">Pro</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase">Montant</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase">Frais</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase">Net</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase">Méthode</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase">Statut</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase">Date</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredTransactions.map((transaction) => {
                const status = statusConfig[transaction.status];
                const StatusIcon = status.icon;

                return (
                  <tr key={transaction.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <span className="font-mono text-sm text-gray-600">#{transaction.id}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-semibold text-gray-900">{transaction.client_name}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-700">{transaction.pro_name}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-bold text-gray-900">{transaction.amount.toFixed(2)}€</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-600">-{transaction.fee.toFixed(2)}€</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-bold text-green-600">{transaction.net_amount.toFixed(2)}€</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <CreditCard size={16} className="text-gray-400" />
                        <span className="text-sm capitalize">{transaction.payment_method}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className={`flex items-center gap-2 text-${status.color}-600`}>
                        <StatusIcon size={16} />
                        <span className="text-sm font-semibold">{status.label}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-600">
                        {new Date(transaction.created_at).toLocaleDateString("fr-FR")}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <button className="w-8 h-8 rounded-lg bg-blue-100 hover:bg-blue-200 flex items-center justify-center transition-colors">
                        <Eye size={16} className="text-blue-600" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminPayments;