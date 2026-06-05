import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { Button, Badge, PageTitle } from "../components/ui.jsx";
import { BRANCH_CODE_MAP } from "../constants/branches.js";

function issueType(row) {
  const hasIn = !!(row.check_in || row.time_in);
  const hasOut = !!(row.check_out || row.time_out);
  if (!hasIn && hasOut) return "Missing In";
  if (hasIn && !hasOut) return "Missing Out";
  if (!hasIn && !hasOut) return "Single Punch";
  return "Unknown";
}

function issueTone(t) {
  if (t === "Missing In") return "red";
  if (t === "Missing Out") return "yellow";
  return "purple";
}

export default function MissingPunch() {
  const [rows, setRows] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterBranch, setFilterBranch] = useState("All");
  const [filterFrom, setFilterFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10);
  });
  const [filterTo, setFilterTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [editing, setEditing] = useState(null);
  const [editIn, setEditIn] = useState("");
  const [editOut, setEditOut] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => { loadData(); }, [filterFrom, filterTo]);

  async function loadData() {
    setLoading(true);
    setErr("");
    try {
      const [{ data: att }, { data: emps }] = await Promise.all([
        supabase.from("attendance").select("*")
          .gte("work_date", filterFrom).lte("work_date", filterTo)
          .or("check_in.is.null,check_out.is.null")
          .order("work_date", { ascending: false }).limit(1000),
        supabase.from("employees").select("employee_code, full_name, branch, department").order("full_name"),
      ]);
      setRows(att || []);
      setEmployees(emps || []);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  const empMap = useMemo(() => Object.fromEntries((employees || []).map(e => [e.employee_code, e])), [employees]);

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (filterBranch === "All") return true;
      const emp = empMap[r.employee_code];
      return emp?.branch === filterBranch;
    });
  }, [rows, filterBranch, empMap]);

  const counts = useMemo(() => ({
    total: filtered.length,
    missingIn: filtered.filter(r => issueType(r) === "Missing In").length,
    missingOut: filtered.filter(r => issueType(r) === "Missing Out").length,
    single: filtered.filter(r => issueType(r) === "Single Punch").length,
  }), [filtered]);

  function startEdit(row) {
    setEditing(row);
    setEditIn(row.check_in ? String(row.check_in).slice(11, 16) : "");
    setEditOut(row.check_out ? String(row.check_out).slice(11, 16) : "");
  }

  async function saveEdit() {
    if (!editing) return;
    setErr("");
    const updates = {};
    const dateStr = editing.work_date + "T";
    if (editIn) updates.check_in = dateStr + editIn + ":00";
    if (editOut) updates.check_out = dateStr + editOut + ":00";

    const { error } = await supabase.from("attendance").update(updates).eq("id", editing.id);
    if (error) return setErr(error.message);

    // Audit log
    await supabase.from("audit_logs").insert({
      action: "missing_punch_fix", entity: "attendance", entity_id: String(editing.id),
      details: JSON.stringify({ employee: editing.employee_code, date: editing.work_date, ...updates }),
      performed_by: "HR", created_at: new Date().toISOString(),
    }).then(() => {});

    setMsg(`Punch fixed for ${editing.employee_code} on ${editing.work_date}.`);
    setEditing(null); loadData();
  }

  return (
    <div>
      <PageTitle title="Missing Punches" subtitle="Detect and fix single punch and missing in/out records." />

      {/* Badge Counts */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        {[
          { label: "Total Missing", value: counts.total, tone: "slate" },
          { label: "Missing In", value: counts.missingIn, tone: "red" },
          { label: "Missing Out", value: counts.missingOut, tone: "yellow" },
          { label: "Single Punch", value: counts.single, tone: "purple" },
        ].map(({ label, value, tone }) => (
          <div key={label} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm text-center">
            <p className="text-xs text-slate-500 mb-1">{label}</p>
            <p className="text-2xl font-bold text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm mb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm">
            <option value="All">All Branches</option>
            {Object.keys(BRANCH_CODE_MAP).map(b => <option key={b}>{b}</option>)}
          </select>
          <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm" />
          <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm" />
        </div>
      </div>

      {msg && <div className="mb-3 p-3 rounded-xl bg-blue-50 text-blue-700 text-sm">{msg}</div>}
      {err && <div className="mb-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{err}</div>}

      {/* Inline Edit Panel */}
      {editing && (
        <div className="bg-white border border-blue-200 rounded-2xl p-5 shadow-sm mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-slate-800">Fix Punch — {editing.employee_code} on {editing.work_date}</h3>
            <Button variant="outline" onClick={() => setEditing(null)} className="rounded-xl text-xs">Cancel</Button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-slate-500 mb-1">Check In Time</p>
              <input type="time" value={editIn} onChange={e => setEditIn(e.target.value)} className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Check Out Time</p>
              <input type="time" value={editOut} onChange={e => setEditOut(e.target.value)} className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
            </div>
          </div>
          <div className="mt-3"><Button onClick={saveEdit} className="rounded-2xl">Save Fix</Button></div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
        <div className="px-5 pt-4 pb-2">
          <h2 className="font-bold text-slate-800">Missing Punch Records</h2>
          <p className="text-xs text-slate-400 mt-0.5">{filtered.length} records · {filterFrom} to {filterTo}</p>
        </div>
        {loading ? <p className="px-5 py-8 text-slate-400 text-sm">Loading...</p> : (
          <table className="w-full min-w-[700px] text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>{["Employee", "Department", "Date", "Check In", "Check Out", "Issue Type", "Action"].map(h => (
                <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0
                ? <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No missing punches found for this period.</td></tr>
                : filtered.map((r, i) => {
                  const emp = empMap[r.employee_code];
                  const issue = issueType(r);
                  return (
                    <tr key={i} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-medium">{r.employee_code}</td>
                      <td className="px-4 py-3 text-slate-500">{emp?.department || "—"}</td>
                      <td className="px-4 py-3">{r.work_date}</td>
                      <td className="px-4 py-3">{r.check_in ? String(r.check_in).slice(11, 16) : <span className="text-red-400">Missing</span>}</td>
                      <td className="px-4 py-3">{r.check_out ? String(r.check_out).slice(11, 16) : <span className="text-red-400">Missing</span>}</td>
                      <td className="px-4 py-3"><Badge tone={issueTone(issue)}>{issue}</Badge></td>
                      <td className="px-4 py-3">
                        <Button variant="outline" onClick={() => startEdit(r)} className="rounded-xl text-xs py-1 px-3">Fix</Button>
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
