import MobileLayout from "@/components/MobileLayout";
import { useNavigate } from "react-router-dom";
import { Settings, ChevronRight, CreditCard, Bell, HelpCircle, LogOut } from "lucide-react";
import logo from "@/assets/logo.png";

const ClientProfile = () => {
  const navigate = useNavigate();

  const menuItems = [
    { icon: Settings, label: "Paramètres", path: "/client/settings" },
    { icon: CreditCard, label: "Méthodes de paiement", path: "/client/payment-methods" },
    { icon: Bell, label: "Notifications", path: "/client/notifications" },
    { icon: HelpCircle, label: "Aide", path: "/client/help" },
  ];

  const handleLogout = () => {
    navigate("/");
  };

  return (
    <MobileLayout>
      <div className="py-6 animate-fade-in">
        {/* Header */}
        <div className="py-6 animate-fade-in">
          <h1 className="font-display text-2xl font-semibold text-foreground">
            Mon profil
          </h1>
        </div>

        {/* Profile Card */}
        <div className="blyss-card flex items-center gap-4 mb-6 animate-slide-up">
          <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
            <img src={logo} alt="Profile" className="w-20 h-20 object-contain" />
          </div>
          <div className="flex-1">
            <h2 className="font-display text-lg font-semibold text-foreground">
              Marie Dubois
            </h2>
            <p className="text-xs text-primary mt-1">Profil complété à 95%</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6 animate-slide-up" style={{ animationDelay: "0.1s" }}>
          <div className="stat-card text-center">
            <p className="text-2xl font-bold text-foreground">156</p>
            <p className="text-xs text-muted-foreground">Réservations</p>
          </div>
          <div className="stat-card text-center">
            <p className="text-2xl font-bold text-foreground">4.9</p>
            <p className="text-xs text-muted-foreground">Note</p>
          </div>
          <div className="stat-card text-center">
            <p className="text-2xl font-bold text-foreground">2 ans</p>
            <p className="text-xs text-muted-foreground">Sur Blyss</p>
          </div>
        </div>

        {/* Menu Items */}
        <div className="blyss-card p-0 overflow-hidden mb-6 animate-slide-up" style={{ animationDelay: "0.15s" }}>
          {menuItems.map((item, index) => (
            <button
              key={index}
              className="w-full flex items-center gap-4 px-4 py-4 hover:bg-muted/50 active:bg-muted transition-colors border-b border-border last:border-b-0"
            >
              <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center">
                <item.icon size={20} className="text-primary" />
              </div>
              <span className="flex-1 text-left font-medium text-foreground">{item.label}</span>
              <ChevronRight size={20} className="text-muted-foreground" />
            </button>
          ))}
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="blyss-card w-full flex items-center gap-4 animate-slide-up active:scale-[0.98] transition-transform"
          style={{ animationDelay: "0.2s" }}
        >
          <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
            <LogOut size={20} className="text-destructive" />
          </div>
          <span className="flex-1 text-left font-medium text-destructive">Se déconnecter</span>
        </button>

        {/* App Version */}
        <p className="text-center text-xs text-muted-foreground mt-8 animate-fade-in" style={{ animationDelay: "0.3s" }}>
          Blyss v1.0.0
        </p>
      </div>
    </MobileLayout>
  );
};

export default ClientProfile;
