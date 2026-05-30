import { STAFF_LEVEL_POLICIES, LOAN_POLICY } from "../config/staffPolicies";

export function getPolicyForLevel(level) {
  return STAFF_LEVEL_POLICIES[level] || STAFF_LEVEL_POLICIES["Non-Management"];
}

export function calculatePayrollForEmployee(employee, adjustments = {}, loanRows = []) {
  const policy = getPolicyForLevel(employee.level);
  const monthlySalary = Number(employee.salary || 0);
  const dailySalary = monthlySalary / 30;
  const hourlySalary = dailySalary / Number(policy.requiredHours || 10.5);
  const absentDeduction = dailySalary * Number(adjustments.absentDays || 0);
  const latePenaltyDays = Number(adjustments.lateCount || 0) >= Number(policy.latePenaltyCount || 3) ? Number(policy.latePenaltyDays || 0) : 0;
  const lateDeduction = dailySalary * latePenaltyDays;
  const overtimeAmount = policy.overtimeEligible ? hourlySalary * Number(adjustments.otHours || 0) : 0;
  const loanDeduction = loanRows.find((loan) => loan.employeeCode === employee.id)?.monthly || 0;
  const additions = Number(adjustments.commission || 0) + Number(adjustments.fuel || 0) + Number(adjustments.arrears || 0) + Number(adjustments.leaveAdjustment || 0) + overtimeAmount;
  const deductions = absentDeduction + lateDeduction + loanDeduction;
  return { employeeCode: employee.id, name: employee.name, branch: employee.branch, department: employee.dept, level: employee.level, gross: monthlySalary, presentDays: Number(adjustments.presentDays || 0), absentDays: Number(adjustments.absentDays || 0), lateCount: Number(adjustments.lateCount || 0), otHours: policy.overtimeEligible ? Number(adjustments.otHours || 0) : 0, absentDeduction, lateDeduction, overtimeAmount, commission: Number(adjustments.commission || 0), fuel: Number(adjustments.fuel || 0), arrears: Number(adjustments.arrears || 0), leaveAdjustment: Number(adjustments.leaveAdjustment || 0), loanDeduction, finalSalary: monthlySalary + additions - deductions, noticeDays: policy.noticeDays };
}

export function checkLoanEligibility(employee, existingLoans = []) {
  const joiningDate = employee.joiningDate ? new Date(employee.joiningDate) : null;
  const today = new Date();
  const serviceYears = joiningDate ? (today - joiningDate) / (1000 * 60 * 60 * 24 * 365.25) : 0;
  const activeLoan = existingLoans.some((loan) => loan.employeeCode === employee.id && loan.status === "Active");
  const maximumLoan = Number(employee.salary || 0) * (LOAN_POLICY.maximumSalaryPercent / 100);
  return { eligible: serviceYears >= LOAN_POLICY.minimumServiceYears && !activeLoan, serviceYears: Math.floor(serviceYears * 10) / 10, maximumLoan, reason: serviceYears < LOAN_POLICY.minimumServiceYears ? "Service below 2 years" : activeLoan ? "Active loan already exists" : "Eligible" };
}
