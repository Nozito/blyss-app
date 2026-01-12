import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Check,
  Clock,
  Calendar as CalendarIcon,
  CreditCard,
  Smartphone,
  Sparkles
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
          <motion.div
            className="space-y-6"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
          >
            <div>
              <h1 className="font-display text-3xl font-bold text-foreground mb-2">
                Choisis ta prestation
              </h1>
              <p className="text-muted-foreground">
                Commence par le soin qui te fait envie
              </p>
            </div>
            <div className="space-y-3">
              {services.map((service, index) => {
                const isSelected = selectedService === service.id;
                return (
                  <motion.button
                    key={service.id}
                    onClick={() => setSelectedService(service.id)}
                    className={`
                      w-full bg-card rounded-2xl p-4 
                      shadow-lg shadow-black/5 border-2
                      text-left transition-all duration-300
                      hover:shadow-xl hover:-translate-y-0.5
                      active:scale-[0.98]
                      ${isSelected ? "border-primary bg-primary/5" : "border-muted"}
                    `}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1, duration: 0.5 }}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1">
                        <h3 className="font-semibold text-sm text-foreground mb-1.5">
                          {service.name}
                        </h3>
                        <div className="flex items-center gap-2">
                          <Clock size={12} className="text-primary" />
                          <span className="text-xs text-muted-foreground">
                            {service.duration}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-lg text-foreground">
                          {service.price}€
                        </span>
                        <div
                          className={`
                            w-6 h-6 rounded-full flex items-center justify-center
                            transition-all duration-300
                            ${isSelected ? "bg-primary" : "bg-muted"}
                          `}
                        >
                          {isSelected && (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{ type: "spring", stiffness: 300 }}
                            >
                              <Check size={14} className="text-primary-foreground" />
                            </motion.div>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        );

      case 2:
        return (
          <motion.div
            className="space-y-6"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
          >
            <div>
              <h1 className="font-display text-3xl font-bold text-foreground mb-2">
                Quand ?
              </h1>
              <p className="text-muted-foreground">
                Choisis la date et l'horaire qui t'arrangent
              </p>
            </div>

            {/* Date */}
            <section className="space-y-3">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <CalendarIcon size={18} className="text-primary" />
                Date
              </h3>
              <div className="space-y-2">
                {availableDates.map((d) => {
                  const isSelected =
                    selectedDate &&
                    parseDate(d.date).toDateString() === selectedDate.toDateString();
                  return (
                    <button
                      key={d.date}
                      onClick={() => setSelectedDate(parseDate(d.date))}
                      className={`
                        w-full rounded-2xl px-5 py-4 text-base font-medium
                        transition-all duration-300
                        ${
                          isSelected
                            ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30"
                            : "bg-card text-foreground border border-muted hover:bg-muted/50"
                        }
                      `}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Time */}
            <section className="space-y-3">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <Clock size={18} className="text-primary" />
                Horaire
              </h3>
              <div className="grid grid-cols-3 gap-3">
                {availableTimes.map((time) => {
                  const isSelected = selectedTime === time;
                  return (
                    <button
                      key={time}
                      onClick={() => setSelectedTime(time)}
                      className={`
                        rounded-2xl px-4 py-3 text-sm font-semibold
                        transition-all duration-300
                        ${
                          isSelected
                            ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30"
                            : "bg-card text-foreground border border-muted hover:bg-muted/50"
                        }
                      `}
                    >
                      {time}
                    </button>
                  );
                })}
              </div>
            </section>
          </motion.div>
        );

      case 3:
        return (
          <motion.div
            className="space-y-6"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
          >
            <div>
              <h1 className="font-display text-3xl font-bold text-foreground mb-2">
                Récapitulatif
              </h1>
              <p className="text-muted-foreground">
                Vérifie que tout est bon
              </p>
            </div>

            {/* Summary */}
            <div className="bg-card rounded-3xl p-6 shadow-lg shadow-black/5 border border-muted space-y-4">
              <SummaryRow label="Prestation" value={selectedServiceData?.name} />
              <Divider />
              <SummaryRow label="Date" value={selectedDateLabel} />
              <Divider />
              <SummaryRow label="Horaire" value={selectedTime} />
              <Divider />
              <SummaryRow label="Durée" value={selectedServiceData?.duration} />
              <Divider />
              <div className="flex items-center justify-between pt-2">
                <span className="text-sm text-muted-foreground">Total</span>
                <span className="font-bold text-2xl text-foreground">
                  {selectedServiceData?.price}€
                </span>
              </div>
            </div>

            {/* Payment mode */}
            <section className="space-y-3">
              <h3 className="font-semibold text-foreground">Mode de paiement</h3>
              <div className="space-y-3">
                <PaymentChoice
                  selected={paymentMethod === "on-site"}
                  onClick={() => setPaymentMethod("on-site")}
                  icon={<CreditCard size={20} className="text-primary" />}
                  title="Payer sur place"
                  subtitle="Espèces, carte bancaire"
                />
                <PaymentChoice
                  selected={paymentMethod === "online"}
                  onClick={() => setPaymentMethod("online")}
                  icon={<Smartphone size={20} className="text-primary" />}
                  title="Payer en ligne"
                  subtitle="Carte, Apple Pay, Google Pay"
                />
              </div>
            </section>
          </motion.div>
        );

      case 4:
        return (
          <motion.div
            className="space-y-6"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
          >
            <div>
              <h1 className="font-display text-3xl font-bold text-foreground mb-2">
                Paiement sécurisé
              </h1>
              <p className="text-muted-foreground">
                Termine le paiement pour confirmer
              </p>
            </div>

            {/* Summary */}
            <div className="bg-card rounded-3xl p-5 shadow-lg shadow-black/5 border border-muted space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total à payer</span>
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
              {/* Apple Pay */}
              <button
                onClick={() => handlePayment("apple-pay")}
                className="
                  w-full h-14 rounded-2xl
                  bg-black text-white font-semibold
                  shadow-lg hover:shadow-xl
                  transition-all duration-300
                  active:scale-[0.98]
                  flex items-center justify-center
                "
              >
                <svg className="h-7" viewBox="0 0 165.52 105.97" fill="white">
                  <path d="M150.7,0H14.82C14.17,0,13.53,0,12.88,0s-1.3,0-2,.05A19.14,19.14,0,0,0,7.07.78,11.85,11.85,0,0,0,3.63,2.5,11.62,11.62,0,0,0,1.91,4.22,11.49,11.49,0,0,0,.19,7.65,18.61,18.61,0,0,0,0,10.44c0,.67,0,1.34,0,2V93.5c0,.67,0,1.34,0,2a18.61,18.61,0,0,0,.19,2.79,11.49,11.49,0,0,0,1.72,3.43,11.62,11.62,0,0,0,1.72,1.72,11.85,11.85,0,0,0,3.44,1.72,19.14,19.14,0,0,0,3.78.73c.66,0,1.31,0,2,.05s1.3,0,2,0H150.7c.66,0,1.32,0,2,0s1.31,0,2-.05a19.14,19.14,0,0,0,3.78-.73,12.35,12.35,0,0,0,5.16-3.44,11.62,11.62,0,0,0,1.72-1.72,11.49,11.49,0,0,0,1.72-3.43,18.61,18.61,0,0,0,.19-2.79c0-.66,0-1.33,0-2s0-1.33,0-2V12.44c0-.67,0-1.33,0-2s0-1.34,0-2a18.61,18.61,0,0,0-.19-2.79,11.49,11.49,0,0,0-1.72-3.43,12.35,12.35,0,0,0-5.16-3.44A19.14,19.14,0,0,0,154.67.05c-.65,0-1.31,0-2,0S152,0,151.33,0Z"/>
                  <path d="M36.37,43.56c0-4.82,4.05-7.11,4.24-7.22a11.46,11.46,0,0,0-9-4.86c-3.78-.39-7.43,2.26-9.36,2.26s-4.94-2.21-8.13-2.14a12,12,0,0,0-10.1,6.16c-4.34,7.51-1.11,18.57,3.06,24.64,2.06,3,4.49,6.31,7.67,6.19s4.31-2,8.1-2,4.85,2,8.12,1.95,5.46-3,7.48-6.05a26.94,26.94,0,0,0,3.41-6.94A10.85,10.85,0,0,1,36.37,43.56Z" fill="white"/>
                  <path d="M30,27.19a10.76,10.76,0,0,0,2.46-7.72,10.92,10.92,0,0,0-7.06,3.66,10.22,10.22,0,0,0-2.51,7.42A9,9,0,0,0,30,27.19Z" fill="white"/>
                  <path d="M63.71,67.06H60.18L58.34,61.3H50.42l-1.75,5.76H45.3l7.87-24.46h3.76Zm-5.36-8.22L56.61,52c-.19-.57-.54-1.87-1.06-3.92h-.08c-.23,1-.56,2.34-1,3.92L52.8,58.84Z" fill="white"/>
                  <path d="M81.28,58c0,3-.81,5.37-2.42,7.11a7.75,7.75,0,0,1-6.07,2.61,6.36,6.36,0,0,1-5.76-3.07h-.08V74.9H64v-25a36.93,36.93,0,0,0-.16-3.75h2.64l.17,2.83h.07a8,8,0,0,1,7.13-3.32,7.67,7.67,0,0,1,6,2.67C80.53,50.15,81.28,53.49,81.28,58Zm-3,0c0-3-.62-5.43-1.87-7.3a5.89,5.89,0,0,0-5-2.41,5.69,5.69,0,0,0-3.88,1.5,6.47,6.47,0,0,0-2,4.12,7.44,7.44,0,0,0-.13,1.36v3.35a6.77,6.77,0,0,0,1.77,4.85,5.78,5.78,0,0,0,4.37,1.92,5.84,5.84,0,0,0,5-2.42C77.68,63.63,78.3,61.18,78.3,58Z" fill="white"/>
                  <path d="M99.38,58c0,3-.81,5.37-2.42,7.11a7.75,7.75,0,0,1-6.07,2.61,6.36,6.36,0,0,1-5.76-3.07h-.08V74.9h-3V49.9a36.93,36.93,0,0,0-.16-3.75h2.64l.17,2.83h.07a8,8,0,0,1,7.13-3.32,7.67,7.67,0,0,1,6,2.67C98.63,50.15,99.38,53.49,99.38,58Zm-3,0c0-3-.62-5.43-1.87-7.3a5.89,5.89,0,0,0-5-2.41,5.69,5.69,0,0,0-3.88,1.5,6.47,6.47,0,0,0-2,4.12,7.44,7.44,0,0,0-.13,1.36v3.35a6.77,6.77,0,0,0,1.77,4.85,5.78,5.78,0,0,0,4.37,1.92,5.84,5.84,0,0,0,5-2.42C95.78,63.63,96.4,61.18,96.4,58Z" fill="white"/>
                  <path d="M112.83,67.06h-3V42.6h3Z" fill="white"/>
                  <path d="M133.27,58.14a10.79,10.79,0,0,1-2.81,7.79,9.41,9.41,0,0,1-7,2.76,9.07,9.07,0,0,1-7.17-3.09q-2.72-3.09-2.72-8.28a10.82,10.82,0,0,1,2.86-7.83,9.54,9.54,0,0,1,7.1-2.83,9.19,9.19,0,0,1,7.08,3Q133.27,52.83,133.27,58.14Zm-3.08.21c0-2.94-.64-5.33-1.93-7.18a6.34,6.34,0,0,0-5.39-2.77,6.45,6.45,0,0,0-5.5,2.77c-1.28,1.85-1.92,4.29-1.92,7.32,0,2.94.64,5.33,1.92,7.18a6.41,6.41,0,0,0,5.46,2.78,6.33,6.33,0,0,0,5.4-2.74C129.55,63.81,130.19,61.38,130.19,58.35Z" fill="white"/>
                  <path d="M150.51,67.06l-.25-2.17h-.09a8.37,8.37,0,0,1-3,1.92,10.53,10.53,0,0,1-3.84.71,7.14,7.14,0,0,1-5.15-1.8,6.15,6.15,0,0,1-1.88-4.68c0-4,3.23-6,9.65-6l3.48-.08V53.52c0-1.39-.31-2.46-.94-3.21a4.16,4.16,0,0,0-3.21-1.13,11.21,11.21,0,0,0-5.69,1.64l-.9-2.13a13.71,13.71,0,0,1,6.89-1.81,7.12,7.12,0,0,1,5.06,1.65,6.61,6.61,0,0,1,1.73,5v9.42a25.32,25.32,0,0,0,.21,3.78Zm-.46-8.18-2.83.08c-2,.06-3.45.41-4.37,1.06a3.25,3.25,0,0,0-1.39,2.92,3.29,3.29,0,0,0,1.06,2.55,4.17,4.17,0,0,0,2.84.95,5.67,5.67,0,0,0,3.62-1.26,4.14,4.14,0,0,0,1.56-3.32Z" fill="white"/>
                  <path d="M164.27,50.64l-7,16.42H154.5l2.6-6.09-6.69-10.33h3.37l3.44,5.89c.63,1.07,1.15,2,1.54,2.8h.09a29.59,29.59,0,0,1,1.5-2.8l3.55-5.89Z" fill="white"/>
                </svg>
              </button>

              {/* Google Pay */}
              <button
                onClick={() => handlePayment("google-pay")}
                className="
                  w-full h-14 rounded-2xl
                  bg-white border-2 border-muted text-foreground font-semibold
                  shadow-lg hover:shadow-xl
                  transition-all duration-300
                  active:scale-[0.98]
                  flex items-center justify-center
                "
              >
                <svg className="h-6" viewBox="0 0 122 40" fill="none">
                  <path d="M61.7 20.8v9.8h-3.1V6h8.2c2 0 3.9.8 5.2 2.2 1.4 1.4 2.2 3.3 2.2 5.3 0 2-.8 3.9-2.2 5.3-1.4 1.4-3.3 2.2-5.2 2.2h-5.1v-.2zm0-11.7v8.6h5.2c1.2 0 2.3-.5 3.1-1.3.8-.8 1.3-2 1.3-3.1 0-1.2-.5-2.3-1.3-3.1-.8-.8-2-1.3-3.1-1.3h-5.2v.2z" fill="#3C4043"/>
                  <path d="M79.6 15.2c2.2 0 4 .8 5.3 2.3.9.9 1.4 2 1.7 3.2l-10.4 4.3c.8 1.5 2 2.3 3.7 2.3 1.7 0 2.9-.8 3.6-2.3l2.6 1.7c-1.2 2.2-3.5 3.6-6.2 3.6-2.2 0-4.3-.8-5.8-2.4-1.6-1.6-2.4-3.7-2.4-6s.8-4.4 2.4-6c1.6-1.6 3.7-2.4 5.8-2.4l-.3.7zm-4 6c0 .9.3 1.8.9 2.5.6.7 1.4 1.1 2.3 1.1.9 0 1.8-.4 2.3-1.1.6-.7.9-1.6.9-2.5v-.2L76 23.5c-.9-.4-1.5-1.3-1.5-2.3 0-.9.5-1.7 1.3-2.1.8-.4 1.7-.4 2.5 0l3.5 1.5c-.5-1.8-2-3.1-3.9-3.1-1.2 0-2.3.5-3.1 1.3-.8.8-1.2 1.9-1.2 3.1v.3z" fill="#3C4043"/>
                  <path d="M93.5 30.3c-1.8 0-3.5-.5-5-1.5l1.5-2.5c1.1.7 2.4 1.1 3.7 1.1 1.3 0 2.5-.6 3.2-1.6.7-1 1.1-2.2 1.1-3.5v-.9h-.1c-.9 1.2-2.4 2-3.9 2-1.7 0-3.3-.7-4.5-1.9-1.2-1.2-1.9-2.9-1.9-4.6 0-1.7.7-3.4 1.9-4.6 1.2-1.2 2.8-1.9 4.5-1.9 1.6 0 3 .7 3.9 2h.1v-1.5h3v13.2c0 2.3-.8 4.4-2.3 5.9-1.5 1.5-3.6 2.3-5.8 2.3h.6zm.3-11.4c.9 0 1.8-.4 2.4-1 .6-.7 1-1.5 1-2.5 0-1-.4-1.8-1-2.5-.6-.7-1.5-1-2.4-1-.9 0-1.8.4-2.4 1-.6.7-1 1.5-1 2.5 0 1 .4 1.8 1 2.5.6.7 1.5 1 2.4 1z" fill="#3C4043"/>
                  <path d="M106.2 0c.9 0 1.6.7 1.6 1.6v28c0 .9-.7 1.6-1.6 1.6-.9 0-1.6-.7-1.6-1.6v-28c0-.9.7-1.6 1.6-1.6z" fill="#3C4043"/>
                  <path d="M119.9 24.1c1.7 0 3.1 1.4 3.1 3.1s-1.4 3.1-3.1 3.1-3.1-1.4-3.1-3.1 1.4-3.1 3.1-3.1z" fill="#3C4043"/>
                  <path fillRule="evenodd" clipRule="evenodd" d="M34.8 18.2c0-.8-.1-1.6-.2-2.4H20v4.5h8.3c-.4 1.9-1.4 3.5-3 4.6v3.8h4.9c2.8-2.6 4.4-6.4 4.4-10.9l.2.4z" fill="#4285F4"/>
                  <path fillRule="evenodd" clipRule="evenodd" d="M20 35c4.1 0 7.5-1.4 10-3.7l-4.9-3.8c-1.4.9-3.1 1.5-5.1 1.5-3.9 0-7.3-2.6-8.5-6.2H6.4v3.9C8.9 31.4 14.1 35 20 35z" fill="#34A853"/>
                  <path fillRule="evenodd" clipRule="evenodd" d="M11.5 22.8c-.3-.9-.5-1.9-.5-2.8s.2-1.9.5-2.8v-3.9H6.4c-1 2-1.6 4.2-1.6 6.7s.6 4.7 1.6 6.7l5.1-3.9z" fill="#FBBC04"/>
                  <path fillRule="evenodd" clipRule="evenodd" d="M20 11.2c2.2 0 4.2.8 5.7 2.3l4.3-4.3C27.5 6.8 24.1 5 20 5c-5.9 0-11.1 3.6-13.6 8.8l5.1 3.9c1.2-3.6 4.6-6.2 8.5-6.2v-.3z" fill="#EA4335"/>
                </svg>
              </button>

              {/* Carte bancaire */}
              <button
                onClick={() => handlePayment("card")}
                className="
                  w-full h-14 rounded-2xl
                  bg-primary text-primary-foreground font-semibold
                  shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40
                  transition-all duration-300
                  active:scale-[0.98]
                  flex items-center justify-center gap-2
                "
              >
                <CreditCard size={20} />
                Carte bancaire
              </button>
            </div>

            <p className="text-xs text-muted-foreground text-center">
              Paiement sécurisé. Tu recevras un reçu par email
            </p>
          </motion.div>
        );

      case 5:
        return (
          <motion.div
            className="text-center space-y-6 py-12"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, type: "spring" }}
          >
            <motion.div
              className="w-24 h-24 rounded-full bg-primary flex items-center justify-center mx-auto shadow-2xl shadow-primary/40"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            >
              <Check size={48} className="text-primary-foreground" />
            </motion.div>
            <div>
              <div className="flex items-center justify-center gap-2 mb-2">
                <h1 className="font-display text-3xl font-bold text-foreground">
                  Réservation confirmée
                </h1>
                <Sparkles className="w-6 h-6 text-primary" />
              </div>
              <p className="text-muted-foreground max-w-sm mx-auto">
                Tu recevras une confirmation et un rappel avant ton rendez‑vous
              </p>
            </div>
            <div className="bg-card rounded-3xl p-6 shadow-lg shadow-black/5 border border-muted text-left space-y-4">
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
              className="
                w-full h-14 rounded-2xl
                bg-primary text-primary-foreground font-semibold
                shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40
                transition-all duration-300
                active:scale-[0.98]
              "
            >
              Retour à l'accueil
            </button>
          </motion.div>
        );

      default:
        return null;
    }
  };

  return (
    <MobileLayout showNav={false}>
      <div className="flex flex-col flex-1 min-h-screen bg-background px-6">
        {/* Header + progress */}
        {step < 5 && (
          <header className="pt-6 pb-4">
            <button
              onClick={handleBack}
              className="
                w-11 h-11 rounded-2xl bg-card border border-muted
                flex items-center justify-center mb-4
                hover:bg-muted/50
                transition-all duration-300
                active:scale-95
              "
            >
              <ArrowLeft size={20} className="text-foreground" />
            </button>
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-primary"
                initial={{ width: 0 }}
                animate={{ width: `${(step / totalSteps) * 100}%` }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
          </header>
        )}

        {/* Content */}
        <main className="flex-1 py-4">
          <AnimatePresence mode="wait">{renderStep()}</AnimatePresence>
        </main>

        {/* Bottom CTA */}
        {step < 5 && step !== 4 && (
          <footer className="pb-6 pt-4">
            <button
              onClick={handleNext}
              disabled={!isStepValid()}
              className="
                w-full h-14 rounded-2xl
                bg-primary text-primary-foreground font-semibold text-base
                shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-all duration-300
                active:scale-[0.98]
              "
            >
              {step === 3 && paymentMethod === "on-site" ? "Confirmer" : "Continuer"}
            </button>
          </footer>
        )}
      </div>
    </MobileLayout>
  );
};

/* Helpers UI */

type SummaryRowProps = {
  label: string;
  value?: string;
  strong?: boolean;
};

const SummaryRow = ({ label, value }: SummaryRowProps) => (
  <div className="flex items-center justify-between gap-4">
    <span className="text-sm text-muted-foreground">{label}</span>
    <span className="text-sm font-medium text-foreground">{value}</span>
  </div>
);

const Divider = () => <div className="h-px bg-muted" />;

type PaymentChoiceProps = {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
};

const PaymentChoice = ({ selected, onClick, icon, title, subtitle }: PaymentChoiceProps) => (
  <button
    onClick={onClick}
    className={`
      w-full bg-card rounded-2xl p-4
      shadow-lg shadow-black/5 border-2
      text-left flex items-center gap-3
      transition-all duration-300
      hover:shadow-xl hover:-translate-y-0.5
      active:scale-[0.98]
      ${selected ? "border-primary bg-primary/5" : "border-muted"}
    `}
  >
    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
      {icon}
    </div>
    <div className="flex-1">
      <h4 className="font-semibold text-sm text-foreground mb-0.5">{title}</h4>
      <p className="text-xs text-muted-foreground">{subtitle}</p>
    </div>
    <div
      className={`
        w-6 h-6 rounded-full flex items-center justify-center
        transition-all duration-300
        ${selected ? "bg-primary" : "bg-muted"}
      `}
    >
      {selected && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 300 }}
        >
          <Check size={14} className="text-primary-foreground" />
        </motion.div>
      )}
    </div>
  </button>
);

export default ClientBooking;
