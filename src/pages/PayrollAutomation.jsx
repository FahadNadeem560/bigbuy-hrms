import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { Button, Badge, PageTitle } from "../components/ui.jsx";
import { money } from "../utils/format.js";
import { calculatePayrollForEmployee, getWorkingDaysInMonth } from "../utils/payrollRules.js";
import * as XLSX from "xlsx";

const STATUS_TONES = { Draft: "yellow", Approved: "blue", Published: "green", Locked: "purple", Paid: "green" };

// ── Publish confirmation modal ────────────────────────────────
function PublishModal({ month, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="text-2xl mb-3">⚠️</div>
        <h2 className="font-bold text-slate-800 text-lg mb-2">Publish Payroll</h2>
        <p className="text-slate-600 text-sm mb-4">
          You are about to publish payroll for <strong>{month}</strong>.<br /><br />
          After publishing:
        </p>
        <ul className="text-sm text-slate-600 space-y-1 mb-5 list-disc pl-5">
          <li>No changes can be made by HR</li>
          <li>Payroll will be visible to Finance</li>
          <li>Only Master can approve any corrections</li>
        </ul>
        <p className="text-sm font-semibold text-slate-800 mb-4">Are you absolutely sure?</p>
        <div className="flex gap-3">
          <Button onClick={onConfirm} className="rounded-2xl flex-1 bg-emerald-600 hover:bg-emerald-700">Yes, Publish</Button>
          <Button variant="outline" onClick={onCancel} className="rounded-2xl flex-1">Cancel</Button>
        </div>
      </div>
    </div>
  );
}

// ── Payslip Modal ─────────────────────────────────────────────
function PayslipModal({ row, month, onClose }) {
  if (!row) return null;
  const ERow = ({ label, value }) => value ? (
    <div className="flex justify-between py-1.5 border-b border-slate-100">
      <span className="text-slate-500 text-sm">{label}</span>
      <span className="text-sm text-emerald-700">{money(value)}</span>
    </div>
  ) : null;
  const DRow = ({ label, value }) => value ? (
    <div className="flex justify-between py-1.5 border-b border-slate-100">
      <span className="text-slate-500 text-sm">{label}</span>
      <span className="text-sm text-red-500">– {money(value)}</span>
    </div>
  ) : null;
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white rounded-t-2xl px-6 pt-6 pb-3 border-b border-slate-100 flex justify-between items-start">
          <div>
            <h2 className="font-bold text-slate-800 text-lg">Payslip — {month}</h2>
            <p className="text-sm text-slate-500">{row.name} · {row.employeeCode}</p>
            {row.level && <p className="text-xs text-slate-400 mt-0.5">{row.level}</p>}
            {row.isAttendanceExempt && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full mt-1 inline-block">EXEMPTED</span>}
          </div>
          <Button variant="outline" onClick={onClose} className="rounded-xl text-xs">Close</Button>
        </div>
        <div className="px-6 py-4 space-y-5">
          {/* Attendance Summary */}
          <div className="bg-blue-50 rounded-xl px-4 py-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-blue-400 mb-2">Attendance Summary</h3>
            <div className="grid grid-cols-3 gap-2 text-xs">
              {[["Working Days", row.numberOfWorkingDays], ["Present", row.presentDays], ["Absent", row.absentDays],
                ["Leave Days", row.leaveDaysUsed], ["Extra WD", row.extraWorkingDays], ["OT Hours", row.otHours]
              ].map(([l, v]) => (
                <div key={l} className="text-center bg-white rounded-lg py-1.5 px-2">
                  <div className="font-semibold text-slate-700">{v ?? 0}</div>
                  <div className="text-slate-400 leading-tight">{l}</div>
                </div>
              ))}
            </div>
          </div>
          {/* Earnings */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Earnings</h3>
            <ERow label="Basic Salary" value={row.basicSalary} />
            <ERow label="Extra Working Days Amount" value={row.extraWorkingDaysAmount} />
            <ERow label="OT Amount" value={row.overtimeAmount} />
            <ERow label="Commission" value={row.commission} />
            <ERow label="Commission Add-On" value={row.commissionAddOn} />
            <ERow label="Fuel Allowance" value={row.fuelAllowance} />
            <ERow label="Other Earnings" value={row.otherEarnings} />
            <div className="flex justify-between py-2 mt-1 bg-emerald-50 rounded-xl px-3">
              <span className="font-bold text-sm text-emerald-800">Total Earnings</span>
              <span className="font-bold text-sm text-emerald-800">{money(row.totalEarnings)}</span>
            </div>
          </div>
          {/* Deductions */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Deductions</h3>
            <DRow label="Late Deduction" value={row.lateDeduction} />
            <DRow label="Short Hour Deduction" value={row.shortHourDeduction} />
            <DRow label="Fine" value={row.fineDeduction} />
            <DRow label="Shortage" value={row.shortageDeduction} />
            <DRow label="Advance (Same Month)" value={row.advanceDeduction} />
            <DRow label="Loan Installment" value={row.loanDeduction} />
            <DRow label="Income Tax" value={row.taxDeduction} />
            <DRow label="EOBI" value={row.eobiDeduction} />
            <DRow label="Other Deductions" value={row.otherDeductions} />
            <div className="flex justify-between py-2 mt-1 bg-red-50 rounded-xl px-3">
              <span className="font-bold text-sm text-red-800">Total Deductions</span>
              <span className="font-bold text-sm text-red-800">– {money(row.totalDeductions)}</span>
            </div>
          </div>
          {/* Net Pay */}
          <div className="bg-slate-50 rounded-xl px-4 py-4 flex justify-between items-center">
            <span className="font-bold text-base text-slate-900">Net Pay</span>
            <span className="font-bold text-xl text-slate-900">{money(row.finalSalary)}</span>
          </div>
        </div>
        <div className="px-6 pb-6"><Button onClick={() => window.print()} variant="outline" className="w-full rounded-2xl">Print Payslip</Button></div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────
export default function PayrollAutomation({ role }) {
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [employees, setEmployees] = useState([]);
  const [loans, setLoans] = useState([]);
  const [payrollRows, setPayrollRows] = useState([]);
  const [payrollStatus, setPayrollStatus] = useState("Draft");
  const [publishedBy, setPublishedBy] = useState("");
  const [publishedAt, setPublishedAt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [selectedPayslip, setSelectedPayslip] = useState(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [commissionAddOns, setCommissionAddOns] = useState({});

  const isPublished = payrollStatus === "Published" || payrollStatus === "Locked";
  const canGenerate = ["Master", "HR"].includes(role) && !isPublished;
  const canRefresh  = ["Master", "HR"].includes(role) && !isPublished;
  const canPublish  = role === "Master" && !isPublished && payrollRows.length > 0;
  const canApprove  = role === "Master" && payrollStatus === "Draft";

  // Finance only sees Published payroll
  const financeBlocked = role === "Finance" && !isPublished;

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
      setPublishedBy(data[0]?.published_by || "");
      setPublishedAt(data[0]?.published_at || "");
      const saved = {};
      data.forEach(r => { if (r.commission_addon) saved[r.employee_code] = Number(r.commission_addon); });
      setCommissionAddOns(saved);
    } else {
      setPayrollRows([]);
      setPayrollStatus("Draft");
      setPublishedBy(""); setPublishedAt("");
    }
  }

  async function buildPayrollRows() {
    const fromDate = month + "-01";
    const [y, m] = month.split("-").map(Number);
    const toDate = `${y}-${String(m).padStart(2, "0")}-${new Date(y, m, 0).getDate()}`;
    const numberOfWorkingDays = getWorkingDaysInMonth(y, m);

    const [{ data: att }, { data: finesData }, { data: shortagesData }, { data: advancesData }] = await Promise.all([
      supabase.from("attendance").select("*").gte("work_date", fromDate).lte("work_date", toDate),
      supabase.from("fines").select("*").eq("payroll_month", month).eq("status", "Approved"),
      supabase.from("shortages").select("*").eq("payroll_month", month).eq("status", "Approved"),
      supabase.from("advances").select("*").eq("payroll_month", month).eq("status", "Approved"),
    ]);

    // Aggregate attendance per employee
    const attByEmp = {};
    (att || []).forEach(a => {
      const c = a.employee_code;
      if (!attByEmp[c]) attByEmp[c] = {
        presentDays: 0, absentDays: 0, halfDays: 0,
        lateCount: 0, otHours: 0, extraWorkingDays: 0, leaveDaysUsed: 0, numberOfWorkingDays,
      };
      const s = a.attendance_status || a.status || "";
      const dow = a.work_date ? new Date(a.work_date).getDay() : -1;
      if (s === "Absent") { attByEmp[c].absentDays++; }
      else if (s === "Half Day" || s === "HalfDay") { attByEmp[c].presentDays++; attByEmp[c].halfDays++; }
      else if (s === "Leave") { attByEmp[c].leaveDaysUsed++; }
      else { attByEmp[c].presentDays++; if (dow === 0) attByEmp[c].extraWorkingDays++; }
      if (Number(a.late_minutes || 0) > 0) attByEmp[c].lateCount++;
      attByEmp[c].otHours += Number(a.ot_hours || a.overtime_hours || 0);
    });

    // Aggregate fines/shortages/advances per employee
    const fineByEmp = {};
    (finesData || []).forEach(f => {
      fineByEmp[f.employee_code] = (fineByEmp[f.employee_code] || 0) + Number(f.amount || 0);
    });
    const shortageByEmp = {};
    (shortagesData || []).forEach(s => {
      shortageByEmp[s.employee_code] = (shortageByEmp[s.employee_code] || 0) + Number(s.amount || 0);
    });
    const advanceByEmp = {};
    (advancesData || []).forEach(a => {
      advanceByEmp[a.employee_code] = (advanceByEmp[a.employee_code] || 0) + Number(a.approved_amount || 0);
    });

    const rows = employees.map(emp => {
      const empMapped = {
        id: emp.employee_code, name: emp.full_name, branch: emp.branch,
        dept: emp.department, level: emp.staff_level || "Non-Management",
        salary: emp.salary || 0, status: emp.status, joiningDate: emp.joining_date,
        isAttendanceExempt: !!emp.is_attendance_exempt,
      };
      const adj = {
        ...(attByEmp[emp.employee_code] || { numberOfWorkingDays }),
        commissionAddOn: commissionAddOns[emp.employee_code] || 0,
        fineDeduction: fineByEmp[emp.employee_code] || 0,
        shortageDeduction: shortageByEmp[emp.employee_code] || 0,
        advanceDeduction: advanceByEmp[emp.employee_code] || 0,
      };
      const loanRows = [];
      const loanMatch = (loans || []).find(l =>
        l.employee_code === emp.employee_code || l.employee_id === emp.employee_code
      );
      if (loanMatch) loanRows.push({ employeeCode: emp.employee_code, monthly: Number(loanMatch.monthly_deduction || 0) });
      return calculatePayrollForEmployee(empMapped, adj, loanRows, [], month);
    });

    return rows;
  }

  async function generatePayroll() {
    if (!canGenerate) return setErr("Access denied.");
    setGenerating(true); setErr(""); setMsg("");
    try {
      const rows = await buildPayrollRows();
      const payloadRows = buildPayloadRows(rows);
      await supabase.from("payroll").delete().eq("payroll_month", month);
      if (payloadRows.length > 0) {
        const { error } = await supabase.from("payroll").insert(payloadRows);
        if (error) {
          const minimal = payloadRows.map(r => ({
            employee_code: r.employee_code, employee_name: r.employee_name,
            payroll_month: r.payroll_month, gross_salary: r.gross_salary,
            net_salary: r.net_salary, status: r.status, generated_at: r.generated_at,
          }));
          await supabase.from("payroll").insert(minimal);
        }
      }
      setPayrollRows(rows);
      setPayrollStatus("Draft");
      setMsg(`Payroll generated for ${rows.length} employees.`);
    } catch (e) { setErr(e.message); }
    finally { setGenerating(false); }
  }

  async function refreshPayroll() {
    if (!canRefresh) return setErr("Access denied.");
    setRefreshing(true); setErr(""); setMsg("");
    try {
      const rows = await buildPayrollRows();
      const payloadRows = buildPayloadRows(rows);
      // Update existing payroll records (don't delete — preserve status)
      for (const r of payloadRows) {
        await supabase.from("payroll")
          .update({ ...r, generated_at: new Date().toISOString() })
          .eq("payroll_month", month)
          .eq("employee_code", r.employee_code);
      }
      await loadPayroll();
      const ts = new Date().toLocaleTimeString("en-PK");
      setMsg(`Payroll refreshed for ${rows.length} employees at ${ts}.`);
    } catch (e) { setErr(e.message); }
    finally { setRefreshing(false); }
  }

  function buildPayloadRows(rows) {
    return rows.map(r => ({
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
      ot_amount: r.overtimeAmount,
      commission_addon: r.commissionAddOn,
      arrears: r.arrears,
      absent_adjustment: r.absentAdjustment,
      fuel_allowance: r.fuelAllowance,
      other_amount: r.otherEarnings,
      extra_working_days_amount: r.extraWorkingDaysAmount,
      total_earnings: r.totalEarnings,
      late_deduction: r.lateDeduction,
      short_hour_deduction: r.shortHourDeduction,
      absent_deduction: r.absentDeduction,
      half_day_deduction: r.halfDayDeduction,
      fines: r.fineDeduction,
      fine_deduction: r.fineDeduction,
      shortage_deduction: r.shortageDeduction,
      advance_deduction: r.advanceDeduction,
      advance: r.advanceDeduction,
      loan_deduction: r.loanDeduction,
      tax_deduction: r.taxDeduction,
      eobi_deduction: r.eobiDeduction,
      other_deductions: r.otherDeductions,
      total_deductions: r.totalDeductions,
      net_salary: r.finalSalary,
      status: "Draft",
      generated_at: new Date().toISOString(),
    }));
  }

  async function handleCommissionChange(code, value) {
    const num = Number(value) || 0;
    setCommissionAddOns(prev => ({ ...prev, [code]: num }));
    try {
      await supabase.from("payroll")
        .update({ commission_addon: num })
        .eq("payroll_month", month)
        .eq("employee_code", code);
    } catch (_) {}
  }

  async function updateStatus(newStatus) {
    if (newStatus === "Approved" && role !== "Master") return setErr("Only Master can approve payroll.");
    await supabase.from("payroll").update({ status: newStatus }).eq("payroll_month", month);
    setPayrollStatus(newStatus);
    setMsg(`Payroll marked as ${newStatus}.`);
  }

  async function publishPayroll() {
    const ts = new Date().toISOString();
    await supabase.from("payroll").update({
      status: "Published", published_by: role, published_at: ts,
    }).eq("payroll_month", month);
    setPayrollStatus("Published");
    setPublishedBy(role);
    setPublishedAt(ts);
    setShowPublishModal(false);
    setMsg(`Payroll published by ${role}.`);
  }

  function exportExcel() {
    const rows = displayRows.map(r => ({
      "Employee Code": r.employeeCode, "Name": r.name, "Level": r.level,
      "Working Days": r.numberOfWorkingDays, "Days Present": r.presentDays, "Days Absent": r.absentDays,
      "OT Hours": r.otHours, "Leave Days": r.leaveDaysUsed, "Extra Working Days": r.extraWorkingDays,
      "Basic Salary": r.basicSalary, "OT Amount": r.overtimeAmount, "Commission": r.commission,
      "Commission Add-On": r.commissionAddOn, "Fuel Allowance": r.fuelAllowance, "Other Earnings": r.otherEarnings,
      "Extra WD Amount": r.extraWorkingDaysAmount, "Total Earnings": r.totalEarnings,
      "Late Deduction": r.lateDeduction, "Short Hour Deduction": r.shortHourDeduction,
      "Absent Deduction": r.absentDeduction, "Fine": r.fineDeduction, "Shortage": r.shortageDeduction,
      "Advance": r.advanceDeduction, "Loan Deduction": r.loanDeduction,
      "Tax": r.taxDeduction, "EOBI": r.eobiDeduction, "Other Deductions": r.otherDeductions,
      "Total Deductions": r.totalDeductions, "Net Pay": r.finalSalary,
      "Status": r.status || payrollStatus,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Payroll");
    XLSX.writeFile(wb, `payroll_${month}.xlsx`);
  }

  const displayRows = useMemo(() => payrollRows.map(r => {
    const code = r.employeeCode || r.employee_code;
    const basicSalary          = r.gross || r.gross_salary || 0;
    const overtimeAmount       = r.overtimeAmount || r.ot_amount || 0;
    const commission           = r.commission || 0;
    const commissionAddOn      = commissionAddOns[code] ?? (r.commissionAddOn || r.commission_addon || 0);
    const fuelAllowance        = r.fuelAllowance || r.fuel_allowance || r.fuel || 0;
    const otherEarnings        = r.otherEarnings || r.other_earnings || r.otherAmount || r.other_amount || 0;
    const extraWorkingDaysAmount = r.extraWorkingDaysAmount || r.extra_working_days_amount || 0;
    const totalEarnings = basicSalary + overtimeAmount + commission + commissionAddOn +
      fuelAllowance + otherEarnings + extraWorkingDaysAmount +
      (r.arrears || 0) + (r.absentAdjustment || r.absent_adjustment || 0);

    const lateDeduction        = r.lateDeduction || r.late_deduction || 0;
    const shortHourDeduction   = r.shortHourDeduction || r.short_hour_deduction || 0;
    const absentDeduction      = r.absentDeduction || r.absent_deduction || 0;
    const halfDayDeduction     = r.halfDayDeduction || r.half_day_deduction || 0;
    const fineDeduction        = r.fineDeduction || r.fine_deduction || r.fines || 0;
    const shortageDeduction    = r.shortageDeduction || r.shortage_deduction || 0;
    const advanceDeduction     = r.advanceDeduction || r.advance_deduction || r.advance || 0;
    const loanDeduction        = r.loanDeduction || r.loan_deduction || 0;
    const taxDeduction         = r.taxDeduction || r.tax_deduction || 0;
    const eobiDeduction        = r.eobiDeduction || r.eobi_deduction || 250;
    const otherDeductions      = r.otherDeductions || r.other_deductions || 0;
    const totalDeductions = lateDeduction + shortHourDeduction + absentDeduction + halfDayDeduction +
      fineDeduction + shortageDeduction + advanceDeduction + loanDeduction + taxDeduction + eobiDeduction + otherDeductions;

    return {
      employeeCode: code, name: r.name || r.employee_name, level: r.level || "—",
      status: r.status || payrollStatus,
      isAttendanceExempt: !!(r.isAttendanceExempt || r.is_attendance_exempt),
      numberOfWorkingDays: r.numberOfWorkingDays || r.number_of_working_days || 0,
      presentDays: r.presentDays || r.present_days || 0,
      absentDays: r.absentDays || r.absent_days || 0,
      otHours: r.otHours || r.ot_hours || 0,
      lateCount: r.lateCount || r.late_count || 0,
      leaveDaysUsed: r.leaveDaysUsed || r.leave_days_used || 0,
      extraWorkingDays: r.extraWorkingDays || r.extra_working_days || 0,
      basicSalary, overtimeAmount, commission, commissionAddOn, fuelAllowance,
      otherEarnings, extraWorkingDaysAmount, totalEarnings,
      lateDeduction, shortHourDeduction, absentDeduction, halfDayDeduction,
      fineDeduction, shortageDeduction, advanceDeduction, loanDeduction,
      taxDeduction, eobiDeduction, otherDeductions, totalDeductions,
      finalSalary: totalEarnings - totalDeductions, gross: basicSalary,
      arrears: r.arrears || 0,
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

  // Finance blocked from Draft payroll
  if (financeBlocked) {
    return (
      <div>
        <PageTitle title="Payroll Processing" subtitle="Payroll for Finance view." />
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8 text-center">
          <p className="text-amber-700 font-medium text-lg">No Published Payroll</p>
          <p className="text-amber-600 text-sm mt-2">Finance can only view payroll after it has been Published by Master.</p>
          <div className="mt-4">
            <select value={month} onChange={e => setMonth(e.target.value)}
              className="px-4 py-2 rounded-xl border border-amber-200 text-sm bg-white">
              {Array.from({ length: 12 }, (_, i) => {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                return <option key={val} value={val}>{val}</option>;
              })}
            </select>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {showPublishModal && <PublishModal month={month} onConfirm={publishPayroll} onCancel={() => setShowPublishModal(false)} />}
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
            {isPublished && publishedBy && (
              <span className="text-xs text-slate-500">Published by {publishedBy} · {publishedAt?.slice(0, 10)}</span>
            )}
          </div>
          <div className="flex gap-2 mt-4 ml-auto flex-wrap">
            {canGenerate && (
              <Button onClick={generatePayroll} disabled={generating} className="rounded-2xl">
                {generating ? "Generating..." : "Generate Payroll"}
              </Button>
            )}
            {canRefresh && displayRows.length > 0 && (
              <Button onClick={refreshPayroll} disabled={refreshing} variant="outline" className="rounded-2xl">
                {refreshing ? "Refreshing..." : "↺ Refresh Payroll"}
              </Button>
            )}
            {canApprove && displayRows.length > 0 && (
              <Button variant="outline" onClick={() => updateStatus("Approved")} className="rounded-2xl">Approve</Button>
            )}
            {canPublish && (
              <Button onClick={() => setShowPublishModal(true)} className="rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white">
                Publish Payroll
              </Button>
            )}
            {displayRows.length > 0 && (
              <Button variant="outline" onClick={exportExcel} className="rounded-2xl">Export Excel</Button>
            )}
          </div>
        </div>
      </div>

      {isPublished && role !== "Finance" && (
        <div className="mb-3 p-3 rounded-xl bg-purple-50 text-purple-700 text-sm">
          🔒 Payroll is Published. HR cannot make changes. Finance can view this payroll.
          {role === "Master" && " Master can still make corrections via the correction log."}
        </div>
      )}

      {msg && <div className="mb-3 p-3 rounded-xl bg-blue-50 text-blue-700 text-sm">{msg}</div>}
      {err && <div className="mb-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{err}</div>}

      {/* Summary Cards */}
      {displayRows.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm"><p className="text-xs text-slate-500">Employees</p><p className="text-2xl font-bold">{totals.employees}</p></div>
          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm"><p className="text-xs text-slate-500">Total Earnings</p><p className="text-2xl font-bold text-emerald-600">{money(totals.totalEarnings)}</p></div>
          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm"><p className="text-xs text-slate-500">Total Deductions</p><p className="text-2xl font-bold text-red-500">{money(totals.totalDeductions)}</p></div>
          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm"><p className="text-xs text-slate-500">Net Payroll</p><p className="text-2xl font-bold text-slate-900">{money(totals.netPay)}</p></div>
        </div>
      )}

      {/* Payroll Register Table */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
        <div className="px-5 pt-4 pb-2 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-slate-800">Payroll Register — {month}</h2>
            <p className="text-xs text-slate-400 mt-0.5">{displayRows.length} employees</p>
          </div>
        </div>
        <table className="w-full text-sm" style={{ minWidth: "2800px" }}>
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <TH>Employee</TH><TH>Level</TH>
              {/* Attendance */}
              <TH className="text-blue-500">WD</TH><TH className="text-blue-500">Present</TH>
              <TH className="text-blue-500">Absent</TH><TH className="text-blue-500">Leave</TH>
              <TH className="text-blue-500">Extra WD</TH><TH className="text-blue-500">OT Hrs</TH>
              {/* Earnings */}
              <TH className="text-emerald-600">Basic</TH>
              <TH className="text-emerald-600">Extra WD Amt</TH>
              <TH className="text-emerald-600">OT Amt</TH>
              <TH className="text-emerald-600">Commission</TH>
              <TH className="text-emerald-600">Comm+</TH>
              <TH className="text-emerald-600">Fuel</TH>
              <TH className="text-emerald-600">Other Earn</TH>
              <TH className="text-emerald-700 bg-emerald-50">Total Earn</TH>
              {/* Deductions */}
              <TH className="text-red-500">Late Ded</TH>
              <TH className="text-red-500">ShortHr</TH>
              <TH className="text-red-500">Fine</TH>
              <TH className="text-red-500">Shortage</TH>
              <TH className="text-red-500">Advance</TH>
              <TH className="text-red-500">Loan</TH>
              <TH className="text-red-500">Tax</TH>
              <TH className="text-red-500">EOBI</TH>
              <TH className="text-red-500">Other Ded</TH>
              <TH className="text-red-700 bg-red-50">Total Ded</TH>
              <TH className="text-slate-900 bg-slate-100">Net Pay</TH>
              <TH>Payslip</TH>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {displayRows.length === 0 ? (
              <tr><td colSpan={31} className="px-4 py-8 text-center text-slate-400">
                {role === "Finance" ? "No published payroll for this month." : 'No payroll data. Click "Generate Payroll" to calculate.'}
              </td></tr>
            ) : displayRows.map((r, i) => (
              <tr key={i} className={`hover:bg-slate-50 ${r.isAttendanceExempt ? "bg-purple-50/30" : ""}`}>
                <TD>
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs text-slate-400">{r.employeeCode}</div>
                  {r.isAttendanceExempt && <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 rounded">EXEMPTED</span>}
                </TD>
                <TD>{r.level}</TD>
                {/* Attendance */}
                <TD className="text-blue-600">{r.numberOfWorkingDays}</TD>
                <TD className="text-blue-600">{r.presentDays}</TD>
                <TD className="text-blue-600">{r.absentDays}</TD>
                <TD className="text-blue-600">{r.leaveDaysUsed}</TD>
                <TD className="text-blue-600">{r.extraWorkingDays}</TD>
                <TD className="text-blue-600">{r.otHours}</TD>
                {/* Earnings */}
                <TD>{money(r.basicSalary)}</TD>
                <TD className="text-emerald-600">{r.extraWorkingDaysAmount ? money(r.extraWorkingDaysAmount) : "—"}</TD>
                <TD className="text-emerald-600">{r.overtimeAmount ? money(r.overtimeAmount) : "—"}</TD>
                <TD className="text-emerald-600">{r.commission ? money(r.commission) : "—"}</TD>
                <TD>
                  {isPublished ? (
                    <span>{commissionAddOns[r.employeeCode] ?? r.commissionAddOn ?? 0 ? money(commissionAddOns[r.employeeCode] ?? r.commissionAddOn) : "—"}</span>
                  ) : (
                    <input type="number" min="0"
                      value={commissionAddOns[r.employeeCode] ?? r.commissionAddOn ?? 0}
                      onChange={e => handleCommissionChange(r.employeeCode, e.target.value)}
                      className="w-24 border border-slate-200 rounded-lg px-2 py-1 text-right text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
                      disabled={role === "Finance"} />
                  )}
                </TD>
                <TD className="text-emerald-600">{r.fuelAllowance ? money(r.fuelAllowance) : "—"}</TD>
                <TD className="text-emerald-600">{r.otherEarnings ? money(r.otherEarnings) : "—"}</TD>
                <TD className="font-semibold text-emerald-700 bg-emerald-50">{money(r.totalEarnings)}</TD>
                {/* Deductions */}
                <TD className="text-red-500">{r.lateDeduction ? money(r.lateDeduction) : "—"}</TD>
                <TD className="text-red-500">{r.shortHourDeduction ? money(r.shortHourDeduction) : "—"}</TD>
                <TD className="text-red-500">{r.fineDeduction ? money(r.fineDeduction) : "—"}</TD>
                <TD className="text-red-500">{r.shortageDeduction ? money(r.shortageDeduction) : "—"}</TD>
                <TD className="text-red-500">{r.advanceDeduction ? money(r.advanceDeduction) : "—"}</TD>
                <TD className="text-red-500">{r.loanDeduction ? money(r.loanDeduction) : "—"}</TD>
                <TD className="text-red-500">{r.taxDeduction ? money(r.taxDeduction) : "—"}</TD>
                <TD className="text-red-500">{money(r.eobiDeduction)}</TD>
                <TD className="text-red-500">{r.otherDeductions ? money(r.otherDeductions) : "—"}</TD>
                <TD className="font-semibold text-red-700 bg-red-50">{money(r.totalDeductions)}</TD>
                <TD className="font-bold text-slate-900 bg-slate-50 text-right">{money(r.finalSalary)}</TD>
                <TD>
                  <Button variant="outline" onClick={() => setSelectedPayslip(r)} className="rounded-xl text-xs py-1 px-3">View</Button>
                </TD>
              </tr>
            ))}
          </tbody>
          {displayRows.length > 0 && (
            <tfoot className="bg-slate-100 font-semibold text-slate-700">
              <tr>
                <TD colSpan={8} className="font-bold">Totals ({totals.employees} employees)</TD>
                <TD>{money(displayRows.reduce((s, r) => s + r.basicSalary, 0))}</TD>
                <TD>{money(displayRows.reduce((s, r) => s + r.extraWorkingDaysAmount, 0))}</TD>
                <TD>{money(displayRows.reduce((s, r) => s + r.overtimeAmount, 0))}</TD>
                <TD>{money(displayRows.reduce((s, r) => s + r.commission, 0))}</TD>
                <TD>{money(displayRows.reduce((s, r) => s + r.commissionAddOn, 0))}</TD>
                <TD>{money(displayRows.reduce((s, r) => s + r.fuelAllowance, 0))}</TD>
                <TD>{money(displayRows.reduce((s, r) => s + r.otherEarnings, 0))}</TD>
                <TD className="text-emerald-700 bg-emerald-50">{money(totals.totalEarnings)}</TD>
                <TD>{money(displayRows.reduce((s, r) => s + r.lateDeduction, 0))}</TD>
                <TD>{money(displayRows.reduce((s, r) => s + r.shortHourDeduction, 0))}</TD>
                <TD>{money(displayRows.reduce((s, r) => s + r.fineDeduction, 0))}</TD>
                <TD>{money(displayRows.reduce((s, r) => s + r.shortageDeduction, 0))}</TD>
                <TD>{money(displayRows.reduce((s, r) => s + r.advanceDeduction, 0))}</TD>
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
