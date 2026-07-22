import React, { useState, useEffect, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../lib/supabaseClient.js";
import { Button, Badge, PageTitle } from "../components/ui.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { BRANCH_CODE_MAP } from "../constants/branches.js";
import { STAFF_LEVEL_POLICIES } from "../config/staffPolicies.js";

const SHORT_TOLERANCE = 1.5;
const OT_TOLERANCE = 1.5;
const LATE_WARNING_COUNT = 2;
const ADJ_TONE = { "Pending Approval": "yellow", "Approved": "green", "Rejected": "red" };
const DB_FIELD_MAP = {
  halfDayExempt: "half_day_exempt",
  lateExempt: "late_exempt",
  isGazettedHoliday: "is_gazetted_holiday",
};

function fmt2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function enumerateDates(from, to) {
  const dates = [];
  const cursor = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  while (cursor <= end) {
    dates.push(fmtDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function getDayName(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { weekday: "short" });
}

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

function formatTime(t) {
  if (!t) return "-";
  const s = String(t);
  if (s.includes("T")) return s.slice(11, 16);
  if (s.length >= 5) return s.slice(0, 5);
  return s;
}

export default function Timesheet({ branchFilter, role }) {
  const [empSearch, setEmpSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [branch, setBranch] = useState(branchFilter || "All");
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));

  const [employees, setEmployees] = useState([]);
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [roster, setRoster] = useState([]);
  const [leaveData, setLeaveData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);

  const canToggle = role === "HR" || role === "Master";

  useEffect(() => {
    let q = supabase
      .from("employees")
      .select("employee_code, full_name, department, branch, staff_level, ot_eligible, status")
      .order("full_name");
    if (branchFilter) q = q.eq("branch", branchFilter);
    q.then(({ data }) => setEmployees(data || []));
  }, [branchFilter]);

  useEffect(() => {
    function handleClick(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filteredEmps = useMemo(() => {
    if (!empSearch.trim()) return [];
    const q = empSearch.toLowerCase();
    return employees
      .filter((e) => {
        const hit = e.full_name?.toLowerCase().includes(q) || e.employee_code?.toLowerCase().includes(q);
        const deptHit = !department || e.department?.toLowerCase().includes(department.toLowerCase());
        const branchHit = branch === "All" || e.branch === branch;
        return hit && deptHit && branchHit;
      })
      .slice(0, 12);
  }, [employees, empSearch, department, branch]);

  async function loadTimesheet(emp) {
    setSelectedEmp(emp);
    setShowDropdown(false);
    setEmpSearch("");
    setLoading(true);
    setError("");
    try {
      const { data: att, error: attErr } = await supabase
        .from("attendance")
        .select("*")
        .eq("employee_code", emp.employee_code)
        .gte("work_date", fromDate)
        .lte("work_date", toDate)
        .order("work_date", { ascending: true });
      if (attErr) throw attErr;
      setAttendance(att || []);

      const { data: rst } = await supabase
        .from("employee_work_rosters")
        .select("roster_date, is_weekly_off, is_gazetted_holiday")
        .eq("employee_code", emp.employee_code)
        .gte("roster_date", fromDate)
        .lte("roster_date", toDate);
      setRoster(rst || []);

      const { data: lv } = await supabase
        .from("leaves")
        .select("*")
        .eq("employee_id", emp.employee_code)
        .maybeSingle();
      setLeaveData(lv || null);
    } catch (err) {
      setError(err.message);
      setAttendance([]);
      setRoster([]);
    } finally {
      setLoading(false);
    }
  }

  function reloadWithDates() {
    if (selectedEmp) loadTimesheet(selectedEmp);
  }

  function clearSelection() {
    setSelectedEmp(null);
    setAttendance([]);
    setRoster([]);
    setLeaveData(null);
    setEmpSearch("");
    setError("");
  }

  async function toggleFlag(row, flag, currentValue) {
    if (!row.id || !canToggle) return;
    const newValue = !currentValue;
    const now = new Date().toISOString();
    const adjStatus = role === "Master" ? "Approved" : "Pending Approval";
    const dbField = DB_FIELD_MAP[flag];
    if (!dbField) return;

    const update = { [dbField]: newValue, adjustment_status: adjStatus };
    if (role === "Master") update.adjustment_approved_by = "Master";

    const { error: updErr } = await supabase.from("attendance").update(update).eq("id", row.id);
    if (updErr) { setNotice(`Error: ${updErr.message}`); return; }

    await supabase.from("audit_logs").insert({
      action: "attendance_toggle", entity: "attendance", entity_id: row.id,
      performed_by: role,
      details: `${flag} → ${newValue} for ${row.employee_code} on ${row.work_date}. Status: ${adjStatus}`,
      created_at: now,
    }).then(() => {});

    if (role === "HR") {
      await supabase.from("notifications").insert({
        recipient_role: "Master", type: "attendance_adjustment",
        title: "Attendance Toggle Pending Approval",
        message: `HR set ${flag} for ${selectedEmp?.full_name} on ${row.work_date}. Awaiting Master approval.`,
        is_read: false, created_at: now,
      }).then(() => {});
    }

    setAttendance(prev => prev.map(r => r.id === row.id
      ? { ...r, [dbField]: newValue, adjustment_status: adjStatus, ...(role === "Master" ? { adjustment_approved_by: "Master" } : {}) }
      : r
    ));
    setNotice(`${flag.replace(/([A-Z])/g, " $1").trim()} updated.`);
    setTimeout(() => setNotice(""), 3000);
  }

  const isOtEligible = useMemo(() => {
    if (!selectedEmp) return false;
    if (selectedEmp.ot_eligible != null) return !!selectedEmp.ot_eligible;
    const policy = STAFF_LEVEL_POLICIES[selectedEmp.staff_level];
    return policy ? !!policy.overtimeEligible : false;
  }, [selectedEmp]);

  const lateSummary = useMemo(() => {
    const lateRows = attendance.filter((r) => Number(r.late_minutes || 0) > 0);
    const totalLateCount = lateRows.length;
    const totalLateMins = lateRows.reduce((s, r) => s + Number(r.late_minutes || 0), 0);
    const deductibleLates = Math.max(0, totalLateCount - LATE_WARNING_COUNT);
    return { totalLateCount, totalLateMins, deductibleLates };
  }, [attendance]);

  const shortSummary = useMemo(() => {
    const totalShort = fmt2(attendance.reduce((s, r) => s + Number(r.short_hours || r.short_hour || 0), 0));
    const deductibleShort = fmt2(Math.max(0, totalShort - SHORT_TOLERANCE));
    return { totalShort, deductibleShort };
  }, [attendance]);

  const otSummary = useMemo(() => {
    const totalOT = fmt2(attendance.reduce((s, r) => s + Number(r.ot_hours || r.overtime_hours || 0), 0));
    const payableOT = isOtEligible ? fmt2(Math.max(0, totalOT - OT_TOLERANCE)) : 0;
    return { totalOT, payableOT };
  }, [attendance, isOtEligible]);

  const ledger = useMemo(() => {
    if (!selectedEmp || !fromDate || !toDate) return [];
    const byDate = {};
    attendance.forEach((r) => { byDate[r.work_date] = r; });
    const rosterByDate = {};
    roster.forEach((r) => { rosterByDate[r.roster_date] = r; });
    const todayStr = fmtDate(new Date());

    return enumerateDates(fromDate, toDate)
      .map((date) => {
        if (byDate[date]) return byDate[date];
        if (date > todayStr) return null;
        const rosterEntry = rosterByDate[date];
        let status = "Absent";
        if (rosterEntry?.is_weekly_off) status = "Weekly Off";
        else if (rosterEntry?.is_gazetted_holiday) status = "Gazetted Holiday";
        return { work_date: date, attendance_status: status, is_synthetic: true };
      })
      .filter(Boolean);
  }, [selectedEmp, attendance, roster, fromDate, toDate]);

  function exportExcel() {
    if (!selectedEmp) return;
    const ledgerRows = ledger.map((r) => ({
      Date: r.work_date,
      Day: getDayName(r.work_date),
      In: formatTime(r.check_in || r.time_in),
      Out: formatTime(r.check_out || r.time_out),
      "Hours Worked": r.actual_hours ?? r.hours_worked ?? 0,
      "Late (mins)": r.late_minutes || 0,
      "Short (hrs)": r.short_hours || 0,
      "OT (hrs)": r.ot_hours ?? r.overtime_hours ?? 0,
      Status: r.attendance_status || r.status || "",
    }));

    const summaryRows = [
      {},
      { Date: "--- LATE SUMMARY ---" },
      { Date: "Total Late Count", Day: lateSummary.totalLateCount },
      { Date: "Total Late Minutes", Day: lateSummary.totalLateMins },
      { Date: `Warning only (first ${LATE_WARNING_COUNT})`, Day: Math.min(lateSummary.totalLateCount, LATE_WARNING_COUNT) },
      { Date: "Deductible Lates", Day: lateSummary.deductibleLates },
      {},
      { Date: "--- SHORT HOURS SUMMARY ---" },
      { Date: "Monthly Short Hours", Day: shortSummary.totalShort },
      { Date: "Tolerance (hrs)", Day: SHORT_TOLERANCE },
      { Date: "Deductible Short Hours", Day: shortSummary.deductibleShort },
      {},
      { Date: "--- OT SUMMARY ---" },
      { Date: "Monthly OT (hrs)", Day: otSummary.totalOT },
      { Date: "Tolerance (hrs)", Day: OT_TOLERANCE },
      { Date: "OT Eligible", Day: isOtEligible ? "Yes" : "No" },
      { Date: "Payable OT (hrs)", Day: otSummary.payableOT },
    ];

    if (leaveData) {
      summaryRows.push(
        {},
        { Date: "--- LEAVE BALANCE ---" },
        { Date: "Opening Balance", Day: leaveData.opening_balance ?? "" },
        { Date: "Earned", Day: leaveData.earned ?? "" },
        { Date: "Used", Day: leaveData.used ?? "" },
        { Date: "Half Leaves", Day: leaveData.half_leaves ?? "" },
        { Date: "Remaining Balance", Day: leaveData.remaining ?? leaveData.remaining_balance ?? "" }
      );
    }

    const ws = XLSX.utils.json_to_sheet([...ledgerRows, ...summaryRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Timesheet");
    XLSX.writeFile(wb, `timesheet_${selectedEmp.employee_code}_${fromDate}_${toDate}.xlsx`);
  }

  return (
    <div>
      <PageTitle
        title="Employee Timesheet"
        subtitle="Attendance ledger with late, short hours, OT and leave summary."
        action={
          selectedEmp ? (
            <div className="flex gap-2 print:hidden">
              <Button variant="outline" onClick={exportExcel} className="rounded-2xl">
                Export Excel
              </Button>
              <Button variant="outline" onClick={() => window.print()} className="rounded-2xl">
                Print / PDF
              </Button>
            </div>
          ) : null
        }
      />

      {/* Filter Bar */}
      <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm mb-4 print:hidden">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
          <div className="relative lg:col-span-2" ref={dropdownRef}>
            <input
              value={selectedEmp ? `${selectedEmp.employee_code} — ${selectedEmp.full_name}` : empSearch}
              onChange={(e) => {
                if (selectedEmp) clearSelection();
                setEmpSearch(e.target.value);
                setShowDropdown(true);
              }}
              onFocus={() => { if (!selectedEmp) setShowDropdown(true); }}
              placeholder="Search by code or name..."
              className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm"
            />
            {showDropdown && filteredEmps.length > 0 && (
              <div className="absolute z-20 top-full left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-lg mt-1 max-h-64 overflow-y-auto">
                {filteredEmps.map((emp) => (
                  <button
                    key={emp.employee_code}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => loadTimesheet(emp)}
                    className="w-full text-left px-4 py-2.5 hover:bg-slate-50 text-sm border-b border-slate-50 last:border-0"
                  >
                    <span className="font-semibold text-slate-800">{emp.employee_code}</span>
                    <span className="mx-2 text-slate-300">|</span>
                    <span className="text-slate-700">{emp.full_name}</span>
                    <span className="ml-2 text-xs text-slate-400">{emp.department} · {emp.branch}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <input
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            placeholder="Department"
            className="px-4 py-2 rounded-xl border border-slate-200 text-sm"
          />

          <select
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            disabled={!!branchFilter}
            className="px-4 py-2 rounded-xl border border-slate-200 text-sm disabled:bg-slate-50 disabled:text-slate-500"
          >
            <option value="All">All Branches</option>
            {Object.keys(BRANCH_CODE_MAP).map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>

          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="px-4 py-2 rounded-xl border border-slate-200 text-sm"
          />
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="px-4 py-2 rounded-xl border border-slate-200 text-sm"
          />
        </div>

        {selectedEmp && (
          <div className="mt-3 pt-3 border-t border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-2">
            <div className="text-sm text-slate-600">
              <span className="font-bold text-slate-900">{selectedEmp.employee_code}</span>
              <span className="mx-2 text-slate-300">|</span>
              {selectedEmp.full_name}
              <span className="ml-3 text-slate-400">
                {selectedEmp.department} · {selectedEmp.branch} · {selectedEmp.staff_level}
              </span>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button onClick={reloadWithDates} className="rounded-xl text-xs px-3 py-1.5">
                Reload
              </Button>
              <Button variant="outline" onClick={clearSelection} className="rounded-xl text-xs px-3 py-1.5">
                Clear
              </Button>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{error}</div>
      )}

      {loading && (
        <div className="bg-white border border-slate-100 rounded-2xl p-12 text-center text-slate-400 shadow-sm">
          Loading timesheet...
        </div>
      )}

      {!loading && !selectedEmp && (
        <div className="bg-white border border-slate-100 rounded-2xl p-12 text-center text-slate-400 shadow-sm">
          <div className="text-4xl mb-3">📋</div>
          <p className="font-medium">Search and select an employee to view their timesheet.</p>
          <p className="text-xs mt-1">Enter an employee code or name in the search box above.</p>
        </div>
      )}

      {!loading && selectedEmp && (
        <>
          {/* Print CSS — compact everything (via root font-size, since Tailwind spacing is rem-based)
              so a full month's ledger + summaries + signatures fits on one A4 page. */}
          <style>{`
            @media print {
              @page { size: A4 portrait; margin: 10mm; }
              html, body { font-size: 10px; }
              body * { visibility: hidden; }
              #timesheet-print-root, #timesheet-print-root * { visibility: visible; }
              #timesheet-print-root { position: absolute; top: 0; left: 0; width: 100%; }
              #timesheet-print-root table { page-break-inside: auto; }
              #timesheet-print-root tr { page-break-inside: avoid; }
            }
          `}</style>

          <div id="timesheet-print-root">
            {/* Print-only A4 header */}
            <div className="hidden print:block mb-2">
              <div className="flex justify-between items-start border-b-2 border-slate-800 pb-2 mb-2">
                <div>
                  <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">The Big Buy</h1>
                  <p className="text-xs text-slate-500">Attendance Summary Report</p>
                </div>
                <div className="text-right text-xs text-slate-500">
                  <p>Period: {fromDate} — {toDate}</p>
                  <p>Generated: {new Date().toLocaleDateString()}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-8 gap-y-0.5 text-sm mb-2">
                {[
                  ["Employee Code", selectedEmp.employee_code],
                  ["Full Name", selectedEmp.full_name],
                  ["Department", selectedEmp.department],
                  ["Branch", selectedEmp.branch],
                  ["Staff Level", selectedEmp.staff_level],
                  ["OT Eligible", isOtEligible ? "Yes" : "No"],
                ].map(([l, v]) => (
                  <div key={l} className="flex gap-2">
                    <span className="font-semibold text-slate-700 w-32 shrink-0">{l}:</span>
                    <span className="text-slate-600">{v || "—"}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Attendance Ledger */}
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm mb-4 overflow-x-auto print:rounded-none print:border-0 print:shadow-none print:mb-1">
              <div className="px-5 pt-4 pb-2 print:px-0 print:pt-0 print:pb-1">
                <h2 className="font-bold text-slate-800 print:text-sm">Attendance Ledger</h2>
                <p className="text-xs text-slate-400 mt-0.5 print:hidden">
                  {fromDate} — {toDate} · {ledger.length} day{ledger.length !== 1 ? "s" : ""}
                </p>
                {notice && <p className="text-xs text-blue-700 bg-blue-50 rounded-lg px-3 py-1.5 mt-2 inline-block print:hidden">{notice}</p>}
              </div>
              <table className="w-full min-w-[820px] text-sm print:min-w-0 print:text-[9px]">
                <thead className="bg-slate-50 text-slate-500 print:bg-slate-200">
                  <tr>
                    {["Date", "Day", "Shift", "In", "Out", "Hours", "Late (min)", "Short (hrs)", "OT (hrs)", "Status",
                      ...(canToggle ? ["HD Exempt", "Late Exempt", "Holiday", "Adj Status"] : [])
                    ].map((h) => (
                      <th key={h} className={`text-left px-4 py-3 font-medium print:px-1.5 print:py-1 ${canToggle && ["HD Exempt","Late Exempt","Holiday","Adj Status"].includes(h) ? "print:hidden" : ""}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ledger.length === 0 ? (
                    <tr>
                      <td colSpan={canToggle ? 14 : 10} className="px-4 py-10 text-center text-slate-400">
                        No attendance records found for this period.
                      </td>
                    </tr>
                  ) : (
                    ledger.map((row, i) => {
                      const status = row.attendance_status || row.status || "Pending";
                      const shift = row.detected_shift;
                      const rowClass = status === "Absent" ? "bg-red-50/40"
                        : (status === "Weekly Off" || status === "Gazetted Holiday") ? "bg-slate-50/60"
                        : "";
                      return (
                        <tr key={row.id || row.work_date || i} className={rowClass}>
                          <td className="px-4 py-3 font-medium text-slate-800 print:px-1.5 print:py-0.5">{row.work_date}</td>
                          <td className="px-4 py-3 text-slate-400 text-xs print:px-1.5 print:py-0.5">{getDayName(row.work_date)}</td>
                          <td className="px-4 py-3 print:px-1.5 print:py-0.5">
                            {shift ? (
                              <span className={`font-medium ${shift === "A" ? "text-blue-600" : shift === "B" ? "text-purple-600" : "text-amber-600"}`}>
                                {shift === "HalfDay" ? "HD" : `Sh.${shift}`}
                              </span>
                            ) : "—"}
                          </td>
                          <td className="px-4 py-3 print:px-1.5 print:py-0.5">{row.is_synthetic ? "—" : formatTime(row.check_in || row.time_in)}</td>
                          <td className="px-4 py-3 print:px-1.5 print:py-0.5">{row.is_synthetic ? "—" : formatTime(row.check_out || row.time_out)}</td>
                          <td className="px-4 py-3 print:px-1.5 print:py-0.5">{row.is_synthetic ? "—" : (row.actual_hours ?? row.hours_worked ?? 0)}</td>
                          <td className="px-4 py-3 print:px-1.5 print:py-0.5">
                            {Number(row.late_minutes || 0) > 0 ? <span className="text-amber-600 font-medium">{row.late_minutes}</span> : "0"}
                          </td>
                          <td className="px-4 py-3 print:px-1.5 print:py-0.5">
                            {Number(row.short_hours || 0) > 0 ? <span className="text-red-500 font-medium">{row.short_hours}</span> : "0"}
                          </td>
                          <td className="px-4 py-3 print:px-1.5 print:py-0.5">
                            {Number(row.ot_hours || row.overtime_hours || 0) > 0 ? (
                              <span className="text-blue-600 font-medium">{row.ot_hours ?? row.overtime_hours}</span>
                            ) : "0"}
                          </td>
                          <td className="px-4 py-3 print:px-1.5 print:py-0.5">
                            <StatusBadge status={status} />
                          </td>
                          {canToggle && (
                            <>
                              <td className="px-4 py-3 print:hidden">
                                {row.id ? <Toggle value={!!row.half_day_exempt} tone="purple" onChange={() => toggleFlag(row, "halfDayExempt", row.half_day_exempt)} /> : <span className="text-slate-300">—</span>}
                              </td>
                              <td className="px-4 py-3 print:hidden">
                                {row.id ? <Toggle value={!!row.late_exempt} tone="blue" onChange={() => toggleFlag(row, "lateExempt", row.late_exempt)} /> : <span className="text-slate-300">—</span>}
                              </td>
                              <td className="px-4 py-3 print:hidden">
                                {row.id ? <Toggle value={!!row.is_gazetted_holiday} tone="green" onChange={() => toggleFlag(row, "isGazettedHoliday", row.is_gazetted_holiday)} /> : <span className="text-slate-300">—</span>}
                              </td>
                              <td className="px-4 py-3 print:hidden">
                                {row.adjustment_status
                                  ? <Badge tone={ADJ_TONE[row.adjustment_status] || "slate"}>{row.adjustment_status}</Badge>
                                  : <span className="text-slate-300 text-xs">—</span>}
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
              {canToggle && (
                <div className="px-5 py-3 flex flex-wrap gap-4 text-xs text-slate-500 print:hidden">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-purple-500 inline-block" /> HD Exempt</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-blue-500 inline-block" /> Late Exempt</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-green-500 inline-block" /> Gazetted Holiday</span>
                  {role === "HR" && <span className="text-amber-600 font-medium">HR toggles require Master approval.</span>}
                </div>
              )}
            </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 print:gap-2 print:mb-1">
            {/* Late Summary */}
            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm print:p-2 print:border-slate-300">
              <div className="flex items-center gap-2 mb-4 print:mb-1">
                <span className="h-9 w-9 rounded-xl bg-amber-50 flex items-center justify-center text-lg shrink-0 print:hidden">⏰</span>
                <h3 className="font-bold text-slate-800 print:text-xs">Late Summary</h3>
              </div>
              <div className="space-y-2.5 print:space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Total Late Count</span>
                  <Badge tone={lateSummary.totalLateCount > 0 ? "yellow" : "green"}>
                    {lateSummary.totalLateCount}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Total Late Minutes</span>
                  <span className="font-semibold">{lateSummary.totalLateMins} mins</span>
                </div>
                <div className="h-px bg-slate-100" />
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">Warning only (first {LATE_WARNING_COUNT})</span>
                  <span className="text-amber-500">{Math.min(lateSummary.totalLateCount, LATE_WARNING_COUNT)}</span>
                </div>
                <div className="flex items-center justify-between text-sm font-semibold">
                  <span className="text-slate-700">Deductible Lates</span>
                  <Badge tone={lateSummary.deductibleLates > 0 ? "red" : "green"}>
                    {lateSummary.deductibleLates}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Short Hours */}
            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm print:p-2 print:border-slate-300">
              <div className="flex items-center gap-2 mb-4 print:mb-1">
                <span className="h-9 w-9 rounded-xl bg-red-50 flex items-center justify-center text-lg shrink-0 print:hidden">⏱️</span>
                <h3 className="font-bold text-slate-800 print:text-xs">Short Hours</h3>
              </div>
              <div className="space-y-2.5 print:space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Monthly Short Hours</span>
                  <span className="font-semibold">{shortSummary.totalShort} hrs</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Tolerance</span>
                  <span className="text-slate-400">{SHORT_TOLERANCE} hrs</span>
                </div>
                <div className="h-px bg-slate-100" />
                <div className="flex items-center justify-between text-sm font-semibold">
                  <span className="text-slate-700">Deductible Short Hours</span>
                  <Badge tone={shortSummary.deductibleShort > 0 ? "red" : "green"}>
                    {shortSummary.deductibleShort} hrs
                  </Badge>
                </div>
              </div>
            </div>

            {/* OT Summary */}
            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm print:p-2 print:border-slate-300">
              <div className="flex items-center gap-2 mb-4 print:mb-1">
                <span className="h-9 w-9 rounded-xl bg-blue-50 flex items-center justify-center text-lg shrink-0 print:hidden">💼</span>
                <h3 className="font-bold text-slate-800 print:text-xs">OT Summary</h3>
              </div>
              <div className="space-y-2.5 print:space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Monthly OT</span>
                  <span className="font-semibold">{otSummary.totalOT} hrs</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Tolerance</span>
                  <span className="text-slate-400">{OT_TOLERANCE} hrs</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">OT Eligible</span>
                  <Badge tone={isOtEligible ? "green" : "slate"}>{isOtEligible ? "Yes" : "No"}</Badge>
                </div>
                <div className="h-px bg-slate-100" />
                <div className="flex items-center justify-between text-sm font-semibold">
                  <span className="text-slate-700">Payable OT</span>
                  <Badge tone={otSummary.payableOT > 0 ? "blue" : "slate"}>
                    {otSummary.payableOT} hrs
                  </Badge>
                </div>
              </div>
            </div>
          </div>

          {/* Leave Balance */}
          <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm mb-4 print:rounded-none print:border-0 print:shadow-none print:mb-1 print:p-0">
            <div className="flex items-center gap-2 mb-4 print:hidden">
              <span className="h-9 w-9 rounded-xl bg-emerald-50 flex items-center justify-center text-lg shrink-0">🌴</span>
              <h3 className="font-bold text-slate-800">Leave Balance</h3>
            </div>
            <h3 className="hidden print:block font-bold text-slate-800 mb-1 text-xs">Annual Leave Balance</h3>
            {leaveData ? (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 print:gap-1.5">
                {[
                  { label: "Opening Balance", value: leaveData.opening_balance },
                  { label: "Earned", value: leaveData.earned },
                  { label: "Used", value: leaveData.used },
                  { label: "Half Leaves", value: leaveData.half_leaves },
                  { label: "Remaining Balance", value: leaveData.remaining ?? leaveData.remaining_balance, highlight: true },
                ].map(({ label, value, highlight }) => (
                  <div key={label} className={`text-center rounded-xl p-4 print:p-1 print:border print:border-slate-300 ${highlight ? "bg-emerald-50 border border-emerald-100" : "bg-slate-50"}`}>
                    <div className="text-xs text-slate-500 mb-1 print:mb-0">{label}</div>
                    <div className={`text-2xl font-bold print:text-sm ${highlight ? "text-emerald-700" : "text-slate-900"}`}>{value ?? "—"}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">No leave balance data found for this employee.</p>
            )}
          </div>

          {/* Print Signature Footer */}
          <div className="hidden print:flex justify-between mt-6 pt-2 border-t border-slate-300">
            {[["HR Manager", "Human Resources"], ["Supervisor", "Direct Supervisor"], ["Employee", selectedEmp.full_name]].map(([title, name]) => (
              <div key={title} className="text-center w-1/3">
                <div className="border-t border-slate-600 mt-6 pt-1 mx-4">
                  <p className="font-semibold text-xs">{title}</p>
                  <p className="text-xs text-slate-500">{name}</p>
                  <p className="text-xs text-slate-400 mt-1">Date: _______________</p>
                </div>
              </div>
            ))}
          </div>

          </div>{/* end timesheet-print-root */}
        </>
      )}
    </div>
  );
}
