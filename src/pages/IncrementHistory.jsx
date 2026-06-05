import React, { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { Button, Badge, PageTitle } from "../components/ui.jsx";
import { money } from "../utils/format.js";
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
        placeholder="Search employee (or leave blank for bulk)..." className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
      {open && hits.length > 0 && (
        <div className="absolute z-20 top-full left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-lg mt-1 max-h-48 overflow-y-auto">
          {hits.map(e => (
            <button key={e.employee_code} onMouseDown={ev => ev.preventDefault()}
              onClick={() => { onChange(e); setQ(""); setOpen(false); }}
              className="w-full text-left px-4 py-2 hover:bg-slate-50 text-sm">
              <span className="font-semibold">{e.employee_code}</span> — {e.full_name}
              <span className="text-xs text-slate-400 ml-2">{money(e.salary)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

let nextId = 1;
const BLANK = { employee: null, prevSalary: "", newSalary: "", reason: "", approvedBy: "HR", date: new Date().toISOString().slice(0, 10) };

export default function IncrementHistory() {
  const [employees, setEmployees] = useState([]);
  const [increments, setIncrements] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkBranch, setBulkBranch] = useState("All");
  const [bulkDept, setBulkDept] = useState("");
  const [bulkType, setBulkType] = useState("percent");
  const [bulkValue, setBulkValue] = useState("");
  const [filterEmp, setFilterEmp] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    supabase.from("employees").select("employee_code, full_name, department, branch, salary, staff_level").order("full_name")
      .then(({ data }) => setEmployees(data || []));
  }, []);

  const pct = useMemo(() => {
    if (!form.prevSalary || !form.newSalary) return 0;
    return Math.round(((Number(form.newSalary) - Number(form.prevSalary)) / Number(form.prevSalary)) * 100 * 10) / 10;
  }, [form.prevSalary, form.newSalary]);

  function addIncrement() {
    if (!form.employee || !form.prevSalary || !form.newSalary) return setErr("Employee, previous and new salary are required.");
    setErr("");
    setIncrements(prev => [...prev, {
      id: nextId++, employee_code: form.employee.employee_code,
      employee_name: form.employee.full_name, department: form.employee.department,
      branch: form.employee.branch, prev_salary: Number(form.prevSalary),
      new_salary: Number(form.newSalary), pct_increase: pct,
      reason: form.reason, approved_by: form.approvedBy, effective_date: form.date,
    }]);
    setMsg(`Increment recorded for ${form.employee.full_name}: ${money(form.prevSalary)} → ${money(form.newSalary)} (+${pct}%)`);
    setForm(BLANK); setShowForm(false);
  }

  function applyBulkIncrement() {
    if (!bulkValue) return setErr("Enter increment value.");
    setErr("");
    const targets = employees.filter(e => {
      const bOk = bulkBranch === "All" || e.branch === bulkBranch;
      const dOk = !bulkDept || e.department?.toLowerCase().includes(bulkDept.toLowerCase());
      return bOk && dOk;
    });
    const newRows = targets.map(emp => {
      const prev = Number(emp.salary || 0);
      const inc = bulkType === "percent" ? prev * (Number(bulkValue) / 100) : Number(bulkValue);
      const next = Math.round(prev + inc);
      const p = prev > 0 ? Math.round((inc / prev) * 100 * 10) / 10 : 0;
      return {
        id: nextId++, employee_code: emp.employee_code, employee_name: emp.full_name,
        department: emp.department, branch: emp.branch, prev_salary: prev, new_salary: next,
        pct_increase: p, reason: `Bulk increment — ${bulkType === "percent" ? bulkValue + "%" : "Rs." + bulkValue}`,
        approved_by: "HR", effective_date: new Date().toISOString().slice(0, 10),
      };
    });
    setIncrements(prev => [...prev, ...newRows]);
    setMsg(`Bulk increment applied to ${newRows.length} employees.`);
    setBulkValue(""); setBulkBranch("All"); setBulkDept("");
  }

  const filtered = useMemo(() => increments.filter(i =>
    !filterEmp || (i.employee_name || i.employee_code || "").toLowerCase().includes(filterEmp.toLowerCase())
  ), [increments, filterEmp]);

  const totalIncrements = useMemo(() =>
    increments.reduce((s, i) => s + (i.new_salary - i.prev_salary), 0), [increments]);

  return (
    <div>
      <PageTitle title="Salary Increments" subtitle="Track all salary increments with approval history."
        action={<Button onClick={() => setShowForm(s => !s)} className="rounded-2xl">{showForm ? "Cancel" : "+ Add Increment"}</Button>} />

      {msg && <div className="mb-3 p-3 rounded-xl bg-blue-50 text-blue-700 text-sm">{msg}</div>}
      {err && <div className="mb-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{err}</div>}

      {showForm && (
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm mb-4">
          <div className="flex gap-3 mb-4">
            <button onClick={() => setBulkMode(false)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition ${!bulkMode ? "bg-slate-950 text-white" : "bg-white border border-slate-200 text-slate-600"}`}>
              Individual
            </button>
            <button onClick={() => setBulkMode(true)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition ${bulkMode ? "bg-slate-950 text-white" : "bg-white border border-slate-200 text-slate-600"}`}>
              Bulk by Dept/Branch
            </button>
          </div>

          {!bulkMode ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <p className="text-xs text-slate-500 mb-1">Employee</p>
                <EmpPicker employees={employees} value={form.employee}
                  onChange={v => setForm(f => ({ ...f, employee: v, prevSalary: String(v?.salary || "") }))} />
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Previous Salary</p>
                <input type="number" value={form.prevSalary} onChange={e => setForm(f => ({ ...f, prevSalary: e.target.value }))}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">New Salary</p>
                <input type="number" value={form.newSalary} onChange={e => setForm(f => ({ ...f, newSalary: e.target.value }))}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
              </div>
              {pct !== 0 && (
                <div className="md:col-span-2 p-3 bg-slate-50 rounded-xl text-sm text-slate-600">
                  Increment: <strong className="text-emerald-600">+{pct}% ({money(Number(form.newSalary) - Number(form.prevSalary))})</strong>
                </div>
              )}
              <div>
                <p className="text-xs text-slate-500 mb-1">Effective Date</p>
                <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Approved By</p>
                <input value={form.approvedBy} onChange={e => setForm(f => ({ ...f, approvedBy: e.target.value }))}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
              </div>
              <div className="md:col-span-2">
                <p className="text-xs text-slate-500 mb-1">Reason</p>
                <input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                  placeholder="Annual increment, promotion, etc." className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
              </div>
              <div className="md:col-span-2 flex gap-2">
                <Button onClick={addIncrement} className="rounded-2xl">Save Increment</Button>
                <Button variant="outline" onClick={() => setShowForm(false)} className="rounded-2xl">Cancel</Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-slate-500 mb-1">Branch</p>
                <select value={bulkBranch} onChange={e => setBulkBranch(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm">
                  <option value="All">All Branches</option>
                  {Object.keys(BRANCH_CODE_MAP).map(b => <option key={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Department (optional)</p>
                <input value={bulkDept} onChange={e => setBulkDept(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Increment Type</p>
                <select value={bulkType} onChange={e => setBulkType(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm">
                  <option value="percent">Percentage (%)</option>
                  <option value="fixed">Fixed Amount (Rs.)</option>
                </select>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">{bulkType === "percent" ? "Percentage" : "Amount (Rs.)"}</p>
                <input type="number" value={bulkValue} onChange={e => setBulkValue(e.target.value)}
                  placeholder={bulkType === "percent" ? "e.g. 10" : "e.g. 5000"}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
              </div>
              <div className="md:col-span-2 flex gap-2">
                <Button onClick={applyBulkIncrement} className="rounded-2xl">Apply Bulk Increment</Button>
                <Button variant="outline" onClick={() => setShowForm(false)} className="rounded-2xl">Cancel</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-slate-500">Total Increments Recorded</p>
          <p className="text-2xl font-bold">{increments.length}</p>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-slate-500">Total Monthly Cost Increase</p>
          <p className="text-2xl font-bold text-emerald-600">{money(totalIncrements)}</p>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-slate-500">Avg Increment</p>
          <p className="text-2xl font-bold">{increments.length > 0 ? Math.round(increments.reduce((s, i) => s + i.pct_increase, 0) / increments.length * 10) / 10 : 0}%</p>
        </div>
      </div>

      {/* Filter */}
      <div className="mb-4">
        <input value={filterEmp} onChange={e => setFilterEmp(e.target.value)} placeholder="Filter by employee..."
          className="px-4 py-2 rounded-xl border border-slate-200 text-sm w-64" />
      </div>

      {/* History Table */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
        <div className="px-5 pt-4 pb-2">
          <h2 className="font-bold text-slate-800">Increment History</h2>
          <p className="text-xs text-slate-400 mt-0.5">{filtered.length} records</p>
        </div>
        <table className="w-full min-w-[800px] text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>{["Date", "Employee", "Dept/Branch", "Previous", "New", "Increase", "Reason", "Approved By"].map(h => (
              <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
            ))}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0
              ? <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No increment records. Add one above.</td></tr>
              : filtered.map(inc => (
                <tr key={inc.id}>
                  <td className="px-4 py-3">{inc.effective_date}</td>
                  <td className="px-4 py-3 font-medium">{inc.employee_name}</td>
                  <td className="px-4 py-3 text-slate-500">{inc.department}<br /><span className="text-xs">{inc.branch}</span></td>
                  <td className="px-4 py-3">{money(inc.prev_salary)}</td>
                  <td className="px-4 py-3 font-semibold">{money(inc.new_salary)}</td>
                  <td className="px-4 py-3">
                    <Badge tone="green">+{inc.pct_increase}%</Badge>
                  </td>
                  <td className="px-4 py-3 max-w-[150px] truncate">{inc.reason || "—"}</td>
                  <td className="px-4 py-3">{inc.approved_by}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
