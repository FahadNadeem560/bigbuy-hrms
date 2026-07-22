import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { Badge, PageTitle } from "../components/ui.jsx";

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
  const [notice, setNotice] = useState("");
  const [noticeError, setNoticeError] = useState(false);
  const [pending, setPending] = useState({}); // employee_code -> true while a write is in flight
  const [groupPending, setGroupPending] = useState({}); // group code -> true while a write is in flight

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
    const list = (employees || []).filter(e => !e.isDeleted);
    const q = search.trim().toLowerCase();
    return list
      .filter(e => !q || e.name?.toLowerCase().includes(q) || e.id?.toLowerCase().includes(q) || e.dept?.toLowerCase().includes(q))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [employees, search]);

  async function saveField(employeeCode, patch) {
    if (!canEdit) return false;
    setPending(p => ({ ...p, [employeeCode]: true }));
    const { error } = await supabase.from("employees").update(patch).eq("employee_code", employeeCode);
    setPending(p => ({ ...p, [employeeCode]: false }));
    if (error) { say(`Error saving ${employeeCode}: ${error.message}`, true); return false; }
    say("Saved.");
    return true;
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
    saveField(e.id, { ot_eligible: next });
  }

  function cycleExtraDaysEligible(e) {
    const next = e.extraDaysEligible == null ? true : e.extraDaysEligible === true ? false : null;
    saveField(e.id, { extra_days_eligible: next });
  }

  function cycleGhEligible(e) {
    const next = e.ghEligible == null ? true : e.ghEligible === true ? false : null;
    saveField(e.id, { gazetted_holiday_eligible: next });
  }

  async function toggleFieldEmployee(e) {
    const next = !e.isFieldEmployee;
    if (!(await saveField(e.id, { is_field_employee: next }))) return;
    logAudit(next ? "field_employee_enabled" : "field_employee_disabled", e.id, `Field employee ${next ? "enabled" : "disabled"}.`);
  }

  async function toggleAttendanceExempt(e) {
    const turningOn = !e.isAttendanceExempt;
    let reason = null;
    if (turningOn) {
      reason = (window.prompt("Reason for attendance exemption (required):", "") || "").trim();
      if (!reason) { say("Exemption reason is required — exemption not changed.", true); return; }
    }
    if (!(await saveField(e.id, { is_attendance_exempt: turningOn, exemption_reason: reason }))) return;
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
        subtitle="Eligibility checks per employee — overtime, extra day, gazetted holiday, attendance exemption and field status."
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

      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto mb-4">
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
                <th key={h} className="text-left px-3 py-3 font-medium">{h}</th>
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
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, ID or department..."
          className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm"
        />
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              {["Employee", "Department", "Staff Level", "Eligibility Group", "OT Eligible", "Extra Day Eligible", "Gazetted Holiday Eligible", "Attendance Exempt", "Field Employee"].map(h => (
                <th key={h} className="text-left px-3 py-3 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">No employees match.</td></tr>
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
                    <button
                      disabled={!canEdit || busy}
                      onClick={() => toggleFieldEmployee(e)}
                      className="disabled:cursor-default"
                    >
                      <YesNoBadge value={e.isFieldEmployee} />
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
          OT Eligible, Extra Day Eligible and Gazetted Holiday Eligible all cycle through: group default → Yes → No → group default. Set the staff-level default in the "Eligibility Group Defaults" table above, then override an individual employee here only when they're an exception to their group.
        </p>
      )}
    </div>
  );
}
