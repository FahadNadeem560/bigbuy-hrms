import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { PageTitle, Button } from "../components/ui.jsx";
import { money } from "../utils/format.js";
import { fetchCashIncentiveBranchTotals, markIncentivesPaidForBranch } from "../services/payrollControlService.js";

export default function FinanceReconciliation({ role, month, setMonth, actorName }) {
  const [payroll, setPayroll] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [incentiveBranchTotals, setIncentiveBranchTotals] = useState([]);
  const [marking, setMarking] = useState(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => { load(); }, [month]);

  async function load() {
    const [{ data: pr }, { data: emps }, branchTotals] = await Promise.all([
      supabase.from("payroll").select("*").eq("payroll_month", month),
      supabase.from("employees").select("employee_code, branch, full_name"),
      fetchCashIncentiveBranchTotals(month).catch(() => []),
    ]);
    setPayroll(pr || []);
    setEmployees(emps || []);
    setIncentiveBranchTotals(branchTotals);
  }

  async function markPaid(branch) {
    setMarking(branch); setErr(""); setMsg("");
    try {
      await markIncentivesPaidForBranch(month, branch, actorName || role);
      setMsg(`Incentive cash for ${branch} marked as distributed.`);
      load();
    } catch (e) { setErr(e.message); }
    finally { setMarking(null); }
  }

  const empByCode = useMemo(() => Object.fromEntries(employees.map(e => [e.employee_code, e])), [employees]);
  const incentiveByBranch = useMemo(() => Object.fromEntries(incentiveBranchTotals.map(b => [b.branch, b.total])), [incentiveBranchTotals]);
  const cashIncentiveTotal = useMemo(() => incentiveBranchTotals.reduce((s, b) => s + Number(b.total || 0), 0), [incentiveBranchTotals]);

  const rows = useMemo(() => payroll.map(r => ({
    ...r,
    branch: empByCode[r.employee_code]?.branch || "Unassigned",
    paymentStatus: r.payment_status || "Normal",
    netSalary: Number(r.net_salary || 0),
    holdoverAmount: Number(r.holdover_amount || 0),
    isPaid: !!r.is_paid,
    loanDeduction: Number(r.loan_deduction || 0),
    advanceDeduction: Number(r.advance_deduction || r.advance || 0),
    taxDeduction: Number(r.tax_deduction || 0),
    eobiDeduction: Number(r.eobi_deduction || 0),
    overtimeAmount: Number(r.overtime_amount || 0),
  })), [payroll, empByCode]);

  const [branchFilter, setBranchFilter] = useState("");
  const branchOptions = useMemo(() => {
    const set = new Set([...rows.map(r => r.branch), ...Object.keys(incentiveByBranch)]);
    return Array.from(set).filter(Boolean).sort();
  }, [rows, incentiveByBranch]);
  const scopedRows = useMemo(() => branchFilter ? rows.filter(r => r.branch === branchFilter) : rows, [rows, branchFilter]);
  const scopedCashIncentiveTotal = useMemo(() => branchFilter ? Number(incentiveByBranch[branchFilter] || 0) : cashIncentiveTotal, [branchFilter, incentiveByBranch, cashIncentiveTotal]);

  const totals = useMemo(() => {
    const normal = scopedRows.filter(r => r.paymentStatus === "Normal").reduce((s, r) => s + r.netSalary, 0);
    const fnf = scopedRows.filter(r => r.paymentStatus === "FnF").reduce((s, r) => s + r.netSalary, 0);
    const holdover = scopedRows.reduce((s, r) => s + r.holdoverAmount, 0);
    const loan = scopedRows.reduce((s, r) => s + r.loanDeduction, 0);
    const advance = scopedRows.reduce((s, r) => s + r.advanceDeduction, 0);
    const tax = scopedRows.reduce((s, r) => s + r.taxDeduction, 0);
    const eobi = scopedRows.reduce((s, r) => s + r.eobiDeduction, 0);
    const overtime = scopedRows.reduce((s, r) => s + r.overtimeAmount, 0);
    const totalToPay = normal + fnf + holdover + scopedCashIncentiveTotal;
    const alreadyPaid = scopedRows.filter(r => ["Normal", "FnF"].includes(r.paymentStatus) && r.isPaid).reduce((s, r) => s + r.netSalary, 0);
    const remaining = totalToPay - alreadyPaid;
    return { normal, fnf, holdover, loan, advance, tax, eobi, overtime, cashIncentiveTotal: scopedCashIncentiveTotal, totalToPay, alreadyPaid, remaining };
  }, [scopedRows, scopedCashIncentiveTotal]);

  const incentivePaidByBranch = useMemo(() => Object.fromEntries(incentiveBranchTotals.map(b => [b.branch, !!b.is_paid])), [incentiveBranchTotals]);

  const byBranch = useMemo(() => {
    const acc = {};
    rows.forEach(r => {
      if (!acc[r.branch]) acc[r.branch] = { branch: r.branch, payable: 0, hold: 0, noFnf: 0, loan: 0, advance: 0, tax: 0, eobi: 0, overtime: 0 };
      if (r.paymentStatus === "Normal" || r.paymentStatus === "FnF") acc[r.branch].payable += r.netSalary;
      else if (r.paymentStatus === "Hold") acc[r.branch].hold += r.netSalary;
      else if (r.paymentStatus === "No_FnF") acc[r.branch].noFnf += r.netSalary;
      acc[r.branch].loan += r.loanDeduction;
      acc[r.branch].advance += r.advanceDeduction;
      acc[r.branch].tax += r.taxDeduction;
      acc[r.branch].eobi += r.eobiDeduction;
      acc[r.branch].overtime += r.overtimeAmount;
    });
    Object.keys(incentiveByBranch).forEach(b => { if (!acc[b]) acc[b] = { branch: b, payable: 0, hold: 0, noFnf: 0, loan: 0, advance: 0, tax: 0, eobi: 0, overtime: 0 }; });
    return Object.values(acc).map(b => ({
      ...b, cashIncentives: incentiveByBranch[b.branch] || 0,
      total: b.payable + (incentiveByBranch[b.branch] || 0),
      incentivePaid: incentivePaidByBranch[b.branch] || false,
    })).sort((a, b) => a.branch.localeCompare(b.branch));
  }, [rows, incentiveByBranch, incentivePaidByBranch]);

  const visibleBranches = useMemo(() => branchFilter ? byBranch.filter(b => b.branch === branchFilter) : byBranch, [byBranch, branchFilter]);

  const Line = ({ label, value, bold, highlight }) => (
    <div className={`flex justify-between items-center py-2.5 px-4 ${highlight ? "bg-emerald-50 rounded-xl font-bold text-emerald-800" : bold ? "font-semibold" : ""} border-b border-slate-50 last:border-0`}>
      <span className={highlight ? "" : "text-slate-600"}>{label}</span>
      <span>{money(value)}</span>
    </div>
  );

  if (!["Finance", "Master"].includes(role)) {
    return (
      <div>
        <PageTitle title="Finance Reconciliation" subtitle="Not available." />
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8 text-center text-amber-700">
          Finance Reconciliation is only visible to Finance and Master.
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageTitle title="Finance Reconciliation" subtitle="Exact amounts Finance should pay this month." />
      <div className="flex flex-wrap gap-4 mb-4">
        <div>
          <p className="text-xs text-slate-500 mb-1">Month</p>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
            className="px-4 py-2 rounded-xl border border-slate-200 text-sm bg-white" />
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-1">Branch</p>
          <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)}
            className="px-4 py-2 rounded-xl border border-slate-200 text-sm bg-white">
            <option value="">All Branches</option>
            {branchOptions.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
      </div>

      {msg && <div className="mb-3 p-3 rounded-xl bg-blue-50 text-blue-700 text-sm">{msg}</div>}
      {err && <div className="mb-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{err}</div>}

      <div className="flex flex-wrap gap-6 mb-6">
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-2 max-w-xl flex-1 min-w-[320px]">
          <div className="px-3 pt-2 pb-1"><h2 className="font-bold text-slate-800">Finance Payment Schedule — {month}{branchFilter ? ` · ${branchFilter}` : ""}</h2></div>
          <Line label="Regular Payroll (Normal)" value={totals.normal} />
          <Line label="F&F Settlements" value={totals.fnf} />
          <Line label="Previous Month Holdover" value={totals.holdover} />
          <Line label="Additional Payments (by branch)" value={totals.cashIncentiveTotal} />
          <Line label="TOTAL TO PAY" value={totals.totalToPay} bold />
          <Line label="Already Paid" value={totals.alreadyPaid} />
          <Line label="Remaining" value={totals.remaining} highlight />
        </div>

        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-2 max-w-xl flex-1 min-w-[320px]">
          <div className="px-3 pt-2 pb-1">
            <h2 className="font-bold text-slate-800">Deduction & Component Breakdown — {month}{branchFilter ? ` · ${branchFilter}` : ""}</h2>
            <p className="text-[11px] text-slate-400 px-0 pb-1">Already netted into the salaries above — shown for reconciliation reference only.</p>
          </div>
          <Line label="Loan Deductions" value={totals.loan} />
          <Line label="Advance Deductions" value={totals.advance} />
          <Line label="EOBI Deductions" value={totals.eobi} />
          <Line label="Tax Deductions" value={totals.tax} />
          <Line label="Overtime Payments" value={totals.overtime} />
        </div>
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto overflow-y-auto max-h-[70vh]">
        <div className="px-5 pt-4 pb-2"><h2 className="font-bold text-slate-800">Branch-wise Breakdown</h2></div>
        <table className="w-full min-w-[1280px] text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>{["Branch", "Payable", "Hold", "No F&F", "Loan", "Advance", "EOBI", "Tax", "OT", "Additional Payments", "Total", "Incentive Cash Distributed"].map(h => <th key={h} className="text-left px-4 py-3 font-medium sticky top-0 z-10 bg-slate-50 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibleBranches.length === 0
              ? <tr><td colSpan={12} className="px-4 py-8 text-center text-slate-400">No payroll data for {month}{branchFilter ? ` in ${branchFilter}` : ""}.</td></tr>
              : visibleBranches.map(b => (
                <tr key={b.branch}>
                  <td className="px-4 py-3 font-medium">{b.branch}</td>
                  <td className="px-4 py-3 text-emerald-700">{money(b.payable)}</td>
                  <td className="px-4 py-3 text-amber-600">{money(b.hold)}</td>
                  <td className="px-4 py-3 text-red-500">{money(b.noFnf)}</td>
                  <td className="px-4 py-3">{money(b.loan)}</td>
                  <td className="px-4 py-3">{money(b.advance)}</td>
                  <td className="px-4 py-3">{money(b.eobi)}</td>
                  <td className="px-4 py-3">{money(b.tax)}</td>
                  <td className="px-4 py-3">{money(b.overtime)}</td>
                  <td className="px-4 py-3">{money(b.cashIncentives)}</td>
                  <td className="px-4 py-3 font-bold">{money(b.total)}</td>
                  <td className="px-4 py-3">
                    {b.cashIncentives <= 0 ? (
                      <span className="text-slate-300">—</span>
                    ) : b.incentivePaid ? (
                      <span className="text-emerald-600 font-medium text-xs">✓ Distributed</span>
                    ) : (
                      <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer">
                        <input type="checkbox" disabled={marking === b.branch}
                          onChange={() => { if (window.confirm(`Mark incentive cash for ${b.branch} as distributed?`)) markPaid(b.branch); }} />
                        {marking === b.branch ? "Saving…" : "Mark distributed"}
                      </label>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
