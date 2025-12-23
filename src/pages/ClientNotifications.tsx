import MobileLayout from "@/components/MobileLayout";
import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

const ClientNotifications = () => {
    const navigate = useNavigate();

    const notifications = [
        "Rappels de rendez-vous",
        "Nouveaux messages",
        "Offres et promotions",
    ];

    return (
        <MobileLayout showNav={false}>      
            <div className="py-6 animate-fade-in">
            <div className="flex items-center mb-4 animate-fade-in">
                <button
                    onClick={() => navigate("/client/profile")}
                    className="p-2"
                >
                    <ChevronLeft size={24} className="text-foreground" />
                </button>
                <div className="ml-2">
                    <h1 className="font-display text-2xl font-semibold text-foreground mb-1">
                        Notifications
                    </h1>
                    <p className="text-muted-foreground text-sm">
                        Gère tes préférences
                    </p>
                </div>
            </div>

            <div className="space-y-4">
                {notifications.map((label) => (
                    <div
                        key={label}
                        className="blyss-card flex flex-col gap-2 p-4 rounded-2xl shadow-card hover:shadow-lg transition"
                    >
                        <div className="flex items-center justify-between">
                            <span className="font-medium text-foreground">{label}</span>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" defaultChecked className="sr-only peer" />
                                <div className="w-11 h-6 bg-gray-300 peer-checked:bg-primary rounded-full peer-focus:ring-2 peer-focus:ring-primary/50 transition-all"></div>
                                <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow peer-checked:translate-x-5 transition-transform"></div>
                            </label>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Gère la réception de {label.toLowerCase()}.
                        </p>
                    </div>
                ))}
            </div>
        </div>
        </MobileLayout>
    );
};

export default ClientNotifications;