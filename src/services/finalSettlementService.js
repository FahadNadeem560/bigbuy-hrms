import { supabase } from "../lib/supabaseClient.js";

// Thin wrappers over the Phase 2 settlement RPCs. Processing a settlement
// touches six things -- leave balances, regular payroll rows, the employee's
// status and separation dates, the settlement header, its month lines, and the
// audit log. Doing that as six separate calls from the browser is how an
// employee ends up removed from payroll with no settlement to show for it, so
// it all runs inside one Postgres transaction now.
//
// Figures are still computed client-side and passed in; the RPC owns the
// writes and the validation. Nothing calls these yet -- Phase 3 moves
// FinalSettlement.jsx onto them.

// payload shape (all money already computed):
//   employee_code, payroll_month, separation_type ('resignation'|'termination'),
//   resignation_date | termination_date, last_working_day, resignation_reason,
//   staff_level, branch, department, salary, daily_rate,
//   days_present, weekly_offs, absent_days, paid_days,
//   pending_salary, leave_encashment, loan_balance,
//   notice_required_days, notice_served_days, notice_complete, notice_penalty,
//   is_absconding, override_applied, override_by, override_reason,
//   salary_payable, payout_mode, payout_days,
//   paid_until_date, last_working_day_inclusive, notice_waived,
//   pay_in_lieu_days, pay_in_lieu_amount, released_hold_amount,
//   recoverable_at_exit, termination_forfeit_mode,
//   settled_through_month, window_start, window_end, increment_warning,
//   gross_earnings, total_deductions, net_payable, payment_status ('FnF'|'No_FnF'),
//   lines: [{ payroll_month, line_type, label, gross, deductions, net,
//             present_days, absent_days, weekly_offs, paid_days, detail }]
//
// The RPC refuses (and rolls everything back) when the employee already has a
// live settlement, or when any month the settlement pays for is already
// Published or paid in regular payroll -- that combination means the unpaid
// window was computed wrong and the money would go out twice.
export async function processFinalSettlement(payload) {
  const { data, error } = await supabase.rpc("process_final_settlement", { p_payload: payload });
  if (error) throw error;
  return data; // settlement id
}

// Master only. Restores the leave balances from the snapshot taken at
// settlement time, puts the employee back to Active with their separation
// dates cleared -- which re-admits them to the regular payroll cycle -- and
// marks the settlement reversed rather than deleting it, so the history stays.
export async function reverseFinalSettlement(settlementId, reason) {
  const { error } = await supabase.rpc("reverse_final_settlement", {
    p_settlement_id: settlementId, p_reason: reason,
  });
  if (error) throw error;
}

// Master only. Clears the paid flags on a settlement Finance marked paid in
// error, so it can be corrected and paid again.
export async function unpayFinalSettlement(settlementId, reason) {
  const { error } = await supabase.rpc("unpay_final_settlement", {
    p_settlement_id: settlementId, p_reason: reason,
  });
  if (error) throw error;
}

// The per-month breakdown behind a settlement total.
export async function fetchSettlementLines(settlementId) {
  const { data, error } = await supabase
    .from("final_settlement_lines")
    .select("*")
    .eq("settlement_id", settlementId)
    .order("payroll_month", { ascending: true });
  if (error) throw error;
  return data || [];
}
