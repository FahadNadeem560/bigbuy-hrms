import { supabase } from "../lib/supabaseClient.js";

// Must match the TEMPLATES registry in the send-whatsapp edge function —
// each of these needs an approved Meta WhatsApp template before it will
// actually send (see project docs for the exact template text/params).
export const MESSAGE_TYPES = {
  PAYSLIP_READY: "payslip_ready",
  PAYMENT_STATUS_CHANGED: "payment_status_changed",
  PAYMENT_MADE: "payment_made",
  LEAVE_APPROVED: "leave_approved",
  LEAVE_REJECTED: "leave_rejected",
  WARNING_ISSUED: "warning_issued",
  ATTENDANCE_ALERT: "attendance_alert",
  ONBOARDING_OTP: "onboarding_otp",
};

// Inserts a row into employee_message_queue and immediately asks the
// send-whatsapp edge function to process just that row (near-real-time
// send). If that invoke fails (network blip, function cold-start error) the
// row stays Pending and sweepPendingWhatsapp() picks it up on next app load
// — same "no server cron, so check on load" pattern used elsewhere in this
// app. Silently no-ops if the employee has no WhatsApp number on file
// rather than queueing a row that can only ever fail.
export async function queueWhatsappMessage({ employeeCode, messageType, templateVariables = [] }) {
  if (!employeeCode || !messageType) return;
  const { data: emp } = await supabase.from("employees")
    .select("whatsapp_number, phone").eq("employee_code", employeeCode).maybeSingle();
  const whatsappNumber = emp?.whatsapp_number || emp?.phone;
  if (!whatsappNumber) return;

  const { data: row, error } = await supabase.from("employee_message_queue").insert({
    employee_code: employeeCode, whatsapp_number: whatsappNumber,
    message_type: messageType, template_variables: templateVariables,
  }).select("id").single();
  if (error || !row) return;

  supabase.functions.invoke("send-whatsapp", { body: { queue_id: row.id } }).catch(() => {});
}

// Client-triggered catch-up sweep — call on app load alongside the other
// checkOnLoad-style functions (checkAutoLockPreviousMonth, etc).
export async function sweepPendingWhatsapp() {
  try { await supabase.functions.invoke("send-whatsapp", { body: {} }); }
  catch { /* best-effort; the next sweep will retry */ }
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function sendOnboardingOtp(employeeCode) {
  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const { error } = await supabase.from("employees").update({
    whatsapp_otp_code: otp, whatsapp_otp_expires_at: expiresAt,
  }).eq("employee_code", employeeCode);
  if (error) throw error;
  await queueWhatsappMessage({ employeeCode, messageType: MESSAGE_TYPES.ONBOARDING_OTP, templateVariables: [otp] });
}

export async function verifyOnboardingOtp(employeeCode, enteredCode) {
  const { data: emp } = await supabase.from("employees")
    .select("whatsapp_otp_code, whatsapp_otp_expires_at").eq("employee_code", employeeCode).maybeSingle();
  if (!emp?.whatsapp_otp_code) return { success: false, error: "No verification code on file. Request a new one." };
  if (new Date(emp.whatsapp_otp_expires_at) < new Date()) return { success: false, error: "Code expired. Request a new one." };
  if (String(enteredCode).trim() !== emp.whatsapp_otp_code) return { success: false, error: "Incorrect code." };
  const now = new Date().toISOString();
  await supabase.from("employees").update({
    whatsapp_verified: true, whatsapp_verified_at: now,
    enrollment_completed: true, enrollment_completed_at: now,
    whatsapp_otp_code: null, whatsapp_otp_expires_at: null,
  }).eq("employee_code", employeeCode);
  return { success: true };
}
