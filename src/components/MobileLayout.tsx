import { NavLink, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Home, Calendar, Heart, User } from "lucide-react";

interface MobileLayoutProps {
  children: React.ReactNode;
  showNav?: boolean;
}

const MobileLayout = ({ children, showNav = true }: MobileLayoutProps) => {
  const location = useLocation();
  const isPro = location.pathname.startsWith("/pro");

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

  // Scroll en haut à chaque changement de route
  useEffect(() => {
    document.documentElement.scrollTo({
      top: 0,
      left: 0,
      behavior: "instant",
    });
  }, [location.pathname]);

  return (
    <div className="min-h-[100dvh] pb-20 relative">
      <main className="flex-1 pt-safe-top">
        {children}
      </main>

      {showNav && (
        <nav className="fixed inset-x-0 bottom-0 z-50 flex justify-center pointer-events-auto">
          <div
            className="
              mb-3 h-16 w-full max-w-[380px]
              px-5
              bg-white/30 backdrop-blur-lg border border-white/30
              rounded-full py-2
              flex items-center justify-around gap-2
              shadow-lg
            "
          >
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={`
                    flex flex-1 items-center justify-center rounded-2xl p-2 transition-all duration-200
                    ${isActive ? "bg-white/50" : "hover:bg-white/20"}
                  `}
                >
                  <item.icon
                    size={28}
                    className={isActive ? "text-primary" : "text-gray-700"}
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