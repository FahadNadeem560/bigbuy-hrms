import React, { useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { Button, Badge, PageTitle } from "../components/ui.js";
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
  ["missing",    "Missing Punches"],
  ["alerts",     "Alerts"],
];

const PAGE_SIZE = 50;

export default function Attendance({ rows, role, branchFilter, employees }) {
  const [mainTab, setMainTab] = useState("records");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const empBranchMap = useMemo(() => Object.fromEntries((employees || []).map(e => [e.id, e.branch])), [employees]);

  const filteredRows = useMemo(() => rows.filter((row) => {
    const matchName = !employeeSearch || String(row.employeeCode || row.name || "").toLowerCase().includes(employeeSearch.toLowerCase());
    const matchStatus = statusFilter === "All" || row.status === statusFilter;
    const matchFrom = !dateFrom || row.date >= dateFrom;
    const matchTo = !dateTo || row.date <= dateTo;
    const matchBranch = !branchFilter || empBranchMap[row.employeeCode] === branchFilter;
    return matchName && matchStatus && matchFrom && matchTo && matchBranch;
  }), [rows, employeeSearch, statusFilter, dateFrom, dateTo, branchFilter, empBranchMap]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);

  const pagedRows = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredRows.slice(start, start + PAGE_SIZE);
  }, [filteredRows, safePage]);

  function updateFilter(setter) {
    return (value) => { setter(value); setPage(1); };
  }

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
            <input value={employeeSearch} onChange={e => updateFilter(setEmployeeSearch)(e.target.value)} placeholder="Search employee code" className="px-4 py-2 rounded-xl border border-slate-200" />
            <input type="date" value={dateFrom} onChange={e => updateFilter(setDateFrom)(e.target.value)} className="px-4 py-2 rounded-xl border border-slate-200" />
            <input type="date" value={dateTo}   onChange={e => updateFilter(setDateTo)(e.target.value)}   className="px-4 py-2 rounded-xl border border-slate-200" />
            <select value={statusFilter} onChange={e => updateFilter(setStatusFilter)(e.target.value)} className="px-4 py-2 rounded-xl border border-slate-200">
              <option>All</option>
              <option>Present</option>
              <option>Short Hours</option>
              <option>Half Day</option>
              <option>Single Punch</option>
              <option>Absent</option>
            </select>
          </div>

          <p className="text-sm text-slate-500 mb-3">
            Showing {pagedRows.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1}–{(safePage - 1) * PAGE_SIZE + pagedRows.length} of {filteredRows.length} records
            {filteredRows.length !== rows.length ? ` (filtered from ${rows.length})` : ""}.
          </p>
          <p className="text-xs text-slate-400 mb-3">
            HD Exempt / Late Exempt / Gazetted Holiday / Adjustment Status are now managed per-employee from the Timesheet tab.
          </p>

          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  {["Employee","Level","Date","Shift","In","Out","Hours","Late","OT","Status"].map(h => <th key={h} className="text-left px-3 py-3 font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedRows.length === 0
                  ? <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-400">No records match the filters.</td></tr>
                  : pagedRows.map(row => (
                    <tr key={`${row.id || row.employeeCode}-${row.date}-${row.checkIn}`}
                      className={row.isGazettedHoliday ? "bg-green-50/30" : row.halfDayExempt ? "bg-purple-50/20" : ""}>
                      <td className="px-3 py-2.5 font-medium">{row.name}</td>
                      <td className="px-3 py-2.5 text-slate-500">{row.level}</td>
                      <td className="px-3 py-2.5">{row.date}</td>
                      <td className="px-3 py-2.5">
                        {row.detectedShift
                          ? <Badge tone={row.detectedShift === "A" ? "blue" : row.detectedShift === "B" ? "purple" : "yellow"}>
                              {row.detectedShift === "HalfDay" ? "Half Day" : `Shift ${row.detectedShift}`}
                            </Badge>
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5">{row.checkIn}</td>
                      <td className="px-3 py-2.5">{row.checkOut}</td>
                      <td className="px-3 py-2.5">{row.actualHours}</td>
                      <td className="px-3 py-2.5">{row.lateMinutes > 0 ? <span className="text-amber-600 font-medium">{row.lateMinutes}</span> : "0"}</td>
                      <td className="px-3 py-2.5">{row.overtimeHours > 0 ? <span className="text-blue-600 font-medium">{row.overtimeHours}</span> : "0"}</td>
                      <td className="px-3 py-2.5"><StatusBadge status={row.status} /></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {pageCount > 1 && (
            <div className="mt-3 flex items-center justify-between text-sm">
              <Button variant="outline" className="rounded-xl" disabled={safePage <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                Previous
              </Button>
              <span className="text-slate-500">Page {safePage} of {pageCount}</span>
              <Button variant="outline" className="rounded-xl" disabled={safePage >= pageCount} onClick={() => setPage(p => Math.min(pageCount, p + 1))}>
                Next
              </Button>
            </div>
          )}
        </div>
      )}

      {mainTab === "timesheet"   && <Timesheet branchFilter={branchFilter} role={role} />}
      {mainTab === "adjustments" && <AttendanceAdjustment role={role} />}
      {mainTab === "missing"     && <MissingPunch />}
      {mainTab === "alerts"      && <AttendanceAlerts />}
    </div>
  );
}
