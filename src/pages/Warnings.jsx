import React, { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { Button, Badge, PageTitle } from "../components/ui.jsx";
import { STAFF_LEVEL_POLICIES } from "../config/staffPolicies.js";

const WARNING_TYPES = ["Late Attendance", "Attendance", "Conduct", "Performance", "Insubordination", "Policy Violation"];
const LEVELS = ["Verbal Warning", "Written Warning", "Final Warning", "Termination"];
const LEVEL_TONES = { "Verbal Warning": "yellow", "Written Warning": "red", "Final Warning": "purple", "Termination": "red" };

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

const BLANK = { employee: null, warning_type: "Late Attendance", level: "Verbal Warning", description: "", date: new Date().toISOString().slice(0, 10) };

export default function Warnings() {
  const [employees, setEmployees] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [lateAlerts, setLateAlerts] = useState([]);
  const [filterEmp, setFilterEmp] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const [{ data: emps }, { data: wrns }, { data: att }] = await Promise.all([
      supabase.from("employees").select("employee_code, full_name, department, branch, staff_level").order("full_name"),
      supabase.from("audit_logs").select("*").eq("action", "warning_issued").order("created_at", { ascending: false }).limit(200),
      supabase.from("attendance").select("employee_code, late_minutes, work_date")
        .not("late_minutes", "is", null).gte("work_date", new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)),
    ]);
    setEmployees(emps || []);

    // Parse warnings from audit_logs
    const parsed = (wrns || []).map(w => {
      try { return { ...JSON.parse(w.details || "{}"), id: w.id, created_at: w.created_at }; } catch { return null; }
    }).filter(Boolean);
    setWarnings(parsed);

    // Auto-detect late threshold alerts
    const lateByEmp = {};
    (att || []).forEach(a => {
      if (Number(a.late_minutes || 0) > 0) {
        lateByEmp[a.employee_code] = (lateByEmp[a.employee_code] || 0) + 1;
      }
    });
    const threshold = 3; // from policy (latePenaltyCount)
    const alerts = Object.entries(lateByEmp)
      .filter(([, count]) => count >= threshold)
      .map(([code, count]) => ({ employee_code: code, late_count: count }));
    setLateAlerts(alerts);
  }

  async function issueWarning() {
    if (!form.employee || !form.warning_type || !form.level) return setErr("Employee, type and level are required.");
    setErr("");
    const payload = {
      employee_code: form.employee.employee_code, employee_name: form.employee.full_name,
      warning_type: form.warning_type, level: form.level, description: form.description,
      date: form.date, issued_by: "HR",
    };
    const { error } = await supabase.from("audit_logs").insert({
      action: "warning_issued", entity: "employee", entity_id: form.employee.employee_code,
      details: JSON.stringify(payload), performed_by: "HR", created_at: new Date().toISOString(),
    });
    if (error) return setErr(error.message);
    setMsg(`Warning issued to ${form.employee.full_name}.`);
    setForm(BLANK); setShowForm(false); loadAll();
  }

  const empMap = useMemo(() => Object.fromEntries(employees.map(e => [e.employee_code, e])), [employees]);

  const filtered = useMemo(() => warnings.filter(w =>
    !filterEmp || (w.employee_name || w.employee_code || "").toLowerCase().includes(filterEmp.toLowerCase())
  ), [warnings, filterEmp]);

  return (
    <div>
      <PageTitle title="Warnings & Discipline" subtitle="Issue warnings, track escalation levels and auto-detect policy violations."
        action={<Button onClick={() => setShowForm(s => !s)} className="rounded-2xl">{showForm ? "Cancel" : "Issue Warning"}</Button>} />

      {msg && <div className="mb-3 p-3 rounded-xl bg-blue-50 text-blue-700 text-sm">{msg}</div>}
      {err && <div className="mb-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{err}</div>}

      {/* Auto-trigger alerts */}
      {lateAlerts.length > 0 && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <p className="font-semibold text-amber-800 mb-2">⚡ Auto-detected Late Threshold Breaches (last 30 days)</p>
          <div className="flex flex-wrap gap-2">
            {lateAlerts.map(a => (
              <div key={a.employee_code} className="flex items-center gap-2 bg-white rounded-xl px-3 py-1.5 border border-amber-100">
                <span className="text-sm font-medium">{empMap[a.employee_code]?.full_name || a.employee_code}</span>
                <Badge tone="yellow">{a.late_count} lates</Badge>
                <button onClick={() => { setForm(f => ({ ...f, employee: empMap[a.employee_code] || { employee_code: a.employee_code, full_name: a.employee_code }, warning_type: "Late Attendance" })); setShowForm(true); }}
                  className="text-xs text-amber-600 underline">Issue Warning</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {showForm && (
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm mb-4">
          <h2 className="font-bold text-slate-800 mb-4">Issue Warning</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-slate-500 mb-1">Employee</p>
              <EmpPicker employees={employees} value={form.employee} onChange={v => setForm(f => ({ ...f, employee: v }))} />
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Warning Date</p>
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Warning Type</p>
              <select value={form.warning_type} onChange={e => setForm(f => ({ ...f, warning_type: e.target.value }))}
                className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm">
                {WARNING_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Escalation Level</p>
              <select value={form.level} onChange={e => setForm(f => ({ ...f, level: e.target.value }))}
                className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm">
                {LEVELS.map(l => <option key={l}>{l}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <p className="text-xs text-slate-500 mb-1">Description</p>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3}
                placeholder="Describe the incident or policy violation..."
                className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm resize-none" />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={issueWarning} className="rounded-2xl">Issue Warning</Button>
            <Button variant="outline" onClick={() => setShowForm(false)} className="rounded-2xl">Cancel</Button>
          </div>
        </div>
      )}

      {/* Escalation key */}
      <div className="flex flex-wrap gap-2 mb-4">
        {LEVELS.map(l => <Badge key={l} tone={LEVEL_TONES[l]}>{l}</Badge>)}
        <span className="text-xs text-slate-400 self-center ml-1">— Escalation progression</span>
      </div>

      {/* Filter */}
      <div className="mb-4">
        <input value={filterEmp} onChange={e => setFilterEmp(e.target.value)} placeholder="Filter by employee..."
          className="px-4 py-2 rounded-xl border border-slate-200 text-sm w-64" />
      </div>

      {/* Warning History */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
        <div className="px-5 pt-4 pb-2">
          <h2 className="font-bold text-slate-800">Warning History</h2>
          <p className="text-xs text-slate-400 mt-0.5">{filtered.length} records</p>
        </div>
        <table className="w-full min-w-[700px] text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>{["Date", "Employee", "Warning Type", "Level", "Description", "Issued By"].map(h => (
              <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
            ))}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0
              ? <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No warnings issued yet.</td></tr>
              : filtered.map((w, i) => (
                <tr key={i}>
                  <td className="px-4 py-3">{w.date || w.created_at?.slice(0, 10)}</td>
                  <td className="px-4 py-3 font-medium">{w.employee_name || w.employee_code}</td>
                  <td className="px-4 py-3">{w.warning_type}</td>
                  <td className="px-4 py-3"><Badge tone={LEVEL_TONES[w.level] || "yellow"}>{w.level}</Badge></td>
                  <td className="px-4 py-3 max-w-[200px] truncate">{w.description || "—"}</td>
                  <td className="px-4 py-3">{w.issued_by || "HR"}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
