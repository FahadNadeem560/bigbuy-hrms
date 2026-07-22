import { supabase } from "../lib/supabaseClient.js";

// Only the columns mapAttendanceRow() (App.jsx) actually reads — the table has 48 columns total.
const ATTENDANCE_COLUMNS = [
  "id", "employee_code", "eligibility_group", "work_date", "attendance_date",
  "check_in", "check_out", "actual_hours", "worked_hours", "late_minutes",
  "overtime_hours", "attendance_status", "detected_shift", "half_day_exempt",
  "late_exempt", "is_gazetted_holiday", "adjustment_status", "adjustment_approved_by",
  "is_manual_entry", "manual_entry_status",
].join(", ");

async function fetchAttendancePage(from, to) {
  let data, error;
  for (let attempt = 0; attempt < 4; attempt++) {
    ({ data, error } = await supabase
      .from("attendance")
      .select(ATTENDANCE_COLUMNS)
      .order("work_date", { ascending: false })
      .range(from, to));

    if (!error) break;
    // Retry if PostgREST schema cache is still rebuilding
    const isSchemaError = error.message?.includes("Invalid path") ||
      error.code === "PGRST100" || error.code === "PGRST205";
    if (isSchemaError && attempt < 3) {
      await new Promise(r => setTimeout(r, 2000));
    } else {
      break;
    }
  }
  if (error) throw error;
  return data || [];
}

// Runs a batch of async page-fetch calls with limited concurrency so we don't
// fire dozens of requests at once.
async function fetchInBatches(ranges, concurrency = 6) {
  const results = new Array(ranges.length);
  let cursor = 0;
  async function worker() {
    while (cursor < ranges.length) {
      const i = cursor++;
      const [from, to] = ranges[i];
      results[i] = await fetchAttendancePage(from, to);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, ranges.length) }, worker));
  return results.flat();
}

export async function fetchRecentAttendance(limit = 25000) {
  const pageSize = 1000;

  const { count, error: countError } = await supabase
    .from("attendance")
    .select("id", { count: "exact", head: true });
  if (countError) throw countError;

  const total = Math.min(count ?? limit, limit);
  if (total <= 0) return [];

  const ranges = [];
  for (let from = 0; from < total; from += pageSize) {
    ranges.push([from, Math.min(from + pageSize - 1, total - 1)]);
  }

  return fetchInBatches(ranges);
}

export async function runAttendanceProcessing(fromDate, toDate) {
  const { data, error } = await supabase.rpc("run_attendance_processing", {
    p_from_date: fromDate || null,
    p_to_date: toDate || null,
  });
  if (error) throw error;
  return data;
}

// Populates employee_work_rosters.is_weekly_off for the given date range,
// based on each employee's fixed weekly_off_day (0=Sunday..6=Saturday), so
// process_daily_attendance can classify those days as Weekly Off instead of
// Absent. Run this before (or alongside) attendance processing for a period.
export async function generateEmployeeWorkRosters(fromDate, toDate) {
  const { data, error } = await supabase.rpc("generate_employee_work_rosters", {
    p_from_date: fromDate || null,
    p_to_date: toDate || null,
  });
  if (error) throw error;
  return data;
}

export async function fetchAttendanceImportBatches(limit = 50) {
  const { data, error } = await supabase
    .from("attendance_import_batches")
    .select("*")
    .order("uploaded_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function importZKTRawPunches(rows, sourceFilename) {
  const { data, error } = await supabase.rpc("import_zkt_raw_punches", {
    p_rows: rows,
    p_source_filename: sourceFilename || "manual-zkt-upload",
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

export async function importPendingStorageFiles() {
  const { data, error } = await supabase.functions.invoke("zkt-storage-import", {
    body: { source: "manual_button" },
  });
  if (error) throw error;
  return data;
}
