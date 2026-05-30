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
