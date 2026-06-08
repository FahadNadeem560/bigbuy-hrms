# Supabase Migrations

Run these SQL statements in the Supabase SQL editor to create all tables required by the new HR & Payroll features.

---

## 0. Supervisor / Hierarchy System (Part 1 — New)

```sql
-- Employee hierarchy columns
ALTER TABLE employees ADD COLUMN IF NOT EXISTS supervisor_id text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_supervisor boolean DEFAULT false;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_manager boolean DEFAULT false;

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_code text,
  recipient_role text,
  type text NOT NULL DEFAULT 'general',
  title text NOT NULL,
  message text,
  reference_id uuid,
  reference_type text,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_code, recipient_role, is_read);

-- Timesheet sign-offs
CREATE TABLE IF NOT EXISTS timesheet_signoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_code text NOT NULL,
  employee_name text,
  month text NOT NULL,
  supervisor_signed_off boolean DEFAULT false,
  supervisor_code text,
  supervisor_name text,
  signed_at timestamptz,
  hr_reviewed boolean DEFAULT false,
  payroll_ready boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(employee_code, month)
);

-- Settlement requests (for approval queue)
CREATE TABLE IF NOT EXISTS settlement_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_code text NOT NULL,
  employee_name text,
  branch text,
  resign_date date,
  last_working_day date,
  net_settlement numeric DEFAULT 0,
  status text DEFAULT 'Pending Supervisor',
  submitted_by text,
  approved_by text,
  rejection_reason text,
  approved_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Add status to attendance_adjustments for approval workflow
ALTER TABLE attendance_adjustments ADD COLUMN IF NOT EXISTS status text DEFAULT 'Completed';
ALTER TABLE attendance_adjustments ADD COLUMN IF NOT EXISTS rejection_reason text;

-- Add salary_increments table if not exists
CREATE TABLE IF NOT EXISTS salary_increments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_code text NOT NULL,
  employee_name text,
  old_salary numeric DEFAULT 0,
  new_salary numeric DEFAULT 0,
  effective_from date,
  reason text,
  submitted_by text,
  approved_by text,
  rejection_reason text,
  status text DEFAULT 'Pending',
  approved_at timestamptz,
  created_at timestamptz DEFAULT now()
);
```

---

## 1. Employee Table Extensions

```sql
ALTER TABLE employees ADD COLUMN IF NOT EXISTS cnic_issue_date date;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS cnic_expiry_date date;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS reference_person_name text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS reference_person_contact text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS emergency_contact_name text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS emergency_contact_number text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS emergency_contact_relationship text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS billing_address text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS permanent_address text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS current_address text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS personal_phone text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS work_phone text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS bank_name text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS account_number text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS iban text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS photo_url text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS cnic_copy_url text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS employment_contract_url text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS joining_date date;
```

---

## 2. Supabase Storage Bucket

Create a storage bucket named `employee-docs` with public access (or signed URL access) for photo and document uploads.

```sql
-- Run in Supabase dashboard: Storage > New Bucket
-- Name: employee-docs
-- Public: true (or configure RLS for private access)
```

---

## 3. Departments & Designations (Requirement 2)

```sql
CREATE TABLE IF NOT EXISTS departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS designations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  department_id uuid REFERENCES departments(id),
  description text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
```

---

## 4. Roster Management (Requirements 3 & 10)

```sql
CREATE TABLE IF NOT EXISTS shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  start_time text NOT NULL,
  end_time text NOT NULL,
  grace_minutes integer DEFAULT 15,
  days_applicable text DEFAULT 'Mon,Tue,Wed,Thu,Fri',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employee_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_code text NOT NULL,
  employee_name text,
  shift_id uuid REFERENCES shifts(id),
  effective_from date NOT NULL,
  effective_to date,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS roster_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_code text NOT NULL,
  employee_name text,
  shift_id uuid REFERENCES shifts(id),
  work_date date NOT NULL,
  is_day_off boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(employee_code, work_date)
);

CREATE TABLE IF NOT EXISTS shift_auto_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department text NOT NULL UNIQUE,
  shift_id uuid REFERENCES shifts(id),
  created_at timestamptz DEFAULT now()
);
```

---

## 5. One-Time Adjustments (Requirement 4)

```sql
CREATE TABLE IF NOT EXISTS one_time_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_code text NOT NULL,
  employee_name text,
  type text NOT NULL,
  amount numeric NOT NULL,
  reason text,
  payroll_month text NOT NULL,
  status text DEFAULT 'Pending',
  submitted_by text,
  approved_by text,
  rejection_reason text,
  approved_at timestamptz,
  created_at timestamptz DEFAULT now()
);
```

---

## 6. Tax Management (Requirement 5)

```sql
CREATE TABLE IF NOT EXISTS tax_slabs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year text NOT NULL,
  min_amount numeric NOT NULL,
  max_amount numeric NOT NULL,
  base_tax numeric DEFAULT 0,
  rate_percentage numeric NOT NULL,
  label text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employee_tax_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_code text NOT NULL UNIQUE,
  tax_enabled boolean DEFAULT false,
  manual_tax_amount numeric,
  effective_month text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

---

## 7. Fuel Allowance (Requirement 6)

```sql
CREATE TABLE IF NOT EXISTS fuel_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_per_km numeric NOT NULL,
  effective_from date NOT NULL,
  created_by text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employee_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_code text NOT NULL,
  employee_name text,
  vehicle_type text DEFAULT 'Car',
  registration text,
  is_eligible boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fuel_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_code text NOT NULL,
  employee_name text,
  claim_month text NOT NULL,
  km_traveled numeric NOT NULL,
  route text,
  trip_date date,
  purpose text,
  calculated_amount numeric,
  rate_used numeric,
  status text DEFAULT 'Pending',
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz DEFAULT now()
);
```

---

## 8. Fixed Allowances & Deductions (Requirement 7)

```sql
CREATE TABLE IF NOT EXISTS fixed_allowances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_code text NOT NULL,
  employee_name text,
  category text NOT NULL,
  type text NOT NULL,
  amount numeric NOT NULL,
  description text,
  effective_from date NOT NULL,
  effective_to date,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
```

---

## 9. Loan Changes — Enhanced Loan Management (Requirement 8)

```sql
CREATE TABLE IF NOT EXISTS loan_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id uuid,
  employee_code text,
  change_type text NOT NULL,
  old_monthly numeric,
  new_monthly numeric,
  old_balance numeric,
  new_balance numeric,
  reason text,
  created_at timestamptz DEFAULT now()
);
```

---

## 10. Leave Requests — Extended Columns (Requirement 9)

```sql
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS days integer;
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS is_unpaid boolean DEFAULT false;
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS rejection_reason text;
```

---

## 11. Compensation Management (Requirement 11)

```sql
CREATE TABLE IF NOT EXISTS salary_structures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_code text NOT NULL,
  employee_name text,
  basic numeric DEFAULT 0,
  hra numeric DEFAULT 0,
  medical numeric DEFAULT 0,
  conveyance numeric DEFAULT 0,
  other_allowances numeric DEFAULT 0,
  total_ctc numeric DEFAULT 0,
  effective_from date,
  created_at timestamptz DEFAULT now()
);
```

---

## 12. Policy Settings (Requirement 12)

```sql
CREATE TABLE IF NOT EXISTS hrms_policy_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value text NOT NULL,
  description text,
  branch text DEFAULT 'Global',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Seed default policy values
INSERT INTO hrms_policy_settings (key, value, description, branch) VALUES
  ('grace_minutes', '15', 'Grace period before marking Late (minutes)', 'Global'),
  ('half_day_hours', '4', 'Hours below which attendance counts as Half Day', 'Global'),
  ('late_per_deduction_cycle', '3', 'Number of late marks that trigger 1 salary deduction day', 'Global'),
  ('deduction_days_per_breach', '1', 'Salary days deducted per late breach', 'Global'),
  ('half_day_salary_factor', '0.5', 'Salary fraction for half-day attendance', 'Global'),
  ('eobi_employer_rate', '5', 'EOBI employer contribution %', 'Global'),
  ('eobi_employee_rate', '1', 'EOBI employee deduction %', 'Global'),
  ('overtime_multiplier', '1.5', 'Overtime pay multiplier', 'Global')
ON CONFLICT (key) DO NOTHING;
```

---

## 13. Payroll Table — Extended Columns (Requirement 13)

```sql
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS fuel_allowance numeric DEFAULT 0;
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS leave_adjustment numeric DEFAULT 0;
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS arrears numeric DEFAULT 0;
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS commission numeric DEFAULT 0;
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS other_amount numeric DEFAULT 0;
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS advance numeric DEFAULT 0;
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS fine numeric DEFAULT 0;
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS eobi_deduction numeric DEFAULT 0;
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS tax_deduction numeric DEFAULT 0;
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS extra_working_days integer DEFAULT 0;
```

---

## Row-Level Security (RLS)

Enable RLS on all new tables and create policies appropriate for your auth setup. Example:

```sql
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated" ON departments FOR ALL USING (auth.role() = 'authenticated');
-- Repeat for all new tables
```

---

## Summary of New Tables

| Table | Purpose |
|-------|---------|
| `departments` | Department master |
| `designations` | Designation master with department link |
| `shifts` | Shift definitions |
| `employee_shifts` | Employee-to-shift assignments |
| `roster_entries` | Daily roster (employee × date × shift) |
| `shift_auto_rules` | Department → default shift rules |
| `one_time_adjustments` | HR-submitted payroll adjustments with approval |
| `tax_slabs` | FBR income tax slab configuration |
| `employee_tax_settings` | Per-employee tax enable/disable/override |
| `fuel_rates` | Company fuel rate per KM |
| `employee_vehicles` | Employee vehicle assignments |
| `fuel_claims` | Monthly KM/fuel claims |
| `fixed_allowances` | Recurring allowances and deductions |
| `loan_changes` | Loan rescheduling, relief, settlement audit log |
| `salary_structures` | Salary component breakdown per employee |
| `hrms_policy_settings` | Configurable attendance/payroll policy values |
