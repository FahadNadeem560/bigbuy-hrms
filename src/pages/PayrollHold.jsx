import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { Button, Badge, PageTitle } from "../components/ui.jsx";
import { money } from "../utils/format.js";
import { requestPaymentStatusChange } from "../services/payrollControlService.js";

export default function PayrollHold({ role, actorName, month, setMonth }) {
  const [rows, setRows] = useState([]);
  const [allHoldRows, setAllHoldRows] = useState([]); // across all months, for the streak counter
  const [employees, setEmployees] = useState([]);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busyCode, setBusyCode] = useState(null);

  useEffect(() => { load(); }, [month]);

  async function load() {
    const [{ data: payroll }, { data: holdHistory }, { data: emps }] = await Promise.all([
      supabase.from("payroll").select("*").eq("payroll_month", month),
      supabase.from("payroll").select("employee_code, payroll_month, payment_status").eq("payment_status", "Hold"),
      supabase.from("employees").select("employee_code, full_name, branch, department, resignation_date, last_working_day"),
    ]);
    setRows(payroll || []);
    setAllHoldRows(holdHistory || []);
    setEmployees(emps || []);
  }

  const empByCode = useMemo(() => Object.fromEntries(employees.map(e => [e.employee_code, e])), [employees]);

  // Consecutive months on Hold ending at the currently-selected month.
  function monthsOnHold(code) {
    const held = new Set(allHoldRows.filter(r => r.employee_code === code).map(r => r.payroll_month));
    let count = 0;
    let [y, m] = month.split("-").map(Number);
    while (held.has(`${y}-${String(m).padStart(2, "0")}`)) {
      count++;
      m--; if (m === 0) { m = 12; y--; }
    }
    return count;
  }

  const holdRows = useMemo(() => rows.filter(r => (r.payment_status || "Normal") === "Hold")
    .map(r => ({ ...r, emp: empByCode[r.employee_code] || {} })), [rows, empByCode]);
  const noFnfRows = useMemo(() => rows.filter(r => (r.payment_status || "Normal") === "No_FnF")
    .map(r => ({ ...r, emp: empByCode[r.employee_code] || {} })), [rows, empByCode]);
  const fnfRows = useMemo(() => rows.filter(r => (r.payment_status || "Normal") === "FnF")
    .map(r => ({ ...r, emp: empByCode[r.employee_code] || {} })), [rows, empByCode]);

  async function requestChange(row, target) {
    const reason = window.prompt(`Reason for requesting ${target === "Normal" ? "Payment" : "No F&F"} for ${row.emp.full_name || row.employee_code}?`);
    if (!reason) return;
    setBusyCode(row.employee_code); setErr(""); setMsg("");
    try {
      await requestPaymentStatusChange({
        employeeCode: row.employee_code, employeeName: row.emp.full_name || row.employee_code,
        payrollMonth: month, requestedBy: role, currentStatus: row.payment_status || "Normal",
        requestedStatus: target, reason,
      });
      setMsg(`Request submitted for ${row.emp.full_name || row.employee_code}.`);
    } catch (e) { setErr(e.message); }
    finally { setBusyCode(null); }
  }

  return (
    <div>
      <PageTitle title="Hold & F&F Management" subtitle="Track employees on hold or excluded from final settlement." />
      <div className="mb-4">
        <p className="text-xs text-slate-500 mb-1">Payroll Month</p>
        <input type="month" value={month} onChange={e => setMonth(e.target.value)}
          className="px-4 py-2 rounded-xl border border-slate-200 text-sm bg-white" />
      </div>
      {msg && <div className="mb-3 p-3 rounded-xl bg-blue-50 text-blue-700 text-sm">{msg}</div>}
      {err && <div className="mb-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{err}</div>}

      {/* Section 1: Hold */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto overflow-y-clip mb-6">
        <div className="px-5 pt-4 pb-2"><h2 className="font-bold text-slate-800">Hold Employees</h2><p className="text-xs text-slate-400">{holdRows.length} employees</p></div>
        <table className="w-full min-w-[880px] text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>{["Employee", "Branch", "Department", "Month", "Amount", "Months on Hold", "Action"].map(h => <th key={h} className="text-left px-4 py-3 font-medium sticky top-0 z-10 bg-slate-50 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {holdRows.length === 0
              ? <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No employees on Hold for {month}.</td></tr>
              : holdRows.map(r => {
                const streak = monthsOnHold(r.employee_code);
                return (
                  <tr key={r.id}>
                    <td className="px-4 py-3 font-medium">{r.emp.full_name || r.employee_code}<div className="text-xs text-slate-400">{r.employee_code}</div></td>
                    <td className="px-4 py-3">{r.emp.branch || "—"}</td>
                    <td className="px-4 py-3">{r.emp.department || "—"}</td>
                    <td className="px-4 py-3">{month}</td>
                    <td className="px-4 py-3 font-semibold">{money(r.net_salary)}</td>
                    <td className="px-4 py-3"><Badge tone={streak >= 3 ? "red" : streak >= 2 ? "yellow" : "slate"}>{streak}</Badge></td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        <Button disabled={busyCode === r.employee_code} onClick={() => requestChange(r, "Normal")} className="rounded-xl text-xs py-1 px-2">Request Payment</Button>
                        <Button disabled={busyCode === r.employee_code} variant="outline" onClick={() => requestChange(r, "No_FnF")} className="rounded-xl text-xs py-1 px-2">Request No F&F</Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {/* Section 2: No F&F */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto overflow-y-clip">
        <div className="px-5 pt-4 pb-2"><h2 className="font-bold text-slate-800">No F&F Employees</h2><p className="text-xs text-slate-400">{noFnfRows.length} employees · Read-only unless Master overrides</p></div>
        <table className="w-full min-w-[880px] text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>{["Employee", "Branch", "Department", "Resign Date", "Last Working Day", "Month", "Amount", "Reason", "Action"].map(h => <th key={h} className="text-left px-4 py-3 font-medium sticky top-0 z-10 bg-slate-50 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {noFnfRows.length === 0
              ? <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">No employees marked No F&F for {month}.</td></tr>
              : noFnfRows.map(r => (
                <tr key={r.id}>
                  <td className="px-4 py-3 font-medium">{r.emp.full_name || r.employee_code}<div className="text-xs text-slate-400">{r.employee_code}</div></td>
                  <td className="px-4 py-3">{r.emp.branch || "—"}</td>
                  <td className="px-4 py-3">{r.emp.department || "—"}</td>
                  <td className="px-4 py-3">{r.emp.resignation_date || "—"}</td>
                  <td className="px-4 py-3">{r.emp.last_working_day || "—"}</td>
                  <td className="px-4 py-3">{month}</td>
                  <td className="px-4 py-3 font-semibold">{money(r.net_salary)}</td>
                  <td className="px-4 py-3 max-w-[200px] truncate">{r.payment_status_reason || "—"}</td>
                  <td className="px-4 py-3">
                    {role === "Master" && (
                      <Button disabled={busyCode === r.employee_code} onClick={() => requestChange(r, "Normal")} className="rounded-xl text-xs py-1 px-2">
                        Request Exception Payment
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Section 3: F&F */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto overflow-y-clip mt-6">
        <div className="px-5 pt-4 pb-2"><h2 className="font-bold text-slate-800">F&F Employees</h2><p className="text-xs text-slate-400">{fnfRows.length} employees settled with amount payable</p></div>
        <table className="w-full min-w-[880px] text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>{["Employee", "Branch", "Department", "Resign Date", "Last Working Day", "Month", "Amount", "Reason"].map(h => <th key={h} className="text-left px-4 py-3 font-medium sticky top-0 z-10 bg-slate-50 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {fnfRows.length === 0
              ? <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No employees marked F&F for {month}.</td></tr>
              : fnfRows.map(r => (
                <tr key={r.id}>
                  <td className="px-4 py-3 font-medium">{r.emp.full_name || r.employee_code}<div className="text-xs text-slate-400">{r.employee_code}</div></td>
                  <td className="px-4 py-3">{r.emp.branch || "—"}</td>
                  <td className="px-4 py-3">{r.emp.department || "—"}</td>
                  <td className="px-4 py-3">{r.emp.resignation_date || "—"}</td>
                  <td className="px-4 py-3">{r.emp.last_working_day || "—"}</td>
                  <td className="px-4 py-3">{month}</td>
                  <td className="px-4 py-3 font-semibold">{money(r.net_salary)}</td>
                  <td className="px-4 py-3 max-w-[200px] truncate">{r.payment_status_reason || "—"}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
