import { useState, useEffect, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import ScrollToTop from "@/components/ScrollToTop";
import HtmlThemeSync from "@/components/HtmlThemeSync";
import RequireAuth from "@/components/RequireAuth";
import FullScreenLoader from "@/components/FullScreenLoader";
import { CookiePanel } from "@/components/ui/cookie-banner-1";

// Eager — needed on first paint
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";

import "./index.css";
import "./App.css";

// ── Lazy shared/public pages ──────────────────────────────────────────────────
const RGPDCenter = lazy(() => import("./pages/RGPDCenter"));
const SpecialistProfile = lazy(() => import("./pages/SpecialistProfile"));

// ── Lazy Admin pages ──────────────────────────────────────────────────────────
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AdminUsers = lazy(() => import("./pages/AdminUsers"));
const AdminBookings = lazy(() => import("./pages/AdminBooking"));
const AdminLogs = lazy(() => import("./pages/AdminLogs"));
const AdminAnalytics = lazy(() => import("./pages/AdminAnalytics"));
const AdminTasks = lazy(() => import("./pages/AdminTasks"));
const AdminModeration = lazy(() => import("./pages/AdminModeration"));
const AdminProfile = lazy(() => import("./pages/AdminProfile"));
const AdminLayout = lazy(() => import("./components/AdminLayout"));

// ── Offline banner ────────────────────────────────────────────────────────────
const OfflineBanner = () => {
  const [offline, setOffline] = useState(!navigator.onLine);
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  if (!offline) return null;
  return (
    <div className="fixed top-0 inset-x-0 z-[99999] flex items-center justify-center gap-2 bg-gray-900 text-white text-sm py-2 px-4">
      <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
      Pas de connexion — certaines fonctionnalités sont indisponibles
    </div>
  );
};

const queryClient = new QueryClient();

const AppInner = () => {
  return (
    <>
      <OfflineBanner />
      <ScrollToTop />
      <HtmlThemeSync />
      <CookiePanel />

      <Suspense fallback={<FullScreenLoader />}>
        <Routes>
          {/* Pas de wall marketing — accès direct au login */}
          <Route path="/" element={<Login />} />
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* Fiche pro publique — lien partagé depuis l'app (blyssapp.fr/s/:id), consultable sans compte */}
          <Route path="/s/:id" element={<SpecialistProfile />} />

          {/* RGPD — doit rester accessible sans l'app (droit d'accès/suppression) */}
          <Route path="/client/rgpd" element={<RequireAuth role="client"><RGPDCenter /></RequireAuth>} />
          <Route path="/pro/rgpd" element={<RequireAuth role="pro"><RGPDCenter /></RequireAuth>} />

          {/* ADMIN */}
          <Route path="/admin" element={<RequireAuth role="admin"><AdminLayout /></RequireAuth>}>
            <Route index element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="bookings" element={<AdminBookings />} />
            {/* Fusionnée dans /admin/analytics (onglet Transactions) — redirection pour ne pas casser d'anciens liens */}
            <Route path="payments" element={<Navigate to="/admin/analytics" replace />} />
            <Route path="analytics" element={<AdminAnalytics />} />
            <Route path="logs" element={<AdminLogs />} />
            <Route path="tasks" element={<AdminTasks />} />
            <Route path="moderation" element={<AdminModeration />} />
            <Route path="profile" element={<AdminProfile />} />
          </Route>

          {/* 404 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </>
  );
};

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AppInner />
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
