import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { Badge, PageTitle } from "../components/ui.jsx";
import { BRANCH_CODE_MAP } from "../constants/branches.js";

export default function BranchDashboard({ restrictToBranch }) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(false);
  const [drillBranch, setDrillBranch] = useState(restrictToBranch || null);
  const [err, setErr] = useState("");

  useEffect(() => { loadData(); }, [date]);

  async function loadData() {
    setLoading(true); setErr("");
    try {
      const [{ data: emps }, { data: att }] = await Promise.all([
        supabase.from("employees").select("employee_code, full_name, department, branch, status").eq("status", "Active"),
        supabase.from("attendance").select("employee_code, attendance_status, status, late_minutes").eq("work_date", date),
      ]);
      setEmployees(emps || []);
      setAttendance(att || []);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  const attMap = useMemo(() => Object.fromEntries((attendance || []).map(a => [a.employee_code, a])), [attendance]);

  const branchStats = useMemo(() => {
    const branches = restrictToBranch ? [restrictToBranch] : Object.keys(BRANCH_CODE_MAP);
    return branches.map(branchName => {
      const emps = employees.filter(e => e.branch === branchName);
      const total = emps.length;
      if (total === 0) return { branch: branchName, total: 0, present: 0, absent: 0, late: 0, onLeave: 0, pct: 0, departments: [] };

      let present = 0, absent = 0, late = 0, onLeave = 0;
      const deptMap = {};
      emps.forEach(emp => {
        const att = attMap[emp.employee_code];
        const dept = emp.department || "Unassigned";
        if (!deptMap[dept]) deptMap[dept] = { dept, present: 0, absent: 0, late: 0, total: 0 };
        deptMap[dept].total++;
        if (!att) { absent++; deptMap[dept].absent++; return; }
        const s = att.attendance_status || att.status || "";
        if (s === "Absent") { absent++; deptMap[dept].absent++; }
        else if (s === "On Leave") { onLeave++; deptMap[dept].absent++; }
        else if (Number(att.late_minutes || 0) > 0) { present++; late++; deptMap[dept].present++; deptMap[dept].late = (deptMap[dept].late || 0) + 1; }
        else { present++; deptMap[dept].present++; }
      });
      const pct = total > 0 ? Math.round((present / total) * 100) : 0;
      return { branch: branchName, total, present, absent, late, onLeave, pct, departments: Object.values(deptMap) };
    }).filter(b => b.total > 0);
  }, [employees, attMap]);

  function pctColor(pct) {
    if (pct < 70) return "text-red-500";
    if (pct < 85) return "text-amber-500";
    return "text-emerald-600";
  }
  function pctBg(pct) {
    if (pct < 70) return "border-red-200 bg-red-50/30";
    if (pct < 85) return "border-amber-200 bg-amber-50/30";
    return "border-emerald-200 bg-emerald-50/10";
  }

  const drillData = drillBranch ? branchStats.find(b => b.branch === drillBranch) : null;

  return (
    <div>
      <PageTitle title="Branch Dashboard" subtitle="Real-time attendance across all branches — click a branch to drill down." />

      <div className="flex items-center gap-3 mb-4">
        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm" />
        {drillBranch && !restrictToBranch && (
          <button onClick={() => setDrillBranch(null)} className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-sm hover:bg-slate-50">
            ← All Branches
          </button>
        )}
      </div>

      {err && <div className="mb-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{err}</div>}
      {loading && <p className="text-slate-400 text-sm mb-3">Loading...</p>}

      {!drillBranch ? (
        // Branch Cards
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {branchStats.length === 0 && !loading && (
            <div className="md:col-span-3 bg-white border border-slate-100 rounded-2xl p-10 text-center text-slate-400 shadow-sm">
              No attendance data for {date}.
            </div>
          )}
          {branchStats.map(b => (
            <button key={b.branch} onClick={() => setDrillBranch(b.branch)}
              className={`text-left bg-white border rounded-2xl p-5 shadow-sm hover:shadow-md transition cursor-pointer ${pctBg(b.pct)}`}>
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-bold text-slate-800">{b.branch}</h3>
                  <p className="text-xs text-slate-400">{b.total} active employees</p>
                </div>
                <span className={`text-2xl font-bold ${pctColor(b.pct)}`}>{b.pct}%</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2 mb-3">
                <div className={`h-2 rounded-full ${b.pct < 70 ? "bg-red-400" : b.pct < 85 ? "bg-amber-400" : "bg-emerald-500"}`}
                  style={{ width: `${b.pct}%` }} />
              </div>
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <div><div className="text-emerald-600 font-bold text-base">{b.present}</div><div className="text-slate-400">Present</div></div>
                <div><div className="text-red-500 font-bold text-base">{b.absent}</div><div className="text-slate-400">Absent</div></div>
                <div><div className="text-amber-500 font-bold text-base">{b.late}</div><div className="text-slate-400">Late</div></div>
                <div><div className="text-blue-500 font-bold text-base">{b.onLeave}</div><div className="text-slate-400">Leave</div></div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        // Department Drill-down
        <div>
          <div className="mb-4 p-4 bg-white border border-slate-100 rounded-2xl shadow-sm flex items-center gap-4">
            <div>
              <h2 className="font-bold text-slate-900 text-lg">{drillData?.branch}</h2>
              <p className="text-sm text-slate-500">{drillData?.total} employees · {date}</p>
            </div>
            <div className={`text-3xl font-bold ml-auto ${pctColor(drillData?.pct || 0)}`}>{drillData?.pct || 0}%</div>
          </div>
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
            <div className="px-5 pt-4 pb-2"><h3 className="font-bold text-slate-800">Department Breakdown</h3></div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>{["Department", "Present", "Absent", "Total", "Attendance %"].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(drillData?.departments || []).map(d => {
                  const pct = d.total > 0 ? Math.round((d.present / d.total) * 100) : 0;
                  return (
                    <tr key={d.dept}>
                      <td className="px-4 py-3 font-medium">{d.dept}</td>
                      <td className="px-4 py-3 text-emerald-600">{d.present}</td>
                      <td className="px-4 py-3 text-red-500">{d.absent}</td>
                      <td className="px-4 py-3">{d.total}</td>
                      <td className="px-4 py-3">
                        <Badge tone={pct < 70 ? "red" : pct < 85 ? "yellow" : "green"}>{pct}%</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
