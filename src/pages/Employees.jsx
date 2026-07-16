import React, { useState, useEffect, useMemo } from "react";
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

function HierarchyReadout({ employeeCode }) {
  const [row, setRow] = useState(undefined); // undefined = loading, null = none found

  useEffect(() => {
    if (!employeeCode) { setRow(null); return; }
    let active = true;
    supabase.from("employee_hierarchy")
      .select("level_number, level_name, reports_to_name, dotted_line_to_name, dotted_line_reason")
      .eq("employee_code", employeeCode).eq("is_active", true)
      .order("created_at", { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => { if (active) setRow(data || null); });
    return () => { active = false; };
  }, [employeeCode]);

  return (
    <div className="md:col-span-2 p-3 bg-slate-50 rounded-xl grid grid-cols-1 md:grid-cols-2 gap-3">
      <Field label="Hierarchy Position">
        <div className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm text-slate-700">
          {row === undefined ? "Loading…" : row ? `Level ${row.level_number} — ${row.level_name}` : "Not yet assigned"}
        </div>
      </Field>
      <Field label="Reports To">
        <div className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm text-slate-700">
          {row === undefined ? "Loading…" : row?.reports_to_name || "—"}
        </div>
      </Field>
      {row?.dotted_line_to_name && (
        <Field label="Dotted Line To">
          <div className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm text-slate-700">
            {row.dotted_line_to_name}{row.dotted_line_reason ? ` — ${row.dotted_line_reason}` : ""}
          </div>
        </Field>
      )}
      <p className="md:col-span-2 text-xs text-slate-400">Manage hierarchy from Settings → Departments → Org Hierarchy.</p>
    </div>
  );
}

export function EmployeeAdd({ employee, setEmployee, save, close, role, nextId }) {
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

      {/* Auto-generated ID display */}
      <div className="mb-4 p-3 bg-slate-50 rounded-xl flex items-center gap-3">
        <div>
          <p className="text-xs text-slate-500">Employee ID (Auto-Generated)</p>
          <p className="font-bold text-slate-800 text-lg font-mono">{nextId || "Loading..."}</p>
        </div>
        <span className="text-xs text-slate-400 ml-2">ID is assigned automatically and cannot be changed.</span>
      </div>

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
        <div className="md:col-span-2 p-3 bg-slate-50 rounded-xl text-sm text-slate-500">
          Hierarchy position (level and reporting line) is assigned after this employee is created, from Settings → Departments → Org Hierarchy.
        </div>
        <Field label="Employee Status">
          <label className="flex items-center gap-2 text-sm cursor-pointer mt-2">
            <input type="checkbox" checked={!!employee.isTemporary} onChange={e => setEmployee(v => ({ ...v, isTemporary: e.target.checked }))} className="rounded" />
            <span className="text-red-700 font-medium">Temporary Employee</span>
          </label>
          {employee.isTemporary && (
            <p className="text-xs text-red-600 mt-1.5 bg-red-50 px-3 py-1.5 rounded-xl">
              A TEMP-xxx ID will be auto-assigned. HR will be notified after 7 days to enroll permanently or reject.
            </p>
          )}
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

      {role !== "HR" && (
        <Section title="Banking Details">
          <Field label="Bank Name">{inp("bankName", "Bank Name")}</Field>
          <Field label="Account Number">{inp("accountNumber", "Account Number")}</Field>
          <Field label="IBAN">{inp("iban", "PK00XXXX0000000000000000")}</Field>
        </Section>
      )}
      {role === "HR" && (
        <div className="mb-5 p-3 bg-amber-50 text-amber-700 text-xs rounded-xl">
          Banking details are restricted to Finance and Master roles.
        </div>
      )}

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

export function EmployeeEdit({ employee, setEmployee, save, close, role }) {
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
        <HierarchyReadout employeeCode={employee.id} />
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

      {role !== "HR" && (
        <Section title="Banking Details">
          <Field label="Bank Name">{inp("bankName", "Bank")}</Field>
          <Field label="Account Number">{inp("accountNumber", "Account No.")}</Field>
          <Field label="IBAN">{inp("iban", "IBAN")}</Field>
        </Section>
      )}
      {role === "HR" && (
        <div className="mb-5 p-3 bg-amber-50 text-amber-700 text-xs rounded-xl">
          Banking details are restricted to Finance and Master roles.
        </div>
      )}

      <div className="mt-4 flex gap-2"><Button onClick={save}>Save Changes</Button><Button variant="outline" onClick={close}>Cancel</Button></div>
    </div>
  );
}

export default function Employees({ query, setQuery, branch, setBranch, branchLocked, showEmployeeForm, setShowEmployeeForm, newEmployee, setNewEmployee, saveEmployee, editingEmployee, setEditingEmployee, updateEmployee, loadingEmployees, filteredEmployees, updateEmployeeStatus, employees, role }) {
  const supervisorMap = useMemo(() =>
    Object.fromEntries((employees || []).map(e => [e.id, e.name])),
    [employees]
  );
  const viewOnly = role === "Branch Manager";

  return (
    <div>
      <PageTitle title="Employee Master" subtitle="Add, edit and manage staff records."
        action={!viewOnly && <Button className="rounded-2xl" onClick={() => setShowEmployeeForm(true)}>+ New Employee</Button>} />
      <div className="flex flex-col md:flex-row gap-3 mb-4">
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by name, ID, department, phone..." className="flex-1 px-4 py-2.5 rounded-2xl border border-slate-200" />
        <select value={branch} onChange={e => setBranch(e.target.value)} disabled={branchLocked} className="px-4 py-2.5 rounded-2xl border border-slate-200 disabled:bg-slate-50 disabled:text-slate-500">
          <option>All</option>
          {Object.keys(BRANCH_CODE_MAP).map(b => <option key={b}>{b}</option>)}
        </select>
      </div>

      {!viewOnly && showEmployeeForm && <EmployeeAdd employee={newEmployee} setEmployee={setNewEmployee} save={saveEmployee} close={() => setShowEmployeeForm(false)} role={role} nextId={newEmployee._nextId} />}
      {!viewOnly && editingEmployee && <EmployeeEdit employee={editingEmployee} setEmployee={setEditingEmployee} save={updateEmployee} close={() => setEditingEmployee(null)} role={role} />}
      {loadingEmployees && <p className="text-slate-400 text-sm mb-2">Loading employees...</p>}

      <Table
        headers={viewOnly
          ? ["ID", "Name", "Level", "Supervisor", "Branch", "Department", "CNIC Expiry", "Status"]
          : ["ID", "Name", "Level", "Supervisor", "Branch", "Department", "Salary", "CNIC Expiry", "Status", "Action"]}
        rows={filteredEmployees}
        renderRow={e => {
          const cnicStatus = cnicExpiryStatus(e.cnicExpiryDate);
          return (
            <tr key={e.id}>
              <td className="px-4 py-3 font-medium font-mono">{e.id}</td>
              <td className="px-4 py-3">
                {e.name}
                {e.isSupervisor && <span className="text-[10px] bg-green-100 text-green-700 px-1.5 rounded ml-1">SUP</span>}
                {e.isManager && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 rounded ml-1">MGR</span>}
                {e.isAttendanceExempt && <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 rounded ml-1">EXEMPTED</span>}
                {e.isTemporary && <span className="text-[10px] bg-red-100 text-red-700 px-1.5 rounded ml-1 font-semibold">TEMP</span>}
                {e.employmentStatus === "Probation" && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 rounded ml-1 font-semibold">PROBATION</span>}
                {e.isFieldEmployee && <span className="text-[10px] bg-sky-100 text-sky-700 px-1.5 rounded ml-1">FIELD</span>}
              </td>
              <td className="px-4 py-3">{e.level}</td>
              <td className="px-4 py-3 text-slate-500 text-xs">{supervisorMap[e.supervisorId] || e.supervisorId || "—"}</td>
              <td className="px-4 py-3">{e.branch}</td>
              <td className="px-4 py-3">{e.dept}</td>
              {!viewOnly && <td className="px-4 py-3">{money(e.salary)}</td>}
              <td className="px-4 py-3">
                {e.cnicExpiryDate
                  ? <span className={`text-xs px-2 py-1 rounded-xl font-medium ${cnicStatus === "expired" ? "bg-red-100 text-red-700" : cnicStatus === "soon" ? "bg-orange-100 text-orange-700" : "text-slate-500"}`}>
                      {e.cnicExpiryDate}{cnicStatus === "expired" ? " ⚠ Expired" : cnicStatus === "soon" ? " ⚠ Expiring" : ""}
                    </span>
                  : <span className="text-slate-300">—</span>}
              </td>
              <td className="px-4 py-3"><Badge tone={e.status === "Active" ? "green" : "yellow"}>{e.status}</Badge></td>
              {!viewOnly && (
                <td className="px-4 py-3 flex gap-2">
                  <Button variant="outline" onClick={() => setEditingEmployee(e)}>Edit</Button>
                  {e.status === "Active" && <Button variant="outline" onClick={() => updateEmployeeStatus(e.id, "Inactive")}>Inactive</Button>}
                </td>
              )}
            </tr>
          );
        }}
      />
    </div>
  );
}
