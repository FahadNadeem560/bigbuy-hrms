export const MENU_ITEMS = [
  // Core HR
  { key: "dashboard",    label: "Dashboard",        icon: "🏢", section: "Core HR",          roles: ["Master", "HR", "Finance"] },
  { key: "employees",    label: "Employees",         icon: "👥", section: "Core HR",          roles: ["Master", "HR"] },
  { key: "recruitment",  label: "Recruitment",       icon: "🎯", section: "Core HR",          roles: ["Master", "HR"] },
  { key: "documents",    label: "Documents",         icon: "🗂️", section: "Core HR",          roles: ["Master", "HR"] },
  { key: "credentials",  label: "Staff Credentials", icon: "🔑", section: "Core HR",          roles: ["Master", "HR"] },

  // Attendance
  { key: "attendance",     label: "Attendance",       icon: "⏱️", section: "Attendance", roles: ["Master", "HR", "Finance", "Employee"] },
  { key: "timesheet",      label: "Timesheet",        icon: "📋", section: "Attendance", roles: ["Master", "HR", "Finance", "Employee"] },
  { key: "adjustments",    label: "Adjustments",      icon: "✏️", section: "Attendance", roles: ["Master", "HR"] },
  { key: "missing-punch",  label: "Missing Punch",    icon: "🔍", section: "Attendance", roles: ["Master", "HR"] },
  { key: "alerts",         label: "Attendance Alerts",icon: "🔔", section: "Attendance", roles: ["Master", "HR"] },
  { key: "zkt",            label: "ZKT Live Sync",    icon: "🛰️", section: "Attendance", roles: ["Master", "HR"] },

  // Leave
  { key: "leave",           label: "Leave Management", icon: "🌴", section: "Leave", roles: ["Master", "HR", "Employee"] },
  { key: "leave-liability", label: "Leave Liability",  icon: "📉", section: "Leave", roles: ["Master", "HR", "Finance"] },

  // Workforce
  { key: "branch-dashboard", label: "Branch Dashboard",   icon: "🏬", section: "Workforce", roles: ["Master", "HR", "Finance"] },
  { key: "transfers",        label: "Branch Transfers",   icon: "🔄", section: "Workforce", roles: ["Master", "HR"] },
  { key: "warnings",         label: "Warnings & Notices", icon: "⚠️", section: "Workforce", roles: ["Master", "HR"] },
  { key: "performance",      label: "Performance & KPI",  icon: "⭐", section: "Workforce", roles: ["Master", "HR"] },
  { key: "assets",           label: "Uniform & Assets",   icon: "👕", section: "Workforce", roles: ["Master", "HR"] },

  // Payroll & Finance
  { key: "payroll-automation", label: "Payroll",           icon: "💰", section: "Payroll & Finance", roles: ["Master", "Finance"] },
  { key: "loans",              label: "Loans",             icon: "💳", section: "Payroll & Finance", roles: ["Master", "HR", "Finance", "Employee"] },
  { key: "increments",         label: "Salary Increments", icon: "📈", section: "Payroll & Finance", roles: ["Master", "HR", "Finance"] },
  { key: "settlement",         label: "Final Settlement",  icon: "🤝", section: "Payroll & Finance", roles: ["Master", "HR", "Finance"] },

  // System
  { key: "imports",      label: "Data Management", icon: "🗄️", section: "System", roles: ["Master", "HR", "Finance"] },
  { key: "reports",      label: "Reports",         icon: "📄", section: "System", roles: ["Master", "HR", "Finance"] },
  { key: "policies",     label: "Policy Rules",    icon: "⚙️", section: "System", roles: ["Master", "HR"] },
  { key: "portal",       label: "Employee Portal", icon: "🧑‍💼", section: "System", roles: ["Master", "Employee"] },
  { key: "users",        label: "Users & Roles",   icon: "🔐", section: "System", roles: ["Master"] },
  { key: "ai-assistant", label: "AI Assistant",    icon: "🤖", section: "System", roles: ["Master", "HR", "Finance", "Employee"] },
];
