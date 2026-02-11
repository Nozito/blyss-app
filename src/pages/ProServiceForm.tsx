import MobileLayout from "@/components/MobileLayout";
import { useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft,
  Trash2,
  Info,
  Euro,
  Clock,
  Tag,
  FileText,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { useState, useEffect } from "react";
import React from "react";
import { proApi } from "@/services/api";
import type { Prestation } from "./ProServices";

interface ServiceFormData {
  name: string;
  description: string;
  price: number | string;
  duration_minutes: number;
  active: boolean;
}

const showNotification = (notification: any) => {
  window.dispatchEvent(new CustomEvent("showNotification", { detail: notification }));
};

const ProServiceForm = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;

  const [currentStep, setCurrentStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [direction, setDirection] = useState(0);

  const durations = [15, 30, 45, 60, 75, 90, 120, 150, 180];

  const [formData, setFormData] = useState<ServiceFormData>({
    name: "",
    description: "",
    price: "",
    duration_minutes: 60,
    active: true,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const steps = [
    { title: "Nom", icon: Tag },
    { title: "Description", icon: FileText },
    { title: "Prix & Durée", icon: Euro },
    { title: "Confirmation", icon: CheckCircle2 },
  ];

  useEffect(() => {
    if (isEditMode) {
      loadService();
    }
  }, [id]);

  const loadService = async () => {
    try {
      setIsLoading(true);
      const res = await proApi.getServices();
      if (!res?.success) throw new Error();

      const service = (res.data as Prestation[]).find((s) => s.id === parseInt(id || "0"));
      if (!service) throw new Error("Service introuvable");

      setFormData({
        name: service.name,
        description: service.description,
        price: service.price,
        duration_minutes: service.duration_minutes,
        active: service.active,
      });
    } catch (error) {
      showNotification({ type: "error", title: "Erreur", message: "Impossible de charger la prestation" });
      navigate("/pro/prestations");
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field: keyof ServiceFormData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const validateStep = (step: number): boolean => {
    const newErrors: Record<string, string> = {};

    switch (step) {
      case 0:
        if (!formData.name.trim()) {
          newErrors.name = "Le nom est requis";
        } else if (formData.name.trim().length > 100) {
          newErrors.name = "Maximum 100 caractères";
        }
        break;
      case 1:
        if (formData.description.length > 500) {
          newErrors.description = "Maximum 500 caractères";
        }
        break;
      case 2:
        const price = Number(formData.price);
        if (!formData.price || price <= 0) {
          newErrors.price = "Le prix doit être supérieur à 0€";
        }
        const duration = Number(formData.duration_minutes);
        if (!formData.duration_minutes || duration < 15 || duration > 300) {
          newErrors.duration_minutes = "La durée doit être entre 15 et 300 minutes";
        }
        break;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const nextStep = () => {
    if (currentStep < steps.length - 1 && validateStep(currentStep)) {
      setDirection(1);
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setDirection(-1);
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = async () => {
    try {
      setIsSaving(true);

      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        price: parseFloat(formData.price.toString()),
        duration_minutes: formData.duration_minutes,
        active: formData.active,
      };

      let res;
      if (isEditMode) {
        res = await proApi.updateService(parseInt(id!), payload);
      } else {
        res = await proApi.createService(payload);
      }

      if (!res?.success) throw new Error(res?.error || "Erreur serveur");

      showNotification({
        type: "success",
        title: isEditMode ? "✅ Prestation mise à jour !" : "🎉 Prestation créée !",
        message: "Tes clientes peuvent maintenant la réserver",
      });

      navigate("/pro/prestations");
    } catch (error: any) {
      showNotification({ type: "error", title: "Erreur", message: error.message || "Impossible d'enregistrer la prestation" });
    } finally {
      setIsSaving(false);
    }
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0 && mins > 0) return `${hours}h${mins}`;
    if (hours > 0) return `${hours}h`;
    return `${mins}min`;
  };

  const variants = {
    enter: (direction: number) => ({ x: direction > 0 ? 300 : -300, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (direction: number) => ({ x: direction < 0 ? 300 : -300, opacity: 0 }),
  };

  if (isLoading) {
    return (
      <MobileLayout hideNav={true}>
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary/20 border-t-primary"></div>
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout hideNav={true}>
      <div className="min-h-screen pb-32 bg-gradient-to-b from-background via-background to-muted/10">
        {/* Header */}
        <div className="relative pt-6 pb-5 px-4 mb-6">
          <motion.button
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            whileHover={{ scale: 1.05, x: -2 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => navigate("/pro/prestations")}
            className="absolute left-4 top-6 w-10 h-10 rounded-xl bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl border border-white/20 shadow-sm flex items-center justify-center"
          >
            <ChevronLeft size={20} className="text-foreground" />
          </motion.button>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="text-center">
            <h1 className="text-2xl font-bold text-foreground mb-1">{isEditMode ? "Modifier" : "Créer"} une prestation</h1>
            <p className="text-sm text-muted-foreground">
              Étape {currentStep + 1} / {steps.length}
            </p>
          </motion.div>

          {/* Step indicator */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mt-6 flex justify-center">
            <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-primary shadow-md">
              <div className="flex items-center gap-2">
                {React.createElement(steps[currentStep].icon, { size: 18, className: "text-white" })}
                <span className="text-sm font-bold text-white">{steps[currentStep].title}</span>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Steps content */}
        <div className="relative overflow-hidden px-4">
          <AnimatePresence initial={false} custom={direction} mode="wait">
            <motion.div
              key={currentStep}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.7}
              onDragEnd={(e, { offset, velocity }) => {
                const swipe = Math.abs(offset.x) * velocity.x;
                if (swipe < -10000) nextStep();
                else if (swipe > 10000) prevStep();
              }}
              className="w-full"
            >
              {/* Step 0: Nom */}
              {currentStep === 0 && (
                <div className="space-y-4">
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="rounded-2xl bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl border border-white/20 shadow-sm p-5">
                    <label className="block text-sm font-semibold text-foreground mb-2">Nom de la prestation *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => handleInputChange("name", e.target.value)}
                      placeholder="Ex: Pose complète gel"
                      maxLength={100}
                      className={`w-full px-4 py-3 rounded-xl border-2 ${errors.name ? "border-destructive" : "border-border"} bg-background/50 backdrop-blur-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none transition-colors`}
                    />
                    {errors.name && (
                      <p className="text-xs text-destructive mt-2 flex items-center gap-1">
                        <Info size={12} />
                        {errors.name}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-2">{formData.name.length}/100 caractères</p>
                  </motion.div>

                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="flex items-start gap-3 p-4 rounded-xl bg-primary/5 backdrop-blur-sm border border-primary/10">
                    <Sparkles size={18} className="text-primary mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-muted-foreground">Choisis un nom clair et précis pour que tes clientes comprennent facilement la prestation.</p>
                  </motion.div>
                </div>
              )}

              {/* Step 1: Description */}
              {currentStep === 1 && (
                <div className="space-y-4">
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="rounded-2xl bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl border border-white/20 shadow-sm p-5">
                    <label className="block text-sm font-semibold text-foreground mb-2">
                      Description <span className="text-xs text-muted-foreground font-normal">(optionnel)</span>
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => handleInputChange("description", e.target.value)}
                      placeholder="Décris ta prestation en quelques mots..."
                      maxLength={500}
                      rows={7}
                      className={`w-full px-4 py-3 rounded-xl border-2 ${errors.description ? "border-destructive" : "border-border"} bg-background/50 backdrop-blur-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none transition-colors resize-none`}
                    />
                    {errors.description && (
                      <p className="text-xs text-destructive mt-2 flex items-center gap-1">
                        <Info size={12} />
                        {errors.description}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-2">{formData.description.length}/500 caractères</p>
                  </motion.div>

                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="flex items-start gap-3 p-4 rounded-xl bg-primary/5 backdrop-blur-sm border border-primary/10">
                    <Info size={18} className="text-primary mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-muted-foreground">La description aide tes clientes à savoir exactement ce qui est inclus dans la prestation.</p>
                  </motion.div>
                </div>
              )}

              {/* Step 2: Prix & Durée */}
              {currentStep === 2 && (
                <div className="space-y-4">
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="rounded-2xl bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl border border-white/20 shadow-sm p-5">
                    <div className="mb-5">
                      <label className="block text-sm font-semibold text-foreground mb-2">Prix *</label>
                      <div className="relative">
                        <input
                          type="number"
                          value={formData.price}
                          onChange={(e) => handleInputChange("price", e.target.value)}
                          placeholder="0"
                          min="0"
                          step="0.5"
                          className={`w-full px-4 py-3 pr-12 rounded-xl border-2 ${errors.price ? "border-destructive" : "border-border"} bg-background/50 backdrop-blur-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none transition-colors font-semibold`}
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">€</span>
                      </div>
                      {errors.price && (
                        <p className="text-xs text-destructive mt-2 flex items-center gap-1">
                          <Info size={12} />
                          {errors.price}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-foreground mb-3">Durée estimée *</label>
                      <div className="grid grid-cols-3 gap-2">
                        {durations.map((duration) => (
                          <motion.button
                            key={duration}
                            type="button"
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handleInputChange("duration_minutes", duration)}
                            className={`px-4 py-3 rounded-xl border-2 font-bold text-sm transition-all backdrop-blur-sm ${formData.duration_minutes === duration ? "border-primary bg-primary/10 text-primary shadow-lg shadow-primary/20" : "border-border bg-background/50 text-muted-foreground hover:border-primary/50"}`}
                          >
                            {formatDuration(duration)}
                          </motion.button>
                        ))}
                      </div>
                      {errors.duration_minutes && (
                        <p className="text-xs text-destructive mt-2 flex items-center gap-1">
                          <Info size={12} />
                          {errors.duration_minutes}
                        </p>
                      )}
                    </div>
                  </motion.div>

                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="flex items-start gap-3 p-4 rounded-xl bg-primary/5 backdrop-blur-sm border border-primary/10">
                    <Clock size={18} className="text-primary mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-muted-foreground">Cette durée sera utilisée pour bloquer automatiquement ton calendrier lors des réservations.</p>
                  </motion.div>
                </div>
              )}

              {/* Step 3: Confirmation */}
              {currentStep === 3 && (
                <div className="space-y-4">
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent backdrop-blur-xl border border-primary/20 shadow-lg p-5">
                    <div className="flex items-center gap-3 mb-5">
                      <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                        <CheckCircle2 size={20} className="text-primary" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-foreground">Récapitulatif</h3>
                        <p className="text-xs text-muted-foreground">Vérifie avant de confirmer</p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="p-3 rounded-xl bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm border border-white/20">
                        <p className="text-[10px] font-bold text-muted-foreground mb-1 uppercase tracking-wide">Nom</p>
                        <p className="text-sm font-bold text-foreground">{formData.name}</p>
                      </div>

                      {formData.description && (
                        <div className="p-3 rounded-xl bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm border border-white/20">
                          <p className="text-[10px] font-bold text-muted-foreground mb-1 uppercase tracking-wide">Description</p>
                          <p className="text-xs text-foreground leading-relaxed">{formData.description}</p>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-2">
                        <div className="p-3 rounded-xl bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/20 border border-green-200/50 dark:border-green-800/50">
                          <p className="text-[10px] font-bold text-green-600 dark:text-green-400 mb-1 uppercase tracking-wide">Prix</p>
                          <p className="text-lg font-bold text-foreground">{formData.price}€</p>
                        </div>
                        <div className="p-3 rounded-xl bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/30 dark:to-cyan-950/20 border border-blue-200/50 dark:border-blue-800/50">
                          <p className="text-[10px] font-bold text-blue-600 dark:text-blue-400 mb-1 uppercase tracking-wide">Durée</p>
                          <p className="text-lg font-bold text-foreground">{formatDuration(formData.duration_minutes)}</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between p-3 rounded-xl bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm border border-white/20">
                        <div>
                          <p className="text-[10px] font-bold text-muted-foreground mb-1 uppercase tracking-wide">Visibilité</p>
                          <p className="text-sm font-semibold text-foreground">{formData.active ? "Réservable" : "Masquée"}</p>
                        </div>
                        <button
                          onClick={() => handleInputChange("active", !formData.active)}
                          className={`relative w-14 h-8 rounded-full transition-all ${formData.active ? "bg-primary" : "bg-muted"}`}
                        >
                          <div className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-md transition-all ${formData.active ? "left-7" : "left-1"}`} />
                        </button>
                      </div>
                    </div>
                  </motion.div>

                  <motion.button
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.3 }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleSubmit}
                    disabled={isSaving}
                    className="w-full px-5 py-4 rounded-2xl bg-gradient-to-r from-green-500 to-emerald-500 shadow-lg flex items-center justify-center gap-2"
                  >
                    {isSaving ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-white/20 border-t-white"></div>
                        <span className="font-bold text-white">Enregistrement...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={18} className="text-white" />
                        <span className="font-bold text-white">{isEditMode ? "Mettre à jour" : "Créer la prestation"}</span>
                      </>
                    )}
                  </motion.button>

                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="flex items-start gap-3 p-4 rounded-xl bg-green-50 dark:bg-green-950/20 backdrop-blur-sm border border-green-200 dark:border-green-800">
                    <Sparkles size={18} className="text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-green-700 dark:text-green-400 mb-0.5">Tout est prêt !</p>
                      <p className="text-xs text-green-600 dark:text-green-500">Confirme pour que tes clientes puissent réserver cette prestation.</p>
                    </div>
                  </motion.div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Barre de navigation iOS */}
      <motion.div initial={{ y: 100 }} animate={{ y: 0 }} transition={{ type: "spring", stiffness: 300, damping: 30 }} className="fixed bottom-6 inset-x-0 z-50 flex justify-center">
        <div className="relative rounded-full bg-white/95 dark:bg-gray-900/95 backdrop-blur-2xl border border-white/20 shadow-2xl p-2 flex items-center gap-3">
          {steps.map((step, index) => (
            <motion.button
              key={index}
              type="button"
              onClick={() => {
                if (index < currentStep || validateStep(currentStep)) {
                  setDirection(index > currentStep ? 1 : -1);
                  setCurrentStep(index);
                }
              }}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className={`relative w-12 h-12 rounded-full flex items-center justify-center transition-all ${index === currentStep ? "bg-primary shadow-lg shadow-primary/30" : index < currentStep ? "bg-primary/20" : "bg-muted/50"}`}
            >
              {index < currentStep ? <CheckCircle2 size={20} className="text-primary" /> : React.createElement(step.icon, { size: 20, className: index === currentStep ? "text-white" : "text-muted-foreground" })}
            </motion.button>
          ))}
        </div>
      </motion.div>
    </MobileLayout>
  );
};

export default ProServiceForm;
