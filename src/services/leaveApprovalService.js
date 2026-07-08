import { supabase } from "../lib/supabaseClient.js";

export const LEAVE_STAGES = [
  "Pending Supervisor Approval",
  "Pending Branch Manager Approval",
  "Pending HR Approval",
  "Approved",
];

const STAGE_APPROVER_ROLE = {
  "Pending Supervisor Approval": "HR",
  "Pending Branch Manager Approval": "Branch Manager",
  "Pending HR Approval": "HR",
};

// Older requests may still carry the previous two-stage status strings;
// map them onto the new chain so they keep working without a data migration.
const LEGACY_STAGE_MAP = {
  "Pending": "Pending Supervisor Approval",
  "Pending Supervisor": "Pending Supervisor Approval",
  "Pending HR": "Pending HR Approval",
};

export function normalizeStage(status) {
  return LEGACY_STAGE_MAP[status] || status;
}

function nextStage(currentStage) {
  const idx = LEAVE_STAGES.indexOf(currentStage);
  if (idx === -1 || idx >= LEAVE_STAGES.length - 1) return "Approved";
  return LEAVE_STAGES[idx + 1];
}

export function canActOnStage(role, status) {
  if (role === "Master") return true;
  const stage = normalizeStage(status);
  if (stage === "Pending Supervisor Approval") return role === "HR";
  if (stage === "Pending Branch Manager Approval") return role === "Branch Manager";
  if (stage === "Pending HR Approval") return role === "HR";
  return false;
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

async function notifyForStatus(request, newStatus) {
  if (newStatus === "Approved") {
    await supabase.from("notifications").insert({
      recipient_code: request.employee_code, type: "leave_approval", is_read: false,
      title: "Leave Approved",
      message: `${request.employee_name}'s ${request.leave_type} leave has been approved.`,
    });
    return;
  }
  const role = STAGE_APPROVER_ROLE[newStatus];
  if (!role) return;
  await supabase.from("notifications").insert({
    recipient_role: role,
    related_branch: role === "Branch Manager" ? request.branch || null : null,
    type: "leave_approval", is_read: false,
    title: "Leave Awaiting Approval",
    message: `${request.employee_name}'s ${request.leave_type} leave is awaiting ${role} approval.`,
  });
}

// `request` must carry `.branch` (the requesting employee's branch, looked up
// by the caller) so the Branch Manager stage notification can be scoped.
export async function approveLeaveStage(request, actorRole, actorName, { skip = false } = {}) {
  const currentStage = normalizeStage(request.status);
  const target = skip ? "Approved" : nextStage(currentStage);

  const { error } = await supabase.from("leave_requests")
    .update({ status: target, approved_by: actorName || actorRole, approved_at: new Date().toISOString() })
    .eq("id", request.id);
  if (error) throw error;

  await supabase.from("leave_approvals").insert({
    leave_request_id: request.id, stage: currentStage,
    actor_role: actorRole, actor_name: actorName, action: skip ? "Skipped" : "Approved",
  });
  await notifyForStatus(request, target);
  await logAudit(request, actorRole, actorName, skip ? "leave_skipped" : "leave_approved", currentStage);
  return target;
}

export async function rejectLeaveStage(request, actorRole, actorName, reason) {
  const currentStage = normalizeStage(request.status);
  const rejectStatus = `Rejected by ${actorRole}`;

  const { error } = await supabase.from("leave_requests")
    .update({ status: rejectStatus, approved_by: actorName || actorRole, approved_at: new Date().toISOString(), rejection_reason: reason })
    .eq("id", request.id);
  if (error) throw error;

  await supabase.from("leave_approvals").insert({
    leave_request_id: request.id, stage: currentStage,
    actor_role: actorRole, actor_name: actorName, action: "Rejected", reason,
  });
  await supabase.from("notifications").insert({
    recipient_code: request.employee_code, type: "leave_approval", is_read: false,
    title: "Leave Rejected",
    message: `${request.employee_name}'s ${request.leave_type} leave was rejected by ${actorRole}${reason ? `: ${reason}` : "."}`,
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
