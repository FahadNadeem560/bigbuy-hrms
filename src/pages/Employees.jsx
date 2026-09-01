import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { Badge, Button, PageTitle, Table } from "../components/ui";
import { BRANCH_CODE_MAP } from "../constants/branches";
import { STAFF_LEVEL_POLICIES } from "../config/staffPolicies";
import { money } from "../utils/format";
import { sendOnboardingOtp } from "../services/whatsappService.js";
import { fetchActiveConfidentialIncentives } from "../services/payrollControlService.js";
import { setEmployeePaymentMethod, setEmployeeEobi } from "../services/employeeService.js";

function cnicExpiryStatus(expiryDate) {
  if (!expiryDate) return null;
  const today = new Date();
  const expiry = new Date(expiryDate);
  const diffDays = Math.floor((expiry - today) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "expired";
  if (diffDays <= 30) return "soon";
  return "ok";
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Company policy: Admin/Warehouse staff always get Sunday off; Floor Management
// and Non-Management (sales/support floor staff) can be off any one day
// Mon-Fri, excluding the Sat/Sun weekend; Management staff default to Sunday.
function allowedOffDays(department, level) {
  const dept = String(department || "").toLowerCase();
  if (dept.startsWith("admin") || dept.startsWith("warehouse")) return [0];
  if (level === "Floor Management" || level === "Non-Management") return [1, 2, 3, 4, 5];
  return [0];
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

// Department/Designation are free-text on the employees table, but should
// still draw from the master lists (DepartmentManagement.jsx) so everyone
// picks from what already exists instead of retyping near-duplicates --
// while still allowing a genuinely new one to be typed and saved.
function useDeptDesigOptions() {
  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  useEffect(() => {
    supabase.from("departments").select("name").eq("is_active", true).order("name")
      .then(({ data }) => setDepartments((data || []).map(d => d.name)));
    supabase.from("designations").select("name").eq("is_active", true).order("name")
      .then(({ data }) => setDesignations((data || []).map(d => d.name)));
  }, []);
  async function ensure(table, list, setList, value) {
    const v = String(value || "").trim();
    if (!v || list.some(x => x.toLowerCase() === v.toLowerCase())) return;
    const { error } = await supabase.from(table).insert({ name: v, is_active: true });
    if (!error) setList(l => [...l, v]);
  }
  return {
    departments, designations,
    ensureDepartment: v => ensure("departments", departments, setDepartments, v),
    ensureDesignation: v => ensure("designations", designations, setDesignations, v),
  };
}

function ComboField({ label, value, onChange, options, listId, placeholder }) {
  return (
    <Field label={label}>
      <input list={listId} value={value || ""} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} className="px-4 py-2 border rounded-xl w-full text-sm" />
      <datalist id={listId}>{options.map(o => <option key={o} value={o} />)}</datalist>
    </Field>
  );
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
  const { departments, designations, ensureDepartment, ensureDesignation } = useDeptDesigOptions();

  async function handleUpload(field, file) {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadFile(file, field);
      setEmployee(e => ({ ...e, [field]: url }));
    } catch { /* storage bucket may not exist yet */ }
    finally { setUploading(false); }
  }

  async function handleSave() {
    await Promise.all([ensureDepartment(employee.department), ensureDesignation(employee.designation)]);
    save();
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
        <ComboField label="Designation" value={employee.designation} listId="designation-options" options={designations}
          placeholder="Select or type a new designation" onChange={v => setEmployee(e => ({ ...e, designation: v }))} />
        <ComboField label="Department" value={employee.department} listId="department-options" options={departments}
          placeholder="Select or type a new department" onChange={v => setEmployee(e => ({ ...e, department: v }))} />
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
        <Field label="Weekly Off Day">
          <select value={employee.weeklyOffDay || ""} onChange={e => setEmployee(v => ({ ...v, weeklyOffDay: e.target.value }))} className="px-4 py-2 border rounded-xl w-full text-sm">
            <option value="">Not set</option>
            {allowedOffDays(employee.department, employee.level).map(d => <option key={d} value={d}>{DAY_NAMES[d]}</option>)}
          </select>
        </Field>
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
        <Field label="Father Name">{inp("fathersName", "Father Name")}</Field>
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

      <div className="mt-4"><Button onClick={handleSave}>Save Employee</Button></div>
    </div>
  );
}

export function EmployeeEdit({ employee, setEmployee, save, close, role }) {
  const { departments, designations, ensureDepartment, ensureDesignation } = useDeptDesigOptions();
  const inp = (field, placeholder, type = "text") => (
    <input type={type} placeholder={placeholder} value={employee[field] || ""}
      onChange={e => setEmployee(v => ({ ...v, [field]: e.target.value }))}
      className="px-4 py-2 border rounded-xl w-full text-sm" />
  );
  async function handleSave() {
    await Promise.all([ensureDepartment(employee.dept), ensureDesignation(employee.designation)]);
    save();
  }
  const [otpMsg, setOtpMsg] = useState("");
  const [otpBusy, setOtpBusy] = useState(false);
  async function resendVerification() {
    setOtpBusy(true); setOtpMsg("");
    try {
      await sendOnboardingOtp(employee.id);
      setOtpMsg("Verification code sent via WhatsApp.");
    } catch (e) { setOtpMsg(`Error: ${e.message}`); }
    finally { setOtpBusy(false); }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 mb-4 p-5">
      <div className="flex justify-between mb-4"><h2 className="text-lg font-bold">Edit Employee</h2><Button variant="outline" onClick={close}>Close</Button></div>

      <Section title="Basic Information">
        <Field label="Full Name">{inp("name", "Full Name")}</Field>
        <ComboField label="Designation" value={employee.designation === "-" ? "" : employee.designation} listId="edit-designation-options" options={designations}
          placeholder="Select or type a new designation" onChange={v => setEmployee(e => ({ ...e, designation: v }))} />
        <ComboField label="Department" value={employee.dept} listId="edit-department-options" options={departments}
          placeholder="Select or type a new department" onChange={v => setEmployee(e => ({ ...e, dept: v }))} />
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
        <Field label="Weekly Off Day">
          <select value={employee.weeklyOffDay || ""} onChange={e => setEmployee(v => ({ ...v, weeklyOffDay: e.target.value }))} className="px-4 py-2 border rounded-xl w-full text-sm">
            <option value="">Not set</option>
            {allowedOffDays(employee.dept, employee.level).map(d => <option key={d} value={d}>{DAY_NAMES[d]}</option>)}
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
        <Field label="Father Name">{inp("fathersName", "Father Name")}</Field>
        <Field label="Father CNIC">{inp("fathersCnic", "Father CNIC")}</Field>
      </Section>

      <Section title="Contact Details">
        <Field label="Personal Phone">{inp("personalPhone", "Personal")}</Field>
        <Field label="Work Phone">{inp("workPhone", "Work")}</Field>
        <Field label="Email">{inp("email", "Email", "email")}</Field>
        <Field label="WhatsApp Verification">
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={resendVerification} disabled={otpBusy} className="text-xs py-1.5 px-3">
              {otpBusy ? "Sending…" : "Resend Verification Code"}
            </Button>
            {otpMsg && <span className={`text-xs ${otpMsg.startsWith("Error") ? "text-red-600" : "text-emerald-600"}`}>{otpMsg}</span>}
          </div>
        </Field>
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

      <div className="mt-4 flex gap-2"><Button onClick={handleSave}>Save Changes</Button><Button variant="outline" onClick={close}>Cancel</Button></div>
    </div>
  );
}

// ─── EOBI enrollment ───────────────────────────────────────────────────────
// A deliberate opt-in list, not the main employee directory filtered down --
// HR searches branch-by-branch and enrolls only the employees who are
// actually EOBI-eligible, entering their EOBI number and monthly deduction
// by hand (not computed). Only enrolled employees (eobi_monthly_deduction >
// 0) get anything deducted in payroll; see payrollRules.js.
function EobiRow({ e, onSaved }) {
  const enrolled = Number(e.eobi_monthly_deduction || 0) > 0;
  const [editing, setEditing] = useState(false);
  const [number, setNumber] = useState(e.eobi_number || "");
  const [amount, setAmount] = useState(e.eobi_monthly_deduction || "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    if (!(Number(amount) > 0)) { setErr("Monthly deduction must be greater than zero."); return; }
    setSaving(true); setErr("");
    try {
      await setEmployeeEobi(e.employee_code, { eobiNumber: number, monthlyDeduction: amount });
      setEditing(false);
      onSaved();
    } catch (ex) { setErr(ex.message); }
    finally { setSaving(false); }
  }

  async function remove() {
    setSaving(true); setErr("");
    try {
      await setEmployeeEobi(e.employee_code, { eobiNumber: null, monthlyDeduction: 0 });
      onSaved();
    } catch (ex) { setErr(ex.message); }
    finally { setSaving(false); }
  }

  if (editing) return (
    <tr>
      <td className="px-4 py-3 font-mono">{e.employee_code}</td>
      <td className="px-4 py-3">{e.full_name}</td>
      <td className="px-4 py-3">{e.branch}</td>
      <td className="px-4 py-3">{e.department}</td>
      <td className="px-4 py-3">
        <input value={number} onChange={ev => setNumber(ev.target.value)} placeholder="EOBI number"
          className="w-32 px-2 py-1 rounded-lg border border-slate-200 text-xs" />
      </td>
      <td className="px-4 py-3">
        <input type="number" min="0" value={amount} onChange={ev => setAmount(ev.target.value)} placeholder="Amount"
          className="w-24 px-2 py-1 rounded-lg border border-slate-200 text-xs" />
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-col gap-1">
          <div className="flex gap-1">
            <Button onClick={save} disabled={saving} className="rounded-lg text-xs py-1 px-2">Save</Button>
            <Button variant="outline" onClick={() => setEditing(false)} className="rounded-lg text-xs py-1 px-2">Cancel</Button>
          </div>
          {err && <span className="text-xs text-red-500">{err}</span>}
        </div>
      </td>
    </tr>
  );

  return (
    <tr className="hover:bg-slate-50">
      <td className="px-4 py-3 font-mono">{e.employee_code}</td>
      <td className="px-4 py-3">{e.full_name}</td>
      <td className="px-4 py-3">{e.branch}</td>
      <td className="px-4 py-3">{e.department}</td>
      <td className="px-4 py-3">{enrolled ? (e.eobi_number || "—") : <span className="text-slate-300">—</span>}</td>
      <td className="px-4 py-3">{enrolled ? money(e.eobi_monthly_deduction) : <span className="text-slate-300">—</span>}</td>
      <td className="px-4 py-3">
        <div className="flex gap-1">
          <Button variant="outline" onClick={() => setEditing(true)} className="rounded-lg text-xs py-1 px-2">
            {enrolled ? "Edit" : "Enroll"}
          </Button>
          {enrolled && <Button variant="outline" onClick={remove} disabled={saving} className="rounded-lg text-xs py-1 px-2 text-red-600 border-red-200">Remove</Button>}
        </div>
      </td>
    </tr>
  );
}

function EobiTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [branchFilter, setBranchFilter] = useState("");
  const [search, setSearch] = useState("");
  const [showEnrolledOnly, setShowEnrolledOnly] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("employees")
      .select("employee_code, full_name, branch, department, status, eobi_number, eobi_monthly_deduction")
      .eq("status", "Active").order("full_name");
    setRows(data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => rows.filter(e => {
    if (branchFilter && e.branch !== branchFilter) return false;
    if (showEnrolledOnly && !(Number(e.eobi_monthly_deduction || 0) > 0)) return false;
    if (search) {
      const lq = search.toLowerCase();
      if (!(e.full_name || "").toLowerCase().includes(lq) && !(e.employee_code || "").toLowerCase().includes(lq)) return false;
    }
    return true;
  }), [rows, branchFilter, search, showEnrolledOnly]);

  const enrolledCount = useMemo(() => rows.filter(e => Number(e.eobi_monthly_deduction || 0) > 0).length, [rows]);

  return (
    <div>
      <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm mb-4 text-sm text-slate-500">
        Search employees branch-wise and enroll them for EOBI. Enter each employee's EOBI number and monthly
        deduction amount by hand — only enrolled employees have anything deducted from payroll. {enrolledCount} employee{enrolledCount === 1 ? "" : "s"} currently enrolled.
      </div>
      <div className="flex flex-wrap gap-3 mb-4">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name / code…"
          className="px-4 py-2 rounded-xl border border-slate-200 text-sm w-56" />
        <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm">
          <option value="">All Branches</option>
          {Object.keys(BRANCH_CODE_MAP).map(b => <option key={b}>{b}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer select-none px-2">
          <input type="checkbox" checked={showEnrolledOnly} onChange={e => setShowEnrolledOnly(e.target.checked)} />
          Enrolled only
        </label>
      </div>
      {loading
        ? <p className="text-slate-400 text-sm">Loading employees...</p>
        : (
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto overflow-y-auto max-h-[70vh]">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>{["ID", "Name", "Branch", "Department", "EOBI Number", "Monthly Deduction", "Action"].map(h =>
                  <th key={h} className="text-left px-4 py-3 font-medium sticky top-0 z-10 bg-slate-50 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.length === 0
                  ? <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No employees match this search.</td></tr>
                  : filtered.map(e => <EobiRow key={e.employee_code} e={e} onSaved={load} />)}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}

export default function Employees({ query, setQuery, branch, setBranch, branchLocked, employeeStatusFilter, setEmployeeStatusFilter, showEmployeeForm, setShowEmployeeForm, newEmployee, setNewEmployee, saveEmployee, editingEmployee, setEditingEmployee, updateEmployee, loadingEmployees, filteredEmployees, updateEmployeeStatus, employees, role }) {
  const supervisorMap = useMemo(() =>
    Object.fromEntries((employees || []).map(e => [e.id, e.name])),
    [employees]
  );
  const viewOnly = role === "Branch Manager" || role === "Finance";
  const [inactivating, setInactivating] = useState(null); // employee id currently prompting for last working day
  const [lwdInput, setLwdInput] = useState("");

  // EOBI enrollment is a distinct workflow from editing employee records --
  // gated the same as employees_update/employees_manage_hr_master RLS
  // (Master/HR only), not the broader viewOnly check above.
  const canManageEobi = ["Master", "HR"].includes(role);
  const [innerTab, setInnerTab] = useState("directory");

  // Confidential — same Master/GM-only gate as CashIncentives.jsx / Dashboard.
  const canSeeIncentive = ["Master", "GM"].includes(role);

  // Finance Head needs to mark how each employee is actually paid (bank
  // transfer vs cash) without getting broader edit rights — everything
  // else on this screen stays read-only for Finance (viewOnly above).
  const canEditPaymentMethod = ["Finance", "Master"].includes(role);
  const [pmOverride, setPmOverride] = useState({});
  const [pmSaving, setPmSaving] = useState(null);
  const [pmError, setPmError] = useState("");
  async function handlePaymentMethodChange(id, value) {
    const prev = pmOverride[id];
    setPmOverride(m => ({ ...m, [id]: value }));
    setPmSaving(id); setPmError("");
    try {
      await setEmployeePaymentMethod(id, value);
    } catch (e) {
      setPmOverride(m => ({ ...m, [id]: prev }));
      setPmError(`Failed to update payment method for ${id}: ${e.message}`);
    } finally {
      setPmSaving(null);
    }
  }
  const [incentiveMap, setIncentiveMap] = useState({});
  useEffect(() => {
    if (!canSeeIncentive) { setIncentiveMap({}); return; }
    let active = true;
    fetchActiveConfidentialIncentives()
      .then(rows => {
        if (!active) return;
        const map = {};
        (rows || []).forEach(r => { map[r.employee_code] = (map[r.employee_code] || 0) + Number(r.amount || 0); });
        setIncentiveMap(map);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [canSeeIncentive]);

  function confirmInactive(id) {
    if (!lwdInput) return;
    updateEmployeeStatus(id, "Inactive", lwdInput);
    setInactivating(null);
    setLwdInput("");
  }

  return (
    <div>
      <PageTitle title="Employee Master" subtitle="Add, edit and manage staff records."
        action={
          <div className="flex gap-2 print:hidden">
            <Button variant="outline" className="rounded-2xl" onClick={() => window.print()}>🖨️ Print</Button>
            {!viewOnly && <Button className="rounded-2xl" onClick={() => setShowEmployeeForm(true)}>+ New Employee</Button>}
          </div>
        } />

      {canManageEobi && (
        <div className="flex flex-wrap gap-2 mb-5 print:hidden">
          {[["directory", "Directory"], ["eobi", "EOBI"]].map(([k, l]) => (
            <button key={k} onClick={() => setInnerTab(k)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition ${innerTab === k ? "bg-slate-950 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
              {l}
            </button>
          ))}
        </div>
      )}

      {innerTab === "eobi" && canManageEobi
        ? <EobiTab />
        : (
      <>
      <div className="flex flex-col md:flex-row gap-3 mb-4 print:hidden">
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by name, ID, department, phone..." className="flex-1 px-4 py-2.5 rounded-2xl border border-slate-200" />
        <select value={branch} onChange={e => setBranch(e.target.value)} disabled={branchLocked} className="px-4 py-2.5 rounded-2xl border border-slate-200 disabled:bg-slate-50 disabled:text-slate-500">
          <option>All</option>
          {Object.keys(BRANCH_CODE_MAP).map(b => <option key={b}>{b}</option>)}
        </select>
        <select value={employeeStatusFilter} onChange={e => setEmployeeStatusFilter(e.target.value)} className="px-4 py-2.5 rounded-2xl border border-slate-200">
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
          <option value="Resigned">Resigned</option>
          <option value="Terminated">Terminated</option>
          <option value="All">All</option>
        </select>
      </div>

      {/* Print-only header — the filter controls above are hidden when printing
          (native inputs/selects print poorly), so restate the applied filters
          here instead. This, plus filteredEmployees already reflecting the
          active search/branch/status filters, is what makes Print export
          exactly the filtered view currently on screen. */}
      <div className="hidden print:block mb-3">
        <p className="text-sm font-semibold">Employee Master — {filteredEmployees.length} record{filteredEmployees.length === 1 ? "" : "s"}</p>
        <p className="text-xs text-slate-500">
          Branch: {branch} · Status: {employeeStatusFilter}{query ? ` · Search: "${query}"` : ""} · Printed {new Date().toLocaleString()}
        </p>
      </div>

      {!viewOnly && showEmployeeForm && <EmployeeAdd employee={newEmployee} setEmployee={setNewEmployee} save={saveEmployee} close={() => setShowEmployeeForm(false)} role={role} nextId={newEmployee._nextId} />}
      {!viewOnly && editingEmployee && <EmployeeEdit employee={editingEmployee} setEmployee={setEditingEmployee} save={updateEmployee} close={() => setEditingEmployee(null)} role={role} />}
      {loadingEmployees && <p className="text-slate-400 text-sm mb-2 print:hidden">Loading employees...</p>}
      {pmError && <p className="text-red-600 text-xs mb-2 print:hidden">{pmError}</p>}

      <Table
        headers={viewOnly
          ? ["ID", "Name", "Level", "Supervisor", "Branch", "Department", "Joining Date", "Payment Method", "CNIC Expiry", "Status"]
          : ["ID", "Name", "Level", "Supervisor", "Branch", "Department", "Joining Date", "Salary", ...(canSeeIncentive ? ["Incentive"] : []), "Payment Method", "CNIC Expiry", "Status", "Action"]}
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
              <td className="px-4 py-3 text-slate-500 text-xs">{e.joiningDate || "—"}</td>
              {!viewOnly && <td className="px-4 py-3">{money(e.salary)}</td>}
              {!viewOnly && canSeeIncentive && (
                <td className="px-4 py-3 font-medium text-emerald-700">
                  {incentiveMap[e.id] ? money(incentiveMap[e.id]) : <span className="text-slate-300">—</span>}
                </td>
              )}
              <td className="px-4 py-3">
                {canEditPaymentMethod ? (
                  <select value={pmOverride[e.id] ?? e.paymentMethod ?? "Bank"} disabled={pmSaving === e.id}
                    onChange={ev => handlePaymentMethodChange(e.id, ev.target.value)}
                    className="px-2 py-1 rounded-lg border border-slate-200 text-xs bg-white print:hidden">
                    <option value="Bank">Bank</option>
                    <option value="Cash">Cash</option>
                  </select>
                ) : (
                  <Badge tone={(pmOverride[e.id] ?? e.paymentMethod) === "Cash" ? "yellow" : "green"}>
                    {pmOverride[e.id] ?? e.paymentMethod ?? "Bank"}
                  </Badge>
                )}
              </td>
              <td className="px-4 py-3">
                {e.cnicExpiryDate
                  ? <span className={`text-xs px-2 py-1 rounded-xl font-medium ${cnicStatus === "expired" ? "bg-red-100 text-red-700" : cnicStatus === "soon" ? "bg-orange-100 text-orange-700" : "text-slate-500"}`}>
                      {e.cnicExpiryDate}{cnicStatus === "expired" ? " ⚠ Expired" : cnicStatus === "soon" ? " ⚠ Expiring" : ""}
                    </span>
                  : <span className="text-slate-300">—</span>}
              </td>
              <td className="px-4 py-3">
                <Badge tone={e.status === "Active" ? "green" : "yellow"}>{e.status}</Badge>
                {e.status !== "Active" && (
                  <div className="text-[11px] text-slate-400 mt-1">
                    {e.lastWorkingDay ? `Last day: ${e.lastWorkingDay}` : "Last day: not recorded"}
                  </div>
                )}
              </td>
              {!viewOnly && (
                <td className="px-4 py-3 print:hidden">
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setEditingEmployee(e)}>Edit</Button>
                    {e.status === "Active" && (
                      inactivating === e.id ? null : (
                        <Button variant="outline" onClick={() => { setInactivating(e.id); setLwdInput(""); }}>Inactive</Button>
                      )
                    )}
                  </div>
                  {inactivating === e.id && (
                    <div className="flex gap-2 items-center mt-2">
                      <input type="date" value={lwdInput} onChange={ev => setLwdInput(ev.target.value)} className="px-2 py-1 rounded-lg border border-slate-200 text-xs" />
                      <Button variant="outline" className="text-xs px-2 py-1" disabled={!lwdInput} onClick={() => confirmInactive(e.id)}>Confirm</Button>
                      <Button variant="outline" className="text-xs px-2 py-1" onClick={() => setInactivating(null)}>Cancel</Button>
                    </div>
                  )}
                </td>
              )}
            </tr>
          );
        }}
      />
      </>
      )}
    </div>
  );
}
