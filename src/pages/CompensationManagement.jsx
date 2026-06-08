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
              <span className="text-xs text-slate-400 ml-2">{money(e.salary)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const STRUCT_BLANK = { employee: null, basic: "", hra: "", medical: "", conveyance: "", other_allowances: "", effective_from: "" };

export default function CompensationManagement() {
  const [tab, setTab] = useState("structure");
  const [employees, setEmployees] = useState([]);
  const [structures, setStructures] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(STRUCT_BLANK);
  const [historyEmp, setHistoryEmp] = useState(null);
  const [filterDept, setFilterDept] = useState("All");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const [{ data: emps }, { data: structs }] = await Promise.all([
      supabase.from("employees").select("employee_code, full_name, department, branch, salary, staff_level, status").eq("status", "Active").order("full_name"),
      supabase.from("salary_structures").select("*").order("created_at", { ascending: false }),
    ]);
    setEmployees(emps || []);
    setStructures(structs || []);
  }

  function totalFromForm(f) {
    return ["basic", "hra", "medical", "conveyance", "other_allowances"].reduce((s, k) => s + Number(f[k] || 0), 0);
  }

  async function saveStructure() {
    if (!form.employee || !form.basic || !form.effective_from) return setErr("Employee, basic salary and effective date are required.");
    setErr("");
    const total = totalFromForm(form);
    const { error } = await supabase.from("salary_structures").insert({
      employee_code: form.employee.employee_code, employee_name: form.employee.full_name,
      basic: Number(form.basic), hra: Number(form.hra || 0), medical: Number(form.medical || 0),
      conveyance: Number(form.conveyance || 0), other_allowances: Number(form.other_allowances || 0),
      total_ctc: total, effective_from: form.effective_from,
    });
    if (error) return setErr(error.message);
    setMsg("Salary structure saved."); setForm(STRUCT_BLANK); setShowForm(false); loadAll();
  }

  const depts = useMemo(() => ["All", ...new Set(employees.map(e => e.department).filter(Boolean))], [employees]);

  const deptReport = useMemo(() => {
    const map = {};
    employees.filter(e => filterDept === "All" || e.department === filterDept).forEach(emp => {
      const dept = emp.department || "Unknown";
      if (!map[dept]) map[dept] = { dept, count: 0, totalSalary: 0, avgSalary: 0 };
      map[dept].count++;
      map[dept].totalSalary += Number(emp.salary || 0);
    });
    Object.values(map).forEach(d => { d.avgSalary = d.count ? Math.round(d.totalSalary / d.count) : 0; });
    return Object.values(map).sort((a, b) => b.totalSalary - a.totalSalary);
  }, [employees, filterDept]);

  const empStructures = useMemo(() => employees.map(emp => {
    const structs = structures.filter(s => s.employee_code === emp.employee_code).sort((a, b) => b.effective_from?.localeCompare(a.effective_from || ""));
    const latest = structs[0];
    return { ...emp, structure: latest, structureHistory: structs };
  }), [employees, structures]);

  const historyData = historyEmp ? empStructures.find(e => e.employee_code === historyEmp) : null;

  return (
    <div>
      <PageTitle title="Compensation Management" subtitle="Salary structures, cost analysis and department-wise compensation reports."
        action={<Button onClick={() => setShowForm(s => !s)} className="rounded-2xl">{showForm ? "Cancel" : "+ Set Structure"}</Button>} />

      {msg && <div className="mb-3 p-3 rounded-xl bg-blue-50 text-blue-700 text-sm">{msg}</div>}
      {err && <div className="mb-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{err}</div>}

      {showForm && (
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm mb-4">
          <h2 className="font-bold text-slate-800 mb-4">Salary Structure</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-3"><p className="text-xs text-slate-500 mb-1">Employee *</p><EmpPicker employees={employees} value={form.employee} onChange={v => setForm(f => ({ ...f, employee: v, basic: String(v?.salary || "") }))} /></div>
            <div><p className="text-xs text-slate-500 mb-1">Basic Salary *</p><input type="number" value={form.basic} onChange={e => setForm(f => ({ ...f, basic: e.target.value }))} placeholder="0" className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" /></div>
            <div><p className="text-xs text-slate-500 mb-1">House Rent Allowance</p><input type="number" value={form.hra} onChange={e => setForm(f => ({ ...f, hra: e.target.value }))} placeholder="0" className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" /></div>
            <div><p className="text-xs text-slate-500 mb-1">Medical Allowance</p><input type="number" value={form.medical} onChange={e => setForm(f => ({ ...f, medical: e.target.value }))} placeholder="0" className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" /></div>
            <div><p className="text-xs text-slate-500 mb-1">Conveyance Allowance</p><input type="number" value={form.conveyance} onChange={e => setForm(f => ({ ...f, conveyance: e.target.value }))} placeholder="0" className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" /></div>
            <div><p className="text-xs text-slate-500 mb-1">Other Allowances</p><input type="number" value={form.other_allowances} onChange={e => setForm(f => ({ ...f, other_allowances: e.target.value }))} placeholder="0" className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" /></div>
            <div><p className="text-xs text-slate-500 mb-1">Effective From *</p><input type="date" value={form.effective_from} onChange={e => setForm(f => ({ ...f, effective_from: e.target.value }))} className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" /></div>
            <div className="md:col-span-3 p-3 bg-slate-50 rounded-xl text-sm text-slate-600">
              Total CTC: <strong>{money(totalFromForm(form))}</strong>
            </div>
          </div>
          <div className="mt-4 flex gap-2"><Button onClick={saveStructure} className="rounded-2xl">Save Structure</Button><Button variant="outline" onClick={() => setShowForm(false)} className="rounded-2xl">Cancel</Button></div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        {[["structure", "Salary Structures"], ["history", "History"], ["reports", "Reports"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${tab === k ? "bg-slate-950 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{l}</button>
        ))}
      </div>

      {tab === "structure" && (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
          <div className="px-5 pt-4 pb-2"><h2 className="font-bold text-slate-800">Current Salary Structures</h2><p className="text-xs text-slate-400">{employees.length} active employees</p></div>
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>{["Employee", "Basic", "HRA", "Medical", "Conveyance", "Other", "Total CTC", "Effective", "Action"].map(h => <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {empStructures.map(emp => {
                const s = emp.structure;
                const ctc = s ? Number(s.total_ctc || 0) : Number(emp.salary || 0);
                return (
                  <tr key={emp.employee_code}>
                    <td className="px-4 py-3 font-medium">{emp.full_name}<div className="text-xs text-slate-400">{emp.employee_code}</div></td>
                    <td className="px-4 py-3">{s ? money(s.basic) : money(emp.salary)}</td>
                    <td className="px-4 py-3">{s ? money(s.hra) : "—"}</td>
                    <td className="px-4 py-3">{s ? money(s.medical) : "—"}</td>
                    <td className="px-4 py-3">{s ? money(s.conveyance) : "—"}</td>
                    <td className="px-4 py-3">{s ? money(s.other_allowances) : "—"}</td>
                    <td className="px-4 py-3 font-bold">{money(ctc)}</td>
                    <td className="px-4 py-3">{s?.effective_from || <Badge tone="slate">Not set</Badge>}</td>
                    <td className="px-4 py-3">
                      <Button variant="outline" onClick={() => setHistoryEmp(emp.employee_code)} className="rounded-xl text-xs py-1 px-2">History</Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === "history" && (
        <div>
          <p className="text-sm text-slate-500 mb-3">Click "History" on any employee in Structures tab to view their compensation timeline.</p>
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
            <div className="px-5 pt-4 pb-2"><h2 className="font-bold text-slate-800">All Salary Structure Changes</h2></div>
            <table className="w-full min-w-[800px] text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>{["Date", "Employee", "Basic", "HRA", "Medical", "Conveyance", "Other", "Total CTC"].map(h => <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {structures.length === 0
                  ? <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No structures recorded yet.</td></tr>
                  : structures.map(s => (
                    <tr key={s.id}>
                      <td className="px-4 py-3">{s.effective_from || s.created_at?.slice(0, 10)}</td>
                      <td className="px-4 py-3 font-medium">{s.employee_name || s.employee_code}</td>
                      <td className="px-4 py-3">{money(s.basic)}</td>
                      <td className="px-4 py-3">{money(s.hra)}</td>
                      <td className="px-4 py-3">{money(s.medical)}</td>
                      <td className="px-4 py-3">{money(s.conveyance)}</td>
                      <td className="px-4 py-3">{money(s.other_allowances)}</td>
                      <td className="px-4 py-3 font-bold">{money(s.total_ctc)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "reports" && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <select value={filterDept} onChange={e => setFilterDept(e.target.value)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm">
              {depts.map(d => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
            <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm"><p className="text-xs text-slate-500">Active Employees</p><p className="text-2xl font-bold">{employees.filter(e => filterDept === "All" || e.department === filterDept).length}</p></div>
            <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm"><p className="text-xs text-slate-500">Total Monthly Payroll</p><p className="text-2xl font-bold">{money(employees.filter(e => filterDept === "All" || e.department === filterDept).reduce((s, e) => s + Number(e.salary || 0), 0))}</p></div>
            <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm"><p className="text-xs text-slate-500">Average Salary</p><p className="text-2xl font-bold">{money(employees.filter(e => filterDept === "All" || e.department === filterDept).reduce((s, e, _, arr) => s + Number(e.salary || 0) / arr.length, 0))}</p></div>
          </div>
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
            <div className="px-5 pt-4 pb-2"><h2 className="font-bold text-slate-800">Department-wise Cost Analysis</h2></div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500"><tr>{["Department", "Headcount", "Total Salary", "Avg Salary"].map(h => <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {deptReport.map((d, i) => (
                  <tr key={i}><td className="px-4 py-3 font-medium">{d.dept}</td><td className="px-4 py-3">{d.count}</td><td className="px-4 py-3 font-semibold">{money(d.totalSalary)}</td><td className="px-4 py-3">{money(d.avgSalary)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {historyData && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl p-6">
            <div className="flex justify-between items-center mb-4">
              <div><h3 className="font-bold text-slate-800">Compensation History</h3><p className="text-sm text-slate-500">{historyData.full_name} · {historyData.employee_code}</p></div>
              <Button variant="outline" onClick={() => setHistoryEmp(null)} className="rounded-xl text-xs">Close</Button>
            </div>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {historyData.structureHistory.length === 0
                ? <p className="text-slate-400 text-sm">No structure history. Current salary: {money(historyData.salary)}</p>
                : historyData.structureHistory.map((s, i) => (
                  <div key={i} className="border border-slate-100 rounded-xl p-3 text-sm">
                    <div className="flex justify-between mb-2">
                      <span className="font-semibold">{s.effective_from}</span>
                      <Badge tone="blue">{money(s.total_ctc)}</Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-1 text-xs text-slate-500">
                      <span>Basic: {money(s.basic)}</span>
                      <span>HRA: {money(s.hra)}</span>
                      <span>Medical: {money(s.medical)}</span>
                      <span>Conveyance: {money(s.conveyance)}</span>
                      <span>Other: {money(s.other_allowances)}</span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
