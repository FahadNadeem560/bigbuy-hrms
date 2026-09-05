import React, { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { Button, Badge, PageTitle } from "../components/ui.jsx";
import { money } from "../utils/format.js";

// A shortage is raised against whoever was on the counter, and that is the
// whole cash counter, not just the person on the till: Till Helpers handle
// the same drawer and were previously unselectable because the picker
// matched the word "cashier" alone.
//
// The department is the real definition of the group (Cash-Counter, 28 active
// across Cashier / Till Helper / Head Cashier / Chief Cashier / CRO), so that
// is the primary test. Designation is kept as a fallback so a counter role
// filed under some other department still appears — the department field has
// spelling drift elsewhere in this data and shouldn't be the only way in.
const CASH_COUNTER_DEPT = "cashcounter";
const CASH_COUNTER_DESIGNATION = /\b(cashier|till)\b/;

function normalizeDept(v) {
  return String(v || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function isCashCounterStaff(e) {
  if (normalizeDept(e.department) === CASH_COUNTER_DEPT) return true;
  return CASH_COUNTER_DESIGNATION.test(String(e.designation || "").toLowerCase());
}

function EmpPicker({ employees, value, onChange }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // Active first, then by name. A left employee can still legitimately carry a
  // shortage (recovered through their final settlement), so they stay
  // selectable rather than being filtered out — just clearly marked.
  const counterStaff = useMemo(() => employees.filter(isCashCounterStaff).sort((a, b) => {
    const aActive = a.status === "Active", bActive = b.status === "Active";
    if (aActive !== bActive) return aActive ? -1 : 1;
    return String(a.full_name || "").localeCompare(String(b.full_name || ""));
  }), [employees]);

  // Empty query lists the whole counter rather than nothing — with a bounded
  // group this size, browsing is faster than guessing at a name, and it makes
  // it obvious that Till Helpers are in scope.
  const hits = useMemo(() => {
    const lq = q.trim().toLowerCase();
    if (!lq) return counterStaff.slice(0, 50);
    return counterStaff.filter(e =>
      e.full_name?.toLowerCase().includes(lq) ||
      e.employee_code?.toLowerCase().includes(lq) ||
      e.designation?.toLowerCase().includes(lq)
    ).slice(0, 50);
  }, [counterStaff, q]);

  return (
    <div className="relative" ref={ref}>
      <input value={value ? `${value.employee_code} — ${value.full_name}` : q}
        onChange={e => { if (value) onChange(null); setQ(e.target.value); setOpen(true); }}
        onFocus={() => { if (!value) setOpen(true); }}
        placeholder="Search cash counter staff by name, code or role…"
        className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
      {open && hits.length > 0 && (
        <div className="absolute z-20 top-full left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-lg mt-1 max-h-64 overflow-y-auto">
          <div className="px-4 py-1.5 text-[11px] text-slate-400 border-b border-slate-100 sticky top-0 bg-white">
            {q.trim() ? `${hits.length} match${hits.length === 1 ? "" : "es"}` : `Cash counter — ${counterStaff.length} staff`}
          </div>
          {hits.map(e => (
            <button key={e.employee_code} onMouseDown={ev => ev.preventDefault()}
              onClick={() => { onChange(e); setQ(""); setOpen(false); }}
              className="w-full text-left px-4 py-2 hover:bg-slate-50 text-sm">
              <span className="font-semibold">{e.employee_code}</span> — {e.full_name}
              <span className="text-xs text-slate-400 ml-2">{e.designation || "—"}</span>
              {e.status !== "Active" && <span className="text-[10px] text-amber-600 ml-2">({e.status || "Inactive"})</span>}
            </button>
          ))}
        </div>
      )}
      {open && q.trim() && hits.length === 0 && (
        <div className="absolute z-20 top-full left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-lg mt-1 p-3 text-sm text-slate-400">
          No cash counter staff matching "{q}".
        </div>
      )}
    </div>
  );
}

const CURRENT_MONTH = (() => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
})();
const BLANK = { employee: null, amount: "", description: "", shortage_month: CURRENT_MONTH };

export default function Shortages({ role }) {
  const [shortages, setShortages] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [filterEmp, setFilterEmp] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterMonth, setFilterMonth] = useState("");
  const [rejectId, setRejectId] = useState(null);
  const [rejectNote, setRejectNote] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const payrollMonth = CURRENT_MONTH;

  const canEnter = ["Master", "HR", "Head Cashier", "Chief Cashier"].includes(role);
  const canApprove = ["Master", "HR"].includes(role);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const [{ data: sh }, { data: emps }] = await Promise.all([
      supabase.from("shortages").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.from("employees").select("employee_code,full_name,department,branch,designation,status").order("full_name"),
    ]);
    setShortages(sh || []);
    setEmployees(emps || []);
  }

  async function submitShortage() {
    if (!form.employee || !form.amount || !form.shortage_month)
      return setErr("Employee, amount and month are required.");
    if (!(Number(form.amount) > 0)) return setErr("Amount must be greater than zero.");
    setErr("");
    const { error } = await supabase.from("shortages").insert({
      employee_code: form.employee.employee_code,
      employee_name: form.employee.full_name,
      amount: Number(form.amount),
      description: form.description,
      // Shortages are tallied per cashier at month-end -- the shortage
      // belongs to a whole month, not a day. payroll_month is the only field
      // payroll reads (buildPayrollRows filters shortages on it), so the
      // selected month drives which month's pay it hits. shortage_date kept
      // null (legacy per-day column).
      shortage_date: null,
      entered_by: role,
      entered_by_role: role,
      status: "Pending",
      payroll_month: form.shortage_month,
      created_at: new Date().toISOString(),
    });
    if (error) return setErr(error.message);
    setMsg(`Shortage submitted for HR approval — will deduct from ${form.shortage_month} payroll.`);
    setForm(BLANK); setShowForm(false); loadAll();
  }

  async function approveShortage(id) {
    const s = shortages.find(x => x.id === id);
    await supabase.from("shortages").update({
      status: "Approved", approved_by: role, approved_at: new Date().toISOString(),
    }).eq("id", id);
    await supabase.from("audit_logs").insert({
      action: "shortage_approved", entity: "shortages", entity_id: id,
      performed_by: role, details: `Shortage of ${money(s?.amount)} approved for ${s?.employee_name}`,
      created_at: new Date().toISOString(),
    }).then(() => {});
    setMsg(`Shortage approved — deducts from ${s?.payroll_month || "the target"} payroll on its next generate/refresh.`); loadAll();
  }

  async function rejectShortage(id, reason) {
    await supabase.from("shortages").update({
      status: "Rejected", rejection_reason: reason, approved_by: role,
    }).eq("id", id);
    setMsg("Shortage rejected."); setRejectId(null); setRejectNote(""); loadAll();
  }

  const filtered = useMemo(() => shortages.filter(s => {
    const empMatch = !filterEmp || `${s.employee_name || ""} ${s.employee_code || ""}`.toLowerCase().includes(filterEmp.toLowerCase());
    const statusMatch = filterStatus === "All" || s.status === filterStatus;
    const monthMatch = !filterMonth || s.payroll_month === filterMonth;
    return empMatch && statusMatch && monthMatch;
  }), [shortages, filterEmp, filterStatus, filterMonth]);

  const statusTone = s => ({ Pending: "yellow", Approved: "green", Rejected: "red" }[s] || "slate");

  return (
    <div>
      <PageTitle title="Shortage Module" subtitle="Cash counter shortages, tallied per employee at month-end and deducted from that month's payroll."
        action={canEnter && <Button onClick={() => setShowForm(s => !s)} className="rounded-2xl">{showForm ? "Cancel" : "+ New Shortage"}</Button>} />

      {msg && <div className="mb-3 p-3 rounded-xl bg-blue-50 text-blue-700 text-sm">{msg}</div>}
      {err && <div className="mb-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{err}</div>}

      {showForm && canEnter && (
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm mb-4">
          <h2 className="font-bold text-slate-800 mb-4">Record Cash Shortage</h2>
          <p className="text-xs text-slate-500 mb-3">Cash counter staff are shown — cashiers, till helpers and the head/chief cashier. The shortage is deducted from the selected month's payroll (whenever that month is next generated / refreshed).</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><p className="text-xs text-slate-500 mb-1">Cash Counter Staff *</p><EmpPicker employees={employees} value={form.employee} onChange={v => setForm(f => ({ ...f, employee: v }))} /></div>
            <div><p className="text-xs text-slate-500 mb-1">Payroll Month *</p><input type="month" value={form.shortage_month} onChange={e => setForm(f => ({ ...f, shortage_month: e.target.value }))} className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" /></div>
            <div><p className="text-xs text-slate-500 mb-1">Shortage Amount (Rs.) *</p><input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" /></div>
            <div><p className="text-xs text-slate-500 mb-1">Description</p><input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Details of shortage..." className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" /></div>
          </div>
          <div className="mt-4 flex gap-2"><Button onClick={submitShortage} className="rounded-2xl">Submit Shortage</Button><Button variant="outline" onClick={() => setShowForm(false)} className="rounded-2xl">Cancel</Button></div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm mb-4 flex flex-wrap gap-3">
        <input value={filterEmp} onChange={e => setFilterEmp(e.target.value)} placeholder="Search by name or code..." className="flex-1 min-w-[180px] px-4 py-2 rounded-xl border border-slate-200 text-sm" />
        <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)} title="Filter by payroll month" className="px-4 py-2 rounded-xl border border-slate-200 text-sm" />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm">
          <option value="All">All Status</option><option>Pending</option><option>Approved</option><option>Rejected</option>
        </select>
        {(filterMonth || filterEmp || filterStatus !== "All") && (
          <button onClick={() => { setFilterMonth(""); setFilterEmp(""); setFilterStatus("All"); }} className="px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-500 hover:bg-slate-50">Clear</button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm"><p className="text-xs text-slate-500">Pending</p><p className="text-2xl font-bold text-amber-500">{shortages.filter(s => s.status === "Pending").length}</p></div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm"><p className="text-xs text-slate-500">Approved (Month)</p><p className="text-2xl font-bold text-red-500">{money(shortages.filter(s => s.status === "Approved" && s.payroll_month === payrollMonth).reduce((sum, s) => sum + Number(s.amount || 0), 0))}</p></div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm"><p className="text-xs text-slate-500">Total Records</p><p className="text-2xl font-bold">{shortages.length}</p></div>
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto overflow-y-auto max-h-[70vh]">
        <div className="px-5 pt-4 pb-2"><h2 className="font-bold text-slate-800">Shortage Ledger</h2><p className="text-xs text-slate-400">{filtered.length} records</p></div>
        <table className="w-full min-w-[800px] text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>{["Employee","Amount","Description","Entered By","Payroll Month","Status","Action"].map(h => <th key={h} className="text-left px-4 py-3 font-medium sticky top-0 z-10 bg-slate-50 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0
              ? <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No shortage records found.</td></tr>
              : filtered.map(s => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium">{s.employee_name}<div className="text-xs text-slate-400">{s.employee_code}</div></td>
                  <td className="px-4 py-3 font-semibold text-red-600">{money(s.amount)}</td>
                  <td className="px-4 py-3 max-w-[160px] truncate text-slate-600">{s.description || "—"}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{s.entered_by}</td>
                  <td className="px-4 py-3 text-slate-500 font-medium">{s.payroll_month || "—"}</td>
                  <td className="px-4 py-3"><Badge tone={statusTone(s.status)}>{s.status}</Badge></td>
                  <td className="px-4 py-3">
                    {s.status === "Pending" && canApprove && (
                      rejectId === s.id
                        ? <div className="flex flex-col gap-1">
                            <input value={rejectNote} onChange={e => setRejectNote(e.target.value)} placeholder="Reason..." className="px-2 py-1 rounded-xl border text-xs" />
                            <div className="flex gap-1">
                              <Button onClick={() => rejectShortage(s.id, rejectNote)} className="rounded-xl text-xs py-1 px-2">Confirm</Button>
                              <Button variant="outline" onClick={() => setRejectId(null)} className="rounded-xl text-xs py-1 px-2">Cancel</Button>
                            </div>
                          </div>
                        : <div className="flex gap-1">
                            <Button onClick={() => approveShortage(s.id)} className="rounded-xl text-xs py-1 px-2">Approve</Button>
                            <Button variant="outline" onClick={() => setRejectId(s.id)} className="rounded-xl text-xs py-1 px-2">Reject</Button>
                          </div>
                    )}
                    {s.status === "Rejected" && s.rejection_reason && <span className="text-xs text-red-500">{s.rejection_reason}</span>}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
