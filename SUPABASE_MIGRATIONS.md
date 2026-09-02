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
ALTER TABLE one_time_adjustments ADD COLUMN IF NOT EXISTS calc_mode text DEFAULT 'Full Amount';
```

`calc_mode` is `'Full Amount'` (apply the entered amount unchanged) or `'As Per Attendance'` (prorate by present days ÷ working days for that payroll month, same as salary absence proration).

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

---

## Org Hierarchy v2 — dotted-line + cross-branch (applied directly via Supabase MCP)

`hierarchy_levels` and `employee_hierarchy` already existed from the prior hierarchy rollout. This
pass reseeded `hierarchy_levels` with the real 21-role structure (CEO down to Cashier, with
multiple roles sharing a level number) and added dotted-line reporting support:

```sql
ALTER TABLE hierarchy_levels ADD COLUMN IF NOT EXISTS is_cross_branch boolean DEFAULT false;

ALTER TABLE employee_hierarchy
  ADD COLUMN IF NOT EXISTS dotted_line_to_employee_id uuid REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS dotted_line_to_name text,
  ADD COLUMN IF NOT EXISTS dotted_line_reason text,
  ADD COLUMN IF NOT EXISTS is_cross_branch boolean DEFAULT false;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hierarchy_levels TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_hierarchy TO anon, authenticated;
```

`hierarchy_levels` was reseeded (old 9-row scheme deleted, existing employee_hierarchy rows
remapped) to: CEO(1) · GM/Finance Manager/Chief Technology Manager(2) · Store Manager/HR
Manager/Chief Cashier/Assistant Finance Manager/Warehouse Manager/Buying Manager/Administration
Manager/Security Manager(3) · Floor Manager/HR Executive/Finance Executive(4) · Department
Manager(5) · Supervisor/Head Cashier(6) · Senior Staff(7) · Staff/Cashier(8).

`leave_requests` already had `current_approver_id/name/code`, `current_level`, `approval_trail`,
`stage_entered_at`, `reminder_sent_at`, `escalated_at` from the prior rollout — the smart routing
walk (`resolveNextApprover` in `src/services/leaveApprovalService.js`) needed no schema changes,
just correctly-seeded `employee_hierarchy.reports_to_employee_id` chains. `escalateStaleApprovals()`
(called once on app load, same pattern as the temp-employee check) reads `stage_entered_at` to send
a 24h reminder and auto-escalate at 48h — there's no server-side cron in this project.

Note: a server-side `check_leave_escalations()` function already exists doing the same 24h/48h
walk (found later, applied directly via Supabase MCP in an earlier session). Both are effectively
idempotent given the `reminder_sent_at`/`escalated_at` guards, but only one is actually needed —
worth consolidating onto whichever one is on a schedule.

---

## Attendance: respect joining_date / last_working_day (applied directly via Supabase MCP)

`process_daily_attendance(from_date, to_date)` used to process every requested day for every
`status = 'Active'` employee, with no floor/ceiling — it would generate Absent rows before an
employee's `joining_date`, and skipped inactive employees entirely (losing their real pre-last-working-day
history too, not just future days). Patched (`CREATE OR REPLACE FUNCTION`) to:
- include employees with `last_working_day` set even if not Active (so their real attendance up to
  that date still processes)
- skip any day before `employees.joining_date`
- skip any day after `employees.last_working_day` for non-Active employees

`employee_hierarchy`, `hierarchy_levels` etc. unaffected. Employees.jsx and EmployeeProfile.jsx
both write `last_working_day` when marking someone Inactive/Resigned — this function is what
actually consumes it now.

## Leave → Attendance/Payroll integration

`leaveApprovalService.js`'s `markAttendanceLeaveDays()` (called on final leave approval) upserts
`attendance_status = 'Leave'` (`review_status = 'Locked'` so ZKT re-sync won't clobber it) for every
day of the approved range. `PayrollAutomation.jsx` already read `attendance_status === "Leave"` into
its `leaveDaysUsed` bucket before this change — this was the one missing write-side step.

## Roster generator: fixed-Sunday default for Management / Warehouse with a blank weekly_off_day (2026-09-02, migration roster_generator_default_sunday_for_mgmt_warehouse)

`generate_employee_work_rosters(from,to)` only ever rostered a weekly off for employees with an
explicit `employees.weekly_off_day`. A blank field is fine for floor / Non-Management staff (their
day off floats and is handled by the client-side Mon–Fri lone-absence forgiveness in
`getWeeklyOffOverrideKeys`), but Management and Warehouse get a *fixed Sunday* by policy and that
forgiveness rule can't cover a Sunday absence — so a blank-field Warehouse/Mgmt employee got no
weekly off at all (found: emp 3076 Tahir Gull, 0 weekly offs in August). The `matches` CTE now
derives an effective off-day: explicit `weekly_off_day` wins, else Sunday (0) for
`staff_level = 'Management' or department ilike '%warehouse%'`, else none. 4/month cap and
Management/Warehouse cap-exemption unchanged. Also set 3076's `weekly_off_day = '0'` explicitly and
regenerated Aug–Oct rosters + reprocessed August.

## Final Settlement rebuild — Phase 2: month lines + atomic RPCs (2026-09-02)

Two migrations, applied via Supabase MCP:
`fnf_phase2_settlement_lines_and_columns` and `fnf_phase2_settlement_rpcs`.

**New table `final_settlement_lines`** — one row per month (or exit line) behind a settlement
total: `settlement_id` (FK, ON DELETE CASCADE), `payroll_month`, `line_type`
(month | released_hold | pay_in_lieu | severance | adjustment), `gross`/`deductions`/`net`,
day counts, and a `detail` jsonb holding the full engine row. RLS on, policies mirroring
`final_settlements` (SELECT for Master/HR/Finance/GM/Audit, ALL for Master/HR), and an
explicit `REVOKE ALL … FROM anon` — this project auto-grants anon on new objects.

**New `final_settlements` columns**: `paid_until_date`, `last_working_day_inclusive`,
`notice_waived`, `pay_in_lieu_days`, `pay_in_lieu_amount`, `released_hold_amount`,
`recoverable_at_exit`, `termination_forfeit_mode` (none | worked_days_only | full),
`settled_through_month`, `window_start`, `window_end`, `is_reversed`, `reversed_by`,
`reversed_at`, `reversal_reason`, `increment_warning`, `leave_balance_snapshot`.

**`UNIQUE (employee_code)` deliberately left in place.** The plan called for swapping it for a
partial unique index (`WHERE NOT is_reversed`) so a rehire's second settlement doesn't
overwrite the first — but `FinalSettlement.jsx` still upserts with `onConflict=employee_code`,
and PostgREST cannot infer a partial index. The swap happens in Phase 3, in the same change
that moves the UI onto the RPC.

**Three RPCs**, all SECURITY DEFINER, role-checked inside, `REVOKE`d from public/anon and
granted to `authenticated` only:
- `process_final_settlement(p_payload jsonb) → uuid` (Master/HR). One transaction: refuses if a
  live settlement exists or if any month being settled is already Published/paid in `payroll`;
  snapshots then zeroes leave balances; deletes every unpaid payroll row from the first settled
  month onward (the old flow only deleted the last-day month, leaving Draft rows behind);
  sets the employee's status and separation dates; inserts the header and its lines; audits.
- `reverse_final_settlement(p_id, p_reason)` (Master). Restores leave from the snapshot, returns
  the employee to Active with dates cleared, marks the settlement reversed rather than deleting it.
- `unpay_final_settlement(p_id, p_reason)` (Master). Clears the paid flags.

Note: `audit_logs` only has `action_type, performed_by, details, created_at`. Several existing
callers insert `action` / `entity` / `entity_id`, which don't exist — those audit writes fail
silently. These RPCs use the real columns.
