import { supabase } from "../lib/supabaseClient.js";

// ══════════════════ Advances Management System ══════════════════
// Workflow: HR initiates (Pending) -> Finance approves with amount capped at
// requested_amount (Approved) -> Finance marks Issued with amount capped at
// approved_amount (Issued) -> payroll generation deducts issued_amount and
// flips to Deducted. One advance per employee per advance_month.

export async function fetchAdvances() {
  const { data, error } = await supabase.from("advances").select("*").order("created_at", { ascending: false }).limit(1000);
  if (error) throw error;
  return data || [];
}

export async function fetchActiveEmployeesForPicker() {
  const { data, error } = await supabase.from("employees")
    .select("employee_code, full_name, department, branch, salary")
    .eq("status", "Active").order("full_name");
  if (error) throw error;
  return data || [];
}

async function notify({ recipientRole, type, title, message, link }) {
  try {
    await supabase.from("notifications").insert({
      recipient_role: recipientRole, type, title, message, link: link || null, is_read: false,
    });
  } catch { /* notifications table best-effort */ }
}

export async function requestAdvance({ employee, requestedAmount, advanceMonth, notes, requestedBy }) {
  const amount = Number(requestedAmount);
  if (!employee) throw new Error("Select an employee.");
  if (!(amount > 0)) throw new Error("Requested amount must be greater than zero.");
  if (!advanceMonth) throw new Error("Advance month is required.");

  const { data: existing, error: existErr } = await supabase.from("advances").select("id")
    .eq("employee_code", employee.employee_code).eq("advance_month", advanceMonth)
    .neq("status", "Rejected").limit(1);
  if (existErr) throw existErr;
  if (existing && existing.length > 0) {
    throw new Error(`Employee already has an advance for ${advanceMonth}. Only one advance per month is allowed.`);
  }

  const { error } = await supabase.from("advances").insert({
    employee_code: employee.employee_code, employee_name: employee.full_name,
    branch: employee.branch || null, department: employee.department || null,
    requested_amount: amount, approved_amount: 0, issued_amount: 0,
    advance_month: advanceMonth, payroll_month: advanceMonth,
    requested_by: requestedBy, notes: notes || null,
    status: "Pending", created_at: new Date().toISOString(),
  });
  if (error) throw error;

  await notify({
    recipientRole: "Finance", type: "advance_requested", link: "loans",
    title: "Advance Requested",
    message: `${employee.full_name} has requested an advance of ${money(amount)} for ${advanceMonth}. Awaiting your approval.`,
  });
}

export async function approveAdvance({ id, requestedAmount, approvedAmount, approvedBy, employeeName }) {
  const reqAmt = Number(requestedAmount);
  const appAmt = Number(approvedAmount);
  if (!(appAmt > 0)) throw new Error("Approved amount must be greater than zero.");
  if (appAmt > reqAmt) throw new Error(`Approved amount cannot exceed requested amount of ${money(reqAmt)}.`);

  const { error } = await supabase.from("advances").update({
    status: "Approved", approved_amount: appAmt, approved_by: approvedBy, approved_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) throw error;

  await supabase.from("audit_logs").insert({
    action: "advance_approved", entity: "advances", entity_id: id, performed_by: approvedBy,
    details: `Advance of ${money(appAmt)} approved for ${employeeName}`, created_at: new Date().toISOString(),
  }).then(() => {}, () => {});
}

export async function rejectAdvance({ id, reason, actedBy }) {
  if (!reason || !reason.trim()) throw new Error("A reason is required to reject an advance.");
  const { error } = await supabase.from("advances").update({
    status: "Rejected", rejection_reason: reason, approved_by: actedBy,
  }).eq("id", id);
  if (error) throw error;
}

export async function issueAdvance({ id, approvedAmount, issuedAmount, issuedBy, employeeName }) {
  const appAmt = Number(approvedAmount);
  const issAmt = Number(issuedAmount);
  if (!(issAmt > 0)) throw new Error("Issued amount must be greater than zero.");
  if (issAmt > appAmt) throw new Error(`Issued amount cannot exceed approved amount of ${money(appAmt)}.`);

  const { error } = await supabase.from("advances").update({
    status: "Issued", issued_amount: issAmt, issued_by: issuedBy, issued_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) throw error;

  await supabase.from("audit_logs").insert({
    action: "advance_issued", entity: "advances", entity_id: id, performed_by: issuedBy,
    details: `Advance of ${money(issAmt)} issued to ${employeeName}`, created_at: new Date().toISOString(),
  }).then(() => {}, () => {});

  await notify({
    recipientRole: "HR", type: "advance_issued", link: "loans",
    title: "Advance Issued",
    message: `Advance issued to ${employeeName} — ${money(issAmt)}.`,
  });
}

// Called from payroll generation for the given month — deducts every Issued
// advance for that month and flips it to Deducted so it's never double-counted.
export async function deductIssuedAdvancesForMonth(month) {
  const { data, error } = await supabase.from("advances").select("*")
    .eq("advance_month", month).eq("status", "Issued");
  if (error) throw error;
  const rows = data || [];
  if (rows.length === 0) return { byEmployee: {}, count: 0 };

  const byEmployee = {};
  rows.forEach(a => { byEmployee[a.employee_code] = (byEmployee[a.employee_code] || 0) + Number(a.issued_amount || 0); });

  await supabase.from("advances").update({
    status: "Deducted", deducted_in_month: month, deducted_at: new Date().toISOString(),
  }).eq("advance_month", month).eq("status", "Issued");

  return { byEmployee, count: rows.length };
}

function money(v) { return `Rs. ${Math.round(Number(v || 0)).toLocaleString()}`; }

// ─── Historical import ──────────────────────────────────────────────────
export async function importHistoricalAdvances(rows) {
  let imported = 0, failed = 0;
  const errors = [];
  for (const row of rows) {
    if (row.status && row.status.startsWith("error")) { failed++; errors.push(`${row.code || "?"}: ${row.status}`); continue; }
    const excess = row.issued > row.approved ? row.issued - row.approved : 0;
    const { error } = await supabase.from("advances").insert({
      employee_code: row.code, employee_name: row.emp?.full_name || row.name,
      branch: row.branch || row.emp?.branch || null, department: row.department || row.emp?.department || null,
      requested_amount: row.requested, approved_amount: row.approved, issued_amount: row.issued,
      advance_month: row.month, payroll_month: row.month,
      requested_by: "Historical Import", approved_by: "Historical Import", issued_by: "Historical Import",
      approved_at: `${row.month}-01`, issued_at: `${row.month}-01`,
      status: "Issued",
      excess_amount: excess, excess_reason: excess > 0 ? "Issued exceeded approved - historical data" : null,
      created_at: new Date().toISOString(),
    });
    if (error) { failed++; errors.push(`${row.code}: ${error.message}`); }
    else imported++;
  }
  return { total: rows.length, imported, failed, errors };
}
