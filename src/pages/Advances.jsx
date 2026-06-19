import React, { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { Button, Badge, PageTitle } from "../components/ui.jsx";
import { money } from "../utils/format.js";
import { calculateAdvanceEligibility } from "../utils/payrollRules.js";

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
              <span className="text-xs text-slate-400 ml-2">{e.department} · {money(e.salary)}/mo</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const BLANK = { employee: null, requested_amount: "" };

export default function Advances({ role }) {
  const [advances, setAdvances] = useState([]);
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
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const payrollMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const canApprove = ["Master", "HR"].includes(role);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const [{ data: adv }, { data: emps }] = await Promise.all([
      supabase.from("advances").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.from("employees").select("employee_code,full_name,department,branch,salary").order("full_name"),
    ]);
    setAdvances(adv || []);
    setEmployees(emps || []);
  }

  const eligibility = useMemo(() => {
    if (!form.employee) return null;
    const salary = Number(form.employee.salary || 0);
    return calculateAdvanceEligibility(salary, dayOfMonth, daysInMonth);
  }, [form.employee, dayOfMonth, daysInMonth]);

  const requestedNum = Number(form.requested_amount || 0);
  const eligibilityError = eligibility && requestedNum > eligibility.maxAdvance
    ? `Requested amount exceeds maximum eligible (${money(eligibility.maxAdvance)}).`
    : null;

  async function submitAdvance() {
    if (!form.employee || !form.requested_amount) return setErr("Employee and requested amount are required.");
    if (eligibilityError) return setErr(eligibilityError);
    // Check one advance per month
    const existing = advances.find(a =>
      a.employee_code === form.employee.employee_code &&
      a.payroll_month === payrollMonth &&
      a.status !== "Rejected"
    );
    if (existing) return setErr("Employee already has an advance for this month. Only one advance per month is allowed.");
    setErr("");
    const sal = Number(form.employee.salary || 0);
    const elig = calculateAdvanceEligibility(sal, dayOfMonth, daysInMonth);
    const { error } = await supabase.from("advances").insert({
      employee_code: form.employee.employee_code,
      employee_name: form.employee.full_name,
      requested_amount: requestedNum,
      max_eligible: elig.maxAdvance,
      days_worked_so_far: elig.daysElapsed,
      salary_at_request: sal,
      request_date: now.toISOString().slice(0, 10),
      payroll_month: payrollMonth,
      status: "Pending",
      created_at: new Date().toISOString(),
    });
    if (error) return setErr(error.message);
    setMsg("Advance request submitted for approval.");
    setForm(BLANK); setShowForm(false); loadAll();
  }

  async function approveAdvance(id) {
    const adv = advances.find(a => a.id === id);
    if (Number(adv?.requested_amount) > Number(adv?.max_eligible))
      return setErr("Cannot approve — requested amount exceeds 80% of earned salary.");
    await supabase.from("advances").update({
      status: "Approved", approved_amount: adv.requested_amount,
      approved_by: role, approved_at: new Date().toISOString(),
    }).eq("id", id);
    await supabase.from("audit_logs").insert({
      action: "advance_approved", entity: "advances", entity_id: id,
      performed_by: role, details: `Advance of ${money(adv?.requested_amount)} approved for ${adv?.employee_name}`,
      created_at: new Date().toISOString(),
    }).then(() => {});
    setMsg("Advance approved and will be deducted from current month payroll."); loadAll();
  }

  async function rejectAdvance(id, reason) {
    await supabase.from("advances").update({
      status: "Rejected", rejection_reason: reason, approved_by: role,
    }).eq("id", id);
    setMsg("Advance request rejected."); setRejectId(null); setRejectNote(""); loadAll();
  }

  const filtered = useMemo(() => advances.filter(a => {
    const empMatch = !filterEmp || (a.employee_name || a.employee_code || "").toLowerCase().includes(filterEmp.toLowerCase());
    const statusMatch = filterStatus === "All" || a.status === filterStatus;
    return empMatch && statusMatch;
  }), [advances, filterEmp, filterStatus]);

  const statusTone = s => ({ Pending: "yellow", Approved: "green", Rejected: "red" }[s] || "slate");

  return (
    <div>
      <PageTitle title="Salary Advances" subtitle="Request and approve salary advances (deducted from same month payroll)."
        action={<Button onClick={() => setShowForm(s => !s)} className="rounded-2xl">{showForm ? "Cancel" : "+ Request Advance"}</Button>} />

      {msg && <div className="mb-3 p-3 rounded-xl bg-blue-50 text-blue-700 text-sm">{msg}</div>}
      {err && <div className="mb-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{err}</div>}

      {showForm && (
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm mb-4">
          <h2 className="font-bold text-slate-800 mb-1">New Advance Request</h2>
          <p className="text-xs text-slate-500 mb-4">Today is {now.toLocaleDateString("en-PK")} (Day {dayOfMonth} of {daysInMonth}). Advance is deducted from current month payroll.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2"><p className="text-xs text-slate-500 mb-1">Employee *</p><EmpPicker employees={employees} value={form.employee} onChange={v => setForm(f => ({ ...f, employee: v, requested_amount: "" }))} /></div>

            {eligibility && (
              <div className="md:col-span-2 grid grid-cols-3 gap-3">
                <div className="bg-slate-50 rounded-xl p-3 text-center">
                  <p className="text-xs text-slate-500">Days into Month</p>
                  <p className="text-lg font-bold text-slate-800">{eligibility.daysElapsed}</p>
                </div>
                <div className="bg-emerald-50 rounded-xl p-3 text-center">
                  <p className="text-xs text-slate-500">Earned So Far</p>
                  <p className="text-lg font-bold text-emerald-700">{money(eligibility.earnedSoFar)}</p>
                </div>
                <div className="bg-blue-50 rounded-xl p-3 text-center">
                  <p className="text-xs text-slate-500">Max Eligible (80%)</p>
                  <p className="text-lg font-bold text-blue-700">{money(eligibility.maxAdvance)}</p>
                </div>
              </div>
            )}

            <div>
              <p className="text-xs text-slate-500 mb-1">Requested Amount (Rs.) *</p>
              <input type="number" value={form.requested_amount}
                onChange={e => setForm(f => ({ ...f, requested_amount: e.target.value }))}
                placeholder="0" max={eligibility?.maxAdvance}
                className={`w-full px-4 py-2 rounded-xl border text-sm ${eligibilityError ? "border-red-400 bg-red-50" : "border-slate-200"}`} />
              {eligibilityError && <p className="text-xs text-red-600 mt-1">{eligibilityError}</p>}
              {eligibility && requestedNum > 0 && !eligibilityError && (
                <p className="text-xs text-emerald-600 mt-1">Within eligible limit.</p>
              )}
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={submitAdvance} disabled={!!eligibilityError} className="rounded-2xl">Submit Request</Button>
            <Button variant="outline" onClick={() => setShowForm(false)} className="rounded-2xl">Cancel</Button>
          </div>
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
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm"><p className="text-xs text-slate-500">Pending</p><p className="text-2xl font-bold text-amber-500">{advances.filter(a => a.status === "Pending").length}</p></div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm"><p className="text-xs text-slate-500">Approved (Month)</p><p className="text-2xl font-bold text-blue-600">{money(advances.filter(a => a.status === "Approved" && a.payroll_month === payrollMonth).reduce((s, a) => s + Number(a.approved_amount || 0), 0))}</p></div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm"><p className="text-xs text-slate-500">Total Requests</p><p className="text-2xl font-bold">{advances.length}</p></div>
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
        <div className="px-5 pt-4 pb-2"><h2 className="font-bold text-slate-800">Advance Ledger</h2><p className="text-xs text-slate-400">{filtered.length} records · Deducted from same-month payroll</p></div>
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>{["Employee","Requested","Max Eligible","Days Worked","Salary","Request Date","Month","Status","Action"].map(h => <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0
              ? <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">No advance requests found.</td></tr>
              : filtered.map(a => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium">{a.employee_name}<div className="text-xs text-slate-400">{a.employee_code}</div></td>
                  <td className="px-4 py-3 font-semibold">{money(a.requested_amount)}</td>
                  <td className="px-4 py-3 text-blue-600">{money(a.max_eligible)}</td>
                  <td className="px-4 py-3">{a.days_worked_so_far}</td>
                  <td className="px-4 py-3">{money(a.salary_at_request)}</td>
                  <td className="px-4 py-3">{a.request_date}</td>
                  <td className="px-4 py-3 text-slate-500">{a.payroll_month}</td>
                  <td className="px-4 py-3"><Badge tone={statusTone(a.status)}>{a.status}</Badge></td>
                  <td className="px-4 py-3">
                    {a.status === "Pending" && canApprove && (
                      rejectId === a.id
                        ? <div className="flex flex-col gap-1">
                            <input value={rejectNote} onChange={e => setRejectNote(e.target.value)} placeholder="Reason..." className="px-2 py-1 rounded-xl border text-xs" />
                            <div className="flex gap-1">
                              <Button onClick={() => rejectAdvance(a.id, rejectNote)} className="rounded-xl text-xs py-1 px-2">Confirm</Button>
                              <Button variant="outline" onClick={() => setRejectId(null)} className="rounded-xl text-xs py-1 px-2">Cancel</Button>
                            </div>
                          </div>
                        : <div className="flex gap-1">
                            <Button onClick={() => approveAdvance(a.id)} className="rounded-xl text-xs py-1 px-2">Approve</Button>
                            <Button variant="outline" onClick={() => setRejectId(a.id)} className="rounded-xl text-xs py-1 px-2">Reject</Button>
                          </div>
                    )}
                    {a.status === "Rejected" && a.rejection_reason && <span className="text-xs text-red-500">{a.rejection_reason}</span>}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
