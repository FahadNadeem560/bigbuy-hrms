import React, { useState } from "react";
import Employees from "./Employees.jsx";
import Recruitment from "./Recruitment.jsx";
import DocumentManagement from "./DocumentManagement.jsx";
import StaffCredentials from "./StaffCredentials.jsx";
import OrgChart from "./OrgChart.jsx";

const TABS = [
  ["directory",   "Directory"],
  ["recruitment", "Recruitment"],
  ["documents",   "Documents"],
  ["credentials", "Credentials"],
  ["orgchart",    "Org Chart"],
];

export default function EmployeesHub({ role, ...props }) {
  const [tab, setTab] = useState("directory");

  // Finance cannot see recruitment or documents; Branch Manager only sees the directory (view-only)
  const visibleTabs = TABS.filter(([k]) => {
    if (role === "Finance") return false; // Finance has no access to Employees hub
    if (role === "Branch Manager") return k === "directory";
    return true;
  });

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
      {tab === "directory"   && <Employees {...props} role={role} />}
      {tab === "recruitment" && role !== "Finance" && <Recruitment />}
      {tab === "documents"   && role !== "Finance" && <DocumentManagement />}
      {tab === "credentials" && <StaffCredentials />}
      {tab === "orgchart"    && <OrgChart />}
    </div>
  );
}
