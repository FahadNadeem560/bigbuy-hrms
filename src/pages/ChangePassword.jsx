import React, { useState } from "react";
import { updatePassword, clearMustChangePassword, signOut } from "../services/authService.js";

export default function ChangePassword({ authUserId, onDone }) {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setErr("");
    if (pw.length < 8) return setErr("Password must be at least 8 characters.");
    if (pw !== confirm) return setErr("Passwords do not match.");
    setLoading(true);
    try {
      await updatePassword(pw);
      await clearMustChangePassword(authUserId);
      onDone();
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-8">
        <h2 className="text-xl font-bold text-slate-900 mb-1">Set a new password</h2>
        <p className="text-slate-500 text-sm mb-6">You must change your password before continuing.</p>

        {err && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-700 text-sm border border-red-100">
            {err}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">New Password</label>
            <input
              type="password"
              value={pw}
              onChange={e => setPw(e.target.value)}
              autoComplete="new-password"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Confirm Password</label>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              autoComplete="new-password"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-slate-950 text-white py-3 rounded-xl font-semibold text-sm transition hover:bg-slate-800 active:bg-slate-900 disabled:opacity-50 disabled:cursor-not-allowed mt-2">
            {loading ? "Saving…" : "Set Password"}
          </button>
        </form>

        <button
          onClick={() => signOut()}
          className="w-full text-center text-xs text-slate-400 mt-5 underline underline-offset-2 hover:text-slate-600">
          Sign out
        </button>
      </div>
    </div>
  );
}
