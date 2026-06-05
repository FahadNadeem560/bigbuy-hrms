import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { Button, Badge, PageTitle } from "../components/ui.jsx";
import { money } from "../utils/format.js";
import { calculatePayrollForEmployee } from "../utils/payrollRules.js";
import * as XLSX from "xlsx";

const STATUS_TONES = { Draft: "yellow", Approved: "blue", Paid: "green" };

function PayslipModal({ row, month, onClose }) {
  if (!row) return null;
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="font-bold text-slate-800">Payslip — {month}</h2>
            <p className="text-sm text-slate-500">{row.name} · {row.employeeCode}</p>
          </div>
          <Button variant="outline" onClick={onClose} className="rounded-xl text-xs">Close</Button>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between py-2 border-b border-slate-100">
            <span className="text-slate-500">Basic Salary</span><span className="font-semibold">{money(row.gross)}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-100">
            <span className="text-slate-500">OT Amount</span><span className="text-emerald-600">{money(row.overtimeAmount)}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-100">
            <span className="text-slate-500">Commission</span><span className="text-emerald-600">{money(row.commission || 0)}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-100">
            <span className="text-slate-500">Absent Deduction</span><span className="text-red-500">- {money(row.absentDeduction)}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-100">
            <span className="text-slate-500">Late Deduction</span><span className="text-red-500">- {money(row.lateDeduction)}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-100">
            <span className="text-slate-500">Loan Deduction</span><span className="text-red-500">- {money(row.loanDeduction)}</span>
          </div>
          <div className="flex justify-between py-3 bg-slate-50 rounded-xl px-3 font-bold text-base mt-2">
            <span>Net Pay</span><span className="text-slate-900">{money(row.finalSalary)}</span>
          </div>
        </div>
        <Button onClick={() => window.print()} variant="outline" className="w-full rounded-2xl mt-4">Print Payslip</Button>
      </div>
    </div>
  );
}

export default function PayrollAutomation({ role }) {
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [loans, setLoans] = useState([]);
  const [payrollRows, setPayrollRows] = useState([]);
  const [payrollStatus, setPayrollStatus] = useState("Draft");
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [selectedPayslip, setSelectedPayslip] = useState(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => { loadBase(); }, []);
  useEffect(() => { loadPayroll(); }, [month]);

  async function loadBase() {
    const [{ data: emps }, { data: lns }] = await Promise.all([
      supabase.from("employees").select("*").eq("status", "Active"),
      supabase.from("loans").select("*").eq("status", "Active"),
    ]);
    setEmployees(emps || []);
    setLoans(lns || []);
  }

  async function loadPayroll() {
    const { data } = await supabase.from("payroll").select("*").eq("payroll_month", month).limit(500);
    if (data && data.length > 0) {
      setPayrollRows(data);
      setPayrollStatus(data[0]?.status || "Draft");
    } else {
      setPayrollRows([]);
    }
  }

  async function generatePayroll() {
    setGenerating(true); setErr(""); setMsg("");
    try {
      // Load attendance for the month
      const fromDate = month + "-01";
      const [y, m] = month.split("-").map(Number);
      const toDate = `${y}-${String(m).padStart(2, "0")}-${new Date(y, m, 0).getDate()}`;

      const { data: att } = await supabase.from("attendance").select("*")
        .gte("work_date", fromDate).lte("work_date", toDate);
      setAttendance(att || []);

      // Build adjustments per employee from attendance
      const attByEmp = {};
      (att || []).forEach(a => {
        const c = a.employee_code;
        if (!attByEmp[c]) attByEmp[c] = { presentDays: 0, absentDays: 0, lateCount: 0, otHours: 0 };
        const s = a.attendance_status || a.status || "";
        if (s === "Absent") attByEmp[c].absentDays++;
        else attByEmp[c].presentDays++;
        if (Number(a.late_minutes || 0) > 0) attByEmp[c].lateCount++;
        attByEmp[c].otHours += Number(a.ot_hours || a.overtime_hours || 0);
      });

      // Calculate payroll rows
      const rows = employees.map(emp => {
        const empMapped = {
          id: emp.employee_code, name: emp.full_name, branch: emp.branch,
          dept: emp.department, level: emp.staff_level || "Non-Management",
          salary: emp.salary || 0, status: emp.status, joiningDate: emp.joining_date,
        };
        const adj = attByEmp[emp.employee_code] || {};
        const loanMatch = (loans || []).find(l => l.employee_code === emp.employee_code || l.employee_id === emp.employee_code);
        const loanRows = loanMatch ? [{ employeeCode: emp.employee_code, monthly: Number(loanMatch.monthly_deduction || 0) }] : [];
        return calculatePayrollForEmployee(empMapped, adj, loanRows);
      });

      // Upsert to payroll table
      const payloadRows = rows.map(r => ({
        employee_code: r.employeeCode, employee_name: r.name, payroll_month: month,
        gross_salary: r.gross, absent_deduction: r.absentDeduction, late_deduction: r.lateDeduction,
        ot_amount: r.overtimeAmount, loan_deduction: r.loanDeduction,
        net_salary: r.finalSalary, status: "Draft", generated_at: new Date().toISOString(),
      }));

      // Delete existing then insert
      await supabase.from("payroll").delete().eq("payroll_month", month);
      if (payloadRows.length > 0) await supabase.from("payroll").insert(payloadRows);

      setPayrollRows(rows);
      setPayrollStatus("Draft");
      setMsg(`Payroll generated for ${rows.length} employees.`);
    } catch (e) {
      setErr(e.message);
    } finally {
      setGenerating(false);
    }
  }

  async function updateStatus(newStatus) {
    if (newStatus === "Approved" && role !== "Master" && role !== "Finance") return setErr("Only Master/Finance can approve payroll.");
    await supabase.from("payroll").update({ status: newStatus }).eq("payroll_month", month);
    setPayrollStatus(newStatus); setMsg(`Payroll marked as ${newStatus}.`);
  }

  function exportExcel() {
    const rows = payrollRows.map(r => ({
      "Employee Code": r.employeeCode || r.employee_code,
      "Name": r.name || r.employee_name,
      "Gross": r.gross || r.gross_salary,
      "Absent Deduction": r.absentDeduction || r.absent_deduction,
      "Late Deduction": r.lateDeduction || r.late_deduction,
      "OT Amount": r.overtimeAmount || r.ot_amount,
      "Loan Deduction": r.loanDeduction || r.loan_deduction,
      "Net Pay": r.finalSalary || r.net_salary,
      "Status": r.status || payrollStatus,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Payroll");
    XLSX.writeFile(wb, `payroll_${month}.xlsx`);
  }

  const displayRows = useMemo(() => payrollRows.map(r => ({
    employeeCode: r.employeeCode || r.employee_code,
    name: r.name || r.employee_name,
    level: r.level || "—",
    gross: r.gross || r.gross_salary || 0,
    absentDeduction: r.absentDeduction || r.absent_deduction || 0,
    lateDeduction: r.lateDeduction || r.late_deduction || 0,
    overtimeAmount: r.overtimeAmount || r.ot_amount || 0,
    loanDeduction: r.loanDeduction || r.loan_deduction || 0,
    finalSalary: r.finalSalary || r.net_salary || 0,
    commission: r.commission || 0,
  })), [payrollRows]);

  const totals = useMemo(() => displayRows.reduce((s, r) => ({
    gross: s.gross + r.gross, net: s.net + r.finalSalary,
  }), { gross: 0, net: 0 }), [displayRows]);

  return (
    <div>
      <PayslipModal row={selectedPayslip} month={month} onClose={() => setSelectedPayslip(null)} />
      <PageTitle title="Payroll Processing" subtitle="Auto-calculate payroll from attendance and policy." />

      {/* Controls */}
      <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <p className="text-xs text-slate-500 mb-1">Payroll Month</p>
            <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm" />
          </div>
          <div className="flex items-center gap-2 mt-4">
            <Badge tone={STATUS_TONES[payrollStatus] || "slate"}>{payrollStatus}</Badge>
          </div>
          <div className="flex gap-2 mt-4 ml-auto flex-wrap">
            <Button onClick={generatePayroll} disabled={generating} className="rounded-2xl">
              {generating ? "Generating..." : "Generate Payroll"}
            </Button>
            {displayRows.length > 0 && payrollStatus === "Draft" && (
              <Button variant="outline" onClick={() => updateStatus("Approved")} className="rounded-2xl">Approve</Button>
            )}
            {displayRows.length > 0 && payrollStatus === "Approved" && (
              <Button variant="outline" onClick={() => updateStatus("Paid")} className="rounded-2xl">Mark Paid</Button>
            )}
            {displayRows.length > 0 && (
              <Button variant="outline" onClick={exportExcel} className="rounded-2xl">Export Excel</Button>
            )}
          </div>
        </div>
      </div>

      {msg && <div className="mb-3 p-3 rounded-xl bg-blue-50 text-blue-700 text-sm">{msg}</div>}
      {err && <div className="mb-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{err}</div>}

      {/* Summary cards */}
      {displayRows.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
            <p className="text-xs text-slate-500">Employees</p>
            <p className="text-2xl font-bold">{displayRows.length}</p>
          </div>
          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
            <p className="text-xs text-slate-500">Total Gross</p>
            <p className="text-2xl font-bold">{money(totals.gross)}</p>
          </div>
          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
            <p className="text-xs text-slate-500">Total Net</p>
            <p className="text-2xl font-bold text-emerald-600">{money(totals.net)}</p>
          </div>
          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
            <p className="text-xs text-slate-500">Status</p>
            <p className="text-xl font-bold">{payrollStatus}</p>
          </div>
        </div>
      )}

      {/* Payroll Table */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
        <div className="px-5 pt-4 pb-2">
          <h2 className="font-bold text-slate-800">Payroll Register — {month}</h2>
          <p className="text-xs text-slate-400 mt-0.5">{displayRows.length} employees</p>
        </div>
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>{["Employee", "Level", "Basic", "OT", "Absent Ded.", "Late Ded.", "Loan Ded.", "Net Pay", "Payslip"].map(h => (
              <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
            ))}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {displayRows.length === 0
              ? <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">No payroll data. Click "Generate Payroll" to calculate.</td></tr>
              : displayRows.map((r, i) => (
                <tr key={i}>
                  <td className="px-4 py-3 font-medium">{r.name}<div className="text-xs text-slate-400">{r.employeeCode}</div></td>
                  <td className="px-4 py-3">{r.level}</td>
                  <td className="px-4 py-3">{money(r.gross)}</td>
                  <td className="px-4 py-3 text-emerald-600">{money(r.overtimeAmount)}</td>
                  <td className="px-4 py-3 text-red-500">{money(r.absentDeduction)}</td>
                  <td className="px-4 py-3 text-red-500">{money(r.lateDeduction)}</td>
                  <td className="px-4 py-3 text-red-500">{money(r.loanDeduction)}</td>
                  <td className="px-4 py-3 font-bold text-slate-900">{money(r.finalSalary)}</td>
                  <td className="px-4 py-3">
                    <Button variant="outline" onClick={() => setSelectedPayslip(r)} className="rounded-xl text-xs py-1 px-3">View</Button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
