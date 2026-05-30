import React from "react";
import { Button, PageTitle, Table } from "../components/ui.jsx";
import { money } from "../utils/format.js";
import { downloadCSV } from "../utils/downloads.js";

export default function PayrollSafe({ rows, selectedPayslip, setSelectedPayslip, payrollMonth, PayslipCard }) {
  return (
    <div>
      <PageTitle title="Payroll Generator" subtitle="Salary calculation using staff level, attendance and loans." action={<Button onClick={() => downloadCSV("payroll.csv", rows)} className="rounded-2xl">Export Payroll</Button>} />
      {selectedPayslip && <PayslipCard row={selectedPayslip} month={payrollMonth} close={() => setSelectedPayslip(null)} />}
      <Table headers={["Employee", "Level", "Gross", "OT", "Deductions", "Final", "Payslip"]} rows={rows} renderRow={(p) => <tr key={p.employeeCode}><td className="px-4 py-3 font-medium">{p.name}</td><td className="px-4 py-3">{p.level}</td><td className="px-4 py-3">{money(p.gross)}</td><td className="px-4 py-3">{money(p.overtimeAmount)}</td><td className="px-4 py-3">{money(p.absentDeduction + p.lateDeduction + p.loanDeduction)}</td><td className="px-4 py-3 font-bold">{money(p.finalSalary)}</td><td className="px-4 py-3"><Button variant="outline" onClick={() => setSelectedPayslip(p)}>View</Button></td></tr>} />
    </div>
  );
}
