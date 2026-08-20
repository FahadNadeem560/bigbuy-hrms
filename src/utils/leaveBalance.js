import { LEAVE_QUOTA } from "../config/staffPolicies.js";

// Opening balances entered when this system went live (Aug 2026) already
// account for everything earned through end of 2026 -- no further accrual
// is generated until the new leave year starts on Jan 1, 2027. Mirrors
// LeaveManagement.jsx's ACCRUAL_START exactly -- keep both in sync.
const ACCRUAL_START = new Date(2027, 0, 1);

export function calcEarnedLeave(staffLevel, joiningDate) {
  const quota = LEAVE_QUOTA[staffLevel] || LEAVE_QUOTA["Non-Management"];
  const now = new Date();
  if (now < ACCRUAL_START) return 0;
  const joinDate = joiningDate ? new Date(joiningDate) : ACCRUAL_START;
  const start = joinDate > ACCRUAL_START ? joinDate : ACCRUAL_START;
  const months = Math.max(0, (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()) + 1);
  return Math.round((quota / 12) * months * 10) / 10;
}

// approvedRequests: leave_requests rows already filtered to this one
// employee and status === "Approved" (caller's responsibility -- this stays
// a pure function so it's cheap to call per-employee in a loop).
export function calcRemainingLeaveBalance({ staffLevel, joiningDate, openingBalance, approvedRequests }) {
  const opening = Number(openingBalance || 0);
  const earnedToDate = calcEarnedLeave(staffLevel, joiningDate);
  const usedAnnual = (approvedRequests || [])
    .filter(r => r.leave_type === "Annual")
    .reduce((s, r) => s + Number(r.days || 1), 0);
  const usedHalfDay = (approvedRequests || [])
    .filter(r => r.leave_type === "Half Day")
    .reduce((s, r) => s + Number(r.days || 1), 0);
  const remaining = (opening + earnedToDate) - usedAnnual - (usedHalfDay * 0.5);
  return { opening, earnedToDate, usedAnnual, usedHalfDay, remaining };
}
