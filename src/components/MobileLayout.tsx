import { NavLink, useLocation } from "react-router-dom";
import { forwardRef, useEffect } from "react";
import { Home, Calendar, Heart, User } from "lucide-react";
import { useRevenueCat } from "@/contexts/RevenueCatContext";
import { canAccessRoute } from "@/config/subscriptionConfig";

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
    const isPro = location.pathname.startsWith("/pro");
    const { activePlan } = useRevenueCat();

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

    return (
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
              className="apple-glass-nav pointer-events-auto mb-3 h-[56px] w-full max-w-[280px] md:max-w-[320px] px-3 flex items-center justify-around gap-1.5 rounded-[28px]"
              style={{
                paddingBottom: "calc(4px + env(safe-area-inset-bottom, 0px))"
              }}
            >
              {navItems.map((item) => {
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
      </div>
    );
  }
);

MobileLayout.displayName = "MobileLayout";

export default MobileLayout;
