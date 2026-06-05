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

const BLANK = { employee: null, loan_amount: "", monthly_deduction: "", start_date: "", reason: "" };

export default function LoanManagement() {
  const [loans, setLoans] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [filterEmp, setFilterEmp] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [selectedHistory, setSelectedHistory] = useState(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const [{ data: lns }, { data: emps }] = await Promise.all([
      supabase.from("loans").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.from("employees").select("employee_code, full_name, department, branch, salary, joining_date").order("full_name"),
    ]);
    setLoans(lns || []);
    setEmployees(emps || []);
  }

  async function submitLoan() {
    if (!form.employee || !form.loan_amount || !form.monthly_deduction || !form.start_date)
      return setErr("Employee, loan amount, monthly deduction and start date are required.");
    setErr("");
    const months = Math.ceil(Number(form.loan_amount) / Number(form.monthly_deduction));
    const { error } = await supabase.from("loans").insert({
      employee_id: form.employee.employee_code, employee_code: form.employee.employee_code,
      employee_name: form.employee.full_name, loan_amount: Number(form.loan_amount),
      monthly_deduction: Number(form.monthly_deduction), outstanding_balance: Number(form.loan_amount),
      start_date: form.start_date, reason: form.reason, status: "Active",
      repayment_months: months, auto_deduct: true, created_at: new Date().toISOString(),
    });
    if (error) return setErr(error.message);
    setMsg("Loan application created successfully.");
    setForm(BLANK); setShowForm(false); loadAll();
  }

  async function clearLoan(id) {
    const { error } = await supabase.from("loans").update({ status: "Cleared", outstanding_balance: 0 }).eq("id", id);
    if (!error) { setMsg("Loan marked as cleared."); loadAll(); }
  }

  const filtered = useMemo(() => loans.filter(l => {
    const empMatch = !filterEmp || (l.employee_name || l.employee_code || "").toLowerCase().includes(filterEmp.toLowerCase());
    const statusMatch = filterStatus === "All" || l.status === filterStatus;
    return empMatch && statusMatch;
  }), [loans, filterEmp, filterStatus]);

  const totalOutstanding = useMemo(() =>
    filtered.filter(l => l.status === "Active").reduce((s, l) => s + Number(l.outstanding_balance || 0), 0),
    [filtered]);

  const historyEmp = selectedHistory
    ? loans.filter(l => l.employee_code === selectedHistory || l.employee_id === selectedHistory)
    : [];

  return (
    <div>
      <PageTitle title="Loans & Advances" subtitle="Manage employee loan applications, deductions and balances."
        action={<Button onClick={() => setShowForm(s => !s)} className="rounded-2xl">{showForm ? "Cancel" : "+ New Loan"}</Button>} />

      {msg && <div className="mb-3 p-3 rounded-xl bg-blue-50 text-blue-700 text-sm">{msg}</div>}
      {err && <div className="mb-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{err}</div>}

      {showForm && (
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm mb-4">
          <h2 className="font-bold text-slate-800 mb-4">New Loan Application</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-slate-500 mb-1">Employee</p>
              <EmpPicker employees={employees} value={form.employee} onChange={v => setForm(f => ({ ...f, employee: v }))} />
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Start Date</p>
              <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Loan Amount (Rs.)</p>
              <input type="number" value={form.loan_amount} onChange={e => setForm(f => ({ ...f, loan_amount: e.target.value }))}
                placeholder="0" className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Monthly Deduction (Rs.)</p>
              <input type="number" value={form.monthly_deduction} onChange={e => setForm(f => ({ ...f, monthly_deduction: e.target.value }))}
                placeholder="0" className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
            </div>
            {form.loan_amount && form.monthly_deduction && (
              <div className="md:col-span-2 p-3 bg-slate-50 rounded-xl text-sm text-slate-600">
                Repayment: <strong>{Math.ceil(Number(form.loan_amount) / Number(form.monthly_deduction))} months</strong>
              </div>
            )}
            <div className="md:col-span-2">
              <p className="text-xs text-slate-500 mb-1">Reason</p>
              <input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="Reason for loan..." className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={submitLoan} className="rounded-2xl">Submit Loan</Button>
            <Button variant="outline" onClick={() => setShowForm(false)} className="rounded-2xl">Cancel</Button>
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-slate-500">Active Loans</p>
          <p className="text-2xl font-bold">{loans.filter(l => l.status === "Active").length}</p>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-slate-500">Total Outstanding</p>
          <p className="text-2xl font-bold text-red-500">{money(totalOutstanding)}</p>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-slate-500">Cleared Loans</p>
          <p className="text-2xl font-bold text-emerald-600">{loans.filter(l => l.status === "Cleared").length}</p>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-slate-500">Total Loans</p>
          <p className="text-2xl font-bold">{loans.length}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm mb-4">
        <div className="flex flex-wrap gap-3">
          <input value={filterEmp} onChange={e => setFilterEmp(e.target.value)} placeholder="Search employee..."
            className="flex-1 min-w-[160px] px-4 py-2 rounded-xl border border-slate-200 text-sm" />
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm">
            <option value="All">All Status</option>
            <option>Active</option><option>Cleared</option>
          </select>
        </div>
      </div>

      {/* Loan Ledger */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
        <div className="px-5 pt-4 pb-2">
          <h2 className="font-bold text-slate-800">Loan Ledger</h2>
          <p className="text-xs text-slate-400 mt-0.5">{filtered.length} records</p>
        </div>
        <table className="w-full min-w-[800px] text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>{["Employee", "Loan Amount", "Monthly Ded.", "Outstanding", "Start Date", "Months", "Auto Deduct", "Status", "Action"].map(h => (
              <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
            ))}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0
              ? <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">No loans found.</td></tr>
              : filtered.map(l => (
                <tr key={l.id}>
                  <td className="px-4 py-3">
                    <button onClick={() => setSelectedHistory(l.employee_code || l.employee_id)}
                      className="font-medium text-blue-600 hover:underline">
                      {l.employee_name || l.employee_code || l.employee_id}
                    </button>
                  </td>
                  <td className="px-4 py-3">{money(l.loan_amount)}</td>
                  <td className="px-4 py-3">{money(l.monthly_deduction)}</td>
                  <td className="px-4 py-3 font-semibold text-red-500">{money(l.outstanding_balance)}</td>
                  <td className="px-4 py-3">{l.start_date}</td>
                  <td className="px-4 py-3">{l.repayment_months || "—"}</td>
                  <td className="px-4 py-3">
                    <Badge tone={l.auto_deduct ? "green" : "slate"}>{l.auto_deduct ? "Yes" : "No"}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={l.status === "Active" ? "yellow" : "green"}>{l.status}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    {l.status === "Active" && (
                      <Button variant="outline" onClick={() => clearLoan(l.id)} className="rounded-xl text-xs py-1 px-2">Clear</Button>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* History Modal */}
      {selectedHistory && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-slate-800">Loan History — {selectedHistory}</h3>
              <Button variant="outline" onClick={() => setSelectedHistory(null)} className="rounded-xl text-xs">Close</Button>
            </div>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {historyEmp.length === 0
                ? <p className="text-slate-400 text-sm">No loan history.</p>
                : historyEmp.map((l, i) => (
                  <div key={i} className="border border-slate-100 rounded-xl p-3 text-sm">
                    <div className="flex justify-between mb-1">
                      <span className="font-semibold">{money(l.loan_amount)}</span>
                      <Badge tone={l.status === "Active" ? "yellow" : "green"}>{l.status}</Badge>
                    </div>
                    <div className="text-slate-500">Monthly: {money(l.monthly_deduction)} · Start: {l.start_date}</div>
                    <div className="text-slate-500">Outstanding: {money(l.outstanding_balance)} · Reason: {l.reason || "—"}</div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
