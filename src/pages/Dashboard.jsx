import React from "react";
import { Button, PageTitle, StatCard } from "../components/ui.jsx";
import { money } from "../utils/format.js";

export default function Dashboard({ activeEmployees, attendanceRows, payrollRows, payrollStatus, setActive }) {
  return <div><PageTitle title="HR Dashboard" subtitle="Staff position, payroll snapshot and attendance alerts." action={<Button className="rounded-2xl" onClick={() => setActive("imports")}>Import Employees</Button>} /><div className="grid grid-cols-1 md:grid-cols-4 gap-4"><StatCard title="Active Staff" value={activeEmployees.length} sub="Across branches" icon="👥" /><StatCard title="Attendance Logs" value={attendanceRows.length} sub="Processed punches" icon="✅" /><StatCard title="Late / Half Day" value={attendanceRows.filter((a) => a.status !== "Present").length} sub="Needs review" icon="⚠️" /><StatCard title="Payroll" value={money(payrollRows.reduce((sum, row) => sum + row.finalSalary, 0))} sub={payrollStatus} icon="💰" /></div></div>;
}
