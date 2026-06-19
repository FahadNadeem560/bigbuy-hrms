import React, { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { Button, Badge, PageTitle } from "../components/ui.jsx";
import { money } from "../utils/format.js";

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
    return employees
      .filter(e => {
        const desig = (e.designation || "").toLowerCase();
        const isCashier = desig.includes("cashier");
        const nameMatch = e.full_name?.toLowerCase().includes(lq) || e.employee_code?.toLowerCase().includes(lq);
        return isCashier && nameMatch;
      })
      .slice(0, 10);
  }, [employees, q]);
  return (
    <div className="relative" ref={ref}>
      <input value={value ? `${value.employee_code} — ${value.full_name}` : q}
        onChange={e => { if (value) onChange(null); setQ(e.target.value); setOpen(true); }}
        onFocus={() => { if (!value) setOpen(true); }}
        placeholder="Search cashier employee..."
        className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
      {open && hits.length > 0 && (
        <div className="absolute z-20 top-full left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-lg mt-1 max-h-48 overflow-y-auto">
          {hits.map(e => (
            <button key={e.employee_code} onMouseDown={ev => ev.preventDefault()}
              onClick={() => { onChange(e); setQ(""); setOpen(false); }}
              className="w-full text-left px-4 py-2 hover:bg-slate-50 text-sm">
              <span className="font-semibold">{e.employee_code}</span> — {e.full_name}
              <span className="text-xs text-slate-400 ml-2">{e.designation}</span>
            </button>
          ))}
        </div>
      )}
      {open && q.length >= 1 && hits.length === 0 && (
        <div className="absolute z-20 top-full left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-lg mt-1 p-3 text-sm text-slate-400">
          No cashier employees found matching "{q}"
        </div>
      )}
    </div>
  );
}

const BLANK = { employee: null, amount: "", description: "", shortage_date: "" };

export default function Shortages({ role }) {
  const [shortages, setShortages] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [filterEmp, setFilterEmp] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [rejectId, setRejectId] = useState(null);
  const [rejectNote, setRejectNote] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const now = new Date();
  const payrollMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const canEnter = ["Master", "HR", "Head Cashier", "Chief Cashier"].includes(role);
  const canApprove = ["Master", "HR"].includes(role);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const [{ data: sh }, { data: emps }] = await Promise.all([
      supabase.from("shortages").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.from("employees").select("employee_code,full_name,department,branch,designation").order("full_name"),
    ]);
    setShortages(sh || []);
    setEmployees(emps || []);
  }

  async function submitShortage() {
    if (!form.employee || !form.amount || !form.shortage_date)
      return setErr("Employee, amount and date are required.");
    setErr("");
    const { error } = await supabase.from("shortages").insert({
      employee_code: form.employee.employee_code,
      employee_name: form.employee.full_name,
      amount: Number(form.amount),
      description: form.description,
      shortage_date: form.shortage_date,
      entered_by: role,
      entered_by_role: role,
      status: "Pending",
      payroll_month: payrollMonth,
      created_at: new Date().toISOString(),
    });
    if (error) return setErr(error.message);
    setMsg("Shortage submitted for HR approval.");
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
    setMsg("Shortage approved and will be deducted in payroll."); loadAll();
  }

  async function rejectShortage(id, reason) {
    await supabase.from("shortages").update({
      status: "Rejected", rejection_reason: reason, approved_by: role,
    }).eq("id", id);
    setMsg("Shortage rejected."); setRejectId(null); setRejectNote(""); loadAll();
  }

  const filtered = useMemo(() => shortages.filter(s => {
    const empMatch = !filterEmp || (s.employee_name || s.employee_code || "").toLowerCase().includes(filterEmp.toLowerCase());
    const statusMatch = filterStatus === "All" || s.status === filterStatus;
    return empMatch && statusMatch;
  }), [shortages, filterEmp, filterStatus]);

  const statusTone = s => ({ Pending: "yellow", Approved: "green", Rejected: "red" }[s] || "slate");

  return (
    <div>
      <PageTitle title="Shortage Module" subtitle="Record and approve cashier shortage deductions."
        action={canEnter && <Button onClick={() => setShowForm(s => !s)} className="rounded-2xl">{showForm ? "Cancel" : "+ New Shortage"}</Button>} />

      {msg && <div className="mb-3 p-3 rounded-xl bg-blue-50 text-blue-700 text-sm">{msg}</div>}
      {err && <div className="mb-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{err}</div>}

      {showForm && canEnter && (
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm mb-4">
          <h2 className="font-bold text-slate-800 mb-4">Record Cash Shortage</h2>
          <p className="text-xs text-slate-500 mb-3">Only cashier employees are shown. Filter by designation containing "cashier".</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><p className="text-xs text-slate-500 mb-1">Cashier Employee *</p><EmpPicker employees={employees} value={form.employee} onChange={v => setForm(f => ({ ...f, employee: v }))} /></div>
            <div><p className="text-xs text-slate-500 mb-1">Date *</p><input type="date" value={form.shortage_date} onChange={e => setForm(f => ({ ...f, shortage_date: e.target.value }))} className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" /></div>
            <div><p className="text-xs text-slate-500 mb-1">Shortage Amount (Rs.) *</p><input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" /></div>
            <div><p className="text-xs text-slate-500 mb-1">Description</p><input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Details of shortage..." className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" /></div>
          </div>
          <div className="mt-4 flex gap-2"><Button onClick={submitShortage} className="rounded-2xl">Submit Shortage</Button><Button variant="outline" onClick={() => setShowForm(false)} className="rounded-2xl">Cancel</Button></div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm mb-4 flex flex-wrap gap-3">
        <input value={filterEmp} onChange={e => setFilterEmp(e.target.value)} placeholder="Search employee..." className="flex-1 min-w-[180px] px-4 py-2 rounded-xl border border-slate-200 text-sm" />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm">
          <option value="All">All Status</option><option>Pending</option><option>Approved</option><option>Rejected</option>
        </select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm"><p className="text-xs text-slate-500">Pending</p><p className="text-2xl font-bold text-amber-500">{shortages.filter(s => s.status === "Pending").length}</p></div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm"><p className="text-xs text-slate-500">Approved (Month)</p><p className="text-2xl font-bold text-red-500">{money(shortages.filter(s => s.status === "Approved" && s.payroll_month === payrollMonth).reduce((sum, s) => sum + Number(s.amount || 0), 0))}</p></div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm"><p className="text-xs text-slate-500">Total Records</p><p className="text-2xl font-bold">{shortages.length}</p></div>
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
        <div className="px-5 pt-4 pb-2"><h2 className="font-bold text-slate-800">Shortage Ledger</h2><p className="text-xs text-slate-400">{filtered.length} records</p></div>
        <table className="w-full min-w-[800px] text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>{["Employee","Date","Amount","Description","Entered By","Month","Status","Action"].map(h => <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0
              ? <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No shortage records found.</td></tr>
              : filtered.map(s => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium">{s.employee_name}<div className="text-xs text-slate-400">{s.employee_code}</div></td>
                  <td className="px-4 py-3">{s.shortage_date}</td>
                  <td className="px-4 py-3 font-semibold text-red-600">{money(s.amount)}</td>
                  <td className="px-4 py-3 max-w-[160px] truncate text-slate-600">{s.description || "—"}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{s.entered_by}</td>
                  <td className="px-4 py-3 text-slate-500">{s.payroll_month}</td>
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
