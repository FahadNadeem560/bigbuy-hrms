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

  const byBranch = {};
  employees.forEach(e => {
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

export async function fetchIncrementDueDismissals() {
  const { data, error } = await supabase.from("increment_due_dismissals").select("*").order("dismissed_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function dismissIncrementDue({ employeeCode, employeeName, dueDate, reason, dismissedBy }) {
  const { error } = await supabase.from("increment_due_dismissals").upsert({
    employee_code: employeeCode, employee_name: employeeName, due_date: dueDate,
    reason: reason || null, dismissed_by: dismissedBy, dismissed_at: new Date().toISOString(),
  }, { onConflict: "employee_code,due_date" });
  if (error) throw error;
}

export async function restoreIncrementDue(id) {
  const { error } = await supabase.from("increment_due_dismissals").delete().eq("id", id);
  if (error) throw error;
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
