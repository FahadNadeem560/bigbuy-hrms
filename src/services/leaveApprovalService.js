import { supabase } from "../lib/supabaseClient.js";

// Fixed 3-stage chain, kept only so leave requests created before the org
// hierarchy rollout (which never got a current_approver_id) keep resolving
// exactly the way they always did. New requests are routed dynamically via
// resolveNextApprover() below, walking employee_hierarchy.reports_to.
export const LEAVE_STAGES = [
  "Pending Supervisor Approval",
  "Pending Branch Manager Approval",
  "Pending HR Approval",
  "Approved",
];

const LEGACY_STAGE_APPROVER_ROLE = {
  "Pending Supervisor Approval": "HR",
  "Pending Branch Manager Approval": "Branch Manager",
};

const LEGACY_STAGE_MAP = {
  "Pending": "Pending Supervisor Approval",
  "Pending Supervisor": "Pending Supervisor Approval",
  "Pending HR": "Pending HR Approval",
};

export function normalizeStage(status) {
  return LEGACY_STAGE_MAP[status] || status;
}

function legacyNextStage(currentStage) {
  const idx = LEAVE_STAGES.indexOf(currentStage);
  if (idx === -1 || idx >= LEAVE_STAGES.length - 1) return "Approved";
  return LEAVE_STAGES[idx + 1];
}

// A request is on the old fixed-role chain if it was never assigned a
// hierarchy approver and hasn't yet reached the HR-terminal stage (HR is
// terminal for both chain types, so it doesn't matter which one got it there).
function isLegacyChainRequest(request) {
  return !request.current_approver_id && normalizeStage(request.status) !== "Pending HR Approval";
}

export function canActOnStage(role, request, actorEmployeeCode) {
  if (role === "Master") return true;
  const stage = normalizeStage(request.status);
  if (stage === "Approved" || stage.startsWith("Rejected")) return false;
  if (stage === "Pending HR Approval") return role === "HR";
  if (isLegacyChainRequest(request)) {
    if (stage === "Pending Supervisor Approval") return role === "HR";
    if (stage === "Pending Branch Manager Approval") return role === "Branch Manager";
    return false;
  }
  // Hierarchy-routed: only the specific person it's currently sitting with can act.
  return !!actorEmployeeCode && actorEmployeeCode === request.current_approver_code;
}

async function findActiveHierarchyByEmployeeId(employeeId) {
  if (!employeeId) return null;
  const { data } = await supabase.from("employee_hierarchy")
    .select("*").eq("employee_id", employeeId).eq("is_active", true)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data || null;
}

async function findActiveHierarchyByCode(employeeCode) {
  if (!employeeCode) return null;
  const { data } = await supabase.from("employee_hierarchy")
    .select("*").eq("employee_code", employeeCode).eq("is_active", true)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data || null;
}

// Resolves who should act next in the dynamic chain. Pass `fromEmployeeId`
// as null for the very first routing step (uses the applicant's own
// hierarchy position); pass the current approver's employee id to walk one
// level further up. Returns { toHR: true } once the chain runs out (nobody
// left to report to, or the applicant/approver has no hierarchy assignment
// at all) — HR always gives final approval per the spec.
async function resolveNextApprover(fromEmployeeId, applicantEmployeeCode) {
  const sourceEntry = fromEmployeeId
    ? await findActiveHierarchyByEmployeeId(fromEmployeeId)
    : await findActiveHierarchyByCode(applicantEmployeeCode);

  if (!sourceEntry || !sourceEntry.reports_to_employee_id) return { toHR: true };

  const nextEntry = await findActiveHierarchyByEmployeeId(sourceEntry.reports_to_employee_id);
  if (!nextEntry) return { toHR: true };

  return {
    toHR: false,
    approverId: nextEntry.employee_id,
    approverName: nextEntry.employee_name,
    approverCode: nextEntry.employee_code,
    levelNumber: nextEntry.level_number,
    levelName: nextEntry.level_name,
  };
}

function toHRFields() {
  return { status: "Pending HR Approval", current_approver_id: null, current_approver_name: null, current_approver_code: null, current_level: null };
}

function toApproverFields(next) {
  return {
    status: `Pending ${next.levelName} Approval`,
    current_approver_id: next.approverId, current_approver_name: next.approverName,
    current_approver_code: next.approverCode, current_level: next.levelNumber,
  };
}

// Called by the Apply Leave form before inserting the row, so the very
// first approver is set at submission time.
export async function routeInitialApprover(employeeCode) {
  const next = await resolveNextApprover(null, employeeCode);
  return next.toHR ? toHRFields() : toApproverFields(next);
}

const FINANCE_FYI_LEVELS = ["Chief Cashier", "Head Cashier"];

// Called by the Apply Leave form after the row insert succeeds, to notify
// whoever routeInitialApprover() assigned. `request` needs employee_code,
// employee_name, leave_type and days for the notification message.
export async function notifyInitialApprover(routing, request) {
  const next = routing.current_approver_id
    ? { toHR: false, approverId: routing.current_approver_id }
    : { toHR: true };
  await notifyNextApprover(next, request);

  // HR is always kept in the loop, even when they aren't the current approver.
  if (!next.toHR) {
    await supabase.from("notifications").insert({
      recipient_role: "HR", type: "leave_approval", is_read: false,
      title: "New Leave Request (FYI)",
      message: `${request.employee_name} has requested ${request.days || ""} day(s) leave. Currently with ${routing.current_approver_name || "the next approver"}.`,
    });
  }

  // Finance is notified when a cash-handling role applies for leave.
  const applicant = await findActiveHierarchyByCode(request.employee_code);
  if (applicant && FINANCE_FYI_LEVELS.includes(applicant.level_name)) {
    await supabase.from("notifications").insert({
      recipient_role: "Finance", type: "leave_approval", is_read: false,
      title: "Cash-Handling Staff Leave (FYI)",
      message: `${request.employee_name} (${applicant.level_name}) has requested ${request.days || ""} day(s) leave.`,
    });
  }
}

// Walks all hierarchy-routed leave requests still awaiting action and:
//  - 24h with no action → reminder notification to the current approver (once)
//  - 48h with no action → auto-escalates to the next level and notifies both
// No server-side cron exists in this project; call this on app load instead,
// same pattern as the temporary-employee check in App.jsx.
export async function escalateStaleApprovals() {
  const { data: pending } = await supabase.from("leave_requests")
    .select("*")
    .not("status", "in", "(Approved)")
    .not("status", "like", "Rejected%")
    .not("stage_entered_at", "is", null);
  if (!pending || pending.length === 0) return;

  const now = Date.now();
  for (const request of pending) {
    const hoursInStage = (now - new Date(request.stage_entered_at).getTime()) / 3600000;
    const isHRStage = normalizeStage(request.status) === "Pending HR Approval";

    if (hoursInStage >= 48 && !request.escalated_at) {
      if (isHRStage) continue; // HR is terminal — nothing further to escalate to.
      const next = await resolveNextApprover(request.current_approver_id, request.employee_code);
      const payload = next.toHR ? toHRFields() : toApproverFields(next);
      const trail = appendTrail(request, {
        level: request.current_level, approver: request.current_approver_name || "System",
        action: "Escalated (48h timeout)", timestamp: new Date().toISOString(),
      });
      await supabase.from("leave_requests").update({
        ...payload, stage_entered_at: new Date().toISOString(),
        reminder_sent_at: null, escalated_at: new Date().toISOString(), approval_trail: trail,
      }).eq("id", request.id);
      if (request.current_approver_id) {
        await supabase.from("notifications").insert({
          recipient_employee_id: request.current_approver_id, type: "leave_approval", is_read: false,
          title: "Leave Request Escalated",
          message: `${request.employee_name}'s leave request was auto-escalated after 48 hours without action.`,
        });
      }
      await notifyNextApprover(next, request);
    } else if (hoursInStage >= 24 && !request.reminder_sent_at) {
      const message = `Reminder: ${request.employee_name} has requested ${request.days || ""} day(s) leave. Still awaiting your approval.`;
      if (isHRStage || !request.current_approver_id) {
        await supabase.from("notifications").insert({ recipient_role: "HR", type: "leave_approval", is_read: false, title: "Leave Approval Reminder", message });
      } else {
        await supabase.from("notifications").insert({ recipient_employee_id: request.current_approver_id, type: "leave_approval", is_read: false, title: "Leave Approval Reminder", message });
      }
      await supabase.from("leave_requests").update({ reminder_sent_at: new Date().toISOString() }).eq("id", request.id);
    }
  }
}

function appendTrail(request, entry) {
  const trail = Array.isArray(request.approval_trail) ? request.approval_trail : [];
  return [...trail, entry];
}

async function logAudit(request, actorRole, actorName, actionType, stage, reason) {
  try {
    await supabase.from("audit_logs").insert({
      action_type: actionType,
      performed_by: actorName || actorRole,
      details: JSON.stringify({ leave_request_id: request.id, employee_code: request.employee_code, stage, reason: reason || null }),
    });
  } catch {
    // Audit logging must never block the actual approval/rejection.
  }
}

// Marks every day of an approved leave request as attendance_status='Leave'
// (locked so a ZKT re-sync won't overwrite it back to Absent). PayrollAutomation.jsx
// already reads this status into its leaveDaysUsed bucket — this is the one
// missing write-side step that makes leave flow into attendance/payroll automatically.
async function markAttendanceLeaveDays(request) {
  const from = request.from_date || request.start_date;
  const to = request.to_date || request.end_date || from;
  if (!request.employee_code || !from) return;
  const dates = [];
  for (let d = new Date(from + "T00:00:00"); d <= new Date(to + "T00:00:00"); d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }
  const { data: existing } = await supabase.from("attendance")
    .select("id, work_date").eq("employee_code", request.employee_code).in("work_date", dates);
  const existingByDate = Object.fromEntries((existing || []).map(r => [r.work_date, r.id]));

  await Promise.all(dates.map(work_date => {
    const update = {
      attendance_status: "Leave", status: "Leave", check_in: null, check_out: null,
      first_check_in: null, last_check_out: null, review_status: "Locked",
      is_manual_entry: true, manual_entry_by: "Leave Approval",
    };
    return existingByDate[work_date]
      ? supabase.from("attendance").update(update).eq("id", existingByDate[work_date])
      : supabase.from("attendance").insert({ employee_code: request.employee_code, work_date, attendance_date: work_date, ...update });
  }));
}

async function notifyApplicantApproved(request) {
  await supabase.from("notifications").insert({
    recipient_code: request.employee_code, type: "leave_approval", is_read: false,
    title: "Leave Approved",
    message: `${request.employee_name}'s ${request.leave_type} leave has been approved.`,
  });
}

async function notifyNextApprover(next, request) {
  const message = `${request.employee_name} has requested ${request.days || ""} day(s) leave. Awaiting your approval.`;
  if (next.toHR) {
    await supabase.from("notifications").insert({
      recipient_role: "HR", type: "leave_approval", is_read: false,
      title: "Leave Awaiting Approval", message,
    });
    return;
  }
  await supabase.from("notifications").insert({
    recipient_employee_id: next.approverId, type: "leave_approval", is_read: false,
    title: "Leave Awaiting Your Approval", message,
  });
}

async function notifyLegacyRole(role, request) {
  if (!role) return;
  await supabase.from("notifications").insert({
    recipient_role: role, related_branch: role === "Branch Manager" ? request.branch || null : null,
    type: "leave_approval", is_read: false,
    title: "Leave Awaiting Approval",
    message: `${request.employee_name}'s ${request.leave_type} leave is awaiting ${role} approval.`,
  });
}

// `request` must carry `.branch` (the requesting employee's branch, looked up
// by the caller) so legacy Branch Manager stage notifications can be scoped,
// and `.current_approver_id`/`.current_approver_code`/`.current_level`/
// `.approval_trail` for hierarchy-routed requests.
export async function approveLeaveStage(request, actorRole, actorName, { skip = false } = {}) {
  const currentStage = normalizeStage(request.status);
  const trail = appendTrail(request, {
    level: request.current_level, approver: actorName || actorRole,
    action: skip ? "Skipped" : "Approved", timestamp: new Date().toISOString(),
  });

  // Master's "Approve & Skip", or arriving at the HR-terminal stage (shared by
  // both chain types), finalizes the request immediately.
  if (skip || currentStage === "Pending HR Approval") {
    const { error } = await supabase.from("leave_requests").update({
      approved_by: actorName || actorRole, approved_at: new Date().toISOString(),
      ...toHRFields(), status: "Approved", approval_trail: trail,
    }).eq("id", request.id);
    if (error) throw error;
    await supabase.from("leave_approvals").insert({ leave_request_id: request.id, stage: currentStage, actor_role: actorRole, actor_name: actorName, action: skip ? "Skipped" : "Approved" });
    await markAttendanceLeaveDays(request);
    await notifyApplicantApproved(request);
    await logAudit(request, actorRole, actorName, skip ? "leave_skipped" : "leave_approved", currentStage);
    return "Approved";
  }

  if (isLegacyChainRequest(request)) {
    const target = legacyNextStage(currentStage);
    const { error } = await supabase.from("leave_requests")
      .update({ status: target, approved_by: actorName || actorRole, approved_at: new Date().toISOString() })
      .eq("id", request.id);
    if (error) throw error;
    await supabase.from("leave_approvals").insert({ leave_request_id: request.id, stage: currentStage, actor_role: actorRole, actor_name: actorName, action: "Approved" });
    if (target === "Approved") await notifyApplicantApproved(request);
    else await notifyLegacyRole(LEGACY_STAGE_APPROVER_ROLE[target], request);
    await logAudit(request, actorRole, actorName, "leave_approved", currentStage);
    return target;
  }

  // Hierarchy-routed: move to whoever the current approver reports to.
  const next = await resolveNextApprover(request.current_approver_id, request.employee_code);
  const payload = next.toHR ? toHRFields() : toApproverFields(next);
  const { error } = await supabase.from("leave_requests").update({
    ...payload, approved_by: actorName || actorRole, approved_at: new Date().toISOString(),
    stage_entered_at: new Date().toISOString(), reminder_sent_at: null, escalated_at: null,
    approval_trail: trail,
  }).eq("id", request.id);
  if (error) throw error;
  await supabase.from("leave_approvals").insert({ leave_request_id: request.id, stage: currentStage, actor_role: actorRole, actor_name: actorName, action: "Approved" });
  await notifyNextApprover(next, request);
  await logAudit(request, actorRole, actorName, "leave_approved", currentStage);
  return payload.status;
}

export async function rejectLeaveStage(request, actorRole, actorName, reason) {
  const currentStage = normalizeStage(request.status);
  const rejectStatus = `Rejected by ${actorRole}`;
  const trail = appendTrail(request, {
    level: request.current_level, approver: actorName || actorRole,
    action: "Rejected", timestamp: new Date().toISOString(), reason: reason || null,
  });

  const { error } = await supabase.from("leave_requests").update({
    status: rejectStatus, approved_by: actorName || actorRole, approved_at: new Date().toISOString(), rejection_reason: reason,
    current_approver_id: null, current_approver_name: null, current_approver_code: null, current_level: null,
    approval_trail: trail,
  }).eq("id", request.id);
  if (error) throw error;

  await supabase.from("leave_approvals").insert({ leave_request_id: request.id, stage: currentStage, actor_role: actorRole, actor_name: actorName, action: "Rejected", reason });
  await supabase.from("notifications").insert({
    recipient_code: request.employee_code, type: "leave_approval", is_read: false,
    title: "Leave Rejected",
    message: `${request.employee_name}'s ${request.leave_type} leave was rejected by ${actorName || actorRole}${reason ? `: ${reason}` : "."}`,
  });
  await logAudit(request, actorRole, actorName, "leave_rejected", currentStage, reason);
  return rejectStatus;
}

export async function fetchApprovalTrail(leaveRequestId) {
  const { data, error } = await supabase
    .from("leave_approvals")
    .select("*")
    .eq("leave_request_id", leaveRequestId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}
