import React, { useEffect, useMemo, useState } from "react";
import Layout from "./components/Layout.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Employees from "./pages/Employees.jsx";
import Attendance from "./pages/Attendance.jsx";
import Payroll from "./pages/Payroll.jsx";
import Imports from "./pages/Imports.jsx";
import Policies from "./pages/Policies.jsx";
import Exports from "./pages/Exports.jsx";
import ZKTSync from "./pages/ZKTSync.jsx";
import { MENU_ITEMS } from "./config/menu.js";
import { processAttendancePunch } from "./utils/attendanceRules.js";
import { calculatePayrollForEmployee } from "./utils/payrollRules.js";
import { readImportFile, validateEmployeeImportRows } from "./utils/importHelpers.js";
import { STAFF_LEVEL_POLICIES } from "./config/staffPolicies.js";
import { fetchEmployees, createEmployee, updateEmployeeByCode, importEmployeeMasterBatch } from "./services/employeeService.js";

const demoUser = { name: "Fahad Nadeem", email: "fahad-nadeem@hotmail.com", role: "Master" };
const demoLoans = [];
const demoAdjustments = {};
const demoRawPunches = [
  { employeeCode: "1001", name: "Demo Employee", level: "Non-Management", date: "2026-04-01", checkIn: "11:00", checkOut: "21:45", branch: "Main Branch", shiftStart: "11:00", shiftEnd: "21:30" },
];

export default function BigBuyHRMS() {
  const [active, setActive] = useState("dashboard");
  const [role, setRole] = useState("Master");
  const [employees, setEmployees] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
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
  const filteredEmployees = useMemo(() => employees.filter((employee) => (branch === "All" || employee.branch === branch) && `${employee.name} ${employee.id} ${employee.dept} ${employee.phone}`.toLowerCase().includes(query.toLowerCase())), [employees, branch, query]);
  const activeEmployees = useMemo(() => employees.filter((employee) => employee.status === "Active"), [employees]);
  const payrollRows = useMemo(() => activeEmployees.map((employee) => calculatePayrollForEmployee(employee, demoAdjustments[employee.id] || {}, demoLoans)), [activeEmployees]);

  async function loadEmployees() {
    setLoadingEmployees(true);
    try {
      const rows = await fetchEmployees();
      setEmployees(rows);
    } catch (err) {
      setError(`Employee load failed: ${err.message}`);
    } finally {
      setLoadingEmployees(false);
    }
  }

  useEffect(() => { loadEmployees(); }, []);

  async function saveEmployee() {
    const code = `EMP-${String(Date.now()).slice(-6)}`;
    const payload = { employee_code: code, full_name: newEmployee.fullName, designation: newEmployee.designation, department: newEmployee.department, branch: newEmployee.branch, staff_level: newEmployee.level, employee_type: "Permanent", salary: Number(newEmployee.salary || 0), phone: newEmployee.phone, whatsapp_number: newEmployee.phone, cnic: newEmployee.cnic, fathers_cnic: newEmployee.fathersCnic, eobi_status: "Pending", status: "Active" };
    try {
      await createEmployee(payload);
      await loadEmployees();
      setShowEmployeeForm(false);
    } catch (err) {
      setError(`Save failed: ${err.message}`);
    }
  }

  async function updateEmployee() {
    if (!editingEmployee) return;
    try {
      await updateEmployeeByCode(editingEmployee.id, { full_name: editingEmployee.name, department: editingEmployee.dept, branch: editingEmployee.branch, staff_level: editingEmployee.level, salary: Number(editingEmployee.salary || 0), status: editingEmployee.status });
      await loadEmployees();
      setEditingEmployee(null);
    } catch (err) {
      setError(`Update failed: ${err.message}`);
    }
  }

  async function updateEmployeeStatus(id, status) {
    try {
      await updateEmployeeByCode(id, { status });
      await loadEmployees();
    } catch (err) {
      setError(`Status update failed: ${err.message}`);
    }
  }

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
      const rows = preview.filter((row) => row.valid).map((row) => ({ employee_code: row.employee_code, full_name: row.name, designation: row.designation, department: row.department, category_department: row.category_department, branch: row.branch, staff_level: row.level, employee_type: row.employee_type, salary: row.salary === "" ? 0 : Number(row.salary), phone: row.phone, whatsapp_number: row.whatsapp_number, cnic: row.cnic, fathers_cnic: row.fathers_cnic, joining_date: row.joining_date, eobi_status: row.eobi_status, status: row.status, shift: row.shift }));
      const result = await importEmployeeMasterBatch(rows, selectedFile?.name || "Employee Master Upload");
      setMessage(`${Number(result?.imported_or_updated || 0)} employees imported/updated successfully.`);
      await loadEmployees();
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  }

  return (
    <Layout user={demoUser} role={role} setRole={setRole} active={active} setActive={setActive} visibleMenu={visibleMenu}>
      {error && <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-700">{error}</div>}
      {active === "dashboard" && <Dashboard activeEmployees={activeEmployees} attendanceRows={attendanceRows} payrollRows={payrollRows} payrollStatus="Draft" setActive={setActive} />}
      {active === "employees" && <Employees query={query} setQuery={setQuery} branch={branch} setBranch={setBranch} showEmployeeForm={showEmployeeForm} setShowEmployeeForm={setShowEmployeeForm} newEmployee={newEmployee} setNewEmployee={setNewEmployee} saveEmployee={saveEmployee} editingEmployee={editingEmployee} setEditingEmployee={setEditingEmployee} updateEmployee={updateEmployee} loadingEmployees={loadingEmployees} filteredEmployees={filteredEmployees} updateEmployeeStatus={updateEmployeeStatus} />}
      {active === "zkt" && <ZKTSync />}
      {active === "attendance" && <Attendance rows={attendanceRows} />}
      {active === "payroll" && <Payroll rows={payrollRows} selectedPayslip={selectedPayslip} setSelectedPayslip={setSelectedPayslip} payrollMonth="April 2026" PayslipCard={() => null} />}
      {active === "imports" && <Imports selectedFile={selectedFile} setSelectedFile={setSelectedFile} preview={preview} importing={importing} message={message} error={error} onPreview={onPreview} onImport={onImport} />}
      {active === "policies" && <Policies />}
      {active === "exports" && <Exports employees={employees} payroll={payrollRows} attendance={attendanceRows} loans={demoLoans} />}
    </Layout>
  );
}
