import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import {
  Purchases,
  type CustomerInfo,
  type Offerings,
  type Package,
} from "@revenuecat/purchases-js";
import { useAuth } from "@/contexts/AuthContext";
import { proApi } from "@/services/api";
import { getActivePlan, type PlanId } from "@/services/revenuecat";

interface BackendSubscription {
  id: number;
  plan: PlanId;
  billingType: "monthly" | "one_time";
  monthlyPrice: number;
  totalPrice: number | null;
  commitmentMonths: number | null;
  startDate: string;
  endDate: string | null;
  status: string;
}

interface RevenueCatContextType {
  customerInfo: CustomerInfo | null;
  offerings: Offerings | null;
  activePlan: PlanId | null;
  backendSubscription: BackendSubscription | null;
  isLoading: boolean;
  refreshCustomerInfo: () => Promise<void>;
  purchasePackage: (pkg: Package) => Promise<CustomerInfo>;
  restorePurchases: () => Promise<void>;
}

const RevenueCatContext = createContext<RevenueCatContextType | undefined>(
  undefined
);

interface RevenueCatProviderProps {
  children: ReactNode;
}

export const RevenueCatProvider: React.FC<RevenueCatProviderProps> = ({
  children,
}) => {
  const { user } = useAuth();
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [offerings, setOfferings] = useState<Offerings | null>(null);
  const [rcActivePlan, setRcActivePlan] = useState<PlanId | null>(null);
  const [backendSubscription, setBackendSubscription] = useState<BackendSubscription | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [configuredUserId, setConfiguredUserId] = useState<string | null>(null);

  // Fetch backend subscription
  const fetchBackendSubscription = useCallback(async () => {
    try {
      const res = await proApi.getSubscription();
      if (res.success && res.data) {
        setBackendSubscription(res.data as BackendSubscription);
      } else {
        setBackendSubscription(null);
      }
    } catch {
      // Non-blocking — UI will show no active plan
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setCustomerInfo(null);
      setOfferings(null);
      setRcActivePlan(null);
      setBackendSubscription(null);
      setConfiguredUserId(null);
      return;
    }

    const userId = user.id.toString();

    if (configuredUserId === userId) return;

    const init = async () => {
      setIsLoading(true);
      try {
        // Toujours récupérer l'abonnement backend — c'est le fallback si RC est absent
        await fetchBackendSubscription();

        const apiKey = import.meta.env.VITE_REVENUECAT_API_KEY;
        if (!apiKey) {
          console.warn("VITE_REVENUECAT_API_KEY is not set — falling back to backend subscription");
          setConfiguredUserId(userId);
          return;
        }

        Purchases.configure(apiKey, userId);
        setConfiguredUserId(userId);

        const [offeringsResult, customerInfoResult] = await Promise.all([
          Purchases.getSharedInstance().getOfferings(),
          Purchases.getSharedInstance().getCustomerInfo(),
        ]);

        setOfferings(offeringsResult);
        setCustomerInfo(customerInfoResult);
        setRcActivePlan(getActivePlan(customerInfoResult));
      } catch {
        // RC unavailable — fallback to backend subscription
      } finally {
        setIsLoading(false);
      }
    };

    init();
  }, [user, configuredUserId, fetchBackendSubscription]);

  const refreshCustomerInfo = useCallback(async () => {
    try {
      const [info] = await Promise.all([
        Purchases.getSharedInstance().getCustomerInfo(),
        fetchBackendSubscription(),
      ]);
      setCustomerInfo(info);
      setRcActivePlan(getActivePlan(info));
    } catch {
      // Silently ignore — caller handles stale UI state
    }
  }, [fetchBackendSubscription]);

  const purchasePackage = useCallback(
    async (pkg: Package): Promise<CustomerInfo> => {
      const { customerInfo: updatedInfo } =
        await Purchases.getSharedInstance().purchase({ rcPackage: pkg });
      setCustomerInfo(updatedInfo);
      setRcActivePlan(getActivePlan(updatedInfo));
      await fetchBackendSubscription();
      return updatedInfo;
    },
    [fetchBackendSubscription]
  );

  const restorePurchases = useCallback(async () => {
    try {
      const info = await Purchases.getSharedInstance().getCustomerInfo();
      setCustomerInfo(info);
      setRcActivePlan(getActivePlan(info));
      await fetchBackendSubscription();
    } catch (error) {
      throw error; // Re-throw — caller (UI) handles the error message
    }
  }, [fetchBackendSubscription]);

  // RC entitlements take priority, backend is fallback (status must be active/trialing)
  const activePlan: PlanId | null =
    rcActivePlan ??
    (backendSubscription?.status === "active" || backendSubscription?.status === "trialing"
      ? backendSubscription.plan
      : null);

  // Considérer comme loading si l'utilisateur est présent mais que l'init RC
  // n'a pas encore démarré (configuredUserId = null) — évite la redirection
  // prématurée vers /pro/subscription pendant le premier rendu async
  const effectiveLoading = isLoading || (!!user && configuredUserId === null);

  const value: RevenueCatContextType = {
    customerInfo,
    offerings,
    activePlan,
    backendSubscription,
    isLoading: effectiveLoading,
    refreshCustomerInfo,
    purchasePackage,
    restorePurchases,
  };

  return (
    <RevenueCatContext.Provider value={value}>
      {children}
    </RevenueCatContext.Provider>
  );
};

export const useRevenueCat = (): RevenueCatContextType => {
  const context = useContext(RevenueCatContext);
  if (context === undefined) {
    throw new Error("useRevenueCat must be used within a RevenueCatProvider");
  }
  return context;
};

export default RevenueCatContext;
