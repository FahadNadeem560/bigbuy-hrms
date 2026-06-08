import React, { useState } from "react";
import SalaryComparison from "./SalaryComparison.jsx";
import CompensationManagement from "./CompensationManagement.jsx";
import IncrementHistory from "./IncrementHistory.jsx";

const TABS = [
  ["comparison",   "Salary Comparison"],
  ["compensation", "Compensation"],
  ["increments",   "Increments"],
];

export default function SalaryReports() {
  const [tab, setTab] = useState("comparison");
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
      {tab === "comparison"   && <SalaryComparison />}
      {tab === "compensation" && <CompensationManagement />}
      {tab === "increments"   && <IncrementHistory />}
    </div>
  );
}
