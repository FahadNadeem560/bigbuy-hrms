import { supabase } from "../lib/supabaseClient.js";

const MIGRATION_VERSION = "2026-06-09-v3";
let ran = false;

export async function runMigrations() {
  if (ran) return;
  ran = true;

  if (localStorage.getItem("hrms_db_version") === MIGRATION_VERSION) return;

  try {
    const { error } = await supabase.rpc("run_migrations");
    if (error) {
      console.warn("[HRMS] Auto-migration failed:", error.message,
        "\nPlease run SUPABASE_MIGRATIONS.sql manually in the Supabase SQL Editor.");
    } else {
      await waitForDB();
      localStorage.setItem("hrms_db_version", MIGRATION_VERSION);
      console.log("[HRMS] Database schema is up to date.");
    }
  } catch (err) {
    console.warn("[HRMS] Migration check skipped:", err.message);
  }

  // Always wait for DB to be ready before returning, regardless of migration outcome.
  // Ensures App.jsx never starts loading data while PostgREST is mid-rebuild.
  await waitForDB();
}

async function waitForDB(maxWait = 15000) {
  for (let elapsed = 0; elapsed < maxWait; elapsed += 500) {
    await new Promise(r => setTimeout(r, 500));
    try {
      // Poll attendance specifically — it's the table that fails during PostgREST rebuilds
      const { error } = await supabase.from("attendance").select("employee_code").limit(1);
      if (!error) return;
    } catch {}
  }
}
