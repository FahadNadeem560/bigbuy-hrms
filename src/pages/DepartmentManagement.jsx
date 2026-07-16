import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { Button, Badge, PageTitle } from "../components/ui.jsx";
import HierarchyBuilder from "./HierarchyBuilder.jsx";

const DEPT_BLANK = { name: "", description: "" };
const DES_BLANK = { name: "", department_id: "", description: "" };

export default function DepartmentManagement({ role }) {
  const [tab, setTab] = useState("departments");
  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [orgHierarchy, setOrgHierarchy] = useState([]);
  const [deptForm, setDeptForm] = useState(DEPT_BLANK);
  const [desForm, setDesForm] = useState(DES_BLANK);
  const [editDept, setEditDept] = useState(null);
  const [editDes, setEditDes] = useState(null);
  const [showDeptForm, setShowDeptForm] = useState(false);
  const [showDesForm, setShowDesForm] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const [{ data: depts }, { data: dess }, { data: emps }, { data: eh }] = await Promise.all([
      supabase.from("departments").select("*").order("name"),
      supabase.from("designations").select("*").order("name"),
      supabase.from("employees").select("id, employee_code, full_name, department, designation, status").eq("status", "Active"),
      supabase.from("employee_hierarchy").select("*").eq("is_active", true),
    ]);
    setDepartments(depts || []);
    setDesignations(dess || []);
    setEmployees(emps || []);
    setOrgHierarchy(eh || []);
  }

  // First active "Department Manager" hierarchy entry per department name.
  const deptHeadMap = useMemo(() => Object.fromEntries(
    departments.map(d => [d.name, orgHierarchy.find(h => h.department === d.name && h.level_name === "Department Manager") || null])
  ), [departments, orgHierarchy]);

  async function saveDept() {
    const f = editDept || deptForm;
    if (!f.name) return setErr("Department name is required.");
    setErr("");
    if (editDept) {
      const { error } = await supabase.from("departments").update({ name: f.name, description: f.description }).eq("id", f.id);
      if (error) return setErr(error.message);
    } else {
      const { error } = await supabase.from("departments").insert({ name: f.name, description: f.description, is_active: true });
      if (error) return setErr(error.message);
    }
    setMsg("Department saved."); setDeptForm(DEPT_BLANK); setEditDept(null); setShowDeptForm(false); loadAll();
  }

  async function saveDes() {
    const f = editDes || desForm;
    if (!f.name) return setErr("Designation name is required.");
    setErr("");
    if (editDes) {
      const { error } = await supabase.from("designations").update({ name: f.name, department_id: f.department_id || null, description: f.description }).eq("id", f.id);
      if (error) return setErr(error.message);
    } else {
      const { error } = await supabase.from("designations").insert({ name: f.name, department_id: f.department_id || null, description: f.description, is_active: true });
      if (error) return setErr(error.message);
    }
    setMsg("Designation saved."); setDesForm(DES_BLANK); setEditDes(null); setShowDesForm(false); loadAll();
  }

  async function toggleDept(id, cur) { await supabase.from("departments").update({ is_active: !cur }).eq("id", id); loadAll(); }
  async function toggleDes(id, cur) { await supabase.from("designations").update({ is_active: !cur }).eq("id", id); loadAll(); }

  const deptField = (field, form, setForm, editVal, setEdit) =>
    <input value={editVal !== null ? (editVal?.[field] || "") : (form[field] || "")}
      onChange={e => editVal !== null ? setEdit(v => ({ ...v, [field]: e.target.value })) : setForm(v => ({ ...v, [field]: e.target.value }))}
      className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />;

  return (
    <div>
      <PageTitle title="Departments & Designations" subtitle="Manage organizational structure, departments and job roles." />
      {msg && <div className="mb-3 p-3 rounded-xl bg-blue-50 text-blue-700 text-sm">{msg}</div>}
      {err && <div className="mb-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{err}</div>}

      <div className="flex flex-wrap gap-2 mb-4">
        {[["departments", "Departments"], ["designations", "Designations"], ["orghierarchy", "Org Hierarchy"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${tab === k ? "bg-slate-950 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{l}</button>
        ))}
      </div>

      {tab === "departments" && (
        <div>
          <div className="flex justify-end mb-3">
            <Button onClick={() => { setShowDeptForm(s => !s); setEditDept(null); setDeptForm(DEPT_BLANK); }} className="rounded-2xl">
              {showDeptForm ? "Cancel" : "+ New Department"}
            </Button>
          </div>
          {showDeptForm && (
            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm mb-4">
              <h3 className="font-bold mb-3">{editDept ? "Edit Department" : "New Department"}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><p className="text-xs text-slate-500 mb-1">Name *</p>{deptField("name", deptForm, setDeptForm, editDept, setEditDept)}</div>
                <div><p className="text-xs text-slate-500 mb-1">Description</p>{deptField("description", deptForm, setDeptForm, editDept, setEditDept)}</div>
              </div>
              <div className="mt-3 flex gap-2">
                <Button onClick={saveDept} className="rounded-2xl">Save</Button>
                <Button variant="outline" onClick={() => { setShowDeptForm(false); setEditDept(null); }} className="rounded-2xl">Cancel</Button>
              </div>
            </div>
          )}
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>{["Department", "Description", "Department Head", "Employees", "Status", "Action"].map(h => <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {departments.length === 0
                  ? <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No departments. Add one above.</td></tr>
                  : departments.map(d => {
                    const head = deptHeadMap[d.name];
                    return (
                    <tr key={d.id}>
                      <td className="px-4 py-3 font-semibold">{d.name}</td>
                      <td className="px-4 py-3 text-slate-500">{d.description || "—"}</td>
                      <td className="px-4 py-3">
                        {head ? <span className="text-slate-700">{head.employee_name}</span> : <span className="text-slate-300">— Not Assigned —</span>}
                      </td>
                      <td className="px-4 py-3">{employees.filter(e => e.department === d.name).length}</td>
                      <td className="px-4 py-3"><Badge tone={d.is_active ? "green" : "slate"}>{d.is_active ? "Active" : "Inactive"}</Badge></td>
                      <td className="px-4 py-3 flex gap-2">
                        <Button variant="outline" onClick={() => { setEditDept(d); setShowDeptForm(true); }} className="rounded-xl text-xs py-1 px-2">Edit</Button>
                        <Button variant="outline" onClick={() => toggleDept(d.id, d.is_active)} className="rounded-xl text-xs py-1 px-2">{d.is_active ? "Deactivate" : "Activate"}</Button>
                      </td>
                    </tr>
                  );})}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "designations" && (
        <div>
          <div className="flex justify-end mb-3">
            <Button onClick={() => { setShowDesForm(s => !s); setEditDes(null); setDesForm(DES_BLANK); }} className="rounded-2xl">
              {showDesForm ? "Cancel" : "+ New Designation"}
            </Button>
          </div>
          {showDesForm && (
            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm mb-4">
              <h3 className="font-bold mb-3">{editDes ? "Edit Designation" : "New Designation"}</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-slate-500 mb-1">Name *</p>
                  <input value={editDes ? editDes.name : desForm.name}
                    onChange={e => editDes ? setEditDes(v => ({ ...v, name: e.target.value })) : setDesForm(v => ({ ...v, name: e.target.value }))}
                    className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Department</p>
                  <select value={editDes ? (editDes.department_id || "") : desForm.department_id}
                    onChange={e => editDes ? setEditDes(v => ({ ...v, department_id: e.target.value })) : setDesForm(v => ({ ...v, department_id: e.target.value }))}
                    className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm">
                    <option value="">— No Department —</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Description</p>
                  <input value={editDes ? editDes.description : desForm.description}
                    onChange={e => editDes ? setEditDes(v => ({ ...v, description: e.target.value })) : setDesForm(v => ({ ...v, description: e.target.value }))}
                    className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <Button onClick={saveDes} className="rounded-2xl">Save</Button>
                <Button variant="outline" onClick={() => { setShowDesForm(false); setEditDes(null); }} className="rounded-2xl">Cancel</Button>
              </div>
            </div>
          )}
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>{["Designation", "Department", "Description", "Employees", "Status", "Action"].map(h => <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {designations.length === 0
                  ? <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No designations. Add one above.</td></tr>
                  : designations.map(d => {
                      const dept = departments.find(dp => String(dp.id) === String(d.department_id));
                      return (
                        <tr key={d.id}>
                          <td className="px-4 py-3 font-semibold">{d.name}</td>
                          <td className="px-4 py-3">{dept?.name || "—"}</td>
                          <td className="px-4 py-3 text-slate-500">{d.description || "—"}</td>
                          <td className="px-4 py-3">{employees.filter(e => e.designation === d.name).length}</td>
                          <td className="px-4 py-3"><Badge tone={d.is_active ? "green" : "slate"}>{d.is_active ? "Active" : "Inactive"}</Badge></td>
                          <td className="px-4 py-3 flex gap-2">
                            <Button variant="outline" onClick={() => { setEditDes(d); setShowDesForm(true); }} className="rounded-xl text-xs py-1 px-2">Edit</Button>
                            <Button variant="outline" onClick={() => toggleDes(d.id, d.is_active)} className="rounded-xl text-xs py-1 px-2">{d.is_active ? "Deactivate" : "Activate"}</Button>
                          </td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "orghierarchy" && <HierarchyBuilder embedded role={role} />}
    </div>
  );
}
