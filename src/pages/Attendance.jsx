import React, { useMemo, useState } from "react";
import { Button, PageTitle, Table } from "../components/ui.js";
import StatusBadge from "../components/StatusBadge.jsx";
import { downloadCSV } from "../utils/downloads.js";
import Timesheet from "./Timesheet.jsx";
import AttendanceAdjustment from "./AttendanceAdjustment.jsx";
import MissingPunch from "./MissingPunch.jsx";
import AttendanceAlerts from "./AttendanceAlerts.jsx";

const TABS = [
  ["records",    "Records"],
  ["timesheet",  "Timesheet"],
  ["adjustments","Adjustments"],
  ["missing",    "Missing Punch"],
  ["alerts",     "Alerts"],
];

export default function Attendance({ rows }) {
  const [mainTab, setMainTab] = useState("records");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const filteredRows = useMemo(() => rows.filter((row) => {
    const employeeMatch = !employeeSearch || String(row.employeeCode || row.name || "").toLowerCase().includes(employeeSearch.toLowerCase());
    const statusMatch = statusFilter === "All" || row.status === statusFilter;
    const fromMatch = !dateFrom || row.date >= dateFrom;
    const toMatch = !dateTo || row.date <= dateTo;
    return employeeMatch && statusMatch && fromMatch && toMatch;
  }), [rows, employeeSearch, statusFilter, dateFrom, dateTo]);

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

      {mainTab === "records" && (
        <div>
          <PageTitle title="Attendance Records" subtitle="Attendance calculated through staff-level policy rules."
            action={<Button className="rounded-2xl" onClick={() => downloadCSV("attendance.csv", filteredRows)}>Export</Button>} />
          <div className="mb-4 grid grid-cols-1 md:grid-cols-4 gap-3 bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
            <input value={employeeSearch} onChange={e => setEmployeeSearch(e.target.value)} placeholder="Search employee code" className="px-4 py-2 rounded-xl border border-slate-200" />
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="px-4 py-2 rounded-xl border border-slate-200" />
            <input type="date" value={dateTo}   onChange={e => setDateTo(e.target.value)}   className="px-4 py-2 rounded-xl border border-slate-200" />
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-4 py-2 rounded-xl border border-slate-200">
              <option>All</option>
              <option>Present</option>
              <option>Short Hours</option>
              <option>Half Day</option>
              <option>Single Punch</option>
              <option>Absent</option>
            </select>
          </div>
          <p className="text-sm text-slate-500 mb-3">Showing {filteredRows.length} of {rows.length} attendance records.</p>
          <Table headers={["Employee","Level","Date","In","Out","Actual Hours","Late","OT","Status"]} rows={filteredRows}
            renderRow={row => (
              <tr key={`${row.employeeCode}-${row.date}-${row.checkIn}`}>
                <td className="px-4 py-3 font-medium">{row.name}</td>
                <td className="px-4 py-3">{row.level}</td>
                <td className="px-4 py-3">{row.date}</td>
                <td className="px-4 py-3">{row.checkIn}</td>
                <td className="px-4 py-3">{row.checkOut}</td>
                <td className="px-4 py-3">{row.actualHours}</td>
                <td className="px-4 py-3">{row.lateMinutes}</td>
                <td className="px-4 py-3">{row.overtimeHours}</td>
                <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
              </tr>
            )} />
        </div>
      )}

      {mainTab === "timesheet"   && <Timesheet />}
      {mainTab === "adjustments" && <AttendanceAdjustment />}
      {mainTab === "missing"     && <MissingPunch />}
      {mainTab === "alerts"      && <AttendanceAlerts />}
    </div>
  );
}
