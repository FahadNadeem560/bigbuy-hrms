import { supabase } from "../lib/supabaseClient.js";

// `staff_level` (Employee form, Permissions filter, JS STAFF_LEVEL_POLICIES) and
// `eligibility_group` (the Postgres attendance classifier + payroll's
// buildPayrollRows) are the SAME axis with two label sets -- see Permissions.jsx
// GROUP_LABELS. They must never drift apart: the classifier stamps
// `attendance.required_hours` / OT / late rules from the group, and payroll reads
// that column, while Timesheet and other pages read the staff_level policy. When
// they disagree (e.g. Non-Management + MANAGEMENT_ADMIN) the two sides compute
// wildly different required hours for the same person.
export const STAFF_LEVEL_TO_GROUP = {
  "Management": "MANAGEMENT_ADMIN",
  "Floor Management": "FLOOR_MANAGEMENT",
  "Non-Management": "SALES_SUPPORT",
};

export function groupForStaffLevel(level) {
  return STAFF_LEVEL_TO_GROUP[level] || "SALES_SUPPORT";
}

// Re-run classify_attendance_day for every attendance row of one employee, back
// to the earliest month payroll is still tracking as Draft. Months whose payroll
// is already Published are skipped -- that's a closed/paid record and must not
// silently move underneath it. A month with no payroll row yet counts as
// unpublished (eligible). Call after any change the classifier reads: eligibility
// group / staff level, half-day or late exempt, single-punch-ok.
export async function reclassifyUnpublishedMonths(employeeCode) {
  const { data: payrollMeta } = await supabase.from("payroll").select("payroll_month, status");
  const trackedMonths = Array.from(new Set((payrollMeta || []).map(p => p.payroll_month))).sort();
  const publishedMonths = new Set((payrollMeta || []).filter(p => p.status === "Published").map(p => p.payroll_month));
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const earliestMonth = trackedMonths[0] || currentMonth;
  const fromDate = `${earliestMonth}-01`;

  const { data: rows, error } = await supabase.from("attendance")
    .select("id, work_date")
    .eq("employee_code", employeeCode)
    .gte("work_date", fromDate);
  if (error) return { updated: 0, skipped: 0, error };
  if (!rows?.length) return { updated: 0, skipped: 0, error: null };

  const eligible = rows.filter(r => !publishedMonths.has(r.work_date.slice(0, 7)));
  let updated = 0;
  for (const row of eligible) {
    const { error: rpcErr } = await supabase.rpc("reclassify_attendance_row", { p_attendance_id: row.id });
    if (!rpcErr) updated++;
  }
  return { updated, skipped: rows.length - eligible.length, error: null };
}
