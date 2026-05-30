import React, { useEffect, useMemo, useState } from "react";
import Layout from "./components/Layout";
import { Card, CardContent, Button, PageTitle } from "./components/ui";
import { BRANCH_CODE_MAP } from "./constants/branches";
import { MENU_ITEMS } from "./config/menu";
import { STAFF_LEVEL_POLICIES } from "./config/staffPolicies";
import Dashboard from "./pages/Dashboard";
import Employees from "./pages/Employees";
import Attendance from "./pages/Attendance";
import Payroll from "./pages/Payroll";
import Loans from "./pages/Loans";
import Imports from "./pages/Imports";
import Policies from "./pages/Policies";
import Exports from "./pages/Exports";
import { fetchEmployees, createEmployee, updateEmployeeByCode, importEmployeeMasterBatch } from "./services/employeeService";
import { readImportFile, validateEmployeeImportRows } from "./utils/importHelpers";
import { processAttendancePunch } from "./utils/attendanceRules";
import { calculatePayrollForEmployee } from "./utils/payrollRules";
import { money } from "./utils/format";

const demoRawPunches = [
  { employeeCode: "1001", name: "Demo Employee", level: "Non-Management", date: "2026-04-01", checkIn: "11:00", checkOut: "21:45", branch: "Main Branch", shiftStart: "11:00", shiftEnd: "21:30" },
];

const demoLoans = [];
const demoPayrollAdjustments = {};

function generateNextCode(branch, existingEmployees, reservedCodes = []) {
  const prefix = BRANCH_CODE_MAP[branch] || "EMP";
  const numbers = [...existingEmployees.map((employee) => employee.id), ...reservedCodes]
    .filter((id) => String(id || "").startsWith(`${prefix}-`))
    .map((id) => Number(String(id).split("-").pop()))
    .filter((value) => Number.isFinite(value));
  return `${prefix}-${String((numbers.length ? Math.max(...numbers) : 0) + 1).padStart(3, "0")}`;
}

function PayslipCard({ row, month, close }) {
  return <Card className="rounded-2xl border border-slate-100 shadow-sm mb-5"><CardContent className="p-5"><div className="flex justify-between gap-3"><div><h2 className="text-xl font-bold">Salary Slip - {month}</h2><p className="text-slate-500">{row.name} ({row.employeeCode})</p></div><Button variant="outline" onClick={close}>Close</Button></div><div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4 text-sm"><p>Gross: <b>{money(row.gross)}</b></p><p>Overtime: <b>{money(row.overtimeAmount)}</b></p><p>Deductions: <b>{money(row.absentDeduction + row.lateDeduction + row.loanDeduction)}</b></p><p>Final Salary: <b>{money(row.finalSalary)}</b></p></div></CardContent></Card>;
}

function PlaceholderPage({ active }) {
  return <div><PageTitle title="Coming Soon" subtitle={`${active} module will be connected in the next development phase.`} /><Card className="rounded-2xl border border-slate-100 shadow-sm"><CardContent className="p-6 text-slate-600">This section is ready in the navigation and will be connected to Supabase workflow screens next.</CardContent></Card></div>;
}

export default function BigBuyHRMS() {
  const [active, setActive] = useState("dashboard");
  const [currentUser] = useState({ name: "Fahad Nadeem", email: "fahad-nadeem@hotmail.com", role: "Master" });
  const [authLoading] = useState(false);
  const [role, setRole] = useState("Master");
  const [employeeList, setEmployeeList] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [showEmployeeForm, setShowEmployeeForm] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [query, setQuery] = useState("");
  const [branch, setBranch] = useState("All");
  const [payrollMonth] = useState("April 2026");
  const [payrollStatus] = useState("Draft");
  const [selectedPayslip, setSelectedPayslip] = useState(null);
  const [newEmployee, setNewEmployee] = useState({ branch: "Main Branch", fullName: "", designation: "", department: "", level: "Non-Management", salary: "", phone: "", cnic: "", fathersCnic: "" });
  const [selectedImportFile, setSelectedImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [importError, setImportError] = useState("");

  const processedAttendance = useMemo(() => demoRawPunches.map(processAttendancePunch), []);
  const visibleMenu = useMemo(() => MENU_ITEMS.filter((item) => item.roles.includes(role)), [role]);
  const filteredEmployees = employeeList.filter((employee) => (branch === "All" || employee.branch === branch) && `${employee.name} ${employee.id} ${employee.dept} ${employee.phone}`.toLowerCase().includes(query.toLowerCase()));
  const activeEmployees = employeeList.filter((employee) => employee.status === "Active");
  const generatedPayroll = activeEmployees.filter((employee) => employee.type !== "Contractor").map((employee) => calculatePayrollForEmployee(employee, demoPayrollAdjustments[employee.id] || {}, demoLoans));

  async function loadEmployees() {
    setLoadingEmployees(true);
    try {
      const rows = await fetchEmployees();
      setEmployeeList(rows);
    } catch (error) {
      console.error("Employee load failed", error);
    } finally {
      setLoadingEmployees(false);
    }
  }

  useEffect(() => { loadEmployees(); }, []);

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
      staff_level: newEmployee.level,
      employee_type: "Permanent",
      salary: Number(newEmployee.salary || 0),
      phone: newEmployee.phone,
      whatsapp_number: newEmployee.phone,
      cnic: newEmployee.cnic,
      fathers_cnic: newEmployee.fathersCnic,
      eobi_status: "Pending",
      status: "Active",
    };
    try {
      await createEmployee(payload);
      await loadEmployees();
      setShowEmployeeForm(false);
      setNewEmployee({ branch: "Main Branch", fullName: "", designation: "", department: "", level: "Non-Management", salary: "", phone: "", cnic: "", fathersCnic: "" });
    } catch (error) {
      alert(`Error: ${error.message}`);
    }
  }

  async function updateEmployee() {
    if (!editingEmployee) return;
    const payload = {
      full_name: editingEmployee.name,
      branch: editingEmployee.branch,
      department: editingEmployee.dept,
      designation: editingEmployee.designation,
      staff_level: editingEmployee.level,
      salary: Number(editingEmployee.salary || 0),
      eobi_status: editingEmployee.eobi,
      phone: editingEmployee.phone,
      status: editingEmployee.status,
    };
    try {
      await updateEmployeeByCode(editingEmployee.id, payload);
      await loadEmployees();
      setEditingEmployee(null);
    } catch (error) {
      alert(`Update failed: ${error.message}`);
    }
  }

  async function updateEmployeeStatus(id, status) {
    try {
      await updateEmployeeByCode(id, { status });
      await loadEmployees();
    } catch (error) {
      alert(`Status update failed: ${error.message}`);
    }
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
      const checked = validateEmployeeImportRows(rawRows, STAFF_LEVEL_POLICIES);
      setImportPreview(checked);
      const invalid = checked.filter((row) => !row.valid).length;
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
    setImportMessage("");
    try {
      const rowsForUpload = validRows.map((row) => ({
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
      const result = await importEmployeeMasterBatch(rowsForUpload, selectedImportFile?.name || "Employee Master Upload");
      const imported = Number(result?.imported_or_updated || 0);
      const rejected = Number(result?.rejected || 0);
      setImportMessage(`${imported} employees imported/updated successfully.${rejected ? ` ${rejected} rows were rejected.` : ""}`);
      await loadEmployees();
      setSelectedImportFile(null);
      setImportPreview([]);
    } catch (error) {
      setImportError(`Import failed: ${error.message}`);
    } finally {
      setImporting(false);
    }
  }

  if (authLoading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><div className="text-xl font-bold">Loading Big Buy HRMS...</div></div>;

  return <Layout user={currentUser} role={role} setRole={setRole} active={active} setActive={setActive} visibleMenu={visibleMenu}>
    {active === "dashboard" && <Dashboard activeEmployees={activeEmployees} attendanceRows={processedAttendance} payrollRows={generatedPayroll} payrollStatus={payrollStatus} setActive={setActive} />}
    {active === "employees" && <Employees query={query} setQuery={setQuery} branch={branch} setBranch={setBranch} showEmployeeForm={showEmployeeForm} setShowEmployeeForm={setShowEmployeeForm} newEmployee={newEmployee} setNewEmployee={setNewEmployee} saveEmployee={saveEmployee} editingEmployee={editingEmployee} setEditingEmployee={setEditingEmployee} updateEmployee={updateEmployee} loadingEmployees={loadingEmployees} filteredEmployees={filteredEmployees} updateEmployeeStatus={updateEmployeeStatus} />}
    {active === "attendance" && <Attendance rows={processedAttendance} />}
    {active === "payroll" && <Payroll rows={generatedPayroll} selectedPayslip={selectedPayslip} setSelectedPayslip={setSelectedPayslip} payrollMonth={payrollMonth} PayslipCard={PayslipCard} />}
    {active === "loans" && <Loans activeEmployees={activeEmployees} loans={demoLoans} />}
    {active === "imports" && <Imports selectedFile={selectedImportFile} setSelectedFile={setSelectedImportFile} preview={importPreview} importing={importing} message={importMessage} error={importError} onPreview={previewEmployeeFile} onImport={confirmEmployeeImport} />}
    {active === "policies" && <Policies />}
    {active === "exports" && <Exports employees={employeeList} payroll={generatedPayroll} attendance={processedAttendance} loans={demoLoans} />}
    {["zkt", "audit", "approval", "portal", "reports", "users"].includes(active) && <PlaceholderPage active={active} />}
  </Layout>;
}
