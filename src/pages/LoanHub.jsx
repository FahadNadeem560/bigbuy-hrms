import React, { useState } from "react";
import LoanManagement from "./LoanManagement.jsx";
import FinalSettlement from "./FinalSettlement.jsx";
import Advances from "./Advances.jsx";

const TABS = [
  ["loans",      "Loans"],
  ["advances",   "Salary Advances"],
  ["settlement", "Final Settlement"],
];

export default function LoanHub({ role }) {
  const [tab, setTab] = useState("loans");
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
      {tab === "loans"      && <LoanManagement />}
      {tab === "advances"   && <Advances role={role} />}
      {tab === "settlement" && <FinalSettlement role={role} />}
    </div>
  );
}
