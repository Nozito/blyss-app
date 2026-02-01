import { NavLink, useLocation } from "react-router-dom";
import { forwardRef, useEffect } from "react";
import { Home, Calendar, Heart, User } from "lucide-react";

interface MobileLayoutProps {
  children: React.ReactNode;
  showNav?: boolean;
  hideNav?: boolean;
}

const MobileLayout = forwardRef<HTMLDivElement, MobileLayoutProps>(
  ({ children, showNav = true, hideNav }, ref) => {
    const location = useLocation();
    const isPro = location.pathname.startsWith("/pro");

    const proNavItems = [
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
          className="px-4 pb-4"
          style={{
            paddingTop: "calc(8px + env(safe-area-inset-top, 0px))"
          }}
        >
          {children}
        </main>

        {showNav && !hideNav && (
          <nav className="fixed inset-x-0 bottom-0 z-50 flex justify-center pointer-events-none">
            <div
              className="apple-glass-nav pointer-events-auto mb-3 h-[56px] w-full max-w-[280px] px-3 flex items-center justify-around gap-1.5 rounded-[28px]"
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
