import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { Button, Badge, PageTitle } from "../components/ui.jsx";

const RATING_LABELS = { 1: "Poor", 2: "Below Average", 3: "Average", 4: "Good", 5: "Excellent" };
const RATING_TONES = { 1: "red", 2: "yellow", 3: "slate", 4: "blue", 5: "green" };

const DEFAULT_KPIS = [
  { dept: "All", name: "Attendance", weight: 30 },
  { dept: "All", name: "Punctuality", weight: 20 },
  { dept: "All", name: "Teamwork", weight: 15 },
  { dept: "Grocery", name: "Shelf Management", weight: 20 },
  { dept: "Cashier", name: "Accuracy", weight: 20 },
  { dept: "Security", name: "Incident Response", weight: 20 },
];

export default function Performance() {
  const [tab, setTab] = useState("ratings");
  const [employees, setEmployees] = useState([]);
  const [ratings, setRatings] = useState([]);
  const [kpis, setKpis] = useState(DEFAULT_KPIS);
  const [newKpi, setNewKpi] = useState({ dept: "All", name: "", weight: 10 });
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [filterDept, setFilterDept] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    supabase.from("employees").select("employee_code, full_name, department, branch, staff_level").eq("status", "Active").order("full_name")
      .then(({ data }) => setEmployees(data || []));
  }, []);

  const depts = useMemo(() => [...new Set(employees.map(e => e.department).filter(Boolean))], [employees]);

  function getRating(empCode, kpiName) {
    return ratings.find(r => r.employee_code === empCode && r.month === month && r.kpi === kpiName)?.rating || 0;
  }

  function setRating(empCode, kpiName, rating) {
    setRatings(prev => {
      const existing = prev.findIndex(r => r.employee_code === empCode && r.month === month && r.kpi === kpiName);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = { ...updated[existing], rating };
        return updated;
      }
      return [...prev, { employee_code: empCode, month, kpi: kpiName, rating, rated_at: new Date().toISOString() }];
    });
  }

  function avgRating(empCode) {
    const empRatings = ratings.filter(r => r.employee_code === empCode && r.month === month && r.rating > 0);
    if (!empRatings.length) return 0;
    return Math.round((empRatings.reduce((s, r) => s + r.rating, 0) / empRatings.length) * 10) / 10;
  }

  function addKpi() {
    if (!newKpi.name) return;
    setKpis(k => [...k, { ...newKpi }]);
    setNewKpi({ dept: "All", name: "", weight: 10 });
    setMsg("KPI added.");
  }

  const filteredEmps = useMemo(() =>
    employees.filter(e => !filterDept || e.department === filterDept), [employees, filterDept]);

  const summaryRows = useMemo(() =>
    filteredEmps.map(emp => ({ ...emp, avg: avgRating(emp.employee_code) }))
      .sort((a, b) => b.avg - a.avg),
    [filteredEmps, ratings, month]);

  function Stars({ value, onChange }) {
    return (
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} onClick={() => onChange?.(n)}
            className={`text-lg transition ${n <= value ? "text-amber-400" : "text-slate-200"} ${onChange ? "hover:text-amber-300" : ""}`}>
            ★
          </button>
        ))}
      </div>
    );
  }

  return (
    <div>
      <PageTitle title="Performance & KPI" subtitle="Define KPIs, rate employees monthly and track performance trends." />

      <div className="flex flex-wrap gap-2 mb-4">
        {[["ratings", "Monthly Ratings"], ["summary", "Summary"], ["kpis", "KPI Setup"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${tab === k ? "bg-slate-950 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            {l}
          </button>
        ))}
      </div>

      {msg && <div className="mb-3 p-3 rounded-xl bg-blue-50 text-blue-700 text-sm">{msg}</div>}

      {tab === "ratings" && (
        <div>
          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm mb-4">
            <div className="flex flex-wrap gap-3 items-center">
              <div>
                <p className="text-xs text-slate-500 mb-1">Month</p>
                <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm" />
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Department</p>
                <select value={filterDept} onChange={e => setFilterDept(e.target.value)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm">
                  <option value="">All Departments</option>
                  {depts.map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {filteredEmps.slice(0, 20).map(emp => {
              const relevantKpis = kpis.filter(k => k.dept === "All" || k.dept === emp.department);
              const avg = avgRating(emp.employee_code);
              return (
                <div key={emp.employee_code} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <span className="font-semibold text-slate-800">{emp.full_name}</span>
                      <span className="text-xs text-slate-400 ml-2">{emp.employee_code} · {emp.department}</span>
                    </div>
                    {avg > 0 && (
                      <div className="flex items-center gap-2">
                        <Stars value={Math.round(avg)} />
                        <Badge tone={RATING_TONES[Math.round(avg)] || "slate"}>{avg} — {RATING_LABELS[Math.round(avg)]}</Badge>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {relevantKpis.map(kpi => (
                      <div key={kpi.name} className="flex items-center justify-between gap-2">
                        <span className="text-sm text-slate-600 flex-1">{kpi.name}</span>
                        <Stars value={getRating(emp.employee_code, kpi.name)} onChange={v => setRating(emp.employee_code, kpi.name, v)} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {filteredEmps.length === 0 && <p className="text-slate-400 text-sm">No employees to rate.</p>}
          </div>
        </div>
      )}

      {tab === "summary" && (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
          <div className="px-5 pt-4 pb-2">
            <h2 className="font-bold text-slate-800">Performance Summary — {month}</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>{["Rank", "Employee", "Department", "Avg Rating", "Rating"].map(h => (
                <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {summaryRows.map((emp, i) => (
                <tr key={emp.employee_code} className={i < 3 && emp.avg > 0 ? "bg-amber-50/30" : ""}>
                  <td className="px-4 py-3 font-bold text-slate-500">{emp.avg > 0 ? `#${i + 1}` : "—"}</td>
                  <td className="px-4 py-3 font-medium">{emp.full_name}</td>
                  <td className="px-4 py-3">{emp.department}</td>
                  <td className="px-4 py-3">
                    {emp.avg > 0 ? (
                      <div className="flex items-center gap-2">
                        <span className="text-amber-400">{'★'.repeat(Math.round(emp.avg))}</span>
                        <span className="text-slate-600">{emp.avg}</span>
                      </div>
                    ) : <span className="text-slate-300">Not rated</span>}
                  </td>
                  <td className="px-4 py-3">
                    {emp.avg > 0 && <Badge tone={RATING_TONES[Math.round(emp.avg)] || "slate"}>{RATING_LABELS[Math.round(emp.avg)]}</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "kpis" && (
        <div>
          <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm mb-4">
            <h2 className="font-bold text-slate-800 mb-4">Add KPI</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-slate-500 mb-1">Department</p>
                <select value={newKpi.dept} onChange={e => setNewKpi(k => ({ ...k, dept: e.target.value }))}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm">
                  <option value="All">All Departments</option>
                  {depts.map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">KPI Name</p>
                <input value={newKpi.name} onChange={e => setNewKpi(k => ({ ...k, name: e.target.value }))}
                  placeholder="e.g. Customer Satisfaction" className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Weight (%)</p>
                <input type="number" min={1} max={100} value={newKpi.weight} onChange={e => setNewKpi(k => ({ ...k, weight: Number(e.target.value) }))}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
              </div>
            </div>
            <div className="mt-3"><Button onClick={addKpi} className="rounded-2xl">Add KPI</Button></div>
          </div>

          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
            <div className="px-5 pt-4 pb-2"><h2 className="font-bold text-slate-800">KPI Library</h2></div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>{["KPI Name", "Department", "Weight"].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {kpis.map((k, i) => (
                  <tr key={i}>
                    <td className="px-4 py-3 font-medium">{k.name}</td>
                    <td className="px-4 py-3"><Badge tone="slate">{k.dept}</Badge></td>
                    <td className="px-4 py-3">{k.weight}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
