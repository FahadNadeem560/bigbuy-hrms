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

export function calculatePayrollForEmployee(employee, adjustments = {}, loanRows = [], taxSlabs = [], month = null) {
  const policy = getPolicyForLevel(employee.level);
  const monthlySalary = Number(employee.salary || 0);
  const isExempt = !!employee.isAttendanceExempt;

  // Daily rate = Basic / 26; Hourly rate = Daily / 10.5
  const dailyRate  = monthlySalary / 26;
  const hourlyRate = dailyRate / 10.5;

  // OT — skip for exempt employees
  const otHours = (!isExempt && policy.overtimeEligible) ? Number(adjustments.otHours || 0) : 0;
  const overtimeAmount = (!isExempt && policy.overtimeEligible) ? Math.round(hourlyRate * otHours) : 0;

  const extraWorkingDays = Number(adjustments.extraWorkingDays || 0);
  const extraWorkingDaysAmount = Math.round(dailyRate * extraWorkingDays);

  // Working days in month
  let numberOfWorkingDays = Number(adjustments.numberOfWorkingDays || 0);
  if (!numberOfWorkingDays && month) {
    const [y, m] = String(month).split("-").map(Number);
    numberOfWorkingDays = getWorkingDaysInMonth(y, m);
  }

  // ── Earnings ──────────────────────────────────────────────
  const commission       = Number(adjustments.commission || 0);
  const commissionAddOn  = Number(adjustments.commissionAddOn || 0);
  const arrears          = Number(adjustments.arrears || 0);
  const absentAdjustment = Number(adjustments.absentAdjustment || 0);
  const fuelAllowance    = Number(adjustments.fuel || 0);
  const otherEarnings    = Number(adjustments.otherEarnings || adjustments.otherAmount || 0);

  const totalEarnings =
    monthlySalary +
    overtimeAmount +
    commission +
    commissionAddOn +
    arrears +
    absentAdjustment +
    fuelAllowance +
    otherEarnings +
    extraWorkingDaysAmount;

  // ── Deductions ────────────────────────────────────────────
  const absentDeduction = Math.round(dailyRate * Number(adjustments.absentDays || 0));

  // Timing deductions skipped for exempt employees
  const latePenaltyDays = (!isExempt && Number(adjustments.lateCount || 0) >= Number(policy.latePenaltyCount || 3))
    ? Number(policy.latePenaltyDays || 0)
    : 0;
  const lateDeduction     = isExempt ? 0 : Math.round(dailyRate * latePenaltyDays);
  const shortHourDeduction = isExempt ? 0 : Number(adjustments.shortHourDeduction || 0);
  const halfDayDeduction  = isExempt ? 0 : (adjustments.halfDays !== undefined
    ? Math.round((dailyRate / 2) * Number(adjustments.halfDays || 0))
    : Number(adjustments.halfDayDeduction || 0));

  const fineDeduction     = Number(adjustments.fineDeduction || adjustments.fines || 0);
  const shortageDeduction = Number(adjustments.shortageDeduction || 0);
  const advanceDeduction  = Number(adjustments.advanceDeduction || adjustments.advance || 0);
  const loanDeduction     = loanRows.find(l => l.employeeCode === employee.id)?.monthly || 0;
  const taxDeduction      = calculateMonthlyTax(monthlySalary * 12, taxSlabs);
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
    lateCount:     Number(adjustments.lateCount || 0),
    otHours,
    leaveDaysUsed: Number(adjustments.leaveDaysUsed || 0),
    extraWorkingDays,
    // Earnings
    overtimeAmount,
    commission,
    commissionAddOn,
    arrears,
    absentAdjustment,
    fuelAllowance,
    otherEarnings,
    extraWorkingDaysAmount,
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
