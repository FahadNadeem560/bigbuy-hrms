import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { Button, Badge, PageTitle } from "../components/ui.jsx";
import { money } from "../utils/format.js";
import * as XLSX from "xlsx";
import {
  PAYMENT_STATUSES, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_TONES,
  canTransitionPaymentStatus, requiresMasterOnly, requestPaymentStatusChange, setPaymentStatusDirect,
  getPayrollLock, lockPayrollMonth, unlockPayrollMonth, mergePersistentPayrollFields,
  generateVerificationsForMonth, fetchVerifications,
  getVerificationProgress, respondToFlag,
  generateCashIncentiveSnapshot,
} from "../services/payrollControlService.js";
import { deductIssuedAdvancesForMonth } from "../services/advanceService.js";
// The monthly calculation itself now lives in the engine service so Final
// Settlement can run the identical math for a leaver's unpaid months.
import { computePayrollForMonth, roundN } from "../services/payrollEngine.js";
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
          You are about to publish the approved payroll for <strong>{month}</strong>.<br /><br />
          After publishing:
        </p>
        <ul className="text-sm text-slate-600 space-y-1 mb-5 list-disc pl-5">
          <li>Payroll becomes visible to Finance, who can then mark it paid</li>
          <li>Payslip notifications go out to every employee being paid</li>
          <li>Return to Draft is gone — corrections need a Master unlock</li>
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
function PaymentStatusModal({ row, month, role, actorName, onClose, onSubmitted }) {
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
      // HR and Master apply Hold / release straight away (explicit policy,
      // 2026-09-04). Anyone else still raises a request for Master/GM.
      if (["HR", "Master"].includes(role)) {
        await setPaymentStatusDirect({
          employeeCode: row.employeeCode, employeeName: row.name, payrollMonth: month,
          currentStatus: row.paymentStatus, newStatus: target, reason,
          actorRole: role, actorName: actorName || role,
        });
        onSubmitted(true);
      } else {
        await requestPaymentStatusChange({
          employeeId: row.id || null, employeeCode: row.employeeCode, employeeName: row.name,
          payrollMonth: month, requestedBy: role, currentStatus: row.paymentStatus, requestedStatus: target, reason,
        });
        onSubmitted(false);
      }
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <h2 className="font-bold text-slate-800 text-lg mb-1">{["HR", "Master"].includes(role) ? "Change Payment Status" : "Request Payment Status Change"}</h2>
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
          <Button onClick={submit} disabled={busy || options.length === 0} className="rounded-2xl flex-1">{busy ? "Saving…" : ["HR", "Master"].includes(role) ? "Apply Change" : "Submit for Approval"}</Button>
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
            {/* Arrears and Absent Adjustment are one-time adjustments; both go
                into totalEarnings but neither was listed here, so a payslip
                carrying one didn't add up to its own total (employee 1897,
                July 2026: 38,000 basic against 40,533 total, with the 2,533
                arrears line nowhere on the slip). */}
            <ERow label="Arrears" value={row.arrears} />
            <ERow label="Absent Adjustment" value={row.absentAdjustment} />
            {!!row.leaveAdjustment && <ERow label="Leave's Adjustment (short hours/half day/absent covered from leave)" value={row.leaveAdjustment} />}
            {/* Backstop: if a new earning is ever added to the engine and not
                to this list, say so rather than showing a total nobody can
                reconcile. */}
            {(() => {
              const listed = [row.basicSalary, row.extraWorkingDaysAmount, row.ghWorkedAmount, row.overtimeAmount,
                row.commissionAddOn, row.fuelAllowance, row.otherEarnings, row.arrears,
                row.absentAdjustment, row.leaveAdjustment]
                .reduce((s, v) => s + Number(v || 0), 0);
              const gap = Math.round(Number(row.totalEarnings || 0) - listed);
              return gap !== 0 ? <ERow label="Unitemised earnings — check the payroll adjustments for this month" value={gap} /> : null;
            })()}
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
    <div className="mb-4 max-w-2xl">
      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 pt-4 pb-2"><h2 className="font-bold text-slate-800">Payroll Summary — {month}</h2></div>
        <table className="w-full text-sm">
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

// Quick sanity check for the register: this month's net vs last month's net.
//  - new        : no prior payroll for this employee (first run / new joiner)
//  - consistent : within the greater of Rs. 500 or 3% of last pay
//  - review     : moved more than that — worth an eyeball before publishing
function deriveCheck(net, lastPay) {
  const payDelta = Math.round(Number(net || 0) - Number(lastPay || 0));
  if (!(Number(lastPay) > 0)) return { lastPay: Number(lastPay || 0), payDelta, checkStatus: "new" };
  const tol = Math.max(500, Number(lastPay) * 0.03);
  return { lastPay: Number(lastPay), payDelta, checkStatus: Math.abs(payDelta) <= tol ? "consistent" : "review" };
}
const CHECK_META = {
  consistent: { label: "Consistent", tone: "green" },
  review:     { label: "Review",     tone: "yellow" },
  new:        { label: "New",        tone: "slate" },
};
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
    <table className="w-full text-xs">
      <thead className="text-slate-400 text-[11px]">
        <tr>
          <th className="text-left px-3 py-1.5 font-medium"> </th>
          <th className="text-right px-3 py-1.5 font-medium">{month}</th>
          <th className="text-right px-3 py-1.5 font-medium">{prevMonth}</th>
          {showDiff && <th className="text-right px-3 py-1.5 font-medium">Difference</th>}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-50">
        <tr><td colSpan={cols} className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50">Earnings</td></tr>
        {EARNING_ROWS.map(([label, key]) => (
          <tr key={key}>
            <td className="px-3 py-1 text-slate-600">{label}</td>
            <td className="px-3 py-1 text-right tabular-nums">{num(cur[key])}</td>
            <td className="px-3 py-1 text-right text-slate-400 tabular-nums">{num(prev[key])}</td>
            {showDiff && <td className="px-3 py-1 text-right tabular-nums">{diffCell(cur[key], prev[key])}</td>}
          </tr>
        ))}
        <tr><td colSpan={cols} className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50">Deductions</td></tr>
        {DEDUCTION_ROWS.map(([label, key]) => (
          <tr key={key}>
            <td className="px-3 py-1 text-slate-600">{label}</td>
            <td className="px-3 py-1 text-right tabular-nums">{num(cur[key])}</td>
            <td className="px-3 py-1 text-right text-slate-400 tabular-nums">{num(prev[key])}</td>
            {showDiff && <td className="px-3 py-1 text-right tabular-nums">{diffCell(cur[key], prev[key])}</td>}
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="bg-slate-900">
          <td className="px-3 py-2 font-bold text-white text-sm">Net Salary</td>
          <td className="px-3 py-2 text-right font-bold text-white text-sm tabular-nums">{num(cur.netSalary)}</td>
          <td className="px-3 py-2 text-right font-bold text-slate-300 text-sm tabular-nums">{num(prev.netSalary)}</td>
          {showDiff && <td className="px-3 py-2 text-right font-bold text-sm bg-slate-900 tabular-nums">{diffCell(cur.netSalary, prev.netSalary)}</td>}
        </tr>
      </tfoot>
    </table>
  );
}

function BranchCard({ branch, cur, prev, month, prevMonth, collapsed, onToggle, total }) {
  const netDiff = Math.round(Number(cur.netSalary || 0) - Number(prev.netSalary || 0));
  return (
    <div className={`bg-white rounded-2xl shadow-sm overflow-hidden ${total ? "border-2 border-slate-800" : "border border-slate-200"} ${!collapsed && !total ? "col-span-full" : ""}`}>
      <button onClick={onToggle}
        className={`w-full px-4 py-2.5 transition text-left ${total ? "bg-slate-800 hover:bg-slate-700" : "bg-slate-50 hover:bg-slate-100"}`}>
        <div className="flex items-center justify-between gap-2">
          <span className={`font-semibold text-sm ${total ? "text-white font-bold" : "text-slate-800"}`}>{collapsed ? "▶" : "▼"} {branch}</span>
          <span className={`text-[11px] ${total ? "text-slate-300" : "text-slate-500"}`}>HC {cur.headCount}<span className="opacity-40"> / </span>{prev.headCount}</span>
        </div>
        <div className="flex items-baseline justify-between gap-2 mt-1">
          <span className={`text-base font-bold ${total ? "text-white" : "text-slate-900"}`}>{num(cur.netSalary)}</span>
          <span className={`text-[11px] ${total ? "text-slate-300" : "text-slate-400"}`}>
            was {num(prev.netSalary)}
            <span className={`ml-1.5 font-semibold ${netDiff === 0 ? "" : netDiff > 0 ? "text-emerald-500" : "text-red-400"}`}>
              {netDiff > 0 ? "+" : ""}{num(netDiff)}
            </span>
          </span>
        </div>
      </button>
      {!collapsed && (
        <div className="overflow-x-auto">
          <div className={total ? "max-w-2xl" : "max-w-xl"}>
            <ComparisonTable cur={cur} prev={prev} month={month} prevMonth={prevMonth} showDiff={total} />
          </div>
        </div>
      )}
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
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
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
        {progress.confirmed === progress.total && progress.total > 0 && <span className="text-emerald-600 font-medium ml-2">All supervisors have verified. Ready for Master to approve.</span>}
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
export default function PayrollAutomation({ role, actorName, initialTab }) {
  const now = new Date();
  const [tab, setTab] = useState(
    initialTab && TABS.some(([k]) => k === initialTab.tab) ? initialTab.tab : "register"
  );
  useEffect(() => {
    if (initialTab && TABS.some(([k]) => k === initialTab.tab)) setTab(initialTab.tab);
  }, [initialTab]);
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
  const [reviewOnly, setReviewOnly] = useState(false);
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
    setSearchText(""); setBranchFilter(""); setDeptFilter(""); setLevelFilter(""); setPaymentStatusFilter("All"); setReviewOnly(false);
  }
  function toggleSort(key) {
    if (sortKey === key) { setSortDir(d => (d === "asc" ? "desc" : "asc")); }
    else { setSortKey(key); setSortDir("asc"); }
  }

  const isPublished = payrollStatus === "Published" || payrollStatus === "Locked" || payrollStatus === "Completed";
  const isLocked = !!lockInfo?.is_locked;
  // Approve freezes the figures. It used to be a label with nothing behind it
  // -- HR could Refresh straight over an "Approved" month and the numbers
  // Master signed off on changed with no trace. Now it is the gate: approving
  // shuts HR out and is what makes Publish available.
  const isApproved  = payrollStatus === "Approved";
  const isFrozen    = isApproved || isPublished;
  const canGenerate = ["Master", "HR"].includes(role) && !isFrozen && !isLocked;
  const canRefresh  = ["Master", "HR"].includes(role) && !isFrozen && !isLocked;
  const canApprove  = role === "Master" && payrollStatus === "Draft" && !isLocked;
  // A bad approval must not be a dead end -- Master can reopen the month for
  // HR right up until it is published.
  const canUnapprove = role === "Master" && isApproved && !isLocked;
  const canPublish  = role === "Master" && isApproved && payrollRows.length > 0 && !isLocked;
  const frozenReason =
    isLocked    ? "Payroll is locked for this month. Master must unlock it first."
    : isPublished ? "Payroll is published for this month and can no longer be changed here."
    : isApproved  ? "Payroll is approved and frozen. Master must return it to Draft before it can be regenerated."
    : "";

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

  // Thin wrapper over the extracted engine -- it closed over exactly these
  // three pieces of state and fetched everything else itself, so Generate /
  // Refresh behave identically to before the move.
  const buildPayrollRows = () => computePayrollForMonth({ month, employees, loans });

  async function generatePayroll() {
    if (!canGenerate) return setErr(frozenReason || "Access denied.");
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
    if (!canRefresh) return setErr(frozenReason || "Access denied.");
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
    if (role !== "Master") return setErr("Only Master can change the payroll status.");
    if (isPublished) return setErr("Payroll is already published — its status cannot be changed here.");
    if (isLocked) return setErr("Payroll is locked. Unlock it first.");
    const { error } = await supabase.from("payroll").update({ status: newStatus }).eq("payroll_month", month);
    if (error) return setErr(error.message);
    setPayrollStatus(newStatus);
    setErr("");
    setMsg(newStatus === "Approved"
      ? `Payroll approved for ${month}. The figures are frozen — HR can no longer Generate or Refresh — and it is now ready to publish.`
      : `Payroll returned to Draft for ${month}. HR can generate and refresh it again.`);
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
      "Δ vs Last Pay": r.checkStatus === "new" ? "" : r.payDelta, "Check": CHECK_META[r.checkStatus].label,
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
      absentAdjustment: r.absentAdjustment || r.absent_adjustment || 0,
      ...deriveCheck(totalEarnings - totalDeductions, lastPayByCode[code] || 0),
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
      if (reviewOnly && r.checkStatus !== "review") return false;
      if (q && !(r.name || "").toLowerCase().includes(q) && !(r.employeeCode || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [displayRows, searchText, branchFilter, deptFilter, levelFilter, paymentStatusFilter, reviewOnly]);

  const reviewCount = useMemo(() => displayRows.filter(r => r.checkStatus === "review").length, [displayRows]);

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
    payDelta: r => r.payDelta,
    checkStatus: r => ({ review: 0, new: 1, consistent: 2 }[r.checkStatus] ?? 3),
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
        <PaymentStatusModal row={paymentStatusRow} month={month} role={role} actorName={actorName}
          onClose={() => setPaymentStatusRow(null)}
          onSubmitted={(appliedDirectly) => {
            setPaymentStatusRow(null);
            setMsg(appliedDirectly ? "Payment status updated." : "Payment status change submitted for approval.");
            if (appliedDirectly) loadPayroll();
          }} />
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
            {canUnapprove && (
              <Button variant="outline" onClick={() => updateStatus("Draft")} className="rounded-2xl">Return to Draft</Button>
            )}
            {canPublish && (
              <Button onClick={() => setShowPublishModal(true)} className="rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white">
                Publish Payroll
              </Button>
            )}
            {role === "Master" && !isApproved && !isPublished && !isLocked && payrollRows.length > 0 && (
              <span className="self-center text-xs text-slate-500">Approve the payroll to enable Publish.</span>
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

      {isApproved && (
        <div className="mb-3 p-3 rounded-xl bg-blue-50 text-blue-700 text-sm">
          ✔ Payroll is Approved for {month}. The figures are frozen — Generate and Refresh are off.
          {role === "Master"
            ? " Publish it, or use Return to Draft to reopen it for HR."
            : " Ask Master to return it to Draft if it needs changing."}
        </div>
      )}

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
            <button onClick={() => setReviewOnly(v => !v)}
              className={`px-3 py-2 rounded-xl text-sm border transition ${reviewOnly ? "bg-amber-500 text-white border-amber-500" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
              ⚠ Needs review{reviewCount > 0 ? ` (${reviewCount})` : ""}
            </button>
            {(searchText || branchFilter || deptFilter || levelFilter || paymentStatusFilter !== "All" || reviewOnly) && (
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
        <table className="w-full text-sm" style={{ minWidth: "1620px" }}>
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
              <TH sortField="payDelta">Δ vs Last</TH>
              <TH sortField="checkStatus">Check</TH>
              <TH sortField="paymentStatus">Status</TH>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pagedRows.length === 0 ? (
              <tr><td colSpan={22 + (showDetailColumns ? 16 : 0)} className="px-4 py-8 text-center text-slate-400">
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
                  <TD className="text-slate-500">{r.lastPay ? money(r.lastPay) : "—"}</TD>
                  <TD className={r.checkStatus === "review" ? (r.payDelta > 0 ? "text-emerald-600" : "text-red-600") : "text-slate-400"}>
                    {r.checkStatus === "new" ? "—" : `${r.payDelta > 0 ? "+" : ""}${money(r.payDelta)}`}
                  </TD>
                  <TD><Badge tone={CHECK_META[r.checkStatus].tone}>{CHECK_META[r.checkStatus].label}</Badge></TD>
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
