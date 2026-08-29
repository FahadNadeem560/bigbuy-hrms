-- =============================================================
-- BigBuy HRMS — Comprehensive Supabase Schema Migrations
-- =============================================================
-- Safe to run multiple times. Every statement uses IF NOT EXISTS.
-- Run this in the Supabase SQL Editor, OR call run_migrations()
-- from the app (src/utils/runMigrations.js).
-- =============================================================


-- ─────────────────────────────────────────────────────────────
-- employees: all new columns
-- ─────────────────────────────────────────────────────────────
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS account_number                TEXT,
  ADD COLUMN IF NOT EXISTS bank_name                     TEXT,
  ADD COLUMN IF NOT EXISTS iban                          TEXT,
  ADD COLUMN IF NOT EXISTS cnic                          TEXT,
  ADD COLUMN IF NOT EXISTS cnic_issue_date               DATE,
  ADD COLUMN IF NOT EXISTS cnic_expiry_date              DATE,
  ADD COLUMN IF NOT EXISTS reference_person_name         TEXT,
  ADD COLUMN IF NOT EXISTS reference_person_contact      TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_name        TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_number      TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_relationship TEXT,
  ADD COLUMN IF NOT EXISTS billing_info                  TEXT,
  ADD COLUMN IF NOT EXISTS billing_address               TEXT,
  ADD COLUMN IF NOT EXISTS permanent_address             TEXT,
  ADD COLUMN IF NOT EXISTS current_address               TEXT,
  ADD COLUMN IF NOT EXISTS personal_phone                TEXT,
  ADD COLUMN IF NOT EXISTS work_phone                    TEXT,
  ADD COLUMN IF NOT EXISTS email                         TEXT,
  ADD COLUMN IF NOT EXISTS photo_url                     TEXT,
  ADD COLUMN IF NOT EXISTS supervisor_id                 UUID REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS is_supervisor                 BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_manager                    BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS staff_level                   TEXT    DEFAULT 'Staff',
  ADD COLUMN IF NOT EXISTS cnic_document_url             TEXT,
  ADD COLUMN IF NOT EXISTS cnic_copy_url                 TEXT,
  ADD COLUMN IF NOT EXISTS contract_document_url         TEXT,
  ADD COLUMN IF NOT EXISTS employment_contract_url       TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_number               TEXT,
  ADD COLUMN IF NOT EXISTS fathers_cnic                  TEXT,
  ADD COLUMN IF NOT EXISTS resignation_date              DATE,
  ADD COLUMN IF NOT EXISTS last_working_day              DATE,
  ADD COLUMN IF NOT EXISTS shift                         TEXT,
  ADD COLUMN IF NOT EXISTS category_department           TEXT;

-- ─────────────────────────────────────────────────────────────
-- attendance_adjustments: approval workflow columns
-- ─────────────────────────────────────────────────────────────
ALTER TABLE attendance_adjustments
  ADD COLUMN IF NOT EXISTS status           TEXT DEFAULT 'Pending',
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS approved_by      TEXT;

-- ─────────────────────────────────────────────────────────────
-- leave_requests: extra columns used across pages
-- ─────────────────────────────────────────────────────────────
ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS start_date       DATE,
  ADD COLUMN IF NOT EXISTS end_date         DATE,
  ADD COLUMN IF NOT EXISTS employee_name    TEXT,
  ADD COLUMN IF NOT EXISTS employee_id      TEXT,
  ADD COLUMN IF NOT EXISTS applied_date     DATE,
  ADD COLUMN IF NOT EXISTS days             NUMERIC,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- ─────────────────────────────────────────────────────────────
-- loans: all required columns + permissions
-- ─────────────────────────────────────────────────────────────
ALTER TABLE loans ADD COLUMN IF NOT EXISTS loan_type           TEXT    DEFAULT 'General';
ALTER TABLE loans ADD COLUMN IF NOT EXISTS loan_date           DATE;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS granted_date        DATE;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS status              TEXT    DEFAULT 'Active';
ALTER TABLE loans ADD COLUMN IF NOT EXISTS employee_code       TEXT;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS employee_name       TEXT;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS loan_amount         NUMERIC DEFAULT 0;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS monthly_deduction   NUMERIC DEFAULT 0;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS outstanding_balance NUMERIC DEFAULT 0;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS start_date          DATE;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS reason              TEXT;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS repayment_months    INTEGER;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS auto_deduct         BOOLEAN DEFAULT TRUE;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loans TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- notifications: recipient_code for employee-level routing
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id                    UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  recipient_role        TEXT,
  recipient_employee_id UUID        REFERENCES employees(id),
  recipient_code        TEXT,
  title                 TEXT        NOT NULL,
  message               TEXT,
  type                  TEXT,
  link                  TEXT,
  is_read               BOOLEAN     DEFAULT FALSE,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS recipient_code TEXT;

-- ─────────────────────────────────────────────────────────────
-- approval_requests
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS approval_requests (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  request_type     TEXT        NOT NULL,
  requested_by     TEXT,
  employee_id      UUID        REFERENCES employees(id),
  details          JSONB,
  status           TEXT        DEFAULT 'Pending',
  rejection_reason TEXT,
  reviewed_by      TEXT,
  reviewed_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- one_time_adjustments
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS one_time_adjustments (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id      UUID        REFERENCES employees(id),
  employee_code    TEXT,
  employee_name    TEXT,
  type             TEXT,
  amount           NUMERIC,
  reason           TEXT,
  payroll_month    TEXT,
  status           TEXT        DEFAULT 'Pending',
  rejection_reason TEXT,
  submitted_by     TEXT,
  created_by       TEXT,
  approved_by      TEXT,
  approved_at      TIMESTAMPTZ,
  reviewed_by      TEXT,
  reviewed_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE one_time_adjustments
  ADD COLUMN IF NOT EXISTS employee_code TEXT,
  ADD COLUMN IF NOT EXISTS employee_name TEXT,
  ADD COLUMN IF NOT EXISTS submitted_by  TEXT,
  ADD COLUMN IF NOT EXISTS approved_by   TEXT,
  ADD COLUMN IF NOT EXISTS approved_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS calc_mode     TEXT DEFAULT 'Full Amount';

-- ─────────────────────────────────────────────────────────────
-- fuel_claims
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fuel_claims (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id       UUID        REFERENCES employees(id),
  employee_code     TEXT,
  employee_name     TEXT,
  claim_month       TEXT,
  route             TEXT,
  trip_date         DATE,
  km_traveled       NUMERIC,
  rate_per_km       NUMERIC,
  rate_used         NUMERIC,
  amount            NUMERIC,
  calculated_amount NUMERIC,
  purpose           TEXT,
  status            TEXT        DEFAULT 'Pending',
  approved_by       TEXT,
  approved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE fuel_claims
  ADD COLUMN IF NOT EXISTS employee_code     TEXT,
  ADD COLUMN IF NOT EXISTS employee_name     TEXT,
  ADD COLUMN IF NOT EXISTS calculated_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS rate_used         NUMERIC,
  ADD COLUMN IF NOT EXISTS approved_by       TEXT,
  ADD COLUMN IF NOT EXISTS approved_at       TIMESTAMPTZ;

-- ─────────────────────────────────────────────────────────────
-- fixed_allowances
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fixed_allowances (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id    UUID        REFERENCES employees(id),
  employee_code  TEXT,
  employee_name  TEXT,
  type           TEXT,
  category       TEXT        DEFAULT 'Allowance',
  amount         NUMERIC,
  description    TEXT,
  effective_from DATE,
  effective_to   DATE,
  is_active      BOOLEAN     DEFAULT TRUE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE fixed_allowances
  ADD COLUMN IF NOT EXISTS employee_code TEXT,
  ADD COLUMN IF NOT EXISTS employee_name TEXT,
  ADD COLUMN IF NOT EXISTS category      TEXT DEFAULT 'Allowance',
  ADD COLUMN IF NOT EXISTS description   TEXT;

-- ─────────────────────────────────────────────────────────────
-- tax_slabs  (added base_tax / rate_percentage / label columns)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tax_slabs (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  fiscal_year     TEXT,
  min_amount      NUMERIC,
  max_amount      NUMERIC,
  fixed_tax       NUMERIC     DEFAULT 0,
  base_tax        NUMERIC     DEFAULT 0,
  rate            NUMERIC,
  rate_percentage NUMERIC,
  label           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE tax_slabs
  ADD COLUMN IF NOT EXISTS base_tax        NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rate_percentage NUMERIC,
  ADD COLUMN IF NOT EXISTS label           TEXT;

-- ─────────────────────────────────────────────────────────────
-- timesheet_signoffs  (ApprovalQueue.jsx)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS timesheet_signoffs (
  id                   UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_code        TEXT,
  employee_name        TEXT,
  month                TEXT,
  supervisor_signed_off BOOLEAN    DEFAULT FALSE,
  hr_reviewed          BOOLEAN     DEFAULT FALSE,
  payroll_ready        BOOLEAN     DEFAULT FALSE,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- settlement_requests  (ApprovalQueue.jsx)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settlement_requests (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_code   TEXT,
  employee_name   TEXT,
  branch          TEXT,
  resign_date     DATE,
  last_working_day DATE,
  net_settlement  NUMERIC,
  status          TEXT        DEFAULT 'Pending',
  rejection_reason TEXT,
  approved_by     TEXT,
  approved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- salary_increments  (ApprovalQueue.jsx)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS salary_increments (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_code    TEXT,
  employee_name    TEXT,
  old_salary       NUMERIC,
  new_salary       NUMERIC,
  effective_from   DATE,
  status           TEXT        DEFAULT 'Pending',
  submitted_by     TEXT,
  approved_by      TEXT,
  approved_at      TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- salary_structures  (CompensationManagement.jsx)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS salary_structures (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_code    TEXT,
  employee_name    TEXT,
  basic            NUMERIC     DEFAULT 0,
  hra              NUMERIC     DEFAULT 0,
  medical          NUMERIC     DEFAULT 0,
  conveyance       NUMERIC     DEFAULT 0,
  other_allowances NUMERIC     DEFAULT 0,
  total_ctc        NUMERIC     DEFAULT 0,
  effective_from   DATE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- departments  (DepartmentManagement.jsx)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS departments (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT        NOT NULL,
  description TEXT,
  is_active   BOOLEAN     DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- designations  (DepartmentManagement.jsx)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS designations (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name          TEXT        NOT NULL,
  department_id UUID        REFERENCES departments(id),
  description   TEXT,
  is_active     BOOLEAN     DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- fuel_rates  (FuelAllowance.jsx)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fuel_rates (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  rate_per_km    NUMERIC     NOT NULL,
  effective_from DATE,
  created_by     TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- employee_vehicles  (FuelAllowance.jsx)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_vehicles (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_code TEXT,
  employee_name TEXT,
  vehicle_type  TEXT        DEFAULT 'Car',
  registration  TEXT,
  is_eligible   BOOLEAN     DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- hrms_policy_settings  (PolicySettings.jsx)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hrms_policy_settings (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  key         TEXT        NOT NULL UNIQUE,
  value       TEXT,
  description TEXT,
  branch      TEXT        DEFAULT 'Global',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- shifts  (RosterManagement.jsx)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shifts (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name             TEXT        NOT NULL,
  start_time       TEXT,
  end_time         TEXT,
  grace_minutes    INTEGER     DEFAULT 15,
  days_applicable  TEXT        DEFAULT 'Mon,Tue,Wed,Thu,Fri',
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- employee_shifts  (RosterManagement.jsx)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_shifts (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_code TEXT,
  employee_name TEXT,
  shift_id      UUID        REFERENCES shifts(id),
  effective_from DATE,
  is_active     BOOLEAN     DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- shift_auto_rules  (RosterManagement.jsx)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shift_auto_rules (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  department TEXT        NOT NULL,
  shift_id   UUID        REFERENCES shifts(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- roster_entries  (RosterManagement.jsx)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS roster_entries (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_code TEXT,
  employee_name TEXT,
  shift_id      UUID        REFERENCES shifts(id),
  work_date     DATE,
  is_day_off    BOOLEAN     DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- employee_tax_settings  (TaxManagement.jsx)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_tax_settings (
  id                 UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_code      TEXT        NOT NULL UNIQUE,
  tax_enabled        BOOLEAN     DEFAULT FALSE,
  manual_tax_amount  NUMERIC,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);


-- ─────────────────────────────────────────────────────────────
-- loan_changes  (LoanManagement.jsx)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loan_changes (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  loan_id       UUID,
  employee_code TEXT,
  change_type   TEXT,
  old_balance   NUMERIC,
  new_balance   NUMERIC,
  old_monthly   NUMERIC,
  new_monthly   NUMERIC,
  reason        TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- grants: tables that exist but were missing anon access
-- ─────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leaves      TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_logs  TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll     TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users       TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loan_changes TO anon, authenticated;

-- =============================================================
-- run_migrations() — callable from the app via supabase.rpc()
-- SECURITY DEFINER: runs with owner privileges to execute DDL
-- Safe to call multiple times — fully idempotent
-- =============================================================
CREATE OR REPLACE FUNCTION run_migrations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- ── employees ──────────────────────────────────────────────
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS account_number                TEXT;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS bank_name                     TEXT;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS iban                          TEXT;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS cnic                          TEXT;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS cnic_issue_date               DATE;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS cnic_expiry_date              DATE;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS reference_person_name         TEXT;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS reference_person_contact      TEXT;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS emergency_contact_name        TEXT;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS emergency_contact_number      TEXT;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS emergency_contact_relationship TEXT;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS billing_info                  TEXT;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS billing_address               TEXT;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS permanent_address             TEXT;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS current_address               TEXT;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS personal_phone                TEXT;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS work_phone                    TEXT;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS email                         TEXT;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS photo_url                     TEXT;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS supervisor_id                 UUID;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_supervisor                 BOOLEAN DEFAULT FALSE;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_manager                    BOOLEAN DEFAULT FALSE;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS staff_level                   TEXT    DEFAULT 'Staff';
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS cnic_document_url             TEXT;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS cnic_copy_url                 TEXT;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS contract_document_url         TEXT;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS employment_contract_url       TEXT;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS whatsapp_number               TEXT;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS fathers_cnic                  TEXT;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS resignation_date              DATE;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS last_working_day              DATE;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS shift                         TEXT;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS category_department           TEXT;

  -- ── attendance_adjustments ─────────────────────────────────
  ALTER TABLE attendance_adjustments ADD COLUMN IF NOT EXISTS status           TEXT DEFAULT 'Pending';
  ALTER TABLE attendance_adjustments ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
  ALTER TABLE attendance_adjustments ADD COLUMN IF NOT EXISTS approved_by      TEXT;

  -- ── leave_requests ─────────────────────────────────────────
  ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS start_date       DATE;
  ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS end_date         DATE;
  ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS employee_name    TEXT;
  ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS employee_id      TEXT;
  ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS applied_date     DATE;
  ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS days             NUMERIC;
  ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

  -- ── loans ──────────────────────────────────────────────────
  ALTER TABLE loans ADD COLUMN IF NOT EXISTS loan_type           TEXT    DEFAULT 'General';
  ALTER TABLE loans ADD COLUMN IF NOT EXISTS loan_date           DATE;
  ALTER TABLE loans ADD COLUMN IF NOT EXISTS granted_date        DATE;
  ALTER TABLE loans ADD COLUMN IF NOT EXISTS status              TEXT    DEFAULT 'Active';
  ALTER TABLE loans ADD COLUMN IF NOT EXISTS employee_code       TEXT;
  ALTER TABLE loans ADD COLUMN IF NOT EXISTS employee_name       TEXT;
  ALTER TABLE loans ADD COLUMN IF NOT EXISTS loan_amount         NUMERIC DEFAULT 0;
  ALTER TABLE loans ADD COLUMN IF NOT EXISTS monthly_deduction   NUMERIC DEFAULT 0;
  ALTER TABLE loans ADD COLUMN IF NOT EXISTS outstanding_balance NUMERIC DEFAULT 0;
  ALTER TABLE loans ADD COLUMN IF NOT EXISTS start_date          DATE;
  ALTER TABLE loans ADD COLUMN IF NOT EXISTS reason              TEXT;
  ALTER TABLE loans ADD COLUMN IF NOT EXISTS repayment_months    INTEGER;
  ALTER TABLE loans ADD COLUMN IF NOT EXISTS auto_deduct         BOOLEAN DEFAULT TRUE;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.loans TO anon, authenticated;

  -- ── notifications ──────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS notifications (
    id                    UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    recipient_role        TEXT,
    recipient_employee_id UUID,
    recipient_code        TEXT,
    title                 TEXT        NOT NULL,
    message               TEXT,
    type                  TEXT,
    link                  TEXT,
    is_read               BOOLEAN     DEFAULT FALSE,
    created_at            TIMESTAMPTZ DEFAULT NOW()
  );
  ALTER TABLE notifications ADD COLUMN IF NOT EXISTS recipient_code TEXT;

  -- ── one_time_adjustments ───────────────────────────────────
  CREATE TABLE IF NOT EXISTS one_time_adjustments (
    id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    employee_id      UUID,
    employee_code    TEXT,
    employee_name    TEXT,
    type             TEXT,
    amount           NUMERIC,
    reason           TEXT,
    payroll_month    TEXT,
    status           TEXT        DEFAULT 'Pending',
    rejection_reason TEXT,
    submitted_by     TEXT,
    created_by       TEXT,
    approved_by      TEXT,
    approved_at      TIMESTAMPTZ,
    reviewed_by      TEXT,
    reviewed_at      TIMESTAMPTZ,
    created_at       TIMESTAMPTZ DEFAULT NOW()
  );
  ALTER TABLE one_time_adjustments ADD COLUMN IF NOT EXISTS employee_code TEXT;
  ALTER TABLE one_time_adjustments ADD COLUMN IF NOT EXISTS employee_name TEXT;
  ALTER TABLE one_time_adjustments ADD COLUMN IF NOT EXISTS submitted_by  TEXT;
  ALTER TABLE one_time_adjustments ADD COLUMN IF NOT EXISTS approved_by   TEXT;
  ALTER TABLE one_time_adjustments ADD COLUMN IF NOT EXISTS approved_at   TIMESTAMPTZ;
  ALTER TABLE one_time_adjustments ADD COLUMN IF NOT EXISTS calc_mode     TEXT DEFAULT 'Full Amount';

  -- ── fuel_claims ────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS fuel_claims (
    id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    employee_id       UUID,
    employee_code     TEXT,
    employee_name     TEXT,
    claim_month       TEXT,
    route             TEXT,
    trip_date         DATE,
    km_traveled       NUMERIC,
    rate_per_km       NUMERIC,
    rate_used         NUMERIC,
    amount            NUMERIC,
    calculated_amount NUMERIC,
    purpose           TEXT,
    status            TEXT        DEFAULT 'Pending',
    approved_by       TEXT,
    approved_at       TIMESTAMPTZ,
    created_at        TIMESTAMPTZ DEFAULT NOW()
  );
  ALTER TABLE fuel_claims ADD COLUMN IF NOT EXISTS employee_code     TEXT;
  ALTER TABLE fuel_claims ADD COLUMN IF NOT EXISTS employee_name     TEXT;
  ALTER TABLE fuel_claims ADD COLUMN IF NOT EXISTS calculated_amount NUMERIC;
  ALTER TABLE fuel_claims ADD COLUMN IF NOT EXISTS rate_used         NUMERIC;
  ALTER TABLE fuel_claims ADD COLUMN IF NOT EXISTS approved_by       TEXT;
  ALTER TABLE fuel_claims ADD COLUMN IF NOT EXISTS approved_at       TIMESTAMPTZ;

  -- ── fixed_allowances ───────────────────────────────────────
  CREATE TABLE IF NOT EXISTS fixed_allowances (
    id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    employee_id    UUID,
    employee_code  TEXT,
    employee_name  TEXT,
    type           TEXT,
    category       TEXT        DEFAULT 'Allowance',
    amount         NUMERIC,
    description    TEXT,
    effective_from DATE,
    effective_to   DATE,
    is_active      BOOLEAN     DEFAULT TRUE,
    created_at     TIMESTAMPTZ DEFAULT NOW()
  );
  ALTER TABLE fixed_allowances ADD COLUMN IF NOT EXISTS employee_code TEXT;
  ALTER TABLE fixed_allowances ADD COLUMN IF NOT EXISTS employee_name TEXT;
  ALTER TABLE fixed_allowances ADD COLUMN IF NOT EXISTS category      TEXT DEFAULT 'Allowance';
  ALTER TABLE fixed_allowances ADD COLUMN IF NOT EXISTS description   TEXT;

  -- ── tax_slabs ──────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS tax_slabs (
    id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    fiscal_year     TEXT,
    min_amount      NUMERIC,
    max_amount      NUMERIC,
    fixed_tax       NUMERIC     DEFAULT 0,
    base_tax        NUMERIC     DEFAULT 0,
    rate            NUMERIC,
    rate_percentage NUMERIC,
    label           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
  );
  ALTER TABLE tax_slabs ADD COLUMN IF NOT EXISTS base_tax        NUMERIC DEFAULT 0;
  ALTER TABLE tax_slabs ADD COLUMN IF NOT EXISTS rate_percentage NUMERIC;
  ALTER TABLE tax_slabs ADD COLUMN IF NOT EXISTS label           TEXT;

  -- ── timesheet_signoffs ─────────────────────────────────────
  CREATE TABLE IF NOT EXISTS timesheet_signoffs (
    id                    UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    employee_code         TEXT,
    employee_name         TEXT,
    month                 TEXT,
    supervisor_signed_off BOOLEAN     DEFAULT FALSE,
    hr_reviewed           BOOLEAN     DEFAULT FALSE,
    payroll_ready         BOOLEAN     DEFAULT FALSE,
    created_at            TIMESTAMPTZ DEFAULT NOW()
  );

  -- ── settlement_requests ────────────────────────────────────
  CREATE TABLE IF NOT EXISTS settlement_requests (
    id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    employee_code    TEXT,
    employee_name    TEXT,
    branch           TEXT,
    resign_date      DATE,
    last_working_day DATE,
    net_settlement   NUMERIC,
    status           TEXT        DEFAULT 'Pending',
    rejection_reason TEXT,
    approved_by      TEXT,
    approved_at      TIMESTAMPTZ,
    created_at       TIMESTAMPTZ DEFAULT NOW()
  );

  -- ── salary_increments ──────────────────────────────────────
  CREATE TABLE IF NOT EXISTS salary_increments (
    id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    employee_code    TEXT,
    employee_name    TEXT,
    old_salary       NUMERIC,
    new_salary       NUMERIC,
    effective_from   DATE,
    status           TEXT        DEFAULT 'Pending',
    submitted_by     TEXT,
    approved_by      TEXT,
    approved_at      TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at       TIMESTAMPTZ DEFAULT NOW()
  );

  -- ── salary_structures ──────────────────────────────────────
  CREATE TABLE IF NOT EXISTS salary_structures (
    id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    employee_code    TEXT,
    employee_name    TEXT,
    basic            NUMERIC     DEFAULT 0,
    hra              NUMERIC     DEFAULT 0,
    medical          NUMERIC     DEFAULT 0,
    conveyance       NUMERIC     DEFAULT 0,
    other_allowances NUMERIC     DEFAULT 0,
    total_ctc        NUMERIC     DEFAULT 0,
    effective_from   DATE,
    created_at       TIMESTAMPTZ DEFAULT NOW()
  );

  -- ── departments ────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS departments (
    id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    name        TEXT        NOT NULL,
    description TEXT,
    is_active   BOOLEAN     DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
  );

  -- ── designations ───────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS designations (
    id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    name          TEXT        NOT NULL,
    department_id UUID,
    description   TEXT,
    is_active     BOOLEAN     DEFAULT TRUE,
    created_at    TIMESTAMPTZ DEFAULT NOW()
  );

  -- ── fuel_rates ─────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS fuel_rates (
    id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    rate_per_km    NUMERIC     NOT NULL,
    effective_from DATE,
    created_by     TEXT,
    created_at     TIMESTAMPTZ DEFAULT NOW()
  );

  -- ── employee_vehicles ──────────────────────────────────────
  CREATE TABLE IF NOT EXISTS employee_vehicles (
    id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    employee_code TEXT,
    employee_name TEXT,
    vehicle_type  TEXT        DEFAULT 'Car',
    registration  TEXT,
    is_eligible   BOOLEAN     DEFAULT TRUE,
    created_at    TIMESTAMPTZ DEFAULT NOW()
  );

  -- ── hrms_policy_settings ───────────────────────────────────
  CREATE TABLE IF NOT EXISTS hrms_policy_settings (
    id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    key         TEXT        NOT NULL UNIQUE,
    value       TEXT,
    description TEXT,
    branch      TEXT        DEFAULT 'Global',
    created_at  TIMESTAMPTZ DEFAULT NOW()
  );

  -- ── shifts ─────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS shifts (
    id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    name            TEXT        NOT NULL,
    start_time      TEXT,
    end_time        TEXT,
    grace_minutes   INTEGER     DEFAULT 15,
    days_applicable TEXT        DEFAULT 'Mon,Tue,Wed,Thu,Fri',
    created_at      TIMESTAMPTZ DEFAULT NOW()
  );

  -- ── employee_shifts ────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS employee_shifts (
    id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    employee_code  TEXT,
    employee_name  TEXT,
    shift_id       UUID,
    effective_from DATE,
    is_active      BOOLEAN     DEFAULT TRUE,
    created_at     TIMESTAMPTZ DEFAULT NOW()
  );

  -- ── shift_auto_rules ───────────────────────────────────────
  CREATE TABLE IF NOT EXISTS shift_auto_rules (
    id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    department TEXT        NOT NULL,
    shift_id   UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- ── roster_entries ─────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS roster_entries (
    id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    employee_code TEXT,
    employee_name TEXT,
    shift_id      UUID,
    work_date     DATE,
    is_day_off    BOOLEAN     DEFAULT FALSE,
    created_at    TIMESTAMPTZ DEFAULT NOW()
  );

  -- ── employee_tax_settings ──────────────────────────────────
  CREATE TABLE IF NOT EXISTS employee_tax_settings (
    id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    employee_code     TEXT        NOT NULL UNIQUE,
    tax_enabled       BOOLEAN     DEFAULT FALSE,
    manual_tax_amount NUMERIC,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
  );

  -- ── loan_changes ───────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS loan_changes (
    id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    loan_id       UUID,
    employee_code TEXT,
    change_type   TEXT,
    old_balance   NUMERIC,
    new_balance   NUMERIC,
    old_monthly   NUMERIC,
    new_monthly   NUMERIC,
    reason        TEXT,
    created_at    TIMESTAMPTZ DEFAULT NOW()
  );

  -- ── grants: tables that exist but lack anon access ─────────
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.leaves     TO anon, authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_logs TO anon, authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll    TO anon, authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.users      TO anon, authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.loan_changes TO anon, authenticated;

  -- ── employees: attendance exemption ───────────────────────
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_attendance_exempt BOOLEAN DEFAULT FALSE;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS exemption_reason TEXT;

  -- ── payroll: publish columns + new deductions ─────────────
  ALTER TABLE payroll ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Draft';
  ALTER TABLE payroll ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
  ALTER TABLE payroll ADD COLUMN IF NOT EXISTS published_by TEXT;
  ALTER TABLE payroll ADD COLUMN IF NOT EXISTS fine_deduction NUMERIC DEFAULT 0;
  ALTER TABLE payroll ADD COLUMN IF NOT EXISTS shortage_deduction NUMERIC DEFAULT 0;
  ALTER TABLE payroll ADD COLUMN IF NOT EXISTS advance_deduction NUMERIC DEFAULT 0;
  ALTER TABLE payroll ADD COLUMN IF NOT EXISTS commission NUMERIC DEFAULT 0;
  ALTER TABLE payroll ADD COLUMN IF NOT EXISTS other_earnings NUMERIC DEFAULT 0;

  -- ── fines ─────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS fines (
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
  );
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.fines TO anon, authenticated;

  -- ── shortages ─────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS shortages (
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
  );
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.shortages TO anon, authenticated;

  -- ── advances ──────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS advances (
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
  );
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.advances TO anon, authenticated;

  -- ── attendance: new operational columns (v2) ───────────────
  ALTER TABLE attendance ADD COLUMN IF NOT EXISTS detected_shift           TEXT;
  ALTER TABLE attendance ADD COLUMN IF NOT EXISTS half_day_exempt          BOOLEAN DEFAULT FALSE;
  ALTER TABLE attendance ADD COLUMN IF NOT EXISTS late_exempt              BOOLEAN DEFAULT FALSE;
  ALTER TABLE attendance ADD COLUMN IF NOT EXISTS is_gazetted_holiday      BOOLEAN DEFAULT FALSE;
  ALTER TABLE attendance ADD COLUMN IF NOT EXISTS adjustment_status        TEXT;
  ALTER TABLE attendance ADD COLUMN IF NOT EXISTS adjustment_approved_by   TEXT;
  ALTER TABLE attendance ADD COLUMN IF NOT EXISTS is_manual_entry          BOOLEAN DEFAULT FALSE;
  ALTER TABLE attendance ADD COLUMN IF NOT EXISTS manual_entry_by          TEXT;
  ALTER TABLE attendance ADD COLUMN IF NOT EXISTS manual_entry_approved_by TEXT;
  ALTER TABLE attendance ADD COLUMN IF NOT EXISTS manual_entry_status      TEXT;

  -- ── employees: field + temporary + probation columns ────────
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_field_employee     BOOLEAN DEFAULT FALSE;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_temporary          BOOLEAN DEFAULT FALSE;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS temp_id               TEXT;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS probation_start_date  DATE;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS probation_end_date    DATE;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS probation_status      TEXT    DEFAULT 'Active';
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS employment_status     TEXT    DEFAULT 'Permanent';
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS archived_at           TIMESTAMPTZ;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS permanent_id_assigned TEXT;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_deleted            BOOLEAN DEFAULT FALSE;

  -- ── employee_tax_settings: tax mode ─────────────────────────
  ALTER TABLE employee_tax_settings ADD COLUMN IF NOT EXISTS tax_mode      TEXT DEFAULT 'auto';
  ALTER TABLE employee_tax_settings ADD COLUMN IF NOT EXISTS exempt_reason TEXT;

  -- ── hrms_policy_settings: Friday hours ──────────────────────
  INSERT INTO hrms_policy_settings (key, value, description, branch) VALUES
    ('friday_hours_management',     '6.5', 'Friday required hours for Management (hours)',     'Global'),
    ('friday_hours_non_management', '9',   'Friday required hours for Non-Management (hours)', 'Global')
  ON CONFLICT (key) DO NOTHING;

  -- ── grants v2 ────────────────────────────────────────────────
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance            TO anon, authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees             TO anon, authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_tax_settings TO anon, authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.leave_requests        TO anon, authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.hrms_policy_settings  TO anon, authenticated;

END;
$$;

GRANT EXECUTE ON FUNCTION run_migrations() TO anon, authenticated;

-- =============================================================
-- Migration: feature-2026-06-20-v2 (standalone)
-- Friday shifts, shift auto-detection, leave quota, settlement
-- fix, weekly off rules, A4 timesheet, manual tax, field
-- employees, temporary enrollment with probation workflow.
-- =============================================================

ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS detected_shift           TEXT,
  ADD COLUMN IF NOT EXISTS half_day_exempt          BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS late_exempt              BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_gazetted_holiday      BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS adjustment_status        TEXT,
  ADD COLUMN IF NOT EXISTS adjustment_approved_by   TEXT,
  ADD COLUMN IF NOT EXISTS is_manual_entry          BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS manual_entry_by          TEXT,
  ADD COLUMN IF NOT EXISTS manual_entry_approved_by TEXT,
  ADD COLUMN IF NOT EXISTS manual_entry_status      TEXT;

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS is_field_employee     BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_temporary          BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS temp_id               TEXT,
  ADD COLUMN IF NOT EXISTS probation_start_date  DATE,
  ADD COLUMN IF NOT EXISTS probation_end_date    DATE,
  ADD COLUMN IF NOT EXISTS probation_status      TEXT    DEFAULT 'Active',
  ADD COLUMN IF NOT EXISTS employment_status     TEXT    DEFAULT 'Permanent',
  ADD COLUMN IF NOT EXISTS archived_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS permanent_id_assigned TEXT,
  ADD COLUMN IF NOT EXISTS is_deleted            BOOLEAN DEFAULT FALSE;

ALTER TABLE employee_tax_settings
  ADD COLUMN IF NOT EXISTS tax_mode      TEXT DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS exempt_reason TEXT;

INSERT INTO hrms_policy_settings (key, value, description, branch) VALUES
  ('friday_hours_management',     '6.5', 'Friday required hours for Management (hours)',     'Global'),
  ('friday_hours_non_management', '9',   'Friday required hours for Non-Management (hours)', 'Global')
ON CONFLICT (key) DO NOTHING;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance             TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees              TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_tax_settings  TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leaves                 TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leave_requests         TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hrms_policy_settings   TO anon, authenticated;


-- =============================================================
-- Migration: add_payroll_extended_columns
-- Applied: 2026-06-18
-- Adds attendance info, earnings breakdown, and deductions
-- breakdown columns to the payroll table.
-- =============================================================
ALTER TABLE payroll
  ADD COLUMN IF NOT EXISTS number_of_working_days    INTEGER        DEFAULT 0,
  ADD COLUMN IF NOT EXISTS present_days              INTEGER        DEFAULT 0,
  ADD COLUMN IF NOT EXISTS absent_days               INTEGER        DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ot_hours                  NUMERIC(8,2)   DEFAULT 0,
  ADD COLUMN IF NOT EXISTS late_count                INTEGER        DEFAULT 0,
  ADD COLUMN IF NOT EXISTS leave_days_used           INTEGER        DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extra_working_days        INTEGER        DEFAULT 0,
  -- Earnings
  ADD COLUMN IF NOT EXISTS commission_addon          NUMERIC(12,2)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS arrears                   NUMERIC(12,2)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS absent_adjustment         NUMERIC(12,2)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fuel_allowance            NUMERIC(12,2)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_amount              NUMERIC(12,2)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extra_working_days_amount NUMERIC(12,2)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_earnings            NUMERIC(12,2)  DEFAULT 0,
  -- Deductions
  ADD COLUMN IF NOT EXISTS short_hour_deduction      NUMERIC(12,2)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS half_day_deduction        NUMERIC(12,2)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fines                     NUMERIC(12,2)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS advance                   NUMERIC(12,2)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_deduction             NUMERIC(12,2)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS eobi_deduction            NUMERIC(12,2)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_deductions          NUMERIC(12,2)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_deductions          NUMERIC(12,2)  DEFAULT 0;

-- =============================================================
-- Migration: fines_shortages_advances_payroll_publish
-- Applied: 2026-06-20
-- Adds fines, shortages, advances tables; payroll publish columns;
-- attendance exemption; and updated payroll deduction columns.
-- =============================================================

-- ── employees: attendance exemption ───────────────────────────
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS is_attendance_exempt BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS exemption_reason     TEXT;

-- ── payroll: publish/lock + new deduction columns ─────────────
ALTER TABLE payroll
  ADD COLUMN IF NOT EXISTS status              TEXT    DEFAULT 'Draft',
  ADD COLUMN IF NOT EXISTS published_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS published_by        TEXT,
  ADD COLUMN IF NOT EXISTS fine_deduction      NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shortage_deduction  NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS advance_deduction   NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission          NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_add_on   NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_earnings      NUMERIC(12,2) DEFAULT 0;

-- ── fines ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fines (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id      UUID        REFERENCES employees(id),
  employee_code    TEXT,
  employee_name    TEXT,
  fine_type        TEXT,
  amount           NUMERIC     DEFAULT 0,
  reason           TEXT,
  issued_by        TEXT,
  issued_by_role   TEXT,
  status           TEXT        DEFAULT 'Pending',
  approved_by      TEXT,
  approved_at      TIMESTAMPTZ,
  rejection_reason TEXT,
  payroll_month    TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fines TO anon, authenticated;

-- ── shortages ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shortages (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id      UUID        REFERENCES employees(id),
  employee_code    TEXT,
  employee_name    TEXT,
  amount           NUMERIC     DEFAULT 0,
  description      TEXT,
  shortage_date    DATE,
  entered_by       TEXT,
  entered_by_role  TEXT,
  status           TEXT        DEFAULT 'Pending',
  approved_by      TEXT,
  approved_at      TIMESTAMPTZ,
  rejection_reason TEXT,
  payroll_month    TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shortages TO anon, authenticated;

-- ── advances ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS advances (
  id                 UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id        UUID        REFERENCES employees(id),
  employee_code      TEXT,
  employee_name      TEXT,
  requested_amount   NUMERIC     DEFAULT 0,
  approved_amount    NUMERIC     DEFAULT 0,
  max_eligible       NUMERIC     DEFAULT 0,
  days_worked_so_far INTEGER,
  salary_at_request  NUMERIC,
  request_date       DATE,
  payroll_month      TEXT,
  status             TEXT        DEFAULT 'Pending',
  approved_by        TEXT,
  approved_at        TIMESTAMPTZ,
  rejection_reason   TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================
-- Applied: 2026-07-07
-- Fix ZKT attendance import performance: avoid per-row exception
-- handling for duplicate punches (each caught exception inside a
-- PL/pgSQL loop implicitly opens/rolls back a subtransaction, which
-- is very slow once most rows in a file are duplicates -- was
-- causing "canceling statement due to statement timeout" on large
-- imports). Switched the duplicate path to INSERT ... ON CONFLICT
-- DO NOTHING. Also fixed a latent bug where v_punch_time wasn't
-- reset per loop iteration, which could leak a stale timestamp from
-- one row into the next when a row's own Date/Time fields were
-- unparsable.
-- =============================================================

CREATE OR REPLACE FUNCTION public.import_zkt_raw_punches(p_rows jsonb, p_source_filename text DEFAULT 'manual-upload'::text)
 RETURNS TABLE(batch_id uuid, imported_rows integer, rejected_rows integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  r jsonb;
  v_batch_id uuid;
  v_imported integer := 0;
  v_rejected integer := 0;
  v_row_no integer := 0;
  v_no text;
  v_punch_time timestamp;
  v_status text;
  v_location text;
  v_verify text;
  v_workcode text;
  v_dept text;
  v_name text;
  v_date text;
  v_time text;
  k text;
  v_inserted_id uuid;
begin
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Rows must be a JSON array';
  end if;

  insert into public.attendance_import_batches(storage_path, original_filename, status, imported_rows, rejected_rows)
  values ('manual/' || coalesce(p_source_filename, 'manual-upload'), coalesce(p_source_filename, 'manual-upload'), 'Processing', 0, 0)
  on conflict (storage_path) do update set processing_attempts = public.attendance_import_batches.processing_attempts + 1, last_attempt_at = now(), status = 'Processing', imported_rows = 0, rejected_rows = 0
  returning id into v_batch_id;

  delete from public.attendance_import_rejections where import_batch_id = v_batch_id;
  delete from public.zkt_raw_punches where import_batch_id = v_batch_id;

  for r in select * from jsonb_array_elements(p_rows)
  loop
    v_row_no := v_row_no + 1;
    v_punch_time := null;
    begin
      v_no := nullif(trim(coalesce(r->>'No.', r->>'No', r->>'no', r->>'Emp ID', r->>'EMP.ID', r->>'Employee ID', r->>'employee_code', r->>'zkt_employee_no')), '');
      v_status := nullif(trim(coalesce(r->>'Status', r->>'status', r->>'Punch State', r->>'punch_status')), '');
      v_location := nullif(trim(coalesce(r->>'Location ID', r->>'Location', r->>'Device ID', r->>'location_id', r->>'LocationID')), '');
      v_verify := nullif(trim(coalesce(r->>'VerifyCode', r->>'Verify Code', r->>'Verify', r->>'verify_code')), '');
      v_workcode := nullif(trim(coalesce(r->>'Workcode', r->>'Work Code', r->>'work_code')), '');
      v_dept := nullif(trim(coalesce(r->>'Department', r->>'Dept', r->>'department')), '');
      v_name := nullif(trim(coalesce(r->>'Name', r->>'Employee Name', r->>'name')), '');
      v_date := nullif(trim(coalesce(r->>'Date', r->>'Punch Date', r->>'date')), '');
      v_time := nullif(trim(coalesce(r->>'Time', r->>'Punch Time', r->>'time')), '');

      if v_no is null then
        for k in select jsonb_object_keys(r)
        loop
          if k ~ '^[0-9]+$' and length(k) <= 10 then
            v_no := k;
            exit;
          end if;
        end loop;
      end if;

      if v_punch_time is null then
        for k in select jsonb_object_keys(r)
        loop
          if k ~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}[ T][0-9]{2}:[0-9]{2}' then
            v_punch_time := k::timestamp;
            exit;
          end if;
        end loop;
      end if;

      v_punch_time := coalesce(v_punch_time, nullif(trim(coalesce(r->>'Date/Time', r->>'Date Time', r->>'datetime', r->>'punch_time', case when v_date is not null and v_time is not null then v_date || ' ' || v_time else null end)), '')::timestamp);

      if v_status is null then
        for k in select jsonb_object_keys(r)
        loop
          if upper(k) in ('I','O','C/IN','C/OUT') then
            v_status := k;
            exit;
          end if;
        end loop;
      end if;

      if upper(coalesce(v_status,'')) = 'I' then v_status := 'C/In'; end if;
      if upper(coalesce(v_status,'')) = 'O' then v_status := 'C/Out'; end if;

      if v_no is null or v_punch_time is null then
        raise exception 'Missing employee no or punch time';
      end if;

      v_inserted_id := null;
      insert into public.zkt_raw_punches(import_batch_id, zkt_employee_no, employee_code, punch_time, punch_status, verify_code, work_code, location_id, department, raw_name, source_filename, raw_row_number, mapping_status)
      values (v_batch_id, v_no, v_no, v_punch_time, v_status, v_verify, v_workcode, v_location, v_dept, v_name, p_source_filename, v_row_no, 'Mapped')
      on conflict (zkt_employee_no, punch_time, coalesce(punch_status, ''), coalesce(location_id, ''))
      do nothing
      returning id into v_inserted_id;

      if v_inserted_id is not null then
        v_imported := v_imported + 1;
      else
        -- Legitimate duplicate: same punch already imported earlier. Handled via
        -- ON CONFLICT DO NOTHING (cheap) instead of catching a unique-violation
        -- exception per row -- each caught exception inside a PL/pgSQL loop implicitly
        -- opens and rolls back a subtransaction, which is very slow at scale when most
        -- rows in a file are duplicates.
        insert into public.attendance_import_rejections(import_batch_id, source_filename, raw_row_number, raw_payload, rejection_reason)
        values (v_batch_id, p_source_filename, v_row_no, r, 'duplicate key value violates unique constraint "zkt_raw_punches_dedup_uq"');
        v_rejected := v_rejected + 1;
      end if;
    exception when others then
      insert into public.attendance_import_rejections(import_batch_id, source_filename, raw_row_number, raw_payload, rejection_reason)
      values (v_batch_id, p_source_filename, v_row_no, r, sqlerrm);
      v_rejected := v_rejected + 1;
    end;
  end loop;

  update public.attendance_import_batches
  set imported_rows = v_imported,
      rejected_rows = v_rejected,
      processed_at = now(),
      status = case when v_rejected = 0 then 'Imported' else 'Imported with Rejections' end
  where id = v_batch_id;

  return query select v_batch_id, v_imported, v_rejected;
end;
$function$;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.advances TO anon, authenticated;

-- =============================================================
-- Backfilled: 2026-07-08
-- These two objects already existed live in Supabase (created directly
-- against the DB, not via this file) -- discovered while diagnosing the
-- ZKT statement-timeout bug. Adding them here so the migrations file
-- matches production. No behavior change.
-- =============================================================

-- ── zkt_raw_punches: dedup unique index ────────────────────────
-- import_zkt_raw_punches's `insert ... on conflict (...) do nothing`
-- requires this index to exist.
CREATE UNIQUE INDEX IF NOT EXISTS zkt_raw_punches_dedup_uq
  ON public.zkt_raw_punches
  USING btree (zkt_employee_no, punch_time, COALESCE(punch_status, ''::text), COALESCE(location_id, ''::text));

-- ── process_zkt_raw_punches: raw punches -> attendance ─────────
-- Pairs check-in/check-out punches per employee per day (20h max shift
-- window, plus an overnight-shift fallback for check-outs before 06:00),
-- dedupes to one row per employee/day, then deletes+rebuilds `attendance`
-- rows for the given date range (NULL bounds = all time). Safe to re-run
-- over overlapping/adjacent ranges. Large single-call ranges over the
-- outage backlog hit statement_timeout -- see how it's called in
-- src/pages/ZKTSync.jsx (chunked into 3-day windows client-side).
CREATE OR REPLACE FUNCTION public.process_zkt_raw_punches(p_from_date date DEFAULT NULL::date, p_to_date date DEFAULT NULL::date)
 RETURNS TABLE(processed_days integer, attendance_rows integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_processed_days integer := 0;
  v_attendance_rows integer := 0;
begin
  delete from public.attendance
  where source = 'ZKT'
    and (p_from_date is null or coalesce(work_date, attendance_date) >= p_from_date)
    and (p_to_date is null or coalesce(work_date, attendance_date) <= p_to_date);

  create temp table tmp_zkt_punches on commit drop as
  select
    coalesce(employee_code, zkt_employee_no) as employee_code,
    punch_time,
    lower(coalesce(punch_status,'')) as status
  from public.zkt_raw_punches
  where (p_from_date is null or punch_time::date >= p_from_date)
    and (p_to_date is null or punch_time::date <= p_to_date + interval '1 day')
    and coalesce(employee_code, zkt_employee_no) is not null;

  create index on tmp_zkt_punches(employee_code, punch_time);

  create temp table tmp_zkt_pairs on commit drop as
  select
    i.employee_code,
    i.punch_time::date as work_date,
    i.punch_time as check_in,
    coalesce(
      (
        select min(o.punch_time)
        from tmp_zkt_punches o
        where o.employee_code = i.employee_code
          and o.status in ('c/out','cout','check out','out')
          and o.punch_time > i.punch_time
          and o.punch_time <= i.punch_time + interval '20 hours'
      ),
      (
        select min(o.punch_time + interval '1 day')
        from tmp_zkt_punches o
        where o.employee_code = i.employee_code
          and o.status in ('c/out','cout','check out','out')
          and o.punch_time::date = i.punch_time::date
          and o.punch_time::time < time '06:00'
          and i.punch_time::time >= time '10:00'
      )
    ) as check_out
  from tmp_zkt_punches i
  where i.status in ('c/in','cin','check in','in')
    and (p_from_date is null or i.punch_time::date >= p_from_date)
    and (p_to_date is null or i.punch_time::date <= p_to_date);

  create temp table tmp_zkt_deduped on commit drop as
  select distinct on (employee_code, work_date)
    employee_code, work_date, check_in, check_out
  from tmp_zkt_pairs
  order by employee_code, work_date, check_in asc;

  with enriched as (
    select
      d.employee_code,
      d.work_date,
      d.check_in,
      d.check_out,
      e.staff_level,
      e.eligibility_group,
      e.assigned_shift_code,
      extract(epoch from (coalesce(d.check_out, d.check_in) - d.check_in)) / 3600.0 as worked_hours
    from tmp_zkt_deduped d
    left join public.employees e on e.employee_code = d.employee_code or e.zkt_employee_no = d.employee_code
  ), inserted as (
    insert into public.attendance (
      employee_code, attendance_date, work_date, check_in, check_out, first_check_in, last_check_out,
      actual_hours, worked_hours, required_hours, short_hours, overtime_hours, late_minutes,
      attendance_status, source, eligibility_group, shift_code, calculated_at, needs_review
    )
    select
      employee_code,
      work_date,
      work_date,
      check_in,
      coalesce(check_out, check_in),
      check_in,
      coalesce(check_out, check_in),
      round(greatest(worked_hours, 0)::numeric, 2),
      round(greatest(worked_hours, 0)::numeric, 2),
      case when staff_level = 'Management' then 9 else 10.5 end,
      round(greatest((case when staff_level = 'Management' then 9 else 10.5 end) - worked_hours, 0)::numeric, 2),
      round(greatest(worked_hours - (case when staff_level = 'Management' then 9 else 10.5 end), 0)::numeric, 2),
      round(greatest(extract(epoch from (check_in - (work_date::timestamp + time '11:00'))) / 60.0, 0)::numeric, 0),
      case
        when check_out is null then 'Single Punch'
        when worked_hours >= (case when staff_level = 'Management' then 9 else 10.5 end) then 'Present'
        when worked_hours >= 5 then 'Short Hours'
        else 'Half Day'
      end,
      'ZKT', eligibility_group, assigned_shift_code, now(), check_out is null
    from enriched
    returning 1
  )
  select count(*) into v_attendance_rows from inserted;

  update public.zkt_raw_punches
  set processing_status = 'Processed'
  where (p_from_date is null or punch_time::date >= p_from_date)
    and (p_to_date is null or punch_time::date <= p_to_date + interval '1 day');

  select count(*) into v_processed_days
  from public.attendance
  where source = 'ZKT'
    and (p_from_date is null or work_date >= p_from_date)
    and (p_to_date is null or work_date <= p_to_date);

  return query select v_processed_days, v_attendance_rows;
end;
$function$;

-- =============================================================
-- Applied: 2026-07-08
-- Branch Manager + GM roles, multi-stage leave approval chain,
-- real auth foundations. Schema additions only (additive, safe to
-- apply immediately). RLS policies are a separate later migration,
-- applied only once the real-auth frontend is ready to deploy --
-- enabling RLS before then would break the currently-deployed
-- anon-key/no-login frontend for the live user.
-- =============================================================

-- ── users: real-auth support columns ───────────────────────────
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;

-- ── leave_requests: columns the app code already expects ───────
-- submitApplication() in LeaveManagement.jsx writes these; the live
-- table was missing them entirely, so leave submission has never
-- actually succeeded (leave_requests had 0 rows).
ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS leave_type TEXT,
  ADD COLUMN IF NOT EXISTS from_date DATE,
  ADD COLUMN IF NOT EXISTS to_date DATE,
  ADD COLUMN IF NOT EXISTS is_unpaid BOOLEAN DEFAULT FALSE;

-- ── leave_approvals: real per-stage audit trail ─────────────────
-- leave_requests.approved_by/approved_at get overwritten every stage
-- today, losing prior-stage history. This table keeps one row per
-- stage transition instead.
CREATE TABLE IF NOT EXISTS public.leave_approvals (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  leave_request_id UUID        REFERENCES public.leave_requests(id) ON DELETE CASCADE,
  stage            TEXT        NOT NULL,
  actor_role       TEXT,
  actor_name       TEXT,
  action           TEXT        NOT NULL,
  reason           TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leave_approvals TO anon, authenticated;

-- ── notifications: branch filter for Branch Manager notifications ──
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS related_branch TEXT;

-- ── RLS helper functions ────────────────────────────────────────────
-- Named app_current_role/app_current_branch, NOT current_role/current_branch
-- -- `CURRENT_ROLE` is a reserved Postgres keyword (returns the session's DB
-- role) and collides with a same-named function: `current_role()` is a
-- syntax error, not just a naming clash.
CREATE OR REPLACE FUNCTION public.app_current_role()
 RETURNS text
 LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT role FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.app_current_branch()
 RETURNS text
 LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT branch FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.app_current_role() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_current_branch() TO anon, authenticated;

-- SECURITY DEFINER helper for the attendance/leave_requests policies below.
-- Those policies need each row's employee's branch, but employees now has
-- its own RLS enabled -- a raw subquery against employees from within
-- another table's policy caused Postgres to error ("nested" RLS evaluation
-- across two RLS-protected tables). Routing through a SECURITY DEFINER
-- function (which runs as the function owner and bypasses RLS on the table
-- it queries) avoids that.
CREATE OR REPLACE FUNCTION public.employee_branch(p_employee_code text)
 RETURNS text
 LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT branch FROM public.employees WHERE employee_code = p_employee_code LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.employee_branch(text) TO anon, authenticated;

-- =============================================================
-- Applied: 2026-07-08 (later same day)
-- RLS policies -- the actual enforcement for "Branch Manager can't see
-- payroll/salary/loans/advances/fines/other branches". Scoped to only the
-- tables the spec's "CANNOT see" list names; every other table keeps its
-- existing anon-grant behavior untouched.
--
-- IMPORTANT performance note: every USING/WITH CHECK clause below wraps
-- app_current_role()/app_current_branch() in `(select ...)`. This is the
-- documented Supabase RLS pattern -- it lets Postgres evaluate the function
-- once per query (as an InitPlan) instead of once per row. Without it, a
-- paginated `attendance` read (thousands of rows) re-ran the SECURITY
-- DEFINER role lookup per row and blew Postgres's statement_timeout. Do
-- not remove the `(select ...)` wrapping when editing these policies.
-- =============================================================

ALTER TABLE public.payroll ENABLE ROW LEVEL SECURITY;
CREATE POLICY payroll_select ON public.payroll FOR SELECT TO authenticated
  USING ((select app_current_role()) IN ('Master','HR','Finance','GM'));
CREATE POLICY payroll_write ON public.payroll FOR ALL TO authenticated
  USING ((select app_current_role()) IN ('Master','HR'))
  WITH CHECK ((select app_current_role()) IN ('Master','HR'));

ALTER TABLE public.fines ENABLE ROW LEVEL SECURITY;
CREATE POLICY fines_full_access ON public.fines FOR ALL TO authenticated
  USING ((select app_current_role()) IN ('Master','HR','Finance','GM'))
  WITH CHECK ((select app_current_role()) IN ('Master','HR','Finance','GM'));

ALTER TABLE public.one_time_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY one_time_adjustments_full_access ON public.one_time_adjustments FOR ALL TO authenticated
  USING ((select app_current_role()) IN ('Master','HR','GM'))
  WITH CHECK ((select app_current_role()) IN ('Master','HR','GM'));

ALTER TABLE public.shortages ENABLE ROW LEVEL SECURITY;
CREATE POLICY shortages_full_access ON public.shortages FOR ALL TO authenticated
  USING ((select app_current_role()) IN ('Master','HR'))
  WITH CHECK ((select app_current_role()) IN ('Master','HR'));

ALTER TABLE public.advances ENABLE ROW LEVEL SECURITY;
CREATE POLICY advances_full_access ON public.advances FOR ALL TO authenticated
  USING ((select app_current_role()) IN ('Master','HR'))
  WITH CHECK ((select app_current_role()) IN ('Master','HR'));

ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
CREATE POLICY loans_full_access ON public.loans FOR ALL TO authenticated
  USING ((select app_current_role()) IN ('Master','HR','Finance'))
  WITH CHECK ((select app_current_role()) IN ('Master','HR','Finance'));

ALTER TABLE public.loan_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY loan_changes_full_access ON public.loan_changes FOR ALL TO authenticated
  USING ((select app_current_role()) IN ('Master','HR','Finance'))
  WITH CHECK ((select app_current_role()) IN ('Master','HR','Finance'));

-- Branch-scoped tables: Branch Manager sees only their own branch.
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY employees_select ON public.employees FOR SELECT TO authenticated
  USING (
    (select app_current_role()) IN ('Master','HR','Finance','GM')
    OR ((select app_current_role()) = 'Branch Manager' AND branch = (select app_current_branch()))
  );
CREATE POLICY employees_insert ON public.employees FOR INSERT TO authenticated
  WITH CHECK ((select app_current_role()) IN ('Master','HR'));
CREATE POLICY employees_update ON public.employees FOR UPDATE TO authenticated
  USING ((select app_current_role()) IN ('Master','HR'))
  WITH CHECK ((select app_current_role()) IN ('Master','HR'));
CREATE POLICY employees_delete ON public.employees FOR DELETE TO authenticated
  USING ((select app_current_role()) IN ('Master','HR'));

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY attendance_select ON public.attendance FOR SELECT TO authenticated
  USING (
    (select app_current_role()) IN ('Master','HR','Finance','GM')
    OR ((select app_current_role()) = 'Branch Manager' AND (select public.employee_branch(employee_code)) = (select app_current_branch()))
  );
CREATE POLICY attendance_write ON public.attendance FOR ALL TO authenticated
  USING ((select app_current_role()) IN ('Master','HR'))
  WITH CHECK ((select app_current_role()) IN ('Master','HR'));

ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY leave_requests_select ON public.leave_requests FOR SELECT TO authenticated
  USING (
    (select app_current_role()) IN ('Master','HR','Finance','GM')
    OR ((select app_current_role()) = 'Branch Manager' AND (select public.employee_branch(employee_code)) = (select app_current_branch()))
  );
CREATE POLICY leave_requests_write ON public.leave_requests FOR ALL TO authenticated
  USING (
    (select app_current_role()) IN ('Master','HR','GM')
    OR ((select app_current_role()) = 'Branch Manager' AND (select public.employee_branch(employee_code)) = (select app_current_branch()))
  )
  WITH CHECK (
    (select app_current_role()) IN ('Master','HR','GM')
    OR ((select app_current_role()) = 'Branch Manager' AND (select public.employee_branch(employee_code)) = (select app_current_branch()))
  );

-- =============================================================
-- Applied: 2026-07-23 — fix_process_daily_attendance_short_hours
-- =============================================================
-- NOTE: public.run_attendance_processing, public.process_daily_attendance,
-- and public.classify_attendance_day all live in Supabase but were never
-- added to this file (created directly against the DB, same untracked
-- pattern as the 2026-07-08 ZKT gap above). This entry only captures the
-- one-column fix below; the full function bodies still need backfilling
-- here if they're touched again — pull live defs via pg_get_functiondef
-- first, don't trust this file for those three functions.
--
-- Bug fixed: process_daily_attendance's INSERT ... ON CONFLICT DO UPDATE
-- into public.attendance never included short_hours in either the column
-- list or the UPDATE SET clause, so short_hours was never recalculated —
-- rows kept whatever value the old (pre-Friday-aware) process_zkt_raw_punches
-- had written, which used a flat 9/10.5 required-hours regardless of day.
-- On Fridays (reduced required hours: 6.5 Management / 9 Non-Management)
-- this made short_hours visibly wrong even though required_hours itself
-- was already being computed correctly for the day.
--
-- Fix: added `short_hours` to both the INSERT column/value list and the
-- ON CONFLICT DO UPDATE SET clause, computed as
-- greatest(v_day_required_hours - v_class.worked_hours, 0), rounded to 2dp
-- — matching how Timesheet.jsx already reads/displays the column.
--
-- Existing attendance rows with stale short_hours are not backfilled by
-- this migration; re-run "Process Attendance" (run_attendance_processing)
-- over the affected date range to recalculate them — safe to re-run per
-- existing delete+rebuild-per-range behavior.
-- =============================================================

-- =============================================================
-- Applied: 2026-07-23 — employees: per-employee Extra Day / Gazetted
-- Holiday eligibility overrides
-- =============================================================
-- Mirrors the existing ot_eligible column/pattern: NULL = follow the
-- employee's staff_eligibility_groups default, true/false = individual
-- override. Added because Permissions.jsx's "Eligibility Group Defaults"
-- editor needed a per-employee exception path for these two fields, same
-- as OT already had. Unlike ot_eligible (which every employee already had
-- a hardcoded true/false value for, from before this eligibility-group
-- system existed, silently blocking the group default for ~330 employees
-- until a one-time data cleanup nulled them all out), these two columns
-- are brand new and start NULL for everyone — no equivalent cleanup needed.
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS extra_days_eligible       BOOLEAN,
  ADD COLUMN IF NOT EXISTS gazetted_holiday_eligible  BOOLEAN;
-- =============================================================

-- =============================================================
-- Applied: 2026-07-23 — close anon-key access on 10 tables (security)
-- =============================================================
-- Found while checking whether EmployeeSelfService.jsx's login was fixed
-- (it wasn't — still localStorage + plaintext password_plain comparison,
-- no real Supabase Auth). Checking whether RLS would block that broken
-- portal surfaced two distinct leftover-policy problems that let the
-- public anon/publishable key (embedded in the client JS bundle, visible
-- to anyone) read/write these tables with ZERO login:
--
-- 1) employees, attendance, loans, fines, shortages, advances,
--    loan_changes, one_time_adjustments each had a policy named
--    "Allow all for service role" but declared TO public USING (true) —
--    a naming/scoping mistake, not an intentional anon grant. service_role
--    already has rolbypassrls=true at the Postgres level (confirmed via
--    pg_roles), so these policies were always redundant for their stated
--    purpose and only ever served as an accidental anon backdoor.
--
-- 2) employees (read/insert/update) and attendance (read) separately had
--    policies genuinely scoped TO anon — leftovers from the pre-2026-07-08
--    "no real auth, anon key for everything" era, never cleaned up when
--    RLS went in. Same for leave_requests and attendance_adjustments
--    (both full anon CRUD). All four confirmed exploitable live: an
--    anon-key-only script (no login) read real rows from loans/employees/
--    attendance before the fix, 0 rows after.
--
-- Left three anon-read-only policies in place (attendance_import_batches,
-- hrms_policy_settings, shift_master) — reference/metadata only, no
-- personal or financial data, low risk, something may load them pre-login.
--
-- Net effect: EmployeeSelfService.jsx / EmployeeLogin.jsx (already
-- non-functional from a security standpoint — no real Supabase Auth
-- session, so it was always relying on these anon policies) will now
-- fail to load employee data entirely until it's migrated to real auth.
-- That was already a known, flagged limitation — not a new regression.
DROP POLICY IF EXISTS "Allow all for service role" ON public.employees;
DROP POLICY IF EXISTS "Allow all for service role" ON public.attendance;
DROP POLICY IF EXISTS "Allow all for service role" ON public.loans;
DROP POLICY IF EXISTS "Allow all for service role" ON public.fines;
DROP POLICY IF EXISTS "Allow all for service role" ON public.shortages;
DROP POLICY IF EXISTS "Allow all for service role" ON public.advances;
DROP POLICY IF EXISTS "Allow all for service role" ON public.loan_changes;
DROP POLICY IF EXISTS "Allow all for service role" ON public.one_time_adjustments;
DROP POLICY IF EXISTS "Allow anon read employees" ON public.employees;
DROP POLICY IF EXISTS "Allow anon insert employees" ON public.employees;
DROP POLICY IF EXISTS "Allow anon update employees" ON public.employees;
DROP POLICY IF EXISTS "Allow anon read attendance" ON public.attendance;
DROP POLICY IF EXISTS "Allow anon manage leave requests" ON public.leave_requests;
DROP POLICY IF EXISTS "Allow anon manage attendance adjustments" ON public.attendance_adjustments;
-- =============================================================

-- =============================================================
-- Applied: 2026-07-30 — fix_process_daily_attendance_cross_day_punch_pairing
-- =============================================================
-- Backfills the full process_daily_attendance body into this file (the
-- 2026-07-23 short_hours entry above flagged this as still owed — pull
-- live defs via pg_get_functiondef before trusting old copies of this one).
--
-- Bug found investigating a user report that ID 00003's attendance looked
-- wrong for several days in July. Root cause: for employees with no fixed
-- shift (Management/Admin, v_start/v_end null), the punch-matching window
-- ran a full 36h past midnight (to catch a genuine overnight checkout).
-- That was wide enough to swallow the *next* day's ordinary morning
-- check-in as if it were "today's" late checkout — corrupting both days:
--   - Jul 1: device swapped the C/In and C/Out labels on the same day's
--     two punches; the reversed-pair fallback only triggered when a
--     status was missing entirely, not when both existed but reversed —
--     so it showed a "Half Day / missing checkout" for a normal ~7h day.
--   - Jul 3-4: a mislabeled punch on the morning of Jul 4 got pulled into
--     Jul 3's window and won MAX(punch_time where status=C/Out), silently
--     discarding Jul 3's real checkout and fabricating a 20.87-hour
--     "Present" shift with no review flag.
--   - Jul 5 (a real weekly-off day, zero punches): Jul 6's check-in punch
--     bled backward into Jul 5's window, fabricating a phantom "Half Day"
--     record on the employee's actual day off.
--
-- Fix (three changes to the existing function):
--   1. Narrowed the shift-less lookahead window from 36h/noon-next-day to
--      6h/06:00-next-day — still covers a genuine overnight checkout,
--      no longer reaches into the next day's normal start time.
--   2. The earliest/latest-by-position fallback (added previously for
--      terminals that mislabel every punch as C/Out) now also triggers
--      when the status-matched pair comes back *reversed*, not just when
--      one side is null.
--   3. Added a 16h sanity cap: any pairing implying a shift longer than
--      that forces needs_review = true with an exception_reason instead
--      of silently passing as "Present".
--
-- Verified against the reported employee's whole week (all six days now
-- match reality exactly) and re-ran process_daily_attendance for the full
-- Jan 1 - Jul 31 2026 range across all employees, month by month, to
-- avoid the statement-timeout issue from the 2026-07-29 index incident.
-- 52 records that had been merging two days into one bogus long shift are
-- now correctly split and flagged for review.
-- =============================================================
CREATE OR REPLACE FUNCTION public.process_daily_attendance(p_from_date date, p_to_date date)
 RETURNS TABLE(processed_days integer, inserted_or_updated integer, needs_review_count integer, absent_count integer, half_day_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_employee record;
  v_day date;
  v_roster record;
  v_shift public.shift_definitions%rowtype;
  v_shift_code text;
  v_group text;
  v_required_hours numeric;
  v_day_required_hours numeric;
  v_friday_override numeric;
  v_start timestamp without time zone;
  v_end timestamp without time zone;
  v_first_in timestamp without time zone;
  v_last_out timestamp without time zone;
  v_punch_count integer;
  v_pos_first timestamp without time zone;
  v_pos_last timestamp without time zone;
  v_class record;
  v_source_locations text;
  v_rows integer := 0;
  v_days integer := 0;
  v_review integer := 0;
  v_absent integer := 0;
  v_half integer := 0;
  v_weekly_off boolean;
  v_gh boolean;
  v_day_type text;
  v_existing_locked boolean;
begin
  if p_from_date is null or p_to_date is null or p_to_date < p_from_date then
    raise exception 'Invalid attendance processing date range';
  end if;

  -- Resolve mapping for any new raw punches before calculation.
  perform public.refresh_zkt_punch_employee_mapping();

  for v_employee in
    select e.employee_code,
           e.zkt_employee_no,
           e.eligibility_group,
           e.assigned_shift_code,
           e.status,
           e.branch,
           e.joining_date,
           e.last_working_day,
           e.single_punch_ok
      from public.employees e
     where e.zkt_employee_no is not null
       and e.zkt_employee_no <> ''
       and (coalesce(e.status, 'Active') = 'Active' or e.last_working_day is not null)
  loop
    v_group := coalesce(nullif(v_employee.eligibility_group, ''), 'SALES_SUPPORT');
    select required_hours into v_required_hours
      from public.staff_eligibility_groups
     where code = v_group and is_active = true;

    if v_required_hours is null then
      continue;
    end if;

    for v_day in select generate_series(p_from_date, p_to_date, interval '1 day')::date loop
      v_days := v_days + 1;

      if v_employee.joining_date is not null and v_day < v_employee.joining_date then
        continue;
      end if;

      if coalesce(v_employee.status, 'Active') <> 'Active'
         and v_employee.last_working_day is not null
         and v_day > v_employee.last_working_day then
        continue;
      end if;

      -- Friday required-hours override: read from hrms_policy_settings
      -- (the values HR/Master configure on the Policy Settings page) instead
      -- of always using the flat staff_eligibility_groups.required_hours.
      v_day_required_hours := v_required_hours;
      if extract(dow from v_day) = 5 then
        select value::numeric into v_friday_override
          from public.hrms_policy_settings
         where key = case when v_group = 'MANAGEMENT_ADMIN' then 'friday_hours_management' else 'friday_hours_non_management' end
         limit 1;
        if v_friday_override is not null then
          v_day_required_hours := v_friday_override;
        end if;
      end if;

      select r.shift_code, r.is_weekly_off, r.is_gazetted_holiday, r.day_type
        into v_roster
        from public.employee_work_rosters r
       where r.employee_code = v_employee.employee_code
         and r.roster_date = v_day
       limit 1;

      v_weekly_off := coalesce(v_roster.is_weekly_off, false);
      v_gh := coalesce(v_roster.is_gazetted_holiday, exists(select 1 from public.gazetted_holidays g where g.holiday_date = v_day and g.is_active = true));
      v_day_type := coalesce(v_roster.day_type, case when v_weekly_off then 'Weekly Off' when v_gh then 'Gazetted Holiday' else 'Working Day' end);
      v_shift_code := private.resolve_employee_shift(v_employee.employee_code, v_day, v_employee.assigned_shift_code);

      select * into v_shift from public.shift_definitions where shift_code = v_shift_code and is_active = true;
      if not found then
        v_shift.shift_code := v_shift_code;
        v_shift.start_time := '00:00'::time;
        v_shift.end_time := '00:00'::time;
        v_shift.scheduled_hours := v_day_required_hours;
        v_shift.crosses_midnight := false;
      end if;

      if v_group = 'MANAGEMENT_ADMIN' then
        v_start := null;
        v_end := null;
      else
        v_start := v_day::timestamp + v_shift.start_time;
        v_end := v_day::timestamp + v_shift.end_time;
        if v_shift.crosses_midnight or v_shift.end_time < v_shift.start_time then
          v_end := v_end + interval '1 day';
        end if;
      end if;

      -- Punch window: for shift-based employees this stays anchored to their
      -- shift (start-4h .. end+8h). For shift-less employees (Management/Admin)
      -- it used to run a full 36h past midnight (to catch a genuine overnight
      -- checkout), but that was wide enough to swallow the *next* day's
      -- mid-morning check-in as if it were "today's" late checkout, corrupting
      -- both days. Narrowed to a 6h early-morning grace window (00:00-06:00
      -- next day) - still covers a real overnight checkout, no longer bleeds
      -- into the next day's normal start time.
      select
        min(p.punch_time) filter (where lower(coalesce(p.punch_status,'')) in ('c/in','in','check in','check-in','checkin')),
        max(p.punch_time) filter (where lower(coalesce(p.punch_status,'')) in ('c/out','out','check out','check-out','checkout')),
        string_agg(distinct coalesce(p.location_id,''), ',' order by coalesce(p.location_id,''))
      into v_first_in, v_last_out, v_source_locations
      from public.zkt_raw_punches p
      where p.employee_code = v_employee.employee_code
        and p.punch_time >= case when v_start is null then v_day::timestamp else v_start - interval '4 hours' end
        and p.punch_time < case when v_end is null then (v_day + 1)::timestamp + interval '6 hours' else v_end + interval '8 hours' end;

      -- Some ZKT terminals/export batches mislabel punch_status (e.g. every
      -- punch that day comes through as C/Out, an unrecognized code, or even
      -- the in/out labels swapped between two punches) so the status-based
      -- filter above can't find a matching in/out punch, or finds them
      -- reversed, even though real punches exist. When that happens and
      -- there are 2+ punches that day, fall back to earliest/latest punch
      -- time by position instead of trusting the (proven unreliable) status
      -- label. Genuine single-punch days are left alone so they still
      -- correctly flag as a missing pair.
      if v_first_in is null or v_last_out is null
         or (v_first_in is not null and v_last_out is not null and v_last_out < v_first_in) then
        select count(*), min(p.punch_time), max(p.punch_time)
          into v_punch_count, v_pos_first, v_pos_last
          from public.zkt_raw_punches p
         where p.employee_code = v_employee.employee_code
           and p.punch_time >= case when v_start is null then v_day::timestamp else v_start - interval '4 hours' end
           and p.punch_time < case when v_end is null then (v_day + 1)::timestamp + interval '6 hours' else v_end + interval '8 hours' end;

        if v_punch_count >= 2 then
          v_first_in := v_pos_first;
          v_last_out := v_pos_last;
        end if;
      end if;

      if v_last_out is not null and v_first_in is not null and v_last_out < v_first_in then
        v_last_out := null;
      end if;

      select * into v_class
      from public.classify_attendance_day(
        v_group,
        v_day_required_hours,
        v_start,
        v_end,
        v_first_in,
        v_last_out,
        v_weekly_off,
        v_gh
      );

      -- Employees who structurally only ever produce one ZKT scan per shift
      -- (e.g. a night guard with no terminal access when leaving) should not
      -- be perpetually flagged/under-credited just because a second scan
      -- can never exist. If they showed up at all (at least one punch that
      -- day) and the normal classification under-credits them, give full
      -- required-hours credit instead.
      if v_employee.single_punch_ok
         and (v_first_in is not null or v_last_out is not null)
         and v_class.worked_hours < v_day_required_hours then
        v_class.worked_hours := v_day_required_hours;
        v_class.attendance_status := 'Present';
        v_class.late_minutes := 0;
        v_class.early_out_minutes := 0;
        v_class.overtime_hours := 0;
        v_class.needs_review := false;
        v_class.exception_reason := null;
      end if;

      -- Sanity cap: a punch pairing that implies a 16+ hour shift almost
      -- always means two different shifts got merged into one (a stray
      -- cross-day punch, a missed break punch, etc). Never let that pass
      -- silently as "Present" - force it into review instead.
      if v_first_in is not null and v_last_out is not null
         and (extract(epoch from (v_last_out - v_first_in)) / 3600.0) > 16 then
        v_class.needs_review := true;
        v_class.exception_reason := trim(both '; ' from coalesce(v_class.exception_reason || '; ', '') || 'Unusually long shift duration - please verify punches');
      end if;

      select exists(
        select 1 from public.attendance a
         where a.employee_code = v_employee.employee_code
           and a.work_date = v_day
           and coalesce(a.review_status,'') = 'Locked'
      ) into v_existing_locked;

      if not v_existing_locked then
        insert into public.attendance (
          employee_code, attendance_date, work_date, source, eligibility_group, shift_code,
          first_check_in, last_check_out, check_in, check_out, actual_hours,
          worked_hours, required_hours, short_hours,
          late_minutes, early_out_minutes, overtime_hours,
          extra_day_eligible, gh_eligible, is_weekly_off, is_gazetted_holiday,
          attendance_status, exception_reason, needs_review, calculated_at,
          zkt_location_id, review_status
        ) values (
          v_employee.employee_code, v_day, v_day, 'ZKT CSV', v_group, v_shift_code,
          v_first_in, v_last_out, v_first_in, v_last_out, v_class.worked_hours,
          v_class.worked_hours, v_day_required_hours,
          round(greatest(v_day_required_hours - v_class.worked_hours, 0)::numeric, 2),
          v_class.late_minutes, v_class.early_out_minutes, v_class.overtime_hours,
          v_class.extra_day_eligible, v_class.gh_eligible, v_weekly_off, v_gh,
          v_class.attendance_status, v_class.exception_reason, v_class.needs_review, now(),
          v_source_locations, case when v_class.needs_review then 'Pending Review' else 'Calculated' end
        )
        on conflict (employee_code, work_date) where employee_code is not null and work_date is not null
        do update set
          attendance_date = excluded.attendance_date,
          source = excluded.source,
          eligibility_group = excluded.eligibility_group,
          shift_code = excluded.shift_code,
          first_check_in = excluded.first_check_in,
          last_check_out = excluded.last_check_out,
          check_in = excluded.check_in,
          check_out = excluded.check_out,
          actual_hours = excluded.actual_hours,
          worked_hours = excluded.worked_hours,
          required_hours = excluded.required_hours,
          short_hours = excluded.short_hours,
          late_minutes = excluded.late_minutes,
          early_out_minutes = excluded.early_out_minutes,
          overtime_hours = excluded.overtime_hours,
          extra_day_eligible = excluded.extra_day_eligible,
          gh_eligible = excluded.gh_eligible,
          is_weekly_off = excluded.is_weekly_off,
          is_gazetted_holiday = excluded.is_gazetted_holiday,
          attendance_status = excluded.attendance_status,
          exception_reason = excluded.exception_reason,
          needs_review = excluded.needs_review,
          calculated_at = excluded.calculated_at,
          zkt_location_id = excluded.zkt_location_id,
          review_status = excluded.review_status;
        v_rows := v_rows + 1;
        if v_class.needs_review then v_review := v_review + 1; end if;
        if v_class.attendance_status = 'Absent' then v_absent := v_absent + 1; end if;
        if v_class.attendance_status = 'Half Day' then v_half := v_half + 1; end if;
      end if;
    end loop;
  end loop;

  return query select v_days, v_rows, v_review, v_absent, v_half;
end;
$function$;
-- =============================================================

-- =============================================================
-- Applied: 2026-07-30 — salary increment auto-logging + two-way sync
-- =============================================================
-- User asked: does changing an employee's salary automatically show up in
-- Increment History? It didn't — employees.salary and salary_increments
-- were two completely disconnected tables, editable independently in
-- either direction, with no DB trigger and no shared code path. Wired all
-- three directions:
--
-- 1) Employees page (or any other direct UPDATE of employees.salary,
--    including the bulk Employee Master import) -> auto-logs a
--    salary_increments row via an AFTER UPDATE trigger. Guards: only
--    fires on an actual value change, and only when there was a prior
--    non-null salary to compare against (skips brand-new employees
--    getting their first salary set - that's provisioning, not a raise).
--
-- 2) IncrementHistory.jsx "+ Add Increment" (individual + bulk by
--    dept/branch) -> now calls apply_salary_increment(), which updates
--    the employee's live salary and writes the history row in the same
--    transaction. old_salary is always read fresh from the employees
--    table server-side, never trusted from the client, so the history
--    can't drift from whatever the DB actually has.
--
-- 3) IncrementHistory.jsx "Import History" (.xlsx backfill) -> after
--    inserting the parsed rows, calls sync_employee_current_salary() once
--    per touched employee_code. That function re-reads each employee's
--    FULL increment history (not just the rows in this file) and sets
--    their live salary to the newest Approved record whose effective_from
--    has already arrived - so out-of-chronological-order rows in the
--    import file, or interaction with pre-existing records, still resolve
--    correctly. Future-dated records are left alone until their date
--    arrives (no scheduler exists to flip them automatically on that date
--    yet - out of scope of this change).
--
-- Both (2) and (3)'s UPDATEs run with app.suppress_increment_trigger set
-- (local to the transaction) so the (1) trigger doesn't double-log the
-- same change as a second "System (Auto)" row.
--
-- Verified live end-to-end for all three paths using disposable test
-- employees (created, exercised through the real UI/RPC, then deleted):
-- salary increase/decrease/no-op via the trigger, individual Add
-- Increment, bulk Add Increment, and an actual .xlsx upload through the
-- Import History button with out-of-order dates plus a future-dated row -
-- in every case exactly one salary_increments row resulted (no
-- trigger double-log) and employees.salary matched the expected value.
-- =============================================================
CREATE OR REPLACE FUNCTION public.log_salary_increment_on_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if coalesce(current_setting('app.suppress_increment_trigger', true), 'false') = 'true' then
    return new;
  end if;

  if new.salary is distinct from old.salary and old.salary is not null and new.salary is not null then
    insert into public.salary_increments (
      employee_code, employee_name, old_salary, new_salary, effective_from,
      increment_amount, increment_percentage, type, status,
      submitted_by, approved_by, approved_at, created_at
    ) values (
      new.employee_code, new.full_name, old.salary, new.salary, current_date,
      new.salary - old.salary,
      case when old.salary > 0 then round(((new.salary - old.salary) / old.salary) * 10000)/100 else null end,
      case when new.salary >= old.salary then 'Increment' else 'Downward Revision' end,
      'Approved',
      'System (Auto)', 'System (Auto)', now(), now()
    );
  end if;
  return new;
end;
$function$;

DROP TRIGGER IF EXISTS trg_log_salary_increment ON public.employees;
CREATE TRIGGER trg_log_salary_increment
AFTER UPDATE ON public.employees
FOR EACH ROW
EXECUTE FUNCTION public.log_salary_increment_on_change();

CREATE OR REPLACE FUNCTION public.apply_salary_increment(
  p_employee_code text,
  p_new_salary numeric,
  p_effective_from date DEFAULT CURRENT_DATE,
  p_type text DEFAULT 'Increment',
  p_approved_by text DEFAULT 'HR',
  p_submitted_by text DEFAULT 'HR'
)
RETURNS public.salary_increments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_old_salary numeric;
  v_name text;
  v_amount numeric;
  v_pct numeric;
  v_row public.salary_increments;
begin
  select salary, full_name into v_old_salary, v_name
    from public.employees where employee_code = p_employee_code
    for update;

  if not found then
    raise exception 'Employee % not found', p_employee_code;
  end if;

  perform set_config('app.suppress_increment_trigger', 'true', true);
  update public.employees set salary = p_new_salary where employee_code = p_employee_code;

  v_amount := p_new_salary - coalesce(v_old_salary, 0);
  v_pct := case when coalesce(v_old_salary, 0) > 0 then round((v_amount / v_old_salary) * 10000) / 100 else null end;

  insert into public.salary_increments (
    employee_code, employee_name, old_salary, new_salary, effective_from,
    increment_amount, increment_percentage, type, status,
    submitted_by, approved_by, approved_at, created_at
  ) values (
    p_employee_code, v_name, v_old_salary, p_new_salary, p_effective_from,
    v_amount, v_pct, coalesce(p_type, 'Increment'), 'Approved',
    coalesce(p_submitted_by, 'HR'), coalesce(p_approved_by, 'HR'), now(), now()
  )
  returning * into v_row;

  return v_row;
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_employee_current_salary(p_employee_code text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_latest_salary numeric;
  v_current numeric;
begin
  select new_salary into v_latest_salary
    from public.salary_increments
   where employee_code = p_employee_code
     and coalesce(status, 'Approved') = 'Approved'
     and effective_from is not null
     and effective_from <= current_date
   order by effective_from desc, created_at desc
   limit 1;

  if v_latest_salary is null then
    return;
  end if;

  select salary into v_current from public.employees where employee_code = p_employee_code;

  if v_current is distinct from v_latest_salary then
    perform set_config('app.suppress_increment_trigger', 'true', true);
    update public.employees set salary = v_latest_salary where employee_code = p_employee_code;
  end if;
end;
$function$;
-- =============================================================

-- =============================================================
-- Applied: 2026-07-30 — security: close anon-key access on users/leaves/
-- leave_requests/payroll
-- =============================================================
-- Same leftover-policy mistake as the 2026-07-23 fix — a policy literally
-- named "Allow all for service role" but declared TO public USING (true),
-- so it actually applied to anon too. These four tables were missed in
-- that earlier pass. Confirmed live and exploitable: an anon-key-only
-- request (no login) could read public.users, leaves, leave_requests, and
-- payroll before this fix. All four already have properly-scoped
-- `authenticated`-role policies covering real app access.
-- =============================================================
DROP POLICY IF EXISTS "Allow all for service role" ON public.users;
DROP POLICY IF EXISTS "Allow all for service role" ON public.leaves;
DROP POLICY IF EXISTS "Allow all for service role" ON public.leave_requests;
DROP POLICY IF EXISTS "Allow all for service role" ON public.payroll;
-- =============================================================

-- =============================================================
-- Applied: 2026-07-30 — Timesheet Adj Time In/Out (HR -> Master/GM
-- approval) + payroll settlement status (Payable/Hold/No FNF/FNF)
-- =============================================================
-- User asked for three things: (1) a quick per-day time-correction action
-- on the Timesheet page that routes to Master/GM for approval instead of
-- applying instantly, (2) a per-employee payroll settlement status that
-- Finance can't act on until HR sets it and Master/GM approves the batch,
-- (3) sign-pad/thumb-impression capture on payment — deferred, needs
-- hardware/SDK details from the user before it's buildable.
--
-- While building (1), discovered attendance_adjustments already had a
-- pending-approval-shaped schema (status default 'Pending', approved_by,
-- rejection_reason) but the only two consumers — AttendanceAdjustment.jsx's
-- save function and ApprovalQueue.jsx's Attendance Corrections tab — were
-- both written against column names that don't exist on the live table
-- (work_date/original_in/adjusted_in instead of the real attendance_date/
-- original_check_in/adjusted_check_in etc). Every save and every display
-- in that flow was silently broken. Fixed both call sites to use the real
-- columns; AttendanceAdjustment.jsx's "+ New Adjustment" keeps its
-- existing instant-apply behavior (now explicitly stamps status=Approved
-- instead of relying on the table's default), while the new Timesheet
-- button creates a status='Pending Approval' row and ApprovalQueue's
-- approve action now actually applies the correction to public.attendance
-- (previously it only flipped the adjustment's own status and never
-- touched attendance at all).
--
-- attendance_adjustments: added approved_at (approved_by/status/
-- rejection_reason already existed).
ALTER TABLE public.attendance_adjustments
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

-- payroll: per-employee settlement_status (Payable/Hold/No FNF/FNF) plus a
-- month-level batch review state (settlement_review_status: Not Submitted
-- -> Pending Approval -> Approved/Rejected) gating Finance's payslip
-- button. This is layered ON TOP of the existing Draft/Approved/Published
-- flow, not a replacement — Finance still needs Published *and* this
-- approved before any payslip. Historical rows are grandfathered to
-- 'Approved' so already-published past payroll isn't retroactively locked.
ALTER TABLE public.payroll
  ADD COLUMN IF NOT EXISTS settlement_status text DEFAULT 'Payable',
  ADD COLUMN IF NOT EXISTS settlement_notes text,
  ADD COLUMN IF NOT EXISTS settlement_set_by text,
  ADD COLUMN IF NOT EXISTS settlement_set_at timestamptz,
  ADD COLUMN IF NOT EXISTS settlement_review_status text DEFAULT 'Not Submitted',
  ADD COLUMN IF NOT EXISTS settlement_submitted_by text,
  ADD COLUMN IF NOT EXISTS settlement_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS settlement_approved_by text,
  ADD COLUMN IF NOT EXISTS settlement_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS settlement_rejection_reason text;

UPDATE public.payroll
SET settlement_review_status = 'Approved'
WHERE settlement_review_status = 'Not Submitted';
-- =============================================================

-- =============================================================
-- 2026-07-30: close_anon_key_access_19_more_tables
-- =============================================================
-- Same leftover-policy mistake as the 2026-07-23 and 2026-07-30 fixes: a
-- policy literally named "Allow all for service role" but declared
-- TO public USING (true), applying to anon (and everyone else) instead of
-- just service_role (which bypasses RLS at the Postgres level and never
-- needed this policy anyway). A full sweep found 42 tables still carrying
-- it. These 19 already have adequate authenticated + role-scoped policies
-- covering real app functionality (16 of them), or an already-reviewed,
-- deliberately-kept anon-read-only policy for low-risk reference data
-- (attendance_import_batches, hrms_policy_settings, shift_master — see
-- the 2026-07-23 entry above), so dropping this one is pure removal of an
-- accidental full read/write backdoor, not a functional change.
--
-- The remaining 23 tables found in this same sweep have NO other policy
-- at all — dropping this on those would deny all access outright and
-- break live functionality (notifications, attendance_adjustments,
-- timesheet_signoffs, salary_increments/salary_structures, and 18 more).
-- Those need purpose-built replacement policies first; tracked as a
-- separate, deliberate follow-up rather than rushed here.
DROP POLICY IF EXISTS "Allow all for service role" ON public.attendance_import_batches;
DROP POLICY IF EXISTS "Allow all for service role" ON public.attendance_import_rejections;
DROP POLICY IF EXISTS "Allow all for service role" ON public.audit_logs;
DROP POLICY IF EXISTS "Allow all for service role" ON public.employee_bank_details;
DROP POLICY IF EXISTS "Allow all for service role" ON public.employee_import_batches;
DROP POLICY IF EXISTS "Allow all for service role" ON public.employee_message_queue;
DROP POLICY IF EXISTS "Allow all for service role" ON public.employee_shift_assignments;
DROP POLICY IF EXISTS "Allow all for service role" ON public.employee_work_rosters;
DROP POLICY IF EXISTS "Allow all for service role" ON public.gazetted_holidays;
DROP POLICY IF EXISTS "Allow all for service role" ON public.hrms_policy_settings;
DROP POLICY IF EXISTS "Allow all for service role" ON public.payroll_import_batches;
DROP POLICY IF EXISTS "Allow all for service role" ON public.payroll_monthly_snapshots;
DROP POLICY IF EXISTS "Allow all for service role" ON public.payroll_outlier_rules;
DROP POLICY IF EXISTS "Allow all for service role" ON public.salary_collection_codes;
DROP POLICY IF EXISTS "Allow all for service role" ON public.shift_definitions;
DROP POLICY IF EXISTS "Allow all for service role" ON public.shift_master;
DROP POLICY IF EXISTS "Allow all for service role" ON public.staff_eligibility_groups;
DROP POLICY IF EXISTS "Allow all for service role" ON public.zkt_locations;
DROP POLICY IF EXISTS "Allow all for service role" ON public.zkt_raw_punches;
-- =============================================================

-- =============================================================
-- 2026-07-30: add_audit_role_readonly_access
-- =============================================================
-- New internal-audit role: read-only access to Attendance + Payroll +
-- Salary Reports data (per user's explicit scope choice — not a
-- full-system audit, and no employee personal-details module). Every
-- change below only touches SELECT-only policies (or adds a new
-- SELECT-only policy where the only existing coverage was bundled into an
-- ALL policy) — 'Audit' is never added to any INSERT/UPDATE/DELETE/ALL
-- policy, so this role has zero write capability at the database level
-- regardless of what the frontend does or doesn't render.
--
-- Note: attendance_adjustments, salary_increments, and salary_structures
-- are part of the 23-table "no other policy" group tracked as a separate
-- follow-up (still temporarily open to everyone via the legacy public
-- policy, not yet replaced with proper role-scoped policies). Audit
-- incidentally has access to those via that same temporary opening; when
-- that follow-up designs real replacement policies for those three
-- tables, 'Audit' needs to be included then too.

ALTER POLICY attendance_select ON public.attendance
  USING (
    ((SELECT app_current_role()) = ANY (ARRAY['Master'::text, 'HR'::text, 'Finance'::text, 'GM'::text, 'Audit'::text]))
    OR (((SELECT app_current_role()) = 'Branch Manager'::text) AND ((SELECT employee_branch(attendance.employee_code)) = (SELECT app_current_branch())))
  );

ALTER POLICY attendance_select_authorized ON public.attendance
  USING (
    ((SELECT private.current_hrms_role()) = ANY (ARRAY['Master'::text, 'HR'::text, 'Finance'::text, 'Audit'::text]))
    OR (employee_code = (SELECT private.current_employee_code()))
  );

ALTER POLICY employees_select ON public.employees
  USING (
    ((SELECT app_current_role()) = ANY (ARRAY['Master'::text, 'HR'::text, 'Finance'::text, 'GM'::text, 'Audit'::text]))
    OR (((SELECT app_current_role()) = 'Branch Manager'::text) AND (branch = (SELECT app_current_branch())))
  );

ALTER POLICY employees_select_authorized ON public.employees
  USING (
    ((SELECT private.current_hrms_role()) = ANY (ARRAY['Master'::text, 'HR'::text, 'Finance'::text, 'Audit'::text]))
    OR (employee_code = (SELECT private.current_employee_code()))
  );

ALTER POLICY leaves_select_authorized ON public.leaves
  USING (
    ((SELECT private.current_hrms_role()) = ANY (ARRAY['Master'::text, 'HR'::text, 'Audit'::text]))
    OR (employee_code = (SELECT private.current_employee_code()))
  );

ALTER POLICY payroll_select ON public.payroll
  USING (((SELECT app_current_role()) = ANY (ARRAY['Master'::text, 'HR'::text, 'Finance'::text, 'GM'::text, 'Audit'::text])));

ALTER POLICY payroll_select_authorized ON public.payroll
  USING (
    ((SELECT private.current_hrms_role()) = ANY (ARRAY['Master'::text, 'Finance'::text, 'Audit'::text]))
    OR (employee_code = (SELECT private.current_employee_code()))
  );

ALTER POLICY loans_select_authorized ON public.loans
  USING (
    ((SELECT private.current_hrms_role()) = ANY (ARRAY['Master'::text, 'HR'::text, 'Finance'::text, 'Audit'::text]))
    OR (employee_code = (SELECT private.current_employee_code()))
  );

ALTER POLICY staff_eligibility_select_staff ON public.staff_eligibility_groups
  USING (((SELECT private.current_hrms_role()) = ANY (ARRAY['Master'::text, 'HR'::text, 'Finance'::text, 'Audit'::text])));

ALTER POLICY employee_rosters_select_authorized ON public.employee_work_rosters
  USING (
    ((SELECT private.current_hrms_role()) = ANY (ARRAY['Master'::text, 'HR'::text, 'Finance'::text, 'Audit'::text]))
    OR (employee_code = (SELECT private.current_employee_code()))
  );

-- fines/shortages/advances only had a single bundled ALL policy each
-- (read+write together) — adding Audit to that would grant write access,
-- so add a dedicated SELECT-only policy instead.
CREATE POLICY fines_select_audit ON public.fines
  FOR SELECT TO authenticated
  USING (((SELECT private.current_hrms_role()) = 'Audit'::text));

CREATE POLICY shortages_select_audit ON public.shortages
  FOR SELECT TO authenticated
  USING (((SELECT private.current_hrms_role()) = 'Audit'::text));

CREATE POLICY advances_select_audit ON public.advances
  FOR SELECT TO authenticated
  USING (((SELECT private.current_hrms_role()) = 'Audit'::text));
-- =============================================================

-- =============================================================
-- 2026-08-24: advances_add_finance_access
-- advances_full_access excluded Finance, so HR-uploaded advances were
-- invisible to Finance/Finance Head despite advanceService.js expecting
-- Finance to approve/issue them (matches loans/payroll policies which
-- already include Finance).
DROP POLICY IF EXISTS advances_full_access ON public.advances;
CREATE POLICY advances_full_access ON public.advances FOR ALL TO authenticated
  USING ((select app_current_role()) IN ('Master','HR','Finance'))
  WITH CHECK ((select app_current_role()) IN ('Master','HR','Finance'));
-- =============================================================

-- =============================================================
-- 2026-08-01: confidential_incentives_phase1
-- =============================================================
-- Extends the existing cash_incentives table (already a Master/GM-only
-- confidential incentive feature) with a *recurring* register on top of
-- its original one-off log: is_recurring/effective_from/effective_to/
-- is_active/change_reason. Existing one-off rows are unaffected
-- (is_recurring defaults false). Chose to extend this table rather than
-- create a parallel confidential_incentives table, per explicit user
-- decision — avoids two competing "secret pay" systems feeding two
-- different Finance totals.
--
-- Also tightened cash_incentives_select: it previously allowed Finance
-- direct row-level SELECT (individual employee names + amounts), which
-- conflicts with "Finance sees branch totals only, never employee
-- detail." Finance/HR now go through cash_incentive_branch_totals(), a
-- SECURITY DEFINER RPC that returns branch+total only — the sanctioned
-- way to give aggregate access without opening row-level RLS.
--
-- New tables cash_incentive_history (audit trail) and
-- cash_incentive_monthly (per-employee snapshot generated at payroll-
-- generation time, pro-rated for the recurring amount, feeds Finance
-- Reconciliation's "Incentive Cash Distributed" mark-as-paid flow) are
-- both RLS-locked to Master/GM only, same pattern as cash_incentives.
--
-- salary_increments gained confidential_incentive_at_time (nullable) so
-- increment history can show "Total Effective Compensation at time of
-- increment" for Master/GM. apply_salary_increment gained a trailing
-- optional p_confidential_incentive_at_time param (DROP+CREATE, not bare
-- CREATE OR REPLACE, since adding a param changes the signature and
-- would otherwise create an overload instead of truly replacing it).
--
-- IMPORTANT project-wide gotcha discovered while doing this: this
-- Supabase project has a default-privileges rule that auto-grants
-- `anon` full privileges (including TABLE TRUNCATE, which bypasses RLS
-- entirely) on every newly created table, and EXECUTE on every newly
-- created function, regardless of an explicit `GRANT ... TO
-- authenticated` in the same migration. Confirmed via
-- information_schema.table_privileges / pg_proc.proacl after applying
-- the GRANTs below — anon still showed up and had to be revoked in a
-- separate follow-up statement. Any future migration that creates a
-- new table or SECURITY DEFINER function on this project MUST include
-- an explicit `REVOKE ALL ... FROM anon` / `REVOKE EXECUTE ... FROM
-- anon` immediately after, or it will silently inherit anon access.

ALTER TABLE public.cash_incentives
  ADD COLUMN IF NOT EXISTS is_recurring   BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS effective_from DATE,
  ADD COLUMN IF NOT EXISTS effective_to   DATE,
  ADD COLUMN IF NOT EXISTS is_active      BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS change_reason  TEXT;

DROP POLICY IF EXISTS cash_incentives_select ON public.cash_incentives;
CREATE POLICY cash_incentives_select ON public.cash_incentives FOR SELECT TO public
  USING ((SELECT private.current_hrms_role()) = ANY (ARRAY['Master','GM']));

CREATE TABLE IF NOT EXISTS public.cash_incentive_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES employees(id),
  employee_code TEXT, employee_name TEXT, branch TEXT,
  action TEXT, -- Added | Amended | Removed
  old_amount NUMERIC, new_amount NUMERIC,
  effective_from DATE, effective_to DATE, reason TEXT,
  actioned_by TEXT, actioned_by_role TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.cash_incentive_monthly (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  payroll_month TEXT NOT NULL,
  employee_id UUID REFERENCES employees(id),
  employee_code TEXT, employee_name TEXT, branch TEXT, department TEXT,
  amount NUMERIC DEFAULT 0, -- prorated recurring + this month's one-off, combined
  is_paid BOOLEAN DEFAULT FALSE, paid_at TIMESTAMPTZ, paid_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(payroll_month, employee_code)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_incentive_history TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_incentive_monthly TO authenticated;
ALTER TABLE public.cash_incentive_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_incentive_monthly ENABLE ROW LEVEL SECURITY;

CREATE POLICY cash_incentive_history_all ON public.cash_incentive_history FOR ALL TO public
  USING ((SELECT private.current_hrms_role()) = ANY (ARRAY['Master','GM']))
  WITH CHECK ((SELECT private.current_hrms_role()) = ANY (ARRAY['Master','GM']));

CREATE POLICY cash_incentive_monthly_all ON public.cash_incentive_monthly FOR ALL TO public
  USING ((SELECT private.current_hrms_role()) = ANY (ARRAY['Master','GM']))
  WITH CHECK ((SELECT private.current_hrms_role()) = ANY (ARRAY['Master','GM']));

CREATE OR REPLACE FUNCTION public.cash_incentive_branch_totals(p_month TEXT)
RETURNS TABLE(branch TEXT, total NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(branch, 'Unassigned'), SUM(amount)
  FROM cash_incentive_monthly WHERE payroll_month = p_month GROUP BY 1;
$$;
GRANT EXECUTE ON FUNCTION public.cash_incentive_branch_totals(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_incentives_paid_for_branch(p_month TEXT, p_branch TEXT, p_actor TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF (SELECT private.current_hrms_role()) NOT IN ('Finance','Master') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE cash_incentive_monthly SET is_paid = TRUE, paid_at = NOW(), paid_by = p_actor
  WHERE payroll_month = p_month AND branch = p_branch;
END; $$;
GRANT EXECUTE ON FUNCTION public.mark_incentives_paid_for_branch(TEXT, TEXT, TEXT) TO authenticated;

ALTER TABLE public.salary_increments
  ADD COLUMN IF NOT EXISTS confidential_incentive_at_time NUMERIC;

DROP FUNCTION IF EXISTS public.apply_salary_increment(text, numeric, date, text, text, text);
CREATE OR REPLACE FUNCTION public.apply_salary_increment(
  p_employee_code TEXT, p_new_salary NUMERIC, p_effective_from DATE DEFAULT CURRENT_DATE,
  p_type TEXT DEFAULT 'Increment'::TEXT, p_approved_by TEXT DEFAULT 'HR'::TEXT,
  p_submitted_by TEXT DEFAULT 'HR'::TEXT, p_confidential_incentive_at_time NUMERIC DEFAULT NULL
)
RETURNS salary_increments
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare
  v_old_salary numeric; v_name text; v_amount numeric; v_pct numeric; v_row public.salary_increments;
begin
  select salary, full_name into v_old_salary, v_name from public.employees where employee_code = p_employee_code for update;
  if not found then raise exception 'Employee % not found', p_employee_code; end if;
  perform set_config('app.suppress_increment_trigger', 'true', true);
  update public.employees set salary = p_new_salary where employee_code = p_employee_code;
  v_amount := p_new_salary - coalesce(v_old_salary, 0);
  v_pct := case when coalesce(v_old_salary, 0) > 0 then round((v_amount / v_old_salary) * 10000) / 100 else null end;
  insert into public.salary_increments (
    employee_code, employee_name, old_salary, new_salary, effective_from,
    increment_amount, increment_percentage, type, status,
    submitted_by, approved_by, approved_at, created_at, confidential_incentive_at_time
  ) values (
    p_employee_code, v_name, v_old_salary, p_new_salary, p_effective_from,
    v_amount, v_pct, coalesce(p_type, 'Increment'), 'Approved',
    coalesce(p_submitted_by, 'HR'), coalesce(p_approved_by, 'HR'), now(), now(), p_confidential_incentive_at_time
  ) returning * into v_row;
  return v_row;
end;
$function$;
GRANT EXECUTE ON FUNCTION public.apply_salary_increment(text, numeric, date, text, text, text, numeric) TO authenticated;

-- The anon-default-privileges gotcha (see note above) — close it on
-- everything this migration touched.
REVOKE ALL ON public.cash_incentives FROM anon;
REVOKE ALL ON public.cash_incentive_history FROM anon;
REVOKE ALL ON public.cash_incentive_monthly FROM anon;
REVOKE EXECUTE ON FUNCTION public.cash_incentive_branch_totals(TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_incentives_paid_for_branch(TEXT, TEXT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.apply_salary_increment(text, numeric, date, text, text, text, numeric) FROM anon;
-- =============================================================

-- =============================================================
-- 2026-08-01: confidential_incentives_branch_totals_add_paid_flag
-- =============================================================
-- Follow-up to confidential_incentives_phase1: Finance Reconciliation
-- needs a per-branch "already marked paid this month" flag alongside the
-- total, without row-level access to cash_incentive_monthly. Extended
-- cash_incentive_branch_totals to also return is_paid (bool_and across
-- that branch's rows for the month — true only once every row is paid).
DROP FUNCTION IF EXISTS public.cash_incentive_branch_totals(TEXT);
CREATE OR REPLACE FUNCTION public.cash_incentive_branch_totals(p_month TEXT)
RETURNS TABLE(branch TEXT, total NUMERIC, is_paid BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(branch, 'Unassigned'), SUM(amount), bool_and(is_paid)
  FROM cash_incentive_monthly WHERE payroll_month = p_month GROUP BY 1;
$$;
GRANT EXECUTE ON FUNCTION public.cash_incentive_branch_totals(TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cash_incentive_branch_totals(TEXT) FROM anon;
-- =============================================================

-- =============================================================
-- 2026-08-01: increment_due_tracker_phase2
-- =============================================================
-- employees.last_increment_date / next_increment_due (15 months out from
-- the last increment, or from joining_date if never incremented) power the
-- "Due for Increment" tab and the monthly due-notification sweep.
-- Backfilled from existing salary_increments history / joining_date.
--
-- apply_salary_increment now stamps both columns directly in its own
-- UPDATE (it already suppresses the AFTER UPDATE trigger below, so it
-- can't rely on that trigger to do it). log_salary_increment_on_change
-- (fires on direct employees.salary edits outside apply_salary_increment,
-- e.g. from the Employees page) now also stamps them, via a second
-- guarded UPDATE that sets the same suppress flag first so it doesn't
-- re-fire itself — same technique apply_salary_increment already uses.
-- Both used CREATE OR REPLACE with unchanged signatures, so existing
-- grants (already anon-free from the phase1 migration) were preserved —
-- confirmed via pg_proc.proacl after applying.
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS last_increment_date DATE,
  ADD COLUMN IF NOT EXISTS next_increment_due DATE;

UPDATE employees e SET
  last_increment_date = s.last_date,
  next_increment_due = s.last_date + INTERVAL '15 months'
FROM (
  SELECT employee_code, MAX(effective_from) AS last_date
  FROM salary_increments
  WHERE COALESCE(status, 'Approved') = 'Approved' AND effective_from IS NOT NULL
  GROUP BY employee_code
) s
WHERE e.employee_code = s.employee_code;

UPDATE employees
SET next_increment_due = joining_date + INTERVAL '15 months'
WHERE last_increment_date IS NULL AND joining_date IS NOT NULL;

CREATE OR REPLACE FUNCTION public.apply_salary_increment(
  p_employee_code TEXT, p_new_salary NUMERIC, p_effective_from DATE DEFAULT CURRENT_DATE,
  p_type TEXT DEFAULT 'Increment'::TEXT, p_approved_by TEXT DEFAULT 'HR'::TEXT,
  p_submitted_by TEXT DEFAULT 'HR'::TEXT, p_confidential_incentive_at_time NUMERIC DEFAULT NULL
)
RETURNS salary_increments
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
declare
  v_old_salary numeric; v_name text; v_amount numeric; v_pct numeric; v_row public.salary_increments;
begin
  select salary, full_name into v_old_salary, v_name from public.employees where employee_code = p_employee_code for update;
  if not found then raise exception 'Employee % not found', p_employee_code; end if;
  perform set_config('app.suppress_increment_trigger', 'true', true);
  update public.employees set
    salary = p_new_salary,
    last_increment_date = p_effective_from,
    next_increment_due = p_effective_from + INTERVAL '15 months'
  where employee_code = p_employee_code;
  v_amount := p_new_salary - coalesce(v_old_salary, 0);
  v_pct := case when coalesce(v_old_salary, 0) > 0 then round((v_amount / v_old_salary) * 10000) / 100 else null end;
  insert into public.salary_increments (
    employee_code, employee_name, old_salary, new_salary, effective_from,
    increment_amount, increment_percentage, type, status,
    submitted_by, approved_by, approved_at, created_at, confidential_incentive_at_time
  ) values (
    p_employee_code, v_name, v_old_salary, p_new_salary, p_effective_from,
    v_amount, v_pct, coalesce(p_type, 'Increment'), 'Approved',
    coalesce(p_submitted_by, 'HR'), coalesce(p_approved_by, 'HR'), now(), now(), p_confidential_incentive_at_time
  ) returning * into v_row;
  return v_row;
end;
$function$;

CREATE OR REPLACE FUNCTION public.log_salary_increment_on_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
begin
  if coalesce(current_setting('app.suppress_increment_trigger', true), 'false') = 'true' then
    return new;
  end if;
  if new.salary is distinct from old.salary and old.salary is not null and new.salary is not null then
    insert into public.salary_increments (
      employee_code, employee_name, old_salary, new_salary, effective_from,
      increment_amount, increment_percentage, type, status,
      submitted_by, approved_by, approved_at, created_at
    ) values (
      new.employee_code, new.full_name, old.salary, new.salary, current_date,
      new.salary - old.salary,
      case when old.salary > 0 then round(((new.salary - old.salary) / old.salary) * 10000)/100 else null end,
      case when new.salary >= old.salary then 'Increment' else 'Downward Revision' end,
      'Approved', 'System (Auto)', 'System (Auto)', now(), now()
    );
    perform set_config('app.suppress_increment_trigger', 'true', true);
    update public.employees set
      last_increment_date = current_date,
      next_increment_due = current_date + INTERVAL '15 months'
    where employee_code = new.employee_code;
  end if;
  return new;
end;
$function$;
-- =============================================================

-- =============================================================
-- 2026-08-01: increment_approval_workflow_phase3
-- =============================================================
-- Wires up ApprovalQueue's previously-orphaned "Increments" tab: HR
-- proposes (inserts salary_increments with status='Pending', no salary
-- change), Master/GM approve or reject. approve_salary_increment is what
-- actually applies the salary + due-date change, atomically, once
-- approved.
--
-- First version of this function trusted a client-supplied
-- p_approver_role TEXT parameter for the Master/GM check — any caller
-- could pass 'Master' and bypass it. Fixed to verify the caller's real
-- session role via private.current_hrms_role() instead (same helper
-- mark_incentives_paid_for_branch already uses correctly). Also dropped
-- the now-unused p_approver_role parameter and closed the PUBLIC-grant
-- gap on this function.
CREATE OR REPLACE FUNCTION public.approve_salary_increment(p_increment_id UUID, p_approver_name TEXT)
RETURNS salary_increments
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE r public.salary_increments%ROWTYPE;
BEGIN
  IF (SELECT private.current_hrms_role()) NOT IN ('Master','GM') THEN
    RAISE EXCEPTION 'Only Master or GM can approve increments';
  END IF;
  SELECT * INTO r FROM public.salary_increments WHERE id = p_increment_id AND status = 'Pending' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Increment not found or not pending';
  END IF;
  PERFORM set_config('app.suppress_increment_trigger', 'true', true);
  UPDATE public.employees SET
    salary = r.new_salary,
    last_increment_date = r.effective_from,
    next_increment_due = r.effective_from + INTERVAL '15 months'
  WHERE employee_code = r.employee_code;
  UPDATE public.salary_increments SET status = 'Approved', approved_by = p_approver_name, approved_at = NOW()
  WHERE id = p_increment_id
  RETURNING * INTO r;
  RETURN r;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.approve_salary_increment(UUID, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.approve_salary_increment(UUID, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.approve_salary_increment(UUID, TEXT) FROM PUBLIC;

-- salary_increments previously had only the leftover "Allow all for
-- service role" policy (USING true, TO public) — a full read/write
-- backdoor for anyone, including anon, that would have let someone
-- bypass the approval workflow entirely by writing to the table
-- directly. Replaced with real role-scoped policies (confirmed with the
-- user before applying, since this widens scope beyond the literal
-- feature ask). SELECT roles mirror payroll_select (Master/HR/Finance/
-- GM/Audit) — who already sees this data via Salary Reports/Approval
-- Queue. INSERT covers HR proposing plus the existing bulk-import panel.
-- UPDATE is Master/GM only (covers the reject action; approve goes
-- through the SECURITY DEFINER RPC above, which bypasses RLS). Also
-- revoked anon's leftover full table grant (including TRUNCATE, which
-- bypasses RLS regardless of policies) — same anon-default-privileges
-- gotcha as phase1.
DROP POLICY IF EXISTS "Allow all for service role" ON public.salary_increments;

CREATE POLICY salary_increments_select ON public.salary_increments FOR SELECT TO authenticated
  USING ((SELECT private.current_hrms_role()) = ANY (ARRAY['Master','HR','Finance','GM','Audit']));

CREATE POLICY salary_increments_insert ON public.salary_increments FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.current_hrms_role()) = ANY (ARRAY['Master','HR','GM']));

CREATE POLICY salary_increments_update ON public.salary_increments FOR UPDATE TO authenticated
  USING ((SELECT private.current_hrms_role()) = ANY (ARRAY['Master','GM']))
  WITH CHECK ((SELECT private.current_hrms_role()) = ANY (ARRAY['Master','GM']));

REVOKE ALL ON public.salary_increments FROM anon;
-- =============================================================

-- =============================================================
-- Fix: "Process Attendance" recurring "canceling statement due to statement
-- timeout" errors.
--
-- Root cause: the `authenticated` role has a role-level statement_timeout of
-- 8s (and `anon` 3s) as a safety net against runaway ad-hoc queries from the
-- browser. But process_daily_attendance loops per-employee-per-day with
-- several sequential queries each; even the 3-day client-side chunking done
-- in ZKTSync.jsx can exceed 8s once there are ~300+ active employees. The
-- earlier fix (missing zkt_raw_punches index) reduced per-query cost but
-- never touched this hard ceiling, so the timeout kept recurring.
--
-- Fix: raise statement_timeout only for these specific heavy admin functions
-- via a function-level GUC override -- Postgres restores the caller's
-- original session timeout the moment the function returns, so the
-- anon/authenticated safety net stays fully intact for every other query.
--
-- Also discovered while diagnosing this: the "Import Pending Storage Files"
-- button/edge function (zkt-storage-import, scanning storage bucket
-- zkt-attendance-imports/incoming) has never actually imported a file --
-- every real import in attendance_import_batches came from a separate
-- external process calling import_zkt_raw_punches directly with a
-- 'manual/'-prefixed filename. Removed that dead button from ZKTSync.jsx in
-- favor of a read-only sync status panel (see src/pages/ZKTSync.jsx and
-- src/services/attendanceService.js).
-- =============================================================
ALTER FUNCTION public.run_attendance_processing(date, date) SET statement_timeout = '5min';
ALTER FUNCTION public.process_daily_attendance(date, date) SET statement_timeout = '5min';
ALTER FUNCTION public.generate_employee_work_rosters(date, date) SET statement_timeout = '5min';
ALTER FUNCTION public.import_zkt_raw_punches(jsonb, text) SET statement_timeout = '5min';

-- =============================================================
-- Finance Head: bank vs cash payment marking (2026-08-06)
--
-- Finance already had SELECT on employees (employees_select /
-- employees_select_authorized), but UPDATE is restricted to Master/HR only
-- (employees_update: app_current_role() IN ('Master','HR')). Finance Head
-- needs to flip a single flag -- whether an employee is paid by bank
-- transfer or cash -- without being granted broader employee-edit rights
-- (salary, CNIC, status, etc. must stay Master/HR-only).
--
-- Rather than widening employees_update to include Finance (which would
-- grant a full-row UPDATE via any direct table call, not just this one
-- column), added a narrow SECURITY DEFINER RPC that only ever touches
-- payment_method, gated on private.current_hrms_role() (the newer role
-- helper -- also respects deactivated accounts, unlike app_current_role()).
-- =============================================================
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'Bank'
  CHECK (payment_method IN ('Bank','Cash'));

CREATE OR REPLACE FUNCTION public.set_employee_payment_method(p_employee_code text, p_payment_method text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (SELECT private.current_hrms_role()) NOT IN ('Master','Finance') THEN
    RAISE EXCEPTION 'Not authorized to set employee payment method';
  END IF;
  IF p_payment_method NOT IN ('Bank','Cash') THEN
    RAISE EXCEPTION 'Invalid payment method: %', p_payment_method;
  END IF;
  UPDATE public.employees SET payment_method = p_payment_method
  WHERE employee_code = p_employee_code;
END;
$$;

REVOKE ALL ON FUNCTION public.set_employee_payment_method(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_employee_payment_method(text, text) TO authenticated;
-- =============================================================
ALTER FUNCTION public.process_zkt_raw_punches(date, date) SET statement_timeout = '5min';

-- =============================================================
-- Loan approval workflow (2026-08-06)
--
-- LoanManagement.jsx's "+ New Loan" form inserted straight into `loans`
-- with status='Active' -- no approval step at all, unlike Salary
-- Increments/One-Time Adjustments/Settlements/Payment Status changes,
-- which all already go through a HR-proposes -> Master/GM-approves gate
-- via the Approval Queue. Mirrors the salary_increments pattern exactly:
-- HR submissions land as 'Pending Approval' (excluded from payroll
-- deduction, which already filters loans on status='Active' --
-- PayrollAutomation.jsx:632 -- so nothing needs to change there), Master's
-- own submissions apply instantly (Master IS an approver), GM never
-- proposes, only approves/rejects. Bulk import (historical record
-- migration, not a new loan grant) is intentionally left as direct
-- Active/Cleared -- out of scope per user confirmation.
--
-- loans_manage_authorized already restricts INSERT/UPDATE/DELETE to
-- Master/HR (see loan_permission_fixes) -- GM has zero write access, so
-- both approve and reject route through narrow SECURITY DEFINER RPCs
-- (same approach as set_employee_payment_method above) rather than
-- widening GM's general table access. loans_select_authorized also never
-- included GM, so GM could not have even seen a pending loan in the
-- Approval Queue -- widened SELECT (read-only) to include GM.
-- =============================================================
ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS submitted_by TEXT,
  ADD COLUMN IF NOT EXISTS approved_by TEXT,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

ALTER POLICY loans_select_authorized ON public.loans
  USING (
    ((SELECT private.current_hrms_role()) = ANY (ARRAY['Master','HR','Finance','GM','Audit']))
    OR (employee_code = (SELECT private.current_employee_code()))
  );

CREATE OR REPLACE FUNCTION public.approve_loan_request(p_loan_id UUID, p_approver_name TEXT)
RETURNS public.loans
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE r public.loans%ROWTYPE;
BEGIN
  IF (SELECT private.current_hrms_role()) NOT IN ('Master','GM') THEN
    RAISE EXCEPTION 'Only Master or GM can approve loan requests';
  END IF;
  SELECT * INTO r FROM public.loans WHERE id = p_loan_id AND status = 'Pending Approval' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loan request not found or not pending';
  END IF;
  UPDATE public.loans SET status = 'Active', approved_by = p_approver_name, approved_at = NOW()
  WHERE id = p_loan_id
  RETURNING * INTO r;
  RETURN r;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reject_loan_request(p_loan_id UUID, p_approver_name TEXT, p_reason TEXT)
RETURNS public.loans
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE r public.loans%ROWTYPE;
BEGIN
  IF (SELECT private.current_hrms_role()) NOT IN ('Master','GM') THEN
    RAISE EXCEPTION 'Only Master or GM can reject loan requests';
  END IF;
  SELECT * INTO r FROM public.loans WHERE id = p_loan_id AND status = 'Pending Approval' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loan request not found or not pending';
  END IF;
  UPDATE public.loans SET status = 'Rejected', approved_by = p_approver_name, approved_at = NOW(), rejection_reason = p_reason
  WHERE id = p_loan_id
  RETURNING * INTO r;
  RETURN r;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.approve_loan_request(UUID, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.approve_loan_request(UUID, TEXT) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_loan_request(UUID, TEXT, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.reject_loan_request(UUID, TEXT, TEXT) FROM anon, PUBLIC;
-- =============================================================

-- =============================================================
-- Loan changes (Reschedule/Skip Month) approval + Clear locked to Master +
-- outstanding_balance actually decrementing (2026-08-06)
--
-- 1) Reschedule and Skip Month (relief) previously wrote straight to
--    loans/loan_changes from LoanManagement.jsx with zero gate, same class
--    of bug as the loan-creation one fixed above. `loan_changes` becomes
--    the proposal record itself (same role loan_changes already played as
--    an audit log, just with a status now) -- HR inserts status='Pending'
--    and nothing on `loans` changes yet; Master inserts status='Approved'
--    directly (applies instantly, same "Master IS an approver" rule as
--    everywhere else); GM only ever approves/rejects via the RPCs below,
--    consistent with loans_manage_authorized never granting GM write
--    access to loans/loan_changes.
--
--    Skip Month previously only logged an audit note -- it never actually
--    stopped that month's deduction from being included in payroll
--    (PayrollAutomation.jsx's loan-matching had no concept of a skip).
--    Added `effective_month` so an Approved relief request now genuinely
--    excludes that loan from that month's payroll generation (see
--    PayrollAutomation.jsx buildPayrollRows()).
--
-- 2) Clear and Early Settle were, and remain, the exact same DB
--    operation (status='Cleared', outstanding_balance=0) -- there's no way
--    for RLS to tell them apart since the app sends identical writes for
--    both. Restricting only "Clear" to Master is therefore enforced by
--    routing it through this Master-only RPC and removing HR's direct
--    path to it in the UI; Early Settle is intentionally left as a direct
--    Master/HR table update, unchanged, since it wasn't part of the ask.
--    Note for later: HR can still zero out any active loan today via
--    Early Settle -- if the intent is "no one but Master can write off a
--    loan balance," Early Settle needs the same treatment.
--
-- 3) outstanding_balance was only ever touched by Clear/Early Settle --
--    the monthly deductions actually taken via payroll never reduced it,
--    so the Loan Ledger's balance was frozen at the original amount for a
--    loan's entire life. mark_payroll_paid() now decrements the
--    employee's active loan by that payroll row's loan_deduction at the
--    moment Finance marks it Paid (not at Generate/Refresh time, since a
--    draft can be regenerated before payment), auto-clearing at zero.
--    Guarded by re-checking is_paid inside the function (FOR UPDATE) so a
--    double-click/retry can't double-decrement -- same race fixed for
--    increment approval. Assumes one active loan per employee, same
--    assumption buildPayrollRows() already makes via Array.find rather
--    than summing multiple active loans.
-- =============================================================
ALTER TABLE public.loan_changes
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Approved',
  ADD COLUMN IF NOT EXISTS submitted_by TEXT,
  ADD COLUMN IF NOT EXISTS approved_by TEXT,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS effective_month TEXT;

ALTER POLICY loan_changes_select_authorized ON public.loan_changes
  USING ((SELECT private.current_hrms_role()) = ANY (ARRAY['Master','HR','Finance','GM','Audit']));

CREATE OR REPLACE FUNCTION public.approve_loan_change(p_change_id UUID, p_approver_name TEXT)
RETURNS public.loan_changes
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE c public.loan_changes%ROWTYPE;
DECLARE ln public.loans%ROWTYPE;
DECLARE new_months INT;
BEGIN
  IF (SELECT private.current_hrms_role()) NOT IN ('Master','GM') THEN
    RAISE EXCEPTION 'Only Master or GM can approve loan change requests';
  END IF;
  SELECT * INTO c FROM public.loan_changes WHERE id = p_change_id AND status = 'Pending' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loan change request not found or not pending';
  END IF;

  IF c.change_type = 'reschedule' THEN
    SELECT * INTO ln FROM public.loans WHERE id = c.loan_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Underlying loan not found';
    END IF;
    IF COALESCE(c.new_monthly, 0) <= 0 THEN
      RAISE EXCEPTION 'Invalid proposed monthly deduction';
    END IF;
    new_months := CEIL(ln.outstanding_balance / c.new_monthly);
    UPDATE public.loans SET monthly_deduction = c.new_monthly, repayment_months = new_months WHERE id = ln.id;
  END IF;
  -- change_type = 'relief' (Skip Month) needs no loans-table change --
  -- buildPayrollRows() checks for an Approved relief row matching
  -- (loan_id, effective_month) directly.

  UPDATE public.loan_changes SET status = 'Approved', approved_by = p_approver_name, approved_at = NOW()
  WHERE id = p_change_id
  RETURNING * INTO c;
  RETURN c;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reject_loan_change(p_change_id UUID, p_approver_name TEXT, p_reason TEXT)
RETURNS public.loan_changes
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE c public.loan_changes%ROWTYPE;
BEGIN
  IF (SELECT private.current_hrms_role()) NOT IN ('Master','GM') THEN
    RAISE EXCEPTION 'Only Master or GM can reject loan change requests';
  END IF;
  SELECT * INTO c FROM public.loan_changes WHERE id = p_change_id AND status = 'Pending' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loan change request not found or not pending';
  END IF;
  UPDATE public.loan_changes SET status = 'Rejected', approved_by = p_approver_name, approved_at = NOW(), rejection_reason = p_reason
  WHERE id = p_change_id
  RETURNING * INTO c;
  RETURN c;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.approve_loan_change(UUID, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.approve_loan_change(UUID, TEXT) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_loan_change(UUID, TEXT, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.reject_loan_change(UUID, TEXT, TEXT) FROM anon, PUBLIC;

CREATE OR REPLACE FUNCTION public.clear_loan(p_loan_id UUID, p_actor_name TEXT)
RETURNS public.loans
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE ln public.loans%ROWTYPE;
DECLARE v_old_balance NUMERIC;
BEGIN
  IF (SELECT private.current_hrms_role()) <> 'Master' THEN
    RAISE EXCEPTION 'Only Master can clear a loan';
  END IF;
  SELECT * INTO ln FROM public.loans WHERE id = p_loan_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loan not found';
  END IF;
  v_old_balance := ln.outstanding_balance;
  UPDATE public.loans SET status = 'Cleared', outstanding_balance = 0 WHERE id = p_loan_id RETURNING * INTO ln;
  INSERT INTO public.loan_changes (loan_id, employee_code, change_type, old_balance, new_balance, reason, status, submitted_by, approved_by, approved_at)
  VALUES (p_loan_id, ln.employee_code, 'settlement', v_old_balance, 0, 'Manual clear', 'Approved', p_actor_name, p_actor_name, NOW());
  RETURN ln;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.clear_loan(UUID, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.clear_loan(UUID, TEXT) FROM anon, PUBLIC;

CREATE OR REPLACE FUNCTION public.mark_payroll_paid(p_payroll_month TEXT, p_employee_code TEXT, p_actor_name TEXT)
RETURNS public.payroll
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE pr public.payroll%ROWTYPE;
DECLARE ln public.loans%ROWTYPE;
DECLARE v_new_balance NUMERIC;
BEGIN
  IF (SELECT private.current_hrms_role()) <> 'Finance' THEN
    RAISE EXCEPTION 'Only Finance can mark payroll as paid';
  END IF;
  SELECT * INTO pr FROM public.payroll WHERE payroll_month = p_payroll_month AND employee_code = p_employee_code FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll row not found for % / %', p_employee_code, p_payroll_month;
  END IF;
  IF pr.is_paid THEN
    RETURN pr;
  END IF;

  UPDATE public.payroll SET is_paid = true, paid_at = NOW(), paid_by = p_actor_name
  WHERE id = pr.id
  RETURNING * INTO pr;

  IF COALESCE(pr.loan_deduction, 0) > 0 THEN
    SELECT * INTO ln FROM public.loans
    WHERE employee_code = p_employee_code AND status = 'Active'
    ORDER BY created_at ASC LIMIT 1 FOR UPDATE;
    IF FOUND THEN
      v_new_balance := GREATEST(0, COALESCE(ln.outstanding_balance, 0) - pr.loan_deduction);
      UPDATE public.loans SET
        outstanding_balance = v_new_balance,
        status = CASE WHEN v_new_balance <= 0 THEN 'Cleared' ELSE status END
      WHERE id = ln.id;
    END IF;
  END IF;

  RETURN pr;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.mark_payroll_paid(TEXT, TEXT, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_payroll_paid(TEXT, TEXT, TEXT) FROM anon, PUBLIC;
-- =============================================================

-- =============================================================
-- Incident (2026-08-06): HR cleared Muhammad Javed's loan (employee_code
-- 935) minutes after this session's "Clear -> Master only" fix was
-- committed. Root cause was two-layered:
--
-- 1) The commit restricting the Clear button/clearLoan() to Master was
--    never pushed to origin, so the deployed frontend still ran the old
--    code (Clear visible to HR, direct client-side update). Pushed now.
--
-- 2) Even with the frontend fixed, `loans_manage_authorized` below still
--    granted HR the SAME UPDATE/DELETE rights as Master at the database
--    layer -- restricting the button and adding a Master-only clear_loan()
--    RPC alongside an unchanged permissive policy did nothing to stop HR
--    from calling `supabase.from("loans").update(...)` directly (which is
--    exactly what the old deployed bundle did, and what anyone could still
--    do by hand regardless of which frontend is live). The loan_changes
--    row this produced (change_type='settlement', old_balance/approved_by
--    both null) confirms it went through that direct path, not clear_loan().
--
--    This is the actual fix: HR loses UPDATE/DELETE on `loans` entirely at
--    the RLS layer, not just in the UI. HR's only remaining legitimate
--    paths are INSERT (new loan applications / bulk import, both already
--    Pending Approval for HR) and INSERT into loan_changes (reschedule/
--    skip-month proposals) -- neither needs UPDATE/DELETE on loans itself
--    any more now that Master applies its own changes directly and HR's
--    requests all route through approval.
--
--    Early Settle sets the exact same columns as Clear (status='Cleared',
--    outstanding_balance=0) -- flagged last session as an open loophole,
--    now confirmed live by this incident. Locked down the same way via a
--    new early_settle_loan() RPC; LoanManagement.jsx's Early Settle button
--    is now Master-only too, matching Clear.
-- =============================================================
DROP POLICY IF EXISTS loans_manage_authorized ON public.loans;

CREATE POLICY loans_insert_authorized ON public.loans FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.current_hrms_role()) = ANY (ARRAY['Master','HR']));

CREATE POLICY loans_master_update_authorized ON public.loans FOR UPDATE TO authenticated
  USING ((SELECT private.current_hrms_role()) = 'Master')
  WITH CHECK ((SELECT private.current_hrms_role()) = 'Master');

CREATE POLICY loans_master_delete_authorized ON public.loans FOR DELETE TO authenticated
  USING ((SELECT private.current_hrms_role()) = 'Master');

CREATE OR REPLACE FUNCTION public.early_settle_loan(p_loan_id UUID, p_actor_name TEXT)
RETURNS public.loans
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE ln public.loans%ROWTYPE;
DECLARE v_old_balance NUMERIC;
BEGIN
  IF (SELECT private.current_hrms_role()) <> 'Master' THEN
    RAISE EXCEPTION 'Only Master can early-settle a loan';
  END IF;
  SELECT * INTO ln FROM public.loans WHERE id = p_loan_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loan not found';
  END IF;
  v_old_balance := ln.outstanding_balance;
  UPDATE public.loans SET status = 'Cleared', outstanding_balance = 0 WHERE id = p_loan_id RETURNING * INTO ln;
  INSERT INTO public.loan_changes (loan_id, employee_code, change_type, old_balance, new_balance, reason, status, submitted_by, approved_by, approved_at)
  VALUES (p_loan_id, ln.employee_code, 'early_settlement', v_old_balance, 0, 'Early settlement — full balance paid', 'Approved', p_actor_name, p_actor_name, NOW());
  RETURN ln;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.early_settle_loan(UUID, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.early_settle_loan(UUID, TEXT) FROM anon, PUBLIC;

-- Restore Muhammad Javed's loan: created 2026-08-06 14:55, cleared 16:41 the
-- same day via the unpatched path above -- under 2 hours old, no payroll
-- cycle could have run against it, so the pre-clear balance is unambiguously
-- the full loan_amount. Logged as a correction entry for the audit trail.
UPDATE public.loans SET status = 'Active', outstanding_balance = loan_amount
WHERE id = '944dc131-a36f-42e1-9edc-af5c36b9020d';

INSERT INTO public.loan_changes (loan_id, employee_code, change_type, old_balance, new_balance, reason, status, submitted_by, approved_by, approved_at)
VALUES ('944dc131-a36f-42e1-9edc-af5c36b9020d', '935', 'correction', 0, 30000,
  'Reverted unauthorized HR clear (loans_manage_authorized gap, fixed above) -- restored to pre-clear balance',
  'Approved', 'System', 'Master', NOW());
-- =============================================================

-- =============================================================
-- Migration: auto_detect_shift_in_process_daily_attendance
-- Applied: 2026-08-17
-- Shifts were never actually assigned per employee -- every active
-- employee had been bulk-defaulted to employees.assigned_shift_code =
-- SHIFT_A (or left null), so anyone actually working an evening pattern
-- (e.g. SHIFT_B, in ~12:30-14:30 / out past midnight) was graded late
-- against an 11:00 start they were never scheduled for, tripping the
-- 90-minute half_day_threshold_minutes rule on most days and reading as
-- chronic "Half Day" despite working full or overtime hours.
--
-- process_daily_attendance() now auto-detects each day's shift from the
-- employee's own first punch (<=12:30 -> SHIFT_A/11:00, else SHIFT_B/13:00)
-- unless there's a genuine explicit override: a roster entry for that date,
-- or an assigned_shift_code that isn't the blanket SHIFT_A default (e.g.
-- the night guard's fixed SHIFT_NIGHT_GUARD). Reprocessed Jan-Aug 2026
-- (nothing paid/locked yet at the time -- July & August payroll were both
-- still Draft).
-- =============================================================
CREATE OR REPLACE FUNCTION public.process_daily_attendance(p_from_date date, p_to_date date)
 RETURNS TABLE(processed_days integer, inserted_or_updated integer, needs_review_count integer, absent_count integer, half_day_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
 SET statement_timeout TO '5min'
AS $function$
declare
  v_employee record;
  v_day date;
  v_roster record;
  v_shift public.shift_definitions%rowtype;
  v_shift_code text;
  v_group text;
  v_required_hours numeric;
  v_day_required_hours numeric;
  v_friday_override numeric;
  v_start timestamp without time zone;
  v_end timestamp without time zone;
  v_win_start timestamp without time zone;
  v_win_end timestamp without time zone;
  v_first_in timestamp without time zone;
  v_last_out timestamp without time zone;
  v_punch_count integer;
  v_pos_first timestamp without time zone;
  v_pos_last timestamp without time zone;
  v_class record;
  v_source_locations text;
  v_rows integer := 0;
  v_days integer := 0;
  v_review integer := 0;
  v_absent integer := 0;
  v_half integer := 0;
  v_weekly_off boolean;
  v_gh boolean;
  v_day_type text;
  v_existing_locked boolean;
  v_auto_detect boolean;
  -- Tracks the last punch already claimed as a checkout by a previous day
  -- within this run, per employee. A punch just after midnight that closes
  -- out an overnight shift (e.g. 13:00 -> 00:54) sits inside both that
  -- day's window and the next day's window (windows intentionally overlap
  -- to tolerate early/late punches) -- without this, the same physical
  -- punch could be reused as the NEXT day's check-in too, producing a
  -- bogus ~20+ hour "shift" when paired with that day's real punch.
  v_prev_claimed_until timestamp without time zone;
begin
  if p_from_date is null or p_to_date is null or p_to_date < p_from_date then
    raise exception 'Invalid attendance processing date range';
  end if;

  perform public.refresh_zkt_punch_employee_mapping();

  for v_employee in
    select e.employee_code,
           e.zkt_employee_no,
           e.eligibility_group,
           e.assigned_shift_code,
           e.status,
           e.branch,
           e.joining_date,
           e.last_working_day,
           e.single_punch_ok
      from public.employees e
     where e.zkt_employee_no is not null
       and e.zkt_employee_no <> ''
       and (coalesce(e.status, 'Active') = 'Active' or e.last_working_day is not null)
  loop
    v_group := coalesce(nullif(v_employee.eligibility_group, ''), 'SALES_SUPPORT');
    select required_hours into v_required_hours
      from public.staff_eligibility_groups
     where code = v_group and is_active = true;

    if v_required_hours is null then
      continue;
    end if;

    v_prev_claimed_until := null;

    for v_day in select generate_series(p_from_date, p_to_date, interval '1 day')::date loop
      v_days := v_days + 1;

      if v_employee.joining_date is not null and v_day < v_employee.joining_date then
        continue;
      end if;

      if coalesce(v_employee.status, 'Active') <> 'Active'
         and v_employee.last_working_day is not null
         and v_day > v_employee.last_working_day then
        continue;
      end if;

      v_day_required_hours := v_required_hours;
      if extract(dow from v_day) = 5 then
        select value::numeric into v_friday_override
          from public.hrms_policy_settings
         where key = case when v_group = 'MANAGEMENT_ADMIN' then 'friday_hours_management' else 'friday_hours_non_management' end
         limit 1;
        if v_friday_override is not null then
          v_day_required_hours := v_friday_override;
        end if;
      end if;

      select r.shift_code, r.is_weekly_off, r.is_gazetted_holiday, r.day_type
        into v_roster
        from public.employee_work_rosters r
       where r.employee_code = v_employee.employee_code
         and r.roster_date = v_day
       limit 1;

      v_weekly_off := coalesce(v_roster.is_weekly_off, false);
      v_gh := coalesce(v_roster.is_gazetted_holiday, exists(select 1 from public.gazetted_holidays g where g.holiday_date = v_day and g.is_active = true));
      v_day_type := coalesce(v_roster.day_type, case when v_weekly_off then 'Weekly Off' when v_gh then 'Gazetted Holiday' else 'Working Day' end);

      -- Shifts were never actually assigned per employee -- every active
      -- employee got bulk-defaulted to assigned_shift_code = SHIFT_A (or
      -- left null), which graded evening-pattern staff as chronically late
      -- against an 11:00 start they were never really scheduled for. Unless
      -- there's a genuine explicit override (a roster entry for this date,
      -- or an assigned_shift_code that isn't that blanket SHIFT_A default,
      -- e.g. a night guard's fixed shift), detect the day's shift from the
      -- employee's own actual first punch instead of assuming SHIFT_A.
      v_auto_detect := v_group <> 'MANAGEMENT_ADMIN'
        and v_roster.shift_code is null
        and (nullif(v_employee.assigned_shift_code, '') is null or v_employee.assigned_shift_code = 'SHIFT_A');

      if v_auto_detect then
        -- Wide window spanning both SHIFT_A's (07:00-05:30+1) and SHIFT_B's
        -- (09:00-07:30+1) original bounds, since which shift applies isn't
        -- known until the actual first punch is found below.
        v_win_start := v_day::timestamp + interval '7 hours';
        v_win_end := (v_day + 1)::timestamp + interval '7 hours 30 minutes';
      else
        v_shift_code := private.resolve_employee_shift(v_employee.employee_code, v_day, v_employee.assigned_shift_code);

        select * into v_shift from public.shift_definitions where shift_code = v_shift_code and is_active = true;
        if not found then
          v_shift.shift_code := v_shift_code;
          v_shift.start_time := '00:00'::time;
          v_shift.end_time := '00:00'::time;
          v_shift.scheduled_hours := v_day_required_hours;
          v_shift.crosses_midnight := false;
        end if;

        if v_group = 'MANAGEMENT_ADMIN' then
          v_start := null;
          v_end := null;
        else
          v_start := v_day::timestamp + v_shift.start_time;
          v_end := v_day::timestamp + v_shift.end_time;
          if v_shift.crosses_midnight or v_shift.end_time < v_shift.start_time then
            v_end := v_end + interval '1 day';
          end if;
        end if;

        v_win_start := case when v_start is null then v_day::timestamp else v_start - interval '4 hours' end;
        v_win_end := case when v_end is null then (v_day + 1)::timestamp + interval '6 hours' else v_end + interval '8 hours' end;
      end if;

      select
        min(p.punch_time) filter (where lower(coalesce(p.punch_status,'')) in ('c/in','in','check in','check-in','checkin')),
        max(p.punch_time) filter (where lower(coalesce(p.punch_status,'')) in ('c/out','out','check out','check-out','checkout')),
        string_agg(distinct coalesce(p.location_id,''), ',' order by coalesce(p.location_id,''))
      into v_first_in, v_last_out, v_source_locations
      from public.zkt_raw_punches p
      where p.employee_code = v_employee.employee_code
        and p.punch_time >= v_win_start and p.punch_time < v_win_end
        and p.punch_time > coalesce(v_prev_claimed_until, '-infinity'::timestamp);

      if v_first_in is null or v_last_out is null
         or (v_first_in is not null and v_last_out is not null and v_last_out < v_first_in) then
        select count(*), min(p.punch_time), max(p.punch_time)
          into v_punch_count, v_pos_first, v_pos_last
          from public.zkt_raw_punches p
         where p.employee_code = v_employee.employee_code
           and p.punch_time >= v_win_start and p.punch_time < v_win_end
           and p.punch_time > coalesce(v_prev_claimed_until, '-infinity'::timestamp);

        if v_punch_count >= 2 then
          v_first_in := v_pos_first;
          v_last_out := v_pos_last;
        end if;
      end if;

      if v_last_out is not null and v_first_in is not null and v_last_out < v_first_in then
        v_last_out := null;
      end if;

      if v_auto_detect then
        -- Now that the day's actual first punch is known, grade against
        -- whichever shift it implies (check-in <=12:30 -> SHIFT_A/11:00,
        -- else SHIFT_B/13:00) instead of a fixed default.
        if v_first_in is null then
          v_shift_code := 'SHIFT_A';
        elsif v_first_in::time <= time '12:30' then
          v_shift_code := 'SHIFT_A';
        else
          v_shift_code := 'SHIFT_B';
        end if;

        select * into v_shift from public.shift_definitions where shift_code = v_shift_code and is_active = true;
        v_start := v_day::timestamp + v_shift.start_time;
        v_end := v_day::timestamp + v_shift.end_time;
        if v_shift.crosses_midnight or v_shift.end_time < v_shift.start_time then
          v_end := v_end + interval '1 day';
        end if;
      end if;

      select * into v_class
      from public.classify_attendance_day(
        v_group,
        v_day_required_hours,
        v_start,
        v_end,
        v_first_in,
        v_last_out,
        v_weekly_off,
        v_gh
      );

      if v_employee.single_punch_ok
         and (v_first_in is not null or v_last_out is not null)
         and v_class.worked_hours < v_day_required_hours then
        v_class.worked_hours := v_day_required_hours;
        v_class.attendance_status := 'Present';
        v_class.late_minutes := 0;
        v_class.early_out_minutes := 0;
        v_class.overtime_hours := 0;
        v_class.needs_review := false;
        v_class.exception_reason := null;
      end if;

      if v_first_in is not null and v_last_out is not null
         and (extract(epoch from (v_last_out - v_first_in)) / 3600.0) > 16 then
        v_class.needs_review := true;
        v_class.exception_reason := trim(both '; ' from coalesce(v_class.exception_reason || '; ', '') || 'Unusually long shift duration - please verify punches');
      end if;

      if v_last_out is not null then
        v_prev_claimed_until := v_last_out;
      end if;

      select exists(
        select 1 from public.attendance a
         where a.employee_code = v_employee.employee_code
           and a.work_date = v_day
           and coalesce(a.review_status,'') = 'Locked'
      ) into v_existing_locked;

      if not v_existing_locked then
        insert into public.attendance (
          employee_code, attendance_date, work_date, source, eligibility_group, shift_code,
          first_check_in, last_check_out, check_in, check_out, actual_hours,
          worked_hours, required_hours, short_hours,
          late_minutes, early_out_minutes, overtime_hours,
          extra_day_eligible, gh_eligible, is_weekly_off, is_gazetted_holiday,
          attendance_status, exception_reason, needs_review, calculated_at,
          zkt_location_id, review_status
        ) values (
          v_employee.employee_code, v_day, v_day, 'ZKT CSV', v_group, v_shift_code,
          v_first_in, v_last_out, v_first_in, v_last_out, v_class.worked_hours,
          v_class.worked_hours, v_day_required_hours,
          round(greatest(v_day_required_hours - v_class.worked_hours, 0)::numeric, 2),
          v_class.late_minutes, v_class.early_out_minutes, v_class.overtime_hours,
          v_class.extra_day_eligible, v_class.gh_eligible, v_weekly_off, v_gh,
          v_class.attendance_status, v_class.exception_reason, v_class.needs_review, now(),
          v_source_locations, case when v_class.needs_review then 'Pending Review' else 'Calculated' end
        )
        on conflict (employee_code, work_date) where employee_code is not null and work_date is not null
        do update set
          attendance_date = excluded.attendance_date,
          source = excluded.source,
          eligibility_group = excluded.eligibility_group,
          shift_code = excluded.shift_code,
          first_check_in = excluded.first_check_in,
          last_check_out = excluded.last_check_out,
          check_in = excluded.check_in,
          check_out = excluded.check_out,
          actual_hours = excluded.actual_hours,
          worked_hours = excluded.worked_hours,
          required_hours = excluded.required_hours,
          short_hours = excluded.short_hours,
          late_minutes = excluded.late_minutes,
          early_out_minutes = excluded.early_out_minutes,
          overtime_hours = excluded.overtime_hours,
          extra_day_eligible = excluded.extra_day_eligible,
          gh_eligible = excluded.gh_eligible,
          is_weekly_off = excluded.is_weekly_off,
          is_gazetted_holiday = excluded.is_gazetted_holiday,
          attendance_status = excluded.attendance_status,
          exception_reason = excluded.exception_reason,
          needs_review = excluded.needs_review,
          calculated_at = excluded.calculated_at,
          zkt_location_id = excluded.zkt_location_id,
          review_status = excluded.review_status;
        v_rows := v_rows + 1;
        if v_class.needs_review then v_review := v_review + 1; end if;
        if v_class.attendance_status = 'Absent' then v_absent := v_absent + 1; end if;
        if v_class.attendance_status = 'Half Day' then v_half := v_half + 1; end if;
      end if;
    end loop;
  end loop;

  return query select v_days, v_rows, v_review, v_absent, v_half;
end;
$function$;
-- =============================================================

-- =============================================================
-- Migration: auto_detect_shift_in_reclassify_attendance_row
-- Applied: 2026-08-17
-- Companion to auto_detect_shift_in_process_daily_attendance -- that fix
-- only covered the bulk daily pipeline; reclassify_attendance_row() (used
-- by AttendanceAdjustment.jsx and the Timesheet "Adjust" time-correction
-- flow, via reclassify after a check-in/out edit) still resolved shift
-- through the old private.resolve_employee_shift(), which fell back to the
-- blanket SHIFT_A default nobody was actually assigned. Same auto-detect
-- now applied here: unless there's a genuine explicit override (a roster
-- entry for that date, or an assigned_shift_code other than the SHIFT_A
-- default), grade the row's already-recorded check-in against whichever
-- shift its time-of-day implies (<=12:30 -> SHIFT_A/11:00, else
-- SHIFT_B/13:00), same cutoffs as the daily pipeline.
-- =============================================================
CREATE OR REPLACE FUNCTION public.reclassify_attendance_row(p_attendance_id uuid)
 RETURNS attendance
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_att public.attendance%rowtype;
  v_emp record;
  v_group text;
  v_required_hours numeric;
  v_day_required_hours numeric;
  v_friday_override numeric;
  v_shift_code text;
  v_shift public.shift_definitions%rowtype;
  v_start timestamp without time zone;
  v_end timestamp without time zone;
  v_roster record;
  v_weekly_off boolean;
  v_gh boolean;
  v_auto_detect boolean;
  v_class record;
  v_needs_review boolean;
  v_exception_reason text;
begin
  select * into v_att from public.attendance where id = p_attendance_id;
  if not found then
    raise exception 'attendance row not found: %', p_attendance_id;
  end if;

  select e.eligibility_group, e.assigned_shift_code into v_emp
    from public.employees e where e.employee_code = v_att.employee_code;

  v_group := coalesce(nullif(v_emp.eligibility_group, ''), 'SALES_SUPPORT');
  select required_hours into v_required_hours
    from public.staff_eligibility_groups where code = v_group and is_active = true;
  if v_required_hours is null then
    raise exception 'Attendance eligibility group not configured: %', v_group;
  end if;

  v_day_required_hours := v_required_hours;
  if extract(dow from v_att.work_date) = 5 then
    select value::numeric into v_friday_override
      from public.hrms_policy_settings
     where key = case when v_group = 'MANAGEMENT_ADMIN' then 'friday_hours_management' else 'friday_hours_non_management' end
     limit 1;
    if v_friday_override is not null then
      v_day_required_hours := v_friday_override;
    end if;
  end if;

  select r.shift_code, r.is_weekly_off, r.is_gazetted_holiday into v_roster
    from public.employee_work_rosters r
   where r.employee_code = v_att.employee_code and r.roster_date = v_att.work_date
   limit 1;
  v_weekly_off := coalesce(v_roster.is_weekly_off, false);
  v_gh := coalesce(v_roster.is_gazetted_holiday, exists(select 1 from public.gazetted_holidays g where g.holiday_date = v_att.work_date and g.is_active = true));

  v_auto_detect := v_group <> 'MANAGEMENT_ADMIN'
    and v_roster.shift_code is null
    and (nullif(v_emp.assigned_shift_code, '') is null or v_emp.assigned_shift_code = 'SHIFT_A');

  if v_auto_detect then
    if v_att.check_in is null then
      v_shift_code := 'SHIFT_A';
    elsif v_att.check_in::time <= time '12:30' then
      v_shift_code := 'SHIFT_A';
    else
      v_shift_code := 'SHIFT_B';
    end if;

    select * into v_shift from public.shift_definitions where shift_code = v_shift_code and is_active = true;
    v_start := v_att.work_date::timestamp + v_shift.start_time;
    v_end := v_att.work_date::timestamp + v_shift.end_time;
    if v_shift.crosses_midnight or v_shift.end_time < v_shift.start_time then
      v_end := v_end + interval '1 day';
    end if;
  else
    v_shift_code := private.resolve_employee_shift(v_att.employee_code, v_att.work_date, v_emp.assigned_shift_code);
    select * into v_shift from public.shift_definitions where shift_code = v_shift_code and is_active = true;
    if not found then
      v_shift.shift_code := v_shift_code;
      v_shift.start_time := '00:00'::time;
      v_shift.end_time := '00:00'::time;
      v_shift.crosses_midnight := false;
    end if;

    if v_group = 'MANAGEMENT_ADMIN' then
      v_start := null;
      v_end := null;
    else
      v_start := v_att.work_date::timestamp + v_shift.start_time;
      v_end := v_att.work_date::timestamp + v_shift.end_time;
      if v_shift.crosses_midnight or v_shift.end_time < v_shift.start_time then
        v_end := v_end + interval '1 day';
      end if;
    end if;
  end if;

  select * into v_class from public.classify_attendance_day(
    v_group, v_day_required_hours, v_start, v_end,
    v_att.check_in, v_att.check_out, v_weekly_off, v_gh
  );

  v_needs_review := v_class.needs_review;
  v_exception_reason := v_class.exception_reason;

  if v_att.check_in is not null and v_att.check_out is not null
     and (extract(epoch from (v_att.check_out - v_att.check_in)) / 3600.0) > 16 then
    v_needs_review := true;
    v_exception_reason := trim(both '; ' from coalesce(v_exception_reason || '; ', '') || 'Unusually long shift duration - please verify punches');
  end if;

  update public.attendance set
    required_hours = v_day_required_hours,
    worked_hours = v_class.worked_hours,
    actual_hours = v_class.worked_hours,
    short_hours = round(greatest(v_day_required_hours - v_class.worked_hours, 0)::numeric, 2),
    late_minutes = v_class.late_minutes,
    early_out_minutes = v_class.early_out_minutes,
    overtime_hours = v_class.overtime_hours,
    attendance_status = v_class.attendance_status,
    needs_review = v_needs_review,
    exception_reason = v_exception_reason,
    shift_code = v_shift_code,
    calculated_at = now()
  where id = p_attendance_id
  returning * into v_att;

  return v_att;
end;
$function$;
-- =============================================================

-- =============================================================
-- Migration: friday_late_shift (add_shift_friday_definition +
--   friday_late_shift_in_process_daily_attendance +
--   friday_late_shift_in_reclassify_attendance_row)
-- Applied: 2026-08-17
-- Every branch except BASE FAISAL opens at 14:30 on Fridays (Jummah), not
-- the normal 11:00/13:00 shift starts -- confirmed against actual punch
-- data (median first check-in ~14:30-15:00 company-wide on Fridays, but
-- ~11:00 at BASE FAISAL, same as any other day). Before this fix, Friday
-- lateness was still graded against the regular SHIFT_A/B starts (only
-- required_hours was ever adjusted for Friday, via
-- hrms_policy_settings.friday_hours_management/non_management), so nearly
-- the entire staff was marked Late (avg ~74min) or Half Day (avg
-- ~110-155min) every single Friday.
--
-- Adds a SHIFT_FRIDAY shift_definitions row (14:30-23:30) and applies it
-- within process_daily_attendance's and reclassify_attendance_row's
-- existing auto-detect branch (see auto_detect_shift_in_* migrations
-- above) whenever the day is a Friday and the employee's branch isn't
-- BASE FAISAL -- one fixed opening time that day, not the normal
-- check-in-time-based SHIFT_A/SHIFT_B split. Reprocessed Jan-Aug 2026.
-- =============================================================
INSERT INTO public.shift_definitions (shift_code, shift_name, start_time, end_time, crosses_midnight, scheduled_hours, is_active)
VALUES ('SHIFT_FRIDAY', 'Friday (Mart opens 2:30 PM)', '14:30:00', '23:30:00', false, 9, true)
ON CONFLICT (shift_code) DO UPDATE SET
  shift_name = excluded.shift_name,
  start_time = excluded.start_time,
  end_time = excluded.end_time,
  crosses_midnight = excluded.crosses_midnight,
  scheduled_hours = excluded.scheduled_hours,
  is_active = excluded.is_active;

CREATE OR REPLACE FUNCTION public.process_daily_attendance(p_from_date date, p_to_date date)
 RETURNS TABLE(processed_days integer, inserted_or_updated integer, needs_review_count integer, absent_count integer, half_day_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
 SET statement_timeout TO '5min'
AS $function$
declare
  v_employee record;
  v_day date;
  v_roster record;
  v_shift public.shift_definitions%rowtype;
  v_shift_code text;
  v_group text;
  v_required_hours numeric;
  v_day_required_hours numeric;
  v_friday_override numeric;
  v_start timestamp without time zone;
  v_end timestamp without time zone;
  v_win_start timestamp without time zone;
  v_win_end timestamp without time zone;
  v_first_in timestamp without time zone;
  v_last_out timestamp without time zone;
  v_punch_count integer;
  v_pos_first timestamp without time zone;
  v_pos_last timestamp without time zone;
  v_class record;
  v_source_locations text;
  v_rows integer := 0;
  v_days integer := 0;
  v_review integer := 0;
  v_absent integer := 0;
  v_half integer := 0;
  v_weekly_off boolean;
  v_gh boolean;
  v_day_type text;
  v_existing_locked boolean;
  v_auto_detect boolean;
  v_is_friday_late_open boolean;
  -- Tracks the last punch already claimed as a checkout by a previous day
  -- within this run, per employee. A punch just after midnight that closes
  -- out an overnight shift (e.g. 13:00 -> 00:54) sits inside both that
  -- day's window and the next day's window (windows intentionally overlap
  -- to tolerate early/late punches) -- without this, the same physical
  -- punch could be reused as the NEXT day's check-in too, producing a
  -- bogus ~20+ hour "shift" when paired with that day's real punch.
  v_prev_claimed_until timestamp without time zone;
begin
  if p_from_date is null or p_to_date is null or p_to_date < p_from_date then
    raise exception 'Invalid attendance processing date range';
  end if;

  perform public.refresh_zkt_punch_employee_mapping();

  for v_employee in
    select e.employee_code,
           e.zkt_employee_no,
           e.eligibility_group,
           e.assigned_shift_code,
           e.status,
           e.branch,
           e.joining_date,
           e.last_working_day,
           e.single_punch_ok
      from public.employees e
     where e.zkt_employee_no is not null
       and e.zkt_employee_no <> ''
       and (coalesce(e.status, 'Active') = 'Active' or e.last_working_day is not null)
  loop
    v_group := coalesce(nullif(v_employee.eligibility_group, ''), 'SALES_SUPPORT');
    select required_hours into v_required_hours
      from public.staff_eligibility_groups
     where code = v_group and is_active = true;

    if v_required_hours is null then
      continue;
    end if;

    v_prev_claimed_until := null;

    for v_day in select generate_series(p_from_date, p_to_date, interval '1 day')::date loop
      v_days := v_days + 1;

      if v_employee.joining_date is not null and v_day < v_employee.joining_date then
        continue;
      end if;

      if coalesce(v_employee.status, 'Active') <> 'Active'
         and v_employee.last_working_day is not null
         and v_day > v_employee.last_working_day then
        continue;
      end if;

      v_day_required_hours := v_required_hours;
      -- Every branch except BASE FAISAL opens at 14:30 on Fridays (Jummah),
      -- not the normal 11:00/13:00 shift starts -- confirmed against actual
      -- punch data (median first check-in ~14:30-15:00 company-wide on
      -- Fridays, but ~11:00 at BASE FAISAL, same as any other day).
      v_is_friday_late_open := extract(dow from v_day) = 5 and v_employee.branch is distinct from 'BASE FAISAL';
      if extract(dow from v_day) = 5 then
        select value::numeric into v_friday_override
          from public.hrms_policy_settings
         where key = case when v_group = 'MANAGEMENT_ADMIN' then 'friday_hours_management' else 'friday_hours_non_management' end
         limit 1;
        if v_friday_override is not null then
          v_day_required_hours := v_friday_override;
        end if;
      end if;

      select r.shift_code, r.is_weekly_off, r.is_gazetted_holiday, r.day_type
        into v_roster
        from public.employee_work_rosters r
       where r.employee_code = v_employee.employee_code
         and r.roster_date = v_day
       limit 1;

      v_weekly_off := coalesce(v_roster.is_weekly_off, false);
      v_gh := coalesce(v_roster.is_gazetted_holiday, exists(select 1 from public.gazetted_holidays g where g.holiday_date = v_day and g.is_active = true));
      v_day_type := coalesce(v_roster.day_type, case when v_weekly_off then 'Weekly Off' when v_gh then 'Gazetted Holiday' else 'Working Day' end);

      -- Shifts were never actually assigned per employee -- every active
      -- employee got bulk-defaulted to assigned_shift_code = SHIFT_A (or
      -- left null), which graded evening-pattern staff as chronically late
      -- against an 11:00 start they were never really scheduled for. Unless
      -- there's a genuine explicit override (a roster entry for this date,
      -- or an assigned_shift_code that isn't that blanket SHIFT_A default,
      -- e.g. a night guard's fixed shift), detect the day's shift from the
      -- employee's own actual first punch instead of assuming SHIFT_A.
      v_auto_detect := v_group <> 'MANAGEMENT_ADMIN'
        and v_roster.shift_code is null
        and (nullif(v_employee.assigned_shift_code, '') is null or v_employee.assigned_shift_code = 'SHIFT_A');

      if v_auto_detect then
        -- Wide window spanning both SHIFT_A's (07:00-05:30+1) and SHIFT_B's
        -- (09:00-07:30+1) original bounds, since which shift applies isn't
        -- known until the actual first punch is found below. Also covers
        -- SHIFT_FRIDAY's 14:30 start comfortably.
        v_win_start := v_day::timestamp + interval '7 hours';
        v_win_end := (v_day + 1)::timestamp + interval '7 hours 30 minutes';
      else
        v_shift_code := private.resolve_employee_shift(v_employee.employee_code, v_day, v_employee.assigned_shift_code);

        select * into v_shift from public.shift_definitions where shift_code = v_shift_code and is_active = true;
        if not found then
          v_shift.shift_code := v_shift_code;
          v_shift.start_time := '00:00'::time;
          v_shift.end_time := '00:00'::time;
          v_shift.scheduled_hours := v_day_required_hours;
          v_shift.crosses_midnight := false;
        end if;

        if v_group = 'MANAGEMENT_ADMIN' then
          v_start := null;
          v_end := null;
        else
          v_start := v_day::timestamp + v_shift.start_time;
          v_end := v_day::timestamp + v_shift.end_time;
          if v_shift.crosses_midnight or v_shift.end_time < v_shift.start_time then
            v_end := v_end + interval '1 day';
          end if;
        end if;

        v_win_start := case when v_start is null then v_day::timestamp else v_start - interval '4 hours' end;
        v_win_end := case when v_end is null then (v_day + 1)::timestamp + interval '6 hours' else v_end + interval '8 hours' end;
      end if;

      select
        min(p.punch_time) filter (where lower(coalesce(p.punch_status,'')) in ('c/in','in','check in','check-in','checkin')),
        max(p.punch_time) filter (where lower(coalesce(p.punch_status,'')) in ('c/out','out','check out','check-out','checkout')),
        string_agg(distinct coalesce(p.location_id,''), ',' order by coalesce(p.location_id,''))
      into v_first_in, v_last_out, v_source_locations
      from public.zkt_raw_punches p
      where p.employee_code = v_employee.employee_code
        and p.punch_time >= v_win_start and p.punch_time < v_win_end
        and p.punch_time > coalesce(v_prev_claimed_until, '-infinity'::timestamp);

      if v_first_in is null or v_last_out is null
         or (v_first_in is not null and v_last_out is not null and v_last_out < v_first_in) then
        select count(*), min(p.punch_time), max(p.punch_time)
          into v_punch_count, v_pos_first, v_pos_last
          from public.zkt_raw_punches p
         where p.employee_code = v_employee.employee_code
           and p.punch_time >= v_win_start and p.punch_time < v_win_end
           and p.punch_time > coalesce(v_prev_claimed_until, '-infinity'::timestamp);

        if v_punch_count >= 2 then
          v_first_in := v_pos_first;
          v_last_out := v_pos_last;
        end if;
      end if;

      if v_last_out is not null and v_first_in is not null and v_last_out < v_first_in then
        v_last_out := null;
      end if;

      if v_auto_detect then
        if v_is_friday_late_open then
          -- Whole Mart opens 14:30 on Fridays -- one fixed opening time,
          -- not the normal check-in-time-based SHIFT_A/SHIFT_B split.
          v_shift_code := 'SHIFT_FRIDAY';
        elsif v_first_in is null then
          v_shift_code := 'SHIFT_A';
        elsif v_first_in::time <= time '12:30' then
          v_shift_code := 'SHIFT_A';
        else
          v_shift_code := 'SHIFT_B';
        end if;

        select * into v_shift from public.shift_definitions where shift_code = v_shift_code and is_active = true;
        v_start := v_day::timestamp + v_shift.start_time;
        v_end := v_day::timestamp + v_shift.end_time;
        if v_shift.crosses_midnight or v_shift.end_time < v_shift.start_time then
          v_end := v_end + interval '1 day';
        end if;
      end if;

      select * into v_class
      from public.classify_attendance_day(
        v_group,
        v_day_required_hours,
        v_start,
        v_end,
        v_first_in,
        v_last_out,
        v_weekly_off,
        v_gh
      );

      if v_employee.single_punch_ok
         and (v_first_in is not null or v_last_out is not null)
         and v_class.worked_hours < v_day_required_hours then
        v_class.worked_hours := v_day_required_hours;
        v_class.attendance_status := 'Present';
        v_class.late_minutes := 0;
        v_class.early_out_minutes := 0;
        v_class.overtime_hours := 0;
        v_class.needs_review := false;
        v_class.exception_reason := null;
      end if;

      if v_first_in is not null and v_last_out is not null
         and (extract(epoch from (v_last_out - v_first_in)) / 3600.0) > 16 then
        v_class.needs_review := true;
        v_class.exception_reason := trim(both '; ' from coalesce(v_class.exception_reason || '; ', '') || 'Unusually long shift duration - please verify punches');
      end if;

      if v_last_out is not null then
        v_prev_claimed_until := v_last_out;
      end if;

      select exists(
        select 1 from public.attendance a
         where a.employee_code = v_employee.employee_code
           and a.work_date = v_day
           and coalesce(a.review_status,'') = 'Locked'
      ) into v_existing_locked;

      if not v_existing_locked then
        insert into public.attendance (
          employee_code, attendance_date, work_date, source, eligibility_group, shift_code,
          first_check_in, last_check_out, check_in, check_out, actual_hours,
          worked_hours, required_hours, short_hours,
          late_minutes, early_out_minutes, overtime_hours,
          extra_day_eligible, gh_eligible, is_weekly_off, is_gazetted_holiday,
          attendance_status, exception_reason, needs_review, calculated_at,
          zkt_location_id, review_status
        ) values (
          v_employee.employee_code, v_day, v_day, 'ZKT CSV', v_group, v_shift_code,
          v_first_in, v_last_out, v_first_in, v_last_out, v_class.worked_hours,
          v_class.worked_hours, v_day_required_hours,
          round(greatest(v_day_required_hours - v_class.worked_hours, 0)::numeric, 2),
          v_class.late_minutes, v_class.early_out_minutes, v_class.overtime_hours,
          v_class.extra_day_eligible, v_class.gh_eligible, v_weekly_off, v_gh,
          v_class.attendance_status, v_class.exception_reason, v_class.needs_review, now(),
          v_source_locations, case when v_class.needs_review then 'Pending Review' else 'Calculated' end
        )
        on conflict (employee_code, work_date) where employee_code is not null and work_date is not null
        do update set
          attendance_date = excluded.attendance_date,
          source = excluded.source,
          eligibility_group = excluded.eligibility_group,
          shift_code = excluded.shift_code,
          first_check_in = excluded.first_check_in,
          last_check_out = excluded.last_check_out,
          check_in = excluded.check_in,
          check_out = excluded.check_out,
          actual_hours = excluded.actual_hours,
          worked_hours = excluded.worked_hours,
          required_hours = excluded.required_hours,
          short_hours = excluded.short_hours,
          late_minutes = excluded.late_minutes,
          early_out_minutes = excluded.early_out_minutes,
          overtime_hours = excluded.overtime_hours,
          extra_day_eligible = excluded.extra_day_eligible,
          gh_eligible = excluded.gh_eligible,
          is_weekly_off = excluded.is_weekly_off,
          is_gazetted_holiday = excluded.is_gazetted_holiday,
          attendance_status = excluded.attendance_status,
          exception_reason = excluded.exception_reason,
          needs_review = excluded.needs_review,
          calculated_at = excluded.calculated_at,
          zkt_location_id = excluded.zkt_location_id,
          review_status = excluded.review_status;
        v_rows := v_rows + 1;
        if v_class.needs_review then v_review := v_review + 1; end if;
        if v_class.attendance_status = 'Absent' then v_absent := v_absent + 1; end if;
        if v_class.attendance_status = 'Half Day' then v_half := v_half + 1; end if;
      end if;
    end loop;
  end loop;

  return query select v_days, v_rows, v_review, v_absent, v_half;
end;
$function$;

CREATE OR REPLACE FUNCTION public.reclassify_attendance_row(p_attendance_id uuid)
 RETURNS attendance
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_att public.attendance%rowtype;
  v_emp record;
  v_group text;
  v_required_hours numeric;
  v_day_required_hours numeric;
  v_friday_override numeric;
  v_shift_code text;
  v_shift public.shift_definitions%rowtype;
  v_start timestamp without time zone;
  v_end timestamp without time zone;
  v_roster record;
  v_weekly_off boolean;
  v_gh boolean;
  v_auto_detect boolean;
  v_is_friday_late_open boolean;
  v_class record;
  v_needs_review boolean;
  v_exception_reason text;
begin
  select * into v_att from public.attendance where id = p_attendance_id;
  if not found then
    raise exception 'attendance row not found: %', p_attendance_id;
  end if;

  select e.eligibility_group, e.assigned_shift_code, e.branch into v_emp
    from public.employees e where e.employee_code = v_att.employee_code;

  v_group := coalesce(nullif(v_emp.eligibility_group, ''), 'SALES_SUPPORT');
  select required_hours into v_required_hours
    from public.staff_eligibility_groups where code = v_group and is_active = true;
  if v_required_hours is null then
    raise exception 'Attendance eligibility group not configured: %', v_group;
  end if;

  v_day_required_hours := v_required_hours;
  -- Every branch except BASE FAISAL opens at 14:30 on Fridays (Jummah), not
  -- the normal 11:00/13:00 shift starts -- see process_daily_attendance.
  v_is_friday_late_open := extract(dow from v_att.work_date) = 5 and v_emp.branch is distinct from 'BASE FAISAL';
  if extract(dow from v_att.work_date) = 5 then
    select value::numeric into v_friday_override
      from public.hrms_policy_settings
     where key = case when v_group = 'MANAGEMENT_ADMIN' then 'friday_hours_management' else 'friday_hours_non_management' end
     limit 1;
    if v_friday_override is not null then
      v_day_required_hours := v_friday_override;
    end if;
  end if;

  select r.shift_code, r.is_weekly_off, r.is_gazetted_holiday into v_roster
    from public.employee_work_rosters r
   where r.employee_code = v_att.employee_code and r.roster_date = v_att.work_date
   limit 1;
  v_weekly_off := coalesce(v_roster.is_weekly_off, false);
  v_gh := coalesce(v_roster.is_gazetted_holiday, exists(select 1 from public.gazetted_holidays g where g.holiday_date = v_att.work_date and g.is_active = true));

  v_auto_detect := v_group <> 'MANAGEMENT_ADMIN'
    and v_roster.shift_code is null
    and (nullif(v_emp.assigned_shift_code, '') is null or v_emp.assigned_shift_code = 'SHIFT_A');

  if v_auto_detect then
    if v_is_friday_late_open then
      v_shift_code := 'SHIFT_FRIDAY';
    elsif v_att.check_in is null then
      v_shift_code := 'SHIFT_A';
    elsif v_att.check_in::time <= time '12:30' then
      v_shift_code := 'SHIFT_A';
    else
      v_shift_code := 'SHIFT_B';
    end if;

    select * into v_shift from public.shift_definitions where shift_code = v_shift_code and is_active = true;
    v_start := v_att.work_date::timestamp + v_shift.start_time;
    v_end := v_att.work_date::timestamp + v_shift.end_time;
    if v_shift.crosses_midnight or v_shift.end_time < v_shift.start_time then
      v_end := v_end + interval '1 day';
    end if;
  else
    v_shift_code := private.resolve_employee_shift(v_att.employee_code, v_att.work_date, v_emp.assigned_shift_code);
    select * into v_shift from public.shift_definitions where shift_code = v_shift_code and is_active = true;
    if not found then
      v_shift.shift_code := v_shift_code;
      v_shift.start_time := '00:00'::time;
      v_shift.end_time := '00:00'::time;
      v_shift.crosses_midnight := false;
    end if;

    if v_group = 'MANAGEMENT_ADMIN' then
      v_start := null;
      v_end := null;
    else
      v_start := v_att.work_date::timestamp + v_shift.start_time;
      v_end := v_att.work_date::timestamp + v_shift.end_time;
      if v_shift.crosses_midnight or v_shift.end_time < v_shift.start_time then
        v_end := v_end + interval '1 day';
      end if;
    end if;
  end if;

  select * into v_class from public.classify_attendance_day(
    v_group, v_day_required_hours, v_start, v_end,
    v_att.check_in, v_att.check_out, v_weekly_off, v_gh
  );

  v_needs_review := v_class.needs_review;
  v_exception_reason := v_class.exception_reason;

  if v_att.check_in is not null and v_att.check_out is not null
     and (extract(epoch from (v_att.check_out - v_att.check_in)) / 3600.0) > 16 then
    v_needs_review := true;
    v_exception_reason := trim(both '; ' from coalesce(v_exception_reason || '; ', '') || 'Unusually long shift duration - please verify punches');
  end if;

  update public.attendance set
    required_hours = v_day_required_hours,
    worked_hours = v_class.worked_hours,
    actual_hours = v_class.worked_hours,
    short_hours = round(greatest(v_day_required_hours - v_class.worked_hours, 0)::numeric, 2),
    late_minutes = v_class.late_minutes,
    early_out_minutes = v_class.early_out_minutes,
    overtime_hours = v_class.overtime_hours,
    attendance_status = v_class.attendance_status,
    needs_review = v_needs_review,
    exception_reason = v_exception_reason,
    shift_code = v_shift_code,
    calculated_at = now()
  where id = p_attendance_id
  returning * into v_att;

  return v_att;
end;
$function$;
-- =============================================================

-- =============================================================
-- Migration: cap_weekly_off_at_4_per_month_exempt_mgmt_warehouse
-- Applied: 2026-08-20
-- generate_employee_work_rosters previously marked every occurrence of an
-- employee's weekly_off_day as Weekly Off with no limit -- in a 5-Sunday
-- (or 5-Wednesday etc.) calendar month that handed out a free 5th day off.
-- Company policy: every employee gets at most 4 unpaid weekly-off days per
-- calendar month; a 5th+ occurrence is a real absence. Management and
-- Warehouse-department staff are exempt (their fixed day off, almost
-- always Sunday, always counts). Occurrence counting is computed against
-- the whole calendar month even when called with a sub-month range (see
-- ZKTSync.jsx's manual date picker), so a partial-range call can't
-- undercount earlier occurrences that already used up the cap.
-- Reprocessed for July/August 2026 immediately after (see below).
-- =============================================================
CREATE OR REPLACE FUNCTION public.generate_employee_work_rosters(p_from_date date, p_to_date date)
 RETURNS TABLE(processed_days integer, weekly_off_rows integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
 SET statement_timeout TO '5min'
AS $function$
declare
  v_days integer := 0;
  v_rows integer := 0;
  v_month_from date;
  v_month_to date;
begin
  if p_from_date is null or p_to_date is null or p_to_date < p_from_date then
    raise exception 'Invalid roster generation date range';
  end if;

  v_month_from := date_trunc('month', p_from_date)::date;
  v_month_to := (date_trunc('month', p_to_date) + interval '1 month' - interval '1 day')::date;

  with day_series as (
    select generate_series(v_month_from, v_month_to, interval '1 day')::date as roster_date
  ), matches as (
    select e.employee_code, d.roster_date,
      (e.staff_level = 'Management' or e.department ilike '%warehouse%') as is_exempt,
      row_number() over (
        partition by e.employee_code, date_trunc('month', d.roster_date)
        order by d.roster_date
      ) as occurrence_in_month
    from public.employees e
    cross join day_series d
    where coalesce(e.status, 'Active') = 'Active'
      and e.weekly_off_day is not null
      and e.weekly_off_day <> ''
      and extract(dow from d.roster_date)::int = e.weekly_off_day::int
  ), capped as (
    select employee_code, roster_date
    from matches
    where is_exempt or occurrence_in_month <= 4
  ), upserted as (
    insert into public.employee_work_rosters (employee_code, roster_date, is_weekly_off, created_by)
    select employee_code, roster_date, true, 'weekly_off_generator'
    from capped
    where roster_date between p_from_date and p_to_date
    on conflict (employee_code, roster_date) do update set is_weekly_off = true
    returning 1
  ), decapped as (
    update public.employee_work_rosters r
    set is_weekly_off = false
    from matches m
    where r.employee_code = m.employee_code
      and r.roster_date = m.roster_date
      and r.roster_date between p_from_date and p_to_date
      and not m.is_exempt
      and m.occurrence_in_month > 4
      and r.is_weekly_off = true
    returning 1
  )
  select count(*) into v_rows from upserted;

  select count(distinct roster_date) into v_days
  from (select generate_series(p_from_date, p_to_date, interval '1 day')::date) as ds(roster_date);

  return query select v_days, v_rows;
end;
$function$;

-- Reprocessing run after the above (not part of the function itself):
--   select * from generate_employee_work_rosters('2026-07-01','2026-07-31');
--   select * from generate_employee_work_rosters('2026-08-01','2026-08-20');
--   select * from process_daily_attendance('2026-07-29','2026-07-30');
-- (July's 5th Wednesday/Thursday -- 07-29/07-30 -- were the only days that
-- lost the cap for non-exempt employees; August had no 5th occurrence yet.)
-- =============================================================

-- =============================================================
-- Migration: wire_half_day_late_exempt_into_classification +
--   pass_exempt_flags_through_process_and_reclassify
-- Applied: 2026-08-20
-- attendance.half_day_exempt / late_exempt already existed as a per-day
-- Timesheet toggle but were never actually read anywhere -- pure dead
-- flags. Adds the employee-level standing-policy version (Permissions tab)
-- and wires BOTH into classify_attendance_day: half_day_exempt keeps a day
-- from ever becoming "Half Day" (falls through to Late/Early Out/Present
-- instead); late_exempt keeps a day from ever becoming "Late" and zeroes
-- late_minutes (so payroll's late-penalty count skips it too). Added
-- half_day_exempt_applied/late_exempt_applied on attendance so the
-- Timesheet can show a visible badge when an exemption actually changed
-- the outcome, instead of silently downgrading with no trace.
--
-- process_daily_attendance and reclassify_attendance_row fetch the
-- employee-level half_day_exempt/late_exempt and OR them with the per-day
-- attendance.half_day_exempt/late_exempt (a manual Timesheet toggle set
-- directly on the row survives a bulk reprocess run, which otherwise
-- recomputes every row from raw punches with no memory of it), pass the
-- combined result into classify_attendance_day, and persist
-- half_day_exempt_applied/late_exempt_applied on the row.
--
-- Timesheet.jsx's toggleFlag() now calls reclassify_attendance_row via RPC
-- right after writing halfDayExempt/lateExempt, so the existing (till now
-- inert) per-day toggle actually changes the row's status/hours instead of
-- just flipping a flag nobody read.
-- =============================================================
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS half_day_exempt BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS late_exempt      BOOLEAN DEFAULT FALSE;

ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS half_day_exempt_applied BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS late_exempt_applied      BOOLEAN DEFAULT FALSE;

CREATE OR REPLACE FUNCTION public.classify_attendance_day(p_eligibility_group text, p_required_hours numeric, p_shift_start timestamp without time zone, p_shift_end timestamp without time zone, p_first_in timestamp without time zone, p_last_out timestamp without time zone, p_is_weekly_off boolean DEFAULT false, p_is_gazetted_holiday boolean DEFAULT false, p_half_day_exempt boolean DEFAULT false, p_late_exempt boolean DEFAULT false)
 RETURNS TABLE(attendance_status text, worked_hours numeric, late_minutes integer, early_out_minutes integer, overtime_hours numeric, needs_review boolean, exception_reason text, extra_day_eligible boolean, gh_eligible boolean, half_day_exempt_applied boolean, late_exempt_applied boolean)
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  r public.staff_eligibility_groups%rowtype;
  v_worked numeric := 0;
  v_late integer := 0;
  v_early integer := 0;
  v_ot numeric := 0;
  v_status text := 'Present';
  v_review boolean := false;
  v_reason text := null;
  v_half_day_exempt_applied boolean := false;
  v_late_exempt_applied boolean := false;
begin
  select * into r from public.staff_eligibility_groups where code = p_eligibility_group and is_active = true;
  if not found then
    raise exception 'Attendance eligibility group not configured: %', p_eligibility_group;
  end if;

  if p_first_in is null and p_last_out is null then
    v_status := case when p_is_weekly_off then 'Weekly Off' else r.no_punch_status end;
    return query select v_status, 0::numeric, 0, 0, 0::numeric, false, null::text,
      false,
      (p_is_gazetted_holiday and r.gazetted_holiday_eligible),
      false, false;
    return;
  end if;

  if p_first_in is null or p_last_out is null then
    v_status := r.missing_single_punch_status;
    v_review := true;
    v_reason := case when p_first_in is null then 'Missing check-in punch' else 'Missing check-out punch' end;
    return query select v_status, 0::numeric, 0, 0, 0::numeric, v_review, v_reason,
      (p_is_weekly_off and r.extra_days_eligible),
      (p_is_gazetted_holiday and r.gazetted_holiday_eligible),
      false, false;
    return;
  end if;

  v_worked := round((extract(epoch from (p_last_out - p_first_in)) / 3600.0)::numeric, 2);
  if v_worked < 0 then
    v_status := 'Review';
    v_review := true;
    v_reason := 'Check-out is earlier than check-in';
    return query select v_status, v_worked, 0, 0, 0::numeric, v_review, v_reason,
      (p_is_weekly_off and r.extra_days_eligible),
      (p_is_gazetted_holiday and r.gazetted_holiday_eligible),
      false, false;
    return;
  end if;

  if r.min_present_hours is not null and v_worked < r.min_present_hours then
    v_status := case when p_is_weekly_off then 'Weekly Off' else 'Absent' end;
    v_reason := format('Worked hours (%sh) below minimum required presence (%sh)', v_worked, r.min_present_hours);
    return query select v_status, v_worked, 0, 0, 0::numeric, false, v_reason,
      false,
      (p_is_gazetted_holiday and r.gazetted_holiday_eligible),
      false, false;
    return;
  end if;

  if r.overtime_eligible and v_worked > p_required_hours then
    v_ot := round(v_worked - p_required_hours, 2);
  end if;

  if not r.apply_late_rules and not r.apply_early_out_rules and not r.apply_half_day_variance_rules then
    v_status := case when v_worked >= p_required_hours then 'Present' else 'Short Hours' end;
    v_review := v_worked < p_required_hours;
    v_reason := case when v_review then 'Required hours not completed' else null end;
    return query select v_status, v_worked, 0, 0, v_ot, v_review, v_reason,
      (p_is_weekly_off and r.extra_days_eligible),
      (p_is_gazetted_holiday and r.gazetted_holiday_eligible),
      false, false;
    return;
  end if;

  if p_shift_start is not null then
    v_late := greatest(0, floor(extract(epoch from (p_first_in - p_shift_start)) / 60)::integer - r.grace_minutes);
  end if;
  if p_shift_end is not null then
    v_early := greatest(0, floor(extract(epoch from (p_shift_end - p_last_out)) / 60)::integer);
  end if;

  if p_late_exempt and v_late > 0 then
    v_late_exempt_applied := true;
    v_reason := format('Late Exempt applied (was %s min late)', v_late);
    v_late := 0;
  end if;

  if r.apply_half_day_variance_rules and (v_late > r.half_day_threshold_minutes or v_early > r.half_day_threshold_minutes) then
    if p_half_day_exempt then
      v_half_day_exempt_applied := true;
      v_reason := trim(both '; ' from coalesce(v_reason || '; ', '') || format('Half Day Exempt applied (late %s min, early-out %s min)', v_late, v_early));
      if r.apply_late_rules and v_late > 0 then
        v_status := 'Late';
      elsif r.apply_early_out_rules and v_early > 0 then
        v_status := 'Early Out';
      else
        v_status := 'Present';
      end if;
    else
      v_status := 'Half Day';
    end if;
  elsif r.apply_late_rules and v_late > 0 then
    v_status := 'Late';
  elsif r.apply_early_out_rules and v_early > 0 then
    v_status := 'Early Out';
  else
    v_status := 'Present';
  end if;

  return query select v_status, v_worked, v_late, v_early, v_ot, false, v_reason,
    (p_is_weekly_off and r.extra_days_eligible),
    (p_is_gazetted_holiday and r.gazetted_holiday_eligible),
    v_half_day_exempt_applied, v_late_exempt_applied;
end;
$function$;
--
-- process_daily_attendance and reclassify_attendance_row were also updated
-- (v_employee/v_emp selects gained half_day_exempt, late_exempt; effective
-- exempt flags OR the employee-level columns with the existing row's own
-- half_day_exempt/late_exempt; passed into classify_attendance_day; insert/
-- update gained half_day_exempt_applied, late_exempt_applied) -- full
-- bodies are long and otherwise unchanged in control flow, see live DB
-- (pg_get_functiondef) or git history for the complete text.
-- =============================================================

-- =============================================================
-- Migration: half_day_120min_threshold_and_hours_band
-- Applied: 2026-08-21
-- Policy decision: someone who clocks in >90min late but stays to complete
-- their full required hours was getting marked "Half Day" purely off the
-- late-in minutes, even though they worked a full day -- the late/early-out
-- minutes check ran with no awareness of total hours worked. Finalized:
--   - Absent floor stays: worked < 5.5h (min_present_hours, unchanged)
--   - Half Day (non-Friday): worked hours in [5.5h, 8.5h) triggers Half Day
--     outright, regardless of late/early minutes -- OR late-in/early-out
--     minutes exceed 120 (raised from 90) -- whichever fires first
--   - Friday keeps the OLD rule untouched: 90min threshold only, no hours
--     band (Friday's required hours are already reduced for Jummah, so an
--     8.5h-style band doesn't apply)
--   - half_day_exempt (employee/day waiver) covers BOTH triggers the same
--     way it already covered the old minutes-only trigger
-- Only applies where apply_half_day_variance_rules is true, i.e.
-- SALES_SUPPORT and FLOOR_MANAGEMENT (both 10.5h required). MANAGEMENT_ADMIN
-- untouched (half-day variance rules already off for that group).
--
-- staff_eligibility_groups.half_day_threshold_minutes is repurposed to mean
-- "non-Friday threshold" going forward (90 -> 120 for the two groups); new
-- half_day_threshold_minutes_friday preserves the old 90 for Fridays; new
-- half_day_max_hours (8.5 for the two groups, null elsewhere/Friday) is the
-- new hours-band ceiling.
-- =============================================================
ALTER TABLE public.staff_eligibility_groups
  ADD COLUMN IF NOT EXISTS half_day_threshold_minutes_friday numeric,
  ADD COLUMN IF NOT EXISTS half_day_max_hours numeric;

UPDATE public.staff_eligibility_groups
   SET half_day_threshold_minutes_friday = half_day_threshold_minutes
 WHERE half_day_threshold_minutes_friday IS NULL;

UPDATE public.staff_eligibility_groups
   SET half_day_threshold_minutes = 120,
       half_day_max_hours = 8.5
 WHERE code IN ('SALES_SUPPORT','FLOOR_MANAGEMENT');

CREATE OR REPLACE FUNCTION public.classify_attendance_day(p_eligibility_group text, p_required_hours numeric, p_shift_start timestamp without time zone, p_shift_end timestamp without time zone, p_first_in timestamp without time zone, p_last_out timestamp without time zone, p_is_weekly_off boolean DEFAULT false, p_is_gazetted_holiday boolean DEFAULT false, p_half_day_exempt boolean DEFAULT false, p_late_exempt boolean DEFAULT false, p_is_friday boolean DEFAULT false)
 RETURNS TABLE(attendance_status text, worked_hours numeric, late_minutes integer, early_out_minutes integer, overtime_hours numeric, needs_review boolean, exception_reason text, extra_day_eligible boolean, gh_eligible boolean, half_day_exempt_applied boolean, late_exempt_applied boolean)
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  r public.staff_eligibility_groups%rowtype;
  v_worked numeric := 0;
  v_late integer := 0;
  v_early integer := 0;
  v_ot numeric := 0;
  v_status text := 'Present';
  v_review boolean := false;
  v_reason text := null;
  v_half_day_exempt_applied boolean := false;
  v_late_exempt_applied boolean := false;
  v_half_day_threshold integer;
  v_half_day_max_hours numeric;
begin
  select * into r from public.staff_eligibility_groups where code = p_eligibility_group and is_active = true;
  if not found then
    raise exception 'Attendance eligibility group not configured: %', p_eligibility_group;
  end if;

  if p_first_in is null and p_last_out is null then
    v_status := case when p_is_weekly_off then 'Weekly Off' else r.no_punch_status end;
    return query select v_status, 0::numeric, 0, 0, 0::numeric, false, null::text,
      false,
      (p_is_gazetted_holiday and r.gazetted_holiday_eligible),
      false, false;
    return;
  end if;

  if p_first_in is null or p_last_out is null then
    v_status := r.missing_single_punch_status;
    v_review := true;
    v_reason := case when p_first_in is null then 'Missing check-in punch' else 'Missing check-out punch' end;
    return query select v_status, 0::numeric, 0, 0, 0::numeric, v_review, v_reason,
      (p_is_weekly_off and r.extra_days_eligible),
      (p_is_gazetted_holiday and r.gazetted_holiday_eligible),
      false, false;
    return;
  end if;

  v_worked := round((extract(epoch from (p_last_out - p_first_in)) / 3600.0)::numeric, 2);
  if v_worked < 0 then
    v_status := 'Review';
    v_review := true;
    v_reason := 'Check-out is earlier than check-in';
    return query select v_status, v_worked, 0, 0, 0::numeric, v_review, v_reason,
      (p_is_weekly_off and r.extra_days_eligible),
      (p_is_gazetted_holiday and r.gazetted_holiday_eligible),
      false, false;
    return;
  end if;

  if r.min_present_hours is not null and v_worked < r.min_present_hours then
    v_status := case when p_is_weekly_off then 'Weekly Off' else 'Absent' end;
    v_reason := format('Worked hours (%sh) below minimum required presence (%sh)', v_worked, r.min_present_hours);
    return query select v_status, v_worked, 0, 0, 0::numeric, false, v_reason,
      false,
      (p_is_gazetted_holiday and r.gazetted_holiday_eligible),
      false, false;
    return;
  end if;

  if r.overtime_eligible and v_worked > p_required_hours then
    v_ot := round(v_worked - p_required_hours, 2);
  end if;

  if not r.apply_late_rules and not r.apply_early_out_rules and not r.apply_half_day_variance_rules then
    v_status := case when v_worked >= p_required_hours then 'Present' else 'Short Hours' end;
    v_review := v_worked < p_required_hours;
    v_reason := case when v_review then 'Required hours not completed' else null end;
    return query select v_status, v_worked, 0, 0, v_ot, v_review, v_reason,
      (p_is_weekly_off and r.extra_days_eligible),
      (p_is_gazetted_holiday and r.gazetted_holiday_eligible),
      false, false;
    return;
  end if;

  if p_shift_start is not null then
    v_late := greatest(0, floor(extract(epoch from (p_first_in - p_shift_start)) / 60)::integer - r.grace_minutes);
  end if;
  if p_shift_end is not null then
    v_early := greatest(0, floor(extract(epoch from (p_shift_end - p_last_out)) / 60)::integer);
  end if;

  if p_late_exempt and v_late > 0 then
    v_late_exempt_applied := true;
    v_reason := format('Late Exempt applied (was %s min late)', v_late);
    v_late := 0;
  end if;

  -- Half Day trigger: late-in/early-out beyond the group's threshold, OR
  -- (non-Friday only) worked hours falling in the group's Half Day band
  -- (>= min_present_hours floor, < half_day_max_hours). Friday keeps the
  -- old minutes-only rule at its own threshold and never applies the hours
  -- band, since Friday required hours are already reduced for Jummah.
  v_half_day_threshold := coalesce(
    case when p_is_friday then r.half_day_threshold_minutes_friday else r.half_day_threshold_minutes end,
    r.half_day_threshold_minutes
  );
  v_half_day_max_hours := case when p_is_friday then null else r.half_day_max_hours end;

  if r.apply_half_day_variance_rules and (
       v_late > v_half_day_threshold or v_early > v_half_day_threshold
       or (v_half_day_max_hours is not null and v_worked < v_half_day_max_hours)
     ) then
    if p_half_day_exempt then
      v_half_day_exempt_applied := true;
      v_reason := trim(both '; ' from coalesce(v_reason || '; ', '') || format('Half Day Exempt applied (late %s min, early-out %s min)', v_late, v_early));
      if r.apply_late_rules and v_late > 0 then
        v_status := 'Late';
      elsif r.apply_early_out_rules and v_early > 0 then
        v_status := 'Early Out';
      else
        v_status := 'Present';
      end if;
    else
      v_status := 'Half Day';
    end if;
  elsif r.apply_late_rules and v_late > 0 then
    v_status := 'Late';
  elsif r.apply_early_out_rules and v_early > 0 then
    v_status := 'Early Out';
  else
    v_status := 'Present';
  end if;

  return query select v_status, v_worked, v_late, v_early, v_ot, false, v_reason,
    (p_is_weekly_off and r.extra_days_eligible),
    (p_is_gazetted_holiday and r.gazetted_holiday_eligible),
    v_half_day_exempt_applied, v_late_exempt_applied;
end;
$function$;

-- process_daily_attendance and reclassify_attendance_row: both gained an
-- 11th positional arg on their classify_attendance_day call --
-- `extract(dow from v_day) = 5` / `extract(dow from v_att.work_date) = 5`
-- respectively (both functions already computed this exact expression
-- inline for the existing Friday-hours-override logic, just not passed
-- through before). No other change to either function body.
--
-- Reprocessing run after the above (not part of the function itself) --
-- reclassified every SALES_SUPPORT/FLOOR_MANAGEMENT attendance row from
-- 2026-07-01 onward (earliest month payroll is tracking; no Published
-- months existed yet, so nothing was skipped):
--   select id from attendance where work_date >= '2026-07-01'
--     and eligibility_group in ('SALES_SUPPORT','FLOOR_MANAGEMENT')
--   -- then reclassify_attendance_row(id) per row, ~18.5k rows total
-- =============================================================

-- =============================================================
-- Migration: friday_half_day_same_formula
-- Applied: 2026-08-21
-- Extends the above migration's rule to Friday, on explicit user decision
-- ("same formula as weekdays"): Friday required hours drop to 9h for
-- SALES_SUPPORT/FLOOR_MANAGEMENT (Jummah, SHIFT_FRIDAY 14:30-23:30), so its
-- Half Day band/threshold are scaled the same way (required_hours - 2h
-- ceiling) rather than reusing the non-Friday 8.5h band verbatim:
--   - half_day_threshold_minutes_friday: 90 -> 120 (matches non-Friday)
--   - half_day_max_hours_friday (new column): 7 (= 9h required - 2h, vs
--     non-Friday's 8.5h = 10.5h required - 2h)
-- Only classify_attendance_day's half-day-max-hours lookup changed (now
-- reads half_day_max_hours_friday instead of always nulling out the hours
-- band on Fridays) -- the threshold-minutes lookup already branched on
-- p_is_friday from the prior migration, so no logic changed there, only
-- the column value.
-- =============================================================
ALTER TABLE public.staff_eligibility_groups
  ADD COLUMN IF NOT EXISTS half_day_max_hours_friday numeric;

UPDATE public.staff_eligibility_groups
   SET half_day_threshold_minutes_friday = 120,
       half_day_max_hours_friday = 7
 WHERE code IN ('SALES_SUPPORT','FLOOR_MANAGEMENT');

CREATE OR REPLACE FUNCTION public.classify_attendance_day(p_eligibility_group text, p_required_hours numeric, p_shift_start timestamp without time zone, p_shift_end timestamp without time zone, p_first_in timestamp without time zone, p_last_out timestamp without time zone, p_is_weekly_off boolean DEFAULT false, p_is_gazetted_holiday boolean DEFAULT false, p_half_day_exempt boolean DEFAULT false, p_late_exempt boolean DEFAULT false, p_is_friday boolean DEFAULT false)
 RETURNS TABLE(attendance_status text, worked_hours numeric, late_minutes integer, early_out_minutes integer, overtime_hours numeric, needs_review boolean, exception_reason text, extra_day_eligible boolean, gh_eligible boolean, half_day_exempt_applied boolean, late_exempt_applied boolean)
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  r public.staff_eligibility_groups%rowtype;
  v_worked numeric := 0;
  v_late integer := 0;
  v_early integer := 0;
  v_ot numeric := 0;
  v_status text := 'Present';
  v_review boolean := false;
  v_reason text := null;
  v_half_day_exempt_applied boolean := false;
  v_late_exempt_applied boolean := false;
  v_half_day_threshold integer;
  v_half_day_max_hours numeric;
begin
  select * into r from public.staff_eligibility_groups where code = p_eligibility_group and is_active = true;
  if not found then
    raise exception 'Attendance eligibility group not configured: %', p_eligibility_group;
  end if;

  if p_first_in is null and p_last_out is null then
    v_status := case when p_is_weekly_off then 'Weekly Off' else r.no_punch_status end;
    return query select v_status, 0::numeric, 0, 0, 0::numeric, false, null::text,
      false,
      (p_is_gazetted_holiday and r.gazetted_holiday_eligible),
      false, false;
    return;
  end if;

  if p_first_in is null or p_last_out is null then
    v_status := r.missing_single_punch_status;
    v_review := true;
    v_reason := case when p_first_in is null then 'Missing check-in punch' else 'Missing check-out punch' end;
    return query select v_status, 0::numeric, 0, 0, 0::numeric, v_review, v_reason,
      (p_is_weekly_off and r.extra_days_eligible),
      (p_is_gazetted_holiday and r.gazetted_holiday_eligible),
      false, false;
    return;
  end if;

  v_worked := round((extract(epoch from (p_last_out - p_first_in)) / 3600.0)::numeric, 2);
  if v_worked < 0 then
    v_status := 'Review';
    v_review := true;
    v_reason := 'Check-out is earlier than check-in';
    return query select v_status, v_worked, 0, 0, 0::numeric, v_review, v_reason,
      (p_is_weekly_off and r.extra_days_eligible),
      (p_is_gazetted_holiday and r.gazetted_holiday_eligible),
      false, false;
    return;
  end if;

  if r.min_present_hours is not null and v_worked < r.min_present_hours then
    v_status := case when p_is_weekly_off then 'Weekly Off' else 'Absent' end;
    v_reason := format('Worked hours (%sh) below minimum required presence (%sh)', v_worked, r.min_present_hours);
    return query select v_status, v_worked, 0, 0, 0::numeric, false, v_reason,
      false,
      (p_is_gazetted_holiday and r.gazetted_holiday_eligible),
      false, false;
    return;
  end if;

  if r.overtime_eligible and v_worked > p_required_hours then
    v_ot := round(v_worked - p_required_hours, 2);
  end if;

  if not r.apply_late_rules and not r.apply_early_out_rules and not r.apply_half_day_variance_rules then
    v_status := case when v_worked >= p_required_hours then 'Present' else 'Short Hours' end;
    v_review := v_worked < p_required_hours;
    v_reason := case when v_review then 'Required hours not completed' else null end;
    return query select v_status, v_worked, 0, 0, v_ot, v_review, v_reason,
      (p_is_weekly_off and r.extra_days_eligible),
      (p_is_gazetted_holiday and r.gazetted_holiday_eligible),
      false, false;
    return;
  end if;

  if p_shift_start is not null then
    v_late := greatest(0, floor(extract(epoch from (p_first_in - p_shift_start)) / 60)::integer - r.grace_minutes);
  end if;
  if p_shift_end is not null then
    v_early := greatest(0, floor(extract(epoch from (p_shift_end - p_last_out)) / 60)::integer);
  end if;

  if p_late_exempt and v_late > 0 then
    v_late_exempt_applied := true;
    v_reason := format('Late Exempt applied (was %s min late)', v_late);
    v_late := 0;
  end if;

  -- Half Day trigger: late-in/early-out beyond the group's threshold, OR
  -- worked hours falling in the group's Half Day band (>= min_present_hours
  -- floor, < half_day_max_hours). Friday uses its own threshold/band
  -- (shorter required hours for Jummah) via the *_friday columns; both
  -- follow the same formula (required_hours - 2h ceiling), just scaled.
  v_half_day_threshold := coalesce(
    case when p_is_friday then r.half_day_threshold_minutes_friday else r.half_day_threshold_minutes end,
    r.half_day_threshold_minutes
  );
  v_half_day_max_hours := case when p_is_friday then r.half_day_max_hours_friday else r.half_day_max_hours end;

  if r.apply_half_day_variance_rules and (
       v_late > v_half_day_threshold or v_early > v_half_day_threshold
       or (v_half_day_max_hours is not null and v_worked < v_half_day_max_hours)
     ) then
    if p_half_day_exempt then
      v_half_day_exempt_applied := true;
      v_reason := trim(both '; ' from coalesce(v_reason || '; ', '') || format('Half Day Exempt applied (late %s min, early-out %s min)', v_late, v_early));
      if r.apply_late_rules and v_late > 0 then
        v_status := 'Late';
      elsif r.apply_early_out_rules and v_early > 0 then
        v_status := 'Early Out';
      else
        v_status := 'Present';
      end if;
    else
      v_status := 'Half Day';
    end if;
  elsif r.apply_late_rules and v_late > 0 then
    v_status := 'Late';
  elsif r.apply_early_out_rules and v_early > 0 then
    v_status := 'Early Out';
  else
    v_status := 'Present';
  end if;

  return query select v_status, v_worked, v_late, v_early, v_ot, false, v_reason,
    (p_is_weekly_off and r.extra_days_eligible),
    (p_is_gazetted_holiday and r.gazetted_holiday_eligible),
    v_half_day_exempt_applied, v_late_exempt_applied;
end;
$function$;

-- Reprocessing run after the above (not part of the function itself) --
-- reclassified Friday-only rows for SALES_SUPPORT/FLOOR_MANAGEMENT from
-- 2026-07-01 onward (the rest of the week's rows were already correct
-- under the prior migration's non-Friday rule):
--   select id from attendance where work_date >= '2026-07-01'
--     and eligibility_group in ('SALES_SUPPORT','FLOOR_MANAGEMENT')
--     and extract(dow from work_date) = 5
--   -- then reclassify_attendance_row(id) per row
-- =============================================================

-- =============================================================
-- Migration: friday_half_day_band_4_5_to_7
-- Applied: 2026-08-21
-- User explicitly overrode the derived 5.5-7h Friday band down to 4.5-7h
-- (the 4.5h floor is a direct number from the user, not derived from any
-- formula this time). Since the Half Day band's lower bound IS the Absent
-- floor, this means the Absent floor itself now differs by day for these
-- two groups: 4.5h on Friday vs 5.5h every other day. Added
-- min_present_hours_friday (new column, separate from the existing
-- day-agnostic min_present_hours) and made the Absent-floor check in
-- classify_attendance_day read the Friday-specific value on Fridays.
-- half_day_max_hours_friday stays 7 (unchanged from the prior migration).
-- =============================================================
ALTER TABLE public.staff_eligibility_groups
  ADD COLUMN IF NOT EXISTS min_present_hours_friday numeric;

UPDATE public.staff_eligibility_groups
   SET min_present_hours_friday = 4.5
 WHERE code IN ('SALES_SUPPORT','FLOOR_MANAGEMENT');

CREATE OR REPLACE FUNCTION public.classify_attendance_day(p_eligibility_group text, p_required_hours numeric, p_shift_start timestamp without time zone, p_shift_end timestamp without time zone, p_first_in timestamp without time zone, p_last_out timestamp without time zone, p_is_weekly_off boolean DEFAULT false, p_is_gazetted_holiday boolean DEFAULT false, p_half_day_exempt boolean DEFAULT false, p_late_exempt boolean DEFAULT false, p_is_friday boolean DEFAULT false)
 RETURNS TABLE(attendance_status text, worked_hours numeric, late_minutes integer, early_out_minutes integer, overtime_hours numeric, needs_review boolean, exception_reason text, extra_day_eligible boolean, gh_eligible boolean, half_day_exempt_applied boolean, late_exempt_applied boolean)
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  r public.staff_eligibility_groups%rowtype;
  v_worked numeric := 0;
  v_late integer := 0;
  v_early integer := 0;
  v_ot numeric := 0;
  v_status text := 'Present';
  v_review boolean := false;
  v_reason text := null;
  v_half_day_exempt_applied boolean := false;
  v_late_exempt_applied boolean := false;
  v_half_day_threshold integer;
  v_half_day_max_hours numeric;
  v_min_present_hours numeric;
begin
  select * into r from public.staff_eligibility_groups where code = p_eligibility_group and is_active = true;
  if not found then
    raise exception 'Attendance eligibility group not configured: %', p_eligibility_group;
  end if;

  if p_first_in is null and p_last_out is null then
    v_status := case when p_is_weekly_off then 'Weekly Off' else r.no_punch_status end;
    return query select v_status, 0::numeric, 0, 0, 0::numeric, false, null::text,
      false,
      (p_is_gazetted_holiday and r.gazetted_holiday_eligible),
      false, false;
    return;
  end if;

  if p_first_in is null or p_last_out is null then
    v_status := r.missing_single_punch_status;
    v_review := true;
    v_reason := case when p_first_in is null then 'Missing check-in punch' else 'Missing check-out punch' end;
    return query select v_status, 0::numeric, 0, 0, 0::numeric, v_review, v_reason,
      (p_is_weekly_off and r.extra_days_eligible),
      (p_is_gazetted_holiday and r.gazetted_holiday_eligible),
      false, false;
    return;
  end if;

  v_worked := round((extract(epoch from (p_last_out - p_first_in)) / 3600.0)::numeric, 2);
  if v_worked < 0 then
    v_status := 'Review';
    v_review := true;
    v_reason := 'Check-out is earlier than check-in';
    return query select v_status, v_worked, 0, 0, 0::numeric, v_review, v_reason,
      (p_is_weekly_off and r.extra_days_eligible),
      (p_is_gazetted_holiday and r.gazetted_holiday_eligible),
      false, false;
    return;
  end if;

  -- Absent floor: Friday uses its own (lower) floor since Friday's Half
  -- Day band starts lower too (4.5h vs weekday's 5.5h) -- see
  -- min_present_hours_friday / half_day_max_hours_friday below.
  v_min_present_hours := case when p_is_friday then coalesce(r.min_present_hours_friday, r.min_present_hours) else r.min_present_hours end;

  if v_min_present_hours is not null and v_worked < v_min_present_hours then
    v_status := case when p_is_weekly_off then 'Weekly Off' else 'Absent' end;
    v_reason := format('Worked hours (%sh) below minimum required presence (%sh)', v_worked, v_min_present_hours);
    return query select v_status, v_worked, 0, 0, 0::numeric, false, v_reason,
      false,
      (p_is_gazetted_holiday and r.gazetted_holiday_eligible),
      false, false;
    return;
  end if;

  if r.overtime_eligible and v_worked > p_required_hours then
    v_ot := round(v_worked - p_required_hours, 2);
  end if;

  if not r.apply_late_rules and not r.apply_early_out_rules and not r.apply_half_day_variance_rules then
    v_status := case when v_worked >= p_required_hours then 'Present' else 'Short Hours' end;
    v_review := v_worked < p_required_hours;
    v_reason := case when v_review then 'Required hours not completed' else null end;
    return query select v_status, v_worked, 0, 0, v_ot, v_review, v_reason,
      (p_is_weekly_off and r.extra_days_eligible),
      (p_is_gazetted_holiday and r.gazetted_holiday_eligible),
      false, false;
    return;
  end if;

  if p_shift_start is not null then
    v_late := greatest(0, floor(extract(epoch from (p_first_in - p_shift_start)) / 60)::integer - r.grace_minutes);
  end if;
  if p_shift_end is not null then
    v_early := greatest(0, floor(extract(epoch from (p_shift_end - p_last_out)) / 60)::integer);
  end if;

  if p_late_exempt and v_late > 0 then
    v_late_exempt_applied := true;
    v_reason := format('Late Exempt applied (was %s min late)', v_late);
    v_late := 0;
  end if;

  -- Half Day trigger: late-in/early-out beyond the group's threshold, OR
  -- worked hours falling in the group's Half Day band (>= the day's
  -- min-present floor, < half_day_max_hours). Friday uses its own
  -- threshold/band/floor (shorter required hours for Jummah) via the
  -- *_friday columns.
  v_half_day_threshold := coalesce(
    case when p_is_friday then r.half_day_threshold_minutes_friday else r.half_day_threshold_minutes end,
    r.half_day_threshold_minutes
  );
  v_half_day_max_hours := case when p_is_friday then r.half_day_max_hours_friday else r.half_day_max_hours end;

  if r.apply_half_day_variance_rules and (
       v_late > v_half_day_threshold or v_early > v_half_day_threshold
       or (v_half_day_max_hours is not null and v_worked < v_half_day_max_hours)
     ) then
    if p_half_day_exempt then
      v_half_day_exempt_applied := true;
      v_reason := trim(both '; ' from coalesce(v_reason || '; ', '') || format('Half Day Exempt applied (late %s min, early-out %s min)', v_late, v_early));
      if r.apply_late_rules and v_late > 0 then
        v_status := 'Late';
      elsif r.apply_early_out_rules and v_early > 0 then
        v_status := 'Early Out';
      else
        v_status := 'Present';
      end if;
    else
      v_status := 'Half Day';
    end if;
  elsif r.apply_late_rules and v_late > 0 then
    v_status := 'Late';
  elsif r.apply_early_out_rules and v_early > 0 then
    v_status := 'Early Out';
  else
    v_status := 'Present';
  end if;

  return query select v_status, v_worked, v_late, v_early, v_ot, false, v_reason,
    (p_is_weekly_off and r.extra_days_eligible),
    (p_is_gazetted_holiday and r.gazetted_holiday_eligible),
    v_half_day_exempt_applied, v_late_exempt_applied;
end;
$function$;

-- Reprocessing run after the above (not part of the function itself) --
-- reclassified Friday-only rows for SALES_SUPPORT/FLOOR_MANAGEMENT from
-- 2026-07-01 onward (same query as the prior migration's Friday rerun).
-- =============================================================

-- =============================================================
-- Migration: fix_duplicate_punch_pairing_fallback
-- Applied: 2026-08-22
--
-- Bug: when the strict punch_status label filter (c/in / c/out) found a
-- real check-in but genuinely no check-out at all, process_daily_attendance
-- fell back to pairing the earliest and latest raw punch in the window
-- *regardless of label*, discarding the already-good labeled check-in.
-- If the only other punches were the SAME physical swipe logged twice a few
-- seconds apart by the ZKT ingestion (both still labeled "C/In", no C/Out
-- anywhere), that fallback paired them as if they were a real in/out pair --
-- producing a bogus "worked 0.00h" day, which then fell through the
-- min_present_hours floor as Absent instead of the correct
-- missing_single_punch_status ("Half Day"). Confirmed against employees
-- 1169 and 2082, July 2026: both had only duplicate C/In punches 2-4
-- seconds apart with zero C/Out punches that day.
--
-- Fix: the positional (unlabeled) fallback now only fires when NEITHER end
-- was resolved by punch_status label -- i.e. the device gave us nothing
-- usable at all. If one end (e.g. check-in) already matched a real label,
-- a genuinely missing counterpart stays null and is handled correctly by
-- the missing_single_punch_status branch, instead of being fabricated from
-- an unrelated/duplicate same-type punch.
--
-- Reprocessed 2026-07-01 through 2026-08-22 after applying this fix.
-- =============================================================
CREATE OR REPLACE FUNCTION public.process_daily_attendance(p_from_date date, p_to_date date)
 RETURNS TABLE(processed_days integer, inserted_or_updated integer, needs_review_count integer, absent_count integer, half_day_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
 SET statement_timeout TO '5min'
AS $function$
declare
  v_employee record;
  v_day date;
  v_roster record;
  v_shift public.shift_definitions%rowtype;
  v_shift_code text;
  v_group text;
  v_required_hours numeric;
  v_day_required_hours numeric;
  v_friday_override numeric;
  v_start timestamp without time zone;
  v_end timestamp without time zone;
  v_win_start timestamp without time zone;
  v_win_end timestamp without time zone;
  v_first_in timestamp without time zone;
  v_last_out timestamp without time zone;
  v_punch_count integer;
  v_pos_first timestamp without time zone;
  v_pos_last timestamp without time zone;
  v_class record;
  v_source_locations text;
  v_rows integer := 0;
  v_days integer := 0;
  v_review integer := 0;
  v_absent integer := 0;
  v_half integer := 0;
  v_weekly_off boolean;
  v_gh boolean;
  v_day_type text;
  v_existing_locked boolean;
  v_existing_half_exempt boolean;
  v_existing_late_exempt boolean;
  v_eff_half_exempt boolean;
  v_eff_late_exempt boolean;
  v_auto_detect boolean;
  v_is_friday_late_open boolean;
  -- Tracks the last punch already claimed as a checkout by a previous day
  -- within this run, per employee. A punch just after midnight that closes
  -- out an overnight shift (e.g. 13:00 -> 00:54) sits inside both that
  -- day's window and the next day's window (windows intentionally overlap
  -- to tolerate early/late punches) -- without this, the same physical
  -- punch could be reused as the NEXT day's check-in too, producing a
  -- bogus ~20+ hour "shift" when paired with that day's real punch.
  v_prev_claimed_until timestamp without time zone;
begin
  if p_from_date is null or p_to_date is null or p_to_date < p_from_date then
    raise exception 'Invalid attendance processing date range';
  end if;

  perform public.refresh_zkt_punch_employee_mapping();

  for v_employee in
    select e.employee_code,
           e.zkt_employee_no,
           e.eligibility_group,
           e.assigned_shift_code,
           e.status,
           e.branch,
           e.joining_date,
           e.last_working_day,
           e.single_punch_ok,
           e.half_day_exempt,
           e.late_exempt
      from public.employees e
     where e.zkt_employee_no is not null
       and e.zkt_employee_no <> ''
       and (coalesce(e.status, 'Active') = 'Active' or e.last_working_day is not null)
  loop
    v_group := coalesce(nullif(v_employee.eligibility_group, ''), 'SALES_SUPPORT');
    select required_hours into v_required_hours
      from public.staff_eligibility_groups
     where code = v_group and is_active = true;

    if v_required_hours is null then
      continue;
    end if;

    v_prev_claimed_until := null;

    for v_day in select generate_series(p_from_date, p_to_date, interval '1 day')::date loop
      v_days := v_days + 1;

      if v_employee.joining_date is not null and v_day < v_employee.joining_date then
        continue;
      end if;

      if coalesce(v_employee.status, 'Active') <> 'Active'
         and v_employee.last_working_day is not null
         and v_day > v_employee.last_working_day then
        continue;
      end if;

      v_day_required_hours := v_required_hours;
      -- Every branch except BASE FAISAL opens at 14:30 on Fridays (Jummah),
      -- not the normal 11:00/13:00 shift starts -- confirmed against actual
      -- punch data (median first check-in ~14:30-15:00 company-wide on
      -- Fridays, but ~11:00 at BASE FAISAL, same as any other day).
      v_is_friday_late_open := extract(dow from v_day) = 5 and v_employee.branch is distinct from 'BASE FAISAL';
      if extract(dow from v_day) = 5 then
        select value::numeric into v_friday_override
          from public.hrms_policy_settings
         where key = case when v_group = 'MANAGEMENT_ADMIN' then 'friday_hours_management' else 'friday_hours_non_management' end
         limit 1;
        if v_friday_override is not null then
          v_day_required_hours := v_friday_override;
        end if;
      end if;

      select r.shift_code, r.is_weekly_off, r.is_gazetted_holiday, r.day_type
        into v_roster
        from public.employee_work_rosters r
       where r.employee_code = v_employee.employee_code
         and r.roster_date = v_day
       limit 1;

      v_weekly_off := coalesce(v_roster.is_weekly_off, false);
      v_gh := coalesce(v_roster.is_gazetted_holiday, exists(select 1 from public.gazetted_holidays g where g.holiday_date = v_day and g.is_active = true));
      v_day_type := coalesce(v_roster.day_type, case when v_weekly_off then 'Weekly Off' when v_gh then 'Gazetted Holiday' else 'Working Day' end);

      v_auto_detect := v_group <> 'MANAGEMENT_ADMIN'
        and v_roster.shift_code is null
        and (nullif(v_employee.assigned_shift_code, '') is null or v_employee.assigned_shift_code = 'SHIFT_A');

      if v_auto_detect then
        v_win_start := v_day::timestamp + interval '7 hours';
        v_win_end := (v_day + 1)::timestamp + interval '7 hours 30 minutes';
      else
        v_shift_code := private.resolve_employee_shift(v_employee.employee_code, v_day, v_employee.assigned_shift_code);

        select * into v_shift from public.shift_definitions where shift_code = v_shift_code and is_active = true;
        if not found then
          v_shift.shift_code := v_shift_code;
          v_shift.start_time := '00:00'::time;
          v_shift.end_time := '00:00'::time;
          v_shift.scheduled_hours := v_day_required_hours;
          v_shift.crosses_midnight := false;
        end if;

        if v_group = 'MANAGEMENT_ADMIN' then
          v_start := null;
          v_end := null;
        else
          v_start := v_day::timestamp + v_shift.start_time;
          v_end := v_day::timestamp + v_shift.end_time;
          if v_shift.crosses_midnight or v_shift.end_time < v_shift.start_time then
            v_end := v_end + interval '1 day';
          end if;
        end if;

        v_win_start := case when v_start is null then v_day::timestamp else v_start - interval '4 hours' end;
        v_win_end := case when v_end is null then (v_day + 1)::timestamp + interval '6 hours' else v_end + interval '8 hours' end;
      end if;

      select
        min(p.punch_time) filter (where lower(coalesce(p.punch_status,'')) in ('c/in','in','check in','check-in','checkin')),
        max(p.punch_time) filter (where lower(coalesce(p.punch_status,'')) in ('c/out','out','check out','check-out','checkout')),
        string_agg(distinct coalesce(p.location_id,''), ',' order by coalesce(p.location_id,''))
      into v_first_in, v_last_out, v_source_locations
      from public.zkt_raw_punches p
      where p.employee_code = v_employee.employee_code
        and p.punch_time >= v_win_start and p.punch_time < v_win_end
        and p.punch_time > coalesce(v_prev_claimed_until, '-infinity'::timestamp);

      if v_first_in is null or v_last_out is null
         or (v_first_in is not null and v_last_out is not null and v_last_out < v_first_in) then
        select count(distinct p.punch_time), min(p.punch_time), max(p.punch_time)
          into v_punch_count, v_pos_first, v_pos_last
          from public.zkt_raw_punches p
         where p.employee_code = v_employee.employee_code
           and p.punch_time >= v_win_start and p.punch_time < v_win_end
           and p.punch_time > coalesce(v_prev_claimed_until, '-infinity'::timestamp);

        -- Only use the positional (unlabeled) fallback when NEITHER end was
        -- resolved by punch_status label -- i.e. the device gave us nothing
        -- usable at all. If one end (e.g. check-in) already matched a real
        -- label but the other genuinely has no matching punch, don't
        -- fabricate a pair from an unrelated/duplicate same-type punch
        -- (e.g. the same physical swipe logged twice a few seconds apart
        -- with no C/Out at all) -- that produced a bogus ~0h "shift" and
        -- misclassified a missed checkout as Absent instead of Half Day.
        -- Confirmed against employees 1169 and 2082, July 2026: both had
        -- only duplicate C/In punches seconds apart and no C/Out at all.
        if v_first_in is null and v_last_out is null then
          if v_punch_count >= 2 then
            v_first_in := v_pos_first;
            v_last_out := v_pos_last;
          elsif v_punch_count = 1 then
            v_first_in := v_pos_first;
          end if;
        end if;
      end if;

      if v_last_out is not null and v_first_in is not null and v_last_out < v_first_in then
        v_last_out := null;
      end if;

      if v_auto_detect then
        if v_is_friday_late_open then
          v_shift_code := 'SHIFT_FRIDAY';
        elsif v_first_in is null then
          v_shift_code := 'SHIFT_A';
        elsif v_first_in::time <= time '12:30' then
          v_shift_code := 'SHIFT_A';
        else
          v_shift_code := 'SHIFT_B';
        end if;

        select * into v_shift from public.shift_definitions where shift_code = v_shift_code and is_active = true;
        v_start := v_day::timestamp + v_shift.start_time;
        v_end := v_day::timestamp + v_shift.end_time;
        if v_shift.crosses_midnight or v_shift.end_time < v_shift.start_time then
          v_end := v_end + interval '1 day';
        end if;
      end if;

      select coalesce(a.half_day_exempt, false), coalesce(a.late_exempt, false), coalesce(a.review_status,'') = 'Locked'
        into v_existing_half_exempt, v_existing_late_exempt, v_existing_locked
        from public.attendance a
       where a.employee_code = v_employee.employee_code
         and a.work_date = v_day
       limit 1;
      v_existing_half_exempt := coalesce(v_existing_half_exempt, false);
      v_existing_late_exempt := coalesce(v_existing_late_exempt, false);
      v_existing_locked := coalesce(v_existing_locked, false);
      v_eff_half_exempt := coalesce(v_employee.half_day_exempt, false) or v_existing_half_exempt;
      v_eff_late_exempt := coalesce(v_employee.late_exempt, false) or v_existing_late_exempt;

      select * into v_class
      from public.classify_attendance_day(
        v_group,
        v_day_required_hours,
        v_start,
        v_end,
        v_first_in,
        v_last_out,
        v_weekly_off,
        v_gh,
        v_eff_half_exempt,
        v_eff_late_exempt,
        extract(dow from v_day) = 5
      );

      if v_employee.single_punch_ok
         and (v_first_in is not null or v_last_out is not null)
         and v_class.worked_hours < v_day_required_hours then
        v_class.worked_hours := v_day_required_hours;
        v_class.attendance_status := 'Present';
        v_class.late_minutes := 0;
        v_class.early_out_minutes := 0;
        v_class.overtime_hours := 0;
        v_class.needs_review := false;
        v_class.exception_reason := null;
      end if;

      if v_first_in is not null and v_last_out is not null
         and (extract(epoch from (v_last_out - v_first_in)) / 3600.0) > 16 then
        v_class.needs_review := true;
        v_class.exception_reason := trim(both '; ' from coalesce(v_class.exception_reason || '; ', '') || 'Unusually long shift duration - please verify punches');
      end if;

      if v_last_out is not null then
        v_prev_claimed_until := v_last_out;
      end if;

      if not v_existing_locked then
        insert into public.attendance (
          employee_code, attendance_date, work_date, source, eligibility_group, shift_code,
          first_check_in, last_check_out, check_in, check_out, actual_hours,
          worked_hours, required_hours, short_hours,
          late_minutes, early_out_minutes, overtime_hours,
          extra_day_eligible, gh_eligible, is_weekly_off, is_gazetted_holiday,
          attendance_status, exception_reason, needs_review, calculated_at,
          zkt_location_id, review_status, half_day_exempt_applied, late_exempt_applied
        ) values (
          v_employee.employee_code, v_day, v_day, 'ZKT CSV', v_group, v_shift_code,
          v_first_in, v_last_out, v_first_in, v_last_out, v_class.worked_hours,
          v_class.worked_hours, v_day_required_hours,
          round(greatest(v_day_required_hours - v_class.worked_hours, 0)::numeric, 2),
          v_class.late_minutes, v_class.early_out_minutes, v_class.overtime_hours,
          v_class.extra_day_eligible, v_class.gh_eligible, v_weekly_off, v_gh,
          v_class.attendance_status, v_class.exception_reason, v_class.needs_review, now(),
          v_source_locations, case when v_class.needs_review then 'Pending Review' else 'Calculated' end,
          v_class.half_day_exempt_applied, v_class.late_exempt_applied
        )
        on conflict (employee_code, work_date) where employee_code is not null and work_date is not null
        do update set
          attendance_date = excluded.attendance_date,
          source = excluded.source,
          eligibility_group = excluded.eligibility_group,
          shift_code = excluded.shift_code,
          first_check_in = excluded.first_check_in,
          last_check_out = excluded.last_check_out,
          check_in = excluded.check_in,
          check_out = excluded.check_out,
          actual_hours = excluded.actual_hours,
          worked_hours = excluded.worked_hours,
          required_hours = excluded.required_hours,
          short_hours = excluded.short_hours,
          late_minutes = excluded.late_minutes,
          early_out_minutes = excluded.early_out_minutes,
          overtime_hours = excluded.overtime_hours,
          extra_day_eligible = excluded.extra_day_eligible,
          gh_eligible = excluded.gh_eligible,
          is_weekly_off = excluded.is_weekly_off,
          is_gazetted_holiday = excluded.is_gazetted_holiday,
          attendance_status = excluded.attendance_status,
          exception_reason = excluded.exception_reason,
          needs_review = excluded.needs_review,
          calculated_at = excluded.calculated_at,
          zkt_location_id = excluded.zkt_location_id,
          review_status = excluded.review_status,
          half_day_exempt_applied = excluded.half_day_exempt_applied,
          late_exempt_applied = excluded.late_exempt_applied;
        v_rows := v_rows + 1;
        if v_class.needs_review then v_review := v_review + 1; end if;
        if v_class.attendance_status = 'Absent' then v_absent := v_absent + 1; end if;
        if v_class.attendance_status = 'Half Day' then v_half := v_half + 1; end if;
      end if;
    end loop;
  end loop;

  return query select v_days, v_rows, v_review, v_absent, v_half;
end;
$function$;
-- =============================================================

-- =============================================================
-- Migration: data_cleanup_2026_08_22 (not a schema change -- one-time data
-- fixes applied alongside the punch-pairing fix above; all idempotent/safe
-- to re-run)
-- Applied: 2026-08-22
--
-- 1) 350 attendance rows (July-Aug 2026) had extra_day_eligible = true on a
--    day with no punches at all -- classify_attendance_day's no-punch
--    branch has always hardcoded that to false, so these were stale rows
--    computed by an older version of the function, never reclassified.
--    Wrongly inflated Extra Working Days / EWD pay for several employees.
-- 2) 3,690 attendance rows across 93 resigned employees sat dated *after*
--    their last_working_day (all within Jun-Aug 2026, none locked/paid) --
--    left over from before process_daily_attendance's skip-past-departure
--    check existed. Payroll counts every row in the queried month
--    regardless of resignation date, so these stale rows were directly
--    inflating Weekly Offs/EWD for FNF employees already off payroll.
-- 3) Many Warehouse employees had zero employee_work_rosters coverage for
--    their real weekly off day (Sunday) -- there is no in-app screen that
--    writes to employee_work_rosters at all, so gaps here are never
--    self-healing. Backfilled Sunday is_weekly_off=true rows for
--    2026-07-01..2026-08-22 for every Active Warehouse employee missing
--    that date's roster row.
-- =============================================================
UPDATE attendance
SET extra_day_eligible = false
WHERE extra_day_eligible = true AND check_in IS NULL AND check_out IS NULL;

DELETE FROM attendance a
USING employees e
WHERE a.employee_code = e.employee_code
  AND e.status <> 'Active'
  AND e.last_working_day IS NOT NULL
  AND a.work_date > e.last_working_day;

INSERT INTO employee_work_rosters (employee_code, roster_date, day_type, is_weekly_off, remarks, created_by)
SELECT e.employee_code, d::date, 'Weekly Off', true,
  'Backfilled: Warehouse weekly off is Sunday, roster row was missing', 'System (backfill 2026-08-22)'
FROM employees e
CROSS JOIN generate_series('2026-07-01'::date, '2026-08-22'::date, interval '1 day') d
WHERE e.branch = 'WAREHOUSE' AND e.status = 'Active'
  AND to_char(d::date, 'Dy') = 'Sun'
  AND (e.joining_date IS NULL OR e.joining_date <= d::date)
  AND NOT EXISTS (
    SELECT 1 FROM employee_work_rosters r
    WHERE r.employee_code = e.employee_code AND r.roster_date = d::date
  );

-- Reprocessing run after the above three fixes (not part of any function
-- itself) -- reran process_daily_attendance for 2026-07-01..2026-08-22.
-- =============================================================

-- =============================================================
-- Migration: fix_mislabeled_punch_rescue_with_time_gap
-- Applied: 2026-08-22
--
-- Regression in fix_duplicate_punch_pairing_fallback above: that fix
-- stopped the positional fallback from firing whenever ONE end was already
-- resolved by punch_status label, to stop it fabricating a fake pair from
-- a duplicate same-type punch seconds apart (the Parveen/Mudasir case).
-- But the ZKT device also has a separate, unrelated quirk: it sometimes
-- mislabels a REAL, hours-later checkout with the same status as the
-- check-in (or vice versa) -- not a duplicate, a genuine second punch that
-- was simply logged under the wrong direction. The previous fix's "one end
-- resolved means never look further" rule wrongly caught this case too,
-- turning a real full day's attendance into "missing checkout" -> Half Day
-- with worked_hours 0. Confirmed against employee 2022 (Fozia), 5 July
-- 2026: check-in 10:50:57 and real checkout 21:37:09 both labeled "C/In",
-- 10h46m apart -- and audited broadly: ~300 rows across ~90 employees and
-- every branch in Jul-Aug 2026 alone (both directions: checkout mislabeled
-- as check-in, and check-in mislabeled as check-out), at a steady rate
-- both months -- an ongoing device/ingestion quirk, not a one-off.
--
-- Fix: when exactly one end is resolved by label, look for the other real
-- punch (any label) more than 10 minutes away in the right direction and
-- use it -- far enough to rule out a duplicate of the same swipe, nowhere
-- close to a real shift length so it can't accidentally rescue a genuine
-- short/single punch. The "neither end resolved by label" fallback (the
-- original Parveen/Mudasir fix) is unchanged, now also carries the same
-- 10-minute gap guard for consistency.
--
-- Reprocessed 2026-07-01 through 2026-08-22 after applying this fix.
-- =============================================================
CREATE OR REPLACE FUNCTION public.process_daily_attendance(p_from_date date, p_to_date date)
 RETURNS TABLE(processed_days integer, inserted_or_updated integer, needs_review_count integer, absent_count integer, half_day_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
 SET statement_timeout TO '5min'
AS $function$
declare
  v_employee record;
  v_day date;
  v_roster record;
  v_shift public.shift_definitions%rowtype;
  v_shift_code text;
  v_group text;
  v_required_hours numeric;
  v_day_required_hours numeric;
  v_friday_override numeric;
  v_start timestamp without time zone;
  v_end timestamp without time zone;
  v_win_start timestamp without time zone;
  v_win_end timestamp without time zone;
  v_first_in timestamp without time zone;
  v_last_out timestamp without time zone;
  v_punch_count integer;
  v_pos_first timestamp without time zone;
  v_pos_last timestamp without time zone;
  v_class record;
  v_source_locations text;
  v_rows integer := 0;
  v_days integer := 0;
  v_review integer := 0;
  v_absent integer := 0;
  v_half integer := 0;
  v_weekly_off boolean;
  v_gh boolean;
  v_day_type text;
  v_existing_locked boolean;
  v_existing_half_exempt boolean;
  v_existing_late_exempt boolean;
  v_eff_half_exempt boolean;
  v_eff_late_exempt boolean;
  v_auto_detect boolean;
  v_is_friday_late_open boolean;
  -- Tracks the last punch already claimed as a checkout by a previous day
  -- within this run, per employee. A punch just after midnight that closes
  -- out an overnight shift (e.g. 13:00 -> 00:54) sits inside both that
  -- day's window and the next day's window (windows intentionally overlap
  -- to tolerate early/late punches) -- without this, the same physical
  -- punch could be reused as the NEXT day's check-in too, producing a
  -- bogus ~20+ hour "shift" when paired with that day's real punch.
  v_prev_claimed_until timestamp without time zone;
begin
  if p_from_date is null or p_to_date is null or p_to_date < p_from_date then
    raise exception 'Invalid attendance processing date range';
  end if;

  perform public.refresh_zkt_punch_employee_mapping();

  for v_employee in
    select e.employee_code,
           e.zkt_employee_no,
           e.eligibility_group,
           e.assigned_shift_code,
           e.status,
           e.branch,
           e.joining_date,
           e.last_working_day,
           e.single_punch_ok,
           e.half_day_exempt,
           e.late_exempt
      from public.employees e
     where e.zkt_employee_no is not null
       and e.zkt_employee_no <> ''
       and (coalesce(e.status, 'Active') = 'Active' or e.last_working_day is not null)
  loop
    v_group := coalesce(nullif(v_employee.eligibility_group, ''), 'SALES_SUPPORT');
    select required_hours into v_required_hours
      from public.staff_eligibility_groups
     where code = v_group and is_active = true;

    if v_required_hours is null then
      continue;
    end if;

    v_prev_claimed_until := null;

    for v_day in select generate_series(p_from_date, p_to_date, interval '1 day')::date loop
      v_days := v_days + 1;

      if v_employee.joining_date is not null and v_day < v_employee.joining_date then
        continue;
      end if;

      if coalesce(v_employee.status, 'Active') <> 'Active'
         and v_employee.last_working_day is not null
         and v_day > v_employee.last_working_day then
        continue;
      end if;

      v_day_required_hours := v_required_hours;
      -- Every branch except BASE FAISAL opens at 14:30 on Fridays (Jummah),
      -- not the normal 11:00/13:00 shift starts -- confirmed against actual
      -- punch data (median first check-in ~14:30-15:00 company-wide on
      -- Fridays, but ~11:00 at BASE FAISAL, same as any other day).
      v_is_friday_late_open := extract(dow from v_day) = 5 and v_employee.branch is distinct from 'BASE FAISAL';
      if extract(dow from v_day) = 5 then
        select value::numeric into v_friday_override
          from public.hrms_policy_settings
         where key = case when v_group = 'MANAGEMENT_ADMIN' then 'friday_hours_management' else 'friday_hours_non_management' end
         limit 1;
        if v_friday_override is not null then
          v_day_required_hours := v_friday_override;
        end if;
      end if;

      select r.shift_code, r.is_weekly_off, r.is_gazetted_holiday, r.day_type
        into v_roster
        from public.employee_work_rosters r
       where r.employee_code = v_employee.employee_code
         and r.roster_date = v_day
       limit 1;

      v_weekly_off := coalesce(v_roster.is_weekly_off, false);
      v_gh := coalesce(v_roster.is_gazetted_holiday, exists(select 1 from public.gazetted_holidays g where g.holiday_date = v_day and g.is_active = true));
      v_day_type := coalesce(v_roster.day_type, case when v_weekly_off then 'Weekly Off' when v_gh then 'Gazetted Holiday' else 'Working Day' end);

      v_auto_detect := v_group <> 'MANAGEMENT_ADMIN'
        and v_roster.shift_code is null
        and (nullif(v_employee.assigned_shift_code, '') is null or v_employee.assigned_shift_code = 'SHIFT_A');

      if v_auto_detect then
        v_win_start := v_day::timestamp + interval '7 hours';
        v_win_end := (v_day + 1)::timestamp + interval '7 hours 30 minutes';
      else
        v_shift_code := private.resolve_employee_shift(v_employee.employee_code, v_day, v_employee.assigned_shift_code);

        select * into v_shift from public.shift_definitions where shift_code = v_shift_code and is_active = true;
        if not found then
          v_shift.shift_code := v_shift_code;
          v_shift.start_time := '00:00'::time;
          v_shift.end_time := '00:00'::time;
          v_shift.scheduled_hours := v_day_required_hours;
          v_shift.crosses_midnight := false;
        end if;

        if v_group = 'MANAGEMENT_ADMIN' then
          v_start := null;
          v_end := null;
        else
          v_start := v_day::timestamp + v_shift.start_time;
          v_end := v_day::timestamp + v_shift.end_time;
          if v_shift.crosses_midnight or v_shift.end_time < v_shift.start_time then
            v_end := v_end + interval '1 day';
          end if;
        end if;

        v_win_start := case when v_start is null then v_day::timestamp else v_start - interval '4 hours' end;
        v_win_end := case when v_end is null then (v_day + 1)::timestamp + interval '6 hours' else v_end + interval '8 hours' end;
      end if;

      select
        min(p.punch_time) filter (where lower(coalesce(p.punch_status,'')) in ('c/in','in','check in','check-in','checkin')),
        max(p.punch_time) filter (where lower(coalesce(p.punch_status,'')) in ('c/out','out','check out','check-out','checkout')),
        string_agg(distinct coalesce(p.location_id,''), ',' order by coalesce(p.location_id,''))
      into v_first_in, v_last_out, v_source_locations
      from public.zkt_raw_punches p
      where p.employee_code = v_employee.employee_code
        and p.punch_time >= v_win_start and p.punch_time < v_win_end
        and p.punch_time > coalesce(v_prev_claimed_until, '-infinity'::timestamp);

      if v_first_in is null or v_last_out is null
         or (v_first_in is not null and v_last_out is not null and v_last_out < v_first_in) then

        if v_first_in is not null and v_last_out is null then
          -- Have a labeled check-in but no labeled check-out anywhere in the
          -- window. Look for the LATEST other punch (any label) that is
          -- meaningfully later -- a real checkout the device mislabeled the
          -- same as check-in (a known ZKT quirk on shared-direction readers)
          -- rather than the same physical swipe logged twice seconds apart.
          -- Confirmed against employee 2022, 5 July 2026: both punches were
          -- labeled "C/In", 10h46m apart (10:50 in, 21:37 real checkout).
          select max(p.punch_time) into v_pos_last
            from public.zkt_raw_punches p
           where p.employee_code = v_employee.employee_code
             and p.punch_time >= v_win_start and p.punch_time < v_win_end
             and p.punch_time > coalesce(v_prev_claimed_until, '-infinity'::timestamp)
             and p.punch_time > v_first_in + interval '10 minutes';
          if v_pos_last is not null then
            v_last_out := v_pos_last;
          end if;

        elsif v_last_out is not null and v_first_in is null then
          -- Symmetric case: labeled check-out but no labeled check-in.
          select min(p.punch_time) into v_pos_first
            from public.zkt_raw_punches p
           where p.employee_code = v_employee.employee_code
             and p.punch_time >= v_win_start and p.punch_time < v_win_end
             and p.punch_time > coalesce(v_prev_claimed_until, '-infinity'::timestamp)
             and p.punch_time < v_last_out - interval '10 minutes';
          if v_pos_first is not null then
            v_first_in := v_pos_first;
          end if;

        else
          -- Neither end resolved by label (or both resolved but reversed) --
          -- fall back to the earliest/latest raw punch in the window as a
          -- rough in/out pair, but only when they're far enough apart to
          -- plausibly be a real shift. Punches seconds/minutes apart are
          -- almost always the same swipe duplicated by ingestion, not a
          -- genuine short pair -- confirmed against employees 1169 and
          -- 2082, July 2026: duplicate C/In punches 2-4 seconds apart with
          -- no C/Out at all, which must stay a single check-in (Half Day
          -- via missing_single_punch_status), not a fabricated ~0h pair.
          select count(distinct p.punch_time), min(p.punch_time), max(p.punch_time)
            into v_punch_count, v_pos_first, v_pos_last
            from public.zkt_raw_punches p
           where p.employee_code = v_employee.employee_code
             and p.punch_time >= v_win_start and p.punch_time < v_win_end
             and p.punch_time > coalesce(v_prev_claimed_until, '-infinity'::timestamp);

          if v_punch_count >= 2 and (v_pos_last - v_pos_first) >= interval '10 minutes' then
            v_first_in := v_pos_first;
            v_last_out := v_pos_last;
          elsif v_punch_count >= 1 then
            v_first_in := v_pos_first;
            v_last_out := null;
          end if;
        end if;
      end if;

      if v_last_out is not null and v_first_in is not null and v_last_out < v_first_in then
        v_last_out := null;
      end if;

      if v_auto_detect then
        if v_is_friday_late_open then
          v_shift_code := 'SHIFT_FRIDAY';
        elsif v_first_in is null then
          v_shift_code := 'SHIFT_A';
        elsif v_first_in::time <= time '12:30' then
          v_shift_code := 'SHIFT_A';
        else
          v_shift_code := 'SHIFT_B';
        end if;

        select * into v_shift from public.shift_definitions where shift_code = v_shift_code and is_active = true;
        v_start := v_day::timestamp + v_shift.start_time;
        v_end := v_day::timestamp + v_shift.end_time;
        if v_shift.crosses_midnight or v_shift.end_time < v_shift.start_time then
          v_end := v_end + interval '1 day';
        end if;
      end if;

      select coalesce(a.half_day_exempt, false), coalesce(a.late_exempt, false), coalesce(a.review_status,'') = 'Locked'
        into v_existing_half_exempt, v_existing_late_exempt, v_existing_locked
        from public.attendance a
       where a.employee_code = v_employee.employee_code
         and a.work_date = v_day
       limit 1;
      v_existing_half_exempt := coalesce(v_existing_half_exempt, false);
      v_existing_late_exempt := coalesce(v_existing_late_exempt, false);
      v_existing_locked := coalesce(v_existing_locked, false);
      v_eff_half_exempt := coalesce(v_employee.half_day_exempt, false) or v_existing_half_exempt;
      v_eff_late_exempt := coalesce(v_employee.late_exempt, false) or v_existing_late_exempt;

      select * into v_class
      from public.classify_attendance_day(
        v_group,
        v_day_required_hours,
        v_start,
        v_end,
        v_first_in,
        v_last_out,
        v_weekly_off,
        v_gh,
        v_eff_half_exempt,
        v_eff_late_exempt,
        extract(dow from v_day) = 5
      );

      if v_employee.single_punch_ok
         and (v_first_in is not null or v_last_out is not null)
         and v_class.worked_hours < v_day_required_hours then
        v_class.worked_hours := v_day_required_hours;
        v_class.attendance_status := 'Present';
        v_class.late_minutes := 0;
        v_class.early_out_minutes := 0;
        v_class.overtime_hours := 0;
        v_class.needs_review := false;
        v_class.exception_reason := null;
      end if;

      if v_first_in is not null and v_last_out is not null
         and (extract(epoch from (v_last_out - v_first_in)) / 3600.0) > 16 then
        v_class.needs_review := true;
        v_class.exception_reason := trim(both '; ' from coalesce(v_class.exception_reason || '; ', '') || 'Unusually long shift duration - please verify punches');
      end if;

      if v_last_out is not null then
        v_prev_claimed_until := v_last_out;
      end if;

      if not v_existing_locked then
        insert into public.attendance (
          employee_code, attendance_date, work_date, source, eligibility_group, shift_code,
          first_check_in, last_check_out, check_in, check_out, actual_hours,
          worked_hours, required_hours, short_hours,
          late_minutes, early_out_minutes, overtime_hours,
          extra_day_eligible, gh_eligible, is_weekly_off, is_gazetted_holiday,
          attendance_status, exception_reason, needs_review, calculated_at,
          zkt_location_id, review_status, half_day_exempt_applied, late_exempt_applied
        ) values (
          v_employee.employee_code, v_day, v_day, 'ZKT CSV', v_group, v_shift_code,
          v_first_in, v_last_out, v_first_in, v_last_out, v_class.worked_hours,
          v_class.worked_hours, v_day_required_hours,
          round(greatest(v_day_required_hours - v_class.worked_hours, 0)::numeric, 2),
          v_class.late_minutes, v_class.early_out_minutes, v_class.overtime_hours,
          v_class.extra_day_eligible, v_class.gh_eligible, v_weekly_off, v_gh,
          v_class.attendance_status, v_class.exception_reason, v_class.needs_review, now(),
          v_source_locations, case when v_class.needs_review then 'Pending Review' else 'Calculated' end,
          v_class.half_day_exempt_applied, v_class.late_exempt_applied
        )
        on conflict (employee_code, work_date) where employee_code is not null and work_date is not null
        do update set
          attendance_date = excluded.attendance_date,
          source = excluded.source,
          eligibility_group = excluded.eligibility_group,
          shift_code = excluded.shift_code,
          first_check_in = excluded.first_check_in,
          last_check_out = excluded.last_check_out,
          check_in = excluded.check_in,
          check_out = excluded.check_out,
          actual_hours = excluded.actual_hours,
          worked_hours = excluded.worked_hours,
          required_hours = excluded.required_hours,
          short_hours = excluded.short_hours,
          late_minutes = excluded.late_minutes,
          early_out_minutes = excluded.early_out_minutes,
          overtime_hours = excluded.overtime_hours,
          extra_day_eligible = excluded.extra_day_eligible,
          gh_eligible = excluded.gh_eligible,
          is_weekly_off = excluded.is_weekly_off,
          is_gazetted_holiday = excluded.is_gazetted_holiday,
          attendance_status = excluded.attendance_status,
          exception_reason = excluded.exception_reason,
          needs_review = excluded.needs_review,
          calculated_at = excluded.calculated_at,
          zkt_location_id = excluded.zkt_location_id,
          review_status = excluded.review_status,
          half_day_exempt_applied = excluded.half_day_exempt_applied,
          late_exempt_applied = excluded.late_exempt_applied;
        v_rows := v_rows + 1;
        if v_class.needs_review then v_review := v_review + 1; end if;
        if v_class.attendance_status = 'Absent' then v_absent := v_absent + 1; end if;
        if v_class.attendance_status = 'Half Day' then v_half := v_half + 1; end if;
      end if;
    end loop;
  end loop;

  return query select v_days, v_rows, v_review, v_absent, v_half;
end;
$function$;
-- =============================================================

-- =============================================================
-- Correction: the "data_cleanup_2026_08_22" migration above wrongly
-- assumed every Warehouse employee's weekly off day is Sunday and hand-
-- inserted employee_work_rosters rows accordingly. That was wrong on two
-- counts:
-- Applied: 2026-08-22 (same day, later)
--
-- 1) A real, existing mechanism already does this properly:
--    `generate_employee_work_rosters(from, to)` (RPC, wired to the
--    "Generate Weekly Off Rosters" button on the ZKT Sync page) reads each
--    employee's own `employees.weekly_off_day` (0=Sun..6=Sat) and writes
--    is_weekly_off rows from that, with the company's 4-per-month cap for
--    non-Management/non-Warehouse staff. There was never a need to
--    hand-write roster rows.
-- 2) 11 of the 18 employees the SQL touched had `weekly_off_day` already
--    set to something OTHER than Sunday (Mon/Tue/Wed/Thu -- e.g. employee
--    2032/Atta Ullah is Wednesday) -- the hand-written Sunday rows sat
--    ALONGSIDE their real configured off day, giving them two weekly-offs
--    a week instead of one. Only 7 of the 18 (1389, 3061, 3070, 3071,
--    4008, 4014, 4025) genuinely had `weekly_off_day IS NULL` -- a real
--    data gap, not a code gap.
--
-- Fix: deleted every row this migration's INSERT created
-- (created_by = 'System (backfill 2026-08-22)'), set weekly_off_day = '0'
-- for the 7 genuinely-unconfigured employees (all Warehouse, matching
-- their peers), then called the real generate_employee_work_rosters RPC
-- for 2026-07-01..2026-08-22 and reran process_daily_attendance.
-- =============================================================
DELETE FROM employee_work_rosters r
USING employees e
WHERE r.employee_code = e.employee_code
  AND r.created_by = 'System (backfill 2026-08-22)'
  AND e.weekly_off_day IS NOT NULL
  AND e.weekly_off_day <> '0';

UPDATE employees SET weekly_off_day = '0'
WHERE employee_code IN ('1389','3061','3070','3071','4008','4014','4025');

DELETE FROM employee_work_rosters WHERE created_by = 'System (backfill 2026-08-22)';

SELECT * FROM public.generate_employee_work_rosters('2026-07-01','2026-08-22');
-- =============================================================

-- =============================================================
-- Migration: reclassify_attendance_row_honor_exempts
-- Applied: 2026-08-29
-- reclassify_attendance_row() was never updated when half_day_exempt /
-- late_exempt / Friday-open handling and single_punch_ok were added to
-- classify_attendance_day + process_daily_attendance (2026-08 migrations).
-- It still called the 8-arg classify_attendance_day, so re-running it
-- (Permissions "reclassify unpublished months", Timesheet per-day toggle,
-- Approval Queue attendance corrections) never actually applied an exemption
-- toggled AFTER a month's attendance was first generated.
-- Confirmed: employee 14, July 2026 -- half_day_exempt + late_exempt both on,
-- 22 stale "Half Day" rows still driving a Rs.55,000 half-day deduction.
-- Now mirrors process_daily_attendance: passes the effective employee-or-
-- per-day exemptions + the Friday flag into the 11-arg classify, applies
-- single_punch_ok, and writes half_day_exempt_applied / late_exempt_applied
-- (and extra_day_eligible / gh_eligible) back to the row.
-- NOTE: a single-punch day (missing in OR out) still classifies as the
-- group's missing_single_punch_status ("Half Day" + needs review) BEFORE the
-- exempt branch -- half_day_exempt does not rescue those; single_punch_ok
-- does, and PayrollAutomation's buildPayrollRows also no longer docks a
-- half-day-exempt employee for one.
-- Full function body: see apply_migration reclassify_attendance_row_honor_exempts.
-- Reprocessing run after (not part of the function): reclassified every
-- non-locked, non-manual July 2026 attendance row for employees with
-- half_day_exempt or late_exempt set, plus Management rows still marked
-- "Half Day".
-- =============================================================
