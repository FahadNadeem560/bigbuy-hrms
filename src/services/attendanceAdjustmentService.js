import { supabase } from "../lib/supabaseClient.js";

// A manual day-status change (Present -> Leave / Weekly Off / Absent, or a
// revert back to Present) is submitted here as a PENDING attendance_adjustments
// row. It does NOT touch the live attendance record — ApprovalQueue.approveAttCorr
// applies it only after Master/GM approval, which is what then flows into payroll
// on the next Refresh. Shared by the Timesheet ledger and Attendance > Records so
// both go through the exact same queue.

export const OVERRIDABLE_TO = ["Present", "Weekly Off", "Leave", "Absent"];

// PostgREST enum-ish: the queue filters on this exact string.
const PENDING = "Pending Approval";

export async function fetchPendingStatusChanges(fromDate, toDate) {
  let q = supabase
    .from("attendance_adjustments")
    .select("id, employee_code, attendance_date, original_status, adjusted_status, reason, adjusted_by, adjusted_at, status")
    .eq("status", PENDING)
    .not("adjusted_status", "is", null);
  if (fromDate) q = q.gte("attendance_date", fromDate);
  if (toDate) q = q.lte("attendance_date", toDate);
  const { data, error } = await q.order("adjusted_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

// Returns { ok: true } on submit, or { ok: false, reason } when a pending
// change for that employee+date already exists (caller shows the message).
export async function submitAttendanceStatusChange({
  employeeCode, date, originalStatus, adjustedStatus,
  originalCheckIn = null, originalCheckOut = null, reason, actor,
}) {
  if (!employeeCode || !date) return { ok: false, reason: "Missing employee or date." };
  if (!OVERRIDABLE_TO.includes(adjustedStatus)) return { ok: false, reason: `Cannot set status "${adjustedStatus}".` };
  if (!reason || !reason.trim()) return { ok: false, reason: "A reason is required." };
  if (originalStatus && originalStatus === adjustedStatus) return { ok: false, reason: `Day is already ${adjustedStatus}.` };

  const { data: dupe } = await supabase
    .from("attendance_adjustments")
    .select("id")
    .eq("employee_code", employeeCode)
    .eq("attendance_date", date)
    .eq("status", PENDING)
    .limit(1);
  if (dupe && dupe.length > 0) {
    return { ok: false, reason: "A change for this day is already awaiting approval." };
  }

  const { error } = await supabase.from("attendance_adjustments").insert({
    employee_code: employeeCode,
    attendance_date: date,
    original_status: originalStatus || null,
    adjusted_status: adjustedStatus,
    original_check_in: originalCheckIn,
    original_check_out: originalCheckOut,
    reason: reason.trim(),
    adjusted_by: actor || "HR",
    adjusted_at: new Date().toISOString(),
    status: PENDING,
  });
  if (error) return { ok: false, reason: error.message };

  await supabase.from("audit_logs").insert({
    action: "attendance_status_change_requested", entity: "attendance",
    performed_by: actor || "HR",
    details: `Requested ${employeeCode} ${date}: ${originalStatus || "?"} -> ${adjustedStatus}. Reason: ${reason.trim()}`,
    created_at: new Date().toISOString(),
  }).then(() => {});

  return { ok: true };
}
