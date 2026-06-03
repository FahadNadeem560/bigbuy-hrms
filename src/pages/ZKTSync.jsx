import React, { useState } from "react";
import * as XLSX from "xlsx";
import { Button, Card, CardContent, PageTitle } from "../components/ui.js";
import { importPendingStorageFiles, importZKTRawPunches, runAttendanceProcessing } from "../services/attendanceService.js";

export default function ZKTSync() {
  const [file, setFile] = useState(null);
  const [fromDate, setFromDate] = useState("2026-01-01");
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [storageBusy, setStorageBusy] = useState(false);
  const [processing, setProcessing] = useState(false);
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

  async function importStorageFiles() {
    setMessage("");
    setError("");
    setStorageBusy(true);
    try {
      const result = await importPendingStorageFiles();
      setMessage(`Storage import completed. Processed files: ${Number(result?.processed_files || 0)}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setStorageBusy(false);
    }
  }

  async function processAttendance() {
    setMessage("");
    setError("");
    setProcessing(true);
    try {
      const result = await runAttendanceProcessing(fromDate, toDate);
      const first = Array.isArray(result) ? result[0] : result;
      setMessage(`Processed ${Number(first?.processed_days || 0)} days. Created/updated ${Number(first?.attendance_rows || 0)} attendance rows.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div>
      <PageTitle title="ZKT Live Sync" subtitle="Import ZKT attendance files and process raw punches into attendance." />
      <Card className="rounded-2xl border border-slate-100 shadow-sm mb-6">
        <CardContent className="p-6">
          <h2 className="text-lg font-bold mb-3">Storage Import</h2>
          <p className="text-sm text-slate-600 mb-4">Import all pending CSV files from Supabase Storage: zkt-attendance-imports/incoming.</p>
          <Button onClick={importStorageFiles} disabled={storageBusy} className="rounded-2xl">{storageBusy ? "Importing Pending Files..." : "Import Pending Storage Files"}</Button>
        </CardContent>
      </Card>
      <Card className="rounded-2xl border border-slate-100 shadow-sm mb-6">
        <CardContent className="p-6">
          <h2 className="text-lg font-bold mb-3">Manual Attendance Import</h2>
          <p className="text-sm text-slate-600 mb-4">Upload the ZKT attendance file with columns like Department, Name, No., Date/Time, Status, Location ID and VerifyCode.</p>
          <input type="file" accept=".xls,.xlsx,.csv" onChange={(e) => setFile(e.target.files?.[0] || null)} className="block w-full text-sm mb-4" />
          {file && <p className="text-sm text-slate-600 mb-4">Selected: <b>{file.name}</b></p>}
          <Button onClick={importFile} disabled={busy} className="rounded-2xl">{busy ? "Importing..." : "Import ZKT File"}</Button>
        </CardContent>
      </Card>
      <Card className="rounded-2xl border border-slate-100 shadow-sm">
        <CardContent className="p-6">
          <h2 className="text-lg font-bold mb-3">Process Attendance</h2>
          <p className="text-sm text-slate-600 mb-4">After importing raw punches, process them into attendance rows for the selected date range.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="px-4 py-2 rounded-xl border border-slate-200" />
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="px-4 py-2 rounded-xl border border-slate-200" />
            <Button onClick={processAttendance} disabled={processing} className="rounded-xl">{processing ? "Processing..." : "Process Attendance"}</Button>
          </div>
          {message && <div className="mt-4 p-3 rounded-xl bg-blue-50 text-blue-700">{message}</div>}
          {error && <div className="mt-4 p-3 rounded-xl bg-red-50 text-red-700">{error}</div>}
        </CardContent>
      </Card>
    </div>
  );
}
