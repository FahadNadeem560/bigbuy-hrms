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
              <span className="text-xs text-slate-400 ml-2">{e.department}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const BLANK = { employee: null, category: "Allowance", type: "Other Allowance", amount: "", description: "", effective_from: "", effective_to: "" };

const ALLOWANCE_TYPES = ["Other Allowance", "Housing Allowance", "Transport Allowance", "Medical Allowance", "Mobile Allowance", "Meal Allowance"];
const DEDUCTION_TYPES = ["Other Monthly Recovery", "Equipment Recovery", "Uniform Recovery", "Advance Recovery", "Fine Recovery"];

export default function FixedAllowances() {
  const [records, setRecords] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [filterEmp, setFilterEmp] = useState("");
  const [filterCat, setFilterCat] = useState("All");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const [{ data: recs }, { data: emps }] = await Promise.all([
      supabase.from("fixed_allowances").select("*").order("created_at", { ascending: false }),
      supabase.from("employees").select("employee_code, full_name, department, branch").order("full_name"),
    ]);
    setRecords(recs || []);
    setEmployees(emps || []);
  }

  async function submit() {
    if (!form.employee || !form.amount || !form.effective_from) return setErr("Employee, amount and effective-from date are required.");
    setErr("");
    const { error } = await supabase.from("fixed_allowances").insert({
      employee_code: form.employee.employee_code, employee_name: form.employee.full_name,
      category: form.category, type: form.type, amount: Number(form.amount),
      description: form.description, effective_from: form.effective_from,
      effective_to: form.effective_to || null, is_active: true,
    });
    if (error) return setErr(error.message);
    setMsg("Record saved. Will auto-apply in next payroll cycle.");
    setForm(BLANK); setShowForm(false); loadAll();
  }

  async function toggleActive(id, cur) {
    await supabase.from("fixed_allowances").update({ is_active: !cur }).eq("id", id);
    loadAll();
  }

  const filtered = useMemo(() => records.filter(r => {
    const empMatch = !filterEmp || (r.employee_name || r.employee_code || "").toLowerCase().includes(filterEmp.toLowerCase());
    const catMatch = filterCat === "All" || r.category === filterCat;
    return empMatch && catMatch;
  }), [records, filterEmp, filterCat]);

  const totals = useMemo(() => ({
    allowances: filtered.filter(r => r.is_active && r.category === "Allowance").reduce((s, r) => s + Number(r.amount || 0), 0),
    deductions: filtered.filter(r => r.is_active && r.category === "Deduction").reduce((s, r) => s + Number(r.amount || 0), 0),
  }), [filtered]);

  return (
    <div>
      <PageTitle title="Fixed Allowances & Deductions" subtitle="Manage recurring monthly allowances and deductions per employee."
        action={<Button onClick={() => setShowForm(s => !s)} className="rounded-2xl">{showForm ? "Cancel" : "+ Add Record"}</Button>} />

      {msg && <div className="mb-3 p-3 rounded-xl bg-blue-50 text-blue-700 text-sm">{msg}</div>}
      {err && <div className="mb-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{err}</div>}

      {showForm && (
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm mb-4">
          <h2 className="font-bold text-slate-800 mb-4">New Fixed Allowance / Deduction</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><p className="text-xs text-slate-500 mb-1">Employee *</p><EmpPicker employees={employees} value={form.employee} onChange={v => setForm(f => ({ ...f, employee: v }))} /></div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Category *</p>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value, type: e.target.value === "Allowance" ? ALLOWANCE_TYPES[0] : DEDUCTION_TYPES[0] }))} className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm">
                <option>Allowance</option><option>Deduction</option>
              </select>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Type</p>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm">
                {(form.category === "Allowance" ? ALLOWANCE_TYPES : DEDUCTION_TYPES).map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div><p className="text-xs text-slate-500 mb-1">Amount (Rs.) *</p><input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" /></div>
            <div><p className="text-xs text-slate-500 mb-1">Effective From *</p><input type="date" value={form.effective_from} onChange={e => setForm(f => ({ ...f, effective_from: e.target.value }))} className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" /></div>
            <div><p className="text-xs text-slate-500 mb-1">Effective To (leave blank for ongoing)</p><input type="date" value={form.effective_to} onChange={e => setForm(f => ({ ...f, effective_to: e.target.value }))} className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" /></div>
            <div className="md:col-span-2"><p className="text-xs text-slate-500 mb-1">Description</p><input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional note..." className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" /></div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={submit} className="rounded-2xl">Save</Button>
            <Button variant="outline" onClick={() => setShowForm(false)} className="rounded-2xl">Cancel</Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm"><p className="text-xs text-slate-500">Total Records</p><p className="text-2xl font-bold">{records.length}</p></div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm"><p className="text-xs text-slate-500">Active Records</p><p className="text-2xl font-bold">{records.filter(r => r.is_active).length}</p></div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm"><p className="text-xs text-slate-500">Monthly Allowances</p><p className="text-2xl font-bold text-emerald-600">{money(totals.allowances)}</p></div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm"><p className="text-xs text-slate-500">Monthly Deductions</p><p className="text-2xl font-bold text-red-500">{money(totals.deductions)}</p></div>
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm mb-4 flex flex-wrap gap-3">
        <input value={filterEmp} onChange={e => setFilterEmp(e.target.value)} placeholder="Search employee..." className="flex-1 min-w-[160px] px-4 py-2 rounded-xl border border-slate-200 text-sm" />
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm">
          <option value="All">All Categories</option><option>Allowance</option><option>Deduction</option>
        </select>
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
        <div className="px-5 pt-4 pb-2"><h2 className="font-bold text-slate-800">Records</h2><p className="text-xs text-slate-400">{filtered.length} entries</p></div>
        <table className="w-full min-w-[800px] text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>{["Employee", "Category", "Type", "Amount", "Effective From", "Effective To", "Status", "Action"].map(h => <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0
              ? <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No records found.</td></tr>
              : filtered.map(r => (
                <tr key={r.id}>
                  <td className="px-4 py-3 font-medium">{r.employee_name || r.employee_code}</td>
                  <td className="px-4 py-3"><Badge tone={r.category === "Allowance" ? "green" : "red"}>{r.category}</Badge></td>
                  <td className="px-4 py-3">{r.type}</td>
                  <td className="px-4 py-3 font-semibold">{money(r.amount)}</td>
                  <td className="px-4 py-3">{r.effective_from}</td>
                  <td className="px-4 py-3">{r.effective_to || <span className="text-slate-400">Ongoing</span>}</td>
                  <td className="px-4 py-3"><Badge tone={r.is_active ? "green" : "slate"}>{r.is_active ? "Active" : "Inactive"}</Badge></td>
                  <td className="px-4 py-3">
                    <Button variant="outline" onClick={() => toggleActive(r.id, r.is_active)} className="rounded-xl text-xs py-1 px-2">{r.is_active ? "Deactivate" : "Activate"}</Button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
