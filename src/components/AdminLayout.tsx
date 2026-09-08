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
  MoreHorizontal,
  ShieldAlert,
  Search,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { WaveLoader } from "@/components/ui/wave-loader";
import { useIdleTimeout } from "@/hooks/useIdleTimeout";

const API_URL = import.meta.env.VITE_API_URL || "";
const IDLE_TIMEOUT_MS = 20 * 60 * 1000; // 20 min
const IDLE_WARN_BEFORE_MS = 60 * 1000; // avertit 1 min avant

interface DashboardCounts {
  totalUsers: number;
  totalBookings: number;
  pendingReports?: number;
}

type NavItem = { icon: typeof LayoutDashboard; label: string; path: string; badge: number | null };

const AdminLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const reduceMotion = useReducedMotion();
  const { logout } = useAuth();
  const [commandOpen, setCommandOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
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

  const menuItems: NavItem[] = [
    { icon: LayoutDashboard, label: "Dashboard", path: "/admin/dashboard", badge: null },
    { icon: DollarSign, label: "Finances", path: "/admin/analytics", badge: null },
    { icon: Calendar, label: "Réservations", path: "/admin/bookings", badge: counts.totalBookings || null },
    { icon: Users, label: "Utilisateurs", path: "/admin/users", badge: counts.totalUsers || null },
    { icon: ShieldAlert, label: "Modération", path: "/admin/moderation", badge: counts.pendingReports || null },
    { icon: ListChecks, label: "Tâches", path: "/admin/tasks", badge: null },
    { icon: FileText, label: "Logs", path: "/admin/logs", badge: null },
    { icon: User, label: "Profil", path: "/admin/profile", badge: null },
  ];

  // Groupes de navigation — la barre latérale desktop les affiche avec un
  // intertitre ; la bottom-nav mobile garde 4 raccourcis + "Plus".
  const navGroups: { heading: string; items: NavItem[] }[] = [
    { heading: "Pilotage", items: menuItems.slice(0, 2) },
    { heading: "Gestion", items: menuItems.slice(2, 6) },
    { heading: "Système", items: menuItems.slice(6) },
  ];

  const isActive = (path: string) => location.pathname === path;

  const primaryItems = menuItems.slice(0, 4);
  const overflowItems = menuItems.slice(4);

  const NavRow = ({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) => {
    const Icon = item.icon;
    const active = isActive(item.path);
    return (
      <button
        onClick={() => {
          onNavigate?.();
          navigate(item.path);
        }}
        aria-current={active ? "page" : undefined}
        className={`group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
          active
            ? "bg-primary/10 text-foreground font-semibold"
            : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
        }`}
      >
        {/* Ruban de marque — indicateur d'onglet actif */}
        <span
          aria-hidden="true"
          className={`admin-ribbon absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-full transition-opacity ${
            active ? "opacity-100" : "opacity-0"
          }`}
        />
        <Icon size={17} className={active ? "text-primary" : "text-muted-foreground/70 group-hover:text-foreground/80"} strokeWidth={active ? 2.4 : 2} />
        <span className="truncate">{item.label}</span>
        {item.badge ? (
          <span className="ml-auto min-w-[20px] rounded-full bg-primary/15 px-1.5 py-0.5 text-center text-[10px] font-bold text-primary">
            {item.badge > 999 ? "999+" : item.badge}
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <div className="admin-theme min-h-screen bg-background text-foreground">
      {/* Ruban de marque — balaie une fois à chaque changement de page */}
      {!reduceMotion && (
        <motion.div
          key={`ribbon-${location.pathname}`}
          aria-hidden="true"
          className="admin-ribbon pointer-events-none fixed inset-y-0 left-0 z-[60] w-[45vw] skew-x-[-12deg]"
          initial={{ x: "-120%" }}
          animate={{ x: "260%" }}
          transition={{ duration: 0.6, ease: [0.7, 0, 0.2, 1] }}
        />
      )}

      {/* ── Barre latérale — desktop (≥ lg) ─────────────────────────────── */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col border-r border-border bg-sidebar lg:flex">
        <div className="px-5 pb-5 pt-6">
          <button onClick={() => navigate("/admin/dashboard")} className="block text-left">
            <span className="admin-display text-[1.9rem] leading-none text-foreground">Blyss</span>
            <span className="mt-1 block text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
              Console admin
            </span>
          </button>
          <span aria-hidden="true" className="admin-ribbon mt-3 block h-[3px] w-16 rounded-full" />
        </div>

        <button
          onClick={() => setCommandOpen(true)}
          className="mx-4 mb-3 flex items-center gap-2.5 rounded-xl border border-border bg-white/[0.03] px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
        >
          <Search size={15} />
          <span className="flex-1 text-left">Rechercher…</span>
          <kbd className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">⌘K</kbd>
        </button>

        <nav className="flex-1 overflow-y-auto px-4 py-2">
          {navGroups.map((group) => (
            <div key={group.heading} className="mb-4">
              <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground/60">
                {group.heading}
              </p>
              <div className="flex flex-col gap-0.5">
                {group.items.map((item) => (
                  <NavRow key={item.path} item={item} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-border p-4">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut size={17} strokeWidth={2} />
            Déconnexion
          </button>
        </div>
      </aside>

      {/* ── En-tête mobile (< lg) ───────────────────────────────────────── */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/80 px-4 py-3 backdrop-blur lg:hidden">
        <button onClick={() => navigate("/admin/dashboard")} className="flex items-baseline gap-2">
          <span className="admin-display text-[1.5rem] leading-none text-foreground">Blyss</span>
          <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Admin</span>
        </button>
        <button
          onClick={() => setCommandOpen(true)}
          aria-label="Rechercher"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-white/[0.03] text-muted-foreground"
        >
          <Search size={16} />
        </button>
      </header>

      {/* ── Contenu ─────────────────────────────────────────────────────── */}
      <main className="pb-24 lg:pb-10 lg:pl-[248px]">
        <motion.div
          key={location.pathname}
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto max-w-[1120px] p-4 sm:p-6 lg:p-10"
        >
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-24">
                <WaveLoader />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </motion.div>
      </main>

      {/* ── Bottom-nav — mobile uniquement (< lg) ───────────────────────── */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-card lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {primaryItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              className="relative flex flex-col items-center justify-center gap-1 py-2.5 min-h-[56px]"
            >
              <Icon className={`h-5 w-5 ${active ? "text-primary" : "text-foreground/60"}`} strokeWidth={active ? 2.5 : 2} />
              <span className={`text-[10px] leading-none ${active ? "text-primary font-semibold" : "text-foreground/60"}`}>
                {item.label}
              </span>
              {item.badge ? (
                <span className="absolute top-1 right-[22%] min-w-[14px] h-[14px] px-1 rounded-full bg-destructive text-destructive-foreground text-[8px] font-black flex items-center justify-center">
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              ) : null}
            </button>
          );
        })}

        <button
          onClick={() => setMoreOpen(true)}
          aria-label="Plus"
          className="flex flex-col items-center justify-center gap-1 py-2.5 min-h-[56px]"
        >
          <MoreHorizontal className="h-5 w-5 text-foreground/60" strokeWidth={2} />
          <span className="text-[10px] leading-none text-foreground/60">Plus</span>
        </button>
      </nav>

      {/* Feuille "Plus" — bottom-nav mobile */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="bg-card border-border pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
          <div className="flex flex-col gap-1 pt-2">
            {overflowItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path);
              return (
                <button
                  key={item.path}
                  onClick={() => { setMoreOpen(false); navigate(item.path); }}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 px-3 py-3 rounded-xl min-h-[48px] ${active ? "bg-primary/15 text-primary" : "text-foreground hover:bg-muted"}`}
                >
                  <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
                  <span className="font-medium">{item.label}</span>
                  {item.badge ? (
                    <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-black flex items-center justify-center">
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
            <button
              onClick={() => { setMoreOpen(false); handleLogout(); }}
              className="flex items-center gap-3 px-3 py-3 rounded-xl min-h-[48px] text-destructive hover:bg-destructive/10"
            >
              <LogOut className="h-5 w-5" />
              <span className="font-medium">Déconnexion</span>
            </button>
          </div>
        </SheetContent>
      </Sheet>

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
