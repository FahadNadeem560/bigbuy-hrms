import { STAFF_LEVEL_POLICIES } from "../config/staffPolicies";
import { timeToMinutes, minutesToHours } from "./format";

export function getPolicyForLevel(level) {
  return STAFF_LEVEL_POLICIES[level] || STAFF_LEVEL_POLICIES["Non-Management"];
}

export function processAttendancePunch(row) {
  const policy = getPolicyForLevel(row.level);
  const start = timeToMinutes(row.shiftStart || policy.defaultShiftStart);
  const end = timeToMinutes(row.shiftEnd || policy.defaultShiftEnd);
  const inMin = timeToMinutes(row.checkIn);
  const outMin = timeToMinutes(row.checkOut);
  const requiredMinutes = Number(policy.requiredHours || 10.5) * 60;
  if (inMin === null || outMin === null) return { ...row, status: "Absent", actualHours: 0, lateMinutes: 0, earlyOutMinutes: 0, overtimeHours: 0, shortHours: policy.requiredHours, approval: "Review" };
  const adjustedOut = outMin < inMin ? outMin + 24 * 60 : outMin;
  const actualMinutes = Math.max(0, adjustedOut - inMin);
  const lateMinutes = start !== null ? Math.max(0, inMin - start - Number(policy.graceMinutes || 0)) : 0;
  const earlyOutMinutes = end !== null ? Math.max(0, end - adjustedOut) : 0;
  const shortMinutes = Math.max(0, requiredMinutes - actualMinutes);
  const overtimeMinutes = policy.overtimeEligible ? Math.max(0, actualMinutes - Number(policy.overtimeAfterHours || policy.requiredHours) * 60) : 0;
  let status = "Present";
  if (lateMinutes > policy.halfDayLateMinutes || earlyOutMinutes > policy.halfDayEarlyOutMinutes) status = "Half Day";
  else if (lateMinutes > 0) status = "Late";
  return { ...row, policyLevel: policy.label, requiredHours: policy.requiredHours, actualHours: minutesToHours(actualMinutes), lateMinutes, earlyOutMinutes, shortHours: minutesToHours(shortMinutes), overtimeHours: minutesToHours(overtimeMinutes), status, approval: overtimeMinutes > 0 && policy.overtimeNeedsApproval ? "OT Pending" : "Auto", noticeDays: policy.noticeDays };
}
