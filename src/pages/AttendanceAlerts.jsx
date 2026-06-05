import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { Badge, Button, PageTitle } from "../components/ui.jsx";
import { STAFF_LEVEL_POLICIES } from "../config/staffPolicies.js";

const ALERT_TYPES = {
  CONSECUTIVE_ABSENT: { label: "Consecutive Absences", icon: "❌", tone: "red" },
  LATE_THRESHOLD: { label: "Late Threshold Approaching", icon: "⏰", tone: "yellow" },
  MISSING_PUNCH: { label: "Missing Punch", icon: "⚠️", tone: "purple" },
  ABSCONDING_RISK: { label: "Absconding Risk", icon: "🚨", tone: "red" },
};

const STATUS_TONES = { New: "red", Acknowledged: "yellow", Resolved: "green" };

export default function AttendanceAlerts() {
  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [filterType, setFilterType] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [lastGenerated, setLastGenerated] = useState(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true); setErr("");
    try {
      const thirtyAgo = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
      const [{ data: emps }, { data: att }, { data: missing }] = await Promise.all([
        supabase.from("employees").select("employee_code, full_name, department, branch, staff_level").eq("status", "Active"),
        supabase.from("attendance").select("employee_code, work_date, attendance_status, status, late_minutes, check_in, check_out")
          .gte("work_date", thirtyAgo).order("work_date", { ascending: false }),
        supabase.from("attendance").select("employee_code, work_date").or("check_in.is.null,check_out.is.null")
          .gte("work_date", new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10)),
      ]);
      setEmployees(emps || []);
      setAttendance(att || []);

      generateAlerts(emps || [], att || [], missing || []);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  function generateAlerts(emps, att, missing) {
    const generated = [];
    const empMap = Object.fromEntries(emps.map(e => [e.employee_code, e]));
    const attByEmp = {};
    att.forEach(a => {
      if (!attByEmp[a.employee_code]) attByEmp[a.employee_code] = [];
      attByEmp[a.employee_code].push(a);
    });

    emps.forEach(emp => {
      const empAtt = (attByEmp[emp.employee_code] || []).sort((a, b) => b.work_date.localeCompare(a.work_date));
      const policy = STAFF_LEVEL_POLICIES[emp.staff_level] || STAFF_LEVEL_POLICIES["Non-Management"];
      const lateThreshold = Number(policy.latePenaltyCount || 3);

      // Check consecutive absences
      let consecutive = 0;
      for (const a of empAtt) {
        const s = a.attendance_status || a.status || "";
        if (s === "Absent") { consecutive++; } else break;
      }

      if (consecutive >= 7) {
        generated.push({
          id: `abs_${emp.employee_code}`, employee_code: emp.employee_code,
          employee_name: emp.full_name, department: emp.department,
          type: "ABSCONDING_RISK", date: new Date().toISOString().slice(0, 10),
          detail: `${consecutive} consecutive absent days — absconding risk`,
          status: "New",
        });
      } else if (consecutive >= 3) {
        generated.push({
          id: `consec_${emp.employee_code}`, employee_code: emp.employee_code,
          employee_name: emp.full_name, department: emp.department,
          type: "CONSECUTIVE_ABSENT", date: new Date().toISOString().slice(0, 10),
          detail: `${consecutive} consecutive absent days`,
          status: "New",
        });
      }

      // Check late threshold
      const lateCount = empAtt.filter(a => Number(a.late_minutes || 0) > 0).length;
      if (lateCount >= lateThreshold - 1 && lateCount < lateThreshold + 2) {
        generated.push({
          id: `late_${emp.employee_code}`, employee_code: emp.employee_code,
          employee_name: emp.full_name, department: emp.department,
          type: "LATE_THRESHOLD", date: new Date().toISOString().slice(0, 10),
          detail: `${lateCount} late days this month — threshold is ${lateThreshold}`,
          status: "New",
        });
      }
    });

    // Missing punches
    const mpByEmp = {};
    missing.forEach(m => { mpByEmp[m.employee_code] = (mpByEmp[m.employee_code] || 0) + 1; });
    Object.entries(mpByEmp).forEach(([code, count]) => {
      const emp = empMap[code];
      if (!emp) return;
      generated.push({
        id: `mp_${code}`, employee_code: code,
        employee_name: emp.full_name, department: emp.department,
        type: "MISSING_PUNCH", date: new Date().toISOString().slice(0, 10),
        detail: `${count} missing punch record${count > 1 ? "s" : ""} in last 3 days`,
        status: "New",
      });
    });

    setAlerts(generated);
    setLastGenerated(new Date().toLocaleTimeString());
  }

  function updateAlertStatus(id, status) {
    setAlerts(a => a.map(al => al.id === id ? { ...al, status } : al));
  }

  const filtered = useMemo(() => alerts.filter(a => {
    const typeOk = filterType === "All" || a.type === filterType;
    const statusOk = filterStatus === "All" || a.status === filterStatus;
    return typeOk && statusOk;
  }), [alerts, filterType, filterStatus]);

  const counts = useMemo(() => ({
    new: alerts.filter(a => a.status === "New").length,
    absconding: alerts.filter(a => a.type === "ABSCONDING_RISK").length,
    total: alerts.length,
  }), [alerts]);

  return (
    <div>
      <PageTitle title="Attendance Alerts" subtitle="Rule-based alerts for absences, late patterns, missing punches and absconding risk."
        action={<Button onClick={loadData} disabled={loading} className="rounded-2xl">{loading ? "Refreshing..." : "Refresh Alerts"}</Button>} />

      {err && <div className="mb-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{err}</div>}

      {/* Urgent Banner */}
      {counts.absconding > 0 && (
        <div className="mb-4 p-4 bg-red-50 border border-red-300 rounded-2xl flex items-center gap-3">
          <span className="text-2xl">🚨</span>
          <div>
            <p className="font-bold text-red-700">{counts.absconding} Absconding Risk Alert{counts.absconding > 1 ? "s" : ""}</p>
            <p className="text-sm text-red-600">Employees with 7+ consecutive absences — immediate attention required.</p>
          </div>
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        {Object.entries(ALERT_TYPES).map(([type, { label, icon, tone }]) => {
          const count = alerts.filter(a => a.type === type).length;
          return (
            <div key={type} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm text-center">
              <div className="text-2xl mb-1">{icon}</div>
              <p className="text-2xl font-bold">{count}</p>
              <p className="text-xs text-slate-500">{label}</p>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm mb-4">
        <div className="flex flex-wrap gap-3 items-center">
          <select value={filterType} onChange={e => setFilterType(e.target.value)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm">
            <option value="All">All Types</option>
            {Object.entries(ALERT_TYPES).map(([k, { label }]) => <option key={k} value={k}>{label}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm">
            <option value="All">All Status</option>
            <option>New</option><option>Acknowledged</option><option>Resolved</option>
          </select>
          {lastGenerated && <span className="text-xs text-slate-400">Last refreshed: {lastGenerated}</span>}
        </div>
      </div>

      {/* Alert Table */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
        <div className="px-5 pt-4 pb-2">
          <h2 className="font-bold text-slate-800">Alert Log</h2>
          <p className="text-xs text-slate-400 mt-0.5">{filtered.length} alerts · {counts.new} new</p>
        </div>
        <table className="w-full min-w-[700px] text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>{["Employee", "Department", "Alert Type", "Detail", "Date", "Status", "Action"].map(h => (
              <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
            ))}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0
              ? <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No alerts found. {loading ? "Loading..." : "All clear!"}</td></tr>
              : filtered.map(a => {
                const alertDef = ALERT_TYPES[a.type] || {};
                return (
                  <tr key={a.id} className={a.type === "ABSCONDING_RISK" ? "bg-red-50/40" : a.status === "New" ? "bg-amber-50/20" : ""}>
                    <td className="px-4 py-3 font-medium">{a.employee_name}</td>
                    <td className="px-4 py-3 text-slate-500">{a.department}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <span>{alertDef.icon}</span>
                        <Badge tone={alertDef.tone}>{alertDef.label}</Badge>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{a.detail}</td>
                    <td className="px-4 py-3">{a.date}</td>
                    <td className="px-4 py-3"><Badge tone={STATUS_TONES[a.status]}>{a.status}</Badge></td>
                    <td className="px-4 py-3">
                      {a.status === "New" && (
                        <Button variant="outline" onClick={() => updateAlertStatus(a.id, "Acknowledged")}
                          className="rounded-xl text-xs py-1 px-2">Acknowledge</Button>
                      )}
                      {a.status === "Acknowledged" && (
                        <Button variant="outline" onClick={() => updateAlertStatus(a.id, "Resolved")}
                          className="rounded-xl text-xs py-1 px-2">Resolve</Button>
                      )}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
