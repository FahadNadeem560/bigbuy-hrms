import { supabase } from "../lib/supabaseClient.js";

const MIGRATION_VERSION = "2026-06-09-v2";
let ran = false;

export async function runMigrations() {
  if (ran) return false;
  ran = true;

  if (localStorage.getItem("hrms_db_version") === MIGRATION_VERSION) return false;

  try {
    const { error } = await supabase.rpc("run_migrations");
    if (error) {
      console.warn("[HRMS] Auto-migration failed:", error.message,
        "\nPlease run SUPABASE_MIGRATIONS.sql manually in the Supabase SQL Editor.");
    } else {
      localStorage.setItem("hrms_db_version", MIGRATION_VERSION);
      console.log("[HRMS] Database schema is up to date.");
    }
  } catch (err) {
    console.warn("[HRMS] Migration check skipped:", err.message);
  }

  return true;
}
