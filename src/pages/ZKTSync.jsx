import React, { useState } from "react";
import * as XLSX from "xlsx";
import { Button, Card, CardContent, PageTitle } from "../components/ui.js";
import { importZKTRawPunches } from "../services/attendanceService.js";

export default function ZKTSync() {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function readRows(selectedFile) {
    const buffer = await selectedFile.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
  }

  async function importFile() {
    setMessage("");
    setError("");
    if (!file) return setError("Please choose a ZKT Excel or CSV file first.");
    setBusy(true);
    try {
      const rows = await readRows(file);
      if (!rows.length) throw new Error("The selected file has no rows.");
      const result = await importZKTRawPunches(rows, file.name);
      setMessage(`Imported ${Number(result?.imported_rows || 0)} punches. Rejected ${Number(result?.rejected_rows || 0)} rows.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageTitle title="ZKT Live Sync" subtitle="Import ZKT attendance Excel/CSV files into raw punches." />
      <Card className="rounded-2xl border border-slate-100 shadow-sm">
        <CardContent className="p-6">
          <h2 className="text-lg font-bold mb-3">Manual Attendance Import</h2>
          <p className="text-sm text-slate-600 mb-4">Upload the ZKT attendance file with columns like Department, Name, No., Date/Time, Status, Location ID and VerifyCode.</p>
          <input type="file" accept=".xls,.xlsx,.csv" onChange={(e) => setFile(e.target.files?.[0] || null)} className="block w-full text-sm mb-4" />
          {file && <p className="text-sm text-slate-600 mb-4">Selected: <b>{file.name}</b></p>}
          <Button onClick={importFile} disabled={busy} className="rounded-2xl">{busy ? "Importing..." : "Import ZKT File"}</Button>
          {message && <div className="mt-4 p-3 rounded-xl bg-blue-50 text-blue-700">{message}</div>}
          {error && <div className="mt-4 p-3 rounded-xl bg-red-50 text-red-700">{error}</div>}
        </CardContent>
      </Card>
    </div>
  );
}
