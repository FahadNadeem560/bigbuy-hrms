import React, { useMemo, useState } from "react";
import Layout from "./components/Layout.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Employees from "./pages/Employees.jsx";
import Attendance from "./pages/Attendance.jsx";
import Payroll from "./pages/Payroll.jsx";
import Imports from "./pages/Imports.jsx";
import Policies from "./pages/Policies.jsx";
import Exports from "./pages/Exports.jsx";
import { MENU_ITEMS } from "./config/menu.js";
import { processAttendancePunch } from "./utils/attendanceRules.js";
import { calculatePayrollForEmployee } from "./utils/payrollRules.js";
import { readImportFile, validateEmployeeImportRows } from "./utils/importHelpers.js";
import { STAFF_LEVEL_POLICIES } from "./config/staffPolicies.js";
import { importEmployeeMasterBatch } from "./services/employeeService.js";

const demoUser = { name: "Fahad Nadeem", email: "fahad-nadeem@hotmail.com", role: "Master" };
const demoEmployees = [];
const demoLoans = [];
const demoAdjustments = {};
const demoRawPunches = [
  { employeeCode: "1001", name: "Demo Employee", level: "Non-Management", date: "2026-04-01", checkIn: "11:00", checkOut: "21:45", branch: "Main Branch", shiftStart: "11:00", shiftEnd: "21:30" },
];

export default function BigBuyHRMS() {
  const [active, setActive] = useState("dashboard");
  const [role, setRole] = useState("Master");
  const [query, setQuery] = useState("");
  const [branch, setBranch] = useState("All");
  const [showEmployeeForm, setShowEmployeeForm] = useState(false);
  const [newEmployee, setNewEmployee] = useState({ branch: "Main Branch", fullName: "", designation: "", department: "", level: "Non-Management", salary: "", phone: "", cnic: "", fathersCnic: "" });
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState([]);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [selectedPayslip, setSelectedPayslip] = useState(null);
  const visibleMenu = useMemo(() => MENU_ITEMS.filter((item) => item.roles.includes(role)), [role]);
  const attendanceRows = useMemo(() => demoRawPunches.map(processAttendancePunch), []);
  const payrollRows = useMemo(() => demoEmployees.map((employee) => calculatePayrollForEmployee(employee, demoAdjustments[employee.id] || {}, demoLoans)), []);

  async function onPreview() {
    setError("");
    setMessage("");
    if (!selectedFile) return setError("Please choose a CSV, XLS or XLSX file first.");
    try {
      const rows = await readImportFile(selectedFile);
      const checked = validateEmployeeImportRows(rows, STAFF_LEVEL_POLICIES);
      setPreview(checked);
      setMessage(`${checked.length} rows found.`);
    } catch (err) {
      setError(err.message);
    }
  }

  async function onImport() {
    setImporting(true);
    setError("");
    try {
      const rows = preview.filter((row) => row.valid).map((row) => ({
        employee_code: row.employee_code,
        full_name: row.name,
        designation: row.designation,
        department: row.department,
        category_department: row.category_department,
        branch: row.branch,
        staff_level: row.level,
        employee_type: row.employee_type,
        salary: row.salary === "" ? 0 : Number(row.salary),
        phone: row.phone,
        whatsapp_number: row.whatsapp_number,
        cnic: row.cnic,
        fathers_cnic: row.fathers_cnic,
        joining_date: row.joining_date,
        eobi_status: row.eobi_status,
        status: row.status,
        shift: row.shift,
      }));
      const result = await importEmployeeMasterBatch(rows, selectedFile?.name || "Employee Master Upload");
      setMessage(`${Number(result?.imported_or_updated || 0)} employees imported/updated successfully.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  }

  return (
    <Layout user={demoUser} role={role} setRole={setRole} active={active} setActive={setActive} visibleMenu={visibleMenu}>
      {active === "dashboard" && <Dashboard activeEmployees={demoEmployees} attendanceRows={attendanceRows} payrollRows={payrollRows} payrollStatus="Draft" setActive={setActive} />}
      {active === "employees" && <Employees query={query} setQuery={setQuery} branch={branch} setBranch={setBranch} showEmployeeForm={showEmployeeForm} setShowEmployeeForm={setShowEmployeeForm} newEmployee={newEmployee} setNewEmployee={setNewEmployee} saveEmployee={() => {}} editingEmployee={editingEmployee} setEditingEmployee={setEditingEmployee} updateEmployee={() => {}} loadingEmployees={false} filteredEmployees={demoEmployees} updateEmployeeStatus={() => {}} />}
      {active === "attendance" && <Attendance rows={attendanceRows} />}
      {active === "payroll" && <Payroll rows={payrollRows} selectedPayslip={selectedPayslip} setSelectedPayslip={setSelectedPayslip} payrollMonth="April 2026" PayslipCard={() => null} />}
      {active === "imports" && <Imports selectedFile={selectedFile} setSelectedFile={setSelectedFile} preview={preview} importing={importing} message={message} error={error} onPreview={onPreview} onImport={onImport} />}
      {active === "policies" && <Policies />}
      {active === "exports" && <Exports employees={demoEmployees} payroll={payrollRows} attendance={attendanceRows} loans={demoLoans} />}
    </Layout>
  );
}
