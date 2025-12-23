import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, Clock, Calendar as CalendarIcon, CreditCard, Smartphone } from "lucide-react";
import MobileLayout from "@/components/MobileLayout";

const ClientBooking = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [selectedService, setSelectedService] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
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
      return;
    }
    if (step === 3 && paymentMethod === "on-site") {
      setStep(5);
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

  const handlePayment = (method: string) => {
    console.log(`Processing ${method} payment`);
    setStep(5);
  };

  const renderStep = () => {
    const availableDateObjs = availableDates.map(d => {
      const [year, month, day] = d.date.split('-').map(Number);
      return { ...d, dateObj: new Date(year, month - 1, day) };
    });
    const getAvailableDateObj = (date: Date) => {
      return availableDateObjs.find(
        d =>
          d.dateObj.getFullYear() === date.getFullYear() &&
          d.dateObj.getMonth() === date.getMonth() &&
          d.dateObj.getDate() === date.getDate()
      );
    };
    const parseDate = (dateStr: string) => {
      const [year, month, day] = dateStr.split("-").map(Number);
      return new Date(year, month - 1, day);
    };
    const selectedDateLabel = selectedDate
      ? (() => {
        const found = getAvailableDateObj(selectedDate);
        return found ? found.label : "";
      })()
      : "";

    switch (step) {
      case 1:
        return (
          <div className="py-6 animate-fade-in">

            <h1 className="font-display text-2xl font-semibold text-foreground mb-2">
              Choisis ta prestation
            </h1>
            <p className="text-muted-foreground mb-6">Quel soin te ferait plaisir ?</p>
            <div className="space-y-3">
              {services.map((service) => (
                <button
                  key={service.id}
                  onClick={() => setSelectedService(service.id)}
                  className={`w-full bg-card rounded-xl p-4 shadow-card text-left transition-all ${selectedService === service.id ? "ring-2 ring-blyss-gold" : ""
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
      case 2: {
        const handleDateClick = (dateStr: string) => {
          setSelectedDate(parseDate(dateStr));
        };
        const isSelectedDate = (dateStr: string) => {
          if (!selectedDate) return false;
          const d = parseDate(dateStr);
          return (
            d.getFullYear() === selectedDate.getFullYear() &&
            d.getMonth() === selectedDate.getMonth() &&
            d.getDate() === selectedDate.getDate()
          );
        };
        return (
          <div className="animate-slide-up">
            <h1 className="font-display text-2xl font-semibold text-foreground mb-2">Quand ?</h1>
            <p className="text-muted-foreground mb-6">Choisis une date et un horaire</p>
            <div className="mb-6">
              <h3 className="font-medium text-foreground mb-3 flex items-center gap-2">
                <CalendarIcon size={16} className="text-blyss-gold" />
                Date
              </h3>
              <div
                className="rounded-2xl p-3 flex flex-col gap-2 bg-[#FBF5F0] max-w-[340px] mx-auto"
              >
                {availableDates.map((d) => (
                  <button
                    key={d.date}
                    onClick={() => handleDateClick(d.date)}
                    className={`w-full rounded-xl px-4 py-3 text-base font-medium transition-all
                      ${isSelectedDate(d.date)
                        ? "bg-blyss-gold text-white"
                        : "bg-[#ececec] text-black"
                      }
                    `}
                  >
                    {d.label}
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
                    className={`transition-all rounded-xl shadow-card px-4 py-3 text-sm font-medium ${selectedTime === time
                        ? "gradient-gold text-secondary-foreground"
                        : "bg-card text-foreground"
                      }`}
                  >
                    {time}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      }

      case 3:
        return (
          <div className="animate-slide-up">
            <h1 className="font-display text-2xl font-semibold text-foreground mb-2">
              Récapitulatif
            </h1>
            <p className="text-muted-foreground mb-6">Vérifie ta réservation</p>
            <div className="bg-card rounded-xl p-4 shadow-card mb-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Prestation</span>
                  <span className="font-medium text-foreground">{selectedServiceData?.name}</span>
                </div>
                <div className="h-px bg-border" />
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Date</span>
                  <span className="font-medium text-foreground">{selectedDateLabel}</span>
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
                className={`w-full bg-card rounded-xl p-4 shadow-card text-left flex items-center gap-4 transition-all ${paymentMethod === "on-site" ? "ring-2 ring-blyss-gold" : ""
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
                className={`w-full bg-card rounded-xl p-4 shadow-card text-left flex items-center gap-4 transition-all ${paymentMethod === "online" ? "ring-2 ring-blyss-gold" : ""
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
            <div className="bg-card rounded-xl p-4 shadow-card mb-6">
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
              <button
                onClick={() => handlePayment("apple-pay")}
                className="w-full py-4 rounded-xl bg-foreground text-background font-medium flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                  <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                </svg>
                Apple Pay
              </button>
              <button
                onClick={() => handlePayment("google-pay")}
                className="w-full py-4 rounded-xl bg-card border border-border text-foreground font-medium shadow-card flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Google Pay
              </button>
              <button
                onClick={() => handlePayment("card")}
                className="w-full py-4 rounded-xl gradient-gold text-secondary-foreground font-medium active:scale-[0.98] transition-transform"
              >
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
            <div className="bg-card rounded-xl p-4 shadow-card text-left mb-8">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Prestation</span>
                  <span className="font-medium text-foreground">{selectedServiceData?.name}</span>
                </div>
                <div className="h-px bg-border" />
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Date</span>
                  <span className="font-medium text-foreground">{selectedDateLabel}</span>
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
              className="w-full py-4 rounded-xl gradient-gold text-secondary-foreground font-semibold"
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
    <MobileLayout showNav={false}>
      <div className="flex flex-col flex-1 px-6">
        {step < 5 && (
          <div className="pt-safe-top py-4">
            <button onClick={handleBack} className="touch-button -ml-2 mb-4">
              <ArrowLeft size={24} className="text-foreground" />
            </button>
            <div className="progress-bar bg-blyss-gold/20">
              <div
                className="progress-bar-fill bg-blyss-gold"
                style={{ width: `${(step / totalSteps) * 100}%` }}
              />
            </div>
          </div>
        )}
        <div className="flex-1 py-4">
          {renderStep()}
        </div>
        {step < 5 && step !== 4 && (
          <div className="pb-8 safe-bottom">
            <button
              onClick={handleNext}
              disabled={!isStepValid()}
              className="w-full py-4 rounded-xl gradient-gold text-secondary-foreground font-semibold text-lg shadow-elevated disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-transform"
            >
              {step === 3 && paymentMethod === "on-site" ? "Confirmer" : "Continuer"}
            </button>
          </div>
        )}
      </div>
    </MobileLayout>
  );
};

export default ClientBooking;
