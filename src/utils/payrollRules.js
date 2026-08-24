import { STAFF_LEVEL_POLICIES, LOAN_POLICY } from "../config/staffPolicies";

const DEFAULT_TAX_SLABS = [
  { min_amount: 0,       max_amount: 600000,    base_tax: 0,      rate_percentage: 0  },
  { min_amount: 600001,  max_amount: 1200000,   base_tax: 0,      rate_percentage: 5  },
  { min_amount: 1200001, max_amount: 2200000,   base_tax: 30000,  rate_percentage: 15 },
  { min_amount: 2200001, max_amount: 3200000,   base_tax: 180000, rate_percentage: 25 },
  { min_amount: 3200001, max_amount: 4100000,   base_tax: 430000, rate_percentage: 30 },
  { min_amount: 4100001, max_amount: 999999999, base_tax: 700000, rate_percentage: 35 },
];

const EOBI_EMPLOYEE_CONTRIBUTION = 250;

export function calculateMonthlyTax(annualSalary, slabs) {
  const s = (slabs && slabs.length > 0) ? slabs : DEFAULT_TAX_SLABS;
  const annual = Number(annualSalary || 0);
  if (annual <= 0) return 0;
  const slab = s.find(sl => annual >= Number(sl.min_amount) && annual <= Number(sl.max_amount));
  if (!slab || Number(slab.rate_percentage) === 0) return 0;
  const annualTax = Number(slab.base_tax) + ((annual - Number(slab.min_amount)) * Number(slab.rate_percentage) / 100);
  return Math.round(annualTax / 12);
}

export function getPolicyForLevel(level) {
  return STAFF_LEVEL_POLICIES[level] || STAFF_LEVEL_POLICIES["Non-Management"];
}

// Working days (Mon–Sat) in a given month
export function getWorkingDaysInMonth(year, month) {
  const daysInMonth = new Date(year, month, 0).getDate();
  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    if (new Date(year, month - 1, d).getDay() !== 0) count++;
  }
  return count;
}

export function calculatePayrollForEmployee(employee, adjustments = {}, loanRows = [], taxSlabs = [], month = null, taxSetting = null) {
  // latePolicyOverride (from the employee's real staff_eligibility_groups row,
  // editable live on the Policy Settings page) wins over the static
  // per-level defaults below when present.
  const policy = { ...getPolicyForLevel(employee.level), ...(employee.latePolicyOverride || {}) };
  const monthlySalary = Number(employee.salary || 0);
  const isExempt = !!employee.isAttendanceExempt;
  // Effective eligibility (individual override wins, else group default). Management/Admin
  // group has extra_days_eligible = false in staff_eligibility_groups, so extraDaysEligible
  // resolves to false unless an individual employee override explicitly sets it true.
  const extraDaysEligible = employee.extraDaysEligible !== false;

  // Daily rate = Salary / 30; Hourly rate varies by staff level
  const dailyRate  = monthlySalary / 30;
  const hourlyRate = dailyRate / (employee.level === "Management" ? 9 : 10.5);

  // OT — skip for exempt employees
  const otHours = (!isExempt && policy.overtimeEligible) ? Number(adjustments.otHours || 0) : 0;
  const overtimeAmount = (!isExempt && policy.overtimeEligible) ? Math.round(hourlyRate * otHours) : 0;

  // Extra working days — skip for exempt employees and for groups/employees not eligible
  // (e.g. MANAGEMENT_ADMIN).
  const extraWorkingDays = (!isExempt && extraDaysEligible) ? Number(adjustments.extraWorkingDays || 0) : 0;
  const extraWorkingDaysAmount = Math.round(dailyRate * extraWorkingDays);

  const workedHours = Number(adjustments.workedHours || 0);
  const requiredHours = Number(adjustments.requiredHours || 0);

  // Working days in month
  let numberOfWorkingDays = Number(adjustments.numberOfWorkingDays || 0);
  if (!numberOfWorkingDays && month) {
    const [y, m] = String(month).split("-").map(Number);
    numberOfWorkingDays = getWorkingDaysInMonth(y, m);
  }

  // ── Earnings ──────────────────────────────────────────────
  const commissionAddOn  = Number(adjustments.commissionAddOn || 0);
  const arrears          = Number(adjustments.arrears || 0);
  const absentAdjustment = Number(adjustments.absentAdjustment || 0);
  const fuelAllowance    = Number(adjustments.fuel || 0);
  const otherEarnings    = Number(adjustments.otherEarnings || adjustments.otherAmount || 0);
  // Management: short hours/half days/absents are first offset against the
  // employee's available leave balance (see buildPayrollRows, which decides
  // leaveOffsetDays by checking their actual remaining balance) before any
  // of it becomes a real salary deduction -- this earns back exactly what
  // the leave balance covered, as a day-rate credit, rather than reducing
  // the deduction lines themselves (which stay fully visible below).
  const leaveOffsetDays  = Number(adjustments.leaveOffsetDays || 0);
  const leaveAdjustment  = Math.round(dailyRate * leaveOffsetDays);

  const totalEarnings =
    monthlySalary +
    overtimeAmount +
    commissionAddOn +
    arrears +
    absentAdjustment +
    fuelAllowance +
    otherEarnings +
    extraWorkingDaysAmount +
    leaveAdjustment;

  // ── Deductions ────────────────────────────────────────────
  // Skipped for exempt employees like the other attendance-based deductions
  // below -- an attendance-exempt employee (e.g. a GM who doesn't punch a
  // biometric device) has no real "Present" rows at all, so without this
  // check every unpunched day docks a full day's pay instead of the
  // exemption meaning what it says.
  const absentDeduction = isExempt ? 0 : Math.round(dailyRate * Number(adjustments.absentDays || 0));

  // Timing deductions skipped for exempt employees. Deduction scales with
  // lateness: every latePenaltyCount late days deducts another
  // latePenaltyDays day(s) of salary (e.g. 3/1 -> 9 late days = 3 days
  // deducted), not a single flat penalty once the threshold is crossed.
  const latePenaltyCount = Number(policy.latePenaltyCount) > 0 ? Number(policy.latePenaltyCount) : 3;
  const latePenaltyUnits = isExempt ? 0 : Math.floor(Number(adjustments.lateCount || 0) / latePenaltyCount);
  const latePenaltyDays  = latePenaltyUnits * Number(policy.latePenaltyDays || 0);
  const lateDeduction     = isExempt ? 0 : Math.round(dailyRate * latePenaltyDays);
  // Management/Admin has no half-day/late variance rules -- days that fall
  // short of required hours are marked "Short Hours" instead, which never
  // used to cost anything. shortHourFractionalDays (Σ short_hours/required_
  // hours across the month's Short Hours days, from buildPayrollRows) turns
  // that into a proportional day-rate deduction, same leave-offset-first
  // treatment as absents/half days.
  const shortHourDeduction = isExempt ? 0 : Math.round(dailyRate * Number(adjustments.shortHourFractionalDays || 0));
  const halfDayDeduction  = isExempt ? 0 : (adjustments.halfDays !== undefined
    ? Math.round((dailyRate / 2) * Number(adjustments.halfDays || 0))
    : Number(adjustments.halfDayDeduction || 0));

  const fineDeduction     = Number(adjustments.fineDeduction || adjustments.fines || 0);
  const shortageDeduction = Number(adjustments.shortageDeduction || 0);
  const advanceDeduction  = Number(adjustments.advanceDeduction || adjustments.advance || 0);
  const loanDeduction     = loanRows.find(l => l.employeeCode === employee.id)?.monthly || 0;
  // Manual/Exempt mode set on Tax Management (employee_tax_settings) must
  // supersede the auto FBR-slab calculation, not just display alongside it.
  const taxMode = taxSetting?.tax_mode || "auto";
  const taxDeduction =
    taxMode === "manual" ? Number(taxSetting?.manual_tax_amount || 0) :
    taxMode === "exempt" ? 0 :
    calculateMonthlyTax(monthlySalary * 12, taxSlabs);
  const eobiDeduction     = EOBI_EMPLOYEE_CONTRIBUTION;
  const otherDeductions   = Number(adjustments.otherDeductions || 0);

  const totalDeductions =
    lateDeduction +
    shortHourDeduction +
    absentDeduction +
    halfDayDeduction +
    fineDeduction +
    shortageDeduction +
    advanceDeduction +
    loanDeduction +
    taxDeduction +
    eobiDeduction +
    otherDeductions;

  return {
    employeeCode: employee.id,
    name: employee.name,
    branch: employee.branch,
    department: employee.dept,
    level: employee.level,
    isAttendanceExempt: isExempt,
    // Attendance info
    gross: monthlySalary,
    numberOfWorkingDays,
    presentDays:   Number(adjustments.presentDays || 0),
    absentDays:    Number(adjustments.absentDays || 0),
    weeklyOffDays: Number(adjustments.weeklyOffDays || 0),
    lateCount:     Number(adjustments.lateCount || 0),
    otHours,
    workedHours,
    requiredHours,
    leaveDaysUsed: Number(adjustments.leaveDaysUsed || 0),
    leaveOffsetDays,
    extraWorkingDays,
    // Earnings
    overtimeAmount,
    commissionAddOn,
    arrears,
    absentAdjustment,
    fuelAllowance,
    otherEarnings,
    extraWorkingDaysAmount,
    leaveAdjustment,
    totalEarnings,
    // Deductions
    lateDeduction,
    shortHourDeduction,
    absentDeduction,
    halfDayDeduction,
    fineDeduction,
    shortageDeduction,
    advanceDeduction,
    loanDeduction,
    taxDeduction,
    eobiDeduction,
    otherDeductions,
    totalDeductions,
    // Summary
    finalSalary: totalEarnings - totalDeductions,
    // Legacy compat
    fines: fineDeduction,
    advance: advanceDeduction,
    fuel: fuelAllowance,
    otherAmount: otherEarnings,
    noticeDays: policy.noticeDays,
  };
}

export function checkLoanEligibility(employee, existingLoans = []) {
  const joiningDate = employee.joiningDate ? new Date(employee.joiningDate) : null;
  const today = new Date();
  const serviceYears = joiningDate ? (today - joiningDate) / (1000 * 60 * 60 * 24 * 365.25) : 0;
  const activeLoan = existingLoans.some(l => l.employeeCode === employee.id && l.status === "Active");
  const maximumLoan = Number(employee.salary || 0) * (LOAN_POLICY.maximumSalaryPercent / 100);
  return {
    eligible: serviceYears >= LOAN_POLICY.minimumServiceYears && !activeLoan,
    serviceYears: Math.floor(serviceYears * 10) / 10,
    maximumLoan,
    reason: serviceYears < LOAN_POLICY.minimumServiceYears
      ? "Service below 2 years"
      : activeLoan ? "Active loan already exists" : "Eligible",
  };
}

export function calculateAdvanceEligibility(monthlySalary, dayOfMonth, daysInMonth) {
  // Days worked including weekly offs = days elapsed in month (days passed up to today)
  const daysElapsed = dayOfMonth;
  const maxAdvance = Math.floor((monthlySalary * daysElapsed / 30) * 0.8);
  const earnedSoFar = Math.floor(monthlySalary * daysElapsed / 30);
  return { maxAdvance, earnedSoFar, daysElapsed };
}
