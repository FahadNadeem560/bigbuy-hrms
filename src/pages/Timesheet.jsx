import React, { useState, useEffect, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../lib/supabaseClient.js";
import { Button, Badge, PageTitle } from "../components/ui.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { BRANCH_CODE_MAP } from "../constants/branches.js";
import { STAFF_LEVEL_POLICIES } from "../config/staffPolicies.js";
import { getWeeklyOffOverrideKeys } from "../utils/attendanceRules.js";

const SHORT_TOLERANCE = 1.5;
const OT_TOLERANCE = 1.5;
const LATE_WARNING_COUNT = 2;
const ADJ_TONE = { "Pending Approval": "yellow", "Approved": "green", "Rejected": "red" };
const DB_FIELD_MAP = {
  halfDayExempt: "half_day_exempt",
  lateExempt: "late_exempt",
  isGazettedHoliday: "is_gazetted_holiday",
};

function fmt2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function hoursToHHMM(n) {
  const total = Number(n || 0);
  const sign = total < 0 ? "-" : "";
  const abs = Math.abs(total);
  const h = Math.floor(abs);
  const m = Math.round((abs - h) * 60);
  return `${sign}${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function enumerateDates(from, to) {
  const dates = [];
  const cursor = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  while (cursor <= end) {
    dates.push(fmtDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function getDayName(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { weekday: "short" });
}

function Toggle({ value, onChange, tone = "blue" }) {
  const tones = { blue: "bg-blue-500", green: "bg-green-500", purple: "bg-purple-500" };
  return (
    <button
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none ${value ? (tones[tone] || tones.blue) : "bg-slate-200"}`}
    >
      <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${value ? "translate-x-4" : "translate-x-0"}`} />
    </button>
  );
}

function formatTime(t) {
  if (!t) return "-";
  const s = String(t);
  if (s.includes("T")) return s.slice(11, 16);
  if (s.length >= 5) return s.slice(0, 5);
  return s;
}

function AdjustTimeModal({ row, form, setForm, onSubmit, onClose, submitting }) {
  if (!row) return null;
  const outDate = form.outDate || row.work_date;
  const previewHours = (form.in && form.out)
    ? (new Date(`${outDate}T${form.out}:00`) - new Date(`${row.work_date}T${form.in}:00`)) / 3600000
    : null;
  const isNegative = previewHours !== null && previewHours < 0;
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 shadow-xl w-full max-w-sm">
        <h3 className="font-bold text-slate-800 mb-1">Adjust Time — {row.work_date}</h3>
        <p className="text-xs text-slate-400 mb-4">Routed to Master/GM for approval — not applied until approved.</p>
        <div className="space-y-3">
          <div>
            <p className="text-xs text-slate-500 mb-1">Corrected In</p>
            {/* lang="en-GB" makes the browser render this as a 24-hour picker
                instead of the 12-hour AM/PM widget the default locale gives. */}
            <input type="time" lang="en-GB" value={form.in} onChange={e => setForm(f => ({ ...f, in: e.target.value }))}
              className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">Corrected Out</p>
            <div className="flex gap-2">
              <input type="time" lang="en-GB" value={form.out} onChange={e => setForm(f => ({ ...f, out: e.target.value }))}
                className="w-1/2 px-4 py-2 rounded-xl border border-slate-200 text-sm" />
              <input type="date" value={form.outDate || row.work_date} min={row.work_date}
                onChange={e => setForm(f => ({ ...f, outDate: e.target.value }))}
                className="w-1/2 px-2 py-2 rounded-xl border border-slate-200 text-sm" title="Check-out date — change this if the employee checked out after midnight" />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">If the employee checked out after midnight, set this to the next day — otherwise the correction records a negative shift.</p>
          </div>
          {previewHours !== null && (
            <p className={`text-xs rounded-lg px-3 py-1.5 ${isNegative ? "bg-red-50 text-red-700" : "bg-slate-50 text-slate-600"}`}>
              {isNegative
                ? `Corrected Out is before Corrected In — this would record ${previewHours.toFixed(2)} hours. Fix the Out date above.`
                : `Preview: ${previewHours.toFixed(2)} hours`}
            </p>
          )}
          <div>
            <p className="text-xs text-slate-500 mb-1">Reason</p>
            <input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
              placeholder="Reason for correction..." className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <Button onClick={onSubmit} disabled={submitting || isNegative} className="rounded-xl flex-1">
            {submitting ? "Submitting…" : "Submit for Approval"}
          </Button>
          <Button variant="outline" onClick={onClose} className="rounded-xl flex-1">Cancel</Button>
        </div>
      </div>
    </div>
  );
}

function StatusOverrideModal({ row, target, reason, setReason, onSubmit, onClose, submitting }) {
  if (!row || !target) return null;
  const isAbsent = target === "Absent";
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 shadow-xl w-full max-w-sm">
        <h3 className="font-bold text-slate-800 mb-1">Mark as {target} — {row.work_date}</h3>
        <p className="text-xs text-slate-400 mb-4">
          {isAbsent
            ? "Overrides this day to Absent (full-day deduction) even though it was recorded as worked. Applied immediately and locked against the next attendance sync."
            : "Overrides this day to Weekly Off so it's excluded from short/late/OT and absence counts. Applied immediately and locked against the next attendance sync."}
        </p>
        <div>
          <p className="text-xs text-slate-500 mb-1">Reason</p>
          <input value={reason} onChange={e => setReason(e.target.value)}
            placeholder="Reason for this override..." className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
        </div>
        <div className="flex gap-2 mt-5">
          <Button onClick={onSubmit} disabled={submitting} className="rounded-xl flex-1">
            {submitting ? "Saving…" : `Confirm ${target}`}
          </Button>
          <Button variant="outline" onClick={onClose} className="rounded-xl flex-1">Cancel</Button>
        </div>
      </div>
    </div>
  );
}

export default function Timesheet({ branchFilter, role }) {
  const [empSearch, setEmpSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [branch, setBranch] = useState(branchFilter || "All");
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [monthPick, setMonthPick] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  function applyMonth(value) {
    setMonthPick(value);
    if (!value) return;
    const [y, m] = value.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const newFrom = `${value}-01`;
    const newTo = `${value}-${String(lastDay).padStart(2, "0")}`;
    setFromDate(newFrom);
    setToDate(newTo);
    if (selectedEmp) loadTimesheet(selectedEmp, newFrom, newTo);
  }

  const [employees, setEmployees] = useState([]);
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [roster, setRoster] = useState([]);
  const [leaveData, setLeaveData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);

  // Adj Time In/Out (HR proposes, Master/GM approve via the Approval Queue)
  const [pendingAdjByDate, setPendingAdjByDate] = useState({});
  const [adjustRow, setAdjustRow] = useState(null);
  const [adjustForm, setAdjustForm] = useState({ in: "", out: "", outDate: "", reason: "" });
  const [adjustSubmitting, setAdjustSubmitting] = useState(false);

  // Manual status override (Mark as Weekly Off / Mark as Absent) — applied
  // directly like markDayAsLeave, not routed through the Adj Time approval
  // queue, since this corrects the day's classification rather than punches.
  const [overrideRow, setOverrideRow] = useState(null);
  const [overrideTarget, setOverrideTarget] = useState(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideSubmitting, setOverrideSubmitting] = useState(false);

  const canToggle = role === "HR" || role === "Master";

  useEffect(() => {
    let q = supabase
      .from("employees")
      .select("employee_code, full_name, department, branch, staff_level, ot_eligible, status")
      .order("full_name");
    if (branchFilter) q = q.eq("branch", branchFilter);
    q.then(({ data }) => setEmployees(data || []));
  }, [branchFilter]);

  useEffect(() => {
    function handleClick(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filteredEmps = useMemo(() => {
    if (!empSearch.trim()) return [];
    const q = empSearch.toLowerCase();
    return employees
      .filter((e) => {
        const hit = e.full_name?.toLowerCase().includes(q) || e.employee_code?.toLowerCase().includes(q);
        const deptHit = !department || e.department?.toLowerCase().includes(department.toLowerCase());
        const branchHit = branch === "All" || e.branch === branch;
        return hit && deptHit && branchHit;
      })
      .slice(0, 12);
  }, [employees, empSearch, department, branch]);

  async function loadTimesheet(emp, from = fromDate, to = toDate) {
    setSelectedEmp(emp);
    setShowDropdown(false);
    setEmpSearch("");
    setLoading(true);
    setError("");
    try {
      const { data: att, error: attErr } = await supabase
        .from("attendance")
        .select("*")
        .eq("employee_code", emp.employee_code)
        .gte("work_date", from)
        .lte("work_date", to)
        .order("work_date", { ascending: true });
      if (attErr) throw attErr;
      setAttendance(att || []);

      const { data: rst } = await supabase
        .from("employee_work_rosters")
        .select("roster_date, is_weekly_off, is_gazetted_holiday")
        .eq("employee_code", emp.employee_code)
        .gte("roster_date", from)
        .lte("roster_date", to);
      setRoster(rst || []);

      const { data: lv } = await supabase
        .from("leaves")
        .select("*")
        .eq("employee_id", emp.employee_code)
        .maybeSingle();
      setLeaveData(lv || null);

      if (canToggle) {
        const { data: adjs } = await supabase
          .from("attendance_adjustments")
          .select("attendance_date")
          .eq("employee_code", emp.employee_code)
          .eq("status", "Pending Approval")
          .gte("attendance_date", from)
          .lte("attendance_date", to);
        setPendingAdjByDate(Object.fromEntries((adjs || []).map((a) => [a.attendance_date, true])));
      }
    } catch (err) {
      setError(err.message);
      setAttendance([]);
      setRoster([]);
    } finally {
      setLoading(false);
    }
  }

  function openAdjustModal(row) {
    const curIn = formatTime(row.check_in || row.time_in);
    const curOut = formatTime(row.check_out || row.time_out);
    // Default the out-date to whatever the existing checkout's real date is
    // (falls back to work_date if there's no recorded checkout yet) so an
    // already-overnight shift stays overnight unless the user changes it.
    const rawOut = row.check_out || row.time_out;
    const curOutDate = rawOut && String(rawOut).includes("T") ? String(rawOut).slice(0, 10)
      : rawOut && String(rawOut).includes(" ") ? String(rawOut).slice(0, 10)
      : row.work_date;
    setAdjustForm({ in: curIn === "-" ? "" : curIn, out: curOut === "-" ? "" : curOut, outDate: curOutDate, reason: "" });
    setAdjustRow(row);
  }

  async function submitAdjustment() {
    if (!adjustRow || !selectedEmp) return;
    if (!adjustForm.in && !adjustForm.out) { setNotice("Enter at least one corrected time."); return; }
    setAdjustSubmitting(true);
    const work_date = adjustRow.work_date;
    const outDate = adjustForm.outDate || work_date;
    const now = new Date().toISOString();
    const payload = {
      employee_code: selectedEmp.employee_code,
      attendance_date: work_date,
      original_check_in: adjustRow.is_synthetic ? null : (adjustRow.check_in || adjustRow.time_in || null),
      original_check_out: adjustRow.is_synthetic ? null : (adjustRow.check_out || adjustRow.time_out || null),
      adjusted_check_in: adjustForm.in ? `${work_date}T${adjustForm.in}:00` : null,
      adjusted_check_out: adjustForm.out ? `${outDate}T${adjustForm.out}:00` : null,
      reason: adjustForm.reason, adjusted_by: role, adjusted_at: now,
      status: "Pending Approval",
    };
    const { error: insErr } = await supabase.from("attendance_adjustments").insert(payload);
    if (insErr) { setNotice(`Error: ${insErr.message}`); setAdjustSubmitting(false); return; }

    await Promise.all(["Master", "GM"].map((r) =>
      supabase.from("notifications").insert({
        recipient_role: r, type: "attendance_adjustment",
        title: "Time Adjustment Pending Approval",
        message: `${role} requested a time correction for ${selectedEmp.full_name} on ${work_date}.`,
        is_read: false, created_at: now,
      })
    )).catch(() => {});

    setPendingAdjByDate((prev) => ({ ...prev, [work_date]: true }));
    setAdjustRow(null);
    setAdjustSubmitting(false);
    setNotice(`Time adjustment for ${work_date} submitted for Master/GM approval.`);
    setTimeout(() => setNotice(""), 3000);
  }

  function reloadWithDates() {
    if (selectedEmp) loadTimesheet(selectedEmp);
  }

  function clearSelection() {
    setSelectedEmp(null);
    setAttendance([]);
    setRoster([]);
    setLeaveData(null);
    setEmpSearch("");
    setError("");
  }

  async function toggleFlag(row, flag, currentValue) {
    if (!row.id || !canToggle) return;
    const newValue = !currentValue;
    const now = new Date().toISOString();
    const adjStatus = role === "Master" ? "Approved" : "Pending Approval";
    const dbField = DB_FIELD_MAP[flag];
    if (!dbField) return;

    const update = { [dbField]: newValue, adjustment_status: adjStatus };
    if (role === "Master") update.adjustment_approved_by = "Master";

    const { error: updErr } = await supabase.from("attendance").update(update).eq("id", row.id);
    if (updErr) { setNotice(`Error: ${updErr.message}`); return; }

    await supabase.from("audit_logs").insert({
      action: "attendance_toggle", entity: "attendance", entity_id: row.id,
      performed_by: role,
      details: `${flag} → ${newValue} for ${row.employee_code} on ${row.work_date}. Status: ${adjStatus}`,
      created_at: now,
    }).then(() => {});

    if (role === "HR") {
      await supabase.from("notifications").insert({
        recipient_role: "Master", type: "attendance_adjustment",
        title: "Attendance Toggle Pending Approval",
        message: `HR set ${flag} for ${selectedEmp?.full_name} on ${row.work_date}. Awaiting Master approval.`,
        is_read: false, created_at: now,
      }).then(() => {});
    }

    setAttendance(prev => prev.map(r => r.id === row.id
      ? { ...r, [dbField]: newValue, adjustment_status: adjStatus, ...(role === "Master" ? { adjustment_approved_by: "Master" } : {}) }
      : r
    ));
    setNotice(`${flag.replace(/([A-Z])/g, " $1").trim()} updated.`);
    setTimeout(() => setNotice(""), 3000);
  }

  async function markDayAsLeave(row) {
    if (!canToggle || !selectedEmp || !row.work_date) return;
    const work_date = row.work_date;
    const update = {
      attendance_status: "Leave", status: "Leave", check_in: null, check_out: null,
      first_check_in: null, last_check_out: null, review_status: "Locked",
      is_manual_entry: true, manual_entry_by: role,
    };
    const { error: updErr } = row.id
      ? await supabase.from("attendance").update(update).eq("id", row.id)
      : await supabase.from("attendance").insert({ employee_code: selectedEmp.employee_code, work_date, attendance_date: work_date, ...update });
    if (updErr) { setNotice(`Error: ${updErr.message}`); return; }

    // Create a leave_requests row already Approved (HR/Master is directly
    // correcting an absent day, not routing through the multi-stage chain)
    // so it counts toward the employee's leave balance in LeaveManagement.jsx
    // (enrichedBalances only sums Approved rows from leave_requests — it has
    // no idea about attendance_status='Leave' otherwise).
    const now = new Date().toISOString();
    const { data: leaveReq, error: leaveErr } = await supabase.from("leave_requests").insert({
      employee_id: selectedEmp.employee_code, employee_code: selectedEmp.employee_code,
      employee_name: selectedEmp.full_name, leave_type: "Annual",
      from_date: work_date, to_date: work_date, days: 1,
      reason: "Marked as Leave from Timesheet (was Absent)",
      applied_date: work_date, status: "Approved",
      approved_by: role, approved_at: now, approval_trail: [
        { level: null, approver: role, action: "Approved (Timesheet correction)", timestamp: now },
      ],
    }).select().single();
    if (leaveErr) { setNotice(`Attendance updated, but leave balance NOT deducted: ${leaveErr.message}`); return; }

    await supabase.from("leave_approvals").insert({
      leave_request_id: leaveReq.id, stage: "Timesheet Correction",
      actor_role: role, actor_name: role, action: "Approved",
    });

    await supabase.from("audit_logs").insert({
      action: "attendance_absent_to_leave", entity: "attendance", entity_id: row.id || null,
      performed_by: role,
      details: `Marked ${selectedEmp.employee_code} ${work_date} as Leave (was Absent). leave_requests id=${leaveReq.id}.`,
      created_at: now,
    }).then(() => {});

    setNotice(`${work_date} marked as Leave and deducted from balance.`);
    setTimeout(() => setNotice(""), 3000);
    loadTimesheet(selectedEmp);
  }

  function openOverrideModal(row, target) {
    setOverrideRow(row);
    setOverrideTarget(target);
    setOverrideReason("");
  }

  // Case-by-case day status correction: "Weekly Off" for a genuine absence
  // that management wants excused (e.g. a working-day no-show they're
  // choosing to treat as the employee's off day), or "Absent" as a penalty
  // override on a day that was actually worked. Applied directly and locked
  // (review_status: 'Locked') so the next attendance sync/reprocess can't
  // silently overwrite the correction — same protection markDayAsLeave and
  // the Adj Time flow already rely on.
  async function submitStatusOverride() {
    if (!overrideRow || !selectedEmp || !overrideTarget) return;
    if (!overrideReason.trim()) { setNotice("Enter a reason for the override."); return; }
    setOverrideSubmitting(true);
    const row = overrideRow;
    const work_date = row.work_date;
    const now = new Date().toISOString();
    const priorStatus = row.attendance_status || row.status || "Pending";
    const reason = overrideReason.trim();

    const update = overrideTarget === "Weekly Off"
      ? {
          attendance_status: "Weekly Off", is_weekly_off: true,
          // required_hours also zeroed, not just short_hours -- PayrollAutomation
          // sums the raw required_hours column for its OT net calc and only skips
          // rows caught by the client-side single-Mon-Fri-absence heuristic, which
          // this row won't match once its status is directly "Weekly Off".
          required_hours: 0, short_hours: 0, late_minutes: 0, early_out_minutes: 0, overtime_hours: 0, ot_hours: 0,
          needs_review: false, exception_reason: null,
          review_status: "Locked", is_manual_entry: true, manual_entry_by: role,
          adjustment_status: `Weekly Off Override: ${reason}`, adjustment_approved_by: role,
        }
      : {
          // Punches are left as-is (not nulled) so the record still shows the
          // employee actually worked that day -- only the classification and
          // the hours it feeds into payroll are overridden to a full absence.
          attendance_status: "Absent",
          worked_hours: 0, actual_hours: 0, short_hours: Number(row.required_hours || 0),
          late_minutes: 0, early_out_minutes: 0, overtime_hours: 0, ot_hours: 0,
          needs_review: false, exception_reason: null,
          review_status: "Locked", is_manual_entry: true, manual_entry_by: role,
          adjustment_status: `Absent Penalty: ${reason}`, adjustment_approved_by: role,
        };

    const { error: updErr } = row.id
      ? await supabase.from("attendance").update(update).eq("id", row.id)
      : await supabase.from("attendance").insert({ employee_code: selectedEmp.employee_code, work_date, attendance_date: work_date, ...update });
    if (updErr) { setNotice(`Error: ${updErr.message}`); setOverrideSubmitting(false); return; }

    await supabase.from("audit_logs").insert({
      action: "attendance_status_override", entity: "attendance", entity_id: row.id || null,
      performed_by: role,
      details: `${selectedEmp.employee_code} ${work_date}: ${priorStatus} -> ${overrideTarget}. Reason: ${reason}`,
      created_at: now,
    }).then(() => {});

    setOverrideRow(null); setOverrideTarget(null); setOverrideReason(""); setOverrideSubmitting(false);
    setNotice(`${work_date} marked as ${overrideTarget}.`);
    setTimeout(() => setNotice(""), 3000);
    loadTimesheet(selectedEmp);
  }

  const isOtEligible = useMemo(() => {
    if (!selectedEmp) return false;
    if (selectedEmp.ot_eligible != null) return !!selectedEmp.ot_eligible;
    const policy = STAFF_LEVEL_POLICIES[selectedEmp.staff_level];
    return policy ? !!policy.overtimeEligible : false;
  }, [selectedEmp]);

  const ledger = useMemo(() => {
    if (!selectedEmp || !fromDate || !toDate) return [];
    const byDate = {};
    attendance.forEach((r) => { byDate[r.work_date] = r; });
    const rosterByDate = {};
    roster.forEach((r) => { rosterByDate[r.roster_date] = r; });
    const todayStr = fmtDate(new Date());

    const base = enumerateDates(fromDate, toDate)
      .map((date) => {
        if (byDate[date]) return { ...byDate[date] };
        if (date > todayStr) return null;
        const rosterEntry = rosterByDate[date];
        // Weekly off is no longer roster-driven (the roster table isn't kept
        // current) — see the Mon-Fri single-absence rule applied below.
        // Gazetted holidays still come from the roster since that's a
        // separate, explicitly-marked concept.
        const status = rosterEntry?.is_gazetted_holiday ? "Gazetted Holiday" : "Absent";
        return { work_date: date, attendance_status: status, is_synthetic: true };
      })
      .filter(Boolean);

    // One employee at a time here, so no employeeKey grouping needed — see
    // getWeeklyOffOverrideKeys for the shared Mon-Fri single-absence rule
    // (also applied in PayrollAutomation.jsx and FinalSettlement.jsx so
    // "Absent" means the same thing, and costs the same deduction, everywhere).
    const overrideDates = getWeeklyOffOverrideKeys(base);
    base.forEach((row) => {
      if (overrideDates.has(row.work_date)) {
        // The DB row's short_hours/late/OT were computed for "Absent"
        // (short by the full required hours) — once the day reads as a
        // legitimate Weekly Off instead, those figures are stale and would
        // show e.g. "10.5 short" against a day nothing was owed for.
        row.attendance_status = "Weekly Off";
        row.short_hours = 0;
        row.late_minutes = 0;
        row.ot_hours = 0;
        row.overtime_hours = 0;
      } else if (row.attendance_status === "Absent") {
        // Absent already costs a full-day deduction on its own; counting the
        // same day again in short_hours would double-deduct it, same reason
        // Weekly Off is zeroed above.
        row.short_hours = 0;
      } else if (row.attendance_status === "Weekly Off" || row.attendance_status === "Gazetted Holiday") {
        // Some DB rows already carry "Weekly Off"/"Gazetted Holiday" directly
        // (not just the derived override above) but still have short_hours
        // populated from whatever punches existed that day — nothing is owed
        // on these days, so the same double-deduct fix applies here too.
        row.short_hours = 0;
        row.late_minutes = 0;
        row.ot_hours = 0;
        row.overtime_hours = 0;
      }
    });

    return base;
  }, [selectedEmp, attendance, roster, fromDate, toDate]);

  const STATUS_ORDER = ["Present", "Late", "Half Day", "Short Hours", "Early Out", "Absent", "Weekly Off", "Gazetted Holiday", "Leave"];
  const statusCounts = useMemo(() => {
    const counts = {};
    ledger.forEach((row) => {
      const status = row.attendance_status || row.status || "Pending";
      counts[status] = (counts[status] || 0) + 1;
    });
    const ordered = STATUS_ORDER.filter((s) => counts[s] != null).map((s) => ({ status: s, count: counts[s] }));
    const extra = Object.keys(counts).filter((s) => !STATUS_ORDER.includes(s)).sort().map((s) => ({ status: s, count: counts[s] }));
    return [...ordered, ...extra];
  }, [ledger]);

  // Derived from `ledger`, not raw `attendance` — a Weekly Off day's
  // short/late/OT were zeroed out above for display, and these totals need
  // to agree with what the ledger rows actually show, not the pre-override
  // DB values.
  const lateSummary = useMemo(() => {
    const lateRows = ledger.filter((r) => Number(r.late_minutes || 0) > 0);
    const totalLateCount = lateRows.length;
    const totalLateMins = lateRows.reduce((s, r) => s + Number(r.late_minutes || 0), 0);
    const deductibleLates = Math.max(0, totalLateCount - LATE_WARNING_COUNT);
    return { totalLateCount, totalLateMins, deductibleLates };
  }, [ledger]);

  const shortSummary = useMemo(() => {
    const totalShort = fmt2(ledger.reduce((s, r) => s + Number(r.short_hours || r.short_hour || 0), 0));
    const deductibleShort = fmt2(Math.max(0, totalShort - SHORT_TOLERANCE));
    return { totalShort, deductibleShort };
  }, [ledger]);

  const otSummary = useMemo(() => {
    const totalOT = fmt2(ledger.reduce((s, r) => s + Number(r.ot_hours || r.overtime_hours || 0), 0));
    const payableOT = isOtEligible ? fmt2(Math.max(0, totalOT - OT_TOLERANCE)) : 0;
    return { totalOT, payableOT };
  }, [ledger, isOtEligible]);

  // extra_day_eligible is only true when the employee actually punched in on
  // a weekly-off day (see classify_attendance_day) -- a weekly off with no
  // punches at all does not count, so this matches what payroll pays for.
  const extraWorkingDaysCount = useMemo(() => {
    return ledger.filter((r) => !!r.extra_day_eligible).length;
  }, [ledger]);

  const totalWorkedHours = useMemo(() => {
    return fmt2(ledger.reduce((s, r) => s + Number(r.actual_hours ?? r.hours_worked ?? 0), 0));
  }, [ledger]);

  const EXEMPT_REQUIRED_HOURS_STATUSES = ["Weekly Off", "Gazetted Holiday", "Leave", "Absent"];
  function rowRequiredHours(row, policy) {
    if (!policy) return 0;
    const status = row.attendance_status || row.status;
    if (EXEMPT_REQUIRED_HOURS_STATUSES.includes(status)) return 0;
    const isFriday = new Date(`${row.work_date}T00:00:00`).getDay() === 5;
    return isFriday ? policy.fridayHours : policy.requiredHours;
  }

  const requiredHoursSummary = useMemo(() => {
    const policy = STAFF_LEVEL_POLICIES[selectedEmp?.staff_level];
    if (!policy) return { totalRequired: 0, variance: 0 };
    const totalRequired = ledger.reduce((sum, row) => sum + rowRequiredHours(row, policy), 0);
    return { totalRequired: fmt2(totalRequired), variance: fmt2(totalWorkedHours - totalRequired) };
  }, [selectedEmp, ledger, totalWorkedHours]);

  function exportExcel() {
    if (!selectedEmp) return;
    const exportPolicy = STAFF_LEVEL_POLICIES[selectedEmp.staff_level];
    const ledgerRows = ledger.map((r) => ({
      "Employee Number": selectedEmp.employee_code,
      Date: r.work_date,
      Day: getDayName(r.work_date),
      In: formatTime(r.check_in || r.time_in),
      Out: formatTime(r.check_out || r.time_out),
      "Required Hours": hoursToHHMM(rowRequiredHours(r, exportPolicy)),
      "Hours Worked": hoursToHHMM(r.actual_hours ?? r.hours_worked ?? 0),
      "Late (mins)": r.late_minutes || 0,
      "Short (hrs)": hoursToHHMM(r.short_hours || 0),
      "OT (hrs)": hoursToHHMM(r.ot_hours ?? r.overtime_hours ?? 0),
      Status: r.attendance_status || r.status || "",
    }));

    const summaryRows = [
      {},
      { Date: "--- ATTENDANCE BREAKDOWN ---" },
      ...statusCounts.map(({ status, count }) => ({ Date: status, Day: count })),
      {},
      { Date: "--- REQUIRED HOURS SUMMARY ---" },
      { Date: "Total Required Hours", Day: hoursToHHMM(requiredHoursSummary.totalRequired) },
      { Date: "Total Worked Hours", Day: hoursToHHMM(totalWorkedHours) },
      { Date: "Variance (Worked - Required)", Day: (requiredHoursSummary.variance > 0 ? "+" : "") + hoursToHHMM(requiredHoursSummary.variance) },
      {},
      { Date: "--- LATE SUMMARY ---" },
      { Date: "Total Late Count", Day: lateSummary.totalLateCount },
      { Date: "Total Late Minutes", Day: lateSummary.totalLateMins },
      { Date: `Warning only (first ${LATE_WARNING_COUNT})`, Day: Math.min(lateSummary.totalLateCount, LATE_WARNING_COUNT) },
      { Date: "Deductible Lates", Day: lateSummary.deductibleLates },
      {},
      { Date: "--- SHORT HOURS SUMMARY ---" },
      { Date: "Monthly Short Hours", Day: hoursToHHMM(shortSummary.totalShort) },
      { Date: "Tolerance", Day: hoursToHHMM(SHORT_TOLERANCE) },
      { Date: "Deductible Short Hours", Day: hoursToHHMM(shortSummary.deductibleShort) },
      {},
      { Date: "--- OT SUMMARY ---" },
      { Date: "Monthly OT", Day: hoursToHHMM(otSummary.totalOT) },
      { Date: "Tolerance", Day: hoursToHHMM(OT_TOLERANCE) },
      { Date: "OT Eligible", Day: isOtEligible ? "Yes" : "No" },
      { Date: "Payable OT", Day: hoursToHHMM(otSummary.payableOT) },
    ];

    if (leaveData) {
      summaryRows.push(
        {},
        { Date: "--- LEAVE BALANCE ---" },
        { Date: "Opening Balance", Day: leaveData.opening_balance ?? "" },
        { Date: "Earned", Day: leaveData.earned ?? "" },
        { Date: "Used", Day: leaveData.used ?? "" },
        { Date: "Half Leaves", Day: leaveData.half_leaves ?? "" },
        { Date: "Remaining Balance", Day: leaveData.remaining ?? leaveData.remaining_balance ?? "" }
      );
    }

    const ws = XLSX.utils.json_to_sheet([...ledgerRows, ...summaryRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Timesheet");
    XLSX.writeFile(wb, `timesheet_${selectedEmp.employee_code}_${fromDate}_${toDate}.xlsx`);
  }

  return (
    <div>
      <AdjustTimeModal
        row={adjustRow} form={adjustForm} setForm={setAdjustForm}
        onSubmit={submitAdjustment} onClose={() => setAdjustRow(null)} submitting={adjustSubmitting}
      />
      <StatusOverrideModal
        row={overrideRow} target={overrideTarget} reason={overrideReason} setReason={setOverrideReason}
        onSubmit={submitStatusOverride} onClose={() => { setOverrideRow(null); setOverrideTarget(null); }}
        submitting={overrideSubmitting}
      />
      <PageTitle
        title="Employee Timesheet"
        subtitle="Attendance ledger with late, short hours, OT and leave summary."
        action={
          selectedEmp ? (
            <div className="flex gap-2 print:hidden">
              <Button variant="outline" onClick={exportExcel} className="rounded-2xl">
                Export Excel
              </Button>
              <Button variant="outline" onClick={() => window.print()} className="rounded-2xl">
                Print / PDF
              </Button>
            </div>
          ) : null
        }
      />

      {/* Filter Bar */}
      <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm mb-4 print:hidden">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-3">
          <div className="relative lg:col-span-2" ref={dropdownRef}>
            <input
              value={selectedEmp ? `${selectedEmp.employee_code} — ${selectedEmp.full_name}` : empSearch}
              onChange={(e) => {
                if (selectedEmp) clearSelection();
                setEmpSearch(e.target.value);
                setShowDropdown(true);
              }}
              onFocus={() => { if (!selectedEmp) setShowDropdown(true); }}
              placeholder="Search by code or name..."
              className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm"
            />
            {showDropdown && filteredEmps.length > 0 && (
              <div className="absolute z-20 top-full left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-lg mt-1 max-h-64 overflow-y-auto">
                {filteredEmps.map((emp) => (
                  <button
                    key={emp.employee_code}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => loadTimesheet(emp)}
                    className="w-full text-left px-4 py-2.5 hover:bg-slate-50 text-sm border-b border-slate-50 last:border-0"
                  >
                    <span className="font-semibold text-slate-800">{emp.employee_code}</span>
                    <span className="mx-2 text-slate-300">|</span>
                    <span className="text-slate-700">{emp.full_name}</span>
                    <span className="ml-2 text-xs text-slate-400">{emp.department} · {emp.branch}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <input
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            placeholder="Department"
            className="px-4 py-2 rounded-xl border border-slate-200 text-sm"
          />

          <select
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            disabled={!!branchFilter}
            className="px-4 py-2 rounded-xl border border-slate-200 text-sm disabled:bg-slate-50 disabled:text-slate-500"
          >
            <option value="All">All Branches</option>
            {Object.keys(BRANCH_CODE_MAP).map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>

          <input
            type="month"
            value={monthPick}
            onChange={(e) => applyMonth(e.target.value)}
            title="Select a whole month"
            className="px-4 py-2 rounded-xl border border-slate-200 text-sm"
          />
          <input
            type="date"
            value={fromDate}
            onChange={(e) => { setFromDate(e.target.value); setMonthPick(""); }}
            className="px-4 py-2 rounded-xl border border-slate-200 text-sm"
          />
          <input
            type="date"
            value={toDate}
            onChange={(e) => { setToDate(e.target.value); setMonthPick(""); }}
            className="px-4 py-2 rounded-xl border border-slate-200 text-sm"
          />
        </div>

        {selectedEmp && (
          <div className="mt-3 pt-3 border-t border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-2">
            <div className="text-sm text-slate-600">
              <span className="font-bold text-slate-900">{selectedEmp.employee_code}</span>
              <span className="mx-2 text-slate-300">|</span>
              {selectedEmp.full_name}
              <span className="ml-3 text-slate-400">
                {selectedEmp.department} · {selectedEmp.branch} · {selectedEmp.staff_level}
              </span>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button onClick={reloadWithDates} className="rounded-xl text-xs px-3 py-1.5">
                Reload
              </Button>
              <Button variant="outline" onClick={clearSelection} className="rounded-xl text-xs px-3 py-1.5">
                Clear
              </Button>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{error}</div>
      )}

      {loading && (
        <div className="bg-white border border-slate-100 rounded-2xl p-12 text-center text-slate-400 shadow-sm">
          Loading timesheet...
        </div>
      )}

      {!loading && !selectedEmp && (
        <div className="bg-white border border-slate-100 rounded-2xl p-12 text-center text-slate-400 shadow-sm">
          <div className="text-4xl mb-3">📋</div>
          <p className="font-medium">Search and select an employee to view their timesheet.</p>
          <p className="text-xs mt-1">Enter an employee code or name in the search box above.</p>
        </div>
      )}

      {!loading && selectedEmp && (
        <>
          {/* Print CSS — compact everything (via root font-size, since Tailwind spacing is rem-based)
              so a full month's ledger + summaries + signatures fits on one A4 page. */}
          <style>{`
            @media print {
              @page { size: A4 portrait; margin: 10mm; }
              html, body { font-size: 10px; }
              body * { visibility: hidden; }
              #timesheet-print-root, #timesheet-print-root * { visibility: visible; }
              #timesheet-print-root { position: absolute; top: 0; left: 0; width: 100%; }
              #timesheet-print-root table { page-break-inside: auto; }
              #timesheet-print-root tr { page-break-inside: avoid; }
            }
          `}</style>

          <div id="timesheet-print-root">
            {/* Print-only A4 header */}
            <div className="hidden print:block mb-2">
              <div className="flex justify-between items-start border-b-2 border-slate-800 pb-2 mb-2">
                <div>
                  <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">The Big Buy</h1>
                  <p className="text-xs text-slate-500">Attendance Summary Report</p>
                </div>
                <div className="text-right text-xs text-slate-500">
                  <p>Period: {fromDate} — {toDate}</p>
                  <p>Generated: {new Date().toLocaleDateString()}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-8 gap-y-0.5 text-sm mb-2">
                {[
                  ["Employee Code", selectedEmp.employee_code],
                  ["Full Name", selectedEmp.full_name],
                  ["Department", selectedEmp.department],
                  ["Branch", selectedEmp.branch],
                  ["Staff Level", selectedEmp.staff_level],
                  ["OT Eligible", isOtEligible ? "Yes" : "No"],
                ].map(([l, v]) => (
                  <div key={l} className="flex gap-2">
                    <span className="font-semibold text-slate-700 w-32 shrink-0">{l}:</span>
                    <span className="text-slate-600">{v || "—"}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Attendance Ledger */}
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm mb-4 overflow-x-auto overflow-y-clip print:rounded-none print:border-0 print:shadow-none print:mb-1">
              <div className="px-5 pt-4 pb-2 print:px-0 print:pt-0 print:pb-1">
                <h2 className="font-bold text-slate-800 print:text-sm">Attendance Ledger</h2>
                <p className="text-xs text-slate-400 mt-0.5 print:hidden">
                  {fromDate} — {toDate} · {ledger.length} day{ledger.length !== 1 ? "s" : ""}
                </p>
                <p className="text-xs mt-1.5 print:hidden">
                  <span className="text-slate-500">Required Hours: <span className="font-semibold text-slate-700">{hoursToHHMM(requiredHoursSummary.totalRequired)}</span></span>
                  <span className="mx-2 text-slate-300">|</span>
                  <span className="text-slate-500">Worked Hours: <span className="font-semibold text-slate-700">{hoursToHHMM(totalWorkedHours)}</span></span>
                  <span className="mx-2 text-slate-300">|</span>
                  <span className="text-slate-500">Variance: <span className={`font-semibold ${requiredHoursSummary.variance < 0 ? "text-red-500" : "text-green-600"}`}>{requiredHoursSummary.variance > 0 ? "+" : ""}{hoursToHHMM(requiredHoursSummary.variance)}</span></span>
                </p>
                {notice && <p className="text-xs text-blue-700 bg-blue-50 rounded-lg px-3 py-1.5 mt-2 inline-block print:hidden">{notice}</p>}
              </div>
              <table className="w-full min-w-[820px] text-sm print:min-w-0 print:text-[9px]">
                <thead className="bg-slate-50 text-slate-500 print:bg-slate-200">
                  <tr>
                    {["Date", "Day", "Shift", "In", "Out", "Required Hours", "Hours", "Late (min)", "Short (hrs)", "OT (hrs)", "Status",
                      ...(canToggle ? ["HD Exempt", "Late Exempt", "Holiday", "Adj Status", "Adjust"] : [])
                    ].map((h) => (
                      <th key={h} className={`text-left px-4 py-3 font-medium print:px-1.5 print:py-1 sticky top-0 z-10 bg-slate-50 print:static print:bg-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.08)] print:shadow-none ${canToggle && ["HD Exempt","Late Exempt","Holiday","Adj Status","Adjust"].includes(h) ? "print:hidden" : ""}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ledger.length === 0 ? (
                    <tr>
                      <td colSpan={canToggle ? 16 : 11} className="px-4 py-10 text-center text-slate-400">
                        No attendance records found for this period.
                      </td>
                    </tr>
                  ) : (
                    ledger.map((row, i) => {
                      const status = row.attendance_status || row.status || "Pending";
                      const rowPolicy = STAFF_LEVEL_POLICIES[selectedEmp.staff_level];
                      const shift = row.detected_shift;
                      const rowClass = status === "Absent" ? "bg-red-50/40"
                        : (status === "Weekly Off" || status === "Gazetted Holiday") ? "bg-slate-50/60"
                        : "";
                      return (
                        <tr key={row.id || row.work_date || i} className={rowClass}>
                          <td className="px-4 py-3 font-medium text-slate-800 print:px-1.5 print:py-0.5">{row.work_date}</td>
                          <td className="px-4 py-3 text-slate-400 text-xs print:px-1.5 print:py-0.5">{getDayName(row.work_date)}</td>
                          <td className="px-4 py-3 print:px-1.5 print:py-0.5">
                            {shift ? (
                              <span className={`font-medium ${shift === "A" ? "text-blue-600" : shift === "B" ? "text-purple-600" : "text-amber-600"}`}>
                                {shift === "HalfDay" ? "HD" : `Sh.${shift}`}
                              </span>
                            ) : "—"}
                          </td>
                          <td className="px-4 py-3 print:px-1.5 print:py-0.5">{row.is_synthetic ? "—" : formatTime(row.check_in || row.time_in)}</td>
                          <td className="px-4 py-3 print:px-1.5 print:py-0.5">{row.is_synthetic ? "—" : formatTime(row.check_out || row.time_out)}</td>
                          <td className="px-4 py-3 print:px-1.5 print:py-0.5 text-slate-500">{hoursToHHMM(rowRequiredHours(row, rowPolicy))}</td>
                          <td className="px-4 py-3 print:px-1.5 print:py-0.5">{row.is_synthetic ? "—" : hoursToHHMM(row.actual_hours ?? row.hours_worked ?? 0)}</td>
                          <td className="px-4 py-3 print:px-1.5 print:py-0.5">
                            {Number(row.late_minutes || 0) > 0 ? <span className="text-amber-600 font-medium">{row.late_minutes}</span> : "0"}
                          </td>
                          <td className="px-4 py-3 print:px-1.5 print:py-0.5">
                            {Number(row.short_hours || 0) > 0 ? <span className="text-red-500 font-medium">{hoursToHHMM(row.short_hours)}</span> : "00:00"}
                          </td>
                          <td className="px-4 py-3 print:px-1.5 print:py-0.5">
                            {Number(row.ot_hours || row.overtime_hours || 0) > 0 ? (
                              <span className="text-blue-600 font-medium">{hoursToHHMM(row.ot_hours ?? row.overtime_hours)}</span>
                            ) : "00:00"}
                          </td>
                          <td className="px-4 py-3 print:px-1.5 print:py-0.5">
                            <StatusBadge status={status} />
                            {canToggle && status === "Absent" && (
                              <>
                                <button onClick={() => markDayAsLeave(row)} className="block mt-1 text-[10px] text-blue-600 underline print:hidden">
                                  Mark as Leave
                                </button>
                                <button onClick={() => openOverrideModal(row, "Weekly Off")} className="block mt-1 text-[10px] text-purple-600 underline print:hidden">
                                  Mark as Weekly Off
                                </button>
                              </>
                            )}
                            {canToggle && ["Present", "Late", "Half Day", "Short Hours", "Early Out"].includes(status) && (
                              <button onClick={() => openOverrideModal(row, "Absent")} className="block mt-1 text-[10px] text-red-600 underline print:hidden">
                                Mark as Absent
                              </button>
                            )}
                          </td>
                          {canToggle && (
                            <>
                              <td className="px-4 py-3 print:hidden">
                                {row.id ? <Toggle value={!!row.half_day_exempt} tone="purple" onChange={() => toggleFlag(row, "halfDayExempt", row.half_day_exempt)} /> : <span className="text-slate-300">—</span>}
                              </td>
                              <td className="px-4 py-3 print:hidden">
                                {row.id ? <Toggle value={!!row.late_exempt} tone="blue" onChange={() => toggleFlag(row, "lateExempt", row.late_exempt)} /> : <span className="text-slate-300">—</span>}
                              </td>
                              <td className="px-4 py-3 print:hidden">
                                {row.id ? <Toggle value={!!row.is_gazetted_holiday} tone="green" onChange={() => toggleFlag(row, "isGazettedHoliday", row.is_gazetted_holiday)} /> : <span className="text-slate-300">—</span>}
                              </td>
                              <td className="px-4 py-3 print:hidden">
                                {row.adjustment_status
                                  ? <Badge tone={ADJ_TONE[row.adjustment_status] || "slate"}>{row.adjustment_status}</Badge>
                                  : <span className="text-slate-300 text-xs">—</span>}
                              </td>
                              <td className="px-4 py-3 print:hidden">
                                {pendingAdjByDate[row.work_date] ? (
                                  <Badge tone="yellow">Pending Approval</Badge>
                                ) : (
                                  <button onClick={() => openAdjustModal(row)}
                                    className="text-xs px-2 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition">
                                    Adjust
                                  </button>
                                )}
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {ledger.length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-50 font-semibold border-t-2 border-slate-200 print:bg-slate-100">
                      <td colSpan={5} className="px-4 py-3 text-right text-slate-600 print:px-1.5 print:py-1">Totals</td>
                      <td className="px-4 py-3 print:px-1.5 print:py-1 text-slate-500">{hoursToHHMM(requiredHoursSummary.totalRequired)}</td>
                      <td className="px-4 py-3 print:px-1.5 print:py-1">{hoursToHHMM(totalWorkedHours)}</td>
                      <td className="px-4 py-3 print:px-1.5 print:py-1">{lateSummary.totalLateMins}</td>
                      <td className="px-4 py-3 print:px-1.5 print:py-1">{hoursToHHMM(shortSummary.totalShort)}</td>
                      <td className="px-4 py-3 print:px-1.5 print:py-1">{hoursToHHMM(otSummary.totalOT)}</td>
                      <td className="px-4 py-3 print:px-1.5 print:py-1"></td>
                      {canToggle && <td colSpan={5} className="px-4 py-3 print:hidden"></td>}
                    </tr>
                  </tfoot>
                )}
              </table>
              {canToggle && (
                <div className="px-5 py-3 flex flex-wrap gap-4 text-xs text-slate-500 print:hidden">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-purple-500 inline-block" /> HD Exempt</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-blue-500 inline-block" /> Late Exempt</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-green-500 inline-block" /> Gazetted Holiday</span>
                  {role === "HR" && <span className="text-amber-600 font-medium">HR toggles require Master approval.</span>}
                </div>
              )}
            </div>

          {/* Attendance Breakdown */}
          <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm mb-4 print:p-2 print:border-slate-300 print:mb-1">
            <div className="flex items-center gap-2 mb-4 print:mb-1">
              <span className="h-9 w-9 rounded-xl bg-indigo-50 flex items-center justify-center text-lg shrink-0 print:hidden">📊</span>
              <h3 className="font-bold text-slate-800 print:text-xs">Attendance Breakdown</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3 print:gap-1.5">
              {statusCounts.map(({ status, count }) => (
                <div key={status} className="text-center rounded-xl p-3 bg-slate-50 print:p-1 print:border print:border-slate-300">
                  <div className="text-xl font-bold text-slate-900 print:text-sm">{count}</div>
                  <div className="text-xs text-slate-500 print:text-[8px]">{status}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4 print:gap-2 print:mb-1">
            {/* Late Summary */}
            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm print:p-2 print:border-slate-300">
              <div className="flex items-center gap-2 mb-4 print:mb-1">
                <span className="h-9 w-9 rounded-xl bg-amber-50 flex items-center justify-center text-lg shrink-0 print:hidden">⏰</span>
                <h3 className="font-bold text-slate-800 print:text-xs">Late Summary</h3>
              </div>
              <div className="space-y-2.5 print:space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Total Late Count</span>
                  <Badge tone={lateSummary.totalLateCount > 0 ? "yellow" : "green"}>
                    {lateSummary.totalLateCount}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Total Late Minutes</span>
                  <span className="font-semibold">{lateSummary.totalLateMins} mins</span>
                </div>
                <div className="h-px bg-slate-100" />
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">Warning only (first {LATE_WARNING_COUNT})</span>
                  <span className="text-amber-500">{Math.min(lateSummary.totalLateCount, LATE_WARNING_COUNT)}</span>
                </div>
                <div className="flex items-center justify-between text-sm font-semibold">
                  <span className="text-slate-700">Deductible Lates</span>
                  <Badge tone={lateSummary.deductibleLates > 0 ? "red" : "green"}>
                    {lateSummary.deductibleLates}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Short Hours */}
            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm print:p-2 print:border-slate-300">
              <div className="flex items-center gap-2 mb-4 print:mb-1">
                <span className="h-9 w-9 rounded-xl bg-red-50 flex items-center justify-center text-lg shrink-0 print:hidden">⏱️</span>
                <h3 className="font-bold text-slate-800 print:text-xs">Short Hours</h3>
              </div>
              <div className="space-y-2.5 print:space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Monthly Short Hours</span>
                  <span className="font-semibold">{hoursToHHMM(shortSummary.totalShort)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Tolerance</span>
                  <span className="text-slate-400">{hoursToHHMM(SHORT_TOLERANCE)}</span>
                </div>
                <div className="h-px bg-slate-100" />
                <div className="flex items-center justify-between text-sm font-semibold">
                  <span className="text-slate-700">Deductible Short Hours</span>
                  <Badge tone={shortSummary.deductibleShort > 0 ? "red" : "green"}>
                    {hoursToHHMM(shortSummary.deductibleShort)}
                  </Badge>
                </div>
              </div>
            </div>

            {/* OT Summary */}
            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm print:p-2 print:border-slate-300">
              <div className="flex items-center gap-2 mb-4 print:mb-1">
                <span className="h-9 w-9 rounded-xl bg-blue-50 flex items-center justify-center text-lg shrink-0 print:hidden">💼</span>
                <h3 className="font-bold text-slate-800 print:text-xs">OT Summary</h3>
              </div>
              <div className="space-y-2.5 print:space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Monthly OT</span>
                  <span className="font-semibold">{hoursToHHMM(otSummary.totalOT)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Tolerance</span>
                  <span className="text-slate-400">{hoursToHHMM(OT_TOLERANCE)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">OT Eligible</span>
                  <Badge tone={isOtEligible ? "green" : "slate"}>{isOtEligible ? "Yes" : "No"}</Badge>
                </div>
                <div className="h-px bg-slate-100" />
                <div className="flex items-center justify-between text-sm font-semibold">
                  <span className="text-slate-700">Payable OT</span>
                  <Badge tone={otSummary.payableOT > 0 ? "blue" : "slate"}>
                    {hoursToHHMM(otSummary.payableOT)}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Extra Working Days */}
            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm print:p-2 print:border-slate-300">
              <div className="flex items-center gap-2 mb-4 print:mb-1">
                <span className="h-9 w-9 rounded-xl bg-indigo-50 flex items-center justify-center text-lg shrink-0 print:hidden">📅</span>
                <h3 className="font-bold text-slate-800 print:text-xs">Extra Working Days</h3>
              </div>
              <div className="space-y-2.5 print:space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Weekly Offs Worked</span>
                  <Badge tone={extraWorkingDaysCount > 0 ? "blue" : "slate"}>{extraWorkingDaysCount}</Badge>
                </div>
                <div className="h-px bg-slate-100" />
                <p className="text-xs text-slate-400">Counts only weekly-off days the employee actually punched in on — this is what payroll pays EWD for.</p>
              </div>
            </div>
          </div>

          {/* Leave Balance */}
          <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm mb-4 print:rounded-none print:border-0 print:shadow-none print:mb-1 print:p-0">
            <div className="flex items-center gap-2 mb-4 print:hidden">
              <span className="h-9 w-9 rounded-xl bg-emerald-50 flex items-center justify-center text-lg shrink-0">🌴</span>
              <h3 className="font-bold text-slate-800">Leave Balance</h3>
            </div>
            <h3 className="hidden print:block font-bold text-slate-800 mb-1 text-xs">Annual Leave Balance</h3>
            {leaveData ? (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 print:gap-1.5">
                {[
                  { label: "Opening Balance", value: leaveData.opening_balance },
                  { label: "Earned", value: leaveData.earned },
                  { label: "Used", value: leaveData.used },
                  { label: "Half Leaves", value: leaveData.half_leaves },
                  { label: "Remaining Balance", value: leaveData.remaining ?? leaveData.remaining_balance, highlight: true },
                ].map(({ label, value, highlight }) => (
                  <div key={label} className={`text-center rounded-xl p-4 print:p-1 print:border print:border-slate-300 ${highlight ? "bg-emerald-50 border border-emerald-100" : "bg-slate-50"}`}>
                    <div className="text-xs text-slate-500 mb-1 print:mb-0">{label}</div>
                    <div className={`text-2xl font-bold print:text-sm ${highlight ? "text-emerald-700" : "text-slate-900"}`}>{value ?? "—"}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">No leave balance data found for this employee.</p>
            )}
          </div>

          {/* Print Signature Footer */}
          <div className="hidden print:flex justify-between mt-6 pt-2 border-t border-slate-300">
            {[["HR Manager", "Human Resources"], ["Supervisor", "Direct Supervisor"], ["Employee", selectedEmp.full_name]].map(([title, name]) => (
              <div key={title} className="text-center w-1/3">
                <div className="border-t border-slate-600 mt-6 pt-1 mx-4">
                  <p className="font-semibold text-xs">{title}</p>
                  <p className="text-xs text-slate-500">{name}</p>
                  <p className="text-xs text-slate-400 mt-1">Date: _______________</p>
                </div>
              </div>
            ))}
          </div>

          </div>{/* end timesheet-print-root */}
        </>
      )}
    </div>
  );
}
