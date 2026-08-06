import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { Badge, Button, PageTitle } from "../components/ui.jsx";
import { money } from "../utils/format.js";
import { approveLeaveStage, rejectLeaveStage, canActOnStage, normalizeStage } from "../services/leaveApprovalService.js";
import { approvePaymentStatusRequest, rejectPaymentStatusRequest, PAYMENT_STATUS_LABELS, requiresMasterOnly } from "../services/payrollControlService.js";
import { approveIncrement as approveIncrementSvc, rejectIncrement as rejectIncrementSvc } from "../services/incrementService.js";
import { approveLoanRequest, rejectLoanRequest, approveLoanChange, rejectLoanChange } from "../services/loanService.js";

// Hierarchy-routed requests carry dynamic stage names ("Pending Floor
// Manager Approval", "Pending Owner Approval", ...) so this can't be a fixed
// whitelist — anything still "Pending ..." counts.
const isPendingLeaveStatus = (s) => !!s?.startsWith("Pending");

function formatAdjTime(t) {
  if (!t) return "—";
  const s = String(t);
  return s.includes("T") ? s.slice(11, 16) : s.slice(0, 5);
}

function StageBadge({ status }) {
  const map = {
    "Pending Supervisor": { tone: "yellow", label: "Awaiting Supervisor" },
    "Pending":            { tone: "yellow", label: "Awaiting Supervisor" },
    "Pending HR":         { tone: "blue",   label: "Awaiting HR" },
    "Pending HR Approval": { tone: "blue",  label: "Awaiting HR" },
    "Approved":           { tone: "green",  label: "Approved" },
  };
  if (map[status]) return <Badge tone={map[status].tone}>{map[status].label}</Badge>;
  if (status?.startsWith("Rejected")) return <Badge tone="red">{status}</Badge>;
  if (status?.startsWith("Pending")) return <Badge tone="yellow">{status.replace("Pending ", "Awaiting ")}</Badge>;
  return <Badge tone="slate">{status}</Badge>;
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
  ["loans",        "Loan Requests"],
  ["payment-status", "Payment Status"],
];

export default function ApprovalQueue({ role, actorName, actorEmployeeCode }) {
  const [tab, setTab] = useState("leave");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  // Leave
  const [leaveReqs, setLeaveReqs] = useState([]);
  const [rejectId, setRejectId] = useState(null);
  const [rejectNote, setRejectNote] = useState("");

  // Guards against approve_salary_increment's "Increment not found or not
  // pending" error firing on a harmless double-click/slow-network retry --
  // the Approve/Reject buttons don't disable themselves while a request is
  // in flight, so a second click for the same row hits it after the first
  // call already flipped its status, and the RPC's own guard raises.
  const [processingIncrementId, setProcessingIncrementId] = useState(null);

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

  // Loan requests
  const [loanRequests, setLoanRequests] = useState([]);
  const [processingLoanId, setProcessingLoanId] = useState(null);

  // Loan change requests (reschedule / skip month)
  const [loanChangeRequests, setLoanChangeRequests] = useState([]);
  const [processingLoanChangeId, setProcessingLoanChangeId] = useState(null);

  // Payment status change requests
  const [paymentRequests, setPaymentRequests] = useState([]);

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
        { data: loanReqs },
        { data: loanChangeReqs },
        { data: payReqs },
      ] = await Promise.all([
        supabase.from("leave_requests").select("*").like("status", "Pending%").order("created_at", { ascending: false }).limit(200),
        supabase.from("timesheet_signoffs").select("*").order("created_at", { ascending: false }).limit(200),
        supabase.from("employees").select("employee_code,full_name,department,branch,supervisor_id").order("full_name"),
        supabase.from("attendance_adjustments").select("*").eq("status", "Pending Approval").order("adjusted_at", { ascending: false }).limit(200),
        supabase.from("one_time_adjustments").select("*").eq("status","Pending").order("created_at", { ascending: false }).limit(200),
        supabase.from("settlement_requests").select("*").neq("status","Completed").order("created_at", { ascending: false }).limit(200),
        supabase.from("salary_increments").select("*").eq("status","Pending").order("created_at", { ascending: false }).limit(200),
        supabase.from("loans").select("*").eq("status","Pending Approval").order("created_at", { ascending: false }).limit(200),
        supabase.from("loan_changes").select("*").eq("status","Pending").order("created_at", { ascending: false }).limit(200),
        supabase.from("payment_status_requests").select("*").eq("status","Pending").order("created_at", { ascending: false }).limit(200),
      ]);
      setLeaveReqs(lv || []);
      setSignoffs(so || []);
      setEmployees(emps || []);
      setAttCorrs(ac || []);
      setAdjustments(adj || []);
      setSettlements(sett || []);
      setIncrements(inc || []);
      setLoanRequests(loanReqs || []);
      setLoanChangeRequests(loanChangeReqs || []);
      setPaymentRequests(payReqs || []);
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

  // ── Attendance correction actions (single-stage: Master/GM approve or reject) ──
  async function approveAttCorr(id) {
    const item = attCorrs.find(a => a.id === id);
    if (!item) return;
    const now = new Date().toISOString();

    await supabase.from("attendance_adjustments").update({
      status: "Approved", approved_by: role, approved_at: now,
    }).eq("id", id);

    // Apply the corrected times to the live attendance record — mirrors the
    // instant-apply logic on the Attendance Adjustments page, just gated
    // behind this approval instead of happening immediately. Locking the row
    // protects it from being overwritten by the next ZKT re-sync.
    const workedHours = (item.adjusted_check_in && item.adjusted_check_out)
      ? Math.max(0, Math.round(((new Date(item.adjusted_check_out) - new Date(item.adjusted_check_in)) / 3600000) * 100) / 100)
      : null;
    const attUpdate = {
      check_in: item.adjusted_check_in, check_out: item.adjusted_check_out,
      first_check_in: item.adjusted_check_in, last_check_out: item.adjusted_check_out,
      ...(workedHours !== null ? { actual_hours: workedHours, worked_hours: workedHours } : {}),
      is_manual_entry: true, manual_entry_by: item.adjusted_by || "HR",
      adjustment_status: "Adjusted", adjustment_approved_by: role,
      review_status: "Locked",
    };
    const { data: existing } = await supabase.from("attendance").select("id")
      .eq("employee_code", item.employee_code).eq("work_date", item.attendance_date).maybeSingle();
    if (existing) {
      await supabase.from("attendance").update(attUpdate).eq("id", existing.id);
    } else {
      await supabase.from("attendance").insert({
        employee_code: item.employee_code, work_date: item.attendance_date, attendance_date: item.attendance_date,
        ...attUpdate,
      });
    }

    await notify(item.adjusted_by, "attendance_adjustment", "Time Adjustment Approved",
      `${role} approved your time adjustment for ${item.employee_code} on ${item.attendance_date}.`);
    setMsg("Time adjustment approved and applied."); loadAll();
  }

  async function rejectAttCorr(id, reason) {
    const item = attCorrs.find(a => a.id === id);
    await supabase.from("attendance_adjustments").update({
      status: "Rejected", rejection_reason: reason, approved_by: role, approved_at: new Date().toISOString(),
    }).eq("id", id);
    if (item) {
      await notify(item.adjusted_by, "attendance_adjustment", "Time Adjustment Rejected",
        `${role} rejected your time adjustment for ${item.employee_code} on ${item.attendance_date}. Reason: ${reason}`);
    }
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
    if (!["Master", "GM"].includes(role)) return setErr("Only Master or GM can approve increments.");
    if (processingIncrementId) return; // already handling this or another row
    setProcessingIncrementId(id);
    try {
      await approveIncrementSvc(id, actorName || role);
      setMsg("Increment approved."); loadAll();
    } catch (e) { setErr(e.message); }
    finally { setProcessingIncrementId(null); }
  }

  async function rejectIncrement(id, reason) {
    if (!["Master", "GM"].includes(role)) return setErr("Only Master or GM can reject increments.");
    if (processingIncrementId) return;
    setProcessingIncrementId(id);
    try {
      await rejectIncrementSvc(id, actorName || role, reason);
      setMsg("Increment rejected."); loadAll();
    } catch (e) { setErr(e.message); }
    finally { setProcessingIncrementId(null); }
  }

  // ── Loan requests ──
  async function approveLoan(id) {
    if (!["Master", "GM"].includes(role)) return setErr("Only Master or GM can approve loan requests.");
    if (processingLoanId) return;
    setProcessingLoanId(id);
    try {
      await approveLoanRequest(id, actorName || role);
      setMsg("Loan request approved."); loadAll();
    } catch (e) { setErr(e.message); }
    finally { setProcessingLoanId(null); }
  }

  async function rejectLoan(id, reason) {
    if (!["Master", "GM"].includes(role)) return setErr("Only Master or GM can reject loan requests.");
    if (processingLoanId) return;
    setProcessingLoanId(id);
    try {
      await rejectLoanRequest(id, actorName || role, reason);
      setMsg("Loan request rejected."); loadAll();
    } catch (e) { setErr(e.message); }
    finally { setProcessingLoanId(null); }
  }

  // ── Loan change requests (reschedule / skip month) ──
  async function approveLoanChangeReq(id) {
    if (!["Master", "GM"].includes(role)) return setErr("Only Master or GM can approve loan change requests.");
    if (processingLoanChangeId) return;
    setProcessingLoanChangeId(id);
    try {
      await approveLoanChange(id, actorName || role);
      setMsg("Loan change approved."); loadAll();
    } catch (e) { setErr(e.message); }
    finally { setProcessingLoanChangeId(null); }
  }

  async function rejectLoanChangeReq(id, reason) {
    if (!["Master", "GM"].includes(role)) return setErr("Only Master or GM can reject loan change requests.");
    if (processingLoanChangeId) return;
    setProcessingLoanChangeId(id);
    try {
      await rejectLoanChange(id, actorName || role, reason);
      setMsg("Loan change rejected."); loadAll();
    } catch (e) { setErr(e.message); }
    finally { setProcessingLoanChangeId(null); }
  }

  // ── Payment status change requests ──
  async function approvePaymentReq(id) {
    const req = paymentRequests.find(r => r.id === id);
    if (!req) return;
    try {
      await approvePaymentStatusRequest(req, role, actorName || role);
      setMsg("Payment status change approved."); loadAll();
    } catch (e) { setErr(e.message); }
  }

  async function rejectPaymentReq(id, reason) {
    const req = paymentRequests.find(r => r.id === id);
    if (!req) return;
    try {
      await rejectPaymentStatusRequest(req, actorName || role, reason);
      setMsg("Payment status change rejected."); loadAll();
    } catch (e) { setErr(e.message); }
  }

  const pendingLeave = leaveReqs.filter(r => isPendingLeaveStatus(r.status));
  const pendingCorr  = attCorrs.filter(a => a.status === "Pending Approval");

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
            {k === "loans"       && (loanRequests.length + loanChangeRequests.length) > 0  && <span className="ml-1.5 bg-red-500 text-white text-[10px] rounded-full px-1.5">{loanRequests.length + loanChangeRequests.length}</span>}
            {k === "payment-status" && paymentRequests.length > 0 && <span className="ml-1.5 bg-red-500 text-white text-[10px] rounded-full px-1.5">{paymentRequests.length}</span>}
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
              <tr>{["Employee","Awaiting","Type","From","To","Days","Stage","Submitted","Action"].map(h => <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pendingLeave.length === 0
                ? <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">No pending leave requests.</td></tr>
                : pendingLeave.map(r => (
                  <tr key={r.id}>
                    <td className="px-4 py-3 font-medium">{r.employee_name || r.employee_id}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{r.current_approver_name || supervisorName(r.employee_code)}</td>
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
                        disabled={!canActOnStage(role, r, actorEmployeeCode)} />
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
                    <td className="px-4 py-3 font-medium">{empMap[a.employee_code]?.full_name || a.employee_code}</td>
                    <td className="px-4 py-3">{a.attendance_date}</td>
                    <td className="px-4 py-3">{formatAdjTime(a.original_check_in)}</td>
                    <td className="px-4 py-3">{formatAdjTime(a.original_check_out)}</td>
                    <td className="px-4 py-3 text-emerald-700">{formatAdjTime(a.adjusted_check_in)}</td>
                    <td className="px-4 py-3 text-emerald-700">{formatAdjTime(a.adjusted_check_out)}</td>
                    <td className="px-4 py-3 max-w-[120px] truncate">{a.reason || "—"}</td>
                    <td className="px-4 py-3"><StageBadge status={a.status} /></td>
                    <td className="px-4 py-3">
                      <ApproveRejectBtns
                        id={a.id} rejectId={rejectId} setRejectId={setRejectId}
                        rejectNote={rejectNote} setRejectNote={setRejectNote}
                        onApprove={approveAttCorr} onReject={rejectAttCorr}
                        disabled={!["Master","GM"].includes(role)} />
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
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>{["Employee","Branch","Old Salary","New Salary","Increment","Effective From","Submitted By","Submitted Date","Action"].map(h => <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {increments.length === 0
                ? <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">No pending increments.</td></tr>
                : increments.map(inc => (
                  <tr key={inc.id}>
                    <td className="px-4 py-3 font-medium">{inc.employee_name || inc.employee_code}</td>
                    <td className="px-4 py-3 text-slate-500">{empMap[inc.employee_code]?.branch || "—"}</td>
                    <td className="px-4 py-3">{money(inc.old_salary || 0)}</td>
                    <td className="px-4 py-3 font-semibold text-emerald-700">{money(inc.new_salary || 0)}</td>
                    <td className="px-4 py-3">
                      <Badge tone="green">+{money((inc.new_salary||0)-(inc.old_salary||0))}</Badge>
                    </td>
                    <td className="px-4 py-3">{inc.effective_from || "—"}</td>
                    <td className="px-4 py-3 text-slate-500">{inc.submitted_by || "HR"}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{inc.created_at?.slice(0, 10) || "—"}</td>
                    <td className="px-4 py-3">
                      <ApproveRejectBtns
                        id={inc.id} rejectId={rejectId} setRejectId={setRejectId}
                        rejectNote={rejectNote} setRejectNote={setRejectNote}
                        onApprove={approveIncrement} onReject={rejectIncrement}
                        disabled={!["Master", "GM"].includes(role) || !!processingIncrementId} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── LOAN REQUESTS ── */}
      {tab === "loans" && !loading && (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
          <div className="px-5 pt-4 pb-2"><h2 className="font-bold text-slate-800">Loan Requests</h2><p className="text-xs text-slate-400">{loanRequests.length} pending</p></div>
          <table className="w-full min-w-[1000px] text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>{["Employee","Loan Amount","Monthly Ded.","Months","Start Date","Guarantors","Reason","Submitted By","Submitted Date","Action"].map(h => <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loanRequests.length === 0
                ? <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-400">No pending loan requests.</td></tr>
                : loanRequests.map(l => (
                  <tr key={l.id}>
                    <td className="px-4 py-3 font-medium">{l.employee_name || l.employee_code}</td>
                    <td className="px-4 py-3 font-semibold">{money(l.loan_amount)}</td>
                    <td className="px-4 py-3">{money(l.monthly_deduction)}</td>
                    <td className="px-4 py-3">{l.repayment_months || "—"}</td>
                    <td className="px-4 py-3">{l.start_date}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {l.guarantor_1_name ? <div>{l.guarantor_1_code} — {l.guarantor_1_name}</div> : null}
                      {l.guarantor_2_name ? <div>{l.guarantor_2_code} — {l.guarantor_2_name}</div> : null}
                      {!l.guarantor_1_name && !l.guarantor_2_name && "—"}
                    </td>
                    <td className="px-4 py-3 max-w-[160px] truncate">{l.reason || "—"}</td>
                    <td className="px-4 py-3 text-slate-500">{l.submitted_by || "HR"}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{l.created_at?.slice(0, 10) || "—"}</td>
                    <td className="px-4 py-3">
                      <ApproveRejectBtns
                        id={l.id} rejectId={rejectId} setRejectId={setRejectId}
                        rejectNote={rejectNote} setRejectNote={setRejectNote}
                        onApprove={approveLoan} onReject={rejectLoan}
                        disabled={!["Master", "GM"].includes(role) || !!processingLoanId} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── LOAN CHANGE REQUESTS (RESCHEDULE / SKIP MONTH) ── */}
      {tab === "loans" && !loading && (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto mt-4">
          <div className="px-5 pt-4 pb-2"><h2 className="font-bold text-slate-800">Loan Change Requests</h2><p className="text-xs text-slate-400">{loanChangeRequests.length} pending — reschedule or skip-month requests on existing loans</p></div>
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>{["Employee","Type","Details","Reason","Submitted By","Submitted Date","Action"].map(h => <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loanChangeRequests.length === 0
                ? <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No pending loan change requests.</td></tr>
                : loanChangeRequests.map(c => (
                  <tr key={c.id}>
                    <td className="px-4 py-3 font-medium">{empMap[c.employee_code]?.full_name || c.employee_code}</td>
                    <td className="px-4 py-3"><Badge tone="blue">{c.change_type === "reschedule" ? "Reschedule" : "Skip Month"}</Badge></td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {c.change_type === "reschedule"
                        ? <>{money(c.old_monthly)}/mo → {money(c.new_monthly)}/mo</>
                        : <>Skip deduction for {c.effective_month || "—"}</>}
                    </td>
                    <td className="px-4 py-3 max-w-[160px] truncate">{c.reason || "—"}</td>
                    <td className="px-4 py-3 text-slate-500">{c.submitted_by || "HR"}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{c.created_at?.slice(0, 10) || "—"}</td>
                    <td className="px-4 py-3">
                      <ApproveRejectBtns
                        id={c.id} rejectId={rejectId} setRejectId={setRejectId}
                        rejectNote={rejectNote} setRejectNote={setRejectNote}
                        onApprove={approveLoanChangeReq} onReject={rejectLoanChangeReq}
                        disabled={!["Master", "GM"].includes(role) || !!processingLoanChangeId} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── PAYMENT STATUS REQUESTS ── */}
      {tab === "payment-status" && !loading && (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
          <div className="px-5 pt-4 pb-2"><h2 className="font-bold text-slate-800">Payment Status Change Requests</h2><p className="text-xs text-slate-400">{paymentRequests.length} pending</p></div>
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>{["Employee","Month","From","To","Reason","Requested By","Action"].map(h => <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paymentRequests.length === 0
                ? <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No pending payment status requests.</td></tr>
                : paymentRequests.map(r => {
                  const masterOnly = requiresMasterOnly(r.current_status, r.requested_status);
                  const canApprove = ["Master", "GM"].includes(role) && !(masterOnly && role !== "Master");
                  return (
                    <tr key={r.id}>
                      <td className="px-4 py-3 font-medium">{r.employee_name}<div className="text-xs text-slate-400">{r.employee_code}</div></td>
                      <td className="px-4 py-3">{r.payroll_month}</td>
                      <td className="px-4 py-3"><Badge tone="slate">{PAYMENT_STATUS_LABELS[r.current_status] || r.current_status}</Badge></td>
                      <td className="px-4 py-3">
                        <Badge tone="blue">{PAYMENT_STATUS_LABELS[r.requested_status] || r.requested_status}</Badge>
                        {masterOnly && <span className="text-[10px] text-purple-600 ml-1">Master only</span>}
                      </td>
                      <td className="px-4 py-3 max-w-[180px] truncate">{r.reason || "—"}</td>
                      <td className="px-4 py-3 text-slate-500">{r.requested_by}</td>
                      <td className="px-4 py-3">
                        <ApproveRejectBtns
                          id={r.id} rejectId={rejectId} setRejectId={setRejectId}
                          rejectNote={rejectNote} setRejectNote={setRejectNote}
                          onApprove={approvePaymentReq} onReject={rejectPaymentReq}
                          disabled={!canApprove} />
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
}
