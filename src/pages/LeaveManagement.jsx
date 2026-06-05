import React, { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { Button, Badge, PageTitle } from "../components/ui.jsx";

const LEAVE_TYPES = ["Casual", "Annual", "Sick", "Half Day", "Emergency", "Maternity", "Paternity", "Unpaid"];

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

  // Apply form
  const [selEmp, setSelEmp] = useState(null);
  const [leaveType, setLeaveType] = useState("Casual");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [reason, setReason] = useState("");

  // Calendar
  const [calMonth, setCalMonth] = useState(() => new Date().toISOString().slice(0, 7));

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [{ data: emps }, { data: reqs }, { data: bals }] = await Promise.all([
        supabase.from("employees").select("employee_code, full_name, department, branch").order("full_name"),
        supabase.from("leave_requests").select("*").order("created_at", { ascending: false }).limit(300),
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
    const { error } = await supabase.from("leave_requests").insert({
      employee_id: selEmp.employee_code, employee_code: selEmp.employee_code,
      employee_name: selEmp.full_name, leave_type: leaveType,
      from_date: fromDate, to_date: toDate, reason, status: "Pending",
      applied_date: new Date().toISOString().slice(0, 10),
    });
    if (error) return setErr(error.message);
    setMsg("Leave application submitted successfully.");
    setSelEmp(null); setFromDate(""); setToDate(""); setReason("");
    loadAll();
  }

  async function updateStatus(id, status) {
    const { error } = await supabase.from("leave_requests")
      .update({ status, approved_by: "HR", approved_at: new Date().toISOString() }).eq("id", id);
    if (!error) { setMsg(`Leave ${status.toLowerCase()}.`); loadAll(); }
  }

  const pending = requests.filter(r => r.status === "Pending");

  // Calendar helpers
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

  return (
    <div>
      <PageTitle title="Leave Management" subtitle="Apply, approve and track employee leave requests." />
      <div className="flex flex-wrap gap-2 mb-4">
        {[["apply", "Apply Leave"], ["queue", `Approval Queue (${pending.length})`], ["balances", "Balances"], ["calendar", "Calendar"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${tab === k ? "bg-slate-950 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            {l}
          </button>
        ))}
      </div>
      {msg && <div className="mb-3 p-3 rounded-xl bg-blue-50 text-blue-700 text-sm">{msg}</div>}
      {err && <div className="mb-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{err}</div>}

      {tab === "apply" && (
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
          <h2 className="font-bold text-slate-800 mb-4">New Leave Application</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-slate-500 mb-1">Employee</p>
              <EmpPicker employees={employees} value={selEmp} onChange={setSelEmp} />
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Leave Type</p>
              <select value={leaveType} onChange={e => setLeaveType(e.target.value)} className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm">
                {LEAVE_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">From Date</p>
              <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">To Date</p>
              <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
            </div>
            <div className="md:col-span-2">
              <p className="text-xs text-slate-500 mb-1">Reason</p>
              <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="Reason for leave..."
                className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm resize-none" />
            </div>
          </div>
          <div className="mt-4"><Button onClick={submitApplication} className="rounded-2xl">Submit Application</Button></div>
        </div>
      )}

      {tab === "queue" && (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
          <div className="px-5 pt-4 pb-2 flex items-center justify-between">
            <div><h2 className="font-bold text-slate-800">Leave Approval Queue</h2>
              <p className="text-xs text-slate-400 mt-0.5">{pending.length} pending · {requests.length} total</p></div>
          </div>
          <table className="w-full min-w-[750px] text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>{["Employee", "Type", "From", "To", "Reason", "Applied", "Status", "Action"].map(h => <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {requests.length === 0
                ? <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No leave requests found.</td></tr>
                : requests.map(r => (
                  <tr key={r.id}>
                    <td className="px-4 py-3 font-medium">{r.employee_name || r.employee_id}</td>
                    <td className="px-4 py-3">{r.leave_type}</td>
                    <td className="px-4 py-3">{r.from_date}</td>
                    <td className="px-4 py-3">{r.to_date}</td>
                    <td className="px-4 py-3 max-w-[160px] truncate">{r.reason || "—"}</td>
                    <td className="px-4 py-3">{r.applied_date || r.created_at?.slice(0, 10)}</td>
                    <td className="px-4 py-3">{statusBadge(r.status)}</td>
                    <td className="px-4 py-3">
                      {r.status === "Pending" && (
                        <div className="flex gap-1">
                          <Button className="rounded-xl text-xs py-1 px-2" onClick={() => updateStatus(r.id, "Approved")}>Approve</Button>
                          <Button variant="outline" className="rounded-xl text-xs py-1 px-2" onClick={() => updateStatus(r.id, "Rejected")}>Reject</Button>
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
          <div className="px-5 pt-4 pb-2"><h2 className="font-bold text-slate-800">Leave Balances</h2></div>
          <table className="w-full min-w-[600px] text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>{["Employee", "Opening", "Earned", "Used", "Half Leaves", "Remaining"].map(h => <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {balances.length === 0
                ? <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No leave balance data found.</td></tr>
                : balances.map((b, i) => (
                  <tr key={i}>
                    <td className="px-4 py-3 font-medium">{b.employee_name || b.employee_id}</td>
                    <td className="px-4 py-3">{b.opening_balance ?? "—"}</td>
                    <td className="px-4 py-3">{b.earned ?? "—"}</td>
                    <td className="px-4 py-3">{b.used ?? "—"}</td>
                    <td className="px-4 py-3">{b.half_leaves ?? "—"}</td>
                    <td className="px-4 py-3">
                      <Badge tone={Number(b.remaining ?? b.remaining_balance ?? 0) <= 3 ? "red" : "green"}>
                        {b.remaining ?? b.remaining_balance ?? "—"}
                      </Badge>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
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
                    <div key={li} className="truncate text-[10px] text-blue-600">{l.employee_name || l.employee_id}</div>
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
