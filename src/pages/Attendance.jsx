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
  ["missing",    "Missing Punch"],
  ["alerts",     "Alerts"],
];

const ADJ_TONE = { "Pending Approval": "yellow", "Approved": "green", "Rejected": "red" };

function Toggle({ value, onChange, tone = "blue" }) {
  const tones = { blue: "bg-blue-500", green: "bg-green-500", purple: "bg-purple-500" };
  return (
    <button
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none ${value ? (tones[tone] || tones.blue) : "bg-slate-200"}`}
    >
      <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${value ? "translate-x-4" : "translate-x-0"}`} />
    </button>
  );
}

export default function Attendance({ rows, role }) {
  const [mainTab, setMainTab] = useState("records");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [localOverrides, setLocalOverrides] = useState({});
  const [notice, setNotice] = useState("");

  const canToggle = role === "HR" || role === "Master";

  const filteredRows = useMemo(() => rows.filter((row) => {
    const matchName = !employeeSearch || String(row.employeeCode || row.name || "").toLowerCase().includes(employeeSearch.toLowerCase());
    const matchStatus = statusFilter === "All" || row.status === statusFilter;
    const matchFrom = !dateFrom || row.date >= dateFrom;
    const matchTo = !dateTo || row.date <= dateTo;
    return matchName && matchStatus && matchFrom && matchTo;
  }), [rows, employeeSearch, statusFilter, dateFrom, dateTo]);

  const effectiveRows = useMemo(() =>
    filteredRows.map(r => ({ ...r, ...(localOverrides[r.id] || {}) })),
    [filteredRows, localOverrides]
  );

  async function toggleFlag(row, flag, currentValue) {
    if (!row.id || !canToggle) return;
    const newValue = !currentValue;
    const now = new Date().toISOString();
    const adjStatus = role === "Master" ? "Approved" : "Pending Approval";
    const DB_FIELD_MAP = {
      halfDayExempt: "half_day_exempt",
      lateExempt: "late_exempt",
      isGazettedHoliday: "is_gazetted_holiday",
    };
    const dbField = DB_FIELD_MAP[flag];
    if (!dbField) return;

    const update = { [dbField]: newValue, adjustment_status: adjStatus };
    if (role === "Master") update.adjustment_approved_by = "Master";

    const { error } = await supabase.from("attendance").update(update).eq("id", row.id);
    if (error) { setNotice(`Error: ${error.message}`); return; }

    await supabase.from("audit_logs").insert({
      action: "attendance_toggle", entity: "attendance", entity_id: row.id,
      performed_by: role,
      details: `${flag} → ${newValue} for ${row.employeeCode} on ${row.date}. Status: ${adjStatus}`,
      created_at: now,
    }).then(() => {});

    if (role === "HR") {
      await supabase.from("notifications").insert({
        recipient_role: "Master", type: "attendance_adjustment",
        title: "Attendance Toggle Pending Approval",
        message: `HR set ${flag} for ${row.name} on ${row.date}. Awaiting Master approval.`,
        is_read: false, created_at: now,
      }).then(() => {});
    }

    setLocalOverrides(prev => ({
      ...prev,
      [row.id]: { ...prev[row.id], [flag]: newValue, adjustmentStatus: adjStatus },
    }));
    setNotice(`${flag.replace(/([A-Z])/g, " $1").trim()} updated.`);
    setTimeout(() => setNotice(""), 3000);
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

          {notice && <div className="mb-3 p-2 rounded-xl bg-blue-50 text-blue-700 text-sm">{notice}</div>}

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

          <p className="text-sm text-slate-500 mb-3">Showing {effectiveRows.length} of {rows.length} records.</p>

          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  {["Employee","Level","Date","Shift","In","Out","Hours","Late","OT","Status",
                    ...(canToggle ? ["HD Exempt","Late Exempt","Holiday","Adj Status"] : [])
                  ].map(h => <th key={h} className="text-left px-3 py-3 font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {effectiveRows.length === 0
                  ? <tr><td colSpan={canToggle ? 14 : 10} className="px-4 py-8 text-center text-slate-400">No records match the filters.</td></tr>
                  : effectiveRows.map(row => (
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
                      {canToggle && (
                        <>
                          <td className="px-3 py-2.5">
                            <Toggle value={row.halfDayExempt} tone="purple" onChange={() => toggleFlag(row, "halfDayExempt", row.halfDayExempt)} />
                          </td>
                          <td className="px-3 py-2.5">
                            <Toggle value={row.lateExempt} tone="blue" onChange={() => toggleFlag(row, "lateExempt", row.lateExempt)} />
                          </td>
                          <td className="px-3 py-2.5">
                            <Toggle value={row.isGazettedHoliday} tone="green" onChange={() => toggleFlag(row, "isGazettedHoliday", row.isGazettedHoliday)} />
                          </td>
                          <td className="px-3 py-2.5">
                            {row.adjustmentStatus
                              ? <Badge tone={ADJ_TONE[row.adjustmentStatus] || "slate"}>{row.adjustmentStatus}</Badge>
                              : <span className="text-slate-300 text-xs">—</span>}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {canToggle && (
            <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-purple-500 inline-block" /> HD Exempt</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-blue-500 inline-block" /> Late Exempt</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-green-500 inline-block" /> Gazetted Holiday</span>
              {role === "HR" && <span className="text-amber-600 font-medium">HR toggles require Master approval.</span>}
            </div>
          )}
        </div>
      )}

      {mainTab === "timesheet"   && <Timesheet />}
      {mainTab === "adjustments" && <AttendanceAdjustment role={role} />}
      {mainTab === "missing"     && <MissingPunch />}
      {mainTab === "alerts"      && <AttendanceAlerts />}
    </div>
  );
}
