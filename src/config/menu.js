export const MENU_ITEMS = [
  // Core HR
  { key: "dashboard",   label: "Dashboard",           icon: "🏢", section: "Core HR",          roles: ["Master","HR","Finance"] },
  { key: "employees",   label: "Employees",            icon: "👥", section: "Core HR",          roles: ["Master","HR"] },
  { key: "departments", label: "Departments",          icon: "🏗️", section: "Core HR",          roles: ["Master","HR"] },

  // Attendance
  { key: "attendance",  label: "Attendance",           icon: "⏱️", section: "Attendance",       roles: ["Master","HR","Finance","Employee"] },
  { key: "roster",      label: "Roster",               icon: "📅", section: "Attendance",       roles: ["Master","HR"] },
  { key: "zkt",         label: "ZKT Sync",             icon: "🛰️", section: "Attendance",       roles: ["Master","HR"] },

  // Leave
  { key: "leave",       label: "Leave",                icon: "🌴", section: "Leave",             roles: ["Master","HR","Employee"] },

  // Workforce
  { key: "workforce",   label: "Workforce",            icon: "🏬", section: "Workforce",         roles: ["Master","HR","Finance"] },

  // Payroll & Finance
  { key: "payroll-automation", label: "Payroll",       icon: "💰", section: "Payroll & Finance", roles: ["Master","Finance"] },
  { key: "salary-reports",     label: "Salary Reports",icon: "📊", section: "Payroll & Finance", roles: ["Master","HR","Finance"] },
  { key: "allowances",         label: "Allowances",    icon: "📌", section: "Payroll & Finance", roles: ["Master","HR","Finance"] },
  { key: "payroll-extras",     label: "Adjustments & Tax", icon: "🧾", section: "Payroll & Finance", roles: ["Master","HR","Finance"] },
  { key: "loans",              label: "Loans & Settlement", icon: "💳", section: "Payroll & Finance", roles: ["Master","HR","Finance","Employee"] },

  // System
  { key: "imports",      label: "Data Management",     icon: "🗄️", section: "System",           roles: ["Master","HR","Finance"] },
  { key: "settings",     label: "Settings",            icon: "⚙️", section: "System",           roles: ["Master"] },
  { key: "ai-assistant", label: "AI Assistant",        icon: "🤖", section: "System",           roles: ["Master","HR","Finance","Employee"] },
];
