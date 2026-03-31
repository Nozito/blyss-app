import { useEffect, useState, useMemo } from "react";
import MobileLayout from "@/components/MobileLayout";
import {
  CheckCircle2,
  Calendar,
  Users,
  BarChart3,
  Camera,
  CreditCard,
  ArrowRight,
  Sparkles,
  Zap,
  TrendingUp,
  ArrowUpRight,
  Check,
  Bell,
  Clock,
  Star,
  Shield,
} from "lucide-react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import Confetti from "react-confetti";

interface LocationState {
  plan: { id: string; name: string; price: number };
  isUpgrade?: boolean;
  previousPlanName?: string | null;
}

const PLAN_NEW_FEATURES: Record<string, string[]> = {
  start: ["Réservation en ligne 24h/24", "Agenda intelligent", "Notifications clientes automatiques", "Tableau de bord activité"],
  serenite: ["Module finance & facturation", "Statistiques avancées", "Portfolio photos intégré", "Rappels automatiques avant RDV"],
  signature: ["Visibilité premium dans les résultats", "Rappels post-prestation aux clientes", "Encaissement en ligne via Stripe"],
};

// ─── COUNTER ANIMATION ────────────────────────────────────────────────────────

const CountUp = ({ to, duration = 1.2, prefix = "", suffix = "" }: { to: number; duration?: number; prefix?: string; suffix?: string }) => {
  const [val, setVal] = useState(0);
  useEffect(() => {
    const t0 = Date.now();
    const id = setInterval(() => {
      const p = Math.min((Date.now() - t0) / (duration * 1000), 1);
      setVal(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p >= 1) clearInterval(id);
    }, 16);
    return () => clearInterval(id);
  }, [to, duration]);
  return <>{prefix}{val.toLocaleString("fr-FR")}{suffix}</>;
};

// ─── BENTO CARD ───────────────────────────────────────────────────────────────

const BentoCard = ({
  children, className = "", delay = 0, style = {},
}: {
  children: React.ReactNode; className?: string; delay?: number; style?: React.CSSProperties;
}) => (
  <motion.div
    className={`rounded-2xl overflow-hidden ${className}`}
    style={style}
    initial={{ opacity: 0, scale: 0.88, y: 14 }}
    animate={{ opacity: 1, scale: 1, y: 0 }}
    transition={{ type: "spring", damping: 18, stiffness: 260, delay }}
    whileHover={{ scale: 1.025, transition: { duration: 0.18 } }}
    whileTap={{ scale: 0.97 }}
  >
    {children}
  </motion.div>
);

// ─── SLIDE 1 — AGENDA ─────────────────────────────────────────────────────────

const AgendaBento = () => (
  <div className="grid grid-cols-2 gap-2.5 p-4">
    {/* BIG — next appointment */}
    <BentoCard delay={0} className="row-span-2 min-h-[160px] bg-gradient-to-br from-blue-500 to-indigo-600 p-4 flex flex-col justify-between shadow-xl shadow-blue-500/30">
      <div>
        <div className="flex items-center gap-1.5 mb-3">
          <motion.div
            className="w-2 h-2 rounded-full bg-white"
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ repeat: Infinity, duration: 1.6 }}
          />
          <span className="text-[10px] text-white/80 font-semibold uppercase tracking-wide">Prochain RDV</span>
        </div>
        <div className="text-base font-bold text-white leading-tight">Sophie M.</div>
        <div className="text-xs text-white/75 mt-0.5">Pose gel couleur</div>
      </div>
      <div>
        <motion.div
          className="text-3xl font-black text-white mb-2"
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4, duration: 0.4 }}
        >
          14h00
        </motion.div>
        <motion.div
          className="flex items-center gap-1.5 bg-white/20 rounded-xl px-2.5 py-1.5 w-fit"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          <CheckCircle2 size={11} className="text-white" />
          <span className="text-[10px] text-white font-semibold">Confirmé</span>
        </motion.div>
      </div>
    </BentoCard>

    {/* STAT — RDV today */}
    <BentoCard delay={0.09} className="bg-blue-50 border border-blue-100 p-3 flex flex-col justify-between">
      <Calendar size={15} className="text-blue-400" />
      <div>
        <div className="text-2xl font-black text-blue-700">
          <CountUp to={3} duration={0.7} />
        </div>
        <div className="text-[10px] text-blue-500 font-medium">RDV aujourd'hui</div>
      </div>
    </BentoCard>

    {/* STAT — free slot */}
    <BentoCard delay={0.17} className="bg-white/90 border border-blue-100 p-3 flex flex-col justify-between shadow-sm">
      <Clock size={13} className="text-blue-300" />
      <div>
        <div className="text-xs font-bold text-foreground">Jeu. 16h00</div>
        <div className="text-[9px] text-muted-foreground">Prochain libre</div>
      </div>
    </BentoCard>

    {/* WIDE — week dots */}
    <BentoCard delay={0.25} className="col-span-2 bg-white/90 border border-blue-100 px-3 py-2.5 shadow-sm">
      <div className="flex items-center justify-between">
        {[
          { d: "L", n: 31, booked: false, today: false },
          { d: "M", n: 1, booked: true, today: true },
          { d: "M", n: 2, booked: false, today: false },
          { d: "J", n: 3, booked: true, today: false },
          { d: "V", n: 4, booked: true, today: false },
          { d: "S", n: 5, booked: false, today: false },
          { d: "D", n: 6, booked: false, today: false },
        ].map((day, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <span className={`text-[9px] font-semibold ${day.today ? "text-blue-600" : "text-muted-foreground/60"}`}>{day.d}</span>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold ${
              day.today ? "bg-blue-500 text-white" : "text-muted-foreground/50"
            }`}>
              {day.n > 9 ? "" : day.n}
            </div>
            <motion.div
              className={`w-1.5 h-1.5 rounded-full ${day.booked ? "bg-blue-400" : "bg-transparent"}`}
              animate={day.booked ? { scale: [1, 1.4, 1] } : {}}
              transition={{ delay: 0.5 + i * 0.08, duration: 0.4 }}
            />
          </div>
        ))}
      </div>
    </BentoCard>
  </div>
);

// ─── SLIDE 2 — CLIENTES ───────────────────────────────────────────────────────

const ClientesBento = () => (
  <div className="grid grid-cols-2 gap-2.5 p-4">
    {/* BIG — client cards */}
    <BentoCard delay={0} className="row-span-2 min-h-[160px] bg-white/90 border border-purple-100 p-3 flex flex-col gap-2 shadow-sm">
      <div className="text-[10px] font-bold text-purple-400 uppercase tracking-wide mb-1">Mes clientes</div>
      {[
        { initials: "SM", name: "Sophie M.", service: "Pose gel", color: "bg-purple-400" },
        { initials: "CD", name: "Camille D.", service: "Nail art", color: "bg-pink-400" },
        { initials: "LR", name: "Léa R.", service: "Vernis semi", color: "bg-indigo-400" },
      ].map((c, i) => (
        <motion.div
          key={i}
          className="flex items-center gap-2 p-2 rounded-xl bg-purple-50/60"
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 + i * 0.1, duration: 0.35 }}
        >
          <div className={`${c.color} w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0`}>
            <span className="text-[9px] font-bold text-white">{c.initials}</span>
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-bold text-foreground truncate">{c.name}</div>
            <div className="text-[9px] text-muted-foreground truncate">{c.service}</div>
          </div>
        </motion.div>
      ))}
    </BentoCard>

    {/* STAT — total clients */}
    <BentoCard delay={0.09} className="bg-gradient-to-br from-purple-500 to-purple-600 p-3 flex flex-col justify-between shadow-xl shadow-purple-500/25">
      <Users size={15} className="text-white/80" />
      <div>
        <div className="text-2xl font-black text-white"><CountUp to={48} duration={1} /></div>
        <div className="text-[10px] text-white/75 font-medium">clientes</div>
      </div>
    </BentoCard>

    {/* STAT — notification */}
    <BentoCard delay={0.17} className="bg-purple-50 border border-purple-100 p-3 flex flex-col justify-between">
      <div className="flex items-center justify-between">
        <Bell size={13} className="text-purple-400" />
        <motion.div
          className="w-4 h-4 rounded-full bg-purple-500 flex items-center justify-center"
          animate={{ scale: [1, 1.3, 1] }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
        >
          <span className="text-[8px] font-bold text-white">1</span>
        </motion.div>
      </div>
      <div>
        <div className="text-[10px] font-bold text-foreground">Nouveau message</div>
        <div className="text-[9px] text-muted-foreground">Camille D.</div>
      </div>
    </BentoCard>

    {/* WIDE — activity */}
    <BentoCard delay={0.25} className="col-span-2 bg-white/90 border border-purple-100 px-3 py-2 shadow-sm">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wide">Activité cette semaine</span>
        <span className="text-[9px] font-bold text-purple-600">+3 nouvelles</span>
      </div>
      <div className="flex items-end gap-1 h-6">
        {[3, 5, 2, 7, 4, 6, 3].map((h, i) => (
          <motion.div
            key={i}
            className="flex-1 rounded-sm bg-purple-200"
            style={{ height: `${(h / 7) * 100}%` }}
            initial={{ scaleY: 0, originY: 1 }}
            animate={{ scaleY: 1 }}
            transition={{ delay: 0.3 + i * 0.05, duration: 0.4, ease: "easeOut" }}
          />
        ))}
      </div>
    </BentoCard>
  </div>
);

// ─── SLIDE 3 — FINANCE ────────────────────────────────────────────────────────

const FinanceBento = () => (
  <div className="grid grid-cols-2 gap-2.5 p-4">
    {/* BIG — CA card */}
    <BentoCard delay={0} className="row-span-2 min-h-[160px] bg-gradient-to-br from-emerald-500 to-teal-600 p-4 flex flex-col justify-between shadow-xl shadow-emerald-500/30">
      <div>
        <div className="text-[10px] text-white/75 font-semibold uppercase tracking-wide">CA · Avril</div>
        <motion.div
          className="text-3xl font-black text-white mt-1"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <CountUp to={1248} duration={1.4} suffix=" €" />
        </motion.div>
      </div>
      <div>
        <div className="flex items-center justify-between text-[10px] text-white/70 mb-1.5">
          <span>Objectif 2 000 €</span>
          <span className="font-bold text-white">62 %</span>
        </div>
        <div className="h-2 bg-white/20 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-white rounded-full"
            initial={{ width: 0 }}
            animate={{ width: "62%" }}
            transition={{ delay: 0.6, duration: 1, ease: "easeOut" }}
          />
        </div>
      </div>
    </BentoCard>

    {/* STAT — trend */}
    <BentoCard delay={0.09} className="bg-emerald-50 border border-emerald-100 p-3 flex flex-col justify-between">
      <TrendingUp size={15} className="text-emerald-500" />
      <div>
        <div className="text-xl font-black text-emerald-700">+12 %</div>
        <div className="text-[10px] text-emerald-500 font-medium">vs mois dernier</div>
      </div>
    </BentoCard>

    {/* STAT — today */}
    <BentoCard delay={0.17} className="bg-white/90 border border-emerald-100 p-3 flex flex-col justify-between shadow-sm">
      <div className="text-[9px] text-muted-foreground font-semibold uppercase">Aujourd'hui</div>
      <div>
        <div className="text-base font-black text-foreground"><CountUp to={186} duration={0.9} suffix=" €" /></div>
      </div>
    </BentoCard>

    {/* WIDE — top service */}
    <BentoCard delay={0.25} className="col-span-2 bg-white/90 border border-emerald-100 px-3 py-2.5 shadow-sm">
      <div className="flex items-center gap-2 mb-1.5">
        <div className="w-5 h-5 rounded-lg bg-emerald-100 flex items-center justify-center">
          <Star size={10} className="text-emerald-600" fill="currentColor" />
        </div>
        <span className="text-[10px] font-bold text-foreground">Pose gel couleur</span>
        <span className="ml-auto text-[10px] font-bold text-emerald-600">68 % du CA</span>
      </div>
      <div className="h-1.5 bg-emerald-50 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 rounded-full"
          initial={{ width: 0 }}
          animate={{ width: "68%" }}
          transition={{ delay: 0.4, duration: 0.9, ease: "easeOut" }}
        />
      </div>
    </BentoCard>
  </div>
);

// ─── SLIDE 4 — PORTFOLIO ──────────────────────────────────────────────────────

const PortfolioBento = () => {
  const photos = [
    "from-amber-200 to-orange-200",
    "from-amber-300 to-amber-400",
    "from-orange-200 to-amber-300",
    "from-amber-100 to-amber-200",
    "from-amber-300 to-orange-300",
    "from-amber-200 to-amber-300",
  ];
  return (
    <div className="grid grid-cols-2 gap-2.5 p-4">
      {/* BIG — photo grid */}
      <BentoCard delay={0} className="row-span-2 min-h-[160px] bg-white/90 border border-amber-100 p-2.5 shadow-sm">
        <div className="text-[10px] font-bold text-amber-500 uppercase tracking-wide mb-2">Mon portfolio</div>
        <div className="grid grid-cols-2 gap-1.5">
          {photos.map((g, i) => (
            <motion.div
              key={i}
              className={`bg-gradient-to-br ${g} rounded-xl aspect-square flex items-center justify-center`}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.05 + i * 0.07, type: "spring", damping: 18, stiffness: 300 }}
            >
              {i % 3 === 1 && <Camera size={12} className="text-amber-600/30" />}
            </motion.div>
          ))}
        </div>
      </BentoCard>

      {/* STAT — photo count */}
      <BentoCard delay={0.09} className="bg-gradient-to-br from-amber-400 to-orange-400 p-3 flex flex-col justify-between shadow-xl shadow-amber-400/25">
        <Camera size={15} className="text-white/80" />
        <div>
          <div className="text-2xl font-black text-white"><CountUp to={24} duration={0.8} /></div>
          <div className="text-[10px] text-white/80 font-medium">réalisations</div>
        </div>
      </BentoCard>

      {/* STAT — profile views */}
      <BentoCard delay={0.17} className="bg-amber-50 border border-amber-100 p-3 flex flex-col justify-between">
        <TrendingUp size={13} className="text-amber-400" />
        <div>
          <div className="text-base font-black text-amber-700"><CountUp to={142} duration={1} /></div>
          <div className="text-[9px] text-amber-500 font-medium">vues ce mois</div>
        </div>
      </BentoCard>

      {/* WIDE — profile badge */}
      <BentoCard delay={0.25} className="col-span-2 bg-white/90 border border-amber-100 px-3 py-2.5 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center">
            <Sparkles size={11} className="text-amber-500" />
          </div>
          <span className="text-[10px] font-semibold text-foreground">Profil Blyss public activé</span>
          <motion.div
            className="ml-auto flex items-center gap-1 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5"
            animate={{ borderColor: ["#fde68a", "#f59e0b", "#fde68a"] }}
            transition={{ repeat: Infinity, duration: 2 }}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span className="text-[9px] font-bold text-amber-600">En ligne</span>
          </motion.div>
        </div>
      </BentoCard>
    </div>
  );
};

// ─── SLIDE 5 — PAIEMENT ───────────────────────────────────────────────────────

const PaiementBento = () => (
  <div className="grid grid-cols-2 gap-2.5 p-4">
    {/* BIG — checkout */}
    <BentoCard delay={0} className="row-span-2 min-h-[200px] bg-white/90 border border-rose-100 p-3 flex flex-col justify-between shadow-sm">
      <div className="text-[10px] font-bold text-rose-400 uppercase tracking-wide">Paiement client</div>
      <div className="bg-rose-50 rounded-xl p-2.5 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[9px] text-muted-foreground">Total</span>
          <span className="text-sm font-black text-foreground">13,50 €</span>
        </div>
        <div className="h-px bg-rose-100" />
        <div className="text-[9px] text-muted-foreground">Pose gel couleur</div>
      </div>
      <div className="rounded-xl bg-rose-50 border border-rose-100 px-2 py-1.5 flex items-center justify-between">
        <span className="text-[8px] text-muted-foreground">•••• •••• •••• ••••</span>
        <div className="w-6 h-3.5 rounded bg-amber-300/80" />
      </div>
      <div className="flex gap-1.5">
        <div className="flex-1 rounded-xl bg-rose-50 border border-rose-100 px-2 py-1.5 text-[8px] text-muted-foreground">MM/AA</div>
        <div className="flex-1 rounded-xl bg-rose-50 border border-rose-100 px-2 py-1.5 text-[8px] text-muted-foreground">CVV</div>
      </div>
      <motion.div
        className="rounded-xl bg-primary text-white py-2 text-[10px] font-bold flex items-center justify-center gap-1.5 shadow-md shadow-primary/30"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
      >
        <CreditCard size={11} />
        Payer 13,50 €
      </motion.div>
    </BentoCard>

    {/* STAT — stripe */}
    <BentoCard delay={0.09} className="bg-gradient-to-br from-rose-500 to-pink-600 p-3 flex flex-col justify-between shadow-xl shadow-rose-500/25">
      <Shield size={15} className="text-white/80" />
      <div>
        <div className="text-xs font-black text-white">Stripe</div>
        <div className="text-[9px] text-white/75">Sécurisé PCI</div>
      </div>
    </BentoCard>

    {/* STAT — zero impayé */}
    <BentoCard delay={0.17} className="bg-rose-50 border border-rose-100 p-3 flex flex-col justify-between">
      <CheckCircle2 size={13} className="text-rose-400" />
      <div>
        <div className="text-lg font-black text-rose-700">0</div>
        <div className="text-[9px] text-rose-400 font-medium">impayé</div>
      </div>
    </BentoCard>

    {/* WIDE — virement */}
    <BentoCard delay={0.25} className="col-span-2 bg-white/90 border border-rose-100 px-3 py-2.5 shadow-sm">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-full bg-rose-100 flex items-center justify-center">
          <ArrowRight size={11} className="text-rose-500" />
        </div>
        <span className="text-[10px] font-semibold text-foreground">Virement automatique sur votre compte</span>
        <motion.div
          className="ml-auto text-[9px] font-bold text-rose-600"
          animate={{ opacity: [1, 0.5, 1] }}
          transition={{ repeat: Infinity, duration: 2.5 }}
        >
          J+2
        </motion.div>
      </div>
    </BentoCard>
  </div>
);

// ─── COMPONENT ────────────────────────────────────────────────────────────────

const ProSubscriptionSuccess = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const previewMode = searchParams.get("preview");
  const previewState = useMemo<LocationState | null>(() => {
    if (previewMode === "new") return { plan: { id: "serenite", name: "Sérénité", price: 29 }, isUpgrade: false };
    if (previewMode === "upgrade") return { plan: { id: "signature", name: "Signature", price: 49 }, isUpgrade: true, previousPlanName: "Sérénité" };
    return null;
  }, [previewMode]);

  const { plan, isUpgrade = false, previousPlanName } = previewState ?? (location.state as LocationState) ?? {};

  const [showOnboarding, setShowOnboarding] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [slideDirection, setSlideDirection] = useState<1 | -1>(1);
  const [showConfetti, setShowConfetti] = useState(!isUpgrade);

  const slides = [
    {
      id: "agenda",
      icon: Calendar,
      title: "Gestion d'agenda",
      description: "Créez vos créneaux et laissez vos clientes réserver en ligne. Fini les messages pour caler un RDV.",
      bento: <AgendaBento />,
      bg: "bg-blue-50",
      accent: "text-blue-600",
      accentBg: "bg-blue-100",
    },
    {
      id: "clientes",
      icon: Users,
      title: "Base de données clientes",
      description: "Toutes vos clientes au même endroit : coordonnées, historique et notes privées en un tap.",
      bento: <ClientesBento />,
      bg: "bg-purple-50",
      accent: "text-purple-600",
      accentBg: "bg-purple-100",
    },
    {
      id: "finance",
      icon: BarChart3,
      title: "Module Finance",
      description: "Pilotez votre activité : CA en temps réel, objectif mensuel, factures et prestations les plus rentables.",
      bento: <FinanceBento />,
      bg: "bg-emerald-50",
      accent: "text-emerald-600",
      accentBg: "bg-emerald-100",
    },
    {
      id: "portfolio",
      icon: Camera,
      title: "Portfolio professionnel",
      description: "Valorisez vos réalisations avec un portfolio photo pour attirer de nouvelles clientes.",
      bento: <PortfolioBento />,
      bg: "bg-amber-50",
      accent: "text-amber-600",
      accentBg: "bg-amber-100",
    },
    {
      id: "paiement",
      icon: CreditCard,
      title: "Encaissement en ligne",
      description: "Vos clientes paient directement depuis l'app au moment de la réservation. Zéro impayé.",
      bento: <PaiementBento />,
      bg: "bg-rose-50",
      accent: "text-rose-600",
      accentBg: "bg-rose-100",
    },
  ];

  useEffect(() => {
    if (!isUpgrade) {
      const t = setTimeout(() => setShowConfetti(false), 5000);
      return () => clearTimeout(t);
    }
  }, [isUpgrade]);

  useEffect(() => {
    if (!showOnboarding) return;
    const id = setInterval(() => {
      setSlideDirection(1);
      setCurrentSlide((p) => (p < slides.length - 1 ? p + 1 : p));
    }, 7000);
    return () => clearInterval(id);
  }, [showOnboarding, slides.length]);

  if (!plan) { navigate("/pro/subscription"); return null; }

  const handleNext = () => {
    if (currentSlide < slides.length - 1) {
      setSlideDirection(1);
      setCurrentSlide((p) => p + 1);
    } else {
      navigate("/pro/dashboard");
    }
  };

  const handlePrev = () => {
    if (currentSlide > 0) {
      setSlideDirection(-1);
      setCurrentSlide((p) => p - 1);
    }
  };

  const newFeatures = PLAN_NEW_FEATURES[plan.id] ?? [];
  const slide = slides[currentSlide];
  const SlideIcon = slide.icon;
  const isLast = currentSlide === slides.length - 1;

  // ── UPGRADE FLOW ─────────────────────────────────────────────────────────────
  if (isUpgrade) {
    return (
      <MobileLayout showNav={false}>
        <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8">
          <div className="w-full max-w-md">
            <div className="flex justify-center mb-6">
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-emerald-400/20 animate-ping" />
                <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-xl shadow-emerald-500/30">
                  <CheckCircle2 size={36} className="text-white" />
                </div>
              </div>
            </div>
            <div className="text-center mb-8">
              <h1 className="text-3xl font-black text-foreground mb-2">Formule mise à jour !</h1>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Tu as maintenant accès à toutes les fonctionnalités de la formule{" "}
                <span className="font-semibold text-foreground">{plan.name}</span>.
              </p>
            </div>
            {previousPlanName && (
              <div className="flex items-center justify-center gap-3 mb-6 px-4 py-3 rounded-2xl bg-muted/50">
                <div className="px-3 py-1.5 rounded-xl bg-muted text-sm font-semibold text-muted-foreground">{previousPlanName}</div>
                <ArrowUpRight size={18} className="text-primary flex-shrink-0" />
                <div className="px-3 py-1.5 rounded-xl bg-primary/10 text-sm font-bold text-primary border border-primary/20">{plan.name}</div>
              </div>
            )}
            {newFeatures.length > 0 && (
              <div className="blyss-card mb-8">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">Ce que tu gagnes</p>
                <div className="space-y-3">
                  {newFeatures.map((f, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                        <Check size={13} className="text-emerald-600" strokeWidth={3} />
                      </div>
                      <span className="text-sm font-medium text-foreground">{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-3">
              <button onClick={() => navigate("/pro/dashboard")} className="w-full py-4 rounded-2xl bg-primary text-white font-bold text-base shadow-xl shadow-primary/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                <Sparkles size={20} />Accéder au dashboard<ArrowRight size={20} />
              </button>
              <button onClick={() => navigate("/pro/subscription-settings")} className="w-full py-3 rounded-xl text-muted-foreground font-medium text-sm active:scale-95 transition-all hover:text-foreground hover:bg-muted/30">
                Gérer mon abonnement
              </button>
            </div>
          </div>
        </div>
      </MobileLayout>
    );
  }

  // ── FIRST-TIME CONFIRMATION ───────────────────────────────────────────────────
  if (!showOnboarding) {
    return (
      <MobileLayout showNav={false}>
        {showConfetti && <Confetti width={window.innerWidth} height={window.innerHeight} recycle={false} numberOfPieces={400} gravity={0.25} />}
        <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8">
          <div className="w-full max-w-md">
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 mb-4">
                <Sparkles size={16} className="text-primary" />
                <span className="text-xs font-bold text-primary uppercase tracking-wide">Compte Pro Activé</span>
              </div>
              <h1 className="text-3xl font-black text-foreground mb-3 leading-tight animate-fade-in-up">
                Félicitations !<br />
                <span className="inline-block animate-gradient bg-gradient-to-r from-primary via-purple-600 to-primary bg-[length:200%_auto] bg-clip-text text-transparent">
                  Votre espace pro est prêt
                </span>
              </h1>
              <p className="text-base text-muted-foreground leading-relaxed animate-fade-in-up" style={{ animationDelay: "0.2s" }}>
                Vous avez maintenant accès à tous les outils pour développer votre activité.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-8">
              {[
                { icon: Calendar, label: "Agenda illimité", bg: "bg-primary/10", color: "text-primary" },
                { icon: TrendingUp, label: "Analytics pro", bg: "bg-purple-500/10", color: "text-purple-600" },
                { icon: Zap, label: "Sans limite", bg: "bg-emerald-500/10", color: "text-emerald-600" },
              ].map(({ icon: Icon, label, bg, color }, i) => (
                <div key={i} className="blyss-card p-4 text-center bg-card">
                  <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center mx-auto mb-2`}>
                    <Icon size={20} className={color} />
                  </div>
                  <p className="text-xs font-semibold text-foreground">{label}</p>
                </div>
              ))}
            </div>
            <div className="blyss-card bg-card border-2 border-primary/10 mb-8">
              <div className="flex items-center gap-3 mb-4 pb-4 border-b border-border">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Sparkles size={24} className="text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground mb-0.5">Votre formule</p>
                  <p className="text-lg font-bold text-foreground">{plan.name}</p>
                </div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-bold text-emerald-700">Actif</span>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                {[["Accès aux fonctionnalités", "Complet"], ["Support prioritaire", "Inclus"], ["Mises à jour", "Automatiques"]].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between">
                    <span className="text-muted-foreground">{k}</span>
                    <span className="font-semibold text-foreground">{v}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <button onClick={() => setShowOnboarding(true)} className="w-full py-4 rounded-2xl bg-primary text-white font-bold text-base shadow-xl shadow-primary/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                Découvrir mon espace pro<ArrowRight size={20} />
              </button>
              <button onClick={() => navigate("/pro/dashboard")} className="w-full py-3 rounded-xl text-muted-foreground font-medium text-sm active:scale-95 transition-all hover:text-foreground hover:bg-muted/30">
                Accéder directement à l'espace
              </button>
            </div>
          </div>
        </div>
        <style>{`
          @keyframes fade-in-up { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
          @keyframes gradient-flow { 0% { background-position:0% center; } 100% { background-position:200% center; } }
          .animate-fade-in-up { animation: fade-in-up 0.8s ease-out backwards; }
          .animate-gradient { animation: gradient-flow 3s linear infinite; }
        `}</style>
      </MobileLayout>
    );
  }

  // ── ONBOARDING BENTO ──────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden">
      {/* Background — smooth color fade between slides */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`bg-${currentSlide}`}
          className={`absolute inset-0 ${slide.bg}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45 }}
        />
      </AnimatePresence>

      {/* Header — minimal */}
      <div className="relative z-10 flex-shrink-0 flex items-center justify-between px-5 pt-5 pb-2">
        <div className="flex items-center gap-1.5">
          {slides.map((_, i) => (
            <motion.div
              key={i}
              className="h-1 rounded-full bg-foreground/15 overflow-hidden cursor-pointer"
              animate={{ width: i === currentSlide ? 22 : 6 }}
              transition={{ type: "spring", damping: 20, stiffness: 300 }}
              onClick={() => { setSlideDirection(i > currentSlide ? 1 : -1); setCurrentSlide(i); }}
            >
              <motion.div
                className="h-full bg-foreground/50 rounded-full"
                initial={{ width: i < currentSlide ? "100%" : "0%" }}
                animate={{ width: i < currentSlide ? "100%" : i === currentSlide ? "100%" : "0%" }}
                transition={i === currentSlide ? { duration: 7, ease: "linear" } : { duration: 0.3 }}
                key={`fill-${currentSlide}-${i}`}
              />
            </motion.div>
          ))}
        </div>
        <motion.button
          onClick={() => navigate("/pro/dashboard")}
          className="text-sm font-semibold text-foreground/50 active:scale-95 transition-all"
          whileTap={{ scale: 0.93 }}
        >
          Passer
        </motion.button>
      </div>

      {/* Content — vertically & horizontally centered */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 overflow-hidden">
        <AnimatePresence mode="wait" custom={slideDirection}>
          <motion.div
            key={currentSlide}
            custom={slideDirection}
            variants={{
              enter: (d: number) => ({ x: d * 56, opacity: 0 }),
              center: { x: 0, opacity: 1 },
              exit: (d: number) => ({ x: d * -56, opacity: 0 }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: "spring", damping: 28, stiffness: 300, mass: 0.8 }}
            className="w-full max-w-sm"
          >
            {/* Bento — natural height */}
            {slide.bento}

            {/* Text — flows below bento */}
            <motion.div
              className="text-center mt-5 px-2"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18, duration: 0.38 }}
            >
              <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full ${slide.accentBg} mb-2.5`}>
                <SlideIcon size={13} className={slide.accent} />
                <span className={`text-[10px] font-bold ${slide.accent} uppercase tracking-wider`}>{slide.title}</span>
              </div>
              <h2 className="text-xl font-black text-foreground mb-2 leading-snug">{slide.title}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">{slide.description}</p>
            </motion.div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div className="relative z-10 flex-shrink-0 px-4 pb-8 pt-3">
        <div className="flex items-center gap-2.5 mb-3.5">
          <AnimatePresence>
            {currentSlide > 0 && (
              <motion.button
                onClick={handlePrev}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.18 }}
                className="px-5 py-3.5 rounded-2xl bg-white/60 backdrop-blur-sm text-foreground font-semibold text-sm active:scale-95 transition-all shadow-sm"
                whileTap={{ scale: 0.95 }}
              >
                Retour
              </motion.button>
            )}
          </AnimatePresence>
          <motion.button
            onClick={handleNext}
className="flex-1 py-4 rounded-2xl bg-pink-500 hover:bg-pink-600 text-white font-bold text-base shadow-xl flex items-center justify-center gap-2 transition"            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            layout
          >
            {isLast ? "Commencer" : "Suivant"}
            <motion.span
              animate={{ x: [0, 3, 0] }}
              transition={{ repeat: Infinity, duration: 1.4, ease: "easeInOut" }}
            >
              <ArrowRight size={18} />
            </motion.span>
          </motion.button>
        </div>

        {/* Dot indicators */}
        <div className="flex items-center justify-center gap-1.5">
          {slides.map((_, i) => (
            <motion.div
              key={i}
              className="rounded-full bg-foreground/30 cursor-pointer"
              animate={{ width: i === currentSlide ? 20 : 6, opacity: i === currentSlide ? 1 : 0.4 }}
              style={{ height: 6 }}
              transition={{ type: "spring", damping: 20, stiffness: 300 }}
              onClick={() => { setSlideDirection(i > currentSlide ? 1 : -1); setCurrentSlide(i); }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default ProSubscriptionSuccess;
