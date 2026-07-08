import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { Badge, Button, PageTitle } from "../components/ui.jsx";
import { money } from "../utils/format.js";
import { approveLeaveStage, rejectLeaveStage, canActOnStage, normalizeStage } from "../services/leaveApprovalService.js";

const PENDING_LEAVE = ["Pending", "Pending Supervisor", "Pending HR", "Pending Supervisor Approval", "Pending Branch Manager Approval", "Pending HR Approval"];

function StageBadge({ status }) {
  const map = {
    "Pending Supervisor": { tone: "yellow", label: "Awaiting Supervisor" },
    "Pending":            { tone: "yellow", label: "Awaiting Supervisor" },
    "Pending HR":         { tone: "blue",   label: "Awaiting HR" },
    "Approved":           { tone: "green",  label: "Approved" },
    "Rejected":           { tone: "red",    label: "Rejected" },
    "Rejected by Supervisor": { tone: "red", label: "Rejected by Sup." },
    "Rejected by HR":     { tone: "red",    label: "Rejected by HR" },
  };
  const { tone = "slate", label = status } = map[status] || { label: status };
  return <Badge tone={tone}>{label}</Badge>;
}

function ApproveRejectBtns({ onApprove, onReject, rejectId, id, setRejectId, rejectNote, setRejectNote, disabled }) {
  if (rejectId === id) return (
    <div className="flex flex-col gap-1 min-w-[160px]">
      <input value={rejectNote} onChange={e => setRejectNote(e.target.value)} placeholder="Reason…" className="px-2 py-1 rounded-xl border border-slate-200 text-xs" />
      <div className="flex gap-1">
        <Button onClick={() => { onReject(id, rejectNote); setRejectId(null); setRejectNote(""); }} className="rounded-xl text-xs py-1 px-2">Confirm</Button>
        <Button variant="outline" onClick={() => setRejectId(null)} className="rounded-xl text-xs py-1 px-2">Cancel</Button>
      </div>
    </div>
  );
  return (
    <div className="flex gap-1">
      <Button onClick={() => onApprove(id)} disabled={disabled} className="rounded-xl text-xs py-1 px-2">Approve</Button>
      <Button variant="outline" onClick={() => setRejectId(id)} className="rounded-xl text-xs py-1 px-2">Reject</Button>
    </div>
  );
}

const TABS = [
  ["leave",        "Leave Approvals"],
  ["timesheet",    "Timesheet Sign-offs"],
  ["attendance",   "Attendance Corrections"],
  ["adjustments",  "One-Time Adjustments"],
  ["settlements",  "Final Settlements"],
  ["increments",   "Salary Increments"],
];

export default function ApprovalQueue({ role, actorName }) {
  const [tab, setTab] = useState("leave");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  // Leave
  const [leaveReqs, setLeaveReqs] = useState([]);
  const [rejectId, setRejectId] = useState(null);
  const [rejectNote, setRejectNote] = useState("");

  // Timesheet
  const [signoffs, setSignoffs] = useState([]);
  const [employees, setEmployees] = useState([]);

  // Attendance corrections
  const [attCorrs, setAttCorrs] = useState([]);

  // Adjustments
  const [adjustments, setAdjustments] = useState([]);

  // Settlements
  const [settlements, setSettlements] = useState([]);

  // Increments
  const [increments, setIncrements] = useState([]);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    setErr("");
    try {
      const [
        { data: lv },
        { data: so },
        { data: emps },
        { data: ac },
        { data: adj },
        { data: sett },
        { data: inc },
      ] = await Promise.all([
        supabase.from("leave_requests").select("*").in("status", PENDING_LEAVE).order("created_at", { ascending: false }).limit(200),
        supabase.from("timesheet_signoffs").select("*").order("created_at", { ascending: false }).limit(200),
        supabase.from("employees").select("employee_code,full_name,department,branch,supervisor_id").order("full_name"),
        supabase.from("attendance_adjustments").select("*").in("status", ["Pending Supervisor","Pending HR"]).order("created_at", { ascending: false }).limit(200),
        supabase.from("one_time_adjustments").select("*").eq("status","Pending").order("created_at", { ascending: false }).limit(200),
        supabase.from("settlement_requests").select("*").neq("status","Completed").order("created_at", { ascending: false }).limit(200),
        supabase.from("salary_increments").select("*").eq("status","Pending").order("created_at", { ascending: false }).limit(200),
      ]);
      setLeaveReqs(lv || []);
      setSignoffs(so || []);
      setEmployees(emps || []);
      setAttCorrs(ac || []);
      setAdjustments(adj || []);
      setSettlements(sett || []);
      setIncrements(inc || []);
    } catch (e) {
      setErr(`Load error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  const empMap = useMemo(() => Object.fromEntries(employees.map(e => [e.employee_code, e])), [employees]);

  function supervisorName(empCode) {
    const emp = empMap[empCode];
    if (!emp?.supervisor_id) return "—";
    return empMap[emp.supervisor_id]?.full_name || emp.supervisor_id;
  }

  async function notify(recipientRole, type, title, message) {
    await supabase.from("notifications").insert({ recipient_role: recipientRole, type, title, message, is_read: false }).then(() => {});
  }

  // ── Leave actions (shared chain logic with LeaveManagement.jsx's Queue tab) ──
  async function approveLeave(id) {
    const req = leaveReqs.find(r => r.id === id);
    if (!req) return;
    const branch = empMap[req.employee_code]?.branch || null;
    try {
      const target = await approveLeaveStage({ ...req, branch }, role, actorName || role);
      setMsg(`Leave ${target === "Approved" ? "approved" : "forwarded to next stage"}.`);
      loadAll();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function rejectLeave(id, reason) {
    const req = leaveReqs.find(r => r.id === id);
    if (!req) return;
    const branch = empMap[req.employee_code]?.branch || null;
    try {
      await rejectLeaveStage({ ...req, branch }, role, actorName || role, reason);
      setMsg("Leave rejected.");
      loadAll();
    } catch (e) {
      setErr(e.message);
    }
  }

  // ── Attendance correction actions ──
  async function approveAttCorr(id) {
    const item = attCorrs.find(a => a.id === id);
    const newStatus = item?.status === "Pending Supervisor" ? "Pending HR" : "Completed";
    await supabase.from("attendance_adjustments").update({ status: newStatus, approved_by: role }).eq("id", id);
    setMsg(`Correction ${newStatus === "Completed" ? "approved" : "forwarded to HR"}.`); loadAll();
  }

  async function rejectAttCorr(id, reason) {
    await supabase.from("attendance_adjustments").update({ status: "Rejected", rejection_reason: reason }).eq("id", id);
    setMsg("Correction rejected."); loadAll();
  }

  // ── One-time adjustment actions ──
  async function approveAdj(id) {
    const a = adjustments.find(x => x.id === id);
    await supabase.from("one_time_adjustments").update({ status: "Approved", approved_by: role, approved_at: new Date().toISOString() }).eq("id", id);
    await notify("HR", "adjustment", "Adjustment Approved", `${a?.employee_name}'s ${a?.type} of ${money(a?.amount)} approved.`);
    setMsg("Adjustment approved."); loadAll();
  }

  async function rejectAdj(id, reason) {
    await supabase.from("one_time_adjustments").update({ status: "Rejected", rejection_reason: reason, approved_by: role }).eq("id", id);
    setMsg("Adjustment rejected."); loadAll();
  }

  // ── Settlement actions ──
  async function approveSettlement(id) {
    await supabase.from("settlement_requests").update({ status: "Approved by HR", approved_by: role, approved_at: new Date().toISOString() }).eq("id", id);
    setMsg("Settlement approved."); loadAll();
  }

  async function rejectSettlement(id, reason) {
    await supabase.from("settlement_requests").update({ status: "Rejected", rejection_reason: reason }).eq("id", id);
    setMsg("Settlement rejected."); loadAll();
  }

  // ── Increment actions ──
  async function approveIncrement(id) {
    const inc = increments.find(x => x.id === id);
    await supabase.from("salary_increments").update({ status: "Approved", approved_by: role, approved_at: new Date().toISOString() }).eq("id", id);
    await notify("HR", "payroll", "Increment Approved", `Increment for ${inc?.employee_name} approved.`);
    setMsg("Increment approved."); loadAll();
  }

  async function rejectIncrement(id, reason) {
    await supabase.from("salary_increments").update({ status: "Rejected", rejection_reason: reason }).eq("id", id);
    setMsg("Increment rejected."); loadAll();
  }

  const pendingLeave = leaveReqs.filter(r => PENDING_LEAVE.includes(r.status));
  const pendingCorr  = attCorrs.filter(a => ["Pending Supervisor","Pending HR"].includes(a.status));

  return (
    <div>
      <PageTitle title="Approval Queue" subtitle="Review and action all pending requests across the organisation." />

      {msg && <div className="mb-4 p-3 rounded-xl bg-blue-50 text-blue-700 text-sm">{msg}</div>}
      {err && <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{err}</div>}

      <div className="flex flex-wrap gap-2 mb-5">
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${tab === k ? "bg-slate-950 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            {l}
            {k === "leave"       && pendingLeave.length > 0  && <span className="ml-1.5 bg-red-500 text-white text-[10px] rounded-full px-1.5">{pendingLeave.length}</span>}
            {k === "attendance"  && pendingCorr.length > 0   && <span className="ml-1.5 bg-red-500 text-white text-[10px] rounded-full px-1.5">{pendingCorr.length}</span>}
            {k === "adjustments" && adjustments.length > 0   && <span className="ml-1.5 bg-red-500 text-white text-[10px] rounded-full px-1.5">{adjustments.length}</span>}
            {k === "settlements" && settlements.length > 0   && <span className="ml-1.5 bg-red-500 text-white text-[10px] rounded-full px-1.5">{settlements.length}</span>}
            {k === "increments"  && increments.length > 0    && <span className="ml-1.5 bg-red-500 text-white text-[10px] rounded-full px-1.5">{increments.length}</span>}
          </button>
        ))}
      </div>

      {loading && <div className="text-center py-8 text-slate-400">Loading…</div>}

      {/* ── LEAVE ── */}
      {tab === "leave" && !loading && (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
          <div className="px-5 pt-4 pb-2"><h2 className="font-bold text-slate-800">Leave Approval Queue</h2><p className="text-xs text-slate-400">{pendingLeave.length} pending</p></div>
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>{["Employee","Supervisor","Type","From","To","Days","Stage","Submitted","Action"].map(h => <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pendingLeave.length === 0
                ? <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">No pending leave requests.</td></tr>
                : pendingLeave.map(r => (
                  <tr key={r.id}>
                    <td className="px-4 py-3 font-medium">{r.employee_name || r.employee_id}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{supervisorName(r.employee_code)}</td>
                    <td className="px-4 py-3"><Badge tone="blue">{r.leave_type}</Badge></td>
                    <td className="px-4 py-3">{r.from_date}</td>
                    <td className="px-4 py-3">{r.to_date}</td>
                    <td className="px-4 py-3">{r.days || "—"}</td>
                    <td className="px-4 py-3"><StageBadge status={r.status} /></td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{r.applied_date || r.created_at?.slice(0,10)}</td>
                    <td className="px-4 py-3">
                      <ApproveRejectBtns
                        id={r.id} rejectId={rejectId} setRejectId={setRejectId}
                        rejectNote={rejectNote} setRejectNote={setRejectNote}
                        onApprove={approveLeave} onReject={rejectLeave}
                        disabled={!canActOnStage(role, r.status)} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── TIMESHEET ── */}
      {tab === "timesheet" && !loading && (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
          <div className="px-5 pt-4 pb-2"><h2 className="font-bold text-slate-800">Timesheet Sign-offs</h2><p className="text-xs text-slate-400">{signoffs.length} records</p></div>
          <table className="w-full min-w-[800px] text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>{["Employee","Month","Supervisor","HR Review","Payroll Ready","Action"].map(h => <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {signoffs.length === 0
                ? <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No timesheet records. Supervisors sign off from their portal.</td></tr>
                : signoffs.map(s => (
                  <tr key={s.id}>
                    <td className="px-4 py-3 font-medium">{s.employee_name || s.employee_code}</td>
                    <td className="px-4 py-3">{s.month}</td>
                    <td className="px-4 py-3">{s.supervisor_signed_off ? <Badge tone="green">Signed Off</Badge> : <Badge tone="yellow">Pending</Badge>}</td>
                    <td className="px-4 py-3">{s.hr_reviewed ? <Badge tone="green">Reviewed</Badge> : <Badge tone="slate">Pending</Badge>}</td>
                    <td className="px-4 py-3">{s.payroll_ready ? <Badge tone="green">Ready</Badge> : <Badge tone="slate">Not Ready</Badge>}</td>
                    <td className="px-4 py-3">
                      {s.supervisor_signed_off && !s.hr_reviewed && (
                        <Button onClick={async () => {
                          await supabase.from("timesheet_signoffs").update({ hr_reviewed: true, payroll_ready: true }).eq("id", s.id);
                          setMsg("Timesheet HR-reviewed."); loadAll();
                        }} className="rounded-xl text-xs py-1 px-2">Mark HR Reviewed</Button>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── ATTENDANCE CORRECTIONS ── */}
      {tab === "attendance" && !loading && (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
          <div className="px-5 pt-4 pb-2"><h2 className="font-bold text-slate-800">Attendance Corrections</h2><p className="text-xs text-slate-400">{pendingCorr.length} pending</p></div>
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>{["Employee","Date","Orig In","Orig Out","Adj In","Adj Out","Reason","Stage","Action"].map(h => <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pendingCorr.length === 0
                ? <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">No pending attendance corrections.</td></tr>
                : pendingCorr.map(a => (
                  <tr key={a.id}>
                    <td className="px-4 py-3 font-medium">{a.employee_name || a.employee_code}</td>
                    <td className="px-4 py-3">{a.work_date}</td>
                    <td className="px-4 py-3">{a.original_in || "—"}</td>
                    <td className="px-4 py-3">{a.original_out || "—"}</td>
                    <td className="px-4 py-3 text-emerald-700">{a.adjusted_in || "—"}</td>
                    <td className="px-4 py-3 text-emerald-700">{a.adjusted_out || "—"}</td>
                    <td className="px-4 py-3 max-w-[120px] truncate">{a.reason || "—"}</td>
                    <td className="px-4 py-3"><StageBadge status={a.status} /></td>
                    <td className="px-4 py-3">
                      <ApproveRejectBtns
                        id={a.id} rejectId={rejectId} setRejectId={setRejectId}
                        rejectNote={rejectNote} setRejectNote={setRejectNote}
                        onApprove={approveAttCorr} onReject={rejectAttCorr}
                        disabled={a.status === "Pending Supervisor" && role !== "Master"} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── ONE-TIME ADJUSTMENTS ── */}
      {tab === "adjustments" && !loading && (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
          <div className="px-5 pt-4 pb-2"><h2 className="font-bold text-slate-800">One-Time Adjustments</h2><p className="text-xs text-slate-400">{adjustments.length} pending</p></div>
          <table className="w-full min-w-[800px] text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>{["Employee","Type","Amount","Month","Submitted By","Reason","Action"].map(h => <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {adjustments.length === 0
                ? <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No pending adjustments.</td></tr>
                : adjustments.map(a => (
                  <tr key={a.id}>
                    <td className="px-4 py-3 font-medium">{a.employee_name || a.employee_code}</td>
                    <td className="px-4 py-3"><Badge tone={["Deduction","Penalty","Fine"].includes(a.type) ? "red" : "blue"}>{a.type}</Badge></td>
                    <td className="px-4 py-3 font-semibold">{money(a.amount)}</td>
                    <td className="px-4 py-3">{a.payroll_month}</td>
                    <td className="px-4 py-3 text-slate-500">{a.submitted_by || "HR"}</td>
                    <td className="px-4 py-3 max-w-[140px] truncate">{a.reason || "—"}</td>
                    <td className="px-4 py-3">
                      <ApproveRejectBtns
                        id={a.id} rejectId={rejectId} setRejectId={setRejectId}
                        rejectNote={rejectNote} setRejectNote={setRejectNote}
                        onApprove={approveAdj} onReject={rejectAdj} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── FINAL SETTLEMENTS ── */}
      {tab === "settlements" && !loading && (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
          <div className="px-5 pt-4 pb-2"><h2 className="font-bold text-slate-800">Final Settlements</h2><p className="text-xs text-slate-400">{settlements.length} pending</p></div>
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>{["Employee","Branch","Resign Date","Last Working Day","Net Settlement","Supervisor","Status","Action"].map(h => <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {settlements.length === 0
                ? <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No pending settlements.</td></tr>
                : settlements.map(s => (
                  <tr key={s.id}>
                    <td className="px-4 py-3 font-medium">{s.employee_name || s.employee_code}</td>
                    <td className="px-4 py-3">{s.branch || "—"}</td>
                    <td className="px-4 py-3">{s.resign_date || "—"}</td>
                    <td className="px-4 py-3">{s.last_working_day || "—"}</td>
                    <td className="px-4 py-3 font-semibold text-emerald-700">{money(s.net_settlement || 0)}</td>
                    <td className="px-4 py-3 text-slate-500">{supervisorName(s.employee_code)}</td>
                    <td className="px-4 py-3"><StageBadge status={s.status} /></td>
                    <td className="px-4 py-3">
                      <ApproveRejectBtns
                        id={s.id} rejectId={rejectId} setRejectId={setRejectId}
                        rejectNote={rejectNote} setRejectNote={setRejectNote}
                        onApprove={approveSettlement} onReject={rejectSettlement} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── SALARY INCREMENTS ── */}
      {tab === "increments" && !loading && (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
          <div className="px-5 pt-4 pb-2"><h2 className="font-bold text-slate-800">Salary Increments</h2><p className="text-xs text-slate-400">{increments.length} pending</p></div>
          <table className="w-full min-w-[800px] text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>{["Employee","Old Salary","New Salary","Increment","Effective From","Submitted By","Action"].map(h => <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {increments.length === 0
                ? <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No pending increments.</td></tr>
                : increments.map(inc => (
                  <tr key={inc.id}>
                    <td className="px-4 py-3 font-medium">{inc.employee_name || inc.employee_code}</td>
                    <td className="px-4 py-3">{money(inc.old_salary || 0)}</td>
                    <td className="px-4 py-3 font-semibold text-emerald-700">{money(inc.new_salary || 0)}</td>
                    <td className="px-4 py-3">
                      <Badge tone="green">+{money((inc.new_salary||0)-(inc.old_salary||0))}</Badge>
                    </td>
                    <td className="px-4 py-3">{inc.effective_from || "—"}</td>
                    <td className="px-4 py-3 text-slate-500">{inc.submitted_by || "HR"}</td>
                    <td className="px-4 py-3">
                      <ApproveRejectBtns
                        id={inc.id} rejectId={rejectId} setRejectId={setRejectId}
                        rejectNote={rejectNote} setRejectNote={setRejectNote}
                        onApprove={approveIncrement} onReject={rejectIncrement} />
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
