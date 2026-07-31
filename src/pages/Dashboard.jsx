import React, { useState, useMemo } from "react";
import { Button, PageTitle, StatCard } from "../components/ui.jsx";
import { money } from "../utils/format.js";
import BranchDashboard from "./BranchDashboard.jsx";
import ExecutiveDashboard from "./ExecutiveDashboard.jsx";

const TABS = [
  ["overview",   "Overview"],
  ["branch",     "Branch View"],
  ["executive",  "Executive View"],
];

export default function Dashboard({ activeEmployees, attendanceRows, payrollRows, payrollStatus, setActive, role, branchFilter }) {
  const isBranchManager = role === "Branch Manager";
  const [tab, setTab] = useState(isBranchManager ? "branch" : "overview");
  const visibleTabs = isBranchManager ? TABS.filter(([k]) => k === "branch") : TABS;

  const totalActiveStaff = activeEmployees.length;
  const totalPayroll = payrollRows.reduce((s, r) => s + r.finalSalary, 0);
  const branchStats = useMemo(() => {
    const map = {};
    activeEmployees.forEach(e => {
      const b = e.branch || "Unassigned";
      if (!map[b]) map[b] = { branch: b, staff: 0, payroll: 0 };
      map[b].staff++;
    });
    payrollRows.forEach(r => {
      const b = r.branch || "Unassigned";
      if (!map[b]) map[b] = { branch: b, staff: 0, payroll: 0 };
      map[b].payroll += r.finalSalary;
    });
    return Object.values(map).sort((a, b) => b.staff - a.staff);
  }, [activeEmployees, payrollRows]);
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

          <div className="mt-5 bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
            <div className="px-5 pt-4 pb-2 flex items-center justify-between">
              <h3 className="font-bold text-slate-800">Active Staff & Payroll by Branch</h3>
              {totalsMismatch && (
                <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-1 rounded-lg">Totals don't reconcile — check employee branch data</span>
              )}
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Branch</th>
                  <th className="text-right px-4 py-3 font-medium">Active Staff</th>
                  <th className="text-right px-4 py-3 font-medium">Payroll</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {branchStats.map(b => (
                  <tr key={b.branch}>
                    <td className="px-4 py-3 font-medium">{b.branch}</td>
                    <td className="px-4 py-3 text-right">{b.staff}</td>
                    <td className="px-4 py-3 text-right">{money(b.payroll)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 font-bold bg-slate-50">
                  <td className="px-4 py-3">Total</td>
                  <td className="px-4 py-3 text-right">{totalActiveStaff}</td>
                  <td className="px-4 py-3 text-right">{money(totalPayroll)}</td>
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
