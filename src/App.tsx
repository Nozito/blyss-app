import { useState, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import SplashScreen from "@/components/SplashScreen";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ProDashboard from "./pages/ProDashboard";
import ProCalendar from "./pages/ProCalendar";
import ProClients from "./pages/ProClients";
import ProProfile from "./pages/ProProfile";
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
import ProSettings from "./pages/ProSettings";
import ProNotifications from "./pages/ProNotifications";
import ProHelp from "./pages/ProHelp";
import ProPayments from "./pages/ProPayements";
import ScrollToTop from "./components/ScrollToTop";

const queryClient = new QueryClient();

const App = () => {
  const [showSplash, setShowSplash] = useState(true);

  // Afficher le splash uniquement au premier chargement de la session
  useEffect(() => {
    const hasSeenSplash = sessionStorage.getItem("blyss_splash_seen");
    if (hasSeenSplash) {
      setShowSplash(false);
    }
  }, []);

  const handleSplashComplete = () => {
    sessionStorage.setItem("blyss_splash_seen", "true");
    setShowSplash(false);
  };

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          {showSplash && <SplashScreen onComplete={handleSplashComplete} />}
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <ScrollToTop />
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/pro/dashboard" element={<ProDashboard />} />
              <Route path="/pro/calendar" element={<ProCalendar />} />
              <Route path="/pro/clients" element={<ProClients />} />
              <Route path="/pro/profile" element={<ProProfile />} />
              <Route path="/pro/settings" element={<ProSettings />} />
              <Route path="/pro/payment" element={<ProPayments />} />
              <Route path="/pro/notifications" element={<ProNotifications />} />
              <Route path="/pro/help" element={<ProHelp />} />
              <Route path="/client" element={<ClientHome />} />
              <Route path="/client/specialist/:id" element={<SpecialistProfile />} />
              <Route path="/client/booking" element={<ClientBooking />} />
              <Route path="/client/booking/:id" element={<ClientBooking />} />
              <Route path="/client/booking-detail/:id" element={<BookingDetail />} />
              <Route path="/client/profile" element={<ClientProfile />} />
              <Route path="/client/favorites" element={<ClientFavorites />} />
              <Route path="/client/my-booking" element={<ClientMyBooking />} />
              <Route path="/client/help" element={<ClientHelp />} />
              <Route path="/client/settings" element={<ClientSettings />} />
              <Route path="/client/notifications" element={<ClientNotifications />} />
              <Route path="/client/payment-methods" element={<ClientPayements />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
