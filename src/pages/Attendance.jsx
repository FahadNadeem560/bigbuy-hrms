import React from "react";
import { Button, PageTitle, Table } from "../components/ui.js";
import StatusBadge from "../components/StatusBadge.jsx";
import { downloadCSV } from "../utils/downloads.js";

export default function Attendance({ rows }) {
  return (
    <div>
      <PageTitle
        title="Attendance Processing"
        subtitle="Attendance calculated through staff-level policy rules."
        action={<Button className="rounded-2xl" onClick={() => downloadCSV("attendance.csv", rows)}>Export</Button>}
      />
      <Table
        headers={["Employee", "Level", "Date", "In", "Out", "Actual Hours", "Late", "OT", "Status"]}
        rows={rows}
        renderRow={(row) => (
          <tr key={`${row.employeeCode}-${row.date}`}>
            <td className="px-4 py-3 font-medium">{row.name}</td>
            <td className="px-4 py-3">{row.level}</td>
            <td className="px-4 py-3">{row.date}</td>
            <td className="px-4 py-3">{row.checkIn}</td>
            <td className="px-4 py-3">{row.checkOut}</td>
            <td className="px-4 py-3">{row.actualHours}</td>
            <td className="px-4 py-3">{row.lateMinutes}</td>
            <td className="px-4 py-3">{row.overtimeHours}</td>
            <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
          </tr>
        )}
      />
    </div>
  );
}
