import { Resend } from "resend";

export async function sendPasswordResetEmail(
  to: string,
  firstName: string,
  token: string
): Promise<void> {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const FROM = process.env.EMAIL_FROM || "Blyss <noreply@blyssapp.fr>";
  const APP_URL = process.env.APP_URL || "https://app.blyssapp.fr";
  const resetUrl = `${APP_URL}/reset-password?token=${encodeURIComponent(token)}`;

  await resend.emails.send({
    from: FROM,
    to,
    subject: "Réinitialisation de ton mot de passe Blyss",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #1a1a1a;">
        <img src="${APP_URL}/logo.png" alt="Blyss" style="height: 36px; margin-bottom: 32px;" />
        <h1 style="font-size: 22px; font-weight: 700; margin: 0 0 12px;">Bonjour ${firstName},</h1>
        <p style="font-size: 15px; color: #555; margin: 0 0 24px; line-height: 1.6;">
          Tu as demandé à réinitialiser ton mot de passe. Clique sur le bouton ci-dessous.
          Ce lien est valide <strong>1 heure</strong>.
        </p>
        <a href="${resetUrl}"
           style="display: inline-block; background: #E91E8C; color: white; font-weight: 600;
                  font-size: 15px; padding: 14px 28px; border-radius: 12px; text-decoration: none;">
          Réinitialiser mon mot de passe
        </a>
        <p style="font-size: 13px; color: #888; margin: 24px 0 0; line-height: 1.6;">
          Si tu n'es pas à l'origine de cette demande, ignore cet email — ton mot de passe restera inchangé.
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
        <p style="font-size: 12px; color: #aaa;">© Blyss · contact@blyssapp.fr</p>
      </div>
    `,
  });
}
