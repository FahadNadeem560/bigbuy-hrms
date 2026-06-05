export const MENU_ITEMS = [
  // Core HR
  { key: "dashboard", label: "Dashboard", icon: "🏢", roles: ["Master", "HR", "Finance"] },
  { key: "executive", label: "Executive View", icon: "📡", roles: ["Master", "HR", "Finance"] },
  { key: "employees", label: "Employees", icon: "👥", roles: ["Master", "HR"] },
  { key: "profile", label: "Employee Profile", icon: "🧑", roles: ["Master", "HR"] },
  { key: "recruitment", label: "Recruitment", icon: "🎯", roles: ["Master", "HR"] },
  { key: "documents", label: "Documents", icon: "🗂️", roles: ["Master", "HR"] },
  { key: "credentials", label: "Staff Credentials", icon: "🔑", roles: ["Master", "HR"] },

  // Attendance
  { key: "attendance", label: "Attendance", icon: "⏱️", roles: ["Master", "HR", "Finance", "Employee"] },
  { key: "timesheet", label: "Timesheet", icon: "📋", roles: ["Master", "HR", "Finance", "Employee"] },
  { key: "adjustments", label: "Adjustments", icon: "✏️", roles: ["Master", "HR"] },
  { key: "missing-punch", label: "Missing Punch", icon: "🔍", roles: ["Master", "HR"] },
  { key: "alerts", label: "Attendance Alerts", icon: "🔔", roles: ["Master", "HR"] },
  { key: "zkt", label: "ZKT Live Sync", icon: "🛰️", roles: ["Master", "HR"] },
  { key: "audit", label: "Attendance Audit", icon: "🕵️", roles: ["Master", "HR"] },

  // Leave
  { key: "leave", label: "Leave Management", icon: "🌴", roles: ["Master", "HR", "Employee"] },
  { key: "leave-liability", label: "Leave Liability", icon: "📉", roles: ["Master", "HR", "Finance"] },

  // Workforce
  { key: "manpower", label: "Manpower Dashboard", icon: "👷", roles: ["Master", "HR"] },
  { key: "branch-dashboard", label: "Branch Dashboard", icon: "🏬", roles: ["Master", "HR", "Finance"] },
  { key: "transfers", label: "Branch Transfers", icon: "🔄", roles: ["Master", "HR"] },
  { key: "warnings", label: "Warnings & Notices", icon: "⚠️", roles: ["Master", "HR"] },
  { key: "performance", label: "Performance & KPI", icon: "⭐", roles: ["Master", "HR"] },
  { key: "assets", label: "Uniform & Assets", icon: "👕", roles: ["Master", "HR"] },

  // Payroll & Finance
  { key: "payroll-automation", label: "Payroll Automation", icon: "💰", roles: ["Master", "Finance"] },
  { key: "payroll", label: "Payroll (Classic)", icon: "📊", roles: ["Master", "Finance"] },
  { key: "approval", label: "Salary Approval", icon: "🔒", roles: ["Master", "Finance"] },
  { key: "loans", label: "Loans", icon: "💳", roles: ["Master", "HR", "Finance", "Employee"] },
  { key: "increments", label: "Salary Increments", icon: "📈", roles: ["Master", "HR", "Finance"] },
  { key: "settlement", label: "Final Settlement", icon: "🤝", roles: ["Master", "HR", "Finance"] },

  // System
  { key: "imports", label: "Import Center", icon: "📥", roles: ["Master", "HR"] },
  { key: "exports", label: "Excel Export", icon: "📤", roles: ["Master", "HR", "Finance"] },
  { key: "reports", label: "Reports", icon: "📄", roles: ["Master", "HR", "Finance"] },
  { key: "policies", label: "Policy Rules", icon: "⚙️", roles: ["Master", "HR"] },
  { key: "portal", label: "Employee Portal", icon: "🧑‍💼", roles: ["Master", "Employee"] },
  { key: "users", label: "Users & Roles", icon: "🔐", roles: ["Master"] },
  { key: "ai-assistant", label: "AI Assistant", icon: "🤖", roles: ["Master", "HR", "Finance", "Employee"] },
];
