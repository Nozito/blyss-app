import { useState } from "react";
import { X, Star, MessageSquare, Save } from "lucide-react";

interface Client {
  id: number;
  name: string;
  phone: string;
  lastVisit: string;
  totalVisits: number;
  notes: string;
  avatar: string;
}

interface ClientEditModalProps {
  client: Client;
  isOpen: boolean;
  onClose: () => void;
  onSave: (client: Client) => void;
}

const ClientEditModal = ({ client, isOpen, onClose, onSave }: ClientEditModalProps) => {
  const [notes, setNotes] = useState(client.notes);
  const [name, setName] = useState(client.name);
  const [phone, setPhone] = useState(client.phone);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave({ ...client, name, phone, notes });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center animate-fade-in">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-[430px] bg-card rounded-t-3xl p-5 pb-8 safe-bottom animate-slide-up-modal">
        {/* Handle */}
        <div className="w-12 h-1 bg-muted-foreground/30 rounded-full mx-auto mb-4" />
        
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-display text-xl font-semibold text-foreground">
            Modifier cliente
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-muted flex items-center justify-center"
          >
            <X size={18} className="text-muted-foreground" />
          </button>
        </div>

        {/* Client Avatar */}
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-full gradient-primary flex items-center justify-center">
            <span className="text-primary-foreground font-semibold text-lg">
              {client.avatar}
            </span>
          </div>
          <div>
            <p className="text-muted-foreground text-sm">{client.totalVisits} visites</p>
            <p className="text-muted-foreground text-xs">{client.lastVisit}</p>
          </div>
        </div>

        {/* Form */}
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 block">
              Nom
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-muted border-0 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 block">
              Téléphone
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-muted border-0 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 block flex items-center gap-2">
              <MessageSquare size={14} />
              Notes & commentaires
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-4 py-3 rounded-xl bg-muted border-0 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              placeholder="Préférences, allergies, habitudes..."
            />
          </div>
        </div>

        {/* Save Button */}
        <button
          onClick={handleSave}
          className="w-full mt-6 py-4 rounded-2xl gradient-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
        >
          <Save size={20} />
          Enregistrer
        </button>
      </div>
    </div>
  );
};

export default ClientEditModal;
