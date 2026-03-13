/**
 * SplashScreen — Blyss
 * ─────────────────────────────────────────────────────────────────────────────
 * Rendu premium, calme, luxueux.
 *
 * Variantes :
 *   "minimal"  → logo + texte uniquement
 *   "premium"  → logo + texte + 3 icônes abstraites en ligne (défaut)
 *
 * Le splash ne se ferme que quand les deux conditions sont remplies :
 *   1. timer minimum écoulé (TIMING.minDuration)
 *   2. isAuthReady === true
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import logo from "@/assets/logo.png";

// ═════════════════════════════════════════════════════════════════════════════
// CONSTANTES — tout est ici, rien à chercher ailleurs
// ═════════════════════════════════════════════════════════════════════════════

const C = {
  /** Fond — identique au --background de l'app → zéro flash à l'exit */
  bg: "#ffeaf1",
  /** Canal RGB du rose Blyss */
  rgb: "236, 72, 153",
} as const;

const T = {
  // ── ms ──────────────────────────────────────────────────────────────────
  /** Durée minimum d'affichage (ms) */
  min: 3800,
  /** Délai après 100 % avant masquage (ms) */
  exit: 450,

  // ── secondes ────────────────────────────────────────────────────────────
  logoDelay:     0.40,   // apparition du logo
  logoDuration:  1.10,   // durée de l'animation logo
  wordDelay:     0.80,   // apparition de "Blyss"
  wordDuration:  0.90,
  taglineDelay:  1.30,
  taglineDuration: 0.80,
  shimmerDelay:  1.65,   // balayage lumineux
  shimmerDuration: 1.05,
  card1Delay:    1.90,   // 1ère icône (premium)
  card2Delay:    2.10,   // 2ème icône
  card3Delay:    2.30,   // 3ème icône
  cardLife:      2.80,   // durée totale du cycle de chaque icône
} as const;

const L = {
  size:           96,    // px — taille du logo
  glowSpread:     64,    // px — rayon du halo autour du logo
  glowIntensity:  0.17,  // 0–1 — intensité du glow
  glowPulse:      3.60,  // s — cycle de pulsation du glow
} as const;

// ═════════════════════════════════════════════════════════════════════════════
// ICÔNES SVG ABSTRAITES — variant "premium"
// ─────────────────────────────────────────────
// Petites, épurées, sans texte. Une ligne de 3 icônes positionnée sous le
// bloc logo+texte. Opacité maximum 0.58 — elles restent en retrait.
// ═════════════════════════════════════════════════════════════════════════════

const r = `rgba(${C.rgb},`;

const IcoCalendar = () => (
  <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
    <rect x="2" y="5" width="18" height="15" rx="3"
      stroke={`${r}0.60)`} strokeWidth="1.4" />
    <line x1="2" y1="10" x2="20" y2="10"
      stroke={`${r}0.35)`} strokeWidth="1.1" />
    <line x1="7.5" y1="2.5" x2="7.5" y2="7"
      stroke={`${r}0.55)`} strokeWidth="1.4" strokeLinecap="round" />
    <line x1="14.5" y1="2.5" x2="14.5" y2="7"
      stroke={`${r}0.55)`} strokeWidth="1.4" strokeLinecap="round" />
    {/* grille de points */}
    <circle cx="7.5"  cy="14.5" r="1.2" fill={`${r}0.45)`} />
    <circle cx="11"   cy="14.5" r="1.2" fill={`${r}0.45)`} />
    <circle cx="14.5" cy="14.5" r="1.2" fill={`${r}0.30)`} />
  </svg>
);

const IcoBell = () => (
  <svg width="20" height="22" viewBox="0 0 20 22" fill="none">
    <path
      d="M10 2C7.24 2 5 4.24 5 7v5.5L3 15h14l-2-2.5V7c0-2.76-2.24-5-5-5Z"
      stroke={`${r}0.58)`} strokeWidth="1.4" strokeLinejoin="round"
    />
    <path
      d="M8 15c0 1.1.9 2 2 2s2-.9 2-2"
      stroke={`${r}0.40)`} strokeWidth="1.2"
    />
    {/* badge */}
    <circle cx="15" cy="4" r="2.5" fill={`rgb(${C.rgb})`} />
  </svg>
);

const IcoPlanning = () => (
  <svg width="20" height="18" viewBox="0 0 20 18" fill="none">
    <line x1="1" y1="3"  x2="19" y2="3"
      stroke={`${r}0.60)`} strokeWidth="1.4" strokeLinecap="round" />
    <line x1="1" y1="9"  x2="13" y2="9"
      stroke={`${r}0.42)`} strokeWidth="1.4" strokeLinecap="round" />
    <line x1="1" y1="15" x2="16" y2="15"
      stroke={`${r}0.52)`} strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

// ─────────────────────────────────────────────────────────────────────────────
// Icône carrée animée — cycle : entrée → présence → montée + disparition
// ─────────────────────────────────────────────────────────────────────────────
interface IconCardProps {
  children: React.ReactNode;
  delay: number;   // s
  life:  number;   // s
}

const IconCard = ({ children, delay, life }: IconCardProps) => (
  <motion.div
    style={{
      width: 60, height: 60,
      display: "flex", alignItems: "center", justifyContent: "center",
      borderRadius: 18,
      background: "rgba(255, 255, 255, 0.80)",
      border: `1px solid rgba(${C.rgb}, 0.12)`,
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
      boxShadow: "0 2px 20px rgba(0,0,0,0.04), 0 1px 4px rgba(0,0,0,0.03)",
    }}
    initial={{ opacity: 0, y: 16, scale: 0.94 }}
    animate={{
      opacity: [0,    0.58, 0.58,  0   ],
      y:       [16,   0,    -5,   -20  ],
      scale:   [0.94, 1,    1,    0.96 ],
    }}
    transition={{
      delay,
      duration: life,
      times: [0, 0.15, 0.68, 1],
      ease: "easeInOut",
    }}
  >
    {children}
  </motion.div>
);

// ═════════════════════════════════════════════════════════════════════════════
// TYPES
// ═════════════════════════════════════════════════════════════════════════════

interface SplashScreenProps {
  onComplete:  () => void;
  isAuthReady: boolean;
  /**
   * "minimal"  → logo + texte, épuré
   * "premium"  → logo + texte + 3 icônes flottantes (défaut)
   */
  variant?: "minimal" | "premium";
}

// ═════════════════════════════════════════════════════════════════════════════
// COMPOSANT PRINCIPAL
// ═════════════════════════════════════════════════════════════════════════════

const SplashScreen = ({
  onComplete,
  isAuthReady,
  variant = "premium",
}: SplashScreenProps) => {
  const [progress,   setProgress]   = useState(0);
  const [isVisible,  setIsVisible]  = useState(true);

  const timerDone   = useRef(false);
  const authReady   = useRef(isAuthReady);
  const completed   = useRef(false);

  // ── fermeture dès que les deux conditions sont réunies ────────────────────
  const tryComplete = useRef(() => {
    if (completed.current) return;
    if (!timerDone.current || !authReady.current) return;
    completed.current = true;
    setProgress(100);
    setTimeout(() => setIsVisible(false), T.exit);
  }).current;

  useEffect(() => {
    authReady.current = isAuthReady;
    if (isAuthReady) tryComplete();
  }, [isAuthReady, tryComplete]);

  // ── barre de progression (ease-out exponentielle, plafond à 82 %) ─────────
  useEffect(() => {
    const start = Date.now();
    let raf: number;
    const tick = () => {
      const t     = Math.min((Date.now() - start) / T.min, 1);
      const eased = 1 - Math.pow(1 - t, 2.8);
      setProgress(Math.round(eased * 82));
      if (t < 1) { raf = requestAnimationFrame(tick); }
      else { timerDone.current = true; tryComplete(); }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [tryComplete]);

  // ─────────────────────────────────────────────────────────────────────────

  const easeOut = [0.16, 1, 0.3, 1] as const;

  return (
    <AnimatePresence onExitComplete={onComplete}>
      {isVisible && (
        <motion.div
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden select-none"
          style={{ backgroundColor: C.bg }}
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.02 }}
          transition={{ duration: 0.70, ease: [0.22, 1, 0.36, 1] }}
        >

          {/* ── Ambiance — deux orbes radiales, très discrètes ──────────── */}
          <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
            <div style={{
              position: "absolute", top: "-12%", right: "-18%",
              width: "62vw", height: "62vw", borderRadius: "50%",
              background: `radial-gradient(circle, rgba(${C.rgb},0.09) 0%, transparent 65%)`,
            }} />
            <div style={{
              position: "absolute", bottom: "-10%", left: "-16%",
              width: "50vw", height: "50vw", borderRadius: "50%",
              background: `radial-gradient(circle, rgba(${C.rgb},0.055) 0%, transparent 65%)`,
            }} />
          </div>

          {/* ── Bloc central ─────────────────────────────────────────────── */}
          <div
            className="relative z-10 flex flex-col items-center"
            style={{ gap: variant === "premium" ? 44 : 0 }}
          >

            {/* ── Logo + texte ─────────────────────────────────────────── */}
            <div className="flex flex-col items-center">

              {/* Halo diffus derrière le logo */}
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  width: 280, height: 280,
                  top: "50%", left: "50%",
                  transform: "translate(-50%, -68%)",
                  borderRadius: "50%",
                  background: `radial-gradient(circle,
                    rgba(255,255,255,0.68) 0%,
                    rgba(${C.rgb},0.07) 55%,
                    transparent 74%)`,
                  pointerEvents: "none",
                }}
              />

              {/* Logo ─────────────────────────────────────────────────────── */}
              <motion.div
                className="relative"
                initial={{ opacity: 0, scale: 0.93, y: 8 }}
                animate={{ opacity: 1,  scale: 1,    y: 0 }}
                transition={{ delay: T.logoDelay, duration: T.logoDuration, ease: easeOut }}
              >
                {/* Glow pulsant */}
                <motion.div
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    inset: -(L.glowSpread / 2),
                    borderRadius: "50%",
                    background: `radial-gradient(circle,
                      rgba(${C.rgb},${L.glowIntensity}) 0%,
                      transparent 65%)`,
                    pointerEvents: "none",
                  }}
                  animate={{ scale: [1, 1.26, 1], opacity: [0.50, 0.88, 0.50] }}
                  transition={{ duration: L.glowPulse, repeat: Infinity, ease: "easeInOut" }}
                />

                {/* Image du logo + balayage lumineux */}
                <div style={{ position: "relative", width: L.size, height: L.size, overflow: "hidden" }}>
                  <img
                    src={logo}
                    alt="Blyss"
                    width={L.size}
                    height={L.size}
                    style={{
                      objectFit: "contain",
                      filter: `drop-shadow(0 6px 22px rgba(${C.rgb},0.22))`,
                    }}
                  />
                  {/* Shimmer — passe unique, gauche→droite */}
                  <motion.div
                    aria-hidden="true"
                    style={{
                      position: "absolute", inset: 0, zIndex: 10,
                      background: "linear-gradient(110deg, transparent 25%, rgba(255,255,255,0.58) 50%, transparent 75%)",
                      pointerEvents: "none",
                    }}
                    initial={{ x: "-130%" }}
                    animate={{ x: "130%" }}
                    transition={{ delay: T.shimmerDelay, duration: T.shimmerDuration, ease: [0.4, 0, 0.2, 1] }}
                  />
                </div>
              </motion.div>

              {/* Nom "Blyss" — révélation douce en une seule passe ──────── */}
              <motion.div
                style={{ marginTop: 28, overflow: "hidden" }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: T.wordDelay, duration: T.wordDuration, ease: easeOut }}
              >
                <span
                  className="font-display font-bold text-primary"
                  style={{ fontSize: 48, letterSpacing: "-0.5px", lineHeight: 1 }}
                >
                  Blyss
                </span>
              </motion.div>

              {/* Tagline ─────────────────────────────────────────────────── */}
              <motion.p
                className="font-medium tracking-[0.20em] uppercase"
                style={{
                  marginTop: 10,
                  fontSize: 10.5,
                  color: `rgba(${C.rgb}, 0.44)`,
                  letterSpacing: "0.20em",
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: T.taglineDelay, duration: T.taglineDuration, ease: "easeOut" }}
              >
                Beauté · Business · Sérénité
              </motion.p>
            </div>

            {/* ── 3 icônes en ligne (premium uniquement) ───────────────── */}
            {variant === "premium" && (
              <div
                aria-hidden="true"
                style={{ display: "flex", gap: 16, alignItems: "center" }}
              >
                <IconCard delay={T.card1Delay} life={T.cardLife}>
                  <IcoCalendar />
                </IconCard>
                <IconCard delay={T.card2Delay} life={T.cardLife}>
                  <IcoBell />
                </IconCard>
                <IconCard delay={T.card3Delay} life={T.cardLife}>
                  <IcoPlanning />
                </IconCard>
              </div>
            )}

          </div>

          {/* ── Barre de progression — 1 px, discrète ────────────────────── */}
          <div
            className="absolute bottom-0 left-0 right-0"
            style={{ height: 1, overflow: "hidden" }}
          >
            <motion.div
              style={{
                width:  `${progress}%`,
                height: "100%",
                background: `linear-gradient(90deg,
                  hsl(336 99% 68%),
                  hsl(336 99% 78%))`,
                transition: progress === 100 ? "width 0.24s ease-out" : undefined,
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.55 }}
              transition={{ delay: 0.6, duration: 0.6 }}
            />
          </div>

        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SplashScreen;
