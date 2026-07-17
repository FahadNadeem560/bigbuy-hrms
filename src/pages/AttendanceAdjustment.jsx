import React, { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { Button, Badge, PageTitle } from "../components/ui.jsx";
import { BRANCH_CODE_MAP } from "../constants/branches.js";

function EmpPicker({ employees, value, onChange }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const hits = useMemo(() => {
    if (!q.trim()) return [];
    const lq = q.toLowerCase();
    return employees.filter(e => e.full_name?.toLowerCase().includes(lq) || e.employee_code?.toLowerCase().includes(lq)).slice(0, 10);
  }, [employees, q]);
  return (
    <div className="relative" ref={ref}>
      <input value={value ? `${value.employee_code} — ${value.full_name}` : q}
        onChange={e => { if (value) onChange(null); setQ(e.target.value); setOpen(true); }}
        onFocus={() => { if (!value) setOpen(true); }}
        placeholder="Search employee..." className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
      {open && hits.length > 0 && (
        <div className="absolute z-20 top-full left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-lg mt-1 max-h-48 overflow-y-auto">
          {hits.map(e => (
            <button key={e.employee_code} onMouseDown={ev => ev.preventDefault()}
              onClick={() => { onChange(e); setQ(""); setOpen(false); }}
              className="w-full text-left px-4 py-2 hover:bg-slate-50 text-sm">
              <span className="font-semibold">{e.employee_code}</span> — {e.full_name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const BLANK_FORM = { employee: null, work_date: "", original_in: "", original_out: "", adjusted_in: "", adjusted_out: "", reason: "" };

function toTimeInput(t) {
  if (!t) return "";
  const s = String(t);
  return s.includes("T") ? s.slice(11, 16) : s.slice(0, 5);
}

export default function AttendanceAdjustment({ role }) {
  const [tab, setTab] = useState("field");
  const [adjustments, setAdjustments] = useState([]);
  const [fieldEntries, setFieldEntries] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const [originalRow, setOriginalRow] = useState(undefined); // undefined = not looked up, null = no record found
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  // Rejection modal
  const [rejectId, setRejectId] = useState(null);
  const [rejectReason, setRejectReason] = useState("");

  // Filters
  const [filterBranch, setFilterBranch] = useState("All");
  const [filterDept, setFilterDept] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  useEffect(() => { loadAll(); }, []);

  // Auto-fetch the real punch times so the form doesn't require typing the
  // original in/out from memory — only the corrected values need entering.
  useEffect(() => {
    if (!form.employee || !form.work_date) { setOriginalRow(undefined); return; }
    let active = true;
    supabase.from("attendance").select("*")
      .eq("employee_code", form.employee.employee_code).eq("work_date", form.work_date)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        setOriginalRow(data || null);
        const origIn = toTimeInput(data?.check_in || data?.first_check_in);
        const origOut = toTimeInput(data?.check_out || data?.last_check_out);
        setForm(f => ({ ...f, original_in: origIn, original_out: origOut, adjusted_in: f.adjusted_in || origIn, adjusted_out: f.adjusted_out || origOut }));
      });
    return () => { active = false; };
  }, [form.employee, form.work_date]);

  async function loadAll() {
    setLoading(true);
    try {
      const [{ data: adjs }, { data: emps }, { data: field }] = await Promise.all([
        supabase.from("attendance_adjustments").select("*").order("created_at", { ascending: false }).limit(500),
        supabase.from("employees").select("employee_code, full_name, department, branch, is_field_employee").order("full_name"),
        supabase.from("attendance").select("*")
          .eq("is_manual_entry", true)
          .in("manual_entry_status", ["Pending", "Approved", "Rejected"])
          .order("work_date", { ascending: false }).limit(300),
      ]);
      setAdjustments(adjs || []);
      setEmployees(emps || []);
      setFieldEntries(field || []);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    const empMap = Object.fromEntries(employees.map(e => [e.employee_code, e]));
    return adjustments.filter(a => {
      const emp = empMap[a.employee_code || a.employee_id];
      const branchMatch = filterBranch === "All" || emp?.branch === filterBranch;
      const deptMatch = !filterDept || emp?.department?.toLowerCase().includes(filterDept.toLowerCase());
      const fromMatch = !filterFrom || (a.work_date || a.adjustment_date || "") >= filterFrom;
      const toMatch = !filterTo || (a.work_date || a.adjustment_date || "") <= filterTo;
      return branchMatch && deptMatch && fromMatch && toMatch;
    });
  }, [adjustments, employees, filterBranch, filterDept, filterFrom, filterTo]);

  const pendingFieldEntries = useMemo(() =>
    fieldEntries.filter(r => r.manual_entry_status === "Pending"),
    [fieldEntries]
  );

  async function approveFieldEntry(entry) {
    const now = new Date().toISOString();
    const { error } = await supabase.from("attendance").update({
      manual_entry_status: "Approved",
      manual_entry_approved_by: role || "HR",
      updated_at: now,
    }).eq("id", entry.id);
    if (error) { setErr(error.message); return; }
    await supabase.from("audit_logs").insert({
      action: "manual_entry_approved", entity: "attendance", entity_id: entry.id,
      performed_by: role || "HR",
      details: `Approved manual time entry for ${entry.employee_code} on ${entry.work_date}`,
      created_at: now,
    }).then(() => {});
    setMsg("Manual entry approved."); loadAll();
  }

  async function rejectFieldEntry() {
    if (!rejectId) return;
    const now = new Date().toISOString();
    const { error } = await supabase.from("attendance").update({
      manual_entry_status: "Rejected",
      manual_entry_approved_by: role || "HR",
      adjustment_status: rejectReason || "Rejected",
      updated_at: now,
    }).eq("id", rejectId);
    if (error) { setErr(error.message); return; }
    await supabase.from("audit_logs").insert({
      action: "manual_entry_rejected", entity: "attendance", entity_id: rejectId,
      performed_by: role || "HR",
      details: `Rejected manual time entry. Reason: ${rejectReason}`,
      created_at: now,
    }).then(() => {});
    setRejectId(null); setRejectReason("");
    setMsg("Manual entry rejected."); loadAll();
  }

  async function saveAdjustment() {
    if (!form.employee || !form.work_date) return setErr("Employee and date are required.");
    if (!form.adjusted_in && !form.adjusted_out) return setErr("Enter at least one corrected time.");
    setErr("");
    const now = new Date().toISOString();
    const payload = {
      employee_code: form.employee.employee_code, employee_id: form.employee.employee_code,
      employee_name: form.employee.full_name, work_date: form.work_date,
      original_in: form.original_in || null, original_out: form.original_out || null,
      adjusted_in: form.adjusted_in || null, adjusted_out: form.adjusted_out || null,
      reason: form.reason, adjusted_by: role || "HR", created_at: now,
    };
    const { error } = await supabase.from("attendance_adjustments").insert(payload);
    if (error) return setErr(error.message);

    // Apply the correction to the live attendance record (both legacy and
    // current column pairs are in use across this app) so it's not just an
    // audit entry disconnected from what everyone else sees. Locking it
    // protects the correction from being overwritten by the next ZKT re-sync.
    const checkInTs = form.adjusted_in ? `${form.work_date}T${form.adjusted_in}:00` : null;
    const checkOutTs = form.adjusted_out ? `${form.work_date}T${form.adjusted_out}:00` : null;
    const workedHours = (checkInTs && checkOutTs)
      ? Math.max(0, Math.round(((new Date(checkOutTs) - new Date(checkInTs)) / 3600000) * 100) / 100)
      : (originalRow?.actual_hours ?? originalRow?.worked_hours ?? null);
    const attUpdate = {
      check_in: checkInTs, check_out: checkOutTs,
      first_check_in: checkInTs, last_check_out: checkOutTs,
      actual_hours: workedHours, worked_hours: workedHours,
      is_manual_entry: true, manual_entry_by: role || "HR",
      adjustment_status: "Adjusted", adjustment_approved_by: role || "HR",
      review_status: "Locked",
    };
    if (originalRow) {
      await supabase.from("attendance").update(attUpdate).eq("id", originalRow.id);
    } else {
      await supabase.from("attendance").insert({
        employee_code: form.employee.employee_code, work_date: form.work_date, attendance_date: form.work_date,
        ...attUpdate,
      });
    }

    await supabase.from("audit_logs").insert({
      action: "attendance_adjustment", entity: "attendance",
      entity_id: form.employee.employee_code, details: JSON.stringify(payload),
      performed_by: role || "HR", created_at: now,
    }).then(() => {});
    setMsg("Adjustment saved and applied to the attendance record. Status/late/OT will be recalculated on the next attendance sync.");
    setForm(BLANK_FORM); setOriginalRow(undefined); setShowForm(false); loadAll();
  }

  function formatTime(t) {
    if (!t) return "—";
    const s = String(t);
    if (s.includes("T")) return s.slice(11, 16);
    return s.slice(0, 5);
  }

  return (
    <div>
      <PageTitle title="Attendance Adjustments" subtitle="Manual corrections, field employee time entries and audit trail."
        action={<Button onClick={() => setShowForm(s => !s)} className="rounded-2xl">{showForm ? "Cancel" : "+ New Adjustment"}</Button>} />

      {msg && <div className="mb-3 p-3 rounded-xl bg-blue-50 text-blue-700 text-sm">{msg}</div>}
      {err && <div className="mb-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{err}</div>}

      {/* Reject modal */}
      {rejectId && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 shadow-xl w-full max-w-sm">
            <h3 className="font-bold text-slate-800 mb-3">Reject Manual Entry</h3>
            <input value={rejectReason} onChange={e => setRejectReason(e.target.value)}
              placeholder="Rejection reason..." className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm mb-4" />
            <div className="flex gap-2">
              <Button onClick={rejectFieldEntry} className="rounded-xl">Confirm Reject</Button>
              <Button variant="outline" onClick={() => { setRejectId(null); setRejectReason(""); }} className="rounded-xl">Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm mb-4">
          <h2 className="font-bold text-slate-800 mb-4">New Attendance Adjustment</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div><p className="text-xs text-slate-500 mb-1">Employee</p><EmpPicker employees={employees} value={form.employee} onChange={v => setForm(f => ({ ...f, employee: v, adjusted_in: "", adjusted_out: "" }))} /></div>
            <div><p className="text-xs text-slate-500 mb-1">Date</p><input type="date" value={form.work_date} onChange={e => setForm(f => ({ ...f, work_date: e.target.value, adjusted_in: "", adjusted_out: "" }))} className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" /></div>
            <div className="lg:col-span-1" />
            <div>
              <p className="text-xs text-slate-500 mb-1">Original In {originalRow === undefined ? "" : originalRow ? "(recorded)" : "(no record)"}</p>
              <div className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm bg-slate-50 text-slate-600">
                {form.employee && form.work_date ? (originalRow === undefined ? "Loading…" : form.original_in || "—") : "Pick employee + date"}
              </div>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Original Out {originalRow === undefined ? "" : originalRow ? "(recorded)" : "(no record)"}</p>
              <div className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm bg-slate-50 text-slate-600">
                {form.employee && form.work_date ? (originalRow === undefined ? "Loading…" : form.original_out || "—") : "Pick employee + date"}
              </div>
            </div>
            <div className="lg:col-span-1" />
            <div><p className="text-xs text-slate-500 mb-1">Corrected In</p><input type="time" value={form.adjusted_in} onChange={e => setForm(f => ({ ...f, adjusted_in: e.target.value }))} className="w-full px-4 py-2 rounded-xl border border-blue-200 text-sm" /></div>
            <div><p className="text-xs text-slate-500 mb-1">Corrected Out</p><input type="time" value={form.adjusted_out} onChange={e => setForm(f => ({ ...f, adjusted_out: e.target.value }))} className="w-full px-4 py-2 rounded-xl border border-blue-200 text-sm" /></div>
            <div className="lg:col-span-3"><p className="text-xs text-slate-500 mb-1">Reason</p><input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder="Reason..." className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" /></div>
          </div>
          <p className="text-xs text-slate-400 mt-2">Original times are pulled automatically from the recorded attendance for that day — only enter the corrected time(s).</p>
          <div className="mt-4 flex gap-2">
            <Button onClick={saveAdjustment} className="rounded-2xl">Save Adjustment</Button>
            <Button variant="outline" onClick={() => { setShowForm(false); setForm(BLANK_FORM); setOriginalRow(undefined); }} className="rounded-2xl">Cancel</Button>
          </div>
        </div>
      )}

      {/* Sub-tabs */}
      <div className="flex gap-2 mb-4">
        {[["field", `Field Employee Entries (${pendingFieldEntries.length} pending)`], ["register", "Adjustment Register"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${tab === k ? "bg-slate-950 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{l}</button>
        ))}
      </div>

      {/* Field Employee Entries */}
      {tab === "field" && (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
          <div className="px-5 pt-4 pb-2">
            <h2 className="font-bold text-slate-800">Field Employee Manual Time Entries</h2>
            <p className="text-xs text-slate-400 mt-0.5">Submitted by field employees via self-service portal. {pendingFieldEntries.length} pending approval.</p>
          </div>
          {loading ? <p className="px-5 py-8 text-slate-400 text-sm">Loading...</p> : (
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>{["Employee","Date","Check In","Check Out","Hours","Submitted By","Status","Action"].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {fieldEntries.length === 0
                  ? <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No manual time entries found.</td></tr>
                  : fieldEntries.map((r, i) => {
                    const emp = employees.find(e => e.employee_code === r.employee_code);
                    const isPending = r.manual_entry_status === "Pending";
                    return (
                      <tr key={i} className={isPending ? "bg-amber-50/30" : ""}>
                        <td className="px-4 py-3 font-medium">{r.employee_code}<div className="text-xs text-slate-400">{emp?.full_name}</div></td>
                        <td className="px-4 py-3">{r.work_date}</td>
                        <td className="px-4 py-3">{formatTime(r.check_in)}</td>
                        <td className="px-4 py-3">{formatTime(r.check_out)}</td>
                        <td className="px-4 py-3">{r.actual_hours ?? "—"}</td>
                        <td className="px-4 py-3">{r.manual_entry_by || r.employee_code}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2.5 py-0.5 rounded-full text-xs border ${
                            r.manual_entry_status === "Approved" ? "bg-green-50 text-green-700 border-green-100"
                            : r.manual_entry_status === "Rejected" ? "bg-red-50 text-red-700 border-red-100"
                            : "bg-amber-50 text-amber-700 border-amber-100"
                          }`}>{r.manual_entry_status || "Pending"}</span>
                        </td>
                        <td className="px-4 py-3">
                          {isPending && (
                            <div className="flex gap-2">
                              <Button onClick={() => approveFieldEntry(r)} className="rounded-xl text-xs py-1 px-2">Approve</Button>
                              <Button variant="outline" onClick={() => setRejectId(r.id)} className="rounded-xl text-xs py-1 px-2">Reject</Button>
                            </div>
                          )}
                          {!isPending && <span className="text-slate-400 text-xs">{r.manual_entry_approved_by || "—"}</span>}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Adjustment Register */}
      {tab === "register" && (
        <div>
          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm mb-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm">
                <option value="All">All Branches</option>
                {Object.keys(BRANCH_CODE_MAP).map(b => <option key={b}>{b}</option>)}
              </select>
              <input value={filterDept} onChange={e => setFilterDept(e.target.value)} placeholder="Filter by department" className="px-4 py-2 rounded-xl border border-slate-200 text-sm" />
              <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm" />
              <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm" />
            </div>
          </div>
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
            <div className="px-5 pt-4 pb-2">
              <h2 className="font-bold text-slate-800">Adjustment Register</h2>
              <p className="text-xs text-slate-400 mt-0.5">{filtered.length} records</p>
            </div>
            {loading ? <p className="px-5 py-8 text-slate-400 text-sm">Loading...</p> : (
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>{["Date","Employee","Orig In","Orig Out","Adj In","Adj Out","Reason","By","Timestamp"].map(h => (
                    <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
                  ))}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.length === 0
                    ? <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">No adjustments found.</td></tr>
                    : filtered.map((a, i) => (
                      <tr key={i}>
                        <td className="px-4 py-3 font-medium">{a.work_date || a.adjustment_date}</td>
                        <td className="px-4 py-3">{a.employee_name || a.employee_code || a.employee_id}</td>
                        <td className="px-4 py-3">{a.original_in || "—"}</td>
                        <td className="px-4 py-3">{a.original_out || "—"}</td>
                        <td className="px-4 py-3 text-blue-600 font-medium">{a.adjusted_in || "—"}</td>
                        <td className="px-4 py-3 text-blue-600 font-medium">{a.adjusted_out || "—"}</td>
                        <td className="px-4 py-3 max-w-[140px] truncate">{a.reason || "—"}</td>
                        <td className="px-4 py-3">{a.adjusted_by || "—"}</td>
                        <td className="px-4 py-3 text-slate-400 text-xs">{a.created_at?.slice(0, 16) || "—"}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
