import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ShieldCheck, ShieldOff, Copy, Check, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { SectionCard } from "@/components/admin/SectionCard";
import { StatusBadge } from "@/components/admin/StatusBadge";

const API_URL = import.meta.env.VITE_API_URL || "";

const otpSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Le code doit contenir 6 chiffres"),
});

export interface TwoFactorSetupProps {
  enabled: boolean;
  /** Appelé après une activation/désactivation réussie pour rafraîchir le profil. */
  onChange: () => void | Promise<void>;
}

/**
 * Section 2FA complète — statut, activation (QR + confirmation + codes de
 * secours) et désactivation. Auto-contenue : possède ses propres dialogues,
 * pour ne pas alourdir la page qui l'utilise.
 */
export function TwoFactorSetup({ enabled, onChange }: TwoFactorSetupProps) {
  const [setupOpen, setSetupOpen] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [step, setStep] = useState<"qr" | "confirm" | "backup">("qr");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);

  const confirmForm = useForm<z.infer<typeof otpSchema>>({
    resolver: zodResolver(otpSchema),
    defaultValues: { code: "" },
  });
  const disableForm = useForm<z.infer<typeof otpSchema>>({
    resolver: zodResolver(otpSchema),
    defaultValues: { code: "" },
  });

  const startSetup = async () => {
    setSetupOpen(true);
    setStep("qr");
    confirmForm.reset({ code: "" });
    try {
      const response = await fetch(`${API_URL}/api/admin/2fa/setup`, { method: "POST", credentials: "include" });
      const data = await response.json();
      if (response.ok) {
        setQrCode(data.data.qr_code);
        setSecret(data.data.secret);
      } else {
        toast.error(data.message || "Impossible de démarrer l'activation");
        setSetupOpen(false);
      }
    } catch {
      toast.error("Erreur serveur");
      setSetupOpen(false);
    }
  };

  const onConfirm = async (values: z.infer<typeof otpSchema>) => {
    setSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/api/admin/2fa/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token: values.code }),
      });
      const data = await response.json();
      if (response.ok) {
        setBackupCodes(data.data.backup_codes);
        setStep("backup");
        await onChange();
      } else {
        toast.error(data.message || "Code invalide");
      }
    } catch {
      toast.error("Erreur serveur");
    } finally {
      setSubmitting(false);
    }
  };

  const onDisable = async (values: z.infer<typeof otpSchema>) => {
    setSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/api/admin/2fa/disable`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token: values.code }),
      });
      const data = await response.json();
      if (response.ok) {
        toast.success("2FA désactivée");
        setDisableOpen(false);
        disableForm.reset({ code: "" });
        await onChange();
      } else {
        toast.error(data.message || "Code invalide");
      }
    } catch {
      toast.error("Erreur serveur");
    } finally {
      setSubmitting(false);
    }
  };

  const copyBackupCodes = () => {
    navigator.clipboard.writeText(backupCodes.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <SectionCard
        title="Double authentification"
        actions={<StatusBadge tone={enabled ? "success" : "neutral"} label={enabled ? "Activée" : "Désactivée"} />}
      >
        <div className="flex items-start gap-3">
          {enabled ? (
            <ShieldCheck size={18} className="text-foreground shrink-0 mt-0.5" aria-hidden="true" />
          ) : (
            <ShieldOff size={18} className="text-muted-foreground shrink-0 mt-0.5" aria-hidden="true" />
          )}
          <p className="text-sm text-muted-foreground">
            {enabled
              ? "Un code de ton application d'authentification est requis à chaque connexion au backoffice web."
              : "Recommandé pour tout compte admin — protège l'accès au backoffice web même si ton mot de passe fuite."}
          </p>
        </div>
        <div className="mt-4">
          {enabled ? (
            <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => setDisableOpen(true)}>
              Désactiver la 2FA
            </Button>
          ) : (
            <Button onClick={startSetup} className="font-semibold">
              <KeyRound className="h-4 w-4 mr-2" aria-hidden="true" />
              Activer la 2FA
            </Button>
          )}
        </div>
      </SectionCard>

      {/* Activation 2FA */}
      <Dialog open={setupOpen} onOpenChange={(v) => { setSetupOpen(v); if (!v) setStep("qr"); }}>
        <DialogContent>
          {step === "qr" && (
            <>
              <DialogHeader>
                <DialogTitle>Scanner le QR code</DialogTitle>
                <DialogDescription>
                  Avec Google Authenticator, 1Password ou toute app compatible TOTP.
                </DialogDescription>
              </DialogHeader>
              {qrCode ? (
                <div className="flex flex-col items-center gap-3">
                  <img src={qrCode} alt="QR code 2FA" className="w-48 h-48 rounded-lg border border-border" />
                  <p className="text-xs text-muted-foreground font-mono break-all text-center">{secret}</p>
                </div>
              ) : (
                <Skeleton className="w-48 h-48 mx-auto rounded-lg" />
              )}
              <DialogFooter>
                <Button onClick={() => setStep("confirm")} disabled={!qrCode} className="w-full">
                  J'ai scanné le code
                </Button>
              </DialogFooter>
            </>
          )}

          {step === "confirm" && (
            <>
              <DialogHeader>
                <DialogTitle>Entre le code généré</DialogTitle>
                <DialogDescription>Vérifie que tout fonctionne avant d'activer la 2FA.</DialogDescription>
              </DialogHeader>
              <Form {...confirmForm}>
                <form onSubmit={confirmForm.handleSubmit(onConfirm)} className="flex flex-col items-center gap-6">
                  <FormField
                    control={confirmForm.control}
                    name="code"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <InputOTP maxLength={6} {...field}>
                            <InputOTPGroup>
                              {Array.from({ length: 6 }).map((_, i) => (
                                <InputOTPSlot key={i} index={i} />
                              ))}
                            </InputOTPGroup>
                          </InputOTP>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" disabled={submitting} className="w-full">
                    {submitting ? "Vérification..." : "Activer"}
                  </Button>
                </form>
              </Form>
            </>
          )}

          {step === "backup" && (
            <>
              <DialogHeader>
                <DialogTitle>2FA activée</DialogTitle>
                <DialogDescription>
                  Enregistre ces codes de secours dans un endroit sûr — chacun ne fonctionne qu'une fois, si tu perds l'accès à ton app d'authentification.
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-2 p-4 rounded-lg bg-muted font-mono text-sm">
                {backupCodes.map((code) => (
                  <span key={code}>{code}</span>
                ))}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={copyBackupCodes}>
                  {copied ? <Check className="h-4 w-4 mr-2" aria-hidden="true" /> : <Copy className="h-4 w-4 mr-2" aria-hidden="true" />}
                  {copied ? "Copié" : "Copier"}
                </Button>
                <Button onClick={() => setSetupOpen(false)}>Terminé</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Désactivation 2FA */}
      <Dialog open={disableOpen} onOpenChange={setDisableOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Désactiver la 2FA</DialogTitle>
            <DialogDescription>Confirme avec un code de ton application d'authentification.</DialogDescription>
          </DialogHeader>
          <Form {...disableForm}>
            <form onSubmit={disableForm.handleSubmit(onDisable)} className="flex flex-col items-center gap-6">
              <FormField
                control={disableForm.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <InputOTP maxLength={6} {...field}>
                        <InputOTPGroup>
                          {Array.from({ length: 6 }).map((_, i) => (
                            <InputOTPSlot key={i} index={i} />
                          ))}
                        </InputOTPGroup>
                      </InputOTP>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" variant="destructive" disabled={submitting} className="w-full">
                {submitting ? "Vérification..." : "Désactiver"}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
