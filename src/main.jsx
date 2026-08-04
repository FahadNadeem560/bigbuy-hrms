import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import Login from "./pages/Login.jsx";
import ChangePassword from "./pages/ChangePassword.jsx";
import EmployeeLogin from "./pages/EmployeeLogin.jsx";
import { supabase } from "./lib/supabaseClient.js";
import { getCurrentAuthSession, fetchUserProfileByAuthId, signOut } from "./services/authService.js";

function Root() {
  const [hash, setHash] = useState(window.location.hash);
  const [session, setSession] = useState(undefined); // undefined = still loading, null = no session
  const [profile, setProfile] = useState(null);
  const [deactivated, setDeactivated] = useState(false);

  useEffect(() => {
    const handler = () => setHash(window.location.hash);
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

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
      setDeactivated(false);
      fetchUserProfileByAuthId(session.user.id).then(p => {
        if (!active) return;
        if (p && p.status && p.status !== "Active") {
          setDeactivated(true);
          setProfile(null);
          signOut();
        } else {
          setProfile(p);
        }
      });
    } else {
      setProfile(null);
    }
    return () => { active = false; };
  }, [session]);

  if (session === undefined) return null; // initial session lookup in flight
  if (deactivated) return <Login deactivated />;

  // EmployeeLogin is a self-contained gate (credentials -> forced password
  // change -> WhatsApp OTP -> portal) that re-derives all of this from the
  // Supabase Auth session itself, so it also needs to render on a page
  // reload where an Employee-role session already exists but hash is bare.
  // A confirmed non-Employee staff session takes priority over a stray
  // #employee-login hash (e.g. clicked from StaffCredentials while already
  // logged in as Master) -- EmployeeLogin would otherwise sign them out on
  // its own role check.
  const isStaffSession = session && profile && profile.role !== "Employee";
  if (!isStaffSession && (hash === "#employee-login" || (session && profile?.role === "Employee"))) {
    return <EmployeeLogin />;
  }

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
