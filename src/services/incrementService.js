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
        .eq("reference_id", branch).gte("created_at", monthStartIso).limit(1);
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
        reference_id: branch, reference_type: "increment_due_branch",
        link: branch, is_read: false,
      }).catch(() => {});
    }
  }
}
