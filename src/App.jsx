import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

const SUPABASE_URL = "https://rtazykuylyccptnayxgf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Zm7dA_mLxb8ci8r5loLryQ_NBx9WSoF";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const branchCodeMap = {
  Qayyumabad: "QAD",
  "PAF Faisal": "PAF",
  Korangi: "KOR",
  Clifton: "CLF",
};

const staffLevelPolicies = {
  Management: {
    label: "Management",
    defaultShiftStart: "10:30",
    defaultShiftEnd: "19:30",
    requiredHours: 9,
    breakMinutes: 60,
    graceMinutes: 30,
    halfDayLateMinutes: 120,
    halfDayEarlyOutMinutes: 120,
    latePenaltyCount: 3,
    latePenaltyDays: 0,
    overtimeEligible: false,
    overtimeAfterHours: 0,
    overtimeNeedsApproval: true,
    adjustShortHoursAgainstOT: false,
    noticeDays: 90,
  },
  "Floor Management": {
    label: "Floor Management",
    defaultShiftStart: "10:45",
    defaultShiftEnd: "21:15",
    requiredHours: 10.5,
    breakMinutes: 45,
    graceMinutes: 20,
    halfDayLateMinutes: 120,
    halfDayEarlyOutMinutes: 120,
    latePenaltyCount: 3,
    latePenaltyDays: 1,
    overtimeEligible: true,
    overtimeAfterHours: 10.5,
    overtimeNeedsApproval: true,
    adjustShortHoursAgainstOT: true,
    noticeDays: 45,
  },
  "Non-Management": {
    label: "Non-Management",
    defaultShiftStart: "10:45",
    defaultShiftEnd: "21:15",
    requiredHours: 10.5,
    breakMinutes: 45,
    graceMinutes: 15,
    halfDayLateMinutes: 90,
    halfDayEarlyOutMinutes: 90,
    latePenaltyCount: 3,
    latePenaltyDays: 1,
    overtimeEligible: true,
    overtimeAfterHours: 10.5,
    overtimeNeedsApproval: true,
    adjustShortHoursAgainstOT: true,
    noticeDays: 15,
  },
};

const loanPolicy = {
  minimumServiceYears: 2,
  maximumSalaryPercent: 90,
  maximumRepaymentMonths: 6,
  cooldownAfterRepaymentMonths: 12,
  requiresTwoGuarantors: true,
  requiresSurety: true,
};

const initialEmployees = [
  { id: "QAD-001", name: "Ali Raza", branch: "Qayyumabad", dept: "Grocery", designation: "Salesman", level: "Non-Management", type: "Permanent", salary: 42000, eobi: "Registered", status: "Active", phone: "0300-0000001", joiningDate: "2024-01-01" },
  { id: "PAF-001", name: "Hassan Khan", branch: "PAF Faisal", dept: "Cash Counter", designation: "Cashier", level: "Non-Management", type: "Permanent", salary: 48000, eobi: "Registered", status: "Active", phone: "0300-0000002", joiningDate: "2023-04-01" },
  { id: "QAD-002", name: "Noman Ahmed", branch: "Qayyumabad", dept: "Garments", designation: "Floor Supervisor", level: "Floor Management", type: "Permanent", salary: 65000, eobi: "Registered", status: "Active", phone: "0300-0000003", joiningDate: "2025-02-01" },
  { id: "PAF-002", name: "Shahzaib", branch: "PAF Faisal", dept: "Security", designation: "Guard", level: "Non-Management", type: "Contractor", salary: 0, eobi: "Contractor", status: "Active", phone: "0300-0000004", joiningDate: "2025-06-01" },
  { id: "QAD-003", name: "Usman Tariq", branch: "Qayyumabad", dept: "Crockery", designation: "Store Manager", level: "Management", type: "Permanent", salary: 90000, eobi: "Pending", status: "Active", phone: "0300-0000005", joiningDate: "2024-09-01" },
];

const demoRawPunches = [
  { employeeCode: "QAD-001", name: "Ali Raza", level: "Non-Management", date: "2026-04-01", checkIn: "10:52", checkOut: "21:40", branch: "Qayyumabad", shiftStart: "10:45", shiftEnd: "21:15" },
  { employeeCode: "QAD-001", name: "Ali Raza", level: "Non-Management", date: "2026-04-02", checkIn: "11:07", checkOut: "21:15", branch: "Qayyumabad", shiftStart: "10:45", shiftEnd: "21:15" },
  { employeeCode: "PAF-001", name: "Hassan Khan", level: "Non-Management", date: "2026-04-01", checkIn: "11:30", checkOut: "21:15", branch: "PAF Faisal", shiftStart: "10:45", shiftEnd: "21:15" },
  { employeeCode: "PAF-001", name: "Hassan Khan", level: "Non-Management", date: "2026-04-02", checkIn: "10:50", checkOut: "19:30", branch: "PAF Faisal", shiftStart: "10:45", shiftEnd: "21:15" },
  { employeeCode: "QAD-002", name: "Noman Ahmed", level: "Floor Management", date: "2026-04-01", checkIn: "10:58", checkOut: "22:00", branch: "Qayyumabad", shiftStart: "10:45", shiftEnd: "21:15" },
  { employeeCode: "QAD-003", name: "Usman Tariq", level: "Management", date: "2026-04-01", checkIn: "10:55", checkOut: "19:55", branch: "Qayyumabad", shiftStart: "10:30", shiftEnd: "19:30" },
];

const loans = [
  { name: "Ali Raza", employeeCode: "QAD-001", total: 25000, monthly: 2000, paid: 8000, balance: 17000, status: "Active" },
  { name: "Noman Ahmed", employeeCode: "QAD-002", total: 10000, monthly: 1000, paid: 3000, balance: 7000, status: "Active" },
];

const payrollAdjustments = {
  "QAD-001": { presentDays: 26, absentDays: 0, lateCount: 2, otHours: 8, commission: 1500, fuel: 0, arrears: 0, leaveAdjustment: 0 },
  "PAF-001": { presentDays: 25, absentDays: 0, lateCount: 4, otHours: 2, commission: 0, fuel: 2500, arrears: 0, leaveAdjustment: 0 },
  "QAD-002": { presentDays: 26, absentDays: 0, lateCount: 1, otHours: 10, commission: 2000, fuel: 0, arrears: 0, leaveAdjustment: 0 },
  "QAD-003": { presentDays: 24, absentDays: 2, lateCount: 0, otHours: 0, commission: 0, fuel: 0, arrears: 1000, leaveAdjustment: 0 },
};

const menu = [
  { key: "dashboard", label: "Dashboard", icon: "🏢", roles: ["Master", "HR", "Finance"] },
  { key: "employees", label: "Employees", icon: "👥", roles: ["Master", "HR"] },
  { key: "attendance", label: "Attendance", icon: "⏱️", roles: ["Master", "HR", "Finance", "Employee"] },
  { key: "zkt", label: "ZKT Live Sync", icon: "🛰️", roles: ["Master", "HR"] },
  { key: "audit", label: "Attendance Audit", icon: "🕵️", roles: ["Master", "HR"] },
  { key: "payroll", label: "Payroll", icon: "💰", roles: ["Master", "Finance"] },
  { key: "approval", label: "Salary Approval", icon: "🔒", roles: ["Master", "Finance"] },
  { key: "loans", label: "Loans", icon: "💳", roles: ["Master", "HR", "Finance", "Employee"] },
  { key: "portal", label: "Employee Portal", icon: "🧑‍💼", roles: ["Master", "Employee"] },
  { key: "reports", label: "Reports", icon: "📄", roles: ["Master", "HR", "Finance"] },
  { key: "imports", label: "Import Center", icon: "📥", roles: ["Master", "HR"] },
  { key: "exports", label: "Excel Export", icon: "📊", roles: ["Master", "HR", "Finance"] },
  { key: "policies", label: "Policy Rules", icon: "⚙️", roles: ["Master", "HR"] },
  { key: "users", label: "Users & Roles", icon: "🔐", roles: ["Master"] },
];

function Card({ className = "", children }) {
  return <div className={`bg-white ${className}`}>{children}</div>;
}

function CardContent({ className = "", children }) {
  return <div className={className}>{children}</div>;
}

function Button({ className = "", variant = "default", children, ...props }) {
  const style = variant === "outline"
    ? "border border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
    : variant === "secondary"
      ? "bg-white text-slate-950 hover:bg-slate-100"
      : "bg-slate-950 text-white hover:bg-slate-800";
  return (
    <button className={`inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed ${style} ${className}`} {...props}>
      {children}
    </button>
  );
}

function Badge({ children, tone = "default" }) {
  const tones = {
    green: "bg-emerald-50 text-emerald-700 border-emerald-100",
    red: "bg-red-50 text-red-700 border-red-100",
    yellow: "bg-amber-50 text-amber-700 border-amber-100",
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    slate: "bg-slate-50 text-slate-700 border-slate-100",
    purple: "bg-purple-50 text-purple-700 border-purple-100",
    default: "bg-slate-50 text-slate-700 border-slate-100",
  };
  return <span className={`px-3 py-1 rounded-full text-xs border whitespace-nowrap ${tones[tone]}`}>{children}</span>;
}

function Table({ headers, rows, renderRow }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-sm">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="bg-slate-50 text-slate-500"><tr>{headers.map((h) => <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100">{rows.map((row, i) => renderRow(row, i))}</tbody>
      </table>
    </div>
  );
}

function PageTitle({ title, subtitle, action }) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
      <div><h1 className="text-2xl md:text-3xl font-bold text-slate-950">{title}</h1><p className="text-slate-500 mt-1">{subtitle}</p></div>
      {action}
    </div>
  );
}

function StatCard({ title, value, sub, icon }) {
  return (
    <Card className="rounded-2xl shadow-sm border border-slate-100">
      <CardContent className="p-5 flex items-center justify-between gap-3">
        <div><p className="text-sm text-slate-500">{title}</p><h3 className="text-2xl font-bold mt-1 text-slate-900">{value}</h3><p className="text-xs text-slate-400 mt-1">{sub}</p></div>
        <span className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center text-2xl shrink-0">{icon}</span>
      </CardContent>
    </Card>
  );
}

function money(value) { return `Rs. ${Math.round(Number(value || 0)).toLocaleString()}`; }
function timeToMinutes(t) { if (!t || t === "-") return null; const [h, m] = t.split(":").map(Number); return h * 60 + m; }
function minutesToHours(min) { return Math.round((Number(min || 0) / 60) * 100) / 100; }

function getPolicyForLevel(level) {
  return staffLevelPolicies[level] || staffLevelPolicies["Non-Management"];
}

function processAttendancePunch(row) {
  const policy = getPolicyForLevel(row.level);
  const start = timeToMinutes(row.shiftStart || policy.defaultShiftStart);
  const end = timeToMinutes(row.shiftEnd || policy.defaultShiftEnd);
  const inMin = timeToMinutes(row.checkIn);
  const outMin = timeToMinutes(row.checkOut);
  const requiredMinutes = Number(policy.requiredHours || 10.5) * 60;

  if (inMin === null || outMin === null) {
    return { ...row, policyLevel: policy.label, requiredHours: policy.requiredHours, actualHours: 0, lateMinutes: 0, earlyOutMinutes: 0, shortHours: policy.requiredHours, overtimeHours: 0, status: "Absent", approval: "Auto", noticeDays: policy.noticeDays };
  }

  const actualMinutes = Math.max(0, outMin - inMin);
  const lateMinutes = Math.max(0, inMin - start - policy.graceMinutes);
  const earlyOutMinutes = Math.max(0, end - outMin);
  const shortMinutes = Math.max(0, requiredMinutes - actualMinutes);
  const overtimeMinutes = policy.overtimeEligible ? Math.max(0, actualMinutes - Number(policy.overtimeAfterHours || policy.requiredHours) * 60) : 0;

  let status = "Present";
  if (lateMinutes > policy.halfDayLateMinutes || earlyOutMinutes > policy.halfDayEarlyOutMinutes) status = "Half Day";
  else if (lateMinutes > 0) status = "Late";

  return { ...row, policyLevel: policy.label, requiredHours: policy.requiredHours, actualHours: minutesToHours(actualMinutes), lateMinutes, earlyOutMinutes, shortHours: minutesToHours(shortMinutes), overtimeHours: minutesToHours(overtimeMinutes), status, approval: overtimeMinutes > 0 && policy.overtimeNeedsApproval ? "OT Pending" : "Auto", noticeDays: policy.noticeDays };
}

function calculatePayrollForEmployee(employee, adjustments = {}, loanRows = []) {
  const policy = getPolicyForLevel(employee.level);
  const monthlySalary = Number(employee.salary || 0);
  const dailySalary = monthlySalary / 30;
  const hourlySalary = dailySalary / Number(policy.requiredHours || 10.5);
  const absentDeduction = dailySalary * Number(adjustments.absentDays || 0);
  const latePenaltyDays = Number(adjustments.lateCount || 0) >= Number(policy.latePenaltyCount || 3) ? Number(policy.latePenaltyDays || 0) : 0;
  const lateDeduction = dailySalary * latePenaltyDays;
  const overtimeAmount = policy.overtimeEligible ? hourlySalary * Number(adjustments.otHours || 0) : 0;
  const loanDeduction = loanRows.find((loan) => loan.employeeCode === employee.id)?.monthly || 0;
  const additions = Number(adjustments.commission || 0) + Number(adjustments.fuel || 0) + Number(adjustments.arrears || 0) + Number(adjustments.leaveAdjustment || 0) + overtimeAmount;
  const deductions = absentDeduction + lateDeduction + loanDeduction;

  return { employeeCode: employee.id, name: employee.name, branch: employee.branch, department: employee.dept, level: employee.level, gross: monthlySalary, presentDays: Number(adjustments.presentDays || 0), absentDays: Number(adjustments.absentDays || 0), lateCount: Number(adjustments.lateCount || 0), otHours: policy.overtimeEligible ? Number(adjustments.otHours || 0) : 0, absentDeduction, lateDeduction, overtimeAmount, commission: Number(adjustments.commission || 0), fuel: Number(adjustments.fuel || 0), arrears: Number(adjustments.arrears || 0), leaveAdjustment: Number(adjustments.leaveAdjustment || 0), loanDeduction, finalSalary: monthlySalary + additions - deductions, noticeDays: policy.noticeDays };
}

function checkLoanEligibility(employee, existingLoans = []) {
  const joiningDate = employee.joiningDate ? new Date(employee.joiningDate) : null;
  const today = new Date();
  const serviceYears = joiningDate ? (today - joiningDate) / (1000 * 60 * 60 * 24 * 365.25) : 0;
  const activeLoan = existingLoans.some((loan) => loan.employeeCode === employee.id && loan.status === "Active");
  const maximumLoan = Number(employee.salary || 0) * (loanPolicy.maximumSalaryPercent / 100);
  return { eligible: serviceYears >= loanPolicy.minimumServiceYears && !activeLoan, serviceYears: Math.floor(serviceYears * 10) / 10, maximumLoan, reason: serviceYears < loanPolicy.minimumServiceYears ? "Service below 2 years" : activeLoan ? "Active loan already exists" : "Eligible" };
}

function StatusBadge({ status }) {
  const tone = status === "Absent" ? "red" : status === "Late" ? "yellow" : status === "Half Day" ? "purple" : status === "Contractor" ? "blue" : "green";
  return <Badge tone={tone}>{status}</Badge>;
}

function normalizeHeader(value) {
  return String(value || "").trim().toLowerCase().replaceAll(" ", "_").replaceAll("-", "_");
}

function normalizeImportRow(row) {
  const clean = {};
  Object.entries(row || {}).forEach(([key, value]) => { clean[normalizeHeader(key)] = String(value ?? "").trim(); });
  return {
    employee_code: clean.employee_code || clean.employee_id || clean.id || "",
    name: clean.name || clean.full_name || clean.employee_name || "",
    designation: clean.designation || "",
    department: clean.department || clean.dept || "",
    branch: clean.branch || "",
    level: clean.level || clean.staff_level || "Non-Management",
    employee_type: clean.employee_type || clean.type || "Permanent",
    salary: clean.salary || clean.gross_salary || "",
    phone: clean.phone || clean.mobile || "",
    joining_date: clean.joining_date || clean.date_of_joining || "",
    eobi_status: clean.eobi_status || clean.eobi || "Pending",
    cnic: clean.cnic || "",
    shift: clean.shift || "",
  };
}

function validateEmployeeImportRows(rows, existingEmployees) {
  const validBranches = Object.keys(branchCodeMap);
  const validLevels = Object.keys(staffLevelPolicies);
  const existingCodes = new Set(existingEmployees.map((e) => e.id));
  const seenCodes = new Set();
  return rows.map((row, index) => {
    const errors = [];
    if (!row.name) errors.push("Name is required");
    if (!row.branch) errors.push("Branch is required");
    else if (!validBranches.includes(row.branch)) errors.push("Invalid branch");
    if (!validLevels.includes(row.level)) errors.push("Invalid level");
    if (!row.salary || Number.isNaN(Number(row.salary))) errors.push("Invalid salary");
    if (row.employee_code && existingCodes.has(row.employee_code)) errors.push("Employee ID already exists");
    if (row.employee_code && seenCodes.has(row.employee_code)) errors.push("Duplicate ID in file");
    if (row.employee_code) seenCodes.add(row.employee_code);
    return { ...row, rowNumber: index + 2, errors, valid: errors.length === 0 };
  });
}

function generateNextCode(branch, existingEmployees, reservedCodes = []) {
  const prefix = branchCodeMap[branch] || "EMP";
  const numbers = [...existingEmployees.map((e) => e.id), ...reservedCodes]
    .filter((id) => String(id || "").startsWith(`${prefix}-`))
    .map((id) => Number(String(id).split("-").pop()))
    .filter((value) => Number.isFinite(value));
  return `${prefix}-${String((numbers.length ? Math.max(...numbers) : 0) + 1).padStart(3, "0")}`;
}

async function readImportFile(file) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!["csv", "xls", "xlsx"].includes(extension)) throw new Error("Only CSV, XLS and XLSX files are allowed.");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
  if (!rows.length) throw new Error("The selected file has no employee records.");
  return rows.map(normalizeImportRow);
}

function downloadCSV(filename, rows) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => `"${String(r[h] ?? "").replaceAll('"', '""')}"`).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadTemplate(type) {
  const templates = {
    employees: [{ employee_code: "", name: "Ali Raza", designation: "Salesman", department: "Grocery", branch: "Qayyumabad", level: "Non-Management", employee_type: "Permanent", salary: 42000, phone: "03001234567", joining_date: "2026-04-01", eobi_status: "Pending", cnic: "42101-0000000-0", shift: "Shift A" }],
    attendance: [{ employee_code: "QAD-001", date: "2026-04-01", check_in: "10:45", check_out: "21:15", branch: "Qayyumabad", shift_start: "10:45", shift_end: "21:15" }],
    salary_adjustments: [{ employee_code: "QAD-001", commission: 0, fuel: 0, arrears: 0, bonus: 0, deduction: 0, remarks: "Monthly adjustment" }],
    loans: [{ employee_code: "QAD-001", loan_amount: 25000, monthly_deduction: 5000, start_date: "2026-04-01", months: 5, guarantor_1: "QAD-002", guarantor_2: "PAF-001", surety_details: "Asset / cheque / acceptable surety" }],
    leaves: [{ employee_code: "QAD-001", leave_type: "Casual", from_date: "2026-04-10", to_date: "2026-04-11", approved_by: "HR Manager", remarks: "Approved leave" }],
  };
  const rows = templates[type] || [];
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Template");
  XLSX.writeFile(wb, `${type}_template.xlsx`);
}

function printPayslip(row, month) {
  const html = `<html><head><title>Payslip ${row.employeeCode}</title><style>body{font-family:Arial;padding:30px}.box{border:1px solid #ddd;padding:20px;border-radius:12px}table{width:100%;border-collapse:collapse}td{padding:8px;border-bottom:1px solid #eee}.total{font-size:22px;font-weight:bold}</style></head><body><div class="box"><h1>The Big Buy Supermarket</h1><h2>Salary Slip - ${month}</h2><p><b>${row.name}</b> (${row.employeeCode})</p><p>${row.branch} - ${row.department}</p><table><tr><td>Gross Salary</td><td>${money(row.gross)}</td></tr><tr><td>Overtime</td><td>${money(row.overtimeAmount)}</td></tr><tr><td>Commission</td><td>${money(row.commission)}</td></tr><tr><td>Fuel/Arrears/Leave Adj.</td><td>${money(row.fuel + row.arrears + row.leaveAdjustment)}</td></tr><tr><td>Absent Deduction</td><td>${money(row.absentDeduction)}</td></tr><tr><td>Late Deduction</td><td>${money(row.lateDeduction)}</td></tr><tr><td>Loan Deduction</td><td>${money(row.loanDeduction)}</td></tr><tr><td class="total">Final Salary</td><td class="total">${money(row.finalSalary)}</td></tr></table><p style="margin-top:30px">This is a system generated payslip.</p></div></body></html>`;
  const w = window.open("", "_blank");
  w.document.write(html);
  w.document.close();
  w.print();
}

export default function BigBuyHRMS() {
  const [active, setActive] = useState("dashboard");
  const [currentUser, setCurrentUser] = useState({ name: "Fahad Nadeem", email: "master@thebigbuy.pk", role: "Master" });
  const [authLoading] = useState(false);
  const [role, setRole] = useState("Master");
  const [employeeList, setEmployeeList] = useState(initialEmployees);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [showEmployeeForm, setShowEmployeeForm] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [query, setQuery] = useState("");
  const [branch, setBranch] = useState("All");
  const [payrollMonth, setPayrollMonth] = useState("April 2026");
  const [payrollStatus, setPayrollStatus] = useState("Draft");
  const [selectedPayslip, setSelectedPayslip] = useState(null);
  const [zktConnected, setZktConnected] = useState(false);
  const [newEmployee, setNewEmployee] = useState({ branch: "Qayyumabad", fullName: "", designation: "", department: "", level: "Non-Management", salary: "", phone: "" });
  const [selectedImportFile, setSelectedImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [importError, setImportError] = useState("");

  const processedAttendance = useMemo(() => demoRawPunches.map(processAttendancePunch), []);
  const visibleMenu = menu.filter((item) => item.roles.includes(role));
  const filteredEmployees = employeeList.filter((e) => (branch === "All" || e.branch === branch) && `${e.name} ${e.id} ${e.dept} ${e.phone}`.toLowerCase().includes(query.toLowerCase()));
  const activeEmployees = employeeList.filter((e) => e.status === "Active");
  const generatedPayroll = activeEmployees.filter((e) => e.type !== "Contractor").map((e) => calculatePayrollForEmployee(e, payrollAdjustments[e.id] || {}, loans));
  const portalEmployee = employeeList[0];
  const portalPayroll = generatedPayroll.find((p) => p.employeeCode === portalEmployee?.id) || generatedPayroll[0];

  useEffect(() => {
    async function loadEmployees() {
      setLoadingEmployees(true);
      const { data, error } = await supabase.from("employees").select("*").order("created_at", { ascending: true });
      if (!error && data && data.length > 0) {
        setEmployeeList(data.map((emp) => ({
          id: emp.employee_code,
          name: emp.full_name,
          branch: emp.branch,
          dept: emp.department,
          designation: emp.designation || "-",
          level: emp.level || emp.staff_level || "Non-Management",
          type: emp.employee_type || "Permanent",
          salary: emp.salary || 0,
          eobi: emp.eobi_status || "Pending",
          status: emp.status || "Active",
          phone: emp.phone || "-",
          joiningDate: emp.joining_date || "",
        })));
      }
      setLoadingEmployees(false);
    }
    loadEmployees();
  }, []);

  useEffect(() => {
    if (!visibleMenu.some((item) => item.key === active)) setActive(visibleMenu[0]?.key || "dashboard");
  }, [role, active, visibleMenu]);

  async function saveEmployee() {
    const code = generateNextCode(newEmployee.branch, employeeList);
    const payload = {
      employee_code: code,
      full_name: newEmployee.fullName,
      designation: newEmployee.designation,
      department: newEmployee.department,
      branch: newEmployee.branch,
      employee_type: "Permanent",
      salary: Number(newEmployee.salary || 0),
      phone: newEmployee.phone,
      eobi_status: "Pending",
      status: "Active",
    };
    const { error } = await supabase.from("employees").insert(payload);
    if (error) return alert(`Error: ${error.message}`);
    setEmployeeList((prev) => [...prev, { id: code, name: payload.full_name, branch: payload.branch, dept: payload.department, designation: payload.designation, level: newEmployee.level, type: "Permanent", salary: payload.salary, phone: payload.phone || "-", eobi: "Pending", status: "Active" }]);
    setShowEmployeeForm(false);
  }

  async function updateEmployee() {
    if (!editingEmployee) return;
    const payload = { full_name: editingEmployee.name, branch: editingEmployee.branch, department: editingEmployee.dept, designation: editingEmployee.designation, salary: Number(editingEmployee.salary || 0), eobi_status: editingEmployee.eobi, phone: editingEmployee.phone, status: editingEmployee.status };
    const { error } = await supabase.from("employees").update(payload).eq("employee_code", editingEmployee.id);
    if (error) return alert(`Update Failed: ${error.message}`);
    setEmployeeList((prev) => prev.map((e) => e.id === editingEmployee.id ? editingEmployee : e));
    setEditingEmployee(null);
  }

  async function updateEmployeeStatus(id, status) {
    const { error } = await supabase.from("employees").update({ status }).eq("employee_code", id);
    if (error) return alert(`Status update failed: ${error.message}`);
    setEmployeeList((prev) => prev.map((e) => e.id === id ? { ...e, status } : e));
  }

  async function previewEmployeeFile() {
    setImportError("");
    setImportMessage("");
    if (!selectedImportFile) {
      setImportError("Please choose a CSV, XLS or XLSX file first.");
      return;
    }
    try {
      const rawRows = await readImportFile(selectedImportFile);
      const checked = validateEmployeeImportRows(rawRows, employeeList);
      setImportPreview(checked);
      const invalid = checked.filter((r) => !r.valid).length;
      setImportMessage(invalid ? `${checked.length} rows found. ${invalid} rows have errors; correct them before import.` : `${checked.length} rows found and ready to import.`);
    } catch (error) {
      setImportError(error.message);
      setImportPreview([]);
    }
  }

  async function confirmEmployeeImport() {
    const validRows = importPreview.filter((row) => row.valid);
    if (!validRows.length) {
      setImportError("No valid employee rows available to import.");
      return;
    }
    if (importPreview.some((row) => !row.valid)) {
      setImportError("Please correct invalid rows before importing.");
      return;
    }
    setImporting(true);
    setImportError("");
    const reservedCodes = [];
    const inserted = [];
    try {
      for (const row of validRows) {
        const code = row.employee_code || generateNextCode(row.branch, employeeList, reservedCodes);
        reservedCodes.push(code);
        const payload = {
          employee_code: code,
          full_name: row.name,
          designation: row.designation || "-",
          department: row.department || "General",
          branch: row.branch,
          employee_type: row.employee_type || "Permanent",
          salary: Number(row.salary || 0),
          phone: row.phone || "-",
          eobi_status: row.eobi_status || "Pending",
          status: "Active",
          joining_date: row.joining_date || null,
        };
        const { error } = await supabase.from("employees").insert(payload);
        if (error) throw new Error(`${code}: ${error.message}`);
        inserted.push({
          id: code, name: payload.full_name, branch: payload.branch, dept: payload.department,
          designation: payload.designation, level: row.level, type: payload.employee_type,
          salary: payload.salary, eobi: payload.eobi_status, status: payload.status,
          phone: payload.phone, joiningDate: payload.joining_date || "",
        });
      }
      setEmployeeList((prev) => [...prev, ...inserted]);
      setImportMessage(`${inserted.length} employees imported successfully.`);
      setSelectedImportFile(null);
      setImportPreview([]);
    } catch (error) {
      setImportError(`Import failed: ${error.message}`);
    } finally {
      setImporting(false);
    }
  }

  if (authLoading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><div className="text-xl font-bold">Loading Big Buy HRMS...</div></div>;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="flex">
        <aside className="hidden lg:flex w-72 min-h-screen bg-slate-950 text-white p-5 flex-col fixed left-0 top-0 bottom-0">
          <div className="mb-8"><div className="text-2xl font-bold">Big Buy HRMS</div><div className="text-slate-400 text-sm mt-1">Staff • Attendance • Payroll</div></div>
          <nav className="space-y-2 overflow-y-auto">{visibleMenu.map((item) => <button key={item.key} onClick={() => setActive(item.key)} className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition ${active === item.key ? "bg-white text-slate-950" : "text-slate-300 hover:bg-slate-900"}`}><span>{item.icon}</span><span>{item.label}</span></button>)}</nav>
          <div className="mt-auto p-4 bg-slate-900 rounded-2xl"><div className="text-sm font-semibold">{currentUser.name}</div><div className="text-xs text-slate-400 mt-1">Role: {role}</div></div>
        </aside>
        <main className="flex-1 p-4 md:p-8 lg:ml-72">
          <div className="mb-5 bg-white border border-slate-100 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row justify-between gap-3">
            <div><div className="font-bold">{currentUser.name}</div><div className="text-sm text-slate-500">{currentUser.email} • {role}</div></div>
            <select value={role} onChange={(e) => setRole(e.target.value)} className="px-4 py-2 rounded-2xl border border-slate-200"><option>Master</option><option>HR</option><option>Finance</option><option>Employee</option></select>
          </div>
          <div className="lg:hidden mb-4 bg-slate-950 text-white rounded-2xl p-4"><div className="font-bold text-xl">Big Buy HRMS</div><div className="flex gap-2 overflow-x-auto mt-4">{visibleMenu.map((item) => <Button key={item.key} onClick={() => setActive(item.key)} variant="secondary" className="rounded-xl whitespace-nowrap">{item.icon} {item.label}</Button>)}</div></div>

          {active === "dashboard" && <div><PageTitle title="HR Dashboard" subtitle="Staff position, payroll snapshot and attendance alerts." action={<Button className="rounded-2xl" onClick={() => setActive("imports")}>Import Employees</Button>} /><div className="grid grid-cols-1 md:grid-cols-4 gap-4"><StatCard title="Active Staff" value={activeEmployees.length} sub="Across branches" icon="👥" /><StatCard title="Attendance Logs" value={processedAttendance.length} sub="Processed punches" icon="✅" /><StatCard title="Late / Half Day" value={processedAttendance.filter((a) => a.status !== "Present").length} sub="Needs review" icon="⚠️" /><StatCard title="Payroll" value={money(generatedPayroll.reduce((s, p) => s + p.finalSalary, 0))} sub={payrollStatus} icon="💰" /></div></div>}

          {active === "employees" && <div><PageTitle title="Employee Master" subtitle="Add, edit and mark staff inactive." action={<Button className="rounded-2xl" onClick={() => setShowEmployeeForm(true)}>+ New Employee</Button>} /><div className="flex flex-col md:flex-row gap-3 mb-4"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search employee..." className="flex-1 px-4 py-2.5 rounded-2xl border border-slate-200" /><select value={branch} onChange={(e) => setBranch(e.target.value)} className="px-4 py-2.5 rounded-2xl border border-slate-200"><option>All</option>{Object.keys(branchCodeMap).map((b) => <option key={b}>{b}</option>)}</select></div>{showEmployeeForm && <EmployeeAdd employee={newEmployee} setEmployee={setNewEmployee} save={saveEmployee} close={() => setShowEmployeeForm(false)} />}{editingEmployee && <EmployeeEdit employee={editingEmployee} setEmployee={setEditingEmployee} save={updateEmployee} close={() => setEditingEmployee(null)} />}{loadingEmployees && <p>Loading employees...</p>}<Table headers={["ID", "Name", "Level", "Branch", "Department", "Salary", "Status", "Action"]} rows={filteredEmployees} renderRow={(e) => <tr key={e.id}><td className="px-4 py-3 font-medium">{e.id}</td><td className="px-4 py-3">{e.name}</td><td className="px-4 py-3">{e.level}</td><td className="px-4 py-3">{e.branch}</td><td className="px-4 py-3">{e.dept}</td><td className="px-4 py-3">{money(e.salary)}</td><td className="px-4 py-3"><Badge tone={e.status === "Active" ? "green" : "yellow"}>{e.status}</Badge></td><td className="px-4 py-3 flex gap-2"><Button variant="outline" onClick={() => setEditingEmployee(e)}>Edit</Button>{e.status === "Active" && <Button variant="outline" onClick={() => updateEmployeeStatus(e.id, "Inactive")}>Inactive</Button>}</td></tr>} /></div>}

          {active === "attendance" && <div><PageTitle title="Attendance Processing" subtitle="Attendance calculated through staff-level policy rules." action={<Button className="rounded-2xl" onClick={() => downloadCSV("attendance.csv", processedAttendance)}>Export</Button>} /><Table headers={["Employee", "Level", "Date", "In", "Out", "Actual Hours", "Late", "OT", "Status"]} rows={processedAttendance} renderRow={(a) => <tr key={`${a.employeeCode}-${a.date}`}><td className="px-4 py-3 font-medium">{a.name}</td><td className="px-4 py-3">{a.level}</td><td className="px-4 py-3">{a.date}</td><td className="px-4 py-3">{a.checkIn}</td><td className="px-4 py-3">{a.checkOut}</td><td className="px-4 py-3">{a.actualHours}</td><td className="px-4 py-3">{a.lateMinutes}</td><td className="px-4 py-3">{a.overtimeHours}</td><td className="px-4 py-3"><StatusBadge status={a.status} /></td></tr>} /></div>}

          {active === "payroll" && <div><PageTitle title="Payroll Generator" subtitle="Salary calculation using staff level, attendance and loans." action={<Button onClick={() => downloadCSV("payroll.csv", generatedPayroll)} className="rounded-2xl">Export Payroll</Button>} />{selectedPayslip && <PayslipCard row={selectedPayslip} month={payrollMonth} close={() => setSelectedPayslip(null)} />}<Table headers={["Employee", "Level", "Gross", "OT", "Deductions", "Final", "Payslip"]} rows={generatedPayroll} renderRow={(p) => <tr key={p.employeeCode}><td className="px-4 py-3 font-medium">{p.name}</td><td className="px-4 py-3">{p.level}</td><td className="px-4 py-3">{money(p.gross)}</td><td className="px-4 py-3">{money(p.overtimeAmount)}</td><td className="px-4 py-3">{money(p.absentDeduction + p.lateDeduction + p.loanDeduction)}</td><td className="px-4 py-3 font-bold">{money(p.finalSalary)}</td><td className="px-4 py-3"><Button variant="outline" onClick={() => setSelectedPayslip(p)}>View</Button></td></tr>} /></div>}

          {active === "loans" && <div><PageTitle title="Loans & Advances" subtitle="Eligibility based on service, salary limit and active loans." /><Table headers={["Employee", "Service", "Max Eligible", "Balance", "Eligibility"]} rows={activeEmployees} renderRow={(e) => { const c = checkLoanEligibility(e, loans); const l = loans.find((loan) => loan.employeeCode === e.id); return <tr key={e.id}><td className="px-4 py-3">{e.name}</td><td className="px-4 py-3">{c.serviceYears} yrs</td><td className="px-4 py-3">{money(c.maximumLoan)}</td><td className="px-4 py-3">{money(l?.balance || 0)}</td><td className="px-4 py-3"><Badge tone={c.eligible ? "green" : "yellow"}>{c.reason}</Badge></td></tr>; }} /></div>}

          {active === "imports" && <ImportCenter selectedFile={selectedImportFile} setSelectedFile={setSelectedImportFile} preview={importPreview} importing={importing} message={importMessage} error={importError} onPreview={previewEmployeeFile} onImport={confirmEmployeeImport} />}

          {active === "policies" && <PolicyRules />}

          {active === "exports" && <ExportCenter employees={employeeList} payroll={generatedPayroll} attendance={processedAttendance} loans={loans} />}

          {["zkt", "audit", "approval", "portal", "reports", "users"].includes(active) && <PlaceholderPage active={active} />}
        </main>
      </div>
    </div>
  );
}

function EmployeeAdd({ employee, setEmployee, save, close }) {
  return <Card className="rounded-2xl shadow-sm border border-slate-100 mb-4"><CardContent className="p-5"><div className="flex justify-between mb-4"><h2 className="text-lg font-bold">Add New Employee</h2><Button variant="outline" onClick={close}>Close</Button></div><div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3"><input placeholder="Full Name" value={employee.fullName} onChange={(e) => setEmployee({ ...employee, fullName: e.target.value })} className="px-4 py-2 border rounded-xl" /><input placeholder="Designation" value={employee.designation} onChange={(e) => setEmployee({ ...employee, designation: e.target.value })} className="px-4 py-2 border rounded-xl" /><input placeholder="Department" value={employee.department} onChange={(e) => setEmployee({ ...employee, department: e.target.value })} className="px-4 py-2 border rounded-xl" /><select value={employee.level} onChange={(e) => setEmployee({ ...employee, level: e.target.value })} className="px-4 py-2 border rounded-xl">{Object.keys(staffLevelPolicies).map((x) => <option key={x}>{x}</option>)}</select><select value={employee.branch} onChange={(e) => setEmployee({ ...employee, branch: e.target.value })} className="px-4 py-2 border rounded-xl">{Object.keys(branchCodeMap).map((x) => <option key={x}>{x}</option>)}</select><input type="number" placeholder="Salary" value={employee.salary} onChange={(e) => setEmployee({ ...employee, salary: e.target.value })} className="px-4 py-2 border rounded-xl" /><input placeholder="Phone" value={employee.phone} onChange={(e) => setEmployee({ ...employee, phone: e.target.value })} className="px-4 py-2 border rounded-xl" /></div><div className="mt-4"><Button onClick={save}>Save Employee</Button></div></CardContent></Card>;
}

function EmployeeEdit({ employee, setEmployee, save, close }) {
  return <Card className="rounded-2xl shadow-sm border border-slate-100 mb-4"><CardContent className="p-5"><div className="flex justify-between mb-4"><h2 className="text-lg font-bold">Edit Employee</h2><Button variant="outline" onClick={close}>Close</Button></div><div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3"><input value={employee.name} onChange={(e) => setEmployee({ ...employee, name: e.target.value })} className="px-4 py-2 border rounded-xl" /><input value={employee.dept} onChange={(e) => setEmployee({ ...employee, dept: e.target.value })} className="px-4 py-2 border rounded-xl" /><select value={employee.level} onChange={(e) => setEmployee({ ...employee, level: e.target.value })} className="px-4 py-2 border rounded-xl">{Object.keys(staffLevelPolicies).map((x) => <option key={x}>{x}</option>)}</select><input type="number" value={employee.salary} onChange={(e) => setEmployee({ ...employee, salary: e.target.value })} className="px-4 py-2 border rounded-xl" /></div><div className="mt-4 flex gap-2"><Button onClick={save}>Save Changes</Button><Button variant="outline" onClick={close}>Cancel</Button></div></CardContent></Card>;
}

function ImportCenter({ selectedFile, setSelectedFile, preview, importing, message, error, onPreview, onImport }) {
  const invalidCount = preview.filter((row) => !row.valid).length;
  return <div><PageTitle title="Import Center" subtitle="Download Excel templates, upload employee details, preview errors and confirm import." /><Card className="rounded-2xl border border-slate-100 shadow-sm mb-6"><CardContent className="p-6"><h2 className="text-lg font-bold mb-3">Download Templates</h2><div className="grid grid-cols-1 md:grid-cols-5 gap-3">{["employees", "attendance", "salary_adjustments", "loans", "leaves"].map((type) => <Button key={type} variant="outline" className="rounded-2xl" onClick={() => downloadTemplate(type)}>{type.replaceAll("_", " ")}</Button>)}</div></CardContent></Card><Card className="rounded-2xl border border-slate-100 shadow-sm mb-6"><CardContent className="p-6"><h2 className="text-lg font-bold mb-3">Upload Employee File</h2><input type="file" accept=".csv,.xls,.xlsx" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} className="block w-full text-sm mb-3" />{selectedFile && <p className="text-sm text-slate-600 mb-3">Selected: <b>{selectedFile.name}</b></p>}<div className="flex gap-3"><Button onClick={onPreview} className="rounded-2xl">Preview File</Button><Button onClick={onImport} disabled={importing || !preview.length || invalidCount > 0} className="rounded-2xl">{importing ? "Importing..." : "Confirm Import"}</Button></div>{message && <div className="mt-4 p-3 rounded-xl bg-blue-50 text-blue-700">{message}</div>}{error && <div className="mt-4 p-3 rounded-xl bg-red-50 text-red-700">{error}</div>}</CardContent></Card>{preview.length > 0 && <Table headers={["Row", "Employee ID", "Name", "Branch", "Level", "Salary", "Status"]} rows={preview} renderRow={(r) => <tr key={r.rowNumber}><td className="px-4 py-3">{r.rowNumber}</td><td className="px-4 py-3">{r.employee_code || "Auto"}</td><td className="px-4 py-3">{r.name}</td><td className="px-4 py-3">{r.branch}</td><td className="px-4 py-3">{r.level}</td><td className="px-4 py-3">{money(r.salary)}</td><td className="px-4 py-3"><Badge tone={r.valid ? "green" : "red"}>{r.valid ? "Ready" : r.errors.join(", ")}</Badge></td></tr>} />}</div>;
}

function PolicyRules() {
  return <div><PageTitle title="Policy Rules" subtitle="Flexible rules by management level." /><div className="grid grid-cols-1 xl:grid-cols-3 gap-4">{Object.values(staffLevelPolicies).map((p) => <Card key={p.label} className="rounded-2xl shadow-sm border border-slate-100"><CardContent className="p-5"><h2 className="text-xl font-bold mb-3">{p.label}</h2><div className="space-y-2 text-sm"><div className="flex justify-between"><span>Shift</span><b>{p.defaultShiftStart} - {p.defaultShiftEnd}</b></div><div className="flex justify-between"><span>Hours</span><b>{p.requiredHours}</b></div><div className="flex justify-between"><span>Grace</span><b>{p.graceMinutes} min</b></div><div className="flex justify-between"><span>OT</span><b>{p.overtimeEligible ? "Eligible" : "Not Eligible"}</b></div><div className="flex justify-between"><span>Notice</span><b>{p.noticeDays} days</b></div></div></CardContent></Card>)}</div></div>;
}

function PayslipCard({ row, month, close }) {
  return <Card className="rounded-2xl shadow-sm border border-slate-100 mb-6"><CardContent className="p-5"><div className="flex justify-between mb-4"><h2 className="text-xl font-bold">Payslip Preview</h2><Button variant="outline" onClick={close}>Close</Button></div><p>{row.name} • {row.employeeCode} • {month}</p><div className="mt-4 flex justify-between text-lg"><span>Final Salary</span><b>{money(row.finalSalary)}</b></div><Button className="mt-4" onClick={() => printPayslip(row, month)}>Print / Save PDF</Button></CardContent></Card>;
}

function ExportCenter({ employees, payroll, attendance, loans }) {
  const exports = [{ title: "Employee Master", data: employees }, { title: "Attendance", data: attendance }, { title: "Payroll", data: payroll }, { title: "Loan Balance", data: loans }];
  return <div><PageTitle title="Excel Export Center" subtitle="Download CSV backups." /><div className="grid grid-cols-1 md:grid-cols-4 gap-4">{exports.map((x) => <Card key={x.title} className="rounded-2xl border border-slate-100"><CardContent className="p-5"><h3 className="font-bold">{x.title}</h3><Button className="mt-4" variant="outline" onClick={() => downloadCSV(`${x.title}.csv`, x.data)}>Download</Button></CardContent></Card>)}</div></div>;
}

function PlaceholderPage({ active }) {
  const titles = { zkt: "ZKT Live Sync", audit: "Attendance Audit", approval: "Salary Approval", portal: "Employee Portal", reports: "Reports", users: "Users & Roles" };
  return <div><PageTitle title={titles[active]} subtitle="This module remains available for the next functional update." /></div>;
}
