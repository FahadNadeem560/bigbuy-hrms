import React, { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { Button, Badge, PageTitle } from "../components/ui.jsx";

const LEAVE_TYPES = ["Casual", "Annual", "Sick", "Half Day", "Emergency", "Maternity", "Paternity", "Unpaid"];
const BALANCE_TYPES = ["Annual", "Casual", "Sick", "Unpaid"];

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

export default function LeaveManagement() {
  const [tab, setTab] = useState("apply");
  const [employees, setEmployees] = useState([]);
  const [requests, setRequests] = useState([]);
  const [balances, setBalances] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const [selEmp, setSelEmp] = useState(null);
  const [leaveType, setLeaveType] = useState("Casual");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [reason, setReason] = useState("");

  const [historyFilter, setHistoryFilter] = useState({ type: "All", branch: "All", dept: "", from: "", to: "" });
  const [calMonth, setCalMonth] = useState(() => new Date().toISOString().slice(0, 7));

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [{ data: emps }, { data: reqs }, { data: bals }] = await Promise.all([
        supabase.from("employees").select("employee_code, full_name, department, branch").order("full_name"),
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
    if (!error) { setMsg(`Leave ${status.toLowerCase()}.`); loadAll(); }
  }

  const pending = requests.filter(r => r.status === "Pending");

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

  const typedBalances = useMemo(() => employees.map(emp => {
    const empReqs = requests.filter(r => r.employee_code === emp.employee_code && r.status === "Approved");
    const bal = balances.find(b => b.employee_code === emp.employee_code || b.employee_id === emp.employee_code);
    const typeMap = {};
    BALANCE_TYPES.forEach(t => {
      typeMap[t] = empReqs.filter(r => r.leave_type === t).reduce((s, r) => s + Number(r.days || 1), 0);
    });
    return { ...emp, bal, ...typeMap, total: Object.values(typeMap).reduce((s, v) => s + v, 0) };
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

  const [rejectId, setRejectId] = useState(null);
  const [rejectNote, setRejectNote] = useState("");

  return (
    <div>
      <PageTitle title="Leave Management" subtitle="Apply, approve and track employee leave requests with per-type balance tracking." />
      <div className="flex flex-wrap gap-2 mb-4">
        {[["apply", "Apply Leave"], ["queue", `Approval Queue (${pending.length})`], ["balances", "Balances"], ["history", "History"], ["calendar", "Calendar"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${tab === k ? "bg-slate-950 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{l}</button>
        ))}
      </div>
      {msg && <div className="mb-3 p-3 rounded-xl bg-blue-50 text-blue-700 text-sm">{msg}</div>}
      {err && <div className="mb-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{err}</div>}

      {tab === "apply" && (
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
          <h2 className="font-bold text-slate-800 mb-4">New Leave Application</h2>
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

      {tab === "queue" && (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
          <div className="px-5 pt-4 pb-2 flex items-center justify-between">
            <div><h2 className="font-bold text-slate-800">Leave Approval Queue</h2><p className="text-xs text-slate-400 mt-0.5">{pending.length} pending · {requests.length} total</p></div>
          </div>
          <table className="w-full min-w-[800px] text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>{["Employee", "Type", "From", "To", "Days", "Reason", "Applied", "Status", "Action"].map(h => <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {requests.length === 0
                ? <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">No leave requests found.</td></tr>
                : requests.map(r => (
                  <tr key={r.id}>
                    <td className="px-4 py-3 font-medium">{r.employee_name || r.employee_id}</td>
                    <td className="px-4 py-3"><Badge tone={r.leave_type === "Unpaid" ? "red" : "blue"}>{r.leave_type}</Badge></td>
                    <td className="px-4 py-3">{r.from_date}</td>
                    <td className="px-4 py-3">{r.to_date}</td>
                    <td className="px-4 py-3">{r.days || "—"}</td>
                    <td className="px-4 py-3 max-w-[140px] truncate">{r.reason || "—"}</td>
                    <td className="px-4 py-3">{r.applied_date || r.created_at?.slice(0, 10)}</td>
                    <td className="px-4 py-3">{statusBadge(r.status)}</td>
                    <td className="px-4 py-3">
                      {r.status === "Pending" && (
                        rejectId === r.id
                          ? <div className="flex flex-col gap-1">
                              <input value={rejectNote} onChange={e => setRejectNote(e.target.value)} placeholder="Rejection note..." className="px-2 py-1 rounded-xl border border-slate-200 text-xs" />
                              <div className="flex gap-1">
                                <Button onClick={() => { updateStatus(r.id, "Rejected", rejectNote); setRejectId(null); setRejectNote(""); }} className="rounded-xl text-xs py-1 px-2">Confirm</Button>
                                <Button variant="outline" onClick={() => setRejectId(null)} className="rounded-xl text-xs py-1 px-2">Cancel</Button>
                              </div>
                            </div>
                          : <div className="flex gap-1">
                              <Button className="rounded-xl text-xs py-1 px-2" onClick={() => updateStatus(r.id, "Approved")}>Approve</Button>
                              <Button variant="outline" className="rounded-xl text-xs py-1 px-2" onClick={() => setRejectId(r.id)}>Reject</Button>
                            </div>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "balances" && (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
          <div className="px-5 pt-4 pb-2"><h2 className="font-bold text-slate-800">Leave Balances by Type</h2><p className="text-xs text-slate-400">Days used per type (approved requests)</p></div>
          <table className="w-full min-w-[700px] text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr><th className="text-left px-4 py-3 font-medium">Employee</th><th className="text-left px-4 py-3 font-medium">Department</th>{BALANCE_TYPES.map(t => <th key={t} className="text-center px-4 py-3 font-medium">{t}</th>)}<th className="text-center px-4 py-3 font-medium">Total Used</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {typedBalances.filter(e => e.total > 0 || balances.find(b => b.employee_code === e.employee_code)).length === 0
                ? <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No leave balance data found.</td></tr>
                : typedBalances.filter(e => e.total > 0 || balances.find(b => b.employee_code === e.employee_code)).map((e, i) => (
                  <tr key={i}>
                    <td className="px-4 py-3 font-medium">{e.full_name}</td>
                    <td className="px-4 py-3 text-slate-500">{e.department}</td>
                    {BALANCE_TYPES.map(t => (
                      <td key={t} className="px-4 py-3 text-center">
                        {e[t] > 0 ? <Badge tone={t === "Unpaid" ? "red" : "blue"}>{e[t]}</Badge> : <span className="text-slate-300">0</span>}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-center">
                      <Badge tone={e.total > 10 ? "red" : "green"}>{e.total}</Badge>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

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
    </div>
  );
}
