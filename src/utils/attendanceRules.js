import { STAFF_LEVEL_POLICIES } from "../config/staffPolicies";
import { timeToMinutes, minutesToHours } from "./format";

export function getPolicyForLevel(level) {
  return STAFF_LEVEL_POLICIES[level] || STAFF_LEVEL_POLICIES["Non-Management"];
}

// Company policy: every employee gets one unpaid day off per week, taken
// Mon-Fri only (Sat/Sun are working days at this business, not eligible as
// an off day). Rather than relying on a pre-generated roster (which isn't
// kept current — see attendance_pipeline_gotchas), a week's single Mon-Fri
// Absent day is treated as that week's off day instead of a real absence.
// Weeks with zero or more than one such Absent day are left as-is since the
// intended off day is ambiguous.
//
// Shared by Timesheet.jsx, PayrollAutomation.jsx and FinalSettlement.jsx so
// "Absent" always means the same thing — and costs the same deduction —
// everywhere it's read.
function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// rows: array of objects with at least a date field and a status field.
// employeeKey: pass null/undefined when rows are already scoped to one
// employee (e.g. FinalSettlement's per-employee fetch); pass the field name
// to group by when rows span multiple employees (e.g. payroll's month-wide
// fetch).
// Returns a Set of override keys: `${date}` (no employeeKey) or
// `${employee_code}|${date}` (with employeeKey) for rows that should read
// as "Weekly Off" instead of "Absent".
export function getWeeklyOffOverrideKeys(rows, { dateKey = "work_date", statusKey = "attendance_status", employeeKey = null, checkInKey = "check_in", checkOutKey = "check_out", rangeStart = null, rangeEnd = null } = {}) {
  const weeks = {};
  (rows || []).forEach((row) => {
    const status = row[statusKey];
    const dateStr = row[dateKey];
    if (!dateStr) return;
    const d = new Date(`${dateStr}T00:00:00`);
    const dow = d.getDay(); // 0=Sun..6=Sat
    // Real "Weekly Off" rows (roster-driven) count toward every day of the
    // week, not just Mon-Fri, so a genuine off day on any day still blocks
    // the override below -- without this, a week that already has its real
    // off day (e.g. a roster Thursday) could still get a *second* Mon-Fri
    // Absent day relabeled Weekly Off too, hiding a real absence.
    const isoDow = dow === 0 ? 7 : dow; // 1=Mon..7=Sun
    const monday = new Date(d);
    monday.setDate(d.getDate() - (isoDow - 1));
    const empPart = employeeKey ? `${row[employeeKey]}|` : "";
    const weekKey = `${empPart}${fmtDate(monday)}`;
    const week = (weeks[weekKey] ||= { absentRows: [], hasRealWeeklyOff: false, monday });
    // Only a true no-show (no check-in AND no check-out at all) is eligible
    // to be reinterpreted as the week's off day. An employee who actually
    // punched in/out but fell short of the minimum-presence bar (marked
    // "Absent" by classify_attendance_day for insufficient hours, not for a
    // no-show) genuinely came to work that day and must not be relabeled
    // Weekly Off -- that would hide a real short-attendance day as if it
    // were their day off.
    if (status === "Weekly Off") week.hasRealWeeklyOff = true;
    else if (status === "Absent" && dow !== 0 && dow !== 6 && !row[checkInKey] && !row[checkOutKey]) week.absentRows.push(row);
  });

  const overrideKeys = new Set();
  Object.values(weeks).forEach((week) => {
    if (week.hasRealWeeklyOff || week.absentRows.length !== 1) return;
    // Callers scope `rows` to a fixed query window (a payroll month, a
    // timesheet range, a settlement period). A week straddling that
    // window's edge -- e.g. the last week of the month, whose real off day
    // falls a day or two into next month -- never gets its real "Weekly
    // Off" row fetched at all, so hasRealWeeklyOff above can't see it and
    // this week's lone Mon-Fri absence looks (wrongly) like the only
    // candidate for the off day. Rather than guess, only override weeks
    // fully contained in [rangeStart, rangeEnd]; a boundary-truncated week
    // is left as a real Absent.
    if (rangeStart || rangeEnd) {
      const sunday = new Date(week.monday);
      sunday.setDate(week.monday.getDate() + 6);
      if ((rangeStart && fmtDate(week.monday) < rangeStart) || (rangeEnd && fmtDate(sunday) > rangeEnd)) return;
    }
    const row = week.absentRows[0];
    const empPart = employeeKey ? `${row[employeeKey]}|` : "";
    overrideKeys.add(`${empPart}${row[dateKey]}`);
  });
  return overrideKeys;
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
