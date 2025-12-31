import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import SplashScreen from "@/components/SplashScreen";
import MobileLayout from "@/components/MobileLayout";
import ScrollToTop from "@/components/ScrollToTop";

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

import NotFound from "./pages/NotFound";

import "./index.css";
import "./App.css";

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
              <Route path="/pro/help" element={<ProHelp />} />
              <Route path="/pro/notifications" element={<ProNotifications />} />
              <Route path="/pro/payments" element={<ProPayments />} />
              <Route path="/pro/settings" element={<ProSettings />} />

              {/* CLIENT */}
              <Route path="/client/help" element={<ClientHelp />} />
              <Route path="/client/notifications" element={<ClientNotifications />} />
              <Route path="/client/payments" element={<ClientPayements />} />
              <Route path="/client/settings" element={<ClientSettings />} />


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
                path="/client/specialist/:id"
                element={
                  <MobileLayout showNav={!showSplash}>
                    <SpecialistProfile />
                  </MobileLayout>
                }
              />
              <Route
                path="/client/booking"
                element={
                  <MobileLayout showNav={!showSplash}>
                    <ClientBooking />
                  </MobileLayout>
                }
              />
              <Route
                path="/client/booking/:id"
                element={
                  <MobileLayout showNav={!showSplash}>
                    <ClientBooking />
                  </MobileLayout>
                }
              />
              <Route
                path="/client/booking-detail/:id"
                element={
                  <MobileLayout showNav={!showSplash}>
                    <BookingDetail />
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
              <Route
                path="/client/my-booking"
                element={
                  <MobileLayout showNav={!showSplash}>
                    <ClientMyBooking />
                  </MobileLayout>
                }
              />
              <Route
                path="/client/help"
                element={
                  <MobileLayout showNav={!showSplash}>
                    <ClientHelp />
                  </MobileLayout>
                }
              />
              <Route
                path="/client/settings"
                element={
                  <MobileLayout showNav={!showSplash}>
                    <ClientSettings />
                  </MobileLayout>
                }
              />
              <Route
                path="/client/notifications"
                element={
                  <MobileLayout showNav={!showSplash}>
                    <ClientNotifications />
                  </MobileLayout>
                }
              />
              <Route
                path="/client/payment-methods"
                element={
                  <MobileLayout showNav={!showSplash}>
                    <ClientPayements />
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
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
