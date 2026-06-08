import { supabase } from "../lib/supabaseClient.js";

let ran = false;

/**
 * Calls the run_migrations() Supabase function to apply any missing
 * columns and tables on app startup. Runs at most once per session.
 *
 * Prerequisites: run SUPABASE_MIGRATIONS.sql in the Supabase SQL Editor
 * at least once so the run_migrations() function exists in the database.
 */
export async function runMigrations() {
  if (ran) return;
  ran = true;

  try {
    const { error } = await supabase.rpc("run_migrations");
    if (error) {
      console.warn(
        "[HRMS] Auto-migration failed:",
        error.message,
        "\nPlease run SUPABASE_MIGRATIONS.sql manually in the Supabase SQL Editor."
      );
    } else {
      console.log("[HRMS] Database schema is up to date.");
    }
  } catch (err) {
    console.warn("[HRMS] Migration check skipped:", err.message);
  }
}
