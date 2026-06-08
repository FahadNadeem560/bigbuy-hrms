import React, { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../lib/supabaseClient.js";

const TYPE_ICONS = {
  leave_approval: "🌴",
  timesheet_signoff: "📋",
  adjustment: "⚙️",
  attendance: "⏱️",
  settlement: "🤝",
  payroll: "💰",
  general: "🔔",
};

export default function NotificationBell({ role, employeeCode }) {
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
                <button key={n.id} onClick={() => markRead(n.id)}
                  className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition ${!n.is_read ? "bg-blue-50/50" : ""}`}>
                  <div className="flex gap-2.5 items-start">
                    <span className="text-lg mt-0.5 flex-shrink-0">{TYPE_ICONS[n.type] || "🔔"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-800 truncate">{n.title}</div>
                      <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.message}</div>
                      <div className="text-[10px] text-slate-400 mt-1">{n.created_at?.slice(0, 16).replace("T", " ")}</div>
                    </div>
                    {!n.is_read && <span className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />}
                  </div>
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
