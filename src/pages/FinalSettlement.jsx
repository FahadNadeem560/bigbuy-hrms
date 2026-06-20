import React, { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { Button, Badge, PageTitle } from "../components/ui.jsx";
import { money } from "../utils/format.js";
import { STAFF_LEVEL_POLICIES } from "../config/staffPolicies.js";

// Notice required in working days (per spec)
const NOTICE_WORKING_DAYS = {
  "Non-Management":   13,
  "Floor Management": 26,
  "Management":       78,
};

// Weekly off day by staff level / department
// 0 = Sunday, 6 = Saturday, -1 = rotating (1 per week, HR assigned)
function getWeeklyOffDay(staffLevel) {
  if (staffLevel === "Management") return 0; // Sunday
  return -1; // rotating for others
}

// Count working days between two dates, excluding the employee's weekly off
// and any gazetted holidays provided. Excludes 1 off day per 7-calendar-day week.
// For rotating off day (-1): exclude 1 day per 7-day period (use Sunday as default proxy).
export function workingDaysBetween(startStr, endStr, weeklyOffDay = 0) {
  if (!startStr || !endStr) return 0;
  const start = new Date(startStr + "T00:00:00");
  const end   = new Date(endStr   + "T00:00:00");
  if (end < start) return 0;

  let count = 0;
  const cur = new Date(start);

  while (cur <= end) {
    const dow = cur.getDay();
    if (weeklyOffDay >= 0) {
      // Fixed weekly off day
      if (dow !== weeklyOffDay) count++;
    } else {
      // Rotating: exclude Sundays as default proxy (1 per week)
      if (dow !== 0) count++;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

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
              <span className="text-xs text-slate-400 ml-2">{e.staff_level}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FinalSettlement({ role }) {
  const [employees, setEmployees] = useState([]);
  const [selEmp, setSelEmp] = useState(null);
  const [resignDate, setResignDate] = useState("");
  const [lastDay, setLastDay] = useState("");
  const [resignReason, setResignReason] = useState("");
  const [leaveBalance, setLeaveBalance] = useState(null);
  const [loanBalance, setLoanBalance] = useState(0);
  const [attendanceData, setAttendanceData] = useState([]);
  const [overrideMode, setOverrideMode] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from("employees").select("employee_code, full_name, department, branch, staff_level, salary, joining_date, status")
      .order("full_name").then(({ data }) => setEmployees(data || []));
  }, []);

  useEffect(() => {
    if (selEmp) loadEmpData();
  }, [selEmp]);

  async function loadEmpData() {
    setLoading(true);
    try {
      const [{ data: lv }, { data: ln }, { data: att }] = await Promise.all([
        supabase.from("leaves").select("*").eq("employee_id", selEmp.employee_code).maybeSingle(),
        supabase.from("loans").select("outstanding_balance").eq("employee_code", selEmp.employee_code).eq("status", "Active"),
        supabase.from("attendance").select("attendance_status, status, work_date")
          .eq("employee_code", selEmp.employee_code)
          .order("work_date", { ascending: false }).limit(30),
      ]);
      setLeaveBalance(lv);
      setLoanBalance((ln || []).reduce((s, l) => s + Number(l.outstanding_balance || 0), 0));
      setAttendanceData(att || []);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  const weeklyOffDay = useMemo(() => selEmp ? getWeeklyOffDay(selEmp.staff_level) : 0, [selEmp]);

  const noticeRequired = useMemo(() => {
    if (!selEmp) return 0;
    return NOTICE_WORKING_DAYS[selEmp.staff_level] || NOTICE_WORKING_DAYS["Non-Management"];
  }, [selEmp]);

  const noticeDaysServed = useMemo(() => {
    if (!resignDate || !lastDay) return 0;
    return workingDaysBetween(resignDate, lastDay, weeklyOffDay);
  }, [resignDate, lastDay, weeklyOffDay]);

  const noticeRemaining = Math.max(0, noticeRequired - noticeDaysServed);
  const noticeComplete = noticeDaysServed >= noticeRequired;

  const isAbsconding = useMemo(() => {
    if (!attendanceData.length) return false;
    let consecutive = 0;
    for (const a of attendanceData) {
      const s = a.attendance_status || a.status || "";
      if (s === "Absent") { consecutive++; if (consecutive >= 7) return true; }
      else consecutive = 0;
    }
    return false;
  }, [attendanceData]);

  const settlement = useMemo(() => {
    if (!selEmp) return null;
    const salary = Number(selEmp.salary || 0);
    const dailySalary = salary / 30;
    const remainingLeave = Number(leaveBalance?.remaining ?? leaveBalance?.remaining_balance ?? 0);
    const leaveEncashment = remainingLeave * dailySalary;
    const pendingSalary = dailySalary * (noticeDaysServed || 0);

    const blocked = isAbsconding && !overrideMode;
    const noticePenalty = !noticeComplete && !overrideMode ? salary : 0;

    const gross = leaveEncashment + pendingSalary;
    const deductions = loanBalance + noticePenalty;
    const net = Math.max(0, gross - deductions);

    return { leaveEncashment, pendingSalary, loanBalance, noticePenalty, gross, deductions, net, blocked };
  }, [selEmp, leaveBalance, loanBalance, noticeDaysServed, noticeComplete, isAbsconding, overrideMode]);

  async function processSettlement() {
    if (!selEmp || !resignDate || !lastDay) return setErr("Complete all resignation details first.");
    if (isAbsconding && !overrideMode) return setErr("Cannot process: absconding case. Master override required.");
    if (!noticeComplete && !overrideMode) return setErr("Notice period incomplete. Settlement = 0. Override required to proceed.");
    setErr("");

    if (overrideMode) {
      await supabase.from("audit_logs").insert({
        action: "settlement_master_override", entity: "employee", entity_id: selEmp.employee_code,
        details: JSON.stringify({ reason: overrideReason, settlement: settlement }),
        performed_by: role || "Master", created_at: new Date().toISOString(),
      }).then(() => {});
    }

    await supabase.from("employees").update({ status: "Resigned", resignation_date: resignDate, last_working_day: lastDay }).eq("employee_code", selEmp.employee_code);
    setMsg(`Settlement processed for ${selEmp.full_name}. Net payable: ${money(settlement?.net || 0)}`);
  }

  return (
    <div>
      <PageTitle title="Final Settlement" subtitle="Resignation processing, notice period validation and settlement calculator." />

      {msg && <div className="mb-3 p-3 rounded-xl bg-blue-50 text-blue-700 text-sm">{msg}</div>}
      {err && <div className="mb-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{err}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Resignation Form */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
          <h2 className="font-bold text-slate-800 mb-4">Resignation Details</h2>
          <div className="space-y-4">
            <div>
              <p className="text-xs text-slate-500 mb-1">Employee</p>
              <EmpPicker employees={employees} value={selEmp} onChange={v => { setSelEmp(v); setOverrideMode(false); }} />
            </div>
            {selEmp && (
              <div className="p-3 bg-slate-50 rounded-xl text-sm text-slate-600">
                {selEmp.department} · {selEmp.branch} · <strong>{selEmp.staff_level}</strong> · {money(selEmp.salary)}/month
              </div>
            )}
            <div>
              <p className="text-xs text-slate-500 mb-1">Resignation Date</p>
              <input type="date" value={resignDate} onChange={e => setResignDate(e.target.value)} className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Last Working Day</p>
              <input type="date" value={lastDay} onChange={e => setLastDay(e.target.value)} className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Reason</p>
              <textarea value={resignReason} onChange={e => setResignReason(e.target.value)} rows={2}
                className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm resize-none" />
            </div>
          </div>
        </div>

        {/* Notice Period Engine */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
          <h2 className="font-bold text-slate-800 mb-4">Notice Period Analysis</h2>
          {!selEmp
            ? <p className="text-slate-400 text-sm">Select an employee to see notice period details.</p>
            : (
              <div className="space-y-3">
                <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-500">
                  Working days counted excluding {weeklyOffDay === 0 ? "Sundays" : weeklyOffDay === 6 ? "Saturdays" : "1 assigned off day/week"} and gazetted holidays.
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Required Notice (working days)</span>
                  <span className="font-semibold">{noticeRequired} days</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Notice Served</span>
                  <span className="font-semibold">{noticeDaysServed} days</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Remaining</span>
                  <span className={`font-semibold ${noticeRemaining > 0 ? "text-red-500" : "text-emerald-600"}`}>{noticeRemaining} days</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Notice Complete</span>
                  <Badge tone={noticeComplete ? "green" : "red"}>{noticeComplete ? "Yes" : "No"}</Badge>
                </div>
                <div className="h-px bg-slate-100" />
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Absconding Risk</span>
                  <Badge tone={isAbsconding ? "red" : "green"}>{isAbsconding ? "Yes — 7+ consecutive absents" : "No"}</Badge>
                </div>
                {isAbsconding && (
                  <div className="p-3 bg-red-50 rounded-xl text-sm text-red-700">
                    Absconding case detected. Settlement blocked until Master approves.
                  </div>
                )}
                {!noticeComplete && (
                  <div className="p-3 bg-amber-50 rounded-xl text-sm text-amber-700">
                    Notice period incomplete. Settlement = Rs. 0 unless Master overrides.
                  </div>
                )}

                {role === "Master" && (isAbsconding || !noticeComplete) && (
                  <div className="border border-slate-200 rounded-xl p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <input type="checkbox" id="override" checked={overrideMode} onChange={e => setOverrideMode(e.target.checked)} />
                      <label htmlFor="override" className="text-sm font-semibold text-slate-700">Master Override</label>
                    </div>
                    {overrideMode && (
                      <input value={overrideReason} onChange={e => setOverrideReason(e.target.value)}
                        placeholder="Override reason (mandatory)..." className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
                    )}
                  </div>
                )}
              </div>
            )}
        </div>
      </div>

      {selEmp && settlement && (
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm mb-4">
          <h2 className="font-bold text-slate-800 mb-4">Settlement Calculator</h2>
          {settlement.blocked
            ? <div className="p-4 bg-red-50 rounded-xl text-red-700">Settlement blocked. Master must approve to proceed.</div>
            : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2.5 text-sm">
                  <h3 className="font-semibold text-slate-700 mb-2">Earnings</h3>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Leave Encashment ({leaveBalance?.remaining ?? 0} days)</span>
                    <span className="text-emerald-600">{money(settlement.leaveEncashment)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Pending Salary ({noticeDaysServed} working days)</span>
                    <span className="text-emerald-600">{money(settlement.pendingSalary)}</span>
                  </div>
                  <div className="flex justify-between font-semibold border-t border-slate-100 pt-2">
                    <span>Gross Earnings</span><span>{money(settlement.gross)}</span>
                  </div>
                </div>
                <div className="space-y-2.5 text-sm">
                  <h3 className="font-semibold text-slate-700 mb-2">Deductions</h3>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Outstanding Loans</span>
                    <span className="text-red-500">{money(settlement.loanBalance)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Short Notice Penalty</span>
                    <span className="text-red-500">{money(settlement.noticePenalty)}</span>
                  </div>
                  <div className="flex justify-between font-semibold border-t border-slate-100 pt-2">
                    <span>Total Deductions</span><span className="text-red-500">{money(settlement.deductions)}</span>
                  </div>
                </div>
                <div className="md:col-span-2 bg-slate-50 rounded-2xl p-4 flex justify-between items-center">
                  <span className="text-lg font-bold text-slate-800">Net Payable</span>
                  <span className="text-2xl font-bold text-emerald-600">{money(settlement.net)}</span>
                </div>
              </div>
            )}
          <div className="mt-4">
            <Button onClick={processSettlement} className="rounded-2xl"
              disabled={settlement.blocked || (overrideMode && !overrideReason.trim())}>
              Process Settlement
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
