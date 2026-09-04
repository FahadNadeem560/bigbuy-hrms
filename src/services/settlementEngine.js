import { supabase } from "../lib/supabaseClient.js";
import { computePayrollForMonth } from "./payrollEngine.js";

// Works out what a leaver is actually owed.
//
// The old model paid the window "resignation date -> last working day" using
// its own count-the-present-days maths. That's the NOTICE window, not the
// UNPAID window: it dropped days worked before the resignation date in a month
// payroll never ran, and re-paid days a payroll run had already covered. It
// also disagreed with payroll on exemptions, half days, paid leave, overtime,
// EOBI and tax, because it was a second implementation of the same idea.
//
// This resolves the real unpaid window and then runs the *regular payroll
// engine* over each month in it, so a leaver's final months are computed
// exactly as they would have been had they stayed.

const SETTLED_THROUGH_KEY = "payroll_settled_through";

// Everything up to and including this month was paid outside this system and
// is closed. No settlement may ever compute, re-cost or pay a month at or
// before it, whatever the policy row says or fails to say -- a missing /
// mistyped watermark used to send the engine back to the joining date and
// re-pay months that were settled months ago.
export const HARD_PAID_THROUGH_FLOOR = "2026-06";

// ── month helpers (months are "YYYY-MM" strings, dates "YYYY-MM-DD") ───────
export const monthOf = (d) => (d ? String(d).slice(0, 7) : null);
export const firstDayOf = (m) => `${m}-01`;
export function lastDayOf(m) {
  const [y, mo] = m.split("-").map(Number);
  return `${m}-${String(new Date(y, mo, 0).getDate()).padStart(2, "0")}`;
}
export function monthAfter(m) {
  const [y, mo] = m.split("-").map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
}
export function monthsBetween(from, to) {
  const out = [];
  let cur = from;
  // Guard against a bad watermark producing an unbounded loop.
  for (let i = 0; cur <= to && i < 36; i++) { out.push(cur); cur = monthAfter(cur); }
  return out;
}

// The company-wide "everything up to this month was paid" watermark. Payroll
// only started running in this system in July 2026 -- earlier months were paid
// outside it -- so without this, "last paid payroll month" is null for
// everyone and a settlement would try to pay from the joining date.
export async function getPayrollWatermark() {
  const { data } = await supabase.from("hrms_policy_settings")
    .select("value").eq("key", SETTLED_THROUGH_KEY).maybeSingle();
  const v = data?.value;
  let stored = null;
  if (typeof v === "string") stored = v;
  else if (v && typeof v === "object" && typeof v.month === "string") stored = v.month;
  // Never earlier than the floor, but a later watermark still wins.
  return stored && stored > HARD_PAID_THROUGH_FLOOR ? stored : HARD_PAID_THROUGH_FLOOR;
}

// The last month this employee is considered paid for: the later of the
// company watermark and any month their own payroll row was genuinely
// settled. A month on Hold is NOT settled -- its net is released into the
// F&F instead (see getUnreleasedHolds).
export async function getSettledThroughMonth(employeeCode, watermark) {
  const { data } = await supabase.from("payroll")
    .select("payroll_month, status, is_paid, net_salary, payment_status")
    .eq("employee_code", employeeCode);
  const settled = (data || [])
    .filter(r => r.status === "Published"
      && r.payment_status !== "Hold"
      && (r.is_paid === true || Number(r.net_salary || 0) <= 0))
    .map(r => r.payroll_month);
  const all = [watermark, ...settled].filter(Boolean).sort();
  return all.length ? all[all.length - 1] : null;
}

// Held months were never paid -- their net has to come out in the settlement,
// or it disappears when the employee leaves the payroll cycle.
export async function getUnreleasedHolds(employeeCode) {
  const { data } = await supabase.from("payroll")
    .select("id, payroll_month, net_salary, payment_status, is_paid")
    .eq("employee_code", employeeCode).eq("payment_status", "Hold");
  return (data || [])
    .filter(r => !r.is_paid && Number(r.net_salary || 0) !== 0)
    .map(r => ({ id: r.id, month: r.payroll_month, amount: Number(r.net_salary || 0) }));
}

// max(joining date, first day of the month after settledThrough) -> last day.
export function resolveUnpaidWindow({ joiningDate, settledThrough, lastWorkingDay }) {
  const fromWatermark = settledThrough ? firstDayOf(monthAfter(settledThrough)) : null;
  const candidates = [joiningDate, fromWatermark].filter(Boolean).sort();
  let windowStart = candidates.length ? candidates[candidates.length - 1] : null;
  const windowEnd = lastWorkingDay || null;
  const notes = [];

  if (!windowStart && windowEnd) {
    // Nothing to anchor on -- fall back to the final month alone rather than
    // guessing at an open-ended history.
    windowStart = firstDayOf(monthOf(windowEnd));
    notes.push("No paid-through date or joining date on file — settling the final month only.");
  }
  if (!windowStart || !windowEnd || windowStart > windowEnd) {
    return { windowStart, windowEnd, months: [], notes };
  }
  const months = monthsBetween(monthOf(windowStart), monthOf(windowEnd))
    .filter(m => m > HARD_PAID_THROUGH_FLOOR);
  if (months.length > 6) notes.push(`Window spans ${months.length} months — check the paid-through date before processing.`);
  if (!months.length) notes.push(`Nothing to settle: the whole period falls on or before ${HARD_PAID_THROUGH_FLOOR}, which is already paid.`);
  return { windowStart, windowEnd, months, notes };
}

// Builds the complete settlement. `employee` must be a full employees row
// (select("*")), because the payroll engine reads a dozen fields off it.
export async function buildSettlement({
  employee,
  separationType = "resignation",
  lastWorkingDay,
  noticePenalty = 0,
  paidDaysOverride = null,   // Master override: pay a fixed number of days instead
}) {
  const code = employee?.employee_code;
  const watermark = await getPayrollWatermark();
  const settledThrough = await getSettledThroughMonth(code, watermark);
  const { windowStart, windowEnd, months, notes } =
    resolveUnpaidWindow({ joiningDate: employee?.joining_date, settledThrough, lastWorkingDay });

  // The engine prorates a leaver's final month from employees.status +
  // last_working_day -- but at settlement time the employee is still Active
  // and has no last working day yet. Hand it a shadow row carrying the
  // values it's about to be given, so the final month is costed exactly as
  // it will be once the settlement is saved.
  const shadowEmp = {
    ...employee,
    status: separationType === "termination" ? "Terminated" : "Resigned",
    last_working_day: lastWorkingDay,
  };

  const { data: loanRows } = await supabase.from("loans").select("*")
    .eq("employee_code", code).eq("status", "Active");
  const loans = loanRows || [];

  const monthLines = [];
  for (const m of months) {
    const rows = await computePayrollForMonth({
      month: m, employees: [shadowEmp], loans, applySideEffects: false,
      // One leaver -- don't drag the whole company's month through the
      // browser to cost them (see computePayrollForMonth).
      scopeCodes: [code],
    });
    const r = rows?.[0];
    if (!r) continue;
    monthLines.push({
      payroll_month: m,
      line_type: "month",
      label: null,
      gross: Number(r.totalEarnings || 0),
      deductions: Number(r.totalDeductions || 0),
      net: Number(r.finalSalary || 0),
      present_days: Number(r.presentDays || 0),
      absent_days: Number(r.absentDays || 0),
      weekly_offs: Number(r.weeklyOffDays || 0),
      paid_days: Number(r.presentDays || 0) + Number(r.weeklyOffDays || 0),
      detail: r,
    });
  }

  // Held salary from months at or before the watermark -- never paid, so it
  // is released here.
  const holds = await getUnreleasedHolds(code);
  const releasedHold = holds.reduce((s, h) => s + h.amount, 0);
  const holdLines = holds.map(h => ({
    payroll_month: h.month, line_type: "released_hold",
    label: `Held salary released (${h.month})`,
    gross: h.amount, deductions: 0, net: h.amount, detail: null,
  }));

  // The month lines already took each month's own loan installment; only the
  // balance left after those is recovered at exit, or it double-deducts.
  const installmentsTaken = monthLines.reduce((s, l) => s + Number(l.detail?.loanDeduction || 0), 0);
  const loanOutstanding = loans.reduce((s, l) => s + Number(l.outstanding_balance || 0), 0);
  const loanClosingBalance = Math.max(0, Math.round(loanOutstanding - installmentsTaken));

  // Advances issued for months outside the settled window are likewise not
  // covered by any month line.
  const { data: advRows } = await supabase.from("advances")
    .select("advance_month, issued_amount, status")
    .eq("employee_code", code).in("status", ["Issued"]);
  const advanceResidual = (advRows || [])
    .filter(a => !months.includes(a.advance_month))
    .reduce((s, a) => s + Number(a.issued_amount || 0), 0);

  // A Master override that fixes the number of paid days replaces the
  // engine's month totals with days x daily rate.
  const dailyRate = Number(employee?.salary || 0) / 30;
  const overrideSalary = paidDaysOverride != null
    ? Math.round(dailyRate * Number(paidDaysOverride || 0)) : null;

  const monthsGross = monthLines.reduce((s, l) => s + l.gross, 0);
  const monthsDeductions = monthLines.reduce((s, l) => s + l.deductions, 0);

  const grossEarnings = overrideSalary != null
    ? overrideSalary + releasedHold
    : monthsGross + releasedHold;
  const totalDeductions = (overrideSalary != null ? 0 : monthsDeductions)
    + loanClosingBalance + advanceResidual + Number(noticePenalty || 0);

  const net = Math.round(grossEarnings - totalDeductions);
  const cashPayable = Math.max(0, net);
  const recoverableAtExit = Math.max(0, -net);

  const daysPresent = monthLines.reduce((s, l) => s + l.present_days, 0);
  const weeklyOffs  = monthLines.reduce((s, l) => s + l.weekly_offs, 0);
  const absentDays  = monthLines.reduce((s, l) => s + l.absent_days, 0);
  const paidDays    = paidDaysOverride != null
    ? Number(paidDaysOverride) : monthLines.reduce((s, l) => s + l.paid_days, 0);

  return {
    settledThrough, watermark, windowStart, windowEnd, months, notes,
    monthLines, holdLines, releasedHold,
    loanOutstanding, installmentsTaken, loanClosingBalance, advanceResidual,
    dailyRate, daysPresent, weeklyOffs, absentDays, paidDays,
    pendingSalary: overrideSalary != null ? overrideSalary : monthLines.reduce((s, l) => s + l.net, 0),
    grossEarnings, totalDeductions, net, cashPayable, recoverableAtExit,
    // F&F now follows the money, not the notice period: a positive net is
    // payable even when notice was short (the penalty is already inside it).
    paymentStatus: cashPayable > 0 ? "FnF" : "No_FnF",
    lines: [...monthLines, ...holdLines],
  };
}

// ── Deduction breakdown ───────────────────────────────────────────────────
// A settlement's deductions come from two places: the ones the payroll engine
// charged inside each settled month (absences, fines, tax, EOBI, that month's
// loan installment...), and the ones that only fall due at exit (the loan
// balance left over, unrecovered advances, a short-notice penalty).
//
// Only the second group was ever itemised on screen. The first was a single
// "Monthly deductions (loans, fines, tax, EOBI…)" line in the calculator, and
// on the stored settlement slip it wasn't shown at all -- the slip listed the
// loan balance and the notice penalty and then a Total Deductions that didn't
// add up to them, with no way to see what the difference was.
//
// The per-month payroll row is kept on each line's `detail`, both in memory
// and in final_settlement_lines.detail, so the components can be summed back
// out for either view without recomputing anything.
export const DEDUCTION_COMPONENTS = [
  ["absentDeduction",    "Absent days"],
  ["halfDayDeduction",   "Half days"],
  ["lateDeduction",      "Late arrivals"],
  ["shortHourDeduction", "Short hours"],
  ["fineDeduction",      "Fines"],
  ["shortageDeduction",  "Cash shortages"],
  ["advanceDeduction",   "Advance recovered in month"],
  ["loanDeduction",      "Loan instalments in month"],
  ["taxDeduction",       "Income tax"],
  ["eobiDeduction",      "EOBI"],
  ["otherDeductions",    "Other deductions"],
];

// Totals each component across every month line. Lines with no `detail`
// (released-hold lines) carry no deductions and are skipped.
export function sumMonthlyDeductions(monthLines) {
  const out = {};
  DEDUCTION_COMPONENTS.forEach(([k]) => { out[k] = 0; });
  (monthLines || []).forEach((l) => {
    const d = l?.detail;
    if (!d) return;
    DEDUCTION_COMPONENTS.forEach(([k]) => { out[k] += Number(d[k] || 0); });
  });
  return out;
}
