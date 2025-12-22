import { useState } from "react";
import { X, Calendar, Clock, User } from "lucide-react";

interface AddAppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (appointment: any) => void;
  selectedDate?: Date;
}

const AddAppointmentModal = ({ isOpen, onClose, onSave, selectedDate }: AddAppointmentModalProps) => {
  const [clientName, setClientName] = useState("");
  const [service, setService] = useState("");
  const [time, setTime] = useState("");
  const [price, setPrice] = useState("");

  if (!isOpen) return null;

  const handleSave = () => {
    onSave({
      name: clientName,
      service,
      time,
      price: parseInt(price),
      date: selectedDate,
    });
    setClientName("");
    setService("");
    setTime("");
    setPrice("");
    onClose();
  };

  const isValid = clientName && service && time && price;

  const services = [
    "Pose complète gel",
    "Remplissage",
    "Manucure simple",
    "Nail art",
    "Dépose",
    "French",
  ];

  const times = [
    "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
    "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30"
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center animate-fade-in">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-[430px] bg-card rounded-t-3xl p-5 pb-8 safe-bottom animate-slide-up-modal max-h-[85vh] overflow-y-auto">
        {/* Handle */}
        <div className="w-12 h-1 bg-muted-foreground/30 rounded-full mx-auto mb-4" />
        
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-display text-xl font-semibold text-foreground">
            Nouveau rendez-vous
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-muted flex items-center justify-center"
          >
            <X size={18} className="text-muted-foreground" />
          </button>
        </div>

        {/* Date display */}
        {selectedDate && (
          <div className="flex items-center gap-2 mb-4 p-3 bg-accent rounded-xl">
            <Calendar size={18} className="text-primary" />
            <span className="text-foreground font-medium">
              {selectedDate.toLocaleDateString("fr-FR", { 
                weekday: "long", 
                day: "numeric", 
                month: "long" 
              })}
            </span>
          </div>
        )}

        {/* Form */}
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 block flex items-center gap-2">
              <User size={14} />
              Cliente
            </label>
            <input
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-muted border-0 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Nom de la cliente"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 block">
              Prestation
            </label>
            <div className="flex flex-wrap gap-2">
              {services.map((s) => (
                <button
                  key={s}
                  onClick={() => setService(s)}
                  className={`px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                    service === s
                      ? "gradient-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 block flex items-center gap-2">
              <Clock size={14} />
              Horaire
            </label>
            <div className="grid grid-cols-4 gap-2">
              {times.map((t) => (
                <button
                  key={t}
                  onClick={() => setTime(t)}
                  className={`px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                    time === t
                      ? "gradient-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 block">
              Prix (€)
            </label>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-muted border-0 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="65"
            />
          </div>
        </div>

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={!isValid}
          className="w-full mt-6 py-4 rounded-2xl gradient-primary text-primary-foreground font-semibold active:scale-[0.98] transition-transform disabled:opacity-50"
        >
          Ajouter le rendez-vous
        </button>
      </div>
    </div>
  );
};

export default AddAppointmentModal;
