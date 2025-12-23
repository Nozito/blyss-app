import { useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Home, Calendar, Heart, User } from "lucide-react";

interface MobileLayoutProps {
  children: React.ReactNode;
  showNav?: boolean;
}

const MobileLayout = ({ children, showNav = true }: MobileLayoutProps) => {
  const location = useLocation();
  const isPro = location.pathname.startsWith("/pro");

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [location.pathname]);

  const proNavItems = [
    { icon: Home, path: "/pro/dashboard", label: "Accueil" },
    { icon: Calendar, path: "/pro/calendar", label: "Calendrier" },
    { icon: Heart, path: "/pro/clients", label: "Clients" },
    { icon: User, path: "/pro/profile", label: "Profil" },
  ];

  const clientNavItems = [
    { icon: Home, path: "/client", label: "Accueil" },
    { icon: Calendar, path: "/client/my-booking", label: "Mes réservations" },
    { icon: Heart, path: "/client/favorites", label: "Favoris" },
    { icon: User, path: "/client/profile", label: "Profil" },
  ];

  const navItems = isPro ? proNavItems : clientNavItems;

  return (
    <div
      className="flex flex-col max-w-[430px] mx-auto w-full bg-background"
      style={{
        minHeight: 'calc(100vh - env(safe-area-inset-bottom))',
        paddingTop: '0px',
        paddingBottom: showNav ? `calc(32px + env(safe-area-inset-bottom, 6px))` : '0px',
      }}
    >
      <main className="flex-1">
        {children}
      </main>

      {showNav && (
        <nav
          className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[320px] h-14 glass-nav rounded-full px-2 py-1 z-50"
          style={{ paddingBottom: `env(safe-area-inset-bottom, 6px)` }}
        >
          <div className="flex items-center justify-around gap-0.5">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className="touch-button flex flex-col items-center gap-1 p-2 rounded-2xl transition-all duration-200"
                >
                  <item.icon
                    size={24}
                    className={`transition-colors duration-200 ${
                      isActive ? "text-primary" : "text-muted-foreground"
                    }`}
                    strokeWidth={isActive ? 2.5 : 2}
                  />
                </NavLink>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
};

export default MobileLayout;
