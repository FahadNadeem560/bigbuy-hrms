import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { Badge, PageTitle } from "../components/ui.jsx";
import { BRANCH_CODE_MAP } from "../constants/branches.js";

const STAFF_LEVELS = ["Management", "Floor Management", "Non-Management"];

const GROUP_LABELS = {
  MANAGEMENT_ADMIN: "Management / Admin",
  SALES_SUPPORT: "Non-Management",
  FLOOR_MANAGEMENT: "Floor Management",
};

function YesNoBadge({ value }) {
  return <Badge tone={value ? "green" : "slate"}>{value ? "Yes" : "No"}</Badge>;
}

export default function Permissions({ employees, role }) {
  const [groups, setGroups] = useState([]);
  const [search, setSearch] = useState("");
  const [filterBranch, setFilterBranch] = useState("All");
  const [filterDept, setFilterDept] = useState("");
  const [filterLevel, setFilterLevel] = useState("All");
  const [filterStatus, setFilterStatus] = useState("Active");
  const [notice, setNotice] = useState("");
  const [noticeError, setNoticeError] = useState(false);
  const [pending, setPending] = useState({}); // employee_code -> true while a write is in flight
  const [groupPending, setGroupPending] = useState({}); // group code -> true while a write is in flight
  // employee_code -> camelCase field patch. The `employees` array is owned by App.jsx
  // and only refetched on a full reload, so a DB save alone never re-renders this
  // page's badges — this local overlay is what actually makes a save show up.
  const [overrides, setOverrides] = useState({});

  const canEdit = role === "HR" || role === "Master";

  function loadGroups() {
    supabase.from("staff_eligibility_groups").select("*").order("code").then(({ data }) => setGroups(data || []));
  }

  useEffect(() => { loadGroups(); }, []);

  const groupByCode = useMemo(() => Object.fromEntries((groups || []).map(g => [g.code, g])), [groups]);

  function say(message, isError = false) {
    setNotice(message);
    setNoticeError(isError);
    setTimeout(() => setNotice(""), isError ? 5000 : 2000);
  }

  async function saveGroupField(code, patch) {
    if (!canEdit) return;
    setGroupPending(p => ({ ...p, [code]: true }));
    const { error } = await supabase.from("staff_eligibility_groups").update(patch).eq("code", code);
    setGroupPending(p => ({ ...p, [code]: false }));
    if (error) { say(`Error saving ${code}: ${error.message}`, true); return; }
    setGroups(gs => gs.map(g => g.code === code ? { ...g, ...patch } : g));
    say("Saved.");
  }

  const rows = useMemo(() => {
    const list = (employees || [])
      .filter(e => !e.isDeleted)
      .map(e => overrides[e.id] ? { ...e, ...overrides[e.id] } : e);
    const q = search.trim().toLowerCase();
    const dq = filterDept.trim().toLowerCase();
    return list
      .filter(e => !q || e.name?.toLowerCase().includes(q) || e.id?.toLowerCase().includes(q) || e.dept?.toLowerCase().includes(q))
      .filter(e => filterBranch === "All" || e.branch === filterBranch)
      .filter(e => !dq || e.dept?.toLowerCase().includes(dq))
      .filter(e => filterLevel === "All" || e.level === filterLevel)
      .filter(e => filterStatus === "All" || e.status === filterStatus)
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [employees, search, overrides, filterBranch, filterDept, filterLevel, filterStatus]);

  // dbPatch: snake_case columns written to Supabase. localPatch: the same
  // change in the camelCase shape mapEmployeeRecord() produces, merged into
  // `overrides` on success so the table reflects it without a full reload.
  async function saveField(employeeCode, dbPatch, localPatch) {
    if (!canEdit) return false;
    setPending(p => ({ ...p, [employeeCode]: true }));
    const { error } = await supabase.from("employees").update(dbPatch).eq("employee_code", employeeCode);
    setPending(p => ({ ...p, [employeeCode]: false }));
    if (error) { say(`Error saving ${employeeCode}: ${error.message}`, true); return false; }
    setOverrides(o => ({ ...o, [employeeCode]: { ...o[employeeCode], ...localPatch } }));
    say("Saved.");
    return true;
  }

  // Flipping half_day_exempt/late_exempt here only changes the *employee*
  // row -- classify_attendance_day only reads it the next time a day gets
  // (re)classified (a future ZKT sync, or an explicit reclassify call), so
  // the toggle alone leaves every already-computed attendance row exactly
  // as it was. Reclassify every day back to the earliest month payroll is
  // still tracking as Draft, so the change lands wherever payroll hasn't
  // been finalized yet -- but skip any month whose payroll is already
  // Published, since that's a closed/paid record and shouldn't silently
  // move under it. If a month has no payroll row at all yet, it's treated
  // as unpublished (eligible) rather than skipped.
  async function reclassifyUnpublishedMonths(employeeCode) {
    const { data: payrollMeta } = await supabase.from("payroll").select("payroll_month, status");
    const trackedMonths = Array.from(new Set((payrollMeta || []).map(p => p.payroll_month))).sort();
    const publishedMonths = new Set((payrollMeta || []).filter(p => p.status === "Published").map(p => p.payroll_month));
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const earliestMonth = trackedMonths[0] || currentMonth;
    const fromDate = `${earliestMonth}-01`;

    const { data: rows, error } = await supabase.from("attendance")
      .select("id, work_date")
      .eq("employee_code", employeeCode)
      .gte("work_date", fromDate);
    if (error || !rows?.length) return;

    const eligible = rows.filter(r => !publishedMonths.has(r.work_date.slice(0, 7)));
    let updated = 0;
    for (const row of eligible) {
      const { error: rpcErr } = await supabase.rpc("reclassify_attendance_row", { p_attendance_id: row.id });
      if (!rpcErr) updated++;
    }
    say(`Saved. Reclassified ${updated} day(s) across unpublished months.`);
  }

  // audit_logs schema is (id, action_type, performed_by, details, created_at) —
  // no action/entity/entity_id columns despite several other pages in this app
  // inserting those (silently failing, since .then(()=>{}) swallows the error).
  function logAudit(actionType, employeeCode, details) {
    supabase.from("audit_logs").insert({
      action_type: actionType, performed_by: role,
      details: `[${employeeCode}] ${details}`,
      created_at: new Date().toISOString(),
    }).then(() => {});
  }

  function cycleOtEligible(e) {
    // null (group default) -> true -> false -> null
    const next = e.otEligible == null ? true : e.otEligible === true ? false : null;
    saveField(e.id, { ot_eligible: next }, { otEligible: next });
  }

  function cycleExtraDaysEligible(e) {
    const next = e.extraDaysEligible == null ? true : e.extraDaysEligible === true ? false : null;
    saveField(e.id, { extra_days_eligible: next }, { extraDaysEligible: next });
  }

  function cycleGhEligible(e) {
    const next = e.ghEligible == null ? true : e.ghEligible === true ? false : null;
    saveField(e.id, { gazetted_holiday_eligible: next }, { ghEligible: next });
  }

  async function toggleLeaveEligible(e) {
    const next = !e.leaveEligible;
    if (!(await saveField(e.id, { leave_eligible: next }, { leaveEligible: next }))) return;
    logAudit(next ? "leave_eligible_enabled" : "leave_eligible_disabled", e.id, `Leave eligibility ${next ? "enabled" : "disabled"}.`);
  }

  async function toggleSinglePunchOk(e) {
    const next = !e.singlePunchOk;
    if (!(await saveField(e.id, { single_punch_ok: next }, { singlePunchOk: next }))) return;
    logAudit(next ? "single_punch_ok_enabled" : "single_punch_ok_disabled", e.id, `Single-punch-OK ${next ? "enabled" : "disabled"}.`);
  }

  async function toggleHalfDayExempt(e) {
    const next = !e.halfDayExempt;
    if (!(await saveField(e.id, { half_day_exempt: next }, { halfDayExempt: next }))) return;
    logAudit(next ? "half_day_exempt_enabled" : "half_day_exempt_disabled", e.id, `Half Day Exempt ${next ? "enabled" : "disabled"}.`);
    reclassifyUnpublishedMonths(e.id);
  }

  async function toggleLateExempt(e) {
    const next = !e.lateExempt;
    if (!(await saveField(e.id, { late_exempt: next }, { lateExempt: next }))) return;
    logAudit(next ? "late_exempt_enabled" : "late_exempt_disabled", e.id, `Late Exempt ${next ? "enabled" : "disabled"}.`);
    reclassifyUnpublishedMonths(e.id);
  }

  async function toggleAttendanceExempt(e) {
    const turningOn = !e.isAttendanceExempt;
    let reason = null;
    if (turningOn) {
      reason = (window.prompt("Reason for attendance exemption (required):", "") || "").trim();
      if (!reason) { say("Exemption reason is required — exemption not changed.", true); return; }
    }
    if (!(await saveField(
      e.id,
      { is_attendance_exempt: turningOn, exemption_reason: reason },
      { isAttendanceExempt: turningOn, exemptionReason: reason || "" }
    ))) return;
    logAudit(
      turningOn ? "exemption_granted" : "exemption_removed",
      e.id,
      turningOn ? `Attendance exemption granted. Reason: ${reason}` : "Attendance exemption removed."
    );
  }

  return (
    <div>
      <PageTitle
        title="Permissions"
        subtitle="Feature checklist per employee — every eligibility/exemption flag the app supports, in one place."
      />

      {notice && (
        <div className={`mb-3 p-2 rounded-xl text-sm ${noticeError ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700"}`}>
          {notice}
        </div>
      )}
      {!canEdit && (
        <div className="mb-3 p-3 rounded-xl bg-amber-50 text-amber-700 text-xs">
          View-only — only HR and Master can change eligibility settings here.
        </div>
      )}

      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto overflow-y-auto max-h-[70vh] mb-4">
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800 text-sm">Eligibility Group Defaults</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Staff-level defaults. Individual employees can still override OT, Extra Day and Gazetted Holiday via the table below.
          </p>
        </div>
        <table className="w-full min-w-[700px] text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              {["Staff Level", "Required Hours", "OT Eligible (default)", "Extra Day Eligible", "Gazetted Holiday Eligible"].map(h => (
                <th key={h} className="text-left px-3 py-3 font-medium sticky top-0 z-10 bg-slate-50 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {groups.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Loading groups…</td></tr>
            ) : groups.map(g => {
              const busy = !!groupPending[g.code];
              return (
                <tr key={g.code}>
                  <td className="px-3 py-2.5 font-medium">{GROUP_LABELS[g.code] || g.code}</td>
                  <td className="px-3 py-2.5">
                    <input
                      type="number"
                      step="0.5"
                      disabled={!canEdit || busy}
                      defaultValue={g.required_hours}
                      onBlur={ev => {
                        const val = Number(ev.target.value);
                        if (!isNaN(val) && val !== Number(g.required_hours)) saveGroupField(g.code, { required_hours: val });
                      }}
                      className="w-20 px-2 py-1 rounded-lg border border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <button disabled={!canEdit || busy} className="disabled:cursor-default"
                      onClick={() => saveGroupField(g.code, { overtime_eligible: !g.overtime_eligible })}>
                      <YesNoBadge value={!!g.overtime_eligible} />
                    </button>
                  </td>
                  <td className="px-3 py-2.5">
                    <button disabled={!canEdit || busy} className="disabled:cursor-default"
                      onClick={() => saveGroupField(g.code, { extra_days_eligible: !g.extra_days_eligible })}>
                      <YesNoBadge value={!!g.extra_days_eligible} />
                    </button>
                  </td>
                  <td className="px-3 py-2.5">
                    <button disabled={!canEdit || busy} className="disabled:cursor-default"
                      onClick={() => saveGroupField(g.code, { gazetted_holiday_eligible: !g.gazetted_holiday_eligible })}>
                      <YesNoBadge value={!!g.gazetted_holiday_eligible} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm mb-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, ID or department..."
            className="px-4 py-2 rounded-xl border border-slate-200 text-sm"
          />
          <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm">
            <option value="All">All Branches</option>
            {Object.keys(BRANCH_CODE_MAP).map(b => <option key={b}>{b}</option>)}
          </select>
          <input
            value={filterDept}
            onChange={e => setFilterDept(e.target.value)}
            placeholder="Filter by department"
            className="px-4 py-2 rounded-xl border border-slate-200 text-sm"
          />
          <select value={filterLevel} onChange={e => setFilterLevel(e.target.value)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm">
            <option value="All">All Staff Levels</option>
            {STAFF_LEVELS.map(l => <option key={l}>{l}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm">
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
            <option value="All">All</option>
          </select>
        </div>
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto overflow-y-auto max-h-[70vh]">
        <p className="px-4 pt-3 text-xs text-slate-400">{rows.length} employee{rows.length !== 1 ? "s" : ""}</p>
        <table className="w-full min-w-[2000px] text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              {["Employee", "Branch", "Department", "Staff Level", "Eligibility Group", "OT Eligible", "Extra Day Eligible", "Gazetted Holiday Eligible", "Leave Eligible", "Attendance Exempt", "Single Punch OK", "Half Day Exempt", "Late Exempt"].map(h => (
                <th key={h} className="text-left px-3 py-3 font-medium sticky top-0 z-10 bg-slate-50 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr><td colSpan={13} className="px-4 py-8 text-center text-slate-400">No employees match.</td></tr>
            ) : rows.map(e => {
              const group = e.eligibilityGroup ? groupByCode[e.eligibilityGroup] : null;
              const otEffective = e.otEligible != null ? !!e.otEligible : !!group?.overtime_eligible;
              const extraDaysEffective = e.extraDaysEligible != null ? !!e.extraDaysEligible : !!group?.extra_days_eligible;
              const ghEffective = e.ghEligible != null ? !!e.ghEligible : !!group?.gazetted_holiday_eligible;
              const busy = !!pending[e.id];
              return (
                <tr key={e.id}>
                  <td className="px-3 py-2.5 font-medium">
                    {e.name}
                    <div className="text-xs text-slate-400 font-mono">{e.id}</div>
                  </td>
                  <td className="px-3 py-2.5 text-slate-500">{e.branch}</td>
                  <td className="px-3 py-2.5 text-slate-500">{e.dept}</td>
                  <td className="px-3 py-2.5">{e.level}</td>
                  <td className="px-3 py-2.5">
                    {e.eligibilityGroup
                      ? <Badge tone="blue">{GROUP_LABELS[e.eligibilityGroup] || e.eligibilityGroup}</Badge>
                      : <span className="text-slate-300 text-xs">Not set</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      disabled={!canEdit || busy}
                      onClick={() => cycleOtEligible(e)}
                      className="disabled:cursor-default"
                      title={canEdit ? "Click to cycle: group default / Yes / No" : ""}
                    >
                      <YesNoBadge value={otEffective} />
                      {e.otEligible == null && <span className="ml-1 text-[10px] text-slate-400">(group default)</span>}
                    </button>
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      disabled={!canEdit || busy}
                      onClick={() => cycleExtraDaysEligible(e)}
                      className="disabled:cursor-default"
                      title={canEdit ? "Click to cycle: group default / Yes / No" : ""}
                    >
                      <YesNoBadge value={extraDaysEffective} />
                      {e.extraDaysEligible == null && <span className="ml-1 text-[10px] text-slate-400">(group default)</span>}
                    </button>
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      disabled={!canEdit || busy}
                      onClick={() => cycleGhEligible(e)}
                      className="disabled:cursor-default"
                      title={canEdit ? "Click to cycle: group default / Yes / No" : ""}
                    >
                      <YesNoBadge value={ghEffective} />
                      {e.ghEligible == null && <span className="ml-1 text-[10px] text-slate-400">(group default)</span>}
                    </button>
                  </td>
                  <td className="px-3 py-2.5">
                    <button disabled={!canEdit || busy} onClick={() => toggleLeaveEligible(e)} className="disabled:cursor-default">
                      <YesNoBadge value={e.leaveEligible} />
                    </button>
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      disabled={!canEdit || busy}
                      onClick={() => toggleAttendanceExempt(e)}
                      className="disabled:cursor-default"
                      title={e.isAttendanceExempt && e.exemptionReason ? `Reason: ${e.exemptionReason}` : ""}
                    >
                      <YesNoBadge value={e.isAttendanceExempt} />
                    </button>
                  </td>
                  <td className="px-3 py-2.5">
                    <button disabled={!canEdit || busy} onClick={() => toggleSinglePunchOk(e)} className="disabled:cursor-default"
                      title="A single punch (in or out only) is treated as a full required-hours day instead of a review exception.">
                      <YesNoBadge value={e.singlePunchOk} />
                    </button>
                  </td>
                  <td className="px-3 py-2.5">
                    <button disabled={!canEdit || busy} onClick={() => toggleHalfDayExempt(e)} className="disabled:cursor-default"
                      title="Never classified Half Day (falls through to Late/Early Out/Present instead) and never docked for one in payroll.">
                      <YesNoBadge value={e.halfDayExempt} />
                    </button>
                  </td>
                  <td className="px-3 py-2.5">
                    <button disabled={!canEdit || busy} onClick={() => toggleLateExempt(e)} className="disabled:cursor-default"
                      title="Late arrivals never become 'Late' status and never trigger a late penalty deduction.">
                      <YesNoBadge value={e.lateExempt} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <p className="text-xs text-slate-400 mt-2">
          OT Eligible, Extra Day Eligible and Gazetted Holiday Eligible all cycle through: group default → Yes → No → group default. Set the staff-level default in the "Eligibility Group Defaults" table above, then override an individual employee here only when they're an exception to their group. All other columns are a direct Yes/No toggle per employee — click a badge to flip it. Half Day Exempt / Late Exempt apply from the next attendance sync onward; use Timesheet's per-day toggle for a one-off exception instead of a standing policy.
        </p>
      )}
    </div>
  );
}
