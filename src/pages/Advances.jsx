import React, { useState, useEffect, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../lib/supabaseClient.js";
import { Button, Badge, PageTitle } from "../components/ui.jsx";
import { money, formatMonthYear } from "../utils/format.js";
import { BRANCH_CODE_MAP } from "../constants/branches.js";
import {
  fetchAdvances, fetchActiveEmployeesForPicker, requestAdvance, updateAdvanceRequest,
  approveAdvance, rejectAdvance, issueAdvance, importHistoricalAdvances, bulkRequestAdvances,
} from "../services/advanceService.js";

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function excelDateToMonth(v) {
  if (!v) return "";
  if (typeof v === "string") {
    const t = v.trim();
    const m = t.match(/^(\d{4})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}`;
    return t;
  }
  const d = new Date((v - 25569) * 86400 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

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
              <span className="text-xs text-slate-400 ml-2">{e.department} · {money(e.salary)}/mo</span>
            </button>
          ))}
          {hits.length === 0 && <div className="px-3 py-2 text-sm text-slate-400">No matches</div>}
        </div>
      )}
    </div>
  );
}

const statusTone = s => ({ Pending: "blue", Approved: "purple", Issued: "green", Rejected: "red", Deducted: "slate" }[s] || "slate");

function issuedCellClass(a) {
  if (!["Issued", "Deducted"].includes(a.status)) return "text-slate-300";
  const iss = Number(a.issued_amount), app = Number(a.approved_amount);
  if (iss === app) return "text-emerald-700 font-semibold";
  if (iss > app) return "text-red-600 font-semibold";
  return "text-amber-600 font-semibold";
}
function issuedIcon(a) {
  if (!["Issued", "Deducted"].includes(a.status)) return "";
  const iss = Number(a.issued_amount), app = Number(a.approved_amount);
  if (iss === app) return " ✅";
  if (iss > app) return " ❌";
  return " ⚠️";
}

// ─── Row actions shared by the "All Advances" and "Pending Approval" tables ───
function RowActions({ a, canApprove, canEditRequest, actorName, role, onChanged, setErr, setMsg }) {
  const [mode, setMode] = useState(null); // "approve" | "issue" | "reject" | "edit"
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [editMonth, setEditMonth] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const canEditThisRow = canEditRequest && a.status === "Pending";

  if (!canApprove && !canEditThisRow) {
    if (a.status === "Rejected" && a.rejection_reason) return <span className="text-xs text-red-500">{a.rejection_reason}</span>;
    return <span className="text-slate-300 text-xs">—</span>;
  }

  async function doEdit() {
    setBusy(true); setErr(""); setMsg("");
    try {
      await updateAdvanceRequest({ id: a.id, employeeCode: a.employee_code, requestedAmount: amount, advanceMonth: editMonth, notes: editNotes, actedBy: actorName });
      setMsg(`Advance request updated for ${a.employee_name}.`); setMode(null); onChanged();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }
  async function doApprove() {
    setBusy(true); setErr(""); setMsg("");
    try {
      await approveAdvance({ id: a.id, requestedAmount: a.requested_amount, approvedAmount: amount, approvedBy: actorName, employeeName: a.employee_name, actorRole: role });
      setMsg(`Advance approved for ${a.employee_name}.`); setMode(null); onChanged();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }
  async function doIssue() {
    setBusy(true); setErr(""); setMsg("");
    try {
      await issueAdvance({ id: a.id, approvedAmount: a.approved_amount, issuedAmount: amount, previousIssuedAmount: a.issued_amount, issuedBy: actorName, employeeName: a.employee_name, actorRole: role });
      setMsg(`Advance issued to ${a.employee_name}.`); setMode(null); onChanged();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }
  async function doReject() {
    setBusy(true); setErr(""); setMsg("");
    try {
      await rejectAdvance({ id: a.id, reason, actedBy: actorName, actorRole: role, employeeName: a.employee_name });
      setMsg("Advance request rejected."); setMode(null); onChanged();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  if (mode === "edit") return (
    <div className="flex flex-col gap-1 min-w-[160px]">
      <input type="number" min="0" value={amount} onChange={e => setAmount(e.target.value)}
        placeholder="Requested amount" className="px-2 py-1 rounded-lg border border-slate-200 text-xs" />
      <input type="month" value={editMonth} onChange={e => setEditMonth(e.target.value)}
        className="px-2 py-1 rounded-lg border border-slate-200 text-xs" />
      <input value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="Notes (optional)"
        className="px-2 py-1 rounded-lg border border-slate-200 text-xs" />
      <div className="flex gap-1">
        <Button onClick={doEdit} disabled={busy} className="rounded-lg text-xs py-1 px-2">Save</Button>
        <Button variant="outline" onClick={() => setMode(null)} className="rounded-lg text-xs py-1 px-2">Cancel</Button>
      </div>
    </div>
  );
  if (mode === "approve") return (
    <div className="flex flex-col gap-1 min-w-[160px]">
      <input type="number" min="0" max={a.requested_amount} value={amount} onChange={e => setAmount(e.target.value)}
        placeholder={`Max ${money(a.requested_amount)}`} className="px-2 py-1 rounded-lg border border-slate-200 text-xs" />
      <div className="flex gap-1">
        <Button onClick={doApprove} disabled={busy} className="rounded-lg text-xs py-1 px-2">Confirm</Button>
        <Button variant="outline" onClick={() => setMode(null)} className="rounded-lg text-xs py-1 px-2">Cancel</Button>
      </div>
    </div>
  );
  if (mode === "issue") return (
    <div className="flex flex-col gap-1 min-w-[160px]">
      <input type="number" min={a.issued_amount || 0} max={a.approved_amount} value={amount} onChange={e => setAmount(e.target.value)}
        placeholder={`Max ${money(a.approved_amount)}`} className="px-2 py-1 rounded-lg border border-slate-200 text-xs" />
      {Number(a.issued_amount) > 0 && <p className="text-[10px] text-slate-400">{money(a.issued_amount)} already given — enter the new running total, not just the top-up.</p>}
      <div className="flex gap-1">
        <Button onClick={doIssue} disabled={busy} className="rounded-lg text-xs py-1 px-2">Confirm</Button>
        <Button variant="outline" onClick={() => setMode(null)} className="rounded-lg text-xs py-1 px-2">Cancel</Button>
      </div>
    </div>
  );
  if (mode === "reject") return (
    <div className="flex flex-col gap-1 min-w-[160px]">
      <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (required)…"
        className="px-2 py-1 rounded-lg border border-slate-200 text-xs" />
      <div className="flex gap-1">
        <Button onClick={doReject} disabled={busy} className="rounded-lg text-xs py-1 px-2">Confirm</Button>
        <Button variant="outline" onClick={() => setMode(null)} className="rounded-lg text-xs py-1 px-2">Cancel</Button>
      </div>
    </div>
  );

  if (a.status === "Pending") return (
    <div className="flex gap-1">
      {canEditThisRow && (
        <Button variant="outline" onClick={() => { setMode("edit"); setAmount(a.requested_amount); setEditMonth(a.advance_month || ""); setEditNotes(a.notes || ""); }}
          className="rounded-lg text-xs py-1 px-2">Edit</Button>
      )}
      {canApprove && (
        <>
          <Button onClick={() => { setMode("approve"); setAmount(a.requested_amount); }} className="rounded-lg text-xs py-1 px-2">Approve</Button>
          <Button variant="outline" onClick={() => { setMode("reject"); setReason(""); }} className="rounded-lg text-xs py-1 px-2 text-red-600 border-red-200">Reject</Button>
        </>
      )}
    </div>
  );
  if (a.status === "Approved") return (
    <Button onClick={() => { setMode("issue"); setAmount(a.approved_amount); }} className="rounded-lg text-xs py-1 px-2">Mark as Issued</Button>
  );
  if (a.status === "Issued" && canApprove) {
    const remaining = Number(a.approved_amount || 0) - Number(a.issued_amount || 0);
    if (remaining > 0) return (
      <Button onClick={() => { setMode("issue"); setAmount(a.approved_amount); }} className="rounded-lg text-xs py-1 px-2">
        Issue Remaining ({money(remaining)})
      </Button>
    );
  }
  if (a.status === "Rejected" && a.rejection_reason) return <span className="text-xs text-red-500">{a.rejection_reason}</span>;
  return <span className="text-slate-300 text-xs">—</span>;
}

// ─── Tab 1: All Advances ──────────────────────────────────────────────────
function AllAdvancesTab({ advances, employees, role, actorName, canRequest, canApprove, reload, setMsg, setErr, onPrint, onPrintBatch }) {
  const [showForm, setShowForm] = useState(false);
  const [empPick, setEmpPick] = useState(null);
  const [reqAmount, setReqAmount] = useState("");
  const [advMonth, setAdvMonth] = useState(currentMonth());
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const [branchFilter, setBranchFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState(currentMonth());
  const [statusFilter, setStatusFilter] = useState("All");
  const [deptFilter, setDeptFilter] = useState("");
  const [search, setSearch] = useState("");
  const [batchFrom, setBatchFrom] = useState(new Date().toISOString().slice(0, 10));
  const [batchTo, setBatchTo] = useState(new Date().toISOString().slice(0, 10));
  const [toggledMonths, setToggledMonths] = useState(() => new Set());

  // Bulk approve/issue: only available to Finance, and only meaningful once
  // the list is filtered down to a single actionable status -- Approve only
  // applies to Pending rows, Issue only to Approved rows, so tying bulk mode
  // to the status filter avoids ambiguity over mixed-status selections.
  const bulkMode = canApprove && statusFilter === "Pending" ? "approve" : canApprove && statusFilter === "Approved" ? "issue" : null;
  const [selected, setSelected] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  useEffect(() => { setSelected(new Set()); }, [bulkMode, branchFilter, monthFilter, deptFilter, search]);

  const filtered = useMemo(() => advances.filter(a => {
    if (branchFilter && a.branch !== branchFilter) return false;
    if (monthFilter && a.advance_month !== monthFilter) return false;
    if (statusFilter !== "All" && a.status !== statusFilter) return false;
    if (deptFilter && !(a.department || "").toLowerCase().includes(deptFilter.toLowerCase())) return false;
    if (search) {
      const lq = search.toLowerCase();
      if (!(a.employee_name || "").toLowerCase().includes(lq) && !(a.employee_code || "").toLowerCase().includes(lq)) return false;
    }
    return true;
  }), [advances, branchFilter, monthFilter, statusFilter, deptFilter, search]);

  // Group the ledger by advance month, newest first, so a long history
  // reads as a stack of drop-downs instead of one giant table.
  const monthGroups = useMemo(() => {
    const map = new Map();
    filtered.forEach(a => {
      const key = a.advance_month || "—";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(a);
    });
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([month, rows]) => ({
        month, rows,
        requested: rows.reduce((s, a) => s + Number(a.requested_amount || 0), 0),
        approved: rows.reduce((s, a) => s + Number(a.approved_amount || 0), 0),
        issued: rows.reduce((s, a) => s + Number(a.issued_amount || 0), 0),
        pending: rows.filter(a => a.status === "Pending").length,
      }));
  }, [filtered]);

  // Open by default: the current month, and whichever month sorts first
  // (covers the case where there's no current-month data at all). Clicking
  // a header just flips that month out of its default state.
  function isMonthOpen(month, idx) {
    const defaultOpen = month === currentMonth() || idx === 0;
    return toggledMonths.has(month) ? !defaultOpen : defaultOpen;
  }
  function toggleMonth(month) {
    setToggledMonths(prev => {
      const next = new Set(prev);
      next.has(month) ? next.delete(month) : next.add(month);
      return next;
    });
  }

  async function submit() {
    setErr(""); setMsg("");
    setSaving(true);
    try {
      await requestAdvance({ employee: empPick, requestedAmount: reqAmount, advanceMonth: advMonth, notes, requestedBy: actorName });
      setMsg("Advance request submitted for Finance approval.");
      setEmpPick(null); setReqAmount(""); setNotes(""); setShowForm(false);
      reload();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  }

  function toggleSelectOne(id) {
    setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }
  function toggleSelectAll() {
    setSelected(prev => (prev.size === filtered.length && filtered.length > 0) ? new Set() : new Set(filtered.map(a => a.id)));
  }

  async function bulkAct() {
    if (!bulkMode || selected.size === 0) return;
    setBulkBusy(true); setErr(""); setMsg("");
    let ok = 0, fail = 0; const errors = [];
    for (const a of filtered.filter(r => selected.has(r.id))) {
      try {
        if (bulkMode === "approve") {
          await approveAdvance({ id: a.id, requestedAmount: a.requested_amount, approvedAmount: a.requested_amount, approvedBy: actorName, employeeName: a.employee_name, actorRole: role });
        } else {
          await issueAdvance({ id: a.id, approvedAmount: a.approved_amount, issuedAmount: a.approved_amount, issuedBy: actorName, employeeName: a.employee_name, actorRole: role });
        }
        ok++;
      } catch (e) { fail++; errors.push(`${a.employee_code}: ${e.message}`); }
    }
    setBulkBusy(false); setSelected(new Set());
    const verb = bulkMode === "approve" ? "Approved" : "Issued";
    setMsg(`${verb} ${ok} of ${ok + fail} selected advance${ok + fail === 1 ? "" : "s"} (at full ${bulkMode === "approve" ? "requested" : "approved"} amount)${fail ? ` — ${fail} failed` : ""}.`);
    if (errors.length) setErr(errors.slice(0, 10).join(" | "));
    reload();
  }

  function exportExcel() {
    const data = filtered.map((a, i) => ({
      "S.No": i + 1, Branch: a.branch, "Employee Code": a.employee_code, Name: a.employee_name, Department: a.department,
      Requested: a.requested_amount, Approved: a.approved_amount, Issued: a.issued_amount,
      Excess: a.excess_amount || (a.issued_amount > a.approved_amount ? a.issued_amount - a.approved_amount : 0),
      Status: a.status, Month: a.advance_month,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Advances");
    XLSX.writeFile(wb, "advances.xlsx");
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-4">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name / code…"
          className="px-4 py-2 rounded-xl border border-slate-200 text-sm w-52" />
        <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm">
          <option value="">All Branches</option>
          {Object.keys(BRANCH_CODE_MAP).map(b => <option key={b}>{b}</option>)}
        </select>
        <input type="month" value={monthFilter} onChange={e => setMonthFilter(e.target.value)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm" />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm">
          <option value="All">All Status</option>
          {["Pending", "Approved", "Issued", "Rejected", "Deducted"].map(s => <option key={s}>{s}</option>)}
        </select>
        <input value={deptFilter} onChange={e => setDeptFilter(e.target.value)} placeholder="Department…"
          className="px-4 py-2 rounded-xl border border-slate-200 text-sm w-40" />
        <Button variant="outline" onClick={exportExcel} className="rounded-xl">Export to Excel</Button>
      </div>

      {canRequest && (
        <div className="mb-4">
          <Button onClick={() => setShowForm(s => !s)} className="rounded-2xl">{showForm ? "Cancel" : "+ Request Advance"}</Button>
        </div>
      )}

      {showForm && canRequest && (
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm mb-4">
          <h2 className="font-bold text-slate-800 mb-4">New Advance Request</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <p className="text-xs text-slate-500 mb-1">Employee *</p>
              <EmpSearchPicker employees={employees} value={empPick} onChange={setEmpPick} />
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Advance Month *</p>
              <input type="month" value={advMonth} onChange={e => setAdvMonth(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Requested Amount (Rs.) *</p>
              <input type="number" min="0" value={reqAmount} onChange={e => setReqAmount(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
            </div>
            <div className="md:col-span-2">
              <p className="text-xs text-slate-500 mb-1">Notes (optional)</p>
              <input value={notes} onChange={e => setNotes(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={submit} disabled={saving} className="rounded-2xl">{saving ? "Submitting…" : "Submit Request"}</Button>
            <Button variant="outline" onClick={() => setShowForm(false)} className="rounded-2xl">Cancel</Button>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm mb-4 flex flex-wrap items-center gap-3">
        <p className="text-xs text-slate-500">Print every advance requested/uploaded within a date range as a single combined slip — one signature block instead of one printout per employee.</p>
        <div className="flex items-center gap-2">
          <input type="date" value={batchFrom} onChange={e => setBatchFrom(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 text-sm" />
          <span className="text-xs text-slate-400">to</span>
          <input type="date" value={batchTo} onChange={e => setBatchTo(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 text-sm" />
        </div>
        <Button variant="outline" onClick={() => onPrintBatch({ from: batchFrom, to: batchTo })} className="rounded-xl text-sm">🖨️ Print Combined Slip for this Range</Button>
      </div>

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold text-slate-800">Advance Ledger</h2>
        <div className="flex items-center gap-3">
          {bulkMode && selected.size > 0 && (
            <Button onClick={bulkAct} disabled={bulkBusy} className="rounded-xl text-sm">
              {bulkBusy ? (bulkMode === "approve" ? "Approving…" : "Issuing…") : `${bulkMode === "approve" ? "Approve" : "Issue"} Selected (${selected.size}) — full amount`}
            </Button>
          )}
          <p className="text-xs text-slate-400">{filtered.length} records across {monthGroups.length} month{monthGroups.length === 1 ? "" : "s"}</p>
        </div>
      </div>
      {bulkMode && (
        <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
          <input type="checkbox" checked={filtered.length > 0 && selected.size === filtered.length} onChange={toggleSelectAll} />
          <span>Select all {filtered.length} {statusFilter.toLowerCase()} record{filtered.length === 1 ? "" : "s"} across all months shown</span>
        </div>
      )}

      {monthGroups.length === 0 && (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm px-4 py-8 text-center text-slate-400 text-sm">No advance records found.</div>
      )}

      {monthGroups.map((g, idx) => {
        const open = isMonthOpen(g.month, idx);
        return (
          <div key={g.month} className="bg-white border border-slate-100 rounded-2xl shadow-sm mb-3 overflow-hidden">
            <button onClick={() => toggleMonth(g.month)} className="w-full flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-left hover:bg-slate-50">
              <div className="flex items-center gap-3">
                <span className={`inline-block text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
                <span className="font-bold text-slate-800">{g.month !== "—" ? formatMonthYear(`${g.month}-01`) : "No Month"}</span>
                <span className="text-xs text-slate-400">{g.rows.length} record{g.rows.length === 1 ? "" : "s"}</span>
                {g.pending > 0 && <Badge tone="blue">{g.pending} pending</Badge>}
              </div>
              <div className="flex gap-4 text-xs text-slate-500">
                <span>Requested {money(g.requested)}</span>
                <span>Approved {money(g.approved)}</span>
                <span className="text-emerald-600 font-semibold">Issued {money(g.issued)}</span>
              </div>
            </button>
            {open && (
              <div className="overflow-x-auto border-t border-slate-100 overflow-y-auto max-h-[60vh]">
                <table className="w-full min-w-[1100px] text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      {bulkMode && (
                        <th className="text-left px-4 py-3 font-medium sticky top-0 z-10 bg-slate-50 shadow-[0_1px_3px_rgba(0,0,0,0.08)] w-8">
                          <input type="checkbox" checked={g.rows.length > 0 && g.rows.every(r => selected.has(r.id))}
                            onChange={() => setSelected(prev => {
                              const next = new Set(prev);
                              const allOn = g.rows.every(r => next.has(r.id));
                              g.rows.forEach(r => allOn ? next.delete(r.id) : next.add(r.id));
                              return next;
                            })} />
                        </th>
                      )}
                      {["S.No", "Branch", "Employee Code", "Name", "Department", "Requested", "Approved", "Issued", "Excess", "Status", "Actions"].map(h => <th key={h} className="text-left px-4 py-3 font-medium sticky top-0 z-10 bg-slate-50 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {g.rows.map((a, i) => {
                      const excess = a.excess_amount || (a.issued_amount > a.approved_amount ? a.issued_amount - a.approved_amount : 0);
                      return (
                        <tr key={a.id} className="hover:bg-slate-50">
                          {bulkMode && (
                            <td className="px-4 py-3"><input type="checkbox" checked={selected.has(a.id)} onChange={() => toggleSelectOne(a.id)} /></td>
                          )}
                          <td className="px-4 py-3 text-slate-400">{i + 1}</td>
                          <td className="px-4 py-3">{a.branch || "—"}</td>
                          <td className="px-4 py-3">{a.employee_code}</td>
                          <td className="px-4 py-3 font-medium">{a.employee_name}</td>
                          <td className="px-4 py-3">{a.department || "—"}</td>
                          <td className="px-4 py-3">{money(a.requested_amount)}</td>
                          <td className="px-4 py-3">{a.approved_amount ? money(a.approved_amount) : "—"}</td>
                          <td className={`px-4 py-3 ${issuedCellClass(a)}`}>{a.issued_amount ? money(a.issued_amount) : "—"}{issuedIcon(a)}</td>
                          <td className="px-4 py-3">{excess > 0 ? <span className="text-red-600 font-semibold">{money(excess)}</span> : "—"}</td>
                          <td className="px-4 py-3"><Badge tone={statusTone(a.status)}>{a.status}</Badge></td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1 items-center">
                              {a.status !== "Pending" && a.status !== "Rejected" && (
                                <Button variant="outline" onClick={() => onPrint(a)} className="rounded-lg text-xs py-1 px-2" title="Print approval slip">🖨️</Button>
                              )}
                              <RowActions a={a} canApprove={canApprove} canEditRequest={canRequest} actorName={actorName} role={role} onChanged={reload} setErr={setErr} setMsg={setMsg} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Tab 2: Pending Approval (Finance) ────────────────────────────────────
function PendingApprovalTab({ advances, actorName, role, reload, setMsg, setErr }) {
  const pending = useMemo(() => advances.filter(a => a.status === "Pending"), [advances]);
  const [selected, setSelected] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => { setSelected(new Set()); }, [pending.length]);

  function toggleOne(id) {
    setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }
  function toggleAll() {
    setSelected(prev => (prev.size === pending.length && pending.length > 0) ? new Set() : new Set(pending.map(a => a.id)));
  }

  async function approveSelected() {
    if (selected.size === 0) return;
    setBulkBusy(true); setErr(""); setMsg("");
    let ok = 0, fail = 0; const errors = [];
    for (const a of pending.filter(r => selected.has(r.id))) {
      try {
        await approveAdvance({ id: a.id, requestedAmount: a.requested_amount, approvedAmount: a.requested_amount, approvedBy: actorName, employeeName: a.employee_name, actorRole: role });
        ok++;
      } catch (e) { fail++; errors.push(`${a.employee_code}: ${e.message}`); }
    }
    setBulkBusy(false); setSelected(new Set());
    setMsg(`Approved ${ok} of ${ok + fail} selected request${ok + fail === 1 ? "" : "s"} (at full requested amount)${fail ? ` — ${fail} failed` : ""}.`);
    if (errors.length) setErr(errors.slice(0, 10).join(" | "));
    reload();
  }

  const allSelected = pending.length > 0 && selected.size === pending.length;

  return (
    <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto overflow-y-auto max-h-[70vh]">
      <div className="px-5 pt-4 pb-2 flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="font-bold text-slate-800">Pending Approval</h2><p className="text-xs text-slate-400">{pending.length} awaiting Finance decision</p></div>
        {selected.size > 0 && (
          <Button onClick={approveSelected} disabled={bulkBusy} className="rounded-xl text-sm">
            {bulkBusy ? "Approving…" : `Approve Selected (${selected.size}) — full amount`}
          </Button>
        )}
      </div>
      <table className="w-full min-w-[900px] text-sm">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            <th className="text-left px-4 py-3 font-medium sticky top-0 z-10 bg-slate-50 shadow-[0_1px_3px_rgba(0,0,0,0.08)] w-8">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={pending.length === 0} />
            </th>
            {["Branch", "Employee Code", "Name", "Department", "Requested", "Month", "Requested By", "Notes", "Actions"].map(h => <th key={h} className="text-left px-4 py-3 font-medium sticky top-0 z-10 bg-slate-50 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {pending.length === 0
            ? <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-400">No advances awaiting approval.</td></tr>
            : pending.map(a => (
              <tr key={a.id} className="hover:bg-slate-50">
                <td className="px-4 py-3"><input type="checkbox" checked={selected.has(a.id)} onChange={() => toggleOne(a.id)} /></td>
                <td className="px-4 py-3">{a.branch || "—"}</td>
                <td className="px-4 py-3">{a.employee_code}</td>
                <td className="px-4 py-3 font-medium">{a.employee_name}</td>
                <td className="px-4 py-3">{a.department || "—"}</td>
                <td className="px-4 py-3 font-semibold">{money(a.requested_amount)}</td>
                <td className="px-4 py-3 text-slate-500">{a.advance_month}</td>
                <td className="px-4 py-3 text-slate-500">{a.requested_by || "—"}</td>
                <td className="px-4 py-3 max-w-[160px] truncate text-slate-500">{a.notes || "—"}</td>
                <td className="px-4 py-3">
                  <RowActions a={a} canApprove={true} actorName={actorName} role={role} onChanged={reload} setErr={setErr} setMsg={setMsg} />
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Tab 3: Bulk Request (current month, goes to Finance for approval — same
// as submitting "+ Request Advance" one at a time, just for many employees
// at once) ──────────────────────────────────────────────────────────────
function BulkRequestTab({ employees, advances, actorName, reload, setMsg, setErr, onPrintBatch }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [summary, setSummary] = useState(null);
  const [importing, setImporting] = useState(false);

  function downloadTemplate() {
    const aoa = [
      ["S.No", "Employee ID", "Employee Name", "Requested Amount", "Advance Month", "Notes"],
      [1, "1001", "Sample Employee", 10000, "2026-07", "Sample row — delete before importing"],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 6 }, { wch: 12 }, { wch: 20 }, { wch: 16 }, { wch: 14 }, { wch: 24 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Advance Requests");
    XLSX.writeFile(wb, "advance_requests_template.xlsx");
  }

  async function handlePreview() {
    if (!file) return setErr("Select an Excel file first.");
    setErr(""); setSummary(null); setPreview(null);
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const rawRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
      const headerIdx = rawRows.findIndex(r => String(r[1] || "").trim() === "Employee ID");
      if (headerIdx === -1) throw new Error("Header row not found. Ensure you're using the downloaded template.");
      const headers = rawRows[headerIdx];
      const dataRows = rawRows.slice(headerIdx + 1).filter(r => r.some(c => c !== ""));

      // Existing non-Rejected advances, keyed the same way requestAdvance()
      // itself checks server-side -- shown here too so a duplicate is caught
      // in preview instead of only surfacing as a per-row error after Import.
      const existingKeys = new Set(
        advances.filter(a => a.status !== "Rejected").map(a => `${a.employee_code}|${a.advance_month}`)
      );
      const seenInFile = new Set();

      const rows = dataRows.map(row => {
        const obj = {};
        headers.forEach((h, i) => { obj[String(h)] = row[i] ?? ""; });
        const code = String(obj["Employee ID"] || "").trim();
        const emp = employees.find(e => e.employee_code === code);
        const requested = Number(obj["Requested Amount"] || 0);
        const month = excelDateToMonth(obj["Advance Month"]);
        const name = String(obj["Employee Name"] || emp?.full_name || "").trim();
        const notes = String(obj["Notes"] || "").trim();
        const key = `${code}|${month}`;

        let status = "ok";
        if (!code) status = "error: missing employee ID";
        else if (!emp) status = "error: employee not found or not Active";
        else if (!(requested > 0)) status = "error: invalid requested amount";
        else if (!month) status = "error: missing advance month";
        else if (existingKeys.has(key)) status = "error: employee already has an advance for that month";
        else if (seenInFile.has(key)) status = "error: duplicate employee/month within this file";

        if (status === "ok") seenInFile.add(key);
        return { code, emp, name, branch: emp?.branch, department: emp?.department, requested, month, notes, status };
      });
      setPreview(rows);
    } catch (e) { setErr(e.message); }
  }

  async function handleConfirm() {
    if (!preview) return;
    setImporting(true); setErr("");
    try {
      const result = await bulkRequestAdvances(preview, actorName);
      setSummary(result);
      setPreview(null); setFile(null);
      setMsg(`Submitted ${result.imported} of ${result.total} advance requests for Finance approval.`);
      reload();
    } catch (e) { setErr(e.message); }
    finally { setImporting(false); }
  }

  return (
    <div>
      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm mb-4">
        <h2 className="font-bold text-slate-800 mb-2">Bulk Request Advances</h2>
        <p className="text-xs text-slate-500 mb-4">Upload an Excel file mapping Employee ID, Requested Amount, Advance Month and (optional) Notes. Each valid row is submitted as a new Pending request — exactly as if it were entered one at a time via "+ Request Advance" — and goes to Finance for approval.</p>
        <div className="flex flex-wrap gap-2 items-center">
          <Button variant="outline" onClick={downloadTemplate} className="rounded-xl">Download Template</Button>
          <input type="file" accept=".xlsx,.xls" onChange={e => setFile(e.target.files[0] || null)} className="text-sm" />
          <Button onClick={handlePreview} disabled={!file} className="rounded-xl">Preview</Button>
        </div>
      </div>

      {summary && (
        <div className="mb-4 p-4 rounded-2xl bg-blue-50 text-blue-800 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>Submitted {summary.imported} of {summary.total} requests. {summary.failed > 0 && `${summary.failed} failed.`}</span>
            {summary.imported > 0 && (
              <Button variant="outline" onClick={() => { const d = new Date().toISOString().slice(0, 10); onPrintBatch({ from: d, to: d }); }} className="rounded-xl text-xs py-1 px-3 bg-white">
                🖨️ Print Combined Slip for this Batch
              </Button>
            )}
          </div>
          {summary.errors?.length > 0 && (
            <ul className="mt-2 list-disc list-inside text-xs text-red-600">
              {summary.errors.slice(0, 20).map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
        </div>
      )}

      {preview && (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto overflow-y-auto max-h-[70vh]">
          <div className="px-5 pt-4 pb-2 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-slate-800">Preview — {preview.length} rows</h2>
              <p className="text-xs text-slate-400">
                {preview.filter(r => r.status === "ok").length} ok ·{" "}
                {preview.filter(r => r.status.startsWith("error")).length} errors (will be skipped)
              </p>
            </div>
            <Button onClick={handleConfirm} disabled={importing || preview.every(r => r.status !== "ok")} className="rounded-xl">{importing ? "Submitting…" : "Submit Requests"}</Button>
          </div>
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>{["Code", "Name", "Branch", "Department", "Requested", "Month", "Notes", "Row Status"].map(h => <th key={h} className="text-left px-4 py-3 font-medium sticky top-0 z-10 bg-slate-50 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {preview.map((r, i) => (
                <tr key={i} className={r.status.startsWith("error") ? "bg-red-50" : ""}>
                  <td className="px-4 py-3">{r.code}</td>
                  <td className="px-4 py-3">{r.name}</td>
                  <td className="px-4 py-3">{r.branch || "—"}</td>
                  <td className="px-4 py-3">{r.department || "—"}</td>
                  <td className="px-4 py-3">{money(r.requested)}</td>
                  <td className="px-4 py-3">{r.month}</td>
                  <td className="px-4 py-3 max-w-[160px] truncate">{r.notes || "—"}</td>
                  <td className="px-4 py-3 text-xs">{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Tab 3: Import Historical ─────────────────────────────────────────────
function ImportHistoricalTab({ employees, reload, setMsg, setErr }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [summary, setSummary] = useState(null);
  const [importing, setImporting] = useState(false);

  function downloadTemplate() {
    const aoa = [
      ["S.No", "Branch", "Employee ID", "Employee Name", "Department", "Requested Amount", "Approved Amount", "Issued Amount", "Advance Month", "Notes"],
      [1, "Main Branch", "1001", "Sample Employee", "Food", 10000, 10000, 10000, "2026-07", "Sample row — delete before importing"],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 6 }, { wch: 16 }, { wch: 12 }, { wch: 20 }, { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 24 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Advances Import");
    XLSX.writeFile(wb, "advances_import_template.xlsx");
  }

  async function handlePreview() {
    if (!file) return setErr("Select an Excel file first.");
    setErr(""); setSummary(null); setPreview(null);
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const rawRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
      const headerIdx = rawRows.findIndex(r => String(r[1] || "").trim() === "Branch");
      if (headerIdx === -1) throw new Error("Header row not found. Ensure you're using the downloaded template.");
      const headers = rawRows[headerIdx];
      const dataRows = rawRows.slice(headerIdx + 1).filter(r => r.some(c => c !== ""));

      const rows = dataRows.map(row => {
        const obj = {};
        headers.forEach((h, i) => { obj[String(h)] = row[i] ?? ""; });
        const code = String(obj["Employee ID"] || "").trim();
        const emp = employees.find(e => e.employee_code === code);
        const requested = Number(obj["Requested Amount"] || 0);
        const approved = Number(obj["Approved Amount"] || 0);
        const issued = Number(obj["Issued Amount"] || 0);
        const month = excelDateToMonth(obj["Advance Month"]);
        const name = String(obj["Employee Name"] || emp?.full_name || "").trim();
        const branch = String(obj["Branch"] || emp?.branch || "").trim();
        const department = String(obj["Department"] || emp?.department || "").trim();
        const notes = String(obj["Notes"] || "").trim();

        let status = "ok";
        if (!code) status = "error: missing employee ID";
        else if (!name) status = "error: missing employee name";
        else if (!requested || requested <= 0) status = "error: invalid requested amount";
        else if (approved > requested) status = "error: approved exceeds requested";
        else if (!month) status = "error: missing advance month";
        else if (!emp) status = "warning: employee not found in current employee list";
        else if (issued > approved) status = "warning: Excess — issued exceeds approved";

        return { code, emp, name, branch, department, requested, approved, issued, month, notes, status };
      });
      setPreview(rows);
    } catch (e) { setErr(e.message); }
  }

  async function handleConfirm() {
    if (!preview) return;
    setImporting(true); setErr("");
    try {
      const result = await importHistoricalAdvances(preview);
      setSummary(result);
      setPreview(null); setFile(null);
      setMsg(`Imported ${result.imported} of ${result.total} advance records.`);
      reload();
    } catch (e) { setErr(e.message); }
    finally { setImporting(false); }
  }

  return (
    <div>
      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm mb-4">
        <h2 className="font-bold text-slate-800 mb-2">Import Historical Advances</h2>
        <p className="text-xs text-slate-500 mb-4">Upload an Excel file mapping Branch, Employee ID, Name, Department, Requested/Approved/Issued Amount and Advance Month. Rows where Issued exceeds Approved are flagged as Excess but still import.</p>
        <div className="flex flex-wrap gap-2 items-center">
          <Button variant="outline" onClick={downloadTemplate} className="rounded-xl">Download Template</Button>
          <input type="file" accept=".xlsx,.xls" onChange={e => setFile(e.target.files[0] || null)} className="text-sm" />
          <Button onClick={handlePreview} disabled={!file} className="rounded-xl">Preview</Button>
        </div>
      </div>

      {summary && (
        <div className="mb-4 p-4 rounded-2xl bg-blue-50 text-blue-800 text-sm">
          Imported {summary.imported} of {summary.total} records. {summary.failed > 0 && `${summary.failed} failed.`}
          {summary.errors?.length > 0 && (
            <ul className="mt-2 list-disc list-inside text-xs text-red-600">
              {summary.errors.slice(0, 20).map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
        </div>
      )}

      {preview && (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto overflow-y-auto max-h-[70vh]">
          <div className="px-5 pt-4 pb-2 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-slate-800">Preview — {preview.length} rows</h2>
              <p className="text-xs text-slate-400">
                {preview.filter(r => r.status === "ok").length} ok ·{" "}
                {preview.filter(r => r.status.startsWith("warning")).length} warnings ·{" "}
                {preview.filter(r => r.status.startsWith("error")).length} errors (will be skipped)
              </p>
            </div>
            <Button onClick={handleConfirm} disabled={importing} className="rounded-xl">{importing ? "Importing…" : "Import"}</Button>
          </div>
          <table className="w-full min-w-[1000px] text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>{["Branch", "Code", "Name", "Department", "Requested", "Approved", "Issued", "Month", "Row Status"].map(h => <th key={h} className="text-left px-4 py-3 font-medium sticky top-0 z-10 bg-slate-50 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {preview.map((r, i) => (
                <tr key={i} className={r.status.startsWith("error") ? "bg-red-50" : r.status.startsWith("warning") ? "bg-amber-50" : ""}>
                  <td className="px-4 py-3">{r.branch || "—"}</td>
                  <td className="px-4 py-3">{r.code}</td>
                  <td className="px-4 py-3">{r.name}</td>
                  <td className="px-4 py-3">{r.department || "—"}</td>
                  <td className="px-4 py-3">{money(r.requested)}</td>
                  <td className="px-4 py-3">{money(r.approved)}</td>
                  <td className="px-4 py-3">{money(r.issued)}</td>
                  <td className="px-4 py-3">{r.month}</td>
                  <td className="px-4 py-3 text-xs">{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Summary panel ─────────────────────────────────────────────────────────
function SummaryPanel({ advances }) {
  const nowMonth = currentMonth();
  // Scoped to the current advance_month, not an all-time total -- a
  // long-running ledger's all-time sums aren't a useful "how are we doing
  // right now" snapshot. The dedicated Pending Approval tab still shows
  // every pending request regardless of month, so nothing is hidden, just
  // not double-counted into a stale running total here.
  const monthly = useMemo(() => advances.filter(a => a.advance_month === nowMonth), [advances, nowMonth]);
  const totals = useMemo(() => {
    const totalRequested = monthly.reduce((s, a) => s + Number(a.requested_amount || 0), 0);
    const totalApproved = monthly.reduce((s, a) => s + Number(a.approved_amount || 0), 0);
    const totalIssued = monthly.reduce((s, a) => s + Number(a.issued_amount || 0), 0);
    const totalExcess = monthly.reduce((s, a) => s + Number(a.excess_amount || 0), 0);
    const totalPending = monthly.filter(a => a.status === "Pending").length;
    const deductedThisMonth = monthly
      .filter(a => a.status === "Deducted" && a.deducted_in_month === nowMonth)
      .reduce((s, a) => s + Number(a.issued_amount || 0), 0);
    const byBranch = {};
    monthly.forEach(a => {
      const b = a.branch || "Unassigned";
      if (!byBranch[b]) byBranch[b] = { requested: 0, approved: 0, issued: 0 };
      byBranch[b].requested += Number(a.requested_amount || 0);
      byBranch[b].approved += Number(a.approved_amount || 0);
      byBranch[b].issued += Number(a.issued_amount || 0);
    });
    return {
      totalRequested, totalApproved, totalIssued, totalExcess, totalPending, deductedThisMonth,
      branchRows: Object.entries(byBranch).map(([branch, v]) => ({ branch, ...v })).sort((a, b) => a.branch.localeCompare(b.branch)),
    };
  }, [monthly, nowMonth]);

  const tile = (label, value, tone) => (
    <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-xl font-bold ${tone || "text-slate-800"}`}>{value}</p>
    </div>
  );

  return (
    <div className="mb-5">
      <p className="text-xs text-slate-400 mb-2">Showing {formatMonthYear(`${nowMonth}-01`)}</p>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-4">
        {tile("Total Requested", money(totals.totalRequested))}
        {tile("Total Approved", money(totals.totalApproved))}
        {tile("Total Issued", money(totals.totalIssued), "text-emerald-600")}
        {tile("Total Excess", money(totals.totalExcess), totals.totalExcess > 0 ? "text-red-600" : "text-slate-800")}
        {tile("Pending Requests", totals.totalPending, "text-amber-500")}
        {tile("Deducted This Month", money(totals.deductedThisMonth), "text-slate-600")}
      </div>
      {totals.branchRows.length > 0 && (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto overflow-y-auto max-h-[70vh]">
          <div className="px-5 pt-3 pb-2"><h2 className="font-bold text-slate-800 text-sm">Branch-wise Breakdown</h2></div>
          <table className="w-full min-w-[600px] text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>{["Branch", "Requested", "Approved", "Issued"].map(h => <th key={h} className="text-left px-4 py-2 font-medium sticky top-0 z-10 bg-slate-50 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {totals.branchRows.map(b => (
                <tr key={b.branch}>
                  <td className="px-4 py-2 font-medium">{b.branch}</td>
                  <td className="px-4 py-2">{money(b.requested)}</td>
                  <td className="px-4 py-2">{money(b.approved)}</td>
                  <td className="px-4 py-2">{money(b.issued)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const TABS = [
  ["all", "All Advances"],
  ["pending", "Pending Approval"],
  ["bulk", "Bulk Request"],
  ["import", "Import Historical"],
];

export default function Advances({ role, actorName }) {
  const [tab, setTab] = useState("all");
  const [advances, setAdvances] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [printingAdvance, setPrintingAdvance] = useState(null);
  const [printingBatchRange, setPrintingBatchRange] = useState(null); // { from, to }

  const canRequest = ["Master", "HR"].includes(role);
  const canApprove = ["Master", "Finance"].includes(role);
  const canImport = ["Master", "HR"].includes(role);

  useEffect(() => { load(); }, []);

  // Print is triggered a tick after printing state is set (so the print-only
  // content below has actually rendered), and cleared on 'afterprint' so it
  // disappears again once the browser's print dialog closes -- same pattern
  // as LoanManagement.jsx's approval slip.
  useEffect(() => {
    if (!printingAdvance && !printingBatchRange) return;
    const t = setTimeout(() => window.print(), 50);
    const clear = () => { setPrintingAdvance(null); setPrintingBatchRange(null); };
    window.addEventListener("afterprint", clear);
    return () => { clearTimeout(t); window.removeEventListener("afterprint", clear); };
  }, [printingAdvance, printingBatchRange]);

  async function load() {
    try {
      const [adv, emps] = await Promise.all([fetchAdvances(), fetchActiveEmployeesForPicker()]);
      setAdvances(adv); setEmployees(emps);
    } catch (e) { setErr(e.message); }
  }

  const visibleTabs = TABS.filter(([k]) => (k !== "pending" || canApprove) && (k !== "bulk" || canRequest) && (k !== "import" || canImport));

  const batchRows = useMemo(() => {
    if (!printingBatchRange) return [];
    const from = printingBatchRange.from <= printingBatchRange.to ? printingBatchRange.from : printingBatchRange.to;
    const to = printingBatchRange.from <= printingBatchRange.to ? printingBatchRange.to : printingBatchRange.from;
    return advances.filter(a => {
      const d = (a.created_at || "").slice(0, 10);
      return d && d >= from && d <= to;
    });
  }, [advances, printingBatchRange]);

  return (
    <>
    <div className="print:hidden">
      <PageTitle title="Advances" subtitle="HR requests, Finance approves and issues — auto-deducted from that month's payroll." />

      {msg && <div className="mb-3 p-3 rounded-xl bg-blue-50 text-blue-700 text-sm">{msg}</div>}
      {err && <div className="mb-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{err}</div>}

      <SummaryPanel advances={advances} />

      <div className="flex flex-wrap gap-2 mb-5">
        {visibleTabs.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${tab === k ? "bg-slate-950 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            {l}
          </button>
        ))}
      </div>

      {tab === "all" && (
        <AllAdvancesTab advances={advances} employees={employees} role={role} actorName={actorName || role}
          canRequest={canRequest} canApprove={canApprove} reload={load} setMsg={setMsg} setErr={setErr}
          onPrint={setPrintingAdvance} onPrintBatch={setPrintingBatchRange} />
      )}
      {tab === "pending" && canApprove && (
        <PendingApprovalTab advances={advances} actorName={actorName || role} role={role} reload={load} setMsg={setMsg} setErr={setErr} />
      )}
      {tab === "bulk" && canRequest && (
        <BulkRequestTab employees={employees} advances={advances} actorName={actorName || role} reload={load} setMsg={setMsg} setErr={setErr}
          onPrintBatch={setPrintingBatchRange} />
      )}
      {tab === "import" && canImport && (
        <ImportHistoricalTab employees={employees} reload={load} setMsg={setMsg} setErr={setErr} />
      )}
    </div>

      {/* Print-only individual approval slip -- rendered as a sibling outside
          the print:hidden wrapper above (a print:block descendant of a
          print:hidden ancestor stays hidden, since the ancestor's
          display:none wins), same pattern as LoanManagement.jsx. */}
      {printingAdvance && (() => {
        const a = printingAdvance;
        const emp = employees.find(e => e.employee_code === a.employee_code);
        return (
          <div className="hidden print:block p-8 text-sm text-black">
            <h1 className="text-lg font-bold mb-1">Advance Approval Slip</h1>
            <p className="text-xs text-slate-500 mb-6">Printed {new Date().toLocaleString()}</p>
            <table className="w-full text-sm mb-6">
              <tbody>
                <tr><td className="py-1 pr-4 font-semibold w-48">Employee</td><td className="py-1">{a.employee_name} ({a.employee_code})</td></tr>
                <tr><td className="py-1 pr-4 font-semibold">Department / Branch</td><td className="py-1">{a.department || emp?.department || "—"} / {a.branch || emp?.branch || "—"}</td></tr>
                <tr><td className="py-1 pr-4 font-semibold">Advance Month</td><td className="py-1">{a.advance_month}</td></tr>
                <tr><td className="py-1 pr-4 font-semibold">Requested Amount</td><td className="py-1">{money(a.requested_amount)}</td></tr>
                <tr><td className="py-1 pr-4 font-semibold">Approved Amount</td><td className="py-1">{a.approved_amount ? money(a.approved_amount) : "—"}</td></tr>
                <tr><td className="py-1 pr-4 font-semibold">Issued Amount</td><td className="py-1">{a.issued_amount ? money(a.issued_amount) : "—"}</td></tr>
                <tr><td className="py-1 pr-4 font-semibold">Notes</td><td className="py-1">{a.notes || "—"}</td></tr>
                <tr><td className="py-1 pr-4 font-semibold">Status</td><td className="py-1">{a.status}</td></tr>
                <tr><td className="py-1 pr-4 font-semibold">Approved By</td><td className="py-1">{a.approved_by || "—"}{a.approved_at ? ` on ${new Date(a.approved_at).toLocaleDateString()}` : ""}</td></tr>
                <tr><td className="py-1 pr-4 font-semibold">Issued By</td><td className="py-1">{a.issued_by || "—"}{a.issued_at ? ` on ${new Date(a.issued_at).toLocaleDateString()}` : ""}</td></tr>
              </tbody>
            </table>
            <div className="grid grid-cols-2 gap-8 mt-16">
              <div><div className="border-t border-black pt-1">HR Signature</div></div>
              <div><div className="border-t border-black pt-1">Finance Signature</div></div>
            </div>
          </div>
        );
      })()}

      {/* Print-only combined slip -- every advance whose created_at date
          matches the chosen date on one page with a single signature block,
          instead of printing one slip per employee (the whole point of a
          bulk upload's paper trail: one sheet for the batch, not N). */}
      {printingBatchRange && (
        <div className="hidden print:block p-8 text-sm text-black">
          <h1 className="text-lg font-bold mb-1">
            Advance Requests — {printingBatchRange.from === printingBatchRange.to ? printingBatchRange.from : `${printingBatchRange.from} to ${printingBatchRange.to}`}
          </h1>
          <p className="text-xs text-slate-500 mb-6">{batchRows.length} record{batchRows.length === 1 ? "" : "s"} · Printed {new Date().toLocaleString()}</p>
          <table className="w-full text-xs mb-8 border-collapse">
            <thead>
              <tr className="border-b border-black">
                {["Code", "Name", "Branch", "Department", "Requested", "Approved", "Issued", "Status", "Month"].map(h => (
                  <th key={h} className="text-left py-1 pr-2">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {batchRows.map(a => (
                <tr key={a.id} className="border-b border-slate-300">
                  <td className="py-1 pr-2">{a.employee_code}</td>
                  <td className="py-1 pr-2">{a.employee_name}</td>
                  <td className="py-1 pr-2">{a.branch || "—"}</td>
                  <td className="py-1 pr-2">{a.department || "—"}</td>
                  <td className="py-1 pr-2">{money(a.requested_amount)}</td>
                  <td className="py-1 pr-2">{a.approved_amount ? money(a.approved_amount) : "—"}</td>
                  <td className="py-1 pr-2">{a.issued_amount ? money(a.issued_amount) : "—"}</td>
                  <td className="py-1 pr-2">{a.status}</td>
                  <td className="py-1 pr-2">{a.advance_month}</td>
                </tr>
              ))}
              {batchRows.length === 0 && (
                <tr><td colSpan={9} className="py-4 text-center text-slate-400">No advances found for this date.</td></tr>
              )}
            </tbody>
            {batchRows.length > 0 && (
              <tfoot>
                <tr className="border-t border-black font-semibold">
                  <td className="py-1 pr-2" colSpan={4}>Total</td>
                  <td className="py-1 pr-2">{money(batchRows.reduce((s, a) => s + Number(a.requested_amount || 0), 0))}</td>
                  <td className="py-1 pr-2">{money(batchRows.reduce((s, a) => s + Number(a.approved_amount || 0), 0))}</td>
                  <td className="py-1 pr-2">{money(batchRows.reduce((s, a) => s + Number(a.issued_amount || 0), 0))}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
          <div className="grid grid-cols-2 gap-8 mt-16">
            <div><div className="border-t border-black pt-1">HR Signature</div></div>
            <div><div className="border-t border-black pt-1">Finance Signature</div></div>
          </div>
        </div>
      )}
    </>
  );
}
