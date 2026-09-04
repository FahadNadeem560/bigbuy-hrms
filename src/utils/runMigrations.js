import { supabase } from "../lib/supabaseClient.js";

const MIGRATION_VERSION = "2026-09-04-v14";
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
    // v3: rate divisor policy seeds
    `INSERT INTO hrms_policy_settings (key, value, description) VALUES ('daily_rate_divisor', '30', 'Daily rate divisor (salary / this)') ON CONFLICT (key) DO NOTHING`,
    `INSERT INTO hrms_policy_settings (key, value, description) VALUES ('hourly_rate_divisor_non_management', '10.5', 'Hourly rate divisor for Non-Management staff') ON CONFLICT (key) DO NOTHING`,
    `INSERT INTO hrms_policy_settings (key, value, description) VALUES ('hourly_rate_divisor_floor_management', '10.5', 'Hourly rate divisor for Floor Management staff') ON CONFLICT (key) DO NOTHING`,
    `INSERT INTO hrms_policy_settings (key, value, description) VALUES ('hourly_rate_divisor_management', '9', 'Hourly rate divisor for Management staff') ON CONFLICT (key) DO NOTHING`,
    // v4: leaves extra columns for opening balance import
    `ALTER TABLE leaves ADD COLUMN IF NOT EXISTS half_leaves NUMERIC DEFAULT 0`,
    `ALTER TABLE leaves ADD COLUMN IF NOT EXISTS effective_from DATE`,
    `ALTER TABLE leaves ADD COLUMN IF NOT EXISTS earned NUMERIC DEFAULT 0`,
    // v8: Payroll Control System — payment status, lock, holdover, cash incentives, verification
    `ALTER TABLE payroll ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'Normal'`,
    `ALTER TABLE payroll ADD COLUMN IF NOT EXISTS payment_status_changed_by TEXT`,
    `ALTER TABLE payroll ADD COLUMN IF NOT EXISTS payment_status_changed_at TIMESTAMPTZ`,
    `ALTER TABLE payroll ADD COLUMN IF NOT EXISTS payment_status_approved_by TEXT`,
    `ALTER TABLE payroll ADD COLUMN IF NOT EXISTS payment_status_reason TEXT`,
    `ALTER TABLE payroll ADD COLUMN IF NOT EXISTS is_paid BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE payroll ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ`,
    `ALTER TABLE payroll ADD COLUMN IF NOT EXISTS paid_by TEXT`,
    `ALTER TABLE payroll ADD COLUMN IF NOT EXISTS holdover_from_month TEXT`,
    `ALTER TABLE payroll ADD COLUMN IF NOT EXISTS holdover_amount NUMERIC DEFAULT 0`,
    `ALTER TABLE payroll ADD COLUMN IF NOT EXISTS holdover_approved_by TEXT`,
    `CREATE TABLE IF NOT EXISTS payroll_locks (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      payroll_month TEXT NOT NULL UNIQUE,
      locked_at TIMESTAMPTZ DEFAULT NOW(),
      locked_by TEXT,
      unlocked_at TIMESTAMPTZ,
      unlocked_by TEXT,
      unlock_reason TEXT,
      is_locked BOOLEAN DEFAULT TRUE
    )`,
    `CREATE TABLE IF NOT EXISTS cash_incentives (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      employee_id UUID REFERENCES employees(id),
      employee_code TEXT,
      employee_name TEXT,
      branch TEXT,
      department TEXT,
      amount NUMERIC NOT NULL,
      payroll_month TEXT NOT NULL,
      given_by TEXT,
      given_by_role TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS payroll_verifications (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      payroll_month TEXT NOT NULL,
      supervisor_employee_id UUID REFERENCES employees(id),
      supervisor_name TEXT,
      branch TEXT,
      team_employee_codes TEXT[],
      status TEXT DEFAULT 'Pending',
      confirmed_at TIMESTAMPTZ,
      changes_notes TEXT,
      re_confirmed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS payment_status_requests (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      employee_id UUID REFERENCES employees(id),
      employee_code TEXT,
      employee_name TEXT,
      payroll_month TEXT,
      requested_by TEXT,
      current_status TEXT,
      requested_status TEXT,
      reason TEXT,
      status TEXT DEFAULT 'Pending',
      approved_by TEXT,
      approved_at TIMESTAMPTZ,
      rejection_reason TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_locks TO anon, authenticated`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_incentives TO anon, authenticated`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_verifications TO anon, authenticated`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_status_requests TO anon, authenticated`,
    // v9: WhatsApp workflow — onboarding OTP columns (employee_message_queue already existed, unused)
    `ALTER TABLE employees ADD COLUMN IF NOT EXISTS whatsapp_otp_code TEXT`,
    `ALTER TABLE employees ADD COLUMN IF NOT EXISTS whatsapp_otp_expires_at TIMESTAMPTZ`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_message_queue TO anon, authenticated`,
    // v10: Advances Management System — HR requests, Finance approves + issues,
    // payroll auto-deducts on the advance's month (Pending -> Approved -> Issued -> Deducted)
    `ALTER TABLE advances ADD COLUMN IF NOT EXISTS issued_amount NUMERIC DEFAULT 0`,
    `ALTER TABLE advances ADD COLUMN IF NOT EXISTS advance_month TEXT`,
    `ALTER TABLE advances ADD COLUMN IF NOT EXISTS requested_by TEXT`,
    `ALTER TABLE advances ADD COLUMN IF NOT EXISTS issued_by TEXT`,
    `ALTER TABLE advances ADD COLUMN IF NOT EXISTS issued_at TIMESTAMPTZ`,
    `ALTER TABLE advances ADD COLUMN IF NOT EXISTS deducted_in_month TEXT`,
    `ALTER TABLE advances ADD COLUMN IF NOT EXISTS deducted_at TIMESTAMPTZ`,
    `ALTER TABLE advances ADD COLUMN IF NOT EXISTS excess_amount NUMERIC DEFAULT 0`,
    `ALTER TABLE advances ADD COLUMN IF NOT EXISTS excess_reason TEXT`,
    `ALTER TABLE advances ADD COLUMN IF NOT EXISTS excess_approved_by TEXT`,
    `ALTER TABLE advances ADD COLUMN IF NOT EXISTS branch TEXT`,
    `ALTER TABLE advances ADD COLUMN IF NOT EXISTS department TEXT`,
    `ALTER TABLE advances ADD COLUMN IF NOT EXISTS notes TEXT`,
    `UPDATE advances SET advance_month = payroll_month WHERE advance_month IS NULL AND payroll_month IS NOT NULL`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON public.advances TO anon, authenticated`,
    // v11: dismiss an employee from the "Due for Increment" list for their
    // current due_date only — a later/new next_increment_due naturally
    // reappears since the dismissal is scoped to the specific date.
    `CREATE TABLE IF NOT EXISTS public.increment_due_dismissals (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      employee_code TEXT NOT NULL,
      employee_name TEXT,
      due_date DATE NOT NULL,
      reason TEXT,
      dismissed_by TEXT,
      dismissed_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (employee_code, due_date)
    )`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON public.increment_due_dismissals TO anon, authenticated`,
    // v12: employee-level Half Day Exempt / Late Exempt standing policy
    // (Permissions tab) -- distinct from the pre-existing per-day
    // attendance.half_day_exempt/late_exempt Timesheet toggle, both are
    // OR'd together by classify_attendance_day.
    `ALTER TABLE employees ADD COLUMN IF NOT EXISTS half_day_exempt BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE employees ADD COLUMN IF NOT EXISTS late_exempt BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE attendance ADD COLUMN IF NOT EXISTS half_day_exempt_applied BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE attendance ADD COLUMN IF NOT EXISTS late_exempt_applied BOOLEAN DEFAULT FALSE`,
    // v13: Final Settlement lives in its own final_settlements table now (out
    // of payroll entirely — see FinalSettlement.jsx). Table was originally
    // applied live only; mirrored here for reproducibility. Plus termination
    // support (separation_type / termination_date / salary_payable) and the
    // Master-override payout modes (payout_mode: worked | full_period | custom).
    `CREATE TABLE IF NOT EXISTS final_settlements (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      employee_code TEXT NOT NULL UNIQUE,
      payroll_month TEXT NOT NULL,
      resignation_date DATE,
      last_working_day DATE,
      resignation_reason TEXT,
      staff_level TEXT,
      branch TEXT,
      department TEXT,
      salary NUMERIC NOT NULL DEFAULT 0,
      daily_rate NUMERIC NOT NULL DEFAULT 0,
      days_present INTEGER NOT NULL DEFAULT 0,
      weekly_offs INTEGER NOT NULL DEFAULT 0,
      absent_days INTEGER NOT NULL DEFAULT 0,
      paid_days INTEGER NOT NULL DEFAULT 0,
      pending_salary NUMERIC NOT NULL DEFAULT 0,
      leave_encashment NUMERIC NOT NULL DEFAULT 0,
      loan_balance NUMERIC NOT NULL DEFAULT 0,
      notice_required_days INTEGER,
      notice_served_days INTEGER,
      notice_complete BOOLEAN NOT NULL DEFAULT FALSE,
      notice_penalty NUMERIC NOT NULL DEFAULT 0,
      is_absconding BOOLEAN NOT NULL DEFAULT FALSE,
      override_applied BOOLEAN NOT NULL DEFAULT FALSE,
      override_by TEXT,
      override_reason TEXT,
      gross_earnings NUMERIC NOT NULL DEFAULT 0,
      total_deductions NUMERIC NOT NULL DEFAULT 0,
      net_payable NUMERIC NOT NULL DEFAULT 0,
      payment_status TEXT NOT NULL DEFAULT 'FnF',
      is_paid BOOLEAN NOT NULL DEFAULT FALSE,
      paid_at TIMESTAMPTZ,
      paid_by TEXT,
      settled_by TEXT,
      settled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS final_settlements_payroll_month_idx ON public.final_settlements (payroll_month)`,
    `ALTER TABLE final_settlements ADD COLUMN IF NOT EXISTS separation_type TEXT DEFAULT 'resignation'`,
    `ALTER TABLE final_settlements ADD COLUMN IF NOT EXISTS termination_date DATE`,
    `ALTER TABLE final_settlements ADD COLUMN IF NOT EXISTS salary_payable BOOLEAN DEFAULT TRUE`,
    `ALTER TABLE final_settlements ADD COLUMN IF NOT EXISTS payout_mode TEXT DEFAULT 'worked'`,
    `ALTER TABLE final_settlements ADD COLUMN IF NOT EXISTS payout_days INTEGER`,
    // F&F approval gate: HR initiates, Master/GM release, then Finance pays.
    `ALTER TABLE final_settlements ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'Pending Approval'`,
    `ALTER TABLE final_settlements ADD COLUMN IF NOT EXISTS approved_by TEXT`,
    `ALTER TABLE final_settlements ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ`,
    `ALTER TABLE final_settlements ADD COLUMN IF NOT EXISTS rejection_reason TEXT`,
    `CREATE INDEX IF NOT EXISTS final_settlements_approval_status_idx ON public.final_settlements (approval_status)`,
    `ALTER TABLE employees ADD COLUMN IF NOT EXISTS termination_date DATE`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON public.final_settlements TO anon, authenticated`,
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
