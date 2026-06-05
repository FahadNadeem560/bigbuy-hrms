import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient.js";

export default function EmployeeLogin() {
  const [employeeId, setEmployeeId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    // If already logged in, go straight to portal
    const sess = localStorage.getItem("employeeSession");
    if (sess) window.location.hash = "#employee-portal";
  }, []);

  async function handleLogin(e) {
    e.preventDefault();
    const id = employeeId.trim();
    const pw = password.trim();
    if (!id || !pw) return setErr("Please enter your Employee ID and password.");
    setLoading(true);
    setErr("");
    try {
      // Authenticate against users table
      const { data: user, error: authErr } = await supabase
        .from("users")
        .select("employee_code, username, employee_id, role, password_plain")
        .eq("username", id)
        .eq("password_plain", pw)
        .maybeSingle();

      if (authErr) throw authErr;
      if (!user) {
        setErr("Invalid Employee ID or password. Please try again.");
        setLoading(false);
        return;
      }
      if (user.role !== "Employee") {
        setErr("This portal is for employees only. HR staff please use the main system.");
        setLoading(false);
        return;
      }

      // Fetch employee details
      const empCode = user.employee_code;
      const { data: emp } = empCode
        ? await supabase.from("employees").select("full_name, branch, department, designation, phone, staff_level").eq("employee_code", empCode).maybeSingle()
        : { data: null };

      const session = {
        employee_id: user.username || user.employee_id || id,
        employee_code: empCode || "",
        name: emp?.full_name || id,
        branch: emp?.branch || "",
        department: emp?.department || "",
        designation: emp?.designation || "",
        staff_level: emp?.staff_level || "",
      };
      localStorage.setItem("employeeSession", JSON.stringify(session));
      window.location.hash = "#employee-portal";
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
      {/* Branding */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-white rounded-2xl mb-4 shadow-xl">
          <span className="text-3xl">🛒</span>
        </div>
        <h1 className="text-3xl font-bold text-white tracking-tight">Big Buy HRMS</h1>
        <p className="text-slate-400 mt-1.5 text-sm">Employee Self-Service Portal</p>
      </div>

      {/* Login Card */}
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-8">
        <h2 className="text-xl font-bold text-slate-900 mb-1">Welcome back</h2>
        <p className="text-slate-500 text-sm mb-6">Sign in with your employee credentials</p>

        {err && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-700 text-sm border border-red-100">
            {err}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Employee ID</label>
            <input
              value={employeeId}
              onChange={e => setEmployeeId(e.target.value)}
              placeholder="BB-PAF-0012"
              autoComplete="username"
              spellCheck={false}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-slate-950 text-white py-3 rounded-xl font-semibold text-sm transition hover:bg-slate-800 active:bg-slate-900 disabled:opacity-50 disabled:cursor-not-allowed mt-2">
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>

        <p className="text-xs text-slate-400 text-center mt-5">
          Don't have credentials? Contact your HR department.
        </p>
      </div>

      {/* Back to HR link */}
      <p className="text-slate-500 text-xs mt-6">
        HR staff?{" "}
        <button
          onClick={() => { window.location.hash = ""; }}
          className="text-slate-300 underline underline-offset-2 hover:text-white transition">
          Go to HR Portal
        </button>
      </p>
    </div>
  );
}
