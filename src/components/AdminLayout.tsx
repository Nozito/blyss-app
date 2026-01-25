import { useState, useEffect } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Calendar,
  Bell,
  DollarSign,
  BarChart3,
  FileText,
  Menu,
  X,
  Search,
  LogOut,
  Shield,
  ChevronLeft,
  Zap,
  CheckCircle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import logo from "@/assets/logo.png";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

interface DashboardCounts {
  totalUsers: number;
  totalBookings: number;
  unreadNotifications: number;
}

interface Notification {
  id: number;
  type: 'success' | 'error' | 'info';
  message: string;
}

const AdminLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [counts, setCounts] = useState<DashboardCounts>({
    totalUsers: 0,
    totalBookings: 0,
    unreadNotifications: 0,
  });
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [nextNotifId, setNextNotifId] = useState(1);

  const showNotification = (type: 'success' | 'error' | 'info', message: string) => {
    const id = nextNotifId;
    setNextNotifId(id + 1);
    setNotifications(prev => [...prev, { id, type, message }]);
    
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 3000);
  };

  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const token = localStorage.getItem("auth_token");
        const response = await fetch(`${API_URL}/api/admin/dashboard/counts`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            setCounts(data.counts);
          }
        }
      } catch (error) {
        console.error("Error fetching counts:", error);
      }
    };

    fetchCounts();
    const interval = setInterval(fetchCounts, 30000);
    return () => clearInterval(interval);
  }, []);

  const menuItems = [
    { 
      icon: LayoutDashboard, 
      label: "Dashboard", 
      path: "/admin/dashboard", 
      badge: null,
      shortcut: "⌘D"
    },
    { 
      icon: Users, 
      label: "Utilisateurs", 
      path: "/admin/users", 
      badge: counts.totalUsers || null,
      shortcut: "⌘U"
    },
    { 
      icon: Calendar, 
      label: "Réservations", 
      path: "/admin/bookings", 
      badge: counts.totalBookings || null,
      shortcut: "⌘R"
    },
    { 
      icon: Bell, 
      label: "Notifications", 
      path: "/admin/notifications", 
      badge: counts.unreadNotifications || null,
      pulse: counts.unreadNotifications > 0,
      shortcut: "⌘N"
    },
    { 
      icon: DollarSign, 
      label: "Paiements", 
      path: "/admin/payments", 
      badge: null,
      shortcut: "⌘P"
    },
    { 
      icon: BarChart3, 
      label: "Analytics", 
      path: "/admin/analytics", 
      badge: null,
      shortcut: "⌘A"
    },
    { 
      icon: FileText, 
      label: "Logs", 
      path: "/admin/logs", 
      badge: null,
      shortcut: "⌘L"
    },
  ];

  const isActive = (path: string) => location.pathname === path;

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (mobile) setSidebarOpen(false);
      else setSidebarOpen(true);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleLogout = () => {
    logout();
    showNotification('success', 'Déconnexion réussie');
    setTimeout(() => navigate("/"), 500);
  };

  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50 overflow-hidden">
      {/* Notifications flottantes */}
      <div className="fixed top-24 right-6 z-[60] space-y-2 w-80 max-w-[calc(100vw-3rem)]">
        <AnimatePresence>
          {notifications.map((notif) => {
            const icons = { 
              success: CheckCircle, 
              error: X, 
              info: Bell 
            };
            const colors = {
              success: 'bg-green-50 border-green-200 text-green-800',
              error: 'bg-red-50 border-red-200 text-red-800',
              info: 'bg-blue-50 border-blue-200 text-blue-800',
            };
            const iconColors = {
              success: 'text-green-600',
              error: 'text-red-600',
              info: 'text-blue-600',
            };
            
            const Icon = icons[notif.type];
            
            return (
              <motion.div
                key={notif.id}
                initial={{ opacity: 0, y: -20, x: 100, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 100, scale: 0.8 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className={`flex items-center gap-3 px-4 py-3 rounded-2xl border-2 shadow-lg backdrop-blur-sm ${colors[notif.type]}`}
              >
                <Icon size={20} className={iconColors[notif.type]} strokeWidth={2.5} />
                <p className="flex-1 font-bold text-sm">{notif.message}</p>
                <motion.button
                  whileHover={{ scale: 1.1, rotate: 90 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setNotifications(prev => prev.filter(n => n.id !== notif.id))}
                  className="w-6 h-6 rounded-lg hover:bg-black/5 flex items-center justify-center transition-colors"
                >
                  <X size={14} />
                </motion.button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Overlay mobile */}
      <AnimatePresence>
        {isMobile && sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar Ultra Premium */}
      <motion.aside
        initial={false}
        animate={{
          width: sidebarOpen ? (isMobile ? "85%" : 280) : (isMobile ? 0 : 80),
        }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        className={`bg-white/80 backdrop-blur-xl border-r border-gray-200/50 flex flex-col shadow-xl relative z-50 ${
          isMobile ? "fixed left-0 top-0 bottom-0" : ""
        }`}
      >
        {/* Gradient subtil */}
        <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.01] to-transparent pointer-events-none" />

        {/* Header épuré */}
        <div className="h-20 flex items-center justify-between px-5 border-b border-gray-100/50 relative">
          <AnimatePresence mode="wait">
            {sidebarOpen ? (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-3"
              >
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="relative"
                >
                  <img
                    src={logo}
                    alt="Blyss"
                    className="w-10 h-10 rounded-xl object-cover"
                  />
                  <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-white" />
                </motion.div>
                <div>
                  <h1 className="text-base font-black text-gray-900 tracking-tight">Blyss Admin</h1>
                  <p className="text-[9px] text-gray-500 font-semibold uppercase tracking-widest">Control Center</p>
                </div>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.15 }}
                className="mx-auto relative"
              >
                <img
                  src={logo}
                  alt="Blyss"
                  className="w-10 h-10 rounded-xl object-cover"
                />
                <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-500 border-2 border-white" />
              </motion.div>
            )}
          </AnimatePresence>

          {!isMobile && (
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors group"
            >
              <motion.div 
                animate={{ rotate: sidebarOpen ? 0 : 180 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronLeft size={16} className="text-gray-500 group-hover:text-gray-900 transition-colors" />
              </motion.div>
            </motion.button>
          )}
        </div>

        {/* Navigation style Twitter/Linear */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
          {menuItems.map((item, index) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            const isHovered = hoveredItem === item.path;

            return (
              <div key={item.path} className="relative">
                <motion.button
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.02 }}
                  onClick={() => {
                    navigate(item.path);
                    if (isMobile) setSidebarOpen(false);
                  }}
                  onHoverStart={() => setHoveredItem(item.path)}
                  onHoverEnd={() => setHoveredItem(null)}
                  whileTap={{ scale: 0.97 }}
                  className={`w-full flex items-center ${sidebarOpen ? 'gap-4 px-4' : 'justify-center px-0'} py-3.5 rounded-xl transition-all duration-150 relative group ${
                    active
                      ? "bg-primary text-white shadow-lg shadow-primary/20"
                      : "hover:bg-gray-100 text-gray-700"
                  }`}
                >
                  {/* Indicateur actif minimaliste */}
                  {active && (
                    <motion.div
                      layoutId="activeIndicator"
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-white rounded-r-full"
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}

                  {/* Icône avec scale subtil */}
                  <motion.div 
                    animate={{ 
                      scale: active ? 1.05 : 1,
                      rotate: active && isHovered ? [0, -5, 5, 0] : 0
                    }}
                    transition={{ duration: 0.3 }}
                  >
                    <Icon 
                      size={21} 
                      className={`${active ? "text-white" : "text-gray-600 group-hover:text-gray-900"} transition-colors`}
                      strokeWidth={active ? 2.5 : 2}
                    />
                  </motion.div>

                  {/* Label avec tooltip au hover */}
                  {sidebarOpen && (
                    <motion.div
                      initial={{ opacity: 0, x: -5 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.15 }}
                      className="flex-1 flex items-center justify-between"
                    >
                      <span className={`text-sm font-bold tracking-tight ${active ? "text-white" : "text-gray-900"}`}>
                        {item.label}
                      </span>

                      {/* Badge ou shortcut */}
                      {item.badge ? (
                        <motion.span
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          whileHover={{ scale: 1.1 }}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-black ${
                            active 
                              ? "bg-white/20 text-white" 
                              : "bg-gray-200 text-gray-700"
                          }`}
                        >
                          {item.badge > 999 ? '999+' : item.badge}
                        </motion.span>
                      ) : (
                        <span className={`text-[10px] font-medium ${
                          active ? "text-white/60" : "text-gray-400"
                        } ${isHovered ? 'opacity-100' : 'opacity-0'} transition-opacity`}>
                          {item.shortcut}
                        </span>
                      )}
                    </motion.div>
                  )}

                  {/* Badge pulse quand collapsed */}
                  {!sidebarOpen && item.badge && (
                    <div className="absolute top-2 right-2">
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className={`w-2 h-2 rounded-full ${
                          active ? "bg-white" : "bg-primary"
                        } ${item.pulse ? 'animate-pulse' : ''}`}
                      />
                    </div>
                  )}
                </motion.button>

                {/* Tooltip quand sidebar fermé */}
                <AnimatePresence>
                  {!sidebarOpen && isHovered && (
                    <motion.div
                      initial={{ opacity: 0, x: -10, scale: 0.95 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      exit={{ opacity: 0, x: -10, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className="fixed left-20 px-3 py-1.5 bg-gray-900 text-white text-xs font-semibold rounded-lg shadow-xl pointer-events-none whitespace-nowrap z-[100]"
                      style={{
                        top: `calc(${80 + index * 60}px)`,
                      }}
                    >
                      {item.label}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </nav>

        {/* User Profile minimaliste */}
        <div className="p-4 border-t border-gray-100/50">
          <motion.div
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={`flex items-center ${sidebarOpen ? 'gap-3' : 'justify-center'} p-3 rounded-xl hover:bg-gray-50 transition-all cursor-pointer group`}
          >
            <div className="relative flex-shrink-0">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-pink-500 flex items-center justify-center text-white font-bold text-sm shadow-sm">
                {user?.first_name?.[0]}
                {user?.last_name?.[0]}
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-green-500 border-2 border-white flex items-center justify-center">
                <Zap size={7} className="text-white" fill="white" />
              </div>
            </div>

            {sidebarOpen && (
              <motion.div
                initial={{ opacity: 0, x: -5 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex-1 min-w-0"
              >
                <p className="font-bold text-sm text-gray-900 truncate">
                  {user?.first_name} {user?.last_name}
                </p>
                <div className="flex items-center gap-1">
                  <Shield size={10} className="text-primary" />
                  <p className="text-[10px] text-gray-500 font-semibold">Admin</p>
                </div>
              </motion.div>
            )}
          </motion.div>

          {sidebarOpen && (
            <motion.button
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleLogout}
              className="w-full mt-2 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 font-bold text-sm transition-all group"
            >
              <LogOut size={16} className="group-hover:-translate-x-0.5 transition-transform" />
              Déconnexion
            </motion.button>
          )}
        </div>
      </motion.aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header épuré */}
        <header className="h-16 bg-white/80 backdrop-blur-xl border-b border-gray-200/50 flex items-center justify-between px-6">
          {isMobile && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setSidebarOpen(true)}
              className="w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
            >
              <Menu size={18} className="text-gray-700" />
            </motion.button>
          )}

          <div className="flex-1 max-w-xl mx-auto">
            <div className="relative group">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-hover:text-gray-600 transition-colors" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher... (⌘K)"
                className="w-full pl-10 pr-4 py-2 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-primary outline-none transition-all text-sm font-medium placeholder:text-gray-400"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 ml-4">
            {/* Notifications button */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate("/admin/notifications")}
              className="relative w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors group"
            >
              <Bell size={17} className="text-gray-600 group-hover:text-gray-900 transition-colors" />
              {counts.unreadNotifications > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center"
                >
                  {counts.unreadNotifications > 99 ? '99+' : counts.unreadNotifications}
                </motion.span>
              )}
            </motion.button>

            {/* Avatar */}
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-pink-500 flex items-center justify-center text-white font-bold text-xs cursor-pointer shadow-sm"
            >
              {user?.first_name?.[0]}{user?.last_name?.[0]}
            </motion.div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="p-6"
          >
            <Outlet />
          </motion.div>
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
