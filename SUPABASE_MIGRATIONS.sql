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
