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
  ADD COLUMN IF NOT EXISTS approved_at   TIMESTAMPTZ;

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
