import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  Clock,
  Calendar as CalendarIcon,
  CreditCard,
  Smartphone
} from "lucide-react";
import MobileLayout from "@/components/MobileLayout";

const services = [
  { id: 1, name: "Pose complète gel", duration: "1h30", price: 65 },
  { id: 2, name: "Remplissage", duration: "1h", price: 45 },
  { id: 3, name: "Manucure simple", duration: "45min", price: 35 },
  { id: 4, name: "Nail art", duration: "2h", price: 85 }
];

const availableDates = [
  { date: "2024-01-15", label: "Lun 15 Jan" },
  { date: "2024-01-16", label: "Mar 16 Jan" },
  { date: "2024-01-17", label: "Mer 17 Jan" },
  { date: "2024-01-18", label: "Jeu 18 Jan" },
  { date: "2024-01-19", label: "Ven 19 Jan" }
];

const availableTimes = ["09:00", "10:30", "14:00", "15:30", "17:00"];

const parseDate = (dateStr: string) => {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const ClientBooking = () => {
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [selectedService, setSelectedService] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null);

  const totalSteps = 5;

  const selectedServiceData = useMemo(
    () => services.find((s) => s.id === selectedService),
    [selectedService]
  );

  const availableDateObjs = useMemo(
    () =>
      availableDates.map((d) => ({
        ...d,
        dateObj: parseDate(d.date)
      })),
    []
  );

  const selectedDateLabel = useMemo(() => {
    if (!selectedDate) return "";
    const found = availableDateObjs.find(
      (d) =>
        d.dateObj.getFullYear() === selectedDate.getFullYear() &&
        d.dateObj.getMonth() === selectedDate.getMonth() &&
        d.dateObj.getDate() === selectedDate.getDate()
    );
    return found?.label ?? "";
  }, [selectedDate, availableDateObjs]);

  const handleNext = () => {
    if (step === 5) return;
    if (step === 3 && paymentMethod === "on-site") {
      setStep(5);
      return;
    }
    setStep((prev) => prev + 1);
  };

  const handleBack = () => {
    if (step === 1) {
      navigate(-1);
    } else if (step === 5 && paymentMethod === "on-site") {
      setStep(3);
    } else {
      setStep((prev) => prev - 1);
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
      default:
        return true;
    }
  };

  const handlePayment = (method: string) => {
    console.log(`Processing ${method} payment`);
    setStep(5);
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <div className="animate-fade-in space-y-6">
            <div>
              <h1 className="font-display text-2xl font-semibold text-foreground mb-1">
                Choisis ta prestation
              </h1>
              <p className="text-muted-foreground text-sm">
                Commence par le soin qui te fait envie.
              </p>
            </div>
            <div className="space-y-3">
              {services.map((service) => {
                const isSelected = selectedService === service.id;
                return (
                  <button
                    key={service.id}
                    onClick={() => setSelectedService(service.id)}
                    className={cnServiceCard(isSelected)}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-sm text-foreground">
                          {service.name}
                        </h3>
                        <div className="flex items-center gap-1 mt-1">
                          <Clock
                            size={12}
                            className="text-muted-foreground"
                          />
                          <span className="text-xs text-muted-foreground">
                            {service.duration}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-lg text-foreground">
                          {service.price}€
                        </span>
                        {isSelected && (
                          <div className="w-6 h-6 rounded-full bg-blyss-gold flex items-center justify-center">
                            <Check
                              size={14}
                              className="text-secondary-foreground"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );

      case 2:
        return (
          <div className="py-4 animate-slide-up space-y-6">
            <div>
              <h1 className="font-display text-2xl font-semibold text-foreground mb-1">
                Quand ?
              </h1>
              <p className="text-muted-foreground text-sm">
                Choisis la date et l’horaire qui t’arrangent.
              </p>
            </div>

            {/* Date */}
            <section>
              <h3 className="font-medium text-foreground mb-3 flex items-center gap-2">
                <CalendarIcon size={16} className="text-blyss-gold" />
                Date
              </h3>
              <div className="rounded-2xl p-3 flex flex-col gap-2 bg-[#FBF5F0] max-w-[340px] mx-auto">
                {availableDates.map((d) => {
                  const isSelected =
                    selectedDate &&
                    parseDate(d.date).toDateString() ===
                      selectedDate.toDateString();
                  return (
                    <button
                      key={d.date}
                      onClick={() => setSelectedDate(parseDate(d.date))}
                      className={cnDateButton(isSelected)}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Time */}
            <section>
              <h3 className="font-medium text-foreground mb-3 flex items-center gap-2">
                <Clock size={16} className="text-blyss-gold" />
                Horaire
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {availableTimes.map((time) => {
                  const isSelected = selectedTime === time;
                  return (
                    <button
                      key={time}
                      onClick={() => setSelectedTime(time)}
                      className={cnTimeButton(isSelected)}
                    >
                      {time}
                    </button>
                  );
                })}
              </div>
            </section>
          </div>
        );

      case 3:
        return (
          <div className="py-4 animate-slide-up space-y-6">
            <div>
              <h1 className="font-display text-2xl font-semibold text-foreground mb-1">
                Vérifie ta réservation
              </h1>
              <p className="text-muted-foreground text-sm">
                Assure‑toi que tout est bon avant de confirmer.
              </p>
            </div>

            {/* Summary */}
            <div className="bg-card rounded-2xl p-4 shadow-card space-y-3">
              <SummaryRow label="Prestation" value={selectedServiceData?.name} />
              <Divider />
              <SummaryRow label="Date" value={selectedDateLabel} />
              <Divider />
              <SummaryRow label="Horaire" value={selectedTime} />
              <Divider />
              <SummaryRow
                label="Durée"
                value={selectedServiceData?.duration}
              />
              <Divider />
              <SummaryRow
                label="Total"
                value={
                  selectedServiceData ? `${selectedServiceData.price}€` : ""
                }
                strong
              />
            </div>

            {/* Payment mode */}
            <section>
              <h3 className="font-medium text-foreground mb-3">
                Mode de paiement
              </h3>
              <div className="space-y-3">
                <PaymentChoice
                  selected={paymentMethod === "on-site"}
                  onClick={() => setPaymentMethod("on-site")}
                  icon={
                    <CreditCard
                      size={20}
                      className="text-blyss-gold"
                    />
                  }
                  title="Payer sur place"
                  subtitle="Espèces, carte bancaire"
                />
                <PaymentChoice
                  selected={paymentMethod === "online"}
                  onClick={() => setPaymentMethod("online")}
                  icon={
                    <Smartphone
                      size={20}
                      className="text-blyss-gold"
                    />
                  }
                  title="Payer en ligne"
                  subtitle="Carte, Apple Pay, Google Pay"
                />
              </div>
            </section>
          </div>
        );

      case 4:
        return (
          <div className="py-4 animate-slide-up space-y-6">
            <div>
              <h1 className="font-display text-2xl font-semibold text-foreground mb-1">
                Paiement sécurisé
              </h1>
              <p className="text-muted-foreground text-sm">
                Terminer le paiement pour confirmer ta réservation.
              </p>
            </div>

            {/* Sticky summary style bloc */}
            <div className="bg-card rounded-2xl p-4 shadow-card space-y-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-muted-foreground text-sm">
                  Total à payer
                </span>
                <span className="font-bold text-2xl text-foreground">
                  {selectedServiceData?.price}€
                </span>
              </div>
              <Divider />
              <SummaryRow label="Prestation" value={selectedServiceData?.name} />
              <SummaryRow label="Date" value={selectedDateLabel} />
              <SummaryRow label="Horaire" value={selectedTime} />
            </div>

            <div className="space-y-3">
              <button
                onClick={() => handlePayment("apple-pay")}
                className="w-full py-4 rounded-xl bg-foreground text-background font-medium flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
              >
                {/* Apple Pay icon simplifiée */}
                <span className="text-sm"> Pay</span>
              </button>
              <button
                onClick={() => handlePayment("google-pay")}
                className="w-full py-4 rounded-xl bg-card border border-border text-foreground font-medium shadow-card flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
              >
                <span className="text-sm">Google Pay</span>
              </button>
              <button
                onClick={() => handlePayment("card")}
                className="w-full py-4 rounded-xl gradient-gold text-secondary-foreground font-medium active:scale-[0.98] transition-transform"
              >
                Carte bancaire
              </button>
            </div>

            <p className="text-[11px] text-muted-foreground text-center">
              Paiement géré de façon sécurisée. Tu recevras un reçu par email.
            </p>
          </div>
        );

      case 5:
        return (
          <div className="py-8 animate-scale-in text-center space-y-6">
            <div className="w-20 h-20 rounded-full gradient-gold flex items-center justify-center mx-auto">
              <Check size={40} className="text-secondary-foreground" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-semibold text-foreground mb-1">
                Réservation confirmée ✨
              </h1>
              <p className="text-muted-foreground text-sm">
                Tu recevras une confirmation et un rappel avant ton rendez‑vous.
              </p>
            </div>
            <div className="bg-card rounded-2xl p-4 shadow-card text-left space-y-3">
              <SummaryRow label="Prestation" value={selectedServiceData?.name} />
              <Divider />
              <SummaryRow label="Date" value={selectedDateLabel} />
              <Divider />
              <SummaryRow label="Horaire" value={selectedTime} />
              <Divider />
              <SummaryRow
                label="Paiement"
                value={paymentMethod === "on-site" ? "Sur place" : "Payé en ligne"}
              />
            </div>
            <button
              onClick={() => navigate("/client")}
              className="w-full py-4 rounded-xl gradient-gold text-secondary-foreground font-semibold"
            >
              Retour à l’accueil
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
        {/* Header + progress */}
        {step < 5 && (
          <header className="pt-safe-top py-4">
            <button
              onClick={handleBack}
              className="w-9 h-9 rounded-full bg-card/80 backdrop-blur-sm flex items-center justify-center shadow-card active:scale-95 transition-transform mb-4"
            >
              <ArrowLeft size={20} className="text-foreground" />
            </button>
            <div className="h-1.5 w-full rounded-full bg-blyss-gold/15 overflow-hidden">
              <div
                className="h-full rounded-full bg-blyss-gold transition-all duration-300"
                style={{ width: `${(step / totalSteps) * 100}%` }}
              />
            </div>
          </header>
        )}

        {/* Content */}
        <main className="flex-1">{renderStep()}</main>

        {/* Bottom CTA */}
        {step < 5 && step !== 4 && (
          <footer className="pb-8 safe-bottom">
            <button
              onClick={handleNext}
              disabled={!isStepValid()}
              className="w-full py-4 rounded-xl gradient-gold text-secondary-foreground font-semibold text-lg shadow-elevated disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-transform"
            >
              {step === 3 && paymentMethod === "on-site"
                ? "Confirmer"
                : "Continuer"}
            </button>
          </footer>
        )}
      </div>
    </MobileLayout>
  );
};

/* Helpers UI */

const cnServiceCard = (selected: boolean) =>
  `w-full bg-card rounded-2xl p-4 shadow-card text-left transition-all ${
    selected ? "ring-2 ring-blyss-gold bg-blyss-gold-light/10" : ""
  }`;

const cnDateButton = (selected: boolean) =>
  `w-full rounded-xl px-4 py-3 text-base font-medium transition-all ${
    selected ? "bg-blyss-gold text-white" : "bg-[#ececec] text-black"
  }`;

const cnTimeButton = (selected: boolean) =>
  `rounded-xl px-4 py-3 text-sm font-medium shadow-card transition-all ${
    selected ? "gradient-gold text-secondary-foreground" : "bg-card text-foreground"
  }`;

type SummaryRowProps = {
  label: string;
  value?: string;
  strong?: boolean;
};

const cn = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(" ");

const SummaryRow = ({ label, value, strong }: SummaryRowProps) => (
  <div className="flex items-center justify-between gap-4">
    <span className="text-xs text-muted-foreground">{label}</span>
    <span
      className={cn(
        "text-sm text-foreground",
        strong && "font-semibold text-base"
      )}
    >
      {value}
    </span>
  </div>
);

const Divider = () => <div className="h-px bg-border" />;

type PaymentChoiceProps = {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
};

const PaymentChoice = ({
  selected,
  onClick,
  icon,
  title,
  subtitle
}: PaymentChoiceProps) => (
  <button
    onClick={onClick}
    className={`w-full bg-card rounded-2xl p-4 shadow-card text-left flex items-center gap-4 transition-all ${
      selected ? "ring-2 ring-blyss-gold bg-blyss-gold-light/10" : ""
    }`}
  >
    <div className="w-10 h-10 rounded-full bg-blyss-gold-light flex items-center justify-center">
      {icon}
    </div>
    <div className="flex-1">
      <h4 className="font-medium text-sm text-foreground">{title}</h4>
      <p className="text-[11px] text-muted-foreground">{subtitle}</p>
    </div>
    {selected && (
      <div className="w-6 h-6 rounded-full bg-blyss-gold flex items-center justify-center">
        <Check size={14} className="text-secondary-foreground" />
      </div>
    )}
  </button>
);

export default ClientBooking;
