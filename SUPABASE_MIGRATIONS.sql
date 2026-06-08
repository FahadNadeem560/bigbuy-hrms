-- =============================================================
-- BigBuy HRMS – Supabase Schema Migrations
-- =============================================================
-- HOW TO USE:
--   Option A (manual): Paste this file into Supabase SQL Editor and run it.
--   Option B (auto):   The app calls run_migrations() via supabase.rpc()
--                      on startup (src/utils/runMigrations.js).
--
-- All statements are idempotent (IF NOT EXISTS / IF NOT EXIST).
-- Safe to run multiple times.
-- =============================================================


-- ─────────────────────────────────────────────────────────────
-- employees: profile, banking & document columns
-- ─────────────────────────────────────────────────────────────
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS account_number              TEXT,
  ADD COLUMN IF NOT EXISTS bank_name                   TEXT,
  ADD COLUMN IF NOT EXISTS iban                        TEXT,
  ADD COLUMN IF NOT EXISTS cnic                        TEXT,
  ADD COLUMN IF NOT EXISTS cnic_issue_date             DATE,
  ADD COLUMN IF NOT EXISTS cnic_expiry_date            DATE,
  ADD COLUMN IF NOT EXISTS reference_person_name       TEXT,
  ADD COLUMN IF NOT EXISTS reference_person_contact    TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_name      TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_number    TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_relationship TEXT,
  ADD COLUMN IF NOT EXISTS billing_info                TEXT,
  ADD COLUMN IF NOT EXISTS permanent_address           TEXT,
  ADD COLUMN IF NOT EXISTS current_address             TEXT,
  ADD COLUMN IF NOT EXISTS personal_phone              TEXT,
  ADD COLUMN IF NOT EXISTS work_phone                  TEXT,
  ADD COLUMN IF NOT EXISTS email                       TEXT,
  ADD COLUMN IF NOT EXISTS photo_url                   TEXT,
  ADD COLUMN IF NOT EXISTS supervisor_id               UUID REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS is_supervisor               BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_manager                  BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS staff_level                 TEXT    DEFAULT 'Staff';

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS cnic_document_url           TEXT,
  ADD COLUMN IF NOT EXISTS contract_document_url       TEXT;

-- ─────────────────────────────────────────────────────────────
-- employees: additional columns found in codebase scans
-- ─────────────────────────────────────────────────────────────
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS whatsapp_number             TEXT,
  ADD COLUMN IF NOT EXISTS fathers_cnic                TEXT,
  ADD COLUMN IF NOT EXISTS resignation_date            DATE,
  ADD COLUMN IF NOT EXISTS last_working_day            DATE,
  ADD COLUMN IF NOT EXISTS shift                       TEXT,
  ADD COLUMN IF NOT EXISTS category_department         TEXT;

-- ─────────────────────────────────────────────────────────────
-- loans: optional display/type columns
-- ─────────────────────────────────────────────────────────────
ALTER TABLE loans
  ADD COLUMN IF NOT EXISTS loan_type                   TEXT    DEFAULT 'General',
  ADD COLUMN IF NOT EXISTS loan_date                   DATE,
  ADD COLUMN IF NOT EXISTS granted_date                DATE;

-- ─────────────────────────────────────────────────────────────
-- leave_requests: self-service portal uses start_date/end_date
-- HR module uses from_date/to_date – both sets must exist
-- ─────────────────────────────────────────────────────────────
ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS start_date                  DATE,
  ADD COLUMN IF NOT EXISTS end_date                    DATE,
  ADD COLUMN IF NOT EXISTS employee_name               TEXT,
  ADD COLUMN IF NOT EXISTS employee_id                 TEXT,
  ADD COLUMN IF NOT EXISTS applied_date                DATE;

-- ─────────────────────────────────────────────────────────────
-- notifications
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id                    UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  recipient_role        TEXT,
  recipient_employee_id UUID        REFERENCES employees(id),
  title                 TEXT        NOT NULL,
  message               TEXT,
  type                  TEXT,
  link                  TEXT,
  is_read               BOOLEAN     DEFAULT FALSE,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- approval_requests
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS approval_requests (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  request_type      TEXT        NOT NULL,
  requested_by      TEXT,
  employee_id       UUID        REFERENCES employees(id),
  details           JSONB,
  status            TEXT        DEFAULT 'Pending',
  rejection_reason  TEXT,
  reviewed_by       TEXT,
  reviewed_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- one_time_adjustments
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS one_time_adjustments (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id       UUID        REFERENCES employees(id),
  type              TEXT,
  amount            NUMERIC,
  reason            TEXT,
  payroll_month     TEXT,
  status            TEXT        DEFAULT 'Pending',
  rejection_reason  TEXT,
  created_by        TEXT,
  reviewed_by       TEXT,
  reviewed_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- fuel_claims
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fuel_claims (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id   UUID        REFERENCES employees(id),
  claim_month   TEXT,
  route         TEXT,
  trip_date     DATE,
  km_traveled   NUMERIC,
  rate_per_km   NUMERIC,
  amount        NUMERIC,
  purpose       TEXT,
  status        TEXT        DEFAULT 'Pending',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- fixed_allowances
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fixed_allowances (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id    UUID        REFERENCES employees(id),
  type           TEXT,
  amount         NUMERIC,
  effective_from DATE,
  effective_to   DATE,
  is_active      BOOLEAN     DEFAULT TRUE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- tax_slabs
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tax_slabs (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  fiscal_year  TEXT,
  min_amount   NUMERIC,
  max_amount   NUMERIC,
  fixed_tax    NUMERIC     DEFAULT 0,
  rate         NUMERIC,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);


-- =============================================================
-- run_migrations() stored procedure
-- Called by src/utils/runMigrations.js on app startup.
-- Uses SECURITY DEFINER so it runs with owner privileges.
-- Safe to call multiple times – all statements are idempotent.
-- =============================================================
CREATE OR REPLACE FUNCTION run_migrations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- ── employees ──────────────────────────────────────────────
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS account_number              TEXT;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS bank_name                   TEXT;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS iban                        TEXT;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS cnic                        TEXT;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS cnic_issue_date             DATE;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS cnic_expiry_date            DATE;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS reference_person_name       TEXT;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS reference_person_contact    TEXT;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS emergency_contact_name      TEXT;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS emergency_contact_number    TEXT;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS emergency_contact_relationship TEXT;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS billing_info                TEXT;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS permanent_address           TEXT;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS current_address             TEXT;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS personal_phone              TEXT;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS work_phone                  TEXT;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS email                       TEXT;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS photo_url                   TEXT;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS supervisor_id               UUID;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_supervisor               BOOLEAN DEFAULT FALSE;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_manager                  BOOLEAN DEFAULT FALSE;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS staff_level                 TEXT    DEFAULT 'Staff';
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS cnic_document_url           TEXT;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS contract_document_url       TEXT;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS whatsapp_number             TEXT;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS fathers_cnic                TEXT;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS resignation_date            DATE;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS last_working_day            DATE;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS shift                       TEXT;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS category_department         TEXT;

  -- ── loans ──────────────────────────────────────────────────
  ALTER TABLE loans ADD COLUMN IF NOT EXISTS loan_type    TEXT    DEFAULT 'General';
  ALTER TABLE loans ADD COLUMN IF NOT EXISTS loan_date    DATE;
  ALTER TABLE loans ADD COLUMN IF NOT EXISTS granted_date DATE;

  -- ── leave_requests ─────────────────────────────────────────
  ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS start_date    DATE;
  ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS end_date      DATE;
  ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS employee_name TEXT;
  ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS employee_id   TEXT;
  ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS applied_date  DATE;

  -- ── notifications ──────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS notifications (
    id                    UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    recipient_role        TEXT,
    recipient_employee_id UUID,
    title                 TEXT        NOT NULL,
    message               TEXT,
    type                  TEXT,
    link                  TEXT,
    is_read               BOOLEAN     DEFAULT FALSE,
    created_at            TIMESTAMPTZ DEFAULT NOW()
  );

  -- ── approval_requests ──────────────────────────────────────
  CREATE TABLE IF NOT EXISTS approval_requests (
    id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    request_type     TEXT        NOT NULL,
    requested_by     TEXT,
    employee_id      UUID,
    details          JSONB,
    status           TEXT        DEFAULT 'Pending',
    rejection_reason TEXT,
    reviewed_by      TEXT,
    reviewed_at      TIMESTAMPTZ,
    created_at       TIMESTAMPTZ DEFAULT NOW()
  );

  -- ── one_time_adjustments ───────────────────────────────────
  CREATE TABLE IF NOT EXISTS one_time_adjustments (
    id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    employee_id      UUID,
    type             TEXT,
    amount           NUMERIC,
    reason           TEXT,
    payroll_month    TEXT,
    status           TEXT        DEFAULT 'Pending',
    rejection_reason TEXT,
    created_by       TEXT,
    reviewed_by      TEXT,
    reviewed_at      TIMESTAMPTZ,
    created_at       TIMESTAMPTZ DEFAULT NOW()
  );

  -- ── fuel_claims ────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS fuel_claims (
    id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    employee_id  UUID,
    claim_month  TEXT,
    route        TEXT,
    trip_date    DATE,
    km_traveled  NUMERIC,
    rate_per_km  NUMERIC,
    amount       NUMERIC,
    purpose      TEXT,
    status       TEXT        DEFAULT 'Pending',
    created_at   TIMESTAMPTZ DEFAULT NOW()
  );

  -- ── fixed_allowances ───────────────────────────────────────
  CREATE TABLE IF NOT EXISTS fixed_allowances (
    id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    employee_id    UUID,
    type           TEXT,
    amount         NUMERIC,
    effective_from DATE,
    effective_to   DATE,
    is_active      BOOLEAN     DEFAULT TRUE,
    created_at     TIMESTAMPTZ DEFAULT NOW()
  );

  -- ── tax_slabs ──────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS tax_slabs (
    id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    fiscal_year TEXT,
    min_amount  NUMERIC,
    max_amount  NUMERIC,
    fixed_tax   NUMERIC     DEFAULT 0,
    rate        NUMERIC,
    created_at  TIMESTAMPTZ DEFAULT NOW()
  );

END;
$$;

-- Allow the anon and authenticated roles to call this function
GRANT EXECUTE ON FUNCTION run_migrations() TO anon, authenticated;
