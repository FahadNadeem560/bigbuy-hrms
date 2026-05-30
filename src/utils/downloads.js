import * as XLSX from "xlsx";

export function downloadCSV(filename, rows) {
  if (!rows?.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => `"${String(row[header] ?? "").replaceAll('"', '""')}"`).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadTemplate(type) {
  const templates = {
    employees: [{ employee_code: "1001", name: "Ali Raza", designation: "Sales Associate", department: "Grocery", category_department: "Sales", branch: "Main Branch", level: "Non-Management", employee_type: "Permanent", salary: 42000, whatsapp_number: "923001234567", cnic: "42101-0000000-0", fathers_cnic: "42101-0000001-0", joining_date: "2026-04-01", eobi_status: "Pending", status: "Active", shift: "SHIFT_A" }],
    attendance: [{ employee_code: "1001", date: "2026-04-01", check_in: "11:00", check_out: "21:30", branch: "Main Branch", shift_start: "11:00", shift_end: "21:30" }],
    salary_adjustments: [{ employee_code: "1001", commission: 0, fuel: 0, arrears: 0, bonus: 0, deduction: 0, remarks: "Monthly adjustment" }],
    loans: [{ employee_code: "1001", loan_amount: 25000, monthly_deduction: 5000, start_date: "2026-04-01", months: 5, guarantor_1: "1002", guarantor_2: "1003", surety_details: "Asset / cheque / acceptable surety" }],
    leaves: [{ employee_code: "1001", leave_type: "Casual", from_date: "2026-04-10", to_date: "2026-04-11", approved_by: "HR Manager", remarks: "Approved leave" }],
  };
  const rows = templates[type] || [];
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Template");
  XLSX.writeFile(wb, `${type}_template.xlsx`);
}
