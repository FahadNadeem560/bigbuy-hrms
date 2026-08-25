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

// Company policy caps a non-exempt employee at 4 unpaid weekly-off days per
// calendar month (see generate_employee_work_rosters -- Management/Warehouse
// are exempt from the cap server-side, but never fall short of it either).
const MONTHLY_WEEKLY_OFF_QUOTA = 4;

// Shared first pass: buckets rows into fixed calendar blocks and tallies
// what happened in each one. Both getWeeklyOffOverrideKeys (below) and
// getFullyWorkedBlockKeys derive their answer from the same bucketing so
// "what counted as this block's rest day" can never disagree between the
// deduction side and the earning side of payroll. Also tallies each
// employee's total real Weekly Off count across the whole month (not
// per-block) -- an operational reshuffle (asked to work through one week,
// given two off days back-to-back the next) can leave a block with no
// off day of its own even though the employee already received their full
// monthly quota elsewhere; getFullyWorkedBlockKeys needs the month total to
// tell that apart from a block that's genuinely short.
function bucketIntoBlocks(rows, { dateKey, statusKey, employeeKey, checkInKey, checkOutKey }) {
  const weeks = {};
  const monthlyWeeklyOffCount = {};
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
    const isFullBlock = blockStartDay + 6 <= daysInMonth;
    const empPart = employeeKey ? `${row[employeeKey]}|` : "";
    const weekKey = `${empPart}${fmtDate(blockStart)}`;
    const week = (weeks[weekKey] ||= {
      absentRows: [], hasRealWeeklyOff: false, hasLeave: false, hasAnyAbsent: false, hasWorkedGazettedHoliday: false,
      blockStart, blockEnd, empPart, isFullBlock,
    });
    // Real "Weekly Off" rows (roster-driven) count toward every day of the
    // block, not just Mon-Fri, so a genuine off day on any day still blocks
    // the override below -- without this, a block that already has its real
    // off day (e.g. a roster Thursday) could still get a *second* Mon-Fri
    // Absent day relabeled Weekly Off too, hiding a real absence.
    if (status === "Weekly Off") {
      week.hasRealWeeklyOff = true;
      monthlyWeeklyOffCount[empPart] = (monthlyWeeklyOffCount[empPart] || 0) + 1;
    } else if (status === "Leave") week.hasLeave = true;
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
    // A real Gazetted Holiday actually worked is independent of the
    // personal weekly-off quota -- it's a distinct kind of day off, so it
    // stays compensable even in a block where the monthly quota gate below
    // would otherwise suppress an EWD credit.
    if (row.is_gazetted_holiday && row[checkInKey] && row[checkOutKey]) week.hasWorkedGazettedHoliday = true;
  });
  return { weeks, monthlyWeeklyOffCount };
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
  const { weeks, monthlyWeeklyOffCount } = bucketIntoBlocks(rows, { dateKey, statusKey, employeeKey, checkInKey, checkOutKey });

  // Candidate blocks: no real Weekly Off of their own, and exactly one lone
  // Mon-Fri no-show that could be read as this block's rest day.
  const candidates = Object.values(weeks).filter((week) => {
    if (week.hasRealWeeklyOff || week.absentRows.length !== 1) return false;
    // Callers scope `rows` to a fixed query window (a payroll month, a
    // timesheet range, a settlement period). Fixed calendar blocks can't
    // cross a month boundary, but a caller's window can still start or end
    // mid-block (e.g. Final Settlement's arbitrary resignDate/lastDay, or a
    // custom Timesheet range) -- only override blocks fully contained in
    // [rangeStart, rangeEnd]; a window-truncated block is left as a real
    // Absent rather than guessed at.
    if (rangeStart || rangeEnd) {
      if ((rangeStart && fmtDate(week.blockStart) < rangeStart) || (rangeEnd && fmtDate(week.blockEnd) > rangeEnd)) return false;
    }
    return true;
  });

  // Same MONTHLY_WEEKLY_OFF_QUOTA that gates the EWD bonus in
  // getFullyWorkedBlockKeys also gates this forgiveness -- without it, an
  // employee who already took their full 4 real Weekly Offs elsewhere in
  // the month could still get every further lone absence forgiven too, one
  // per block, with no cap at all (confirmed against employee 1815, July
  // 2026: 4 real Thursday-off days already used, and a 5th lone Wednesday
  // absence in the trailing block was still forgiven -- 5 unpaid rest days
  // in one month with zero deduction). Earliest block first, so once an
  // employee is out of quota room the earlier lone absences are forgiven
  // and later ones fall back to a real, deducted Absent -- rather than
  // every candidate in the month racing for the same remaining slots in
  // Object.values() insertion order.
  candidates.sort((a, b) => a.blockStart - b.blockStart);

  const runningCount = { ...monthlyWeeklyOffCount };
  const overrideKeys = new Set();
  candidates.forEach((week) => {
    const used = runningCount[week.empPart] || 0;
    if (used >= MONTHLY_WEEKLY_OFF_QUOTA) return;
    runningCount[week.empPart] = used + 1;
    const row = week.absentRows[0];
    overrideKeys.add(`${week.empPart}${row[dateKey]}`);
  });
  return overrideKeys;
}

// A full 7-day block the employee worked straight through with no rest at
// all -- no real Weekly Off, no approved Leave, and not even a single
// forgiven Absent (see getWeeklyOffOverrideKeys above) -- earns one Extra
// Working Day. Deliberately mirrors the same block heuristic used for the
// deduction side instead of trusting attendance.extra_day_eligible, which
// is set server-side from employee_work_rosters.is_weekly_off -- the same
// roster getWeeklyOffOverrideKeys was built to route around because it
// isn't kept current. This keeps "what counts as this block's day off"
// consistent on both the earning and the deduction side of payroll, rather
// than trusting the roster for one and a behavior-based guess for the other.
// Restricted to full blocks (unlike the override above, which applies to a
// truncated month-end block too): "one day off per week" only implies a
// missed day off once a full week has actually elapsed -- a 3-day tail
// block at month-end (e.g. day 29-31) can't be said to owe a rest day yet,
// so it never earns a bonus for "no rest taken" even if fully worked.
//
// Also gated on the employee's monthly weekly-off quota (see
// MONTHLY_WEEKLY_OFF_QUOTA): if they've already received their full 4-a-month
// entitlement elsewhere -- even unevenly, e.g. worked through one week and
// were given 2 off days back-to-back the next to make up for it -- a block
// with no off day of its own was already compensated and doesn't separately
// earn a bonus. A block only earns EWD past the quota if it contains a real
// Gazetted Holiday actually worked, since that's compensable independent of
// the personal weekly-off quota.
//
// "Already received" counts a forgiven lone absence (getWeeklyOffOverrideKeys)
// the same as a real Weekly Off -- both are an unpaid rest day the employee
// didn't have to work, so both draw from the same quota. And the quota is
// consumed progressively as EWD blocks are credited within the same run, not
// just compared against the pre-existing real-Weekly-Off count -- otherwise
// two zero-rest blocks in the same month could each independently pass a
// static "not yet at quota" check and both get credited, blowing past what
// the remaining quota room actually allows. Confirmed against employee 2082,
// July 2026: 2 real Weekly Offs + 1 forgiven lone absence already used 3 of
// the 4-day quota, leaving room for exactly 1 more EWD -- it was earning 2
// because the gate only ever compared against the static real-Weekly-Off
// count (2), never the forgiven day, and never advanced between blocks.
// Returns a Set of block keys: one entry per block earned, `${blockStartDate}`
// (no employeeKey) or `${employee_code}|${blockStartDate}` (with
// employeeKey) -- there's no single "the" date to credit, so count
// `.size` (optionally after filtering by employee prefix) rather than
// looking up individual dates.
export function getFullyWorkedBlockKeys(rows, opts = {}) {
  const { dateKey = "work_date", statusKey = "attendance_status", employeeKey = null, checkInKey = "check_in", checkOutKey = "check_out", rangeStart = null, rangeEnd = null } = opts;
  const { weeks, monthlyWeeklyOffCount } = bucketIntoBlocks(rows, { dateKey, statusKey, employeeKey, checkInKey, checkOutKey });

  // Forgiven lone absences count toward the same quota as real Weekly Offs
  // (see comment above) -- tallied per employee from the same override set
  // getWeeklyOffOverrideKeys returns, so the two functions can never disagree
  // on how many rest days an employee has already been granted this month.
  const forgivenCount = {};
  getWeeklyOffOverrideKeys(rows, opts).forEach((key) => {
    const empPart = key.includes("|") ? key.slice(0, key.lastIndexOf("|") + 1) : "";
    forgivenCount[empPart] = (forgivenCount[empPart] || 0) + 1;
  });
  const runningCount = { ...monthlyWeeklyOffCount };
  Object.keys(forgivenCount).forEach((k) => { runningCount[k] = (runningCount[k] || 0) + forgivenCount[k]; });

  const candidates = Object.values(weeks).filter((week) => {
    if (!week.isFullBlock || week.hasRealWeeklyOff || week.hasLeave || week.hasAnyAbsent) return false;
    if (rangeStart || rangeEnd) {
      if ((rangeStart && fmtDate(week.blockStart) < rangeStart) || (rangeEnd && fmtDate(week.blockEnd) > rangeEnd)) return false;
    }
    return true;
  });
  // Earliest block first, so once the running count hits quota the earlier
  // zero-rest blocks are the ones credited and later ones fall out, rather
  // than depending on Object.values() insertion order.
  candidates.sort((a, b) => a.blockStart - b.blockStart);

  const blockKeys = new Set();
  candidates.forEach((week) => {
    const used = runningCount[week.empPart] || 0;
    if (used >= MONTHLY_WEEKLY_OFF_QUOTA && !week.hasWorkedGazettedHoliday) return;
    // A worked Gazetted Holiday is compensable independent of the quota, so
    // crediting it never consumes a slot other blocks are still competing for.
    if (!week.hasWorkedGazettedHoliday) runningCount[week.empPart] = used + 1;
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
