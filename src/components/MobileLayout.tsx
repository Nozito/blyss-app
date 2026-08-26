import { useLocation, useNavigate } from "react-router-dom";
import { forwardRef, useEffect } from "react";
import { Repeat2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface MobileLayoutProps {
  children: React.ReactNode;
}

const MobileLayout = forwardRef<HTMLDivElement, MobileLayoutProps>(
  ({ children }, ref) => {
    const location = useLocation();
    const navigate = useNavigate();
    const { user } = useAuth();

    useEffect(() => {
      document.documentElement.scrollTo({
        top: 0,
        left: 0,
        behavior: "auto"
      });
    }, [location.pathname]);

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

        {/* Visible seulement si un admin consulte cette page en usurpant un rôle
            client/pro (RequireAuth le permet, cf. RGPDCenter) — ramène directement
            au backoffice, seule interface web qui existe encore pour un admin. */}
        {user?.is_admin && (
          <button
            onClick={() => navigate("/admin/dashboard")}
            className="fixed top-3 right-3 z-40 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-500/90 backdrop-blur-sm border border-orange-400/50 shadow-lg shadow-orange-500/20 hover:bg-orange-500 active:scale-95 transition-all"
            style={{ top: "calc(12px + env(safe-area-inset-top, 0px))" }}
            aria-label="Retour à l'admin"
          >
            <Repeat2 size={14} className="text-white" />
            <span className="text-[11px] font-bold text-white uppercase tracking-wide">Admin</span>
          </button>
        )}
      </div>
      </>
    );
  }
);

MobileLayout.displayName = "MobileLayout";

export default MobileLayout;
