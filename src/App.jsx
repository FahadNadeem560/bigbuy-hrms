import React, { useMemo, useState } from "react";
import Layout from "./components/Layout.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import { MENU_ITEMS } from "./config/menu.js";

const demoUser = { name: "Fahad Nadeem", email: "fahad-nadeem@hotmail.com", role: "Master" };
const demoAttendance = [];
const demoPayroll = [];

export default function BigBuyHRMS() {
  const [active, setActive] = useState("dashboard");
  const [role, setRole] = useState("Master");
  const visibleMenu = useMemo(() => MENU_ITEMS.filter((item) => item.roles.includes(role)), [role]);
  return (
    <Layout user={demoUser} role={role} setRole={setRole} active={active} setActive={setActive} visibleMenu={visibleMenu}>
      <Dashboard activeEmployees={[]} attendanceRows={demoAttendance} payrollRows={demoPayroll} payrollStatus="Debug Build" setActive={setActive} />
    </Layout>
  );
}
