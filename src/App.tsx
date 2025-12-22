import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ProDashboard from "./pages/ProDashboard";
import ProCalendar from "./pages/ProCalendar";
import ProClients from "./pages/ProClients";
import ProProfile from "./pages/ProProfile";
import ClientHome from "./pages/ClientHome";
import ClientBooking from "./pages/ClientBooking";
import SpecialistProfile from "./pages/SpecialistProfile";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/pro/dashboard" element={<ProDashboard />} />
          <Route path="/pro/calendar" element={<ProCalendar />} />
          <Route path="/pro/clients" element={<ProClients />} />
          <Route path="/pro/profile" element={<ProProfile />} />
          <Route path="/client" element={<ClientHome />} />
          <Route path="/client/specialist/:id" element={<SpecialistProfile />} />
          <Route path="/client/booking" element={<ClientBooking />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
