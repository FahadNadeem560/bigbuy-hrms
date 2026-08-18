import React, { useState, useMemo, useEffect } from "react";
import { Button, PageTitle, StatCard } from "../components/ui.jsx";
import { money } from "../utils/format.js";
import BranchDashboard from "./BranchDashboard.jsx";
import ExecutiveDashboard from "./ExecutiveDashboard.jsx";
import { fetchActiveConfidentialIncentives } from "../services/payrollControlService.js";

const TABS = [
  ["overview",   "Overview"],
  ["branch",     "Branch View"],
  ["executive",  "Executive View"],
];

export default function Dashboard({ activeEmployees, attendanceRows, payrollRows, payrollStatus, setActive, role, branchFilter }) {
  const isBranchManager = role === "Branch Manager";
  const canSeeIncentives = role === "Master" || role === "GM";
  const [tab, setTab] = useState(isBranchManager ? "branch" : "overview");
  const [payrollRevealed, setPayrollRevealed] = useState(false);
  const [incentiveRows, setIncentiveRows] = useState([]);
  const visibleTabs = isBranchManager ? TABS.filter(([k]) => k === "branch") : TABS;

  useEffect(() => {
    if (!canSeeIncentives) { setIncentiveRows([]); return; }
    fetchActiveConfidentialIncentives().then(setIncentiveRows).catch(() => setIncentiveRows([]));
  }, [canSeeIncentives]);

  const totalActiveStaff = activeEmployees.length;
  const totalPayroll = payrollRows.reduce((s, r) => s + r.finalSalary, 0);
  const totalGrossSalary = activeEmployees.reduce((s, e) => s + Number(e.salary || 0), 0);
  const totalIncentive = incentiveRows.reduce((s, r) => s + Number(r.amount || 0), 0);
  const branchStats = useMemo(() => {
    const map = {};
    activeEmployees.forEach(e => {
      const b = e.branch || "Unassigned";
      if (!map[b]) map[b] = { branch: b, staff: 0, payroll: 0, gross: 0, incentive: 0 };
      map[b].staff++;
      map[b].gross += Number(e.salary || 0);
    });
    payrollRows.forEach(r => {
      const b = r.branch || "Unassigned";
      if (!map[b]) map[b] = { branch: b, staff: 0, payroll: 0, gross: 0, incentive: 0 };
      map[b].payroll += r.finalSalary;
    });
    incentiveRows.forEach(r => {
      const b = r.branch || "Unassigned";
      if (!map[b]) map[b] = { branch: b, staff: 0, payroll: 0, gross: 0, incentive: 0 };
      map[b].incentive += Number(r.amount || 0);
    });
    return Object.values(map).sort((a, b) => b.staff - a.staff);
  }, [activeEmployees, payrollRows, incentiveRows]);
  // Sanity check: branch-wise sums must reconcile with the topline totals above.
  const branchStaffSum = branchStats.reduce((s, b) => s + b.staff, 0);
  const branchPayrollSum = branchStats.reduce((s, b) => s + b.payroll, 0);
  const totalsMismatch = branchStaffSum !== totalActiveStaff || Math.round(branchPayrollSum) !== Math.round(totalPayroll);
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-5">
        {visibleTabs.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${tab === k ? "bg-slate-950 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            {l}
          </button>
        ))}
      </div>

      {tab === "overview" && !isBranchManager && (
        <div>
          <PageTitle title="HR Dashboard" subtitle="Staff position, payroll snapshot and attendance alerts."
            action={<Button className="rounded-2xl" onClick={() => setActive("imports")}>Import Employees</Button>} />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <StatCard title="Active Staff"    value={totalActiveStaff} sub="Across branches" icon="👥" maskable />
            <StatCard title="Attendance Logs" value={attendanceRows.length}  sub="Processed punches" icon="✅" />
            <StatCard title="Late / Half Day" value={attendanceRows.filter(a => a.status !== "Present").length} sub="Needs review" icon="⚠️" />
            <StatCard title="Payroll"         value={money(totalPayroll)} sub={payrollStatus} icon="💰" maskable />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
            <StatCard title="Gross Base Salary" value={money(totalGrossSalary)} sub="Sum of base salaries" icon="🧾" maskable />
            {canSeeIncentives && (
              <StatCard title="Incentive Amount" value={money(totalIncentive)} sub="Confidential — Master/GM only" icon="🔒" maskable />
            )}
          </div>

          <div className="mt-5 bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto overflow-y-auto max-h-[70vh]">
            <div className="px-5 pt-4 pb-2 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 flex items-center gap-1.5">
                Active Staff & Payroll by Branch
                <button type="button" onClick={() => setPayrollRevealed(r => !r)} title={payrollRevealed ? "Hide payroll" : "Show payroll"}
                  className="text-slate-400 hover:text-slate-600 transition leading-none">
                  {payrollRevealed ? "🙈" : "👁️"}
                </button>
              </h3>
              {totalsMismatch && (
                <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-1 rounded-lg">Totals don't reconcile — check employee branch data</span>
              )}
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="text-left px-4 py-3 font-medium sticky top-0 z-10 bg-slate-50 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">Branch</th>
                  <th className="text-right px-4 py-3 font-medium sticky top-0 z-10 bg-slate-50 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">Active Staff</th>
                  <th className="text-right px-4 py-3 font-medium sticky top-0 z-10 bg-slate-50 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">Gross Base Salary</th>
                  <th className="text-right px-4 py-3 font-medium sticky top-0 z-10 bg-slate-50 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">Payroll</th>
                  {canSeeIncentives && <th className="text-right px-4 py-3 font-medium sticky top-0 z-10 bg-slate-50 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">Incentive</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {branchStats.map(b => (
                  <tr key={b.branch}>
                    <td className="px-4 py-3 font-medium">{b.branch}</td>
                    <td className="px-4 py-3 text-right">{b.staff}</td>
                    <td className="px-4 py-3 text-right">{payrollRevealed ? money(b.gross) : "••••••"}</td>
                    <td className="px-4 py-3 text-right">{payrollRevealed ? money(b.payroll) : "••••••"}</td>
                    {canSeeIncentives && <td className="px-4 py-3 text-right">{payrollRevealed ? money(b.incentive) : "••••••"}</td>}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 font-bold bg-slate-50">
                  <td className="px-4 py-3">Total</td>
                  <td className="px-4 py-3 text-right">{totalActiveStaff}</td>
                  <td className="px-4 py-3 text-right">{payrollRevealed ? money(totalGrossSalary) : "••••••"}</td>
                  <td className="px-4 py-3 text-right">{payrollRevealed ? money(totalPayroll) : "••••••"}</td>
                  {canSeeIncentives && <td className="px-4 py-3 text-right">{payrollRevealed ? money(totalIncentive) : "••••••"}</td>}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {tab === "branch"    && <BranchDashboard restrictToBranch={isBranchManager ? branchFilter : null} />}
      {tab === "executive" && !isBranchManager && <ExecutiveDashboard />}
    </div>
  );
}
