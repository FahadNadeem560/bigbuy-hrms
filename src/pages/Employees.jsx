import React, { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { Badge, Button, PageTitle, Table } from "../components/ui";
import { BRANCH_CODE_MAP } from "../constants/branches";
import { STAFF_LEVEL_POLICIES } from "../config/staffPolicies";
import { money } from "../utils/format";

function cnicExpiryStatus(expiryDate) {
  if (!expiryDate) return null;
  const today = new Date();
  const expiry = new Date(expiryDate);
  const diffDays = Math.floor((expiry - today) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "expired";
  if (diffDays <= 30) return "soon";
  return "ok";
}

async function uploadFile(file, folder) {
  const ext = file.name.split(".").pop();
  const path = `${folder}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("employee-docs").upload(path, file);
  if (error) throw error;
  const { data } = supabase.storage.from("employee-docs").getPublicUrl(path);
  return data.publicUrl;
}

function Section({ title, children }) {
  return (
    <div className="mb-5">
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 border-b border-slate-100 pb-1">{title}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">{children}</div>
    </div>
  );
}

function Field({ label, children }) {
  return <div><p className="text-xs text-slate-500 mb-1">{label}</p>{children}</div>;
}

function SupervisorPicker({ value, onChange }) {
  const [supervisors, setSupervisors] = useState([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    supabase.from("employees")
      .select("employee_code,full_name,designation,department")
      .or("is_supervisor.eq.true,is_manager.eq.true")
      .eq("status", "Active").order("full_name")
      .then(({ data }) => setSupervisors(data || []));
  }, []);

  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const hits = useMemo(() => {
    if (!q.trim()) return supervisors.slice(0, 10);
    const lq = q.toLowerCase();
    return supervisors.filter(e => e.full_name?.toLowerCase().includes(lq) || e.employee_code?.toLowerCase().includes(lq)).slice(0, 10);
  }, [supervisors, q]);

  const selected = supervisors.find(s => s.employee_code === value);

  return (
    <div className="relative" ref={ref}>
      <input
        value={selected ? `${selected.employee_code} — ${selected.full_name}` : q}
        onChange={e => { if (value) onChange(""); setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Search supervisor…"
        className="px-4 py-2 border rounded-xl w-full text-sm" />
      {open && (
        <div className="absolute z-20 top-full left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-lg mt-1 max-h-48 overflow-y-auto">
          <button onMouseDown={e => e.preventDefault()} onClick={() => { onChange(""); setQ(""); setOpen(false); }}
            className="w-full text-left px-4 py-2 hover:bg-slate-50 text-sm text-slate-400">— None —</button>
          {hits.map(e => (
            <button key={e.employee_code} onMouseDown={ev => ev.preventDefault()}
              onClick={() => { onChange(e.employee_code); setQ(""); setOpen(false); }}
              className="w-full text-left px-4 py-2 hover:bg-slate-50 text-sm">
              <span className="font-semibold">{e.employee_code}</span> — {e.full_name}
              <span className="text-xs text-slate-400 ml-2">{e.designation || e.department}</span>
            </button>
          ))}
          {hits.length === 0 && <div className="px-4 py-2 text-sm text-slate-400">No supervisors / managers found</div>}
        </div>
      )}
    </div>
  );
}

export function EmployeeAdd({ employee, setEmployee, save, close }) {
  const [uploading, setUploading] = useState(false);

  async function handleUpload(field, file) {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadFile(file, field);
      setEmployee(e => ({ ...e, [field]: url }));
    } catch { /* storage bucket may not exist yet */ }
    finally { setUploading(false); }
  }

  const inp = (field, placeholder, type = "text") => (
    <input type={type} placeholder={placeholder} value={employee[field] || ""}
      onChange={e => setEmployee(v => ({ ...v, [field]: e.target.value }))}
      className="px-4 py-2 border rounded-xl w-full text-sm" />
  );

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 mb-4 p-5">
      <div className="flex justify-between mb-4"><h2 className="text-lg font-bold">Add New Employee</h2><Button variant="outline" onClick={close}>Close</Button></div>

      <Section title="Basic Information">
        <Field label="Full Name *">{inp("fullName", "Full Name")}</Field>
        <Field label="Designation">{inp("designation", "Designation")}</Field>
        <Field label="Department">{inp("department", "Department")}</Field>
        <Field label="Branch">
          <select value={employee.branch} onChange={e => setEmployee(v => ({ ...v, branch: e.target.value }))} className="px-4 py-2 border rounded-xl w-full text-sm">
            {Object.keys(BRANCH_CODE_MAP).map(x => <option key={x}>{x}</option>)}
          </select>
        </Field>
        <Field label="Staff Level">
          <select value={employee.level} onChange={e => setEmployee(v => ({ ...v, level: e.target.value }))} className="px-4 py-2 border rounded-xl w-full text-sm">
            {Object.keys(STAFF_LEVEL_POLICIES).map(x => <option key={x}>{x}</option>)}
          </select>
        </Field>
        <Field label="Employee Type">
          <select value={employee.employeeType || "Permanent"} onChange={e => setEmployee(v => ({ ...v, employeeType: e.target.value }))} className="px-4 py-2 border rounded-xl w-full text-sm">
            {["Permanent", "Contract", "Probation", "Internship"].map(x => <option key={x}>{x}</option>)}
          </select>
        </Field>
        <Field label="Salary">{inp("salary", "Monthly Salary", "number")}</Field>
        <Field label="Joining Date">{inp("joiningDate", "", "date")}</Field>
      </Section>

      <Section title="Hierarchy & Role">
        <Field label="Direct Supervisor">
          <SupervisorPicker value={employee.supervisorId || ""} onChange={code => setEmployee(v => ({ ...v, supervisorId: code }))} />
        </Field>
        <Field label="Role Flags">
          <div className="flex gap-4 mt-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={!!employee.isSupervisor} onChange={e => setEmployee(v => ({ ...v, isSupervisor: e.target.checked }))} className="rounded" />
              <span>Is Supervisor</span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={!!employee.isManager} onChange={e => setEmployee(v => ({ ...v, isManager: e.target.checked }))} className="rounded" />
              <span>Is Manager</span>
            </label>
          </div>
        </Field>
      </Section>

      <Section title="Identity & CNIC">
        <Field label="CNIC">{inp("cnic", "00000-0000000-0")}</Field>
        <Field label="Father CNIC">{inp("fathersCnic", "00000-0000000-0")}</Field>
        <Field label="CNIC Issue Date">{inp("cnicIssueDate", "", "date")}</Field>
        <Field label="CNIC Expiry Date">{inp("cnicExpiryDate", "", "date")}</Field>
      </Section>

      <Section title="Contact Details">
        <Field label="Personal Phone">{inp("personalPhone", "Personal Phone")}</Field>
        <Field label="Work Phone">{inp("workPhone", "Work Phone")}</Field>
        <Field label="WhatsApp">{inp("phone", "WhatsApp Number")}</Field>
        <Field label="Email">{inp("email", "Email Address", "email")}</Field>
      </Section>

      <Section title="Addresses">
        <Field label="Permanent Address"><input placeholder="Permanent Address" value={employee.permanentAddress || ""} onChange={e => setEmployee(v => ({ ...v, permanentAddress: e.target.value }))} className="px-4 py-2 border rounded-xl w-full text-sm" /></Field>
        <Field label="Current Address"><input placeholder="Current Address" value={employee.currentAddress || ""} onChange={e => setEmployee(v => ({ ...v, currentAddress: e.target.value }))} className="px-4 py-2 border rounded-xl w-full text-sm" /></Field>
        <Field label="Billing (House/Flat)"><input placeholder="Billing Address" value={employee.billingAddress || ""} onChange={e => setEmployee(v => ({ ...v, billingAddress: e.target.value }))} className="px-4 py-2 border rounded-xl w-full text-sm" /></Field>
      </Section>

      <Section title="Emergency & Reference">
        <Field label="Emergency Contact Name">{inp("emergencyContactName", "Name")}</Field>
        <Field label="Emergency Contact Number">{inp("emergencyContactNumber", "Phone")}</Field>
        <Field label="Relationship">{inp("emergencyContactRelationship", "Relationship")}</Field>
        <Field label="Reference Person Name">{inp("referencePersonName", "Reference Name")}</Field>
        <Field label="Reference Contact">{inp("referencePersonContact", "Reference Phone")}</Field>
      </Section>

      <Section title="Banking Details">
        <Field label="Bank Name">{inp("bankName", "Bank Name")}</Field>
        <Field label="Account Number">{inp("accountNumber", "Account Number")}</Field>
        <Field label="IBAN">{inp("iban", "PK00XXXX0000000000000000")}</Field>
      </Section>

      <Section title="Documents & Photo">
        <Field label="Photo URL">
          <div className="flex gap-2">
            <input value={employee.photoUrl || ""} onChange={e => setEmployee(v => ({ ...v, photoUrl: e.target.value }))} placeholder="URL or upload below" className="px-3 py-2 border rounded-xl flex-1 text-sm" />
            <input type="file" accept="image/*" onChange={e => handleUpload("photoUrl", e.target.files[0])} className="hidden" id="photo-upload" />
            <label htmlFor="photo-upload" className="cursor-pointer px-3 py-2 border rounded-xl text-sm text-slate-600 hover:bg-slate-50">{uploading ? "..." : "Upload"}</label>
          </div>
        </Field>
        <Field label="CNIC Copy URL">
          <div className="flex gap-2">
            <input value={employee.cnicCopyUrl || ""} onChange={e => setEmployee(v => ({ ...v, cnicCopyUrl: e.target.value }))} placeholder="URL or upload" className="px-3 py-2 border rounded-xl flex-1 text-sm" />
            <input type="file" accept=".pdf,image/*" onChange={e => handleUpload("cnicCopyUrl", e.target.files[0])} className="hidden" id="cnic-upload" />
            <label htmlFor="cnic-upload" className="cursor-pointer px-3 py-2 border rounded-xl text-sm text-slate-600 hover:bg-slate-50">Upload</label>
          </div>
        </Field>
        <Field label="Employment Contract URL">
          <div className="flex gap-2">
            <input value={employee.employmentContractUrl || ""} onChange={e => setEmployee(v => ({ ...v, employmentContractUrl: e.target.value }))} placeholder="URL or upload" className="px-3 py-2 border rounded-xl flex-1 text-sm" />
            <input type="file" accept=".pdf" onChange={e => handleUpload("employmentContractUrl", e.target.files[0])} className="hidden" id="contract-upload" />
            <label htmlFor="contract-upload" className="cursor-pointer px-3 py-2 border rounded-xl text-sm text-slate-600 hover:bg-slate-50">Upload</label>
          </div>
        </Field>
      </Section>

      <div className="mt-4"><Button onClick={save}>Save Employee</Button></div>
    </div>
  );
}

export function EmployeeEdit({ employee, setEmployee, save, close }) {
  const inp = (field, placeholder, type = "text") => (
    <input type={type} placeholder={placeholder} value={employee[field] || ""}
      onChange={e => setEmployee(v => ({ ...v, [field]: e.target.value }))}
      className="px-4 py-2 border rounded-xl w-full text-sm" />
  );

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 mb-4 p-5">
      <div className="flex justify-between mb-4"><h2 className="text-lg font-bold">Edit Employee</h2><Button variant="outline" onClick={close}>Close</Button></div>

      <Section title="Basic Information">
        <Field label="Full Name">{inp("name", "Full Name")}</Field>
        <Field label="Department">{inp("dept", "Department")}</Field>
        <Field label="Staff Level">
          <select value={employee.level} onChange={e => setEmployee(v => ({ ...v, level: e.target.value }))} className="px-4 py-2 border rounded-xl w-full text-sm">
            {Object.keys(STAFF_LEVEL_POLICIES).map(x => <option key={x}>{x}</option>)}
          </select>
        </Field>
        <Field label="Salary">{inp("salary", "Salary", "number")}</Field>
        <Field label="Status">
          <select value={employee.status} onChange={e => setEmployee(v => ({ ...v, status: e.target.value }))} className="px-4 py-2 border rounded-xl w-full text-sm">
            <option>Active</option><option>Inactive</option>
          </select>
        </Field>
      </Section>

      <Section title="Hierarchy & Role">
        <Field label="Direct Supervisor">
          <SupervisorPicker value={employee.supervisorId || ""} onChange={code => setEmployee(v => ({ ...v, supervisorId: code }))} />
        </Field>
        <Field label="Role Flags">
          <div className="flex gap-4 mt-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={!!employee.isSupervisor} onChange={e => setEmployee(v => ({ ...v, isSupervisor: e.target.checked }))} className="rounded" />
              <span>Is Supervisor</span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={!!employee.isManager} onChange={e => setEmployee(v => ({ ...v, isManager: e.target.checked }))} className="rounded" />
              <span>Is Manager</span>
            </label>
          </div>
        </Field>
      </Section>

      <Section title="Identity & CNIC">
        <Field label="CNIC">{inp("cnic", "CNIC")}</Field>
        <Field label="CNIC Issue Date">{inp("cnicIssueDate", "", "date")}</Field>
        <Field label="CNIC Expiry Date">{inp("cnicExpiryDate", "", "date")}</Field>
        <Field label="Father CNIC">{inp("fathersCnic", "Father CNIC")}</Field>
      </Section>

      <Section title="Contact Details">
        <Field label="Personal Phone">{inp("personalPhone", "Personal")}</Field>
        <Field label="Work Phone">{inp("workPhone", "Work")}</Field>
        <Field label="Email">{inp("email", "Email", "email")}</Field>
      </Section>

      <Section title="Addresses">
        <Field label="Permanent Address">{inp("permanentAddress", "Permanent")}</Field>
        <Field label="Current Address">{inp("currentAddress", "Current")}</Field>
        <Field label="Billing Address">{inp("billingAddress", "Billing")}</Field>
      </Section>

      <Section title="Emergency & Reference">
        <Field label="Emergency Contact">{inp("emergencyContactName", "Name")}</Field>
        <Field label="Emergency Number">{inp("emergencyContactNumber", "Phone")}</Field>
        <Field label="Relationship">{inp("emergencyContactRelationship", "Relation")}</Field>
        <Field label="Reference Person">{inp("referencePersonName", "Name")}</Field>
        <Field label="Reference Contact">{inp("referencePersonContact", "Phone")}</Field>
      </Section>

      <Section title="Banking Details">
        <Field label="Bank Name">{inp("bankName", "Bank")}</Field>
        <Field label="Account Number">{inp("accountNumber", "Account No.")}</Field>
        <Field label="IBAN">{inp("iban", "IBAN")}</Field>
      </Section>

      <div className="mt-4 flex gap-2"><Button onClick={save}>Save Changes</Button><Button variant="outline" onClick={close}>Cancel</Button></div>
    </div>
  );
}

export default function Employees({ query, setQuery, branch, setBranch, showEmployeeForm, setShowEmployeeForm, newEmployee, setNewEmployee, saveEmployee, editingEmployee, setEditingEmployee, updateEmployee, loadingEmployees, filteredEmployees, updateEmployeeStatus, employees }) {
  const supervisorMap = useMemo(() =>
    Object.fromEntries((employees || []).map(e => [e.id, e.name])),
    [employees]
  );

  return (
    <div>
      <PageTitle title="Employee Master" subtitle="Add, edit and manage staff records."
        action={<Button className="rounded-2xl" onClick={() => setShowEmployeeForm(true)}>+ New Employee</Button>} />
      <div className="flex flex-col md:flex-row gap-3 mb-4">
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by name, ID, department, phone..." className="flex-1 px-4 py-2.5 rounded-2xl border border-slate-200" />
        <select value={branch} onChange={e => setBranch(e.target.value)} className="px-4 py-2.5 rounded-2xl border border-slate-200">
          <option>All</option>
          {Object.keys(BRANCH_CODE_MAP).map(b => <option key={b}>{b}</option>)}
        </select>
      </div>

      {showEmployeeForm && <EmployeeAdd employee={newEmployee} setEmployee={setNewEmployee} save={saveEmployee} close={() => setShowEmployeeForm(false)} />}
      {editingEmployee && <EmployeeEdit employee={editingEmployee} setEmployee={setEditingEmployee} save={updateEmployee} close={() => setEditingEmployee(null)} />}
      {loadingEmployees && <p className="text-slate-400 text-sm mb-2">Loading employees...</p>}

      <Table
        headers={["ID", "Name", "Level", "Supervisor", "Branch", "Department", "Salary", "CNIC Expiry", "Status", "Action"]}
        rows={filteredEmployees}
        renderRow={e => {
          const cnicStatus = cnicExpiryStatus(e.cnicExpiryDate);
          return (
            <tr key={e.id}>
              <td className="px-4 py-3 font-medium">{e.id}</td>
              <td className="px-4 py-3">{e.name} {e.isSupervisor && <span className="text-[10px] bg-green-100 text-green-700 px-1.5 rounded ml-1">SUP</span>}{e.isManager && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 rounded ml-1">MGR</span>}</td>
              <td className="px-4 py-3">{e.level}</td>
              <td className="px-4 py-3 text-slate-500 text-xs">{supervisorMap[e.supervisorId] || e.supervisorId || "—"}</td>
              <td className="px-4 py-3">{e.branch}</td>
              <td className="px-4 py-3">{e.dept}</td>
              <td className="px-4 py-3">{money(e.salary)}</td>
              <td className="px-4 py-3">
                {e.cnicExpiryDate
                  ? <span className={`text-xs px-2 py-1 rounded-xl font-medium ${cnicStatus === "expired" ? "bg-red-100 text-red-700" : cnicStatus === "soon" ? "bg-orange-100 text-orange-700" : "text-slate-500"}`}>
                      {e.cnicExpiryDate}{cnicStatus === "expired" ? " ⚠ Expired" : cnicStatus === "soon" ? " ⚠ Expiring" : ""}
                    </span>
                  : <span className="text-slate-300">—</span>}
              </td>
              <td className="px-4 py-3"><Badge tone={e.status === "Active" ? "green" : "yellow"}>{e.status}</Badge></td>
              <td className="px-4 py-3 flex gap-2">
                <Button variant="outline" onClick={() => setEditingEmployee(e)}>Edit</Button>
                {e.status === "Active" && <Button variant="outline" onClick={() => updateEmployeeStatus(e.id, "Inactive")}>Inactive</Button>}
              </td>
            </tr>
          );
        }}
      />
    </div>
  );
}
