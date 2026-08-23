import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Shield, Search, UserPlus, X, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";
import { fetchAllPages } from "@/utils/fetchAllPages";

const API_URL = import.meta.env.VITE_API_URL || "";

interface AdminUser {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  role: "client" | "pro";
  created_at: string;
}

interface SearchableUser {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  role: "client" | "pro";
  is_admin: boolean;
}

interface AdminAccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const AdminAccessDialog = ({ open, onOpenChange }: AdminAccessDialogProps) => {
  const { user: currentUser } = useAuth();
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [allUsers, setAllUsers] = useState<SearchableUser[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [granting, setGranting] = useState<number | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<AdminUser | null>(null);
  const [revokeLoading, setRevokeLoading] = useState(false);

  useEffect(() => {
    if (open) {
      fetchAdmins();
      fetchAllUsers();
    }
  }, [open]);

  const fetchAdmins = async () => {
    try {
      const response = await fetch(`${API_URL}/api/admin/admins`, { credentials: "include" });
      if (response.ok) {
        const data = await response.json();
        setAdmins(data.data || []);
      }
    } catch {
      toast.error("Erreur lors du chargement des accès admin");
    } finally {
      setLoading(false);
    }
  };

  const fetchAllUsers = async () => {
    try {
      // L'API pagine (défaut 50/page) — la recherche ci-dessous est faite
      // côté client sur `allUsers`, donc il faut TOUT charger, sinon un
      // compte hors des N plus récents devient introuvable ici. Les pages
      // sont chargées en parallèle (fetchAllPages), pas une par une.
      const all = await fetchAllPages<SearchableUser>(`${API_URL}/api/admin/users`);
      setAllUsers(all);
    } catch {
      // silencieux — la recherche sera juste vide
    }
  };

  const searchResults = useMemo(() => {
    if (searchQuery.trim().length < 2) return [];
    const q = searchQuery.toLowerCase();
    return allUsers
      .filter((u) => !u.is_admin)
      .filter(
        (u) =>
          u.email.toLowerCase().includes(q) ||
          `${u.first_name} ${u.last_name}`.toLowerCase().includes(q)
      )
      .slice(0, 5);
  }, [searchQuery, allUsers]);

  const handleGrant = async (targetId: number) => {
    setGranting(targetId);
    try {
      const response = await fetch(`${API_URL}/api/admin/users/${targetId}/grant-admin`, {
        method: "PATCH",
        credentials: "include",
      });
      if (response.ok) {
        toast.success("Accès admin accordé");
        setSearchQuery("");
        fetchAdmins();
        fetchAllUsers();
      } else {
        const data = await response.json().catch(() => ({}));
        toast.error(data.message || "Impossible d'accorder l'accès");
      }
    } catch {
      toast.error("Erreur serveur");
    } finally {
      setGranting(null);
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    setRevokeLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/admin/users/${revokeTarget.id}/revoke-admin`, {
        method: "PATCH",
        credentials: "include",
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        toast.success("Accès admin retiré");
        fetchAdmins();
        fetchAllUsers();
      } else {
        toast.error(data.message || "Impossible de retirer l'accès");
      }
    } catch {
      toast.error("Erreur serveur");
    } finally {
      setRevokeLoading(false);
      setRevokeTarget(null);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Inviter un admin</DialogTitle>
            <DialogDescription>
              Recherche un compte existant (client ou pro) pour lui donner l'accès au backoffice.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Nom ou email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                autoFocus
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Effacer la recherche"
                  className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
                  onClick={() => setSearchQuery("")}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              )}
            </div>

            <AnimatePresence>
              {searchResults.length > 0 && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="space-y-2 overflow-hidden">
                  {searchResults.map((u) => (
                    <div key={u.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">
                            {u.first_name[0]}
                            {u.last_name[0]}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium">
                            {u.first_name} {u.last_name}
                          </p>
                          <p className="text-xs text-muted-foreground">{u.email}</p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleGrant(u.id)}
                        disabled={granting === u.id}
                        aria-label={`Accorder l'accès admin à ${u.first_name} ${u.last_name}`}
                      >
                        {granting === u.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <UserPlus className="h-4 w-4" aria-hidden="true" />}
                      </Button>
                    </div>
                  ))}
                </motion.div>
              )}
              {searchQuery.trim().length >= 2 && searchResults.length === 0 && (
                <p className="text-xs text-muted-foreground py-2">
                  Aucun compte trouvé — la personne doit d'abord avoir un compte Blyss.
                </p>
              )}
            </AnimatePresence>

            <Separator />

            <div>
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
                Accès actuels ({admins.length})
              </h3>
              {loading ? (
                <p className="text-sm text-muted-foreground">Chargement...</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  <AnimatePresence>
                    {admins.map((admin) => (
                      <motion.div
                        key={admin.id}
                        layout
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="flex items-center justify-between"
                      >
                        <div className="flex items-center space-x-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                              {admin.first_name[0]}
                              {admin.last_name[0]}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-medium">
                              {admin.first_name} {admin.last_name}
                            </p>
                            <p className="text-xs text-muted-foreground">{admin.email}</p>
                          </div>
                        </div>
                        {admin.id === currentUser?.id ? (
                          <div className="flex items-center text-xs text-muted-foreground gap-1.5">
                            <Shield className="h-3.5 w-3.5 text-primary" />
                            Toi
                          </div>
                        ) : (
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setRevokeTarget(admin)}>
                            Retirer
                          </Button>
                        )}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!revokeTarget} onOpenChange={(v) => !v && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Retirer l'accès admin de {revokeTarget?.first_name} {revokeTarget?.last_name} ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Cette personne ne pourra plus se connecter au backoffice. Son compte {revokeTarget?.role === "pro" ? "pro" : "client"} reste inchangé.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revokeLoading}>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleRevoke} disabled={revokeLoading} className="bg-destructive hover:bg-destructive/90 text-white">
              {revokeLoading ? "En cours..." : "Retirer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default AdminAccessDialog;
