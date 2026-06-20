import { STAFF_LEVEL_POLICIES } from "../config/staffPolicies";
import { timeToMinutes, minutesToHours } from "./format";

export function getPolicyForLevel(level) {
  return STAFF_LEVEL_POLICIES[level] || STAFF_LEVEL_POLICIES["Non-Management"];
}

// Detect shift from punch-in time.
// Returns { shift: 'A' | 'B' | 'HalfDay' | null, shiftStart: minutes, graceMinutes }
export function detectShift(checkIn) {
  const inMin = timeToMinutes(checkIn);
  if (inMin === null) return { shift: null, shiftStart: null, graceMinutes: 15 };

  const t1030 = 10 * 60 + 30; // 10:30
  const t1230 = 12 * 60 + 30; // 12:30
  const t1231 = 12 * 60 + 31; // 12:31
  const t1400 = 14 * 60;      // 14:00
  const shiftAStart = 11 * 60;  // 11:00
  const shiftBStart = 13 * 60;  // 13:00

  if (inMin >= t1030 && inMin <= t1230) {
    return { shift: "A", shiftStart: shiftAStart, graceMinutes: 15 };
  }
  if (inMin >= t1231 && inMin <= t1400) {
    return { shift: "B", shiftStart: shiftBStart, graceMinutes: 15 };
  }
  if (inMin > t1400) {
    return { shift: "HalfDay", shiftStart: null, graceMinutes: 0 };
  }
  // Punch in before 10:30 — treat as Shift A
  return { shift: "A", shiftStart: shiftAStart, graceMinutes: 15 };
}

// Check if a date string (YYYY-MM-DD) is a Friday
function isFriday(dateStr) {
  if (!dateStr) return false;
  return new Date(dateStr + "T00:00:00").getDay() === 5;
}

export function processAttendancePunch(row, policyOverrides = {}) {
  const policy = getPolicyForLevel(row.level);
  const friday = isFriday(row.date);

  // Shift auto-detection
  const { shift: detectedShift, shiftStart, graceMinutes: shiftGrace } = detectShift(row.checkIn);

  // Required hours — use Friday-specific hours if applicable
  let requiredHours;
  if (friday) {
    const fridayHours = policyOverrides.friday_hours ?? policy.fridayHours ?? 9;
    requiredHours = Number(fridayHours);
  } else {
    requiredHours = Number(policy.requiredHours || 10.5);
  }
  const requiredMinutes = requiredHours * 60;

  const inMin = timeToMinutes(row.checkIn);
  const outMin = timeToMinutes(row.checkOut);

  if (inMin === null || outMin === null) {
    return {
      ...row,
      detectedShift: detectedShift || null,
      status: "Absent",
      actualHours: 0,
      lateMinutes: 0,
      earlyOutMinutes: 0,
      overtimeHours: 0,
      shortHours: requiredHours,
      approval: "Review",
    };
  }

  const adjustedOut = outMin < inMin ? outMin + 24 * 60 : outMin;
  const actualMinutes = Math.max(0, adjustedOut - inMin);

  // Late calculation based on detected shift
  let lateMinutes = 0;
  if (detectedShift === "HalfDay") {
    lateMinutes = 0; // handled separately as half day
  } else if (shiftStart !== null) {
    const graceApplied = shiftGrace ?? Number(policy.graceMinutes || 0);
    lateMinutes = Math.max(0, inMin - shiftStart - graceApplied);
  } else {
    const start = timeToMinutes(policy.defaultShiftStart);
    if (start !== null) {
      lateMinutes = Math.max(0, inMin - start - Number(policy.graceMinutes || 0));
    }
  }

  const end = timeToMinutes(policy.defaultShiftEnd);
  const earlyOutMinutes = end !== null ? Math.max(0, end - adjustedOut) : 0;
  const shortMinutes = Math.max(0, requiredMinutes - actualMinutes);
  const overtimeMinutes = policy.overtimeEligible
    ? Math.max(0, actualMinutes - Number(policy.overtimeAfterHours || requiredHours) * 60)
    : 0;

  // Status calculation
  let status = "Present";

  if (detectedShift === "HalfDay") {
    const minHours = Number(policy.halfDayMinHours || 6);
    const actualHrs = actualMinutes / 60;
    status = actualHrs >= minHours ? "Half Day" : "Absent";
  } else if (lateMinutes > 0 && policy.halfDayLateMinutes && lateMinutes > policy.halfDayLateMinutes) {
    status = "Half Day";
  } else if (earlyOutMinutes > 0 && policy.halfDayEarlyOutMinutes && earlyOutMinutes > policy.halfDayEarlyOutMinutes) {
    status = "Half Day";
  } else if (lateMinutes > 0) {
    status = "Late";
  }

  return {
    ...row,
    detectedShift,
    policyLevel: policy.label,
    requiredHours,
    actualHours: minutesToHours(actualMinutes),
    lateMinutes,
    earlyOutMinutes,
    shortHours: minutesToHours(shortMinutes),
    overtimeHours: minutesToHours(overtimeMinutes),
    status,
    approval: overtimeMinutes > 0 && policy.overtimeNeedsApproval ? "OT Pending" : "Auto",
    noticeDays: policy.noticeDays,
  };
}
