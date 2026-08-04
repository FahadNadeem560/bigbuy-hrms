import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { signInWithEmailPassword, usernameToEmail, signOut, updatePassword, clearMustChangePassword } from "../services/authService.js";
import { sendOnboardingOtp, verifyOnboardingOtp } from "../services/whatsappService.js";
import EmployeeSelfService from "./EmployeeSelfService.jsx";

// Self-contained employee auth gate: credentials -> forced password change
// (first login, mirrors ChangePassword.jsx for the HR-staff side) -> WhatsApp
// OTP verification (first login, skipped if no WhatsApp number on file) ->
// portal. Re-checks all three stages on every mount (including page reload),
// since a real Supabase Auth session persists across reloads and none of
// these gates can be inferred from session existence alone.
export default function EmployeeLogin() {
  const [employeeId, setEmployeeId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [stage, setStage] = useState("checking"); // checking | credentials | change-password | verify | portal
  const [profile, setProfile] = useState(null);

  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwErr, setPwErr] = useState("");
  const [pwLoading, setPwLoading] = useState(false);

  const [otpCode, setOtpCode] = useState("");
  const [otpMsg, setOtpMsg] = useState("");
  const [otpBusy, setOtpBusy] = useState(false);
  const otpSentRef = useRef(false);

  useEffect(() => { checkSession(); }, []);

  async function checkSession() {
    const { data } = await supabase.auth.getSession();
    if (!data.session) { setStage("credentials"); return; }
    await loadProfileAndRoute(data.session.user.id);
  }

  async function loadProfileAndRoute(authUserId) {
    const { data: prof } = await supabase.from("users").select("*").eq("auth_user_id", authUserId).maybeSingle();
    if (!prof || prof.role !== "Employee") {
      await signOut();
      setErr(prof ? "This portal is for employees only. HR staff please use the main system." : "Account not fully set up. Contact HR.");
      setStage("credentials");
      return;
    }
    setProfile(prof);
    if (prof.must_change_password) { setStage("change-password"); return; }
    await checkWhatsappAndRoute(prof);
  }

  async function checkWhatsappAndRoute(prof) {
    const { data: emp } = prof.employee_id
      ? await supabase.from("employees").select("whatsapp_number, phone, whatsapp_verified").eq("employee_code", prof.employee_id).maybeSingle()
      : { data: null };
    const needsVerification = prof.employee_id && !emp?.whatsapp_verified && (emp?.whatsapp_number || emp?.phone);
    if (needsVerification) {
      setStage("verify");
      if (!otpSentRef.current) {
        otpSentRef.current = true;
        setOtpBusy(true);
        try {
          await sendOnboardingOtp(prof.employee_id);
          setOtpMsg("A verification code was sent to your WhatsApp.");
        } catch (e) { setOtpMsg(`Error sending code: ${e.message}`); }
        finally { setOtpBusy(false); }
      }
      return;
    }
    setStage("portal");
  }

  async function handleLogin(e) {
    e.preventDefault();
    const id = employeeId.trim();
    const pw = password.trim();
    if (!id || !pw) return setErr("Please enter your Employee ID and password.");
    setLoading(true);
    setErr("");
    try {
      const { user } = await signInWithEmailPassword(usernameToEmail(id), pw);
      await loadProfileAndRoute(user.id);
    } catch (e) {
      setErr("Invalid Employee ID or password. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    setPwErr("");
    if (newPw.length < 8) return setPwErr("Password must be at least 8 characters.");
    if (newPw !== confirmPw) return setPwErr("Passwords do not match.");
    setPwLoading(true);
    try {
      await updatePassword(newPw);
      await clearMustChangePassword();
      const updated = { ...profile, must_change_password: false };
      setProfile(updated);
      await checkWhatsappAndRoute(updated);
    } catch (e) {
      setPwErr(e.message);
    } finally {
      setPwLoading(false);
    }
  }

  async function resendOtp() {
    if (!profile?.employee_id) return;
    setOtpBusy(true); setOtpMsg("");
    try {
      await sendOnboardingOtp(profile.employee_id);
      setOtpMsg("A new code was sent to your WhatsApp.");
    } catch (e) { setOtpMsg(`Error: ${e.message}`); }
    finally { setOtpBusy(false); }
  }

  async function submitOtp(e) {
    e.preventDefault();
    if (!profile?.employee_id) return;
    setOtpBusy(true); setOtpMsg("");
    const result = await verifyOnboardingOtp(profile.employee_id, otpCode);
    if (result.success) {
      setStage("portal");
    } else {
      setOtpMsg(result.error);
    }
    setOtpBusy(false);
  }

  function backToLogin() {
    signOut();
    otpSentRef.current = false;
    setStage("credentials"); setProfile(null);
    setOtpCode(""); setOtpMsg(""); setErr("");
    setNewPw(""); setConfirmPw(""); setPwErr("");
  }

  if (stage === "checking") return null;
  if (stage === "portal") return <EmployeeSelfService profile={profile} />;

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-white rounded-2xl mb-4 shadow-xl">
          <span className="text-3xl">🛒</span>
        </div>
        <h1 className="text-3xl font-bold text-white tracking-tight">Big Buy HRMS</h1>
        <p className="text-slate-400 mt-1.5 text-sm">Employee Self-Service Portal</p>
      </div>

      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-8">
        {stage === "credentials" && (
          <>
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
          </>
        )}

        {stage === "change-password" && (
          <>
            <h2 className="text-xl font-bold text-slate-900 mb-1">Set a new password</h2>
            <p className="text-slate-500 text-sm mb-6">First-time login — you must change your password before continuing.</p>

            {pwErr && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-700 text-sm border border-red-100">
                {pwErr}
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">New Password</label>
                <input
                  type="password"
                  value={newPw}
                  onChange={e => setNewPw(e.target.value)}
                  autoComplete="new-password"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Confirm Password</label>
                <input
                  type="password"
                  value={confirmPw}
                  onChange={e => setConfirmPw(e.target.value)}
                  autoComplete="new-password"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                />
              </div>
              <button
                type="submit"
                disabled={pwLoading}
                className="w-full bg-slate-950 text-white py-3 rounded-xl font-semibold text-sm transition hover:bg-slate-800 active:bg-slate-900 disabled:opacity-50 disabled:cursor-not-allowed mt-2">
                {pwLoading ? "Saving…" : "Set Password"}
              </button>
            </form>

            <button onClick={backToLogin} className="w-full text-center text-xs text-slate-400 mt-5 underline underline-offset-2 hover:text-slate-600">
              Sign out
            </button>
          </>
        )}

        {stage === "verify" && (
          <>
            <h2 className="text-xl font-bold text-slate-900 mb-1">Verify your WhatsApp</h2>
            <p className="text-slate-500 text-sm mb-6">First-time login — enter the 6-digit code sent to your WhatsApp to finish setting up your account.</p>

            {otpMsg && (
              <div className={`mb-4 p-3 rounded-xl text-sm border ${otpMsg.startsWith("Error") || otpMsg.includes("Incorrect") || otpMsg.includes("expired") ? "bg-red-50 text-red-700 border-red-100" : "bg-emerald-50 text-emerald-700 border-emerald-100"}`}>
                {otpMsg}
              </div>
            )}

            <form onSubmit={submitOtp} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Verification Code</label>
                <input
                  value={otpCode}
                  onChange={e => setOtpCode(e.target.value)}
                  placeholder="123456"
                  inputMode="numeric"
                  maxLength={6}
                  autoFocus
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 font-mono tracking-widest text-center text-lg"
                />
              </div>
              <button
                type="submit"
                disabled={otpBusy || otpCode.length < 6}
                className="w-full bg-slate-950 text-white py-3 rounded-xl font-semibold text-sm transition hover:bg-slate-800 active:bg-slate-900 disabled:opacity-50 disabled:cursor-not-allowed">
                {otpBusy ? (otpCode.length >= 6 ? "Verifying…" : "Sending code…") : "Verify & Continue"}
              </button>
            </form>

            <div className="flex justify-between items-center mt-4">
              <button onClick={resendOtp} disabled={otpBusy} className="text-xs text-slate-500 underline underline-offset-2 hover:text-slate-700">
                Resend code
              </button>
              <button onClick={backToLogin} className="text-xs text-slate-400 hover:text-slate-600">
                Sign out
              </button>
            </div>
          </>
        )}
      </div>

      {stage === "credentials" && (
        <p className="text-slate-500 text-xs mt-6">
          HR staff?{" "}
          <button
            onClick={() => { window.location.hash = ""; }}
            className="text-slate-300 underline underline-offset-2 hover:text-white transition">
            Go to HR Portal
          </button>
        </p>
      )}
    </div>
  );
}
