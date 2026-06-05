import React, { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { Button, Badge, PageTitle } from "../components/ui.jsx";
import { BRANCH_CODE_MAP } from "../constants/branches.js";

function EmpPicker({ employees, value, onChange }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const hits = useMemo(() => {
    if (!q.trim()) return [];
    const lq = q.toLowerCase();
    return employees.filter(e => e.full_name?.toLowerCase().includes(lq) || e.employee_code?.toLowerCase().includes(lq)).slice(0, 10);
  }, [employees, q]);
  return (
    <div className="relative" ref={ref}>
      <input value={value ? `${value.employee_code} — ${value.full_name}` : q}
        onChange={e => { if (value) onChange(null); setQ(e.target.value); setOpen(true); }}
        onFocus={() => { if (!value) setOpen(true); }}
        placeholder="Search employee..." className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
      {open && hits.length > 0 && (
        <div className="absolute z-20 top-full left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-lg mt-1 max-h-48 overflow-y-auto">
          {hits.map(e => (
            <button key={e.employee_code} onMouseDown={ev => ev.preventDefault()}
              onClick={() => { onChange(e); setQ(""); setOpen(false); }}
              className="w-full text-left px-4 py-2 hover:bg-slate-50 text-sm">
              <span className="font-semibold">{e.employee_code}</span> — {e.full_name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const BLANK_FORM = { employee: null, work_date: "", original_in: "", original_out: "", adjusted_in: "", adjusted_out: "", reason: "" };

export default function AttendanceAdjustment() {
  const [adjustments, setAdjustments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  // Filters
  const [filterBranch, setFilterBranch] = useState("All");
  const [filterDept, setFilterDept] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [{ data: adjs }, { data: emps }] = await Promise.all([
        supabase.from("attendance_adjustments").select("*").order("created_at", { ascending: false }).limit(500),
        supabase.from("employees").select("employee_code, full_name, department, branch").order("full_name"),
      ]);
      setAdjustments(adjs || []);
      setEmployees(emps || []);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    const empMap = Object.fromEntries(employees.map(e => [e.employee_code, e]));
    return adjustments.filter(a => {
      const emp = empMap[a.employee_code || a.employee_id];
      const branchMatch = filterBranch === "All" || emp?.branch === filterBranch;
      const deptMatch = !filterDept || emp?.department?.toLowerCase().includes(filterDept.toLowerCase());
      const fromMatch = !filterFrom || (a.work_date || a.adjustment_date || "") >= filterFrom;
      const toMatch = !filterTo || (a.work_date || a.adjustment_date || "") <= filterTo;
      return branchMatch && deptMatch && fromMatch && toMatch;
    });
  }, [adjustments, employees, filterBranch, filterDept, filterFrom, filterTo]);

  async function saveAdjustment() {
    if (!form.employee || !form.work_date) return setErr("Employee and date are required.");
    setErr("");
    const payload = {
      employee_code: form.employee.employee_code, employee_id: form.employee.employee_code,
      employee_name: form.employee.full_name, work_date: form.work_date,
      original_in: form.original_in || null, original_out: form.original_out || null,
      adjusted_in: form.adjusted_in || null, adjusted_out: form.adjusted_out || null,
      reason: form.reason, adjusted_by: "HR", created_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("attendance_adjustments").insert(payload);
    if (error) return setErr(error.message);

    // Log to audit_logs
    await supabase.from("audit_logs").insert({
      action: "attendance_adjustment", entity: "attendance",
      entity_id: form.employee.employee_code, details: JSON.stringify(payload),
      performed_by: "HR", created_at: new Date().toISOString(),
    }).then(() => {});

    setMsg("Adjustment saved and logged to audit log.");
    setForm(BLANK_FORM); setShowForm(false); loadAll();
  }

  return (
    <div>
      <PageTitle title="Attendance Adjustments" subtitle="Manual attendance corrections with full audit trail."
        action={<Button onClick={() => setShowForm(s => !s)} className="rounded-2xl">{showForm ? "Cancel" : "+ New Adjustment"}</Button>} />

      {msg && <div className="mb-3 p-3 rounded-xl bg-blue-50 text-blue-700 text-sm">{msg}</div>}
      {err && <div className="mb-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{err}</div>}

      {showForm && (
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm mb-4">
          <h2 className="font-bold text-slate-800 mb-4">New Attendance Adjustment</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-slate-500 mb-1">Employee</p>
              <EmpPicker employees={employees} value={form.employee} onChange={v => setForm(f => ({ ...f, employee: v }))} />
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Date</p>
              <input type="date" value={form.work_date} onChange={e => setForm(f => ({ ...f, work_date: e.target.value }))}
                className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Original In</p>
              <input type="time" value={form.original_in} onChange={e => setForm(f => ({ ...f, original_in: e.target.value }))}
                className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Original Out</p>
              <input type="time" value={form.original_out} onChange={e => setForm(f => ({ ...f, original_out: e.target.value }))}
                className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Adjusted In</p>
              <input type="time" value={form.adjusted_in} onChange={e => setForm(f => ({ ...f, adjusted_in: e.target.value }))}
                className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Adjusted Out</p>
              <input type="time" value={form.adjusted_out} onChange={e => setForm(f => ({ ...f, adjusted_out: e.target.value }))}
                className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
            </div>
            <div className="lg:col-span-3">
              <p className="text-xs text-slate-500 mb-1">Reason</p>
              <input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="Reason for adjustment..." className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={saveAdjustment} className="rounded-2xl">Save Adjustment</Button>
            <Button variant="outline" onClick={() => setShowForm(false)} className="rounded-2xl">Cancel</Button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm mb-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm">
            <option value="All">All Branches</option>
            {Object.keys(BRANCH_CODE_MAP).map(b => <option key={b}>{b}</option>)}
          </select>
          <input value={filterDept} onChange={e => setFilterDept(e.target.value)} placeholder="Filter by department"
            className="px-4 py-2 rounded-xl border border-slate-200 text-sm" />
          <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm" />
          <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm" />
        </div>
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
        <div className="px-5 pt-4 pb-2">
          <h2 className="font-bold text-slate-800">Adjustment Register</h2>
          <p className="text-xs text-slate-400 mt-0.5">{filtered.length} records</p>
        </div>
        {loading ? <p className="px-5 py-8 text-slate-400 text-sm">Loading...</p> : (
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>{["Date", "Employee", "Orig In", "Orig Out", "Adj In", "Adj Out", "Reason", "Adjusted By", "Timestamp"].map(h => (
                <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0
                ? <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">No adjustments found.</td></tr>
                : filtered.map((a, i) => (
                  <tr key={i}>
                    <td className="px-4 py-3 font-medium">{a.work_date || a.adjustment_date}</td>
                    <td className="px-4 py-3">{a.employee_name || a.employee_code || a.employee_id}</td>
                    <td className="px-4 py-3">{a.original_in || "—"}</td>
                    <td className="px-4 py-3">{a.original_out || "—"}</td>
                    <td className="px-4 py-3 text-blue-600 font-medium">{a.adjusted_in || "—"}</td>
                    <td className="px-4 py-3 text-blue-600 font-medium">{a.adjusted_out || "—"}</td>
                    <td className="px-4 py-3 max-w-[140px] truncate">{a.reason || "—"}</td>
                    <td className="px-4 py-3">{a.adjusted_by || "—"}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{a.created_at?.slice(0, 16) || "—"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
