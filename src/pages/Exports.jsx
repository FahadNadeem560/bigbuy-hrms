import React from "react";
import { Button, Card, CardContent, PageTitle } from "../components/ui";
import { downloadCSV } from "../utils/downloads";

export default function Exports({ employees, payroll, attendance, loans }) {
  return <div><PageTitle title="Excel Export" subtitle="Download HRMS data for review and backup." /><div className="grid grid-cols-1 md:grid-cols-4 gap-4"><Card className="rounded-2xl border border-slate-100 shadow-sm"><CardContent className="p-5"><h2 className="font-bold mb-3">Employees</h2><Button onClick={() => downloadCSV("employees.csv", employees)}>Export</Button></CardContent></Card><Card className="rounded-2xl border border-slate-100 shadow-sm"><CardContent className="p-5"><h2 className="font-bold mb-3">Payroll</h2><Button onClick={() => downloadCSV("payroll.csv", payroll)}>Export</Button></CardContent></Card><Card className="rounded-2xl border border-slate-100 shadow-sm"><CardContent className="p-5"><h2 className="font-bold mb-3">Attendance</h2><Button onClick={() => downloadCSV("attendance.csv", attendance)}>Export</Button></CardContent></Card><Card className="rounded-2xl border border-slate-100 shadow-sm"><CardContent className="p-5"><h2 className="font-bold mb-3">Loans</h2><Button onClick={() => downloadCSV("loans.csv", loans)}>Export</Button></CardContent></Card></div></div>;
}
