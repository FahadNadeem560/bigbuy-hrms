import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { Button, Badge, PageTitle } from "../components/ui.jsx";
import { BRANCH_CODE_MAP } from "../constants/branches.js";
import { fetchAllUsers, createUser, resetUserPassword } from "../services/userManagementService.js";
import * as XLSX from "xlsx";

export default function StaffCredentials() {
  const [employees, setEmployees] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  // Temp passwords come back from the create/reset edge function once and
  // are never stored in the DB in plaintext (real Supabase Auth account) --
  // this is the only place they're ever visible, and only for this session.
  const [revealed, setRevealed] = useState({}); // employee_code -> tempPassword

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true); setErr("");
    try {
      const [{ data: emps, error: e1 }, allUsers] = await Promise.all([
        supabase.from("employees").select("employee_code, full_name, department, branch, status, designation").eq("status", "Active").order("full_name"),
        fetchAllUsers(),
      ]);
      if (e1) throw e1;
      setEmployees(emps || []);
      setUsers((allUsers || []).filter(u => u.role === "Employee"));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  // users.employee_id holds the employee_code for Employee-role accounts
  // (same convention the RLS helper private.current_employee_code() reads).
  const userMap = useMemo(() =>
    Object.fromEntries((users || []).filter(u => u.employee_id).map(u => [u.employee_id, u])),
    [users]
  );

  function nextUsernameFor(branch, existingUsernames) {
    const branchCode = BRANCH_CODE_MAP[branch] || "GEN";
    let max = 0;
    existingUsernames.forEach(u => {
      const parts = String(u || "").split("-");
      if (parts.length >= 3 && parts[0] === "BB" && parts[1] === branchCode) {
        const num = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(num)) max = Math.max(max, num);
      }
    });
    return `BB-${branchCode}-${String(max + 1).padStart(4, "0")}`;
  }

  async function generateAll() {
    setGenerating(true); setErr(""); setMsg("");
    try {
      const pending = employees.filter(emp => !userMap[emp.employee_code]);
      if (pending.length === 0) {
        setMsg("All active employees already have credentials.");
        return;
      }

      const usernames = users.map(u => u.username);
      const newlyRevealed = {};
      let created = 0;
      let failed = 0;
      for (const emp of pending) {
        const username = nextUsernameFor(emp.branch, usernames);
        usernames.push(username); // reserve it for the next iteration's counter
        try {
          const result = await createUser({
            username, fullName: emp.full_name, role: "Employee",
            branch: emp.branch, employeeId: emp.employee_code,
          });
          newlyRevealed[emp.employee_code] = { username: result.username, tempPassword: result.tempPassword };
          created++;
        } catch (e) {
          failed++;
        }
      }

      setRevealed(prev => ({ ...prev, ...newlyRevealed }));
      setMsg(`Generated credentials for ${created} employee${created !== 1 ? "s" : ""}.${failed ? ` ${failed} failed.` : ""}`);
      await loadData();
    } catch (e) {
      setErr(e.message);
    } finally {
      setGenerating(false);
    }
  }

  async function regenerateOne(emp) {
    try {
      const existing = userMap[emp.employee_code];
      if (!existing) return;
      const result = await resetUserPassword(existing.id);
      setRevealed(prev => ({ ...prev, [emp.employee_code]: { username: result.username, tempPassword: result.tempPassword } }));
      setMsg(`Password regenerated for ${emp.full_name}. Copy it now — it won't be shown again.`);
      await loadData();
    } catch (e) {
      setErr(e.message);
    }
  }

  const rows = useMemo(() => {
    return employees
      .filter(e => {
        const statusOk = filter === "All" || (filter === "Generated" ? !!userMap[e.employee_code] : !userMap[e.employee_code]);
        const searchOk = !search || e.full_name?.toLowerCase().includes(search.toLowerCase()) || e.employee_code?.toLowerCase().includes(search.toLowerCase());
        return statusOk && searchOk;
      })
      .map(emp => ({ ...emp, credential: userMap[emp.employee_code] || null }));
  }, [employees, userMap, filter, search]);

  function exportExcel() {
    // Passwords only export for accounts created/reset THIS session --
    // real Supabase Auth never stores them in plaintext, so anything
    // generated in a prior session can no longer be recovered here.
    const data = rows.map(r => ({
      "Employee Name": r.full_name,
      "Branch": r.branch,
      "Department": r.department,
      "Employee ID": r.credential?.username || "",
      "Password": revealed[r.employee_code]?.tempPassword || (r.credential ? "(not shown this session — use New Password to reset)" : ""),
      "Status": r.credential ? "Generated" : "Pending",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Staff Credentials");
    XLSX.writeFile(wb, `staff_credentials_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  const generatedCount = useMemo(() => employees.filter(e => userMap[e.employee_code]).length, [employees, userMap]);
  const pendingCount = employees.length - generatedCount;

  return (
    <div>
      <PageTitle
        title="Staff Credentials"
        subtitle="Generate and manage employee login credentials for the self-service portal."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={exportExcel} disabled={loading} className="rounded-2xl">Export Excel</Button>
            <Button onClick={generateAll} disabled={generating || loading} className="rounded-2xl">
              {generating ? "Generating..." : "Generate Credentials for All Employees"}
            </Button>
          </div>
        }
      />

      {msg && <div className="mb-3 p-3 rounded-xl bg-emerald-50 text-emerald-700 text-sm">{msg}</div>}
      {err && <div className="mb-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{err}</div>}

      {/* Info Banner */}
      <div className="mb-4 p-4 bg-blue-50 border border-blue-100 rounded-2xl text-sm text-blue-700">
        <strong>Employee ID format:</strong> BB-{"{BRANCH_CODE}"}-{"{0001}"}  &nbsp;·&nbsp;
        <strong>Portal URL:</strong> Navigate to <code className="bg-blue-100 px-1 rounded">#employee-login</code> to access the employee portal.
        <br />
        Passwords are real login credentials and are shown here only once, right after they're generated or reset — copy them to the employee immediately.
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-slate-500">Total Active Employees</p>
          <p className="text-2xl font-bold">{employees.length}</p>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-slate-500">Credentials Generated</p>
          <p className="text-2xl font-bold text-emerald-600">{generatedCount}</p>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-slate-500">Pending</p>
          <p className="text-2xl font-bold text-amber-500">{pendingCount}</p>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-slate-500">Coverage</p>
          <p className="text-2xl font-bold">{employees.length > 0 ? Math.round((generatedCount / employees.length) * 100) : 0}%</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        {["All", "Generated", "Pending"].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${filter === f ? "bg-slate-950 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            {f}
          </button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or code..."
          className="px-4 py-2 rounded-xl border border-slate-200 text-sm w-56" />
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
        <div className="px-5 pt-4 pb-2">
          <h2 className="font-bold text-slate-800">Employee Credentials</h2>
          <p className="text-xs text-slate-400 mt-0.5">{rows.length} employees</p>
        </div>
        <table className="w-full min-w-[850px] text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>{["Employee Name", "Branch", "Department", "Employee ID", "Password", "Status", "Action"].map(h => (
              <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
            ))}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading
              ? <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Loading...</td></tr>
              : rows.length === 0
                ? <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No employees found.</td></tr>
                : rows.map(r => (
                  <tr key={r.employee_code}>
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.full_name}</div>
                      <div className="text-xs text-slate-400">{r.employee_code}</div>
                    </td>
                    <td className="px-4 py-3">{r.branch}</td>
                    <td className="px-4 py-3">{r.department}</td>
                    <td className="px-4 py-3">
                      {r.credential
                        ? <code className="font-mono text-slate-800 bg-slate-50 px-2 py-0.5 rounded-lg text-xs">{r.credential.username || "—"}</code>
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {revealed[r.employee_code]?.tempPassword
                        ? <code className="font-mono text-slate-800 bg-emerald-50 px-2 py-0.5 rounded-lg text-xs border border-emerald-100">{revealed[r.employee_code].tempPassword}</code>
                        : r.credential
                          ? <span className="text-slate-300 text-xs italic">hidden — reset to reveal</span>
                          : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={r.credential ? "green" : "yellow"}>{r.credential ? "Generated" : "Pending"}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {r.credential && (
                        <button onClick={() => regenerateOne(r)}
                          className="text-xs px-2 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500 transition">
                          New Password
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
