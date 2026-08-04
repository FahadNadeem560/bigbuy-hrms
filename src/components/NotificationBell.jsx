import React, { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../lib/supabaseClient.js";

const TYPE_ICONS = {
  leave_approval: "🌴",
  timesheet_signoff: "📋",
  adjustment: "⚙️",
  attendance: "⏱️",
  settlement: "🤝",
  payroll: "💰",
  increment_due_branch: "📈",
  increment_proposed: "📝",
  increment_decision: "📈",
  advance_requested: "💵",
  advance_issued: "💵",
  general: "🔔",
};

const ADVANCE_NAV = {
  advance_requested: { tab: "loans", subtab: "advances" },
  advance_issued: { tab: "loans", subtab: "advances" },
};

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
    if (n.type === "increment_due_branch" && onNavigate) {
      onNavigate({ tab: "salary-reports", subview: "increments", filter: { view: "due", branch: n.reference_id || n.link } });
    } else if (ADVANCE_NAV[n.type] && onNavigate) {
      onNavigate(ADVANCE_NAV[n.type]);
    }
    setOpen(false);
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
