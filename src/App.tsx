import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import SplashScreen from "@/components/SplashScreen";
import MobileLayout from "@/components/MobileLayout";
import ScrollToTop from "@/components/ScrollToTop";
import { NotificationProvider } from "@/contexts/NotificationContext";


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
import ProSubscriptionPayment from "./pages/ProSubscriptionPayment";
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

                {/* PRO */}
                <Route path="/pro/subscription" element={<ProSubscription />} />
                <Route path="/pro/subscription-settings" element={<ProSubscriptionSettings />} />
                <Route path="/pro/subscription-payment" element={<ProSubscriptionPayment />} />
                <Route path="/pro/subscription-success" element={<ProSubscriptionSuccess />} />
                <Route path="/pro/help" element={<ProHelp />} />
                <Route path="/pro/notifications" element={<ProNotifications />} />
                <Route path="/pro/payments" element={<ProPayments />} />
                <Route path="/pro/settings" element={<ProSettings />} />
                <Route path="/pro/public-profile" element={<ProPublicProfile />} />

                {/* CLIENT */}
                <Route path="/client/help" element={<ClientHelp />} />
                <Route path="/client/notifications" element={<ClientNotifications />} />
                <Route path="/client/payments" element={<ClientPayements />} />
                <Route path="/client/settings" element={<ClientSettings />} />
                <Route path="/client/booking/:id" element={<ClientBooking />} />
                <Route path="/client/specialists" element={<ClientSpecialists />} />
                <Route path="/client/payment-methods" element={<ClientPayements />} />
                <Route path="/client/specialist/:id" element={<SpecialistProfile />} />
                <Route path="/client/booking-detail/:bookingId" element={<BookingDetail />} />

                {/*ADMIN*/}
                {/* Routes Admin */}
                <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<Navigate to="/admin/dashboard" replace />} />
                <Route path="dashboard" element={<AdminDashboard />} />
                <Route path="users" element={<AdminUsers />} />
                <Route path="notifications" element={<AdminNotifications />} />
                <Route path="bookings" element={<AdminBookings/>} />
                <Route path="payments" element={<AdminPayments />} />
                <Route path="analytics" element={<AdminAnalytics />} />
                <Route path="logs" element={<AdminLogs />} />
                </Route>

                {/* CLIENT */}
                <Route
                  path="/client"
                  element={
                    <MobileLayout showNav={!showSplash}>
                      <ClientHome />
                    </MobileLayout>
                  }
                />
                <Route
                  path="/client/my-booking"
                  element={
                    <MobileLayout showNav={!showSplash}>
                      <ClientMyBooking />
                    </MobileLayout>
                  }
                />
                <Route
                  path="/client/profile"
                  element={
                    <MobileLayout showNav={!showSplash}>
                      <ClientProfile />
                    </MobileLayout>
                  }
                />
                <Route
                  path="/client/favorites"
                  element={
                    <MobileLayout showNav={!showSplash}>
                      <ClientFavorites />
                    </MobileLayout>
                  }
                />

                {/* PRO */}
                <Route
                  path="/pro/subscription"
                  element={
                    <MobileLayout showNav={!showSplash}>
                      <ProSubscription />
                    </MobileLayout>
                  }
                />
                <Route
                  path="/pro/dashboard"
                  element={
                    <MobileLayout showNav={!showSplash}>
                      <ProDashboard />
                    </MobileLayout>
                  }
                />
                <Route
                  path="/pro/calendar"
                  element={
                    <MobileLayout showNav={!showSplash}>
                      <ProCalendar />
                    </MobileLayout>
                  }
                />
                <Route
                  path="/pro/clients"
                  element={
                    <MobileLayout showNav={!showSplash}>
                      <ProClients />
                    </MobileLayout>
                  }
                />
                <Route
                  path="/pro/profile"
                  element={
                    <MobileLayout showNav={!showSplash}>
                      <ProProfile />
                    </MobileLayout>
                  }
                />
                <Route
                  path="/pro/settings"
                  element={
                    <MobileLayout showNav={!showSplash}>
                      <ProSettings />
                    </MobileLayout>
                  }
                />
                <Route
                  path="/pro/payment"
                  element={
                    <MobileLayout showNav={!showSplash}>
                      <ProPayments />
                    </MobileLayout>
                  }
                />
                <Route
                  path="/pro/notifications"
                  element={
                    <MobileLayout showNav={!showSplash}>
                      <ProNotifications />
                    </MobileLayout>
                  }
                />
                <Route
                  path="/pro/help"
                  element={
                    <MobileLayout showNav={!showSplash}>
                      <ProHelp />
                    </MobileLayout>
                  }
                />

                {/* 404 */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </NotificationProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
