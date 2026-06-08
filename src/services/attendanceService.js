import { supabase } from "../lib/supabaseClient.js";

export async function fetchRecentAttendance(limit = 25000) {
  const pageSize = 1000;
  const allRows = [];

  for (let from = 0; from < limit; from += pageSize) {
    const to = Math.min(from + pageSize - 1, limit - 1);

    let data, error;
    for (let attempt = 0; attempt < 4; attempt++) {
      ({ data, error } = await supabase
        .from("attendance")
        .select("*")
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
    if (!data || data.length === 0) break;

    allRows.push(...data);

    if (data.length < pageSize) break;
  }

  return allRows;
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

export async function importPendingStorageFiles() {
  const { data, error } = await supabase.functions.invoke("zkt-storage-import", {
    body: { source: "manual_button" },
  });
  if (error) throw error;
  return data;
}
