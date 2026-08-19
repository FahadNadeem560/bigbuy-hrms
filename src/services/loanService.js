import { supabase } from "../lib/supabaseClient.js";

// Finance reconciles/pays salaries off whatever loans currently deduct, so
// it needs visibility into every change to loans/advances — not just the
// ones where Finance is the approver. Every action below notifies Finance
// in addition to whoever else needs to act or be told the outcome.
async function notifyFinance(title, message, type = "loan_decision") {
  // .catch() alone doesn't exist on a Postgrest query builder (it only
  // implements .then()) -- calling it directly throws synchronously before
  // the request is even sent, which was silently killing whatever ran after
  // this in the calling function (see approveLoanRequest below). .then()
  // with both handlers is the real fire-and-forget swallow.
  await supabase.from("notifications").insert({
    recipient_role: "Finance", type, title, message, is_read: false,
  }).then(() => {}, () => {});
}

// ══════════════════════ Loan Approval Workflow ══════════════════════
// HR can only propose (insert Pending Approval, no payroll effect yet —
// PayrollAutomation.jsx's deduction query filters loans on status='Active').
// Master applies instantly (submitLoan in LoanManagement.jsx sets status
// straight to 'Active' for Master). GM never proposes — only approves or
// rejects here. Mirrors incrementService.js's increment workflow exactly.

export async function notifyLoanProposed({ employeeName, loanAmount, monthlyDeduction, submittedByRole }) {
  const message = `${submittedByRole} submitted a loan request for ${employeeName} — Rs.${Number(loanAmount).toLocaleString()} (Rs.${Number(monthlyDeduction).toLocaleString()}/month). Awaiting approval.`;
  await Promise.all(["Master", "GM"].map(r => supabase.from("notifications").insert({
    recipient_role: r, type: "loan_proposed", title: "Loan Request Pending Approval", message, is_read: false,
  }))).catch(() => {});
  if (submittedByRole !== "Finance") await notifyFinance("Loan Request Submitted", message, "loan_proposed");
}

// Master's own loan creation skips the approval step (Master is itself an
// approver), but still lands on Pending Disbursement — Finance still needs
// to hand over the cash and upload the receiving picture before it's Active.
export async function notifyLoanCreatedByMaster({ employeeName, loanAmount, monthlyDeduction }) {
  await notifyFinance(
    "Loan Created — Pending Disbursement",
    `Master created a loan for ${employeeName} — Rs.${Number(loanAmount).toLocaleString()} (Rs.${Number(monthlyDeduction).toLocaleString()}/month). Ready for Finance to disburse and upload the receiving picture.`,
    "loan_proposed",
  );
}

export async function approveLoanRequest(loanId, approverName) {
  const { data: row, error } = await supabase.rpc("approve_loan_request", {
    p_loan_id: loanId, p_approver_name: approverName,
  });
  if (error) throw error;
  const message = `Loan for ${row?.employee_name} approved: Rs.${Number(row?.loan_amount || 0).toLocaleString()}. Ready for Finance to disburse and upload the receiving picture.`;
  if (row?.submitted_by) {
    await supabase.from("notifications").insert({
      recipient_role: row.submitted_by, type: "loan_decision", title: "Loan Request Approved", message, is_read: false,
    }).then(() => {}, () => {});
  }
  await notifyFinance("Loan Approved — Pending Disbursement", message);
  return row;
}

export async function rejectLoanRequest(loanId, approverName, reason) {
  if (!reason || !reason.trim()) throw new Error("A rejection reason is required.");
  const { data: row, error } = await supabase.rpc("reject_loan_request", {
    p_loan_id: loanId, p_approver_name: approverName, p_reason: reason,
  });
  if (error) throw error;
  const message = `Loan for ${row?.employee_name} rejected. Reason: ${reason}`;
  if (row?.submitted_by) {
    await supabase.from("notifications").insert({
      recipient_role: row.submitted_by, type: "loan_decision", title: "Loan Request Rejected", message, is_read: false,
    }).then(() => {}, () => {});
  }
  await notifyFinance("Loan Rejected", message);
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
  const message = `${submittedByRole} requested a ${label} for ${employeeName}'s loan${effectiveMonth ? ` (${effectiveMonth})` : ""}. Awaiting approval.`;
  await Promise.all(["Master", "GM"].map(r => supabase.from("notifications").insert({
    recipient_role: r, type: "loan_proposed",
    title: `Loan ${changeType === "reschedule" ? "Reschedule" : "Skip Month"} Requested`,
    message, is_read: false,
  }))).catch(() => {});
  if (submittedByRole !== "Finance") await notifyFinance(`Loan ${changeType === "reschedule" ? "Reschedule" : "Skip Month"} Requested`, message, "loan_proposed");
}

// Master applies a reschedule/relief instantly — inserted directly as
// Approved (self-approved, same as Master's loan creation), so the RPC
// isn't involved and the loans-table change happens right here.
export async function applyLoanChangeAsMaster({ loanId, employeeCode, employeeName, changeType, oldMonthly, newMonthly, newRepaymentMonths, effectiveMonth, reason, actorName }) {
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
  const label = changeType === "reschedule" ? `rescheduled to Rs.${Number(newMonthly).toLocaleString()}/month` : `skipped for ${effectiveMonth}`;
  await notifyFinance(
    `Loan ${changeType === "reschedule" ? "Rescheduled" : "Skip Month Applied"}`,
    `Master ${label} for ${employeeName || employeeCode}'s loan, effective immediately.`,
    "loan_proposed",
  );
}

export async function approveLoanChange(changeId, approverName) {
  const { data: row, error } = await supabase.rpc("approve_loan_change", {
    p_change_id: changeId, p_approver_name: approverName,
  });
  if (error) throw error;
  const label = row?.change_type === "reschedule" ? "Reschedule" : "Skip-month";
  const message = `${label} request for ${row?.employee_code} approved.`;
  if (row?.submitted_by) {
    await supabase.from("notifications").insert({
      recipient_role: row.submitted_by, type: "loan_decision", title: "Loan Change Approved", message, is_read: false,
    }).then(() => {}, () => {});
  }
  await notifyFinance("Loan Change Approved", message);
  return row;
}

export async function rejectLoanChange(changeId, approverName, reason) {
  if (!reason || !reason.trim()) throw new Error("A rejection reason is required.");
  const { data: row, error } = await supabase.rpc("reject_loan_change", {
    p_change_id: changeId, p_approver_name: approverName, p_reason: reason,
  });
  if (error) throw error;
  const label = row?.change_type === "reschedule" ? "Reschedule" : "Skip-month";
  const message = `${label} request for ${row?.employee_code} rejected. Reason: ${reason}`;
  if (row?.submitted_by) {
    await supabase.from("notifications").insert({
      recipient_role: row.submitted_by, type: "loan_decision", title: "Loan Change Rejected", message, is_read: false,
    }).then(() => {}, () => {});
  }
  await notifyFinance("Loan Change Rejected", message);
  return row;
}

// Clear and Early Settle are both Master-only — they're the exact same
// database write (status='Cleared', outstanding_balance=0), so restricting
// only one leaves an identical loophole open via the other. Both routed
// through narrow RPCs since HR previously had (and does not need) any
// direct UPDATE/DELETE on `loans` at all — see loans_master_update_authorized.
export async function clearLoanAsMaster(loanId, actorName) {
  const { data, error } = await supabase.rpc("clear_loan", { p_loan_id: loanId, p_actor_name: actorName });
  if (error) throw error;
  await notifyFinance("Loan Cleared", `Master cleared the loan for ${data?.employee_code}.`);
  return data;
}

export async function earlySettleLoanAsMaster(loanId, actorName) {
  const { data, error } = await supabase.rpc("early_settle_loan", { p_loan_id: loanId, p_actor_name: actorName });
  if (error) throw error;
  await notifyFinance("Loan Early-Settled", `Master early-settled the loan for ${data?.employee_code}.`);
  return data;
}

// ══════════════════════ Guarantee Documents & Finance Disbursement ══════════════════════
// HR photographs whatever collateral it took against a loan (CNIC, cheque,
// property papers, etc.) and writes a remark per item — required before the
// loan can be submitted. Once Master/GM approves (see approveLoanRequest
// above, which now lands on "Pending Disbursement" instead of "Active"),
// Finance hands over the cash, photographs the employee's signed receiving
// slip, and marks the loan disbursed — only then does it become "Active"
// and start deducting from payroll.

async function uploadLoanDocumentImage(file, folder) {
  const ext = file.name.split(".").pop();
  const path = `${folder}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("loan-documents").upload(path, file);
  if (error) throw error;
  const { data } = supabase.storage.from("loan-documents").getPublicUrl(path);
  return data.publicUrl;
}

// Uploaded after the loan row already exists (its id is the folder key), so
// a mid-batch failure here never blocks the loan itself from being saved —
// the caller surfaces a distinct error so the submitter knows to retry just
// the documents rather than assuming nothing happened.
export async function submitLoanGuaranteeDocuments(loanId, items, uploadedBy) {
  for (const item of items) {
    const imageUrl = await uploadLoanDocumentImage(item.file, `guarantee/${loanId}`);
    const { error } = await supabase.from("loan_guarantee_documents").insert({
      loan_id: loanId, image_url: imageUrl, remarks: item.remarks, uploaded_by: uploadedBy,
    });
    if (error) throw error;
  }
}

export async function fetchLoanGuaranteeDocuments(loanIds) {
  if (!loanIds || loanIds.length === 0) return [];
  const { data, error } = await supabase.from("loan_guarantee_documents").select("*").in("loan_id", loanIds);
  if (error) throw error;
  return data || [];
}

export async function markLoanDisbursed({ loanId, actorName, receiptFile, employeeName }) {
  if (!receiptFile) throw new Error("Upload a picture of the employee's signed receiving slip before marking this loan as paid.");
  const receiptUrl = await uploadLoanDocumentImage(receiptFile, `disbursement/${loanId}`);
  const { data: row, error } = await supabase.rpc("mark_loan_disbursed", {
    p_loan_id: loanId, p_actor_name: actorName, p_receipt_url: receiptUrl,
  });
  if (error) throw error;
  const message = `${actorName} disbursed and marked the loan for ${row?.employee_name || employeeName} as paid — now Active.`;
  await Promise.all(["Master", "HR"].map(r => supabase.from("notifications").insert({
    recipient_role: r, type: "loan_decision", title: "Loan Disbursed", message, is_read: false,
  }))).then(() => {}, () => {});
  return row;
}
