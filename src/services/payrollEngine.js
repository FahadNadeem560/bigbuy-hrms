import { supabase } from "../lib/supabaseClient.js";
import { calculatePayrollForEmployee, getWorkingDaysInMonth, OT_SHORT_MIN_HOURS } from "../utils/payrollRules.js";
import { getWeeklyOffOverrideKeys, getFullyWorkedBlockKeys, getUnearnedRestDayKeys, isOffDayCapExempt } from "../utils/attendanceRules.js";
import { calcRemainingLeaveBalance } from "../utils/leaveBalance.js";

// The monthly payroll calculation, lifted verbatim out of PayrollAutomation.jsx
// so Final Settlement can run the exact same math for the months a leaver was
// never paid for, instead of maintaining a second, weaker "count present days"
// model that drifts from this one (see the Final Settlement Scenarios doc).
//
// buildPayrollRows() closed over exactly three pieces of component state --
// month, employees and loans -- and fetched everything else itself, so the
// extraction is a straight parameterisation. The only behavioural addition is
// applySideEffects: this function WRITES (the Management leave-first offset
// creates leave_requests / leave_approvals rows), and a settlement running it
// over past months must not manufacture duplicate auto-adjust leave. Payroll
// itself leaves the flag at its default true, so nothing about Generate /
// Refresh changes.

export function roundN(v, n) { const f = 10 ** n; return Math.round(Number(v || 0) * f) / f; }

// A loan only deducts from a payroll month that falls on or after the month
// its repayment starts (loans.start_date). Guards against a loan disbursed
// this month, future-dated, or with a typo'd far-future start_date deducting
// from an earlier month that gets refreshed.
//
// Deliberately does NOT stop at start_date + repayment_months: a loan that
// fell behind schedule (a skipped/short month) still has an outstanding
// balance to collect, and loans.outstanding_balance isn't reliably kept in
// sync to trust as the stop signal. Ending a loan is an explicit action
// (Clear / Early Settle / status change) -- see loanService.js.
export function loanInstallmentDue(loan, payrollMonth) {
  if (!loan) return false;
  const startMonth = String(loan.start_date || "").slice(0, 7)
    || String(loan.disbursed_at || loan.granted_date || loan.loan_date || loan.created_at || "").slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(startMonth)) return true; // no usable start — behave as before
  return payrollMonth >= startMonth;
}

// A full month's attendance across every employee is ~11,000 rows (July
// 2026) — PostgREST silently caps an unranged .select("*") well below
// that, so a plain query here was quietly truncating whichever employees
// didn't fit in the first page, undercounting their present/absent days
// and worked hours (confirmed: employee 1169 showed 139 worked hours in
// payroll vs. a real 290.28 in the Timesheet/DB). Page through with
// .range() until a page comes back short.
//
// The ORDER BY *must* be unique across the whole result set: ~268 rows
// share every work_date value, so ordering by work_date alone leaves the
// ~268 rows for a given date in an arbitrary order that Postgres does not
// keep stable between the separate paginated requests. Any page boundary
// landing inside a date (every boundary does, at ~268/day) then drops or
// duplicates rows — an employee loses a day (missing-day safety net docks
// a phantom absent) or gains one (inflated worked hours / present_days,
// seen as high as 32 on a 31-day month). Tie-break on the uuid PK so the
// order is total and identical on every page fetch. Confirmed against
// July 2026: ~150 of 276 payroll rows had a worked-hours / absent-day
// count that didn't reconcile with the (unchanged) attendance rows.
async function fetchAllAttendanceForMonth(fromDate, toDate, scopeCodes = null) {
  const pageSize = 1000;
  let all = [];
  let from = 0;
  while (true) {
    let q = supabase.from("attendance").select("*")
      .gte("work_date", fromDate).lte("work_date", toDate);
    if (scopeCodes?.length) q = q.in("employee_code", scopeCodes);
    const { data, error } = await q
      .order("work_date", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    all = all.concat(data || []);
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

// scopeCodes: restrict every per-employee query to these employee codes.
// A whole-company payroll run leaves it null and reads the month in bulk, but
// a single leaver's Final Settlement was pulling the entire company's
// attendance (8k+ rows, paged), every tax setting, every leave balance and
// the *whole* leave_requests table -- once per month in the settlement
// window -- just to cost one person. That is what made the Settlement
// Calculator take tens of seconds, on every keystroke in a date field.
export async function computePayrollForMonth({ month, employees, loans, applySideEffects = true, scopeCodes = null }) {
  const scoped = (q) => (scopeCodes?.length ? q.in("employee_code", scopeCodes) : q);
  const fromDate = month + "-01";
  const [y, m] = month.split("-").map(Number);
  const toDate = `${y}-${String(m).padStart(2, "0")}-${new Date(y, m, 0).getDate()}`;
  const numberOfWorkingDays = getWorkingDaysInMonth(y, m);

  // Standing Permissions exemptions (employee level). classify_attendance_day
  // keeps a Half Day / Late off an exempt employee's day, but a row
  // classified before the flag was set -- OR a single-punch day, which
  // classifies as "Half Day" + review BEFORE the exempt branch even runs --
  // can still carry the deductible status. Combined with the per-day
  // attendance.half_day_exempt / late_exempt flags (Timesheet toggle) in
  // isHalfDayExempt/isLateExempt below, this is the payroll-side backstop so
  // the deduction is dropped regardless of which flag was set.
  const lateExemptCodes = new Set((employees || []).filter(e => e.late_exempt).map(e => e.employee_code));
  const halfDayExemptCodes = new Set((employees || []).filter(e => e.half_day_exempt).map(e => e.employee_code));
  const isHalfDayExempt = (code, row) => halfDayExemptCodes.has(code) || row?.half_day_exempt === true;
  const isLateExempt = (code, row) => lateExemptCodes.has(code) || row?.late_exempt === true;

  const [attRaw, { data: finesData }, { data: shortagesData }, { data: advancesData }, { data: oneTimeAdjData }, { data: groupsData }, { data: loanReliefData }, { data: taxSlabsData }, { data: taxSettingsData }, { data: leaveBalanceRows }, { data: approvedLeaveRequests }] = await Promise.all([
    fetchAllAttendanceForMonth(fromDate, toDate, scopeCodes),
    supabase.from("fines").select("*").eq("payroll_month", month).eq("status", "Approved"),
    supabase.from("shortages").select("*").eq("payroll_month", month).eq("status", "Approved"),
    supabase.from("advances").select("*").eq("advance_month", month).in("status", ["Issued", "Deducted"]),
    supabase.from("one_time_adjustments").select("*").eq("payroll_month", month).eq("status", "Approved"),
    supabase.from("staff_eligibility_groups").select("code, extra_days_eligible, overtime_eligible, gazetted_holiday_eligible, late_penalty_after_count, late_penalty_days"),
    // Approved Skip Month requests for this month -- exclude these loans'
    // deduction below (LoanManagement.jsx's Skip Month / Approval Queue).
    supabase.from("loan_changes").select("loan_id").eq("change_type", "relief").eq("status", "Approved").eq("effective_month", month),
    supabase.from("tax_slabs").select("*").order("min_amount"),
    // Tax Management page (TaxManagement.jsx) lets Master/Finance set a
    // per-employee Manual amount or Exempt status -- this must override
    // the auto slab calculation below, not just be a display-only setting.
    scoped(supabase.from("employee_tax_settings").select("*")),
    // Leave-first offset for Management (see the loop below) needs each
    // employee's opening balance and every already-Approved leave request.
    scoped(supabase.from("leaves").select("employee_code, employee_id, opening_balance")),
    scoped(supabase.from("leave_requests").select("employee_code, leave_type, days, reason").eq("status", "Approved")),
  ]);
  const skippedLoanIds = new Set((loanReliefData || []).map(r => r.loan_id));
  const groupByCode = Object.fromEntries((groupsData || []).map(g => [g.code, g]));
  const taxSettingByEmp = Object.fromEntries((taxSettingsData || []).map(t => [t.employee_code, t]));
  const leaveBalanceByEmp = Object.fromEntries(
    (leaveBalanceRows || []).map(b => [b.employee_code || b.employee_id, b])
  );
  const AUTO_LEAVE_OFFSET_TAG = `[Auto-Adjust ${month}]`;
  const approvedLeaveByEmp = {};
  (approvedLeaveRequests || []).forEach(r => {
    const c = r.employee_code;
    if (!approvedLeaveByEmp[c]) approvedLeaveByEmp[c] = [];
    // Excludes this exact month's own prior auto-adjustment run, if any --
    // otherwise a second Refresh Payroll click would see its own earlier
    // offset as "already used" and compound it smaller each time instead
    // of recomputing fresh against the real, current balance.
    if (!(r.reason || "").includes(AUTO_LEAVE_OFFSET_TAG)) approvedLeaveByEmp[c].push(r);
  });

  // Days after a leaver's last working day are not employment days at all.
  // Two separate things went wrong while they were left in:
  //   1. attendance can carry stale post-departure rows (Present / Weekly
  //      Off), which pay out as if the employee were still on strength;
  //   2. the missing-day scan further down stops AT the last working day, so
  //      the days after it -- which have no attendance row -- were never
  //      charged to anyone. A resignation on the 6th drew 29/30 of a full
  //      salary (confirmed: employee 1934, July 2026 -- last working day
  //      07-Jul, paid 24,167 of 25,000 for six days worked).
  // Rows outside the span are dropped here, before any aggregation, and the
  // unworked tail is charged as postExitUnpaidDays below.
  const exitDayByEmp = Object.fromEntries((employees || [])
    .filter(e => ["Resigned", "Terminated"].includes(e.status)
      && e.last_working_day && e.last_working_day >= fromDate && e.last_working_day <= toDate)
    .map(e => [e.employee_code, e.last_working_day]));
  const att = (attRaw || []).filter(a => {
    const exit = exitDayByEmp[a.employee_code];
    return !exit || a.work_date <= exit;
  });

  // Every employee gets one unpaid Mon-Fri day off per week; a week's lone
  // Mon-Fri Absent day is that off day, not a real absence (see
  // getWeeklyOffOverrideKeys) — otherwise absentDeduction in payrollRules.js
  // would wrongly dock a day's pay for it. Applied here so it's consistent
  // with the same rule on the Timesheet and Final Settlement pages.
  // Per-employee rest-day entitlement: a flat 4 a month, except for a
  // Management / Warehouse employee, who keeps every occurrence of their fixed
  // off day and so is owed 5 in a month their off-day falls 5 times (see
  // monthlyOffDayQuota / isOffDayCapExempt, which mirror the server-side
  // is_exempt rule in generate_employee_work_rosters).
  const weeklyOffDayByEmp = Object.fromEntries((employees || [])
    .map(e => [e.employee_code, e.weekly_off_day]));
  const offDayCapExemptByEmp = Object.fromEntries((employees || [])
    .map(e => [e.employee_code, isOffDayCapExempt(e)]));
  // Per-employee tenure window. Used by both the forgiveness side below and
  // the EWD side further down: a month the employee was only employed part of
  // earns only part of the rest-day quota, so a leaver's stub month can't
  // spend a whole month's forgiveness room on its no-shows.
  // joining_date / last_working_day are only trusted when they actually fall
  // in this month, mirroring the proration guard further down (a stale/rehire
  // date from a later stint would otherwise wrongly shorten every month).
  const employmentBounds = Object.fromEntries((employees || []).map(e => [
    e.employee_code,
    {
      start: (e.joining_date && e.joining_date >= fromDate && e.joining_date <= toDate) ? e.joining_date : null,
      end: (["Resigned", "Terminated"].includes(e.status) && e.last_working_day && e.last_working_day >= fromDate && e.last_working_day <= toDate) ? e.last_working_day : null,
    },
  ]));
  const weeklyOffOverrides = getWeeklyOffOverrideKeys(att || [], { employeeKey: "employee_code", rangeStart: fromDate, rangeEnd: toDate, employmentBounds, weeklyOffDayByEmp, offDayCapExemptByEmp });

  // The other direction: a roster Weekly Off in a block the employee never
  // worked (and took no leave or public holiday in) is not a rest day they
  // earned, so it is charged like any other unworked day instead of quietly
  // paying out. Without this, someone absent all month still drew their four
  // weekly offs -- see getUnearnedRestDayKeys.
  const unearnedRestDays = getUnearnedRestDayKeys(att || [], { employeeKey: "employee_code", rangeStart: fromDate, rangeEnd: toDate });

  // Extra Working Days: a block worked straight through with no rest at
  // all (see getFullyWorkedBlockKeys) -- replaces trusting attendance.
  // extra_day_eligible, which was set from employee_work_rosters (the
  // same roster the override above already treats as unreliable), so
  // "day off" means the same thing on both the earning and deduction
  // side of payroll instead of trusting the roster for one and a
  // behavior-based guess for the other.
  // employmentBounds (built above) also stops a block that predates a
  // mid-month joiner -- or follows a mid-month leaver -- being credited an
  // EWD just because the days outside their tenure have no attendance row.
  const fullyWorkedBlocks = getFullyWorkedBlockKeys(att || [], { employeeKey: "employee_code", rangeStart: fromDate, rangeEnd: toDate, employmentBounds, weeklyOffDayByEmp, offDayCapExemptByEmp });

  // Attendance is generated daily for every employee regardless of
  // resignation status (confirmed: a resigned employee's post-departure
  // days show up as real "Absent"/"Weekly Off" rows), so absentDeduction
  // below already prorates a mid-month resignation correctly on its own.
  // This tracks which dates actually have a row per employee so the
  // resigned-employee proration further down only fills a *genuine* gap
  // (e.g. a ZKT export outage) instead of double-deducting days that are
  // already accounted for.
  const attDatesByEmp = {};
  (att || []).forEach(a => {
    const c = a.employee_code;
    if (!attDatesByEmp[c]) attDatesByEmp[c] = new Set();
    attDatesByEmp[c].add(a.work_date);
  });

  // Aggregate attendance per employee
  const attByEmp = {};
  (att || []).forEach(a => {
    const c = a.employee_code;
    if (!attByEmp[c]) attByEmp[c] = {
      presentDays: 0, absentDays: 0, halfDays: 0, weeklyOffDays: 0, ghDays: 0,
      lateCount: 0, otHours: 0, extraWorkingDays: 0, ghWorkedDaysRaw: 0, leaveDaysUsed: 0, numberOfWorkingDays,
      workedHours: 0, requiredHours: 0, shortHourFractionalDays: 0, netShortHours: 0,
    };
    const isOverriddenOff = weeklyOffOverrides.has(`${c}|${a.work_date}`);
    const rawStatus = a.attendance_status || a.status || "";
    // A rest day the employee never earned reads as what it actually was: a
    // day they did not come in. Forgiveness and this can never collide -- a
    // forgiven absence requires a worked day in the block, which is exactly
    // what an unearned rest day's block lacks.
    const isUnearnedRest = rawStatus === "Weekly Off" && unearnedRestDays.has(`${c}|${a.work_date}`);
    const s = isOverriddenOff ? "Weekly Off" : (isUnearnedRest ? "Absent" : rawStatus);
    // Gazetted Holiday actually worked -- a working status on a holiday row.
    // Group/individual eligibility is applied later where `group` is known;
    // here we just count the days. Half Day worked = half a day.
    if (a.is_gazetted_holiday && !isOverriddenOff) {
      if (s === "Present" || s === "Late" || s === "Early Out" || s === "Short Hours") attByEmp[c].ghWorkedDaysRaw += 1;
      else if (s === "Half Day" || s === "HalfDay") attByEmp[c].ghWorkedDaysRaw += 0.5;
    }
    if (s === "Absent") { attByEmp[c].absentDays++; }
    else if (s === "Weekly Off") { attByEmp[c].weeklyOffDays++; }
    else if (s === "Gazetted Holiday") { attByEmp[c].ghDays++; }
    else if (s === "Half Day" || s === "HalfDay") {
      attByEmp[c].presentDays++;
      // Half-day-exempt (employee flag or per-day toggle): counts as a
      // worked day, never docked.
      if (!isHalfDayExempt(c, a)) attByEmp[c].halfDays++;
    }
    else if (s === "Leave") { attByEmp[c].leaveDaysUsed++; }
    else {
      // Present / Late / Early Out / Short Hours (Management) all count as
      // a worked day here.
      attByEmp[c].presentDays++;
      // Management/Admin has no half-day/late rules -- a day short of its
      // required hours is "Short Hours" instead, tracked as a fractional
      // day (short_hours / that day's required_hours). payrollRules.js
      // turns the month's total into a proportional deduction -- but only
      // when the month's NET shortfall (see netShortHours below) clears
      // OT_SHORT_MIN_HOURS, so scattered sub-threshold short days and days
      // run over cancel out instead of every stray minute being docked.
      if (s === "Short Hours" && Number(a.required_hours || 0) > 0) {
        attByEmp[c].shortHourFractionalDays += Number(a.short_hours || 0) / Number(a.required_hours);
      }
    }
    // Late penalty counts only days whose final status is "Late" -- a day
    // that also had lateness but landed as Half Day / Absent / Early Out is
    // already penalized on its own path, and counting its incidental
    // late_minutes toward the escalating late penalty too is double-dipping
    // (confirmed: employee 1088, July 2026 -- 11 "Late" days but 13 rows
    // with late_minutes > 0, because 2 Half Day rows were also a few min
    // late; floor(13/3)=4 penalty days instead of floor(11/3)=3). This also
    // makes the deduction match the "Late" count shown on Timesheet.
    // Late-exempt employees never reach "Late" status, so the flag check is
    // a redundant-but-cheap guard.
    if (!isLateExempt(c, a) && s === "Late" && Number(a.late_minutes || 0) > 0) attByEmp[c].lateCount++;
    // A day the employee wasn't actually rostered to work owed nothing
    // toward the OT-eligibility denominator, and equally must not *feed*
    // it: a Weekly Off (JS-inferred or real roster-driven) because no work
    // was expected at all, an Absent day because that shortfall is already
    // penalized on its own via absentDeduction below (dailyRate *
    // absentDays), a Gazetted Holiday because it's a paid day off. Counting
    // such a day's required_hours would inflate Required Hours and wipe out
    // the month's real OT a second time; counting its worked_hours (a
    // partial punch on a holiday, or a sub-minimum shift that classified as
    // Absent -- both still carry hours on the row) hands the employee free
    // OT credit for hours worked on a day nothing was owed, while they're
    // ALSO being docked for it. So worked and required are gated together
    // and net out to zero for these days. Matches Timesheet's
    // totalWorkedHours / rowRequiredHours. Confirmed: employee 1441 July
    // 2026 (required side -- real OT was being zeroed); August 2026 ~180h
    // of worked_hours sat on Absent / Weekly Off / Gazetted Holiday rows
    // and leaked into the OT pool (worked side).
    if (!isOverriddenOff && s !== "Weekly Off" && s !== "Absent" && s !== "Gazetted Holiday") {
      attByEmp[c].requiredHours += Number(a.required_hours || 0);
      attByEmp[c].workedHours += Number(a.worked_hours || 0);
    }
  });

  // One entry per block earned (see getFullyWorkedBlockKeys) -- every
  // employee credited here already has an attByEmp entry, since a block
  // can only be credited from rows that were just aggregated above.
  fullyWorkedBlocks.forEach(key => {
    const code = key.slice(0, key.indexOf("|"));
    if (attByEmp[code]) attByEmp[code].extraWorkingDays++;
  });

  // OT is the month's NET excess (total worked - total required), never a
  // sum of each day's positive overage -- that paid OT for good days while
  // short days were docked separately even when the month finished behind
  // overall (employee 1169, July 2026: required 297 / worked 290 / OT 0).
  // Company policy (2026-08): the net must reach OT_SHORT_MIN_HOURS before
  // any OT is payable, and OT is then paid rounded DOWN to the nearest
  // half hour -- routine few-minute daily drift shouldn't accumulate.
  // netShortHours is the mirror on the deduction side: the month's net
  // shortfall, but only once past the same threshold. It's a GATE, not the
  // charged amount -- payrollRules still sizes the Management "Short Hours"
  // deduction from shortHourFractionalDays (the per-day model), it just
  // suppresses it entirely until the net shortfall clears the threshold.
  // (A net *shortfall* for OT-eligible staff needs nothing here -- it's
  // already covered by their Late / Half Day / absent lines.)
  Object.values(attByEmp).forEach(a => {
    const net = roundN(a.workedHours - a.requiredHours, 2);
    a.otHours = net >= OT_SHORT_MIN_HOURS ? Math.floor(net * 2) / 2 : 0;
    a.netShortHours = net <= -OT_SHORT_MIN_HOURS ? roundN(-net, 2) : 0;
  });

  // Aggregate fines/shortages/advances per employee
  const fineByEmp = {};
  (finesData || []).forEach(f => {
    fineByEmp[f.employee_code] = (fineByEmp[f.employee_code] || 0) + Number(f.amount || 0);
  });
  const shortageByEmp = {};
  (shortagesData || []).forEach(s => {
    shortageByEmp[s.employee_code] = (shortageByEmp[s.employee_code] || 0) + Number(s.amount || 0);
  });
  const advanceByEmp = {};
  (advancesData || []).forEach(a => {
    advanceByEmp[a.employee_code] = (advanceByEmp[a.employee_code] || 0) + Number(a.issued_amount || 0);
  });

  // One-Time Adjustments (OneTimeAdjustments.jsx / Approval Queue) were
  // approved but never actually fed into payroll anywhere -- this was the
  // missing last step. Mapped onto the same fields the equivalent
  // dedicated pages (Fines/Shortages) already feed, additively (a Penalty
  // one-time-adjustment adds on top of, not instead of, the fines table).
  const ONE_TIME_ADJ_FIELD = {
    Commission: "commissionAddOn", Arrears: "arrears", Incentive: "otherEarnings",
    Other: "otherEarnings", Deduction: "otherDeductions", Shortage: "shortageDeduction",
    Penalty: "fineDeduction",
  };
  const oneTimeAdjByEmp = {};
  (oneTimeAdjData || []).forEach(a => {
    const field = ONE_TIME_ADJ_FIELD[a.type];
    if (!field) return;
    let amt = Number(a.amount || 0);
    if (a.calc_mode === "As Per Attendance") {
      const empAtt = attByEmp[a.employee_code];
      const workDays = empAtt?.numberOfWorkingDays || numberOfWorkingDays;
      const presentDays = empAtt?.presentDays || 0;
      amt = workDays > 0 ? Math.round((amt * presentDays) / workDays) : 0;
    }
    if (!oneTimeAdjByEmp[a.employee_code]) oneTimeAdjByEmp[a.employee_code] = {};
    oneTimeAdjByEmp[a.employee_code][field] = (oneTimeAdjByEmp[a.employee_code][field] || 0) + amt;
  });

  const rows = await Promise.all(employees.map(async emp => {
    const group = groupByCode[emp.eligibility_group];
    const extraDaysEligible = emp.extra_days_eligible != null ? !!emp.extra_days_eligible : !!group?.extra_days_eligible;
    // Individual ot_eligible override (Permissions) wins; else the
    // eligibility group's overtime_eligible default. Previously neither was
    // read here and OT fell through to the static per-staff-level policy.
    const overtimeEligible = emp.ot_eligible != null ? !!emp.ot_eligible : !!group?.overtime_eligible;
    // Same resolution for the "worked a gazetted holiday" +1-day credit.
    const ghEligible = emp.gazetted_holiday_eligible != null ? !!emp.gazetted_holiday_eligible : !!group?.gazetted_holiday_eligible;
    const empMapped = {
      id: emp.employee_code, name: emp.full_name, branch: emp.branch,
      dept: emp.department, level: emp.staff_level || "Non-Management",
      salary: emp.salary || 0, status: emp.status, joiningDate: emp.joining_date,
      isAttendanceExempt: !!emp.is_attendance_exempt,
      extraDaysEligible,
      overtimeEligible,
      // Manually entered by HR via Employees > EOBI (0 by default -- not
      // enrolled, nothing deducted). See payrollRules.js.
      eobiMonthlyDeduction: Number(emp.eobi_monthly_deduction || 0),
      // Live late-deduction rule from the employee's real eligibility
      // group (Policy Settings page) — overrides the static per-level
      // default in payrollRules.js when present.
      latePolicyOverride: group ? {
        latePenaltyCount: group.late_penalty_after_count,
        latePenaltyDays: group.late_penalty_days,
      } : undefined,
    };
    const oneTimeAdj = oneTimeAdjByEmp[emp.employee_code] || {};
    const adj = {
      ...(attByEmp[emp.employee_code] || { numberOfWorkingDays }),
      // Holiday-worked +1-day credit only for GH-eligible groups/employees.
      ghWorkedDays: ghEligible ? Number(attByEmp[emp.employee_code]?.ghWorkedDaysRaw || 0) : 0,
      commissionAddOn: oneTimeAdj.commissionAddOn || 0,
      fineDeduction: (fineByEmp[emp.employee_code] || 0) + (oneTimeAdj.fineDeduction || 0),
      shortageDeduction: (shortageByEmp[emp.employee_code] || 0) + (oneTimeAdj.shortageDeduction || 0),
      advanceDeduction: advanceByEmp[emp.employee_code] || 0,
      arrears: oneTimeAdj.arrears || 0,
      otherEarnings: oneTimeAdj.otherEarnings || 0,
      otherDeductions: oneTimeAdj.otherDeductions || 0,
    };
    // Attendance normally carries a real Present/Absent/Weekly Off row for
    // every day of an employee's employment span within the month, so
    // absentDeduction (dailyRate * absentDays) already prorates a
    // mid-month resignation correctly via attByEmp above -- adding to
    // absentDays again here would double-deduct. This block does two
    // things: (1) fills days *inside that span* that have NO attendance row
    // at all (e.g. a ZKT export outage swallowed them, or attendance
    // generation never ran), as a safety net so a genuine gap doesn't
    // silently pay out in full; (2) charges the pre-join portion of the
    // month for a mid-month joiner, which attendance never generates rows
    // for at all (see below).
    //
    // Confirmed against employee 3082, July 2026: Resigned with
    // last_working_day 2026-07-31 but zero attendance rows for the whole
    // month (not just after departure) -- the old version only scanned
    // days *after* last_working_day, so with last_working_day on the
    // final day of the month that range was empty and 0 attendance rows
    // paid out as a full month with no absence at all. Now scans the
    // employee's whole in-month span, and runs for every employee (not
    // just Resigned) so an Active employee whose attendance simply never
    // generated for the month gets the same safety net.
    {
      const daysInMonth = new Date(y, m, 0).getDate();
      const monthStart = `${y}-${String(m).padStart(2, "0")}-01`;
      const monthEnd = `${y}-${String(m).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
      // Only trust joining_date as the span's start if it actually falls
      // in this month -- a stale/inconsistent joining_date from a later
      // rehire (after this month, or after the employee's own
      // last_working_day) means "this employee started this month" is
      // false, and using it would zero out the very gap this is meant to
      // catch.
      const startDay = (emp.joining_date && emp.joining_date >= monthStart && emp.joining_date <= monthEnd)
        ? Number(emp.joining_date.slice(8, 10))
        : 1;
      const exitDate = exitDayByEmp[emp.employee_code] || null;
      const lastDayOfMonth = exitDate ? Number(exitDate.slice(8, 10)) : daysInMonth;
      const trackedDates = attDatesByEmp[emp.employee_code] || new Set();
      let missingDays = 0;
      for (let d = startDay; d <= lastDayOfMonth; d++) {
        const dateStr = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        if (!trackedDates.has(dateStr)) missingDays++;
      }

      // A genuine mid-month joiner is not paid for the part of the month
      // before they joined. Attendance only generates rows from the join
      // date onward, and the scan above deliberately starts at startDay, so
      // without this those pre-join calendar days are neither attended nor
      // deducted -- a full month's salary pays out for a partial month
      // (confirmed: July 2026 had ~30 mid-month joiners each drawing
      // near-full salary, e.g. an employee who joined on the 31st taking
      // 38,667 of 40,000). Charged as unpaid days at the daily rate, same
      // salary/30 model as any other non-worked day. Guarded on "no
      // attendance row" so a rehire whose joining_date is a stale later
      // value but who actually worked earlier in the month (those days have
      // real rows) is not charged for days they were genuinely present.
      let preJoinUnpaidDays = 0;
      for (let d = 1; d < startDay; d++) {
        const dateStr = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        if (!trackedDates.has(dateStr)) preJoinUnpaidDays++;
      }
      // The unworked tail after a mid-month leaver's last working day, the
      // mirror image of preJoinUnpaidDays above. Counted against the 30-day
      // pay base (dailyRate is Salary/30), NOT the calendar length of the
      // month: leaving on the 6th has to leave exactly 6/30 of the salary
      // payable, which is what "pay for days worked" means to Master.
      // Charging the calendar tail (25 days in a 31-day July) would pay 5/30
      // instead and quietly short every leaver by a day in a long month.
      const postExitUnpaidDays = exitDate ? Math.max(0, 30 - Number(exitDate.slice(8, 10))) : 0;

      adj.preJoinUnpaidDays = preJoinUnpaidDays;
      adj.postExitUnpaidDays = postExitUnpaidDays;
      adj.absentDays = Number(adj.absentDays || 0) + missingDays + preJoinUnpaidDays + postExitUnpaidDays;
    }

    // Leave-first offset: Management staff's short hours/half days/
    // absents are covered from their available leave balance before any
    // of it becomes a real deduction, once the balance is exhausted the
    // rest deducts normally. Scoped to staff_level "Management" only, and
    // skipped for attendance-exempt employees -- payrollRules.js already
    // zeroes their absent/short-hour/half-day deductions, so there's
    // nothing left to offset and this would otherwise drain a real leave
    // balance for a deduction that was never actually charged.
    if (emp.staff_level === "Management" && !emp.is_attendance_exempt) {
      // Pre-join unpaid days (mid-month joiner) and post-exit unpaid days
      // (mid-month leaver) are excluded here -- they're an unworked-period
      // proration, not a leave-coverable absence, so they must not drain the
      // employee's leave balance.
      // Short-hour days only count toward the leave offset when payroll
      // actually charges them (net shortfall past OT_SHORT_MIN_HOURS) --
      // otherwise a sub-threshold fractional-day total would drain leave
      // for a deduction that was never made.
      const shortDeductibleDays = Number(adj.netShortHours || 0) >= OT_SHORT_MIN_HOURS
        ? Number(adj.shortHourFractionalDays || 0) : 0;
      const deductibleDays =
        Number(adj.absentDays || 0) - Number(adj.preJoinUnpaidDays || 0)
        - Number(adj.postExitUnpaidDays || 0) +
        Number(adj.halfDays || 0) * 0.5 + shortDeductibleDays;

      // Always clear out a prior run's auto-adjustment row for this exact
      // month before recomputing -- Refresh Payroll can be clicked
      // repeatedly, and the offset must reflect the employee's real,
      // current balance each time, not compound on top of itself.
      // Skipped in a read-only run: approvedLeaveByEmp above already filters
      // out this month's own auto-adjust tag, so the delete is DB hygiene for
      // the real payroll run, not an input to the figures computed below.
      if (applySideEffects) {
        await supabase.from("leave_requests")
          .delete()
          .eq("employee_code", emp.employee_code)
          .eq("status", "Approved")
          .ilike("reason", `%${AUTO_LEAVE_OFFSET_TAG}%`);
      }

      if (deductibleDays > 0.004) {
        const { remaining } = calcRemainingLeaveBalance({
          staffLevel: emp.staff_level,
          joiningDate: emp.joining_date,
          openingBalance: leaveBalanceByEmp[emp.employee_code]?.opening_balance,
          approvedRequests: approvedLeaveByEmp[emp.employee_code] || [],
        });
        const offsetDays = Math.round(Math.min(deductibleDays, Math.max(0, remaining)) * 100) / 100;
        if (offsetDays > 0.004) {
          // The offset itself always applies -- it's part of the pay figure.
          // Only the leave_requests / leave_approvals paper trail is gated, so
          // a read-only run (Final Settlement recomputing past months) can't
          // manufacture duplicate auto-adjust leave rows.
          adj.leaveOffsetDays = offsetDays;
          if (applySideEffects) {
            const now = new Date().toISOString();
            const { data: leaveReq, error: leaveErr } = await supabase.from("leave_requests").insert({
              employee_id: emp.employee_code, employee_code: emp.employee_code,
              employee_name: emp.full_name, leave_type: "Annual",
              from_date: fromDate, to_date: toDate, days: offsetDays,
              reason: `Auto-adjusted: ${offsetDays} day(s) of short hours/half day/absent covered from leave balance. ${AUTO_LEAVE_OFFSET_TAG}`,
              applied_date: fromDate, status: "Approved",
              approved_by: "System (payroll)", approved_at: now,
              approval_trail: [{ level: null, approver: "System (payroll)", action: "Approved (auto leave-offset)", timestamp: now }],
            }).select().single();
            if (!leaveErr && leaveReq) {
              await supabase.from("leave_approvals").insert({
                leave_request_id: leaveReq.id, stage: "Payroll Auto-Adjust",
                actor_role: "System", actor_name: "System (payroll)", action: "Approved",
              });
            }
          }
        }
      }
    }

    const loanRows = [];
    const loanMatch = (loans || []).find(l =>
      l.employee_code === emp.employee_code || l.employee_id === emp.employee_code
    );
    // Nothing before the loan's start month. A loan disbursed in August must
    // not deduct from a refreshed July payroll (confirmed: loan for employee
    // 1434, start_date 2026-08-29).
    if (loanMatch && !skippedLoanIds.has(loanMatch.id) && loanInstallmentDue(loanMatch, month)) {
      loanRows.push({ employeeCode: emp.employee_code, monthly: Number(loanMatch.monthly_deduction || 0) });
    }
    const taxSetting = taxSettingByEmp[emp.employee_code];
    return calculatePayrollForEmployee(empMapped, adj, loanRows, taxSlabsData || [], month, taxSetting);
  }));

  return rows;
}
