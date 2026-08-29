import React, { useEffect, useMemo, useState } from "react";
import { Button, PageTitle } from "../components/ui.js";
import { downloadCSV } from "../utils/downloads.js";
import { submitAttendanceStatusChange, fetchPendingStatusChanges } from "../services/attendanceAdjustmentService.js";

// Employee-wise monthly attendance register: one row per employee, a chip
// per calendar day of the selected month showing that day's status, plus
// per-employee tallies. A worked ("Present") day can be flagged for change
// to Weekly Off / Leave / Absent — the request goes to the Approval Queue
// (Attendance Corrections) and only touches the live record + payroll after
// Master/GM approval. Same mechanism the Timesheet ledger uses.

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const PAGE_SIZE_OPTIONS = [20, 50, 100, 200, "All"];

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

// A worked day can be re-flagged to one of these.
// What a given day can be re-flagged to, by its current bucket.
const TARGETS_FROM = {
  "Present":  ["Weekly Off", "Leave", "Absent"],
  "Half Day": ["Present", "Weekly Off", "Leave", "Absent"],
  "Absent":   ["Present", "Weekly Off", "Leave"],
};
const CHANGEABLE_BUCKETS = Object.keys(TARGETS_FROM);

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function ChangeModal({ ctx, onClose, onSubmitted }) {
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!ctx) return null;
  const options = TARGETS_FROM[ctx.bucket] || [];

  async function submit() {
    if (!target) { setErr("Pick what to change the day to."); return; }
    if (!reason.trim()) { setErr("A reason is required."); return; }
    setBusy(true); setErr("");
    const res = await submitAttendanceStatusChange({
      employeeCode: ctx.empCode, date: ctx.date,
      originalStatus: ctx.originalStatus || ctx.bucket, adjustedStatus: target,
      reason, actor: ctx.actor, employeeName: ctx.name,
    });
    setBusy(false);
    if (!res.ok) { setErr(res.reason); return; }
    onSubmitted({ msg: `${ctx.date}: changed to ${target}.`, empCode: ctx.empCode, date: ctx.date, target });
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 shadow-xl w-full max-w-md">
        <h3 className="font-bold text-slate-800">Change {ctx.dateLabel} — {ctx.name}</h3>
        <p className="text-xs text-slate-400 mt-1 mb-4">
          Currently <span className="font-medium text-slate-600">{ctx.bucket}</span>. This is applied to the record
          immediately and reaches payroll on its next Refresh; Master and GM are notified.
        </p>
        <div className="flex flex-wrap gap-2 mb-4">
          {options.map(t => (
            <button key={t} onClick={() => setTarget(t)}
              className={`px-3 py-1.5 rounded-xl text-sm border transition ${target === t ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
              {t}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500 mb-1">Reason</p>
        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2}
          placeholder="Why is this day being changed?"
          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
        {err && <p className="text-xs text-rose-600 mt-2">{err}</p>}
        <div className="flex gap-2 mt-5">
          <Button onClick={submit} disabled={busy} className="rounded-xl flex-1">
            {busy ? "Applying…" : "Apply change"}
          </Button>
          <Button variant="outline" onClick={onClose} className="rounded-xl flex-1">Cancel</Button>
        </div>
      </div>
    </div>
  );
}

export default function AttendanceRecords({ rows = [], employees = [], branchFilter, role }) {
  const [month, setMonth] = useState(currentMonthKey);
  const [search, setSearch] = useState("");
  const [branch, setBranch] = useState("All");
  const [designation, setDesignation] = useState("All");
  const [onlyWithAbsence, setOnlyWithAbsence] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [pending, setPending] = useState([]); // pending attendance_adjustments (status changes) for the month
  const [changeCtx, setChangeCtx] = useState(null);
  const [notice, setNotice] = useState("");
  // Instant-applied status changes this session — overlaid on the register
  // immediately since the parent-owned `rows` prop only refetches on reload.
  const [applied, setApplied] = useState({}); // "empCode|date" -> new status

  // Instant-apply writes straight to the attendance record, which RLS limits
  // to Master / HR (GM & Branch Manager can't write attendance directly) --
  // GM is a notify recipient instead.
  const canRequest = ["Master", "HR"].includes(role);

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

  const branchOptions = useMemo(
    () => ["All", ...[...new Set((employees || []).map(e => e.branch).filter(Boolean))].sort()],
    [employees]
  );
  const designationOptions = useMemo(
    () => ["All", ...[...new Set((employees || []).map(e => e.designation).filter(Boolean))].sort()],
    [employees]
  );

  useEffect(() => {
    let live = true;
    fetchPendingStatusChanges(monthStart, monthEnd)
      .then(d => { if (live) setPending(d); })
      .catch(() => { if (live) setPending([]); });
    return () => { live = false; };
  }, [monthStart, monthEnd]);


  // { "empCode|date": adjusted_status } for pending changes
  const pendingByKey = useMemo(
    () => Object.fromEntries(pending.map(p => [`${p.employee_code}|${p.attendance_date}`, p.adjusted_status])),
    [pending]
  );

  const statusByEmpDate = useMemo(() => {
    const acc = {};
    for (const r of rows) {
      if (!r.date || r.date < monthStart || r.date > monthEnd) continue;
      (acc[r.employeeCode] || (acc[r.employeeCode] = {}))[r.date] = r.status;
    }
    return acc;
  }, [rows, monthStart, monthEnd]);

  const effectiveBranch = branchFilter || (branch === "All" ? null : branch);

  const registerRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (employees || [])
      .filter(e => {
        if (effectiveBranch && e.branch !== effectiveBranch) return false;
        if (designation !== "All" && e.designation !== designation) return false;
        if (q && !`${e.name || ""} ${e.id || ""}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .map(e => {
        const dayStatuses = statusByEmpDate[e.id] || {};
        const days = dayList.map(d => {
          const appliedTo = applied[`${e.id}|${d.date}`] || null;
          const raw = appliedTo || dayStatuses[d.date] || "";
          return {
            ...d,
            raw,
            bucket: toBucket(raw),
            pendingTo: pendingByKey[`${e.id}|${d.date}`] || null,
          };
        });
        const counts = Object.fromEntries(BUCKETS.map(b => [b, 0]));
        for (const d of days) if (d.bucket) counts[d.bucket]++;
        return { emp: e, days, counts, hasData: days.some(d => d.bucket) };
      })
      .filter(r => r.hasData)
      .filter(r => !onlyWithAbsence || r.counts.Absent > 0)
      .sort((a, b) => String(a.emp.name || a.emp.id).localeCompare(String(b.emp.name || b.emp.id)));
  }, [employees, statusByEmpDate, dayList, search, effectiveBranch, designation, onlyWithAbsence, pendingByKey, applied]);

  const perPage = pageSize === "All" ? Math.max(1, registerRows.length) : pageSize;
  const pageCount = Math.max(1, Math.ceil(registerRows.length / perPage));
  const safePage = Math.min(page, pageCount);
  const pagedRows = registerRows.slice((safePage - 1) * perPage, safePage * perPage);

  function onFilterChange(setter) {
    return (value) => { setter(value); setPage(1); };
  }

  function exportCsv() {
    const flat = registerRows.map(r => {
      const out = { Employee: r.emp.name || "", Code: r.emp.id || "", Designation: r.emp.designation || "", Branch: r.emp.branch || "" };
      for (const d of r.days) out[d.label] = d.pendingTo ? `${d.bucket || "—"} (→${d.pendingTo}?)` : (d.bucket || "");
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
        subtitle="Employee-wise monthly register. Click a day (Present / Absent / Half Day) to request a change — it routes through the Approval Queue."
        action={<Button className="rounded-2xl" onClick={exportCsv} disabled={registerRows.length === 0}>Export</Button>}
      />

      <div className="mb-4 grid grid-cols-1 md:grid-cols-5 gap-3 bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
        <label className="flex flex-col text-xs text-slate-500 gap-1">
          Month
          <input type="month" value={month} onChange={e => onFilterChange(setMonth)(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-800" />
        </label>
        <label className="flex flex-col text-xs text-slate-500 gap-1">
          Branch
          <select value={branchFilter || branch} disabled={!!branchFilter}
            onChange={e => onFilterChange(setBranch)(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-sm disabled:bg-slate-50 disabled:text-slate-400">
            {branchOptions.map(b => <option key={b} value={b}>{b === "All" ? "All branches" : b}</option>)}
          </select>
        </label>
        <label className="flex flex-col text-xs text-slate-500 gap-1">
          Designation
          <select value={designation} onChange={e => onFilterChange(setDesignation)(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-sm">
            {designationOptions.map(d => <option key={d} value={d}>{d === "All" ? "All designations" : d}</option>)}
          </select>
        </label>
        <label className="flex flex-col text-xs text-slate-500 gap-1">
          Search employee
          <input value={search} onChange={e => onFilterChange(setSearch)(e.target.value)}
            placeholder="Name or code" className="px-3 py-2 rounded-xl border border-slate-200 text-sm" />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600 md:pt-5">
          <input type="checkbox" checked={onlyWithAbsence}
            onChange={e => onFilterChange(setOnlyWithAbsence)(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300" />
          Only with absences
        </label>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="text-slate-500">
          {registerRows.length} employee{registerRows.length === 1 ? "" : "s"} · {totalAbsent} absent day{totalAbsent === 1 ? "" : "s"}
          {pending.length > 0 ? ` · ${pending.length} change${pending.length === 1 ? "" : "s"} awaiting approval` : ""}
        </span>
        <label className="flex items-center gap-1.5 text-slate-500">
          Rows per page
          <select value={String(pageSize)}
            onChange={e => onFilterChange(setPageSize)(e.target.value === "All" ? "All" : Number(e.target.value))}
            className="rounded-lg border border-slate-200 px-2 py-1 text-xs">
            {PAGE_SIZE_OPTIONS.map(o => <option key={o} value={String(o)}>{o === "All" ? `All (${registerRows.length})` : o}</option>)}
          </select>
        </label>
        {BUCKETS.map(b => (
          <span key={b} className="inline-flex items-center gap-1.5 text-slate-500">
            <span className={`inline-block h-3 w-3 rounded border ${CHIP_CLASS[b]}`} />{b}
          </span>
        ))}
      </div>

      {notice && <p className="mb-3 text-xs text-blue-700 bg-blue-50 rounded-lg px-3 py-1.5 inline-block">{notice}</p>}

      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto overflow-y-auto max-h-[72vh]">
        <table className="w-full min-w-[1100px] text-sm border-separate border-spacing-0">
          <thead>
            <tr className="bg-slate-800 text-white text-left">
              <th className="px-4 py-3 font-semibold sticky top-0 left-0 z-30 bg-slate-800 min-w-[200px]">Employee</th>
              <th className="px-4 py-3 font-semibold sticky top-0 z-20 bg-slate-800">Dates</th>
              {BUCKETS.map(b => (
                <th key={b} className="px-2 py-3 font-semibold text-center sticky top-0 z-20 bg-slate-800 whitespace-nowrap">{b}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pagedRows.length === 0 ? (
              <tr>
                <td colSpan={2 + BUCKETS.length} className="px-4 py-10 text-center text-slate-400">No attendance for {month}.</td>
              </tr>
            ) : pagedRows.map(({ emp, days, counts }) => (
              <tr key={emp.id} className="border-b border-slate-100 align-top">
                <td className="px-4 py-4 sticky left-0 z-10 bg-white border-b border-slate-100 shadow-[2px_0_4px_rgba(0,0,0,0.05)]">
                  <div className="font-semibold text-slate-800 leading-tight">{emp.name || emp.id}</div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {emp.id}{emp.designation ? ` · ${emp.designation}` : ""}
                  </div>
                  {emp.branch && <div className="text-[11px] text-slate-300 mt-0.5">{emp.branch}</div>}
                </td>
                <td className="px-4 py-3 border-b border-slate-100">
                  <div className="flex flex-wrap gap-1.5">
                    {days.map(d => {
                      const clickable = canRequest && CHANGEABLE_BUCKETS.includes(d.bucket) && !d.pendingTo;
                      return (
                        <span
                          key={d.n}
                          role={clickable ? "button" : undefined}
                          tabIndex={clickable ? 0 : undefined}
                          onClick={clickable ? () => setChangeCtx({
                            empCode: emp.id, name: emp.name || emp.id, date: d.date, dateLabel: d.label,
                            bucket: d.bucket, originalStatus: d.raw || d.bucket, actor: role,
                          }) : undefined}
                          title={d.pendingTo ? `Pending approval: change to ${d.pendingTo}` : (clickable ? "Click to request a change" : (d.bucket || "No record"))}
                          className={`relative w-[62px] shrink-0 rounded-md border px-1 py-1 text-center leading-tight ${CHIP_CLASS[d.bucket]} ${clickable ? "cursor-pointer hover:ring-2 hover:ring-slate-300" : ""} ${d.pendingTo ? "ring-2 ring-amber-400" : ""}`}
                        >
                          <span className="block text-[11px] font-medium">{d.label}</span>
                          <span className="block text-[10px]">{d.bucket || "—"}</span>
                          {d.pendingTo && (
                            <span className="absolute -top-1.5 -right-1.5 text-[9px] bg-amber-400 text-amber-950 rounded px-1 font-semibold" title={`Pending: ${d.pendingTo}`}>
                              →{d.pendingTo[0]}
                            </span>
                          )}
                        </span>
                      );
                    })}
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
          <Button variant="outline" className="rounded-xl" disabled={safePage <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Previous</Button>
          <span className="text-slate-500">
            Page {safePage} of {pageCount} · {(safePage - 1) * perPage + 1}–{(safePage - 1) * perPage + pagedRows.length} of {registerRows.length}
          </span>
          <Button variant="outline" className="rounded-xl" disabled={safePage >= pageCount} onClick={() => setPage(p => Math.min(pageCount, p + 1))}>Next</Button>
        </div>
      )}

      <ChangeModal
        ctx={changeCtx}
        onClose={() => setChangeCtx(null)}
        onSubmitted={({ msg, empCode, date, target }) => {
          setNotice(msg); setTimeout(() => setNotice(""), 5000);
          setApplied(a => ({ ...a, [`${empCode}|${date}`]: target }));
        }}
      />
    </div>
  );
}
