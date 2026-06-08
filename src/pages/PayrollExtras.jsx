import React, { useState } from "react";
import OneTimeAdjustments from "./OneTimeAdjustments.jsx";
import TaxManagement from "./TaxManagement.jsx";

const TABS = [
  ["adjustments", "One-Time Adjustments"],
  ["tax",         "Tax Management"],
];

export default function PayrollExtras({ role }) {
  const [tab, setTab] = useState("adjustments");
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
      {tab === "adjustments" && <OneTimeAdjustments role={role} />}
      {tab === "tax"         && <TaxManagement role={role} />}
    </div>
  );
}
