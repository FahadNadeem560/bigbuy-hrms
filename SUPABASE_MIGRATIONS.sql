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

END;
$$;

GRANT EXECUTE ON FUNCTION run_migrations() TO anon, authenticated;
