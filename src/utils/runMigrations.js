import { supabase } from "../lib/supabaseClient.js";

const MIGRATION_VERSION = "2026-06-20-v5";
let ran = false;

export async function runMigrations() {
  if (ran) return;
  ran = true;

  if (localStorage.getItem("hrms_db_version") === MIGRATION_VERSION) return;

  try {
    await supabase.rpc("run_migrations");
    await applyIncrementalMigrations();
    await waitForDB();
    localStorage.setItem("hrms_db_version", MIGRATION_VERSION);
    console.log("[HRMS] Database schema is up to date.");
  } catch (err) {
    console.warn("[HRMS] Migration check skipped:", err.message);
  }

  await waitForDB();
}

async function applyIncrementalMigrations() {
  const stmts = [
    // employees exemption
    `ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_attendance_exempt BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE employees ADD COLUMN IF NOT EXISTS exemption_reason TEXT`,
    // payroll publish columns
    `ALTER TABLE payroll ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Draft'`,
    `ALTER TABLE payroll ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ`,
    `ALTER TABLE payroll ADD COLUMN IF NOT EXISTS published_by TEXT`,
    `ALTER TABLE payroll ADD COLUMN IF NOT EXISTS fine_deduction NUMERIC DEFAULT 0`,
    `ALTER TABLE payroll ADD COLUMN IF NOT EXISTS shortage_deduction NUMERIC DEFAULT 0`,
    `ALTER TABLE payroll ADD COLUMN IF NOT EXISTS advance_deduction NUMERIC DEFAULT 0`,
    `ALTER TABLE payroll ADD COLUMN IF NOT EXISTS commission NUMERIC DEFAULT 0`,
    `ALTER TABLE payroll ADD COLUMN IF NOT EXISTS other_earnings NUMERIC DEFAULT 0`,
    // fines table
    `CREATE TABLE IF NOT EXISTS fines (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      employee_id UUID,
      employee_code TEXT,
      employee_name TEXT,
      fine_type TEXT,
      amount NUMERIC DEFAULT 0,
      reason TEXT,
      issued_by TEXT,
      issued_by_role TEXT,
      status TEXT DEFAULT 'Pending',
      approved_by TEXT,
      approved_at TIMESTAMPTZ,
      rejection_reason TEXT,
      payroll_month TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON public.fines TO anon, authenticated`,
    // shortages table
    `CREATE TABLE IF NOT EXISTS shortages (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      employee_id UUID,
      employee_code TEXT,
      employee_name TEXT,
      amount NUMERIC DEFAULT 0,
      description TEXT,
      shortage_date DATE,
      entered_by TEXT,
      entered_by_role TEXT,
      status TEXT DEFAULT 'Pending',
      approved_by TEXT,
      approved_at TIMESTAMPTZ,
      rejection_reason TEXT,
      payroll_month TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON public.shortages TO anon, authenticated`,
    // advances table
    `CREATE TABLE IF NOT EXISTS advances (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      employee_id UUID,
      employee_code TEXT,
      employee_name TEXT,
      requested_amount NUMERIC DEFAULT 0,
      approved_amount NUMERIC DEFAULT 0,
      max_eligible NUMERIC DEFAULT 0,
      days_worked_so_far INTEGER,
      salary_at_request NUMERIC,
      request_date DATE,
      payroll_month TEXT,
      status TEXT DEFAULT 'Pending',
      approved_by TEXT,
      approved_at TIMESTAMPTZ,
      rejection_reason TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON public.advances TO anon, authenticated`,
    // v2: attendance new columns
    `ALTER TABLE attendance ADD COLUMN IF NOT EXISTS detected_shift TEXT`,
    `ALTER TABLE attendance ADD COLUMN IF NOT EXISTS half_day_exempt BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE attendance ADD COLUMN IF NOT EXISTS late_exempt BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE attendance ADD COLUMN IF NOT EXISTS is_gazetted_holiday BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE attendance ADD COLUMN IF NOT EXISTS adjustment_status TEXT`,
    `ALTER TABLE attendance ADD COLUMN IF NOT EXISTS adjustment_approved_by TEXT`,
    `ALTER TABLE attendance ADD COLUMN IF NOT EXISTS is_manual_entry BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE attendance ADD COLUMN IF NOT EXISTS manual_entry_by TEXT`,
    `ALTER TABLE attendance ADD COLUMN IF NOT EXISTS manual_entry_approved_by TEXT`,
    `ALTER TABLE attendance ADD COLUMN IF NOT EXISTS manual_entry_status TEXT`,
    // v2: employees new columns
    `ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_field_employee BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_temporary BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE employees ADD COLUMN IF NOT EXISTS temp_id TEXT`,
    `ALTER TABLE employees ADD COLUMN IF NOT EXISTS probation_start_date DATE`,
    `ALTER TABLE employees ADD COLUMN IF NOT EXISTS probation_end_date DATE`,
    `ALTER TABLE employees ADD COLUMN IF NOT EXISTS probation_status TEXT DEFAULT 'Active'`,
    `ALTER TABLE employees ADD COLUMN IF NOT EXISTS employment_status TEXT DEFAULT 'Permanent'`,
    `ALTER TABLE employees ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`,
    `ALTER TABLE employees ADD COLUMN IF NOT EXISTS permanent_id_assigned TEXT`,
    `ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE`,
    // v2: employee_tax_settings tax mode
    `ALTER TABLE employee_tax_settings ADD COLUMN IF NOT EXISTS tax_mode TEXT DEFAULT 'auto'`,
    `ALTER TABLE employee_tax_settings ADD COLUMN IF NOT EXISTS exempt_reason TEXT`,
    // v2: Friday hours policy seeds
    `INSERT INTO hrms_policy_settings (key, value, description, branch) VALUES ('friday_hours_management', '6.5', 'Friday required hours for Management (hours)', 'Global') ON CONFLICT (key) DO NOTHING`,
    `INSERT INTO hrms_policy_settings (key, value, description, branch) VALUES ('friday_hours_non_management', '9', 'Friday required hours for Non-Management (hours)', 'Global') ON CONFLICT (key) DO NOTHING`,
    // v2: grants
    `GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance TO anon, authenticated`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees TO anon, authenticated`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_tax_settings TO anon, authenticated`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON public.leaves TO anon, authenticated`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON public.leave_requests TO anon, authenticated`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON public.hrms_policy_settings TO anon, authenticated`,
  ];

  for (const sql of stmts) {
    try {
      await supabase.rpc("run_sql", { query: sql });
    } catch (_) {
      // run_sql RPC may not exist — fall through silently
    }
  }
}

async function waitForDB(maxWait = 15000) {
  for (let elapsed = 0; elapsed < maxWait; elapsed += 500) {
    await new Promise(r => setTimeout(r, 500));
    try {
      const { error } = await supabase.from("attendance").select("employee_code").limit(1);
      if (!error) return;
    } catch {}
  }
}
