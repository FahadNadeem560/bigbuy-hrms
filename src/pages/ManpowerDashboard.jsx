import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { Badge, PageTitle } from "../components/ui.jsx";
import { BRANCH_CODE_MAP } from "../constants/branches.js";

export default function ManpowerDashboard({ branchFilter }) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [branch, setBranch] = useState(branchFilter || "All");
  const [attendance, setAttendance] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => { loadData(); }, [date]);

  async function loadData() {
    setLoading(true); setErr("");
    try {
      const [{ data: att }, { data: emps }] = await Promise.all([
        supabase.from("attendance").select("employee_code, attendance_status, status, late_minutes").eq("work_date", date),
        supabase.from("employees").select("employee_code, full_name, department, branch, status").eq("status", "Active"),
      ]);
      setAttendance(att || []);
      setEmployees(emps || []);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  const attMap = useMemo(() => Object.fromEntries((attendance || []).map(a => [a.employee_code, a])), [attendance]);

  const filteredEmps = useMemo(() =>
    employees.filter(e => branch === "All" || e.branch === branch), [employees, branch]);

  const deptStats = useMemo(() => {
    const map = {};
    filteredEmps.forEach(emp => {
      const dept = emp.department || "Unassigned";
      if (!map[dept]) map[dept] = { dept, present: 0, absent: 0, late: 0, onLeave: 0, total: 0 };
      map[dept].total++;
      const att = attMap[emp.employee_code];
      if (!att) { map[dept].absent++; return; }
      const s = att.attendance_status || att.status || "";
      if (s === "Absent") map[dept].absent++;
      else if (s === "On Leave") map[dept].onLeave++;
      else if (Number(att.late_minutes || 0) > 0) { map[dept].present++; map[dept].late++; }
      else map[dept].present++;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [filteredEmps, attMap]);

  const totals = useMemo(() => deptStats.reduce((s, d) => ({
    present: s.present + d.present, absent: s.absent + d.absent,
    late: s.late + d.late, onLeave: s.onLeave + d.onLeave, total: s.total + d.total,
  }), { present: 0, absent: 0, late: 0, onLeave: 0, total: 0 }), [deptStats]);

  function rowColor(pct) {
    if (pct < 70) return "bg-red-50/60";
    if (pct < 85) return "bg-amber-50/60";
    return "";
  }

  function pctBadge(pct) {
    if (pct < 70) return <Badge tone="red">{pct}%</Badge>;
    if (pct < 85) return <Badge tone="yellow">{pct}%</Badge>;
    return <Badge tone="green">{pct}%</Badge>;
  }

  return (
    <div>
      <PageTitle title="Manpower Dashboard" subtitle="Daily department-wise attendance breakdown." />

      {/* Filters */}
      <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm mb-4">
        <div className="flex flex-wrap gap-3">
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm" />
          <select value={branch} onChange={e => setBranch(e.target.value)} disabled={!!branchFilter} className="px-4 py-2 rounded-xl border border-slate-200 text-sm disabled:bg-slate-50 disabled:text-slate-500">
            {branchFilter
              ? <option value={branchFilter}>{branchFilter}</option>
              : <><option value="All">All Branches</option>{Object.keys(BRANCH_CODE_MAP).map(b => <option key={b}>{b}</option>)}</>}
          </select>
        </div>
      </div>

      {err && <div className="mb-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{err}</div>}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        {[
          { label: "Total Present", value: totals.present, icon: "✅", color: "text-emerald-600" },
          { label: "Total Absent", value: totals.absent, icon: "❌", color: "text-red-500" },
          { label: "Total Late", value: totals.late, icon: "⏰", color: "text-amber-500" },
          { label: "On Leave", value: totals.onLeave, icon: "🏖️", color: "text-blue-500" },
        ].map(({ label, value, icon, color }) => (
          <div key={label} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm flex items-center gap-3">
            <span className="text-2xl">{icon}</span>
            <div>
              <p className="text-xs text-slate-500">{label}</p>
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Department Table */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
        <div className="px-5 pt-4 pb-2">
          <h2 className="font-bold text-slate-800">Department Breakdown</h2>
          <p className="text-xs text-slate-400 mt-0.5">{date} · {filteredEmps.length} active employees</p>
        </div>
        {loading ? <p className="px-5 py-8 text-slate-400 text-sm">Loading...</p> : (
          <table className="w-full min-w-[700px] text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>{["Department", "Present", "Absent", "Late", "On Leave", "Total Headcount", "Attendance %"].map(h => (
                <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {deptStats.length === 0
                ? <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No data for this date.</td></tr>
                : deptStats.map(d => {
                  const pct = d.total > 0 ? Math.round((d.present / d.total) * 100) : 0;
                  return (
                    <tr key={d.dept} className={rowColor(pct)}>
                      <td className="px-4 py-3 font-medium">{d.dept}</td>
                      <td className="px-4 py-3 text-emerald-600 font-semibold">{d.present}</td>
                      <td className="px-4 py-3 text-red-500">{d.absent}</td>
                      <td className="px-4 py-3 text-amber-500">{d.late}</td>
                      <td className="px-4 py-3 text-blue-500">{d.onLeave}</td>
                      <td className="px-4 py-3">{d.total}</td>
                      <td className="px-4 py-3">{pctBadge(pct)}</td>
                    </tr>
                  );
                })}
              {deptStats.length > 0 && (
                <tr className="bg-slate-50 font-semibold border-t-2 border-slate-200">
                  <td className="px-4 py-3">TOTAL</td>
                  <td className="px-4 py-3 text-emerald-600">{totals.present}</td>
                  <td className="px-4 py-3 text-red-500">{totals.absent}</td>
                  <td className="px-4 py-3 text-amber-500">{totals.late}</td>
                  <td className="px-4 py-3 text-blue-500">{totals.onLeave}</td>
                  <td className="px-4 py-3">{totals.total}</td>
                  <td className="px-4 py-3">
                    {pctBadge(totals.total > 0 ? Math.round((totals.present / totals.total) * 100) : 0)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
