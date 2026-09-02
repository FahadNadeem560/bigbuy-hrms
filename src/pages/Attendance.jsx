import React, { useState } from "react";
import Timesheet from "./Timesheet.jsx";
import AttendanceAdjustment from "./AttendanceAdjustment.jsx";
import MissingPunch from "./MissingPunch.jsx";
import AttendanceAlerts from "./AttendanceAlerts.jsx";
import AttendanceRecords from "./AttendanceRecords.jsx";
import GazettedHolidays from "./GazettedHolidays.jsx";

const TABS = [
  ["records",    "Records"],
  ["timesheet",  "Timesheet"],
  ["adjustments","Adjustments"],
  ["missing",    "Missing Punches"],
  ["holidays",   "Holidays"],
  ["alerts",     "Alerts"],
];

export default function Attendance({ rows, role, branchFilter, employees }) {
  const [mainTab, setMainTab] = useState("records");

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-5">
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setMainTab(k)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${mainTab === k ? "bg-slate-950 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            {l}
          </button>
        ))}
      </div>

      {mainTab === "records"     && <AttendanceRecords rows={rows} employees={employees} branchFilter={branchFilter} role={role} />}
      {mainTab === "timesheet"   && <Timesheet branchFilter={branchFilter} role={role} />}
      {mainTab === "adjustments" && <AttendanceAdjustment role={role} />}
      {mainTab === "missing"     && <MissingPunch role={role} branchFilter={branchFilter} />}
      {mainTab === "holidays"    && <GazettedHolidays role={role} />}
      {mainTab === "alerts"      && <AttendanceAlerts />}
    </div>
  );
}
