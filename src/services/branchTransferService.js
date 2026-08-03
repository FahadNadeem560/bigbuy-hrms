import { supabase } from "../lib/supabaseClient.js";

export async function fetchBranchTransfers() {
  const { data, error } = await supabase.from("branch_transfers").select("*").order("requested_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function submitBranchTransfer({ employeeCode, employeeName, department, fromBranch, toBranch, effectiveDate, reason, requestedBy }) {
  const { data, error } = await supabase.from("branch_transfers").insert({
    employee_code: employeeCode, employee_name: employeeName, department,
    from_branch: fromBranch, to_branch: toBranch, effective_date: effectiveDate,
    reason, requested_by: requestedBy,
  }).select().single();
  if (error) throw error;
  return data;
}

export async function approveBranchTransfer(id, approvedBy) {
  const { error } = await supabase.from("branch_transfers")
    .update({ status: "Approved", approved_by: approvedBy, approved_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function rejectBranchTransfer(id, rejectedBy, reason) {
  const { error } = await supabase.from("branch_transfers")
    .update({ status: "Rejected", rejected_by: rejectedBy, rejected_at: new Date().toISOString(), rejection_reason: reason || null })
    .eq("id", id);
  if (error) throw error;
}

// Runs as a single DB transaction (complete_branch_transfer RPC) so the
// transfer's status and employees.branch always change together -- the
// previous client-side-only implementation could show "Completed" without
// ever touching the real employee record.
export async function completeBranchTransfer(id, completedBy) {
  const { data, error } = await supabase.rpc("complete_branch_transfer", { p_transfer_id: id, p_completed_by: completedBy });
  if (error) throw error;
  return data;
}
