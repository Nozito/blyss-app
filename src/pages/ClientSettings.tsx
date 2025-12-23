import MobileLayout from "@/components/MobileLayout";
import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

const ClientSettings = () => {
    const navigate = useNavigate();

    return (
        <MobileLayout showNav={false}>
            <div className="py-6 animate-fade-in">
                <div className="flex items-center mb-4">
                    <button onClick={() => navigate("/client/profile")} className="p-2">
                        <ChevronLeft size={24} className="text-foreground" />
                    </button>
                    <h1 className="font-display text-2xl font-semibold text-foreground ml-2">
                        Paramètres
                    </h1>
                </div>
                <p className="text-muted-foreground text-sm mb-6">
                    Gère ton compte et ta sécurité
                </p>

                <div className="space-y-3">
                    <div className="flex flex-col mb-4">
                        <label className="text-sm text-muted-foreground mb-1">Nom</label>
                        <input
                            type="text"
                            className="border border-muted rounded-xl px-3 h-12 w-full"
                            placeholder="Nom"
                        />
                    </div>

                    <div className="flex flex-col mb-4">
                        <label className="text-sm text-muted-foreground mb-1">Prénom</label>
                        <input
                            type="text"
                            className="border border-muted rounded-xl px-3 h-12 w-full"
                            placeholder="Prénom"
                        />
                    </div>

                    <div className="flex flex-col mb-4">
                        <label className="text-sm text-muted-foreground mb-1">Date de naissance</label>
                        <input
                            type="date"
                            className="border border-muted rounded-xl px-3 h-12 w-full appearance-none box-border py-0 text-base leading-[48px] bg-white"
                            placeholder="12/06/1990"
                        />
                    </div>

                    <div className="flex flex-col mb-4">
                        <label className="text-sm text-muted-foreground mb-1">Mot de passe</label>
                        <input
                            type="password"
                            className="border border-muted rounded-xl px-3 h-12 w-full"
                            placeholder="Mot de passe"
                        />
                    </div>

                    <button className="w-full py-3 rounded-xl gradient-gold text-secondary-foreground font-medium mt-4">
                        Enregistrer
                    </button>
                </div>
            </div>
        </MobileLayout>
    );
};

export default ClientSettings;