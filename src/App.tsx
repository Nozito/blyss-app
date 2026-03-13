import { useState } from "react";
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

import Index from "./pages/Index";
import Login from "./pages/Login";
import Signup from "./pages/Signup";

import ProDashboard from "./pages/ProDashboard";
import ProCalendar from "./pages/ProCalendar";
import ProClients from "./pages/ProClients";
import ProProfile from "./pages/ProProfile";
import ProSettings from "./pages/ProSettings";
import ProNotifications from "./pages/ProNotifications";
import ProHelp from "./pages/ProHelp";
import ProPayments from "./pages/ProPayements";
import ProSubscription from "./pages/ProSubscription";
import ProSubscriptionSettings from "./pages/ProSubscriptionSettings";
import ProSubscriptionSuccess from "./pages/ProSubscriptionSuccess";
import ProPublicProfile from "./pages/ProPublicProfile";
import ProUpgrade from "./pages/ProUpgrade";

import ClientHome from "./pages/ClientHome";
import ClientBooking from "./pages/ClientBooking";
import ClientFavorites from "./pages/ClientFavorites";
import SpecialistProfile from "./pages/SpecialistProfile";
import ClientMyBooking from "./pages/ClientMyBooking";
import ClientProfile from "./pages/ClientProfile";
import BookingDetail from "./pages/BookingDetail";
import ClientHelp from "./pages/ClientHelp";
import ClientSettings from "./pages/ClientSettings";
import ClientNotifications from "./pages/ClientNotifications";
import ClientPayements from "./pages/ClientPayements";
import ClientSpecialists from "./pages/ClientSpecialists";

import NotFound from "./pages/NotFound";
import Legal from "./pages/Legal";
import ForgotPassword from "./pages/ForgotPassword";

import "./index.css";
import "./App.css";
import AdminNotifications from "./pages/AdminNotifications";
import AdminDashboard from "./pages/AdminDashboard";
import AdminUsers from "./pages/AdminUsers";
import AdminLayout from "./components/AdminLayout";
import AdminBookings from "./pages/AdminBooking";
import AdminLogs from "./pages/AdminLogs";
import AdminAnalytics from "./pages/AdminAnalytics";
import AdminPayments from "./pages/AdminPayments";
import ProServices from "./pages/ProServices";
import ProServiceForm from "./pages/ProServiceForm";
import ProFinance from "./pages/ProFinance";

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
      <ScrollToTop />

      {/* Splash au-dessus de tout — attend que l'auth soit prête */}
      {showSplash && (
        <div className="fixed inset-0 z-[9999]">
          <SplashScreen onComplete={handleSplashComplete} isAuthReady={!isAuthLoading} />
        </div>
      )}

      <Routes>
        {/* Pages sans bottom nav */}
        <Route path="/" element={<Index />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/legal" element={<Legal />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />

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
