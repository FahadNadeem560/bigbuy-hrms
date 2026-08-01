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
  })), [payroll, empByCode]);

  const totals = useMemo(() => {
    const normal = rows.filter(r => r.paymentStatus === "Normal").reduce((s, r) => s + r.netSalary, 0);
    const fnf = rows.filter(r => r.paymentStatus === "FnF").reduce((s, r) => s + r.netSalary, 0);
    const holdover = rows.reduce((s, r) => s + r.holdoverAmount, 0);
    const totalToPay = normal + fnf + holdover + cashIncentiveTotal;
    const alreadyPaid = rows.filter(r => ["Normal", "FnF"].includes(r.paymentStatus) && r.isPaid).reduce((s, r) => s + r.netSalary, 0);
    const remaining = totalToPay - alreadyPaid;
    return { normal, fnf, holdover, cashIncentiveTotal, totalToPay, alreadyPaid, remaining };
  }, [rows, cashIncentiveTotal]);

  const incentivePaidByBranch = useMemo(() => Object.fromEntries(incentiveBranchTotals.map(b => [b.branch, !!b.is_paid])), [incentiveBranchTotals]);

  const byBranch = useMemo(() => {
    const acc = {};
    rows.forEach(r => {
      if (!acc[r.branch]) acc[r.branch] = { branch: r.branch, payable: 0, hold: 0, noFnf: 0 };
      if (r.paymentStatus === "Normal" || r.paymentStatus === "FnF") acc[r.branch].payable += r.netSalary;
      else if (r.paymentStatus === "Hold") acc[r.branch].hold += r.netSalary;
      else if (r.paymentStatus === "No_FnF") acc[r.branch].noFnf += r.netSalary;
    });
    Object.keys(incentiveByBranch).forEach(b => { if (!acc[b]) acc[b] = { branch: b, payable: 0, hold: 0, noFnf: 0 }; });
    return Object.values(acc).map(b => ({
      ...b, cashIncentives: incentiveByBranch[b.branch] || 0,
      total: b.payable + (incentiveByBranch[b.branch] || 0),
      incentivePaid: incentivePaidByBranch[b.branch] || false,
    })).sort((a, b) => a.branch.localeCompare(b.branch));
  }, [rows, incentiveByBranch, incentivePaidByBranch]);

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
      <div className="mb-4">
        <p className="text-xs text-slate-500 mb-1">Month</p>
        <input type="month" value={month} onChange={e => setMonth(e.target.value)}
          className="px-4 py-2 rounded-xl border border-slate-200 text-sm bg-white" />
      </div>

      {msg && <div className="mb-3 p-3 rounded-xl bg-blue-50 text-blue-700 text-sm">{msg}</div>}
      {err && <div className="mb-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{err}</div>}

      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-2 mb-6 max-w-xl">
        <div className="px-3 pt-2 pb-1"><h2 className="font-bold text-slate-800">Finance Payment Schedule — {month}</h2></div>
        <Line label="Regular Payroll (Normal)" value={totals.normal} />
        <Line label="F&F Settlements" value={totals.fnf} />
        <Line label="Previous Month Holdover" value={totals.holdover} />
        <Line label="Additional Payments (by branch)" value={totals.cashIncentiveTotal} />
        <Line label="TOTAL TO PAY" value={totals.totalToPay} bold />
        <Line label="Already Paid" value={totals.alreadyPaid} />
        <Line label="Remaining" value={totals.remaining} highlight />
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
        <div className="px-5 pt-4 pb-2"><h2 className="font-bold text-slate-800">Branch-wise Breakdown</h2></div>
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>{["Branch", "Payable", "Hold", "No F&F", "Additional Payments", "Total", "Incentive Cash Distributed"].map(h => <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {byBranch.length === 0
              ? <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No payroll data for {month}.</td></tr>
              : byBranch.map(b => (
                <tr key={b.branch}>
                  <td className="px-4 py-3 font-medium">{b.branch}</td>
                  <td className="px-4 py-3 text-emerald-700">{money(b.payable)}</td>
                  <td className="px-4 py-3 text-amber-600">{money(b.hold)}</td>
                  <td className="px-4 py-3 text-red-500">{money(b.noFnf)}</td>
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
