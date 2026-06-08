import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabaseClient.js";

const LEVEL_STYLE = {
  Master:           "bg-yellow-100 border-yellow-400 text-yellow-900",
  "Senior Manager": "bg-indigo-100 border-indigo-400 text-indigo-900",
  Manager:          "bg-blue-100  border-blue-400  text-blue-900",
  Supervisor:       "bg-green-100 border-green-400 text-green-900",
  HR:               "bg-purple-100 border-purple-400 text-purple-900",
  Finance:          "bg-orange-100 border-orange-400 text-orange-900",
  Staff:            "bg-slate-100 border-slate-300 text-slate-700",
};

function levelStyle(emp) {
  if (emp.is_manager) return LEVEL_STYLE.Manager;
  if (emp.is_supervisor) return LEVEL_STYLE.Supervisor;
  const lv = emp.staff_level || "Staff";
  return LEVEL_STYLE[lv] || LEVEL_STYLE.Staff;
}

function levelLabel(emp) {
  if (emp.is_manager) return "Manager";
  if (emp.is_supervisor) return "Supervisor";
  return emp.staff_level || "Staff";
}

function OrgNode({ emp, all, depth }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const reports = useMemo(() => all.filter(e => e.supervisor_id === emp.employee_code), [all, emp.employee_code]);

  return (
    <div className="flex flex-col items-center">
      <div
        className={`border-2 rounded-xl px-3 py-2.5 text-center cursor-default select-none min-w-[130px] max-w-[180px] shadow-sm ${levelStyle(emp)}`}
        onClick={() => reports.length > 0 && setExpanded(e => !e)}
        style={{ cursor: reports.length > 0 ? "pointer" : "default" }}>
        <div className="font-bold text-xs leading-snug truncate">{emp.full_name}</div>
        <div className="text-[10px] mt-0.5 opacity-70 truncate">{emp.designation || levelLabel(emp)}</div>
        {reports.length > 0 && (
          <div className="text-[10px] mt-1 font-semibold opacity-60">
            {reports.length} report{reports.length > 1 ? "s" : ""} {expanded ? "▲" : "▼"}
          </div>
        )}
      </div>

      {expanded && reports.length > 0 && (
        <div className="relative mt-1">
          <div className="flex gap-6 items-start pt-4">
            {reports.map(r => (
              <div key={r.employee_code} className="flex flex-col items-center">
                <div className="w-px h-4 bg-slate-300" />
                <OrgNode emp={r} all={all} depth={depth + 1} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function OrgChart() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [branch, setBranch] = useState("All");

  useEffect(() => {
    setLoading(true);
    supabase.from("employees")
      .select("employee_code,full_name,designation,staff_level,department,branch,supervisor_id,is_supervisor,is_manager,status")
      .eq("status", "Active").order("full_name")
      .then(({ data }) => { setEmployees(data || []); setLoading(false); });
  }, []);

  const branches = useMemo(() => ["All", ...new Set(employees.map(e => e.branch).filter(Boolean))], [employees]);
  const filtered  = useMemo(() => branch === "All" ? employees : employees.filter(e => e.branch === branch), [employees, branch]);
  const empCodes  = useMemo(() => new Set(filtered.map(e => e.employee_code)), [filtered]);
  const roots     = useMemo(() => filtered.filter(e => !e.supervisor_id || !empCodes.has(e.supervisor_id)), [filtered, empCodes]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <h2 className="font-bold text-slate-900 text-lg">Organisation Chart</h2>
        <select value={branch} onChange={e => setBranch(e.target.value)} className="px-3 py-1.5 rounded-xl border border-slate-200 text-sm">
          {branches.map(b => <option key={b}>{b}</option>)}
        </select>
        <div className="ml-auto flex flex-wrap gap-1.5">
          {Object.entries(LEVEL_STYLE).map(([lv, cls]) => (
            <span key={lv} className={`px-2 py-0.5 rounded-lg text-[10px] border font-medium ${cls}`}>{lv}</span>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-slate-400 text-sm">Loading org chart…</div>
      ) : roots.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm">
          No hierarchy configured. Assign supervisors to employees to build the org chart.
        </div>
      ) : (
        <div className="overflow-x-auto pb-8">
          <div className="flex gap-12 items-start min-w-max px-4 pt-4">
            {roots.map(r => <OrgNode key={r.employee_code} emp={r} all={filtered} depth={0} />)}
          </div>
        </div>
      )}
    </div>
  );
}
