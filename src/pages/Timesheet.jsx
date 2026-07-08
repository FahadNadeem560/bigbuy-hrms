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

function fmt2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function getDayName(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { weekday: "short" });
}

function formatTime(t) {
  if (!t) return "-";
  const s = String(t);
  if (s.includes("T")) return s.slice(11, 16);
  if (s.length >= 5) return s.slice(0, 5);
  return s;
}

export default function Timesheet({ branchFilter }) {
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
  const [leaveData, setLeaveData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);

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

      const { data: lv } = await supabase
        .from("leaves")
        .select("*")
        .eq("employee_id", emp.employee_code)
        .maybeSingle();
      setLeaveData(lv || null);
    } catch (err) {
      setError(err.message);
      setAttendance([]);
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
    setLeaveData(null);
    setEmpSearch("");
    setError("");
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

  function exportExcel() {
    if (!selectedEmp) return;
    const ledgerRows = attendance.map((r) => ({
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
          {/* Print CSS */}
          <style>{`
            @media print {
              @page { size: A4 portrait; margin: 15mm; }
              body * { visibility: hidden; }
              #timesheet-print-root, #timesheet-print-root * { visibility: visible; }
              #timesheet-print-root { position: absolute; top: 0; left: 0; width: 100%; }
            }
          `}</style>

          <div id="timesheet-print-root">
            {/* Print-only A4 header */}
            <div className="hidden print:block mb-4">
              <div className="flex justify-between items-start border-b-2 border-slate-800 pb-3 mb-4">
                <div>
                  <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">The Big Buy</h1>
                  <p className="text-xs text-slate-500">Attendance Timesheet Report</p>
                </div>
                <div className="text-right text-xs text-slate-500">
                  <p>Period: {fromDate} — {toDate}</p>
                  <p>Generated: {new Date().toLocaleDateString()}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm mb-4">
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
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm mb-4 overflow-x-auto print:rounded-none print:border-0 print:shadow-none">
              <div className="px-5 pt-4 pb-2 print:px-0 print:pt-0">
                <h2 className="font-bold text-slate-800 print:text-base">Attendance Ledger</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {fromDate} — {toDate} · {attendance.length} record{attendance.length !== 1 ? "s" : ""}
                </p>
              </div>
              <table className="w-full min-w-[820px] text-sm print:min-w-0 print:text-xs">
                <thead className="bg-slate-50 text-slate-500 print:bg-slate-200">
                  <tr>
                    {["Date", "Day", "Shift", "In", "Out", "Hours", "Late (min)", "Short (hrs)", "OT (hrs)", "Status"].map((h) => (
                      <th key={h} className="text-left px-4 py-3 font-medium print:px-2 print:py-2">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {attendance.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-10 text-center text-slate-400">
                        No attendance records found for this period.
                      </td>
                    </tr>
                  ) : (
                    attendance.map((row, i) => {
                      const status = row.attendance_status || row.status || "Pending";
                      const shift = row.detected_shift;
                      return (
                        <tr key={i} className={status === "Absent" ? "bg-red-50/40" : ""}>
                          <td className="px-4 py-3 font-medium text-slate-800 print:px-2 print:py-1.5">{row.work_date}</td>
                          <td className="px-4 py-3 text-slate-400 text-xs print:px-2 print:py-1.5">{getDayName(row.work_date)}</td>
                          <td className="px-4 py-3 print:px-2 print:py-1.5">
                            {shift ? (
                              <span className={`font-medium ${shift === "A" ? "text-blue-600" : shift === "B" ? "text-purple-600" : "text-amber-600"}`}>
                                {shift === "HalfDay" ? "HD" : `Sh.${shift}`}
                              </span>
                            ) : "—"}
                          </td>
                          <td className="px-4 py-3 print:px-2 print:py-1.5">{formatTime(row.check_in || row.time_in)}</td>
                          <td className="px-4 py-3 print:px-2 print:py-1.5">{formatTime(row.check_out || row.time_out)}</td>
                          <td className="px-4 py-3 print:px-2 print:py-1.5">{row.actual_hours ?? row.hours_worked ?? 0}</td>
                          <td className="px-4 py-3 print:px-2 print:py-1.5">
                            {Number(row.late_minutes || 0) > 0 ? <span className="text-amber-600 font-medium">{row.late_minutes}</span> : "0"}
                          </td>
                          <td className="px-4 py-3 print:px-2 print:py-1.5">
                            {Number(row.short_hours || 0) > 0 ? <span className="text-red-500 font-medium">{row.short_hours}</span> : "0"}
                          </td>
                          <td className="px-4 py-3 print:px-2 print:py-1.5">
                            {Number(row.ot_hours || row.overtime_hours || 0) > 0 ? (
                              <span className="text-blue-600 font-medium">{row.ot_hours ?? row.overtime_hours}</span>
                            ) : "0"}
                          </td>
                          <td className="px-4 py-3 print:px-2 print:py-1.5">
                            <StatusBadge status={status} />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            {/* Late Summary */}
            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <span className="h-9 w-9 rounded-xl bg-amber-50 flex items-center justify-center text-lg shrink-0">⏰</span>
                <h3 className="font-bold text-slate-800">Late Summary</h3>
              </div>
              <div className="space-y-2.5">
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
            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <span className="h-9 w-9 rounded-xl bg-red-50 flex items-center justify-center text-lg shrink-0">⏱️</span>
                <h3 className="font-bold text-slate-800">Short Hours</h3>
              </div>
              <div className="space-y-2.5">
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
            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <span className="h-9 w-9 rounded-xl bg-blue-50 flex items-center justify-center text-lg shrink-0">💼</span>
                <h3 className="font-bold text-slate-800">OT Summary</h3>
              </div>
              <div className="space-y-2.5">
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
          <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm mb-4 print:rounded-none print:border-0 print:shadow-none print:mb-2">
            <div className="flex items-center gap-2 mb-4 print:hidden">
              <span className="h-9 w-9 rounded-xl bg-emerald-50 flex items-center justify-center text-lg shrink-0">🌴</span>
              <h3 className="font-bold text-slate-800">Leave Balance</h3>
            </div>
            <h3 className="hidden print:block font-bold text-slate-800 mb-2 text-sm">Annual Leave Balance</h3>
            {leaveData ? (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 print:gap-2">
                {[
                  { label: "Opening Balance", value: leaveData.opening_balance },
                  { label: "Earned", value: leaveData.earned },
                  { label: "Used", value: leaveData.used },
                  { label: "Half Leaves", value: leaveData.half_leaves },
                  { label: "Remaining Balance", value: leaveData.remaining ?? leaveData.remaining_balance, highlight: true },
                ].map(({ label, value, highlight }) => (
                  <div key={label} className={`text-center rounded-xl p-4 print:p-2 print:border print:border-slate-300 ${highlight ? "bg-emerald-50 border border-emerald-100" : "bg-slate-50"}`}>
                    <div className="text-xs text-slate-500 mb-1">{label}</div>
                    <div className={`text-2xl font-bold print:text-lg ${highlight ? "text-emerald-700" : "text-slate-900"}`}>{value ?? "—"}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">No leave balance data found for this employee.</p>
            )}
          </div>

          {/* Print Signature Footer */}
          <div className="hidden print:flex justify-between mt-12 pt-4 border-t border-slate-300">
            {[["HR Manager", "Human Resources"], ["Supervisor", "Direct Supervisor"], ["Employee", selectedEmp.full_name]].map(([title, name]) => (
              <div key={title} className="text-center w-1/3">
                <div className="border-t border-slate-600 mt-12 pt-2 mx-4">
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
