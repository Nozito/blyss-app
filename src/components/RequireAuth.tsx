import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import LoadingScreen from "@/components/LoadingScreen";

interface RequireAuthProps {
  children: React.ReactNode;
  /** Si fourni, redirige vers /login si l'utilisateur n'a pas ce rôle */
  role?: "pro" | "client" | "admin";
}

/**
 * Protège les routes authentifiées.
 * - Redirige vers /login si l'utilisateur n'est pas connecté.
 * - Si `role` est fourni, redirige vers / si le rôle ne correspond pas.
 * - Préserve l'URL cible dans `state.from` pour rediriger après login.
 */
const RequireAuth = ({ children, role }: RequireAuthProps) => {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (role) {
    const isAdmin = (user as any)?.is_admin;
    const userRole = user?.role;

    const hasAccess =
      role === "admin" ? Boolean(isAdmin) : userRole === role;

    if (!hasAccess) {
      return <Navigate to="/" replace />;
    }
  }

  return <>{children}</>;
};

export default RequireAuth;
