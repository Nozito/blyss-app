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

  // Scroll en haut à chaque changement de route
  useEffect(() => {
    // version instantanée
    document.documentElement.scrollTo({
      top: 0,
      left: 0,
      behavior: "instant"
    });
    // si tu préfères smooth :
    // window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  }, [location.pathname]);

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

  return (
    <div className="min-h-[100dvh] bg-background">
      <div className="relative mx-auto flex min-h-[100dvh] w-full flex-col">
        <main className="flex-1 pt-safe-top pb-3">
          {children}
        </main>

        {showNav && (
          <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center pb-[env(safe-area-inset-bottom,0px)]">
            <div
              className="
                pointer-events-auto mb-3 h-14 w-full max-w-[380px]
                glass-nav rounded-full px-2 py-1
              "
            >
              <div className="flex h-full items-center justify-around gap-0.5">
                {navItems.map((item) => {
                  const isActive = location.pathname === item.path;
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      className="touch-button flex flex-1 items-center justify-center rounded-2xl p-2 transition-all duration-200"
                    >
                      <item.icon
                        size={24}
                        className={
                          isActive ? "text-primary" : "text-muted-foreground"
                        }
                        strokeWidth={isActive ? 2.5 : 2}
                      />
                    </NavLink>
                  );
                })}
              </div>
            </div>
          </nav>
        )}
      </div>
    </div>
  );
};

export default MobileLayout;
