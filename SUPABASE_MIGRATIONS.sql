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
