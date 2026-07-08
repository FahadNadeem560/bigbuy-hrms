import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import Login from "./pages/Login.jsx";
import ChangePassword from "./pages/ChangePassword.jsx";
import EmployeeLogin from "./pages/EmployeeLogin.jsx";
import EmployeeSelfService from "./pages/EmployeeSelfService.jsx";
import { supabase } from "./lib/supabaseClient.js";
import { getCurrentAuthSession, fetchUserProfileByAuthId } from "./services/authService.js";

function Root() {
  const [hash, setHash] = useState(window.location.hash);
  const [session, setSession] = useState(undefined); // undefined = still loading, null = no session
  const [profile, setProfile] = useState(null);

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

  // Main app real auth session
  useEffect(() => {
    let active = true;
    getCurrentAuthSession().then(s => { if (active) setSession(s); });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    let active = true;
    if (session?.user?.id) {
      fetchUserProfileByAuthId(session.user.id).then(p => { if (active) setProfile(p); });
    } else {
      setProfile(null);
    }
    return () => { active = false; };
  }, [session]);

  if (hash === "#employee-login") return <EmployeeLogin />;
  if (hash === "#employee-portal") {
    const sess = localStorage.getItem("employeeSession");
    if (!sess) return null; // Redirected via useEffect above
    return <EmployeeSelfService />;
  }

  if (session === undefined) return null; // initial session lookup in flight
  if (!session) return <Login />;
  if (!profile) return null; // profile row still loading
  if (profile.must_change_password) {
    return (
      <ChangePassword
        authUserId={session.user.id}
        onDone={() => fetchUserProfileByAuthId(session.user.id).then(setProfile)}
      />
    );
  }
  return <App profile={profile} />;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
