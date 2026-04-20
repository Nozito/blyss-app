import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { forwardRef, useEffect, useState } from "react";
import { Home, Calendar, Heart, User, Repeat2, Bell } from "lucide-react";
import { useRevenueCat } from "@/contexts/RevenueCatContext";
import { canAccessRoute } from "@/config/subscriptionConfig";
import { useAuth } from "@/contexts/AuthContext";
import { useNotifications } from "@/contexts/NotificationContext";
import RoleSelectionModal, { type AdminRole } from "@/components/RoleSelectionModal";

// Routes where the bottom nav is shown automatically.
// Everything else hides it unless showNav={true} is passed explicitly.
const NAV_ROUTES = new Set([
  "/client",
  "/client/my-booking",
  "/client/favorites",
  "/client/profile",
  "/pro/dashboard",
  "/pro/calendar",
  "/pro/clients",
  "/pro/profile",
]);

interface MobileLayoutProps {
  children: React.ReactNode;
  /**
   * undefined (default) → auto: nav shown only on NAV_ROUTES
   * true  → force show
   * false → force hide
   */
  showNav?: boolean;
  /** Force hide regardless of showNav (used for modal states) */
  hideNav?: boolean;
}

const MobileLayout = forwardRef<HTMLDivElement, MobileLayoutProps>(
  ({ children, showNav, hideNav }, ref) => {
    const location = useLocation();
    const navigate = useNavigate();
    const isPro = location.pathname.startsWith("/pro");
    const { activePlan } = useRevenueCat();
    const { user } = useAuth();
    const { unreadCount, setShowNotifications } = useNotifications();
    const [showRoleSwitcher, setShowRoleSwitcher] = useState(false);

    // Auto-detection: show nav only on the main tab routes
    const isNavRoute = NAV_ROUTES.has(location.pathname);
    const shouldShowNav = !hideNav && (showNav === undefined ? isNavRoute : showNav);

    const allProNavItems = [
      { icon: Home, path: "/pro/dashboard", label: "Accueil" },
      { icon: Calendar, path: "/pro/calendar", label: "Calendrier" },
      { icon: Heart, path: "/pro/clients", label: "Clients" },
      { icon: User, path: "/pro/profile", label: "Profil" }
    ];

    const clientNavItems = [
      { icon: Home, path: "/client", label: "Accueil" },
      { icon: Calendar, path: "/client/my-booking", label: "Mes réservations" },
      { icon: Heart, path: "/client/favorites", label: "Favoris" },
      { icon: User, path: "/client/profile", label: "Profil" }
    ];

    // Filtrer la nav pro selon le plan actif
    const proNavItems = allProNavItems.filter(
      (item) => canAccessRoute(activePlan, item.path)
    );

    const navItems = isPro ? proNavItems : clientNavItems;

    useEffect(() => {
      document.documentElement.scrollTo({
        top: 0,
        left: 0,
        behavior: "auto"
      });
    }, [location.pathname]);

    const handleRoleSelect = (role: AdminRole) => {
      setShowRoleSwitcher(false);
      const routes: Record<AdminRole, string> = {
        client: "/client",
        pro: "/pro/dashboard",
        admin: "/admin/dashboard",
      };
      navigate(routes[role]);
    };

    return (
      <>
      <div
        ref={ref}
        className="relative w-full min-h-[100dvh] bg-background flex flex-col overflow-x-hidden"
      >
        <main
          className="px-4 md:px-6 pb-4 max-w-[600px] mx-auto w-full"
          style={{
            paddingTop: "calc(8px + env(safe-area-inset-top, 0px))"
          }}
        >
          {children}
        </main>

        {shouldShowNav && (
          <nav className="fixed inset-x-0 bottom-0 z-50 flex justify-center pointer-events-none">
            <div
              className="apple-glass-nav pointer-events-auto mb-3 h-[56px] w-full max-w-[340px] md:max-w-[380px] px-3 flex items-center justify-around gap-1 rounded-[28px]"
              style={{
                paddingBottom: "calc(4px + env(safe-area-inset-bottom, 0px))"
              }}
            >
              {navItems.slice(0, -1).map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className="flex flex-1 items-center justify-center"
                  >
                    <div className={`apple-nav-icon ${isActive ? 'active' : ''}`}>
                      <item.icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                    </div>
                  </NavLink>
                );
              })}

              {/* Bell — notification panel trigger (before Profile) */}
              <button
                onClick={() => { if (navigator.vibrate) navigator.vibrate(5); setShowNotifications(true); }}
                className="flex flex-1 items-center justify-center"
              >
                <div className="apple-nav-icon relative">
                  <Bell size={20} strokeWidth={2} />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#FF3B30] text-white text-[9px] font-bold flex items-center justify-center leading-none">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </div>
              </button>

              {navItems.slice(-1).map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className="flex flex-1 items-center justify-center"
                  >
                    <div className={`apple-nav-icon ${isActive ? 'active' : ''}`}>
                      <item.icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                    </div>
                  </NavLink>
                );
              })}
            </div>
          </nav>
        )}

        {user?.is_admin && (
          <button
            onClick={() => setShowRoleSwitcher(true)}
            className="fixed top-3 right-3 z-40 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-500/90 backdrop-blur-sm border border-orange-400/50 shadow-lg shadow-orange-500/20 hover:bg-orange-500 active:scale-95 transition-all"
            style={{ top: "calc(12px + env(safe-area-inset-top, 0px))" }}
            aria-label="Changer d'espace"
          >
            <Repeat2 size={14} className="text-white" />
            <span className="text-[11px] font-bold text-white uppercase tracking-wide">Admin</span>
          </button>
        )}
      </div>

      <RoleSelectionModal
        isOpen={showRoleSwitcher}
        userName={user?.first_name ?? ""}
        onSelectRole={handleRoleSelect}
        onClose={() => setShowRoleSwitcher(false)}
      />
      </>
    );
  }
);

MobileLayout.displayName = "MobileLayout";

export default MobileLayout;
