import MobileLayout from "@/components/MobileLayout";
import { useNavigate } from "react-router-dom";
import { Settings, ChevronRight, CreditCard, Bell, HelpCircle, LogOut } from "lucide-react";
import logo from "@/assets/logo.png";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const ProProfile = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const menuItems = [
    { icon: Settings, label: "Paramètres", path: "/pro/settings" },
    { icon: CreditCard, label: "Encaissements", path: "/pro/payment" },
    { icon: Bell, label: "Notifications", path: "/pro/notifications" },
    { icon: HelpCircle, label: "Aide", path: "/pro/help" },
  ];

  const handleLogout = async () => {
    await logout();
    toast.success("Déconnexion réussie");
    navigate("/");
  };

  const displayName = user ? `${user.firstName} ${user.lastName}` : "Marie Beauté";

  return (
    <MobileLayout>
      <div className="py-6 animate-fade-in">
        {/* Header */}
        <div className="mb-5">
          <h1 className="text-2xl font-semibold text-foreground">
            Mon profil
          </h1>
        </div>

        {/* Profile Card */}
        <div className="blyss-card flex items-center gap-4 mb-6 animate-slide-up">
          <div className="w-16 h-16 rounded-full gradient-primary flex items-center justify-center">
            <img src={logo} alt="Profile" className="w-10 h-10 object-contain" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-foreground">
              {displayName}
            </h2>
            <p className="text-sm text-muted-foreground">Nail Artist</p>
            {user?.email && (
              <p className="text-xs text-muted-foreground">{user.email}</p>
            )}
            <p className="text-xs text-primary mt-1">Profil complété à 85%</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6 animate-slide-up" style={{ animationDelay: "0.1s" }}>
          <div className="stat-card text-center">
            <p className="text-2xl font-bold text-primary">156</p>
            <p className="text-xs text-muted-foreground">Clientes</p>
          </div>
          <div className="stat-card text-center">
            <p className="text-2xl font-bold text-primary">4.9</p>
            <p className="text-xs text-muted-foreground">Note</p>
          </div>
          <div className="stat-card text-center">
            <p className="text-2xl font-bold text-primary">2 ans</p>
            <p className="text-xs text-muted-foreground">Sur Blyss</p>
          </div>
        </div>

        {/* Menu Items */}
        <div className="blyss-card p-0 overflow-hidden mb-6 animate-slide-up" style={{ animationDelay: "0.15s" }}>
          {menuItems.map((item, index) => (
            <button
              key={index}
              onClick={() => navigate(item.path)}
              className="w-full flex items-center gap-4 px-4 py-4 hover:bg-muted/50 active:bg-muted active:scale-[0.99] transition-all border-b border-border last:border-b-0"
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

export default ProProfile;
