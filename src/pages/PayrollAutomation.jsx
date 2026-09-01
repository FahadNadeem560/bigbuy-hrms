import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { Button, Badge, PageTitle } from "../components/ui.jsx";
import { money } from "../utils/format.js";
import { calculatePayrollForEmployee, getWorkingDaysInMonth, OT_SHORT_MIN_HOURS } from "../utils/payrollRules.js";
import { getWeeklyOffOverrideKeys, getFullyWorkedBlockKeys } from "../utils/attendanceRules.js";
import { calcRemainingLeaveBalance } from "../utils/leaveBalance.js";
import * as XLSX from "xlsx";
import {
  PAYMENT_STATUSES, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_TONES,
  canTransitionPaymentStatus, requiresMasterOnly, requestPaymentStatusChange,
  getPayrollLock, lockPayrollMonth, unlockPayrollMonth, mergePersistentPayrollFields,
  generateVerificationsForMonth, fetchVerifications,
  getVerificationProgress, respondToFlag,
  generateCashIncentiveSnapshot,
} from "../services/payrollControlService.js";
import { deductIssuedAdvancesForMonth } from "../services/advanceService.js";
import PayrollHold from "./PayrollHold.jsx";
import CashIncentives from "./CashIncentives.jsx";
import FinanceReconciliation from "./FinanceReconciliation.jsx";
import FinalSettlement from "./FinalSettlement.jsx";
import { queueWhatsappMessage, MESSAGE_TYPES } from "../services/whatsappService.js";

const STATUS_TONES = { Draft: "yellow", Approved: "blue", Published: "green", Locked: "purple", Paid: "green", Completed: "green" };
const TABS = [["register", "Payroll Register"], ["hold", "Hold & F&F"], ["settlement", "Final Settlement"], ["cash", "Confidential Incentives"], ["finance", "Finance Reconciliation"]];

// ── Publish confirmation modal ────────────────────────────────
function PublishModal({ month, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="text-2xl mb-3">⚠️</div>
        <h2 className="font-bold text-slate-800 text-lg mb-2">Publish Payroll</h2>
        <p className="text-slate-600 text-sm mb-4">
          You are about to publish payroll for <strong>{month}</strong>.<br /><br />
          After publishing:
        </p>
        <ul className="text-sm text-slate-600 space-y-1 mb-5 list-disc pl-5">
          <li>No changes can be made by HR</li>
          <li>Payroll will be visible to Finance</li>
          <li>Only Master can approve any corrections</li>
        </ul>
        <p className="text-sm font-semibold text-slate-800 mb-4">Are you absolutely sure?</p>
        <div className="flex gap-3">
          <Button onClick={onConfirm} className="rounded-2xl flex-1 bg-emerald-600 hover:bg-emerald-700">Yes, Publish</Button>
          <Button variant="outline" onClick={onCancel} className="rounded-2xl flex-1">Cancel</Button>
        </div>
      </div>
    </div>
  );
}

// ── Unlock confirmation modal (Master only) ───────────────────
function UnlockModal({ month, onConfirm, onCancel }) {
  const [reason, setReason] = useState("");
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="text-2xl mb-3">🔓</div>
        <h2 className="font-bold text-slate-800 text-lg mb-2">Unlock Payroll</h2>
        <p className="text-slate-600 text-sm mb-4">
          You are unlocking <strong>{month}</strong> payroll. All changes will be logged. Enter a reason to proceed:
        </p>
        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
          placeholder="Reason for unlocking…"
          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm resize-none mb-4" />
        <div className="flex gap-3">
          <Button onClick={() => onConfirm(reason)} disabled={!reason.trim()} className="rounded-2xl flex-1 bg-amber-600 hover:bg-amber-700">Unlock</Button>
          <Button variant="outline" onClick={onCancel} className="rounded-2xl flex-1">Cancel</Button>
        </div>
      </div>
    </div>
  );
}

// ── Payment status request modal ───────────────────────────────
function PaymentStatusModal({ row, month, role, onClose, onSubmitted }) {
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  if (!row) return null;
  const options = PAYMENT_STATUSES.filter(s => s !== row.paymentStatus && canTransitionPaymentStatus(row.paymentStatus, s));
  async function submit() {
    if (!target) return setErr("Choose a new status.");
    if (!reason.trim()) return setErr("Reason is required.");
    setBusy(true); setErr("");
    try {
      await requestPaymentStatusChange({
        employeeId: row.id || null, employeeCode: row.employeeCode, employeeName: row.name,
        payrollMonth: month, requestedBy: role, currentStatus: row.paymentStatus, requestedStatus: target, reason,
      });
      onSubmitted();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <h2 className="font-bold text-slate-800 text-lg mb-1">Request Payment Status Change</h2>
        <p className="text-sm text-slate-500 mb-4">{row.name} · {row.employeeCode} · {month}</p>
        <div className="mb-3">
          <p className="text-xs text-slate-500 mb-1">Current Status</p>
          <Badge tone={PAYMENT_STATUS_TONES[row.paymentStatus]}>{PAYMENT_STATUS_LABELS[row.paymentStatus]}</Badge>
        </div>
        <div className="mb-3">
          <p className="text-xs text-slate-500 mb-1">New Status</p>
          <select value={target} onChange={e => setTarget(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm">
            <option value="">— Select —</option>
            {options.map(s => (
              <option key={s} value={s}>{PAYMENT_STATUS_LABELS[s]}{requiresMasterOnly(row.paymentStatus, s) ? " (Master approval only)" : ""}</option>
            ))}
          </select>
          {options.length === 0 && <p className="text-xs text-amber-600 mt-1">No further transitions allowed from {PAYMENT_STATUS_LABELS[row.paymentStatus]}.</p>}
        </div>
        <div className="mb-4">
          <p className="text-xs text-slate-500 mb-1">Reason (mandatory)</p>
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm resize-none" placeholder="Why is this status changing?" />
        </div>
        {err && <div className="mb-3 p-2 rounded-xl bg-red-50 text-red-700 text-xs">{err}</div>}
        <div className="flex gap-3">
          <Button onClick={submit} disabled={busy || options.length === 0} className="rounded-2xl flex-1">{busy ? "Submitting…" : "Submit for Approval"}</Button>
          <Button variant="outline" onClick={onClose} className="rounded-2xl flex-1">Cancel</Button>
        </div>
      </div>
    </div>
  );
}

// ── Payslip Modal ─────────────────────────────────────────────
function PayslipModal({ row, month, onClose }) {
  if (!row) return null;
  const ERow = ({ label, value }) => value ? (
    <div className="flex justify-between py-1.5 border-b border-slate-100">
      <span className="text-slate-500 text-sm">{label}</span>
      <span className="text-sm text-emerald-700">{money(value)}</span>
    </div>
  ) : null;
  const DRow = ({ label, value }) => value ? (
    <div className="flex justify-between py-1.5 border-b border-slate-100">
      <span className="text-slate-500 text-sm">{label}</span>
      <span className="text-sm text-red-500">– {money(value)}</span>
    </div>
  ) : null;
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white rounded-t-2xl px-6 pt-6 pb-3 border-b border-slate-100 flex justify-between items-start">
          <div>
            <h2 className="font-bold text-slate-800 text-lg">Payslip — {month}</h2>
            <p className="text-sm text-slate-500">{row.name} · {row.employeeCode}</p>
            {row.level && <p className="text-xs text-slate-400 mt-0.5">{row.level}</p>}
            {row.isAttendanceExempt && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full mt-1 inline-block">EXEMPTED</span>}
          </div>
          <Button variant="outline" onClick={onClose} className="rounded-xl text-xs">Close</Button>
        </div>
        <div className="px-6 py-4 space-y-5">
          {/* Attendance Summary */}
          <div className="bg-blue-50 rounded-xl px-4 py-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-blue-400 mb-2">Attendance Summary</h3>
            <div className="grid grid-cols-3 gap-2 text-xs">
              {[["Working Days", row.numberOfWorkingDays], ["Present", row.presentDays], ["Absent", row.absentDays],
                ["Leave Days", row.leaveDaysUsed], ["Extra WD", row.extraWorkingDays], ["OT Hours", row.otHours],
                ["Worked Hrs", row.workedHours], ["Required Hrs", row.requiredHours]
              ].map(([l, v]) => (
                <div key={l} className="text-center bg-white rounded-lg py-1.5 px-2">
                  <div className="font-semibold text-slate-700">{Math.round(Number(v) || 0)}</div>
                  <div className="text-slate-400 leading-tight">{l}</div>
                </div>
              ))}
            </div>
          </div>
          {/* Earnings */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Earnings</h3>
            <ERow label="Basic Salary" value={row.basicSalary} />
            <ERow label="Extra Working Days Amount" value={row.extraWorkingDaysAmount} />
            {!!row.ghWorkedAmount && <ERow label={`Gazetted Holiday Worked (${row.ghWorkedDays} day${row.ghWorkedDays === 1 ? "" : "s"})`} value={row.ghWorkedAmount} />}
            <ERow label="OT Amount" value={row.overtimeAmount} />
            <ERow label="Commission" value={row.commissionAddOn} />
            <ERow label="Fuel Allowance" value={row.fuelAllowance} />
            <ERow label="Other Earnings" value={row.otherEarnings} />
            {!!row.leaveAdjustment && <ERow label="Leave's Adjustment (short hours/half day/absent covered from leave)" value={row.leaveAdjustment} />}
            <div className="flex justify-between py-2 mt-1 bg-emerald-50 rounded-xl px-3">
              <span className="font-bold text-sm text-emerald-800">Total Earnings</span>
              <span className="font-bold text-sm text-emerald-800">{money(row.totalEarnings)}</span>
            </div>
          </div>
          {/* Deductions */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Deductions</h3>
            <DRow label="Late Deduction" value={row.lateDeduction} />
            <DRow label="Short Hour Deduction" value={row.shortHourDeduction} />
            <DRow label="Absent Deduction" value={row.absentDeduction} />
            <DRow label="Half Day Deduction" value={row.halfDayDeduction} />
            <DRow label="Fine" value={row.fineDeduction} />
            <DRow label="Shortage" value={row.shortageDeduction} />
            <DRow label="Advance (Same Month)" value={row.advanceDeduction} />
            <DRow label="Loan Installment" value={row.loanDeduction} />
            <DRow label="Income Tax" value={row.taxDeduction} />
            <DRow label="EOBI" value={row.eobiDeduction} />
            <DRow label="Other Deductions" value={row.otherDeductions} />
            <div className="flex justify-between py-2 mt-1 bg-red-50 rounded-xl px-3">
              <span className="font-bold text-sm text-red-800">Total Deductions</span>
              <span className="font-bold text-sm text-red-800">– {money(row.totalDeductions)}</span>
            </div>
          </div>
          {/* Net Pay */}
          <div className="bg-slate-50 rounded-xl px-4 py-4 flex justify-between items-center">
            <span className="font-bold text-base text-slate-900">Net Pay</span>
            <span className="font-bold text-xl text-slate-900">{money(row.finalSalary)}</span>
          </div>
        </div>
        <div className="px-6 pb-6"><Button onClick={() => window.print()} variant="outline" className="w-full rounded-2xl">Print Payslip</Button></div>
      </div>
    </div>
  );
}

// ── Payroll Summary Panel (bifurcation) ─────────────────────────
// Confidential Incentives are deliberately absent from this panel — that
// data lives only in the dedicated Confidential Incentives tab.
function SummaryPanel({ month, displayRows }) {
  const buckets = useMemo(() => {
    const acc = { Normal: { count: 0, amt: 0 }, FnF: { count: 0, amt: 0 }, Hold: { count: 0, amt: 0 }, No_FnF: { count: 0, amt: 0 } };
    let holdoverCount = 0, holdoverAmt = 0;
    displayRows.forEach(r => {
      const b = acc[r.paymentStatus] || acc.Normal;
      b.count++; b.amt += r.finalSalary;
      if (r.holdoverAmount > 0) { holdoverCount++; holdoverAmt += r.holdoverAmount; }
    });
    const totalGenerated = displayRows.length;
    const totalGeneratedAmt = displayRows.reduce((s, r) => s + r.finalSalary, 0);
    const totalPayable = acc.Normal.amt + acc.FnF.amt;
    const totalPayableCount = acc.Normal.count + acc.FnF.count;
    const financeTotal = totalPayable + holdoverAmt;
    return { acc, holdoverCount, holdoverAmt, totalGenerated, totalGeneratedAmt, totalPayable, totalPayableCount, financeTotal };
  }, [displayRows]);

  if (displayRows.length === 0) return null;
  const Row = ({ label, count, amt, bold, highlight, sub }) => (
    <tr className={highlight ? "bg-emerald-50 font-bold" : bold ? "font-semibold bg-slate-50" : ""}>
      <td className={`px-4 py-2 text-sm ${sub ? "pl-8 text-slate-500" : "text-slate-700"}`}>{label}</td>
      <td className="px-4 py-2 text-sm text-right">{count != null ? count : ""}</td>
      <td className="px-4 py-2 text-sm text-right">{money(amt)}</td>
    </tr>
  );
  return (
    <div className="mb-4">
      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto overflow-y-auto max-h-[70vh]">
        <div className="px-5 pt-4 pb-2"><h2 className="font-bold text-slate-800">Payroll Summary — {month}</h2></div>
        <table className="w-full text-sm min-w-[480px]">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="text-left px-4 py-2 font-medium sticky top-0 z-10 bg-slate-50 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">Category</th>
              <th className="text-right px-4 py-2 font-medium sticky top-0 z-10 bg-slate-50 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">Employees</th>
              <th className="text-right px-4 py-2 font-medium sticky top-0 z-10 bg-slate-50 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <Row label="Total Generated" count={buckets.totalGenerated} amt={buckets.totalGeneratedAmt} bold />
            <Row label="Normal (Payable)" count={buckets.acc.Normal.count} amt={buckets.acc.Normal.amt} />
            <Row label="F&F Settlement" count={buckets.acc.FnF.count} amt={buckets.acc.FnF.amt} />
            <Row label="Hold" count={buckets.acc.Hold.count} amt={buckets.acc.Hold.amt} />
            <Row label="No F&F" count={buckets.acc.No_FnF.count} amt={buckets.acc.No_FnF.amt} />
            <Row label="TOTAL PAYABLE ✅" count={buckets.totalPayableCount} amt={buckets.totalPayable} highlight />
            <Row label="Previous Month Holdover" count={buckets.holdoverCount} amt={buckets.holdoverAmt} sub />
            <Row label="FINANCE TOTAL" amt={buckets.financeTotal} bold />
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Payroll Comparison Summary (branch cards, current vs previous month) ──
function num(v) { return Math.round(Number(v || 0)).toLocaleString(); }

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
function loanInstallmentDue(loan, payrollMonth) {
  if (!loan) return false;
  const startMonth = String(loan.start_date || "").slice(0, 7)
    || String(loan.disbursed_at || loan.granted_date || loan.loan_date || loan.created_at || "").slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(startMonth)) return true; // no usable start — behave as before
  return payrollMonth >= startMonth;
}

function prevMonthOf(m) {
  const [y, mo] = String(m || "").split("-").map(Number);
  if (!y || !mo) return m;
  const d = new Date(y, mo - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const COMPARISON_METRIC_KEYS = [
  "grossSalary", "totalEarnings", "fuelAllowance", "overtime", "extraWorkingDays", "leaveAdjustment", "arrears", "commission", "otherAmount",
  "advance", "loan", "lateComing", "halfDays", "fine", "eobi", "tax", "otherDeduction", "totalDeductions", "netSalary",
];
function emptyAgg() {
  const o = { headCount: 0 };
  COMPARISON_METRIC_KEYS.forEach(k => { o[k] = 0; });
  return o;
}
function sumAgg(list) {
  const o = emptyAgg();
  list.forEach(a => { Object.keys(o).forEach(k => { o[k] += Number(a?.[k] || 0); }); });
  return o;
}

const EARNING_ROWS = [
  ["Gross Salary", "grossSalary"],
  ["Total Salary (after adjustments)", "totalEarnings"],
  ["Fuel Allowance", "fuelAllowance"],
  ["Overtime", "overtime"],
  ["Extra Working Days", "extraWorkingDays"],
  ["Leave's Adjustment", "leaveAdjustment"],
  ["Arrears", "arrears"],
  ["Commission", "commission"],
  ["Other Amount", "otherAmount"],
];
const DEDUCTION_ROWS = [
  ["Advance", "advance"],
  ["Loan", "loan"],
  ["Late Coming", "lateComing"],
  ["Half Days", "halfDays"],
  ["Fine", "fine"],
  ["EOBI", "eobi"],
  ["Tax", "tax"],
  ["Other Deduction", "otherDeduction"],
];
const NAMED_BRANCHES = ["HO - Admin", "Main Branch", "DHA Branch", "WAREHOUSE", "BASE FAISAL"];
const LEVEL_OPTIONS = ["Management", "Floor Management", "Non-Management"];
const PAGE_SIZE_OPTIONS = [25, 50, 100, "All"];

function roundN(v, n) { const f = 10 ** n; return Math.round(Number(v || 0) * f) / f; }
function plainCode(code) {
  const s = String(code ?? "");
  return /^\d+$/.test(s) ? String(parseInt(s, 10)) : s;
}

// payroll rows carry no branch/department column themselves — always joined
// in from employees.branch via employee_code, same as displayRows does above.
async function fetchBranchAggregates(month, codeToBranch) {
  const { data } = await supabase.from("payroll").select(
    "employee_code, gross_salary, fuel_allowance, overtime_amount, extra_working_days_amount, gh_worked_amount, leave_adjustment, arrears, commission_addon, other_amount, total_earnings, advance_deduction, loan_deduction, late_deduction, half_day_deduction, fine_deduction, eobi_deduction, tax_deduction, other_deductions, total_deductions, net_salary"
  ).eq("payroll_month", month).limit(2000);
  const byBranch = {};
  (data || []).forEach(r => {
    const branch = codeToBranch[r.employee_code] || "Unassigned";
    if (!byBranch[branch]) byBranch[branch] = emptyAgg();
    const b = byBranch[branch];
    b.headCount += 1;
    b.grossSalary += Number(r.gross_salary || 0);
    b.totalEarnings += Number(r.total_earnings || 0);
    b.fuelAllowance += Number(r.fuel_allowance || 0);
    b.overtime += Number(r.overtime_amount || 0);
    b.extraWorkingDays += Number(r.extra_working_days_amount || 0) + Number(r.gh_worked_amount || 0);
    b.leaveAdjustment += Number(r.leave_adjustment || 0);
    b.arrears += Number(r.arrears || 0);
    b.commission += Number(r.commission_addon || 0);
    b.otherAmount += Number(r.other_amount || 0);
    b.advance += Number(r.advance_deduction || 0);
    b.loan += Number(r.loan_deduction || 0);
    b.lateComing += Number(r.late_deduction || 0);
    b.halfDays += Number(r.half_day_deduction || 0);
    b.fine += Number(r.fine_deduction || 0);
    b.eobi += Number(r.eobi_deduction || 0);
    b.tax += Number(r.tax_deduction || 0);
    b.otherDeduction += Number(r.other_deductions || 0);
    b.totalDeductions += Number(r.total_deductions || 0);
    b.netSalary += Number(r.net_salary || 0);
  });
  return byBranch;
}

function ComparisonTable({ cur, prev, month, prevMonth, showDiff }) {
  function diffCell(curV, prevV) {
    const d = Number(curV || 0) - Number(prevV || 0);
    if (d === 0) return <span className="text-slate-400">0</span>;
    return <span className={d > 0 ? "text-emerald-600 font-semibold" : "text-red-600 font-semibold"}>{d > 0 ? "+" : ""}{num(d)}</span>;
  }
  const cols = showDiff ? 4 : 3;
  return (
    <table className="w-full text-sm">
      <thead className="text-slate-400 text-xs">
        <tr>
          <th className="text-left px-4 py-2 font-medium sticky top-0 z-10 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)]"> </th>
          <th className="text-right px-4 py-2 font-medium sticky top-0 z-10 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)]">{month}</th>
          <th className="text-right px-4 py-2 font-medium sticky top-0 z-10 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)]">{prevMonth}</th>
          {showDiff && <th className="text-right px-4 py-2 font-medium sticky top-0 z-10 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)]">Difference</th>}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-50">
        <tr><td colSpan={cols} className="px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50">Earnings</td></tr>
        {EARNING_ROWS.map(([label, key]) => (
          <tr key={key}>
            <td className="px-4 py-1.5 text-slate-600">{label}</td>
            <td className="px-4 py-1.5 text-right">{num(cur[key])}</td>
            <td className="px-4 py-1.5 text-right text-slate-400">{num(prev[key])}</td>
            {showDiff && <td className="px-4 py-1.5 text-right">{diffCell(cur[key], prev[key])}</td>}
          </tr>
        ))}
        <tr><td colSpan={cols} className="px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50">Deductions</td></tr>
        {DEDUCTION_ROWS.map(([label, key]) => (
          <tr key={key}>
            <td className="px-4 py-1.5 text-slate-600">{label}</td>
            <td className="px-4 py-1.5 text-right">{num(cur[key])}</td>
            <td className="px-4 py-1.5 text-right text-slate-400">{num(prev[key])}</td>
            {showDiff && <td className="px-4 py-1.5 text-right">{diffCell(cur[key], prev[key])}</td>}
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="bg-slate-900">
          <td className="px-4 py-3 font-bold text-white text-base">Net Salary</td>
          <td className="px-4 py-3 text-right font-bold text-white text-base">{num(cur.netSalary)}</td>
          <td className="px-4 py-3 text-right font-bold text-slate-300 text-base">{num(prev.netSalary)}</td>
          {showDiff && <td className="px-4 py-3 text-right font-bold text-base bg-slate-900">{diffCell(cur.netSalary, prev.netSalary)}</td>}
        </tr>
      </tfoot>
    </table>
  );
}

function BranchCard({ branch, cur, prev, month, prevMonth, collapsed, onToggle, total }) {
  return (
    <div className={`bg-white rounded-2xl shadow-sm overflow-hidden ${total ? "border-2 border-slate-800" : "border border-slate-200"}`}>
      <button onClick={onToggle}
        className={`w-full flex items-center justify-between px-4 py-3 transition text-left ${total ? "bg-slate-800 hover:bg-slate-700" : "bg-slate-50 hover:bg-slate-100"}`}>
        <span className={`font-semibold ${total ? "text-white font-bold" : "text-slate-800"}`}>{collapsed ? "▶" : "▼"} {branch}</span>
        <span className={`text-xs ${total ? "text-slate-300" : "text-slate-500"}`}>Head Count: {cur.headCount} <span className="opacity-50">|</span> {prev.headCount}</span>
      </button>
      {!collapsed && <ComparisonTable cur={cur} prev={prev} month={month} prevMonth={prevMonth} showDiff={total} />}
    </div>
  );
}

function BranchComparisonSummary({ month }) {
  const [loading, setLoading] = useState(true);
  const [currentByBranch, setCurrentByBranch] = useState({});
  const [previousByBranch, setPreviousByBranch] = useState({});
  // Opt-in set — everything starts collapsed so the page loads compact;
  // clicking a card header (or "Expand All") reveals its full breakdown.
  const [expanded, setExpanded] = useState(() => new Set());
  const prevMonth = useMemo(() => prevMonthOf(month), [month]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const { data: emps } = await supabase.from("employees").select("employee_code, branch");
        const codeToBranch = {};
        (emps || []).forEach(e => { codeToBranch[e.employee_code] = e.branch || "Unassigned"; });
        const [cur, prev] = await Promise.all([
          fetchBranchAggregates(month, codeToBranch),
          fetchBranchAggregates(prevMonth, codeToBranch),
        ]);
        if (!active) return;
        setCurrentByBranch(cur);
        setPreviousByBranch(prev);
      } catch {
        if (active) { setCurrentByBranch({}); setPreviousByBranch({}); }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [month, prevMonth]);

  const allBranches = useMemo(() => {
    const named = new Set(NAMED_BRANCHES);
    const extra = Array.from(new Set([...Object.keys(currentByBranch), ...Object.keys(previousByBranch)]))
      .filter(b => !named.has(b)).sort();
    return [...NAMED_BRANCHES, ...extra];
  }, [currentByBranch, previousByBranch]);

  const totalCur = useMemo(() => sumAgg(Object.values(currentByBranch)), [currentByBranch]);
  const totalPrev = useMemo(() => sumAgg(Object.values(previousByBranch)), [previousByBranch]);

  function toggle(key) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function exportExcel() {
    const rows = [
      ...allBranches.map(b => ({ branch: b, cur: currentByBranch[b] || emptyAgg(), prev: previousByBranch[b] || emptyAgg() })),
      { branch: "TOTAL", cur: totalCur, prev: totalPrev },
    ];
    const data = rows.map(({ branch, cur, prev }) => {
      const o = { Branch: branch, [`Head Count (${month})`]: cur.headCount, [`Head Count (${prevMonth})`]: prev.headCount };
      [...EARNING_ROWS, ...DEDUCTION_ROWS, ["Net Salary", "netSalary"]].forEach(([label, key]) => {
        o[`${label} (${month})`] = cur[key];
        o[`${label} (${prevMonth})`] = prev[key];
      });
      return o;
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Payroll Comparison");
    XLSX.writeFile(wb, `payroll_comparison_${month}.xlsx`);
  }

  if (loading) {
    return <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm mb-4 text-center text-slate-400 text-sm">Loading comparison…</div>;
  }
  const hasAnyData = allBranches.some(b => (currentByBranch[b]?.headCount || 0) > 0 || (previousByBranch[b]?.headCount || 0) > 0);
  if (!hasAnyData) return null;

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <h2 className="font-bold text-slate-800">Payroll Comparison — {month} vs {prevMonth}</h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setExpanded(new Set([...allBranches, "__TOTAL__"]))} className="rounded-xl text-xs">Expand All</Button>
          <Button variant="outline" onClick={() => setExpanded(new Set())} className="rounded-xl text-xs">Collapse All</Button>
          <Button variant="outline" onClick={exportExcel} className="rounded-xl text-xs">Export Comparison to Excel</Button>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {allBranches.map(branch => (
          <BranchCard key={branch} branch={branch} cur={currentByBranch[branch] || emptyAgg()} prev={previousByBranch[branch] || emptyAgg()}
            month={month} prevMonth={prevMonth} collapsed={!expanded.has(branch)} onToggle={() => toggle(branch)} />
        ))}
      </div>
      <div className="mt-3">
        <BranchCard branch="Total — All Branches" cur={totalCur} prev={totalPrev} month={month} prevMonth={prevMonth}
          collapsed={!expanded.has("__TOTAL__")} onToggle={() => toggle("__TOTAL__")} total />
      </div>
    </div>
  );
}

// ── Verification progress tracker + flags panel ─────────────────
function VerificationPanel({ month, role, verifications, flagNotifications, onRespond }) {
  const progress = getVerificationProgress(verifications, flagNotifications);
  if (verifications.length === 0) return null;
  const pct = progress.total > 0 ? Math.round((progress.confirmed / progress.total) * 100) : 0;
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm mb-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-bold text-slate-800 text-sm">Verification Progress</h3>
        <span className="text-xs text-slate-500">{progress.confirmed} of {progress.total} supervisors done</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-2">
        <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-slate-500">
        {progress.flagsRaised} flag{progress.flagsRaised !== 1 ? "s" : ""} raised · {progress.pendingHRResponse} pending HR response
        {progress.confirmed === progress.total && progress.total > 0 && <span className="text-emerald-600 font-medium ml-2">All supervisors have verified. Ready to publish.</span>}
      </p>
      {["HR", "Master"].includes(role) && flagNotifications.filter(n => !n.is_read).length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
          {flagNotifications.filter(n => !n.is_read).map(n => (
            <div key={n.id} className="flex flex-wrap items-center justify-between gap-2 bg-amber-50 rounded-xl p-2.5">
              <span className="text-xs text-amber-800">{n.message}</span>
              <div className="flex gap-1.5">
                <Button onClick={() => onRespond(n, "Change made for the flagged employee.")} className="rounded-lg text-[11px] py-1 px-2">Change Made</Button>
                <Button variant="outline" onClick={() => {
                  const reason = window.prompt("Reason for rejecting the flag?");
                  if (reason) onRespond(n, `Flag rejected — reason: ${reason}`);
                }} className="rounded-lg text-[11px] py-1 px-2">Reject Flag</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────
export default function PayrollAutomation({ role, actorName }) {
  const now = new Date();
  const [tab, setTab] = useState("register");
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [employees, setEmployees] = useState([]);
  const [loans, setLoans] = useState([]);
  const [payrollRows, setPayrollRows] = useState([]);
  const [payrollStatus, setPayrollStatus] = useState("Draft");
  const [publishedBy, setPublishedBy] = useState("");
  const [publishedAt, setPublishedAt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [selectedPayslip, setSelectedPayslip] = useState(null);
  const [paymentStatusRow, setPaymentStatusRow] = useState(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [searchText, setSearchText] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("All");
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [showDetailColumns, setShowDetailColumns] = useState(false);
  const [lastPayByCode, setLastPayByCode] = useState({});
  const [pageSize, setPageSize] = useState(50);
  const [currentPage, setCurrentPage] = useState(1);
  const [lockInfo, setLockInfo] = useState(null);
  const [verifications, setVerifications] = useState([]);
  const [flagNotifications, setFlagNotifications] = useState([]);
  const [marking, setMarking] = useState(false);

  function clearFilters() {
    setSearchText(""); setBranchFilter(""); setDeptFilter(""); setLevelFilter(""); setPaymentStatusFilter("All");
  }
  function toggleSort(key) {
    if (sortKey === key) { setSortDir(d => (d === "asc" ? "desc" : "asc")); }
    else { setSortKey(key); setSortDir("asc"); }
  }

  const isPublished = payrollStatus === "Published" || payrollStatus === "Locked" || payrollStatus === "Completed";
  const isLocked = !!lockInfo?.is_locked;
  const canGenerate = ["Master", "HR"].includes(role) && !isPublished && !isLocked;
  const canRefresh  = ["Master", "HR"].includes(role) && !isPublished && !isLocked;
  const canPublish  = role === "Master" && !isPublished && payrollRows.length > 0 && !isLocked;
  const canApprove  = role === "Master" && payrollStatus === "Draft" && !isLocked;

  // Finance only sees Published payroll
  const financeBlocked = role === "Finance" && !isPublished;

  const canRequestPaymentStatus = ["HR", "Master"].includes(role) && !isLocked;
  const canMarkPaid = role === "Finance" && isPublished && !isLocked;

  useEffect(() => { loadBase(); }, [month]);
  useEffect(() => { loadPayroll(); loadLockAndExtras(); }, [month]);

  useEffect(() => {
    let active = true;
    (async () => {
      const prevM = prevMonthOf(month);
      const { data } = await supabase.from("payroll").select("employee_code, net_salary").eq("payroll_month", prevM);
      if (!active) return;
      const map = {};
      (data || []).forEach(r => { map[r.employee_code] = Number(r.net_salary || 0); });
      setLastPayByCode(map);
    })();
    return () => { active = false; };
  }, [month]);

  async function loadBase() {
    const fromDate = month + "-01";
    const [y, m] = month.split("-").map(Number);
    const toDate = `${y}-${String(m).padStart(2, "0")}-${new Date(y, m, 0).getDate()}`;
    // A resigned employee only belongs in the payroll of the month their
    // last_working_day falls in -- before that they're still Active, after
    // it their Final Settlement already paid them out. Without this,
    // resigning employees vanished from payroll entirely the moment
    // FinalSettlement.jsx flipped their status to "Resigned".
    //
    // Once actually settled (a final_settlements row exists), they're
    // excluded here permanently -- final_settlements is now the sole record
    // of what they're owed, and letting them back into buildPayrollRows
    // would silently recompute and overwrite that with a full-month
    // attendance-based day count that disagrees with the settlement's own.
    // A Resigned employee who hasn't been through Final Settlement yet
    // still belongs here as normal, so their partial-month attendance keeps
    // accruing correctly until they are.
    // An employee whose joining_date is after this month's last day hasn't
    // started yet -- without this filter they showed up in the payroll
    // Draft anyway (zero attendance rows, since they don't exist yet), and
    // with nothing to mark them absent (see the gap-fill below, which only
    // fills days *within* an employee's employment span) they were paid a
    // full month's salary before their first day of work.
    const [{ data: activeEmps }, { data: resignedEmps }, { data: lns }, { data: settled }] = await Promise.all([
      supabase.from("employees").select("*").eq("status", "Active").lte("joining_date", toDate),
      supabase.from("employees").select("*").in("status", ["Resigned", "Terminated"])
        .gte("last_working_day", fromDate).lte("last_working_day", toDate),
      supabase.from("loans").select("*").eq("status", "Active"),
      supabase.from("final_settlements").select("employee_code"),
    ]);
    const settledCodes = new Set((settled || []).map(s => s.employee_code));
    // A resigned employee whose joining_date is AFTER their own
    // last_working_day is a stale/rehire record -- last_working_day belongs
    // to a prior stint, not the one joining_date describes, so it doesn't
    // mean "left partway through this month". Including them here paid a
    // full month's salary for a month they were never actually employed in
    // (confirmed: employee 3082, joining_date 2026-08-03 vs. last_working_day
    // 2026-07-31 -- zero attendance all of July because he hadn't joined yet).
    // "resignedEmps" now also carries Terminated employees — same treatment.
    const validResignedEmps = (resignedEmps || []).filter(e => !(e.joining_date && e.joining_date > e.last_working_day));
    setEmployees([...(activeEmps || []), ...validResignedEmps].filter(e => !settledCodes.has(e.employee_code)));
    setLoans(lns || []);
  }

  async function loadLockAndExtras() {
    const [lock, verifs] = await Promise.all([
      getPayrollLock(month),
      fetchVerifications(month),
    ]);
    setLockInfo(lock);
    setVerifications(verifs);
    const { data: flags } = await supabase.from("notifications").select("*").eq("type", `payroll_flag_${month}`).order("created_at", { ascending: false });
    setFlagNotifications(flags || []);
  }

  // A plain unranged .select("*") silently truncates below the real row
  // count once a month's headcount grows past PostgREST's implicit cap
  // (confirmed: July 2026 has 587 payroll rows, the old `.limit(500)` here
  // dropped up to 87 of them with no stable ordering behind the cutoff, so
  // which employees vanished from the page -- and from search -- could
  // shift between loads). Page through with .range() the same way
  // fetchAllAttendanceForMonth already does, ordered so the cutoff is
  // deterministic instead of arbitrary.
  async function loadPayroll() {
    const pageSize = 1000;
    let all = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase.from("payroll").select("*")
        .eq("payroll_month", month)
        .order("employee_code", { ascending: true })
        .order("id", { ascending: true }) // unique tie-break — see fetchAllAttendanceForMonth
        .range(from, from + pageSize - 1);
      if (error) break;
      all = all.concat(data || []);
      if (!data || data.length < pageSize) break;
      from += pageSize;
    }
    if (all.length > 0) {
      setPayrollRows(all);
      setPayrollStatus(all[0]?.status || "Draft");
      setPublishedBy(all[0]?.published_by || "");
      setPublishedAt(all[0]?.published_at || "");
    } else {
      setPayrollRows([]);
      setPayrollStatus("Draft");
      setPublishedBy(""); setPublishedAt("");
    }
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
  async function fetchAllAttendanceForMonth(fromDate, toDate) {
    const pageSize = 1000;
    let all = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase.from("attendance").select("*")
        .gte("work_date", fromDate).lte("work_date", toDate)
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

  async function buildPayrollRows() {
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

    const [att, { data: finesData }, { data: shortagesData }, { data: advancesData }, { data: oneTimeAdjData }, { data: groupsData }, { data: loanReliefData }, { data: taxSlabsData }, { data: taxSettingsData }, { data: leaveBalanceRows }, { data: approvedLeaveRequests }] = await Promise.all([
      fetchAllAttendanceForMonth(fromDate, toDate),
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
      supabase.from("employee_tax_settings").select("*"),
      // Leave-first offset for Management (see the loop below) needs each
      // employee's opening balance and every already-Approved leave request.
      supabase.from("leaves").select("employee_code, employee_id, opening_balance"),
      supabase.from("leave_requests").select("employee_code, leave_type, days, reason").eq("status", "Approved"),
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

    // Every employee gets one unpaid Mon-Fri day off per week; a week's lone
    // Mon-Fri Absent day is that off day, not a real absence (see
    // getWeeklyOffOverrideKeys) — otherwise absentDeduction in payrollRules.js
    // would wrongly dock a day's pay for it. Applied here so it's consistent
    // with the same rule on the Timesheet and Final Settlement pages.
    const weeklyOffOverrides = getWeeklyOffOverrideKeys(att || [], { employeeKey: "employee_code", rangeStart: fromDate, rangeEnd: toDate });

    // Extra Working Days: a block worked straight through with no rest at
    // all (see getFullyWorkedBlockKeys) -- replaces trusting attendance.
    // extra_day_eligible, which was set from employee_work_rosters (the
    // same roster the override above already treats as unreliable), so
    // "day off" means the same thing on both the earning and deduction
    // side of payroll instead of trusting the roster for one and a
    // behavior-based guess for the other.
    // Per-employee tenure window so a block that predates a mid-month joiner
    // (or follows a mid-month leaver) isn't credited an EWD just because the
    // days outside their tenure have no attendance row -- see
    // getFullyWorkedBlockKeys. joining_date / last_working_day are only trusted
    // when they actually fall in this month, mirroring the proration guard
    // further down (a stale/rehire date from a later stint would otherwise
    // wrongly suppress every block).
    const employmentBounds = Object.fromEntries((employees || []).map(e => [
      e.employee_code,
      {
        start: (e.joining_date && e.joining_date >= fromDate && e.joining_date <= toDate) ? e.joining_date : null,
        end: (["Resigned", "Terminated"].includes(e.status) && e.last_working_day && e.last_working_day >= fromDate && e.last_working_day <= toDate) ? e.last_working_day : null,
      },
    ]));
    const fullyWorkedBlocks = getFullyWorkedBlockKeys(att || [], { employeeKey: "employee_code", rangeStart: fromDate, rangeEnd: toDate, employmentBounds });

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
      const s = isOverriddenOff ? "Weekly Off" : (a.attendance_status || a.status || "");
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
      attByEmp[c].workedHours += Number(a.worked_hours || 0);
      // A day the employee wasn't actually working owed nothing toward the
      // OT-eligibility denominator: a Weekly Off (JS-inferred or real
      // roster-driven) because no work was expected at all, an Absent day
      // because that shortfall is already penalized on its own via
      // absentDeduction below (dailyRate * absentDays) -- counting either
      // one's required_hours here as well would inflate Required Hours and
      // silently wipe out the month's real OT a second time (workedHours -
      // requiredHours nets negative once a day that earned nothing gets its
      // full required hours added on top of days actually worked). Matches
      // Timesheet's rowRequiredHours(). Confirmed against employee 1441,
      // July 2026: 3 real Weekly Off days + 1 Absent day's required hours
      // were being added on top, pushing net OT to a large negative and
      // zeroing it out instead of the ~9h actually earned on days worked.
      // "Gazetted Holiday" excluded too -- a paid public holiday owed no work,
      // so counting its required hours would suppress the month's real OT the
      // same way an Absent/Weekly Off day would (see comment above).
      if (!isOverriddenOff && s !== "Weekly Off" && s !== "Absent" && s !== "Gazetted Holiday") attByEmp[c].requiredHours += Number(a.required_hours || 0);
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
        const lastDayOfMonth = (["Resigned", "Terminated"].includes(emp.status) && emp.last_working_day >= fromDate && emp.last_working_day <= toDate)
          ? Number(emp.last_working_day.slice(8, 10))
          : daysInMonth;
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
        adj.preJoinUnpaidDays = preJoinUnpaidDays;
        adj.absentDays = Number(adj.absentDays || 0) + missingDays + preJoinUnpaidDays;
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
        // Pre-join unpaid days (mid-month joiner) are excluded here -- they're
        // an unworked-period proration, not a leave-coverable absence, so
        // they must not drain the employee's leave balance.
        // Short-hour days only count toward the leave offset when payroll
        // actually charges them (net shortfall past OT_SHORT_MIN_HOURS) --
        // otherwise a sub-threshold fractional-day total would drain leave
        // for a deduction that was never made.
        const shortDeductibleDays = Number(adj.netShortHours || 0) >= OT_SHORT_MIN_HOURS
          ? Number(adj.shortHourFractionalDays || 0) : 0;
        const deductibleDays =
          Number(adj.absentDays || 0) - Number(adj.preJoinUnpaidDays || 0) +
          Number(adj.halfDays || 0) * 0.5 + shortDeductibleDays;

        // Always clear out a prior run's auto-adjustment row for this exact
        // month before recomputing -- Refresh Payroll can be clicked
        // repeatedly, and the offset must reflect the employee's real,
        // current balance each time, not compound on top of itself.
        await supabase.from("leave_requests")
          .delete()
          .eq("employee_code", emp.employee_code)
          .eq("status", "Approved")
          .ilike("reason", `%${AUTO_LEAVE_OFFSET_TAG}%`);

        if (deductibleDays > 0.004) {
          const { remaining } = calcRemainingLeaveBalance({
            staffLevel: emp.staff_level,
            joiningDate: emp.joining_date,
            openingBalance: leaveBalanceByEmp[emp.employee_code]?.opening_balance,
            approvedRequests: approvedLeaveByEmp[emp.employee_code] || [],
          });
          const offsetDays = Math.round(Math.min(deductibleDays, Math.max(0, remaining)) * 100) / 100;
          if (offsetDays > 0.004) {
            adj.leaveOffsetDays = offsetDays;
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

  async function generatePayroll() {
    if (!canGenerate) return setErr("Access denied.");
    setGenerating(true); setErr(""); setMsg("");
    try {
      const rows = await buildPayrollRows();
      let payloadRows = buildPayloadRows(rows);
      payloadRows = await mergePersistentPayrollFields(month, payloadRows);
      // Result was previously ignored -- a silently failed/partial delete
      // (RLS, network blip, anything) let the insert below stack a second
      // full set on top of the first instead of replacing it. Confirmed:
      // July 2026 ended up with 293 duplicate rows this way. A DB-level
      // unique constraint on (employee_code, payroll_month) now backstops
      // this too, but abort loudly here rather than let that constraint
      // reject every row's insert one at a time.
      const { error: deleteError } = await supabase.from("payroll").delete().eq("payroll_month", month);
      if (deleteError) throw new Error(`Could not clear existing payroll for ${month} before regenerating: ${deleteError.message}`);
      if (payloadRows.length > 0) {
        const { error } = await supabase.from("payroll").insert(payloadRows);
        if (error) {
          const minimal = payloadRows.map(r => ({
            employee_code: r.employee_code,
            payroll_month: month, gross_salary: r.gross_salary,
            net_salary: r.net_salary, status: r.status, generated_at: r.generated_at,
          }));
          const { error: minimalError } = await supabase.from("payroll").insert(minimal);
          if (minimalError) {
            // Both attempts failed — the delete already went through, so the
            // table is now empty for this month. Do NOT report success or
            // show the freshly computed rows: that would display data the
            // database doesn't actually have, and it'll vanish the next time
            // this page loads (which is exactly the bug being fixed here).
            throw new Error(`Save failed: ${minimalError.message}`);
          }
        }
      }
      const verifCount = await generateVerificationsForMonth(month).catch(() => 0);
      await generateCashIncentiveSnapshot(month).catch(() => {});
      await deductIssuedAdvancesForMonth(month).catch(() => {});
      await loadPayroll();
      await loadLockAndExtras();
      setMsg(`Payroll generated for ${rows.length} employees.${verifCount > 0 ? ` Sent to ${verifCount} supervisor(s) for verification.` : ""}`);
    } catch (e) { setErr(e.message); }
    finally { setGenerating(false); }
  }

  async function refreshPayroll() {
    if (!canRefresh) return setErr("Access denied.");
    setRefreshing(true); setErr(""); setMsg("");
    try {
      const rows = await buildPayrollRows();
      const payloadRows = buildPayloadRows(rows);
      // Update existing payroll records (don't delete — preserve status).
      // Was one sequential awaited request per employee (~300 serial round
      // trips for a full company — the concurrency=8 batching that replaced
      // an even worse fully-sequential loop still meant ~35+ round trips,
      // which is what was actually taking ~50s). A single bulk upsert does
      // the same in one round trip.
      // Rows for an employee not already generated this month are skipped,
      // same as before — Refresh has never added newly-eligible employees.
      // Keyed on the natural (employee_code, payroll_month) unique
      // constraint, not each row's cached `id` from the currently-loaded
      // payrollRows -- that id can be stale (this page hasn't been reloaded
      // since a regenerate, or another session/direct fix touched the
      // table), and upserting a stale id creates a phantom new row instead
      // of updating the real one, colliding with the constraint. Matching
      // on employee_code+payroll_month always finds and updates the real
      // row regardless of what id this page's stale state remembers.
      const codesWithExistingRow = new Set(payrollRows.map(r => r.employee_code));
      const now = new Date().toISOString();
      const updateRows = payloadRows
        .filter(r => codesWithExistingRow.has(r.employee_code))
        .map(r => ({ ...r, generated_at: now }));
      const skipped = payloadRows.length - updateRows.length;
      let failed = 0;
      let firstError = "";
      if (updateRows.length > 0) {
        const { error } = await supabase.from("payroll").upsert(updateRows, { onConflict: "employee_code,payroll_month" });
        if (error) { failed = updateRows.length; firstError = error.message; }
      }
      await loadPayroll();
      const ts = new Date().toLocaleTimeString("en-PK");
      if (failed > 0) {
        setErr(`Refresh failed: ${firstError}`);
      } else if (skipped > 0) {
        setMsg(`Payroll refreshed for ${updateRows.length} employees at ${ts} (${skipped} not yet generated, skipped).`);
      } else {
        setMsg(`Payroll refreshed for ${updateRows.length} employees at ${ts}.`);
      }
    } catch (e) { setErr(e.message); }
    finally { setRefreshing(false); }
  }

  function buildPayloadRows(rows) {
    // employee_name is deliberately NOT included here — the live payroll
    // table has no such column (confirmed via PGRST204 "Could not find the
    // 'employee_name' column" on every insert/update). The name is always
    // available by joining employee_code back to the employees table on
    // display (see displayRows below), so nothing is lost by omitting it.
    return rows.map(r => ({
      employee_code: r.employeeCode,
      payroll_month: month,
      gross_salary: r.gross,
      number_of_working_days: r.numberOfWorkingDays,
      present_days: r.presentDays,
      absent_days: r.absentDays,
      ot_hours: r.otHours,
      worked_hours: r.workedHours,
      required_hours: r.requiredHours,
      late_count: r.lateCount,
      leave_days_used: r.leaveDaysUsed,
      extra_working_days: r.extraWorkingDays,
      gh_worked_days: r.ghWorkedDays,
      overtime_amount: r.overtimeAmount,
      commission_addon: r.commissionAddOn,
      arrears: r.arrears,
      absent_adjustment: r.absentAdjustment,
      fuel_allowance: r.fuelAllowance,
      other_amount: r.otherEarnings,
      extra_working_days_amount: r.extraWorkingDaysAmount,
      gh_worked_amount: r.ghWorkedAmount,
      leave_adjustment: r.leaveAdjustment,
      total_earnings: r.totalEarnings,
      late_deduction: r.lateDeduction,
      short_hour_deduction: r.shortHourDeduction,
      absent_deduction: r.absentDeduction,
      half_day_deduction: r.halfDayDeduction,
      fines: r.fineDeduction,
      fine_deduction: r.fineDeduction,
      shortage_deduction: r.shortageDeduction,
      advance_deduction: r.advanceDeduction,
      advance: r.advanceDeduction,
      loan_deduction: r.loanDeduction,
      tax_deduction: r.taxDeduction,
      eobi_deduction: r.eobiDeduction,
      other_deductions: r.otherDeductions,
      total_deductions: r.totalDeductions,
      net_salary: r.finalSalary,
      status: "Draft",
      generated_at: new Date().toISOString(),
    }));
  }

  async function updateStatus(newStatus) {
    if (newStatus === "Approved" && role !== "Master") return setErr("Only Master can approve payroll.");
    await supabase.from("payroll").update({ status: newStatus }).eq("payroll_month", month);
    setPayrollStatus(newStatus);
    setMsg(`Payroll marked as ${newStatus}.`);
  }

  async function publishPayroll() {
    const ts = new Date().toISOString();
    await supabase.from("payroll").update({
      status: "Published", published_by: role, published_at: ts,
    }).eq("payroll_month", month);
    setPayrollStatus("Published");
    setPublishedBy(role);
    setPublishedAt(ts);
    setShowPublishModal(false);
    setMsg(`Payroll published by ${role}.`);
    displayRows.filter(r => ["Normal", "FnF"].includes(r.paymentStatus)).forEach(r => {
      queueWhatsappMessage({
        employeeCode: r.employeeCode, messageType: MESSAGE_TYPES.PAYSLIP_READY,
        templateVariables: [r.name, month],
      }).catch(() => {});
    });
  }

  async function doUnlock(reason) {
    try {
      await unlockPayrollMonth(month, actorName || role, reason);
      await loadLockAndExtras();
      setShowUnlockModal(false);
      setMsg(`Payroll unlocked for ${month}. Reason logged: ${reason}`);
    } catch (e) { setErr(e.message); }
  }

  // Routed through mark_payroll_paid (SECURITY DEFINER) instead of a direct
  // update -- Finance has no write access to `loans`, but marking an
  // employee paid also needs to decrement that month's loan_deduction off
  // their active loan's outstanding_balance (previously never happened at
  // all; see loan_approval_workflow migration notes).
  async function markPaid(code) {
    const { error } = await supabase.rpc("mark_payroll_paid", {
      p_payroll_month: month, p_employee_code: code, p_actor_name: actorName || role,
    });
    if (error) { setErr(error.message); return; }
    setPayrollRows(prev => prev.map(r => (r.employee_code === code) ? { ...r, is_paid: true, paid_at: new Date().toISOString(), paid_by: actorName || role } : r));
    const paidRow = displayRows.find(r => r.employeeCode === code);
    if (paidRow) {
      queueWhatsappMessage({
        employeeCode: code, messageType: MESSAGE_TYPES.PAYMENT_MADE,
        templateVariables: [paidRow.name, money(paidRow.finalSalary), month],
      }).catch(() => {});
    }
    checkCompletion();
  }

  async function markAllPaid() {
    if (!canMarkPaid) return;
    setMarking(true);
    try {
      const payable = filteredRows.filter(r => ["Normal", "FnF"].includes(r.paymentStatus) && !r.isPaid);
      for (const r of payable) await markPaid(r.employeeCode);
      setMsg(`Marked ${payable.length} employees as Paid.`);
    } finally { setMarking(false); }
  }

  async function checkCompletion() {
    const { data } = await supabase.from("payroll").select("employee_code, payment_status, is_paid").eq("payroll_month", month);
    if (!data || data.length === 0) return;
    const payable = data.filter(r => ["Normal", "FnF"].includes(r.payment_status || "Normal"));
    const allPaid = payable.length > 0 && payable.every(r => r.is_paid);
    if (allPaid && payrollStatus !== "Completed") {
      await supabase.from("payroll").update({ status: "Completed" }).eq("payroll_month", month);
      setPayrollStatus("Completed");
      await Promise.all(["HR", "Master"].map(r => supabase.from("notifications").insert({
        recipient_role: r, type: "payroll", title: "Payroll Completed",
        message: `${month} payroll is complete — all Normal/F&F employees have been paid.`, is_read: false,
      }))).catch(() => {});
    }
  }

  async function handleFlagRespond(notification, message) {
    try {
      await respondToFlag(notification, message);
      await loadLockAndExtras();
      setMsg("Response sent to supervisor.");
    } catch (e) { setErr(e.message); }
  }

  function exportExcel() {
    const rows = filteredRows.map(r => ({
      "Branch": r.branch, "Department": r.department,
      "Employee Code": r.employeeCode, "Name": r.name, "Level": r.level,
      "Working Days": r.numberOfWorkingDays, "Days Present": r.presentDays, "Days Absent": r.absentDays,
      "Worked Hours": roundN(r.workedHours, 2), "Required Hours": roundN(r.requiredHours, 1),
      "OT Hours": roundN(r.otHours, 2), "Leave Days": r.leaveDaysUsed, "Extra Working Days": r.extraWorkingDays,
      "Gazetted Holiday Worked": r.ghWorkedDays,
      "Basic Salary": r.basicSalary, "OT Amount": r.overtimeAmount,
      "Commission": r.commissionAddOn, "Fuel Allowance": r.fuelAllowance, "Other Earnings": r.otherEarnings,
      "Extra WD Amount": r.extraWorkingDaysAmount, "GH Worked Amount": r.ghWorkedAmount, "Total Earnings": r.totalEarnings,
      "Late Deduction": r.lateDeduction, "Short Hour Deduction": r.shortHourDeduction,
      "Absent Deduction": r.absentDeduction, "Half Day Deduction": r.halfDayDeduction, "Fine": r.fineDeduction, "Shortage": r.shortageDeduction,
      "Advance": r.advanceDeduction, "Loan Deduction": r.loanDeduction,
      "Tax": r.taxDeduction, "EOBI": r.eobiDeduction, "Other Deductions": r.otherDeductions,
      "Total Deductions": r.totalDeductions, "Net Pay": r.finalSalary, "Last Pay": r.lastPay,
      "Payment Status": PAYMENT_STATUS_LABELS[r.paymentStatus] || r.paymentStatus,
      "Status": r.status || payrollStatus,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Payroll");
    const branchPart = branchFilter ? `${branchFilter.replace(/\s+/g, "-")}_` : "";
    const datePart = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Payroll_${month}_${branchPart}${datePart}.xlsx`);
  }

  const empByCode = useMemo(() => Object.fromEntries((employees || []).map(e => [e.employee_code, e])), [employees]);

  const displayRows = useMemo(() => payrollRows.map(r => {
    const code = r.employeeCode || r.employee_code;
    const emp = empByCode[code] || {};
    const basicSalary          = r.gross || r.gross_salary || 0;
    const overtimeAmount       = r.overtimeAmount || r.overtime_amount || r.ot_amount || 0;
    const commissionAddOn      = r.commissionAddOn || r.commission_addon || 0;
    const fuelAllowance        = r.fuelAllowance || r.fuel_allowance || r.fuel || 0;
    const otherEarnings        = r.otherEarnings || r.other_earnings || r.otherAmount || r.other_amount || 0;
    const extraWorkingDaysAmount = r.extraWorkingDaysAmount || r.extra_working_days_amount || 0;
    const ghWorkedAmount = r.ghWorkedAmount || r.gh_worked_amount || 0;
    const leaveAdjustment = r.leaveAdjustment || r.leave_adjustment || 0;
    const totalEarnings = basicSalary + overtimeAmount + commissionAddOn +
      fuelAllowance + otherEarnings + extraWorkingDaysAmount + ghWorkedAmount + leaveAdjustment +
      (r.arrears || 0) + (r.absentAdjustment || r.absent_adjustment || 0);

    const lateDeduction        = r.lateDeduction || r.late_deduction || 0;
    const shortHourDeduction   = r.shortHourDeduction || r.short_hour_deduction || 0;
    const absentDeduction      = r.absentDeduction || r.absent_deduction || 0;
    const halfDayDeduction     = r.halfDayDeduction || r.half_day_deduction || 0;
    const fineDeduction        = r.fineDeduction || r.fine_deduction || r.fines || 0;
    const shortageDeduction    = r.shortageDeduction || r.shortage_deduction || 0;
    const advanceDeduction     = r.advanceDeduction || r.advance_deduction || r.advance || 0;
    const loanDeduction        = r.loanDeduction || r.loan_deduction || 0;
    const taxDeduction         = r.taxDeduction || r.tax_deduction || 0;
    const eobiDeduction        = r.eobiDeduction || r.eobi_deduction || 0;
    const otherDeductions      = r.otherDeductions || r.other_deductions || 0;
    const totalDeductions = lateDeduction + shortHourDeduction + absentDeduction + halfDayDeduction +
      fineDeduction + shortageDeduction + advanceDeduction + loanDeduction + taxDeduction + eobiDeduction + otherDeductions;

    return {
      employeeCode: code, name: r.name || r.employee_name || emp.full_name || code, level: r.level || emp.staff_level || "—",
      status: r.status || payrollStatus,
      paymentStatus: r.payment_status || "Normal",
      isPaid: !!r.is_paid, paidAt: r.paid_at, paidBy: r.paid_by,
      holdoverFromMonth: r.holdover_from_month || null, holdoverAmount: Number(r.holdover_amount || 0),
      branch: r.branch || emp.branch || "—",
      department: r.department || r.dept || emp.department || "—",
      isAttendanceExempt: !!(r.isAttendanceExempt || r.is_attendance_exempt),
      numberOfWorkingDays: r.numberOfWorkingDays || r.number_of_working_days || 0,
      presentDays: r.presentDays || r.present_days || 0,
      absentDays: r.absentDays || r.absent_days || 0,
      otHours: r.otHours || r.ot_hours || 0,
      workedHours: r.workedHours || r.worked_hours || 0,
      requiredHours: r.requiredHours || r.required_hours || 0,
      lateCount: r.lateCount || r.late_count || 0,
      leaveDaysUsed: r.leaveDaysUsed || r.leave_days_used || 0,
      extraWorkingDays: r.extraWorkingDays || r.extra_working_days || 0,
      ghWorkedDays: r.ghWorkedDays || r.gh_worked_days || 0,
      basicSalary, overtimeAmount, commissionAddOn, fuelAllowance,
      otherEarnings, extraWorkingDaysAmount, ghWorkedAmount, leaveAdjustment, totalEarnings,
      lateDeduction, shortHourDeduction, absentDeduction, halfDayDeduction,
      fineDeduction, shortageDeduction, advanceDeduction, loanDeduction,
      taxDeduction, eobiDeduction, otherDeductions, totalDeductions,
      finalSalary: totalEarnings - totalDeductions, gross: basicSalary,
      arrears: r.arrears || 0,
      lastPay: lastPayByCode[code] || 0,
    };
  }), [payrollRows, payrollStatus, empByCode, lastPayByCode]);

  const branchOptions = useMemo(() =>
    Array.from(new Set(displayRows.map(r => r.branch).filter(Boolean))).sort(), [displayRows]);
  const deptOptions = useMemo(() =>
    Array.from(new Set(displayRows.filter(r => !branchFilter || r.branch === branchFilter).map(r => r.department).filter(Boolean))).sort(),
    [displayRows, branchFilter]);

  const filteredRows = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return displayRows.filter(r => {
      if (paymentStatusFilter !== "All" && r.paymentStatus !== paymentStatusFilter) return false;
      if (branchFilter && r.branch !== branchFilter) return false;
      if (deptFilter && r.department !== deptFilter) return false;
      if (levelFilter && r.level !== levelFilter) return false;
      if (q && !(r.name || "").toLowerCase().includes(q) && !(r.employeeCode || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [displayRows, searchText, branchFilter, deptFilter, levelFilter, paymentStatusFilter]);

  const filteredTotals = useMemo(() => filteredRows.reduce((s, r) => ({
    totalBasic: s.totalBasic + r.basicSalary,
    totalEarnings: s.totalEarnings + r.totalEarnings,
    totalDeductions: s.totalDeductions + r.totalDeductions,
    netPay: s.netPay + r.finalSalary,
    totalLastPay: s.totalLastPay + r.lastPay,
  }), { totalBasic: 0, totalEarnings: 0, totalDeductions: 0, netPay: 0, totalLastPay: 0 }), [filteredRows]);

  const holdCount = useMemo(() => displayRows.filter(r => r.paymentStatus === "Hold").length, [displayRows]);

  const SORT_ACCESSORS = {
    name: r => (r.name || "").toLowerCase(),
    employeeCode: r => { const n = Number(r.employeeCode); return isNaN(n) ? r.employeeCode : n; },
    branch: r => (r.branch || "").toLowerCase(),
    department: r => (r.department || "").toLowerCase(),
    level: r => (r.level || "").toLowerCase(),
    numberOfWorkingDays: r => r.numberOfWorkingDays,
    presentDays: r => r.presentDays,
    absentDays: r => r.absentDays,
    leaveDaysUsed: r => r.leaveDaysUsed,
    extraWorkingDays: r => r.extraWorkingDays,
    otHours: r => r.otHours,
    workedHours: r => r.workedHours,
    requiredHours: r => r.requiredHours,
    basicSalary: r => r.basicSalary,
    extraWorkingDaysAmount: r => r.extraWorkingDaysAmount,
    overtimeAmount: r => r.overtimeAmount,
    commissionAddOn: r => r.commissionAddOn,
    fuelAllowance: r => r.fuelAllowance,
    otherEarnings: r => r.otherEarnings,
    allowances: r => r.totalEarnings - r.basicSalary,
    lateDeduction: r => r.lateDeduction,
    shortHourDeduction: r => r.shortHourDeduction,
    fineDeduction: r => r.fineDeduction,
    shortageDeduction: r => r.shortageDeduction,
    advanceDeduction: r => r.advanceDeduction,
    loanDeduction: r => r.loanDeduction,
    taxDeduction: r => r.taxDeduction,
    eobiDeduction: r => r.eobiDeduction,
    otherDeductions: r => r.otherDeductions,
    totalDeductions: r => r.totalDeductions,
    finalSalary: r => r.finalSalary,
    lastPay: r => r.lastPay,
    paymentStatus: r => r.paymentStatus,
  };

  function sumRows(rows, field) { return rows.reduce((s, r) => s + (r[field] || 0), 0); }

  // Default sort: Branch A-Z → Department A-Z → Employee Name A-Z.
  // Clicking a column header overrides this with a single-key sort.
  const sortedRows = useMemo(() => {
    const rows = [...filteredRows];
    if (sortKey && SORT_ACCESSORS[sortKey]) {
      const acc = SORT_ACCESSORS[sortKey];
      rows.sort((a, b) => {
        const av = acc(a), bv = acc(b);
        if (av < bv) return sortDir === "asc" ? -1 : 1;
        if (av > bv) return sortDir === "asc" ? 1 : -1;
        return 0;
      });
    } else {
      rows.sort((a, b) =>
        (a.branch || "").localeCompare(b.branch || "") ||
        (a.department || "").localeCompare(b.department || "") ||
        (a.name || "").localeCompare(b.name || ""));
    }
    return rows;
  }, [filteredRows, sortKey, sortDir]);

  useEffect(() => { setCurrentPage(1); }, [searchText, branchFilter, deptFilter, levelFilter, paymentStatusFilter, pageSize, sortKey, sortDir, month]);

  const pageCount = pageSize === "All" ? 1 : Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const safePage = Math.min(currentPage, pageCount);
  const pagedRows = useMemo(() => {
    if (pageSize === "All") return sortedRows;
    const start = (safePage - 1) * pageSize;
    return sortedRows.slice(start, start + pageSize);
  }, [sortedRows, safePage, pageSize]);

  const STICKY1_W = 44;
  const TH = ({ children, className = "", sticky, sortField }) => (
    <th onClick={sortField ? () => toggleSort(sortField) : undefined}
      className={`text-left px-2.5 py-2 font-medium text-xs whitespace-nowrap sticky top-0 z-10 bg-slate-50 shadow-[0_1px_3px_rgba(0,0,0,0.08)] ${sticky === "first" ? "left-0 z-20 w-11" : sticky === "second" ? "z-20" : ""} ${sortField ? "cursor-pointer select-none hover:bg-slate-100" : ""} ${className}`}
      style={sticky === "second" ? { left: STICKY1_W } : undefined}>
      {children}{sortField && <span className="ml-0.5 text-slate-400">{sortKey === sortField ? (sortDir === "asc" ? "↑" : "↓") : "↕"}</span>}
    </th>
  );
  // Sticky cells need an opaque background matching the row's own color
  // (alternating stripe / hover) — callers must include a bg-* class.
  const TD = ({ children, className = "", sticky = false, ...rest }) => (
    <td {...rest} className={`px-2.5 py-1.5 text-sm whitespace-nowrap ${sticky === "first" ? "sticky left-0 z-[5] w-11 shadow-[2px_0_4px_rgba(0,0,0,0.06)]" : sticky === "second" ? "sticky z-[5] shadow-[2px_0_4px_rgba(0,0,0,0.06)]" : ""} ${className}`}
      style={sticky === "second" ? { left: STICKY1_W } : undefined}>{children}</td>
  );

  const visibleTabs = TABS.filter(([k]) => {
    if (k === "cash") return ["Master", "GM"].includes(role);
    if (k === "hold") return ["Master", "HR", "GM"].includes(role);
    if (k === "settlement") return ["Master", "HR", "GM", "Finance"].includes(role);
    if (k === "finance") return ["Finance", "Master"].includes(role);
    return true;
  });

  // Finance blocked from Draft payroll
  if (financeBlocked && tab === "register") {
    return (
      <div>
        <PageTitle title="Payroll Processing" subtitle="Payroll for Finance view." />
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8 text-center">
          <p className="text-amber-700 font-medium text-lg">No Published Payroll</p>
          <p className="text-amber-600 text-sm mt-2">Finance can only view payroll after it has been Published by Master.</p>
          <div className="mt-4">
            <select value={month} onChange={e => setMonth(e.target.value)}
              className="px-4 py-2 rounded-xl border border-amber-200 text-sm bg-white">
              {Array.from({ length: 12 }, (_, i) => {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                return <option key={val} value={val}>{val}</option>;
              })}
            </select>
          </div>
          {visibleTabs.length > 1 && (
            <div className="flex flex-wrap gap-2 justify-center mt-4">
              {visibleTabs.filter(([k]) => k !== "register").map(([k, l]) => (
                <button key={k} onClick={() => setTab(k)} className="px-4 py-2 rounded-xl text-sm font-medium bg-white border border-amber-200 text-amber-700 hover:bg-amber-100">{l}</button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      {showPublishModal && <PublishModal month={month} onConfirm={publishPayroll} onCancel={() => setShowPublishModal(false)} />}
      {showUnlockModal && <UnlockModal month={month} onConfirm={doUnlock} onCancel={() => setShowUnlockModal(false)} />}
      <PayslipModal row={selectedPayslip} month={month} onClose={() => setSelectedPayslip(null)} />
      {paymentStatusRow && (
        <PaymentStatusModal row={paymentStatusRow} month={month} role={role}
          onClose={() => setPaymentStatusRow(null)}
          onSubmitted={() => { setPaymentStatusRow(null); setMsg("Payment status change submitted for approval."); }} />
      )}

      <PageTitle title="Payroll Processing" subtitle="Auto-calculate payroll from attendance and policy." />

      {visibleTabs.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {visibleTabs.map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition ${tab === k ? "bg-slate-950 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
              {l}{k === "hold" && holdCount > 0 && <span className="ml-1.5 bg-red-500 text-white text-[10px] rounded-full px-1.5">{holdCount}</span>}
            </button>
          ))}
        </div>
      )}

      {tab === "hold" && <PayrollHold role={role} actorName={actorName} month={month} setMonth={setMonth} />}
      {tab === "settlement" && <FinalSettlement role={role} actorName={actorName} />}
      {tab === "cash" && <CashIncentives role={role} actorName={actorName} month={month} setMonth={setMonth} />}
      {tab === "finance" && <FinanceReconciliation role={role} month={month} setMonth={setMonth} actorName={actorName} />}

      {tab === "register" && (
      <>
      {/* Controls */}
      <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <p className="text-xs text-slate-500 mb-1">Payroll Month</p>
            <input type="month" value={month} onChange={e => setMonth(e.target.value)}
              className="px-4 py-2 rounded-xl border border-slate-200 text-sm" />
          </div>
          <div className="flex items-center gap-2 mt-4">
            <Badge tone={STATUS_TONES[payrollStatus] || "slate"}>{payrollStatus}</Badge>
            {isLocked && (
              <span title={`Payroll locked on ${lockInfo?.locked_at?.slice(0, 10)}. Contact Master to unlock.`}>
                <Badge tone="purple">🔒 LOCKED</Badge>
              </span>
            )}
            {isPublished && publishedBy && (
              <span className="text-xs text-slate-500">Published by {publishedBy} · {publishedAt?.slice(0, 10)}</span>
            )}
          </div>
          <div className="flex gap-2 mt-4 flex-wrap">
            {canGenerate && (
              <Button onClick={generatePayroll} disabled={generating} className="rounded-2xl">
                {generating ? "Generating..." : "Generate Payroll"}
              </Button>
            )}
            {canRefresh && displayRows.length > 0 && (
              <Button onClick={refreshPayroll} disabled={refreshing} variant="outline" className="rounded-2xl">
                {refreshing ? "Refreshing..." : "↺ Refresh Payroll"}
              </Button>
            )}
            {canApprove && displayRows.length > 0 && (
              <Button variant="outline" onClick={() => updateStatus("Approved")} className="rounded-2xl">Approve</Button>
            )}
            {canPublish && (
              <Button onClick={() => setShowPublishModal(true)} className="rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white">
                Publish Payroll
              </Button>
            )}
            {role === "Master" && isLocked && (
              <Button onClick={() => setShowUnlockModal(true)} variant="outline" className="rounded-2xl border-purple-200 text-purple-700">
                Unlock Payroll
              </Button>
            )}
            {canMarkPaid && filteredRows.some(r => ["Normal", "FnF"].includes(r.paymentStatus) && !r.isPaid) && (
              <Button onClick={markAllPaid} disabled={marking} className="rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white">
                {marking ? "Marking…" : "Mark All Paid"}
              </Button>
            )}
          </div>
        </div>
      </div>

      <BranchComparisonSummary month={month} />

      {isPublished && role !== "Finance" && (
        <div className="mb-3 p-3 rounded-xl bg-purple-50 text-purple-700 text-sm">
          🔒 Payroll is Published. HR cannot make changes. Finance can view this payroll.
          {role === "Master" && " Master can still make corrections via the correction log."}
        </div>
      )}

      {holdCount > 0 && ["HR", "Master", "GM"].includes(role) && (
        <div className="mb-3 p-3 rounded-xl bg-amber-50 text-amber-700 text-sm">
          ⚠️ {holdCount} employee{holdCount > 1 ? "s are" : " is"} on Hold status. Review in the Hold & F&F tab.
        </div>
      )}

      {msg && <div className="mb-3 p-3 rounded-xl bg-blue-50 text-blue-700 text-sm">{msg}</div>}
      {err && <div className="mb-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{err}</div>}

      <SummaryPanel month={month} displayRows={displayRows} />

      {["HR", "Master"].includes(role) && (
        <VerificationPanel month={month} role={role} verifications={verifications} flagNotifications={flagNotifications} onRespond={handleFlagRespond} />
      )}

      {/* Filter bar */}
      {displayRows.length > 0 && (
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm mb-4">
          <div className="flex flex-wrap items-center gap-2">
            <input type="text" value={searchText} onChange={e => setSearchText(e.target.value)}
              placeholder="🔍 Search name or code…"
              className="px-3 py-2 rounded-xl border border-slate-200 text-sm w-52" />
            <select value={branchFilter} onChange={e => { setBranchFilter(e.target.value); setDeptFilter(""); }}
              className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white">
              <option value="">All Branches</option>
              {branchOptions.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
            <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white">
              <option value="">All Departments</option>
              {deptOptions.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select value={levelFilter} onChange={e => setLevelFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white">
              <option value="">All Levels</option>
              {LEVEL_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
            <select value={paymentStatusFilter} onChange={e => setPaymentStatusFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white">
              <option value="All">All Payment Status</option>
              {PAYMENT_STATUSES.map(s => <option key={s} value={s}>{PAYMENT_STATUS_LABELS[s]}</option>)}
            </select>
            {(searchText || branchFilter || deptFilter || levelFilter || paymentStatusFilter !== "All") && (
              <Button variant="outline" onClick={clearFilters} className="rounded-xl text-xs">Clear All Filters</Button>
            )}
            <label className="flex items-center gap-1.5 text-xs text-slate-500 ml-auto cursor-pointer select-none">
              <input type="checkbox" checked={showDetailColumns} onChange={e => setShowDetailColumns(e.target.checked)} className="rounded" />
              Show allowance/deduction breakdown
            </label>
            <Button variant="outline" onClick={exportExcel} className="rounded-xl text-xs">Export Excel</Button>
          </div>
          <p className="text-xs text-slate-500 mt-3">
            Showing <strong>{filteredRows.length}</strong> of {displayRows.length} employees
            <span className="mx-2 text-slate-300">|</span>
            Total Basic: <strong>{money(filteredTotals.totalBasic)}</strong>
            <span className="mx-2 text-slate-300">|</span>
            Total Net: <strong>{money(filteredTotals.netPay)}</strong>
            <span className="mx-2 text-slate-300">|</span>
            Total Deductions: <strong>{money(filteredTotals.totalDeductions)}</strong>
          </p>
        </div>
      )}

      {/* Payroll Register Table */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto overflow-y-auto max-h-[70vh]">
        <div className="px-5 pt-4 pb-2 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-slate-800">Payroll Register — {month}</h2>
            <p className="text-xs text-slate-400 mt-0.5">{filteredRows.length} of {displayRows.length} employees</p>
          </div>
        </div>
        <table className="w-full text-sm" style={{ minWidth: "1500px" }}>
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <TH sticky="first">#</TH>
              <TH sticky="second" sortField="name">Employee</TH>
              <TH sortField="employeeCode">Code</TH>
              <TH sortField="branch">Branch</TH>
              <TH sortField="department">Department</TH>
              <TH sortField="level">Level</TH>
              <TH className="text-blue-500" sortField="numberOfWorkingDays">WD</TH>
              <TH className="text-blue-500" sortField="presentDays">Present</TH>
              <TH className="text-blue-500" sortField="absentDays">Absent</TH>
              <TH className="text-blue-500" sortField="leaveDaysUsed">Leave</TH>
              <TH className="text-blue-500" sortField="extraWorkingDays">Extra WD</TH>
              <TH className="text-blue-500" sortField="otHours">OT Hrs</TH>
              <TH className="text-blue-500" sortField="workedHours">Worked Hrs</TH>
              <TH className="text-blue-500" sortField="requiredHours">Req Hrs</TH>
              <TH className="text-emerald-600" sortField="basicSalary">Basic</TH>
              {showDetailColumns && (
                <>
                  <TH className="text-emerald-600" sortField="extraWorkingDaysAmount">Extra WD Amt</TH>
                  <TH className="text-emerald-600" sortField="overtimeAmount">OT Amt</TH>
                  <TH className="text-emerald-600" sortField="commissionAddOn">Commission</TH>
                  <TH className="text-emerald-600" sortField="fuelAllowance">Fuel</TH>
                  <TH className="text-emerald-600" sortField="otherEarnings">Other Earn</TH>
                </>
              )}
              <TH className="text-emerald-600" sortField="allowances">Allowances</TH>
              {showDetailColumns && (
                <>
                  <TH className="text-red-500" sortField="lateDeduction">Late Ded</TH>
                  <TH className="text-red-500" sortField="shortHourDeduction">ShortHr</TH>
                  <TH className="text-red-500" sortField="absentDeduction">Absent Ded</TH>
                  <TH className="text-red-500" sortField="halfDayDeduction">Half Day Ded</TH>
                  <TH className="text-red-500" sortField="fineDeduction">Fine</TH>
                  <TH className="text-red-500" sortField="shortageDeduction">Shortage</TH>
                  <TH className="text-red-500" sortField="advanceDeduction">Advance</TH>
                  <TH className="text-red-500" sortField="loanDeduction">Loan</TH>
                  <TH className="text-red-500" sortField="taxDeduction">Tax</TH>
                  <TH className="text-red-500" sortField="eobiDeduction">EOBI</TH>
                  <TH className="text-red-500" sortField="otherDeductions">Other Ded</TH>
                </>
              )}
              <TH className="text-red-500" sortField="totalDeductions">Deductions</TH>
              <TH className="text-slate-900 bg-slate-100" sortField="finalSalary">Net Pay</TH>
              <TH sortField="lastPay">Last Pay</TH>
              <TH sortField="paymentStatus">Status</TH>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pagedRows.length === 0 ? (
              <tr><td colSpan={20 + (showDetailColumns ? 16 : 0)} className="px-4 py-8 text-center text-slate-400">
                {displayRows.length === 0
                  ? (role === "Finance" ? "No published payroll for this month." : 'No payroll data. Click "Generate Payroll" to calculate.')
                  : "No employees match the current filters."}
              </td></tr>
            ) : pagedRows.map((r, i) => {
              const rowNum = pageSize === "All" ? i + 1 : (safePage - 1) * pageSize + i + 1;
              const rowBg = i % 2 === 0 ? "bg-white" : "bg-slate-50/60";
              // Finance can't view payslip detail for employees not being paid this cycle.
              const payslipBlocked = role === "Finance" && ["Hold", "No_FnF"].includes(r.paymentStatus);
              return (
                <tr key={r.employeeCode || i}
                  onClick={() => { if (!payslipBlocked) setSelectedPayslip(r); }}
                  className={`${payslipBlocked ? "" : "cursor-pointer hover:bg-blue-50"} ${rowBg} ${r.isAttendanceExempt ? "!bg-purple-50/40" : ""}`}>
                  <TD sticky="first" className={rowBg}>{rowNum}</TD>
                  <TD sticky="second" className={rowBg}>
                    <div className="font-medium">{r.name}</div>
                    {r.isAttendanceExempt && <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 rounded">EXEMPTED</span>}
                    {r.holdoverAmount > 0 && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 rounded ml-1">+{money(r.holdoverAmount)} holdover</span>}
                  </TD>
                  <TD className="text-slate-500">{plainCode(r.employeeCode)}</TD>
                  <TD>{r.branch}</TD>
                  <TD>{r.department}</TD>
                  <TD>{r.level}</TD>
                  <TD className="text-blue-600">{r.numberOfWorkingDays}</TD>
                  <TD className="text-blue-600">{r.presentDays}</TD>
                  <TD className="text-blue-600">{r.absentDays}</TD>
                  <TD className="text-blue-600">{r.leaveDaysUsed}</TD>
                  <TD className="text-blue-600">{r.extraWorkingDays}</TD>
                  <TD className="text-blue-600">{roundN(r.otHours, 2)}</TD>
                  <TD className="text-blue-600">{roundN(r.workedHours, 2)}</TD>
                  <TD className="text-blue-600">{roundN(r.requiredHours, 1)}</TD>
                  <TD>{money(r.basicSalary)}</TD>
                  {showDetailColumns && (
                    <>
                      <TD className="text-emerald-600">{money(r.extraWorkingDaysAmount)}</TD>
                      <TD className="text-emerald-600">{money(r.overtimeAmount)}</TD>
                      <TD className="text-emerald-600">{money(r.commissionAddOn)}</TD>
                      <TD className="text-emerald-600">{money(r.fuelAllowance)}</TD>
                      <TD className="text-emerald-600">{money(r.otherEarnings)}</TD>
                    </>
                  )}
                  <TD className="text-emerald-600">{money(r.totalEarnings - r.basicSalary)}</TD>
                  {showDetailColumns && (
                    <>
                      <TD className="text-red-500">{money(r.lateDeduction)}</TD>
                      <TD className="text-red-500">{money(r.shortHourDeduction)}</TD>
                      <TD className="text-red-500">{money(r.absentDeduction)}</TD>
                      <TD className="text-red-500">{money(r.halfDayDeduction)}</TD>
                      <TD className="text-red-500">{money(r.fineDeduction)}</TD>
                      <TD className="text-red-500">{money(r.shortageDeduction)}</TD>
                      <TD className="text-red-500">{money(r.advanceDeduction)}</TD>
                      <TD className="text-red-500">{money(r.loanDeduction)}</TD>
                      <TD className="text-red-500">{money(r.taxDeduction)}</TD>
                      <TD className="text-red-500">{money(r.eobiDeduction)}</TD>
                      <TD className="text-red-500">{money(r.otherDeductions)}</TD>
                    </>
                  )}
                  <TD className="text-red-500">{money(r.totalDeductions)}</TD>
                  <TD className="font-bold text-slate-900 bg-slate-50">{money(r.finalSalary)}</TD>
                  <TD className="text-slate-500">{money(r.lastPay)}</TD>
                  <TD onClick={e => e.stopPropagation()}>
                    <div className="flex flex-col gap-0.5 items-start">
                      {canRequestPaymentStatus ? (
                        <button onClick={() => setPaymentStatusRow(r)} className="cursor-pointer" title="Click to request a status change">
                          {r.paymentStatus === "Normal"
                            ? <span className="text-xs text-slate-400">Normal</span>
                            : <Badge tone={PAYMENT_STATUS_TONES[r.paymentStatus]}>{PAYMENT_STATUS_LABELS[r.paymentStatus]}</Badge>}
                        </button>
                      ) : r.paymentStatus === "Normal" ? (
                        <span className="text-xs text-slate-400">Normal</span>
                      ) : (
                        <Badge tone={PAYMENT_STATUS_TONES[r.paymentStatus]}>{PAYMENT_STATUS_LABELS[r.paymentStatus]}</Badge>
                      )}
                      {r.isPaid ? (
                        <span className="text-[10px] text-emerald-600 font-medium">✓ Paid {r.paidAt?.slice(0, 10)}</span>
                      ) : canMarkPaid && ["Normal", "FnF"].includes(r.paymentStatus) ? (
                        <button onClick={() => markPaid(r.employeeCode)} className="text-[10px] text-blue-600 hover:underline">Mark Paid</button>
                      ) : null}
                    </div>
                  </TD>
                </tr>
              );
            })}
          </tbody>
          {filteredRows.length > 0 && (
            <tfoot className="bg-slate-100 font-semibold text-slate-700">
              <tr>
                <TD colSpan={14} className="font-bold" sticky="first">Totals ({filteredRows.length} employees)</TD>
                <TD>{money(filteredTotals.totalBasic)}</TD>
                {showDetailColumns && (
                  <>
                    <TD>{money(sumRows(filteredRows, "extraWorkingDaysAmount"))}</TD>
                    <TD>{money(sumRows(filteredRows, "overtimeAmount"))}</TD>
                    <TD>{money(sumRows(filteredRows, "commissionAddOn"))}</TD>
                    <TD>{money(sumRows(filteredRows, "fuelAllowance"))}</TD>
                    <TD>{money(sumRows(filteredRows, "otherEarnings"))}</TD>
                  </>
                )}
                <TD className="text-emerald-700">{money(filteredTotals.totalEarnings - filteredTotals.totalBasic)}</TD>
                {showDetailColumns && (
                  <>
                    <TD>{money(sumRows(filteredRows, "lateDeduction"))}</TD>
                    <TD>{money(sumRows(filteredRows, "shortHourDeduction"))}</TD>
                    <TD>{money(sumRows(filteredRows, "absentDeduction"))}</TD>
                    <TD>{money(sumRows(filteredRows, "halfDayDeduction"))}</TD>
                    <TD>{money(sumRows(filteredRows, "fineDeduction"))}</TD>
                    <TD>{money(sumRows(filteredRows, "shortageDeduction"))}</TD>
                    <TD>{money(sumRows(filteredRows, "advanceDeduction"))}</TD>
                    <TD>{money(sumRows(filteredRows, "loanDeduction"))}</TD>
                    <TD>{money(sumRows(filteredRows, "taxDeduction"))}</TD>
                    <TD>{money(sumRows(filteredRows, "eobiDeduction"))}</TD>
                    <TD>{money(sumRows(filteredRows, "otherDeductions"))}</TD>
                  </>
                )}
                <TD className="text-red-700">{money(filteredTotals.totalDeductions)}</TD>
                <TD className="text-slate-900 bg-slate-200">{money(filteredTotals.netPay)}</TD>
                <TD>{money(filteredTotals.totalLastPay)}</TD>
                <TD />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Pagination */}
      {filteredRows.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>Rows per page:</span>
            {PAGE_SIZE_OPTIONS.map(sz => (
              <button key={sz} onClick={() => setPageSize(sz)}
                className={`px-2.5 py-1 rounded-lg border ${pageSize === sz ? "bg-slate-950 text-white border-slate-950" : "border-slate-200 hover:bg-slate-50"}`}>
                {sz}
              </button>
            ))}
            {pageSize === "All" && sortedRows.length > 200 && (
              <span className="text-amber-600 ml-2">⚠️ Loading all {sortedRows.length} rows at once may be slow.</span>
            )}
          </div>
          {pageSize !== "All" && pageCount > 1 && (
            <div className="flex items-center gap-1 text-xs">
              <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={safePage === 1}
                className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50">Previous</button>
              <span className="px-3 py-1.5 text-slate-500">Page {safePage} of {pageCount}</span>
              <button onClick={() => setCurrentPage(p => Math.min(pageCount, p + 1))} disabled={safePage === pageCount}
                className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50">Next</button>
            </div>
          )}
        </div>
      )}
      </>
      )}
    </div>
  );
}
