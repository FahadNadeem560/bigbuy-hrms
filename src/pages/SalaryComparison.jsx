import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { Button, Badge, PageTitle } from "../components/ui.jsx";
import { money } from "../utils/format.js";
import * as XLSX from "xlsx";

const COLS = [
  { key: "gross_salary", label: "Gross Salary" },
  { key: "net_salary", label: "Net Pay" },
  { key: "fuel_allowance", label: "Fuel Allow." },
  { key: "ot_amount", label: "Overtime" },
  { key: "extra_working_days", label: "Extra Days" },
  { key: "leave_adjustment", label: "Leave Adj." },
  { key: "arrears", label: "Arrears" },
  { key: "commission", label: "Commission" },
  { key: "other_amount", label: "Other Amt" },
  { key: "advance", label: "Advance" },
  { key: "loan_deduction", label: "Loan Ded." },
  { key: "late_deduction", label: "Late" },
  { key: "absent_deduction", label: "Absent Ded." },
  { key: "fine", label: "Fine" },
  { key: "eobi_deduction", label: "EOBI" },
  { key: "tax_deduction", label: "Tax" },
];

function SimpleLineChart({ data, months }) {
  if (!data || data.length === 0 || months.length < 2) return null;
  const vals = data.map(d => Number(d.net_salary || 0));
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const W = 300, H = 80, PAD = 8;
  const pts = vals.map((v, i) => {
    const x = PAD + (i / (vals.length - 1)) * (W - PAD * 2);
    const y = H - PAD - ((v - min) / range) * (H - PAD * 2);
    return `${x},${y}`;
  });
  return (
    <svg width={W} height={H} className="overflow-visible">
      <polyline fill="none" stroke="#6366f1" strokeWidth="2" points={pts.join(" ")} />
      {pts.map((pt, i) => {
        const [x, y] = pt.split(",").map(Number);
        return <circle key={i} cx={x} cy={y} r="3" fill="#6366f1" />;
      })}
    </svg>
  );
}

function cellColor(val, prevVal) {
  if (prevVal == null || val == null) return "";
  const diff = Number(val) - Number(prevVal);
  if (diff > 0) return "bg-emerald-50 text-emerald-700";
  if (diff < 0) return "bg-red-50 text-red-600";
  return "";
}

export default function SalaryComparison() {
  const now = new Date();
  const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [selectedMonths, setSelectedMonths] = useState([curMonth]);
  const [monthInput, setMonthInput] = useState(curMonth);
  const [payrollData, setPayrollData] = useState({});
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterEmp, setFilterEmp] = useState("");
  const [filterDept, setFilterDept] = useState("All");
  const [selectedCard, setSelectedCard] = useState(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (employees.length === 0) {
      supabase.from("employees").select("employee_code, full_name, department, branch").order("full_name").then(({ data }) => setEmployees(data || []));
    }
  }, []);

  useEffect(() => { loadPayroll(); }, [selectedMonths]);

  async function loadPayroll() {
    if (selectedMonths.length === 0) return;
    setLoading(true);
    const { data } = await supabase.from("payroll").select("*").in("payroll_month", selectedMonths).limit(2000);
    const map = {};
    (data || []).forEach(row => {
      const m = row.payroll_month;
      if (!map[m]) map[m] = {};
      map[m][row.employee_code] = row;
    });
    setPayrollData(map);
    setLoading(false);
  }

  function addMonth() {
    if (!monthInput) return;
    if (!selectedMonths.includes(monthInput)) {
      setSelectedMonths(prev => [...prev, monthInput].sort());
    }
  }

  function removeMonth(m) {
    setSelectedMonths(prev => prev.filter(x => x !== m));
  }

  const depts = useMemo(() => ["All", ...new Set(employees.map(e => e.department).filter(Boolean))], [employees]);

  const filteredEmps = useMemo(() => employees.filter(emp => {
    const nameMatch = !filterEmp || emp.full_name?.toLowerCase().includes(filterEmp.toLowerCase()) || emp.employee_code?.toLowerCase().includes(filterEmp.toLowerCase());
    const deptMatch = filterDept === "All" || emp.department === filterDept;
    return nameMatch && deptMatch;
  }), [employees, filterEmp, filterDept]);

  const deptSummary = useMemo(() => {
    const map = {};
    filteredEmps.forEach(emp => {
      const dept = emp.department || "Unknown";
      if (!map[dept]) map[dept] = { dept };
      selectedMonths.forEach(m => {
        if (!map[dept][m]) map[dept][m] = 0;
        const row = payrollData[m]?.[emp.employee_code];
        map[dept][m] += Number(row?.net_salary || 0);
      });
    });
    return Object.values(map);
  }, [filteredEmps, payrollData, selectedMonths]);

  function exportExcel() {
    const rows = [];
    filteredEmps.forEach(emp => {
      const row = { "Employee Code": emp.employee_code, "Name": emp.full_name, "Department": emp.department };
      selectedMonths.forEach(m => {
        const d = payrollData[m]?.[emp.employee_code];
        COLS.forEach(col => { row[`${m} ${col.label}`] = d ? Number(d[col.key] || 0) : 0; });
      });
      rows.push(row);
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Comparison");
    XLSX.writeFile(wb, `salary_comparison_${selectedMonths.join("_")}.xlsx`);
  }

  const cardEmp = selectedCard ? employees.find(e => e.employee_code === selectedCard) : null;
  const cardData = cardEmp ? {
    cur: payrollData[selectedMonths[selectedMonths.length - 1]]?.[cardEmp.employee_code],
    prev: selectedMonths.length > 1 ? payrollData[selectedMonths[selectedMonths.length - 2]]?.[cardEmp.employee_code] : null,
  } : null;

  return (
    <div>
      <PageTitle title="Salary Comparison" subtitle="Compare payroll across multiple months with highlights and trend charts." />

      <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <p className="text-xs text-slate-500 mb-1">Add Month</p>
            <input type="month" value={monthInput} onChange={e => setMonthInput(e.target.value)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm" />
          </div>
          <Button onClick={addMonth} className="rounded-2xl">Add</Button>
          <div className="flex flex-wrap gap-2 flex-1">
            {selectedMonths.map(m => (
              <div key={m} className="flex items-center gap-1 bg-indigo-50 text-indigo-700 px-3 py-1 rounded-xl text-sm">
                {m}
                <button onClick={() => removeMonth(m)} className="ml-1 text-indigo-400 hover:text-indigo-700">×</button>
              </div>
            ))}
          </div>
          {Object.keys(payrollData).length > 0 && (
            <Button variant="outline" onClick={exportExcel} className="rounded-2xl">Export Excel</Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <input value={filterEmp} onChange={e => setFilterEmp(e.target.value)} placeholder="Search employee..." className="flex-1 min-w-[160px] px-4 py-2 rounded-xl border border-slate-200 text-sm" />
        <select value={filterDept} onChange={e => setFilterDept(e.target.value)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm">
          {depts.map(d => <option key={d}>{d}</option>)}
        </select>
        {loading && <Badge tone="yellow">Loading...</Badge>}
      </div>

      {selectedMonths.length > 0 && (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto mb-4">
          <div className="px-5 pt-4 pb-2"><h2 className="font-bold text-slate-800">Employee-wise Comparison</h2><p className="text-xs text-slate-400">{filteredEmps.length} employees · Green = increase, Red = decrease vs previous month</p></div>
          <table className="text-xs min-w-max w-full">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="text-left px-4 py-3 font-medium sticky left-0 bg-slate-50 z-10 min-w-[150px]">Employee</th>
                {selectedMonths.map(m => (
                  <th key={m} colSpan={COLS.length} className="text-center px-2 py-3 font-medium border-l border-slate-200">{m}</th>
                ))}
                <th className="text-center px-3 py-3 font-medium border-l border-slate-200">Trend</th>
              </tr>
              <tr>
                <th className="text-left px-4 py-2 sticky left-0 bg-slate-50 z-10"></th>
                {selectedMonths.map(m => COLS.map(c => (
                  <th key={`${m}-${c.key}`} className="text-center px-2 py-2 text-slate-400 font-normal border-l-0">{c.label}</th>
                )))}
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredEmps.slice(0, 100).map(emp => {
                const trend = selectedMonths.map(m => payrollData[m]?.[emp.employee_code]);
                return (
                  <tr key={emp.employee_code} className="hover:bg-slate-50">
                    <td className="px-4 py-2 sticky left-0 bg-white z-10 border-r border-slate-100">
                      <button onClick={() => setSelectedCard(emp.employee_code)} className="font-semibold text-blue-600 hover:underline text-left">
                        {emp.full_name}
                      </button>
                      <div className="text-slate-400">{emp.employee_code}</div>
                    </td>
                    {selectedMonths.map((m, mi) => {
                      const row = payrollData[m]?.[emp.employee_code];
                      const prevRow = mi > 0 ? payrollData[selectedMonths[mi - 1]]?.[emp.employee_code] : null;
                      return COLS.map(c => {
                        const val = row ? Number(row[c.key] || 0) : null;
                        const prev = prevRow ? Number(prevRow[c.key] || 0) : null;
                        const cls = mi > 0 ? cellColor(val, prev) : "";
                        return (
                          <td key={`${m}-${c.key}`} className={`px-2 py-2 text-center ${cls}`}>
                            {val != null ? (val === 0 ? <span className="text-slate-300">—</span> : money(val).replace("Rs. ", "")) : <span className="text-slate-300">—</span>}
                          </td>
                        );
                      });
                    })}
                    <td className="px-3 py-2 text-center border-l border-slate-100">
                      <SimpleLineChart data={trend.filter(Boolean)} months={selectedMonths} />
                    </td>
                  </tr>
                );
              })}
              {filteredEmps.length === 0 && <tr><td colSpan={selectedMonths.length * COLS.length + 2} className="px-4 py-8 text-center text-slate-400">No employees match filters.</td></tr>}
            </tbody>
          </table>
          {filteredEmps.length > 100 && <p className="text-xs text-slate-400 px-5 py-3">Showing first 100 of {filteredEmps.length} employees.</p>}
        </div>
      )}

      {selectedMonths.length > 0 && (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto mb-4">
          <div className="px-5 pt-4 pb-2"><h2 className="font-bold text-slate-800">Department-wise Net Pay Summary</h2></div>
          <table className="text-sm w-full">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Department</th>
                {selectedMonths.map(m => <th key={m} className="text-right px-4 py-3 font-medium">{m}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {deptSummary.map((d, i) => (
                <tr key={i}>
                  <td className="px-4 py-3 font-medium">{d.dept}</td>
                  {selectedMonths.map((m, mi) => {
                    const val = d[m] || 0;
                    const prev = mi > 0 ? (d[selectedMonths[mi - 1]] || 0) : null;
                    const cls = mi > 0 ? cellColor(val, prev) : "";
                    return <td key={m} className={`px-4 py-3 text-right font-semibold ${cls}`}>{money(val)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedCard && cardEmp && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
            <div className="flex justify-between items-start mb-4">
              <div><h3 className="font-bold text-slate-800">{cardEmp.full_name}</h3><p className="text-sm text-slate-500">{cardEmp.employee_code} · {cardEmp.department}</p></div>
              <Button variant="outline" onClick={() => setSelectedCard(null)} className="rounded-xl text-xs">Close</Button>
            </div>
            {cardData?.cur && (
              <div>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-slate-50 rounded-xl p-3">
                    <p className="text-xs text-slate-500">Current Month</p>
                    <p className="font-bold text-slate-800">{selectedMonths[selectedMonths.length - 1]}</p>
                    <p className="text-2xl font-bold text-emerald-600">{money(cardData.cur.net_salary)}</p>
                  </div>
                  {cardData.prev && (
                    <div className="bg-slate-50 rounded-xl p-3">
                      <p className="text-xs text-slate-500">Previous Month</p>
                      <p className="font-bold text-slate-800">{selectedMonths[selectedMonths.length - 2]}</p>
                      <p className="text-2xl font-bold">{money(cardData.prev.net_salary)}</p>
                    </div>
                  )}
                </div>
                {selectedMonths.length >= 2 && (
                  <div className="mb-4">
                    <p className="text-xs text-slate-500 mb-2">Net Pay Trend</p>
                    <SimpleLineChart data={selectedMonths.map(m => payrollData[m]?.[cardEmp.employee_code]).filter(Boolean)} months={selectedMonths} />
                  </div>
                )}
                <div className="space-y-1 text-sm max-h-60 overflow-y-auto">
                  {COLS.map(c => (
                    <div key={c.key} className="flex justify-between py-1 border-b border-slate-50">
                      <span className="text-slate-500">{c.label}</span>
                      <span className={`font-medium ${cellColor(cardData.cur[c.key], cardData.prev?.[c.key])}`}>{money(cardData.cur[c.key] || 0)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {!cardData?.cur && <p className="text-slate-400 text-sm">No payroll data for this employee in selected months.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
