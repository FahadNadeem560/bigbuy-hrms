import React, { useState } from "react";
import * as XLSX from "xlsx";
import { Button, Card, CardContent, PageTitle } from "../components/ui.js";
import { importPendingStorageFiles, importZKTRawPunches, runAttendanceProcessing, generateEmployeeWorkRosters } from "../services/attendanceService.js";

export default function ZKTSync() {
  const [file, setFile] = useState(null);
  const [fromDate, setFromDate] = useState(new Date(Date.now() - 30 * 86400e3).toISOString().slice(0, 10));
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [storageBusy, setStorageBusy] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [rosterBusy, setRosterBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function normalizeStatus(value) {
    const v = String(value || "").trim().toUpperCase();
    if (["I", "IN", "C/IN", "CIN", "CHECK IN"].includes(v)) return "C/In";
    if (["O", "OUT", "C/OUT", "COUT", "CHECK OUT"].includes(v)) return "C/Out";
    return value;
  }

  function looksLikeHeader(cols) {
    const joined = cols.join("|").toLowerCase();
    return joined.includes("date") || joined.includes("time") || joined.includes("status") || joined.includes("department") || joined.includes("name") || joined.includes("location");
  }

  function rowsFromLines(lines) {
    if (lines.length === 0) return [];
    const first = lines[0].map((v) => String(v ?? "").trim());
    if (!looksLikeHeader(first)) {
      return lines.map((c) => ({
        "No.": c[0] ?? c[1] ?? "",
        "Date/Time": c[2] ?? "",
        "Status": normalizeStatus(c[3] ?? ""),
        "Location ID": c[4] ?? "",
        "VerifyCode": c[5] ?? "",
        "CardNo": c[6] ?? "",
      }));
    }
    return lines.slice(1).map((row) => {
      const obj = {};
      first.forEach((h, i) => { obj[h] = row[i] ?? ""; });
      return obj;
    });
  }

  function parseCsvLine(line) {
    const out = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; continue; }
      if (ch === '"') { q = !q; continue; }
      if (ch === ',' && !q) { out.push(cur); cur = ""; continue; }
      cur += ch;
    }
    out.push(cur);
    return out.map((v) => v.trim());
  }

  // Raw ZKT device exports have no header row and their Date/Time column
  // (e.g. "2026-07-01 22:33:44") gets silently mangled by the xlsx library's
  // date auto-detection when parsed as a spreadsheet cell (it reformats to a
  // short date like "7/1/26", dropping the time and breaking every row).
  // Parse .csv files as plain text instead — same approach the storage-sync
  // edge function already uses successfully — and only hand real .xls/.xlsx
  // binary files to the xlsx library.
  async function readRows(selectedFile) {
    const isCsv = /\.csv$/i.test(selectedFile.name);
    if (isCsv) {
      const text = await selectedFile.text();
      const lines = text.split(/\r?\n/)
        .filter((line) => line.trim().length > 0)
        .map(parseCsvLine);
      return rowsFromLines(lines);
    }
    const buffer = await selectedFile.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
    const lines = raw.filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""));
    return rowsFromLines(lines);
  }

  // Large backlog files (thousands of rows) sent as one RPC call can exceed
  // Postgres's statement_timeout even with the dedup fix, so split into
  // chunks. Each chunk needs its own source filename -- the RPC keys its
  // batch row on filename and deletes+rebuilds that batch's rows on every
  // call, so reusing the same filename across chunks would wipe the
  // previous chunk's imported rows.
  const IMPORT_CHUNK_SIZE = 1000;

  async function importFile() {
    setMessage("");
    setError("");
    if (!file) return setError("Please choose a ZKT Excel or CSV file first.");
    setBusy(true);
    try {
      const rows = await readRows(file);
      if (!rows.length) throw new Error("The selected file has no rows.");

      const chunks = [];
      for (let i = 0; i < rows.length; i += IMPORT_CHUNK_SIZE) {
        chunks.push(rows.slice(i, i + IMPORT_CHUNK_SIZE));
      }

      let imported = 0;
      let rejected = 0;
      for (let i = 0; i < chunks.length; i++) {
        const chunkName = chunks.length > 1 ? `${file.name}#part${i + 1}` : file.name;
        setMessage(`Importing part ${i + 1} of ${chunks.length}...`);
        const result = await importZKTRawPunches(chunks[i], chunkName);
        imported += Number(result?.imported_rows || 0);
        rejected += Number(result?.rejected_rows || 0);
      }
      setMessage(`Imported ${imported} punches. Rejected ${rejected} rows.`);
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

  // process_zkt_raw_punches pairs check-in/check-out via a correlated
  // subquery per punch and rebuilds the whole date range's attendance rows
  // in one statement, so a wide range over a large backlog can exceed
  // Postgres's statement_timeout. Split into day windows -- the RPC is
  // documented safe to re-run over overlapping/adjacent ranges since it
  // deletes+rebuilds per range before inserting.
  const PROCESS_CHUNK_DAYS = 3;

  function chunkDateRange(from, to, chunkDays) {
    const chunks = [];
    let cursor = new Date(`${from}T00:00:00Z`);
    const end = new Date(`${to}T00:00:00Z`);
    while (cursor <= end) {
      const chunkEnd = new Date(cursor);
      chunkEnd.setUTCDate(chunkEnd.getUTCDate() + chunkDays - 1);
      if (chunkEnd > end) chunkEnd.setTime(end.getTime());
      chunks.push([cursor.toISOString().slice(0, 10), chunkEnd.toISOString().slice(0, 10)]);
      cursor = new Date(chunkEnd);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return chunks;
  }

  async function processAttendance() {
    setMessage("");
    setError("");
    setProcessing(true);
    try {
      const chunks = chunkDateRange(fromDate, toDate, PROCESS_CHUNK_DAYS);
      let processedDays = 0;
      let attendanceRows = 0;
      let needsReview = 0;
      let absentCount = 0;
      for (let i = 0; i < chunks.length; i++) {
        const [chunkFrom, chunkTo] = chunks[i];
        setMessage(`Processing ${chunkFrom} to ${chunkTo} (${i + 1} of ${chunks.length})...`);
        const result = await runAttendanceProcessing(chunkFrom, chunkTo);
        const first = Array.isArray(result) ? result[0] : result;
        processedDays += Number(first?.processed_days || 0);
        attendanceRows += Number(first?.inserted_or_updated || 0);
        needsReview += Number(first?.needs_review_count || 0);
        absentCount += Number(first?.absent_count || 0);
      }
      setMessage(`Processed ${processedDays} days. Created/updated ${attendanceRows} attendance rows (${absentCount} absent, ${needsReview} need review).`);
    } catch (err) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  }

  async function generateRosters() {
    setMessage("");
    setError("");
    setRosterBusy(true);
    try {
      const result = await generateEmployeeWorkRosters(fromDate, toDate);
      const first = Array.isArray(result) ? result[0] : result;
      setMessage(`Marked ${Number(first?.weekly_off_rows || 0)} weekly-off days across ${Number(first?.processed_days || 0)} days.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setRosterBusy(false);
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
      <Card className="rounded-2xl border border-slate-100 shadow-sm mb-6">
        <CardContent className="p-6">
          <h2 className="text-lg font-bold mb-3">Generate Weekly Off Rosters</h2>
          <p className="text-sm text-slate-600 mb-4">Marks each employee's fixed weekly off day (set on their profile) for the selected date range, so Process Attendance below correctly classifies those days as Weekly Off instead of Absent. Run this before Process Attendance for a new period.</p>
          <Button onClick={generateRosters} disabled={rosterBusy} className="rounded-2xl">{rosterBusy ? "Generating..." : "Generate Weekly Off Rosters"}</Button>
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
