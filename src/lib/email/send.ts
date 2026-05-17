import { Resend } from "resend";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

function getClient() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

const FROM = process.env.RESEND_FROM ?? "Waitless <bookings@waitless.kw>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

function unsubscribeFooter() {
  return `<p style="margin-top:32px;font-size:12px;color:#888">Waitless · Kuwait · <a href="${APP_URL}/settings/notifications">Unsubscribe</a></p>`;
}

async function logEmail(
  to: string,
  subject: string,
  result: { id?: string; error?: string },
) {
  const service = createSupabaseServiceClient();
  await service.from("email_log").insert({
    to_email: to,
    subject,
    status: result.error ? "failed" : "sent",
    error: result.error ?? null,
    provider_id: result.id ?? null,
  });
}

export async function sendWelcome({ to, name }: { to: string; name: string }) {
  const subject = "Welcome to Waitless";
  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px">
      <h1 style="font-size:20px">Welcome, ${escapeHtml(name)} 👋</h1>
      <p>Waitless is now ready on your account. You can browse live restaurant availability and book a table instantly.</p>
      <p><a href="${APP_URL}/dashboard" style="background:#c2410c;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Open Waitless</a></p>
      ${unsubscribeFooter()}
    </div>
  `;
  const client = getClient();
  if (!client) return;
  const { data, error } = await client.emails.send({
    from: FROM,
    to,
    subject,
    html,
  });
  await logEmail(to, subject, { id: data?.id, error: error?.message });
}

export async function sendBookingConfirmation({
  to,
  name,
  startTime,
  partySize,
  bookingId,
}: {
  to: string;
  name: string;
  startTime: string;
  partySize: number;
  bookingId: string;
}) {
  const subject = "Your Waitless booking is confirmed";
  const when = new Date(startTime).toLocaleString("en-GB", {
    dateStyle: "full",
    timeStyle: "short",
  });
  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px">
      <h1 style="font-size:20px">You're booked, ${escapeHtml(name)} 🎉</h1>
      <p><strong>${when}</strong> · ${partySize} ${partySize === 1 ? "guest" : "guests"}</p>
      <p><a href="${APP_URL}/bookings/${bookingId}" style="background:#c2410c;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">View booking</a></p>
      <p style="font-size:12px;color:#888">Need to cancel? <a href="${APP_URL}/bookings/${bookingId}?action=cancel">Cancel in one click</a>.</p>
      ${unsubscribeFooter()}
    </div>
  `;
  const client = getClient();
  if (!client) return;
  const { data, error } = await client.emails.send({
    from: FROM,
    to,
    subject,
    html,
  });
  await logEmail(to, subject, { id: data?.id, error: error?.message });
}

export async function sendBookingReminder({
  to,
  name,
  startTime,
  bookingId,
}: {
  to: string;
  name: string;
  startTime: string;
  bookingId: string;
}) {
  const subject = "Your Waitless booking is tomorrow";
  const when = new Date(startTime).toLocaleString("en-GB", {
    dateStyle: "full",
    timeStyle: "short",
  });
  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px">
      <h1 style="font-size:20px">See you ${escapeHtml(name)} 🍽️</h1>
      <p>Reminder: your reservation is on <strong>${when}</strong>.</p>
      <p>
        <a href="${APP_URL}/bookings/${bookingId}" style="background:#c2410c;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;margin-right:8px">View</a>
        <a href="${APP_URL}/bookings/${bookingId}?action=cancel" style="background:#fff;color:#c2410c;border:1px solid #c2410c;padding:10px 16px;border-radius:6px;text-decoration:none">Cancel</a>
      </p>
      ${unsubscribeFooter()}
    </div>
  `;
  const client = getClient();
  if (!client) return;
  const { data, error } = await client.emails.send({
    from: FROM,
    to,
    subject,
    html,
  });
  await logEmail(to, subject, { id: data?.id, error: error?.message });
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
