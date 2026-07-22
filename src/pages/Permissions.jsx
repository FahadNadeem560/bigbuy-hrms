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
  const [pending, setPending] = useState({}); // employee_code -> true while a write is in flight

  const canEdit = role === "HR" || role === "Master";

  useEffect(() => {
    supabase.from("staff_eligibility_groups").select("*").then(({ data }) => setGroups(data || []));
  }, []);

  const groupByCode = useMemo(() => Object.fromEntries((groups || []).map(g => [g.code, g])), [groups]);

  const rows = useMemo(() => {
    const list = (employees || []).filter(e => !e.isDeleted);
    const q = search.trim().toLowerCase();
    return list
      .filter(e => !q || e.name?.toLowerCase().includes(q) || e.id?.toLowerCase().includes(q) || e.dept?.toLowerCase().includes(q))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [employees, search]);

  async function saveField(employeeCode, patch) {
    if (!canEdit) return;
    setPending(p => ({ ...p, [employeeCode]: true }));
    const { error } = await supabase.from("employees").update(patch).eq("employee_code", employeeCode);
    setPending(p => ({ ...p, [employeeCode]: false }));
    if (error) { setNotice(`Error: ${error.message}`); return; }
    setNotice("Saved.");
    setTimeout(() => setNotice(""), 2000);
  }

  function cycleOtEligible(e) {
    // null (group default) -> true -> false -> null
    const next = e.otEligible == null ? true : e.otEligible === true ? false : null;
    saveField(e.id, { ot_eligible: next });
  }

  return (
    <div>
      <PageTitle
        title="Permissions"
        subtitle="Eligibility checks per employee — overtime, extra day, gazetted holiday, attendance exemption and field status."
      />

      {notice && <div className="mb-3 p-2 rounded-xl bg-blue-50 text-blue-700 text-sm">{notice}</div>}
      {!canEdit && (
        <div className="mb-3 p-3 rounded-xl bg-amber-50 text-amber-700 text-xs">
          View-only — only HR and Master can change eligibility settings here.
        </div>
      )}

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
                  <td className="px-3 py-2.5"><YesNoBadge value={!!group?.extra_days_eligible} /></td>
                  <td className="px-3 py-2.5"><YesNoBadge value={!!group?.gazetted_holiday_eligible} /></td>
                  <td className="px-3 py-2.5">
                    <button
                      disabled={!canEdit || busy}
                      onClick={() => saveField(e.id, { is_attendance_exempt: !e.isAttendanceExempt })}
                      className="disabled:cursor-default"
                    >
                      <YesNoBadge value={e.isAttendanceExempt} />
                    </button>
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      disabled={!canEdit || busy}
                      onClick={() => saveField(e.id, { is_field_employee: !e.isFieldEmployee })}
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
          OT Eligible cycles through: group default → Yes → No → group default. Extra Day / Gazetted Holiday eligibility is set per eligibility group (Policy Settings) and shown here read-only.
        </p>
      )}
    </div>
  );
}
