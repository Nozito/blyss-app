import { useState, useEffect } from "react";
import * as Sentry from "@sentry/react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { RevenueCatProvider } from "@/contexts/RevenueCatContext";
import SplashScreen from "@/components/SplashScreen";
import MobileLayout from "@/components/MobileLayout";
import ScrollToTop from "@/components/ScrollToTop";
import { NotificationProvider } from "@/contexts/NotificationContext";
import RequireAuth from "@/components/RequireAuth";


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

const App = () => {
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    setShowSplash(true);
  }, []);

  const handleSplashComplete = () => {
    sessionStorage.setItem("blyss_splash_seen", "true");
    setShowSplash(false);
  };

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RevenueCatProvider>
        <NotificationProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />

            <BrowserRouter>
              <ScrollToTop />

              {/* Splash au-dessus de tout */}
              {showSplash && (
                <div className="fixed inset-0 z-[9999]">
                  <SplashScreen onComplete={handleSplashComplete} />
                </div>
              )}

              <Routes>
                {/* Pages sans bottom nav */}
                <Route path="/" element={<Index />} />
                <Route path="/login" element={<Login />} />
                <Route path="/signup" element={<Signup />} />
                <Route path="/legal" element={<Legal />} />

                {/* PRO */}
                <Route path="/pro/subscription" element={<RequireAuth role="pro"><ProSubscription /></RequireAuth>} />
                <Route path="/pro/subscription-settings" element={<RequireAuth role="pro"><ProSubscriptionSettings /></RequireAuth>} />
                <Route path="/pro/subscription-success" element={<RequireAuth role="pro"><ProSubscriptionSuccess /></RequireAuth>} />
                <Route path="/pro/help" element={<RequireAuth role="pro"><ProHelp /></RequireAuth>} />
                <Route path="/pro/notifications" element={<RequireAuth role="pro"><ProNotifications /></RequireAuth>} />
                <Route path="/pro/payments" element={<RequireAuth role="pro"><ProPayments /></RequireAuth>} />
                <Route path="/pro/settings" element={<RequireAuth role="pro"><ProSettings /></RequireAuth>} />
                <Route path="/pro/public-profile" element={<RequireAuth role="pro"><ProPublicProfile /></RequireAuth>} />
                <Route path="/pro/prestations" element={<RequireAuth role="pro"><ProServices /></RequireAuth>} />
                <Route path="/pro/prestations/create" element={<RequireAuth role="pro"><ProServiceForm /></RequireAuth>} />
                <Route path="/pro/prestations/:id/edit" element={<RequireAuth role="pro"><ProServiceForm /></RequireAuth>} />
                <Route path="/pro/finance" element={<RequireAuth role="pro"><ProFinance /></RequireAuth>} />

                {/* CLIENT */}
                <Route path="/client/help" element={<RequireAuth role="client"><ClientHelp /></RequireAuth>} />
                <Route path="/client/notifications" element={<RequireAuth role="client"><ClientNotifications /></RequireAuth>} />
                <Route path="/client/payments" element={<RequireAuth role="client"><ClientPayements /></RequireAuth>} />
                <Route path="/client/settings" element={<RequireAuth role="client"><ClientSettings /></RequireAuth>} />
                <Route path="/client/booking/:id" element={<RequireAuth role="client"><ClientBooking /></RequireAuth>} />
                <Route path="/client/specialists" element={<RequireAuth role="client"><ClientSpecialists /></RequireAuth>} />
                <Route path="/client/payment-methods" element={<RequireAuth role="client"><ClientPayements /></RequireAuth>} />
                <Route path="/client/specialist/:id" element={<RequireAuth role="client"><SpecialistProfile /></RequireAuth>} />
                <Route path="/client/booking-detail/:id" element={<RequireAuth role="client"><BookingDetail /></RequireAuth>} />
                {/*ADMIN*/}
                {/* Routes Admin */}
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

                {/* CLIENT */}
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
                <Route
                  path="/client/my-booking"
                  element={
                    <RequireAuth role="client">
                      <MobileLayout showNav={!showSplash}>
                        <Sentry.ErrorBoundary fallback={<p className="p-4 text-red-600">Erreur lors du chargement de vos réservations.</p>}>
                          <ClientMyBooking />
                        </Sentry.ErrorBoundary>
                      </MobileLayout>
                    </RequireAuth>
                  }
                />
                <Route
                  path="/client/profile"
                  element={
                    <RequireAuth role="client">
                      <MobileLayout showNav={!showSplash}>
                        <ClientProfile />
                      </MobileLayout>
                    </RequireAuth>
                  }
                />
                <Route
                  path="/client/favorites"
                  element={
                    <RequireAuth role="client">
                      <MobileLayout showNav={!showSplash}>
                        <ClientFavorites />
                      </MobileLayout>
                    </RequireAuth>
                  }
                />

                {/* PRO */}
                <Route
                  path="/pro/subscription"
                  element={
                    <RequireAuth role="pro">
                      <MobileLayout showNav={!showSplash}>
                        <ProSubscription />
                      </MobileLayout>
                    </RequireAuth>
                  }
                />
                <Route
                  path="/pro/dashboard"
                  element={
                    <RequireAuth role="pro">
                      <MobileLayout showNav={!showSplash}>
                        <ProDashboard />
                      </MobileLayout>
                    </RequireAuth>
                  }
                />
                <Route
                  path="/pro/calendar"
                  element={
                    <RequireAuth role="pro">
                      <MobileLayout showNav={!showSplash}>
                        <Sentry.ErrorBoundary fallback={<p className="p-4 text-red-600">Erreur lors du chargement du calendrier.</p>}>
                          <ProCalendar />
                        </Sentry.ErrorBoundary>
                      </MobileLayout>
                    </RequireAuth>
                  }
                />
                <Route
                  path="/pro/clients"
                  element={
                    <RequireAuth role="pro">
                      <MobileLayout showNav={!showSplash}>
                        <ProClients />
                      </MobileLayout>
                    </RequireAuth>
                  }
                />
                <Route
                  path="/pro/profile"
                  element={
                    <RequireAuth role="pro">
                      <MobileLayout showNav={!showSplash}>
                        <ProProfile />
                      </MobileLayout>
                    </RequireAuth>
                  }
                />
                <Route
                  path="/pro/settings"
                  element={
                    <RequireAuth role="pro">
                      <MobileLayout showNav={!showSplash}>
                        <ProSettings />
                      </MobileLayout>
                    </RequireAuth>
                  }
                />
                <Route
                  path="/pro/payment"
                  element={
                    <RequireAuth role="pro">
                      <MobileLayout showNav={!showSplash}>
                        <ProPayments />
                      </MobileLayout>
                    </RequireAuth>
                  }
                />
                <Route
                  path="/pro/notifications"
                  element={
                    <RequireAuth role="pro">
                      <MobileLayout showNav={!showSplash}>
                        <ProNotifications />
                      </MobileLayout>
                    </RequireAuth>
                  }
                />
                <Route
                  path="/pro/help"
                  element={
                    <RequireAuth role="pro">
                      <MobileLayout showNav={!showSplash}>
                        <ProHelp />
                      </MobileLayout>
                    </RequireAuth>
                  }
                />

                {/* 404 */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </NotificationProvider>
        </RevenueCatProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
