import { supabase } from "../lib/supabaseClient.js";
import { queueWhatsappMessage, MESSAGE_TYPES } from "./whatsappService.js";

// ══════════════════════════ Payment Status ══════════════════════════
export const PAYMENT_STATUSES = ["Normal", "Hold", "No_FnF", "FnF"];
export const PAYMENT_STATUS_LABELS = { Normal: "Normal", Hold: "Hold", No_FnF: "No F&F", FnF: "F&F" };
export const PAYMENT_STATUS_TONES = { Normal: "green", Hold: "yellow", No_FnF: "red", FnF: "blue" };

// No_FnF/FnF are no longer reachable from here -- they're exclusively set by
// FinalSettlement.jsx, which writes to the separate final_settlements table
// instead of payroll.payment_status (see PayrollAutomation.jsx's loadBase).
// Allowing a manual Normal -> FnF/No_FnF transition here would let someone
// bypass Final Settlement entirely and put a settlement-status row back into
// the regular payroll table, reopening the exact day-count overwrite bug
// final_settlements was built to close. A payroll row's payment_status is
// now only ever Normal or Hold.
const ALLOWED_TRANSITIONS = {
  Normal: ["Hold"],
  Hold: ["Normal"],
  No_FnF: ["Normal"],
  FnF: [],
};

export function canTransitionPaymentStatus(from, to) {
  return !!(ALLOWED_TRANSITIONS[from] || []).includes(to);
}

export function requiresMasterOnly(from, to) {
  return from === "No_FnF" && to === "Normal";
}

export async function requestPaymentStatusChange({ employeeId, employeeCode, employeeName, payrollMonth, requestedBy, currentStatus, requestedStatus, reason }) {
  if (!reason || !reason.trim()) throw new Error("Reason is required.");
  if (!canTransitionPaymentStatus(currentStatus, requestedStatus)) {
    throw new Error(`${PAYMENT_STATUS_LABELS[currentStatus] || currentStatus} → ${PAYMENT_STATUS_LABELS[requestedStatus] || requestedStatus} is not an allowed transition.`);
  }
  const { error } = await supabase.from("payment_status_requests").insert({
    employee_id: employeeId || null, employee_code: employeeCode, employee_name: employeeName,
    payroll_month: payrollMonth, requested_by: requestedBy,
    current_status: currentStatus, requested_status: requestedStatus, reason, status: "Pending",
  });
  if (error) throw error;
  await Promise.all(["Master", "GM"].map(r => supabase.from("notifications").insert({
    recipient_role: r, type: "payment_status_request",
    title: "Payment Status Change Requested",
    message: `${requestedBy} requested ${employeeName} (${employeeCode}) go from ${PAYMENT_STATUS_LABELS[currentStatus]} to ${PAYMENT_STATUS_LABELS[requestedStatus]} for ${payrollMonth}. Reason: ${reason}`,
    is_read: false,
  }))).catch(() => {});
}

export async function approvePaymentStatusRequest(request, approverRole, approverName) {
  if (!["Master", "GM"].includes(approverRole)) throw new Error("Only Master or GM can approve payment status changes.");
  if (requiresMasterOnly(request.current_status, request.requested_status) && approverRole !== "Master") {
    throw new Error("No F&F → Normal requires Master approval.");
  }
  const now = new Date().toISOString();
  const { error: reqErr } = await supabase.from("payment_status_requests").update({
    status: "Approved", approved_by: approverName, approved_at: now,
  }).eq("id", request.id);
  if (reqErr) throw reqErr;
  const { error: payErr } = await supabase.from("payroll").update({
    payment_status: request.requested_status,
    payment_status_changed_by: approverName, payment_status_changed_at: now,
    payment_status_approved_by: approverName, payment_status_reason: request.reason,
  }).eq("payroll_month", request.payroll_month).eq("employee_code", request.employee_code);
  if (payErr) throw payErr;
  await supabase.from("notifications").insert({
    recipient_role: request.requested_by, type: "payment_status_request",
    title: "Payment Status Change Approved",
    message: `${approverName} approved ${request.employee_name} (${request.employee_code}) → ${PAYMENT_STATUS_LABELS[request.requested_status]} for ${request.payroll_month}.`,
    is_read: false,
  }).then(() => {}, () => {});
  queueWhatsappMessage({
    employeeCode: request.employee_code, messageType: MESSAGE_TYPES.PAYMENT_STATUS_CHANGED,
    templateVariables: [request.employee_name, request.payroll_month, PAYMENT_STATUS_LABELS[request.requested_status]],
  }).catch(() => {});
}

export async function rejectPaymentStatusRequest(request, approverName, rejectionReason) {
  if (!rejectionReason || !rejectionReason.trim()) throw new Error("Rejection reason is required.");
  const { error } = await supabase.from("payment_status_requests").update({
    status: "Rejected", rejection_reason: rejectionReason, approved_by: approverName, approved_at: new Date().toISOString(),
  }).eq("id", request.id);
  if (error) throw error;
  await supabase.from("notifications").insert({
    recipient_role: request.requested_by, type: "payment_status_request",
    title: "Payment Status Change Rejected",
    message: `${approverName} rejected the change for ${request.employee_name} (${request.employee_code}). Reason: ${rejectionReason}`,
    is_read: false,
  }).then(() => {}, () => {});
}

// HR (and Master) set and clear Hold directly -- no approval step. Holding a
// salary and releasing it are both HR operations now (explicit policy,
// 2026-09-04); the request/approve path above is kept only for the requests
// already in flight and for anyone who isn't HR or Master.
//
// Nothing here is enforced in the database: the payroll_write policy already
// lets Master/HR update payroll rows, which is how Generate and Refresh work.
// The guard is the role check plus the audit trail, not RLS.
export async function setPaymentStatusDirect({
  employeeCode, employeeName, payrollMonth, currentStatus, newStatus, reason, actorRole, actorName,
}) {
  if (!["HR", "Master"].includes(actorRole)) {
    throw new Error("Only HR or Master can change a payment status directly.");
  }
  if (!reason || !reason.trim()) throw new Error("Reason is required.");
  if (!canTransitionPaymentStatus(currentStatus, newStatus)) {
    throw new Error(`${PAYMENT_STATUS_LABELS[currentStatus] || currentStatus} → ${PAYMENT_STATUS_LABELS[newStatus] || newStatus} is not an allowed transition.`);
  }
  const now = new Date().toISOString();
  const who = actorName || actorRole;
  const { error } = await supabase.from("payroll").update({
    payment_status: newStatus,
    payment_status_changed_by: who, payment_status_changed_at: now,
    payment_status_approved_by: who, payment_status_reason: reason,
  }).eq("payroll_month", payrollMonth).eq("employee_code", employeeCode);
  if (error) throw error;

  // Withholding or releasing someone's salary with nobody else in the loop
  // has to leave a trail, so this is the part that replaces the approval.
  await supabase.from("audit_logs").insert({
    action_type: "payment_status_changed", performed_by: who,
    details: JSON.stringify({
      employee_code: employeeCode, employee_name: employeeName, payroll_month: payrollMonth,
      from: currentStatus, to: newStatus, reason, applied_directly: true,
    }),
    created_at: now,
  }).then(() => {}, () => {});

  // Master and GM no longer approve it, so tell them it happened.
  await Promise.all(["Master", "GM"].map(r => supabase.from("notifications").insert({
    recipient_role: r, type: "payment_status_request",
    title: newStatus === "Hold" ? "Salary Put On Hold" : "Hold Released",
    message: `${who} moved ${employeeName} (${employeeCode}) from ${PAYMENT_STATUS_LABELS[currentStatus]} to ${PAYMENT_STATUS_LABELS[newStatus]} for ${payrollMonth}. Reason: ${reason}`,
    is_read: false,
  }))).catch(() => {});

  queueWhatsappMessage({
    employeeCode, messageType: MESSAGE_TYPES.PAYMENT_STATUS_CHANGED,
    templateVariables: [employeeName, payrollMonth, PAYMENT_STATUS_LABELS[newStatus]],
  }).catch(() => {});
}

// ══════════════════════════ Month helpers ══════════════════════════
export function addMonths(monthStr, delta) {
  const [y, m] = monthStr.split("-").map(Number);
  const total = (y * 12 + (m - 1)) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

function isSameCalendarDay(isoA, isoB) {
  if (!isoA || !isoB) return false;
  return String(isoA).slice(0, 10) === String(isoB).slice(0, 10);
}

// ══════════════════════════ Payroll Lock ══════════════════════════
export async function getPayrollLock(month) {
  const { data } = await supabase.from("payroll_locks").select("*").eq("payroll_month", month).maybeSingle();
  return data || null;
}

export async function lockPayrollMonth(month, actorName) {
  const existing = await getPayrollLock(month);
  const payload = {
    payroll_month: month, is_locked: true, locked_at: new Date().toISOString(), locked_by: actorName,
    unlocked_at: null, unlocked_by: null, unlock_reason: null,
  };
  if (existing) {
    await supabase.from("payroll_locks").update(payload).eq("id", existing.id);
  } else {
    await supabase.from("payroll_locks").insert(payload);
  }
  await carryHoldoverForward(month, actorName);
}

export async function unlockPayrollMonth(month, actorName, reason) {
  if (!reason || !reason.trim()) throw new Error("Unlock reason is required.");
  const existing = await getPayrollLock(month);
  const payload = { is_locked: false, unlocked_at: new Date().toISOString(), unlocked_by: actorName, unlock_reason: reason };
  if (existing) {
    await supabase.from("payroll_locks").update(payload).eq("id", existing.id);
  } else {
    await supabase.from("payroll_locks").insert({ payroll_month: month, ...payload });
  }
}

// Idempotent: re-running for the same month just re-stamps the same current
// holdover amount onto next month's row rather than compounding it.
export async function carryHoldoverForward(lockedMonth, actorName) {
  const { data: holdRows } = await supabase.from("payroll").select("employee_code, net_salary")
    .eq("payroll_month", lockedMonth).eq("payment_status", "Hold");
  if (!holdRows || holdRows.length === 0) return;
  const nextMonth = addMonths(lockedMonth, 1);
  for (const row of holdRows) {
    const holdoverPayload = {
      holdover_from_month: lockedMonth,
      holdover_amount: Number(row.net_salary || 0),
      holdover_approved_by: actorName,
    };
    const { data: existingRow } = await supabase.from("payroll").select("id")
      .eq("payroll_month", nextMonth).eq("employee_code", row.employee_code).maybeSingle();
    if (existingRow) {
      await supabase.from("payroll").update(holdoverPayload).eq("id", existingRow.id);
    } else {
      await supabase.from("payroll").insert({
        employee_code: row.employee_code, payroll_month: nextMonth,
        status: "Draft", payment_status: "Normal", ...holdoverPayload,
      });
    }
  }
}

// Called before generatePayroll()'s delete+insert wipes the month — carries
// forward holdover_*, payment_status*, and paid/is_paid fields already
// stamped on this month's rows so a regenerate doesn't silently reset a
// Hold/No F&F/F&F decision or an already-Paid mark back to defaults.
export async function mergePersistentPayrollFields(month, payloadRows) {
  const { data: existing } = await supabase.from("payroll")
    .select("employee_code, holdover_from_month, holdover_amount, holdover_approved_by, payment_status, payment_status_changed_by, payment_status_changed_at, payment_status_approved_by, payment_status_reason, is_paid, paid_at, paid_by")
    .eq("payroll_month", month);
  if (!existing || existing.length === 0) return payloadRows;
  const byCode = Object.fromEntries(existing.map(r => [r.employee_code, r]));
  return payloadRows.map(r => {
    const h = byCode[r.employee_code];
    if (!h) return r;
    const carried = { ...r };
    if (Number(h.holdover_amount) > 0) {
      carried.holdover_from_month = h.holdover_from_month;
      carried.holdover_amount = h.holdover_amount;
      carried.holdover_approved_by = h.holdover_approved_by;
    }
    if (h.payment_status && h.payment_status !== "Normal") {
      carried.payment_status = h.payment_status;
      carried.payment_status_changed_by = h.payment_status_changed_by;
      carried.payment_status_changed_at = h.payment_status_changed_at;
      carried.payment_status_approved_by = h.payment_status_approved_by;
      carried.payment_status_reason = h.payment_status_reason;
    }
    if (h.is_paid) { carried.is_paid = true; carried.paid_at = h.paid_at; carried.paid_by = h.paid_by; }
    return carried;
  });
}

// Client-triggered check (this app has no server cron) — mirrors the existing
// checkTemporaryEmployees()/escalateStaleApprovals() on-app-load pattern.
// Auto-locks the previous month once the 9th arrives, and re-locks a month
// Master unlocked once the calendar day changes (Master forgot to re-lock).
//
// GATE: only ever touches a month whose payroll has actually been Published.
// A Draft month is still being worked on — auto-locking it (and, worse,
// re-locking it a day after Master unlocks to keep editing) just gets in the
// way. Once payroll is Published for the month, the lock is a real
// closed-record safeguard and this resumes enforcing it.
export async function checkAutoLockPreviousMonth(actorName = "System (auto-lock)") {
  const today = new Date();
  if (today.getDate() < 9) return;
  const curMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const prevMonth = addMonths(curMonth, -1);
  const { data: rows } = await supabase.from("payroll").select("id").eq("payroll_month", prevMonth).eq("status", "Published").limit(1);
  if (!rows || rows.length === 0) return; // not published yet — leave it unlocked for editing

  const lock = await getPayrollLock(prevMonth);
  if (!lock) {
    await lockPayrollMonth(prevMonth, actorName);
    return;
  }
  if (!lock.is_locked && !isSameCalendarDay(lock.unlocked_at, today.toISOString())) {
    await lockPayrollMonth(prevMonth, actorName);
  }
}

// ══════════════════════════ Monthly Hold Reminder ══════════════════════════
export async function sendHoldReminderIfNeeded() {
  const today = new Date();
  if (today.getDate() !== 1) return;
  const key = `hrms_hold_reminder_${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  if (localStorage.getItem(key)) return;
  const { data: holdRows } = await supabase.from("payroll").select("employee_code").eq("payment_status", "Hold");
  const count = new Set((holdRows || []).map(r => r.employee_code)).size;
  if (count > 0) {
    await supabase.from("notifications").insert({
      recipient_role: "HR", type: "payroll_hold_reminder",
      title: "Hold Employees Need Review",
      message: `${count} employee${count > 1 ? "s are" : " is"} on Hold status. Please review and action.`,
      is_read: false,
    }).then(() => {}, () => {});
  }
  localStorage.setItem(key, "1");
}

// ══════════════════════════ Cash Incentives ══════════════════════════
export async function fetchCashIncentives(month) {
  const { data } = await supabase.from("cash_incentives").select("*").eq("payroll_month", month).order("created_at", { ascending: false });
  return data || [];
}

export function summarizeCashIncentivesByBranch(rows) {
  const byBranch = {};
  rows.forEach(r => { byBranch[r.branch || "Unassigned"] = (byBranch[r.branch || "Unassigned"] || 0) + Number(r.amount || 0); });
  return Object.entries(byBranch).map(([branch, total]) => ({ branch, total })).sort((a, b) => a.branch.localeCompare(b.branch));
}

export async function addCashIncentive({ employeeId, employeeCode, employeeName, branch, department, amount, month, givenBy, givenByRole, notes }) {
  if (!(Number(amount) > 0)) throw new Error("Amount must be greater than zero.");
  const { error } = await supabase.from("cash_incentives").insert({
    employee_id: employeeId || null, employee_code: employeeCode, employee_name: employeeName,
    branch: branch || null, department: department || null, amount: Number(amount),
    payroll_month: month, given_by: givenBy, given_by_role: givenByRole, notes: notes || null,
  });
  if (error) throw error;
}

// ══════════════════ Confidential Incentives (recurring register) ══════════════════
// Standing monthly amount an employee receives until amended/removed — distinct
// from the one-off cash_incentives log above, but stored in the same table
// (is_recurring = true) so Master/GM have one place for confidential pay.

export async function fetchActiveConfidentialIncentives() {
  const { data, error } = await supabase.from("cash_incentives").select("*")
    .eq("is_recurring", true).eq("is_active", true).order("employee_name");
  if (error) throw error;
  return data || [];
}

export async function addConfidentialIncentive({ employeeId, employeeCode, employeeName, branch, department, amount, effectiveFrom, addedBy, addedByRole, reason }) {
  if (!(Number(amount) > 0)) throw new Error("Amount must be greater than zero.");
  if (!effectiveFrom) throw new Error("Effective From date is required.");
  const { data, error } = await supabase.from("cash_incentives").insert({
    employee_id: employeeId || null, employee_code: employeeCode, employee_name: employeeName,
    branch: branch || null, department: department || null, amount: Number(amount),
    is_recurring: true, is_active: true, effective_from: effectiveFrom,
    // payroll_month is NOT NULL and meaningless for a standing amount — recurring
    // rows stamp the month it takes effect (the snapshot reads effective_from/_to).
    payroll_month: effectiveFrom.slice(0, 7),
    change_reason: reason || null, given_by: addedBy, given_by_role: addedByRole,
  }).select().single();
  if (error) throw error;
  await supabase.from("cash_incentive_history").insert({
    employee_id: employeeId || null, employee_code: employeeCode, employee_name: employeeName, branch: branch || null,
    action: "Added", old_amount: null, new_amount: Number(amount),
    effective_from: effectiveFrom, effective_to: null, reason: reason || null,
    actioned_by: addedBy, actioned_by_role: addedByRole,
  });
  return data;
}

export async function amendConfidentialIncentive({ id, employeeCode, employeeName, branch, oldAmount, newAmount, effectiveFrom, reason, actionedBy, actionedByRole }) {
  if (!(Number(newAmount) > 0)) throw new Error("Amount must be greater than zero.");
  if (!effectiveFrom) throw new Error("Effective From date is required.");
  const { error } = await supabase.from("cash_incentives").update({
    amount: Number(newAmount), effective_from: effectiveFrom,
    payroll_month: effectiveFrom.slice(0, 7), // keep in step with effective_from
    change_reason: reason || null,
  }).eq("id", id);
  if (error) throw error;
  await supabase.from("cash_incentive_history").insert({
    employee_code: employeeCode, employee_name: employeeName, branch: branch || null,
    action: "Amended", old_amount: Number(oldAmount), new_amount: Number(newAmount),
    effective_from: effectiveFrom, effective_to: null, reason: reason || null,
    actioned_by: actionedBy, actioned_by_role: actionedByRole,
  });
}

export async function removeConfidentialIncentive({ id, employeeCode, employeeName, branch, amount, reason, actionedBy, actionedByRole }) {
  if (!reason || !reason.trim()) throw new Error("A reason is required to remove an incentive.");
  const today = new Date().toISOString().slice(0, 10);
  const { error } = await supabase.from("cash_incentives").update({
    effective_to: today, is_active: false, change_reason: reason,
  }).eq("id", id);
  if (error) throw error;
  await supabase.from("cash_incentive_history").insert({
    employee_code: employeeCode, employee_name: employeeName, branch: branch || null,
    action: "Removed", old_amount: Number(amount), new_amount: null,
    effective_from: null, effective_to: today, reason,
    actioned_by: actionedBy, actioned_by_role: actionedByRole,
  });
}

export async function fetchConfidentialIncentiveHistory({ employee, branch, action, dateFrom, dateTo } = {}) {
  let q = supabase.from("cash_incentive_history").select("*").order("created_at", { ascending: false });
  if (branch) q = q.eq("branch", branch);
  if (action) q = q.eq("action", action);
  if (dateFrom) q = q.gte("created_at", dateFrom);
  if (dateTo) q = q.lte("created_at", `${dateTo}T23:59:59`);
  const { data, error } = await q;
  if (error) throw error;
  let rows = data || [];
  if (employee) {
    const lq = employee.trim().toLowerCase();
    rows = rows.filter(r => (r.employee_name || "").toLowerCase().includes(lq) || String(r.employee_code || "").toLowerCase().includes(lq));
  }
  return rows;
}

// Runs at "Generate Payroll" time: snapshots this month's confidential
// incentive total per employee (prorated recurring + this month's one-off
// entries) into cash_incentive_monthly, which is what Finance/HR/Payroll
// Summary read from — never the raw cash_incentives table directly.
export async function generateCashIncentiveSnapshot(month) {
  const [y, m] = month.split("-").map(Number);
  const monthStart = new Date(y, m - 1, 1);
  const monthEnd = new Date(y, m, 0); // last day of month
  const daysInMonth = monthEnd.getDate();
  const monthStartStr = monthStart.toISOString().slice(0, 10);
  const monthEndStr = monthEnd.toISOString().slice(0, 10);

  const { data: recurring } = await supabase.from("cash_incentives").select("*")
    .eq("is_recurring", true).eq("is_active", true)
    .lte("effective_from", monthEndStr)
    .or(`effective_to.is.null,effective_to.gte.${monthStartStr}`);
  const { data: oneOff } = await supabase.from("cash_incentives").select("*")
    .eq("is_recurring", false).eq("payroll_month", month);

  const totals = {}; // employee_code -> { amount, employee_id, employee_name, branch, department }
  const touch = (r, amt) => {
    const key = r.employee_code;
    if (!totals[key]) totals[key] = { employee_id: r.employee_id, employee_code: r.employee_code, employee_name: r.employee_name, branch: r.branch, department: r.department, amount: 0 };
    totals[key].amount += amt;
  };

  (recurring || []).forEach(r => {
    const effFrom = new Date(r.effective_from);
    let amt = Number(r.amount || 0);
    if (effFrom > monthStart && effFrom <= monthEnd) {
      const remainingDays = daysInMonth - effFrom.getDate() + 1;
      amt = Math.round((Number(r.amount || 0) / 30) * remainingDays);
    }
    touch(r, amt);
  });
  (oneOff || []).forEach(r => touch(r, Number(r.amount || 0)));

  const rows = Object.values(totals).filter(r => r.amount > 0).map(r => ({ ...r, payroll_month: month }));
  if (rows.length === 0) return 0;
  const { error } = await supabase.from("cash_incentive_monthly").upsert(rows, { onConflict: "payroll_month,employee_code" });
  if (error) throw error;
  return rows.length;
}

export async function fetchCashIncentiveBranchTotals(month) {
  const { data, error } = await supabase.rpc("cash_incentive_branch_totals", { p_month: month });
  if (error) throw error;
  return (data || []).sort((a, b) => (a.branch || "").localeCompare(b.branch || ""));
}

export async function fetchCashIncentiveMonthly(month) {
  const { data, error } = await supabase.from("cash_incentive_monthly").select("*").eq("payroll_month", month).order("employee_name");
  if (error) throw error;
  return data || [];
}

export async function markIncentivesPaidForBranch(month, branch, actor) {
  const { error } = await supabase.rpc("mark_incentives_paid_for_branch", { p_month: month, p_branch: branch, p_actor: actor });
  if (error) throw error;
}

// ══════════════════════════ Supervisor Verification ══════════════════════════
export async function generateVerificationsForMonth(month) {
  const { data: hierarchy } = await supabase.from("employee_hierarchy").select("*").eq("is_active", true);
  const bySupervisor = {};
  (hierarchy || []).forEach(h => {
    if (!h.reports_to_employee_id) return;
    if (!bySupervisor[h.reports_to_employee_id]) bySupervisor[h.reports_to_employee_id] = [];
    bySupervisor[h.reports_to_employee_id].push(h.employee_code);
  });
  const supervisorIds = Object.keys(bySupervisor);
  if (supervisorIds.length === 0) return 0;

  const { data: supervisors } = await supabase.from("employees")
    .select("id, employee_code, full_name, branch").in("id", supervisorIds);
  const supByIdMap = Object.fromEntries((supervisors || []).map(s => [s.id, s]));

  let created = 0;
  for (const supId of supervisorIds) {
    const sup = supByIdMap[supId];
    if (!sup) continue;
    const { error } = await supabase.from("payroll_verifications").insert({
      payroll_month: month, supervisor_employee_id: sup.id, supervisor_name: sup.full_name,
      branch: sup.branch, team_employee_codes: bySupervisor[supId], status: "Pending",
    });
    if (!error) {
      created++;
      await supabase.from("notifications").insert({
        recipient_code: sup.employee_code, recipient_role: "Employee", type: "payroll_verification",
        title: "Payroll Ready for Your Verification",
        message: `${month} payroll is ready for your verification. Please review your team's payroll and confirm.`,
        is_read: false,
      }).then(() => {}, () => {});
    }
  }
  return created;
}

export async function fetchVerifications(month) {
  const { data } = await supabase.from("payroll_verifications").select("*").eq("payroll_month", month).order("created_at", { ascending: false });
  return data || [];
}

export async function confirmVerification(id, isReconfirm = false) {
  const now = new Date().toISOString();
  const payload = isReconfirm ? { status: "Re_Confirmed", re_confirmed_at: now } : { status: "Confirmed", confirmed_at: now };
  await supabase.from("payroll_verifications").update(payload).eq("id", id);
}

export async function flagEmployeeForHR({ month, employeeCode, employeeName, supervisorCode, supervisorName, note }) {
  await supabase.from("notifications").insert({
    recipient_role: "HR", type: `payroll_flag_${month}`,
    title: "Payroll Flag Raised",
    message: `${supervisorName} flagged ${employeeName} (${employeeCode}) for ${month} payroll: ${note}`,
    link: `${employeeCode}|${supervisorCode}`, is_read: false,
  });
}

export async function respondToFlag(notification, responseMessage) {
  await supabase.from("notifications").update({ is_read: true }).eq("id", notification.id);
  const supervisorCode = (notification.link || "").split("|")[1];
  if (supervisorCode) {
    await supabase.from("notifications").insert({
      recipient_code: supervisorCode, recipient_role: "Employee", type: "payroll_flag_response",
      title: "HR Response to Your Flag", message: responseMessage, is_read: false,
    }).then(() => {}, () => {});
  }
}

export function getVerificationProgress(verifications, flagNotifications) {
  const total = verifications.length;
  const confirmed = verifications.filter(v => ["Confirmed", "Re_Confirmed"].includes(v.status)).length;
  const flagsRaised = flagNotifications.length;
  const pendingHRResponse = flagNotifications.filter(n => !n.is_read).length;
  return { total, confirmed, flagsRaised, pendingHRResponse };
}
