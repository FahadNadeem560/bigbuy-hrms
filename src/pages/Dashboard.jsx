import React, { useState } from "react";
import { Button, PageTitle, StatCard } from "../components/ui.jsx";
import { money } from "../utils/format.js";
import BranchDashboard from "./BranchDashboard.jsx";
import ExecutiveDashboard from "./ExecutiveDashboard.jsx";

const TABS = [
  ["overview",   "Overview"],
  ["branch",     "Branch View"],
  ["executive",  "Executive View"],
];

export default function Dashboard({ activeEmployees, attendanceRows, payrollRows, payrollStatus, setActive }) {
  const [tab, setTab] = useState("overview");
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-5">
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${tab === k ? "bg-slate-950 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            {l}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div>
          <PageTitle title="HR Dashboard" subtitle="Staff position, payroll snapshot and attendance alerts."
            action={<Button className="rounded-2xl" onClick={() => setActive("imports")}>Import Employees</Button>} />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <StatCard title="Active Staff"    value={activeEmployees.length} sub="Across branches" icon="👥" />
            <StatCard title="Attendance Logs" value={attendanceRows.length}  sub="Processed punches" icon="✅" />
            <StatCard title="Late / Half Day" value={attendanceRows.filter(a => a.status !== "Present").length} sub="Needs review" icon="⚠️" />
            <StatCard title="Payroll"         value={money(payrollRows.reduce((s, r) => s + r.finalSalary, 0))} sub={payrollStatus} icon="💰" />
          </div>
        </div>
      )}

      {tab === "branch"    && <BranchDashboard />}
      {tab === "executive" && <ExecutiveDashboard />}
    </div>
  );
}
