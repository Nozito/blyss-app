import { useState, useEffect, useCallback, Suspense } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Calendar,
  DollarSign,
  FileText,
  LogOut,
  ListChecks,
  User,
} from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { Dock, DockIcon, DockItem, DockLabel } from "@/components/ui/dock";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { useIdleTimeout } from "@/hooks/useIdleTimeout";

const API_URL = import.meta.env.VITE_API_URL || "";
const IDLE_TIMEOUT_MS = 20 * 60 * 1000; // 20 min
const IDLE_WARN_BEFORE_MS = 60 * 1000; // avertit 1 min avant

interface DashboardCounts {
  totalUsers: number;
  totalBookings: number;
}

const AdminLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();
  const [commandOpen, setCommandOpen] = useState(false);
  const [counts, setCounts] = useState<DashboardCounts>({
    totalUsers: 0,
    totalBookings: 0,
  });

  const handleLogout = useCallback(() => {
    logout();
    toast.success("Déconnexion réussie");
    setTimeout(() => navigate("/"), 400);
  }, [logout, navigate]);

  // Sécurité — déconnexion automatique après 20 min d'inactivité sur le backoffice
  useIdleTimeout({
    timeoutMs: IDLE_TIMEOUT_MS,
    warnBeforeMs: IDLE_WARN_BEFORE_MS,
    enabled: true,
    onIdle: handleLogout,
  });

  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const response = await fetch(`${API_URL}/api/admin/dashboard/counts`, {
          credentials: "include",
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

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const runCommand = (fn: () => void) => {
    setCommandOpen(false);
    fn();
  };

  const menuItems = [
    { icon: LayoutDashboard, label: "Dashboard", path: "/admin/dashboard", badge: null as number | null },
    { icon: Users, label: "Utilisateurs", path: "/admin/users", badge: counts.totalUsers || null },
    { icon: Calendar, label: "Réservations", path: "/admin/bookings", badge: counts.totalBookings || null },
    { icon: DollarSign, label: "Finances", path: "/admin/analytics", badge: null },
    { icon: FileText, label: "Logs", path: "/admin/logs", badge: null },
    { icon: ListChecks, label: "Tâches", path: "/admin/tasks", badge: null },
    { icon: User, label: "Profil", path: "/admin/profile", badge: null },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="admin-theme min-h-screen flex flex-col bg-background text-foreground">
      <main className="flex-1 overflow-y-auto pb-28">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="p-4 sm:p-6"
        >
          {/* Suspense propre au backoffice : sans lui, changer de page admin
              (chaque page est lazy-loadée) remonte jusqu'au Suspense racine
              de App.tsx, démonte AdminLayout et affiche son fallback clair
              (rose) le temps du chargement — d'où le flash observé. */}
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-24">
                <div className="h-6 w-6 rounded-full border-2 border-foreground/20 border-t-foreground animate-spin" aria-label="Chargement" />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </motion.div>
      </main>

      {/* Dock — navigation principale, style macOS */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 max-w-[calc(100vw-1.5rem)]">
        <Dock className="items-end pb-3">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);

            return (
              <DockItem
                key={item.path}
                onClick={() => navigate(item.path)}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                className={`aspect-square rounded-full transition-colors ${
                  active ? "bg-primary/15 ring-2 ring-primary/40" : "bg-muted hover:bg-muted/80"
                }`}
              >
                <DockLabel>{item.label}</DockLabel>
                <DockIcon>
                  <div className="relative w-full h-full">
                    <Icon className={`h-full w-full ${active ? "text-primary" : "text-foreground/70"}`} strokeWidth={active ? 2.5 : 2} />
                    {item.badge ? (
                      <span
                        className={`absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] px-1 rounded-full bg-red-600 text-white text-[9px] font-black flex items-center justify-center ${
                          item.pulse ? "animate-pulse" : ""
                        }`}
                      >
                        {item.badge > 99 ? "99+" : item.badge}
                      </span>
                    ) : null}
                  </div>
                </DockIcon>
              </DockItem>
            );
          })}

          <DockItem
            onClick={handleLogout}
            aria-label="Déconnexion"
            className="aspect-square rounded-full bg-destructive/10 hover:bg-destructive/20 transition-colors"
          >
            <DockLabel>Déconnexion</DockLabel>
            <DockIcon>
              <LogOut className="h-full w-full text-destructive" />
            </DockIcon>
          </DockItem>
        </Dock>
      </div>

      <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
        <CommandInput placeholder="Rechercher une section ou une action..." />
        <CommandList>
          <CommandEmpty>Aucun résultat.</CommandEmpty>
          <CommandGroup heading="Navigation">
            {menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <CommandItem key={item.path} onSelect={() => runCommand(() => navigate(item.path))}>
                  <Icon size={16} className="opacity-60" />
                  <span>{item.label}</span>
                  {item.badge ? <CommandShortcut>{item.badge}</CommandShortcut> : null}
                </CommandItem>
              );
            })}
          </CommandGroup>
          <CommandGroup heading="Compte">
            <CommandItem onSelect={() => runCommand(handleLogout)}>
              <LogOut size={16} className="opacity-60" />
              <span>Déconnexion</span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  );
};

export default AdminLayout;
