import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://rtazykuylyccptnayxgf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Zm7dA_mLxb8ci8r5loLryQ_NBx9WSoF";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const ICONS = {
  dashboard: "🏢",
  employees: "👥",
  attendance: "⏱️",
  payroll: "💰",
  loans: "💳",
  rules: "🛡️",
  reports: "📄",
  search: "🔎",
  add: "+",
  calendar: "📅",
  warning: "⚠️",
  check: "✅",
  export: "⬇️",
  filter: "⚙️",
};

const branchCodeMap = {
  Qayyumabad: "QAD",
  "PAF Faisal": "PAF",
  Korangi: "KOR",
  Clifton: "CLF",
};

const initialEmployees = [
  { id: "QAD-001", name: "Ali Raza", branch: "Qayyumabad", dept: "Grocery", designation: "Salesman", type: "Permanent", salary: 42000, eobi: "Registered", status: "Active", phone: "0300-0000001", joiningDate: "2024-01-01" },
  { id: "PAF-001", name: "Hassan Khan", branch: "PAF Faisal", dept: "Cash Counter", designation: "Cashier", type: "Permanent", salary: 48000, eobi: "Registered", status: "Active", phone: "0300-0000002", joiningDate: "2023-04-01" },
  { id: "QAD-002", name: "Noman Ahmed", branch: "Qayyumabad", dept: "Garments", designation: "Salesman", type: "Daily Wage", salary: 1800, eobi: "Not Applicable", status: "Active", phone: "0300-0000003", joiningDate: "2025-02-01" },
  { id: "PAF-002", name: "Shahzaib", branch: "PAF Faisal", dept: "Security", designation: "Guard", type: "Contractor", salary: 0, eobi: "Contractor", status: "Active", phone: "0300-0000004", joiningDate: "2025-06-01" },
  { id: "QAD-003", name: "Usman Tariq", branch: "Qayyumabad", dept: "Crockery", designation: "Salesman", type: "Permanent", salary: 40000, eobi: "Pending", status: "Active", phone: "0300-0000005", joiningDate: "2024-09-01" },
];

const demoRawPunches = [
  { employeeCode: "QAD-001", name: "Ali Raza", date: "2026-04-01", checkIn: "10:52", checkOut: "21:40", branch: "Qayyumabad", shiftStart: "10:45", shiftEnd: "21:15" },
  { employeeCode: "QAD-001", name: "Ali Raza", date: "2026-04-02", checkIn: "11:07", checkOut: "21:15", branch: "Qayyumabad", shiftStart: "10:45", shiftEnd: "21:15" },
  { employeeCode: "PAF-001", name: "Hassan Khan", date: "2026-04-01", checkIn: "11:30", checkOut: "21:15", branch: "PAF Faisal", shiftStart: "10:45", shiftEnd: "21:15" },
  { employeeCode: "PAF-001", name: "Hassan Khan", date: "2026-04-02", checkIn: "10:50", checkOut: "19:30", branch: "PAF Faisal", shiftStart: "10:45", shiftEnd: "21:15" },
  { employeeCode: "QAD-002", name: "Noman Ahmed", date: "2026-04-01", checkIn: "13:02", checkOut: "23:45", branch: "Qayyumabad", shiftStart: "13:00", shiftEnd: "23:30" },
  { employeeCode: "QAD-003", name: "Usman Tariq", date: "2026-04-01", checkIn: "-", checkOut: "-", branch: "Qayyumabad", shiftStart: "10:45", shiftEnd: "21:15" },
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
  { key: "exports", label: "Excel Export", icon: "📊", roles: ["Master", "HR", "Finance"] },
  { key: "users", label: "Users & Roles", icon: "🔐", roles: ["Master"] },
];

function Card({ className = "", children }) {
  return <div className={`bg-white ${className}`}>{children}</div>;
}

function CardContent({ className = "", children }) {
  return <div className={className}>{children}</div>;
}

function Button({ className = "", variant = "default", children, ...props }) {
  const style = variant === "outline" ? "border border-slate-200 bg-white text-slate-800 hover:bg-slate-50" : variant === "secondary" ? "bg-white text-slate-950 hover:bg-slate-100" : "bg-slate-950 text-white hover:bg-slate-800";
  return <button className={`inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed ${style} ${className}`} {...props}>{children}</button>;
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

function processAttendancePunch(row) {
  const start = timeToMinutes(row.shiftStart);
  const end = timeToMinutes(row.shiftEnd);
  const inMin = timeToMinutes(row.checkIn);
  const outMin = timeToMinutes(row.checkOut);
  const requiredMinutes = 630;
  if (inMin === null || outMin === null) return { ...row, actualHours: 0, lateMinutes: 0, shortHours: 10.5, overtimeHours: 0, status: "Absent", approval: "Auto" };
  const actualMinutes = Math.max(0, outMin - inMin);
  const lateMinutes = Math.max(0, inMin - start - 15);
  const earlyOutMinutes = Math.max(0, end - outMin);
  const shortMinutes = Math.max(0, requiredMinutes - actualMinutes);
  const overtimeMinutes = Math.max(0, actualMinutes - requiredMinutes);
  let status = "Present";
  if (lateMinutes > 90 || earlyOutMinutes > 90) status = "Half Day";
  else if (lateMinutes > 0) status = "Late";
  return { ...row, actualHours: minutesToHours(actualMinutes), lateMinutes, shortHours: minutesToHours(shortMinutes), overtimeHours: minutesToHours(overtimeMinutes), status, approval: overtimeMinutes > 0 ? "OT Pending" : "Auto" };
}

function calculatePayrollForEmployee(employee, adjustments = {}, loanRows = []) {
  const monthlySalary = Number(employee.salary || 0);
  const dailySalary = monthlySalary / 30;
  const hourlySalary = dailySalary / 10.5;
  const absentDeduction = dailySalary * Number(adjustments.absentDays || 0);
  const lateDeduction = Number(adjustments.lateCount || 0) >= 3 ? dailySalary : 0;
  const overtimeAmount = hourlySalary * Number(adjustments.otHours || 0);
  const loanDeduction = loanRows.find((loan) => loan.employeeCode === employee.id)?.monthly || 0;
  const additions = Number(adjustments.commission || 0) + Number(adjustments.fuel || 0) + Number(adjustments.arrears || 0) + Number(adjustments.leaveAdjustment || 0) + overtimeAmount;
  const deductions = absentDeduction + lateDeduction + loanDeduction;
  return { employeeCode: employee.id, name: employee.name, branch: employee.branch, department: employee.dept, gross: monthlySalary, presentDays: Number(adjustments.presentDays || 0), absentDays: Number(adjustments.absentDays || 0), lateCount: Number(adjustments.lateCount || 0), otHours: Number(adjustments.otHours || 0), absentDeduction, lateDeduction, overtimeAmount, commission: Number(adjustments.commission || 0), fuel: Number(adjustments.fuel || 0), arrears: Number(adjustments.arrears || 0), leaveAdjustment: Number(adjustments.leaveAdjustment || 0), loanDeduction, finalSalary: monthlySalary + additions - deductions };
}

function StatusBadge({ status }) {
  const tone = status === "Absent" ? "red" : status === "Late" ? "yellow" : status === "Half Day" ? "purple" : status === "Contractor" ? "blue" : "green";
  return <Badge tone={tone}>{status}</Badge>;
}

function downloadCSV(filename, rows) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => `"${String(r[h] ?? "").replaceAll('"', '""')}"`).join(","))].join("
");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function printPayslip(row, month) {
  const html = `
    <html><head><title>Payslip ${row.employeeCode}</title><style>body{font-family:Arial;padding:30px}.box{border:1px solid #ddd;padding:20px;border-radius:12px}table{width:100%;border-collapse:collapse}td{padding:8px;border-bottom:1px solid #eee}.total{font-size:22px;font-weight:bold}</style></head>
    <body><div class="box"><h1>The Big Buy Supermarket</h1><h2>Salary Slip - ${month}</h2><p><b>${row.name}</b> (${row.employeeCode})</p><p>${row.branch} - ${row.department}</p><table><tr><td>Gross Salary</td><td>${money(row.gross)}</td></tr><tr><td>Overtime</td><td>${money(row.overtimeAmount)}</td></tr><tr><td>Commission</td><td>${money(row.commission)}</td></tr><tr><td>Fuel/Arrears/Leave Adj.</td><td>${money(row.fuel + row.arrears + row.leaveAdjustment)}</td></tr><tr><td>Absent Deduction</td><td>${money(row.absentDeduction)}</td></tr><tr><td>Late Deduction</td><td>${money(row.lateDeduction)}</td></tr><tr><td>Loan Deduction</td><td>${money(row.loanDeduction)}</td></tr><tr><td class="total">Final Salary</td><td class="total">${money(row.finalSalary)}</td></tr></table><p style="margin-top:30px">This is a system generated payslip.</p></div></body></html>`;
  const w = window.open("", "_blank");
  w.document.write(html);
  w.document.close();
  w.print();
}

export default function BigBuyHRMS() {
  const [active, setActive] = useState("dashboard");
  const [currentUser, setCurrentUser] = useState(null);
  const [role, setRole] = useState("Master");
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
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
  const [newEmployee, setNewEmployee] = useState({ branch: "Qayyumabad", fullName: "", designation: "", department: "", salary: "", phone: "" });

  const processedAttendance = useMemo(() => demoRawPunches.map(processAttendancePunch), []);
  const visibleMenu = menu.filter((item) => item.roles.includes(role));
  const filteredEmployees = employeeList.filter((e) => (branch === "All" || e.branch === branch) && `${e.name} ${e.id} ${e.dept} ${e.phone}`.toLowerCase().includes(query.toLowerCase()));
  const activeEmployees = employeeList.filter((e) => e.status === "Active");
  const generatedPayroll = activeEmployees.filter((e) => e.type !== "Contractor").map((e) => calculatePayrollForEmployee(e, payrollAdjustments[e.id] || {}, loans));
  const portalEmployee = currentUser?.role === "Employee" ? employeeList.find((e) => e.id === currentUser.employeeCode) || employeeList[0] : employeeList[0];
  const portalPayroll = generatedPayroll.find((p) => p.employeeCode === portalEmployee?.id) || generatedPayroll[0];

  useEffect(() => {
    async function loadEmployees() {
      setLoadingEmployees(true);
      const { data, error } = await supabase.from("employees").select("*").order("created_at", { ascending: true });
      if (!error && data && data.length > 0) {
        setEmployeeList(data.map((emp) => ({ id: emp.employee_code, name: emp.full_name, branch: emp.branch, dept: emp.department, designation: emp.designation || "-", type: emp.employee_type || "Permanent", salary: emp.salary || 0, eobi: emp.eobi_status || "Pending", status: emp.status || "Active", phone: emp.phone || "-", joiningDate: emp.joining_date || "" })));
      }
      setLoadingEmployees(false);
    }
    loadEmployees();
  }, []);

  useEffect(() => {
    if (!visibleMenu.some((item) => item.key === active)) setActive(visibleMenu[0]?.key || "dashboard");
  }, [role]);

  function demoLogin(selectedRole) {
    const users = {
      Master: { name: "Fahad Nadeem", email: "master@thebigbuy.pk", role: "Master" },
      HR: { name: "HR User", email: "hr@thebigbuy.pk", role: "HR" },
      Finance: { name: "Finance User", email: "finance@thebigbuy.pk", role: "Finance" },
      Employee: { name: "Ali Raza", email: "employee@thebigbuy.pk", role: "Employee", employeeCode: "QAD-001" },
    };
    setCurrentUser(users[selectedRole]); setRole(selectedRole); setActive(selectedRole === "Employee" ? "portal" : "dashboard");
  }

  function handleLogin(e) {
    e.preventDefault();
    const email = loginForm.email.toLowerCase();
    if (email.includes("hr")) return demoLogin("HR");
    if (email.includes("finance") || email.includes("account")) return demoLogin("Finance");
    if (email.includes("employee") || email.includes("staff")) return demoLogin("Employee");
    return demoLogin("Master");
  }

  async function saveEmployee() {
    const prefix = branchCodeMap[newEmployee.branch] || "EMP";
    const sameBranch = employeeList.filter((e) => e.id.startsWith(prefix));
    const next = String(sameBranch.length + 1).padStart(3, "0");
    const code = `${prefix}-${next}`;
    const payload = { employee_code: code, full_name: newEmployee.fullName, designation: newEmployee.designation, department: newEmployee.department, branch: newEmployee.branch, employee_type: "Permanent", salary: Number(newEmployee.salary || 0), phone: newEmployee.phone, eobi_status: "Pending", status: "Active" };
    const { error } = await supabase.from("employees").insert(payload);
    if (error) return alert(`Error: ${error.message}`);
    setEmployeeList((prev) => [...prev, { id: code, name: newEmployee.fullName, branch: newEmployee.branch, dept: newEmployee.department, designation: newEmployee.designation, type: "Permanent", salary: Number(newEmployee.salary || 0), phone: newEmployee.phone || "-", eobi: "Pending", status: "Active" }]);
    setNewEmployee({ branch: "Qayyumabad", fullName: "", designation: "", department: "", salary: "", phone: "" }); setShowEmployeeForm(false);
  }

  async function updateEmployee() {
    if (!editingEmployee) return;
    const payload = { full_name: editingEmployee.name, branch: editingEmployee.branch, department: editingEmployee.dept, designation: editingEmployee.designation, salary: Number(editingEmployee.salary || 0), eobi_status: editingEmployee.eobi, phone: editingEmployee.phone, status: editingEmployee.status };
    const { error } = await supabase.from("employees").update(payload).eq("employee_code", editingEmployee.id);
    if (error) return alert(`Update Failed: ${error.message}`);
    setEmployeeList((prev) => prev.map((e) => e.id === editingEmployee.id ? editingEmployee : e)); setEditingEmployee(null);
  }

  async function updateEmployeeStatus(id, status) {
    const { error } = await supabase.from("employees").update({ status }).eq("employee_code", id);
    if (error) return alert(`Status update failed: ${error.message}`);
    setEmployeeList((prev) => prev.map((e) => e.id === id ? { ...e, status } : e));
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md rounded-3xl shadow-xl border border-slate-100"><CardContent className="p-8">
          <div className="text-center mb-8"><div className="mx-auto h-16 w-16 rounded-3xl bg-slate-950 text-white flex items-center justify-center text-3xl mb-4">🏢</div><h1 className="text-3xl font-bold text-slate-950">Big Buy HRMS</h1><p className="text-slate-500 mt-2">Secure staff, attendance and payroll portal</p></div>
          <form onSubmit={handleLogin} className="space-y-4"><input value={loginForm.email} onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })} placeholder="Email / Employee ID" className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-white outline-none" /><input type="password" value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} placeholder="Password" className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-white outline-none" /><Button className="w-full rounded-2xl py-3" type="submit">Login</Button></form>
          <div className="mt-6"><p className="text-xs text-slate-400 mb-3 text-center">Testing shortcuts</p><div className="grid grid-cols-2 gap-2"><Button variant="outline" className="rounded-2xl" onClick={() => demoLogin("Master")}>Master</Button><Button variant="outline" className="rounded-2xl" onClick={() => demoLogin("HR")}>HR</Button><Button variant="outline" className="rounded-2xl" onClick={() => demoLogin("Finance")}>Finance</Button><Button variant="outline" className="rounded-2xl" onClick={() => demoLogin("Employee")}>Employee</Button></div></div>
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="flex">
        <aside className="hidden lg:flex w-72 min-h-screen bg-slate-950 text-white p-5 flex-col fixed left-0 top-0 bottom-0">
          <div className="mb-8"><div className="text-2xl font-bold">Big Buy HRMS</div><div className="text-slate-400 text-sm mt-1">Staff • Attendance • Payroll</div></div>
          <nav className="space-y-2 overflow-y-auto">{visibleMenu.map((item) => <button key={item.key} onClick={() => setActive(item.key)} className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition ${active === item.key ? "bg-white text-slate-950" : "text-slate-300 hover:bg-slate-900"}`}><span>{item.icon}</span><span>{item.label}</span></button>)}</nav>
          <div className="mt-auto p-4 bg-slate-900 rounded-2xl"><div className="text-sm font-semibold">{currentUser.name}</div><div className="text-xs text-slate-400 mt-1">Role: {role}</div><Button variant="secondary" className="rounded-xl w-full mt-3" onClick={() => setCurrentUser(null)}>Logout</Button></div>
        </aside>

        <main className="flex-1 p-4 md:p-8 lg:ml-72">
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 mb-4">
            <Card className="rounded-2xl shadow-sm border border-slate-100 xl:col-span-3"><CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3"><div><div className="font-bold text-slate-950">Logged in: {currentUser.name}</div><div className="text-sm text-slate-500">Role: {role} • {currentUser.email}</div></div><div className="flex gap-2 items-center">{currentUser.role === "Master" && <select value={role} onChange={(e) => setRole(e.target.value)} className="px-4 py-2.5 rounded-2xl border border-slate-200 bg-white outline-none"><option>Master</option><option>HR</option><option>Finance</option><option>Employee</option></select>}<Button variant="outline" className="rounded-2xl" onClick={() => setCurrentUser(null)}>Logout</Button></div></CardContent></Card>
            <Card className="rounded-2xl shadow-sm border border-slate-100"><CardContent className="p-4"><div className="font-bold mb-3">System Status</div><div className="space-y-2 text-sm"><div className="flex justify-between"><span>Database</span><Badge tone="green">Connected</Badge></div><div className="flex justify-between"><span>ZKT</span><Badge tone={zktConnected ? "green" : "yellow"}>{zktConnected ? "Live" : "Ready"}</Badge></div><div className="flex justify-between"><span>Payroll</span><Badge tone={payrollStatus === "Locked" ? "red" : "blue"}>{payrollStatus}</Badge></div></div></CardContent></Card>
          </div>
          <div className="lg:hidden mb-4 bg-slate-950 text-white rounded-2xl p-4"><div className="font-bold text-xl">Big Buy HRMS</div><div className="flex gap-2 overflow-x-auto mt-4 pb-1">{visibleMenu.map((item) => <Button key={item.key} onClick={() => setActive(item.key)} variant="secondary" className="rounded-xl whitespace-nowrap">{item.icon} {item.label}</Button>)}</div></div>

          {active === "dashboard" && <div><PageTitle title="HR Dashboard" subtitle="Today’s staff position, payroll snapshot and alerts." action={<Button className="rounded-2xl" onClick={() => { setActive("employees"); setShowEmployeeForm(true); }}>+ Add Employee</Button>} /><div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6"><StatCard title="Active Staff" value={activeEmployees.length} sub="Across branches" icon="👥" /><StatCard title="Present Logs" value={processedAttendance.filter((a) => a.status !== "Absent").length} sub="Demo attendance data" icon="✅" /><StatCard title="Late / Half Day" value={processedAttendance.filter((a) => a.status === "Late" || a.status === "Half Day").length} sub="Needs review" icon="⚠️" /><StatCard title="Payroll" value={money(generatedPayroll.reduce((s, p) => s + p.finalSalary, 0))} sub={payrollStatus} icon="💰" /></div><Table headers={["Employee", "Date", "In", "Out", "Status", "Late", "OT", "Approval"]} rows={processedAttendance} renderRow={(a) => <tr key={`${a.employeeCode}-${a.date}`}><td className="px-4 py-3 font-medium">{a.name}<div className="text-xs text-slate-400">{a.employeeCode}</div></td><td className="px-4 py-3">{a.date}</td><td className="px-4 py-3">{a.checkIn}</td><td className="px-4 py-3">{a.checkOut}</td><td className="px-4 py-3"><StatusBadge status={a.status} /></td><td className="px-4 py-3">{a.lateMinutes} min</td><td className="px-4 py-3">{a.overtimeHours} hr</td><td className="px-4 py-3"><Badge tone={a.approval === "OT Pending" ? "yellow" : "green"}>{a.approval}</Badge></td></tr>} /></div>}

          {active === "employees" && <div><PageTitle title="Employee Master" subtitle="Add, edit and mark staff inactive. No delete option is provided." action={<Button className="rounded-2xl" onClick={() => setShowEmployeeForm(true)}>+ New Employee</Button>} /><div className="flex flex-col md:flex-row gap-3 mb-4"><div className="relative flex-1"><span className="absolute left-3 top-2.5 text-slate-400">🔎</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search employee, department, ID..." className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-slate-200 bg-white outline-none" /></div><select value={branch} onChange={(e) => setBranch(e.target.value)} className="px-4 py-2.5 rounded-2xl border border-slate-200 bg-white outline-none"><option>All</option>{Object.keys(branchCodeMap).map((b) => <option key={b}>{b}</option>)}</select></div>{editingEmployee && <EmployeeEdit employee={editingEmployee} setEmployee={setEditingEmployee} save={updateEmployee} close={() => setEditingEmployee(null)} />}{showEmployeeForm && <EmployeeAdd employee={newEmployee} setEmployee={setNewEmployee} save={saveEmployee} close={() => setShowEmployeeForm(false)} />}{loadingEmployees && <div className="mb-4 text-sm text-slate-500">Loading employees from database...</div>}<Table headers={["ID", "Name", "Branch", "Department", "Type", "Salary", "EOBI", "Status"]} rows={filteredEmployees} renderRow={(e) => <tr key={e.id}><td className="px-4 py-3 font-medium">{e.id}</td><td className="px-4 py-3">{e.name}<div className="text-xs text-slate-400">{e.phone}</div></td><td className="px-4 py-3">{e.branch}</td><td className="px-4 py-3">{e.dept}</td><td className="px-4 py-3"><Badge tone={e.type === "Permanent" ? "green" : e.type === "Contractor" ? "blue" : "yellow"}>{e.type}</Badge></td><td className="px-4 py-3">{e.salary ? money(e.salary) : "As per bill"}</td><td className="px-4 py-3">{e.eobi}</td><td className="px-4 py-3"><div className="flex gap-2"><Badge tone={e.status === "Active" ? "green" : e.status === "Inactive" ? "yellow" : "red"}>{e.status}</Badge><Button variant="outline" className="rounded-xl px-2 py-1 text-xs" onClick={() => setEditingEmployee(e)}>Edit</Button>{e.status === "Active" && <Button variant="outline" className="rounded-xl px-2 py-1 text-xs" onClick={() => updateEmployeeStatus(e.id, "Inactive")}>Inactive</Button>}</div></td></tr>} /></div>}

          {active === "attendance" && <div><PageTitle title="Attendance Processing" subtitle="Processed from ZKT punches using grace, half-day and overtime rules." action={<Button className="rounded-2xl" onClick={() => downloadCSV("attendance.csv", processedAttendance)}>Export Attendance</Button>} /><Table headers={["Employee", "Date", "Check In", "Check Out", "Actual Hours", "Short Hours", "Late", "OT", "Status"]} rows={processedAttendance} renderRow={(a) => <tr key={`${a.employeeCode}-${a.date}`}><td className="px-4 py-3 font-medium">{a.name}<div className="text-xs text-slate-400">{a.employeeCode}</div></td><td className="px-4 py-3">{a.date}</td><td className="px-4 py-3">{a.checkIn}</td><td className="px-4 py-3">{a.checkOut}</td><td className="px-4 py-3">{a.actualHours}</td><td className="px-4 py-3">{a.shortHours}</td><td className="px-4 py-3">{a.lateMinutes} min</td><td className="px-4 py-3">{a.overtimeHours}</td><td className="px-4 py-3"><StatusBadge status={a.status} /></td></tr>} /></div>}

          {active === "zkt" && <div><PageTitle title="ZKT Live Sync" subtitle="Device configuration and live attendance sync foundation." action={<Button className="rounded-2xl" onClick={() => setZktConnected(!zktConnected)}>{zktConnected ? "Disconnect Demo" : "Connect Demo"}</Button>} /><div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6"><StatCard title="Devices" value="2" sub="Branch devices" icon="🛰️" /><StatCard title="Sync Status" value={zktConnected ? "LIVE" : "READY"} sub="ZKT API foundation" icon="📡" /><StatCard title="Today Logs" value={demoRawPunches.length} sub="Punches processed" icon="⏱️" /><StatCard title="Errors" value="0" sub="No failed sync" icon="✅" /></div><Table headers={["Branch", "Device", "IP Address", "Port", "Status", "Last Sync"]} rows={[{ branch: "Qayyumabad", device: "ZKTeco Device", ip: "192.168.1.10", port: "4370", status: zktConnected ? "Online" : "Ready", sync: zktConnected ? "Just now" : "Not connected" }, { branch: "PAF Faisal", device: "ZKTeco Device", ip: "192.168.1.11", port: "4370", status: zktConnected ? "Online" : "Ready", sync: zktConnected ? "Just now" : "Not connected" }]} renderRow={(d) => <tr key={d.branch}><td className="px-4 py-3 font-medium">{d.branch}</td><td className="px-4 py-3">{d.device}</td><td className="px-4 py-3">{d.ip}</td><td className="px-4 py-3">{d.port}</td><td className="px-4 py-3"><Badge tone={d.status === "Online" ? "green" : "yellow"}>{d.status}</Badge></td><td className="px-4 py-3">{d.sync}</td></tr>} /></div>}

          {active === "audit" && <div><PageTitle title="Attendance Audit Center" subtitle="Track manual changes, OT approvals and suspicious attendance records." action={<Button className="rounded-2xl" onClick={() => downloadCSV("attendance-audit.csv", processedAttendance)}>Export Audit</Button>} /><div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6"><StatCard title="Manual Edits" value="3" sub="This month" icon="✏️" /><StatCard title="OT Pending" value={processedAttendance.filter((a) => a.approval === "OT Pending").length} sub="Need approval" icon="⏱️" /><StatCard title="Suspicious" value={processedAttendance.filter((a) => a.status === "Half Day").length} sub="Half day cases" icon="⚠️" /></div><Table headers={["Date", "Employee", "Audit Flag", "Reason", "Status"]} rows={processedAttendance.filter((a) => a.status !== "Present" || a.approval === "OT Pending")} renderRow={(a) => <tr key={`${a.employeeCode}-audit-${a.date}`}><td className="px-4 py-3">{a.date}</td><td className="px-4 py-3 font-medium">{a.employeeCode}</td><td className="px-4 py-3">{a.status === "Half Day" ? "Half Day" : a.approval}</td><td className="px-4 py-3">{a.status === "Half Day" ? "Late/Early beyond allowed limit" : "Overtime requires approval"}</td><td className="px-4 py-3"><Badge tone="yellow">Review</Badge></td></tr>} /></div>}

          {active === "payroll" && <div><PageTitle title="Payroll Generator" subtitle="Generate salaries from attendance, overtime, loans and allowances." action={<div className="flex gap-2 flex-wrap"><select value={payrollMonth} onChange={(e) => setPayrollMonth(e.target.value)} className="px-4 py-2 rounded-2xl border border-slate-200"><option>April 2026</option><option>May 2026</option><option>June 2026</option></select><Button className="rounded-2xl" onClick={() => downloadCSV("payroll.csv", generatedPayroll)}>Export Payroll</Button></div>} /><div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6"><StatCard title="Payroll Staff" value={generatedPayroll.length} sub="Non-contractor staff" icon="👥" /><StatCard title="Total Payroll" value={money(generatedPayroll.reduce((s, p) => s + p.finalSalary, 0))} sub={payrollStatus} icon="💰" /><StatCard title="Loan Recovery" value={money(loans.reduce((s, l) => s + l.monthly, 0))} sub="This month" icon="💳" /><StatCard title="OT Cost" value={money(generatedPayroll.reduce((s, p) => s + p.overtimeAmount, 0))} sub="Calculated OT" icon="⏱️" /></div>{selectedPayslip && <PayslipCard row={selectedPayslip} month={payrollMonth} close={() => setSelectedPayslip(null)} /> }<Table headers={["Employee", "Gross", "Present", "Absent", "Late", "OT", "Additions", "Deductions", "Final", "Payslip"]} rows={generatedPayroll} renderRow={(p) => <tr key={p.employeeCode}><td className="px-4 py-3 font-medium">{p.name}<div className="text-xs text-slate-400">{p.employeeCode}</div></td><td className="px-4 py-3">{money(p.gross)}</td><td className="px-4 py-3">{p.presentDays}</td><td className="px-4 py-3">{p.absentDays}</td><td className="px-4 py-3">{p.lateCount}</td><td className="px-4 py-3">{p.otHours}</td><td className="px-4 py-3">{money(p.overtimeAmount + p.commission + p.fuel + p.arrears + p.leaveAdjustment)}</td><td className="px-4 py-3">{money(p.absentDeduction + p.lateDeduction + p.loanDeduction)}</td><td className="px-4 py-3 font-bold">{money(p.finalSalary)}</td><td className="px-4 py-3"><Button variant="outline" className="rounded-xl px-3 py-1 text-xs" onClick={() => setSelectedPayslip(p)}>View</Button></td></tr>} /></div>}

          {active === "approval" && <div><PageTitle title="Salary Lock & Approval" subtitle="HR prepares payroll, Finance reviews, Master locks final salary." action={<Button className="rounded-2xl" disabled={payrollStatus === "Locked"} onClick={() => setPayrollStatus("Locked")}>Lock Payroll</Button>} /><div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6"><StatCard title="Current Status" value={payrollStatus} sub="Payroll approval stage" icon="🔒" /><StatCard title="HR Review" value="Done" sub="Attendance checked" icon="✅" /><StatCard title="Finance Review" value={payrollStatus === "Draft" ? "Pending" : "Done"} sub="Deductions checked" icon="💰" /><StatCard title="Master Lock" value={payrollStatus === "Locked" ? "Locked" : "Open"} sub="Final approval" icon="🛡️" /></div><div className="grid grid-cols-1 md:grid-cols-3 gap-4"><Card className="rounded-2xl border border-slate-100"><CardContent className="p-5"><h3 className="font-bold mb-2">1. HR Prepared</h3><p className="text-sm text-slate-500">Attendance, leave and late marks checked.</p><Badge tone="green">Completed</Badge></CardContent></Card><Card className="rounded-2xl border border-slate-100"><CardContent className="p-5"><h3 className="font-bold mb-2">2. Finance Review</h3><p className="text-sm text-slate-500">Loans, deductions and allowances verified.</p><Button className="rounded-2xl mt-3" onClick={() => setPayrollStatus("Finance Approved")}>Approve Finance</Button></CardContent></Card><Card className="rounded-2xl border border-slate-100"><CardContent className="p-5"><h3 className="font-bold mb-2">3. Master Lock</h3><p className="text-sm text-slate-500">After lock, payroll cannot be edited.</p><Badge tone={payrollStatus === "Locked" ? "red" : "yellow"}>{payrollStatus === "Locked" ? "Locked" : "Awaiting Lock"}</Badge></CardContent></Card></div></div>}

          {active === "loans" && <div><PageTitle title="Loans & Advances" subtitle="Track employee loans, deductions and balances." action={<Button className="rounded-2xl">+ Add Loan</Button>} /><Table headers={["Employee", "Total Loan", "Monthly Deduction", "Paid", "Balance", "Status"]} rows={loans} renderRow={(l) => <tr key={l.employeeCode}><td className="px-4 py-3 font-medium">{l.name}<div className="text-xs text-slate-400">{l.employeeCode}</div></td><td className="px-4 py-3">{money(l.total)}</td><td className="px-4 py-3">{money(l.monthly)}</td><td className="px-4 py-3">{money(l.paid)}</td><td className="px-4 py-3 font-bold">{money(l.balance)}</td><td className="px-4 py-3"><Badge tone="green">{l.status}</Badge></td></tr>} /></div>}

          {active === "portal" && <div><PageTitle title="Employee Self-Service Portal" subtitle="Employee can view own attendance, payslip, loan and requests." action={<Button className="rounded-2xl">Apply Leave</Button>} /><div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6"><StatCard title="Employee" value={portalEmployee?.name || "Employee"} sub={portalEmployee?.id} icon="🧑‍💼" /><StatCard title="Salary Slip" value={portalPayroll ? money(portalPayroll.finalSalary) : "N/A"} sub={payrollMonth} icon="🧾" /><StatCard title="Loan Balance" value={money(loans.find((l) => l.employeeCode === portalEmployee?.id)?.balance || 0)} sub="Current balance" icon="💳" /></div>{portalPayroll && <PayslipCard row={portalPayroll} month={payrollMonth} close={() => {}} />}</div>}

          {active === "reports" && <ReportCards />}
          {active === "exports" && <ExportCenter employees={employeeList} payroll={generatedPayroll} attendance={processedAttendance} loans={loans} />}
          {active === "users" && <UsersRoles />}
        </main>
      </div>
    </div>
  );
}

function EmployeeAdd({ employee, setEmployee, save, close }) {
  return <Card className="rounded-2xl shadow-sm border border-slate-100 mb-4"><CardContent className="p-5"><div className="flex justify-between mb-4"><h2 className="text-lg font-bold">Add New Employee</h2><Button variant="outline" className="rounded-2xl" onClick={close}>Close</Button></div><div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3"><select value={employee.branch} onChange={(e) => setEmployee({ ...employee, branch: e.target.value })} className="px-4 py-2.5 rounded-2xl border border-slate-200 bg-white">{Object.keys(branchCodeMap).map((b) => <option key={b}>{b}</option>)}</select><input placeholder="Full Name" value={employee.fullName} onChange={(e) => setEmployee({ ...employee, fullName: e.target.value })} className="px-4 py-2.5 rounded-2xl border border-slate-200" /><input placeholder="Designation" value={employee.designation} onChange={(e) => setEmployee({ ...employee, designation: e.target.value })} className="px-4 py-2.5 rounded-2xl border border-slate-200" /><input placeholder="Department" value={employee.department} onChange={(e) => setEmployee({ ...employee, department: e.target.value })} className="px-4 py-2.5 rounded-2xl border border-slate-200" /><input placeholder="Phone" value={employee.phone} onChange={(e) => setEmployee({ ...employee, phone: e.target.value })} className="px-4 py-2.5 rounded-2xl border border-slate-200" /><input type="number" placeholder="Salary" value={employee.salary} onChange={(e) => setEmployee({ ...employee, salary: e.target.value })} className="px-4 py-2.5 rounded-2xl border border-slate-200" /></div><div className="flex justify-end mt-4"><Button className="rounded-2xl" onClick={save}>Save Employee</Button></div></CardContent></Card>;
}

function EmployeeEdit({ employee, setEmployee, save, close }) {
  return <Card className="rounded-2xl shadow-sm border border-slate-100 mb-4"><CardContent className="p-5"><div className="flex justify-between mb-4"><h2 className="text-lg font-bold">Edit Employee</h2><Button variant="outline" className="rounded-2xl" onClick={close}>Close</Button></div><div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3"><input value={employee.id} disabled className="px-4 py-2.5 rounded-2xl border border-slate-200 bg-slate-100" /><input value={employee.name} onChange={(e) => setEmployee({ ...employee, name: e.target.value })} className="px-4 py-2.5 rounded-2xl border border-slate-200" /><input value={employee.dept} onChange={(e) => setEmployee({ ...employee, dept: e.target.value })} className="px-4 py-2.5 rounded-2xl border border-slate-200" /><input type="number" value={employee.salary} onChange={(e) => setEmployee({ ...employee, salary: e.target.value })} className="px-4 py-2.5 rounded-2xl border border-slate-200" /><select value={employee.status} onChange={(e) => setEmployee({ ...employee, status: e.target.value })} className="px-4 py-2.5 rounded-2xl border border-slate-200"><option>Active</option><option>Inactive</option><option>Resigned</option></select><input value={employee.eobi} onChange={(e) => setEmployee({ ...employee, eobi: e.target.value })} className="px-4 py-2.5 rounded-2xl border border-slate-200" /></div><div className="flex justify-end gap-2 mt-4"><Button variant="outline" className="rounded-2xl" onClick={close}>Cancel</Button><Button className="rounded-2xl" onClick={save}>Save Changes</Button></div></CardContent></Card>;
}

function PayslipCard({ row, month, close }) {
  return <Card className="rounded-2xl shadow-sm border border-slate-100 mb-6"><CardContent className="p-5"><div className="flex justify-between gap-3 mb-4"><div><h2 className="text-xl font-bold">Payslip Preview</h2><p className="text-sm text-slate-500">{row.name} • {row.employeeCode} • {month}</p></div><div className="flex gap-2"><Button variant="outline" className="rounded-2xl" onClick={() => printPayslip(row, month)}>Print / Save PDF</Button>{close && <Button variant="outline" className="rounded-2xl" onClick={close}>Close</Button>}</div></div><div className="grid grid-cols-1 md:grid-cols-2 gap-4"><div className="p-4 rounded-2xl bg-slate-50 space-y-2"><div className="flex justify-between"><span>Gross Salary</span><b>{money(row.gross)}</b></div><div className="flex justify-between"><span>Overtime</span><b>{money(row.overtimeAmount)}</b></div><div className="flex justify-between"><span>Commission</span><b>{money(row.commission)}</b></div><div className="flex justify-between"><span>Fuel/Arrears/Leave</span><b>{money(row.fuel + row.arrears + row.leaveAdjustment)}</b></div></div><div className="p-4 rounded-2xl bg-slate-50 space-y-2"><div className="flex justify-between"><span>Absent Deduction</span><b>{money(row.absentDeduction)}</b></div><div className="flex justify-between"><span>Late Deduction</span><b>{money(row.lateDeduction)}</b></div><div className="flex justify-between"><span>Loan Deduction</span><b>{money(row.loanDeduction)}</b></div><div className="border-t pt-2 flex justify-between text-lg"><span>Final Salary</span><b>{money(row.finalSalary)}</b></div></div></div></CardContent></Card>;
}

function ReportCards() {
  return <div><PageTitle title="Reports" subtitle="Export-ready HR, payroll and attendance reports." action={<Button className="rounded-2xl">Filter Reports</Button>} /><div className="grid grid-cols-1 md:grid-cols-3 gap-4">{["Monthly Salary Sheet", "Daily Attendance Report", "EOBI Registered Staff", "Contractor Staff Report", "Loan Balance Report", "Late Coming Report", "Department Salary Cost", "Branch Staff Strength", "Warning Letter Record"].map((report) => <Card key={report} className="rounded-2xl shadow-sm hover:shadow-md transition border border-slate-100"><CardContent className="p-5"><div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center text-2xl">📄</div><h3 className="font-bold mt-4">{report}</h3><p className="text-sm text-slate-500 mt-2">View, print or export to Excel/PDF.</p></CardContent></Card>)}</div></div>;
}

function ExportCenter({ employees, payroll, attendance, loans }) {
  const exports = [{ title: "Employee Master", data: employees }, { title: "Attendance", data: attendance }, { title: "Payroll", data: payroll }, { title: "Loan Balance", data: loans }];
  return <div><PageTitle title="Excel Export Center" subtitle="Download Excel-compatible CSV backups anytime." action={<Button className="rounded-2xl" onClick={() => exports.forEach((x) => downloadCSV(`${x.title}.csv`, x.data))}>Export All</Button>} /><div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">{exports.map((x) => <Card key={x.title} className="rounded-2xl shadow-sm border border-slate-100"><CardContent className="p-5"><div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center text-2xl">📊</div><h3 className="font-bold mt-4">{x.title}</h3><p className="text-sm text-slate-500 mt-2">Download {x.data.length} records.</p><Button variant="outline" className="rounded-2xl mt-4 w-full" onClick={() => downloadCSV(`${x.title}.csv`, x.data)}>Download</Button></CardContent></Card>)}</div></div>;
}

function UsersRoles() {
  return <div><PageTitle title="Users & Roles" subtitle="Master, HR, Finance and Employee access permissions." action={<Button className="rounded-2xl">+ Add User</Button>} /><Table headers={["Role", "Main Access", "Can Edit", "Cannot Access"]} rows={[{ role: "Master", access: "Everything", edit: "All settings, salary, attendance, users", block: "None" }, { role: "HR", access: "Employees, attendance, leave, warnings", edit: "Employee records and attendance corrections", block: "Payroll locking" }, { role: "Finance", access: "Payroll, loans, salary exports", edit: "Payroll review and loan deductions", block: "HR policy settings" }, { role: "Employee", access: "Own portal only", edit: "Leave and loan requests", block: "Other employees and payroll sheets" }]} renderRow={(r) => <tr key={r.role}><td className="px-4 py-3 font-bold">{r.role}</td><td className="px-4 py-3">{r.access}</td><td className="px-4 py-3">{r.edit}</td><td className="px-4 py-3">{r.block}</td></tr>} /></div>;
}
