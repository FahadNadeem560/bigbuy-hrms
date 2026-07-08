import React from "react";
import { Button } from "./ui.jsx";
import NotificationBell from "./NotificationBell.jsx";

function groupBySection(items) {
  const order = [];
  const map = {};
  for (const item of items) {
    if (!map[item.section]) { map[item.section] = []; order.push(item.section); }
    map[item.section].push(item);
  }
  return order.map(section => ({ section, items: map[section] }));
}

export default function Layout({ user, role, onLogout, active, setActive, visibleMenu, children }) {
  const sections = groupBySection(visibleMenu);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="flex">

        {/* Sidebar */}
        <aside className="hidden lg:flex w-72 min-h-screen bg-slate-950 text-white p-5 flex-col fixed left-0 top-0 bottom-0">
          <div className="mb-6">
            <div className="text-2xl font-bold">Big Buy HRMS</div>
            <div className="text-slate-400 text-sm mt-1">Staff • Attendance • Payroll</div>
          </div>

          <nav className="flex-1 overflow-y-auto space-y-4">
            {sections.map(({ section, items }) => (
              <div key={section}>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-widest px-3 mb-1">{section}</div>
                <div className="space-y-0.5">
                  {items.map(item => (
                    <button key={item.key} onClick={() => setActive(item.key)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-sm transition-colors ${active === item.key ? "bg-white text-slate-950 font-medium" : "text-slate-300 hover:bg-slate-800 hover:text-white"}`}>
                      <span className="text-base leading-none">{item.icon}</span>
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </nav>

          <div className="mt-4 p-4 bg-slate-900 rounded-2xl">
            <div className="text-sm font-semibold">{user.name}</div>
            <div className="text-xs text-slate-400 mt-1">Role: {role}</div>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 p-4 md:p-8 lg:ml-72">
          {/* Top bar */}
          <div className="mb-5 bg-white border border-slate-100 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
            <div>
              <div className="font-bold">{user.name}</div>
              <div className="text-sm text-slate-500">{user.email} • {role}</div>
            </div>
            <div className="flex items-center gap-3">
              <NotificationBell role={role} />
              <span className="px-4 py-2 rounded-2xl border border-slate-200 text-sm text-slate-600">{role}</span>
              <Button onClick={onLogout} variant="secondary" className="rounded-2xl">Log Out</Button>
            </div>
          </div>

          {/* Mobile nav */}
          <div className="lg:hidden mb-4 bg-slate-950 text-white rounded-2xl p-4">
            <div className="font-bold text-xl">Big Buy HRMS</div>
            <div className="flex gap-2 overflow-x-auto mt-4">
              {visibleMenu.map(item => (
                <Button key={item.key} onClick={() => setActive(item.key)} variant="secondary" className="rounded-xl whitespace-nowrap">
                  {item.icon} {item.label}
                </Button>
              ))}
            </div>
          </div>

          {children}
        </main>
      </div>
    </div>
  );
}
