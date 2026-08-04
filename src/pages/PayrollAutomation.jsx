import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { Button, Badge, PageTitle } from "../components/ui.jsx";
import { money } from "../utils/format.js";
import { calculatePayrollForEmployee, getWorkingDaysInMonth } from "../utils/payrollRules.js";
import * as XLSX from "xlsx";
import {
  PAYMENT_STATUSES, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_TONES,
  canTransitionPaymentStatus, requiresMasterOnly, requestPaymentStatusChange,
  getPayrollLock, lockPayrollMonth, unlockPayrollMonth, mergePersistentPayrollFields,
  generateVerificationsForMonth, fetchVerifications,
  getVerificationProgress, respondToFlag,
  generateCashIncentiveSnapshot, fetchCashIncentiveMonthly, fetchCashIncentiveBranchTotals,
} from "../services/payrollControlService.js";
import { deductIssuedAdvancesForMonth } from "../services/advanceService.js";
import PayrollHold from "./PayrollHold.jsx";
import CashIncentives from "./CashIncentives.jsx";
import FinanceReconciliation from "./FinanceReconciliation.jsx";
import { queueWhatsappMessage, MESSAGE_TYPES } from "../services/whatsappService.js";

const STATUS_TONES = { Draft: "yellow", Approved: "blue", Published: "green", Locked: "purple", Paid: "green", Completed: "green" };
const TABS = [["register", "Payroll Register"], ["hold", "Hold & F&F"], ["cash", "Confidential Incentives"], ["finance", "Finance Reconciliation"]];

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
                  <div className="font-semibold text-slate-700">{v ?? 0}</div>
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
            <ERow label="OT Amount" value={row.overtimeAmount} />
            <ERow label="Commission" value={row.commissionAddOn} />
            <ERow label="Fuel Allowance" value={row.fuelAllowance} />
            <ERow label="Other Earnings" value={row.otherEarnings} />
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
function SummaryPanel({ month, displayRows, cashIncentiveTotal, role, incentiveMonthlyRows, incentiveBranchTotals }) {
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
    const financeTotal = totalPayable + holdoverAmt + cashIncentiveTotal;
    return { acc, holdoverCount, holdoverAmt, totalGenerated, totalGeneratedAmt, totalPayable, totalPayableCount, financeTotal };
  }, [displayRows, cashIncentiveTotal]);

  if (displayRows.length === 0) return null;
  const Row = ({ label, count, amt, bold, highlight, sub }) => (
    <tr className={highlight ? "bg-emerald-50 font-bold" : bold ? "font-semibold bg-slate-50" : ""}>
      <td className={`px-4 py-2 text-sm ${sub ? "pl-8 text-slate-500" : "text-slate-700"}`}>{label}</td>
      <td className="px-4 py-2 text-sm text-right">{count != null ? count : ""}</td>
      <td className="px-4 py-2 text-sm text-right">{money(amt)}</td>
    </tr>
  );
  const isMasterGm = ["Master", "GM"].includes(role);
  const incentiveLabel = isMasterGm ? "Confidential Incentives" : role === "Finance" ? "Additional Payments (by branch)" : "Additional Payments";
  return (
    <div className="mb-4">
      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
        <div className="px-5 pt-4 pb-2"><h2 className="font-bold text-slate-800">Payroll Summary — {month}</h2></div>
        <table className="w-full text-sm min-w-[480px]">
          <thead className="bg-slate-50 text-slate-500">
            <tr><th className="text-left px-4 py-2 font-medium">Category</th><th className="text-right px-4 py-2 font-medium">Employees</th><th className="text-right px-4 py-2 font-medium">Amount</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <Row label="Total Generated" count={buckets.totalGenerated} amt={buckets.totalGeneratedAmt} bold />
            <Row label="Normal (Payable)" count={buckets.acc.Normal.count} amt={buckets.acc.Normal.amt} />
            <Row label="F&F Settlement" count={buckets.acc.FnF.count} amt={buckets.acc.FnF.amt} />
            <Row label="Hold" count={buckets.acc.Hold.count} amt={buckets.acc.Hold.amt} />
            <Row label="No F&F" count={buckets.acc.No_FnF.count} amt={buckets.acc.No_FnF.amt} />
            <Row label="TOTAL PAYABLE ✅" count={buckets.totalPayableCount} amt={buckets.totalPayable} highlight />
            <Row label="Previous Month Holdover" count={buckets.holdoverCount} amt={buckets.holdoverAmt} sub />
            {cashIncentiveTotal > 0 && <Row label={incentiveLabel} amt={cashIncentiveTotal} sub />}
            <Row label="FINANCE TOTAL" amt={buckets.financeTotal} bold />
          </tbody>
        </table>
      </div>

      {isMasterGm && incentiveMonthlyRows?.length > 0 && (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-4 mt-2">
          <h3 className="font-bold text-slate-800 text-sm mb-2">Confidential Incentives — individual breakdown</h3>
          {incentiveMonthlyRows.map(r => (
            <div key={r.id} className="flex justify-between items-center py-1.5 text-sm border-b border-slate-50 last:border-0">
              <span className="text-slate-600">{r.employee_name} <span className="text-xs text-slate-400">{r.employee_code}</span></span>
              <span className="font-medium">{money(r.amount)}</span>
            </div>
          ))}
          <div className="flex justify-between items-center pt-2 mt-1 border-t border-slate-100 font-bold">
            <span>Total Confidential</span><span>{money(cashIncentiveTotal)}</span>
          </div>
        </div>
      )}

      {role === "Finance" && incentiveBranchTotals?.length > 0 && (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-4 mt-2">
          <h3 className="font-bold text-slate-800 text-sm mb-2">Additional Payments by Branch</h3>
          {incentiveBranchTotals.map(b => (
            <div key={b.branch} className="flex justify-between items-center py-1.5 text-sm border-b border-slate-50 last:border-0">
              <span className="text-slate-600">{b.branch}</span>
              <span className="font-medium">{money(b.total)}</span>
            </div>
          ))}
          <div className="flex justify-between items-center pt-2 mt-1 border-t border-slate-100 font-bold">
            <span>Total Additional Payments</span><span>{money(cashIncentiveTotal)}</span>
          </div>
        </div>
      )}
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
  const [statusFilter, setStatusFilter] = useState("All");
  const [collapsedBranches, setCollapsedBranches] = useState(() => new Set());
  const [collapsedDepts, setCollapsedDepts] = useState(() => new Set());
  const [lockInfo, setLockInfo] = useState(null);
  const [verifications, setVerifications] = useState([]);
  const [flagNotifications, setFlagNotifications] = useState([]);
  const [cashIncentiveTotal, setCashIncentiveTotal] = useState(0);
  const [incentiveMonthlyRows, setIncentiveMonthlyRows] = useState([]);
  const [incentiveBranchTotals, setIncentiveBranchTotals] = useState([]);
  const [marking, setMarking] = useState(false);

  function toggleBranchCollapsed(branch) {
    setCollapsedBranches(prev => {
      const next = new Set(prev);
      next.has(branch) ? next.delete(branch) : next.add(branch);
      return next;
    });
  }
  function toggleDeptCollapsed(key) {
    setCollapsedDepts(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }
  function clearFilters() {
    setSearchText(""); setBranchFilter(""); setDeptFilter(""); setStatusFilter("All");
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

  useEffect(() => { loadBase(); }, []);
  useEffect(() => { loadPayroll(); loadLockAndExtras(); }, [month]);

  async function loadBase() {
    const [{ data: emps }, { data: lns }] = await Promise.all([
      supabase.from("employees").select("*").eq("status", "Active"),
      supabase.from("loans").select("*").eq("status", "Active"),
    ]);
    setEmployees(emps || []);
    setLoans(lns || []);
  }

  async function loadLockAndExtras() {
    const [lock, verifs, branchTotals] = await Promise.all([
      getPayrollLock(month),
      fetchVerifications(month),
      fetchCashIncentiveBranchTotals(month).catch(() => []),
    ]);
    setLockInfo(lock);
    setVerifications(verifs);
    setIncentiveBranchTotals(branchTotals);
    setCashIncentiveTotal(branchTotals.reduce((s, b) => s + Number(b.total || 0), 0));
    if (["Master", "GM"].includes(role)) {
      fetchCashIncentiveMonthly(month).then(setIncentiveMonthlyRows).catch(() => setIncentiveMonthlyRows([]));
    } else {
      setIncentiveMonthlyRows([]);
    }
    const { data: flags } = await supabase.from("notifications").select("*").eq("type", `payroll_flag_${month}`).order("created_at", { ascending: false });
    setFlagNotifications(flags || []);
  }

  async function loadPayroll() {
    const { data } = await supabase.from("payroll").select("*").eq("payroll_month", month).limit(500);
    if (data && data.length > 0) {
      setPayrollRows(data);
      setPayrollStatus(data[0]?.status || "Draft");
      setPublishedBy(data[0]?.published_by || "");
      setPublishedAt(data[0]?.published_at || "");
    } else {
      setPayrollRows([]);
      setPayrollStatus("Draft");
      setPublishedBy(""); setPublishedAt("");
    }
  }

  async function buildPayrollRows() {
    const fromDate = month + "-01";
    const [y, m] = month.split("-").map(Number);
    const toDate = `${y}-${String(m).padStart(2, "0")}-${new Date(y, m, 0).getDate()}`;
    const numberOfWorkingDays = getWorkingDaysInMonth(y, m);

    const [{ data: att }, { data: finesData }, { data: shortagesData }, { data: advancesData }, { data: oneTimeAdjData }, { data: groupsData }] = await Promise.all([
      supabase.from("attendance").select("*").gte("work_date", fromDate).lte("work_date", toDate),
      supabase.from("fines").select("*").eq("payroll_month", month).eq("status", "Approved"),
      supabase.from("shortages").select("*").eq("payroll_month", month).eq("status", "Approved"),
      supabase.from("advances").select("*").eq("advance_month", month).in("status", ["Issued", "Deducted"]),
      supabase.from("one_time_adjustments").select("*").eq("payroll_month", month).eq("status", "Approved"),
      supabase.from("staff_eligibility_groups").select("code, extra_days_eligible"),
    ]);
    const groupByCode = Object.fromEntries((groupsData || []).map(g => [g.code, g]));

    // Aggregate attendance per employee
    const attByEmp = {};
    (att || []).forEach(a => {
      const c = a.employee_code;
      if (!attByEmp[c]) attByEmp[c] = {
        presentDays: 0, absentDays: 0, halfDays: 0,
        lateCount: 0, otHours: 0, extraWorkingDays: 0, leaveDaysUsed: 0, numberOfWorkingDays,
        workedHours: 0, requiredHours: 0,
      };
      const s = a.attendance_status || a.status || "";
      if (s === "Absent") { attByEmp[c].absentDays++; }
      else if (s === "Half Day" || s === "HalfDay") { attByEmp[c].presentDays++; attByEmp[c].halfDays++; }
      else if (s === "Leave") { attByEmp[c].leaveDaysUsed++; }
      else { attByEmp[c].presentDays++; }
      // extra_day_eligible is computed server-side by classify_attendance_day from the
      // employee's eligibility group (e.g. false for MANAGEMENT_ADMIN) — trust it instead
      // of re-deriving "worked on a Sunday" here.
      if (a.extra_day_eligible) attByEmp[c].extraWorkingDays++;
      if (Number(a.late_minutes || 0) > 0) attByEmp[c].lateCount++;
      attByEmp[c].otHours += Number(a.overtime_hours ?? a.ot_hours ?? 0);
      attByEmp[c].workedHours += Number(a.worked_hours || 0);
      attByEmp[c].requiredHours += Number(a.required_hours || 0);
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

    const rows = employees.map(emp => {
      const group = groupByCode[emp.eligibility_group];
      const extraDaysEligible = emp.extra_days_eligible != null ? !!emp.extra_days_eligible : !!group?.extra_days_eligible;
      const empMapped = {
        id: emp.employee_code, name: emp.full_name, branch: emp.branch,
        dept: emp.department, level: emp.staff_level || "Non-Management",
        salary: emp.salary || 0, status: emp.status, joiningDate: emp.joining_date,
        isAttendanceExempt: !!emp.is_attendance_exempt,
        extraDaysEligible,
      };
      const oneTimeAdj = oneTimeAdjByEmp[emp.employee_code] || {};
      const adj = {
        ...(attByEmp[emp.employee_code] || { numberOfWorkingDays }),
        commissionAddOn: oneTimeAdj.commissionAddOn || 0,
        fineDeduction: (fineByEmp[emp.employee_code] || 0) + (oneTimeAdj.fineDeduction || 0),
        shortageDeduction: (shortageByEmp[emp.employee_code] || 0) + (oneTimeAdj.shortageDeduction || 0),
        advanceDeduction: advanceByEmp[emp.employee_code] || 0,
        arrears: oneTimeAdj.arrears || 0,
        otherEarnings: oneTimeAdj.otherEarnings || 0,
        otherDeductions: oneTimeAdj.otherDeductions || 0,
      };
      const loanRows = [];
      const loanMatch = (loans || []).find(l =>
        l.employee_code === emp.employee_code || l.employee_id === emp.employee_code
      );
      if (loanMatch) loanRows.push({ employeeCode: emp.employee_code, monthly: Number(loanMatch.monthly_deduction || 0) });
      return calculatePayrollForEmployee(empMapped, adj, loanRows, [], month);
    });

    return rows;
  }

  async function generatePayroll() {
    if (!canGenerate) return setErr("Access denied.");
    setGenerating(true); setErr(""); setMsg("");
    try {
      const rows = await buildPayrollRows();
      let payloadRows = buildPayloadRows(rows);
      payloadRows = await mergePersistentPayrollFields(month, payloadRows);
      await supabase.from("payroll").delete().eq("payroll_month", month);
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
      // Update existing payroll records (don't delete — preserve status)
      let failed = 0;
      let firstError = "";
      for (const r of payloadRows) {
        const { error } = await supabase.from("payroll")
          .update({ ...r, generated_at: new Date().toISOString() })
          .eq("payroll_month", month)
          .eq("employee_code", r.employee_code);
        if (error) { failed++; firstError = firstError || error.message; }
      }
      await loadPayroll();
      const ts = new Date().toLocaleTimeString("en-PK");
      if (failed > 0) {
        setErr(`${failed} of ${payloadRows.length} rows failed to save: ${firstError}`);
      }
      setMsg(`Payroll refreshed for ${rows.length - failed} of ${rows.length} employees at ${ts}.`);
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
      overtime_amount: r.overtimeAmount,
      commission_addon: r.commissionAddOn,
      arrears: r.arrears,
      absent_adjustment: r.absentAdjustment,
      fuel_allowance: r.fuelAllowance,
      other_amount: r.otherEarnings,
      extra_working_days_amount: r.extraWorkingDaysAmount,
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

  async function markPaid(code) {
    await supabase.from("payroll").update({
      is_paid: true, paid_at: new Date().toISOString(), paid_by: actorName || role,
    }).eq("payroll_month", month).eq("employee_code", code);
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
      "Worked Hours": r.workedHours, "Required Hours": r.requiredHours,
      "OT Hours": r.otHours, "Leave Days": r.leaveDaysUsed, "Extra Working Days": r.extraWorkingDays,
      "Basic Salary": r.basicSalary, "OT Amount": r.overtimeAmount,
      "Commission": r.commissionAddOn, "Fuel Allowance": r.fuelAllowance, "Other Earnings": r.otherEarnings,
      "Extra WD Amount": r.extraWorkingDaysAmount, "Total Earnings": r.totalEarnings,
      "Late Deduction": r.lateDeduction, "Short Hour Deduction": r.shortHourDeduction,
      "Absent Deduction": r.absentDeduction, "Fine": r.fineDeduction, "Shortage": r.shortageDeduction,
      "Advance": r.advanceDeduction, "Loan Deduction": r.loanDeduction,
      "Tax": r.taxDeduction, "EOBI": r.eobiDeduction, "Other Deductions": r.otherDeductions,
      "Total Deductions": r.totalDeductions, "Net Pay": r.finalSalary,
      "Payment Status": PAYMENT_STATUS_LABELS[r.paymentStatus] || r.paymentStatus,
      "Status": r.status || payrollStatus,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Payroll");
    XLSX.writeFile(wb, `payroll_${month}.xlsx`);
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
    const totalEarnings = basicSalary + overtimeAmount + commissionAddOn +
      fuelAllowance + otherEarnings + extraWorkingDaysAmount +
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
    const eobiDeduction        = r.eobiDeduction || r.eobi_deduction || 250;
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
      basicSalary, overtimeAmount, commissionAddOn, fuelAllowance,
      otherEarnings, extraWorkingDaysAmount, totalEarnings,
      lateDeduction, shortHourDeduction, absentDeduction, halfDayDeduction,
      fineDeduction, shortageDeduction, advanceDeduction, loanDeduction,
      taxDeduction, eobiDeduction, otherDeductions, totalDeductions,
      finalSalary: totalEarnings - totalDeductions, gross: basicSalary,
      arrears: r.arrears || 0,
    };
  }), [payrollRows, payrollStatus]);

  const totals = useMemo(() => displayRows.reduce((s, r) => ({
    employees: s.employees + 1,
    totalEarnings: s.totalEarnings + r.totalEarnings,
    totalDeductions: s.totalDeductions + r.totalDeductions,
    netPay: s.netPay + r.finalSalary,
  }), { employees: 0, totalEarnings: 0, totalDeductions: 0, netPay: 0 }), [displayRows]);

  const branchOptions = useMemo(() =>
    Array.from(new Set(displayRows.map(r => r.branch).filter(Boolean))).sort(), [displayRows]);
  const deptOptions = useMemo(() =>
    Array.from(new Set(displayRows.map(r => r.department).filter(Boolean))).sort(), [displayRows]);

  const filteredRows = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return displayRows.filter(r => {
      if (statusFilter !== "All" && r.status !== statusFilter) return false;
      if (branchFilter && r.branch !== branchFilter) return false;
      if (deptFilter && r.department !== deptFilter) return false;
      if (q && !(r.name || "").toLowerCase().includes(q) && !(r.employeeCode || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [displayRows, searchText, branchFilter, deptFilter, statusFilter]);

  const filteredTotals = useMemo(() => filteredRows.reduce((s, r) => ({
    totalEarnings: s.totalEarnings + r.totalEarnings,
    totalDeductions: s.totalDeductions + r.totalDeductions,
    netPay: s.netPay + r.finalSalary,
  }), { totalEarnings: 0, totalDeductions: 0, netPay: 0 }), [filteredRows]);

  function sumRows(rows, field) { return rows.reduce((s, r) => s + (r[field] || 0), 0); }

  const holdCount = useMemo(() => displayRows.filter(r => r.paymentStatus === "Hold").length, [displayRows]);

  // Branch (A-Z) → Department (A-Z) → Employee Name (A-Z)
  const groupedData = useMemo(() => {
    const byBranch = {};
    filteredRows.forEach(r => {
      const b = r.branch || "Unassigned";
      const d = r.department || "Unassigned";
      if (!byBranch[b]) byBranch[b] = {};
      if (!byBranch[b][d]) byBranch[b][d] = [];
      byBranch[b][d].push(r);
    });
    return Object.keys(byBranch).sort().map(branch => ({
      branch,
      departments: Object.keys(byBranch[branch]).sort().map(dept => ({
        dept,
        rows: [...byBranch[branch][dept]].sort((a, b) => (a.name || "").localeCompare(b.name || "")),
      })),
    }));
  }, [filteredRows]);

  const TH = ({ children, className = "", sticky = false }) => (
    <th className={`text-left px-3 py-3 font-medium text-xs whitespace-nowrap sticky top-0 z-10 bg-slate-50 shadow-[0_1px_3px_rgba(0,0,0,0.08)] ${sticky ? "left-0 z-20" : ""} ${className}`}>{children}</th>
  );
  const TD = ({ children, className = "", sticky = false, ...rest }) => (
    <td {...rest} className={`px-3 py-3 text-sm whitespace-nowrap ${sticky ? "sticky left-0 z-[5] bg-white shadow-[2px_0_4px_rgba(0,0,0,0.06)]" : ""} ${className}`}>{children}</td>
  );

  const visibleTabs = TABS.filter(([k]) => {
    if (k === "cash") return ["Master", "GM"].includes(role);
    if (k === "hold") return ["Master", "HR", "GM"].includes(role);
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
          <div className="flex gap-2 mt-4 ml-auto flex-wrap">
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
            {displayRows.length > 0 && (
              <Button variant="outline" onClick={exportExcel} className="rounded-2xl">Export Excel</Button>
            )}
          </div>
        </div>
      </div>

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

      <SummaryPanel month={month} displayRows={displayRows} cashIncentiveTotal={cashIncentiveTotal} role={role}
        incentiveMonthlyRows={incentiveMonthlyRows} incentiveBranchTotals={incentiveBranchTotals} />

      {["HR", "Master"].includes(role) && (
        <VerificationPanel month={month} role={role} verifications={verifications} flagNotifications={flagNotifications} onRespond={handleFlagRespond} />
      )}

      {/* Summary Cards */}
      {displayRows.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm"><p className="text-xs text-slate-500">Employees</p><p className="text-2xl font-bold">{totals.employees}</p></div>
          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm"><p className="text-xs text-slate-500">Total Earnings</p><p className="text-2xl font-bold text-emerald-600">{money(totals.totalEarnings)}</p></div>
          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm"><p className="text-xs text-slate-500">Total Deductions</p><p className="text-2xl font-bold text-red-500">{money(totals.totalDeductions)}</p></div>
          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm"><p className="text-xs text-slate-500">Net Payroll</p><p className="text-2xl font-bold text-slate-900">{money(totals.netPay)}</p></div>
        </div>
      )}

      {/* Search / Filter bar */}
      {displayRows.length > 0 && (
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm mb-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <p className="text-xs text-slate-500 mb-1">Search</p>
              <input type="text" value={searchText} onChange={e => setSearchText(e.target.value)}
                placeholder="Name or employee code…"
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm w-56" />
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Branch</p>
              <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm bg-white">
                <option value="">All Branches</option>
                {branchOptions.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Department</p>
              <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm bg-white">
                <option value="">All Departments</option>
                {deptOptions.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Status</p>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm bg-white">
                {["All", "Draft", "Approved", "Published"].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {(searchText || branchFilter || deptFilter || statusFilter !== "All") && (
              <Button variant="outline" onClick={clearFilters} className="rounded-xl text-xs">Clear Filters</Button>
            )}
            <p className="text-xs text-slate-500 ml-auto">
              Showing {filteredRows.length} of {displayRows.length} employees
            </p>
          </div>
        </div>
      )}

      {/* Payroll Register Table */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
        <div className="px-5 pt-4 pb-2 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-slate-800">Payroll Register — {month}</h2>
            <p className="text-xs text-slate-400 mt-0.5">{filteredRows.length} of {displayRows.length} employees</p>
          </div>
        </div>
        <table className="w-full text-sm" style={{ minWidth: "3050px" }}>
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <TH sticky>Employee</TH><TH>Level</TH>
              {/* Attendance */}
              <TH className="text-blue-500">WD</TH><TH className="text-blue-500">Present</TH>
              <TH className="text-blue-500">Absent</TH><TH className="text-blue-500">Leave</TH>
              <TH className="text-blue-500">Extra WD</TH><TH className="text-blue-500">OT Hrs</TH>
              <TH className="text-blue-500">Worked Hrs</TH><TH className="text-blue-500">Req Hrs</TH>
              {/* Earnings */}
              <TH className="text-emerald-600">Basic</TH>
              <TH className="text-emerald-600">Extra WD Amt</TH>
              <TH className="text-emerald-600">OT Amt</TH>
              <TH className="text-emerald-600">Commission</TH>
              <TH className="text-emerald-600">Fuel</TH>
              <TH className="text-emerald-600">Other Earn</TH>
              <TH className="text-emerald-700 bg-emerald-50">Total Earn</TH>
              {/* Deductions */}
              <TH className="text-red-500">Late Ded</TH>
              <TH className="text-red-500">ShortHr</TH>
              <TH className="text-red-500">Fine</TH>
              <TH className="text-red-500">Shortage</TH>
              <TH className="text-red-500">Advance</TH>
              <TH className="text-red-500">Loan</TH>
              <TH className="text-red-500">Tax</TH>
              <TH className="text-red-500">EOBI</TH>
              <TH className="text-red-500">Other Ded</TH>
              <TH className="text-red-700 bg-red-50">Total Ded</TH>
              <TH className="text-slate-900 bg-slate-100">Net Pay</TH>
              <TH>Payment Status</TH>
              <TH>Payslip</TH>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredRows.length === 0 ? (
              <tr><td colSpan={30} className="px-4 py-8 text-center text-slate-400">
                {displayRows.length === 0
                  ? (role === "Finance" ? "No published payroll for this month." : 'No payroll data. Click "Generate Payroll" to calculate.')
                  : "No employees match the current filters."}
              </td></tr>
            ) : groupedData.map(({ branch, departments }) => {
              const branchRows = departments.flatMap(d => d.rows);
              const branchCollapsed = collapsedBranches.has(branch);
              return (
                <React.Fragment key={branch}>
                  <tr className="bg-slate-800 text-white cursor-pointer select-none" onClick={() => toggleBranchCollapsed(branch)}>
                    <TD colSpan={30} className="font-bold py-2">
                      {branchCollapsed ? "▶" : "▼"} {branch}
                      <span className="font-normal text-slate-300 text-xs ml-2">
                        ({branchRows.length} employees · Basic {money(sumRows(branchRows, "basicSalary"))} · Net {money(sumRows(branchRows, "finalSalary"))})
                      </span>
                    </TD>
                  </tr>
                  {!branchCollapsed && departments.map(({ dept, rows }) => {
                    const deptKey = `${branch}::${dept}`;
                    const deptCollapsed = collapsedDepts.has(deptKey);
                    return (
                      <React.Fragment key={deptKey}>
                        <tr className="bg-slate-100 cursor-pointer select-none" onClick={() => toggleDeptCollapsed(deptKey)}>
                          <TD colSpan={30} className="font-semibold text-slate-600 py-1.5 pl-8">
                            {deptCollapsed ? "▶" : "▼"} {dept}
                            <span className="font-normal text-slate-400 text-xs ml-2">
                              ({rows.length} · Basic {money(sumRows(rows, "basicSalary"))} · Net {money(sumRows(rows, "finalSalary"))})
                            </span>
                          </TD>
                        </tr>
                        {!deptCollapsed && rows.map((r, i) => (
                          <tr key={r.employeeCode || i} className={`hover:bg-slate-50 ${r.isAttendanceExempt ? "bg-purple-50/30" : ""}`}>
                            <TD sticky>
                              <div className="font-medium">{r.name}</div>
                              <div className="text-xs text-slate-400">{r.employeeCode}</div>
                              {r.isAttendanceExempt && <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 rounded">EXEMPTED</span>}
                              {r.holdoverAmount > 0 && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 rounded ml-1">+{money(r.holdoverAmount)} holdover</span>}
                            </TD>
                            <TD>{r.level}</TD>
                            {/* Attendance */}
                            <TD className="text-blue-600">{r.numberOfWorkingDays}</TD>
                            <TD className="text-blue-600">{r.presentDays}</TD>
                            <TD className="text-blue-600">{r.absentDays}</TD>
                            <TD className="text-blue-600">{r.leaveDaysUsed}</TD>
                            <TD className="text-blue-600">{r.extraWorkingDays}</TD>
                            <TD className="text-blue-600">{r.otHours}</TD>
                            <TD className="text-blue-600">{r.workedHours || "—"}</TD>
                            <TD className="text-blue-600">{r.requiredHours || "—"}</TD>
                            {/* Earnings */}
                            <TD>{money(r.basicSalary)}</TD>
                            <TD className="text-emerald-600">{r.extraWorkingDaysAmount ? money(r.extraWorkingDaysAmount) : "—"}</TD>
                            <TD className="text-emerald-600">{r.overtimeAmount ? money(r.overtimeAmount) : "—"}</TD>
                            <TD className="text-emerald-600">{r.commissionAddOn ? money(r.commissionAddOn) : "—"}</TD>
                            <TD className="text-emerald-600">{r.fuelAllowance ? money(r.fuelAllowance) : "—"}</TD>
                            <TD className="text-emerald-600">{r.otherEarnings ? money(r.otherEarnings) : "—"}</TD>
                            <TD className="font-semibold text-emerald-700 bg-emerald-50">{money(r.totalEarnings)}</TD>
                            {/* Deductions */}
                            <TD className="text-red-500">{r.lateDeduction ? money(r.lateDeduction) : "—"}</TD>
                            <TD className="text-red-500">{r.shortHourDeduction ? money(r.shortHourDeduction) : "—"}</TD>
                            <TD className="text-red-500">{r.fineDeduction ? money(r.fineDeduction) : "—"}</TD>
                            <TD className="text-red-500">{r.shortageDeduction ? money(r.shortageDeduction) : "—"}</TD>
                            <TD className="text-red-500">{r.advanceDeduction ? money(r.advanceDeduction) : "—"}</TD>
                            <TD className="text-red-500">{r.loanDeduction ? money(r.loanDeduction) : "—"}</TD>
                            <TD className="text-red-500">{r.taxDeduction ? money(r.taxDeduction) : "—"}</TD>
                            <TD className="text-red-500">{money(r.eobiDeduction)}</TD>
                            <TD className="text-red-500">{r.otherDeductions ? money(r.otherDeductions) : "—"}</TD>
                            <TD className="font-semibold text-red-700 bg-red-50">{money(r.totalDeductions)}</TD>
                            <TD className="font-bold text-slate-900 bg-slate-50 text-right">{money(r.finalSalary)}</TD>
                            <TD>
                              {canRequestPaymentStatus ? (
                                <button onClick={() => setPaymentStatusRow(r)}
                                  className="cursor-pointer" title="Click to request a status change">
                                  <Badge tone={PAYMENT_STATUS_TONES[r.paymentStatus]}>{PAYMENT_STATUS_LABELS[r.paymentStatus]}</Badge>
                                </button>
                              ) : (
                                <Badge tone={PAYMENT_STATUS_TONES[r.paymentStatus]}>{PAYMENT_STATUS_LABELS[r.paymentStatus]}</Badge>
                              )}
                            </TD>
                            <TD>
                              <div className="flex flex-col gap-1 items-start">
                                {role === "Finance" && ["Hold", "No_FnF"].includes(r.paymentStatus) ? (
                                  <span className="text-xs text-slate-400">{r.paymentStatus === "No_FnF" ? "No Payment" : "On Hold"}</span>
                                ) : (
                                  <Button variant="outline" onClick={() => setSelectedPayslip(r)} className="rounded-xl text-xs py-1 px-3">View</Button>
                                )}
                                {r.isPaid ? (
                                  <span className="text-[10px] text-emerald-600 font-medium">✓ Paid {r.paidAt?.slice(0, 10)}</span>
                                ) : canMarkPaid && ["Normal", "FnF"].includes(r.paymentStatus) ? (
                                  <button onClick={() => markPaid(r.employeeCode)} className="text-[10px] text-blue-600 hover:underline">Mark Paid</button>
                                ) : null}
                              </div>
                            </TD>
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
          {filteredRows.length > 0 && (
            <tfoot className="bg-slate-100 font-semibold text-slate-700">
              <tr>
                <TD colSpan={10} className="font-bold" sticky>Totals ({filteredRows.length} employees)</TD>
                <TD>{money(sumRows(filteredRows, "basicSalary"))}</TD>
                <TD>{money(sumRows(filteredRows, "extraWorkingDaysAmount"))}</TD>
                <TD>{money(sumRows(filteredRows, "overtimeAmount"))}</TD>
                <TD>{money(sumRows(filteredRows, "commissionAddOn"))}</TD>
                <TD>{money(sumRows(filteredRows, "fuelAllowance"))}</TD>
                <TD>{money(sumRows(filteredRows, "otherEarnings"))}</TD>
                <TD className="text-emerald-700 bg-emerald-50">{money(filteredTotals.totalEarnings)}</TD>
                <TD>{money(sumRows(filteredRows, "lateDeduction"))}</TD>
                <TD>{money(sumRows(filteredRows, "shortHourDeduction"))}</TD>
                <TD>{money(sumRows(filteredRows, "fineDeduction"))}</TD>
                <TD>{money(sumRows(filteredRows, "shortageDeduction"))}</TD>
                <TD>{money(sumRows(filteredRows, "advanceDeduction"))}</TD>
                <TD>{money(sumRows(filteredRows, "loanDeduction"))}</TD>
                <TD>{money(sumRows(filteredRows, "taxDeduction"))}</TD>
                <TD>{money(sumRows(filteredRows, "eobiDeduction"))}</TD>
                <TD>{money(sumRows(filteredRows, "otherDeductions"))}</TD>
                <TD className="text-red-700 bg-red-50">{money(filteredTotals.totalDeductions)}</TD>
                <TD className="text-slate-900 bg-slate-100">{money(filteredTotals.netPay)}</TD>
                <TD />
                <TD />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      </>
      )}
    </div>
  );
}
