/**
 * CancellationPolicySettings
 *
 * Permet au professionnel de configurer son délai minimum d'annulation.
 * Fetche la valeur courante au montage, puis envoie PATCH au serveur.
 *
 * SECURITY: Aucune logique de délai côté client — uniquement affichage.
 * La validation est effectuée exclusivement par le serveur.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Clock, Info } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cancellationApi } from "@/services/api";

// ── Types ──────────────────────────────────────────────────────────────────

type NoticeHours = 0 | 2 | 4 | 6 | 12 | 24 | 48 | 72;

interface PolicyOption {
  value: NoticeHours;
  label: string;
}

const POLICY_OPTIONS: PolicyOption[] = [
  { value: 0, label: "Annulation toujours possible" },
  { value: 2, label: "Jusqu'à 2h avant" },
  { value: 4, label: "Jusqu'à 4h avant" },
  { value: 6, label: "Jusqu'à 6h avant" },
  { value: 12, label: "Jusqu'à 12h avant" },
  { value: 24, label: "Jusqu'à 24h avant (recommandé)" },
  { value: 48, label: "Jusqu'à 48h avant" },
  { value: 72, label: "Jusqu'à 72h avant" },
];

// ── Composant ──────────────────────────────────────────────────────────────

export default function CancellationPolicySettings() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<NoticeHours | null>(null);

  // ── Lecture de la politique courante ────────────────────────────────────
  const { isLoading } = useQuery({
    queryKey: ["cancellation-policy"],
    queryFn: async () => {
      const res = await cancellationApi.getPolicy();
      if (!res.success) throw new Error(res.error ?? "Erreur de chargement");
      const hours = (res.data as { cancellation_notice_hours: number })
        .cancellation_notice_hours as NoticeHours;
      setSelected(hours);
      return hours;
    },
  });

  // ── Mutation de mise à jour ──────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: async (hours: NoticeHours) => {
      const res = await cancellationApi.updatePolicy(hours);
      if (!res.success) {
        throw new Error(res.error ?? "Erreur lors de la mise à jour");
      }
      return hours;
    },
    onSuccess: (hours) => {
      queryClient.setQueryData(["cancellation-policy"], hours);
      const label = POLICY_OPTIONS.find((o) => o.value === hours)?.label ?? "";
      toast.success("Politique d'annulation mise à jour", {
        description: label,
      });
    },
    onError: (err: Error) => {
      toast.error("Impossible de mettre à jour", {
        description: err.message,
      });
    },
  });

  const handleSave = () => {
    if (selected === null) return;
    mutation.mutate(selected);
  };

  const isDirty =
    selected !== null &&
    selected !==
      (queryClient.getQueryData<NoticeHours>(["cancellation-policy"]) ?? selected);

  // ── Rendu ────────────────────────────────────────────────────────────────

  return (
    <section
      aria-labelledby="cancellation-policy-title"
      className="rounded-2xl border border-border bg-card p-5 space-y-4"
    >
      {/* En-tête */}
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10"
        >
          <Clock className="h-4 w-4 text-primary" />
        </span>
        <div>
          <h2
            id="cancellation-policy-title"
            className="text-sm font-semibold text-foreground"
          >
            Politique d'annulation
          </h2>
          <p className="text-xs text-muted-foreground">
            Délai minimum avant lequel un client peut annuler
          </p>
        </div>
      </div>

      {/* Select */}
      <div className="space-y-1.5">
        <label
          htmlFor="cancellation-select"
          className="text-xs font-medium text-muted-foreground"
        >
          Délai minimum d'annulation
        </label>

        {isLoading ? (
          <div
            aria-busy="true"
            aria-label="Chargement en cours"
            className="h-10 w-full animate-pulse rounded-md bg-muted"
          />
        ) : (
          <Select
            value={selected !== null ? String(selected) : undefined}
            onValueChange={(v) => setSelected(Number(v) as NoticeHours)}
            disabled={mutation.isPending}
          >
            <SelectTrigger
              id="cancellation-select"
              className="w-full"
              aria-label="Choisir le délai minimum d'annulation"
            >
              <SelectValue placeholder="Choisir un délai…" />
            </SelectTrigger>
            <SelectContent>
              {POLICY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={String(opt.value)}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Info contextuelle */}
      {selected !== null && selected > 0 && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-start gap-2 rounded-xl bg-primary/5 px-3 py-2.5 text-xs text-primary"
        >
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            Vos clients ne pourront plus annuler moins de{" "}
            <strong>{selected}h</strong> avant le rendez-vous.
          </span>
        </div>
      )}

      {/* Bouton enregistrer */}
      <Button
        onClick={handleSave}
        disabled={selected === null || mutation.isPending || !isDirty}
        className="w-full"
        aria-label="Enregistrer la politique d'annulation"
      >
        {mutation.isPending ? "Enregistrement…" : "Enregistrer"}
      </Button>
    </section>
  );
}
