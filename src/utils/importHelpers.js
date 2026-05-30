import * as XLSX from "xlsx";
import { BRANCH_ALIASES, BRANCH_CODE_MAP } from "../constants/branches.js";

export function normalizeHeader(value) {
  return String(value || "").trim().toLowerCase().replaceAll(".", "").replaceAll("/", "_").replaceAll(" ", "_").replaceAll("-", "_");
}

export function normalizeBranch(value) {
  const raw = String(value || "").trim();
  const key = raw.toLowerCase().replace(/\s+/g, " ");
  return BRANCH_ALIASES[key] || raw;
}

export function normalizeStaffLevel(value) {
  const raw = String(value || "").trim().toLowerCase().replaceAll("-", " ");
  if (raw === "management") return "Management";
  if (raw === "floor management") return "Floor Management";
  if (raw === "non management" || raw === "nonmanagement") return "Non-Management";
  return String(value || "").trim() || "Non-Management";
}

export function normalizeSalary(value) {
  const cleaned = String(value ?? "").replace(/[^0-9.-]/g, "");
  if (!cleaned) return "";
  const numeric = Number(cleaned);
  return Number.isFinite(numeric) ? numeric : "";
}

export function normalizeImportRow(row) {
  const clean = {};
  Object.entries(row || {}).forEach(([key, value]) => { clean[normalizeHeader(key)] = String(value ?? "").trim(); });
  const phone = clean.whatsapp_number || clean.whatsapp || clean.phone || clean.mobile || "";
  return {
    employee_code: clean.employee_code || clean.employee_id || clean.empid || clean.emp_id || clean.id || "",
    name: clean.name || clean.full_name || clean.employee_name || "",
    designation: clean.designation || "",
    department: clean.department || clean.dept || "",
    category_department: clean.category_department || clean.category_dept || "",
    branch: normalizeBranch(clean.branch || clean.payroll_branch || clean.location || ""),
    level: normalizeStaffLevel(clean.level || clean.staff_level || ""),
    employee_type: clean.employee_type || clean.type || "Permanent",
    salary: normalizeSalary(clean.salary || clean.gross_salary || clean.basic_salary || ""),
    phone,
    whatsapp_number: phone,
    cnic: clean.cnic || clean.nic_number || clean.nic || "",
    fathers_cnic: clean.fathers_cnic || clean.father_cnic || clean.father_nic || "",
    joining_date: clean.joining_date || clean.date_of_joining || "",
    eobi_status: clean.eobi_status || clean.eobi || "Pending",
    status: clean.status || clean.payroll_status || "Active",
    shift: clean.shift || clean.assigned_shift_code || "",
  };
}

export function validateEmployeeImportRows(rows, staffLevelPolicies) {
  const validBranches = Object.keys(BRANCH_CODE_MAP);
  const validLevels = Object.keys(staffLevelPolicies);
  const seenCodes = new Set();
  return rows.map((row, index) => {
    const errors = [];
    if (!row.employee_code) errors.push("Employee ID is required");
    if (!row.name) errors.push("Name is required");
    if (!row.branch) errors.push("Branch is required");
    else if (!validBranches.includes(row.branch)) errors.push("Invalid branch");
    if (!validLevels.includes(row.level)) errors.push("Invalid level");
    if (row.salary !== "" && Number.isNaN(Number(row.salary))) errors.push("Invalid salary");
    const missingRequiredDetails = [];
    if (!row.whatsapp_number) missingRequiredDetails.push("WhatsApp");
    if (!row.cnic) missingRequiredDetails.push("CNIC");
    if (!row.fathers_cnic) missingRequiredDetails.push("Father's CNIC");
    if (row.employee_code && seenCodes.has(row.employee_code)) errors.push("Duplicate ID in file");
    if (row.employee_code) seenCodes.add(row.employee_code);
    return { ...row, rowNumber: index + 2, errors, missingRequiredDetails, valid: errors.length === 0 };
  });
}

export async function readImportFile(file) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!["csv", "xls", "xlsx"].includes(extension)) throw new Error("Only CSV, XLS and XLSX files are allowed.");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
  if (!rows.length) throw new Error("The selected file has no employee records.");
  return rows.map(normalizeImportRow);
}
