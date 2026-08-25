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

// HR can still correct a request they raised (wrong amount, wrong month,
// a notes typo) right up until Finance acts on it. The status="Pending"
// clause in the update's WHERE is the actual guard against a race with
// Finance approving/rejecting between page load and this save landing --
// a 0-row result means it was already decided and the edit didn't apply.
export async function updateAdvanceRequest({ id, employeeCode, requestedAmount, advanceMonth, notes, actedBy }) {
  const amount = Number(requestedAmount);
  if (!(amount > 0)) throw new Error("Requested amount must be greater than zero.");
  if (!advanceMonth) throw new Error("Advance month is required.");

  const { data: existing, error: existErr } = await supabase.from("advances").select("id")
    .eq("employee_code", employeeCode).eq("advance_month", advanceMonth)
    .neq("status", "Rejected").neq("id", id).limit(1);
  if (existErr) throw existErr;
  if (existing && existing.length > 0) {
    throw new Error(`Employee already has an advance for ${advanceMonth}. Only one advance per month is allowed.`);
  }

  const { data, error } = await supabase.from("advances").update({
    requested_amount: amount, advance_month: advanceMonth, payroll_month: advanceMonth, notes: notes || null,
  }).eq("id", id).eq("status", "Pending").select();
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("This request has already been decided by Finance and can no longer be edited.");
  }

  await supabase.from("audit_logs").insert({
    action: "advance_edited", entity: "advances", entity_id: id, performed_by: actedBy,
    details: `Advance request edited — amount ${money(amount)}, month ${advanceMonth}`, created_at: new Date().toISOString(),
  }).then(() => {}, () => {});
}

export async function approveAdvance({ id, requestedAmount, approvedAmount, approvedBy, employeeName, actorRole }) {
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

  if (actorRole !== "Finance") {
    await notify({
      recipientRole: "Finance", type: "advance_decision", link: "loans",
      title: "Advance Approved", message: `${approvedBy} approved an advance of ${money(appAmt)} for ${employeeName}.`,
    });
  }
}

export async function rejectAdvance({ id, reason, actedBy, actorRole, employeeName }) {
  if (!reason || !reason.trim()) throw new Error("A reason is required to reject an advance.");
  const { error } = await supabase.from("advances").update({
    status: "Rejected", rejection_reason: reason, approved_by: actedBy,
  }).eq("id", id);
  if (error) throw error;

  if (actorRole !== "Finance") {
    await notify({
      recipientRole: "Finance", type: "advance_decision", link: "loans",
      title: "Advance Rejected", message: `${actedBy} rejected the advance request for ${employeeName || id}. Reason: ${reason}`,
    });
  }
}

// issuedAmount is the amount being handed over right now (a top-up on top of
// whatever was already issued), not the new running total -- this covers
// issuing the remaining balance on an already-partially-issued advance,
// where the new total is computed here as previous + this top-up.
export async function issueAdvance({ id, approvedAmount, issuedAmount, previousIssuedAmount, issuedBy, employeeName, actorRole }) {
  const appAmt = Number(approvedAmount);
  const topUp = Number(issuedAmount);
  const prevAmt = Number(previousIssuedAmount || 0);
  if (!(topUp > 0)) throw new Error("Issued amount must be greater than zero.");
  const issAmt = prevAmt + topUp;
  if (issAmt > appAmt) throw new Error(`Issued amount cannot exceed the remaining approved balance of ${money(appAmt - prevAmt)}.`);

  const { error } = await supabase.from("advances").update({
    status: "Issued", issued_amount: issAmt, issued_by: issuedBy, issued_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) throw error;

  const detail = prevAmt > 0
    ? `Additional ${money(topUp)} issued to ${employeeName} (total now ${money(issAmt)})`
    : `Advance of ${money(issAmt)} issued to ${employeeName}`;

  await supabase.from("audit_logs").insert({
    action: "advance_issued", entity: "advances", entity_id: id, performed_by: issuedBy,
    details: detail, created_at: new Date().toISOString(),
  }).then(() => {}, () => {});

  await notify({
    recipientRole: "HR", type: "advance_issued", link: "loans",
    title: "Advance Issued",
    message: `${detail}.`,
  });
  if (actorRole !== "Finance") {
    await notify({
      recipientRole: "Finance", type: "advance_decision", link: "loans",
      title: "Advance Issued", message: `${issuedBy} — ${detail}.`,
    });
  }
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

// ─── Bulk request (current month, goes to Finance for approval like a normal
// request submitted one at a time via "+ Request Advance") ────────────────
// Reuses requestAdvance() per row so a bulk upload behaves exactly like N
// manual submissions — same duplicate-per-month check, same Pending status,
// same Finance notification — rather than duplicating that logic here.
export async function bulkRequestAdvances(rows, requestedBy) {
  let imported = 0, failed = 0;
  const errors = [];
  for (const row of rows) {
    if (row.status && row.status.startsWith("error")) { failed++; errors.push(`${row.code || "?"}: ${row.status}`); continue; }
    try {
      await requestAdvance({ employee: row.emp, requestedAmount: row.requested, advanceMonth: row.month, notes: row.notes, requestedBy });
      imported++;
    } catch (e) { failed++; errors.push(`${row.code}: ${e.message}`); }
  }
  return { total: rows.length, imported, failed, errors };
}

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
