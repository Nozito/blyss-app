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
        className="
          relative
          w-full
          min-h-[100dvh]
          bg-background
          display-flex
          flex-col
          overflow-x-hidden
        "
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
              className="
                pointer-events-auto
                mb-3
                h-[56px]
                w-full max-w-[280px]
                px-3
                flex items-center justify-around gap-1.5

                rounded-[999px]
                bg-white/90
                dark:bg-zinc-900/90
                border border-white/40 dark:border-white/10
                shadow-[0_14px_40px_rgba(0,0,0,0.45)]
                backdrop-blur-xl backdrop-saturate-150
              "
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
                    className="
                      flex flex-1 items-center justify-center
                      transition-all duration-200
                    "
                  >
                    <div
                      className={`
                        flex items-center justify-center
                        h-10 w-10
                        rounded-full
                        transition-all duration-200
                        ${
                          isActive
                            ? "bg-primary/10 shadow-sm"
                            : "bg-transparent hover:bg-white/40 dark:hover:bg-zinc-800/80 active:bg-white/60"
                        }
                      `}
                    >
                      <item.icon
                        size={20}
                        className={
                          isActive ? "text-primary" : "text-muted-foreground"
                        }
                        strokeWidth={isActive ? 2.2 : 2}
                      />
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
