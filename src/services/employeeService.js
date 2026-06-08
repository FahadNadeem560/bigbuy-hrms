import { supabase } from "../lib/supabaseClient.js";

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
    phone: emp.phone || emp.whatsapp_number || "-",
    whatsappNumber: emp.whatsapp_number || "",
    cnic: emp.cnic || "",
    fathersCnic: emp.fathers_cnic || "",
    joiningDate: emp.joining_date || "",
    cnicIssueDate: emp.cnic_issue_date || "",
    cnicExpiryDate: emp.cnic_expiry_date || "",
    referencePersonName: emp.reference_person_name || "",
    referencePersonContact: emp.reference_person_contact || "",
    emergencyContactName: emp.emergency_contact_name || "",
    emergencyContactNumber: emp.emergency_contact_number || "",
    emergencyContactRelationship: emp.emergency_contact_relationship || "",
    billingAddress: emp.billing_address || "",
    permanentAddress: emp.permanent_address || "",
    currentAddress: emp.current_address || "",
    personalPhone: emp.personal_phone || "",
    workPhone: emp.work_phone || "",
    email: emp.email || "",
    bankName: emp.bank_name || "",
    accountNumber: emp.account_number || "",
    iban: emp.iban || "",
    photoUrl: emp.photo_url || "",
    cnicCopyUrl: emp.cnic_copy_url || "",
    employmentContractUrl: emp.employment_contract_url || "",
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
