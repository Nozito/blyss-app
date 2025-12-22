import { NavLink, useLocation } from "react-router-dom";
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
    { icon: Calendar, path: "/client/booking", label: "Réserver" },
    { icon: Heart, path: "/client/favorites", label: "Favoris" },
    { icon: User, path: "/client/profile", label: "Profil" },
  ];

  const navItems = isPro ? proNavItems : clientNavItems;

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-[430px] mx-auto">
      <main className={`flex-1 ${showNav ? "pb-24" : ""}`}>
        {children}
      </main>

      {showNav && (
        <nav className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-[398px] glass-nav rounded-3xl px-2 py-2 z-50">
          <div className="flex items-center justify-around">
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
