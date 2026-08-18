import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { Button, Badge, PageTitle } from "../components/ui.jsx";

const POLICY_DEFAULTS = [
  { key: "half_day_hours",              value: "4",   description: "Hours below which attendance counts as Half Day" },
  { key: "half_day_salary_factor",      value: "0.5", description: "Salary fraction for half-day attendance (0.5 = 50%)" },
  { key: "eobi_employer_rate",          value: "5",   description: "EOBI employer contribution as % of minimum wage" },
  { key: "eobi_employee_rate",          value: "1",   description: "EOBI employee deduction as % of minimum wage" },
  { key: "overtime_multiplier",         value: "1.5", description: "Overtime pay multiplier (1.5 = 150% of hourly rate)" },
  { key: "friday_hours_management",              value: "6.5",  description: "Friday required hours for Management staff (hours)" },
  { key: "friday_hours_non_management",          value: "9",    description: "Friday required hours for Non-Management / Floor Management staff (hours)" },
  { key: "daily_rate_divisor",                   value: "30",   description: "Daily rate divisor (salary / this)" },
  { key: "hourly_rate_divisor_non_management",   value: "10.5", description: "Hourly rate divisor for Non-Management staff" },
  { key: "hourly_rate_divisor_floor_management", value: "10.5", description: "Hourly rate divisor for Floor Management staff" },
  { key: "hourly_rate_divisor_management",       value: "9",    description: "Hourly rate divisor for Management staff" },
];

const GROUP_LABELS = {
  SALES_SUPPORT: "Sales / Support Staff",
  FLOOR_MANAGEMENT: "Floor Management",
  MANAGEMENT_ADMIN: "Management & Admin",
};

export default function PolicySettings() {
  const [settings, setSettings] = useState([]);
  const [editing, setEditing] = useState(null);
  const [groups, setGroups] = useState([]);
  const [groupEditing, setGroupEditing] = useState(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => { load(); loadGroups(); }, []);

  async function load() {
    const { data } = await supabase.from("hrms_policy_settings").select("*").order("key");
    if (data && data.length > 0) {
      const map = {};
      data.forEach(d => { map[d.key] = d; });
      setSettings(POLICY_DEFAULTS.map(def => map[def.key] ? map[def.key] : { ...def, id: null, branch: "Global" }));
    } else {
      setSettings(POLICY_DEFAULTS.map(d => ({ ...d, id: null, branch: "Global" })));
    }
  }

  async function loadGroups() {
    const { data, error } = await supabase.from("staff_eligibility_groups")
      .select("code, grace_minutes, half_day_threshold_minutes, late_penalty_after_count, late_penalty_days, apply_late_rules")
      .order("code");
    if (!error) setGroups(data || []);
  }

  async function save(s) {
    setErr("");
    const { error } = await supabase.from("hrms_policy_settings")
      .upsert({ key: s.key, value: editing.value, description: s.description }, { onConflict: "key" });
    if (error) return setErr(error.message);
    setMsg("Policy setting saved.");
    setEditing(null);
    load();
  }

  async function saveGroup() {
    setErr("");
    const { error } = await supabase.from("staff_eligibility_groups")
      .update({
        grace_minutes: Number(groupEditing.grace_minutes) || 0,
        half_day_threshold_minutes: Number(groupEditing.half_day_threshold_minutes) || 0,
        late_penalty_after_count: Number(groupEditing.late_penalty_after_count) || 0,
        late_penalty_days: Number(groupEditing.late_penalty_days) || 0,
      })
      .eq("code", groupEditing.code);
    if (error) return setErr(error.message);
    setMsg("Late policy saved.");
    setGroupEditing(null);
    loadGroups();
  }

  return (
    <div>
      <PageTitle title="Policy Settings" subtitle="Configure grace time, late marks, half-day rules and deduction policies." />
      {msg && <div className="mb-3 p-3 rounded-xl bg-blue-50 text-blue-700 text-sm">{msg}</div>}
      {err && <div className="mb-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{err}</div>}

      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden mb-4">
        <div className="px-5 pt-4 pb-2">
          <h2 className="font-bold text-slate-800">Late & Half-Day Policy (by Staff Group)</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Live values — read directly by attendance marking and payroll's late deduction. Grace minutes and the
            half-day threshold apply the moment they're saved; the late-deduction rule is <strong>every N late days deducts D salary day(s), scaling</strong> (e.g. 3/1 means 9 late days = 3 days deducted).
          </p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>{["Staff Group", "Grace (min)", "Half-Day Threshold (min)", "Late Marks per Deduction", "Deduction Days", "Action"].map(h => (
              <th key={h} className="text-left px-5 py-3 font-medium sticky top-0 z-10 bg-slate-50 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">{h}</th>
            ))}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {groups.map(g => {
              const isEditing = groupEditing?.code === g.code;
              const row = isEditing ? groupEditing : g;
              return (
                <tr key={g.code} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-semibold text-slate-800">
                    {GROUP_LABELS[g.code] || g.code}
                    {!g.apply_late_rules && <div className="text-[11px] font-normal text-slate-400 mt-0.5">Late rules disabled for this group (hours-based only)</div>}
                  </td>
                  {["grace_minutes", "half_day_threshold_minutes", "late_penalty_after_count", "late_penalty_days"].map(field => (
                    <td key={field} className="px-5 py-3">
                      {isEditing
                        ? <input type="number" value={row[field]} onChange={e => setGroupEditing(v => ({ ...v, [field]: e.target.value }))}
                            className="px-3 py-1.5 rounded-xl border border-slate-300 w-20 text-sm" />
                        : <Badge tone="blue">{row[field]}</Badge>}
                    </td>
                  ))}
                  <td className="px-5 py-3">
                    {isEditing
                      ? <div className="flex gap-2">
                          <Button onClick={saveGroup} className="rounded-xl text-xs py-1 px-3">Save</Button>
                          <Button variant="outline" onClick={() => setGroupEditing(null)} className="rounded-xl text-xs py-1 px-3">Cancel</Button>
                        </div>
                      : <Button variant="outline" onClick={() => setGroupEditing({ ...g })} className="rounded-xl text-xs py-1 px-3">Edit</Button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 pt-4 pb-2">
          <h2 className="font-bold text-slate-800">Other Policy Settings</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Only the two Friday-hours settings below are currently read by the attendance pipeline. The rest are
            informational — kept for reference but not yet wired into a live calculation.
          </p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>{["Policy", "Description", "Value", "Scope", "Action"].map(h => <th key={h} className="text-left px-5 py-3 font-medium sticky top-0 z-10 bg-slate-50 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {settings.map((s, i) => (
              <tr key={i} className="hover:bg-slate-50">
                <td className="px-5 py-3 font-semibold text-slate-800">{s.key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</td>
                <td className="px-5 py-3 text-slate-500 max-w-xs">{s.description}</td>
                <td className="px-5 py-3">
                  {editing?.key === s.key
                    ? <input value={editing.value} onChange={e => setEditing(v => ({ ...v, value: e.target.value }))} className="px-3 py-1.5 rounded-xl border border-slate-300 w-28 text-sm" />
                    : <Badge tone="blue">{s.value}</Badge>}
                </td>
                <td className="px-5 py-3"><Badge tone="slate">{s.branch || "Global"}</Badge></td>
                <td className="px-5 py-3">
                  {editing?.key === s.key
                    ? <div className="flex gap-2">
                        <Button onClick={() => save(s)} className="rounded-xl text-xs py-1 px-3">Save</Button>
                        <Button variant="outline" onClick={() => setEditing(null)} className="rounded-xl text-xs py-1 px-3">Cancel</Button>
                      </div>
                    : <Button variant="outline" onClick={() => setEditing({ ...s })} className="rounded-xl text-xs py-1 px-3">Edit</Button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
