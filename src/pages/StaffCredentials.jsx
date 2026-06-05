import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { Button, Badge, PageTitle } from "../components/ui.jsx";
import { BRANCH_CODE_MAP } from "../constants/branches.js";
import * as XLSX from "xlsx";

function generatePassword(len = 8) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let pwd = "";
  for (let i = 0; i < len; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
  return pwd;
}

export default function StaffCredentials() {
  const [employees, setEmployees] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true); setErr("");
    try {
      const [{ data: emps, error: e1 }, { data: usrs, error: e2 }] = await Promise.all([
        supabase.from("employees").select("employee_code, full_name, department, branch, status, designation").eq("status", "Active").order("full_name"),
        supabase.from("users").select("employee_code, username, employee_id, password_plain, role"),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      setEmployees(emps || []);
      setUsers(usrs || []);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  const userMap = useMemo(() =>
    Object.fromEntries((users || []).filter(u => u.employee_code).map(u => [u.employee_code, u])),
    [users]
  );

  async function generateAll() {
    setGenerating(true); setErr(""); setMsg("");
    try {
      const { data: allUsers } = await supabase.from("users").select("username, employee_code");
      const existingCodes = new Set((allUsers || []).map(u => u.employee_code).filter(Boolean));

      // Build per-branch counter from existing usernames
      const branchCounters = {};
      (allUsers || []).forEach(u => {
        if (!u.username) return;
        const parts = u.username.split("-");
        if (parts.length >= 3 && parts[0] === "BB") {
          const code = parts[1];
          const num = parseInt(parts[parts.length - 1], 10);
          if (!isNaN(num)) branchCounters[code] = Math.max(branchCounters[code] || 0, num);
        }
      });

      const toInsert = [];
      for (const emp of employees) {
        if (existingCodes.has(emp.employee_code)) continue;
        const branchCode = BRANCH_CODE_MAP[emp.branch] || "GEN";
        branchCounters[branchCode] = (branchCounters[branchCode] || 0) + 1;
        const num = String(branchCounters[branchCode]).padStart(4, "0");
        const empId = `BB-${branchCode}-${num}`;
        const password = generatePassword(8);
        toInsert.push({
          employee_code: emp.employee_code,
          employee_id: empId,
          username: empId,
          password_plain: password,
          role: "Employee",
        });
      }

      if (toInsert.length === 0) {
        setMsg("All active employees already have credentials.");
        return;
      }

      const { error } = await supabase.from("users").upsert(toInsert, { onConflict: "employee_code" });
      if (error) throw error;

      setMsg(`Generated credentials for ${toInsert.length} employee${toInsert.length !== 1 ? "s" : ""}.`);
      await loadData();
    } catch (e) {
      setErr(e.message);
    } finally {
      setGenerating(false);
    }
  }

  async function regenerateOne(emp) {
    try {
      const branchCode = BRANCH_CODE_MAP[emp.branch] || "GEN";
      const password = generatePassword(8);
      const existing = userMap[emp.employee_code];
      if (!existing) return;
      const { error } = await supabase.from("users").update({ password_plain: password }).eq("employee_code", emp.employee_code);
      if (error) throw error;
      setMsg(`Password regenerated for ${emp.full_name}.`);
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
    const data = rows.map(r => ({
      "Employee Name": r.full_name,
      "Branch": r.branch,
      "Department": r.department,
      "Employee ID": r.credential?.username || r.credential?.employee_id || "",
      "Password": r.credential?.password_plain || "",
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
                        ? <code className="font-mono text-slate-800 bg-slate-50 px-2 py-0.5 rounded-lg text-xs">{r.credential.username || r.credential.employee_id || "—"}</code>
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {r.credential
                        ? <code className="font-mono text-slate-600 bg-slate-50 px-2 py-0.5 rounded-lg text-xs">{r.credential.password_plain || "—"}</code>
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
