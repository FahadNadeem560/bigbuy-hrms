import React, { useMemo, useState } from "react";
import { Button, PageTitle } from "../components/ui.js";
import { downloadCSV } from "../utils/downloads.js";

// Employee-wise monthly attendance register: one row per employee, a chip
// per calendar day of the selected month showing that day's status, plus
// per-employee tallies. Replaces the old flat one-row-per-day Records list.

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const EMP_PAGE_SIZE = 20;

// Raw attendance_status -> the four display buckets (mirrors the source ERP:
// worked days of any kind collapse to "Present"; only Weekly Off / Leave /
// Absent are called out, with Half Day kept separate since it's half-paid).
const BUCKETS = ["Present", "Off Day", "Leave", "Absent", "Half Day"];
function toBucket(status) {
  if (!status) return "";
  if (status === "Weekly Off" || status === "Off Day") return "Off Day";
  if (status === "Leave") return "Leave";
  if (status === "Absent") return "Absent";
  if (status === "Half Day" || status === "HalfDay") return "Half Day";
  return "Present";
}

const CHIP_CLASS = {
  "Present":  "bg-sky-100 text-sky-900 border-sky-200",
  "Off Day":  "bg-emerald-100 text-emerald-900 border-emerald-200",
  "Leave":    "bg-amber-100 text-amber-900 border-amber-200",
  "Absent":   "bg-rose-100 text-rose-900 border-rose-200",
  "Half Day": "bg-violet-100 text-violet-900 border-violet-200",
  "":         "bg-slate-50 text-slate-300 border-slate-100",
};

const COUNT_TONE = {
  "Present":  "text-sky-700",
  "Off Day":  "text-emerald-700",
  "Leave":    "text-amber-700",
  "Absent":   "text-rose-700",
  "Half Day": "text-violet-700",
};

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function AttendanceRecords({ rows = [], employees = [], branchFilter }) {
  const [month, setMonth] = useState(currentMonthKey);
  const [search, setSearch] = useState("");
  const [onlyWithAbsence, setOnlyWithAbsence] = useState(false);
  const [page, setPage] = useState(1);

  const [year, mon] = month.split("-").map(Number);
  const daysInMonth = new Date(year, mon, 0).getDate();
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-${String(daysInMonth).padStart(2, "0")}`;

  const dayList = useMemo(() => (
    Array.from({ length: daysInMonth }, (_, i) => {
      const dd = String(i + 1).padStart(2, "0");
      return { n: i + 1, date: `${month}-${dd}`, label: `${dd} ${MONTH_ABBR[mon - 1]}` };
    })
  ), [daysInMonth, month, mon]);

  const empByCode = useMemo(
    () => Object.fromEntries((employees || []).map(e => [e.id, e])),
    [employees]
  );

  // { [employeeCode]: { [YYYY-MM-DD]: attendance_status } } for the month
  const statusByEmpDate = useMemo(() => {
    const acc = {};
    for (const r of rows) {
      if (!r.date || r.date < monthStart || r.date > monthEnd) continue;
      (acc[r.employeeCode] || (acc[r.employeeCode] = {}))[r.date] = r.status;
    }
    return acc;
  }, [rows, monthStart, monthEnd]);

  const registerRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (employees || [])
      .filter(e => {
        if (branchFilter && e.branch !== branchFilter) return false;
        if (q && !`${e.name || ""} ${e.id || ""}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .map(e => {
        const dayStatuses = statusByEmpDate[e.id] || {};
        const days = dayList.map(d => ({ ...d, bucket: toBucket(dayStatuses[d.date]) }));
        const counts = Object.fromEntries(BUCKETS.map(b => [b, 0]));
        for (const d of days) if (d.bucket) counts[d.bucket]++;
        const hasData = days.some(d => d.bucket);
        return { emp: e, days, counts, hasData };
      })
      .filter(r => r.hasData)
      .filter(r => !onlyWithAbsence || r.counts.Absent > 0)
      .sort((a, b) => String(a.emp.name || a.emp.id).localeCompare(String(b.emp.name || b.emp.id)));
  }, [employees, statusByEmpDate, dayList, search, branchFilter, onlyWithAbsence]);

  const pageCount = Math.max(1, Math.ceil(registerRows.length / EMP_PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pagedRows = registerRows.slice((safePage - 1) * EMP_PAGE_SIZE, safePage * EMP_PAGE_SIZE);

  function onFilterChange(setter) {
    return (value) => { setter(value); setPage(1); };
  }

  function exportCsv() {
    const flat = registerRows.map(r => {
      const out = { Employee: r.emp.name || "", Code: r.emp.id || "", Level: r.emp.level || "" };
      for (const d of r.days) out[d.label] = d.bucket || "";
      for (const b of BUCKETS) out[b] = r.counts[b];
      return out;
    });
    downloadCSV(`attendance-register-${month}.csv`, flat);
  }

  const totalAbsent = registerRows.reduce((s, r) => s + r.counts.Absent, 0);

  return (
    <div>
      <PageTitle
        title="Attendance Records"
        subtitle="Employee-wise monthly register — one chip per day, coloured by that day's status."
        action={<Button className="rounded-2xl" onClick={exportCsv} disabled={registerRows.length === 0}>Export</Button>}
      />

      <div className="mb-4 grid grid-cols-1 md:grid-cols-4 gap-3 bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
        <label className="flex flex-col text-xs text-slate-500 gap-1">
          Month
          <input
            type="month"
            value={month}
            onChange={e => onFilterChange(setMonth)(e.target.value)}
            className="px-4 py-2 rounded-xl border border-slate-200 text-sm text-slate-800"
          />
        </label>
        <label className="flex flex-col text-xs text-slate-500 gap-1 md:col-span-2">
          Search employee
          <input
            value={search}
            onChange={e => onFilterChange(setSearch)(e.target.value)}
            placeholder="Name or code"
            className="px-4 py-2 rounded-xl border border-slate-200 text-sm"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600 md:pt-5">
          <input
            type="checkbox"
            checked={onlyWithAbsence}
            onChange={e => onFilterChange(setOnlyWithAbsence)(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Only with absences
        </label>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="text-slate-500">
          {registerRows.length} employee{registerRows.length === 1 ? "" : "s"} · {totalAbsent} absent day{totalAbsent === 1 ? "" : "s"}
        </span>
        {BUCKETS.map(b => (
          <span key={b} className="inline-flex items-center gap-1.5 text-slate-500">
            <span className={`inline-block h-3 w-3 rounded border ${CHIP_CLASS[b]}`} />
            {b}
          </span>
        ))}
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto overflow-y-auto max-h-[72vh]">
        <table className="w-full min-w-[1100px] text-sm border-separate border-spacing-0">
          <thead>
            <tr className="bg-slate-800 text-white text-left">
              <th className="px-4 py-3 font-semibold sticky top-0 left-0 z-30 bg-slate-800 min-w-[190px]">Employee</th>
              <th className="px-4 py-3 font-semibold sticky top-0 z-20 bg-slate-800">Dates</th>
              {BUCKETS.map(b => (
                <th key={b} className="px-2 py-3 font-semibold text-center sticky top-0 z-20 bg-slate-800 whitespace-nowrap">{b}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pagedRows.length === 0 ? (
              <tr>
                <td colSpan={2 + BUCKETS.length} className="px-4 py-10 text-center text-slate-400">
                  No attendance for {month}.
                </td>
              </tr>
            ) : pagedRows.map(({ emp, days, counts }) => (
              <tr key={emp.id} className="border-b border-slate-100 align-top">
                <td className="px-4 py-4 sticky left-0 z-10 bg-white border-b border-slate-100 shadow-[2px_0_4px_rgba(0,0,0,0.05)]">
                  <div className="font-semibold text-slate-800 leading-tight">{emp.name || emp.id}</div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {emp.id}{emp.level ? ` · ${emp.level === "Management" ? "Management" : "Non-Management"} Staff` : ""}
                  </div>
                </td>
                <td className="px-4 py-3 border-b border-slate-100">
                  <div className="flex flex-wrap gap-1.5">
                    {days.map(d => (
                      <span
                        key={d.n}
                        title={d.bucket || "No record"}
                        className={`w-[62px] shrink-0 rounded-md border px-1 py-1 text-center leading-tight ${CHIP_CLASS[d.bucket]}`}
                      >
                        <span className="block text-[11px] font-medium">{d.label}</span>
                        <span className="block text-[10px]">{d.bucket || "—"}</span>
                      </span>
                    ))}
                  </div>
                </td>
                {BUCKETS.map(b => (
                  <td key={b} className={`px-2 py-4 text-center font-semibold border-b border-slate-100 ${counts[b] ? COUNT_TONE[b] : "text-slate-300"}`}>
                    {counts[b]}
                  </td>
                ))}
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
          <span className="text-slate-500">
            Page {safePage} of {pageCount} · {(safePage - 1) * EMP_PAGE_SIZE + 1}–{(safePage - 1) * EMP_PAGE_SIZE + pagedRows.length} of {registerRows.length}
          </span>
          <Button variant="outline" className="rounded-xl" disabled={safePage >= pageCount} onClick={() => setPage(p => Math.min(pageCount, p + 1))}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
