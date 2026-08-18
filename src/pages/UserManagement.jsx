import React, { useEffect, useMemo, useState } from "react";
import { Button, Badge, PageTitle } from "../components/ui.jsx";
import { MENU_ITEMS } from "../config/menu.js";
import { fetchAllUsers, createUser, resetUserPassword, updateUser } from "../services/userManagementService.js";

const ROLES = ["Master", "HR", "GM", "Finance", "Branch Manager", "Audit"];

function PermissionPicker({ mode, setMode, selected, setSelected }) {
  return (
    <div>
      <div className="flex gap-4 mb-3 text-sm">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="radio" checked={mode === "default"} onChange={() => setMode("default")} />
          Use role's default access
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="radio" checked={mode === "custom"} onChange={() => setMode("custom")} />
          Custom — pick exactly what they can see
        </label>
      </div>
      {mode === "custom" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 p-3 bg-slate-50 rounded-xl max-h-64 overflow-y-auto">
          {MENU_ITEMS.map(item => (
            <label key={item.key} className="flex items-center gap-2 text-sm px-2 py-1 rounded-lg hover:bg-white cursor-pointer">
              <input type="checkbox" checked={selected.includes(item.key)}
                onChange={e => setSelected(prev => e.target.checked ? [...prev, item.key] : prev.filter(k => k !== item.key))} />
              <span>{item.icon} {item.label}</span>
              <span className="text-xs text-slate-400 ml-auto">{item.section}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateUserForm({ onCreated }) {
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [title, setTitle] = useState("");
  const [role, setRole] = useState("Finance");
  const [mode, setMode] = useState("default");
  const [selected, setSelected] = useState([]);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");

  async function save() {
    if (!username.trim() || !fullName.trim()) return setErr("Username and full name are required.");
    setSaving(true); setErr(""); setResult(null);
    try {
      const res = await createUser({
        username: username.trim(), fullName: fullName.trim(), title: title.trim(),
        role, menuOverrides: mode === "custom" ? selected : null,
      });
      setResult(res);
      setUsername(""); setFullName(""); setTitle(""); setSelected([]); setMode("default");
      onCreated();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm mb-6">
      <h2 className="font-bold text-slate-800 mb-4">Create New User</h2>
      {err && <div className="mb-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{err}</div>}
      {result && (
        <div className="mb-3 p-3 rounded-xl bg-emerald-50 text-emerald-800 text-sm">
          Account created. Username: <b>{result.username}</b> · Temporary password: <b className="font-mono">{result.tempPassword}</b>
          <div className="text-xs text-emerald-700 mt-1">Share this with them now — it won't be shown again. They'll be required to change it on first login.</div>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div>
          <p className="text-xs text-slate-500 mb-1">Username</p>
          <input value={username} onChange={e => setUsername(e.target.value)} placeholder="e.g. finance.head" className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-1">Full Name</p>
          <input value={fullName} onChange={e => setFullName(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-1">Title (optional, for display only)</p>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Head of Accounts &amp; Finance" className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-1">Role</p>
          <select value={role} onChange={e => setRole(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm">
            {ROLES.map(r => <option key={r}>{r}</option>)}
          </select>
        </div>
      </div>
      <PermissionPicker mode={mode} setMode={setMode} selected={selected} setSelected={setSelected} />
      <Button onClick={save} disabled={saving} className="rounded-xl mt-4">{saving ? "Creating…" : "Create User"}</Button>
    </div>
  );
}

function EditUserRow({ user, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState(user.role);
  const [title, setTitle] = useState(user.title || "");
  const [mode, setMode] = useState(user.menu_overrides?.length ? "custom" : "default");
  const [selected, setSelected] = useState(user.menu_overrides || []);
  const [saving, setSaving] = useState(false);
  const [resetResult, setResetResult] = useState(null);
  const [err, setErr] = useState("");

  async function save() {
    setSaving(true); setErr("");
    try {
      await updateUser(user.id, { role, title: title || null, menu_overrides: mode === "custom" ? selected : null });
      setEditing(false);
      onSaved();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  }

  async function toggleStatus() {
    setSaving(true); setErr("");
    try {
      await updateUser(user.id, { status: user.status === "Active" ? "Inactive" : "Active" });
      onSaved();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  }

  async function doResetPassword() {
    if (!window.confirm(`Reset password for ${user.username}? Their current password stops working immediately.`)) return;
    setSaving(true); setErr(""); setResetResult(null);
    try { setResetResult(await resetUserPassword(user.id)); }
    catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  }

  return (
    <tr>
      <td className="px-4 py-3">
        <div className="font-medium">{user.full_name}</div>
        <div className="text-xs text-slate-400">{user.username} {user.title && `· ${user.title}`}</div>
      </td>
      <td className="px-4 py-3">
        {editing ? (
          <select value={role} onChange={e => setRole(e.target.value)} className="px-2 py-1 rounded-lg border border-slate-200 text-sm">
            {ROLES.map(r => <option key={r}>{r}</option>)}
          </select>
        ) : <Badge tone="slate">{user.role}</Badge>}
      </td>
      <td className="px-4 py-3 text-xs text-slate-500">
        {editing ? (
          <div className="min-w-[260px]">
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title (optional)" className="px-2 py-1 rounded-lg border border-slate-200 text-xs w-full mb-2" />
            <PermissionPicker mode={mode} setMode={setMode} selected={selected} setSelected={setSelected} />
          </div>
        ) : (user.menu_overrides?.length ? `Custom: ${user.menu_overrides.join(", ")}` : "Default (role-based)")}
      </td>
      <td className="px-4 py-3"><Badge tone={user.status === "Active" ? "green" : "yellow"}>{user.status || "Active"}</Badge></td>
      <td className="px-4 py-3">
        {err && <div className="text-xs text-red-600 mb-1">{err}</div>}
        {resetResult && (
          <div className="text-xs bg-emerald-50 text-emerald-800 p-2 rounded-lg mb-1">
            New password: <b className="font-mono">{resetResult.tempPassword}</b>
          </div>
        )}
        <div className="flex gap-1 flex-wrap">
          {editing ? (
            <>
              <Button onClick={save} disabled={saving} className="rounded-lg text-xs py-1 px-2">Save</Button>
              <Button variant="outline" onClick={() => setEditing(false)} className="rounded-lg text-xs py-1 px-2">Cancel</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setEditing(true)} className="rounded-lg text-xs py-1 px-2">Edit</Button>
              <Button variant="outline" onClick={doResetPassword} disabled={saving} className="rounded-lg text-xs py-1 px-2">Reset Password</Button>
              <Button variant="outline" onClick={toggleStatus} disabled={saving} className="rounded-lg text-xs py-1 px-2 text-red-600 border-red-200">
                {user.status === "Active" ? "Deactivate" : "Activate"}
              </Button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

export default function UserManagement({ role }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => { load(); }, []);
  async function load() {
    setLoading(true);
    try { setUsers(await fetchAllUsers()); }
    catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }

  if (role !== "Master") {
    return (
      <div>
        <PageTitle title="User Management" subtitle="Not available." />
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8 text-center text-amber-700">
          User Management is only visible to Master.
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageTitle title="User Management" subtitle="Create logins and control exactly which pages each account can see." />
      <CreateUserForm onCreated={load} />
      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
        <div className="px-5 pt-4 pb-2"><h2 className="font-bold text-slate-800">All Users</h2></div>
        {err && <div className="mx-5 mb-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{err}</div>}
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>{["User", "Role", "Menu Access", "Status", "Actions"].map(h => <th key={h} className="text-left px-4 py-3 font-medium sticky top-0 z-10 bg-slate-50 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No users found.</td></tr>
            ) : users.map(u => <EditUserRow key={u.id} user={u} onSaved={load} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
