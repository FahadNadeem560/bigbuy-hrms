import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

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

function Card({ className = "", children }) {
  return <div className={`bg-white ${className}`}>{children}</div>;
}

function CardContent({ className = "", children }) {
  return <div className={className}>{children}</div>;
}

function Button({ className = "", variant = "default", children, ...props }) {
  const style =
    variant === "outline"
      ? "border border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
      : variant === "secondary"
      ? "bg-white text-slate-950 hover:bg-slate-100"
      : "bg-slate-950 text-white hover:bg-slate-800";

  return (
    <button
      className={`inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium transition ${style} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

const SUPABASE_URL = "https://rtazykuylyccptnayxgf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Zm7dA_mLxb8ci8r5loLryQ_NBx9WSoF";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const SYSTEM_CONFIG = {
  database: "Supabase Connected",
  storage: "Cloud + Excel Backup",
  attendanceSource: "ZKT Biometric Machine",
  payrollEngine: "Big Buy Custom Payroll Logic",
};

const branchCodeMap = {
  Qayyumabad: "QAD",
  "PAF Faisal": "PAF",
  Korangi: "KOR",
  Clifton: "CLF",
};

const initialEmployees = [
  { id: "QAD-001", name: "Ali Raza", branch: "Qayyumabad", dept: "Grocery", type: "Permanent", salary: 42000, eobi: "Registered", status: "Active", phone: "0300-0000001" },
  { id: "PAF-001", name: "Hassan Khan", branch: "PAF Faisal", dept: "Cash Counter", type: "Permanent", salary: 48000, eobi: "Registered", status: "Active", phone: "0300-0000002" },
  { id: "QAD-002", name: "Noman Ahmed", branch: "Qayyumabad", dept: "Garments", type: "Daily Wage", salary: 1800, eobi: "Not Applicable", status: "Active", phone: "0300-0000003" },
  { id: "PAF-002", name: "Shahzaib", branch: "PAF Faisal", dept: "Security", type: "Contractor", salary: 0, eobi: "Contractor", status: "Active", phone: "0300-0000004" },
  { id: "QAD-003", name: "Usman Tariq", branch: "Qayyumabad", dept: "Crockery", type: "Permanent", salary: 40000, eobi: "Pending", status: "Active", phone: "0300-0000005" },
];

const attendance = [
  { id: "BB-001", name: "Ali Raza", date: "Today", in: "09:57", out: "18:12", status: "Present", late: 0, ot: 1 },
  { id: "BB-002", name: "Hassan Khan", date: "Today", in: "10:21", out: "18:04", status: "Late", late: 21, ot: 0 },
  { id: "BB-003", name: "Noman Ahmed", date: "Today", in: "10:05", out: "20:15", status: "Present", late: 5, ot: 2 },
  { id: "BB-004", name: "Shahzaib", date: "Today", in: "-", out: "-", status: "Contractor", late: 0, ot: 0 },
  { id: "BB-005", name: "Usman Tariq", date: "Today", in: "-", out: "-", status: "Absent", late: 0, ot: 0 },
];

const payroll = [
  { name: "Ali Raza", gross: 42000, absent: 0, late: 0, ot: 1500, loan: 2000, net: 41500 },
  { name: "Hassan Khan", gross: 48000, absent: 0, late: 500, ot: 0, loan: 0, net: 47500 },
  { name: "Noman Ahmed", gross: 46800, absent: 0, late: 0, ot: 3600, loan: 1000, net: 49400 },
  { name: "Usman Tariq", gross: 40000, absent: 1333, late: 0, ot: 0, loan: 0, net: 38667 },
];

const loans = [
  { name: "Ali Raza", employeeCode: "QAD-001", total: 25000, monthly: 2000, paid: 8000, balance: 17000 },
  { name: "Noman Ahmed", employeeCode: "QAD-002", total: 10000, monthly: 1000, paid: 3000, balance: 7000 },
];

const payrollAdjustments = {
  "QAD-001": { presentDays: 26, absentDays: 0, lateCount: 2, otHours: 8, commission: 1500, fuel: 0, arrears: 0, leaveAdjustment: 0 },
  "PAF-001": { presentDays: 25, absentDays: 0, lateCount: 4, otHours: 2, commission: 0, fuel: 2500, arrears: 0, leaveAdjustment: 0 },
  "QAD-002": { presentDays: 26, absentDays: 0, lateCount: 1, otHours: 10, commission: 2000, fuel: 0, arrears: 0, leaveAdjustment: 0 },
  "QAD-003": { presentDays: 24, absentDays: 2, lateCount: 0, otHours: 0, commission: 0, fuel: 0, arrears: 1000, leaveAdjustment: 0 },
};

const menu = [
  { key: "dashboard", label: "Dashboard", icon: ICONS.dashboard, roles: ["Master", "HR", "Finance"] },
  { key: "employees", label: "Employees", icon: ICONS.employees, roles: ["Master", "HR"] },
  { key: "attendance", label: "Attendance", icon: ICONS.attendance, roles: ["Master", "HR", "Finance", "Employee"] },
  { key: "zkt", label: "ZKT Live Sync", icon: "🛰️", roles: ["Master", "HR"] },
  { key: "audit", label: "Attendance Audit", icon: "🕵️", roles: ["Master", "HR"] },
  { key: "payroll", label: "Payroll", icon: ICONS.payroll, roles: ["Master", "Finance"] },
  { key: "loans", label: "Loans", icon: ICONS.loans, roles: ["Master", "HR", "Finance", "Employee"] },
  { key: "rules", label: "HR Rules", icon: ICONS.rules, roles: ["Master"] },
  { key: "reports", label: "Reports", icon: ICONS.reports, roles: ["Master", "HR", "Finance"] },
  { key: "exports", label: "Excel Export", icon: "📊", roles: ["Master", "HR", "Finance"] },
  { key: "portal", label: "Employee Portal", icon: "🧑‍💼", roles: ["Master", "Employee"] },
  { key: "users", label: "Users & Roles", icon: "🔐", roles: ["Master"] },
];

function money(value) {
  return `Rs. ${Number(value || 0).toLocaleString()}`;
}

function getAttendanceSummary(attendanceRows) {
  return {
    present: attendanceRows.filter((a) => a.status === "Present" || a.status === "Late").length,
    absent: attendanceRows.filter((a) => a.status === "Absent").length,
    late: attendanceRows.filter((a) => a.status === "Late" || Number(a.late || 0) > 0).length,
  };
}

function getPayrollTotal(payrollRows) {
  return payrollRows.reduce((sum, row) => sum + Number(row.net || 0), 0);
}

function filterEmployees(employees, branch, query) {
  const q = String(query || "").toLowerCase();
  return employees.filter((e) => {
    const branchMatches = branch === "All" || e.branch === branch;
    const text = `${e.name} ${e.id} ${e.dept} ${e.type} ${e.phone}`.toLowerCase();
    return branchMatches && text.includes(q);
  });
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
  const finalSalary = monthlySalary + additions - deductions;

  return {
    employeeCode: employee.id,
    name: employee.name,
    branch: employee.branch,
    department: employee.dept,
    gross: monthlySalary,
    presentDays: Number(adjustments.presentDays || 0),
    absentDays: Number(adjustments.absentDays || 0),
    lateCount: Number(adjustments.lateCount || 0),
    otHours: Number(adjustments.otHours || 0),
    absentDeduction,
    lateDeduction,
    overtimeAmount,
    commission: Number(adjustments.commission || 0),
    fuel: Number(adjustments.fuel || 0),
    arrears: Number(adjustments.arrears || 0),
    leaveAdjustment: Number(adjustments.leaveAdjustment || 0),
    loanDeduction,
    finalSalary,
  };
}

function runBasicTests() {
  const summary = getAttendanceSummary(attendance);
  console.assert(summary.present === 3, "Expected 3 present/late employees today");
  console.assert(summary.absent === 1, "Expected 1 absent employee today");
  console.assert(summary.late === 2, "Expected 2 late-mark employees today");
  console.assert(getPayrollTotal(payroll) === 177067, "Expected payroll total to equal 177067");
  console.assert(filterEmployees(initialEmployees, "Qayyumabad", "").length === 3, "Expected 3 Qayyumabad employees");
  console.assert(filterEmployees(initialEmployees, "All", "cash").length === 1, "Expected search for cash to return 1 employee");
  console.assert(filterEmployees(initialEmployees, "PAF Faisal", "security").length === 1, "Expected PAF Faisal security search to return 1 employee");
  console.assert(initialEmployees[0].id.startsWith("QAD-"), "Expected Qayyumabad employee code to start with QAD-");
  console.assert(initialEmployees[1].id.startsWith("PAF-"), "Expected PAF Faisal employee code to start with PAF-");
  console.assert(filterEmployees(initialEmployees, "All", "0300-0000005").length === 1, "Expected phone search to return 1 employee");
  console.assert(money(1500) === "Rs. 1,500", "Expected money formatting to work");
  console.assert(money(undefined) === "Rs. 0", "Expected empty money value to show Rs. 0");
  console.assert(filterEmployees(initialEmployees, "All", "not-found").length === 0, "Expected unknown search to return 0 employees");
}

runBasicTests();

function IconBox({ children, small = false }) {
  return (
    <span className={`${small ? "h-8 w-8 text-base" : "h-12 w-12 text-2xl"} rounded-2xl bg-slate-100 flex items-center justify-center shrink-0`}>
      {children}
    </span>
  );
}

function StatCard({ title, value, sub, icon }) {
  return (
    <Card className="rounded-2xl shadow-sm border border-slate-100">
      <CardContent className="p-5 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">{title}</p>
          <h3 className="text-2xl font-bold mt-1 text-slate-900">{value}</h3>
          <p className="text-xs text-slate-400 mt-1">{sub}</p>
        </div>
        <IconBox>{icon}</IconBox>
      </CardContent>
    </Card>
  );
}

function Badge({ children, tone = "default" }) {
  const tones = {
    green: "bg-emerald-50 text-emerald-700 border-emerald-100",
    red: "bg-red-50 text-red-700 border-red-100",
    yellow: "bg-amber-50 text-amber-700 border-amber-100",
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    slate: "bg-slate-50 text-slate-700 border-slate-100",
    default: "bg-slate-50 text-slate-700 border-slate-100",
  };
  return <span className={`px-3 py-1 rounded-full text-xs border whitespace-nowrap ${tones[tone]}`}>{children}</span>;
}

function Table({ headers, rows, renderRow }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-sm">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="bg-slate-50 text-slate-500">
          <tr>{headers.map((h) => <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, i) => renderRow(row, i))}
        </tbody>
      </table>
    </div>
  );
}

function PageTitle({ title, subtitle, action }) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-slate-950">{title}</h1>
        <p className="text-slate-500 mt-1">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function StatusBadge({ status }) {
  const tone = status === "Absent" ? "red" : status === "Late" ? "yellow" : status === "Contractor" ? "blue" : "green";
  return <Badge tone={tone}>{status}</Badge>;
}

export default function BigBuyHRMS() {
  const [active, setActive] = useState("dashboard");
  const [currentUser, setCurrentUser] = useState(null);
  const [role, setRole] = useState("Master");
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [showEmployeeForm, setShowEmployeeForm] = useState(false);
  const [employeeList, setEmployeeList] = useState(initialEmployees);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [newEmployee, setNewEmployee] = useState({
    branch: "Qayyumabad",
    fullName: "",
    designation: "",
    department: "",
    salary: "",
  });
  const [query, setQuery] = useState("");
  const [branch, setBranch] = useState("All");

  const filteredEmployees = useMemo(() => filterEmployees(employeeList, branch, query), [employeeList, branch, query]);
  const summary = getAttendanceSummary(attendance);
  const payrollTotal = getPayrollTotal(payroll);
  const visibleMenu = menu.filter((item) => item.roles.includes(role));

  function demoLogin(selectedRole) {
    const demoUsers = {
      Master: { name: "Fahad Nadeem", email: "master@thebigbuy.pk", role: "Master" },
      HR: { name: "HR User", email: "hr@thebigbuy.pk", role: "HR" },
      Finance: { name: "Finance User", email: "finance@thebigbuy.pk", role: "Finance" },
      Employee: { name: "Ali Raza", email: "employee@thebigbuy.pk", role: "Employee", employeeCode: "QAD-001" },
    };

    setCurrentUser(demoUsers[selectedRole]);
    setRole(selectedRole);
    setActive(selectedRole === "Employee" ? "portal" : "dashboard");
  }

  function handleLogin(e) {
    e.preventDefault();
    const email = loginForm.email.toLowerCase().trim();

    if (email.includes("hr")) return demoLogin("HR");
    if (email.includes("finance") || email.includes("accounts")) return demoLogin("Finance");
    if (email.includes("employee") || email.includes("staff")) return demoLogin("Employee");
    return demoLogin("Master");
  }

  function logout() {
    setCurrentUser(null);
    setRole("Master");
    setActive("dashboard");
  }
  const portalEmployee = employeeList[0] || initialEmployees[0];

  useEffect(() => {
    async function loadEmployees() {
      setLoadingEmployees(true);

      const { data, error } = await supabase
        .from("employees")
        .select("*")
        .order("created_at", { ascending: true });

      if (!error && data && data.length > 0) {
        const formatted = data.map((emp) => ({
          id: emp.employee_code,
          name: emp.full_name,
          branch: emp.branch,
          dept: emp.department,
          type: emp.employee_type,
          salary: emp.salary,
          eobi: emp.eobi_status || "Pending",
          status: emp.status || "Active",
          phone: emp.phone || "-",
        }));

        setEmployeeList(formatted);
      }

      setLoadingEmployees(false);
    }

    loadEmployees();
  }, []);

  async function updateEmployeeStatus(employeeId, newStatus) {
    const { error } = await supabase
      .from("employees")
      .update({ status: newStatus })
      .eq("employee_code", employeeId);

    if (error) {
      alert(`Status Update Failed: ${error.message}`);
      return;
    }

    setEmployeeList((prev) =>
      prev.map((emp) =>
        emp.id === employeeId ? { ...emp, status: newStatus } : emp
      )
    );

    alert(`Employee ${employeeId} marked as ${newStatus}.`);
  }

  async function updateEmployee() {
    if (!editingEmployee) return;

    const payload = {
      full_name: editingEmployee.name,
      branch: editingEmployee.branch,
      department: editingEmployee.dept,
      salary: Number(editingEmployee.salary || 0),
      eobi_status: editingEmployee.eobi,
      status: editingEmployee.status,
    };

    const { error } = await supabase
      .from("employees")
      .update(payload)
      .eq("employee_code", editingEmployee.id);

    if (error) {
      alert(`Update Failed: ${error.message}`);
      return;
    }

    setEmployeeList((prev) =>
      prev.map((emp) =>
        emp.id === editingEmployee.id ? editingEmployee : emp
      )
    );

    setEditingEmployee(null);
    alert(`Employee ${editingEmployee.id} updated successfully.`);
  }

  async function saveEmployee() {
    const branchPrefix = branchCodeMap[newEmployee.branch] || "EMP";
    const nextNumber = String(employeeList.length + 1).padStart(3, "0");
    const employeeCode = `${branchPrefix}-${nextNumber}`;

    const payload = {
      employee_code: employeeCode,
      full_name: newEmployee.fullName,
      designation: newEmployee.designation,
      department: newEmployee.department,
      branch: newEmployee.branch,
      employee_type: "Permanent",
      salary: Number(newEmployee.salary || 0),
      eobi_status: "Pending",
      status: "Active",
    };

    const { error } = await supabase.from("employees").insert(payload);

    if (error) {
      alert(`Error: ${error.message}`);
      return;
    }

    setEmployeeList((prev) => [
      ...prev,
      {
        id: employeeCode,
        name: newEmployee.fullName,
        branch: newEmployee.branch,
        dept: newEmployee.department,
        type: "Permanent",
        salary: Number(newEmployee.salary || 0),
        eobi: "Pending",
        status: "Active",
        phone: "-",
      },
    ]);

    setNewEmployee({
      branch: "Qayyumabad",
      fullName: "",
      designation: "",
      department: "",
      salary: "",
    });

    setShowEmployeeForm(false);
    alert(`Employee ${employeeCode} added successfully.`);
  }

  React.useEffect(() => {
    if (!visibleMenu.some((item) => item.key === active)) {
      setActive(visibleMenu[0]?.key || "dashboard");
    }
  }, [role]);

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md rounded-3xl shadow-xl border border-slate-100">
          <CardContent className="p-8">
            <div className="text-center mb-8">
              <div className="mx-auto h-16 w-16 rounded-3xl bg-slate-950 text-white flex items-center justify-center text-3xl mb-4">🏢</div>
              <h1 className="text-3xl font-bold text-slate-950">Big Buy HRMS</h1>
              <p className="text-slate-500 mt-2">Secure staff, attendance and payroll portal</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-600">Email / Employee ID</label>
                <input
                  value={loginForm.email}
                  onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                  placeholder="example: hr@thebigbuy.pk"
                  className="mt-1 w-full px-4 py-3 rounded-2xl border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-slate-200"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-600">Password</label>
                <input
                  type="password"
                  value={loginForm.password}
                  onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                  placeholder="Enter password"
                  className="mt-1 w-full px-4 py-3 rounded-2xl border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-slate-200"
                />
              </div>

              <Button className="w-full rounded-2xl py-3" type="submit">Login</Button>
            </form>

            <div className="mt-6">
              <p className="text-xs text-slate-400 mb-3 text-center">Testing shortcuts</p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="rounded-2xl" onClick={() => demoLogin("Master")}>Master</Button>
                <Button variant="outline" className="rounded-2xl" onClick={() => demoLogin("HR")}>HR</Button>
                <Button variant="outline" className="rounded-2xl" onClick={() => demoLogin("Finance")}>Finance</Button>
                <Button variant="outline" className="rounded-2xl" onClick={() => demoLogin("Employee")}>Employee</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="flex">
        <aside className="hidden lg:flex w-72 min-h-screen bg-slate-950 text-white p-5 flex-col">
          <div className="mb-8">
            <div className="text-2xl font-bold">Big Buy HRMS</div>
            <div className="text-slate-400 text-sm mt-1">Staff • Attendance • Payroll</div>
          </div>
          <nav className="space-y-2">
            {visibleMenu.map((item) => (
              <button
                key={item.key}
                onClick={() => setActive(item.key)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition ${active === item.key ? "bg-white text-slate-950" : "text-slate-300 hover:bg-slate-900"}`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
          <div className="mt-auto p-4 bg-slate-900 rounded-2xl">
            <div className="text-sm font-semibold">{currentUser.name}</div>
            <div className="text-xs text-slate-400 mt-1">Role: {role}</div>
            <Button variant="secondary" className="rounded-xl w-full mt-3" onClick={logout}>Logout</Button>
          </div>
        </aside>

        <main className="flex-1 p-4 md:p-8">
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 mb-4">
            <Card className="rounded-2xl shadow-sm border border-slate-100 xl:col-span-3">
              <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <div className="font-bold text-slate-950">Logged in: {currentUser.name}</div>
                  <div className="text-sm text-slate-500">Role: {role} • {currentUser.email}</div>
                </div>
                <div className="flex gap-2 items-center">
                  {currentUser.role === "Master" && (
                    <select value={role} onChange={(e) => setRole(e.target.value)} className="px-4 py-2.5 rounded-2xl border border-slate-200 bg-white outline-none">
                      <option>Master</option>
                      <option>HR</option>
                      <option>Finance</option>
                      <option>Employee</option>
                    </select>
                  )}
                  <Button variant="outline" className="rounded-2xl" onClick={logout}>Logout</Button>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl shadow-sm border border-slate-100">
              <CardContent className="p-4">
                <div className="font-bold text-slate-950 mb-3">System Status</div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span>Database</span><Badge tone="green">{SYSTEM_CONFIG.database}</Badge></div>
                  <div className="flex justify-between"><span>Storage</span><Badge tone="blue">Cloud Ready</Badge></div>
                  <div className="flex justify-between"><span>Attendance</span><Badge tone="yellow">ZKT Ready</Badge></div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:hidden mb-4 bg-slate-950 text-white rounded-2xl p-4">
            <div className="font-bold text-xl">Big Buy HRMS</div>
            <div className="flex gap-2 overflow-x-auto mt-4 pb-1">
              {visibleMenu.map((item) => (
                <Button key={item.key} onClick={() => setActive(item.key)} variant="secondary" className="rounded-xl whitespace-nowrap">
                  {item.icon} {item.label}
                </Button>
              ))}
            </div>
          </div>

          {active === "dashboard" && (
            <div>
              <PageTitle
                title="HR Dashboard"
                subtitle="Today’s staff position, payroll snapshot and branch control."
                action={<Button className="rounded-2xl"><span>{ICONS.add}</span> Add Employee</Button>}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
                <StatCard title="Total Active Staff" value={employeeList.length} sub="Across all branches" icon={ICONS.employees} />
                <StatCard title="Present Today" value={summary.present} sub={`${summary.absent} absent today`} icon={ICONS.check} />
                <StatCard title="Late Marks" value={summary.late} sub="Needs manager review" icon={ICONS.warning} />
                <StatCard title="Net Payroll" value={money(payrollTotal)} sub="Current month estimate" icon={ICONS.payroll} />
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <Card className="rounded-2xl shadow-sm xl:col-span-2">
                  <CardContent className="p-5">
                    <h2 className="text-lg font-bold mb-4">Today Attendance</h2>
                    <Table
                      headers={["Employee", "In", "Out", "Status", "Late", "OT"]}
                      rows={attendance}
                      renderRow={(a) => (
                        <tr key={a.id}>
                          <td className="px-4 py-3 font-medium">{a.name}</td>
                          <td className="px-4 py-3">{a.in}</td>
                          <td className="px-4 py-3">{a.out}</td>
                          <td className="px-4 py-3"><StatusBadge status={a.status} /></td>
                          <td className="px-4 py-3">{a.late} min</td>
                          <td className="px-4 py-3">{a.ot} hr</td>
                        </tr>
                      )}
                    />
                  </CardContent>
                </Card>

                <Card className="rounded-2xl shadow-sm">
                  <CardContent className="p-5">
                    <h2 className="text-lg font-bold mb-4">Branch Summary</h2>
                    <div className="space-y-3">
                      <div className="flex justify-between p-3 bg-slate-50 rounded-xl"><span>Qayyumabad</span><b>3 Staff</b></div>
                      <div className="flex justify-between p-3 bg-slate-50 rounded-xl"><span>PAF Faisal</span><b>2 Staff</b></div>
                      <div className="flex justify-between p-3 bg-slate-50 rounded-xl"><span>Contractor Staff</span><b>1</b></div>
                      <div className="flex justify-between p-3 bg-slate-50 rounded-xl"><span>EOBI Pending</span><b>1</b></div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {active === "employees" && (
            <div>
              <PageTitle
                title="Employee Master"
                subtitle="Complete staff record with CNIC, branch, salary type and EOBI status."
                action={<Button className="rounded-2xl" onClick={() => setShowEmployeeForm(true)}><span>{ICONS.add}</span> New Employee</Button>}
              />
              <div className="flex flex-col md:flex-row gap-3 mb-4">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-2.5 text-slate-400">{ICONS.search}</span>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search employee, department, ID..."
                    className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-slate-200"
                  />
                </div>
                <select value={branch} onChange={(e) => setBranch(e.target.value)} className="px-4 py-2.5 rounded-2xl border border-slate-200 bg-white outline-none">
                  <option>All</option>
                  <option>Qayyumabad</option>
                  <option>PAF Faisal</option>
                </select>
              </div>
              {editingEmployee && (
                <Card className="rounded-2xl shadow-sm border border-slate-100 mb-4">
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-lg font-bold">Edit Employee</h2>
                      <Button variant="outline" className="rounded-2xl" onClick={() => setEditingEmployee(null)}>
                        Close
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
                      <input value={editingEmployee.id} disabled className="px-4 py-2.5 rounded-2xl border border-slate-200 bg-slate-100 outline-none" />

                      <input
                        value={editingEmployee.name}
                        onChange={(e) => setEditingEmployee({ ...editingEmployee, name: e.target.value })}
                        className="px-4 py-2.5 rounded-2xl border border-slate-200 bg-white outline-none"
                      />

                      <input
                        value={editingEmployee.dept}
                        onChange={(e) => setEditingEmployee({ ...editingEmployee, dept: e.target.value })}
                        className="px-4 py-2.5 rounded-2xl border border-slate-200 bg-white outline-none"
                      />

                      <input
                        type="number"
                        value={editingEmployee.salary}
                        onChange={(e) => setEditingEmployee({ ...editingEmployee, salary: e.target.value })}
                        className="px-4 py-2.5 rounded-2xl border border-slate-200 bg-white outline-none"
                      />

                      <select
                        value={editingEmployee.status}
                        onChange={(e) => setEditingEmployee({ ...editingEmployee, status: e.target.value })}
                        className="px-4 py-2.5 rounded-2xl border border-slate-200 bg-white outline-none"
                      >
                        <option>Active</option>
                        <option>Inactive</option>
                        <option>Resigned</option>
                      </select>
                    </div>

                    <div className="flex justify-end gap-2 mt-4">
                      <Button variant="outline" className="rounded-2xl" onClick={() => setEditingEmployee(null)}>
                        Cancel
                      </Button>
                      <Button className="rounded-2xl" onClick={updateEmployee}>
                        Save Changes
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {showEmployeeForm && (
                <Card className="rounded-2xl shadow-sm border border-slate-100 mb-4">
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-lg font-bold">Add New Employee</h2>
                      <Button variant="outline" className="rounded-2xl" onClick={() => setShowEmployeeForm(false)}>
                        Close
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
                      <select
                        value={newEmployee.branch}
                        onChange={(e) => setNewEmployee({ ...newEmployee, branch: e.target.value })}
                        className="px-4 py-2.5 rounded-2xl border border-slate-200 bg-white outline-none"
                      >
                        {Object.keys(branchCodeMap).map((branchName) => (
                          <option key={branchName}>{branchName}</option>
                        ))}
                      </select>

                      <input
                        placeholder="Full Name"
                        value={newEmployee.fullName}
                        onChange={(e) => setNewEmployee({ ...newEmployee, fullName: e.target.value })}
                        className="px-4 py-2.5 rounded-2xl border border-slate-200 bg-white outline-none"
                      />

                      <input
                        placeholder="Designation"
                        value={newEmployee.designation}
                        onChange={(e) => setNewEmployee({ ...newEmployee, designation: e.target.value })}
                        className="px-4 py-2.5 rounded-2xl border border-slate-200 bg-white outline-none"
                      />

                      <input
                        placeholder="Department"
                        value={newEmployee.department}
                        onChange={(e) => setNewEmployee({ ...newEmployee, department: e.target.value })}
                        className="px-4 py-2.5 rounded-2xl border border-slate-200 bg-white outline-none"
                      />

                      <input
                        type="number"
                        placeholder="Salary"
                        value={newEmployee.salary}
                        onChange={(e) => setNewEmployee({ ...newEmployee, salary: e.target.value })}
                        className="px-4 py-2.5 rounded-2xl border border-slate-200 bg-white outline-none"
                      />
                    </div>

                    <div className="flex justify-end mt-4">
                      <Button className="rounded-2xl" onClick={saveEmployee}>
                        <span>{ICONS.add}</span>
                        Save Employee
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {loadingEmployees && (
                <div className="mb-4 text-sm text-slate-500">Loading employees from database...</div>
              )}

              <Table headers={["ID", "Name", "Branch", "Department", "Type", "Salary", "EOBI", "Status"]}
                rows={filteredEmployees}
                renderRow={(e) => (
                  <tr key={e.id}>
                    <td className="px-4 py-3 font-medium">{e.id}</td>
                    <td className="px-4 py-3">{e.name}<div className="text-xs text-slate-400">{e.phone}</div></td>
                    <td className="px-4 py-3">{e.branch}</td>
                    <td className="px-4 py-3">{e.dept}</td>
                    <td className="px-4 py-3"><Badge tone={e.type === "Permanent" ? "green" : e.type === "Contractor" ? "blue" : "yellow"}>{e.type}</Badge></td>
                    <td className="px-4 py-3">{e.salary ? money(e.salary) : "As per bill"}</td>
                    <td className="px-4 py-3">{e.eobi}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Badge tone={e.status === "Active" ? "green" : e.status === "Inactive" ? "yellow" : "red"}>{e.status}</Badge>
                        <Button
                          variant="outline"
                          className="rounded-xl px-2 py-1 text-xs"
                          onClick={() => setEditingEmployee(e)}
                        >
                          Edit
                        </Button>
                        {e.status === "Active" && (
                          <Button
                            variant="outline"
                            className="rounded-xl px-2 py-1 text-xs"
                            onClick={() => updateEmployeeStatus(e.id, "Inactive")}
                          >
                            Inactive
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              />
            </div>
          )}

          {active === "zkt" && (
            <div>
              <PageTitle
                title="ZKT Live Attendance Sync"
                subtitle="Connect biometric devices directly with Big Buy HRMS for automatic attendance processing."
                action={<Button className="rounded-2xl">Connect Device</Button>}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
                <StatCard title="Connected Devices" value="2" sub="Qayyumabad + PAF Faisal" icon="🛰️" />
                <StatCard title="Last Sync" value="2 mins ago" sub="Automatic cloud sync active" icon="🔄" />
                <StatCard title="Today's Logs" value="428" sub="Biometric punches received" icon="📡" />
                <StatCard title="Sync Status" value="LIVE" sub="Real-time attendance enabled" icon="🟢" />
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <Card className="rounded-2xl shadow-sm border border-slate-100">
                  <CardContent className="p-5">
                    <h2 className="text-lg font-bold mb-4">Connected Devices</h2>
                    <Table
                      headers={["Branch", "Device Name", "IP Address", "Status", "Last Sync"]}
                      rows={[
                        { branch: "Qayyumabad", device: "ZKTeco MB560", ip: "192.168.1.10", status: "Online", sync: "2 mins ago" },
                        { branch: "PAF Faisal", device: "ZKTeco K40", ip: "192.168.1.11", status: "Online", sync: "4 mins ago" },
                      ]}
                      renderRow={(d) => (
                        <tr key={d.branch}>
                          <td className="px-4 py-3 font-medium">{d.branch}</td>
                          <td className="px-4 py-3">{d.device}</td>
                          <td className="px-4 py-3">{d.ip}</td>
                          <td className="px-4 py-3"><Badge tone="green">{d.status}</Badge></td>
                          <td className="px-4 py-3">{d.sync}</td>
                        </tr>
                      )}
                    />
                  </CardContent>
                </Card>

                <Card className="rounded-2xl shadow-sm border border-slate-100">
                  <CardContent className="p-5">
                    <h2 className="text-lg font-bold mb-4">Attendance Rules Engine</h2>
                    <div className="space-y-3">
                      <div className="p-4 rounded-2xl bg-slate-50 flex justify-between"><span>Grace Time</span><Badge tone="blue">15 Minutes</Badge></div>
                      <div className="p-4 rounded-2xl bg-slate-50 flex justify-between"><span>3 Late Arrivals</span><Badge tone="yellow">1 Day Deduction</Badge></div>
                      <div className="p-4 rounded-2xl bg-slate-50 flex justify-between"><span>Short Hours</span><Badge tone="red">Half Day After 1.5 Hours</Badge></div>
                      <div className="p-4 rounded-2xl bg-slate-50 flex justify-between"><span>Overtime Eligibility</span><Badge tone="green">After 10.5 Hours</Badge></div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {active === "audit" && (
            <div>
              <PageTitle
                title="Attendance Audit Center"
                subtitle="Track attendance edits, overtime approvals and manual attendance modifications."
                action={<Button className="rounded-2xl">Export Audit Logs</Button>}
              />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <StatCard title="Manual Attendance Edits" value="14" sub="This month" icon="✏️" />
                <StatCard title="Pending OT Approvals" value="7" sub="Require review" icon="⏱️" />
                <StatCard title="Suspicious Changes" value="2" sub="Audit recommended" icon="⚠️" />
              </div>

              <Table
                headers={["Date", "Employee", "Action", "Performed By", "Reason", "Status"]}
                rows={[
                  { date: "19-May-2026", employee: "QAD-001", action: "Check-in Edited", by: "HR User", reason: "Machine missed punch", status: "Approved" },
                  { date: "19-May-2026", employee: "PAF-001", action: "OT Approved", by: "Master User", reason: "Extra stock audit work", status: "Approved" },
                  { date: "18-May-2026", employee: "QAD-002", action: "Manual Present Marked", by: "HR User", reason: "Device offline", status: "Pending Review" },
                ]}
                renderRow={(a, index) => (
                  <tr key={index}>
                    <td className="px-4 py-3">{a.date}</td>
                    <td className="px-4 py-3 font-medium">{a.employee}</td>
                    <td className="px-4 py-3">{a.action}</td>
                    <td className="px-4 py-3">{a.by}</td>
                    <td className="px-4 py-3">{a.reason}</td>
                    <td className="px-4 py-3">
                      <Badge tone={a.status === "Approved" ? "green" : "yellow"}>{a.status}</Badge>
                    </td>
                  </tr>
                )}
              />
            </div>
          )}

          {active === "attendance" && (
            <div>
              <PageTitle
                title="Attendance"
                subtitle="Daily attendance with late marks, overtime and correction approval."
                action={<div className="flex gap-2"><Button variant="outline" className="rounded-2xl"><span>{ICONS.calendar}</span> Today</Button><Button className="rounded-2xl">Mark Attendance</Button></div>}
              />
              <Table
                headers={["Employee", "Date", "Check In", "Check Out", "Status", "Late", "Overtime", "Approval"]}
                rows={attendance}
                renderRow={(a) => (
                  <tr key={a.id}>
                    <td className="px-4 py-3 font-medium">{a.name}</td>
                    <td className="px-4 py-3">{a.date}</td>
                    <td className="px-4 py-3">{a.in}</td>
                    <td className="px-4 py-3">{a.out}</td>
                    <td className="px-4 py-3"><StatusBadge status={a.status} /></td>
                    <td className="px-4 py-3">{a.late} min</td>
                    <td className="px-4 py-3">{a.ot} hr</td>
                    <td className="px-4 py-3"><Badge tone="slate">Pending</Badge></td>
                  </tr>
                )}
              />
            </div>
          )}

          {active === "payroll" && (
            <div>
              <PageTitle
                title="Payroll Generator"
                subtitle="Generate salaries automatically from attendance, overtime, loans and allowances."
                action={
                  <div className="flex gap-2 flex-wrap">
                    <Button variant="outline" className="rounded-2xl">
                      <span>{ICONS.calendar}</span>
                      April 2026
                    </Button>
                    <Button className="rounded-2xl">
                      <span>{ICONS.export}</span>
                      Export Payroll
                    </Button>
                  </div>
                }
              />

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <StatCard title="Payroll Staff" value={employeeList.filter((e) => e.status === "Active").length} sub="Active employees" icon="👥" />
                <StatCard title="Total Payroll" value={money(payroll.reduce((sum, p) => sum + p.net, 0))} sub="Estimated net payout" icon="💰" />
                <StatCard title="Loan Deductions" value={money(loans.reduce((sum, l) => sum + l.monthly, 0))} sub="Monthly recoveries" icon="💳" />
                <StatCard title="Overtime Cost" value={money(payroll.reduce((sum, p) => sum + p.ot, 0))} sub="Current month OT" icon="⏱️" />
              </div>

              <Table
                headers={["Employee", "Gross Salary", "Present", "Absent", "Late", "OT Hours", "Allowances", "Loan", "Net Payable", "Payslip"]}
                rows={employeeList.filter((e) => e.status === "Active" && e.type !== "Contractor")}
                renderRow={(employee) => {
                  const adjustments = payrollAdjustments[employee.id] || {};
                  const calculated = calculatePayrollForEmployee(employee, adjustments, loans);

                  return (
                    <tr key={employee.id}>
                      <td className="px-4 py-3 font-medium">
                        {employee.name}
                        <div className="text-xs text-slate-400">{employee.id}</div>
                      </td>
                      <td className="px-4 py-3">{money(calculated.gross)}</td>
                      <td className="px-4 py-3">{calculated.presentDays}</td>
                      <td className="px-4 py-3">{calculated.absentDays}</td>
                      <td className="px-4 py-3">{calculated.lateCount}</td>
                      <td className="px-4 py-3">{calculated.otHours}</td>
                      <td className="px-4 py-3">{money(calculated.commission + calculated.fuel + calculated.arrears + calculated.leaveAdjustment + calculated.overtimeAmount)}</td>
                      <td className="px-4 py-3">{money(calculated.loanDeduction)}</td>
                      <td className="px-4 py-3 font-bold">{money(calculated.finalSalary)}</td>
                      <td className="px-4 py-3">
                        <Button variant="outline" className="rounded-xl px-3 py-1 text-xs">View</Button>
                      </td>
                    </tr>
                  );
                }}
              />
            </div>
          )}

          {active === "loans" && (
            <div>
              <PageTitle
                title="Loans & Advances"
                subtitle="Track employee advances, monthly deductions and remaining balances."
                action={<Button className="rounded-2xl"><span>{ICONS.add}</span> Add Loan</Button>}
              />
              <Table
                headers={["Employee", "Total Loan", "Monthly Deduction", "Paid", "Balance"]}
                rows={loans}
                renderRow={(l) => (
                  <tr key={l.name}>
                    <td className="px-4 py-3 font-medium">{l.name}</td>
                    <td className="px-4 py-3">{money(l.total)}</td>
                    <td className="px-4 py-3">{money(l.monthly)}</td>
                    <td className="px-4 py-3">{money(l.paid)}</td>
                    <td className="px-4 py-3 font-bold">{money(l.balance)}</td>
                  </tr>
                )}
              />
            </div>
          )}

          {active === "rules" && (
            <div>
              <PageTitle
                title="HR Rules Setup"
                subtitle="This section will control your salary formulas and company policy."
                action={<Button className="rounded-2xl">Save Rules</Button>}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  "Grace time before late mark",
                  "Late deduction formula",
                  "Absent deduction formula",
                  "Overtime rate",
                  "EOBI contribution logic",
                  "Contractor staff exclusion",
                  "Loan deduction limit",
                  "Branch manager approval rights",
                ].map((rule, index) => (
                  <Card key={rule} className="rounded-2xl shadow-sm border border-slate-100">
                    <CardContent className="p-5">
                      <div className="flex items-start gap-3">
                        <IconBox small>{ICONS.rules}</IconBox>
                        <div>
                          <h3 className="font-bold">{rule}</h3>
                          <p className="text-sm text-slate-500 mt-1">Rule #{index + 1} can be customized according to Big Buy policy.</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {active === "exports" && (
            <div>
              <PageTitle
                title="Excel Export Center"
                subtitle="Cloud system will remain live, but HR and Finance can download Excel backups anytime."
                action={<Button className="rounded-2xl"><span>{ICONS.export}</span> Export All</Button>}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {[
                  { title: "Employee Master Export", desc: "Branch-wise employee list with QAD/PAF codes." },
                  { title: "Attendance Export", desc: "Daily, weekly or monthly biometric attendance." },
                  { title: "Payroll Export", desc: "Salary sheet for Finance verification." },
                  { title: "Loan Balance Export", desc: "Employee loan deductions and remaining balances." },
                  { title: "Leave Balance Export", desc: "Opening, availed and remaining leaves." },
                  { title: "EOBI Staff Export", desc: "Registered, pending and contractor status." },
                ].map((item) => (
                  <Card key={item.title} className="rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition">
                    <CardContent className="p-5">
                      <IconBox>📊</IconBox>
                      <h3 className="font-bold mt-4">{item.title}</h3>
                      <p className="text-sm text-slate-500 mt-2">{item.desc}</p>
                      <Button variant="outline" className="rounded-2xl mt-4 w-full"><span>{ICONS.export}</span> Download Excel</Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <Card className="rounded-2xl shadow-sm border border-slate-100 mt-6">
                <CardContent className="p-5">
                  <h2 className="text-lg font-bold mb-3">Branch-wise Employee Code Format</h2>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    {Object.entries(branchCodeMap).map(([branchName, code]) => (
                      <div key={branchName} className="p-4 rounded-2xl bg-slate-50">
                        <div className="text-sm text-slate-500">{branchName}</div>
                        <div className="font-bold text-xl mt-1">{code}-001</div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {active === "portal" && (
            <div>
              <PageTitle
                title="Employee Self-Service Portal"
                subtitle="Each employee will only see their own attendance, salary slip, leaves and loan balance."
                action={<Button className="rounded-2xl">Apply Leave</Button>}
              />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <StatCard title="Employee" value={portalEmployee.name} sub={portalEmployee.id} icon="🧑‍💼" />
                <StatCard title="This Month Late Marks" value="2" sub="1 more late may trigger deduction" icon={ICONS.warning} />
                <StatCard title="Loan Balance" value="Rs. 17,000" sub="Monthly deduction Rs. 2,000" icon={ICONS.loans} />
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <Card className="rounded-2xl shadow-sm border border-slate-100">
                  <CardContent className="p-5">
                    <h2 className="text-lg font-bold mb-4">My Attendance</h2>
                    <Table
                      headers={["Date", "Check In", "Check Out", "Status", "Late", "OT"]}
                      rows={attendance.filter((a) => a.id === portalEmployee.id)}
                      renderRow={(a) => (
                        <tr key={a.id}>
                          <td className="px-4 py-3">{a.date}</td>
                          <td className="px-4 py-3">{a.in}</td>
                          <td className="px-4 py-3">{a.out}</td>
                          <td className="px-4 py-3"><StatusBadge status={a.status} /></td>
                          <td className="px-4 py-3">{a.late} min</td>
                          <td className="px-4 py-3">{a.ot} hr</td>
                        </tr>
                      )}
                    />
                  </CardContent>
                </Card>
                <Card className="rounded-2xl shadow-sm border border-slate-100">
                  <CardContent className="p-5">
                    <h2 className="text-lg font-bold mb-4">My Requests</h2>
                    <div className="space-y-3">
                      <div className="p-4 rounded-2xl bg-slate-50 flex justify-between"><span>Leave Application</span><Badge tone="slate">Not Submitted</Badge></div>
                      <div className="p-4 rounded-2xl bg-slate-50 flex justify-between"><span>Loan Request</span><Badge tone="yellow">Eligibility Check</Badge></div>
                      <div className="p-4 rounded-2xl bg-slate-50 flex justify-between"><span>Salary Slip</span><Badge tone="green">Available</Badge></div>
                      <div className="p-4 rounded-2xl bg-slate-50 flex justify-between"><span>Company Policies</span><Badge tone="blue">Read Only</Badge></div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {active === "users" && (
            <div>
              <PageTitle
                title="Users & Roles"
                subtitle="Control what Master, HR, Finance and Employee users can see or edit."
                action={<Button className="rounded-2xl"><span>{ICONS.add}</span> Add User</Button>}
              />
              <Table
                headers={["Role", "Main Access", "Can Edit", "Cannot Access"]}
                rows={[
                  { role: "Master", access: "Everything", edit: "All settings, salary, attendance, users", block: "None" },
                  { role: "HR", access: "Employees, attendance, leaves, warnings", edit: "Employee records and attendance corrections", block: "Payroll settings and finance approval" },
                  { role: "Finance", access: "Payroll, loans, salary exports, reports", edit: "Payroll approval and loan deductions", block: "HR policy settings" },
                  { role: "Employee", access: "Own portal only", edit: "Leave and loan requests", block: "Other employees, payroll sheets, admin data" },
                ]}
                renderRow={(r) => (
                  <tr key={r.role}>
                    <td className="px-4 py-3 font-bold">{r.role}</td>
                    <td className="px-4 py-3">{r.access}</td>
                    <td className="px-4 py-3">{r.edit}</td>
                    <td className="px-4 py-3">{r.block}</td>
                  </tr>
                )}
              />
            </div>
          )}

          {active === "reports" && (
            <div>
              <PageTitle
                title="Reports"
                subtitle="Export-ready reports for HR, Accounts, EOBI and branch managers."
                action={<Button className="rounded-2xl"><span>{ICONS.filter}</span> Filter Reports</Button>}
              />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  "Monthly Salary Sheet",
                  "Daily Attendance Report",
                  "EOBI Registered Staff",
                  "Contractor Staff Report",
                  "Loan Balance Report",
                  "Late Coming Report",
                  "Department Salary Cost",
                  "Branch Staff Strength",
                  "Warning Letter Record",
                ].map((report) => (
                  <Card key={report} className="rounded-2xl shadow-sm hover:shadow-md transition border border-slate-100">
                    <CardContent className="p-5">
                      <IconBox>{ICONS.reports}</IconBox>
                      <h3 className="font-bold mt-4">{report}</h3>
                      <p className="text-sm text-slate-500 mt-2">View, print or export to Excel/PDF.</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
