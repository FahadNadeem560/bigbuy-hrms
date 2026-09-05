import React, { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../lib/supabaseClient.js";

const TYPE_ICONS = {
  leave_approval: "🌴",
  timesheet_signoff: "📋",
  adjustment: "⚙️",
  attendance: "⏱️",
  attendance_status_change: "⏱️",
  attendance_adjustment: "⏱️",
  settlement: "🤝",
  payroll: "💰",
  payroll_verification: "✅",
  payroll_flag: "🚩",
  increment_due_branch: "📈",
  increment_reminder: "⏰",
  increment_proposed: "📝",
  increment_decision: "📈",
  loan_proposed: "💳",
  loan_decision: "💳",
  advance_requested: "💵",
  advance_issued: "💵",
  advance_decision: "💵",
  general: "🔔",
  test: "🔔",
};

// Where a notification takes you when clicked. `subtab` is forwarded to the
// destination page's inner tab (Loans hub / Approval Queue / Payroll).
const TYPE_NAV = {
  attendance_status_change: { tab: "attendance" },
  attendance_adjustment:    { tab: "attendance" },
  attendance:               { tab: "attendance" },
  adjustment:               { tab: "approval-queue", subtab: "adjustments" },
  leave_approval:           { tab: "approval-queue", subtab: "leave" },
  timesheet_signoff:        { tab: "approval-queue", subtab: "timesheet" },
  increment_proposed:       { tab: "approval-queue", subtab: "increments" },
  increment_decision:       { tab: "salary-reports" },
  increment_due_branch:     { tab: "salary-reports" },
  increment_reminder:       { tab: "salary-reports" },
  loan_proposed:            { tab: "approval-queue", subtab: "loans" },
  loan_decision:            { tab: "loans", subtab: "loans" },
  advance_requested:        { tab: "loans", subtab: "advances" },
  advance_issued:           { tab: "loans", subtab: "advances" },
  advance_decision:         { tab: "loans", subtab: "advances" },
  payroll_verification:     { tab: "payroll-automation" },
  payroll:                  { tab: "payroll-automation" },
  payroll_flag:             { tab: "payroll-automation" },
  settlement:               { tab: "payroll-automation", subtab: "settlement" },
};

// notification.link sometimes carries a bare page key (e.g. "loans") — trust it
// only if it names a page we know how to route to.
const KNOWN_TABS = new Set([
  "attendance", "approval-queue", "salary-reports", "loans", "payroll-automation",
  "leave", "workforce", "payroll-extras", "allowances",
]);

export default function NotificationBell({ role, employeeCode, onNavigate }) {
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef(null);

  const load = useCallback(async () => {
    try {
      let q = supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(20);
      if (employeeCode) {
        q = q.or(`recipient_code.eq.${employeeCode},recipient_role.eq.${role}`);
      } else if (role) {
        q = q.eq("recipient_role", role);
      }
      const { data } = await q;
      const rows = data || [];
      setNotifs(rows);
      setUnread(rows.filter(n => !n.is_read).length);
    } catch { /* notifications table may not exist yet */ }
  }, [role, employeeCode]);

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  async function markAllRead() {
    const ids = notifs.filter(n => !n.is_read).map(n => n.id);
    if (!ids.length) return;
    await supabase.from("notifications").update({ is_read: true }).in("id", ids);
    setNotifs(n => n.map(x => ({ ...x, is_read: true })));
    setUnread(0);
  }

  async function markRead(id) {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    setNotifs(n => n.map(x => x.id === id ? { ...x, is_read: true } : x));
    setUnread(c => Math.max(0, c - 1));
  }

  async function dismiss(n, e) {
    e.stopPropagation();
    await supabase.from("notifications").delete().eq("id", n.id);
    setNotifs(list => list.filter(x => x.id !== n.id));
    if (!n.is_read) setUnread(c => Math.max(0, c - 1));
  }

  function handleClick(n) {
    markRead(n.id);
    setOpen(false);
    if (!onNavigate) return;

    // Both land on the Due for Increment tab. increment_reminder is about one
    // named employee, so it opens the list unfiltered by branch rather than
    // narrowing to a branch it never recorded.
    if (n.type === "increment_due_branch" || n.type === "increment_reminder") {
      onNavigate({ type: n.type, tab: "salary-reports", filter: { view: "due", branch: n.type === "increment_due_branch" ? (n.related_branch || n.link || null) : null } });
      return;
    }
    const nav = TYPE_NAV[n.type];
    const linkTab = KNOWN_TABS.has(n.link) ? n.link : null;
    if (nav) onNavigate({ type: n.type, tab: linkTab || nav.tab, subtab: nav.subtab });
    else if (linkTab) onNavigate({ type: n.type, tab: linkTab });
    // unknown type with no usable link — nothing sensible to open
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)}
        className="relative p-2 rounded-xl hover:bg-slate-100 transition flex items-center justify-center">
        <span className="text-xl leading-none">🔔</span>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-slate-200 rounded-2xl shadow-xl z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <span className="font-bold text-slate-900 text-sm">Notifications {unread > 0 && <span className="text-red-500">({unread})</span>}</span>
            {unread > 0 && <button onClick={markAllRead} className="text-xs text-blue-600 hover:underline">Mark all read</button>}
          </div>
          <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-50">
            {notifs.length === 0
              ? <div className="px-4 py-10 text-center text-slate-400 text-sm">No notifications</div>
              : notifs.map(n => (
                <div key={n.id} role="button" tabIndex={0} onClick={() => handleClick(n)}
                  onKeyDown={e => { if (e.key === "Enter") handleClick(n); }}
                  className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition cursor-pointer ${!n.is_read ? "bg-blue-50/50" : ""}`}>
                  <div className="flex gap-2.5 items-start">
                    <span className="text-lg mt-0.5 flex-shrink-0">{TYPE_ICONS[n.type] || "🔔"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-800 truncate">{n.title}</div>
                      <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.message}</div>
                      <div className="text-[10px] text-slate-400 mt-1">{n.created_at?.slice(0, 16).replace("T", " ")}</div>
                    </div>
                    {!n.is_read && <span className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />}
                    <button onClick={e => dismiss(n, e)} title="Dismiss"
                      className="text-slate-300 hover:text-slate-600 hover:bg-slate-200 rounded-lg w-5 h-5 flex items-center justify-center flex-shrink-0 text-sm leading-none transition">
                      ✕
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
