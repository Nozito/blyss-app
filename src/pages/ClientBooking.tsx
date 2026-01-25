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
  Loader2
} from "lucide-react";
import MobileLayout from "@/components/MobileLayout";
import { useAuth } from '@/contexts/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

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
}

interface Prestation {
  id: number;
  name: string;
  description: string | null;
  price: number;
  duration_minutes: number;
  active: boolean;
}

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

  const totalSteps = 5;

  const [availableSlots, setAvailableSlots] = useState<Array<{
    id: number;
    time: string;
    duration: number;
  }>>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);

  // Vérifier l'authentification
  useEffect(() => {
    if (authLoading) return;

    if (!isAuthenticated || !token) {
      console.log("❌ Pas authentifié, redirection vers login");
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
  }, [isAuthenticated, authLoading, id, navigate, token]);

  // Charger les données du pro et prestations
  useEffect(() => {
    const fetchData = async () => {
      if (!id || authLoading || !isAuthenticated) {
        console.log("⏸️ En attente de l'authentification ou ID manquant");
        return;
      }

      try {
        setIsLoading(true);
        console.log("🔄 Chargement des données pour le pro ID:", id);

        // Récupérer le pro
        const proRes = await fetch(`${API_URL}/api/users/pros/${id}`);
        
        if (!proRes.ok) {
          throw new Error(`Erreur HTTP ${proRes.status}`);
        }

        const proData = await proRes.json();

        if (proData.success && proData.data) {
          setPro(proData.data);
          console.log("✅ Pro chargé:", proData.data.activity_name);
        } else {
          console.error("❌ Pro non trouvé");
          navigate('/client');
          return;
        }

        // Récupérer les prestations
        const prestationsRes = await fetch(`${API_URL}/api/prestations/pro/${id}`);
        
        if (!prestationsRes.ok) {
          throw new Error(`Erreur HTTP ${prestationsRes.status}`);
        }

        const prestationsData = await prestationsRes.json();

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
          console.log("✅ Prestations chargées:", activePrestations.length);

          if (activePrestations.length === 0) {
            console.warn("⚠️ Aucune prestation active");
          }
        }
      } catch (error) {
        console.error("❌ Erreur lors du chargement:", error);
        alert("Impossible de charger les informations. Veuillez réessayer.");
        navigate('/client');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [id, authLoading, isAuthenticated, navigate]);

  // Charger les créneaux disponibles
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

  // Reset selectedTime quand la date change
  useEffect(() => {
    setSelectedTime(null);
  }, [selectedDate]);

  const selectedPrestationData = useMemo(
    () => prestations.find((p) => p.id === selectedPrestation),
    [selectedPrestation, prestations]
  );

  const availableDates = useMemo(() => {
    const dates = [];
    const today = new Date();

    for (let i = 1; i <= 7; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);

      const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
      const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

      dates.push({
        date: date,
        label: `${dayNames[date.getDay()]} ${date.getDate()} ${monthNames[date.getMonth()]}`
      });
    }

    return dates;
  }, []);

  const selectedDateLabel = useMemo(() => {
    if (!selectedDate) return "";
    const found = availableDates.find(
      (d) =>
        d.date.getFullYear() === selectedDate.getFullYear() &&
        d.date.getMonth() === selectedDate.getMonth() &&
        d.date.getDate() === selectedDate.getDate()
    );
    return found?.label ?? "";
  }, [selectedDate, availableDates]);

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
    if (step === 3 && paymentMethod === "on-site") {
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
      alert("Veuillez remplir tous les champs.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (!token) {
        alert("Votre session a expiré. Veuillez vous reconnecter.");
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

      const reservationData = {
        pro_id: Number(id),
        prestation_id: selectedPrestation,
        start_datetime: startDateTime.toISOString().slice(0, 19).replace('T', ' '),
        end_datetime: endDateTime.toISOString().slice(0, 19).replace('T', ' '),
        status: "confirmed",
        price: selectedPrestationData.price,
        paid_online: paymentMethod === "online" ? 1 : 0,
        slot_id: selectedSlot?.id || null
      };

      console.log("📤 Envoi de la réservation:", reservationData);

      // ✅ CORRIGÉ : Ajout du préfixe /api/
      const reservationRes = await fetch(`${API_URL}/api/reservations`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(reservationData)
      });

      console.log("📥 Réponse réservation:", reservationRes.status);

      if (reservationRes.status === 401) {
        alert("Votre session a expiré. Veuillez vous reconnecter.");
        localStorage.removeItem('auth_token');
        navigate('/login');
        return;
      }

      if (!reservationRes.ok) {
        const errorText = await reservationRes.text();
        console.error("Erreur serveur:", errorText);
        throw new Error("Erreur lors de la réservation");
      }

      const reservationResult = await reservationRes.json();
      console.log("✅ Réservation créée:", reservationResult);

      if (reservationResult.success && reservationResult.data) {
        // Créer l'enregistrement de paiement
        await fetch(`${API_URL}/api/payments`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            reservation_id: reservationResult.data.id,
            pro_id: Number(id),
            amount: selectedPrestationData.price,
            method: paymentMethod === "online" ? "online" : "on_site",
            status: paymentMethod === "online" ? "paid" : "pending"
          })
        });

        setStep(5);
      } else {
        throw new Error("Erreur lors de la réservation");
      }
    } catch (error) {
      console.error("Error creating booking:", error);
      alert("Erreur lors de la réservation. Veuillez réessayer.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePayment = async (method: string) => {
    console.log(`Processing ${method} payment`);
    await handleConfirmBooking();
  };

  // Loader pendant chargement initial
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

  // Ne rien afficher si pas authentifié
  if (!isAuthenticated) {
    return null;
  }

  // Vérifier si les données sont chargées
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
              <div className="space-y-2">
                {availableDates.map((d) => {
                  const isSelected = selectedDate && d.date.toDateString() === selectedDate.toDateString();
                  return (
                    <button
                      key={d.date.toISOString()}
                      onClick={() => setSelectedDate(d.date)}
                      className={`
                        w-full rounded-2xl px-5 py-4 
                        text-base font-semibold
                        transition-all duration-300
                        ${isSelected
                          ? "bg-primary text-white shadow-lg shadow-primary/30"
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
                    Aucun créneau disponible pour cette date
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
              <SummaryRow label="Date" value={selectedDateLabel} />
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
                Termine le paiement pour confirmer
              </p>
            </div>

            <div className="bg-card rounded-3xl p-5 shadow-lg shadow-black/5 border border-muted space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total à payer</span>
                <span className="font-bold text-2xl text-foreground">
                  {selectedPrestationData?.price.toFixed(2)}€
                </span>
              </div>
              <Divider />
              <SummaryRow label="Prestation" value={selectedPrestationData?.name} />
              <SummaryRow label="Date" value={selectedDateLabel} />
              <SummaryRow label="Horaire" value={selectedTime || undefined} />
            </div>

            <div className="space-y-3">
              <button
                onClick={() => handlePayment("apple-pay")}
                disabled={isSubmitting}
                className="
                  w-full h-14 rounded-2xl 
                  bg-black text-white font-semibold 
                  shadow-lg hover:shadow-xl 
                  transition-all duration-300 active:scale-[0.98] 
                  disabled:opacity-50 
                  flex items-center justify-center
                "
              >
                {isSubmitting ? <Loader2 className="w-6 h-6 animate-spin" /> : "Apple Pay"}
              </button>

              <button
                onClick={() => handlePayment("google-pay")}
                disabled={isSubmitting}
                className="
                  w-full h-14 rounded-2xl 
                  bg-white border-2 border-muted text-foreground font-semibold 
                  shadow-lg hover:shadow-xl 
                  transition-all duration-300 active:scale-[0.98] 
                  disabled:opacity-50 
                  flex items-center justify-center
                "
              >
                {isSubmitting ? <Loader2 className="w-6 h-6 animate-spin" /> : "Google Pay"}
              </button>

              <button
                onClick={() => handlePayment("card")}
                disabled={isSubmitting}
                className="
                  w-full h-14 rounded-2xl 
                  bg-primary text-white font-semibold 
                  shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 
                  transition-all duration-300 active:scale-[0.98] 
                  disabled:opacity-50 
                  flex items-center justify-center gap-2
                "
              >
                {isSubmitting ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : (
                  <>
                    <CreditCard size={20} />
                    Carte bancaire
                  </>
                )}
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
              <SummaryRow label="Date" value={selectedDateLabel} />
              <Divider />
              <SummaryRow label="Horaire" value={selectedTime || undefined} />
              <Divider />
              <SummaryRow
                label="Paiement"
                value={paymentMethod === "on-site" ? "Sur place" : "Payé en ligne"}
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

/* Helpers UI */
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
