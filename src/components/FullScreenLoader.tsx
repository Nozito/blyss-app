import { WaveLoader } from "@/components/ui/wave-loader";

interface FullScreenLoaderProps {
  message?: string;
}

/**
 * Loader plein écran partagé — vérification de session (RequireAuth) et
 * chargement des pages lazy (App.tsx). Détecte /admin/* pour peindre le fond
 * sombre du backoffice, sinon ce loader flashait en clair sur ces routes le
 * temps du chargement.
 */
const FullScreenLoader = ({ message = "Chargement" }: FullScreenLoaderProps) => {
  const isAdmin =
    typeof window !== "undefined" &&
    window.location.pathname.startsWith("/admin");

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center ${isAdmin ? "admin-theme bg-background" : "bg-background"}`}
    >
      <WaveLoader message={message} />
    </div>
  );
};

export default FullScreenLoader;
