import { supabase } from "../lib/supabaseClient.js";

export async function fetchRecentAttendance(limit = 200) {
  const { data, error } = await supabase
    .from("attendance")
    .select("*")
    .order("attendance_date", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function runAttendanceProcessing(fromDate, toDate) {
  const { data, error } = await supabase.rpc("process_zkt_raw_punches", {
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
