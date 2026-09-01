import React, { useState } from "react";
import Employees from "./Employees.jsx";
import DocumentManagement from "./DocumentManagement.jsx";
import StaffCredentials from "./StaffCredentials.jsx";
import Permissions from "./Permissions.jsx";
import ManpowerDashboard from "./ManpowerDashboard.jsx";
import BranchTransfer from "./BranchTransfer.jsx";
import Warnings from "./Warnings.jsx";
import Performance from "./Performance.jsx";
import AssetTracking from "./AssetTracking.jsx";

// The former standalone "Workforce" hub (Manpower / Transfers / Warnings /
// Performance / Assets) now lives here as extra tabs.
const TABS = [
  ["directory",   "Directory"],
  ["documents",   "Documents"],
  ["credentials", "Credentials"],
  ["permissions", "Permissions"],
  ["manpower",    "Manpower"],
  ["transfers",   "Transfers"],
  ["warnings",    "Warnings & Notices"],
  ["performance", "Performance & KPI"],
  ["assets",      "Assets & Uniforms"],
];
const WORKFORCE_KEYS = ["manpower", "transfers", "warnings", "performance", "assets"];

export default function EmployeesHub({ role, actorName, branchFilter, ...props }) {
  const [tab, setTab] = useState("directory");

  const visibleTabs = TABS.filter(([k]) => {
    // Branch Manager: only the branch-scopable views.
    if (role === "Branch Manager") return k === "directory" || k === "manpower";
    // Finance: the directory plus the org-wide workforce tools (view-only),
    // but not the HR-only Documents / Credentials / Permissions.
    if (role === "Finance") return k === "directory" || WORKFORCE_KEYS.includes(k);
    return true;
  });
  const visibleKeys = visibleTabs.map(([k]) => k);
  const effectiveTab = visibleKeys.includes(tab) ? tab : visibleKeys[0];

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-5">
        {visibleTabs.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${effectiveTab === k ? "bg-slate-950 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            {l}
          </button>
        ))}
      </div>
      {effectiveTab === "directory"   && <Employees {...props} role={role} />}
      {effectiveTab === "documents"   && <DocumentManagement />}
      {effectiveTab === "credentials" && <StaffCredentials />}
      {effectiveTab === "permissions" && <Permissions {...props} role={role} />}
      {effectiveTab === "manpower"    && <ManpowerDashboard branchFilter={branchFilter} />}
      {effectiveTab === "transfers"   && role !== "Branch Manager" && <BranchTransfer role={role} actorName={actorName} />}
      {effectiveTab === "warnings"    && role !== "Branch Manager" && <Warnings />}
      {effectiveTab === "performance" && role !== "Branch Manager" && <Performance />}
      {effectiveTab === "assets"      && role !== "Branch Manager" && <AssetTracking />}
    </div>
  );
}
