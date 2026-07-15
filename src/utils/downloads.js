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
  // Only the employee master import is actually wired to a working preview/import
  // flow (see App.jsx onPreview/onImport). Loans, leave balances etc. have their
  // own dedicated import panels on their own pages.
  const templates = {
    employees: [{ employee_code: "1001", name: "Ali Raza", designation: "Sales Associate", department: "Grocery", category_department: "Sales", branch: "Main Branch", level: "Non-Management", employee_type: "Permanent", salary: 42000, whatsapp_number: "923001234567", cnic: "42101-0000000-0", fathers_cnic: "42101-0000001-0", joining_date: "2026-04-01", eobi_status: "Pending", status: "Active", shift: "SHIFT_A" }],
  };
  const rows = templates[type] || [];
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Template");
  XLSX.writeFile(wb, `${type}_template.xlsx`);
}
