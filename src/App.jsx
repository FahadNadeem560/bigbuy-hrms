import React, { useEffect, useMemo, useState } from "react";
import Layout from "./components/Layout.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import EmployeesHub from "./pages/EmployeesHub.jsx";
import Attendance from "./pages/Attendance.jsx";
import Payroll from "./pages/Payroll.jsx";
import DataManagement from "./pages/DataManagement.jsx";
import ZKTSync from "./pages/ZKTSync.jsx";
import LeaveManagement from "./pages/LeaveManagement.jsx";
import PayrollAutomation from "./pages/PayrollAutomation.jsx";
import EmployeeProfile from "./pages/EmployeeProfile.jsx";
import DepartmentManagement from "./pages/DepartmentManagement.jsx";
import RosterManagement from "./pages/RosterManagement.jsx";
import WorkforceHub from "./pages/WorkforceHub.jsx";
import SalaryReports from "./pages/SalaryReports.jsx";
import AllowancesHub from "./pages/AllowancesHub.jsx";
import PayrollExtras from "./pages/PayrollExtras.jsx";
import LoanHub from "./pages/LoanHub.jsx";
import SettingsHub from "./pages/SettingsHub.jsx";
import ApprovalQueue from "./pages/ApprovalQueue.jsx";
import AIAssistant from "./pages/AIAssistant.jsx";
import { MENU_ITEMS } from "./config/menu.js";
import { calculatePayrollForEmployee } from "./utils/payrollRules.js";
import { readImportFile, validateEmployeeImportRows } from "./utils/importHelpers.js";
import { STAFF_LEVEL_POLICIES } from "./config/staffPolicies.js";
import { fetchEmployees, createEmployee, updateEmployeeByCode, importEmployeeMasterBatch } from "./services/employeeService.js";
import { fetchRecentAttendance } from "./services/attendanceService.js";
import { runMigrations } from "./utils/runMigrations.js";

const demoUser = { name: "Fahad Nadeem", email: "fahad-nadeem@hotmail.com", role: "Master" };
const demoLoans = [];
const demoAdjustments = {};

function mapAttendanceRow(row) {
  return {
    employeeCode: row.employee_code || "",
    name: row.employee_code || "",
    level: row.eligibility_group || "",
    date: row.work_date || row.attendance_date || "",
    checkIn: row.check_in ? String(row.check_in).slice(11, 16) : "",
    checkOut: row.check_out ? String(row.check_out).slice(11, 16) : "",
    actualHours: Number(row.actual_hours || row.worked_hours || 0),
    lateMinutes: Number(row.late_minutes || 0),
    overtimeHours: Number(row.overtime_hours || 0),
    status: row.attendance_status || "Pending",
  };
}

const BLANK_EMPLOYEE = {
  branch: "Main Branch", fullName: "", designation: "", department: "",
  level: "Non-Management", salary: "", phone: "", cnic: "", fathersCnic: "",
  joiningDate: "", employeeType: "Permanent",
  cnicIssueDate: "", cnicExpiryDate: "",
  referencePersonName: "", referencePersonContact: "",
  emergencyContactName: "", emergencyContactNumber: "", emergencyContactRelationship: "",
  billingAddress: "", permanentAddress: "", currentAddress: "",
  personalPhone: "", workPhone: "", email: "",
  bankName: "", accountNumber: "", iban: "",
  photoUrl: "", cnicCopyUrl: "", employmentContractUrl: "",
  supervisorId: "", isSupervisor: false, isManager: false,
};

export default function BigBuyHRMS() {
  const [active, setActive] = useState("dashboard");
  const [role, setRole] = useState("Master");
  const [employees, setEmployees] = useState([]);
  const [attendanceRows, setAttendanceRows] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [query, setQuery] = useState("");
  const [branch, setBranch] = useState("All");
  const [showEmployeeForm, setShowEmployeeForm] = useState(false);
  const [newEmployee, setNewEmployee] = useState(BLANK_EMPLOYEE);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState([]);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [selectedPayslip, setSelectedPayslip] = useState(null);
  const visibleMenu = useMemo(() => MENU_ITEMS.filter(item => item.roles.includes(role)), [role]);
  const filteredEmployees = useMemo(() => employees.filter(emp =>
    (branch === "All" || emp.branch === branch) &&
    `${emp.name} ${emp.id} ${emp.dept} ${emp.phone}`.toLowerCase().includes(query.toLowerCase())
  ), [employees, branch, query]);
  const activeEmployees = useMemo(() => employees.filter(emp => emp.status === "Active"), [employees]);
  const payrollRows = useMemo(() => activeEmployees.map(emp => calculatePayrollForEmployee(emp, demoAdjustments[emp.id] || {}, demoLoans)), [activeEmployees]);

  async function loadEmployees() {
    setLoadingEmployees(true);
    try { setEmployees(await fetchEmployees()); }
    catch (err) { setError(`Employee load failed: ${err.message}`); }
    finally { setLoadingEmployees(false); }
  }

  async function loadAttendance() {
    try {
      const rows = await fetchRecentAttendance(25000);
      setAttendanceRows((rows || []).map(mapAttendanceRow));
    } catch (err) { setError(`Attendance load failed: ${err.message}`); }
  }

  useEffect(() => { runMigrations(); loadEmployees(); loadAttendance(); }, []);

  async function saveEmployee() {
    const code = `EMP-${String(Date.now()).slice(-6)}`;
    const payload = {
      employee_code: code, full_name: newEmployee.fullName, designation: newEmployee.designation,
      department: newEmployee.department, branch: newEmployee.branch, staff_level: newEmployee.level,
      employee_type: newEmployee.employeeType || "Permanent", salary: Number(newEmployee.salary || 0),
      phone: newEmployee.phone, whatsapp_number: newEmployee.phone,
      cnic: newEmployee.cnic, fathers_cnic: newEmployee.fathersCnic,
      joining_date: newEmployee.joiningDate || null, eobi_status: "Pending", status: "Active",
      cnic_issue_date: newEmployee.cnicIssueDate || null, cnic_expiry_date: newEmployee.cnicExpiryDate || null,
      reference_person_name: newEmployee.referencePersonName, reference_person_contact: newEmployee.referencePersonContact,
      emergency_contact_name: newEmployee.emergencyContactName, emergency_contact_number: newEmployee.emergencyContactNumber,
      emergency_contact_relationship: newEmployee.emergencyContactRelationship,
      billing_address: newEmployee.billingAddress, permanent_address: newEmployee.permanentAddress, current_address: newEmployee.currentAddress,
      personal_phone: newEmployee.personalPhone, work_phone: newEmployee.workPhone, email: newEmployee.email,
      bank_name: newEmployee.bankName, account_number: newEmployee.accountNumber, iban: newEmployee.iban,
      photo_url: newEmployee.photoUrl, cnic_copy_url: newEmployee.cnicCopyUrl, employment_contract_url: newEmployee.employmentContractUrl,
      supervisor_id: newEmployee.supervisorId || null,
      is_supervisor: !!newEmployee.isSupervisor,
      is_manager: !!newEmployee.isManager,
    };
    try {
      await createEmployee(payload); await loadEmployees();
      setShowEmployeeForm(false); setNewEmployee(BLANK_EMPLOYEE);
    } catch (err) { setError(`Save failed: ${err.message}`); }
  }

  async function updateEmployee() {
    if (!editingEmployee) return;
    try {
      await updateEmployeeByCode(editingEmployee.id, {
        full_name: editingEmployee.name, department: editingEmployee.dept,
        branch: editingEmployee.branch, staff_level: editingEmployee.level,
        salary: Number(editingEmployee.salary || 0), status: editingEmployee.status,
        cnic: editingEmployee.cnic, fathers_cnic: editingEmployee.fathersCnic,
        cnic_issue_date: editingEmployee.cnicIssueDate || null, cnic_expiry_date: editingEmployee.cnicExpiryDate || null,
        reference_person_name: editingEmployee.referencePersonName, reference_person_contact: editingEmployee.referencePersonContact,
        emergency_contact_name: editingEmployee.emergencyContactName, emergency_contact_number: editingEmployee.emergencyContactNumber,
        emergency_contact_relationship: editingEmployee.emergencyContactRelationship,
        billing_address: editingEmployee.billingAddress, permanent_address: editingEmployee.permanentAddress, current_address: editingEmployee.currentAddress,
        personal_phone: editingEmployee.personalPhone, work_phone: editingEmployee.workPhone, email: editingEmployee.email,
        bank_name: editingEmployee.bankName, account_number: editingEmployee.accountNumber, iban: editingEmployee.iban,
        supervisor_id: editingEmployee.supervisorId || null,
        is_supervisor: !!editingEmployee.isSupervisor,
        is_manager: !!editingEmployee.isManager,
      });
      await loadEmployees(); setEditingEmployee(null);
    } catch (err) { setError(`Update failed: ${err.message}`); }
  }

  async function updateEmployeeStatus(id, status) {
    try { await updateEmployeeByCode(id, { status }); await loadEmployees(); }
    catch (err) { setError(`Status update failed: ${err.message}`); }
  }

  async function onPreview() {
    setError(""); setMessage("");
    if (!selectedFile) return setError("Please choose a CSV, XLS or XLSX file first.");
    try {
      const rows = await readImportFile(selectedFile);
      const checked = validateEmployeeImportRows(rows, STAFF_LEVEL_POLICIES);
      setPreview(checked); setMessage(`${checked.length} rows found.`);
    } catch (err) { setError(err.message); }
  }

  async function onImport() {
    setImporting(true); setError("");
    try {
      const rows = preview.filter(r => r.valid).map(r => ({
        employee_code: r.employee_code, full_name: r.name, designation: r.designation,
        department: r.department, category_department: r.category_department,
        branch: r.branch, staff_level: r.level, employee_type: r.employee_type,
        salary: r.salary === "" ? 0 : Number(r.salary), phone: r.phone,
        whatsapp_number: r.whatsapp_number, cnic: r.cnic, fathers_cnic: r.fathers_cnic,
        joining_date: r.joining_date, eobi_status: r.eobi_status, status: r.status, shift: r.shift,
      }));
      const result = await importEmployeeMasterBatch(rows, selectedFile?.name || "Employee Master Upload");
      setMessage(`${Number(result?.imported_or_updated || 0)} employees imported/updated successfully.`);
      await loadEmployees();
    } catch (err) { setError(err.message); }
    finally { setImporting(false); }
  }

  const employeeProps = {
    query, setQuery, branch, setBranch,
    showEmployeeForm, setShowEmployeeForm,
    newEmployee, setNewEmployee, saveEmployee,
    editingEmployee, setEditingEmployee, updateEmployee,
    loadingEmployees, filteredEmployees, updateEmployeeStatus,
    employees,
  };

  return (
    <Layout user={demoUser} role={role} setRole={setRole} active={active} setActive={setActive} visibleMenu={visibleMenu}>
      {error && <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-700">{error}</div>}

      {/* Core HR */}
      {active === "dashboard"   && <Dashboard activeEmployees={activeEmployees} attendanceRows={attendanceRows} payrollRows={payrollRows} payrollStatus="Draft" setActive={setActive} />}
      {active === "employees"   && <EmployeesHub {...employeeProps} />}
      {active === "departments" && <DepartmentManagement />}
      {active === "profile"     && <EmployeeProfile />}

      {/* Attendance */}
      {active === "attendance"  && <Attendance rows={attendanceRows} />}
      {active === "roster"      && <RosterManagement />}
      {active === "zkt"         && <ZKTSync />}

      {/* Leave */}
      {active === "leave"       && <LeaveManagement role={role} />}

      {/* Workforce */}
      {active === "workforce"   && <WorkforceHub />}

      {/* Payroll & Finance */}
      {active === "payroll-automation" && <PayrollAutomation role={role} />}
      {active === "payroll"            && <Payroll rows={payrollRows} selectedPayslip={selectedPayslip} setSelectedPayslip={setSelectedPayslip} payrollMonth="April 2026" PayslipCard={() => null} />}
      {active === "salary-reports"     && <SalaryReports />}
      {active === "allowances"         && <AllowancesHub role={role} />}
      {active === "payroll-extras"     && <PayrollExtras role={role} />}
      {active === "loans"              && <LoanHub role={role} />}

      {/* Approvals */}
      {active === "approval-queue" && <ApprovalQueue role={role} />}

      {/* System */}
      {active === "imports"     && <DataManagement selectedFile={selectedFile} setSelectedFile={setSelectedFile} preview={preview} importing={importing} message={message} error={error} onPreview={onPreview} onImport={onImport} employees={employees} payroll={payrollRows} attendance={attendanceRows} loans={demoLoans} />}
      {active === "settings"    && <SettingsHub />}
      {active === "ai-assistant"&& <AIAssistant />}
    </Layout>
  );
}
