import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import EmployeeLogin from "./pages/EmployeeLogin.jsx";
import EmployeeSelfService from "./pages/EmployeeSelfService.jsx";

function Root() {
  const [hash, setHash] = useState(window.location.hash);

  useEffect(() => {
    const handler = () => setHash(window.location.hash);
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  // Protect the employee portal
  useEffect(() => {
    if (hash === "#employee-portal") {
      const sess = localStorage.getItem("employeeSession");
      if (!sess) window.location.hash = "#employee-login";
    }
  }, [hash]);

  if (hash === "#employee-login") return <EmployeeLogin />;
  if (hash === "#employee-portal") {
    const sess = localStorage.getItem("employeeSession");
    if (!sess) return null; // Redirected via useEffect above
    return <EmployeeSelfService />;
  }
  return <App />;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
