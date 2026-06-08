import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { Button, Badge, PageTitle } from "../components/ui.jsx";

const POLICY_DEFAULTS = [
  { key: "grace_minutes", value: "15", description: "Grace period before marking Late (minutes)" },
  { key: "half_day_hours", value: "4", description: "Hours below which attendance counts as Half Day" },
  { key: "late_per_deduction_cycle", value: "3", description: "Number of late marks that trigger 1 salary deduction day" },
  { key: "deduction_days_per_breach", value: "1", description: "Salary days deducted per late breach" },
  { key: "half_day_salary_factor", value: "0.5", description: "Salary fraction for half-day attendance (0.5 = 50%)" },
  { key: "eobi_employer_rate", value: "5", description: "EOBI employer contribution as % of minimum wage" },
  { key: "eobi_employee_rate", value: "1", description: "EOBI employee deduction as % of minimum wage" },
  { key: "overtime_multiplier", value: "1.5", description: "Overtime pay multiplier (1.5 = 150% of hourly rate)" },
];

export default function PolicySettings() {
  const [settings, setSettings] = useState([]);
  const [editing, setEditing] = useState(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => { load(); }, []);

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

  async function save(s) {
    setErr("");
    const { error } = await supabase.from("hrms_policy_settings")
      .upsert({ key: s.key, value: editing.value, description: s.description, branch: s.branch || "Global" }, { onConflict: "key" });
    if (error) return setErr(error.message);
    setMsg("Policy setting saved.");
    setEditing(null);
    load();
  }

  return (
    <div>
      <PageTitle title="Policy Settings" subtitle="Configure grace time, late marks, half-day rules and deduction policies." />
      {msg && <div className="mb-3 p-3 rounded-xl bg-blue-50 text-blue-700 text-sm">{msg}</div>}
      {err && <div className="mb-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{err}</div>}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 pt-4 pb-2">
          <h2 className="font-bold text-slate-800">Attendance & Payroll Policy Configuration</h2>
          <p className="text-xs text-slate-400 mt-0.5">Changes here affect attendance marking, late deductions, and salary calculations globally.</p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>{["Policy", "Description", "Value", "Scope", "Action"].map(h => <th key={h} className="text-left px-5 py-3 font-medium">{h}</th>)}</tr>
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
