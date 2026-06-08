import React, { useState } from "react";
import FixedAllowances from "./FixedAllowances.jsx";
import FuelAllowance from "./FuelAllowance.jsx";

const TABS = [
  ["fixed", "Fixed Allowances"],
  ["fuel",  "Fuel Allowance"],
];

export default function AllowancesHub({ role }) {
  const [tab, setTab] = useState("fixed");
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
      {tab === "fixed" && <FixedAllowances />}
      {tab === "fuel"  && <FuelAllowance role={role} />}
    </div>
  );
}
