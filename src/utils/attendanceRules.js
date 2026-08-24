import { STAFF_LEVEL_POLICIES } from "../config/staffPolicies";
import { timeToMinutes, minutesToHours } from "./format";

export function getPolicyForLevel(level) {
  return STAFF_LEVEL_POLICIES[level] || STAFF_LEVEL_POLICIES["Non-Management"];
}

// Company policy: every employee gets one unpaid day off per week, taken
// Mon-Fri only (Sat/Sun are working days at this business, not eligible as
// an off day). Rather than relying on a pre-generated roster (which isn't
// kept current — see attendance_pipeline_gotchas), a "week"'s single Mon-Fri
// Absent day is treated as that week's off day instead of a real absence.
// Weeks with zero or more than one such Absent day are left as-is since the
// intended off day is ambiguous.
//
// "Week" here is a fixed calendar block within the month -- 1-7, 8-14,
// 15-21, 22-28, 29-end -- not a Monday-Sunday week. Blocks are pinned to the
// day-of-month by design (not the calendar's actual week alignment) so a
// block can never straddle a month boundary the way an ISO week can; every
// block is always fully contained in whatever month it's part of.
//
// Shared by Timesheet.jsx, PayrollAutomation.jsx and FinalSettlement.jsx so
// "Absent" always means the same thing — and costs the same deduction —
// everywhere it's read.
function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Shared first pass: buckets rows into fixed calendar blocks and tallies
// what happened in each one. Both getWeeklyOffOverrideKeys (below) and
// getFullyWorkedBlockKeys derive their answer from the same bucketing so
// "what counted as this block's rest day" can never disagree between the
// deduction side and the earning side of payroll.
function bucketIntoBlocks(rows, { dateKey, statusKey, employeeKey, checkInKey, checkOutKey }) {
  const weeks = {};
  (rows || []).forEach((row) => {
    const status = row[statusKey];
    const dateStr = row[dateKey];
    if (!dateStr) return;
    const d = new Date(`${dateStr}T00:00:00`);
    const dow = d.getDay(); // 0=Sun..6=Sat
    // Fixed 1-7/8-14/15-21/22-28/29-end block, computed purely from the
    // day-of-month -- e.g. day 22 -> block starts day 22 (floor((22-1)/7)*7+1
    // = 22); day 31 -> block starts day 29 (floor((31-1)/7)*7+1 = 29). The
    // last block is however many days remain in the month (3 in a 31-day
    // month, 1-2 in shorter months), never spilling into the next one.
    const dayOfMonth = d.getDate();
    const blockStartDay = Math.floor((dayOfMonth - 1) / 7) * 7 + 1;
    const blockStart = new Date(d.getFullYear(), d.getMonth(), blockStartDay);
    const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const blockEnd = new Date(d.getFullYear(), d.getMonth(), Math.min(blockStartDay + 6, daysInMonth));
    const empPart = employeeKey ? `${row[employeeKey]}|` : "";
    const weekKey = `${empPart}${fmtDate(blockStart)}`;
    const week = (weeks[weekKey] ||= {
      absentRows: [], hasRealWeeklyOff: false, hasLeave: false, hasAnyAbsent: false,
      blockStart, blockEnd, empPart,
    });
    // Real "Weekly Off" rows (roster-driven) count toward every day of the
    // block, not just Mon-Fri, so a genuine off day on any day still blocks
    // the override below -- without this, a block that already has its real
    // off day (e.g. a roster Thursday) could still get a *second* Mon-Fri
    // Absent day relabeled Weekly Off too, hiding a real absence.
    if (status === "Weekly Off") week.hasRealWeeklyOff = true;
    else if (status === "Leave") week.hasLeave = true;
    else if (status === "Absent") {
      week.hasAnyAbsent = true;
      // Only a true no-show (no check-in AND no check-out at all) on a
      // working day is eligible to be reinterpreted as the block's off day.
      // An employee who actually punched in/out but fell short of the
      // minimum-presence bar (marked "Absent" by classify_attendance_day
      // for insufficient hours, not for a no-show) genuinely came to work
      // that day and must not be relabeled Weekly Off -- that would hide a
      // real short-attendance day as if it were their day off.
      if (dow !== 0 && dow !== 6 && !row[checkInKey] && !row[checkOutKey]) week.absentRows.push(row);
    }
  });
  return weeks;
}

// rows: array of objects with at least a date field and a status field.
// employeeKey: pass null/undefined when rows are already scoped to one
// employee (e.g. FinalSettlement's per-employee fetch); pass the field name
// to group by when rows span multiple employees (e.g. payroll's month-wide
// fetch).
// Returns a Set of override keys: `${date}` (no employeeKey) or
// `${employee_code}|${date}` (with employeeKey) for rows that should read
// as "Weekly Off" instead of "Absent".
export function getWeeklyOffOverrideKeys(rows, opts = {}) {
  const { dateKey = "work_date", statusKey = "attendance_status", employeeKey = null, checkInKey = "check_in", checkOutKey = "check_out", rangeStart = null, rangeEnd = null } = opts;
  const weeks = bucketIntoBlocks(rows, { dateKey, statusKey, employeeKey, checkInKey, checkOutKey });

  const overrideKeys = new Set();
  Object.values(weeks).forEach((week) => {
    if (week.hasRealWeeklyOff || week.absentRows.length !== 1) return;
    // Callers scope `rows` to a fixed query window (a payroll month, a
    // timesheet range, a settlement period). Fixed calendar blocks can't
    // cross a month boundary, but a caller's window can still start or end
    // mid-block (e.g. Final Settlement's arbitrary resignDate/lastDay, or a
    // custom Timesheet range) -- only override blocks fully contained in
    // [rangeStart, rangeEnd]; a window-truncated block is left as a real
    // Absent rather than guessed at.
    if (rangeStart || rangeEnd) {
      if ((rangeStart && fmtDate(week.blockStart) < rangeStart) || (rangeEnd && fmtDate(week.blockEnd) > rangeEnd)) return;
    }
    const row = week.absentRows[0];
    overrideKeys.add(`${week.empPart}${row[dateKey]}`);
  });
  return overrideKeys;
}

// A block the employee worked straight through with no rest at all -- no
// real Weekly Off, no approved Leave, and not even a single forgiven Absent
// (see getWeeklyOffOverrideKeys above) -- earns one Extra Working Day.
// Deliberately mirrors the same block heuristic used for the deduction
// side instead of trusting attendance.extra_day_eligible, which is set
// server-side from employee_work_rosters.is_weekly_off -- the same roster
// getWeeklyOffOverrideKeys was built to route around because it isn't kept
// current. This keeps "what counts as this block's day off" consistent on
// both the earning and the deduction side of payroll, rather than trusting
// the roster for one and a behavior-based guess for the other.
// Returns a Set of block keys: one entry per block earned, `${blockStartDate}`
// (no employeeKey) or `${employee_code}|${blockStartDate}` (with
// employeeKey) -- there's no single "the" date to credit, so count
// `.size` (optionally after filtering by employee prefix) rather than
// looking up individual dates.
export function getFullyWorkedBlockKeys(rows, opts = {}) {
  const { dateKey = "work_date", statusKey = "attendance_status", employeeKey = null, checkInKey = "check_in", checkOutKey = "check_out", rangeStart = null, rangeEnd = null } = opts;
  const weeks = bucketIntoBlocks(rows, { dateKey, statusKey, employeeKey, checkInKey, checkOutKey });

  const blockKeys = new Set();
  Object.values(weeks).forEach((week) => {
    if (week.hasRealWeeklyOff || week.hasLeave || week.hasAnyAbsent) return;
    if (rangeStart || rangeEnd) {
      if ((rangeStart && fmtDate(week.blockStart) < rangeStart) || (rangeEnd && fmtDate(week.blockEnd) > rangeEnd)) return;
    }
    blockKeys.add(`${week.empPart}${fmtDate(week.blockStart)}`);
  });
  return blockKeys;
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
