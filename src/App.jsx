import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabaseClient.js";
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
import Fines from "./pages/Fines.jsx";
import Shortages from "./pages/Shortages.jsx";
import { MENU_ITEMS } from "./config/menu.js";
import { calculatePayrollForEmployee } from "./utils/payrollRules.js";
import { readImportFile, validateEmployeeImportRows } from "./utils/importHelpers.js";
import { STAFF_LEVEL_POLICIES } from "./config/staffPolicies.js";
import { fetchEmployees, createEmployee, updateEmployeeByCode, importEmployeeMasterBatch, getNextEmployeeId, getNextTempId } from "./services/employeeService.js";
import { fetchRecentAttendance } from "./services/attendanceService.js";
import { runMigrations } from "./utils/runMigrations.js";
import { signOut } from "./services/authService.js";
import { getBranchFilter, isBranchRestricted } from "./utils/branchFilter.js";

const demoLoans = [];
const demoAdjustments = {};

function mapAttendanceRow(row) {
  return {
    id: row.id || null,
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
    detectedShift: row.detected_shift || null,
    halfDayExempt: !!row.half_day_exempt,
    lateExempt: !!row.late_exempt,
    isGazettedHoliday: !!row.is_gazetted_holiday,
    adjustmentStatus: row.adjustment_status || null,
    adjustmentApprovedBy: row.adjustment_approved_by || null,
    isManualEntry: !!row.is_manual_entry,
    manualEntryStatus: row.manual_entry_status || null,
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
  isTemporary: false, isFieldEmployee: false, employmentStatus: "Permanent",
};

export default function BigBuyHRMS({ profile }) {
  const [active, setActive] = useState("dashboard");
  const role = profile?.role || "Master";
  const userBranch = profile?.branch || null;
  const user = { name: profile?.full_name || "User", email: profile?.email || "" };
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
  const branchRestriction = getBranchFilter(profile);
  const effectiveBranch = branchRestriction || branch;
  const filteredEmployees = useMemo(() => employees.filter(emp =>
    (effectiveBranch === "All" || emp.branch === effectiveBranch) &&
    `${emp.name} ${emp.id} ${emp.dept} ${emp.phone}`.toLowerCase().includes(query.toLowerCase())
  ), [employees, effectiveBranch, query]);
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

  const [tempAlerts, setTempAlerts] = useState([]);
  const [tempActionMsg, setTempActionMsg] = useState("");

  async function checkTemporaryEmployees() {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400e3).toISOString().slice(0, 10);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400e3).toISOString();
    // Auto soft-delete rejected temporaries archived > 30 days ago
    const { data: toDelete } = await supabase.from("employees")
      .select("employee_code").eq("is_temporary", true).eq("status", "Inactive")
      .lt("archived_at", thirtyDaysAgo).eq("is_deleted", false);
    if (toDelete && toDelete.length > 0) {
      const codes = toDelete.map(e => e.employee_code);
      await supabase.from("employees").update({ is_deleted: true }).in("employee_code", codes);
    }
    // Find temporaries active > 7 days — show alert
    const { data: alerts } = await supabase.from("employees")
      .select("employee_code, full_name, department, branch, joining_date, temp_id")
      .eq("is_temporary", true).eq("status", "Active")
      .lt("joining_date", sevenDaysAgo);
    setTempAlerts(alerts || []);
  }

  async function enrollTemporary(empCode) {
    // Get next permanent ID (4001+)
    const { data: existing } = await supabase.from("employees").select("employee_code");
    let max = 4000;
    (existing || []).forEach(r => { const n = parseInt(r.employee_code, 10); if (!isNaN(n) && n > max) max = n; });
    const permanentCode = String(max + 1);
    const probationStart = new Date().toISOString().slice(0, 10);
    const probationEnd = new Date(Date.now() + 180 * 86400e3).toISOString().slice(0, 10);
    await supabase.from("employees").update({
      employee_code: permanentCode, employment_status: "Probation", is_temporary: false,
      probation_start_date: probationStart, probation_end_date: probationEnd,
      probation_status: "Active", permanent_id_assigned: permanentCode,
      updated_at: new Date().toISOString(),
    }).eq("employee_code", empCode);
    // Mark probation-period attendance as Present
    await supabase.from("attendance").update({ attendance_status: "Present" })
      .eq("employee_code", empCode).eq("attendance_status", "Pending");
    setTempActionMsg(`Employee enrolled permanently. New ID: ${permanentCode}. Probation until ${probationEnd}.`);
    checkTemporaryEmployees(); loadEmployees();
  }

  async function rejectTemporary(empCode) {
    await supabase.from("employees").update({
      status: "Inactive", employment_status: "Rejected",
      archived_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("employee_code", empCode);
    setTempActionMsg("Temporary employee rejected and archived. Will be soft-deleted after 30 days.");
    checkTemporaryEmployees(); loadEmployees();
  }

  useEffect(() => {
    runMigrations().then(() => { loadEmployees(); loadAttendance(); checkTemporaryEmployees(); });
  }, []);

  async function saveEmployee() {
    let code, tempId = null, employmentStatus = "Permanent";
    const isTemp = !!newEmployee.isTemporary;
    if (isTemp) {
      tempId = await getNextTempId();
      code = tempId;
      employmentStatus = "Temporary";
    } else {
      code = await getNextEmployeeId();
    }
    const joiningDate = newEmployee.joiningDate || new Date().toISOString().slice(0, 10);
    const payload = {
      employee_code: code, full_name: newEmployee.fullName, designation: newEmployee.designation,
      department: newEmployee.department, branch: newEmployee.branch, staff_level: newEmployee.level,
      employee_type: newEmployee.employeeType || "Permanent", salary: Number(newEmployee.salary || 0),
      phone: newEmployee.phone, whatsapp_number: newEmployee.phone,
      cnic: newEmployee.cnic, fathers_cnic: newEmployee.fathersCnic,
      joining_date: joiningDate, eobi_status: "Pending", status: "Active",
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
      is_temporary: isTemp,
      temp_id: tempId,
      employment_status: employmentStatus,
      is_field_employee: !!newEmployee.isFieldEmployee,
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

  async function openNewEmployeeForm() {
    const nextId = await getNextEmployeeId();
    setNewEmployee({ ...BLANK_EMPLOYEE, _nextId: nextId });
    setShowEmployeeForm(true);
  }

  const employeeProps = {
    query, setQuery,
    branch: effectiveBranch, setBranch: branchRestriction ? () => {} : setBranch,
    branchLocked: !!branchRestriction,
    showEmployeeForm,
    setShowEmployeeForm: (v) => { if (v) openNewEmployeeForm(); else setShowEmployeeForm(false); },
    newEmployee, setNewEmployee, saveEmployee,
    editingEmployee, setEditingEmployee, updateEmployee,
    loadingEmployees, filteredEmployees, updateEmployeeStatus,
    employees, role,
  };

  return (
    <Layout user={user} role={role} onLogout={signOut} active={active} setActive={setActive} visibleMenu={visibleMenu}>
      {error && <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-700">{error}</div>}
      {/* Temporary Employee Notification Banner (HR/Master only) */}
      {(role === "HR" || role === "Master") && tempAlerts.length > 0 && (
        <div className="mb-4 p-4 rounded-2xl bg-red-50 border border-red-200">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-red-800 text-sm">Temporary Employee Action Required ({tempAlerts.length})</h3>
            {tempActionMsg && <span className="text-xs text-green-700 bg-green-50 px-2 py-1 rounded-lg">{tempActionMsg}</span>}
          </div>
          <p className="text-xs text-red-600 mb-3">The following temporary employees have been active for more than 7 days. Please enroll them permanently or reject their temporary status.</p>
          <div className="space-y-2">
            {tempAlerts.map(emp => (
              <div key={emp.employee_code} className="flex flex-wrap items-center justify-between gap-2 bg-white rounded-xl p-3 border border-red-100">
                <div>
                  <span className="font-semibold text-slate-800 text-sm">{emp.full_name}</span>
                  <span className="text-xs text-slate-500 ml-2">{emp.temp_id || emp.employee_code} · {emp.department} · {emp.branch}</span>
                  <span className="text-xs text-red-500 ml-2">Since {emp.joining_date}</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => enrollTemporary(emp.employee_code)}
                    className="px-3 py-1.5 bg-emerald-600 text-white rounded-xl text-xs font-medium hover:bg-emerald-700 transition">
                    Enroll Permanently
                  </button>
                  <button onClick={() => rejectTemporary(emp.employee_code)}
                    className="px-3 py-1.5 border border-red-300 text-red-700 rounded-xl text-xs font-medium hover:bg-red-50 transition">
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Core HR */}
      {active === "dashboard"   && <Dashboard activeEmployees={activeEmployees} attendanceRows={attendanceRows} payrollRows={payrollRows} payrollStatus="Draft" setActive={setActive} role={role} branchFilter={branchRestriction} />}
      {active === "employees"   && <EmployeesHub {...employeeProps} role={role} />}
      {active === "departments" && <DepartmentManagement />}
      {active === "profile"     && <EmployeeProfile role={role} />}

      {/* Attendance */}
      {active === "attendance"  && <Attendance rows={attendanceRows} role={role} branchFilter={branchRestriction} employees={employees} />}
      {active === "roster"      && <RosterManagement />}
      {active === "zkt"         && <ZKTSync />}

      {/* Leave */}
      {active === "leave"       && <LeaveManagement role={role} actorName={user.name} branchFilter={branchRestriction} />}

      {/* Workforce */}
      {active === "workforce"   && <WorkforceHub role={role} branchFilter={branchRestriction} />}

      {/* Payroll & Finance */}
      {active === "payroll-automation" && <PayrollAutomation role={role} />}
      {active === "payroll"            && <Payroll rows={payrollRows} selectedPayslip={selectedPayslip} setSelectedPayslip={setSelectedPayslip} payrollMonth="April 2026" PayslipCard={() => null} />}
      {active === "salary-reports"     && <SalaryReports />}
      {active === "allowances"         && <AllowancesHub role={role} />}
      {active === "payroll-extras"     && <PayrollExtras role={role} />}
      {active === "loans"              && <LoanHub role={role} />}

      {/* HR Tools */}
      {active === "fines"     && <Fines role={role} />}
      {active === "shortages" && <Shortages role={role} />}

      {/* Approvals */}
      {active === "approval-queue" && <ApprovalQueue role={role} actorName={user.name} />}

      {/* System */}
      {active === "imports"     && <DataManagement selectedFile={selectedFile} setSelectedFile={setSelectedFile} preview={preview} importing={importing} message={message} error={error} onPreview={onPreview} onImport={onImport} employees={employees} payroll={payrollRows} attendance={attendanceRows} loans={demoLoans} />}
      {active === "settings"    && <SettingsHub />}
      {active === "ai-assistant"&& <AIAssistant />}
    </Layout>
  );
}
