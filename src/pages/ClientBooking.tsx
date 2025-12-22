import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, Clock, Calendar, CreditCard, Smartphone } from "lucide-react";

const ClientBooking = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [selectedService, setSelectedService] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null);

  const totalSteps = 5;

  const services = [
    { id: 1, name: "Pose complète gel", duration: "1h30", price: 65 },
    { id: 2, name: "Remplissage", duration: "1h", price: 45 },
    { id: 3, name: "Manucure simple", duration: "45min", price: 35 },
    { id: 4, name: "Nail art", duration: "2h", price: 85 },
  ];

  const availableDates = [
    { date: "2024-01-15", label: "Lun 15 Jan" },
    { date: "2024-01-16", label: "Mar 16 Jan" },
    { date: "2024-01-17", label: "Mer 17 Jan" },
    { date: "2024-01-18", label: "Jeu 18 Jan" },
    { date: "2024-01-19", label: "Ven 19 Jan" },
  ];

  const availableTimes = ["09:00", "10:30", "14:00", "15:30", "17:00"];

  const selectedServiceData = services.find(s => s.id === selectedService);

  const handleNext = () => {
    if (step === 5) {
      // Booking complete
      return;
    }
    if (step === 3 && paymentMethod === "on-site") {
      setStep(5); // Skip payment step
      return;
    }
    setStep(step + 1);
  };

  const handleBack = () => {
    if (step === 1) {
      navigate(-1);
    } else if (step === 5 && paymentMethod === "on-site") {
      setStep(3);
    } else {
      setStep(step - 1);
    }
  };

  const isStepValid = () => {
    switch (step) {
      case 1:
        return selectedService !== null;
      case 2:
        return selectedDate !== null && selectedTime !== null;
      case 3:
        return paymentMethod !== null;
      case 4:
        return true;
      case 5:
        return true;
      default:
        return false;
    }
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <div className="animate-slide-up">
            <h1 className="font-display text-2xl font-semibold text-foreground mb-2">
              Choisis ta prestation
            </h1>
            <p className="text-muted-foreground mb-6">Quel soin te ferait plaisir ?</p>

            <div className="space-y-3">
              {services.map((service) => (
                <button
                  key={service.id}
                  onClick={() => setSelectedService(service.id)}
                  className={`w-full bg-card rounded-2xl p-4 shadow-card text-left transition-all ${
                    selectedService === service.id
                      ? "ring-2 ring-blyss-gold"
                      : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-foreground">{service.name}</h3>
                      <div className="flex items-center gap-1 mt-1">
                        <Clock size={12} className="text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">{service.duration}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-lg text-foreground">{service.price}€</span>
                      {selectedService === service.id && (
                        <div className="w-6 h-6 rounded-full bg-blyss-gold flex items-center justify-center">
                          <Check size={14} className="text-secondary-foreground" />
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        );

      case 2:
        return (
          <div className="animate-slide-up">
            <h1 className="font-display text-2xl font-semibold text-foreground mb-2">
              Quand ?
            </h1>
            <p className="text-muted-foreground mb-6">Choisis une date et un horaire</p>

            <div className="mb-6">
              <h3 className="font-medium text-foreground mb-3 flex items-center gap-2">
                <Calendar size={16} className="text-blyss-gold" />
                Date
              </h3>
              <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-2">
                {availableDates.map((date) => (
                  <button
                    key={date.date}
                    onClick={() => setSelectedDate(date.date)}
                    className={`flex-shrink-0 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                      selectedDate === date.date
                        ? "gradient-gold text-secondary-foreground"
                        : "bg-card text-foreground shadow-card"
                    }`}
                  >
                    {date.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h3 className="font-medium text-foreground mb-3 flex items-center gap-2">
                <Clock size={16} className="text-blyss-gold" />
                Horaire
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {availableTimes.map((time) => (
                  <button
                    key={time}
                    onClick={() => setSelectedTime(time)}
                    className={`px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                      selectedTime === time
                        ? "gradient-gold text-secondary-foreground"
                        : "bg-card text-foreground shadow-card"
                    }`}
                  >
                    {time}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="animate-slide-up">
            <h1 className="font-display text-2xl font-semibold text-foreground mb-2">
              Récapitulatif
            </h1>
            <p className="text-muted-foreground mb-6">Vérifie ta réservation</p>

            <div className="bg-card rounded-2xl p-4 shadow-card mb-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Prestation</span>
                  <span className="font-medium text-foreground">{selectedServiceData?.name}</span>
                </div>
                <div className="h-px bg-border" />
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Date</span>
                  <span className="font-medium text-foreground">
                    {availableDates.find(d => d.date === selectedDate)?.label}
                  </span>
                </div>
                <div className="h-px bg-border" />
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Horaire</span>
                  <span className="font-medium text-foreground">{selectedTime}</span>
                </div>
                <div className="h-px bg-border" />
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Durée</span>
                  <span className="font-medium text-foreground">{selectedServiceData?.duration}</span>
                </div>
                <div className="h-px bg-border" />
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground">Total</span>
                  <span className="font-bold text-xl text-foreground">{selectedServiceData?.price}€</span>
                </div>
              </div>
            </div>

            <h3 className="font-medium text-foreground mb-3">Mode de paiement</h3>
            <div className="space-y-3">
              <button
                onClick={() => setPaymentMethod("on-site")}
                className={`w-full bg-card rounded-2xl p-4 shadow-card text-left flex items-center gap-4 transition-all ${
                  paymentMethod === "on-site" ? "ring-2 ring-blyss-gold" : ""
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-blyss-gold-light flex items-center justify-center">
                  <CreditCard size={20} className="text-blyss-gold" />
                </div>
                <div className="flex-1">
                  <h4 className="font-medium text-foreground">Payer sur place</h4>
                  <p className="text-xs text-muted-foreground">Espèces, carte bancaire</p>
                </div>
                {paymentMethod === "on-site" && (
                  <div className="w-6 h-6 rounded-full bg-blyss-gold flex items-center justify-center">
                    <Check size={14} className="text-secondary-foreground" />
                  </div>
                )}
              </button>

              <button
                onClick={() => setPaymentMethod("online")}
                className={`w-full bg-card rounded-2xl p-4 shadow-card text-left flex items-center gap-4 transition-all ${
                  paymentMethod === "online" ? "ring-2 ring-blyss-gold" : ""
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-blyss-gold-light flex items-center justify-center">
                  <Smartphone size={20} className="text-blyss-gold" />
                </div>
                <div className="flex-1">
                  <h4 className="font-medium text-foreground">Payer en ligne</h4>
                  <p className="text-xs text-muted-foreground">Carte, Apple Pay, Google Pay</p>
                </div>
                {paymentMethod === "online" && (
                  <div className="w-6 h-6 rounded-full bg-blyss-gold flex items-center justify-center">
                    <Check size={14} className="text-secondary-foreground" />
                  </div>
                )}
              </button>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="animate-slide-up">
            <h1 className="font-display text-2xl font-semibold text-foreground mb-2">
              Paiement
            </h1>
            <p className="text-muted-foreground mb-6">Sécurisé par Stripe</p>

            <div className="bg-card rounded-2xl p-4 shadow-card mb-6">
              <div className="flex items-center justify-between mb-4">
                <span className="text-muted-foreground">Total à payer</span>
                <span className="font-bold text-2xl text-foreground">{selectedServiceData?.price}€</span>
              </div>
              <div className="h-px bg-border mb-4" />
              <p className="text-xs text-muted-foreground text-center">
                En confirmant, tu acceptes nos conditions générales de vente
              </p>
            </div>

            <div className="space-y-3">
              <button className="w-full py-4 rounded-2xl bg-foreground text-background font-medium flex items-center justify-center gap-2">
                 Apple Pay
              </button>
              <button className="w-full py-4 rounded-2xl bg-card border border-border text-foreground font-medium shadow-card">
                Google Pay
              </button>
              <button className="w-full py-4 rounded-2xl gradient-gold text-secondary-foreground font-medium">
                Carte bancaire
              </button>
            </div>
          </div>
        );

      case 5:
        return (
          <div className="animate-scale-in text-center py-8">
            <div className="w-20 h-20 rounded-full gradient-gold flex items-center justify-center mx-auto mb-6">
              <Check size={40} className="text-secondary-foreground" />
            </div>
            <h1 className="font-display text-2xl font-semibold text-foreground mb-2">
              Réservation confirmée ! ✨
            </h1>
            <p className="text-muted-foreground mb-8">
              Tu recevras un rappel avant ton rendez-vous
            </p>

            <div className="bg-card rounded-2xl p-4 shadow-card text-left mb-8">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Prestation</span>
                  <span className="font-medium text-foreground">{selectedServiceData?.name}</span>
                </div>
                <div className="h-px bg-border" />
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Date</span>
                  <span className="font-medium text-foreground">
                    {availableDates.find(d => d.date === selectedDate)?.label}
                  </span>
                </div>
                <div className="h-px bg-border" />
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Horaire</span>
                  <span className="font-medium text-foreground">{selectedTime}</span>
                </div>
                <div className="h-px bg-border" />
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Paiement</span>
                  <span className="font-medium text-foreground">
                    {paymentMethod === "on-site" ? "Sur place" : "Payé"}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={() => navigate("/client")}
              className="w-full py-4 rounded-2xl gradient-gold text-secondary-foreground font-semibold"
            >
              Retour à l'accueil
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-blyss-gold-light flex flex-col max-w-[430px] mx-auto">
      {/* Header */}
      {step < 5 && (
        <div className="px-5 pt-safe-top py-4">
          <button onClick={handleBack} className="touch-button -ml-2 mb-4">
            <ArrowLeft size={24} className="text-foreground" />
          </button>

          {/* Progress bar */}
          <div className="progress-bar bg-blyss-gold/20">
            <div
              className="progress-bar-fill bg-blyss-gold"
              style={{ width: `${(step / totalSteps) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 px-5 py-4">
        {renderStep()}
      </div>

      {/* CTA Button */}
      {step < 5 && step !== 4 && (
        <div className="px-5 pb-8 safe-bottom">
          <button
            onClick={handleNext}
            disabled={!isStepValid()}
            className="w-full py-4 rounded-2xl gradient-gold text-secondary-foreground font-semibold text-lg shadow-elevated disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-transform"
          >
            {step === 3 && paymentMethod === "on-site" ? "Confirmer" : "Continuer"}
          </button>
        </div>
      )}
    </div>
  );
};

export default ClientBooking;
