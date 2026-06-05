import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { Badge, Button, PageTitle } from "../components/ui.jsx";
import { money } from "../utils/format.js";
import * as XLSX from "xlsx";
import { BRANCH_CODE_MAP } from "../constants/branches.js";

export default function LeaveLiability() {
  const [employees, setEmployees] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterBranch, setFilterBranch] = useState("All");
  const [filterDept, setFilterDept] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true); setErr("");
    try {
      const [{ data: emps }, { data: lvs }] = await Promise.all([
        supabase.from("employees").select("employee_code, full_name, department, branch, salary, staff_level").eq("status", "Active"),
        supabase.from("leaves").select("employee_id, remaining, remaining_balance"),
      ]);
      setEmployees(emps || []);
      setLeaves(lvs || []);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  const leaveMap = useMemo(() => Object.fromEntries((leaves || []).map(l => [l.employee_id, l])), [leaves]);

  const rows = useMemo(() => {
    return employees
      .filter(e => {
        const branchOk = filterBranch === "All" || e.branch === filterBranch;
        const deptOk = !filterDept || e.department?.toLowerCase().includes(filterDept.toLowerCase());
        return branchOk && deptOk;
      })
      .map(emp => {
        const lv = leaveMap[emp.employee_code];
        const remaining = Number(lv?.remaining ?? lv?.remaining_balance ?? 0);
        const dailySalary = Number(emp.salary || 0) / 30;
        const liability = remaining * dailySalary;
        return { ...emp, remaining, dailySalary, liability };
      })
      .sort((a, b) => b.liability - a.liability);
  }, [employees, leaveMap, filterBranch, filterDept]);

  const totals = useMemo(() => rows.reduce((s, r) => ({
    remaining: s.remaining + r.remaining,
    liability: s.liability + r.liability,
  }), { remaining: 0, liability: 0 }), [rows]);

  // Branch breakdown
  const branchBreakdown = useMemo(() => {
    const map = {};
    rows.forEach(r => {
      if (!map[r.branch]) map[r.branch] = { branch: r.branch, count: 0, totalDays: 0, totalLiability: 0 };
      map[r.branch].count++;
      map[r.branch].totalDays += r.remaining;
      map[r.branch].totalLiability += r.liability;
    });
    return Object.values(map).sort((a, b) => b.totalLiability - a.totalLiability);
  }, [rows]);

  // Dept breakdown
  const deptBreakdown = useMemo(() => {
    const map = {};
    rows.forEach(r => {
      const dept = r.department || "Unassigned";
      if (!map[dept]) map[dept] = { dept, count: 0, totalDays: 0, totalLiability: 0 };
      map[dept].count++;
      map[dept].totalDays += r.remaining;
      map[dept].totalLiability += r.liability;
    });
    return Object.values(map).sort((a, b) => b.totalLiability - a.totalLiability);
  }, [rows]);

  function exportExcel() {
    const data = rows.map(r => ({
      "Employee Code": r.employee_code,
      "Name": r.full_name,
      "Department": r.department,
      "Branch": r.branch,
      "Monthly Salary": r.salary,
      "Daily Salary": Math.round(r.dailySalary),
      "Leave Remaining (days)": r.remaining,
      "Leave Liability (Rs.)": Math.round(r.liability),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Leave Liability");
    XLSX.writeFile(wb, `leave_liability_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <div>
      <PageTitle title="Leave Liability" subtitle="Outstanding leave encashment liability per employee."
        action={<Button variant="outline" onClick={exportExcel} className="rounded-2xl">Export Excel</Button>} />

      {err && <div className="mb-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{err}</div>}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-slate-500">Employees</p>
          <p className="text-2xl font-bold">{rows.length}</p>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-slate-500">Total Leave Days</p>
          <p className="text-2xl font-bold">{totals.remaining}</p>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm col-span-2">
          <p className="text-xs text-slate-500">Total Leave Liability</p>
          <p className="text-2xl font-bold text-red-500">{money(totals.liability)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm mb-4">
        <div className="flex flex-wrap gap-3">
          <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm">
            <option value="All">All Branches</option>
            {Object.keys(BRANCH_CODE_MAP).map(b => <option key={b}>{b}</option>)}
          </select>
          <input value={filterDept} onChange={e => setFilterDept(e.target.value)} placeholder="Filter by department"
            className="px-4 py-2 rounded-xl border border-slate-200 text-sm" />
        </div>
      </div>

      {/* Branch & Dept Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-3">By Branch</h3>
          <div className="space-y-2">
            {branchBreakdown.map(b => (
              <div key={b.branch} className="flex justify-between items-center text-sm">
                <span className="text-slate-600">{b.branch} <span className="text-slate-400">({b.totalDays} days)</span></span>
                <span className="font-semibold text-red-500">{money(b.totalLiability)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-3">By Department</h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {deptBreakdown.map(d => (
              <div key={d.dept} className="flex justify-between items-center text-sm">
                <span className="text-slate-600">{d.dept}</span>
                <span className="font-semibold text-red-500">{money(d.totalLiability)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Detail Table */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
        <div className="px-5 pt-4 pb-2">
          <h2 className="font-bold text-slate-800">Per Employee Leave Liability</h2>
          <p className="text-xs text-slate-400 mt-0.5">{rows.length} employees</p>
        </div>
        {loading ? <p className="px-5 py-8 text-slate-400 text-sm">Loading...</p> : (
          <table className="w-full min-w-[700px] text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>{["Employee", "Department", "Branch", "Monthly Salary", "Daily Rate", "Leave Days", "Liability"].map(h => (
                <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0
                ? <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No data found.</td></tr>
                : rows.map(r => (
                  <tr key={r.employee_code}>
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.full_name}</div>
                      <div className="text-xs text-slate-400">{r.employee_code}</div>
                    </td>
                    <td className="px-4 py-3">{r.department}</td>
                    <td className="px-4 py-3">{r.branch}</td>
                    <td className="px-4 py-3">{money(r.salary)}</td>
                    <td className="px-4 py-3">{money(Math.round(r.dailySalary))}</td>
                    <td className="px-4 py-3">
                      <Badge tone={r.remaining <= 0 ? "green" : r.remaining > 15 ? "red" : "yellow"}>{r.remaining} days</Badge>
                    </td>
                    <td className="px-4 py-3 font-semibold text-red-500">{money(r.liability)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
