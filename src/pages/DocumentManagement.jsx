import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { Badge, PageTitle } from "../components/ui.jsx";
import { BRANCH_CODE_MAP } from "../constants/branches.js";

const DOCS = ["CNIC", "EOBI Registration", "Employment Contract", "Bank Details", "Warning Letters"];

function docStatus(emp, doc) {
  if (doc === "CNIC") {
    if (!emp.cnic) return "Missing";
    // Check expiry: Pakistan CNIC format includes expiry - simplify: flag if not present
    return "Received";
  }
  if (doc === "EOBI Registration") return emp.eobi_status === "Active" ? "Received" : "Missing";
  if (doc === "Bank Details") return "Missing"; // Would need bank_details table
  if (doc === "Employment Contract") return emp.joining_date ? "Received" : "Missing";
  return "Missing";
}

function docTone(status) {
  if (status === "Received") return "green";
  if (status === "Expired") return "red";
  return "yellow";
}

function completionPct(emp) {
  const statuses = DOCS.map(d => docStatus(emp, d));
  const received = statuses.filter(s => s === "Received").length;
  return Math.round((received / DOCS.length) * 100);
}

function cnicExpiringSoon(emp) {
  // Simplified: flag if CNIC field is missing
  if (!emp.cnic) return true;
  return false;
}

export default function DocumentManagement() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterBranch, setFilterBranch] = useState("All");
  const [filterDept, setFilterDept] = useState("");
  const [search, setSearch] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => { loadEmps(); }, []);

  async function loadEmps() {
    setLoading(true);
    const { data, error } = await supabase.from("employees")
      .select("employee_code, full_name, department, branch, cnic, eobi_status, joining_date, status")
      .eq("status", "Active").order("full_name");
    if (error) setErr(error.message);
    else setEmployees(data || []);
    setLoading(false);
  }

  const filtered = useMemo(() => employees.filter(e => {
    const branchOk = filterBranch === "All" || e.branch === filterBranch;
    const deptOk = !filterDept || e.department?.toLowerCase().includes(filterDept.toLowerCase());
    const searchOk = !search || e.full_name?.toLowerCase().includes(search.toLowerCase()) || e.employee_code?.toLowerCase().includes(search.toLowerCase());
    return branchOk && deptOk && searchOk;
  }), [employees, filterBranch, filterDept, search]);

  const alerts = useMemo(() => filtered.filter(e => cnicExpiringSoon(e)), [filtered]);
  const fullyCompliant = useMemo(() => filtered.filter(e => completionPct(e) === 100).length, [filtered]);

  return (
    <div>
      <PageTitle title="Document Management" subtitle="Track employee document status, expiry alerts and compliance." />

      {/* Alert Banner */}
      {alerts.length > 0 && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3">
          <span className="text-xl shrink-0">⚠️</span>
          <div>
            <p className="font-semibold text-red-700">{alerts.length} employees with missing/expired CNIC</p>
            <p className="text-sm text-red-600 mt-0.5">{alerts.slice(0, 3).map(e => e.full_name).join(", ")}{alerts.length > 3 ? ` and ${alerts.length - 3} more` : ""}</p>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-slate-500">Total Employees</p>
          <p className="text-2xl font-bold">{filtered.length}</p>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-slate-500">Fully Compliant</p>
          <p className="text-2xl font-bold text-emerald-600">{fullyCompliant}</p>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-slate-500">CNIC Issues</p>
          <p className="text-2xl font-bold text-red-500">{alerts.length}</p>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-slate-500">Compliance %</p>
          <p className="text-2xl font-bold">{filtered.length > 0 ? Math.round((fullyCompliant / filtered.length) * 100) : 0}%</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm mb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employee..."
            className="px-4 py-2 rounded-xl border border-slate-200 text-sm" />
          <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm">
            <option value="All">All Branches</option>
            {Object.keys(BRANCH_CODE_MAP).map(b => <option key={b}>{b}</option>)}
          </select>
          <input value={filterDept} onChange={e => setFilterDept(e.target.value)} placeholder="Filter by department"
            className="px-4 py-2 rounded-xl border border-slate-200 text-sm" />
        </div>
      </div>

      {err && <div className="mb-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{err}</div>}

      {/* Document Status Table */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
        <div className="px-5 pt-4 pb-2">
          <h2 className="font-bold text-slate-800">Document Status — All Employees</h2>
          <p className="text-xs text-slate-400 mt-0.5">{filtered.length} employees</p>
        </div>
        {loading ? <p className="px-5 py-8 text-slate-400 text-sm">Loading...</p> : (
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Employee</th>
                <th className="text-left px-4 py-3 font-medium">Department</th>
                {DOCS.map(d => <th key={d} className="text-left px-4 py-3 font-medium">{d}</th>)}
                <th className="text-left px-4 py-3 font-medium">Completion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0
                ? <tr><td colSpan={DOCS.length + 3} className="px-4 py-8 text-center text-slate-400">No employees found.</td></tr>
                : filtered.map(emp => {
                  const pct = completionPct(emp);
                  const isCnicAlert = cnicExpiringSoon(emp);
                  return (
                    <tr key={emp.employee_code} className={isCnicAlert ? "bg-red-50/30" : ""}>
                      <td className="px-4 py-3">
                        <div className="font-medium">{emp.full_name}</div>
                        <div className="text-xs text-slate-400">{emp.employee_code}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{emp.department}</td>
                      {DOCS.map(d => {
                        const s = docStatus(emp, d);
                        return (
                          <td key={d} className="px-4 py-3">
                            <Badge tone={docTone(s)}>{s}</Badge>
                          </td>
                        );
                      })}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-slate-100 rounded-full h-2 w-16">
                            <div className={`h-2 rounded-full ${pct === 100 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-400" : "bg-red-400"}`}
                              style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-slate-500">{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
