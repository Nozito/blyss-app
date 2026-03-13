/**
 * RequireSubscription — Guard d'accès par abonnement.
 *
 * Règles :
 * - Admin → bypass complet
 * - Route du flow d'abonnement → toujours accessible
 * - Pas de plan actif → /pro/subscription
 * - Plan insuffisant pour la route → /pro/upgrade
 */

import { Navigate, useLocation } from "react-router-dom";
import { useRevenueCat } from "@/contexts/RevenueCatContext";
import { useAuth } from "@/contexts/AuthContext";
import LoadingScreen from "@/components/LoadingScreen";
import {
  canAccessRoute,
  isSubscriptionRoute,
} from "@/config/subscriptionConfig";

interface RequireSubscriptionProps {
  children: React.ReactNode;
}

const RequireSubscription = ({ children }: RequireSubscriptionProps) => {
  const { activePlan, isLoading: subLoading } = useRevenueCat();
  const { isLoading: authLoading, user } = useAuth();
  const location = useLocation();

  // Admin bypass — accès complet sans restriction de plan
  if ((user as any)?.is_admin) return <>{children}</>;

  // Attendre la résolution de l'auth et de l'abonnement
  if (authLoading || subLoading) {
    return <LoadingScreen />;
  }

  // Flow d'abonnement — toujours accessible même sans plan
  if (isSubscriptionRoute(location.pathname)) {
    return <>{children}</>;
  }

  // Aucun plan actif → rediriger vers la page d'abonnement
  if (!activePlan) {
    return (
      <Navigate
        to="/pro/subscription"
        state={{ from: location }}
        replace
      />
    );
  }

  // Plan insuffisant pour cette route → page upgrade
  if (!canAccessRoute(activePlan, location.pathname)) {
    return (
      <Navigate
        to="/pro/upgrade"
        state={{ from: location }}
        replace
      />
    );
  }

  return <>{children}</>;
};

export default RequireSubscription;
