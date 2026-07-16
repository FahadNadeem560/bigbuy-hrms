import React, { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { Button, Badge, PageTitle } from "../components/ui.jsx";
import { BRANCH_CODE_MAP } from "../constants/branches.js";

const TABS = [["levels", "Levels"], ["assign", "Assign Employees"], ["orgchart", "Org Chart View"]];

const PERM_FIELDS = [
  ["can_approve_leave", "Can approve leave"],
  ["can_approve_fines", "Can approve fines"],
  ["can_approve_adjustments", "Can approve adjustments"],
  ["can_view_payroll", "Can view payroll"],
  ["can_view_all_branches", "Can view all branches"],
];

export const LEVEL_COLORS = {
  1: { bg: "#EAB308", text: "#3d2f00", name: "Gold" },
  2: { bg: "#1e3a8a", text: "#ffffff", name: "Dark Blue" },
  3: { bg: "#3b82f6", text: "#ffffff", name: "Blue" },
  4: { bg: "#16a34a", text: "#ffffff", name: "Green" },
  5: { bg: "#14b8a6", text: "#ffffff", name: "Teal" },
  6: { bg: "#f97316", text: "#ffffff", name: "Orange" },
  7: { bg: "#64748b", text: "#ffffff", name: "Grey" },
  8: { bg: "#e2e8f0", text: "#334155", name: "Light Grey" },
};
export function levelColor(n) { return LEVEL_COLORS[n] || LEVEL_COLORS[8]; }

function EmpSearchPicker({ employees, value, onChange, placeholder }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const hits = useMemo(() => {
    const lq = q.trim().toLowerCase();
    const pool = lq ? employees.filter(e => e.full_name?.toLowerCase().includes(lq) || e.employee_code?.toLowerCase().includes(lq)) : employees;
    return pool.slice(0, 10);
  }, [employees, q]);
  return (
    <div className="relative" ref={ref}>
      <input value={value ? `${value.employee_code} — ${value.full_name}` : q}
        onChange={e => { if (value) onChange(null); setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder || "Search by name or code..."}
        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
      {open && (
        <div className="absolute z-30 top-full left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-lg mt-1 max-h-48 overflow-y-auto">
          {value && (
            <button onMouseDown={e => e.preventDefault()} onClick={() => { onChange(null); setQ(""); setOpen(false); }}
              className="w-full text-left px-3 py-2 hover:bg-slate-50 text-xs text-slate-400">— None —</button>
          )}
          {hits.map(e => (
            <button key={e.employee_code} onMouseDown={ev => ev.preventDefault()}
              onClick={() => { onChange(e); setQ(""); setOpen(false); }}
              className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm">
              <span className="font-semibold">{e.employee_code}</span> — {e.full_name}
              <span className="text-xs text-slate-400 ml-2">{e.department}</span>
            </button>
          ))}
          {hits.length === 0 && <div className="px-3 py-2 text-sm text-slate-400">No matches</div>}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════ TAB 1: LEVELS ═══════════════════════════
function LevelsTab({ levels, reload, setMsg, setErr }) {
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [insertAfter, setInsertAfter] = useState("0");
  const dragItem = useRef(null);
  const [dragOverId, setDragOverId] = useState(null);

  async function saveName(level, name) {
    if (name === level.level_name) return;
    await supabase.from("hierarchy_levels").update({ level_name: name }).eq("id", level.id);
    setMsg("Level renamed."); reload();
  }

  async function togglePerm(level, field) {
    const value = !level[field];
    await supabase.from("hierarchy_levels").update({ [field]: value }).eq("id", level.id);
    reload();
  }

  async function addLevel() {
    if (!newName.trim()) return setErr("Level name is required.");
    setErr("");
    const after = Number(insertAfter);
    const toShift = levels.filter(l => l.level_number > after);
    await Promise.all(toShift.map(l => supabase.from("hierarchy_levels").update({ level_number: l.level_number + 1 }).eq("id", l.id)));
    await supabase.from("hierarchy_levels").insert({
      level_number: after + 1, level_name: newName.trim(),
      can_approve_leave: false, can_approve_fines: false, can_approve_adjustments: false,
      can_view_payroll: false, can_view_all_branches: false,
    });
    setNewName(""); setInsertAfter("0"); setShowAdd(false);
    setMsg("Level added."); reload();
  }

  async function onDrop(targetId) {
    const fromId = dragItem.current;
    dragItem.current = null; setDragOverId(null);
    if (!fromId || fromId === targetId) return;
    const reordered = [...levels];
    const fromIdx = reordered.findIndex(l => l.id === fromId);
    const toIdx = reordered.findIndex(l => l.id === targetId);
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    await Promise.all(reordered.map((l, i) => supabase.from("hierarchy_levels").update({ level_number: i + 1 }).eq("id", l.id)));
    setMsg("Levels reordered."); reload();
  }

  return (
    <div>
      <div className="flex justify-end mb-3">
        <Button onClick={() => setShowAdd(s => !s)} className="rounded-2xl">{showAdd ? "Cancel" : "+ Add Level"}</Button>
      </div>
      {showAdd && (
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm mb-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[180px]">
            <p className="text-xs text-slate-500 mb-1">New Level Name</p>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Regional Manager" className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">Insert After</p>
            <select value={insertAfter} onChange={e => setInsertAfter(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 text-sm">
              <option value="0">— Top (Level 1) —</option>
              {levels.map(l => <option key={l.id} value={l.level_number}>{l.level_number}. {l.level_name}</option>)}
            </select>
          </div>
          <Button onClick={addLevel} className="rounded-2xl">Save</Button>
        </div>
      )}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
        <div className="px-5 pt-4 pb-2"><h2 className="font-bold text-slate-800">Hierarchy Levels</h2><p className="text-xs text-slate-400">Drag rows to reorder. Changes save immediately.</p></div>
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="text-left px-4 py-3 font-medium w-10"></th>
              <th className="text-left px-4 py-3 font-medium">#</th>
              <th className="text-left px-4 py-3 font-medium">Level Name</th>
              <th className="text-center px-3 py-3 font-medium">Cross-Branch</th>
              {PERM_FIELDS.map(([k, l]) => <th key={k} className="text-center px-3 py-3 font-medium">{l}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {levels.map(level => (
              <tr key={level.id}
                draggable
                onDragStart={() => { dragItem.current = level.id; }}
                onDragOver={e => { e.preventDefault(); setDragOverId(level.id); }}
                onDrop={() => onDrop(level.id)}
                className={dragOverId === level.id ? "bg-blue-50" : ""}>
                <td className="px-4 py-3 text-slate-300 cursor-grab select-none" title="Drag to reorder">⠿</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold"
                    style={{ background: levelColor(level.level_number).bg, color: levelColor(level.level_number).text }}>
                    {level.level_number}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <input defaultValue={level.level_name} onBlur={e => saveName(level, e.target.value)}
                    className="px-2 py-1 rounded-lg border border-transparent hover:border-slate-200 focus:border-slate-300 text-sm font-medium w-full" />
                </td>
                <td className="px-3 py-3 text-center">
                  <input type="checkbox" checked={!!level.is_cross_branch} onChange={() => togglePerm(level, "is_cross_branch")} className="rounded" />
                </td>
                {PERM_FIELDS.map(([k]) => (
                  <td key={k} className="px-3 py-3 text-center">
                    <input type="checkbox" checked={!!level[k]} onChange={() => togglePerm(level, k)} className="rounded" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════ TAB 2: ASSIGN EMPLOYEES ═══════════════════════════
function AssignTab({ levels, employees, hierarchy, reload, setMsg, setErr }) {
  const branches = Object.keys(BRANCH_CODE_MAP);
  const [branch, setBranch] = useState(branches[0] || "All");
  const [deptFilter, setDeptFilter] = useState("");
  const [openLevelId, setOpenLevelId] = useState(null);
  const [assignEmp, setAssignEmp] = useState(null);
  const [reportsTo, setReportsTo] = useState(null);
  const [dottedTo, setDottedTo] = useState(null);
  const [dottedReason, setDottedReason] = useState("");
  const [editingRow, setEditingRow] = useState(null);

  const branchEmployees = useMemo(() => employees.filter(e => e.branch === branch), [employees, branch]);
  const departments = useMemo(() => ["All", ...new Set(branchEmployees.map(e => e.department).filter(Boolean))], [branchEmployees]);

  const rowsForLevel = (levelNumber) => hierarchy.filter(h =>
    h.is_active && h.level_number === levelNumber && h.branch === branch &&
    (!deptFilter || deptFilter === "All" || h.department === deptFilter)
  );

  function openAssign(level, existing) {
    setOpenLevelId(level.id);
    if (existing) {
      setEditingRow(existing);
      const emp = employees.find(e => e.id === existing.employee_id);
      setAssignEmp(emp || { id: existing.employee_id, employee_code: existing.employee_code, full_name: existing.employee_name, department: existing.department });
      const rt = employees.find(e => e.id === existing.reports_to_employee_id);
      setReportsTo(rt || (existing.reports_to_employee_id ? { id: existing.reports_to_employee_id, employee_code: "", full_name: existing.reports_to_name } : null));
      const dt = employees.find(e => e.id === existing.dotted_line_to_employee_id);
      setDottedTo(dt || (existing.dotted_line_to_employee_id ? { id: existing.dotted_line_to_employee_id, employee_code: "", full_name: existing.dotted_line_to_name } : null));
      setDottedReason(existing.dotted_line_reason || "");
    } else {
      setEditingRow(null); setAssignEmp(null); setReportsTo(null); setDottedTo(null); setDottedReason("");
    }
  }

  function closeAssign() { setOpenLevelId(null); setAssignEmp(null); setReportsTo(null); setDottedTo(null); setDottedReason(""); setEditingRow(null); }

  async function saveAssignment(level) {
    if (!assignEmp) return setErr("Select an employee first.");
    setErr("");
    // Enforce one active hierarchy position per employee.
    await supabase.from("employee_hierarchy").update({ is_active: false }).eq("employee_id", assignEmp.id).eq("is_active", true);
    const { error } = await supabase.from("employee_hierarchy").insert({
      employee_id: assignEmp.id, employee_code: assignEmp.employee_code, employee_name: assignEmp.full_name,
      branch, department: assignEmp.department || null,
      hierarchy_level_id: level.id, level_number: level.level_number, level_name: level.level_name,
      reports_to_employee_id: reportsTo?.id || null, reports_to_name: reportsTo?.full_name || null,
      dotted_line_to_employee_id: dottedTo?.id || null, dotted_line_to_name: dottedTo?.full_name || null,
      dotted_line_reason: dottedTo ? (dottedReason || null) : null,
      is_cross_branch: !!level.is_cross_branch,
      is_active: true,
    });
    if (error) return setErr(error.message);
    setMsg(`${assignEmp.full_name} assigned to ${level.level_name}.`);
    closeAssign(); reload();
  }

  async function removeAssignment(row) {
    if (!window.confirm(`Remove ${row.employee_name} from ${row.level_name}?`)) return;
    await supabase.from("employee_hierarchy").update({ is_active: false }).eq("id", row.id);
    setMsg("Removed from hierarchy."); reload();
  }

  return (
    <div>
      <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <p className="text-xs text-slate-500 mb-1">Branch</p>
          <select value={branch} onChange={e => { setBranch(e.target.value); setDeptFilter(""); closeAssign(); }} className="px-3 py-2 rounded-xl border border-slate-200 text-sm">
            {branches.map(b => <option key={b}>{b}</option>)}
          </select>
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-1">Department (optional)</p>
          <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 text-sm">
            {departments.map(d => <option key={d} value={d === "All" ? "" : d}>{d}</option>)}
          </select>
        </div>
      </div>

      <div className="space-y-3">
        {levels.map(level => {
          const rows = rowsForLevel(level.level_number);
          const above = levels.find(l => l.level_number === level.level_number - 1);
          const reportsToOptions = above ? rowsForLevel(above.level_number) : [];
          return (
            <div key={level.id} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold"
                    style={{ background: levelColor(level.level_number).bg, color: levelColor(level.level_number).text }}>
                    {level.level_number}
                  </span>
                  <span className="font-bold text-slate-800">{level.level_name}</span>
                  <Badge tone="slate">{rows.length} assigned</Badge>
                </div>
                <Button variant="outline" onClick={() => openAssign(level, null)} className="rounded-xl text-xs py-1 px-3">+ Assign</Button>
              </div>

              {openLevelId === level.id && (
                <div className="mb-3 p-3 bg-slate-50 rounded-xl grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Employee</p>
                    <EmpSearchPicker employees={branchEmployees} value={assignEmp} onChange={setAssignEmp} />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Reports To {above ? `(${above.level_name} in ${branch})` : "(top of hierarchy)"}</p>
                    {above
                      ? <EmpSearchPicker employees={reportsToOptions.map(r => ({ id: r.employee_id, employee_code: r.employee_code, full_name: r.employee_name, department: r.department }))} value={reportsTo} onChange={setReportsTo} placeholder="Search or leave blank..." />
                      : <div className="px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-400 bg-white">No one — top of hierarchy</div>}
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Dotted Line To (optional)</p>
                    <EmpSearchPicker employees={employees.filter(e => e.id !== assignEmp?.id)} value={dottedTo} onChange={setDottedTo} placeholder="Search or leave blank..." />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Dotted Line Reason</p>
                    <input value={dottedReason} onChange={e => setDottedReason(e.target.value)} disabled={!dottedTo}
                      placeholder="e.g. Financial oversight" className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm disabled:bg-slate-100" />
                  </div>
                  <div className="md:col-span-2 flex gap-2">
                    <Button onClick={() => saveAssignment(level)} className="rounded-xl text-xs py-1.5 px-3">Save</Button>
                    <Button variant="outline" onClick={closeAssign} className="rounded-xl text-xs py-1.5 px-3">Cancel</Button>
                  </div>
                </div>
              )}

              {rows.length === 0
                ? <p className="text-xs text-slate-400">No employees assigned to this level in {branch}{deptFilter ? ` / ${deptFilter}` : ""}.</p>
                : <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                    {rows.map(row => (
                      <div key={row.id} className="border border-slate-100 rounded-xl p-3 text-sm">
                        <div className="font-semibold text-slate-800">{row.employee_name}</div>
                        <div className="text-xs text-slate-400">{row.employee_code} · {row.department || "—"}</div>
                        <div className="text-xs text-slate-500 mt-1">Reports to: {row.reports_to_name || "—"}</div>
                        {row.dotted_line_to_name && (
                          <div className="text-xs text-slate-400 mt-0.5">⤳ Dotted to: {row.dotted_line_to_name}{row.dotted_line_reason ? ` (${row.dotted_line_reason})` : ""}</div>
                        )}
                        <div className="flex gap-2 mt-2">
                          <Button variant="outline" onClick={() => openAssign(level, row)} className="rounded-lg text-[11px] py-1 px-2">Edit</Button>
                          <Button variant="outline" onClick={() => removeAssignment(row)} className="rounded-lg text-[11px] py-1 px-2 text-red-600">Remove</Button>
                        </div>
                      </div>
                    ))}
                  </div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════ TAB 3: ORG CHART VIEW ═══════════════════════════
export function OrgChartNode({ row, all, empMap, depth, onSelect }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const reports = useMemo(() => all.filter(r => r.reports_to_employee_id === row.employee_id), [all, row.employee_id]);
  const color = levelColor(row.level_number);
  const emp = empMap[row.employee_id];

  return (
    <div className="flex flex-col items-center">
      <div className="rounded-xl px-3 py-2.5 text-center cursor-pointer select-none min-w-[140px] max-w-[190px] shadow-sm"
        style={{ background: color.bg, color: color.text }}
        onClick={() => onSelect(row)}>
        <div className="font-bold text-xs leading-snug truncate">{row.employee_name}</div>
        <div className="text-[10px] mt-0.5 opacity-80 truncate">{emp?.designation || row.level_name}</div>
        <div className="text-[10px] opacity-70 truncate">{[row.department, row.branch].filter(Boolean).join(" · ")}</div>
        {row.dotted_line_to_name && <div className="text-[10px] opacity-70 truncate" title={row.dotted_line_reason || ""}>⤳ {row.dotted_line_to_name}</div>}
        {reports.length > 0 && (
          <button onClick={e => { e.stopPropagation(); setExpanded(x => !x); }} className="text-[10px] mt-1 font-semibold opacity-80">
            {reports.length} report{reports.length > 1 ? "s" : ""} {expanded ? "▲" : "▼"}
          </button>
        )}
      </div>
      {expanded && reports.length > 0 && (
        <div className="flex gap-6 items-start pt-4 mt-1">
          {reports.map(r => (
            <div key={r.id} className="flex flex-col items-center">
              <div className="w-px h-4 bg-slate-300" />
              <OrgChartNode row={r} all={all} empMap={empMap} depth={depth + 1} onSelect={onSelect} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OrgChartTab({ hierarchy, employees }) {
  const branches = useMemo(() => ["All", ...new Set(hierarchy.map(h => h.branch).filter(Boolean))], [hierarchy]);
  const departments = useMemo(() => ["All", ...new Set(hierarchy.map(h => h.department).filter(Boolean))], [hierarchy]);
  const empMap = useMemo(() => Object.fromEntries(employees.map(e => [e.id, e])), [employees]);
  const designations = useMemo(() => {
    const set = new Set();
    hierarchy.forEach(h => { const d = empMap[h.employee_id]?.designation; if (d) set.add(d); });
    return ["All", ...set];
  }, [hierarchy, empMap]);

  const [branch, setBranch] = useState("All");
  const [department, setDepartment] = useState("All");
  const [designation, setDesignation] = useState("All");
  const [selected, setSelected] = useState(null);

  const active = useMemo(() => hierarchy.filter(h =>
    h.is_active
    && (branch === "All" || h.branch === branch)
    && (department === "All" || h.department === department)
    && (designation === "All" || empMap[h.employee_id]?.designation === designation)
  ), [hierarchy, branch, department, designation, empMap]);
  const activeIds = useMemo(() => new Set(active.map(h => h.employee_id)), [active]);
  const roots = useMemo(() => active.filter(h => !h.reports_to_employee_id || !activeIds.has(h.reports_to_employee_id)), [active, activeIds]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4 mb-5 print:hidden">
        <select value={branch} onChange={e => setBranch(e.target.value)} className="px-3 py-1.5 rounded-xl border border-slate-200 text-sm">
          {branches.map(b => <option key={b}>{b}</option>)}
        </select>
        <select value={department} onChange={e => setDepartment(e.target.value)} className="px-3 py-1.5 rounded-xl border border-slate-200 text-sm">
          {departments.map(d => <option key={d}>{d}</option>)}
        </select>
        <select value={designation} onChange={e => setDesignation(e.target.value)} className="px-3 py-1.5 rounded-xl border border-slate-200 text-sm">
          {designations.map(d => <option key={d}>{d}</option>)}
        </select>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(LEVEL_COLORS).map(([n, c]) => (
            <span key={n} className="px-2 py-0.5 rounded-lg text-[10px] font-medium" style={{ background: c.bg, color: c.text }}>{n}. {c.name}</span>
          ))}
        </div>
        <Button onClick={() => window.print()} variant="outline" className="rounded-xl text-xs ml-auto">Export as PDF</Button>
      </div>

      {roots.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm">No hierarchy matches these filters yet. Use the Assign Employees tab.</div>
      ) : (
        <div className="overflow-x-auto pb-8 print:overflow-visible">
          <div className="flex gap-12 items-start min-w-max px-4 pt-4">
            {roots.map(r => <OrgChartNode key={r.id} row={r} all={active} empMap={empMap} depth={0} onSelect={setSelected} />)}
          </div>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4 print:hidden" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-slate-800 mb-1">{selected.employee_name}</h3>
            <p className="text-xs text-slate-400 mb-3">{selected.employee_code}</p>
            <div className="space-y-1.5 text-sm">
              <div><span className="text-slate-400">Designation:</span> {empMap[selected.employee_id]?.designation || "—"}</div>
              <div><span className="text-slate-400">Department:</span> {selected.department || "—"}</div>
              <div><span className="text-slate-400">Branch:</span> {selected.branch || "—"}</div>
              <div><span className="text-slate-400">Level:</span> {selected.level_number}. {selected.level_name}</div>
              <div><span className="text-slate-400">Reports To:</span> {selected.reports_to_name || "— Top of hierarchy —"}</div>
              {selected.dotted_line_to_name && (
                <div><span className="text-slate-400">Dotted Line To:</span> {selected.dotted_line_to_name}{selected.dotted_line_reason ? ` — ${selected.dotted_line_reason}` : ""}</div>
              )}
            </div>
            <Button variant="outline" onClick={() => setSelected(null)} className="rounded-xl text-xs mt-4">Close</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════ ROOT ═══════════════════════════
export default function HierarchyBuilder({ embedded = false }) {
  const [tab, setTab] = useState("levels");
  const [levels, setLevels] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [hierarchy, setHierarchy] = useState([]);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const [{ data: lv }, { data: emps }, { data: eh }] = await Promise.all([
      supabase.from("hierarchy_levels").select("*").order("level_number"),
      supabase.from("employees").select("id, employee_code, full_name, department, branch, designation, status").eq("status", "Active").order("full_name"),
      supabase.from("employee_hierarchy").select("*").order("created_at", { ascending: false }),
    ]);
    setLevels(lv || []);
    setEmployees(emps || []);
    setHierarchy(eh || []);
  }

  return (
    <div>
      {!embedded && <PageTitle title="Org Hierarchy" subtitle="Define reporting levels, assign employees, and visualize the organisation chart." />}
      {msg && <div className="mb-3 p-3 rounded-xl bg-blue-50 text-blue-700 text-sm print:hidden">{msg}</div>}
      {err && <div className="mb-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm print:hidden">{err}</div>}

      <div className="flex flex-wrap gap-2 mb-5 print:hidden">
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${tab === k ? "bg-slate-950 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            {l}
          </button>
        ))}
      </div>

      {tab === "levels"   && <LevelsTab levels={levels} reload={loadAll} setMsg={setMsg} setErr={setErr} />}
      {tab === "assign"   && <AssignTab levels={levels} employees={employees} hierarchy={hierarchy} reload={loadAll} setMsg={setMsg} setErr={setErr} />}
      {tab === "orgchart" && <OrgChartTab hierarchy={hierarchy} employees={employees} />}
    </div>
  );
}
