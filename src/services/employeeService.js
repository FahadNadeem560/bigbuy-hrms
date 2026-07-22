import { supabase } from "../lib/supabaseClient.js";

export async function getNextEmployeeId() {
  const { data } = await supabase.from("employees").select("employee_code");
  let max = 4000;
  (data || []).forEach(row => {
    const n = parseInt(row.employee_code, 10);
    if (!isNaN(n) && n > max) max = n;
  });
  return String(max + 1);
}

export async function getNextTempId() {
  const { data } = await supabase.from("employees").select("temp_id").not("temp_id", "is", null);
  let max = 0;
  (data || []).forEach(row => {
    if (row.temp_id) {
      const m = String(row.temp_id).match(/^TEMP-(\d+)$/);
      if (m) { const n = parseInt(m[1]); if (n > max) max = n; }
    }
  });
  return `TEMP-${String(max + 1).padStart(3, "0")}`;
}

export function mapEmployeeRecord(emp) {
  return {
    id: emp.employee_code,
    name: emp.full_name,
    branch: emp.branch,
    dept: emp.department,
    designation: emp.designation || "-",
    level: emp.staff_level || "Non-Management",
    type: emp.employee_type || "Permanent",
    salary: emp.salary || 0,
    eobi: emp.eobi_status || "Pending",
    status: emp.status || "Active",
    lastWorkingDay: emp.last_working_day || "",
    weeklyOffDay: emp.weekly_off_day != null ? String(emp.weekly_off_day) : "",
    eligibilityGroup: emp.eligibility_group || "",
    otEligible: emp.ot_eligible,
    extraDaysEligible: emp.extra_days_eligible,
    ghEligible: emp.gazetted_holiday_eligible,
    phone: emp.phone || emp.whatsapp_number || "-",
    whatsappNumber: emp.whatsapp_number || "",
    cnic: emp.cnic || "",
    fathersCnic: emp.fathers_cnic || "",
    joiningDate: emp.joining_date || "",
    // CNIC
    cnicIssueDate: emp.cnic_issue_date || "",
    cnicExpiryDate: emp.cnic_expiry_date || "",
    // Reference & Emergency
    referencePersonName: emp.reference_person_name || "",
    referencePersonContact: emp.reference_person_contact || "",
    emergencyContactName: emp.emergency_contact_name || "",
    emergencyContactNumber: emp.emergency_contact_number || "",
    emergencyContactRelationship: emp.emergency_contact_relationship || "",
    // Addresses
    billingAddress: emp.billing_address || "",
    permanentAddress: emp.permanent_address || "",
    currentAddress: emp.current_address || "",
    // Contact
    personalPhone: emp.personal_phone || "",
    workPhone: emp.work_phone || "",
    email: emp.email || "",
    // Banking
    bankName: emp.bank_name || "",
    accountNumber: emp.account_number || "",
    iban: emp.iban || "",
    // Documents
    photoUrl: emp.photo_url || "",
    cnicCopyUrl: emp.cnic_copy_url || "",
    employmentContractUrl: emp.employment_contract_url || "",
    // Hierarchy
    supervisorId: emp.supervisor_id || "",
    isSupervisor: !!emp.is_supervisor,
    isManager: !!emp.is_manager,
    // Attendance exemption
    isAttendanceExempt: !!emp.is_attendance_exempt,
    exemptionReason: emp.exemption_reason || "",
    // Field employee
    isFieldEmployee: !!emp.is_field_employee,
    // Temporary / Probation
    isTemporary: !!emp.is_temporary,
    tempId: emp.temp_id || "",
    employmentStatus: emp.employment_status || "Permanent",
    probationStartDate: emp.probation_start_date || "",
    probationEndDate: emp.probation_end_date || "",
    probationStatus: emp.probation_status || "Active",
    archivedAt: emp.archived_at || "",
    permanentIdAssigned: emp.permanent_id_assigned || "",
    isDeleted: !!emp.is_deleted,
  };
}

export async function fetchEmployees() {
  const { data, error } = await supabase.from("employees").select("*").order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []).map(mapEmployeeRecord);
}

export async function createEmployee(payload) {
  const { error } = await supabase.from("employees").insert(payload);
  if (error) throw error;
}

export async function updateEmployeeByCode(employeeCode, payload) {
  const { error } = await supabase.from("employees").update(payload).eq("employee_code", employeeCode);
  if (error) throw error;
}

export async function importEmployeeMasterBatch(rows, sourceFilename) {
  const { data, error } = await supabase.rpc("import_employee_master_batch", {
    p_rows: rows,
    p_source_filename: sourceFilename || "Employee Master Upload",
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}
