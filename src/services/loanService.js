import { supabase } from "../lib/supabaseClient.js";

// ══════════════════════ Loan Approval Workflow ══════════════════════
// HR can only propose (insert Pending Approval, no payroll effect yet —
// PayrollAutomation.jsx's deduction query filters loans on status='Active').
// Master applies instantly (submitLoan in LoanManagement.jsx sets status
// straight to 'Active' for Master). GM never proposes — only approves or
// rejects here. Mirrors incrementService.js's increment workflow exactly.

export async function notifyLoanProposed({ employeeName, loanAmount, monthlyDeduction, submittedByRole }) {
  await Promise.all(["Master", "GM"].map(r => supabase.from("notifications").insert({
    recipient_role: r, type: "loan_proposed",
    title: "Loan Request Pending Approval",
    message: `${submittedByRole} submitted a loan request for ${employeeName} — Rs.${Number(loanAmount).toLocaleString()} (Rs.${Number(monthlyDeduction).toLocaleString()}/month). Awaiting approval.`,
    is_read: false,
  }))).catch(() => {});
}

export async function approveLoanRequest(loanId, approverName) {
  const { data: row, error } = await supabase.rpc("approve_loan_request", {
    p_loan_id: loanId, p_approver_name: approverName,
  });
  if (error) throw error;
  if (row?.submitted_by) {
    await supabase.from("notifications").insert({
      recipient_role: row.submitted_by, type: "loan_decision",
      title: "Loan Request Approved",
      message: `Loan for ${row.employee_name} approved: Rs.${Number(row.loan_amount).toLocaleString()}.`,
      is_read: false,
    }).catch(() => {});
  }
  return row;
}

export async function rejectLoanRequest(loanId, approverName, reason) {
  if (!reason || !reason.trim()) throw new Error("A rejection reason is required.");
  const { data: row, error } = await supabase.rpc("reject_loan_request", {
    p_loan_id: loanId, p_approver_name: approverName, p_reason: reason,
  });
  if (error) throw error;
  if (row?.submitted_by) {
    await supabase.from("notifications").insert({
      recipient_role: row.submitted_by, type: "loan_decision",
      title: "Loan Request Rejected",
      message: `Loan for ${row.employee_name} rejected. Reason: ${reason}`,
      is_read: false,
    }).catch(() => {});
  }
  return row;
}

// ══════════════════ Loan Change (Reschedule / Skip Month) Workflow ══════════════════
// Same HR-proposes/Master-applies-instantly/GM-only-approves split as loan
// creation above. HR's proposal is a plain insert (loan_changes already
// grants HR INSERT); nothing on `loans` changes until Master/GM approves.

export async function proposeLoanChange({ loanId, employeeCode, employeeName, changeType, oldMonthly, newMonthly, effectiveMonth, reason, submittedByRole }) {
  const { error } = await supabase.from("loan_changes").insert({
    loan_id: loanId, employee_code: employeeCode,
    change_type: changeType, old_monthly: oldMonthly ?? null, new_monthly: newMonthly ?? null,
    effective_month: effectiveMonth ?? null, reason: reason || null,
    status: "Pending", submitted_by: submittedByRole,
  });
  if (error) throw error;
  const label = changeType === "reschedule" ? "reschedule" : "skip-month";
  await Promise.all(["Master", "GM"].map(r => supabase.from("notifications").insert({
    recipient_role: r, type: "loan_proposed",
    title: `Loan ${changeType === "reschedule" ? "Reschedule" : "Skip Month"} Requested`,
    message: `${submittedByRole} requested a ${label} for ${employeeName}'s loan${effectiveMonth ? ` (${effectiveMonth})` : ""}. Awaiting approval.`,
    is_read: false,
  }))).catch(() => {});
}

// Master applies a reschedule/relief instantly — inserted directly as
// Approved (self-approved, same as Master's loan creation), so the RPC
// isn't involved and the loans-table change happens right here.
export async function applyLoanChangeAsMaster({ loanId, employeeCode, changeType, oldMonthly, newMonthly, newRepaymentMonths, effectiveMonth, reason, actorName }) {
  if (changeType === "reschedule") {
    const { error: loanErr } = await supabase.from("loans").update({
      monthly_deduction: newMonthly, repayment_months: newRepaymentMonths,
    }).eq("id", loanId);
    if (loanErr) throw loanErr;
  }
  const { error } = await supabase.from("loan_changes").insert({
    loan_id: loanId, employee_code: employeeCode,
    change_type: changeType, old_monthly: oldMonthly ?? null, new_monthly: newMonthly ?? null,
    effective_month: effectiveMonth ?? null, reason: reason || null,
    status: "Approved", submitted_by: actorName, approved_by: actorName, approved_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function approveLoanChange(changeId, approverName) {
  const { data: row, error } = await supabase.rpc("approve_loan_change", {
    p_change_id: changeId, p_approver_name: approverName,
  });
  if (error) throw error;
  if (row?.submitted_by) {
    await supabase.from("notifications").insert({
      recipient_role: row.submitted_by, type: "loan_decision",
      title: "Loan Change Approved",
      message: `${row.change_type === "reschedule" ? "Reschedule" : "Skip-month"} request for ${row.employee_code} approved.`,
      is_read: false,
    }).catch(() => {});
  }
  return row;
}

export async function rejectLoanChange(changeId, approverName, reason) {
  if (!reason || !reason.trim()) throw new Error("A rejection reason is required.");
  const { data: row, error } = await supabase.rpc("reject_loan_change", {
    p_change_id: changeId, p_approver_name: approverName, p_reason: reason,
  });
  if (error) throw error;
  if (row?.submitted_by) {
    await supabase.from("notifications").insert({
      recipient_role: row.submitted_by, type: "loan_decision",
      title: "Loan Change Rejected",
      message: `${row.change_type === "reschedule" ? "Reschedule" : "Skip-month"} request for ${row.employee_code} rejected. Reason: ${reason}`,
      is_read: false,
    }).catch(() => {});
  }
  return row;
}

// Clear is Master-only (Early Settle stays Master/HR, unchanged) — routed
// through a narrow RPC since loans_manage_authorized already grants HR the
// same direct-update path Early Settle uses, and RLS can't tell the two
// actions apart (identical writes).
export async function clearLoanAsMaster(loanId, actorName) {
  const { data, error } = await supabase.rpc("clear_loan", { p_loan_id: loanId, p_actor_name: actorName });
  if (error) throw error;
  return data;
}
