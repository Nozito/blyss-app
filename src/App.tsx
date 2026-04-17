import { useState, useEffect, lazy, Suspense } from "react";
import * as Sentry from "@sentry/react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { useAuth } from "@/contexts/AuthContext";
import { RevenueCatProvider } from "@/contexts/RevenueCatContext";
import SplashScreen from "@/components/SplashScreen";
import MobileLayout from "@/components/MobileLayout";
import ScrollToTop from "@/components/ScrollToTop";
import { NotificationProvider } from "@/contexts/NotificationContext";
import RequireAuth from "@/components/RequireAuth";
import RequireSubscription from "@/components/RequireSubscription";

// Eager — needed on first paint
import Index from "./pages/Index";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import NotFound from "./pages/NotFound";
import Legal from "./pages/Legal";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import ClientHome from "./pages/ClientHome";

import "./index.css";
import "./App.css";

// ── Lazy Pro pages ────────────────────────────────────────────────────────────
const ProDashboard = lazy(() => import("./pages/ProDashboard"));
const ProCalendar = lazy(() => import("./pages/ProCalendar"));
const ProClients = lazy(() => import("./pages/ProClients"));
const ProProfile = lazy(() => import("./pages/ProProfile"));
const ProSettings = lazy(() => import("./pages/ProSettings"));
const RGPDCenter = lazy(() => import("./pages/RGPDCenter"));
const ProNotifications = lazy(() => import("./pages/ProNotifications"));
const ProHelp = lazy(() => import("./pages/ProHelp"));
const ProPayments = lazy(() => import("./pages/ProPayements"));
const ProSubscription = lazy(() => import("./pages/ProSubscription"));
const ProSubscriptionSettings = lazy(() => import("./pages/ProSubscriptionSettings"));
const ProSubscriptionSuccess = lazy(() => import("./pages/ProSubscriptionSuccess"));
const ProPublicProfile = lazy(() => import("./pages/ProPublicProfile"));
const ProUpgrade = lazy(() => import("./pages/ProUpgrade"));
const ProServices = lazy(() => import("./pages/ProServices"));
const ProServiceForm = lazy(() => import("./pages/ProServiceForm"));
const ProFinance = lazy(() => import("./pages/ProFinance"));

// ── Lazy Client pages ─────────────────────────────────────────────────────────
const ClientBooking = lazy(() => import("./pages/ClientBooking"));
const ClientFavorites = lazy(() => import("./pages/ClientFavorites"));
const SpecialistProfile = lazy(() => import("./pages/SpecialistProfile"));
const ClientMyBooking = lazy(() => import("./pages/ClientMyBooking"));
const ClientProfile = lazy(() => import("./pages/ClientProfile"));
const BookingDetail = lazy(() => import("./pages/BookingDetail"));
const ClientHelp = lazy(() => import("./pages/ClientHelp"));
const ClientSettings = lazy(() => import("./pages/ClientSettings"));
const ClientNotifications = lazy(() => import("./pages/ClientNotifications"));
const ClientPayements = lazy(() => import("./pages/ClientPayements"));
const ClientSpecialists = lazy(() => import("./pages/ClientSpecialists"));

// ── Lazy Admin pages ──────────────────────────────────────────────────────────
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AdminUsers = lazy(() => import("./pages/AdminUsers"));
const AdminNotifications = lazy(() => import("./pages/AdminNotifications"));
const AdminBookings = lazy(() => import("./pages/AdminBooking"));
const AdminLogs = lazy(() => import("./pages/AdminLogs"));
const AdminAnalytics = lazy(() => import("./pages/AdminAnalytics"));
const AdminPayments = lazy(() => import("./pages/AdminPayments"));
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

// ── Shared fallback ───────────────────────────────────────────────────────────
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen bg-cream">
    <div className="w-8 h-8 rounded-full border-2 border-blyss-pink border-t-transparent animate-spin" />
  </div>
);

const queryClient = new QueryClient();

// AppInner a accès à useAuth (rendu à l'intérieur d'AuthProvider)
const AppInner = () => {
  const { isLoading: isAuthLoading } = useAuth();
  const [showSplash, setShowSplash] = useState(true);

  const handleSplashComplete = () => {
    setShowSplash(false);
  };

  return (
    <>
      <OfflineBanner />
      <ScrollToTop />

      {/* Splash au-dessus de tout — attend que l'auth soit prête */}
      {showSplash && (
        <div className="fixed inset-0 z-[9999]">
          <SplashScreen onComplete={handleSplashComplete} isAuthReady={!isAuthLoading} />
        </div>
      )}

      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Pages sans bottom nav */}
          <Route path="/" element={<Index />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/legal" element={<Legal />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* PRO — flow d'abonnement (pas de RequireSubscription ici) */}
          <Route path="/pro/subscription" element={<RequireAuth role="pro"><ProSubscription /></RequireAuth>} />
          <Route path="/pro/subscription-settings" element={<RequireAuth role="pro"><ProSubscriptionSettings /></RequireAuth>} />
          <Route path="/pro/subscription-success" element={<RequireAuth role="pro"><ProSubscriptionSuccess /></RequireAuth>} />
          <Route path="/pro/upgrade" element={<RequireAuth role="pro"><ProUpgrade /></RequireAuth>} />

          {/* PRO — pages métier (RequireSubscription vérifie le plan) */}
          <Route path="/pro/public-profile" element={<RequireAuth role="pro"><RequireSubscription><ProPublicProfile /></RequireSubscription></RequireAuth>} />
          <Route path="/pro/prestations" element={<RequireAuth role="pro"><RequireSubscription><ProServices /></RequireSubscription></RequireAuth>} />
          <Route path="/pro/prestations/create" element={<RequireAuth role="pro"><RequireSubscription><ProServiceForm /></RequireSubscription></RequireAuth>} />
          <Route path="/pro/prestations/:id/edit" element={<RequireAuth role="pro"><RequireSubscription><ProServiceForm /></RequireSubscription></RequireAuth>} />
          <Route path="/pro/finance" element={<RequireAuth role="pro"><RequireSubscription><ProFinance /></RequireSubscription></RequireAuth>} />

          {/* CLIENT — pages gérées par leur propre MobileLayout */}
          <Route path="/client/help" element={<RequireAuth role="client"><ClientHelp /></RequireAuth>} />
          <Route path="/client/notifications" element={<RequireAuth role="client"><ClientNotifications /></RequireAuth>} />
          <Route path="/client/payments" element={<RequireAuth role="client"><ClientPayements /></RequireAuth>} />
          <Route path="/client/settings" element={<RequireAuth role="client"><ClientSettings /></RequireAuth>} />
          <Route path="/client/rgpd" element={<RequireAuth role="client"><RGPDCenter /></RequireAuth>} />
          <Route path="/pro/rgpd" element={<RequireAuth role="pro"><RGPDCenter /></RequireAuth>} />
          <Route path="/client/booking/:id" element={<RequireAuth role="client"><ClientBooking /></RequireAuth>} />
          <Route path="/client/specialists" element={<RequireAuth role="client"><ClientSpecialists /></RequireAuth>} />
          <Route path="/client/payment-methods" element={<RequireAuth role="client"><ClientPayements /></RequireAuth>} />
          <Route path="/client/specialist/:id" element={<RequireAuth role="client"><SpecialistProfile /></RequireAuth>} />
          <Route path="/client/booking-detail/:id" element={<RequireAuth role="client"><BookingDetail /></RequireAuth>} />

          {/* CLIENT — onglets nav (MobileLayout fourni ici pour ClientHome uniquement) */}
          <Route
            path="/client"
            element={
              <RequireAuth role="client">
                <MobileLayout showNav={!showSplash}>
                  <ClientHome />
                </MobileLayout>
              </RequireAuth>
            }
          />
          <Route path="/client/my-booking" element={
            <RequireAuth role="client">
              <Sentry.ErrorBoundary fallback={<p className="p-4 text-red-600">Erreur lors du chargement de vos réservations.</p>}>
                <ClientMyBooking />
              </Sentry.ErrorBoundary>
            </RequireAuth>
          } />
          <Route path="/client/profile" element={<RequireAuth role="client"><ClientProfile /></RequireAuth>} />
          <Route path="/client/favorites" element={<RequireAuth role="client"><ClientFavorites /></RequireAuth>} />

          {/* ADMIN */}
          <Route path="/admin" element={<RequireAuth role="admin"><AdminLayout /></RequireAuth>}>
            <Route index element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="notifications" element={<AdminNotifications />} />
            <Route path="bookings" element={<AdminBookings />} />
            <Route path="payments" element={<AdminPayments />} />
            <Route path="analytics" element={<AdminAnalytics />} />
            <Route path="logs" element={<AdminLogs />} />
          </Route>

          {/* PRO — nav tabs (RequireSubscription vérifie le plan) */}
          <Route path="/pro/dashboard" element={<RequireAuth role="pro"><RequireSubscription><ProDashboard /></RequireSubscription></RequireAuth>} />
          <Route path="/pro/calendar" element={
            <RequireAuth role="pro">
              <RequireSubscription>
                <Sentry.ErrorBoundary fallback={<p className="p-4 text-red-600">Erreur lors du chargement du calendrier.</p>}>
                  <ProCalendar />
                </Sentry.ErrorBoundary>
              </RequireSubscription>
            </RequireAuth>
          } />
          <Route path="/pro/clients" element={<RequireAuth role="pro"><RequireSubscription><ProClients /></RequireSubscription></RequireAuth>} />
          <Route path="/pro/profile" element={<RequireAuth role="pro"><RequireSubscription><ProProfile /></RequireSubscription></RequireAuth>} />
          <Route path="/pro/settings" element={<RequireAuth role="pro"><RequireSubscription><ProSettings /></RequireSubscription></RequireAuth>} />
          <Route path="/pro/payments" element={<RequireAuth role="pro"><RequireSubscription><ProPayments /></RequireSubscription></RequireAuth>} />
          <Route path="/pro/notifications" element={<RequireAuth role="pro"><RequireSubscription><ProNotifications /></RequireSubscription></RequireAuth>} />
          <Route path="/pro/help" element={<RequireAuth role="pro"><RequireSubscription><ProHelp /></RequireSubscription></RequireAuth>} />

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
        <RevenueCatProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <NotificationProvider>
                <AppInner />
              </NotificationProvider>
            </BrowserRouter>
          </TooltipProvider>
        </RevenueCatProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
