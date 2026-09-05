import { supabase } from "../lib/supabaseClient.js";

const DUE_NOTIFY_ROLES = ["Master", "GM", "HR"];

function monthsBetween(fromIso, to) {
  if (!fromIso) return null;
  return Math.floor((to - new Date(fromIso)) / (30 * 86400000));
}

// Client-triggered on app load (this app has no server cron) — same pattern
// as checkAutoLockPreviousMonth/sendHoldReminderIfNeeded. Dedupes per
// branch+role via a DB lookup (not localStorage) so it only fires once per
// calendar month org-wide, not once per browser.
export async function checkIncrementDueNotifications() {
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const monthStartIso = monthStart.toISOString();
  const monthEndStr = monthEnd.toISOString().slice(0, 10);

  const { data: employees } = await supabase.from("employees")
    .select("employee_code, full_name, branch, department, salary, joining_date, last_increment_date, next_increment_due")
    .eq("status", "Active")
    .not("next_increment_due", "is", null)
    .lte("next_increment_due", monthEndStr);
  if (!employees || employees.length === 0) return;

  // Someone parked via Dismiss or Remind Later has already been actioned by
  // HR — the whole point of both is to stop being told about them, so they
  // must drop out of this digest too, not just the on-screen list. A snooze
  // stops muting them the moment its reminder matures (isReminderDue), which
  // is the same instant they reappear on the Due tab.
  const { data: parked } = await supabase.from("increment_due_dismissals")
    .select("employee_code, due_date, kind, remind_month");
  const mutedKeys = new Set(
    (parked || [])
      .filter(d => d.kind !== "snoozed" || !isReminderDue(d, today))
      .map(d => `${d.employee_code}::${d.due_date}`)
  );

  const visible = employees.filter(e => !mutedKeys.has(`${e.employee_code}::${e.next_increment_due}`));
  if (visible.length === 0) return;

  const byBranch = {};
  visible.forEach(e => {
    const branch = e.branch || "Unassigned";
    (byBranch[branch] = byBranch[branch] || []).push(e);
  });

  for (const [branch, emps] of Object.entries(byBranch)) {
    for (const role of DUE_NOTIFY_ROLES) {
      const { data: existing } = await supabase.from("notifications").select("id")
        .eq("type", "increment_due_branch").eq("recipient_role", role)
        .eq("related_branch", branch).gte("created_at", monthStartIso).limit(1);
      if (existing && existing.length > 0) continue;

      const lines = emps.map(e => {
        if (!e.last_increment_date) {
          const monthsSinceJoin = monthsBetween(e.joining_date, today);
          return `${e.full_name} (${e.department || "—"}) has never received an increment.${monthsSinceJoin != null ? ` Joined ${monthsSinceJoin} months ago.` : ""}`;
        }
        const monthsAgo = monthsBetween(e.last_increment_date, today);
        return `${e.full_name} (${e.department || "—"}) is due for increment review. Last increment: ${e.last_increment_date} (${monthsAgo} months ago). Current salary: Rs. ${Number(e.salary || 0).toLocaleString()}.`;
      });

      await supabase.from("notifications").insert({
        recipient_role: role, type: "increment_due_branch",
        title: `${branch}: ${emps.length} employee${emps.length > 1 ? "s" : ""} due for increment review`,
        message: lines.join(" "),
        related_branch: branch, link: branch, is_read: false,
      }).then(() => {}, () => {});
    }
  }
}

// ══════════════════════ Increment Approval Workflow ══════════════════════
// HR can only propose (insert Pending, no salary change yet). Master
// applies instantly via the existing apply_salary_increment RPC (called
// directly from IncrementHistory.jsx, not here). GM never proposes — only
// approves/rejects via the functions below.

export async function proposeIncrement({ employeeCode, employeeName, oldSalary, newSalary, effectiveFrom, type, submittedByRole, confidentialIncentiveAtTime }) {
  if (!(Number(newSalary) > 0)) throw new Error("New salary must be greater than zero.");
  const incrementAmount = Number(newSalary) - Number(oldSalary || 0);
  const incrementPct = Number(oldSalary) > 0 ? Math.round((incrementAmount / Number(oldSalary)) * 10000) / 100 : null;
  const { error } = await supabase.from("salary_increments").insert({
    employee_code: employeeCode, employee_name: employeeName,
    old_salary: oldSalary, new_salary: newSalary, effective_from: effectiveFrom,
    increment_amount: incrementAmount, increment_percentage: incrementPct,
    type: type || "Increment", status: "Pending", submitted_by: submittedByRole,
    confidential_incentive_at_time: confidentialIncentiveAtTime ?? null,
  });
  if (error) throw error;
  await Promise.all(["Master", "GM"].map(r => supabase.from("notifications").insert({
    recipient_role: r, type: "increment_proposed",
    title: "Increment Proposed",
    message: `${submittedByRole} proposed an increment for ${employeeName} — Rs.${Number(oldSalary || 0).toLocaleString()} → Rs.${Number(newSalary).toLocaleString()} effective ${effectiveFrom}. Awaiting approval.`,
    is_read: false,
  }))).catch(() => {});
}

export async function approveIncrement(incrementId, approverName) {
  const { data: row, error } = await supabase.rpc("approve_salary_increment", {
    p_increment_id: incrementId, p_approver_name: approverName,
  });
  if (error) throw error;
  if (row?.submitted_by) {
    await supabase.from("notifications").insert({
      recipient_role: row.submitted_by, type: "increment_decision",
      title: "Increment Approved",
      message: `Increment for ${row.employee_name} approved: Rs.${Number(row.old_salary || 0).toLocaleString()} → Rs.${Number(row.new_salary).toLocaleString()}.`,
      is_read: false,
    }).then(() => {}, () => {});
  }
  return row;
}

// ══════════════════════ Due-for-Increment dismissals ══════════════════════
// Scoped to the employee's current next_increment_due — if that date ever
// changes (a new increment is applied, or it's manually pushed out), the
// old dismissal no longer matches and the employee reappears on the list.
//
// Two kinds share this table:
//   "dismissed" — hidden until that due date itself moves.
//   "snoozed"   — hidden only until the reminder for remind_month is due,
//                 then back on the list plus a one-off notification.

// How far ahead of the chosen payroll month the reminder fires. Landing a few
// days BEFORE the month opens is deliberate: the increment then already exists
// when the month starts and can be dated from the 1st, rather than HR being
// told about it once the month is already running.
export const REMINDER_LEAD_DAYS = 5;

// Local-midnight Date the reminder for a "YYYY-MM" payroll month becomes due.
// Built from numeric parts (not Date.parse of a string) so it stays in the
// browser's own timezone and doesn't slip a day either side of UTC.
export function reminderDueDate(remindMonth) {
  if (!remindMonth) return null;
  const [y, m] = String(remindMonth).split("-").map(Number);
  if (!y || !m) return null;
  return new Date(y, m - 1, 1 - REMINDER_LEAD_DAYS);
}

// True once a snooze has matured — i.e. the employee belongs back on the
// active Due list. A row with no remind_month never matures.
export function isReminderDue(row, now = new Date()) {
  if (!row || row.kind !== "snoozed") return false;
  const due = reminderDueDate(row.remind_month);
  return !!due && now >= due;
}

export async function fetchIncrementDueDismissals() {
  const { data, error } = await supabase.from("increment_due_dismissals").select("*").order("dismissed_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function dismissIncrementDue({ employeeCode, employeeName, dueDate, reason, dismissedBy }) {
  const { error } = await supabase.from("increment_due_dismissals").upsert({
    employee_code: employeeCode, employee_name: employeeName, due_date: dueDate,
    reason: reason || null, dismissed_by: dismissedBy, dismissed_at: new Date().toISOString(),
    // Explicit: this row may be overwriting an earlier snooze on the same
    // employee+due_date, and the upsert replaces the whole row.
    kind: "dismissed", remind_month: null, reminded_at: null,
  }, { onConflict: "employee_code,due_date" });
  if (error) throw error;
}

// "Remind Later" — hide the employee until REMINDER_LEAD_DAYS before
// remindMonth ("YYYY-MM") begins. reminded_at is reset so re-snoozing an
// employee who was already reminded once arms the notification again.
export async function snoozeIncrementDue({ employeeCode, employeeName, dueDate, remindMonth, reason, snoozedBy }) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(remindMonth || ""))) {
    throw new Error("Pick the payroll month to be reminded before.");
  }
  const { error } = await supabase.from("increment_due_dismissals").upsert({
    employee_code: employeeCode, employee_name: employeeName, due_date: dueDate,
    reason: reason || null, dismissed_by: snoozedBy, dismissed_at: new Date().toISOString(),
    kind: "snoozed", remind_month: remindMonth, reminded_at: null,
  }, { onConflict: "employee_code,due_date" });
  if (error) throw error;
}

export async function restoreIncrementDue(id) {
  const { error } = await supabase.from("increment_due_dismissals").delete().eq("id", id);
  if (error) throw error;
}

// Client-triggered on app load, same as checkIncrementDueNotifications above.
// Fires one notification per matured snooze, latched by reminded_at (a DB
// column, not localStorage) so it goes out once org-wide rather than once per
// browser. The employee is already back on the Due list by this point — the
// list reads the same isReminderDue() — so a failure here delays the nudge
// but never hides anyone.
export async function checkIncrementReminders() {
  const now = new Date();
  const { data: rows } = await supabase.from("increment_due_dismissals")
    .select("*").eq("kind", "snoozed").is("reminded_at", null);
  if (!rows || rows.length === 0) return;

  const matured = rows.filter(r => isReminderDue(r, now));
  if (matured.length === 0) return;

  for (const row of matured) {
    // Only nudge for someone still active and still sitting on the same due
    // date — if the increment was already applied, next_increment_due has
    // moved and the reminder is stale.
    const { data: emp } = await supabase.from("employees")
      .select("employee_code, full_name, department, salary, next_increment_due, status")
      .eq("employee_code", row.employee_code).maybeSingle();

    const stillPending = emp && emp.status === "Active" && emp.next_increment_due === row.due_date;
    if (stillPending) {
      const monthLabel = new Date(`${row.remind_month}-01T00:00:00`)
        .toLocaleString("en-US", { month: "long", year: "numeric" });
      await Promise.all(DUE_NOTIFY_ROLES.map(r => supabase.from("notifications").insert({
        recipient_role: r, type: "increment_reminder",
        title: `Increment reminder: ${emp.full_name}`,
        message: `${emp.full_name} (${emp.department || "—"}) was snoozed for review before ${monthLabel} payroll${row.reason ? ` — "${row.reason}"` : ""}. Due date ${row.due_date}, current salary Rs. ${Number(emp.salary || 0).toLocaleString()}. They are back on the Due for Increment list.`,
        is_read: false,
      }))).catch(() => {});
    }
    // Latch either way: a stale reminder shouldn't be retried on every load.
    await supabase.from("increment_due_dismissals")
      .update({ reminded_at: new Date().toISOString() }).eq("id", row.id)
      .then(() => {}, () => {});
  }
}

export async function rejectIncrement(incrementId, approverName, reason) {
  if (!reason || !reason.trim()) throw new Error("A rejection reason is required.");
  const { data: inc, error: fetchErr } = await supabase.from("salary_increments").select("*").eq("id", incrementId).single();
  if (fetchErr) throw fetchErr;
  const { error } = await supabase.from("salary_increments").update({
    status: "Rejected", rejection_reason: reason, approved_by: approverName, approved_at: new Date().toISOString(),
  }).eq("id", incrementId);
  if (error) throw error;
  if (inc?.submitted_by) {
    await supabase.from("notifications").insert({
      recipient_role: inc.submitted_by, type: "increment_decision",
      title: "Increment Rejected",
      message: `Increment for ${inc.employee_name} rejected. Reason: ${reason}`,
      is_read: false,
    }).then(() => {}, () => {});
  }
}
