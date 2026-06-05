import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { Badge, PageTitle } from "../components/ui.jsx";
import { money } from "../utils/format.js";

export default function ExecutiveDashboard() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Data
  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [leaveReqs, setLeaveReqs] = useState([]);
  const [loans, setLoans] = useState([]);
  const [payroll, setPayroll] = useState([]);
  const [missingPunches, setMissingPunches] = useState([]);
  const [recentWarnings, setRecentWarnings] = useState([]);

  // Drill-down state
  const [drillLevel, setDrillLevel] = useState("overview"); // overview | branch | department | employees
  const [drillMetric, setDrillMetric] = useState(null);
  const [drillBranch, setDrillBranch] = useState(null);
  const [drillDept, setDrillDept] = useState(null);

  useEffect(() => { loadAll(); }, [date]);

  async function loadAll() {
    setLoading(true); setErr("");
    try {
      const now = new Date();
      const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const [
        { data: emps }, { data: att }, { data: lvReqs }, { data: lns }, { data: pay },
        { data: missing }, { data: warns }
      ] = await Promise.all([
        supabase.from("employees").select("employee_code, full_name, department, branch, salary, status").eq("status", "Active"),
        supabase.from("attendance").select("employee_code, attendance_status, status, late_minutes").eq("work_date", date),
        supabase.from("leave_requests").select("id, status").eq("status", "Pending"),
        supabase.from("loans").select("outstanding_balance, status").eq("status", "Active"),
        supabase.from("payroll").select("net_salary, status").eq("payroll_month", monthStr),
        supabase.from("attendance").select("employee_code, work_date").eq("work_date", date).or("check_in.is.null,check_out.is.null"),
        supabase.from("audit_logs").select("details, created_at").eq("action", "warning_issued").order("created_at", { ascending: false }).limit(5),
      ]);
      setEmployees(emps || []);
      setAttendance(att || []);
      setLeaveReqs(lvReqs || []);
      setLoans(lns || []);
      setPayroll(pay || []);
      setMissingPunches(missing || []);
      setRecentWarnings((warns || []).map(w => { try { return JSON.parse(w.details || "{}"); } catch { return {}; } }));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  const attMap = useMemo(() => Object.fromEntries((attendance || []).map(a => [a.employee_code, a])), [attendance]);

  const metrics = useMemo(() => {
    const total = employees.length;
    let present = 0, absent = 0, late = 0, onLeave = 0;
    employees.forEach(emp => {
      const att = attMap[emp.employee_code];
      if (!att) { absent++; return; }
      const s = att.attendance_status || att.status || "";
      if (s === "Absent") absent++;
      else if (s === "On Leave") onLeave++;
      else { present++; if (Number(att.late_minutes || 0) > 0) late++; }
    });
    const payrollTotal = payroll.reduce((s, p) => s + Number(p.net_salary || 0), 0);
    const payrollStatus = payroll[0]?.status || "None";
    const loanTotal = loans.reduce((s, l) => s + Number(l.outstanding_balance || 0), 0);
    return { total, present, absent, late, onLeave, payrollTotal, payrollStatus, loanTotal, pendingLeave: leaveReqs.length, missingToday: missingPunches.length };
  }, [employees, attMap, payroll, loans, leaveReqs, missingPunches]);

  // Branch breakdown
  const branchBreakdown = useMemo(() => {
    const map = {};
    employees.forEach(emp => {
      const b = emp.branch || "Other";
      if (!map[b]) map[b] = { branch: b, total: 0, present: 0, absent: 0, late: 0 };
      map[b].total++;
      const att = attMap[emp.employee_code];
      if (!att) { map[b].absent++; return; }
      const s = att.attendance_status || att.status || "";
      if (s === "Absent") map[b].absent++;
      else { map[b].present++; if (Number(att.late_minutes || 0) > 0) map[b].late++; }
    });
    return Object.values(map);
  }, [employees, attMap]);

  // Dept breakdown for drill
  const deptBreakdown = useMemo(() => {
    const source = drillBranch ? employees.filter(e => e.branch === drillBranch) : employees;
    const map = {};
    source.forEach(emp => {
      const d = emp.department || "Unassigned";
      if (!map[d]) map[d] = { dept: d, total: 0, present: 0, absent: 0, late: 0, employees: [] };
      map[d].total++;
      map[d].employees.push(emp);
      const att = attMap[emp.employee_code];
      if (!att) { map[d].absent++; return; }
      const s = att.attendance_status || att.status || "";
      if (s === "Absent") map[d].absent++;
      else { map[d].present++; if (Number(att.late_minutes || 0) > 0) map[d].late++; }
    });
    return Object.values(map);
  }, [employees, attMap, drillBranch]);

  const drillEmployees = useMemo(() => {
    if (!drillDept) return [];
    return employees.filter(e => e.department === drillDept && (!drillBranch || e.branch === drillBranch));
  }, [employees, drillBranch, drillDept]);

  function pctOf(n, total) { return total > 0 ? Math.round((n / total) * 100) : 0; }

  const METRIC_CARDS = [
    { key: "workforce", label: "Total Workforce", value: metrics.total, icon: "👥", sub: "Active employees", color: "text-slate-900" },
    { key: "present", label: "Present Today", value: `${pctOf(metrics.present, metrics.total)}%`, icon: "✅", sub: `${metrics.present} employees`, color: "text-emerald-600" },
    { key: "absent", label: "Absent Today", value: metrics.absent, icon: "❌", sub: "employees", color: "text-red-500" },
    { key: "onLeave", label: "On Leave", value: metrics.onLeave, icon: "🏖️", sub: "today", color: "text-blue-500" },
    { key: "late", label: "Late Today", value: metrics.late, icon: "⏰", sub: "employees", color: "text-amber-500" },
    { key: "payroll", label: "Payroll This Month", value: money(metrics.payrollTotal), icon: "💰", sub: metrics.payrollStatus, color: "text-slate-900" },
    { key: "loans", label: "Loan Outstanding", value: money(metrics.loanTotal), icon: "💳", sub: "total", color: "text-red-500" },
    { key: "pendingLeave", label: "Pending Leave", value: metrics.pendingLeave, icon: "📋", sub: "requests", color: "text-yellow-600" },
    { key: "missing", label: "Missing Punches", value: metrics.missingToday, icon: "⚠️", sub: "today", color: "text-red-500" },
  ];

  // Breadcrumb nav
  function Breadcrumb() {
    return (
      <div className="flex items-center gap-2 text-sm mb-4 flex-wrap">
        <button onClick={() => { setDrillLevel("overview"); setDrillBranch(null); setDrillDept(null); }}
          className={`px-3 py-1 rounded-lg ${drillLevel === "overview" ? "bg-slate-900 text-white" : "text-blue-600 hover:underline"}`}>
          Overview
        </button>
        {drillBranch && (
          <>
            <span className="text-slate-300">/</span>
            <button onClick={() => { setDrillLevel("department"); setDrillDept(null); }}
              className={`px-3 py-1 rounded-lg ${drillLevel === "department" ? "bg-slate-900 text-white" : "text-blue-600 hover:underline"}`}>
              {drillBranch}
            </button>
          </>
        )}
        {drillDept && (
          <>
            <span className="text-slate-300">/</span>
            <span className="px-3 py-1 rounded-lg bg-slate-900 text-white">{drillDept}</span>
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      <PageTitle title="Executive Dashboard" subtitle="30-second morning view — all metrics, all branches." />

      <div className="flex items-center gap-3 mb-4">
        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm" />
        {loading && <span className="text-sm text-slate-400">Loading...</span>}
      </div>

      {err && <div className="mb-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{err}</div>}

      <Breadcrumb />

      {drillLevel === "overview" && (
        <>
          {/* KPI Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 mb-6">
            {METRIC_CARDS.map(({ key, label, value, icon, sub, color }) => (
              <button key={key}
                onClick={() => { setDrillMetric(key); setDrillLevel("branch"); }}
                className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm hover:shadow-md hover:border-slate-300 transition text-left">
                <div className="flex items-start justify-between mb-2">
                  <span className="text-xl">{icon}</span>
                  <span className="text-xs text-slate-400">drill ↓</span>
                </div>
                <p className={`text-xl font-bold ${color}`}>{value}</p>
                <p className="text-xs text-slate-500 mt-0.5">{label}</p>
                <p className="text-xs text-slate-400">{sub}</p>
              </button>
            ))}
          </div>

          {/* Recent Warnings */}
          {recentWarnings.length > 0 && (
            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm mb-4">
              <h3 className="font-bold text-slate-800 mb-3">Recent Warnings Issued</h3>
              <div className="space-y-2">
                {recentWarnings.map((w, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span>{w.employee_name || w.employee_code || "—"}</span>
                    <Badge tone="yellow">{w.warning_type || "Warning"}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Branch Summary Table */}
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
            <div className="px-5 pt-4 pb-2"><h3 className="font-bold text-slate-800">Branch Snapshot — {date}</h3></div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>{["Branch", "Total", "Present", "Absent", "Late", "Attendance %"].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {branchBreakdown.map(b => {
                  const pct = pctOf(b.present, b.total);
                  return (
                    <tr key={b.branch}>
                      <td className="px-4 py-3">
                        <button onClick={() => { setDrillBranch(b.branch); setDrillLevel("department"); }}
                          className="font-medium text-blue-600 hover:underline">{b.branch}</button>
                      </td>
                      <td className="px-4 py-3">{b.total}</td>
                      <td className="px-4 py-3 text-emerald-600">{b.present}</td>
                      <td className="px-4 py-3 text-red-500">{b.absent}</td>
                      <td className="px-4 py-3 text-amber-500">{b.late}</td>
                      <td className="px-4 py-3">
                        <Badge tone={pct < 70 ? "red" : pct < 85 ? "yellow" : "green"}>{pct}%</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {drillLevel === "branch" && (
        <div>
          <h2 className="font-bold text-slate-800 mb-4 text-lg">Branch Breakdown — {drillMetric}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {branchBreakdown.map(b => (
              <button key={b.branch} onClick={() => { setDrillBranch(b.branch); setDrillLevel("department"); }}
                className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition text-left">
                <h3 className="font-bold text-slate-800 mb-2">{b.branch}</h3>
                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                  <div><div className="text-base font-bold">{b.total}</div><div className="text-slate-400">Total</div></div>
                  <div><div className="text-base font-bold text-emerald-600">{b.present}</div><div className="text-slate-400">Present</div></div>
                  <div><div className="text-base font-bold text-red-500">{b.absent}</div><div className="text-slate-400">Absent</div></div>
                  <div><div className="text-base font-bold text-amber-500">{b.late}</div><div className="text-slate-400">Late</div></div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {drillLevel === "department" && drillBranch && (
        <div>
          <h2 className="font-bold text-slate-800 mb-4 text-lg">Department Breakdown — {drillBranch}</h2>
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>{["Department", "Total", "Present", "Absent", "Late", "Attendance %"].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {deptBreakdown.map(d => {
                  const pct = pctOf(d.present, d.total);
                  return (
                    <tr key={d.dept}>
                      <td className="px-4 py-3">
                        <button onClick={() => { setDrillDept(d.dept); setDrillLevel("employees"); }}
                          className="font-medium text-blue-600 hover:underline">{d.dept}</button>
                      </td>
                      <td className="px-4 py-3">{d.total}</td>
                      <td className="px-4 py-3 text-emerald-600">{d.present}</td>
                      <td className="px-4 py-3 text-red-500">{d.absent}</td>
                      <td className="px-4 py-3 text-amber-500">{d.late}</td>
                      <td className="px-4 py-3"><Badge tone={pct < 70 ? "red" : pct < 85 ? "yellow" : "green"}>{pct}%</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {drillLevel === "employees" && drillDept && (
        <div>
          <h2 className="font-bold text-slate-800 mb-4 text-lg">Employees — {drillBranch} / {drillDept}</h2>
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>{["Employee", "Code", "Status Today", "Late Mins"].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {drillEmployees.map(emp => {
                  const att = attMap[emp.employee_code];
                  const status = att ? (att.attendance_status || att.status || "Present") : "No Record";
                  return (
                    <tr key={emp.employee_code}>
                      <td className="px-4 py-3 font-medium">{emp.full_name}</td>
                      <td className="px-4 py-3 text-slate-500">{emp.employee_code}</td>
                      <td className="px-4 py-3">
                        <Badge tone={status === "Absent" ? "red" : status === "No Record" ? "slate" : "green"}>{status}</Badge>
                      </td>
                      <td className="px-4 py-3">{att ? (Number(att.late_minutes || 0) || "—") : "—"}</td>
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
