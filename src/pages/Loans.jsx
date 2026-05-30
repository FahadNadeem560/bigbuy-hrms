import React from "react";
import { Badge, PageTitle, Table } from "../components/ui";
import { money } from "../utils/format";
import { checkLoanEligibility } from "../utils/payrollRules";

export default function Loans({ activeEmployees, loans }) {
  return <div><PageTitle title="Loans and Advances" subtitle="Employee eligibility and balance overview." /><Table headers={["Employee", "Service", "Max Eligible", "Balance", "Eligibility"]} rows={activeEmployees} renderRow={(employee) => { const check = checkLoanEligibility(employee, loans); const loan = loans.find((item) => item.employeeCode === employee.id); return <tr key={employee.id}><td className="px-4 py-3">{employee.name}</td><td className="px-4 py-3">{check.serviceYears} yrs</td><td className="px-4 py-3">{money(check.maximumLoan)}</td><td className="px-4 py-3">{money(loan?.balance || 0)}</td><td className="px-4 py-3"><Badge tone={check.eligible ? "green" : "yellow"}>{check.reason}</Badge></td></tr>; }} /></div>;
}
