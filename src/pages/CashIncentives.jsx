import React, { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { Button, Badge, PageTitle } from "../components/ui.jsx";
import { money } from "../utils/format.js";
import { addCashIncentive, fetchCashIncentives, summarizeCashIncentivesByBranch } from "../services/payrollControlService.js";

function EmpSearchPicker({ employees, value, onChange }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const hits = useMemo(() => {
    const lq = q.trim().toLowerCase();
    const pool = lq ? employees.filter(e => e.full_name?.toLowerCase().includes(lq) || e.employee_code?.toLowerCase().includes(lq)) : employees;
    return pool.slice(0, 10);
  }, [employees, q]);
  return (
    <div className="relative" ref={ref}>
      <input value={value ? `${value.employee_code} — ${value.full_name}` : q}
        onChange={e => { if (value) onChange(null); setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)} placeholder="Search by name or code…"
        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
      {open && (
        <div className="absolute z-30 top-full left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-lg mt-1 max-h-48 overflow-y-auto">
          {value && (
            <button onMouseDown={e => e.preventDefault()} onClick={() => { onChange(null); setQ(""); setOpen(false); }}
              className="w-full text-left px-3 py-2 hover:bg-slate-50 text-xs text-slate-400">— Clear —</button>
          )}
          {hits.map(e => (
            <button key={e.employee_code} onMouseDown={ev => ev.preventDefault()}
              onClick={() => { onChange(e); setQ(""); setOpen(false); }}
              className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm">
              <span className="font-semibold">{e.employee_code}</span> — {e.full_name}
              <span className="text-xs text-slate-400 ml-2">{e.department}</span>
            </button>
          ))}
          {hits.length === 0 && <div className="px-3 py-2 text-sm text-slate-400">No matches</div>}
        </div>
      )}
    </div>
  );
}

export default function CashIncentives({ role, actorName, month, setMonth }) {
  const [employees, setEmployees] = useState([]);
  const [rows, setRows] = useState([]);
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => { load(); }, [month]);

  async function load() {
    const [emps, incentives] = await Promise.all([
      supabase.from("employees").select("employee_code, full_name, branch, department, id").eq("status", "Active"),
      fetchCashIncentives(month),
    ]);
    setEmployees(emps.data || []);
    setRows(incentives);
  }

  const branchSummary = useMemo(() => summarizeCashIncentivesByBranch(rows), [rows]);
  const total = useMemo(() => rows.reduce((s, r) => s + Number(r.amount || 0), 0), [rows]);

  if (role === "HR") {
    return (
      <div>
        <PageTitle title="Cash Incentives" subtitle="Not available." />
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8 text-center text-amber-700">
          Cash Incentives is only visible to Master and GM.
        </div>
      </div>
    );
  }

  async function save() {
    if (!selectedEmp) return setErr("Select an employee.");
    setSaving(true); setErr(""); setMsg("");
    try {
      await addCashIncentive({
        employeeId: selectedEmp.id, employeeCode: selectedEmp.employee_code, employeeName: selectedEmp.full_name,
        branch: selectedEmp.branch, department: selectedEmp.department, amount, month,
        givenBy: actorName || role, givenByRole: role, notes,
      });
      setSelectedEmp(null); setAmount(""); setNotes("");
      setMsg("Cash incentive recorded.");
      load();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div>
      <PageTitle title="Cash Incentives" subtitle="Confidential — visible to Master and GM only." />
      <div className="mb-4">
        <p className="text-xs text-slate-500 mb-1">Month</p>
        <input type="month" value={month} onChange={e => setMonth(e.target.value)}
          className="px-4 py-2 rounded-xl border border-slate-200 text-sm bg-white" />
      </div>
      {msg && <div className="mb-3 p-3 rounded-xl bg-blue-50 text-blue-700 text-sm">{msg}</div>}
      {err && <div className="mb-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{err}</div>}

      {["Master", "GM"].includes(role) && (
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm mb-6">
          <h2 className="font-bold text-slate-800 mb-3">Give Cash Incentive</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div className="md:col-span-2">
              <p className="text-xs text-slate-500 mb-1">Employee</p>
              <EmpSearchPicker employees={employees} value={selectedEmp} onChange={setSelectedEmp} />
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Amount</p>
              <input type="number" min="0" value={amount} onChange={e => setAmount(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Given By</p>
              <div className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-slate-50 text-slate-500">{actorName || role}</div>
            </div>
            <div className="md:col-span-3">
              <p className="text-xs text-slate-500 mb-1">Notes (optional)</p>
              <input value={notes} onChange={e => setNotes(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
            </div>
            <Button onClick={save} disabled={saving} className="rounded-xl">{saving ? "Saving…" : "Save"}</Button>
          </div>
        </div>
      )}

      {["Master", "GM"].includes(role) ? (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
          <div className="px-5 pt-4 pb-2"><h2 className="font-bold text-slate-800">Cash Incentives — {month}</h2><p className="text-xs text-slate-400">{rows.length} entries · Total {money(total)}</p></div>
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>{["Employee", "Branch", "Department", "Amount", "Given By", "Notes", "Date"].map(h => <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0
                ? <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No cash incentives recorded for {month}.</td></tr>
                : rows.map(r => (
                  <tr key={r.id}>
                    <td className="px-4 py-3 font-medium">{r.employee_name}<div className="text-xs text-slate-400">{r.employee_code}</div></td>
                    <td className="px-4 py-3">{r.branch || "—"}</td>
                    <td className="px-4 py-3">{r.department || "—"}</td>
                    <td className="px-4 py-3 font-semibold text-emerald-700">{money(r.amount)}</td>
                    <td className="px-4 py-3 text-slate-500">{r.given_by} <Badge tone="slate">{r.given_by_role}</Badge></td>
                    <td className="px-4 py-3 max-w-[160px] truncate text-slate-500">{r.notes || "—"}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{r.created_at?.slice(0, 10)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : (
        // Finance: branch-wise total only, no employee-level detail.
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
          <div className="px-5 pt-4 pb-2"><h2 className="font-bold text-slate-800">Cash Incentives — Branch Summary — {month}</h2></div>
          <table className="w-full min-w-[400px] text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr><th className="text-left px-4 py-3 font-medium">Branch</th><th className="text-right px-4 py-3 font-medium">Total Cash Incentives</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {branchSummary.length === 0
                ? <tr><td colSpan={2} className="px-4 py-8 text-center text-slate-400">No cash incentives recorded for {month}.</td></tr>
                : branchSummary.map(b => (
                  <tr key={b.branch}><td className="px-4 py-3 font-medium">{b.branch}</td><td className="px-4 py-3 text-right font-semibold">{money(b.total)}</td></tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
