import React, { useState, useEffect, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../lib/supabaseClient.js";
import { Button, Badge, PageTitle } from "../components/ui.jsx";
import { money, formatMonthYear } from "../utils/format.js";
import { BRANCH_CODE_MAP } from "../constants/branches.js";
import {
  addCashIncentive, fetchCashIncentives, summarizeCashIncentivesByBranch,
  fetchActiveConfidentialIncentives, addConfidentialIncentive, amendConfidentialIncentive,
  removeConfidentialIncentive, fetchConfidentialIncentiveHistory,
} from "../services/payrollControlService.js";

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

const TABS = [
  ["oneoff", "One-Off Bonus"],
  ["active", "Active Incentives"],
  ["add", "Add / Manage"],
  ["history", "History"],
];

// ── One-Off Bonus tab (original Cash Incentives behavior, unchanged) ──
function OneOffTab({ role, actorName, month, setMonth }) {
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
    setRows((incentives || []).filter(r => !r.is_recurring));
  }

  const branchSummary = useMemo(() => summarizeCashIncentivesByBranch(rows), [rows]);
  const total = useMemo(() => rows.reduce((s, r) => s + Number(r.amount || 0), 0), [rows]);

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
      setMsg("One-off bonus recorded.");
      load();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div>
      <div className="mb-4">
        <p className="text-xs text-slate-500 mb-1">Month</p>
        <input type="month" value={month} onChange={e => setMonth(e.target.value)}
          className="px-4 py-2 rounded-xl border border-slate-200 text-sm bg-white" />
      </div>
      {msg && <div className="mb-3 p-3 rounded-xl bg-blue-50 text-blue-700 text-sm">{msg}</div>}
      {err && <div className="mb-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{err}</div>}

      {["Master", "GM"].includes(role) && (
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm mb-6">
          <h2 className="font-bold text-slate-800 mb-3">Give One-Off Bonus</h2>
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
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto overflow-y-clip">
          <div className="px-5 pt-4 pb-2"><h2 className="font-bold text-slate-800">One-Off Bonuses — {month}</h2><p className="text-xs text-slate-400">{rows.length} entries · Total {money(total)}</p></div>
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>{["Employee", "Branch", "Department", "Amount", "Given By", "Notes", "Date"].map(h => <th key={h} className="text-left px-4 py-3 font-medium sticky top-0 z-10 bg-slate-50 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0
                ? <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No one-off bonuses recorded for {month}.</td></tr>
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
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto overflow-y-clip">
          <div className="px-5 pt-4 pb-2"><h2 className="font-bold text-slate-800">One-Off Bonuses — Branch Summary — {month}</h2></div>
          <table className="w-full min-w-[400px] text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr><th className="text-left px-4 py-3 font-medium sticky top-0 z-10 bg-slate-50 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">Branch</th><th className="text-right px-4 py-3 font-medium sticky top-0 z-10 bg-slate-50 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">Total</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {branchSummary.length === 0
                ? <tr><td colSpan={2} className="px-4 py-8 text-center text-slate-400">No bonuses recorded for {month}.</td></tr>
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

// ── Active Incentives tab ──
function ActiveTab({ role, actorName, refreshKey, bump }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [branchFilter, setBranchFilter] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null); // { id, amount, effectiveFrom, reason }
  const [removing, setRemoving] = useState(null); // { id, reason }
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => { load(); }, [refreshKey]);

  async function load() {
    setLoading(true);
    try { setRows(await fetchActiveConfidentialIncentives()); }
    catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }

  const filtered = useMemo(() => rows.filter(r => {
    const bOk = !branchFilter || r.branch === branchFilter;
    const dOk = !deptFilter || (r.department || "").toLowerCase().includes(deptFilter.toLowerCase());
    const sOk = !search || (r.employee_name || "").toLowerCase().includes(search.toLowerCase()) || String(r.employee_code || "").toLowerCase().includes(search.toLowerCase());
    return bOk && dOk && sOk;
  }), [rows, branchFilter, deptFilter, search]);

  const totalAmount = useMemo(() => filtered.reduce((s, r) => s + Number(r.amount || 0), 0), [filtered]);
  const branchTotals = useMemo(() => {
    const acc = {};
    filtered.forEach(r => { acc[r.branch || "Unassigned"] = (acc[r.branch || "Unassigned"] || 0) + Number(r.amount || 0); });
    return Object.entries(acc).map(([branch, total]) => ({ branch, total })).sort((a, b) => a.branch.localeCompare(b.branch));
  }, [filtered]);

  async function saveEdit(r) {
    setErr(""); setMsg("");
    try {
      await amendConfidentialIncentive({
        id: r.id, employeeCode: r.employee_code, employeeName: r.employee_name, branch: r.branch,
        oldAmount: r.amount, newAmount: editing.amount, effectiveFrom: editing.effectiveFrom,
        reason: editing.reason, actionedBy: actorName || role, actionedByRole: role,
      });
      setEditing(null); setMsg("Amount updated."); load(); bump();
    } catch (e) { setErr(e.message); }
  }

  async function confirmRemove(r) {
    setErr(""); setMsg("");
    try {
      await removeConfidentialIncentive({
        id: r.id, employeeCode: r.employee_code, employeeName: r.employee_name, branch: r.branch,
        amount: r.amount, reason: removing.reason, actionedBy: actorName || role, actionedByRole: role,
      });
      setRemoving(null); setMsg("Incentive removed."); load(); bump();
    } catch (e) { setErr(e.message); }
  }

  return (
    <div>
      {msg && <div className="mb-3 p-3 rounded-xl bg-blue-50 text-blue-700 text-sm">{msg}</div>}
      {err && <div className="mb-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{err}</div>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-slate-500">Employees on Incentive</p>
          <p className="text-2xl font-bold">{filtered.length}</p>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-slate-500">Total Monthly Amount</p>
          <p className="text-2xl font-bold text-emerald-600">{money(totalAmount)}</p>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-slate-500">Branches</p>
          <p className="text-2xl font-bold">{branchTotals.length}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name / code…"
          className="px-4 py-2 rounded-xl border border-slate-200 text-sm w-56" />
        <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)}
          className="px-4 py-2 rounded-xl border border-slate-200 text-sm">
          <option value="">All Branches</option>
          {Object.keys(BRANCH_CODE_MAP).map(b => <option key={b}>{b}</option>)}
        </select>
        <input value={deptFilter} onChange={e => setDeptFilter(e.target.value)} placeholder="Department…"
          className="px-4 py-2 rounded-xl border border-slate-200 text-sm w-40" />
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto overflow-y-clip">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>{["Employee Code", "Employee Name", "Branch", "Department", "Monthly Amount", "Effective From", "Added By", "Actions"].map(h => <th key={h} className="text-left px-4 py-3 font-medium sticky top-0 z-10 bg-slate-50 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No active confidential incentives.</td></tr>
            ) : filtered.map(r => (
              <tr key={r.id}>
                <td className="px-4 py-3">{r.employee_code}</td>
                <td className="px-4 py-3 font-medium">{r.employee_name}</td>
                <td className="px-4 py-3">{r.branch || "—"}</td>
                <td className="px-4 py-3">{r.department || "—"}</td>
                <td className="px-4 py-3 font-semibold text-emerald-700">
                  {editing?.id === r.id ? (
                    <input type="number" min="0" value={editing.amount} onChange={e => setEditing(v => ({ ...v, amount: e.target.value }))}
                      className="w-28 px-2 py-1 rounded-lg border border-slate-200 text-sm" />
                  ) : money(r.amount)}
                </td>
                <td className="px-4 py-3">
                  {editing?.id === r.id ? (
                    <input type="date" value={editing.effectiveFrom} onChange={e => setEditing(v => ({ ...v, effectiveFrom: e.target.value }))}
                      className="px-2 py-1 rounded-lg border border-slate-200 text-sm" />
                  ) : formatMonthYear(r.effective_from)}
                </td>
                <td className="px-4 py-3 text-slate-500">{r.given_by} <Badge tone="slate">{r.given_by_role}</Badge></td>
                <td className="px-4 py-3">
                  {removing?.id === r.id ? (
                    <div className="flex flex-col gap-1 min-w-[180px]">
                      <input value={removing.reason} onChange={e => setRemoving(v => ({ ...v, reason: e.target.value }))}
                        placeholder="Reason for removal (required)…" className="px-2 py-1 rounded-lg border border-slate-200 text-xs" />
                      <div className="flex gap-1">
                        <Button onClick={() => confirmRemove(r)} className="rounded-lg text-xs py-1 px-2">Confirm</Button>
                        <Button variant="outline" onClick={() => setRemoving(null)} className="rounded-lg text-xs py-1 px-2">Cancel</Button>
                      </div>
                    </div>
                  ) : editing?.id === r.id ? (
                    <div className="flex flex-col gap-1 min-w-[180px]">
                      <input value={editing.reason} onChange={e => setEditing(v => ({ ...v, reason: e.target.value }))}
                        placeholder="Reason (optional)…" className="px-2 py-1 rounded-lg border border-slate-200 text-xs" />
                      <div className="flex gap-1">
                        <Button onClick={() => saveEdit(r)} className="rounded-lg text-xs py-1 px-2">Save</Button>
                        <Button variant="outline" onClick={() => setEditing(null)} className="rounded-lg text-xs py-1 px-2">Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-1">
                      <Button variant="outline" onClick={() => setEditing({ id: r.id, amount: r.amount, effectiveFrom: r.effective_from, reason: "" })}
                        className="rounded-lg text-xs py-1 px-2">Edit Amount</Button>
                      <Button variant="outline" onClick={() => setRemoving({ id: r.id, reason: "" })}
                        className="rounded-lg text-xs py-1 px-2 text-red-600 border-red-200">Remove</Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {branchTotals.length > 0 && (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto overflow-y-clip mt-4">
          <div className="px-5 pt-4 pb-2"><h2 className="font-bold text-slate-800">Branch-wise Total</h2></div>
          <table className="w-full min-w-[400px] text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr><th className="text-left px-4 py-3 font-medium sticky top-0 z-10 bg-slate-50 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">Branch</th><th className="text-right px-4 py-3 font-medium sticky top-0 z-10 bg-slate-50 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">Total</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {branchTotals.map(b => (
                <tr key={b.branch}><td className="px-4 py-3 font-medium">{b.branch}</td><td className="px-4 py-3 text-right font-semibold">{money(b.total)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Add / Manage tab ──
function AddTab({ role, actorName, bump }) {
  const [employees, setEmployees] = useState([]);
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [amount, setAmount] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    supabase.from("employees").select("employee_code, full_name, branch, department, id").eq("status", "Active")
      .then(({ data }) => setEmployees(data || []));
  }, []);

  async function save() {
    if (!selectedEmp) return setErr("Select an employee.");
    setSaving(true); setErr(""); setMsg("");
    try {
      await addConfidentialIncentive({
        employeeId: selectedEmp.id, employeeCode: selectedEmp.employee_code, employeeName: selectedEmp.full_name,
        branch: selectedEmp.branch, department: selectedEmp.department, amount, effectiveFrom,
        addedBy: actorName || role, addedByRole: role, reason,
      });
      setSelectedEmp(null); setAmount(""); setReason(""); setEffectiveFrom(new Date().toISOString().slice(0, 10));
      setMsg(`Confidential incentive added for ${selectedEmp.full_name}.`);
      bump();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div>
      {msg && <div className="mb-3 p-3 rounded-xl bg-blue-50 text-blue-700 text-sm">{msg}</div>}
      {err && <div className="mb-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{err}</div>}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm max-w-2xl">
        <h2 className="font-bold text-slate-800 mb-4">Add Employee to Confidential Incentive</h2>
        <div className="space-y-4">
          <div>
            <p className="text-xs text-slate-500 mb-1">Employee</p>
            <EmpSearchPicker employees={employees} value={selectedEmp} onChange={setSelectedEmp} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-slate-500 mb-1">Monthly Amount</p>
              <input type="number" min="0" value={amount} onChange={e => setAmount(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Effective From</p>
              <input type="date" value={effectiveFrom} onChange={e => setEffectiveFrom(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
            </div>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">Reason / Notes (optional)</p>
            <input value={reason} onChange={e => setReason(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
          </div>
          <Button onClick={save} disabled={saving} className="rounded-xl">{saving ? "Saving…" : "Save"}</Button>
        </div>
      </div>
    </div>
  );
}

// ── History tab ──
function HistoryTab({ role, refreshKey }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [employee, setEmployee] = useState("");
  const [branch, setBranch] = useState("");
  const [action, setAction] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => { load(); }, [refreshKey]);

  async function load() {
    setLoading(true);
    try { setRows(await fetchConfidentialIncentiveHistory({ employee, branch, action, dateFrom, dateTo })); }
    finally { setLoading(false); }
  }

  function exportExcel() {
    const data = rows.map(r => ({
      Date: r.created_at?.slice(0, 10), Employee: r.employee_name, Code: r.employee_code, Branch: r.branch,
      Action: r.action, "Old Amount": r.old_amount, "New Amount": r.new_amount,
      "Effective From": formatMonthYear(r.effective_from), "Effective To": formatMonthYear(r.effective_to), Reason: r.reason, "Done By": r.actioned_by,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Incentive History");
    XLSX.writeFile(wb, `confidential_incentive_history.xlsx`);
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-4 items-end">
        <input value={employee} onChange={e => setEmployee(e.target.value)} placeholder="Employee name / code…"
          className="px-4 py-2 rounded-xl border border-slate-200 text-sm w-52" />
        <select value={branch} onChange={e => setBranch(e.target.value)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm">
          <option value="">All Branches</option>
          {Object.keys(BRANCH_CODE_MAP).map(b => <option key={b}>{b}</option>)}
        </select>
        <select value={action} onChange={e => setAction(e.target.value)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm">
          <option value="">All Actions</option>
          <option>Added</option><option>Amended</option><option>Removed</option>
        </select>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm" />
        <span className="text-slate-400 text-sm">to</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm" />
        <Button variant="outline" onClick={load} className="rounded-xl">Apply</Button>
        {role === "Master" && <Button variant="outline" onClick={exportExcel} className="rounded-xl">Export to Excel</Button>}
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto overflow-y-clip">
        <table className="w-full min-w-[1000px] text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>{["Date", "Employee", "Action", "Old Amount", "New Amount", "Effective From", "Reason", "Done By"].map(h => <th key={h} className="text-left px-4 py-3 font-medium sticky top-0 z-10 bg-slate-50 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No history records found.</td></tr>
            ) : rows.map(r => (
              <tr key={r.id}>
                <td className="px-4 py-3 text-slate-400 text-xs">{r.created_at?.slice(0, 10)}</td>
                <td className="px-4 py-3 font-medium">{r.employee_name}<div className="text-xs text-slate-400">{r.employee_code}</div></td>
                <td className="px-4 py-3">
                  <Badge tone={r.action === "Added" ? "green" : r.action === "Removed" ? "red" : "blue"}>{r.action}</Badge>
                </td>
                <td className="px-4 py-3">{r.old_amount != null ? money(r.old_amount) : "—"}</td>
                <td className="px-4 py-3">{r.new_amount != null ? money(r.new_amount) : "—"}</td>
                <td className="px-4 py-3">{r.effective_from ? formatMonthYear(r.effective_from) : "—"}</td>
                <td className="px-4 py-3 max-w-[200px] truncate">{r.reason || "—"}</td>
                <td className="px-4 py-3 text-slate-500">{r.actioned_by}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function CashIncentives({ role, actorName, month, setMonth }) {
  const [tab, setTab] = useState("oneoff");
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = () => setRefreshKey(k => k + 1);

  // Strict allowlist rather than blocking HR alone -- this page must never
  // render or fetch confidential_incentives data for any role but Master/GM,
  // even if it's ever reached by something other than the menu.js entry
  // (which already restricts it to roles: ["Master","GM"]).
  if (!["Master", "GM"].includes(role)) {
    return (
      <div>
        <PageTitle title="Confidential Incentives" subtitle="Not available." />
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8 text-center text-amber-700">
          Confidential Incentives is only visible to Master and GM.
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageTitle title="Confidential Incentives" subtitle="Confidential — visible to Master and GM only." />

      <div className="flex flex-wrap gap-2 mb-5">
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${tab === k ? "bg-slate-950 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            {l}
          </button>
        ))}
      </div>

      {tab === "oneoff" && <OneOffTab role={role} actorName={actorName} month={month} setMonth={setMonth} />}
      {tab === "active" && <ActiveTab role={role} actorName={actorName} refreshKey={refreshKey} bump={bump} />}
      {tab === "add" && <AddTab role={role} actorName={actorName} bump={() => { bump(); setTab("active"); }} />}
      {tab === "history" && <HistoryTab role={role} refreshKey={refreshKey} />}
    </div>
  );
}
