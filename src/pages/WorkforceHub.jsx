import React, { useState } from "react";
import ManpowerDashboard from "./ManpowerDashboard.jsx";
import BranchTransfer from "./BranchTransfer.jsx";
import Warnings from "./Warnings.jsx";
import Performance from "./Performance.jsx";
import AssetTracking from "./AssetTracking.jsx";

const TABS = [
  ["manpower",  "Manpower"],
  ["transfers", "Transfers"],
  ["warnings",  "Warnings & Notices"],
  ["performance","Performance & KPI"],
  ["assets",    "Assets & Uniforms"],
];

export default function WorkforceHub({ role, branchFilter }) {
  const [tab, setTab] = useState("manpower");
  // Branch Manager only gets the branch-scopable Manpower view; the rest
  // (transfers/warnings/performance/assets) are org-wide tools.
  const visibleTabs = role === "Branch Manager" ? TABS.filter(([k]) => k === "manpower") : TABS;
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
      {tab === "manpower"   && <ManpowerDashboard branchFilter={branchFilter} />}
      {tab === "transfers"  && role !== "Branch Manager" && <BranchTransfer />}
      {tab === "warnings"   && role !== "Branch Manager" && <Warnings />}
      {tab === "performance"&& role !== "Branch Manager" && <Performance />}
      {tab === "assets"     && role !== "Branch Manager" && <AssetTracking />}
    </div>
  );
}
