import React, { useState, useEffect } from "react";
import LoanManagement from "./LoanManagement.jsx";
import Advances from "./Advances.jsx";

// Final Settlement moved to the Payroll tab (PayrollAutomation.jsx) — it is a
// payroll-cycle activity, not a lending one.
const TABS = [
  ["loans",    "Loans"],
  ["advances", "Salary Advances"],
];

export default function LoanHub({ role, actorName, initialTab }) {
  const [tab, setTab] = useState(initialTab === "advances" ? "advances" : "loans");
  useEffect(() => { if (initialTab) setTab(initialTab === "advances" ? "advances" : "loans"); }, [initialTab]);
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
      {tab === "loans"    && <LoanManagement role={role} actorName={actorName} />}
      {tab === "advances" && <Advances role={role} actorName={actorName} />}
    </div>
  );
}
