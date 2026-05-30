import { supabase } from "../lib/supabaseClient";

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
  const { data, error } = await supabase.rpc("run_attendance_processing", {
    p_from_date: fromDate,
    p_to_date: toDate,
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
