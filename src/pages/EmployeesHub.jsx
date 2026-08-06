import React, { useState } from "react";
import Employees from "./Employees.jsx";
import Recruitment from "./Recruitment.jsx";
import DocumentManagement from "./DocumentManagement.jsx";
import StaffCredentials from "./StaffCredentials.jsx";
import Permissions from "./Permissions.jsx";

const TABS = [
  ["directory",   "Directory"],
  ["recruitment", "Recruitment"],
  ["documents",   "Documents"],
  ["credentials", "Credentials"],
  ["permissions", "Permissions"],
];

export default function EmployeesHub({ role, ...props }) {
  const [tab, setTab] = useState("directory");

  // Finance and Branch Manager only see the directory (view-only for both)
  const visibleTabs = TABS.filter(([k]) => {
    if (role === "Finance") return k === "directory";
    if (role === "Branch Manager") return k === "directory";
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
      {effectiveTab === "recruitment" && <Recruitment />}
      {effectiveTab === "documents"   && <DocumentManagement />}
      {effectiveTab === "credentials" && <StaffCredentials />}
      {effectiveTab === "permissions" && <Permissions {...props} role={role} />}
    </div>
  );
}
