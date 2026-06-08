import React, { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { Button, Badge, PageTitle } from "../components/ui.jsx";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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
              <span className="text-xs text-slate-400 ml-2">{e.department}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function getMondayOf(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr, n) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

const SHIFT_BLANK = { name: "", start_time: "09:00", end_time: "18:00", grace_minutes: 15, days_applicable: "Mon,Tue,Wed,Thu,Fri" };
const ASSIGN_BLANK = { employee: null, shift_id: "", assign_type: "Individual", department: "", effective_from: "" };
const RULE_BLANK = { department: "", shift_id: "" };

export default function RosterManagement() {
  const [tab, setTab] = useState("shifts");
  const [shifts, setShifts] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [roster, setRoster] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [autoRules, setAutoRules] = useState([]);
  const [shiftForm, setShiftForm] = useState(SHIFT_BLANK);
  const [assignForm, setAssignForm] = useState(ASSIGN_BLANK);
  const [ruleForm, setRuleForm] = useState(RULE_BLANK);
  const [editShift, setEditShift] = useState(null);
  const [showShiftForm, setShowShiftForm] = useState(false);
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [weekStart, setWeekStart] = useState(getMondayOf());
  const [calMonth, setCalMonth] = useState(new Date().toISOString().slice(0, 7));
  const [generating, setGenerating] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => { loadAll(); }, []);
  useEffect(() => { loadRoster(); }, [weekStart]);

  async function loadAll() {
    const [{ data: sh }, { data: asgn }, { data: emps }, { data: rules }] = await Promise.all([
      supabase.from("shifts").select("*").order("name"),
      supabase.from("employee_shifts").select("*").order("created_at", { ascending: false }),
      supabase.from("employees").select("employee_code, full_name, department, branch, status").eq("status", "Active").order("full_name"),
      supabase.from("shift_auto_rules").select("*").order("department"),
    ]);
    setShifts(sh || []);
    setAssignments(asgn || []);
    setEmployees(emps || []);
    setDepartments([...new Set((emps || []).map(e => e.department).filter(Boolean))]);
    setAutoRules(rules || []);
  }

  async function loadRoster() {
    const endDate = addDays(weekStart, 6);
    const { data } = await supabase.from("roster_entries").select("*").gte("work_date", weekStart).lte("work_date", endDate);
    setRoster(data || []);
  }

  async function saveShift() {
    const f = editShift || shiftForm;
    if (!f.name || !f.start_time || !f.end_time) return setErr("Shift name, start and end times required.");
    setErr("");
    if (editShift) {
      const { error } = await supabase.from("shifts").update({ name: f.name, start_time: f.start_time, end_time: f.end_time, grace_minutes: Number(f.grace_minutes || 15), days_applicable: f.days_applicable }).eq("id", f.id);
      if (error) return setErr(error.message);
    } else {
      const { error } = await supabase.from("shifts").insert({ name: f.name, start_time: f.start_time, end_time: f.end_time, grace_minutes: Number(f.grace_minutes || 15), days_applicable: f.days_applicable });
      if (error) return setErr(error.message);
    }
    setMsg("Shift saved."); setShiftForm(SHIFT_BLANK); setEditShift(null); setShowShiftForm(false); loadAll();
  }

  async function saveAssignment() {
    const f = assignForm;
    if (f.assign_type === "Individual" && !f.employee) return setErr("Employee required.");
    if (f.assign_type === "Department" && !f.department) return setErr("Department required.");
    if (!f.shift_id || !f.effective_from) return setErr("Shift and effective date required.");
    setErr("");
    if (f.assign_type === "Individual") {
      const { error } = await supabase.from("employee_shifts").insert({ employee_code: f.employee.employee_code, employee_name: f.employee.full_name, shift_id: f.shift_id, effective_from: f.effective_from, is_active: true });
      if (error) return setErr(error.message);
      setMsg("Shift assigned to employee.");
    } else {
      const deptEmps = employees.filter(e => e.department === f.department);
      const rows = deptEmps.map(e => ({ employee_code: e.employee_code, employee_name: e.full_name, shift_id: f.shift_id, effective_from: f.effective_from, is_active: true }));
      if (rows.length === 0) return setErr("No employees in this department.");
      const { error } = await supabase.from("employee_shifts").insert(rows);
      if (error) return setErr(error.message);
      setMsg(`Shift assigned to ${rows.length} employees in ${f.department}.`);
    }
    setAssignForm(ASSIGN_BLANK); setShowAssignForm(false); loadAll();
  }

  async function saveRule() {
    if (!ruleForm.department || !ruleForm.shift_id) return setErr("Department and shift required.");
    setErr("");
    const existing = autoRules.find(r => r.department === ruleForm.department);
    if (existing) {
      await supabase.from("shift_auto_rules").update({ shift_id: ruleForm.shift_id }).eq("id", existing.id);
    } else {
      await supabase.from("shift_auto_rules").insert({ department: ruleForm.department, shift_id: ruleForm.shift_id });
    }
    setMsg("Auto-assign rule saved."); setRuleForm(RULE_BLANK); loadAll();
  }

  async function generateWeeklyRoster() {
    setGenerating(true); setErr("");
    try {
      const rows = [];
      for (let d = 0; d < 7; d++) {
        const date = addDays(weekStart, d);
        for (const emp of employees) {
          const rule = autoRules.find(r => r.department === emp.department);
          const assignment = assignments.find(a => a.employee_code === emp.employee_code && a.is_active);
          const shiftId = assignment?.shift_id || rule?.shift_id;
          const shift = shiftId ? shifts.find(s => String(s.id) === String(shiftId)) : null;
          if (!shift) continue;
          const dayName = DAYS[d];
          const isOff = shift.days_applicable && !shift.days_applicable.includes(dayName);
          rows.push({ employee_code: emp.employee_code, employee_name: emp.full_name, shift_id: shiftId, work_date: date, is_day_off: isOff });
        }
      }
      await supabase.from("roster_entries").delete().gte("work_date", weekStart).lte("work_date", addDays(weekStart, 6));
      if (rows.length > 0) {
        const batches = [];
        for (let i = 0; i < rows.length; i += 100) batches.push(rows.slice(i, i + 100));
        for (const batch of batches) await supabase.from("roster_entries").insert(batch);
      }
      setMsg(`Roster generated: ${rows.length} entries for week of ${weekStart}.`);
      loadRoster();
    } catch (e) {
      setErr(e.message);
    } finally {
      setGenerating(false);
    }
  }

  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const rosterByEmp = useMemo(() => {
    const map = {};
    roster.forEach(r => {
      if (!map[r.employee_code]) map[r.employee_code] = { name: r.employee_name, entries: {} };
      map[r.employee_code].entries[r.work_date] = r;
    });
    return map;
  }, [roster]);

  const { daysInMonth, firstDay } = useMemo(() => {
    const [y, m] = calMonth.split("-").map(Number);
    return { daysInMonth: new Date(y, m, 0).getDate(), firstDay: new Date(y, m - 1, 1).getDay() };
  }, [calMonth]);

  function dayRosterEntries(day) {
    const [y, m] = calMonth.split("-").map(Number);
    const d = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return roster.filter(r => r.work_date === d && !r.is_day_off);
  }

  return (
    <div>
      <PageTitle title="Roster Management" subtitle="Manage shift definitions, employee assignments and weekly/monthly schedules." />
      {msg && <div className="mb-3 p-3 rounded-xl bg-blue-50 text-blue-700 text-sm">{msg}</div>}
      {err && <div className="mb-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{err}</div>}

      <div className="flex flex-wrap gap-2 mb-4">
        {[["shifts", "Shifts"], ["assignments", "Assignments"], ["weekly", "Weekly Roster"], ["monthly", "Monthly Calendar"], ["auto", "Auto-Assign"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${tab === k ? "bg-slate-950 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{l}</button>
        ))}
      </div>

      {tab === "shifts" && (
        <div>
          <div className="flex justify-end mb-3">
            <Button onClick={() => { setShowShiftForm(s => !s); setEditShift(null); setShiftForm(SHIFT_BLANK); }} className="rounded-2xl">{showShiftForm ? "Cancel" : "+ New Shift"}</Button>
          </div>
          {showShiftForm && (
            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm mb-4">
              <h3 className="font-bold mb-3">{editShift ? "Edit Shift" : "New Shift"}</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div><p className="text-xs text-slate-500 mb-1">Shift Name *</p><input value={editShift ? editShift.name : shiftForm.name} onChange={e => editShift ? setEditShift(v => ({...v, name: e.target.value})) : setShiftForm(v => ({...v, name: e.target.value}))} className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" /></div>
                <div><p className="text-xs text-slate-500 mb-1">Start Time *</p><input type="time" value={editShift ? editShift.start_time : shiftForm.start_time} onChange={e => editShift ? setEditShift(v => ({...v, start_time: e.target.value})) : setShiftForm(v => ({...v, start_time: e.target.value}))} className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" /></div>
                <div><p className="text-xs text-slate-500 mb-1">End Time *</p><input type="time" value={editShift ? editShift.end_time : shiftForm.end_time} onChange={e => editShift ? setEditShift(v => ({...v, end_time: e.target.value})) : setShiftForm(v => ({...v, end_time: e.target.value}))} className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" /></div>
                <div><p className="text-xs text-slate-500 mb-1">Grace Minutes</p><input type="number" value={editShift ? editShift.grace_minutes : shiftForm.grace_minutes} onChange={e => editShift ? setEditShift(v => ({...v, grace_minutes: e.target.value})) : setShiftForm(v => ({...v, grace_minutes: e.target.value}))} className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" /></div>
                <div className="md:col-span-2"><p className="text-xs text-slate-500 mb-1">Days Applicable (comma-separated: Mon,Tue,Wed,Thu,Fri,Sat,Sun)</p><input value={editShift ? editShift.days_applicable : shiftForm.days_applicable} onChange={e => editShift ? setEditShift(v => ({...v, days_applicable: e.target.value})) : setShiftForm(v => ({...v, days_applicable: e.target.value}))} className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" /></div>
              </div>
              <div className="mt-3 flex gap-2"><Button onClick={saveShift} className="rounded-2xl">Save</Button><Button variant="outline" onClick={() => { setShowShiftForm(false); setEditShift(null); }} className="rounded-2xl">Cancel</Button></div>
            </div>
          )}
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500"><tr>{["Shift Name", "Start", "End", "Grace", "Days", "Action"].map(h => <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {shifts.length === 0 ? <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No shifts defined.</td></tr>
                  : shifts.map(s => <tr key={s.id}><td className="px-4 py-3 font-semibold">{s.name}</td><td className="px-4 py-3">{s.start_time}</td><td className="px-4 py-3">{s.end_time}</td><td className="px-4 py-3">{s.grace_minutes} min</td><td className="px-4 py-3 text-slate-500">{s.days_applicable}</td><td className="px-4 py-3"><Button variant="outline" onClick={() => { setEditShift(s); setShowShiftForm(true); }} className="rounded-xl text-xs py-1 px-2">Edit</Button></td></tr>)}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "assignments" && (
        <div>
          <div className="flex justify-end mb-3"><Button onClick={() => setShowAssignForm(s => !s)} className="rounded-2xl">{showAssignForm ? "Cancel" : "+ Assign Shift"}</Button></div>
          {showAssignForm && (
            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm mb-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-500 mb-1">Assign To</p>
                  <select value={assignForm.assign_type} onChange={e => setAssignForm(f => ({ ...f, assign_type: e.target.value }))} className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm">
                    <option value="Individual">Individual Employee</option>
                    <option value="Department">Entire Department</option>
                  </select>
                </div>
                {assignForm.assign_type === "Individual"
                  ? <div><p className="text-xs text-slate-500 mb-1">Employee *</p><EmpPicker employees={employees} value={assignForm.employee} onChange={v => setAssignForm(f => ({ ...f, employee: v }))} /></div>
                  : <div><p className="text-xs text-slate-500 mb-1">Department *</p><select value={assignForm.department} onChange={e => setAssignForm(f => ({ ...f, department: e.target.value }))} className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm"><option value="">Select...</option>{departments.map(d => <option key={d}>{d}</option>)}</select></div>}
                <div>
                  <p className="text-xs text-slate-500 mb-1">Shift *</p>
                  <select value={assignForm.shift_id} onChange={e => setAssignForm(f => ({ ...f, shift_id: e.target.value }))} className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm">
                    <option value="">Select shift...</option>
                    {shifts.map(s => <option key={s.id} value={s.id}>{s.name} ({s.start_time}–{s.end_time})</option>)}
                  </select>
                </div>
                <div><p className="text-xs text-slate-500 mb-1">Effective From *</p><input type="date" value={assignForm.effective_from} onChange={e => setAssignForm(f => ({ ...f, effective_from: e.target.value }))} className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" /></div>
              </div>
              <div className="mt-3 flex gap-2"><Button onClick={saveAssignment} className="rounded-2xl">Assign</Button><Button variant="outline" onClick={() => setShowAssignForm(false)} className="rounded-2xl">Cancel</Button></div>
            </div>
          )}
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead className="bg-slate-50 text-slate-500"><tr>{["Employee", "Shift", "Effective From", "Status"].map(h => <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {assignments.length === 0 ? <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">No assignments.</td></tr>
                  : assignments.map(a => {
                    const sh = shifts.find(s => String(s.id) === String(a.shift_id));
                    return <tr key={a.id}><td className="px-4 py-3 font-medium">{a.employee_name || a.employee_code}</td><td className="px-4 py-3">{sh ? `${sh.name} (${sh.start_time}–${sh.end_time})` : a.shift_id}</td><td className="px-4 py-3">{a.effective_from}</td><td className="px-4 py-3"><Badge tone={a.is_active ? "green" : "slate"}>{a.is_active ? "Active" : "Inactive"}</Badge></td></tr>;
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "weekly" && (
        <div>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <div><p className="text-xs text-slate-500 mb-1">Week Starting (Monday)</p><input type="date" value={weekStart} onChange={e => setWeekStart(getMondayOf(e.target.value))} className="px-4 py-2 rounded-xl border border-slate-200 text-sm" /></div>
            <div className="mt-4 text-sm text-slate-500">{weekStart} — {addDays(weekStart, 6)}</div>
          </div>
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
            <table className="w-full min-w-[900px] text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="text-left px-3 py-3 font-medium">Employee</th>
                  {weekDates.map((d, i) => <th key={d} className="text-center px-2 py-3 font-medium">{DAYS[i]}<div className="text-slate-400 font-normal">{d.slice(5)}</div></th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employees.slice(0, 50).map(emp => (
                  <tr key={emp.employee_code}>
                    <td className="px-3 py-2 font-medium text-slate-800">{emp.full_name}<div className="text-slate-400">{emp.employee_code}</div></td>
                    {weekDates.map(d => {
                      const entry = rosterByEmp[emp.employee_code]?.entries[d];
                      const sh = entry ? shifts.find(s => String(s.id) === String(entry.shift_id)) : null;
                      return (
                        <td key={d} className="px-2 py-2 text-center">
                          {entry
                            ? entry.is_day_off
                              ? <span className="text-slate-400 text-xs">Off</span>
                              : <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-lg text-xs">{sh?.name || "—"}</span>
                            : <span className="text-slate-300">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {employees.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No employees.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "monthly" && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <input type="month" value={calMonth} onChange={e => setCalMonth(e.target.value)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm" />
          </div>
          <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
            <div className="grid grid-cols-7 gap-1 mb-1">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => <div key={d} className="text-center text-xs font-semibold text-slate-400 py-2">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: firstDay }).map((_, i) => <div key={`b${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dl = dayRosterEntries(day);
                return (
                  <div key={day} className={`rounded-xl p-1.5 min-h-[56px] text-xs border ${dl.length > 0 ? "bg-indigo-50 border-indigo-200" : "bg-slate-50 border-transparent"}`}>
                    <div className={`font-semibold mb-0.5 ${dl.length > 0 ? "text-indigo-700" : "text-slate-500"}`}>{day}</div>
                    {dl.slice(0, 2).map((e, li) => <div key={li} className="truncate text-[10px] text-indigo-600">{e.employee_name?.split(" ")[0]}</div>)}
                    {dl.length > 2 && <div className="text-[10px] text-indigo-400">+{dl.length - 2}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {tab === "auto" && (
        <div>
          <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm mb-4">
            <h2 className="font-bold text-slate-800 mb-1">Auto-Assignment Rules</h2>
            <p className="text-xs text-slate-400 mb-4">Define default shifts per department. Used when "Generate Weekly Roster" is clicked.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
              <div>
                <p className="text-xs text-slate-500 mb-1">Department</p>
                <select value={ruleForm.department} onChange={e => setRuleForm(v => ({ ...v, department: e.target.value }))} className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm">
                  <option value="">Select department...</option>
                  {departments.map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Default Shift</p>
                <select value={ruleForm.shift_id} onChange={e => setRuleForm(v => ({ ...v, shift_id: e.target.value }))} className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm">
                  <option value="">Select shift...</option>
                  {shifts.map(s => <option key={s.id} value={s.id}>{s.name} ({s.start_time}–{s.end_time})</option>)}
                </select>
              </div>
              <div className="flex items-end"><Button onClick={saveRule} className="rounded-2xl w-full">Save Rule</Button></div>
            </div>
            <div className="divide-y divide-slate-100">
              {autoRules.length === 0 ? <p className="text-sm text-slate-400 py-2">No rules defined.</p>
                : autoRules.map((r, i) => {
                  const sh = shifts.find(s => String(s.id) === String(r.shift_id));
                  return <div key={i} className="py-2 text-sm flex items-center justify-between"><span className="font-medium">{r.department}</span><Badge tone="blue">{sh?.name || r.shift_id}</Badge></div>;
                })}
            </div>
          </div>

          <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
            <h2 className="font-bold text-slate-800 mb-1">Generate Weekly Roster</h2>
            <p className="text-xs text-slate-400 mb-4">Creates roster entries for the selected week based on auto-rules and individual assignments. Employee-specific shift overrides take priority over department rules.</p>
            <div className="flex items-center gap-4 flex-wrap">
              <div>
                <p className="text-xs text-slate-500 mb-1">Week Starting</p>
                <input type="date" value={weekStart} onChange={e => setWeekStart(getMondayOf(e.target.value))} className="px-4 py-2 rounded-xl border border-slate-200 text-sm" />
              </div>
              <div className="mt-4">
                <Button onClick={generateWeeklyRoster} disabled={generating} className="rounded-2xl">
                  {generating ? "Generating..." : "⚡ Generate Weekly Roster"}
                </Button>
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-3">This will replace any existing roster entries for the selected week.</p>
          </div>
        </div>
      )}
    </div>
  );
}
