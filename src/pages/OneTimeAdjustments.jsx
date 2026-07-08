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

const ADJ_TYPES = ["Incentive", "Arrears", "Deduction", "Shortage", "Penalty", "Commission", "Other"];
const BLANK = { employee: null, type: "Incentive", amount: "", reason: "", payroll_month: "" };

function statusTone(s) {
  return s === "Approved" ? "green" : s === "Rejected" ? "red" : "yellow";
}

export default function OneTimeAdjustments({ role }) {
  const now = new Date();
  const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [tab, setTab] = useState("new");
  const [adjustments, setAdjustments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [form, setForm] = useState({ ...BLANK, payroll_month: curMonth });
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const [{ data: adjs }, { data: emps }] = await Promise.all([
      supabase.from("one_time_adjustments").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.from("employees").select("employee_code, full_name, department, branch").order("full_name"),
    ]);
    setAdjustments(adjs || []);
    setEmployees(emps || []);
  }

  async function submit() {
    if (!form.employee || !form.amount || !form.payroll_month) return setErr("Employee, amount and payroll month are required.");
    setErr("");
    const { error } = await supabase.from("one_time_adjustments").insert({
      employee_code: form.employee.employee_code, employee_name: form.employee.full_name,
      type: form.type, amount: Number(form.amount), reason: form.reason,
      payroll_month: form.payroll_month, status: "Pending",
      submitted_by: "HR", created_at: new Date().toISOString(),
    });
    if (error) return setErr(error.message);
    setMsg("Adjustment submitted for approval.");
    setForm({ ...BLANK, payroll_month: curMonth }); loadAll();
  }

  async function approve(id) {
    const { error } = await supabase.from("one_time_adjustments").update({ status: "Approved", approved_by: role, approved_at: new Date().toISOString() }).eq("id", id);
    if (!error) {
      await supabase.from("audit_logs").insert({ action_type: "adjustment_approved", performed_by: role, details: `Adjustment ${id} approved` }).then(() => {});
      setMsg("Adjustment approved."); loadAll();
    }
  }

  async function reject(id) {
    if (!rejectReason.trim()) return setErr("Rejection reason is required.");
    const { error } = await supabase.from("one_time_adjustments").update({ status: "Rejected", rejection_reason: rejectReason, approved_at: new Date().toISOString() }).eq("id", id);
    if (!error) { setMsg("Adjustment rejected."); setRejectTarget(null); setRejectReason(""); loadAll(); }
    else setErr(error.message);
  }

  const pending = adjustments.filter(a => a.status === "Pending");

  const canApprove = ["Master", "GM"].includes(role);
  const tabs = [
    ["new", "New Adjustment"],
    ["mine", "Submissions"],
    ...(canApprove ? [["queue", `Approval Queue (${pending.length})`]] : []),
  ];

  return (
    <div>
      <PageTitle title="One-Time Adjustments" subtitle="Submit payroll adjustments for HR review and Master approval." />
      {msg && <div className="mb-3 p-3 rounded-xl bg-blue-50 text-blue-700 text-sm">{msg}</div>}
      {err && <div className="mb-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{err}</div>}

      <div className="flex flex-wrap gap-2 mb-4">
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${tab === k ? "bg-slate-950 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{l}</button>
        ))}
      </div>

      {tab === "new" && (
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
          <h2 className="font-bold text-slate-800 mb-4">New Adjustment</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><p className="text-xs text-slate-500 mb-1">Employee *</p><EmpPicker employees={employees} value={form.employee} onChange={v => setForm(f => ({ ...f, employee: v }))} /></div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Adjustment Type *</p>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm">
                {ADJ_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div><p className="text-xs text-slate-500 mb-1">Amount (Rs.) *</p><input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" /></div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Applicable Payroll Month *</p>
              <input type="month" value={form.payroll_month} onChange={e => setForm(f => ({ ...f, payroll_month: e.target.value }))} className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
            </div>
            <div className="md:col-span-2"><p className="text-xs text-slate-500 mb-1">Reason</p><textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} rows={3} placeholder="Reason for adjustment..." className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm resize-none" /></div>
          </div>
          <div className="mt-4 p-3 bg-slate-50 rounded-xl text-xs text-slate-500">
            Submitted adjustments go to the Master approval queue before being applied to payroll.
          </div>
          <div className="mt-3"><Button onClick={submit} className="rounded-2xl">Submit for Approval</Button></div>
        </div>
      )}

      {tab === "mine" && (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
          <div className="px-5 pt-4 pb-2"><h2 className="font-bold text-slate-800">All Adjustments</h2><p className="text-xs text-slate-400">{adjustments.length} total</p></div>
          <table className="w-full min-w-[800px] text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>{["Employee", "Type", "Amount", "Month", "Reason", "Status", "Rejection Reason"].map(h => <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {adjustments.length === 0
                ? <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No adjustments found.</td></tr>
                : adjustments.map(a => (
                  <tr key={a.id}>
                    <td className="px-4 py-3 font-medium">{a.employee_name || a.employee_code}</td>
                    <td className="px-4 py-3"><Badge tone={["Incentive", "Arrears", "Commission"].includes(a.type) ? "green" : "red"}>{a.type}</Badge></td>
                    <td className="px-4 py-3 font-semibold">{money(a.amount)}</td>
                    <td className="px-4 py-3">{a.payroll_month}</td>
                    <td className="px-4 py-3 max-w-[160px] truncate">{a.reason || "—"}</td>
                    <td className="px-4 py-3"><Badge tone={statusTone(a.status)}>{a.status}</Badge></td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{a.rejection_reason || "—"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "queue" && canApprove && (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
          <div className="px-5 pt-4 pb-2"><h2 className="font-bold text-slate-800">Approval Queue</h2><p className="text-xs text-slate-400">{pending.length} pending</p></div>
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>{["Employee", "Type", "Amount", "Month", "Reason", "Submitted", "Status", "Action"].map(h => <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {adjustments.length === 0
                ? <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No adjustments.</td></tr>
                : adjustments.map(a => (
                  <tr key={a.id}>
                    <td className="px-4 py-3 font-medium">{a.employee_name || a.employee_code}</td>
                    <td className="px-4 py-3"><Badge tone={["Incentive", "Arrears", "Commission"].includes(a.type) ? "green" : "red"}>{a.type}</Badge></td>
                    <td className="px-4 py-3 font-semibold">{money(a.amount)}</td>
                    <td className="px-4 py-3">{a.payroll_month}</td>
                    <td className="px-4 py-3 max-w-[140px] truncate">{a.reason || "—"}</td>
                    <td className="px-4 py-3">{a.created_at?.slice(0, 10)}</td>
                    <td className="px-4 py-3"><Badge tone={statusTone(a.status)}>{a.status}</Badge></td>
                    <td className="px-4 py-3">
                      {a.status === "Pending" && (
                        rejectTarget === a.id
                          ? <div className="flex flex-col gap-1 min-w-[200px]">
                              <input value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Rejection reason..." className="px-2 py-1 rounded-xl border border-slate-200 text-xs" />
                              <div className="flex gap-1">
                                <Button onClick={() => reject(a.id)} className="rounded-xl text-xs py-1 px-2">Confirm</Button>
                                <Button variant="outline" onClick={() => setRejectTarget(null)} className="rounded-xl text-xs py-1 px-2">Cancel</Button>
                              </div>
                            </div>
                          : <div className="flex gap-1">
                              <Button onClick={() => approve(a.id)} className="rounded-xl text-xs py-1 px-2">Approve</Button>
                              <Button variant="outline" onClick={() => { setRejectTarget(a.id); setRejectReason(""); }} className="rounded-xl text-xs py-1 px-2">Reject</Button>
                            </div>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
