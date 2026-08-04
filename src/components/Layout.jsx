import React, { useState, useEffect } from "react";
import { Button } from "./ui.jsx";
import NotificationBell from "./NotificationBell.jsx";
import ChangePasswordModal from "./ChangePasswordModal.jsx";

function groupBySection(items) {
  const order = [];
  const map = {};
  for (const item of items) {
    if (!map[item.section]) { map[item.section] = []; order.push(item.section); }
    map[item.section].push(item);
  }
  return order.map(section => ({ section, items: map[section] }));
}

export default function Layout({ user, role, onLogout, active, setActive, visibleMenu, children, onNotificationNavigate }) {
  const sections = groupBySection(visibleMenu);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("sidebarCollapsed") === "true"; } catch { return false; }
  });
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  useEffect(() => {
    try { localStorage.setItem("sidebarCollapsed", String(collapsed)); } catch {}
  }, [collapsed]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="flex">

        {/* Sidebar */}
        <aside className={`hidden lg:flex ${collapsed ? "w-16" : "w-72"} min-h-screen bg-slate-950 text-white p-5 flex-col fixed left-0 top-0 bottom-0 print:hidden transition-all duration-200 ease-in-out overflow-visible`}>
          {/* Collapse toggle */}
          <button
            onClick={() => setCollapsed(c => !c)}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="absolute -right-3 top-8 w-6 h-6 rounded-full bg-slate-800 border border-slate-600 text-white flex items-center justify-center text-[10px] hover:bg-slate-700 z-20"
          >
            {collapsed ? "▶" : "◀"}
          </button>

          <div className="mb-6 overflow-hidden">
            {collapsed ? (
              <div className="text-2xl font-bold text-center">BB</div>
            ) : (
              <>
                <div className="text-2xl font-bold whitespace-nowrap">Big Buy HRMS</div>
                <div className="text-slate-400 text-sm mt-1 whitespace-nowrap">Staff • Attendance • Payroll</div>
              </>
            )}
          </div>

          <nav className="flex-1 overflow-y-auto overflow-x-hidden space-y-4">
            {sections.map(({ section, items }) => (
              <div key={section}>
                {!collapsed && (
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-widest px-3 mb-1 whitespace-nowrap">{section}</div>
                )}
                <div className="space-y-0.5">
                  {items.map(item => (
                    <button key={item.key} onClick={() => setActive(item.key)}
                      title={collapsed ? item.label : undefined}
                      className={`w-full flex items-center ${collapsed ? "justify-center" : "gap-3"} px-3 py-2.5 rounded-xl text-left text-sm transition-colors ${active === item.key ? "bg-white text-slate-950 font-medium" : "text-slate-300 hover:bg-slate-800 hover:text-white"}`}>
                      <span className="text-base leading-none">{item.icon}</span>
                      {!collapsed && <span className="whitespace-nowrap">{item.label}</span>}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </nav>

          <div className={`mt-4 ${collapsed ? "p-2" : "p-4"} bg-slate-900 rounded-2xl overflow-hidden`}>
            {collapsed ? (
              <div className="text-center text-xs" title={`${user.name} · ${role}`}>👤</div>
            ) : (
              <>
                <div className="text-sm font-semibold whitespace-nowrap">{user.name}</div>
                <div className="text-xs text-slate-400 mt-1 whitespace-nowrap">Role: {role}</div>
              </>
            )}
          </div>
        </aside>

        {/* Mobile nav drawer */}
        {mobileNavOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-black/40" onClick={() => setMobileNavOpen(false)} />
            <aside className="absolute left-0 top-0 bottom-0 w-72 max-w-[85vw] bg-slate-950 text-white p-5 flex flex-col overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <div className="text-xl font-bold whitespace-nowrap">Big Buy HRMS</div>
                  <div className="text-slate-400 text-xs mt-1 whitespace-nowrap">Staff • Attendance • Payroll</div>
                </div>
                <button onClick={() => setMobileNavOpen(false)} aria-label="Close menu"
                  className="w-8 h-8 shrink-0 rounded-full bg-slate-800 border border-slate-600 text-white flex items-center justify-center">✕</button>
              </div>
              <nav className="flex-1 space-y-4">
                {sections.map(({ section, items }) => (
                  <div key={section}>
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-widest px-3 mb-1">{section}</div>
                    <div className="space-y-0.5">
                      {items.map(item => (
                        <button key={item.key} onClick={() => { setActive(item.key); setMobileNavOpen(false); }}
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
          </div>
        )}

        {/* Main */}
        <main className={`flex-1 p-4 md:p-8 ${collapsed ? "lg:ml-16" : "lg:ml-72"} print:ml-0 print:p-0 transition-all duration-200 ease-in-out`}>
          {/* Top bar */}
          <div className="mb-5 bg-white border border-slate-100 rounded-2xl p-3 md:p-4 shadow-sm flex items-center justify-between gap-3 print:hidden">
            <div className="flex items-center gap-3 min-w-0">
              <button onClick={() => setMobileNavOpen(true)} aria-label="Open menu"
                className="lg:hidden shrink-0 w-9 h-9 rounded-xl bg-slate-950 text-white flex items-center justify-center text-lg">☰</button>
              <div className="min-w-0">
                <div className="font-bold truncate">{user.name}</div>
                <div className="text-sm text-slate-500 truncate hidden sm:block">{user.email} • {role}</div>
                <div className="text-xs text-slate-500 sm:hidden">{role}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 md:gap-3 shrink-0">
              <NotificationBell role={role} onNavigate={onNotificationNavigate} />
              <span className="hidden md:inline-block px-4 py-2 rounded-2xl border border-slate-200 text-sm text-slate-600">{role}</span>
              <Button onClick={() => setShowChangePassword(true)} variant="outline" className="hidden md:inline-flex rounded-2xl">Change Password</Button>
              <Button onClick={onLogout} variant="secondary" className="hidden md:inline-flex rounded-2xl">Log Out</Button>
              <div className="relative md:hidden">
                <button onClick={() => setShowMobileMenu(m => !m)} aria-label="More options"
                  className="w-9 h-9 rounded-xl border border-slate-200 flex items-center justify-center text-slate-600 text-lg leading-none">⋮</button>
                {showMobileMenu && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setShowMobileMenu(false)} />
                    <div className="absolute right-0 top-full mt-2 w-44 bg-white border border-slate-200 rounded-xl shadow-lg z-30 overflow-hidden">
                      <button onClick={() => { setShowMobileMenu(false); setShowChangePassword(true); }}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50">Change Password</button>
                      <button onClick={onLogout} className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50">Log Out</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {showChangePassword && <ChangePasswordModal close={() => setShowChangePassword(false)} />}

          {children}
        </main>
      </div>
    </div>
  );
}
