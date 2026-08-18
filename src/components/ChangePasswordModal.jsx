import React, { useState } from "react";
import { Button, PasswordInput } from "./ui.jsx";
import { updatePassword } from "../services/authService.js";

export default function ChangePasswordModal({ close }) {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setErr("");
    if (pw.length < 8) return setErr("Password must be at least 8 characters.");
    if (pw !== confirm) return setErr("Passwords do not match.");
    setLoading(true);
    try {
      await updatePassword(pw);
      setDone(true);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-8">
        {done ? (
          <>
            <h2 className="text-xl font-bold text-slate-900 mb-1">Password changed</h2>
            <p className="text-slate-500 text-sm mb-6">Your password has been updated.</p>
            <Button onClick={close} className="w-full rounded-xl">Done</Button>
          </>
        ) : (
          <>
            <h2 className="text-xl font-bold text-slate-900 mb-1">Change Password</h2>
            <p className="text-slate-500 text-sm mb-6">Choose a new password for your account.</p>

            {err && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-700 text-sm border border-red-100">
                {err}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">New Password</label>
                <PasswordInput
                  value={pw}
                  onChange={e => setPw(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Confirm Password</label>
                <PasswordInput
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <div className="flex gap-2 mt-2">
                <Button type="submit" disabled={loading} className="flex-1 rounded-xl">
                  {loading ? "Saving…" : "Save"}
                </Button>
                <Button type="button" variant="outline" onClick={close} className="rounded-xl">Cancel</Button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
