import { useState, useMemo, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Check,
  Clock,
  Calendar as CalendarIcon,
  CreditCard,
  Smartphone,
  Sparkles,
  Loader2,
  ShieldCheck,
  X
} from "lucide-react";
import MobileLayout from "@/components/MobileLayout";
import { useAuth } from '@/contexts/AuthContext';
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { stripePaymentsApi } from "@/services/api";
import { toast } from "sonner";
import { ConditionItem } from "./ProPublicProfile";

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const STRIPE_PK = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
const stripePromise = STRIPE_PK ? loadStripe(STRIPE_PK) : null;

interface Pro {
  id: number;
  first_name: string;
  last_name: string;
  activity_name: string | null;
  city: string | null;
  profile_photo: string | null;
  banner_photo: string | null;
  instagram_account: string | null;
  bio: string | null;
  acceptance_conditions: ConditionItem[] | null;
}

interface Prestation {
  id: number;
  name: string;
  description: string | null;
  price: number;
  duration_minutes: number;
  active: boolean;
}

interface CalendarProps {
  selectedDate: Date | null;
  onSelectDate: (date: Date) => void;
  proId: string;
  availableDates: Set<string>;
}

const Calendar: React.FC<CalendarProps> = ({ selectedDate, onSelectDate, proId, availableDates }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days: (Date | null)[] = [];

    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }

    return days;
  };

  const goToPreviousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  };

  const goToNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
  };

  const isDateInPast = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    return date < today;
  };

  const hasAvailability = (date: Date) => {
  const dateStr = date.toISOString().split('T')[0];
  const has = availableDates.has(dateStr);
  
  return has;
};

  const isDateSelected = (date: Date) => {
    if (!selectedDate) return false;
    return (
      date.getDate() === selectedDate.getDate() &&
      date.getMonth() === selectedDate.getMonth() &&
      date.getFullYear() === selectedDate.getFullYear()
    );
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  const days = getDaysInMonth(currentMonth);

  const canGoPrevious = () => {
    const today = new Date();
    const firstDayOfCurrentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const firstDayOfThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    return firstDayOfCurrentMonth > firstDayOfThisMonth;
  };

  return (
    <div className="bg-card rounded-3xl p-5 shadow-lg shadow-black/5 border border-muted">
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={goToPreviousMonth}
          disabled={!canGoPrevious()}
          className="w-9 h-9 rounded-xl bg-muted/50 hover:bg-muted flex items-center justify-center transition-all disabled:opacity-30 disabled:cursor-not-allowed active:scale-95"
        >
          <ArrowLeft size={18} className="text-foreground" />
        </button>

        <h3 className="text-base font-bold text-foreground">
          {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
        </h3>

        <button
          onClick={goToNextMonth}
          className="w-9 h-9 rounded-xl bg-muted/50 hover:bg-muted flex items-center justify-center transition-all active:scale-95"
        >
          <ArrowLeft size={18} className="text-foreground rotate-180" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-2 mb-2">
        {dayNames.map((day) => (
          <div key={day} className="text-center text-xs font-semibold text-muted-foreground py-2">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-2">
        {days.map((date, index) => {
          if (!date) {
            return <div key={`empty-${index}`} className="aspect-square" />;
          }

          const isPast = isDateInPast(date);
          const available = hasAvailability(date);
          const selected = isDateSelected(date);
          const today = isToday(date);
          
          // ✅ Jour sélectionnable : ni passé, ET avec disponibilités
          const selectable = !isPast && available;
          
          // ✅ Jour sans dispo (futur mais pas de créneaux)
          const noAvailability = !isPast && !available;

          return (
            <div key={date.toISOString()} className="flex flex-col items-center gap-1">
              <motion.button
                onClick={() => selectable && onSelectDate(date)}
                disabled={!selectable}
                className={`
                  w-full aspect-square rounded-xl text-sm font-semibold
                  transition-all duration-300 flex items-center justify-center
                  ${selected 
                    ? 'bg-primary text-white shadow-lg shadow-primary/30 scale-105' 
                    : noAvailability
                      ? 'bg-muted/50 text-muted-foreground/50 cursor-not-allowed'
                      : selectable
                        ? 'bg-background hover:bg-muted/50 text-foreground active:scale-95'
                        : 'bg-transparent text-muted-foreground/30 cursor-not-allowed'
                  }
                  ${today && !selected ? 'ring-2 ring-primary/30' : ''}
                `}
                whileTap={selectable ? { scale: 0.9 } : {}}
              >
                {date.getDate()}
              </motion.button>
              
              {/* ✅ Point indicateur de disponibilité */}
              {available && !selected && (
                <div className="w-1 h-1 rounded-full bg-primary" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Stripe Checkout Form (used inside Elements provider)
const StripeCheckoutForm = ({
  amount,
  onSuccess,
  prestationName,
}: {
  amount: number;
  onSuccess: () => void;
  prestationName?: string;
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setProcessing(true);
    setError(null);

    const { error: submitError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: window.location.origin + "/client/my-booking",
      },
      redirect: "if_required",
    });

    if (submitError) {
      setError(submitError.message || "Erreur lors du paiement");
      setProcessing(false);
    } else {
      onSuccess();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-card rounded-3xl p-5 shadow-lg shadow-black/5 border border-muted space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Total à payer</span>
          <span className="font-bold text-2xl text-foreground">
            {Number(amount).toFixed(2)}€
          </span>
        </div>
        {prestationName && (
          <>
            <div className="h-px bg-muted" />
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-muted-foreground">Prestation</span>
              <span className="text-sm font-medium text-foreground">{prestationName}</span>
            </div>
          </>
        )}
      </div>

      <div className="bg-card rounded-3xl p-5 shadow-lg shadow-black/5 border border-muted">
        <PaymentElement />
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-destructive/5 border border-destructive/20">
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || processing}
        className="
          w-full h-14 rounded-2xl
          bg-primary text-white font-semibold
          shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40
          transition-all duration-300 active:scale-[0.98]
          disabled:opacity-50
          flex items-center justify-center gap-2
        "
      >
        {processing ? (
          <>
            <Loader2 size={20} className="animate-spin" />
            Paiement en cours...
          </>
        ) : (
          <>
            <CreditCard size={20} />
            Payer {Number(amount).toFixed(2)}€
          </>
        )}
      </button>

      <p className="text-xs text-muted-foreground text-center">
        Paiement sécurisé par Stripe
      </p>
    </form>
  );
};

const ClientBooking = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated, token, isLoading: authLoading } = useAuth();

  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [pro, setPro] = useState<Pro | null>(null);
  const [prestations, setPrestations] = useState<Prestation[]>([]);

  const [selectedPrestation, setSelectedPrestation] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [reservationId, setReservationId] = useState<number | null>(null);
  const [depositAmount, setDepositAmount] = useState<number | null>(null);
  const [depositPercentage, setDepositPercentage] = useState<number>(0);

  const totalSteps = 5;

  const [availableSlots, setAvailableSlots] = useState<Array<{
    id: number;
    time: string;
    duration: number;
  }>>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  
  // ✅ NOUVEAU : État pour les jours avec disponibilités
  const [availableDates, setAvailableDates] = useState<Set<string>>(new Set());
  const [currentMonth, setCurrentMonth] = useState(new Date());

  useEffect(() => {
    if (authLoading) return;

    if (!isAuthenticated) {
      const returnUrl = `/client/booking/${id}`;
      localStorage.setItem('returnUrl', returnUrl);

      navigate('/login', {
        replace: true,
        state: {
          message: 'Connectez-vous pour réserver un rendez-vous',
          returnUrl: returnUrl
        }
      });
    }
  }, [isAuthenticated, authLoading, id, navigate]);

  useEffect(() => {
    const fetchData = async () => {
      if (!id || authLoading || !isAuthenticated) {
        return;
      }

      try {
        setIsLoading(true);

        const [proRes, prestationsRes] = await Promise.all([
          fetch(`${API_URL}/api/users/pros/${id}`, { credentials: "include" }),
          fetch(`${API_URL}/api/prestations/pro/${id}`, { credentials: "include" })
        ]);

        if (!proRes.ok || !prestationsRes.ok) {
          throw new Error("Erreur lors du chargement");
        }

        const [proData, prestationsData] = await Promise.all([
          proRes.json(),
          prestationsRes.json()
        ]);

        if (proData.success && proData.data) {
          const proResult = proData.data;
          if (proResult.acceptance_conditions && typeof proResult.acceptance_conditions === "string") {
            proResult.acceptance_conditions = JSON.parse(proResult.acceptance_conditions);
          }
          setPro(proResult);
        } else {
          navigate('/client');
          return;
        }

        if (prestationsData.success && prestationsData.data) {
          const activePrestations = prestationsData.data
            .filter((p: any) => p.active)
            .map((p: any) => ({
              id: p.id,
              name: p.name,
              description: p.description,
              price: Number(p.price),
              duration_minutes: Number(p.duration_minutes),
              active: p.active
            }));

          setPrestations(activePrestations);
        }
      } catch (error) {
        console.error("❌ Erreur lors du chargement:", error);
        toast.error("Impossible de charger les informations. Veuillez réessayer.");
        navigate('/client');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [id, authLoading, isAuthenticated, navigate]);

  // ✅ NOUVEAU : Charger les jours avec disponibilités pour le mois
  useEffect(() => {
    const fetchAvailableDates = async () => {
      if (!id || step !== 2) return;

      try {
        const year = currentMonth.getFullYear();
        const month = String(currentMonth.getMonth() + 1).padStart(2, '0');
        
        const response = await fetch(`${API_URL}/api/slots/available-dates/${id}/${year}-${month}`);
        
        if (!response.ok) {
          throw new Error(`Erreur HTTP ${response.status}`);
        }

        const data = await response.json();

        if (data.success && data.data) {
          // assurer que data.data est un tableau de strings
          const datesArray: string[] = Array.isArray(data.data) ? data.data.map(String) : [];
          setAvailableDates(new Set<string>(datesArray));
        } else {
          setAvailableDates(new Set());
        }
      } catch (error) {
        console.error("Erreur lors du chargement des dates disponibles:", error);
        setAvailableDates(new Set());
      }
    };

    fetchAvailableDates();
  }, [id, currentMonth, step]);



  useEffect(() => {
    const fetchSlots = async () => {
      if (!selectedDate || !id) return;

      setIsLoadingSlots(true);
      try {
        const dateStr = selectedDate.toISOString().split('T')[0];
        const response = await fetch(`${API_URL}/api/slots/available/${id}/${dateStr}`);

        if (!response.ok) {
          throw new Error(`Erreur HTTP ${response.status}`);
        }

        const data = await response.json();

        if (data.success && data.data) {
          setAvailableSlots(data.data);
        } else {
          setAvailableSlots([]);
        }
      } catch (error) {
        console.error("Erreur lors du chargement des créneaux:", error);
        setAvailableSlots([]);
      } finally {
        setIsLoadingSlots(false);
      }
    };

    fetchSlots();
  }, [selectedDate, id]);

  useEffect(() => {
    setSelectedTime(null);
  }, [selectedDate]);

  const selectedPrestationData = useMemo(
    () => prestations.find((p) => p.id === selectedPrestation),
    [selectedPrestation, prestations]
  );

  const formatDuration = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0 && mins > 0) return `${hours}h${mins}`;
    if (hours > 0) return `${hours}h`;
    return `${mins}min`;
  };

  const calculateEndDateTime = (startDate: Date, startTime: string, durationMinutes: number): Date => {
    const [hours, minutes] = startTime.split(':').map(Number);
    const start = new Date(startDate);
    start.setHours(hours, minutes, 0, 0);

    const end = new Date(start.getTime() + durationMinutes * 60000);
    return end;
  };

  const handleNext = () => {
    if (step === 5) return;
    if (step === 3) {
      // Both on-site and online: create reservation first
      handleConfirmBooking();
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
        return selectedPrestation !== null;
      case 2:
        return selectedDate !== null && selectedTime !== null;
      case 3:
        return paymentMethod !== null;
      default:
        return true;
    }
  };

  const handleConfirmBooking = async () => {
    if (!selectedPrestation || !selectedDate || !selectedTime || !id || !selectedPrestationData) {
      toast.error("Veuillez remplir tous les champs.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (!token) {
        toast.error("Votre session a expiré. Veuillez vous reconnecter.");
        navigate('/login');
        return;
      }

      const selectedSlot = availableSlots.find(slot => slot.time === selectedTime);

      const [hours, minutes] = selectedTime.split(':').map(Number);
      const startDateTime = new Date(selectedDate);
      startDateTime.setHours(hours, minutes, 0, 0);

      const endDateTime = calculateEndDateTime(
        selectedDate,
        selectedTime,
        selectedPrestationData.duration_minutes
      );

      // 1. Create reservation via API
      const resaResult = await stripePaymentsApi.createReservation({
        pro_id: Number(id),
        prestation_id: selectedPrestation,
        start_datetime: startDateTime.toISOString().slice(0, 19).replace('T', ' '),
        end_datetime: endDateTime.toISOString().slice(0, 19).replace('T', ' '),
        price: selectedPrestationData.price,
        slot_id: selectedSlot?.id || null,
      });

      if (!resaResult.success || !resaResult.data) {
        throw new Error(resaResult.message || "Erreur lors de la réservation");
      }

      const resaData = resaResult.data;
      setReservationId(resaData.id);
      setDepositPercentage(resaData.deposit_percentage);
      setDepositAmount(resaData.deposit_amount);

      // 2. If on-site payment, go directly to confirmation
      if (paymentMethod === "on-site") {
        setStep(5);
        return;
      }

      // 3. If online payment, create PaymentIntent
      const paymentType = resaData.deposit_percentage === 100 ? "full" : "deposit";
      const intentResult = await stripePaymentsApi.createPaymentIntent({
        reservation_id: resaData.id,
        type: paymentType,
      });

      if (!intentResult.success || !intentResult.data) {
        throw new Error(intentResult.error || intentResult.message || "Erreur lors de la création du paiement");
      }

      setClientSecret(intentResult.data.client_secret);
      setDepositAmount(intentResult.data.amount);
      setStep(4);
    } catch (error: any) {
      console.error("Error creating booking:", error);
      toast.error(error.message || "Erreur lors de la réservation. Veuillez réessayer.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading || isLoading) {
    return (
      <MobileLayout showNav={false}>
        <div className="min-h-screen bg-background flex flex-col items-center justify-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
          <p className="text-sm text-muted-foreground">Chargement...</p>
        </div>
      </MobileLayout>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  if (!pro || prestations.length === 0) {
    return (
      <MobileLayout showNav={false}>
        <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
          <div className="text-center space-y-4">
            <p className="text-lg font-semibold text-foreground">Aucune prestation disponible</p>
            <button
              onClick={() => navigate('/client')}
              className="px-6 py-3 rounded-xl bg-primary text-white font-medium"
            >
              Retour
            </button>
          </div>
        </div>
      </MobileLayout>
    );
  }

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
              <h1 className="text-3xl font-bold text-foreground mb-2">
                Choisis ta prestation
              </h1>
              <p className="text-muted-foreground">
                Avec {pro.activity_name || `${pro.first_name} ${pro.last_name}`}
                {pro.city && ` à ${pro.city}`}
              </p>
            </div>

            {pro.acceptance_conditions && pro.acceptance_conditions.filter(c => c.text.trim()).length > 0 && (
              <section className="bg-card rounded-2xl p-4 shadow-sm border border-muted space-y-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={15} className="text-foreground/50 flex-shrink-0" />
                  <h2 className="text-sm font-bold text-foreground">Conditions de réservation</h2>
                </div>
                <div className="space-y-2">
                  {pro.acceptance_conditions.filter(c => c.text.trim()).map((c, i) => (
                    <div
                      key={i}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 border ${
                        c.accepted
                          ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800/40"
                          : "bg-rose-50/60 border-rose-200 dark:bg-rose-950/20 dark:border-rose-800/40"
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${c.accepted ? "bg-emerald-500" : "bg-rose-400"}`}>
                        {c.accepted
                          ? <Check size={10} className="text-white" strokeWidth={3} />
                          : <X size={10} className="text-white" strokeWidth={3} />
                        }
                      </div>
                      <span className={`text-xs font-medium leading-snug ${c.accepted ? "text-emerald-800 dark:text-emerald-200" : "text-rose-700 dark:text-rose-300"}`}>
                        {c.text}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <div className="space-y-3">
              {prestations.map((prestation, index) => {
                const isSelected = selectedPrestation === prestation.id;
                return (
                  <motion.button
                    key={prestation.id}
                    onClick={() => setSelectedPrestation(prestation.id)}
                    className={`
                      w-full bg-card rounded-3xl p-5 
                      shadow-lg shadow-black/5 border-2 
                      text-left transition-all duration-300 
                      hover:shadow-xl active:scale-[0.98]
                      ${isSelected ? "border-primary" : "border-muted"}
                    `}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1, duration: 0.5 }}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1">
                        <h3 className="font-semibold text-foreground mb-1.5">
                          {prestation.name}
                        </h3>
                        {prestation.description && (
                          <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                            {prestation.description}
                          </p>
                        )}
                        <div className="flex items-center gap-3 text-xs">
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Clock size={14} className="text-primary" />
                            <span>{formatDuration(prestation.duration_minutes)}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Sparkles size={14} className="text-primary" />
                            <span className="font-bold text-foreground">
                              {prestation.price.toFixed(2)}€
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className={`
                        w-6 h-6 rounded-full flex items-center justify-center 
                        transition-all duration-300
                        ${isSelected ? "bg-primary" : "bg-muted"}
                      `}>
                        {isSelected && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: "spring", stiffness: 300 }}
                          >
                            <Check size={14} className="text-white" />
                          </motion.div>
                        )}
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
              <h1 className="text-3xl font-bold text-foreground mb-2">
                Quand ?
              </h1>
              <p className="text-muted-foreground">
                Choisis la date et l'horaire qui t'arrangent
              </p>
            </div>

            <section className="space-y-3">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <CalendarIcon size={18} className="text-primary" />
                Date
              </h3>
              <Calendar
                selectedDate={selectedDate}
                onSelectDate={setSelectedDate}
                proId={id!}
                availableDates={availableDates}
              />
            </section>

            <section className="space-y-3">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <Clock size={18} className="text-primary" />
                Horaire
              </h3>
              {isLoadingSlots ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : availableSlots.length === 0 ? (
                <div className="text-center py-8 bg-card rounded-2xl border border-muted">
                  <p className="text-sm text-muted-foreground">
                    {selectedDate ? "Aucun créneau disponible pour cette date" : "Sélectionne d'abord une date"}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {availableSlots.map((slot) => {
                    const isSelected = selectedTime === slot.time;
                    return (
                      <button
                        key={slot.id}
                        onClick={() => setSelectedTime(slot.time)}
                        className={`
                          rounded-2xl px-4 py-3 
                          text-sm font-bold
                          transition-all duration-300
                          ${isSelected
                            ? "bg-primary text-white shadow-lg shadow-primary/30"
                            : "bg-card text-foreground border border-muted hover:bg-muted/50"
                          }
                        `}
                      >
                        {slot.time}
                      </button>
                    );
                  })}
                </div>
              )}
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
              <h1 className="text-3xl font-bold text-foreground mb-2">
                Récapitulatif
              </h1>
              <p className="text-muted-foreground">
                Vérifie que tout est bon
              </p>
            </div>

            <div className="bg-card rounded-3xl p-6 shadow-lg shadow-black/5 border border-muted space-y-4">
              <SummaryRow
                label="Spécialiste"
                value={pro.activity_name || `${pro.first_name} ${pro.last_name}`}
              />
              <Divider />
              <SummaryRow label="Prestation" value={selectedPrestationData?.name} />
              <Divider />
              <SummaryRow
                label="Date"
                value={selectedDate ? selectedDate.toLocaleDateString('fr-FR', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'long'
                }) : undefined}
              />
              <Divider />
              <SummaryRow label="Horaire" value={selectedTime || undefined} />
              <Divider />
              <SummaryRow
                label="Durée"
                value={selectedPrestationData ? formatDuration(selectedPrestationData.duration_minutes) : undefined}
              />
              <Divider />
              <div className="flex items-center justify-between pt-2">
                <span className="text-sm text-muted-foreground">Total</span>
                <span className="font-bold text-2xl text-foreground">
                  {selectedPrestationData?.price.toFixed(2)}€
                </span>
              </div>
            </div>

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
              <h1 className="text-3xl font-bold text-foreground mb-2">
                Paiement sécurisé
              </h1>
              <p className="text-muted-foreground">
                {depositPercentage < 100
                  ? `Acompte de ${depositPercentage}% à payer maintenant`
                  : "Termine le paiement pour confirmer"}
              </p>
            </div>

            {clientSecret ? (
              <Elements
                stripe={stripePromise}
                options={{
                  clientSecret,
                  appearance: { theme: "stripe" },
                }}
              >
                <StripeCheckoutForm
                  amount={depositAmount || selectedPrestationData?.price || 0}
                  onSuccess={() => setStep(5)}
                  prestationName={selectedPrestationData?.name}
                />
              </Elements>
            ) : (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            )}
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
              <Check size={48} className="text-white" />
            </motion.div>

            <div>
              <div className="flex items-center justify-center gap-2 mb-2">
                <h1 className="text-3xl font-bold text-foreground">
                  Réservation confirmée
                </h1>
                <Sparkles className="w-6 h-6 text-primary" />
              </div>
              <p className="text-muted-foreground max-w-sm mx-auto">
                Tu recevras une confirmation et un rappel avant ton rendez‑vous
              </p>
            </div>

            <div className="bg-card rounded-3xl p-6 shadow-lg shadow-black/5 border border-muted text-left space-y-4">
              <SummaryRow
                label="Spécialiste"
                value={pro.activity_name || `${pro.first_name} ${pro.last_name}`}
              />
              <Divider />
              <SummaryRow label="Prestation" value={selectedPrestationData?.name} />
              <Divider />
              <SummaryRow
                label="Date"
                value={selectedDate ? selectedDate.toLocaleDateString('fr-FR', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'long'
                }) : undefined}
              />
              <Divider />
              <SummaryRow label="Horaire" value={selectedTime || undefined} />
              <Divider />
              <SummaryRow
                label="Paiement"
                value={
                  paymentMethod === "on-site"
                    ? "Sur place"
                    : depositPercentage < 100
                    ? `Acompte payé (${Number(depositAmount || 0).toFixed(2)}€)`
                    : "Payé en ligne"
                }
              />
            </div>

            <button
              onClick={() => navigate("/client/my-booking")}
              className="
                w-full h-14 rounded-2xl 
                bg-primary text-white font-semibold 
                shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 
                transition-all duration-300 active:scale-[0.98]
              "
            >
              Voir mes réservations
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
        {step < 5 && (
          <header className="pt-6 pb-4">
            <button
              onClick={handleBack}
              className="
                w-11 h-11 rounded-2xl 
                bg-card border border-muted 
                flex items-center justify-center mb-4 
                hover:bg-muted/50 
                transition-all duration-300 active:scale-95
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

        <main className="flex-1 py-4">
          <AnimatePresence mode="wait">
            {renderStep()}
          </AnimatePresence>
        </main>

        {step < 5 && step !== 4 && (
          <footer className="pb-6 pt-4">
            <button
              onClick={handleNext}
              disabled={!isStepValid() || isSubmitting}
              className="
                w-full h-14 rounded-2xl 
                bg-primary text-white font-semibold text-base 
                shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 
                disabled:opacity-50 disabled:cursor-not-allowed 
                transition-all duration-300 active:scale-[0.98] 
                flex items-center justify-center gap-2
              "
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Confirmation...
                </>
              ) : (
                step === 3 && paymentMethod === "on-site" ? "Confirmer" : "Continuer"
              )}
            </button>
          </footer>
        )}
      </div>
    </MobileLayout>
  );
};

type SummaryRowProps = { label: string; value?: string; };
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
      w-full bg-card rounded-3xl p-5 
      shadow-lg shadow-black/5 border-2 
      text-left flex items-center gap-4 
      transition-all duration-300 
      hover:shadow-xl active:scale-[0.98]
      ${selected ? "border-primary" : "border-muted"}
    `}
  >
    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
      {icon}
    </div>
    <div className="flex-1">
      <h4 className="font-semibold text-sm text-foreground mb-0.5">
        {title}
      </h4>
      <p className="text-xs text-muted-foreground">
        {subtitle}
      </p>
    </div>
    <div className={`
      w-6 h-6 rounded-full flex items-center justify-center 
      transition-all duration-300
      ${selected ? "bg-primary" : "bg-muted"}
    `}>
      {selected && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 300 }}
        >
          <Check size={14} className="text-white" />
        </motion.div>
      )}
    </div>
  </button>
);

export default ClientBooking;