import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import FullScreenLoader from "@/components/FullScreenLoader";

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
 *
 * SECURITY: This is a UX guard only.
 * All server endpoints enforce authorization independently via middleware.
 * Modifying localStorage cannot grant actual server access.
 */
const RequireAuth = ({ children, role }: RequireAuthProps) => {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <FullScreenLoader />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (role) {
    // UX guard only — authoritative check is server-side (requireAdminMiddleware)
    const isAdmin = user?.is_admin === true;
    const userRole = user?.role;

    // Admins can navigate to any role's interface (they choose their view in the modal)
    const hasAccess =
      isAdmin || (role === "admin" ? isAdmin : userRole === role);

    if (!hasAccess) {
      // pro/client n'ont plus d'interface web (app mobile uniquement, cf. Login.tsx) —
      // /pro/dashboard et /client n'existent plus ici, seul "/" (login) reste valide.
      return <Navigate to="/" replace />;
    }
  }

  return <>{children}</>;
};

export default RequireAuth;
