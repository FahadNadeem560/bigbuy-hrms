import { supabase } from "../lib/supabaseClient.js";

// A manual day-status change (Present -> Weekly Off / Leave / Absent, or a
// revert back to Present) from the Timesheet ledger or Attendance > Records.
//
// Policy (2026-08-29): these apply IMMEDIATELY to the live attendance record
// and just notify Master + GM -- they no longer wait in the Approval Queue.
// HR converting a stray Absent to a Weekly Off / Leave, or a Half Day to an
// Absent, is routine month-end cleanup and the approval round-trip only
// slowed it down. (Time-punch corrections -- adjusted check-in/out -- still
// go through the queue; only whole-day status changes are instant.)
// Payroll picks the change up on its next Refresh.

export const OVERRIDABLE_TO = ["Present", "Weekly Off", "Leave", "Absent"];

// Writes the chosen status onto the live attendance row (inserting one if the
// day has no row yet), locking it so the next ZKT re-sync can't overwrite it.
// Mirrors what ApprovalQueue used to do on approval. Returns the affected
// attendance row id.
export async function applyAttendanceStatusChange({ employeeCode, date, adjustedStatus, reason = "", actorRole = "HR", employeeName = null }) {
  const { data: existing } = await supabase.from("attendance")
    .select("id, required_hours, check_in, check_out")
    .eq("employee_code", employeeCode).eq("attendance_date", date).maybeSingle();

  let update;
  if (adjustedStatus === "Weekly Off") {
    update = {
      attendance_status: "Weekly Off", is_weekly_off: true,
      required_hours: 0, short_hours: 0, late_minutes: 0, early_out_minutes: 0, overtime_hours: 0, ot_hours: 0,
      needs_review: false, exception_reason: null,
      review_status: "Locked", is_manual_entry: true, manual_entry_by: actorRole,
      adjustment_status: `Weekly Off (manual): ${reason}`, adjustment_approved_by: actorRole,
    };
  } else if (adjustedStatus === "Absent") {
    update = {
      attendance_status: "Absent", is_weekly_off: false,
      worked_hours: 0, actual_hours: 0, short_hours: Number(existing?.required_hours || 0),
      late_minutes: 0, early_out_minutes: 0, overtime_hours: 0, ot_hours: 0,
      needs_review: false, exception_reason: null,
      review_status: "Locked", is_manual_entry: true, manual_entry_by: actorRole,
      adjustment_status: `Absent (manual): ${reason}`, adjustment_approved_by: actorRole,
    };
  } else if (adjustedStatus === "Leave") {
    update = {
      attendance_status: "Leave", status: "Leave", is_weekly_off: false,
      check_in: null, check_out: null, first_check_in: null, last_check_out: null,
      worked_hours: 0, actual_hours: 0, short_hours: 0, late_minutes: 0, early_out_minutes: 0, overtime_hours: 0, ot_hours: 0,
      needs_review: false, exception_reason: null,
      review_status: "Locked", is_manual_entry: true, manual_entry_by: actorRole,
      adjustment_status: `Leave (manual): ${reason}`, adjustment_approved_by: actorRole,
    };
  } else { // "Present" -- HR is asserting this was a full worked day (a
           // misclassified Absent, a mistaken Weekly Off / Leave, or a short-
           // punch day they want to count in full).
    // Always a locked manual full-hours Present -- never handed back to the
    // classifier. If the row still had punches the classifier disagreed with
    // (e.g. only 3h of a 9h shift), reclassifying would just re-mark it Absent
    // and silently undo the override (confirmed: emp 1760, 24 Jul 2026 --
    // "Marked Present" was reverted to Absent by reclassify, deduction stayed).
    // To recompute from real punches instead, use Adjust Time.
    update = {
      attendance_status: "Present", status: "Present",
      worked_hours: Number(existing?.required_hours || 0), actual_hours: Number(existing?.required_hours || 0),
      short_hours: 0, late_minutes: 0, early_out_minutes: 0, overtime_hours: 0, ot_hours: 0,
      is_weekly_off: false, needs_review: false, exception_reason: null,
      review_status: "Locked", is_manual_entry: true, manual_entry_by: actorRole,
      adjustment_status: `Marked Present (manual): ${reason}`, adjustment_approved_by: actorRole,
    };
  }

  let rowId = existing?.id || null;
  if (existing) {
    await supabase.from("attendance").update(update).eq("id", existing.id);
  } else {
    const { data: inserted } = await supabase.from("attendance").insert({
      employee_code: employeeCode, work_date: date, attendance_date: date, ...update,
    }).select("id").single();
    rowId = inserted?.id || null;
  }

  // Kept for the "Present" branch's earlier reclassify-from-punches behaviour;
  // that path is gone (a Present override is always a locked manual entry now),
  // so this is currently a no-op guard. Left in case a future branch wants it.
  if (adjustedStatus === "Present" && rowId && !update.is_manual_entry) {
    await supabase.rpc("reclassify_attendance_row", { p_attendance_id: rowId });
  }

  // Leave must also count against the employee's leave balance -- LeaveManagement
  // only sums Approved leave_requests, it never reads attendance_status='Leave'.
  if (adjustedStatus === "Leave") {
    const now = new Date().toISOString();
    const { data: lr } = await supabase.from("leave_requests").insert({
      employee_id: employeeCode, employee_code: employeeCode,
      employee_name: employeeName || employeeCode, leave_type: "Annual",
      from_date: date, to_date: date, days: 1,
      reason: `Marked as Leave (manual attendance change). ${reason}`,
      applied_date: date, status: "Approved",
      approved_by: actorRole, approved_at: now,
      approval_trail: [{ level: null, approver: actorRole, action: "Approved (attendance change)", timestamp: now }],
    }).select().single();
    if (lr) {
      await supabase.from("leave_approvals").insert({
        leave_request_id: lr.id, stage: "Attendance Change", actor_role: actorRole, actor_name: actorRole, action: "Approved",
      }).then(() => {}, () => {});
    }
  }

  return rowId;
}

// Returns { ok: true } once applied, or { ok: false, reason } on a validation
// failure. Applies immediately and notifies Master + GM -- no approval queue.
export async function submitAttendanceStatusChange({
  employeeCode, date, originalStatus, adjustedStatus,
  originalCheckIn = null, originalCheckOut = null, reason, actor,
  employeeName = null,
}) {
  if (!employeeCode || !date) return { ok: false, reason: "Missing employee or date." };
  if (!OVERRIDABLE_TO.includes(adjustedStatus)) return { ok: false, reason: `Cannot set status "${adjustedStatus}".` };
  if (!reason || !reason.trim()) return { ok: false, reason: "A reason is required." };
  if (originalStatus && originalStatus === adjustedStatus) return { ok: false, reason: `Day is already ${adjustedStatus}.` };

  const actorRole = actor || "HR";

  try {
    await applyAttendanceStatusChange({ employeeCode, date, adjustedStatus, reason: reason.trim(), actorRole, employeeName });
  } catch (e) {
    return { ok: false, reason: e.message || "Could not apply the change." };
  }

  // Trail row: recorded as already-applied, not pending -- keeps the history
  // the Approval Queue and Records/Timesheet badges read from consistent.
  await supabase.from("attendance_adjustments").insert({
    employee_code: employeeCode,
    attendance_date: date,
    original_status: originalStatus || null,
    adjusted_status: adjustedStatus,
    original_check_in: originalCheckIn,
    original_check_out: originalCheckOut,
    reason: reason.trim(),
    adjusted_by: actorRole,
    adjusted_at: new Date().toISOString(),
    status: "Applied",
    approved_by: actorRole,
    approved_at: new Date().toISOString(),
  }).then(() => {}, () => {});

  await Promise.all(["Master", "GM"].map(r => supabase.from("notifications").insert({
    recipient_role: r, type: "attendance_status_change", is_read: false,
    title: "Attendance Day Changed",
    message: `${actorRole} changed ${employeeName ? `${employeeName} (${employeeCode})` : employeeCode} on ${date} from ${originalStatus || "?"} to ${adjustedStatus}. Reason: ${reason.trim()}`,
  }))).catch(() => {});

  await supabase.from("audit_logs").insert({
    action: "attendance_status_change_applied", entity: "attendance",
    performed_by: actorRole,
    details: `${employeeCode} ${date}: ${originalStatus || "?"} -> ${adjustedStatus}. Reason: ${reason.trim()}`,
    created_at: new Date().toISOString(),
  }).then(() => {}, () => {});

  return { ok: true, applied: true };
}

// Still used for the handful of status-change rows queued before the instant-
// apply switch (status = "Pending Approval"); the Approval Queue drains those.
export async function fetchPendingStatusChanges(fromDate, toDate) {
  let q = supabase
    .from("attendance_adjustments")
    .select("id, employee_code, attendance_date, original_status, adjusted_status, reason, adjusted_by, adjusted_at, status")
    .eq("status", "Pending Approval")
    .not("adjusted_status", "is", null);
  if (fromDate) q = q.gte("attendance_date", fromDate);
  if (toDate) q = q.lte("attendance_date", toDate);
  const { data, error } = await q.order("adjusted_at", { ascending: false });
  if (error) throw error;
  return data || [];
}
