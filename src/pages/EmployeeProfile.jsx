import React, { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { Button, Badge, PageTitle } from "../components/ui.jsx";
import { money } from "../utils/format.js";
import StatusBadge from "../components/StatusBadge.jsx";

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
        placeholder="Search employee by code or name..."
        className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
      {open && hits.length > 0 && (
        <div className="absolute z-20 top-full left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-lg mt-1 max-h-48 overflow-y-auto">
          {hits.map(e => (
            <button key={e.employee_code} onMouseDown={ev => ev.preventDefault()}
              onClick={() => { onChange(e); setQ(""); setOpen(false); }}
              className="w-full text-left px-4 py-2 hover:bg-slate-50 text-sm">
              <span className="font-semibold">{e.employee_code}</span> — {e.full_name}
              <span className="text-xs text-slate-400 ml-2">{e.department} · {e.branch}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function EmployeeProfile({ role }) {
  const [employees, setEmployees] = useState([]);
  const [selEmp, setSelEmp] = useState(null);
  const [attendance30, setAttendance30] = useState([]);
  const [leaveData, setLeaveData] = useState(null);
  const [loanData, setLoanData] = useState([]);
  const [payrollData, setPayrollData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [exemptMsg, setExemptMsg] = useState("");
  const [exemptionReason, setExemptionReason] = useState("");

  useEffect(() => {
    supabase.from("employees").select("*").order("full_name").then(({ data }) => setEmployees(data || []));
  }, []);

  useEffect(() => {
    if (selEmp) {
      loadProfile(selEmp);
      setExemptionReason(selEmp.exemption_reason || "");
    }
  }, [selEmp]);

  async function toggleExemption(newVal) {
    if (role !== "Master") return;
    if (newVal && !exemptionReason.trim()) {
      setErr("Exemption reason is required.");
      return;
    }
    setErr("");
    const { error } = await supabase.from("employees").update({
      is_attendance_exempt: newVal,
      exemption_reason: newVal ? exemptionReason : null,
    }).eq("employee_code", selEmp.employee_code);
    if (error) return setErr(error.message);
    // Log to audit_logs
    await supabase.from("audit_logs").insert({
      action: newVal ? "exemption_granted" : "exemption_removed",
      entity: "employees", entity_id: selEmp.employee_code,
      performed_by: role,
      details: newVal ? `Attendance exemption granted. Reason: ${exemptionReason}` : "Attendance exemption removed.",
      created_at: new Date().toISOString(),
    }).then(() => {});
    setExemptMsg(newVal ? "Attendance exemption enabled." : "Attendance exemption removed.");
    // Refresh employee data
    const { data } = await supabase.from("employees").select("*").eq("employee_code", selEmp.employee_code).maybeSingle();
    if (data) setSelEmp(data);
  }

  const [fieldMsg, setFieldMsg] = useState("");
  const [taxSetting, setTaxSetting] = useState(null);

  async function toggleFieldEmployee(newVal) {
    if (role !== "Master") return;
    setErr("");
    const { error } = await supabase.from("employees").update({ is_field_employee: newVal }).eq("employee_code", selEmp.employee_code);
    if (error) return setErr(error.message);
    await supabase.from("audit_logs").insert({
      action: newVal ? "field_employee_enabled" : "field_employee_disabled",
      entity: "employees", entity_id: selEmp.employee_code,
      performed_by: "Master",
      details: `Field employee ${newVal ? "enabled" : "disabled"}.`,
      created_at: new Date().toISOString(),
    }).then(() => {});
    setFieldMsg(newVal ? "Field employee status enabled." : "Field employee status disabled.");
    const { data } = await supabase.from("employees").select("*").eq("employee_code", selEmp.employee_code).maybeSingle();
    if (data) setSelEmp(data);
  }

  async function loadProfile(emp) {
    setLoading(true); setErr("");
    const from30 = new Date(); from30.setDate(from30.getDate() - 30);
    const fromStr = from30.toISOString().slice(0, 10);
    const now = new Date();
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    try {
      const [{ data: att }, { data: lv }, { data: ln }, { data: pay }, { data: tx }] = await Promise.all([
        supabase.from("attendance").select("*").eq("employee_code", emp.employee_code)
          .gte("work_date", fromStr).order("work_date", { ascending: false }),
        supabase.from("leaves").select("*").eq("employee_id", emp.employee_code).maybeSingle(),
        supabase.from("loans").select("*").eq("employee_code", emp.employee_code).eq("status", "Active"),
        supabase.from("payroll").select("*").eq("employee_code", emp.employee_code).eq("payroll_month", monthStr).maybeSingle(),
        supabase.from("employee_tax_settings").select("*").eq("employee_code", emp.employee_code).maybeSingle(),
      ]);
      setAttendance30(att || []);
      setLeaveData(lv);
      setLoanData(ln || []);
      setPayrollData(pay);
      setTaxSetting(tx);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  const attSummary = useMemo(() => {
    const present = attendance30.filter(a => (a.attendance_status || a.status) !== "Absent").length;
    const absent = attendance30.filter(a => (a.attendance_status || a.status) === "Absent").length;
    const late = attendance30.filter(a => Number(a.late_minutes || 0) > 0).length;
    return { present, absent, late, total: attendance30.length };
  }, [attendance30]);

  const totalLoan = loanData.reduce((s, l) => s + Number(l.outstanding_balance || 0), 0);

  const DOCS = ["CNIC", "EOBI Registration", "Employment Contract", "Joining Letter", "Bank Details"];
  const WARNINGS = ["No warnings on record"];

  return (
    <div>
      <PageTitle title="Employee Profile" subtitle="Complete single-view profile combining attendance, leave, payroll and loans." />

      {/* Search */}
      <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm mb-4">
        <EmpPicker employees={employees} value={selEmp} onChange={v => { setSelEmp(v); setAttendance30([]); setLeaveData(null); setLoanData([]); setPayrollData(null); }} />
      </div>

      {err && <div className="mb-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{err}</div>}
      {exemptMsg && <div className="mb-3 p-3 rounded-xl bg-purple-50 text-purple-700 text-sm">{exemptMsg}</div>}
      {loading && <div className="bg-white border border-slate-100 rounded-2xl p-12 text-center text-slate-400 shadow-sm">Loading profile...</div>}

      {!loading && !selEmp && (
        <div className="bg-white border border-slate-100 rounded-2xl p-12 text-center text-slate-400 shadow-sm">
          <div className="text-4xl mb-3">👤</div>
          <p className="font-medium">Search an employee to view their full profile.</p>
        </div>
      )}

      {!loading && selEmp && (
        <div className="space-y-4">
          {/* Personal Info */}
          <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="h-16 w-16 rounded-2xl bg-slate-100 flex items-center justify-center text-3xl shrink-0">👤</div>
              <div className="flex-1">
                <div className="flex flex-wrap items-start gap-2 mb-1">
                  <h2 className="text-xl font-bold text-slate-900">{selEmp.full_name}</h2>
                  <Badge tone={selEmp.status === "Active" ? "green" : "red"}>{selEmp.status}</Badge>
                  {/* Employment status badge */}
                  {selEmp.employment_status === "Temporary" && (
                    <span className="px-3 py-1 rounded-full text-xs border bg-red-50 text-red-700 border-red-100 font-semibold">TEMPORARY</span>
                  )}
                  {selEmp.employment_status === "Probation" && (
                    <span className="px-3 py-1 rounded-full text-xs border bg-amber-50 text-amber-700 border-amber-100 font-semibold">PROBATION</span>
                  )}
                  {selEmp.is_field_employee && (
                    <span className="px-3 py-1 rounded-full text-xs border bg-blue-50 text-blue-700 border-blue-100 font-semibold">FIELD</span>
                  )}
                  {selEmp.is_attendance_exempt && (
                    <span className="px-3 py-1 rounded-full text-xs border bg-purple-50 text-purple-700 border-purple-100 font-semibold">EXEMPTED</span>
                  )}
                  {/* Tax mode badge */}
                  {taxSetting && (
                    <span className={`px-3 py-1 rounded-full text-xs border font-semibold ${
                      taxSetting.tax_mode === "exempt" ? "bg-green-50 text-green-700 border-green-100"
                      : taxSetting.tax_mode === "manual" ? "bg-yellow-50 text-yellow-700 border-yellow-100"
                      : "bg-slate-50 text-slate-600 border-slate-200"
                    }`}>
                      TAX: {(taxSetting.tax_mode || "auto").toUpperCase()}
                    </span>
                  )}
                </div>
                <p className="text-slate-500 text-sm">{selEmp.designation || "—"} · {selEmp.department} · {selEmp.branch}</p>
                {selEmp.is_attendance_exempt && selEmp.exemption_reason && (
                  <p className="text-xs text-purple-600 mt-1">Exemption reason: {selEmp.exemption_reason}</p>
                )}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-sm">
                  {[
                    ["Employee ID", selEmp.employee_code],
                    ["Staff Level", selEmp.staff_level],
                    ["Salary", money(selEmp.salary)],
                    ["Joining Date", selEmp.joining_date || "—"],
                    ["Phone", selEmp.phone || selEmp.whatsapp_number || "—"],
                    ["CNIC", selEmp.cnic || "—"],
                    ["EOBI Status", selEmp.eobi_status || "—"],
                    ["Employee Type", selEmp.employee_type || "Permanent"],
                  ].map(([label, val]) => (
                    <div key={label}>
                      <p className="text-xs text-slate-400">{label}</p>
                      <p className="font-medium text-slate-800">{val}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Present (30d)", value: attSummary.present, sub: `of ${attSummary.total} days`, color: "text-emerald-600" },
              { label: "Absent (30d)", value: attSummary.absent, sub: "days", color: "text-red-500" },
              { label: "Late (30d)", value: attSummary.late, sub: "days", color: "text-amber-500" },
              { label: "Loan Outstanding", value: money(totalLoan), sub: loanData.length ? "active loans" : "no active loan", color: "text-slate-900" },
            ].map(({ label, value, sub, color }) => (
              <div key={label} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
                <p className="text-xs text-slate-500">{label}</p>
                <p className={`text-xl font-bold ${color}`}>{value}</p>
                <p className="text-xs text-slate-400">{sub}</p>
              </div>
            ))}
          </div>

          {/* Employment Status Info */}
          {(selEmp.employment_status === "Temporary" || selEmp.employment_status === "Probation") && (
            <div className={`border rounded-2xl p-4 shadow-sm ${selEmp.employment_status === "Temporary" ? "border-red-100 bg-red-50/30" : "border-amber-100 bg-amber-50/30"}`}>
              <div className="flex flex-wrap items-center gap-3">
                <div>
                  <h3 className="font-bold text-slate-800">{selEmp.employment_status === "Temporary" ? "Temporary Employee" : "Probation Period"}</h3>
                  {selEmp.temp_id && <p className="text-xs text-slate-500 mt-0.5">Temp ID: {selEmp.temp_id}</p>}
                  {selEmp.probation_start_date && <p className="text-xs text-slate-500 mt-0.5">Probation Start: {selEmp.probation_start_date} · End: {selEmp.probation_end_date || "—"}</p>}
                </div>
              </div>
            </div>
          )}

          {/* Field Employee Toggle — Master only */}
          {role === "Master" && (
            <div className="bg-white border border-blue-100 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold text-slate-800">Field / Market Employee</h3>
                {selEmp.is_field_employee && <span className="text-xs bg-blue-100 text-blue-700 px-3 py-1 rounded-full font-semibold">ACTIVE</span>}
              </div>
              <p className="text-xs text-slate-500 mb-3">Field employees can log their time manually via the self-service portal. Each entry requires HR approval.</p>
              {fieldMsg && <p className="text-xs text-blue-600 mb-2">{fieldMsg}</p>}
              {selEmp.is_field_employee
                ? <Button onClick={() => toggleFieldEmployee(false)} variant="outline" className="rounded-2xl text-red-600 border-red-200">Remove Field Status</Button>
                : <Button onClick={() => toggleFieldEmployee(true)} className="rounded-2xl bg-blue-600 hover:bg-blue-700 text-white">Enable Field Employee</Button>}
            </div>
          )}

          {/* Attendance Exemption — Master only */}
          {role === "Master" && (
            <div className="bg-white border border-purple-100 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-slate-800">Attendance Exemption</h3>
                {selEmp.is_attendance_exempt && (
                  <span className="text-xs bg-purple-100 text-purple-700 px-3 py-1 rounded-full font-semibold">ACTIVE</span>
                )}
              </div>
              <p className="text-xs text-slate-500 mb-3">
                When enabled, this employee is excluded from late marks, short hour deductions, OT calculations, and all timing-based penalties.
                Attendance is still recorded.
              </p>
              {!selEmp.is_attendance_exempt ? (
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Exemption Reason (required) *</p>
                    <textarea value={exemptionReason} onChange={e => setExemptionReason(e.target.value)}
                      rows={2} placeholder="Enter reason for attendance exemption..."
                      className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
                  </div>
                  <Button onClick={() => toggleExemption(true)} className="rounded-2xl bg-purple-600 hover:bg-purple-700 text-white">
                    Enable Exemption
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-purple-700 bg-purple-50 rounded-xl p-3">
                    <strong>Reason:</strong> {selEmp.exemption_reason || "—"}
                  </p>
                  <Button onClick={() => toggleExemption(false)} variant="outline" className="rounded-2xl text-red-600 border-red-200">
                    Remove Exemption
                  </Button>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Leave Balance */}
            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
              <h3 className="font-bold text-slate-800 mb-3">Leave Balance</h3>
              {leaveData ? (
                <div className="grid grid-cols-3 gap-3 text-center">
                  {[["Opening", leaveData.opening_balance], ["Earned", leaveData.earned], ["Used", leaveData.used],
                    ["Half Leaves", leaveData.half_leaves], ["Remaining", leaveData.remaining ?? leaveData.remaining_balance]].map(([l, v]) => (
                    <div key={l} className="bg-slate-50 rounded-xl p-2">
                      <p className="text-xs text-slate-400">{l}</p>
                      <p className="text-lg font-bold text-slate-900">{v ?? "—"}</p>
                    </div>
                  ))}
                </div>
              ) : <p className="text-slate-400 text-sm">No leave balance data found.</p>}
            </div>

            {/* Current Month Payroll */}
            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
              <h3 className="font-bold text-slate-800 mb-3">Current Month Payroll</h3>
              {payrollData ? (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-slate-500">Gross</span><span>{money(payrollData.gross_salary)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Deductions</span><span className="text-red-500">-{money((payrollData.absent_deduction || 0) + (payrollData.late_deduction || 0) + (payrollData.loan_deduction || 0))}</span></div>
                  <div className="flex justify-between font-bold border-t border-slate-100 pt-2"><span>Net Pay</span><span className="text-emerald-600">{money(payrollData.net_salary)}</span></div>
                  <Badge tone={payrollData.status === "Paid" ? "green" : payrollData.status === "Approved" ? "blue" : "yellow"}>{payrollData.status}</Badge>
                </div>
              ) : <p className="text-slate-400 text-sm">No payroll data for current month.</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Documents Placeholder */}
            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
              <h3 className="font-bold text-slate-800 mb-3">Documents</h3>
              <div className="space-y-2">
                {DOCS.map(d => (
                  <div key={d} className="flex justify-between items-center text-sm">
                    <span className="text-slate-700">{d}</span>
                    <Badge tone={d === "CNIC" && selEmp.cnic ? "green" : d === "Bank Details" ? "yellow" : "slate"}>
                      {d === "CNIC" && selEmp.cnic ? "Received" : "Pending"}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>

            {/* Attendance (last 30 days) */}
            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
              <h3 className="font-bold text-slate-800 mb-3">Recent Attendance (Last 10)</h3>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {attendance30.slice(0, 10).map((a, i) => (
                  <div key={i} className="flex justify-between items-center text-sm">
                    <span className="text-slate-600">{a.work_date}</span>
                    <StatusBadge status={a.attendance_status || a.status || "Pending"} />
                  </div>
                ))}
                {attendance30.length === 0 && <p className="text-slate-400 text-sm">No attendance records found.</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
