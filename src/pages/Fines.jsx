import React, { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { Button, Badge, PageTitle } from "../components/ui.jsx";
import { money } from "../utils/format.js";

const FINE_TYPES = ["Late Coming Fine", "Conduct Fine", "Performance Fine", "Cash Fine", "Custom"];

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
        placeholder="Search employee..."
        className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
      {open && hits.length > 0 && (
        <div className="absolute z-20 top-full left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-lg mt-1 max-h-48 overflow-y-auto">
          {hits.map(e => (
            <button key={e.employee_code} onMouseDown={ev => ev.preventDefault()}
              onClick={() => { onChange(e); setQ(""); setOpen(false); }}
              className="w-full text-left px-4 py-2 hover:bg-slate-50 text-sm">
              <span className="font-semibold">{e.employee_code}</span> — {e.full_name}
              <span className="text-xs text-slate-400 ml-2">{e.department}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const BLANK_FORM = { employee: null, fine_type: "Late Coming Fine", amount: "", reason: "", fine_date: "" };

export default function Fines({ role }) {
  const [fines, setFines] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const [filterEmp, setFilterEmp] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [rejectId, setRejectId] = useState(null);
  const [rejectNote, setRejectNote] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const now = new Date();
  const payrollMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const canIssue = ["Master", "HR", "Supervisor", "Manager"].includes(role);
  const canApprove = ["Master", "HR", "Finance"].includes(role);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const [{ data: fn }, { data: emps }] = await Promise.all([
      supabase.from("fines").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.from("employees").select("employee_code,full_name,department,branch").order("full_name"),
    ]);
    setFines(fn || []);
    setEmployees(emps || []);
  }

  async function submitFine() {
    if (!form.employee || !form.amount || !form.reason || !form.fine_date)
      return setErr("Employee, amount, reason and date are required.");
    setErr("");
    const { error } = await supabase.from("fines").insert({
      employee_code: form.employee.employee_code,
      employee_name: form.employee.full_name,
      fine_type: form.fine_type,
      amount: Number(form.amount),
      reason: form.reason,
      issued_by: role,
      issued_by_role: role,
      status: "Pending",
      payroll_month: payrollMonth,
      created_at: new Date().toISOString(),
    });
    if (error) return setErr(error.message);
    setMsg("Fine submitted for approval.");
    setForm(BLANK_FORM); setShowForm(false); loadAll();
  }

  async function approveFine(id) {
    const fine = fines.find(f => f.id === id);
    // HR cannot approve their own fine
    if (role === "HR" && fine?.issued_by_role === "HR")
      return setErr("HR cannot approve their own fines. GM or Master approval required.");
    await supabase.from("fines").update({
      status: "Approved", approved_by: role, approved_at: new Date().toISOString(),
    }).eq("id", id);
    // Log to audit_logs
    await supabase.from("audit_logs").insert({
      action: "fine_approved", entity: "fines", entity_id: id,
      performed_by: role, details: `Fine of ${money(fine?.amount)} approved for ${fine?.employee_name}`,
      created_at: new Date().toISOString(),
    }).then(() => {});
    setMsg("Fine approved and will be deducted in payroll."); loadAll();
  }

  async function rejectFine(id, reason) {
    await supabase.from("fines").update({
      status: "Rejected", rejection_reason: reason, approved_by: role,
    }).eq("id", id);
    setMsg("Fine rejected."); setRejectId(null); setRejectNote(""); loadAll();
  }

  const filtered = useMemo(() => fines.filter(f => {
    const empMatch = !filterEmp || (f.employee_name || f.employee_code || "").toLowerCase().includes(filterEmp.toLowerCase());
    const statusMatch = filterStatus === "All" || f.status === filterStatus;
    return empMatch && statusMatch;
  }), [fines, filterEmp, filterStatus]);

  const statusTone = s => ({ Pending: "yellow", Approved: "green", Rejected: "red" }[s] || "slate");

  return (
    <div>
      <PageTitle title="Fines & Penalties" subtitle="Issue, review and approve employee fines."
        action={canIssue && <Button onClick={() => setShowForm(s => !s)} className="rounded-2xl">{showForm ? "Cancel" : "+ New Fine"}</Button>} />

      {msg && <div className="mb-3 p-3 rounded-xl bg-blue-50 text-blue-700 text-sm">{msg}</div>}
      {err && <div className="mb-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{err}</div>}

      {showForm && canIssue && (
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm mb-4">
          <h2 className="font-bold text-slate-800 mb-4">Issue Fine / Penalty</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><p className="text-xs text-slate-500 mb-1">Employee *</p><EmpPicker employees={employees} value={form.employee} onChange={v => setForm(f => ({ ...f, employee: v }))} /></div>
            <div><p className="text-xs text-slate-500 mb-1">Fine Type *</p>
              <select value={form.fine_type} onChange={e => setForm(f => ({ ...f, fine_type: e.target.value }))} className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm">
                {FINE_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div><p className="text-xs text-slate-500 mb-1">Amount (Rs.) *</p><input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" /></div>
            <div><p className="text-xs text-slate-500 mb-1">Date *</p><input type="date" value={form.fine_date} onChange={e => setForm(f => ({ ...f, fine_date: e.target.value }))} className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" /></div>
            <div className="md:col-span-2"><p className="text-xs text-slate-500 mb-1">Reason *</p><textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} rows={2} placeholder="Reason for fine..." className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" /></div>
            {role === "HR" && <div className="md:col-span-2 p-3 bg-amber-50 text-amber-700 text-xs rounded-xl">Note: Fines issued by HR require GM or Master approval.</div>}
          </div>
          <div className="mt-4 flex gap-2"><Button onClick={submitFine} className="rounded-2xl">Submit Fine</Button><Button variant="outline" onClick={() => setShowForm(false)} className="rounded-2xl">Cancel</Button></div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm mb-4 flex flex-wrap gap-3">
        <input value={filterEmp} onChange={e => setFilterEmp(e.target.value)} placeholder="Search employee..." className="flex-1 min-w-[180px] px-4 py-2 rounded-xl border border-slate-200 text-sm" />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm">
          <option value="All">All Status</option><option>Pending</option><option>Approved</option><option>Rejected</option>
        </select>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm"><p className="text-xs text-slate-500">Pending</p><p className="text-2xl font-bold text-amber-500">{fines.filter(f => f.status === "Pending").length}</p></div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm"><p className="text-xs text-slate-500">Approved (Month)</p><p className="text-2xl font-bold text-red-500">{money(fines.filter(f => f.status === "Approved" && f.payroll_month === payrollMonth).reduce((s, f) => s + Number(f.amount || 0), 0))}</p></div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm"><p className="text-xs text-slate-500">Total Fines</p><p className="text-2xl font-bold">{fines.length}</p></div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
        <div className="px-5 pt-4 pb-2"><h2 className="font-bold text-slate-800">Fine Ledger</h2><p className="text-xs text-slate-400">{filtered.length} records</p></div>
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>{["Employee","Fine Type","Amount","Reason","Issued By","Month","Status","Action"].map(h => <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0
              ? <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No fines found.</td></tr>
              : filtered.map(f => (
                <tr key={f.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium">{f.employee_name}<div className="text-xs text-slate-400">{f.employee_code}</div></td>
                  <td className="px-4 py-3"><Badge tone="red">{f.fine_type}</Badge></td>
                  <td className="px-4 py-3 font-semibold text-red-600">{money(f.amount)}</td>
                  <td className="px-4 py-3 max-w-[160px] truncate text-slate-600">{f.reason}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{f.issued_by}<br /><span className="text-slate-300">{f.issued_by_role}</span></td>
                  <td className="px-4 py-3 text-slate-500">{f.payroll_month}</td>
                  <td className="px-4 py-3"><Badge tone={statusTone(f.status)}>{f.status}</Badge>{f.approved_by && <div className="text-xs text-slate-400 mt-0.5">{f.approved_by}</div>}</td>
                  <td className="px-4 py-3">
                    {f.status === "Pending" && canApprove && (
                      rejectId === f.id
                        ? <div className="flex flex-col gap-1">
                            <input value={rejectNote} onChange={e => setRejectNote(e.target.value)} placeholder="Reason..." className="px-2 py-1 rounded-xl border text-xs" />
                            <div className="flex gap-1">
                              <Button onClick={() => rejectFine(f.id, rejectNote)} className="rounded-xl text-xs py-1 px-2">Confirm</Button>
                              <Button variant="outline" onClick={() => setRejectId(null)} className="rounded-xl text-xs py-1 px-2">Cancel</Button>
                            </div>
                          </div>
                        : <div className="flex gap-1">
                            <Button onClick={() => approveFine(f.id)}
                              disabled={role === "HR" && f.issued_by_role === "HR"}
                              className="rounded-xl text-xs py-1 px-2">Approve</Button>
                            <Button variant="outline" onClick={() => setRejectId(f.id)} className="rounded-xl text-xs py-1 px-2">Reject</Button>
                          </div>
                    )}
                    {f.status === "Rejected" && f.rejection_reason && (
                      <span className="text-xs text-red-500">{f.rejection_reason}</span>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
