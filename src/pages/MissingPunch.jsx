import React, { useState, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../lib/supabaseClient.js";
import { Button, Badge, PageTitle } from "../components/ui.jsx";
import { BRANCH_CODE_MAP } from "../constants/branches.js";
import { fetchAttendanceForRange } from "../services/attendanceService.js";
import { buildLedger, summariseLedger } from "../utils/attendanceRules.js";

// A genuine missing-punch record has EXACTLY ONE side recorded — the employee
// was physically present but the device only caught one scan. A row with
// neither punch is an absence / leave / weekly-off / bulk manual entry, not a
// punch to fix, so it is not listed here (that was the old bug: a zero-punch
// row showed "In Missing", "Out Missing" AND a "Single Punch" badge at once).
function issueType(row) {
  const hasIn = !!row.check_in;
  const hasOut = !!row.check_out;
  if (hasIn && !hasOut) return "Missing Out";
  if (!hasIn && hasOut) return "Missing In";
  return null;
}
const ISSUE_TONE = { "Missing In": "red", "Missing Out": "yellow" };

function hhmm(ts) {
  if (!ts) return null;
  const s = String(ts);
  return s.length >= 16 ? s.slice(11, 16) : s;
}

function getDayName(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { weekday: "short" });
}

export default function MissingPunch({ role, branchFilter }) {
  const canEdit = role !== "Audit";

  const [mode, setMode] = useState("records"); // "records" | "summary"
  const [rawRows, setRawRows] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [holidays, setHolidays] = useState(() => new Set());
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const [filterBranch, setFilterBranch] = useState(branchFilter || "All");
  const now = new Date();
  const [filterMonth, setFilterMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  );
  const [filterFrom, setFilterFrom] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
  );
  const [filterTo, setFilterTo] = useState(new Date().toISOString().slice(0, 10));

  function applyMonth(value) {
    setFilterMonth(value);
    if (!value) return;
    const [y, m] = value.split("-").map(Number);
    setFilterFrom(`${value}-01`);
    setFilterTo(`${value}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`);
  }

  const [editing, setEditing] = useState(null);
  const [editIn, setEditIn] = useState("");
  const [editOut, setEditOut] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadData(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filterFrom, filterTo]);

  async function loadData() {
    if (!filterFrom || !filterTo) return;
    setLoading(true);
    setErr("");
    try {
      const [att, empRes, ghRes] = await Promise.all([
        fetchAttendanceForRange(filterFrom, filterTo),
        supabase.from("employees")
          .select("employee_code, full_name, branch, department, staff_level, joining_date, last_working_day, status")
          .order("full_name"),
        supabase.from("gazetted_holidays").select("holiday_date").eq("is_active", true)
          .gte("holiday_date", filterFrom).lte("holiday_date", filterTo),
      ]);
      setRawRows(att || []);
      setEmployees(empRes.data || []);
      setHolidays(new Set((ghRes.data || []).map((h) => h.holiday_date)));
    } catch (e) {
      setErr(e.message);
      setRawRows([]);
    } finally {
      setLoading(false);
    }
  }

  const empMap = useMemo(
    () => Object.fromEntries((employees || []).map((e) => [e.employee_code, e])),
    [employees]
  );

  const rowsByEmp = useMemo(() => {
    const m = {};
    (rawRows || []).forEach((r) => { (m[r.employee_code] || (m[r.employee_code] = [])).push(r); });
    return m;
  }, [rawRows]);

  const inBranch = (code) => filterBranch === "All" || empMap[code]?.branch === filterBranch;

  // Detail — one row per genuine single-punch record.
  const detailRows = useMemo(() => {
    return (rawRows || [])
      .map((row) => ({ row, issue: issueType(row) }))
      .filter((x) => x.issue && inBranch(x.row.employee_code))
      .sort((a, b) =>
        String(b.row.work_date).localeCompare(String(a.row.work_date)) ||
        String(a.row.employee_code).localeCompare(String(b.row.employee_code))
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawRows, filterBranch, empMap]);

  // Summary — one row per employee with attendance activity this period.
  // Missing In / Missing Out are counted straight from the raw records;
  // Half Day / Absent / Weekly Off / Leave come from the same shared ledger
  // Timesheet uses (weekly-off forgiveness applied), so the figures line up
  // with the Timesheet "All Employees" view.
  const summaryRows = useMemo(() => {
    return (employees || [])
      .filter((e) => (filterBranch === "All" || e.branch === filterBranch))
      .filter((e) => (rowsByEmp[e.employee_code] || []).length > 0)
      .map((emp) => {
        const rows = rowsByEmp[emp.employee_code] || [];
        let missingIn = 0, missingOut = 0;
        rows.forEach((r) => {
          const t = issueType(r);
          if (t === "Missing In") missingIn++;
          else if (t === "Missing Out") missingOut++;
        });
        const led = buildLedger({ emp, attendance: rows, holidayDates: holidays, fromDate: filterFrom, toDate: filterTo });
        const s = summariseLedger(led);
        return {
          emp,
          missingIn, missingOut, singlePunch: missingIn + missingOut,
          present: s.present, halfDay: s.halfDay, absent: s.absent,
          weeklyOff: s.weeklyOff, leave: s.leave,
        };
      })
      .filter((r) => r.singlePunch || r.halfDay || r.absent)
      .sort((a, b) =>
        b.singlePunch - a.singlePunch || b.absent - a.absent ||
        (a.emp.full_name || "").localeCompare(b.emp.full_name || "")
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees, rowsByEmp, holidays, filterBranch, filterFrom, filterTo]);

  const cards = useMemo(() => {
    const c = { singlePunch: detailRows.length, missingIn: 0, missingOut: 0, halfDay: 0, absent: 0, employees: 0 };
    detailRows.forEach((x) => { x.issue === "Missing In" ? c.missingIn++ : c.missingOut++; });
    summaryRows.forEach((r) => { c.halfDay += r.halfDay; c.absent += r.absent; if (r.singlePunch) c.employees++; });
    return c;
  }, [detailRows, summaryRows]);

  const summaryTotals = useMemo(() => summaryRows.reduce((t, r) => ({
    missingIn: t.missingIn + r.missingIn, missingOut: t.missingOut + r.missingOut,
    singlePunch: t.singlePunch + r.singlePunch, present: t.present + r.present,
    halfDay: t.halfDay + r.halfDay, absent: t.absent + r.absent,
    weeklyOff: t.weeklyOff + r.weeklyOff, leave: t.leave + r.leave,
  }), { missingIn: 0, missingOut: 0, singlePunch: 0, present: 0, halfDay: 0, absent: 0, weeklyOff: 0, leave: 0 }),
    [summaryRows]);

  function startEdit(row) {
    setEditing(row);
    setEditIn(hhmm(row.check_in) || "");
    setEditOut(hhmm(row.check_out) || "");
    setErr("");
  }

  async function saveEdit() {
    if (!editing) return;
    setErr("");
    const updates = {};
    const dateStr = editing.work_date + "T";
    if (editIn) updates.check_in = dateStr + editIn + ":00";
    if (editOut) updates.check_out = dateStr + editOut + ":00";
    if (!updates.check_in && !updates.check_out) { setErr("Enter at least one time."); return; }

    setSaving(true);
    const { error } = await supabase.from("attendance").update(updates).eq("id", editing.id);
    if (error) { setSaving(false); return setErr(error.message); }

    await supabase.from("audit_logs").insert({
      action: "missing_punch_fix", entity: "attendance", entity_id: String(editing.id),
      details: JSON.stringify({ employee: editing.employee_code, date: editing.work_date, ...updates }),
      performed_by: role, created_at: new Date().toISOString(),
    }).then(() => {});

    // Re-run the day's classification so the corrected punch actually feeds
    // hours / status (and, in turn, payroll) instead of leaving a stale row.
    const { error: reErr } = await supabase.rpc("reclassify_attendance_row", { p_attendance_id: editing.id });

    setSaving(false);
    setEditing(null);
    setMsg(reErr
      ? `Punch saved for ${editing.employee_code} on ${editing.work_date}, but reclassification failed: ${reErr.message}`
      : `Punch fixed for ${editing.employee_code} on ${editing.work_date}. Day re-classified.`);
    setTimeout(() => setMsg(""), 4000);
    loadData();
  }

  function exportExcel() {
    let data, name;
    if (mode === "summary") {
      data = summaryRows.map((r) => ({
        Code: r.emp.employee_code, Employee: r.emp.full_name,
        Branch: r.emp.branch || "", Department: r.emp.department || "",
        "Missing In": r.missingIn, "Missing Out": r.missingOut, "Single Punch": r.singlePunch,
        Present: r.present, "Half Day": r.halfDay, Absent: r.absent,
        "Weekly Off": r.weeklyOff, Leave: r.leave,
      }));
      name = `missing_punch_summary_${filterFrom}_${filterTo}.xlsx`;
    } else {
      data = detailRows.map((x) => ({
        Code: x.row.employee_code, Employee: empMap[x.row.employee_code]?.full_name || "",
        Branch: empMap[x.row.employee_code]?.branch || "", Department: empMap[x.row.employee_code]?.department || "",
        Date: x.row.work_date, Day: getDayName(x.row.work_date),
        "Check In": hhmm(x.row.check_in) || "", "Check Out": hhmm(x.row.check_out) || "",
        Status: x.row.attendance_status || x.row.status || "", Issue: x.issue,
      }));
      name = `missing_punch_records_${filterFrom}_${filterTo}.xlsx`;
    }
    if (data.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Missing Punches");
    XLSX.writeFile(wb, name);
  }

  return (
    <div>
      <PageTitle
        title="Missing Punches"
        subtitle="Single-punch records (one scan only) — plus a per-employee attendance summary for the period."
        action={
          ((mode === "records" && detailRows.length > 0) || (mode === "summary" && summaryRows.length > 0)) ? (
            <Button variant="outline" onClick={exportExcel} className="rounded-2xl">Export Excel</Button>
          ) : null
        }
      />

      {/* Mode toggle */}
      <div className="flex gap-2 mb-4">
        {[["records", "By Record"], ["summary", "By Employee"]].map(([k, l]) => (
          <button key={k} onClick={() => setMode(k)}
            className={`px-4 py-1.5 rounded-xl text-sm font-medium transition ${mode === k ? "bg-slate-950 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            {l}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        {[
          { label: "Single Punch", value: cards.singlePunch, hint: `${cards.employees} employees` },
          { label: "Missing In", value: cards.missingIn },
          { label: "Missing Out", value: cards.missingOut },
          { label: "Half Days", value: cards.halfDay, hint: "period" },
          { label: "Absents", value: cards.absent, hint: "period" },
          { label: "Records Scanned", value: rawRows.length, hint: `${filterFrom} → ${filterTo}` },
        ].map(({ label, value, hint }) => (
          <div key={label} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm text-center">
            <p className="text-xs text-slate-500 mb-1">{label}</p>
            <p className="text-2xl font-bold text-slate-900">{loading ? "…" : value}</p>
            {hint && <p className="text-[11px] text-slate-400 mt-0.5">{hint}</p>}
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm mb-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <select value={filterBranch} onChange={(e) => setFilterBranch(e.target.value)}
            disabled={!!branchFilter}
            className="px-4 py-2 rounded-xl border border-slate-200 text-sm disabled:bg-slate-50 disabled:text-slate-500">
            <option value="All">All Branches</option>
            {Object.keys(BRANCH_CODE_MAP).map((b) => <option key={b}>{b}</option>)}
          </select>
          <input type="month" value={filterMonth} onChange={(e) => applyMonth(e.target.value)}
            title="Pick a month to set the range" className="px-4 py-2 rounded-xl border border-slate-200 text-sm" />
          <input type="date" value={filterFrom} onChange={(e) => { setFilterFrom(e.target.value); setFilterMonth(""); }}
            className="px-4 py-2 rounded-xl border border-slate-200 text-sm" />
          <input type="date" value={filterTo} onChange={(e) => { setFilterTo(e.target.value); setFilterMonth(""); }}
            className="px-4 py-2 rounded-xl border border-slate-200 text-sm" />
        </div>
      </div>

      {msg && <div className="mb-3 p-3 rounded-xl bg-blue-50 text-blue-700 text-sm">{msg}</div>}
      {err && <div className="mb-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{err}</div>}

      {/* Inline edit */}
      {editing && canEdit && (
        <div className="bg-white border border-blue-200 rounded-2xl p-5 shadow-sm mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-slate-800">
              Fix Punch — {empMap[editing.employee_code]?.full_name || editing.employee_code} · {editing.work_date}
            </h3>
            <Button variant="outline" onClick={() => setEditing(null)} className="rounded-xl text-xs">Cancel</Button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-slate-500 mb-1">Check In Time</p>
              <input type="time" lang="en-GB" value={editIn} onChange={(e) => setEditIn(e.target.value)}
                className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Check Out Time</p>
              <input type="time" lang="en-GB" value={editOut} onChange={(e) => setEditOut(e.target.value)}
                className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
            </div>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">Saving re-runs the day's classification, so hours and status update immediately. Payroll reflects it on its next Refresh.</p>
          <div className="mt-3"><Button onClick={saveEdit} disabled={saving} className="rounded-2xl">{saving ? "Saving…" : "Save Fix"}</Button></div>
        </div>
      )}

      {/* ---- By Record ---- */}
      {mode === "records" && (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto overflow-y-auto max-h-[70vh]">
          <div className="px-5 pt-4 pb-2">
            <h2 className="font-bold text-slate-800">Single-Punch Records</h2>
            <p className="text-xs text-slate-400 mt-0.5">{detailRows.length} records · {filterFrom} to {filterTo}{filterBranch !== "All" ? ` · ${filterBranch}` : ""}</p>
          </div>
          {loading ? <p className="px-5 py-8 text-slate-400 text-sm">Loading…</p> : (
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>{["Code", "Employee", "Department", "Branch", "Date", "Day", "Check In", "Check Out", "Status", "Issue", "Action"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-medium sticky top-0 z-10 bg-slate-50 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {detailRows.length === 0
                  ? <tr><td colSpan={11} className="px-4 py-8 text-center text-slate-400">No single-punch records for this period.</td></tr>
                  : detailRows.map(({ row, issue }) => {
                    const emp = empMap[row.employee_code];
                    return (
                      <tr key={row.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3 text-slate-500">{row.employee_code}</td>
                        <td className="px-4 py-3 font-medium">{emp?.full_name || "—"}</td>
                        <td className="px-4 py-3 text-slate-500">{emp?.department || "—"}</td>
                        <td className="px-4 py-3 text-slate-500">{emp?.branch || "—"}</td>
                        <td className="px-4 py-3">{row.work_date}</td>
                        <td className="px-4 py-3 text-slate-400 text-xs">{getDayName(row.work_date)}</td>
                        <td className="px-4 py-3">{hhmm(row.check_in) || <span className="text-red-400">Missing</span>}</td>
                        <td className="px-4 py-3">{hhmm(row.check_out) || <span className="text-red-400">Missing</span>}</td>
                        <td className="px-4 py-3 text-slate-500">{row.attendance_status || row.status || "—"}</td>
                        <td className="px-4 py-3"><Badge tone={ISSUE_TONE[issue]}>{issue}</Badge></td>
                        <td className="px-4 py-3">
                          {canEdit
                            ? <Button variant="outline" onClick={() => startEdit(row)} className="rounded-xl text-xs py-1 px-3">Fix</Button>
                            : <span className="text-slate-300 text-xs">—</span>}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ---- By Employee ---- */}
      {mode === "summary" && (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto overflow-y-auto max-h-[70vh]">
          <div className="px-5 pt-4 pb-2">
            <h2 className="font-bold text-slate-800">Per-Employee Summary</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {summaryRows.length} employees with activity · {filterFrom} to {filterTo}{filterBranch !== "All" ? ` · ${filterBranch}` : ""}. Half Day / Absent match the Timesheet ledger (weekly-off forgiveness applied).
            </p>
          </div>
          {loading ? <p className="px-5 py-8 text-slate-400 text-sm">Building summary…</p> : (
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="text-left px-4 py-3 font-medium sticky top-0 left-0 z-20 bg-slate-50 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">Employee</th>
                  <th className="text-left px-4 py-3 font-medium sticky top-0 z-10 bg-slate-50 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">Branch / Dept</th>
                  {["Missing In", "Missing Out", "Single Punch", "Present", "Half Day", "Absent", "Weekly Off", "Leave"].map((h) => (
                    <th key={h} className="text-right px-4 py-3 font-medium sticky top-0 z-10 bg-slate-50 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summaryRows.length === 0
                  ? <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-400">No attendance activity for this period.</td></tr>
                  : summaryRows.map((r) => (
                    <tr key={r.emp.employee_code} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 sticky left-0 z-[5] bg-white">
                        <div className="font-medium text-slate-800">{r.emp.full_name}</div>
                        <div className="text-xs text-slate-400">{r.emp.employee_code}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{r.emp.branch || "—"}<br />{r.emp.department || "—"}</td>
                      <td className={`px-4 py-3 text-right tabular-nums ${r.missingIn ? "text-red-600 font-medium" : "text-slate-300"}`}>{r.missingIn}</td>
                      <td className={`px-4 py-3 text-right tabular-nums ${r.missingOut ? "text-amber-600 font-medium" : "text-slate-300"}`}>{r.missingOut}</td>
                      <td className={`px-4 py-3 text-right tabular-nums font-semibold ${r.singlePunch ? "text-slate-800" : "text-slate-300"}`}>{r.singlePunch}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-500">{r.present}</td>
                      <td className={`px-4 py-3 text-right tabular-nums ${r.halfDay ? "text-orange-600" : "text-slate-300"}`}>{r.halfDay}</td>
                      <td className={`px-4 py-3 text-right tabular-nums ${r.absent ? "text-red-600 font-medium" : "text-slate-300"}`}>{r.absent}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-blue-600">{r.weeklyOff}</td>
                      <td className={`px-4 py-3 text-right tabular-nums ${r.leave ? "text-amber-600" : "text-slate-300"}`}>{r.leave}</td>
                    </tr>
                  ))}
              </tbody>
              {summaryRows.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-100 font-bold border-t-2 border-slate-200">
                    <td className="px-4 py-3 sticky left-0 z-[5] bg-slate-100">Total ({summaryRows.length})</td>
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3 text-right tabular-nums text-red-600">{summaryTotals.missingIn}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-amber-600">{summaryTotals.missingOut}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{summaryTotals.singlePunch}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{summaryTotals.present}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-orange-600">{summaryTotals.halfDay}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-red-600">{summaryTotals.absent}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-blue-600">{summaryTotals.weeklyOff}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-amber-600">{summaryTotals.leave}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </div>
      )}
    </div>
  );
}
