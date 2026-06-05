import React, { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { Button, Badge, PageTitle } from "../components/ui.jsx";
import { BRANCH_CODE_MAP } from "../constants/branches.js";

const BRANCHES = Object.keys(BRANCH_CODE_MAP);

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
              <span className="text-xs text-slate-400 ml-2">{e.branch}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const STATUS_TONES = { Pending: "yellow", Approved: "green", Rejected: "red", Completed: "blue" };
let nextId = 1;

export default function BranchTransfer() {
  const [employees, setEmployees] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [tab, setTab] = useState("new");
  const [form, setForm] = useState({ employee: null, toBranch: "", effectiveDate: new Date().toISOString().slice(0, 10), reason: "" });
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterBranch, setFilterBranch] = useState("All");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    supabase.from("employees").select("employee_code, full_name, department, branch, staff_level, salary").order("full_name")
      .then(({ data }) => setEmployees(data || []));
  }, []);

  function submitTransfer() {
    if (!form.employee) return setErr("Select an employee.");
    if (!form.toBranch) return setErr("Select destination branch.");
    if (form.employee.branch === form.toBranch) return setErr("Source and destination branches must differ.");
    setErr("");
    setTransfers(prev => [...prev, {
      id: nextId++,
      employee_code: form.employee.employee_code,
      employee_name: form.employee.full_name,
      department: form.employee.department,
      from_branch: form.employee.branch,
      to_branch: form.toBranch,
      effective_date: form.effectiveDate,
      reason: form.reason,
      status: "Pending",
      requested_at: new Date().toISOString().slice(0, 10),
    }]);
    setMsg(`Transfer request submitted for ${form.employee.full_name}: ${form.employee.branch} → ${form.toBranch}`);
    setForm({ employee: null, toBranch: "", effectiveDate: new Date().toISOString().slice(0, 10), reason: "" });
    setTab("history");
  }

  function updateStatus(id, status) {
    setTransfers(prev => prev.map(t => t.id === id ? { ...t, status } : t));
    if (status === "Completed") {
      setTransfers(prev => prev.map(t => {
        if (t.id === id) {
          setEmployees(emps => emps.map(e => e.employee_code === t.employee_code ? { ...e, branch: t.to_branch } : e));
        }
        return t;
      }));
    }
  }

  const filtered = useMemo(() => transfers.filter(t => {
    const statusOk = filterStatus === "All" || t.status === filterStatus;
    const branchOk = filterBranch === "All" || t.from_branch === filterBranch || t.to_branch === filterBranch;
    return statusOk && branchOk;
  }), [transfers, filterStatus, filterBranch]);

  const pending = transfers.filter(t => t.status === "Pending");

  return (
    <div>
      <PageTitle title="Branch Transfers" subtitle="Manage employee transfers between branches."
        action={pending.length > 0 ? <Badge tone="yellow">{pending.length} pending</Badge> : null} />

      {msg && <div className="mb-3 p-3 rounded-xl bg-blue-50 text-blue-700 text-sm">{msg}</div>}
      {err && <div className="mb-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{err}</div>}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        {[
          ["Total Transfers", transfers.length, "slate"],
          ["Pending", transfers.filter(t => t.status === "Pending").length, "yellow"],
          ["Approved", transfers.filter(t => t.status === "Approved" || t.status === "Completed").length, "green"],
          ["Rejected", transfers.filter(t => t.status === "Rejected").length, "red"],
        ].map(([label, val, tone]) => (
          <div key={label} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="text-2xl font-bold">{val}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {[["new", "New Transfer"], ["history", "Transfer History"], ["pending", "Pending Approval"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${tab === k ? "bg-slate-950 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            {l} {k === "pending" && pending.length > 0 ? `(${pending.length})` : ""}
          </button>
        ))}
      </div>

      {/* New Transfer Form */}
      {tab === "new" && (
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
          <h2 className="font-bold text-slate-800 mb-4">Transfer Request</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <p className="text-xs text-slate-500 mb-1">Employee</p>
              <EmpPicker employees={employees} value={form.employee}
                onChange={v => setForm(f => ({ ...f, employee: v }))} />
              {form.employee && (
                <p className="text-xs text-slate-400 mt-1">
                  Current branch: <strong>{form.employee.branch}</strong> · Dept: {form.employee.department}
                </p>
              )}
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">From Branch</p>
              <input value={form.employee?.branch || "—"} readOnly className="w-full px-4 py-2 rounded-xl border border-slate-100 bg-slate-50 text-sm text-slate-400" />
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">To Branch</p>
              <select value={form.toBranch} onChange={e => setForm(f => ({ ...f, toBranch: e.target.value }))}
                className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm">
                <option value="">Select branch...</option>
                {BRANCHES.filter(b => b !== form.employee?.branch).map(b => <option key={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Effective Date</p>
              <input type="date" value={form.effectiveDate} onChange={e => setForm(f => ({ ...f, effectiveDate: e.target.value }))}
                className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Reason</p>
              <input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="Business need, request, restructuring..." className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={submitTransfer} className="rounded-2xl">Submit Transfer</Button>
            <Button variant="outline" onClick={() => setForm({ employee: null, toBranch: "", effectiveDate: new Date().toISOString().slice(0, 10), reason: "" })}
              className="rounded-2xl">Clear</Button>
          </div>
        </div>
      )}

      {/* History Tab */}
      {tab === "history" && (
        <div>
          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm mb-4">
            <div className="flex flex-wrap gap-3">
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm">
                <option value="All">All Status</option>
                {Object.keys(STATUS_TONES).map(s => <option key={s}>{s}</option>)}
              </select>
              <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm">
                <option value="All">All Branches</option>
                {BRANCHES.map(b => <option key={b}>{b}</option>)}
              </select>
            </div>
          </div>
          <TransferTable transfers={filtered} onUpdateStatus={updateStatus} />
        </div>
      )}

      {/* Pending Approval Tab */}
      {tab === "pending" && (
        <div>
          {pending.length === 0
            ? <div className="bg-white border border-slate-100 rounded-2xl p-8 text-center text-slate-400 shadow-sm">No pending transfers.</div>
            : <TransferTable transfers={pending} onUpdateStatus={updateStatus} showActions />
          }
        </div>
      )}
    </div>
  );
}

function TransferTable({ transfers, onUpdateStatus, showActions }) {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
      <div className="px-5 pt-4 pb-2">
        <h2 className="font-bold text-slate-800">Transfer Records</h2>
        <p className="text-xs text-slate-400 mt-0.5">{transfers.length} records</p>
      </div>
      <table className="w-full min-w-[800px] text-sm">
        <thead className="bg-slate-50 text-slate-500">
          <tr>{["Employee", "Dept", "From", "To", "Effective Date", "Reason", "Status", "Actions"].map(h => (
            <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
          ))}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {transfers.length === 0
            ? <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No records found.</td></tr>
            : transfers.map(t => (
              <tr key={t.id}>
                <td className="px-4 py-3">
                  <div className="font-medium">{t.employee_name}</div>
                  <div className="text-xs text-slate-400">{t.employee_code}</div>
                </td>
                <td className="px-4 py-3 text-slate-500">{t.department}</td>
                <td className="px-4 py-3"><Badge tone="slate">{t.from_branch}</Badge></td>
                <td className="px-4 py-3"><Badge tone="blue">{t.to_branch}</Badge></td>
                <td className="px-4 py-3">{t.effective_date}</td>
                <td className="px-4 py-3 max-w-[150px] truncate text-slate-500">{t.reason || "—"}</td>
                <td className="px-4 py-3"><Badge tone={STATUS_TONES[t.status]}>{t.status}</Badge></td>
                <td className="px-4 py-3">
                  {t.status === "Pending" && (
                    <div className="flex gap-1">
                      <button onClick={() => onUpdateStatus(t.id, "Approved")}
                        className="px-2 py-1 rounded-lg bg-emerald-100 text-emerald-700 text-xs font-medium hover:bg-emerald-200">Approve</button>
                      <button onClick={() => onUpdateStatus(t.id, "Rejected")}
                        className="px-2 py-1 rounded-lg bg-red-100 text-red-700 text-xs font-medium hover:bg-red-200">Reject</button>
                    </div>
                  )}
                  {t.status === "Approved" && (
                    <button onClick={() => onUpdateStatus(t.id, "Completed")}
                      className="px-2 py-1 rounded-lg bg-blue-100 text-blue-700 text-xs font-medium hover:bg-blue-200">Mark Complete</button>
                  )}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
