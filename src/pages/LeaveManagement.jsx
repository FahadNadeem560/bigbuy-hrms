import React, { useState, useEffect, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../lib/supabaseClient.js";
import { Button, Badge, PageTitle } from "../components/ui.jsx";
import LeaveLiability from "./LeaveLiability.jsx";
import { LEAVE_QUOTA } from "../config/staffPolicies.js";

const LEAVE_TYPES = ["Annual", "Half Day", "Emergency", "Maternity", "Paternity", "Unpaid"];

function statusBadge(s) {
  const t = { Approved: "green", Rejected: "red", Pending: "yellow" };
  return <Badge tone={t[s] || "slate"}>{s || "Pending"}</Badge>;
}

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
      <input
        value={value ? `${value.employee_code} — ${value.full_name}` : q}
        onChange={e => { if (value) onChange(null); setQ(e.target.value); setOpen(true); }}
        onFocus={() => { if (!value) setOpen(true); }}
        placeholder="Search employee..."
        className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm"
      />
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

function calcEarned(staffLevel, joiningDate) {
  const quota = LEAVE_QUOTA[staffLevel] || LEAVE_QUOTA["Non-Management"];
  const now = new Date();
  const monthsElapsed = (now.getFullYear() - 2025) * 12 + now.getMonth() + 1;
  const joiningMonths = joiningDate
    ? Math.max(0, (now.getFullYear() - new Date(joiningDate).getFullYear()) * 12 + (now.getMonth() - new Date(joiningDate).getMonth()) + 1)
    : monthsElapsed;
  const months = Math.min(monthsElapsed, joiningMonths);
  return Math.round((quota / 12) * months * 10) / 10;
}

function previewRowColor(status) {
  if (status.startsWith("error")) return "bg-red-50 text-red-700";
  if (status.startsWith("warning")) return "bg-yellow-50 text-yellow-700";
  return "text-slate-600";
}

export default function LeaveManagement({ role }) {
  const [tab, setTab] = useState("apply");
  const [employees, setEmployees] = useState([]);
  const [requests, setRequests] = useState([]);
  const [balances, setBalances] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const [selEmp, setSelEmp] = useState(null);
  const [leaveType, setLeaveType] = useState("Annual");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [reason, setReason] = useState("");

  const [historyFilter, setHistoryFilter] = useState({ type: "All", branch: "All", dept: "", from: "", to: "" });
  const [calMonth, setCalMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [rejectId, setRejectId] = useState(null);
  const [rejectNote, setRejectNote] = useState("");

  // Import state
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importSummary, setImportSummary] = useState(null);
  const [importing, setImporting] = useState(false);

  // Manual edit state
  const [editBalance, setEditBalance] = useState(null);
  const [editForm, setEditForm] = useState({ opening: 0, used: 0, halfLeaves: 0, effectiveFrom: "" });

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [{ data: emps }, { data: reqs }, { data: bals }] = await Promise.all([
        supabase.from("employees").select("employee_code, full_name, department, branch, staff_level, joining_date").order("full_name"),
        supabase.from("leave_requests").select("*").order("created_at", { ascending: false }).limit(500),
        supabase.from("leaves").select("*").limit(500),
      ]);
      setEmployees(emps || []);
      setRequests(reqs || []);
      setBalances(bals || []);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function submitApplication() {
    if (!selEmp || !fromDate || !toDate) return setErr("Employee, from date and to date are required.");
    setErr(""); setMsg("");
    const daysDiff = Math.max(1, Math.ceil((new Date(toDate) - new Date(fromDate)) / (1000 * 60 * 60 * 24)) + 1);
    const { error } = await supabase.from("leave_requests").insert({
      employee_id: selEmp.employee_code, employee_code: selEmp.employee_code,
      employee_name: selEmp.full_name, leave_type: leaveType,
      from_date: fromDate, to_date: toDate, reason, status: "Pending",
      days: daysDiff, is_unpaid: leaveType === "Unpaid",
      applied_date: new Date().toISOString().slice(0, 10),
    });
    if (error) return setErr(error.message);
    setMsg(`Leave application submitted (${daysDiff} day${daysDiff > 1 ? "s" : ""}). ${leaveType === "Unpaid" ? "Salary deduction will apply." : ""}`);
    setSelEmp(null); setFromDate(""); setToDate(""); setReason("");
    loadAll();
  }

  async function updateStatus(id, status, rejectionNote) {
    const upd = { status, approved_by: "HR", approved_at: new Date().toISOString() };
    if (rejectionNote) upd.rejection_reason = rejectionNote;
    const { error } = await supabase.from("leave_requests").update(upd).eq("id", id);
    if (!error) {
      if (status === "Approved" || status === "Pending HR") {
        const req = requests.find(r => r.id === id);
        await supabase.from("notifications").insert({
          recipient_role: status === "Pending HR" ? "HR" : null,
          recipient_code: status === "Approved" ? req?.employee_code : null,
          type: "leave_approval", is_read: false,
          title: status === "Approved" ? "Leave Approved" : "Leave Forwarded to HR",
          message: `${req?.employee_name}'s ${req?.leave_type} leave has been ${status === "Approved" ? "approved" : "forwarded to HR for review"}.`,
          created_at: new Date().toISOString(),
        }).then(() => {});
      }
      setMsg(`Leave ${status.toLowerCase()}.`); loadAll();
    }
  }

  function approveAction(r) {
    if (r.status === "Pending Supervisor" || r.status === "Pending") return "Pending HR";
    return "Approved";
  }

  // ─── Import Template ──────────────────────────────────────────────────────
  function downloadImportTemplate() {
    const instructions =
      "INSTRUCTIONS: Fill Opening Balance = total annual entitlement. " +
      "Already Used = leaves taken before importing into system. " +
      "Remaining Balance will be auto-calculated (Opening - Already Used - Half Leaves×0.5). " +
      "Do not leave Employee Code blank.";
    const aoa = [
      [instructions],
      ["Employee Code", "Employee Name", "Opening Balance", "Already Used", "Remaining Balance", "Half Leaves Used", "Effective From"],
      ["EMP001", "Sample Employee", 14, 0, 14, 0, "2026-01-01"],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }];
    ws["!cols"] = [{ wch: 15 }, { wch: 25 }, { wch: 16 }, { wch: 14 }, { wch: 20 }, { wch: 16 }, { wch: 15 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Leave Balances");
    XLSX.writeFile(wb, "leave_balance_import_template.xlsx");
  }

  async function handlePreview() {
    if (!importFile) return setErr("Select an Excel file first.");
    setErr(""); setImportSummary(null); setImportPreview(null);
    try {
      const data = await importFile.arrayBuffer();
      const wb = XLSX.read(data);
      const rawRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });

      // Find the header row (first row where cell 0 equals "Employee Code")
      const headerIdx = rawRows.findIndex(r => String(r[0] || "").trim() === "Employee Code");
      if (headerIdx === -1) throw new Error("Header row not found. Ensure you're using the downloaded template.");
      const headers = rawRows[headerIdx];
      const dataRows = rawRows.slice(headerIdx + 1).filter(r => r.some(c => c !== ""));

      const preview = dataRows.map(row => {
        const obj = {};
        headers.forEach((h, i) => { obj[String(h)] = row[i] ?? ""; });
        const code = String(obj["Employee Code"] || "").trim();
        const emp = employees.find(e => e.employee_code === code);
        const opening = Number(obj["Opening Balance"] || 0);
        const used = Number(obj["Already Used"] || 0);
        const halfLeaves = Number(obj["Half Leaves Used"] || 0);
        const remaining = opening - used - halfLeaves * 0.5;
        const effectiveFrom = String(obj["Effective From"] || "").trim();
        const earned = calcEarned(emp?.staff_level, emp?.joining_date);
        let status = "ok";
        if (!code) status = "error: missing employee code";
        else if (!emp) status = `error: ${code} not found`;
        else if (remaining < 0) status = "warning: negative balance";
        return { code, empName: String(obj["Employee Name"] || "").trim(), emp, opening, used, halfLeaves, remaining, effectiveFrom, earned, status };
      });
      setImportPreview(preview);
    } catch (e) {
      setErr(e.message);
    }
  }

  async function handleConfirm() {
    if (!importPreview) return;
    setImporting(true); setErr("");
    let updated = 0, failed = 0;
    const errors = [];
    for (const row of importPreview) {
      if (!row.emp) { failed++; errors.push(`${row.code}: employee not found`); continue; }
      const { error } = await supabase.from("leaves").upsert({
        employee_id: row.code, employee_code: row.code,
        opening_balance: row.opening, used: row.used, half_leaves: row.halfLeaves,
        remaining: row.remaining, remaining_balance: row.remaining, earned: row.earned,
        effective_from: row.effectiveFrom || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "employee_id" });
      if (error) { failed++; errors.push(`${row.code}: ${error.message}`); }
      else updated++;
    }
    setImportSummary({ total: importPreview.length, updated, failed, errors });
    setImportPreview(null);
    setImportFile(null);
    setImporting(false);
    loadAll();
  }

  // ─── Manual Edit ─────────────────────────────────────────────────────────
  function openEdit(emp) {
    if (role !== "HR" && role !== "Master") return;
    const bal = balances.find(b => b.employee_code === emp.employee_code || b.employee_id === emp.employee_code);
    setEditForm({
      opening: bal?.opening_balance ?? 0,
      used: bal?.used ?? 0,
      halfLeaves: bal?.half_leaves ?? 0,
      effectiveFrom: bal?.effective_from ? String(bal.effective_from).slice(0, 10) : "",
    });
    setEditBalance(emp);
  }

  async function saveBalanceEdit() {
    if (!editBalance) return;
    setErr("");
    const opening = Number(editForm.opening);
    const used = Number(editForm.used);
    const halfLeaves = Number(editForm.halfLeaves);
    const remaining = opening - used - halfLeaves * 0.5;
    const earned = calcEarned(editBalance.staff_level, editBalance.joining_date);
    const { error } = await supabase.from("leaves").upsert({
      employee_id: editBalance.employee_code, employee_code: editBalance.employee_code,
      opening_balance: opening, used, half_leaves: halfLeaves,
      remaining, remaining_balance: remaining, earned,
      effective_from: editForm.effectiveFrom || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "employee_id" });
    if (error) return setErr(error.message);
    setMsg(`Leave balance updated for ${editBalance.full_name}.`);
    setEditBalance(null);
    loadAll();
  }

  // ─── Derived data ─────────────────────────────────────────────────────────
  const PENDING_STATUSES = ["Pending", "Pending Supervisor", "Pending HR"];
  const pending = requests.filter(r => PENDING_STATUSES.includes(r.status));

  const filteredHistory = useMemo(() => requests.filter(r => {
    const typeOk = historyFilter.type === "All" || r.leave_type === historyFilter.type;
    const emp = employees.find(e => e.employee_code === r.employee_code);
    const branchOk = historyFilter.branch === "All" || emp?.branch === historyFilter.branch;
    const deptOk = !historyFilter.dept || (emp?.department || "").toLowerCase().includes(historyFilter.dept.toLowerCase());
    const fromOk = !historyFilter.from || r.from_date >= historyFilter.from;
    const toOk = !historyFilter.to || r.to_date <= historyFilter.to;
    return typeOk && branchOk && deptOk && fromOk && toOk;
  }), [requests, historyFilter, employees]);

  const branches = useMemo(() => ["All", ...new Set(employees.map(e => e.branch).filter(Boolean))], [employees]);

  const enrichedBalances = useMemo(() => employees.map(emp => {
    const approvedAnnual = requests.filter(r =>
      r.employee_code === emp.employee_code && r.status === "Approved" && r.leave_type === "Annual"
    ).reduce((s, r) => s + Number(r.days || 1), 0);
    const approvedHalfDay = requests.filter(r =>
      r.employee_code === emp.employee_code && r.status === "Approved" && r.leave_type === "Half Day"
    ).reduce((s, r) => s + Number(r.days || 1), 0);
    const bal = balances.find(b => b.employee_code === emp.employee_code || b.employee_id === emp.employee_code);
    const opening = Number(bal?.opening_balance || 0);
    const earnedToDate = calcEarned(emp.staff_level, emp.joining_date);
    const used = approvedAnnual;
    const halfUsed = approvedHalfDay;
    const remaining = (opening + earnedToDate) - used - (halfUsed * 0.5);
    const lastUpdated = bal?.updated_at ? new Date(bal.updated_at).toLocaleDateString() : "—";
    return { ...emp, opening, earnedToDate, used, halfUsed, remaining, lastUpdated };
  }), [employees, requests, balances]);

  const calLeaves = useMemo(() =>
    requests.filter(r => r.status === "Approved" &&
      (r.from_date?.slice(0, 7) <= calMonth && r.to_date?.slice(0, 7) >= calMonth)
    ), [requests, calMonth]);

  const { daysInMonth, firstDay } = useMemo(() => {
    const [y, m] = calMonth.split("-").map(Number);
    return { daysInMonth: new Date(y, m, 0).getDate(), firstDay: new Date(y, m - 1, 1).getDay() };
  }, [calMonth]);

  function dayLeaves(day) {
    const [y, m] = calMonth.split("-").map(Number);
    const d = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return calLeaves.filter(r => r.from_date <= d && r.to_date >= d);
  }

  // Computed remaining for edit modal preview
  const editRemaining = Number(editForm.opening) - Number(editForm.used) - Number(editForm.halfLeaves) * 0.5;

  return (
    <div>
      <PageTitle title="Leave Management" subtitle="Apply, approve and track employee annual leave with quota management." />
      <div className="flex flex-wrap gap-2 mb-4">
        {[
          ["apply", "Apply Leave"],
          ["queue", `Approval Queue (${pending.length})`],
          ["balances", "Balances"],
          ["history", "History"],
          ["calendar", "Calendar"],
          ["liability", "Leave Liability"],
        ].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${tab === k ? "bg-slate-950 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{l}</button>
        ))}
      </div>
      {msg && <div className="mb-3 p-3 rounded-xl bg-blue-50 text-blue-700 text-sm">{msg}</div>}
      {err && <div className="mb-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{err}</div>}

      {/* ── Apply Tab ── */}
      {tab === "apply" && (
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
          <h2 className="font-bold text-slate-800 mb-4">New Leave Application</h2>
          <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-700 mb-4">
            Annual leave quota: Non-Management / Floor Management = 14 days/year · Management = 24 days/year. Earned proportionally each month.
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><p className="text-xs text-slate-500 mb-1">Employee</p><EmpPicker employees={employees} value={selEmp} onChange={setSelEmp} /></div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Leave Type</p>
              <select value={leaveType} onChange={e => setLeaveType(e.target.value)} className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm">
                {LEAVE_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div><p className="text-xs text-slate-500 mb-1">From Date</p><input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" /></div>
            <div><p className="text-xs text-slate-500 mb-1">To Date</p><input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" /></div>
            {fromDate && toDate && leaveType === "Unpaid" && (
              <div className="md:col-span-2 p-3 bg-yellow-50 rounded-xl text-sm text-yellow-700">
                Unpaid leave will trigger automatic salary deduction in the applicable payroll month.
              </div>
            )}
            <div className="md:col-span-2"><p className="text-xs text-slate-500 mb-1">Reason</p><textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="Reason for leave..." className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm resize-none" /></div>
          </div>
          <div className="mt-4"><Button onClick={submitApplication} className="rounded-2xl">Submit Application</Button></div>
        </div>
      )}

      {/* ── Queue Tab ── */}
      {tab === "queue" && (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
          <div className="px-5 pt-4 pb-2 flex items-center justify-between">
            <div><h2 className="font-bold text-slate-800">Leave Approval Queue</h2><p className="text-xs text-slate-400 mt-0.5">{pending.length} pending · {requests.length} total</p></div>
          </div>
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>{["Employee", "Type", "From", "To", "Days", "Reason", "Stage", "Applied", "Action"].map(h => <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pending.length === 0
                ? <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">No pending leave requests.</td></tr>
                : pending.map(r => {
                  const nextStatus = approveAction(r);
                  const isAwaitingSup = r.status === "Pending" || r.status === "Pending Supervisor";
                  return (
                    <tr key={r.id}>
                      <td className="px-4 py-3 font-medium">{r.employee_name || r.employee_id}</td>
                      <td className="px-4 py-3"><Badge tone={r.leave_type === "Unpaid" ? "red" : "blue"}>{r.leave_type}</Badge></td>
                      <td className="px-4 py-3">{r.from_date}</td>
                      <td className="px-4 py-3">{r.to_date}</td>
                      <td className="px-4 py-3">{r.days || "—"}</td>
                      <td className="px-4 py-3 max-w-[120px] truncate">{r.reason || "—"}</td>
                      <td className="px-4 py-3">
                        {isAwaitingSup ? <Badge tone="yellow">Awaiting Supervisor</Badge> : <Badge tone="blue">Awaiting HR</Badge>}
                      </td>
                      <td className="px-4 py-3">{r.applied_date || r.created_at?.slice(0, 10)}</td>
                      <td className="px-4 py-3">
                        {rejectId === r.id
                          ? <div className="flex flex-col gap-1">
                              <input value={rejectNote} onChange={e => setRejectNote(e.target.value)} placeholder="Rejection note..." className="px-2 py-1 rounded-xl border border-slate-200 text-xs" />
                              <div className="flex gap-1">
                                <Button onClick={() => { updateStatus(r.id, "Rejected by HR", rejectNote); setRejectId(null); setRejectNote(""); }} className="rounded-xl text-xs py-1 px-2">Confirm</Button>
                                <Button variant="outline" onClick={() => setRejectId(null)} className="rounded-xl text-xs py-1 px-2">Cancel</Button>
                              </div>
                            </div>
                          : <div className="flex gap-1">
                              <Button className="rounded-xl text-xs py-1 px-2" onClick={() => updateStatus(r.id, nextStatus)}>
                                {nextStatus === "Approved" ? "Approve" : "Fwd to HR"}
                              </Button>
                              <Button variant="outline" className="rounded-xl text-xs py-1 px-2" onClick={() => setRejectId(r.id)}>Reject</Button>
                            </div>}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Balances Tab ── */}
      {tab === "balances" && (
        <div>
          {/* Import panel */}
          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm mb-4">
            <h3 className="font-semibold text-slate-800 text-sm mb-3">Import Leave Balances</h3>
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 mb-3">
              <strong>Instructions:</strong> Fill Opening Balance = total annual entitlement. Already Used = leaves taken before importing into system.
              Remaining Balance is auto-calculated: Opening − Already Used − (Half Leaves × 0.5). Do not leave Employee Code blank.
            </div>
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <Button variant="outline" onClick={downloadImportTemplate} className="rounded-xl text-xs py-1.5 px-3">
                Download Template
              </Button>
              <input type="file" accept=".xlsx,.xls,.csv" id="leave-import-file"
                onChange={e => { setImportFile(e.target.files?.[0] || null); setImportPreview(null); setImportSummary(null); }}
                className="hidden" />
              <label htmlFor="leave-import-file" className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50">
                {importFile ? importFile.name : "Choose File"}
              </label>
              {importFile && !importPreview && (
                <Button onClick={handlePreview} className="rounded-xl text-xs py-1.5 px-3">
                  Preview Import
                </Button>
              )}
              {importFile && (
                <button onClick={() => { setImportFile(null); setImportPreview(null); setImportSummary(null); }}
                  className="text-xs text-slate-400 hover:text-slate-600">Clear</button>
              )}
            </div>

            {/* Preview table */}
            {importPreview && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-slate-700">{importPreview.length} rows parsed — review before confirming</p>
                  <div className="flex gap-2">
                    <Button onClick={handleConfirm} disabled={importing || importPreview.every(r => r.status.startsWith("error"))} className="rounded-xl text-xs py-1.5 px-3">
                      {importing ? "Importing..." : "Confirm Import"}
                    </Button>
                    <Button variant="outline" onClick={() => setImportPreview(null)} className="rounded-xl text-xs py-1.5 px-3">Cancel</Button>
                  </div>
                </div>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-xs min-w-[700px]">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        {["Code", "Name", "Opening", "Used", "Half Leaves", "Remaining", "Effective From", "Status"].map(h => (
                          <th key={h} className="text-left px-3 py-2 font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {importPreview.map((row, i) => (
                        <tr key={i} className={row.status.startsWith("error") ? "bg-red-50" : row.status.startsWith("warning") ? "bg-yellow-50" : ""}>
                          <td className="px-3 py-2 font-mono">{row.code || "—"}</td>
                          <td className="px-3 py-2">{row.emp?.full_name || row.empName || "—"}</td>
                          <td className="px-3 py-2 text-center">{row.opening}</td>
                          <td className="px-3 py-2 text-center">{row.used}</td>
                          <td className="px-3 py-2 text-center">{row.halfLeaves}</td>
                          <td className={`px-3 py-2 text-center font-semibold ${row.remaining < 0 ? "text-red-600" : "text-emerald-600"}`}>{row.remaining}</td>
                          <td className="px-3 py-2">{row.effectiveFrom || "—"}</td>
                          <td className={`px-3 py-2 font-medium ${row.status.startsWith("error") ? "text-red-600" : row.status.startsWith("warning") ? "text-yellow-700" : "text-emerald-600"}`}>
                            {row.status}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Post-import summary */}
            {importSummary && (
              <div className="mt-3 p-3 bg-slate-50 rounded-xl text-xs text-slate-700">
                <span className="font-semibold">Total: {importSummary.total}</span>
                <span className="text-emerald-600 font-semibold ml-4">{importSummary.updated} updated</span>
                {importSummary.failed > 0 && <span className="text-red-500 font-semibold ml-3">{importSummary.failed} failed</span>}
                {importSummary.errors.length > 0 && (
                  <div className="mt-2 space-y-0.5 text-red-500">{importSummary.errors.slice(0, 8).map((e, i) => <div key={i}>{e}</div>)}</div>
                )}
              </div>
            )}
          </div>

          {/* Balances table */}
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
            <div className="px-5 pt-4 pb-2">
              <h2 className="font-bold text-slate-800">Annual Leave Balances</h2>
              <p className="text-xs text-slate-400">
                Quota: Non-Mgmt/Floor Mgmt = 14 days/yr · Management = 24 days/yr · Earned proportionally per month
                {(role === "HR" || role === "Master") && " · Click a row to edit balance"}
              </p>
            </div>
            <table className="w-full min-w-[1000px] text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  {["Code", "Name", "Branch", "Department", "Opening Balance", "Earned to Date", "Used", "Half Leaves", "Remaining", "Last Updated"].map(h => (
                    <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {enrichedBalances.length === 0
                  ? <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-400">No employee data found.</td></tr>
                  : enrichedBalances.map((e, i) => {
                    const isLow = e.remaining <= 0;
                    const canEdit = role === "HR" || role === "Master";
                    return (
                      <tr key={i}
                        onClick={() => canEdit && openEdit(e)}
                        className={`${isLow ? "bg-red-50/40" : ""} ${canEdit ? "cursor-pointer hover:bg-slate-50" : ""}`}>
                        <td className="px-4 py-3 font-mono text-xs text-slate-500">{e.employee_code}</td>
                        <td className="px-4 py-3 font-medium">{e.full_name}</td>
                        <td className="px-4 py-3 text-slate-500">{e.branch}</td>
                        <td className="px-4 py-3 text-slate-500">{e.department}</td>
                        <td className="px-4 py-3 text-center">{e.opening}</td>
                        <td className="px-4 py-3 text-center">{e.earnedToDate}</td>
                        <td className="px-4 py-3 text-center">{e.used}</td>
                        <td className="px-4 py-3 text-center">{e.halfUsed}</td>
                        <td className="px-4 py-3 text-center">
                          <Badge tone={isLow ? "red" : "green"}>{e.remaining}</Badge>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-400">{e.lastUpdated}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── History Tab ── */}
      {tab === "history" && (
        <div>
          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm mb-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div>
                <p className="text-xs text-slate-500 mb-1">Leave Type</p>
                <select value={historyFilter.type} onChange={e => setHistoryFilter(v => ({ ...v, type: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm">
                  <option value="All">All Types</option>{LEAVE_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Branch</p>
                <select value={historyFilter.branch} onChange={e => setHistoryFilter(v => ({ ...v, branch: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm">
                  {branches.map(b => <option key={b}>{b}</option>)}
                </select>
              </div>
              <div><p className="text-xs text-slate-500 mb-1">Department</p><input value={historyFilter.dept} onChange={e => setHistoryFilter(v => ({ ...v, dept: e.target.value }))} placeholder="Dept filter..." className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" /></div>
              <div><p className="text-xs text-slate-500 mb-1">From</p><input type="date" value={historyFilter.from} onChange={e => setHistoryFilter(v => ({ ...v, from: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" /></div>
              <div><p className="text-xs text-slate-500 mb-1">To</p><input type="date" value={historyFilter.to} onChange={e => setHistoryFilter(v => ({ ...v, to: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" /></div>
            </div>
          </div>
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
            <div className="px-5 pt-4 pb-2"><h2 className="font-bold text-slate-800">Leave History</h2><p className="text-xs text-slate-400">{filteredHistory.length} records</p></div>
            <table className="w-full min-w-[800px] text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>{["Employee", "Type", "From", "To", "Days", "Reason", "Status", "Approved By"].map(h => <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredHistory.length === 0
                  ? <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No records match the filters.</td></tr>
                  : filteredHistory.map(r => {
                    const emp = employees.find(e => e.employee_code === r.employee_code);
                    return (
                      <tr key={r.id}>
                        <td className="px-4 py-3 font-medium">{r.employee_name || r.employee_id}<div className="text-xs text-slate-400">{emp?.department}</div></td>
                        <td className="px-4 py-3"><Badge tone={r.leave_type === "Unpaid" ? "red" : "blue"}>{r.leave_type}</Badge></td>
                        <td className="px-4 py-3">{r.from_date}</td>
                        <td className="px-4 py-3">{r.to_date}</td>
                        <td className="px-4 py-3">{r.days || "—"}</td>
                        <td className="px-4 py-3 max-w-[140px] truncate">{r.reason || "—"}</td>
                        <td className="px-4 py-3">{statusBadge(r.status)}</td>
                        <td className="px-4 py-3">{r.approved_by || "—"}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "liability" && <LeaveLiability />}

      {/* ── Calendar Tab ── */}
      {tab === "calendar" && (
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="font-bold text-slate-800">Leave Calendar</h2>
            <input type="month" value={calMonth} onChange={e => setCalMonth(e.target.value)} className="px-3 py-1.5 rounded-xl border border-slate-200 text-sm" />
            <Badge tone="blue">{calLeaves.length} approved this month</Badge>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
              <div key={d} className="text-center text-xs font-semibold text-slate-400 py-2">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstDay }).map((_, i) => <div key={`b${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dl = dayLeaves(day);
              return (
                <div key={day} className={`rounded-xl p-1.5 min-h-[56px] text-xs border ${dl.length > 0 ? "bg-blue-50 border-blue-200" : "bg-slate-50 border-transparent"}`}>
                  <div className={`font-semibold mb-0.5 ${dl.length > 0 ? "text-blue-700" : "text-slate-500"}`}>{day}</div>
                  {dl.slice(0, 2).map((l, li) => (
                    <div key={li} className={`truncate text-[10px] ${l.leave_type === "Unpaid" ? "text-red-500" : "text-blue-600"}`}>{l.employee_name || l.employee_id}</div>
                  ))}
                  {dl.length > 2 && <div className="text-[10px] text-blue-400">+{dl.length - 2}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Manual Edit Modal ── */}
      {editBalance && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
            <h3 className="font-bold text-slate-800 mb-0.5">Edit Leave Balance</h3>
            <p className="text-sm text-slate-500 mb-4">{editBalance.employee_code} — {editBalance.full_name}</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500 block mb-1">Opening Balance (total annual entitlement)</label>
                <input type="number" min="0" value={editForm.opening}
                  onChange={e => setEditForm(v => ({ ...v, opening: e.target.value }))}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Already Used (full days taken before import)</label>
                <input type="number" min="0" value={editForm.used}
                  onChange={e => setEditForm(v => ({ ...v, used: e.target.value }))}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Half Leaves Used</label>
                <input type="number" min="0" value={editForm.halfLeaves}
                  onChange={e => setEditForm(v => ({ ...v, halfLeaves: e.target.value }))}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Effective From</label>
                <input type="date" value={editForm.effectiveFrom}
                  onChange={e => setEditForm(v => ({ ...v, effectiveFrom: e.target.value }))}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
              </div>
              <div className={`p-3 rounded-xl text-sm flex justify-between ${editRemaining < 0 ? "bg-red-50 text-red-700" : "bg-slate-50 text-slate-700"}`}>
                <span>Remaining Balance</span>
                <strong>{editRemaining} days</strong>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button onClick={saveBalanceEdit} className="rounded-2xl">Save Changes</Button>
              <Button variant="outline" onClick={() => setEditBalance(null)} className="rounded-2xl">Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
