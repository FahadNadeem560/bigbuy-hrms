import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { Button, Badge, PageTitle } from "../components/ui.jsx";
import { money } from "../utils/format.js";
import { calculatePayrollForEmployee, getWorkingDaysInMonth } from "../utils/payrollRules.js";
import * as XLSX from "xlsx";

const STATUS_TONES = { Draft: "yellow", Approved: "blue", Paid: "green" };

// ── Payslip Modal ──────────────────────────────────────────────────────────────
function PayslipModal({ row, month, onClose }) {
  if (!row) return null;

  const ERow = ({ label, value, highlight }) => (
    <div className={`flex justify-between py-1.5 border-b border-slate-100 ${highlight ? "font-semibold" : ""}`}>
      <span className="text-slate-500 text-sm">{label}</span>
      <span className={`text-sm ${highlight ? "text-slate-900" : "text-emerald-700"}`}>{money(value)}</span>
    </div>
  );
  const DRow = ({ label, value, highlight }) => (
    <div className={`flex justify-between py-1.5 border-b border-slate-100 ${highlight ? "font-semibold" : ""}`}>
      <span className="text-slate-500 text-sm">{label}</span>
      <span className={`text-sm ${highlight ? "text-slate-900" : "text-red-500"}`}>
        {value ? `– ${money(value)}` : money(0)}
      </span>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white rounded-t-2xl px-6 pt-6 pb-3 border-b border-slate-100 flex justify-between items-start">
          <div>
            <h2 className="font-bold text-slate-800 text-lg">Payslip — {month}</h2>
            <p className="text-sm text-slate-500">{row.name} · {row.employeeCode}</p>
            {row.level && <p className="text-xs text-slate-400 mt-0.5">{row.level}</p>}
          </div>
          <Button variant="outline" onClick={onClose} className="rounded-xl text-xs">Close</Button>
        </div>

        <div className="px-6 py-4 space-y-5">
          {/* Earnings Section */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Earnings</h3>
            <ERow label="Basic Salary" value={row.basicSalary} />
            <ERow label="Overtime Amount" value={row.overtimeAmount} />
            <ERow label="Commission Add-On" value={row.commissionAddOn} />
            <ERow label="Arrears" value={row.arrears} />
            <ERow label="Absent Adjustment" value={row.absentAdjustment} />
            <ERow label="Fuel Allowance" value={row.fuelAllowance} />
            <ERow label="Other Amount" value={row.otherAmount} />
            <ERow label="Extra Working Days Amount" value={row.extraWorkingDaysAmount} />
            <div className="flex justify-between py-2 mt-1 bg-emerald-50 rounded-xl px-3">
              <span className="font-bold text-sm text-emerald-800">Total Earnings</span>
              <span className="font-bold text-sm text-emerald-800">{money(row.totalEarnings)}</span>
            </div>
          </div>

          {/* Deductions Section */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Deductions</h3>
            <DRow label="Late Deductions" value={row.lateDeduction} />
            <DRow label="Short Hour Deductions" value={row.shortHourDeduction} />
            <DRow label="Absent Deductions" value={row.absentDeduction} />
            <DRow label="Half Days" value={row.halfDayDeduction} />
            <DRow label="Fines" value={row.fines} />
            <DRow label="Advance" value={row.advance} />
            <DRow label="Loan Deduction" value={row.loanDeduction} />
            <DRow label="Tax Deduction" value={row.taxDeduction} />
            <DRow label="EOBI Deduction" value={row.eobiDeduction} />
            <DRow label="Other Deductions" value={row.otherDeductions} />
            <div className="flex justify-between py-2 mt-1 bg-red-50 rounded-xl px-3">
              <span className="font-bold text-sm text-red-800">Total Deductions</span>
              <span className="font-bold text-sm text-red-800">– {money(row.totalDeductions)}</span>
            </div>
          </div>

          {/* Summary */}
          <div className="bg-slate-50 rounded-xl px-4 py-3 space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Summary</h3>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Gross Salary (Total Earnings)</span>
              <span className="font-medium">{money(row.totalEarnings)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Total Additions</span>
              <span className="font-medium text-emerald-700">+ {money(row.totalEarnings - row.basicSalary)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Total Deductions</span>
              <span className="font-medium text-red-600">– {money(row.totalDeductions)}</span>
            </div>
            <div className="flex justify-between py-2 border-t border-slate-200 mt-1">
              <span className="font-bold text-base text-slate-900">Net Pay</span>
              <span className="font-bold text-base text-slate-900">{money(row.finalSalary)}</span>
            </div>
          </div>

          {/* Additional Info */}
          <div className="bg-blue-50 rounded-xl px-4 py-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-blue-400 mb-2">Additional Info</h3>
            <div className="grid grid-cols-3 gap-2 text-xs">
              {[
                ["Working Days", row.numberOfWorkingDays],
                ["Days Present", row.presentDays],
                ["Days Absent", row.absentDays],
                ["OT Hours", row.otHours],
                ["Late Count", row.lateCount],
                ["Leave Days", row.leaveDaysUsed],
                ["Extra WD", row.extraWorkingDays],
              ].map(([label, val]) => (
                <div key={label} className="text-center bg-white rounded-lg py-1.5 px-2">
                  <div className="font-semibold text-slate-700">{val ?? 0}</div>
                  <div className="text-slate-400 leading-tight">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 pb-6">
          <Button onClick={() => window.print()} variant="outline" className="w-full rounded-2xl">Print Payslip</Button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function PayrollAutomation({ role }) {
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [employees, setEmployees] = useState([]);
  const [loans, setLoans] = useState([]);
  const [payrollRows, setPayrollRows] = useState([]);
  const [payrollStatus, setPayrollStatus] = useState("Draft");
  const [generating, setGenerating] = useState(false);
  const [selectedPayslip, setSelectedPayslip] = useState(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  // Commission add-ons: { [employeeCode]: number } — editable per employee per month
  const [commissionAddOns, setCommissionAddOns] = useState({});

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
      // Restore any saved commission add-ons
      const saved = {};
      data.forEach(r => {
        if (r.commission_addon) saved[r.employee_code] = Number(r.commission_addon);
      });
      setCommissionAddOns(saved);
    } else {
      setPayrollRows([]);
    }
  }

  async function generatePayroll() {
    setGenerating(true); setErr(""); setMsg("");
    try {
      const fromDate = month + "-01";
      const [y, m] = month.split("-").map(Number);
      const toDate = `${y}-${String(m).padStart(2, "0")}-${new Date(y, m, 0).getDate()}`;
      const numberOfWorkingDays = getWorkingDaysInMonth(y, m);

      const { data: att } = await supabase.from("attendance").select("*")
        .gte("work_date", fromDate).lte("work_date", toDate);

      // Aggregate attendance per employee
      const attByEmp = {};
      (att || []).forEach(a => {
        const c = a.employee_code;
        if (!attByEmp[c]) attByEmp[c] = {
          presentDays: 0, absentDays: 0, halfDays: 0,
          lateCount: 0, otHours: 0, extraWorkingDays: 0, leaveDaysUsed: 0,
          numberOfWorkingDays,
        };
        const s = a.attendance_status || a.status || "";
        const dow = a.work_date ? new Date(a.work_date).getDay() : -1;

        if (s === "Absent") {
          attByEmp[c].absentDays++;
        } else if (s === "Half Day" || s === "HalfDay") {
          attByEmp[c].presentDays++;
          attByEmp[c].halfDays++;
        } else if (s === "Leave") {
          attByEmp[c].leaveDaysUsed++;
        } else {
          attByEmp[c].presentDays++;
          // Count Sunday/holiday as extra working day
          if (dow === 0) attByEmp[c].extraWorkingDays++;
        }
        if (Number(a.late_minutes || 0) > 0) attByEmp[c].lateCount++;
        attByEmp[c].otHours += Number(a.ot_hours || a.overtime_hours || 0);
      });

      const rows = employees.map(emp => {
        const empMapped = {
          id: emp.employee_code, name: emp.full_name, branch: emp.branch,
          dept: emp.department, level: emp.staff_level || "Non-Management",
          salary: emp.salary || 0, status: emp.status, joiningDate: emp.joining_date,
        };
        const adj = {
          ...(attByEmp[emp.employee_code] || { numberOfWorkingDays }),
          commissionAddOn: commissionAddOns[emp.employee_code] || 0,
        };
        const loanRows = [];
        const loanMatch = (loans || []).find(l =>
          l.employee_code === emp.employee_code || l.employee_id === emp.employee_code
        );
        if (loanMatch) loanRows.push({ employeeCode: emp.employee_code, monthly: Number(loanMatch.monthly_deduction || 0) });
        return calculatePayrollForEmployee(empMapped, adj, loanRows, [], month);
      });

      // Build DB payload with all new columns
      const payloadRows = rows.map(r => ({
        employee_code: r.employeeCode,
        employee_name: r.name,
        payroll_month: month,
        gross_salary: r.gross,
        number_of_working_days: r.numberOfWorkingDays,
        present_days: r.presentDays,
        absent_days: r.absentDays,
        ot_hours: r.otHours,
        late_count: r.lateCount,
        leave_days_used: r.leaveDaysUsed,
        extra_working_days: r.extraWorkingDays,
        // Earnings
        ot_amount: r.overtimeAmount,
        commission_addon: r.commissionAddOn,
        arrears: r.arrears,
        absent_adjustment: r.absentAdjustment,
        fuel_allowance: r.fuelAllowance,
        other_amount: r.otherAmount,
        extra_working_days_amount: r.extraWorkingDaysAmount,
        total_earnings: r.totalEarnings,
        // Deductions
        late_deduction: r.lateDeduction,
        short_hour_deduction: r.shortHourDeduction,
        absent_deduction: r.absentDeduction,
        half_day_deduction: r.halfDayDeduction,
        fines: r.fines,
        advance: r.advance,
        loan_deduction: r.loanDeduction,
        tax_deduction: r.taxDeduction,
        eobi_deduction: r.eobiDeduction,
        other_deductions: r.otherDeductions,
        total_deductions: r.totalDeductions,
        // Summary
        net_salary: r.finalSalary,
        status: "Draft",
        generated_at: new Date().toISOString(),
      }));

      await supabase.from("payroll").delete().eq("payroll_month", month);
      if (payloadRows.length > 0) {
        const { error } = await supabase.from("payroll").insert(payloadRows);
        if (error) {
          // Fall back to original columns if new columns don't exist yet
          const minimalRows = payloadRows.map(r => ({
            employee_code: r.employee_code, employee_name: r.employee_name,
            payroll_month: r.payroll_month, gross_salary: r.gross_salary,
            absent_deduction: r.absent_deduction, late_deduction: r.late_deduction,
            ot_amount: r.ot_amount, loan_deduction: r.loan_deduction,
            net_salary: r.net_salary, status: r.status, generated_at: r.generated_at,
          }));
          await supabase.from("payroll").insert(minimalRows);
        }
      }

      setPayrollRows(rows);
      setPayrollStatus("Draft");
      setMsg(`Payroll generated for ${rows.length} employees.`);
    } catch (e) {
      setErr(e.message);
    } finally {
      setGenerating(false);
    }
  }

  async function handleCommissionChange(code, value) {
    const num = Number(value) || 0;
    setCommissionAddOns(prev => ({ ...prev, [code]: num }));
    // Try to persist — will silently fail if column doesn't exist yet
    try {
      await supabase.from("payroll")
        .update({ commission_addon: num })
        .eq("payroll_month", month)
        .eq("employee_code", code);
    } catch (_) {}
  }

  async function updateStatus(newStatus) {
    if (newStatus === "Approved" && role !== "Master" && role !== "Finance")
      return setErr("Only Master/Finance can approve payroll.");
    await supabase.from("payroll").update({ status: newStatus }).eq("payroll_month", month);
    setPayrollStatus(newStatus);
    setMsg(`Payroll marked as ${newStatus}.`);
  }

  function exportExcel() {
    const rows = displayRows.map(r => ({
      "Employee Code": r.employeeCode,
      "Name": r.name,
      "Level": r.level,
      // Info
      "Working Days": r.numberOfWorkingDays,
      "Days Present": r.presentDays,
      "Days Absent": r.absentDays,
      "OT Hours": r.otHours,
      "Late Count": r.lateCount,
      "Leave Days Used": r.leaveDaysUsed,
      "Extra Working Days": r.extraWorkingDays,
      // Earnings
      "Basic Salary": r.basicSalary,
      "Overtime Amount": r.overtimeAmount,
      "Commission Add-On": r.commissionAddOn,
      "Arrears": r.arrears,
      "Absent Adjustment": r.absentAdjustment,
      "Fuel Allowance": r.fuelAllowance,
      "Other Amount": r.otherAmount,
      "Extra Working Days Amount": r.extraWorkingDaysAmount,
      "Total Earnings": r.totalEarnings,
      // Deductions
      "Late Deduction": r.lateDeduction,
      "Short Hour Deduction": r.shortHourDeduction,
      "Absent Deduction": r.absentDeduction,
      "Half Day Deduction": r.halfDayDeduction,
      "Fines": r.fines,
      "Advance": r.advance,
      "Loan Deduction": r.loanDeduction,
      "Tax Deduction": r.taxDeduction,
      "EOBI Deduction": r.eobiDeduction,
      "Other Deductions": r.otherDeductions,
      "Total Deductions": r.totalDeductions,
      // Summary
      "Net Pay": r.finalSalary,
      "Status": r.status || payrollStatus,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Payroll");
    XLSX.writeFile(wb, `payroll_${month}.xlsx`);
  }

  // Normalise DB rows (snake_case) or calculated rows (camelCase) into a unified shape.
  // Also applies live commissionAddOn overrides.
  const displayRows = useMemo(() => payrollRows.map(r => {
    const code = r.employeeCode || r.employee_code;

    const basicSalary          = r.gross || r.gross_salary || 0;
    const overtimeAmount       = r.overtimeAmount || r.ot_amount || 0;
    const commissionAddOn      = commissionAddOns[code] ?? (r.commissionAddOn || r.commission_addon || 0);
    const arrears              = r.arrears || 0;
    const absentAdjustment     = r.absentAdjustment || r.absent_adjustment || 0;
    const fuelAllowance        = r.fuelAllowance || r.fuel_allowance || r.fuel || 0;
    const otherAmount          = r.otherAmount || r.other_amount || 0;
    const extraWorkingDaysAmount = r.extraWorkingDaysAmount || r.extra_working_days_amount || 0;

    const totalEarnings = basicSalary + overtimeAmount + commissionAddOn + arrears +
      absentAdjustment + fuelAllowance + otherAmount + extraWorkingDaysAmount;

    const lateDeduction        = r.lateDeduction || r.late_deduction || 0;
    const shortHourDeduction   = r.shortHourDeduction || r.short_hour_deduction || 0;
    const absentDeduction      = r.absentDeduction || r.absent_deduction || 0;
    const halfDayDeduction     = r.halfDayDeduction || r.half_day_deduction || 0;
    const fines                = r.fines || 0;
    const advance              = r.advance || 0;
    const loanDeduction        = r.loanDeduction || r.loan_deduction || 0;
    const taxDeduction         = r.taxDeduction || r.tax_deduction || 0;
    const eobiDeduction        = r.eobiDeduction || r.eobi_deduction || 250;
    const otherDeductions      = r.otherDeductions || r.other_deductions || 0;

    const totalDeductions = lateDeduction + shortHourDeduction + absentDeduction +
      halfDayDeduction + fines + advance + loanDeduction + taxDeduction + eobiDeduction + otherDeductions;

    return {
      employeeCode: code,
      name: r.name || r.employee_name,
      level: r.level || "—",
      status: r.status || payrollStatus,
      numberOfWorkingDays:  r.numberOfWorkingDays || r.number_of_working_days || 0,
      presentDays:          r.presentDays || r.present_days || 0,
      absentDays:           r.absentDays || r.absent_days || 0,
      otHours:              r.otHours || r.ot_hours || 0,
      lateCount:            r.lateCount || r.late_count || 0,
      leaveDaysUsed:        r.leaveDaysUsed || r.leave_days_used || 0,
      extraWorkingDays:     r.extraWorkingDays || r.extra_working_days || 0,
      // Earnings
      basicSalary, overtimeAmount, commissionAddOn, arrears,
      absentAdjustment, fuelAllowance, otherAmount, extraWorkingDaysAmount, totalEarnings,
      // Deductions
      lateDeduction, shortHourDeduction, absentDeduction, halfDayDeduction,
      fines, advance, loanDeduction, taxDeduction, eobiDeduction, otherDeductions, totalDeductions,
      // Summary
      finalSalary: totalEarnings - totalDeductions,
      gross: basicSalary,
    };
  }), [payrollRows, commissionAddOns, payrollStatus]);

  const totals = useMemo(() => displayRows.reduce((s, r) => ({
    employees: s.employees + 1,
    totalEarnings: s.totalEarnings + r.totalEarnings,
    totalDeductions: s.totalDeductions + r.totalDeductions,
    netPay: s.netPay + r.finalSalary,
  }), { employees: 0, totalEarnings: 0, totalDeductions: 0, netPay: 0 }), [displayRows]);

  const TH = ({ children, className = "" }) => (
    <th className={`text-left px-3 py-3 font-medium text-xs whitespace-nowrap ${className}`}>{children}</th>
  );
  const TD = ({ children, className = "" }) => (
    <td className={`px-3 py-3 text-sm whitespace-nowrap ${className}`}>{children}</td>
  );

  return (
    <div>
      <PayslipModal row={selectedPayslip} month={month} onClose={() => setSelectedPayslip(null)} />
      <PageTitle title="Payroll Processing" subtitle="Auto-calculate payroll from attendance and policy." />

      {/* Controls */}
      <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <p className="text-xs text-slate-500 mb-1">Payroll Month</p>
            <input type="month" value={month} onChange={e => setMonth(e.target.value)}
              className="px-4 py-2 rounded-xl border border-slate-200 text-sm" />
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

      {/* Summary Cards */}
      {displayRows.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
            <p className="text-xs text-slate-500">Employees</p>
            <p className="text-2xl font-bold">{totals.employees}</p>
          </div>
          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
            <p className="text-xs text-slate-500">Total Earnings</p>
            <p className="text-2xl font-bold text-emerald-600">{money(totals.totalEarnings)}</p>
          </div>
          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
            <p className="text-xs text-slate-500">Total Deductions</p>
            <p className="text-2xl font-bold text-red-500">{money(totals.totalDeductions)}</p>
          </div>
          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
            <p className="text-xs text-slate-500">Net Payroll</p>
            <p className="text-2xl font-bold text-slate-900">{money(totals.netPay)}</p>
          </div>
        </div>
      )}

      {/* Payroll Register Table */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
        <div className="px-5 pt-4 pb-2 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-slate-800">Payroll Register — {month}</h2>
            <p className="text-xs text-slate-400 mt-0.5">{displayRows.length} employees · Commission Add-On column is editable</p>
          </div>
        </div>

        <table className="w-full text-sm" style={{ minWidth: "2400px" }}>
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              {/* Identity */}
              <TH>Employee</TH>
              <TH>Level</TH>
              {/* Attendance Info */}
              <TH className="text-blue-500">WD</TH>
              <TH className="text-blue-500">Present</TH>
              <TH className="text-blue-500">Absent</TH>
              <TH className="text-blue-500">OT Hrs</TH>
              <TH className="text-blue-500">Extra WD</TH>
              {/* Earnings */}
              <TH className="text-emerald-600">Basic</TH>
              <TH className="text-emerald-600">OT Amt</TH>
              <TH className="text-emerald-600">Comm+</TH>
              <TH className="text-emerald-600">Arrears</TH>
              <TH className="text-emerald-600">Fuel</TH>
              <TH className="text-emerald-600">Other</TH>
              <TH className="text-emerald-600">ExtraWD Amt</TH>
              <TH className="text-emerald-700 bg-emerald-50">Total Earn</TH>
              {/* Deductions */}
              <TH className="text-red-500">Late Ded</TH>
              <TH className="text-red-500">ShortHr</TH>
              <TH className="text-red-500">Absent Ded</TH>
              <TH className="text-red-500">Half Day</TH>
              <TH className="text-red-500">Fines</TH>
              <TH className="text-red-500">Advance</TH>
              <TH className="text-red-500">Loan</TH>
              <TH className="text-red-500">Tax</TH>
              <TH className="text-red-500">EOBI</TH>
              <TH className="text-red-500">Other Ded</TH>
              <TH className="text-red-700 bg-red-50">Total Ded</TH>
              {/* Net */}
              <TH className="text-slate-900 bg-slate-100">Net Pay</TH>
              <TH>Payslip</TH>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {displayRows.length === 0 ? (
              <tr>
                <td colSpan={29} className="px-4 py-8 text-center text-slate-400">
                  No payroll data. Click "Generate Payroll" to calculate.
                </td>
              </tr>
            ) : displayRows.map((r, i) => (
              <tr key={i} className="hover:bg-slate-50">
                {/* Identity */}
                <TD>
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs text-slate-400">{r.employeeCode}</div>
                </TD>
                <TD>{r.level}</TD>
                {/* Attendance */}
                <TD className="text-blue-600">{r.numberOfWorkingDays}</TD>
                <TD className="text-blue-600">{r.presentDays}</TD>
                <TD className="text-blue-600">{r.absentDays}</TD>
                <TD className="text-blue-600">{r.otHours}</TD>
                <TD className="text-blue-600">{r.extraWorkingDays}</TD>
                {/* Earnings */}
                <TD>{money(r.basicSalary)}</TD>
                <TD className="text-emerald-600">{money(r.overtimeAmount)}</TD>
                {/* Commission Add-On — editable */}
                <TD>
                  <input
                    type="number"
                    min="0"
                    value={commissionAddOns[r.employeeCode] ?? r.commissionAddOn ?? 0}
                    onChange={e => handleCommissionChange(r.employeeCode, e.target.value)}
                    className="w-24 border border-slate-200 rounded-lg px-2 py-1 text-right text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
                    title="Commission Add-On (editable)"
                  />
                </TD>
                <TD className="text-emerald-600">{money(r.arrears)}</TD>
                <TD className="text-emerald-600">{money(r.fuelAllowance)}</TD>
                <TD className="text-emerald-600">{money(r.otherAmount)}</TD>
                <TD className="text-emerald-600">{money(r.extraWorkingDaysAmount)}</TD>
                <TD className="font-semibold text-emerald-700 bg-emerald-50">{money(r.totalEarnings)}</TD>
                {/* Deductions */}
                <TD className="text-red-500">{r.lateDeduction ? money(r.lateDeduction) : "—"}</TD>
                <TD className="text-red-500">{r.shortHourDeduction ? money(r.shortHourDeduction) : "—"}</TD>
                <TD className="text-red-500">{r.absentDeduction ? money(r.absentDeduction) : "—"}</TD>
                <TD className="text-red-500">{r.halfDayDeduction ? money(r.halfDayDeduction) : "—"}</TD>
                <TD className="text-red-500">{r.fines ? money(r.fines) : "—"}</TD>
                <TD className="text-red-500">{r.advance ? money(r.advance) : "—"}</TD>
                <TD className="text-red-500">{r.loanDeduction ? money(r.loanDeduction) : "—"}</TD>
                <TD className="text-red-500">{r.taxDeduction ? money(r.taxDeduction) : "—"}</TD>
                <TD className="text-red-500">{money(r.eobiDeduction)}</TD>
                <TD className="text-red-500">{r.otherDeductions ? money(r.otherDeductions) : "—"}</TD>
                <TD className="font-semibold text-red-700 bg-red-50">{money(r.totalDeductions)}</TD>
                {/* Net */}
                <TD className="font-bold text-slate-900 bg-slate-50 text-right">{money(r.finalSalary)}</TD>
                <TD>
                  <Button variant="outline" onClick={() => setSelectedPayslip(r)} className="rounded-xl text-xs py-1 px-3">
                    View
                  </Button>
                </TD>
              </tr>
            ))}
          </tbody>
          {/* Totals footer */}
          {displayRows.length > 0 && (
            <tfoot className="bg-slate-100 font-semibold text-slate-700">
              <tr>
                <TD colSpan={7} className="font-bold">Totals ({totals.employees} employees)</TD>
                <TD>{money(totals.totalEarnings - displayRows.reduce((s, r) => s + (r.totalEarnings - r.basicSalary), 0))}</TD>
                <TD>{money(displayRows.reduce((s, r) => s + r.overtimeAmount, 0))}</TD>
                <TD>{money(displayRows.reduce((s, r) => s + r.commissionAddOn, 0))}</TD>
                <TD>{money(displayRows.reduce((s, r) => s + r.arrears, 0))}</TD>
                <TD>{money(displayRows.reduce((s, r) => s + r.fuelAllowance, 0))}</TD>
                <TD>{money(displayRows.reduce((s, r) => s + r.otherAmount, 0))}</TD>
                <TD>{money(displayRows.reduce((s, r) => s + r.extraWorkingDaysAmount, 0))}</TD>
                <TD className="text-emerald-700 bg-emerald-50">{money(totals.totalEarnings)}</TD>
                <TD>{money(displayRows.reduce((s, r) => s + r.lateDeduction, 0))}</TD>
                <TD>{money(displayRows.reduce((s, r) => s + r.shortHourDeduction, 0))}</TD>
                <TD>{money(displayRows.reduce((s, r) => s + r.absentDeduction, 0))}</TD>
                <TD>{money(displayRows.reduce((s, r) => s + r.halfDayDeduction, 0))}</TD>
                <TD>{money(displayRows.reduce((s, r) => s + r.fines, 0))}</TD>
                <TD>{money(displayRows.reduce((s, r) => s + r.advance, 0))}</TD>
                <TD>{money(displayRows.reduce((s, r) => s + r.loanDeduction, 0))}</TD>
                <TD>{money(displayRows.reduce((s, r) => s + r.taxDeduction, 0))}</TD>
                <TD>{money(displayRows.reduce((s, r) => s + r.eobiDeduction, 0))}</TD>
                <TD>{money(displayRows.reduce((s, r) => s + r.otherDeductions, 0))}</TD>
                <TD className="text-red-700 bg-red-50">{money(totals.totalDeductions)}</TD>
                <TD className="text-slate-900 bg-slate-100">{money(totals.netPay)}</TD>
                <TD />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
