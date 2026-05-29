// Uses the Replit Resend connector (integration id: resend) to send email.
// The ReplitConnectors SDK handles identity, token refresh, and auth headers.
import { ReplitConnectors } from "@replit/connectors-sdk";
import { logger } from "./logger";

const connectors = new ReplitConnectors();

// Resend test sender. Without a verified domain, Resend only delivers reliably
// to the account owner's own email address.
const FROM_ADDRESS = "Pharmalyzer <onboarding@resend.dev>";

interface SendEmailArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export async function sendEmail({ to, subject, html, text }: SendEmailArgs): Promise<void> {
  // While Resend has no verified domain, it only delivers to the account owner's
  // address. Setting RESEND_TEST_DELIVERY_EMAIL routes every message to that
  // verified inbox so the flow can be tested, while keeping the intended
  // recipient visible in the email body and subject.
  const override = process.env.RESEND_TEST_DELIVERY_EMAIL?.trim();
  let actualTo = to;
  let actualSubject = subject;
  let actualHtml = html;
  let actualText = text;

  if (override && override.toLowerCase() !== to.toLowerCase()) {
    actualTo = override;
    actualSubject = `[for ${to}] ${subject}`;
    const notice = `This message was intended for ${to} but routed to you because Resend is in test mode (no verified domain).`;
    actualHtml = `<div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 12px 24px; color: #92400e; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; font-size: 12px;">${notice}</div>${html}`;
    actualText = `${notice}\n\n${text}`;
  }

  const response = await connectors.proxy("resend", "/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: actualTo,
      subject: actualSubject,
      html: actualHtml,
      text: actualText,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    logger.error({ status: response.status, detail }, "Resend email send failed");
    throw new Error("Failed to send email");
  }
}

export function buildResetEmail(resetUrl: string): { subject: string; html: string; text: string } {
  const subject = "Reset your Pharmalyzer password";
  const text = [
    "We received a request to reset your Pharmalyzer password.",
    "",
    `Reset your password using this link (valid for 1 hour):`,
    resetUrl,
    "",
    "If you didn't request this, you can safely ignore this email.",
  ].join("\n");

  const html = `
  <div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #1f2937;">
    <h2 style="margin: 0 0 16px; font-size: 20px;">Reset your password</h2>
    <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6;">
      We received a request to reset your <strong>Pharmalyzer</strong> password. Click the button below to choose a new one. This link is valid for 1 hour.
    </p>
    <p style="margin: 0 0 24px;">
      <a href="${resetUrl}" style="display: inline-block; background: #0d9488; color: #ffffff; text-decoration: none; padding: 12px 20px; border-radius: 8px; font-size: 14px; font-weight: 600;">Reset password</a>
    </p>
    <p style="margin: 0 0 8px; font-size: 12px; color: #6b7280; line-height: 1.6;">
      If the button doesn't work, copy and paste this link into your browser:<br />
      <a href="${resetUrl}" style="color: #0d9488; word-break: break-all;">${resetUrl}</a>
    </p>
    <p style="margin: 16px 0 0; font-size: 12px; color: #6b7280;">
      If you didn't request this, you can safely ignore this email.
    </p>
  </div>`;

  return { subject, html, text };
}
