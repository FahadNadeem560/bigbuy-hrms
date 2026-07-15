import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { money } from "../utils/format.js";
import NotificationBell from "../components/NotificationBell.jsx";
import { approveLeaveStage, rejectLeaveStage, normalizeStage, routeInitialApprover } from "../services/leaveApprovalService.js";

const BASE_TABS = [
  { id: "attendance",  label: "My Attendance",  icon: "⏱️" },
  { id: "leave",       label: "My Leave",        icon: "🌴" },
  { id: "payslips",    label: "My Payslips",     icon: "💰" },
  { id: "warnings",    label: "My Warnings",     icon: "⚠️" },
  { id: "performance", label: "My Performance",  icon: "⭐" },
  { id: "loans",       label: "My Loans",        icon: "💳" },
  { id: "profile",     label: "My Profile",      icon: "🧑" },
];

const BLANK_TIME_LOG = { date: "", timeIn: "", timeOut: "", location: "", remarks: "" };

const SHORT_TOLERANCE = 1.5;
const OT_TOLERANCE = 1.5;
const LATE_WARNING_COUNT = 2;

const LEAVE_TYPES = ["Annual Leave", "Half Day", "Emergency Leave", "Maternity Leave", "Paternity Leave", "Unpaid Leave"];

function formatTime(t) {
  if (!t) return "—";
  const s = String(t);
  if (s.includes("T")) return s.slice(11, 16);
  if (s.length >= 5) return s.slice(0, 5);
  return s;
}

function getDayName(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { weekday: "short" });
}

function SBadge({ children, tone = "slate" }) {
  const tones = {
    green: "bg-emerald-50 text-emerald-700 border-emerald-100",
    red: "bg-red-50 text-red-700 border-red-100",
    yellow: "bg-amber-50 text-amber-700 border-amber-100",
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    slate: "bg-slate-50 text-slate-700 border-slate-100",
    purple: "bg-purple-50 text-purple-700 border-purple-100",
  };
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs border whitespace-nowrap ${tones[tone] || tones.slate}`}>
      {children}
    </span>
  );
}

function StatusBadge({ status }) {
  const map = { Present: "green", Absent: "red", Late: "yellow", "Half Day": "purple", Leave: "blue", Holiday: "slate", Pending: "slate" };
  return <SBadge tone={map[status] || "slate"}>{status}</SBadge>;
}

function InfoRow({ label, value }) {
  return (
    <div className="flex justify-between items-center py-2.5 border-b border-slate-50 last:border-0">
      <span className="text-slate-500 text-sm">{label}</span>
      <span className="font-medium text-slate-800 text-sm text-right">{value || "—"}</span>
    </div>
  );
}

export default function EmployeeSelfService() {
  const [session, setSession] = useState(null);
  const [tab, setTab] = useState("attendance");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // My Team state
  const [team, setTeam] = useState([]);
  const [teamLeave, setTeamLeave] = useState([]);
  const [teamAtt, setTeamAtt] = useState([]);
  const [teamSignoffs, setTeamSignoffs] = useState([]);
  const [teamMsg, setTeamMsg] = useState("");
  const [hasDirectReports, setHasDirectReports] = useState(false);

  // Data
  const [attendance, setAttendance] = useState([]);
  const [leaveBalance, setLeaveBalance] = useState(null);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [payslips, setPayslips] = useState([]);
  const [selectedPayslip, setSelectedPayslip] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [loans, setLoans] = useState([]);
  const [profile, setProfile] = useState(null);

  // Leave form
  const BLANK_LEAVE = { type: "Annual Leave", from: "", to: "", reason: "" };
  const [leaveForm, setLeaveForm] = useState(BLANK_LEAVE);
  const [leaveSubmitting, setLeaveSubmitting] = useState(false);
  const [leaveMsg, setLeaveMsg] = useState("");

  useEffect(() => {
    const raw = localStorage.getItem("employeeSession");
    if (!raw) { window.location.hash = "#employee-login"; return; }
    const sess = JSON.parse(raw);
    setSession(sess);
    loadAll(sess);
  }, []);

  // Team lookup needs the employee's UUID id (for employee_hierarchy.reports_to_employee_id),
  // which only arrives once the profile row loads — the localStorage session only has employee_code.
  useEffect(() => {
    if (profile?.id) loadTeam(profile.id);
  }, [profile?.id]);

  async function loadAll(sess) {
    setLoading(true); setErr("");
    const thirtyAgo = new Date(Date.now() - 30 * 86400e3).toISOString().slice(0, 10);
    try {
      const [
        { data: att },
        { data: lv },
        { data: lvReqs },
        { data: pay },
        { data: warn },
        { data: loanData },
        { data: emp },
      ] = await Promise.all([
        supabase.from("attendance").select("*").eq("employee_code", sess.employee_code).gte("work_date", thirtyAgo).order("work_date", { ascending: false }),
        supabase.from("leaves").select("*").eq("employee_id", sess.employee_code).maybeSingle(),
        supabase.from("leave_requests").select("*").eq("employee_code", sess.employee_code).order("created_at", { ascending: false }),
        supabase.from("payroll").select("*").eq("employee_code", sess.employee_code).order("pay_period_start", { ascending: false }),
        supabase.from("audit_logs").select("*").eq("action", "warning_issued").eq("entity_id", sess.employee_code).order("created_at", { ascending: false }),
        supabase.from("loans").select("*").eq("employee_code", sess.employee_code),
        supabase.from("employees").select("*").eq("employee_code", sess.employee_code).maybeSingle(),
      ]);
      setAttendance(att || []);
      setLeaveBalance(lv || null);
      setLeaveRequests(lvReqs || []);
      setPayslips(pay || []);
      setWarnings(warn || []);
      setLoans(loanData || []);
      setProfile(emp || null);
    } catch (e) {
      setErr(`Failed to load data: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem("employeeSession");
    window.location.hash = "#employee-login";
  }

  // Attendance calculations
  const lateSummary = useMemo(() => {
    const lateRows = attendance.filter(r => Number(r.late_minutes || 0) > 0);
    const totalLateCount = lateRows.length;
    const totalLateMins = lateRows.reduce((s, r) => s + Number(r.late_minutes || 0), 0);
    const deductibleLates = Math.max(0, totalLateCount - LATE_WARNING_COUNT);
    return { totalLateCount, totalLateMins, deductibleLates };
  }, [attendance]);

  const shortSummary = useMemo(() => {
    const totalShort = Math.round(attendance.reduce((s, r) => s + Number(r.short_hours || 0), 0) * 100) / 100;
    const deductibleShort = Math.round(Math.max(0, totalShort - SHORT_TOLERANCE) * 100) / 100;
    return { totalShort, deductibleShort };
  }, [attendance]);

  const otSummary = useMemo(() => {
    const totalOT = Math.round(attendance.reduce((s, r) => s + Number(r.ot_hours || r.overtime_hours || 0), 0) * 100) / 100;
    const payableOT = Math.round(Math.max(0, totalOT - OT_TOLERANCE) * 100) / 100;
    return { totalOT, payableOT };
  }, [attendance]);

  // A leave request can be actioned here if it's still on the legacy fixed
  // chain's first stage (any listed supervisor could act, matching the old
  // behavior), or if the dynamic hierarchy chain has routed it specifically
  // to this employee (it may have moved past them via escalation).
  function canActOnTeamRequest(request, myCode) {
    const stage = normalizeStage(request.status);
    if (!request.current_approver_id) return stage === "Pending Supervisor Approval";
    return request.current_approver_code === myCode;
  }

  async function loadTeam(myId) {
    try {
      const { data: reportsRows } = await supabase.from("employee_hierarchy")
        .select("employee_id, employee_code")
        .eq("reports_to_employee_id", myId).eq("is_active", true);
      const teamCodes = (reportsRows || []).map(r => r.employee_code);
      setHasDirectReports(teamCodes.length > 0);
      if (teamCodes.length === 0) {
        setTeam([]); setTeamLeave([]); setTeamAtt([]); setTeamSignoffs([]);
        return;
      }
      const today = new Date().toISOString().slice(0, 10);
      const month = today.slice(0, 7);
      const [{ data: members }, { data: lv }, { data: att }, { data: so }] = await Promise.all([
        supabase.from("employees").select("employee_code,full_name,designation,department,branch").in("employee_code", teamCodes).eq("status", "Active"),
        supabase.from("leave_requests").select("*").in("employee_code", teamCodes).like("status", "Pending%").order("created_at", { ascending: false }),
        supabase.from("attendance").select("employee_code,attendance_status,check_in,check_out,work_date").eq("work_date", today).in("employee_code", teamCodes),
        supabase.from("timesheet_signoffs").select("*").eq("month", month).in("employee_code", teamCodes),
      ]);
      setTeam(members || []);
      // HR-terminal-stage requests are HR's job from the main app, not shown here.
      setTeamLeave((lv || []).filter(r => normalizeStage(r.status) !== "Pending HR Approval"));
      setTeamAtt(att || []);
      setTeamSignoffs(so || []);
    } catch { /* ignore */ }
  }

  async function approveSupervisorLeave(request) {
    try {
      const emp = team.find(m => m.employee_code === request.employee_code);
      const target = await approveLeaveStage({ ...request, branch: emp?.branch || session.branch }, "Supervisor", session.name);
      setTeamMsg(target === "Approved" ? "Leave approved." : "Leave approved and forwarded to the next approver.");
      loadTeam(profile.id);
    } catch (e) {
      setTeamMsg(`Error: ${e.message}`);
    }
  }

  async function rejectSupervisorLeave(request, reason) {
    try {
      const emp = team.find(m => m.employee_code === request.employee_code);
      await rejectLeaveStage({ ...request, branch: emp?.branch || session.branch }, "Supervisor", session.name, reason);
      setTeamMsg("Leave rejected.");
      loadTeam(profile.id);
    } catch (e) {
      setTeamMsg(`Error: ${e.message}`);
    }
  }

  async function signOffTimesheet(empCode, empName) {
    const month = new Date().toISOString().slice(0, 7);
    const existing = teamSignoffs.find(s => s.employee_code === empCode && s.month === month);
    if (existing) {
      await supabase.from("timesheet_signoffs").update({ supervisor_signed_off: true, supervisor_code: session.employee_code, supervisor_name: session.name, signed_at: new Date().toISOString() }).eq("id", existing.id);
    } else {
      await supabase.from("timesheet_signoffs").insert({ employee_code: empCode, employee_name: empName, month, supervisor_signed_off: true, supervisor_code: session.employee_code, supervisor_name: session.name, signed_at: new Date().toISOString(), hr_reviewed: false, payroll_ready: false });
    }
    await supabase.from("notifications").insert({ recipient_role: "HR", type: "timesheet_signoff", title: "Timesheet Signed Off", message: `Supervisor signed off ${empName}'s ${month} timesheet.`, is_read: false });
    setTeamMsg(`Timesheet signed off for ${empName}.`); loadTeam(profile.id);
  }

  async function submitLeave(e) {
    e.preventDefault();
    if (!leaveForm.from || !leaveForm.to) return;
    setLeaveSubmitting(true); setLeaveMsg("");
    try {
      const routing = await routeInitialApprover(session.employee_code);
      const { error } = await supabase.from("leave_requests").insert({
        employee_code: session.employee_code,
        leave_type: leaveForm.type,
        start_date: leaveForm.from,
        end_date: leaveForm.to,
        reason: leaveForm.reason,
        ...routing,
        from_date: leaveForm.from, to_date: leaveForm.to,
        employee_name: session.name,
        applied_date: new Date().toISOString().slice(0, 10),
        approval_trail: [], stage_entered_at: new Date().toISOString(),
      });
      if (error) throw error;
      setLeaveMsg(`Leave request submitted. ${routing.status === "Pending HR Approval" ? "Pending HR approval." : `Pending ${routing.current_approver_name}'s approval.`}`);
      setLeaveForm(BLANK_LEAVE);
      const { data } = await supabase.from("leave_requests").select("*").eq("employee_code", session.employee_code).order("created_at", { ascending: false });
      setLeaveRequests(data || []);
    } catch (e) {
      setLeaveMsg(`Error: ${e.message}`);
    } finally {
      setLeaveSubmitting(false);
    }
  }

  if (!session) return null;

  const [timeLogForm, setTimeLogForm] = useState(BLANK_TIME_LOG);
  const [timeLogSubmitting, setTimeLogSubmitting] = useState(false);
  const [timeLogMsg, setTimeLogMsg] = useState("");
  const [myTimeEntries, setMyTimeEntries] = useState([]);

  useEffect(() => {
    if (session) {
      supabase.from("attendance").select("*")
        .eq("employee_code", session.employee_code)
        .eq("is_manual_entry", true)
        .order("work_date", { ascending: false }).limit(50)
        .then(({ data }) => setMyTimeEntries(data || []));
    }
  }, [session, timeLogMsg]);

  async function submitTimeLog(e) {
    e.preventDefault();
    if (!timeLogForm.date || !timeLogForm.timeIn || !timeLogForm.timeOut) {
      setTimeLogMsg("Date, time-in and time-out are required."); return;
    }
    // Enforce 48-hour window
    const entryDate = new Date(timeLogForm.date + "T00:00:00");
    const cutoff = new Date(Date.now() - 48 * 3600e3);
    if (entryDate < cutoff) { setTimeLogMsg("Date must be within the last 48 hours."); return; }
    setTimeLogSubmitting(true); setTimeLogMsg("");
    try {
      const inTime = timeLogForm.date + "T" + timeLogForm.timeIn + ":00";
      const outTime = timeLogForm.date + "T" + timeLogForm.timeOut + ":00";
      const inMin = timeLogForm.timeIn.split(":").reduce((h, m) => h * 60 + parseInt(m), 0);
      const outMin = timeLogForm.timeOut.split(":").reduce((h, m) => h * 60 + parseInt(m), 0);
      const actualHours = Math.max(0, Math.round((outMin - inMin) / 60 * 100) / 100);
      const { error } = await supabase.from("attendance").insert({
        employee_code: session.employee_code,
        work_date: timeLogForm.date,
        check_in: inTime, check_out: outTime,
        actual_hours: actualHours,
        attendance_status: "Pending",
        is_manual_entry: true,
        manual_entry_by: session.employee_code,
        manual_entry_status: "Pending",
        created_at: new Date().toISOString(),
      });
      if (error) throw error;
      await supabase.from("notifications").insert({
        recipient_role: "HR", type: "manual_time_entry",
        title: "Manual Time Entry Submitted",
        message: `${session.name} submitted time entry for ${timeLogForm.date}: ${timeLogForm.timeIn} – ${timeLogForm.timeOut}. ${timeLogForm.location ? "Location: " + timeLogForm.location : ""}`,
        is_read: false, created_at: new Date().toISOString(),
      }).then(() => {});
      setTimeLogMsg("Time entry submitted. HR will review and approve.");
      setTimeLogForm(BLANK_TIME_LOG);
    } catch (ex) {
      setTimeLogMsg(`Error: ${ex.message}`);
    } finally {
      setTimeLogSubmitting(false);
    }
  }

  const isFieldEmployee = profile?.is_field_employee;
  const isSupervisor = hasDirectReports;
  const TABS = [
    ...BASE_TABS,
    ...(isFieldEmployee ? [{ id: "logtime", label: "Log My Time", icon: "📍" }] : []),
    ...(isSupervisor ? [{ id: "myteam", label: "My Team", icon: "👥" }] : []),
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-slate-950 text-white px-5 py-3.5 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">🛒</span>
            <span className="text-lg font-bold">Big Buy HRMS</span>
          </div>
          <div className="hidden md:block w-px h-5 bg-slate-700" />
          <div className="hidden md:block">
            <div className="text-sm font-semibold">{session.name}</div>
            <div className="text-slate-400 text-xs">{session.designation || "Employee"} · {session.department} · {session.branch}</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-white [&_button]:text-white [&_button:hover]:bg-slate-800">
            <NotificationBell role="Employee" employeeCode={session.employee_code} />
          </div>
          <button onClick={logout}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm transition text-slate-200">
            Logout
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-4 md:p-6">
        {/* Employee Bar */}
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-bold text-slate-900 text-lg">{session.name}</div>
            <div className="text-xs text-slate-400 mt-0.5">
              {session.employee_id} &nbsp;·&nbsp; {session.designation || "Employee"} &nbsp;·&nbsp; {session.department} &nbsp;·&nbsp; {session.branch}
            </div>
          </div>
          <SBadge tone="green">Active</SBadge>
        </div>

        {err && <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{err}</div>}

        {/* Tab Bar */}
        <div className="bg-white border border-slate-100 rounded-2xl p-1.5 shadow-sm mb-4 flex flex-wrap gap-1">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition ${tab === t.id ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
              <span>{t.icon}</span>
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="bg-white border border-slate-100 rounded-2xl p-16 text-center text-slate-400 shadow-sm">
            <div className="text-3xl mb-3">⏳</div>
            <p>Loading your data…</p>
          </div>
        ) : (
          <>
            {/* ───── TAB: My Attendance ───── */}
            {tab === "attendance" && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Late */}
                  <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="h-8 w-8 rounded-xl bg-amber-50 flex items-center justify-center">⏰</span>
                      <h3 className="font-bold text-slate-800">Late Summary</h3>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Late Days (30d)</span>
                        <SBadge tone={lateSummary.totalLateCount > 0 ? "yellow" : "green"}>{lateSummary.totalLateCount}</SBadge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Total Minutes</span>
                        <span className="font-semibold">{lateSummary.totalLateMins} min</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 text-xs">Warning (first {LATE_WARNING_COUNT})</span>
                        <span className="text-amber-500 text-xs">{Math.min(lateSummary.totalLateCount, LATE_WARNING_COUNT)}</span>
                      </div>
                      <div className="h-px bg-slate-100" />
                      <div className="flex justify-between font-semibold">
                        <span className="text-slate-700">Deductible Lates</span>
                        <SBadge tone={lateSummary.deductibleLates > 0 ? "red" : "green"}>{lateSummary.deductibleLates}</SBadge>
                      </div>
                    </div>
                  </div>

                  {/* Short Hours */}
                  <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="h-8 w-8 rounded-xl bg-red-50 flex items-center justify-center">⏱️</span>
                      <h3 className="font-bold text-slate-800">Short Hours</h3>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Total Short</span>
                        <span className="font-semibold">{shortSummary.totalShort} hrs</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 text-xs">Tolerance</span>
                        <span className="text-slate-400 text-xs">{SHORT_TOLERANCE} hrs</span>
                      </div>
                      <div className="h-px bg-slate-100" />
                      <div className="flex justify-between font-semibold">
                        <span className="text-slate-700">Deductible</span>
                        <SBadge tone={shortSummary.deductibleShort > 0 ? "red" : "green"}>{shortSummary.deductibleShort} hrs</SBadge>
                      </div>
                    </div>
                  </div>

                  {/* OT */}
                  <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="h-8 w-8 rounded-xl bg-blue-50 flex items-center justify-center">💼</span>
                      <h3 className="font-bold text-slate-800">Overtime</h3>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Total OT (30d)</span>
                        <span className="font-semibold">{otSummary.totalOT} hrs</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 text-xs">Tolerance</span>
                        <span className="text-slate-400 text-xs">{OT_TOLERANCE} hrs</span>
                      </div>
                      <div className="h-px bg-slate-100" />
                      <div className="flex justify-between font-semibold">
                        <span className="text-slate-700">Payable OT</span>
                        <SBadge tone={otSummary.payableOT > 0 ? "blue" : "slate"}>{otSummary.payableOT} hrs</SBadge>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
                  <div className="px-5 pt-4 pb-2">
                    <h2 className="font-bold text-slate-800">Attendance Ledger — Last 30 Days</h2>
                    <p className="text-xs text-slate-400 mt-0.5">{attendance.length} records</p>
                  </div>
                  <table className="w-full min-w-[720px] text-sm">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>{["Date", "Day", "In", "Out", "Hours", "Late (min)", "Short (hrs)", "OT (hrs)", "Status"].map(h => (
                        <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {attendance.length === 0
                        ? <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-400">No attendance records found for the last 30 days.</td></tr>
                        : attendance.map((r, i) => {
                          const status = r.attendance_status || r.status || "Pending";
                          return (
                            <tr key={i} className={status === "Absent" ? "bg-red-50/40" : ""}>
                              <td className="px-4 py-3 font-medium text-slate-800">{r.work_date}</td>
                              <td className="px-4 py-3 text-slate-400 text-xs">{getDayName(r.work_date)}</td>
                              <td className="px-4 py-3">{formatTime(r.check_in || r.time_in)}</td>
                              <td className="px-4 py-3">{formatTime(r.check_out || r.time_out)}</td>
                              <td className="px-4 py-3">{r.actual_hours ?? r.hours_worked ?? 0}</td>
                              <td className="px-4 py-3">{Number(r.late_minutes || 0) > 0 ? <span className="text-amber-600 font-medium">{r.late_minutes}</span> : "0"}</td>
                              <td className="px-4 py-3">{Number(r.short_hours || 0) > 0 ? <span className="text-red-500 font-medium">{r.short_hours}</span> : "0"}</td>
                              <td className="px-4 py-3">{Number(r.ot_hours || r.overtime_hours || 0) > 0 ? <span className="text-blue-600 font-medium">{r.ot_hours ?? r.overtime_hours}</span> : "0"}</td>
                              <td className="px-4 py-3"><StatusBadge status={status} /></td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ───── TAB: My Leave ───── */}
            {tab === "leave" && (
              <div className="space-y-4">
                {/* Leave Balance */}
                <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                  <h2 className="font-bold text-slate-800 mb-4">Leave Balance</h2>
                  {leaveBalance ? (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      {[
                        { label: "Opening Balance", value: leaveBalance.opening_balance },
                        { label: "Earned", value: leaveBalance.earned },
                        { label: "Used", value: leaveBalance.used },
                        { label: "Half Leaves", value: leaveBalance.half_leaves },
                        { label: "Remaining", value: leaveBalance.remaining ?? leaveBalance.remaining_balance, highlight: true },
                      ].map(({ label, value, highlight }) => (
                        <div key={label} className={`text-center rounded-xl p-4 ${highlight ? "bg-emerald-50 border border-emerald-100" : "bg-slate-50"}`}>
                          <div className="text-xs text-slate-500 mb-1">{label}</div>
                          <div className={`text-2xl font-bold ${highlight ? "text-emerald-700" : "text-slate-900"}`}>{value ?? "—"}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400">No leave balance data available. Contact HR.</p>
                  )}
                </div>

                {/* Apply for Leave */}
                <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                  <h2 className="font-bold text-slate-800 mb-4">Apply for Leave</h2>
                  {leaveMsg && (
                    <div className={`mb-4 p-3 rounded-xl text-sm ${leaveMsg.startsWith("Error") ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
                      {leaveMsg}
                    </div>
                  )}
                  <form onSubmit={submitLeave} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Leave Type</p>
                      <select value={leaveForm.type} onChange={e => setLeaveForm(f => ({ ...f, type: e.target.value }))}
                        className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm">
                        {LEAVE_TYPES.map(t => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div />
                    <div>
                      <p className="text-xs text-slate-500 mb-1">From Date</p>
                      <input type="date" value={leaveForm.from} onChange={e => setLeaveForm(f => ({ ...f, from: e.target.value }))} required
                        className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1">To Date</p>
                      <input type="date" value={leaveForm.to} onChange={e => setLeaveForm(f => ({ ...f, to: e.target.value }))} required
                        className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
                    </div>
                    <div className="md:col-span-2">
                      <p className="text-xs text-slate-500 mb-1">Reason</p>
                      <textarea value={leaveForm.reason} onChange={e => setLeaveForm(f => ({ ...f, reason: e.target.value }))} rows={3}
                        placeholder="Brief reason for your leave request…"
                        className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm resize-none" />
                    </div>
                    <div className="md:col-span-2">
                      <button type="submit" disabled={leaveSubmitting}
                        className="px-6 py-2.5 bg-slate-950 text-white rounded-xl text-sm font-medium hover:bg-slate-800 disabled:opacity-50 transition">
                        {leaveSubmitting ? "Submitting…" : "Submit Leave Request"}
                      </button>
                    </div>
                  </form>
                </div>

                {/* History */}
                <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
                  <div className="px-5 pt-4 pb-2">
                    <h2 className="font-bold text-slate-800">Leave Request History</h2>
                    <p className="text-xs text-slate-400 mt-0.5">{leaveRequests.length} requests</p>
                  </div>
                  <table className="w-full min-w-[600px] text-sm">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>{["Type", "From", "To", "Reason", "Status", "Submitted"].map(h => (
                        <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {leaveRequests.length === 0
                        ? <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No leave requests on record.</td></tr>
                        : leaveRequests.map((r, i) => (
                          <tr key={i}>
                            <td className="px-4 py-3">{r.leave_type}</td>
                            <td className="px-4 py-3">{r.start_date}</td>
                            <td className="px-4 py-3">{r.end_date}</td>
                            <td className="px-4 py-3 max-w-[160px] truncate text-slate-500">{r.reason || "—"}</td>
                            <td className="px-4 py-3">
                              <SBadge tone={{ Pending: "yellow", Approved: "green", Rejected: "red" }[r.status] || "slate"}>{r.status}</SBadge>
                            </td>
                            <td className="px-4 py-3 text-slate-400">{r.created_at?.slice(0, 10) || "—"}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ───── TAB: My Payslips ───── */}
            {tab === "payslips" && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Payslip list */}
                <div className="md:col-span-1">
                  <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
                    <h2 className="font-bold text-slate-800 mb-3 px-1">Monthly Payslips</h2>
                    {payslips.length === 0
                      ? <p className="text-slate-400 text-sm px-1">No payslips available yet.</p>
                      : payslips.map((p, i) => (
                        <button key={i} onClick={() => setSelectedPayslip(p)}
                          className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition mb-1 ${selectedPayslip === p ? "bg-slate-950 text-white" : "hover:bg-slate-50 text-slate-700"}`}>
                          <div className="font-medium">{p.pay_period_start?.slice(0, 7) || "—"}</div>
                          <div className={`text-xs mt-0.5 ${selectedPayslip === p ? "text-slate-300" : "text-slate-400"}`}>
                            Net: {money(p.net_pay || 0)} · <span className="capitalize">{p.status || "Draft"}</span>
                          </div>
                        </button>
                      ))}
                  </div>
                </div>

                {/* Payslip detail */}
                <div className="md:col-span-2">
                  {selectedPayslip ? (
                    <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm print:shadow-none print:border-0">
                      <div className="flex justify-between items-start mb-6">
                        <div>
                          <div className="text-xl font-bold text-slate-900">Payslip</div>
                          <div className="text-slate-500 text-sm mt-0.5">{selectedPayslip.pay_period_start?.slice(0, 7)}</div>
                          <div className="text-slate-500 text-sm">{session.name} · {session.employee_id}</div>
                        </div>
                        <div className="flex gap-2 print:hidden">
                          <button onClick={() => window.print()}
                            className="px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition">
                            🖨️ Print
                          </button>
                        </div>
                      </div>

                      <div className="space-y-0 text-sm">
                        {[
                          { label: "Basic Salary", value: money(selectedPayslip.gross || selectedPayslip.basic_salary || 0), color: "text-slate-800" },
                          { label: "OT Amount", value: `+ ${money(selectedPayslip.overtime_amount || selectedPayslip.ot_amount || 0)}`, color: "text-emerald-600" },
                          { label: "Other Allowances", value: `+ ${money(selectedPayslip.allowances || 0)}`, color: "text-emerald-600" },
                          { label: "Late Deduction", value: `- ${money(selectedPayslip.late_deduction || 0)}`, color: "text-red-500" },
                          { label: "Short Hours Deduction", value: `- ${money(selectedPayslip.short_deduction || 0)}`, color: "text-red-500" },
                          { label: "Loan Deduction", value: `- ${money(selectedPayslip.loan_deduction || 0)}`, color: "text-red-500" },
                          { label: "Other Deductions", value: `- ${money(selectedPayslip.other_deductions || (selectedPayslip.deductions && !selectedPayslip.late_deduction ? selectedPayslip.deductions : 0) || 0)}`, color: "text-red-500" },
                        ].map(({ label, value, color }) => (
                          <div key={label} className="flex justify-between items-center py-2.5 border-b border-slate-50">
                            <span className="text-slate-500">{label}</span>
                            <span className={`font-medium ${color}`}>{value}</span>
                          </div>
                        ))}
                        <div className="flex justify-between items-center py-3 px-4 bg-slate-50 rounded-xl mt-3">
                          <span className="font-bold text-slate-900">Net Pay</span>
                          <span className="font-bold text-emerald-700 text-xl">{money(selectedPayslip.net_pay || 0)}</span>
                        </div>
                      </div>

                      <div className="mt-4 flex justify-between items-center text-xs text-slate-400">
                        <SBadge tone={selectedPayslip.status === "Paid" ? "green" : selectedPayslip.status === "Approved" ? "blue" : "yellow"}>
                          {selectedPayslip.status || "Draft"}
                        </SBadge>
                        <span>{selectedPayslip.pay_period_start} — {selectedPayslip.pay_period_end}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-white border border-slate-100 rounded-2xl p-16 text-center text-slate-400 shadow-sm">
                      <div className="text-3xl mb-3">💰</div>
                      <p className="font-medium">Select a month to view your payslip</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ───── TAB: My Warnings ───── */}
            {tab === "warnings" && (
              <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
                <div className="px-5 pt-4 pb-2">
                  <h2 className="font-bold text-slate-800">My Warnings & Notices</h2>
                  <p className="text-xs text-slate-400 mt-0.5">{warnings.length} records · Read-only</p>
                </div>
                <table className="w-full min-w-[580px] text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>{["Date", "Type", "Description", "Level"].map(h => (
                      <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {warnings.length === 0
                      ? <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400">No warnings on record. Keep up the good work!</td></tr>
                      : warnings.map((w, i) => {
                        let details = {};
                        try { details = JSON.parse(w.details || "{}"); } catch {}
                        const levelTones = { "Verbal Warning": "yellow", "Written Warning": "red", "Final Warning": "purple", "Termination": "red" };
                        return (
                          <tr key={i}>
                            <td className="px-4 py-3 whitespace-nowrap">{w.created_at?.slice(0, 10) || "—"}</td>
                            <td className="px-4 py-3">{details.warning_type || details.type || "Warning"}</td>
                            <td className="px-4 py-3 max-w-[220px]">{details.description || details.notes || w.description || "—"}</td>
                            <td className="px-4 py-3">
                              <SBadge tone={levelTones[details.level] || "yellow"}>{details.level || "Verbal Warning"}</SBadge>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}

            {/* ───── TAB: My Performance ───── */}
            {tab === "performance" && (
              <div className="space-y-4">
                <div className="bg-white border border-slate-100 rounded-2xl p-8 text-center shadow-sm">
                  <div className="text-5xl mb-4">⭐</div>
                  <h2 className="font-bold text-slate-800 text-lg mb-2">Performance Ratings</h2>
                  <p className="text-slate-400 text-sm max-w-md mx-auto leading-relaxed">
                    Your performance ratings are entered by your manager and HR team. Ratings are reviewed monthly.
                    Contact your supervisor or the HR department to discuss your performance scores and feedback.
                  </p>
                  <div className="mt-6 inline-flex gap-2 items-center px-4 py-2 bg-slate-50 rounded-xl text-sm text-slate-500">
                    <span>📬</span> Contact HR for your latest performance review
                  </div>
                </div>
              </div>
            )}

            {/* ───── TAB: My Loans ───── */}
            {tab === "loans" && (
              <div className="space-y-4">
                {/* Active loans cards */}
                {loans.filter(l => l.status === "Active").length > 0 && (
                  <div>
                    <h2 className="font-bold text-slate-800 mb-3 px-1">Active Loans</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {loans.filter(l => l.status === "Active").map((l, i) => (
                        <div key={i} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                          <div className="flex justify-between items-start mb-3">
                            <div>
                              <div className="font-bold text-slate-900 text-lg">{money(l.loan_amount)}</div>
                              <div className="text-xs text-slate-400 mt-0.5">{l.loan_type || "General Loan"}</div>
                            </div>
                            <SBadge tone="yellow">Active</SBadge>
                          </div>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between"><span className="text-slate-500">Monthly Deduction</span><span className="font-semibold">{money(l.monthly_deduction || l.installment_amount || 0)}</span></div>
                            <div className="flex justify-between"><span className="text-slate-500">Outstanding Balance</span><span className="font-semibold text-red-500">{money(l.outstanding_balance || 0)}</span></div>
                            <div className="flex justify-between"><span className="text-slate-500">Granted On</span><span>{l.loan_date || l.granted_date || l.created_at?.slice(0, 10) || "—"}</span></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Loan history table */}
                <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
                  <div className="px-5 pt-4 pb-2">
                    <h2 className="font-bold text-slate-800">Loan History</h2>
                    <p className="text-xs text-slate-400 mt-0.5">{loans.length} loans</p>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>{["Type", "Loan Amount", "Monthly Deduction", "Outstanding", "Status"].map(h => (
                        <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {loans.length === 0
                        ? <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No loan records found.</td></tr>
                        : loans.map((l, i) => (
                          <tr key={i}>
                            <td className="px-4 py-3">{l.loan_type || "General"}</td>
                            <td className="px-4 py-3 font-semibold">{money(l.loan_amount)}</td>
                            <td className="px-4 py-3">{money(l.monthly_deduction || l.installment_amount || 0)}</td>
                            <td className="px-4 py-3 text-red-500">{money(l.outstanding_balance || 0)}</td>
                            <td className="px-4 py-3">
                              <SBadge tone={["Cleared", "Paid", "Completed"].includes(l.status) ? "green" : "yellow"}>{l.status || "Active"}</SBadge>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ───── TAB: Log My Time (Field Employees only) ───── */}
            {tab === "logtime" && isFieldEmployee && (
              <div className="space-y-4">
                <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                  <h2 className="font-bold text-slate-800 mb-1">Log My Time</h2>
                  <p className="text-xs text-slate-400 mb-4">Submit your daily work hours. Entries within the last 48 hours are accepted. HR will review and approve.</p>
                  {timeLogMsg && (
                    <div className={`mb-4 p-3 rounded-xl text-sm ${timeLogMsg.startsWith("Error") || timeLogMsg.includes("required") || timeLogMsg.includes("hours") ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
                      {timeLogMsg}
                    </div>
                  )}
                  <form onSubmit={submitTimeLog} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Date *</p>
                      <input type="date"
                        min={new Date(Date.now() - 48 * 3600e3).toISOString().slice(0, 10)}
                        max={new Date().toISOString().slice(0, 10)}
                        value={timeLogForm.date}
                        onChange={e => setTimeLogForm(f => ({ ...f, date: e.target.value }))} required
                        className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
                    </div>
                    <div />
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Time In *</p>
                      <input type="time" value={timeLogForm.timeIn} onChange={e => setTimeLogForm(f => ({ ...f, timeIn: e.target.value }))} required
                        className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Time Out *</p>
                      <input type="time" value={timeLogForm.timeOut} onChange={e => setTimeLogForm(f => ({ ...f, timeOut: e.target.value }))} required
                        className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Location / Site</p>
                      <input value={timeLogForm.location} onChange={e => setTimeLogForm(f => ({ ...f, location: e.target.value }))}
                        placeholder="e.g. Client site, warehouse..." className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Remarks</p>
                      <input value={timeLogForm.remarks} onChange={e => setTimeLogForm(f => ({ ...f, remarks: e.target.value }))}
                        placeholder="Optional notes..." className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
                    </div>
                    <div className="md:col-span-2">
                      <button type="submit" disabled={timeLogSubmitting}
                        className="px-6 py-2.5 bg-slate-950 text-white rounded-xl text-sm font-medium hover:bg-slate-800 disabled:opacity-50 transition">
                        {timeLogSubmitting ? "Submitting…" : "Submit Time Entry"}
                      </button>
                    </div>
                  </form>
                </div>

                <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
                  <div className="px-5 pt-4 pb-2">
                    <h2 className="font-bold text-slate-800">My Submitted Entries</h2>
                    <p className="text-xs text-slate-400 mt-0.5">{myTimeEntries.length} entries</p>
                  </div>
                  <table className="w-full min-w-[600px] text-sm">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>{["Date","Time In","Time Out","Hours","Status","Approved By"].map(h => (
                        <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {myTimeEntries.length === 0
                        ? <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No manual time entries submitted yet.</td></tr>
                        : myTimeEntries.map((r, i) => (
                          <tr key={i}>
                            <td className="px-4 py-3 font-medium">{r.work_date}</td>
                            <td className="px-4 py-3">{r.check_in ? String(r.check_in).slice(11, 16) : "—"}</td>
                            <td className="px-4 py-3">{r.check_out ? String(r.check_out).slice(11, 16) : "—"}</td>
                            <td className="px-4 py-3">{r.actual_hours ?? "—"}</td>
                            <td className="px-4 py-3">
                              <SBadge tone={r.manual_entry_status === "Approved" ? "green" : r.manual_entry_status === "Rejected" ? "red" : "yellow"}>
                                {r.manual_entry_status || "Pending"}
                              </SBadge>
                            </td>
                            <td className="px-4 py-3 text-slate-400">{r.manual_entry_approved_by || "—"}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ───── TAB: My Team (Supervisor only) ───── */}
            {tab === "myteam" && isSupervisor && (
              <div className="space-y-4">
                {teamMsg && <div className="p-3 rounded-xl bg-blue-50 text-blue-700 text-sm">{teamMsg}</div>}

                {/* Team overview */}
                <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                  <h2 className="font-bold text-slate-800 mb-4">My Team — {team.length} Direct Reports</h2>
                  {team.length === 0
                    ? <p className="text-sm text-slate-400">No direct reports assigned. Ask HR to assign your team members to you from Settings → Org Hierarchy.</p>
                    : (
                      <div className="space-y-3">
                        {team.map(m => {
                          const todayAtt = teamAtt.find(a => a.employee_code === m.employee_code);
                          const pendingLv = teamLeave.filter(l => l.employee_code === m.employee_code);
                          const month = new Date().toISOString().slice(0, 7);
                          const signoff = teamSignoffs.find(s => s.employee_code === m.employee_code && s.month === month);
                          return (
                            <div key={m.employee_code} className="border border-slate-100 rounded-xl p-4">
                              <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                                <div>
                                  <div className="font-semibold text-slate-900">{m.full_name}</div>
                                  <div className="text-xs text-slate-400">{m.employee_code} · {m.designation || m.department}</div>
                                </div>
                                <div className="flex gap-2 flex-wrap">
                                  <SBadge tone={todayAtt ? ({ Present: "green", Absent: "red", Late: "yellow" }[todayAtt.attendance_status] || "slate") : "slate"}>
                                    {todayAtt ? (todayAtt.attendance_status || "Logged") : "No Record"}
                                  </SBadge>
                                  {pendingLv.length > 0 && <SBadge tone="yellow">{pendingLv.length} leave pending</SBadge>}
                                  {signoff?.supervisor_signed_off ? <SBadge tone="green">Timesheet Signed</SBadge> : <SBadge tone="red">Timesheet Unsigned</SBadge>}
                                </div>
                              </div>
                              <div className="flex gap-2 flex-wrap">
                                {!signoff?.supervisor_signed_off && (
                                  <button onClick={() => signOffTimesheet(m.employee_code, m.full_name)}
                                    className="px-3 py-1.5 bg-slate-950 text-white rounded-xl text-xs font-medium hover:bg-slate-800 transition">
                                    Sign Off Timesheet ({month})
                                  </button>
                                )}
                              </div>

                              {/* Pending leave requests for this team member */}
                              {pendingLv.length > 0 && (
                                <div className="mt-3 border-t border-slate-100 pt-3">
                                  <p className="text-xs font-semibold text-slate-500 mb-2">Pending Leave Approvals</p>
                                  {pendingLv.map(lv => {
                                    const canAct = canActOnTeamRequest(lv, session.employee_code);
                                    return (
                                    <div key={lv.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                                      <div className="text-sm">
                                        <span className="font-medium">{lv.leave_type}</span>
                                        <span className="text-slate-400 text-xs ml-2">{lv.from_date} → {lv.to_date}</span>
                                        {lv.reason && <span className="text-slate-400 text-xs ml-2">· {lv.reason}</span>}
                                        {!canAct && <span className="text-slate-400 text-xs ml-2">· awaiting {lv.current_approver_name || "another approver"}</span>}
                                      </div>
                                      {canAct && (
                                        <div className="flex gap-2">
                                          <button onClick={() => approveSupervisorLeave(lv)}
                                            className="px-3 py-1 bg-emerald-600 text-white rounded-xl text-xs hover:bg-emerald-700 transition">Approve</button>
                                          <button onClick={() => { const reason = prompt("Rejection reason?"); if (reason) rejectSupervisorLeave(lv, reason); }}
                                            className="px-3 py-1 border border-slate-200 text-slate-600 rounded-xl text-xs hover:bg-slate-50 transition">Reject</button>
                                        </div>
                                      )}
                                    </div>
                                  );})}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                </div>

                {/* Bulk sign-off */}
                {team.length > 0 && (
                  <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-800 text-sm">Bulk Timesheet Sign-off</div>
                      <div className="text-xs text-slate-400">Sign off all unsigned timesheets for {new Date().toISOString().slice(0, 7)} at once</div>
                    </div>
                    <button onClick={async () => {
                      for (const m of team) await signOffTimesheet(m.employee_code, m.full_name);
                      setTeamMsg("All timesheets signed off.");
                    }} className="px-4 py-2 bg-slate-950 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition">
                      Sign Off All
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ───── TAB: My Profile ───── */}
            {tab === "profile" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                  <h2 className="font-bold text-slate-800 mb-4">Personal Information</h2>
                  <InfoRow label="Full Name" value={profile?.full_name || session.name} />
                  <InfoRow label="CNIC" value={profile?.cnic} />
                  <InfoRow label="Father's CNIC" value={profile?.fathers_cnic} />
                  <InfoRow label="Designation" value={profile?.designation || session.designation} />
                  <InfoRow label="Employee Code" value={session.employee_code} />
                  <InfoRow label="Employee ID" value={session.employee_id} />
                  <InfoRow label="Staff Level" value={profile?.staff_level || session.staff_level} />
                  <InfoRow label="Employee Type" value={profile?.employee_type} />
                  <InfoRow label="Join Date" value={profile?.joining_date} />
                  <InfoRow label="EOBI Status" value={profile?.eobi_status} />
                </div>

                <div className="space-y-4">
                  <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                    <h2 className="font-bold text-slate-800 mb-4">Work Information</h2>
                    <InfoRow label="Branch" value={profile?.branch || session.branch} />
                    <InfoRow label="Department" value={profile?.department || session.department} />
                    <InfoRow label="Status" value={profile?.status} />
                  </div>

                  <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                    <h2 className="font-bold text-slate-800 mb-4">Contact Information</h2>
                    <InfoRow label="Phone" value={profile?.phone} />
                    <InfoRow label="WhatsApp" value={profile?.whatsapp_number} />
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-400 text-center">
                    Profile is read-only. Contact HR to update your personal information.
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
