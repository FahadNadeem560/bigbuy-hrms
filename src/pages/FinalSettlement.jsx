import React, { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { Button, Badge, PageTitle } from "../components/ui.jsx";
import { money } from "../utils/format.js";
import { buildSettlement } from "../services/settlementEngine.js";
import { processFinalSettlement, fetchSettlementLines } from "../services/finalSettlementService.js";

// Calendar days required per staff level (no exclusions)
const NOTICE_CALENDAR_DAYS = {
  "Non-Management":   15,
  "Floor Management": 30,
  "Management":       45,
};

// Payout modes offered once a Master override is engaged on a resignation:
//  - worked       : pay only the days actually worked in the notice window (default, pre-existing behaviour)
//  - full_period  : pay the whole required notice period as if it had been served in full
//  - custom       : pay an explicit number of days chosen by the Master
const PAYOUT_MODE_LABELS = {
  worked: "Pay for days worked",
  full_period: "Pay full notice period (served or not)",
  custom: "Custom — choose the number of days to pay",
};

// Simple inclusive calendar day count
function calendarDaysBetween(startStr, endStr) {
  if (!startStr || !endStr) return 0;
  const start = new Date(startStr + "T00:00:00");
  const end   = new Date(endStr   + "T00:00:00");
  if (end < start) return 0;
  return Math.floor((end - start) / 86400000) + 1;
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

// ─── Settlement Slip ──────────────────────────────────────────────────────
// Full detail of one processed settlement — the F&F equivalent of the payroll
// payslip. Reads straight off the stored final_settlements row (nothing is
// recomputed here; the figures are exactly what was locked in at settlement).
function SettlementSlipModal({ row, onClose }) {
  const [lines, setLines] = useState([]);
  useEffect(() => {
    if (!row?.id) { setLines([]); return; }
    fetchSettlementLines(row.id).then(setLines).catch(() => setLines([]));
  }, [row?.id]);
  if (!row) return null;
  const isTerm = row.separation_type === "termination";
  const sepDate = isTerm ? row.termination_date : row.resignation_date;
  // Rows bulk-imported when F&F was moved out of payroll (Aug 2026) only carry
  // the money totals — no per-day / notice / rate detail was ever captured.
  const legacy = !Number(row.daily_rate) && !Number(row.salary) && !Number(row.pending_salary)
    && !row.days_present && !row.weekly_offs && Number(row.gross_earnings) > 0;
  const ERow = ({ label, value, always }) => (always || value) ? (
    <div className="flex justify-between py-1.5 border-b border-slate-100">
      <span className="text-slate-500 text-sm">{label}</span>
      <span className="text-sm text-emerald-700">{money(value || 0)}</span>
    </div>
  ) : null;
  const DRow = ({ label, value }) => value ? (
    <div className="flex justify-between py-1.5 border-b border-slate-100">
      <span className="text-slate-500 text-sm">{label}</span>
      <span className="text-sm text-red-500">– {money(value)}</span>
    </div>
  ) : null;
  const IRow = ({ label, value }) => (
    <div className="flex justify-between py-1.5 border-b border-slate-100">
      <span className="text-slate-500 text-sm">{label}</span>
      <span className="text-sm text-slate-700 text-right">{value ?? "—"}</span>
    </div>
  );
  const dr = Number(row.daily_rate || 0);
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white rounded-t-2xl px-6 pt-6 pb-3 border-b border-slate-100 flex justify-between items-start">
          <div>
            <h2 className="font-bold text-slate-800 text-lg">Final Settlement — {row.payroll_month}</h2>
            <p className="text-sm text-slate-500">{row.employee_name} · {row.employee_code}</p>
            <div className="flex gap-2 mt-1">
              {row.staff_level && <span className="text-xs text-slate-400">{row.staff_level}</span>}
              <Badge tone={isTerm ? "yellow" : "slate"}>{isTerm ? "Termination" : "Resignation"}</Badge>
              <Badge tone={row.payment_status === "FnF" ? "blue" : "red"}>{row.payment_status === "FnF" ? "F&F" : "No F&F"}</Badge>
            </div>
          </div>
          <Button variant="outline" onClick={onClose} className="rounded-xl text-xs">Close</Button>
        </div>
        <div className="px-6 py-4 space-y-5">
          {/* Separation */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Separation</h3>
            <IRow label={isTerm ? "Termination Date" : "Resignation Date"} value={sepDate} />
            <IRow label="Last Working Day" value={row.last_working_day} />
            <IRow label="Branch / Department" value={`${row.branch || "—"} / ${row.department || "—"}`} />
            {row.resignation_reason && <IRow label="Reason" value={row.resignation_reason} />}
            <IRow label="Settled By" value={`${row.settled_by || "—"}${row.settled_at ? ` · ${new Date(row.settled_at).toLocaleDateString()}` : ""}`} />
          </div>

          {legacy && (
            <div className="p-3 rounded-xl bg-amber-50 text-amber-700 text-sm">
              Imported record — only the settlement totals were carried over. Per-day,
              notice-period and rate detail was not captured for settlements processed
              before this screen existed.
            </div>
          )}

          {/* Notice period — resignation only */}
          {!isTerm && !legacy && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Notice Period</h3>
              <IRow label="Required (calendar days)" value={row.notice_required_days} />
              <IRow label="Served (calendar days)" value={row.notice_served_days} />
              <IRow label="Notice Complete" value={row.notice_complete ? "Yes" : "No"} />
              <IRow label="Absconding" value={row.is_absconding ? "Yes — 7+ consecutive absents" : "No"} />
              {row.override_applied && (
                <>
                  <IRow label="Master Override" value={`Yes · ${row.override_by || "Master"}`} />
                  {row.override_reason && <IRow label="Override Reason" value={row.override_reason} />}
                </>
              )}
            </div>
          )}

          {/* Days */}
          {!legacy && (
          <div className="bg-blue-50 rounded-xl px-4 py-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-blue-400 mb-2">Days & Rate</h3>
            <div className="grid grid-cols-3 gap-2 text-xs mb-2">
              {[["Present", row.days_present], ["Weekly Offs", row.weekly_offs], ["Absent", row.absent_days]].map(([l, v]) => (
                <div key={l} className="text-center bg-white rounded-lg py-1.5 px-2">
                  <div className="font-semibold text-slate-700">{Math.round(Number(v) || 0)}</div>
                  <div className="text-slate-400 leading-tight">{l}</div>
                </div>
              ))}
            </div>
            <IRow label="Days Paid" value={`${row.payout_days ?? row.paid_days} day(s)`} />
            <IRow label="Payout Basis" value={PAYOUT_MODE_LABELS[row.payout_mode] || PAYOUT_MODE_LABELS.worked} />
            {isTerm && <IRow label="Salary Payable" value={row.salary_payable === false ? "No — withheld" : "Yes"} />}
            <IRow label="Daily Rate (Salary / 30)" value={money(dr)} />
          </div>
          )}

          {/* Which months this settlement actually paid for */}
          {lines.length > 0 && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Period Settled</h3>
              {(row.window_start || row.settled_through_month) && (
                <p className="text-xs text-slate-400 mb-2">
                  Paid up to {row.settled_through_month || "—"} · settling {row.window_start} → {row.window_end}
                </p>
              )}
              {lines.map(l => (
                <div key={l.id} className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500 text-sm">
                    {l.payroll_month}
                    {l.line_type !== "month" && <span className="text-xs text-amber-700 ml-1">{l.label || l.line_type}</span>}
                  </span>
                  <span className="text-sm text-slate-700">{money(l.net)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Earnings */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Earnings</h3>
            {!legacy && <ERow label={`Pending Salary (${row.payout_days ?? row.paid_days} × ${money(dr)})`} value={row.pending_salary} always />}
            {!legacy && <ERow label="Leave Encashment" value={row.leave_encashment} always />}
            <div className="flex justify-between py-2 mt-1 bg-emerald-50 rounded-xl px-3">
              <span className="font-bold text-sm text-emerald-800">Gross Earnings</span>
              <span className="font-bold text-sm text-emerald-800">{money(row.gross_earnings)}</span>
            </div>
          </div>

          {/* Deductions */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Deductions</h3>
            <DRow label="Outstanding Loans" value={row.loan_balance} />
            <DRow label="Short Notice Penalty" value={row.notice_penalty} />
            {legacy && <p className="text-sm text-slate-400 py-1.5">Breakdown not captured for this imported record.</p>}
            {!legacy && !row.loan_balance && !row.notice_penalty && <p className="text-sm text-slate-400 py-1.5">None</p>}
            <div className="flex justify-between py-2 mt-1 bg-red-50 rounded-xl px-3">
              <span className="font-bold text-sm text-red-800">Total Deductions</span>
              <span className="font-bold text-sm text-red-800">– {money(row.total_deductions)}</span>
            </div>
          </div>

          {/* Net */}
          <div className="bg-slate-50 rounded-xl px-4 py-4 flex justify-between items-center">
            <span className="font-bold text-base text-slate-900">Net Payable</span>
            <span className="font-bold text-xl text-slate-900">{money(row.net_payable)}</span>
          </div>

          {/* Payment */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Payment</h3>
            <IRow label="Status" value={row.payment_status === "FnF" ? "F&F — payable" : "No F&F — nothing owed"} />
            <IRow label="Paid" value={row.is_paid
              ? `Yes · ${row.paid_by || "—"}${row.paid_at ? ` · ${new Date(row.paid_at).toLocaleDateString()}` : ""}`
              : "Not yet paid"} />
          </div>
        </div>
        <div className="px-6 pb-6"><Button onClick={() => window.print()} variant="outline" className="w-full rounded-2xl">Print</Button></div>
      </div>
    </div>
  );
}

// ─── Settlements Ledger ────────────────────────────────────────────────────
// Every processed settlement, entirely separate from the regular monthly
// payroll table (see final_settlements / loadBase in PayrollAutomation.jsx).
// Its own payable line: only F&F rows are actually owed anything -- No F&F
// is a record of zero/forfeited settlement, nothing to mark paid.
function SettlementsLedger({ role }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [monthFilter, setMonthFilter] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [marking, setMarking] = useState(null);
  const [slip, setSlip] = useState(null);
  const [err, setErr] = useState("");

  const canMarkPaid = ["Master", "Finance"].includes(role);

  async function load() {
    setLoading(true);
    const [{ data: settlements }, { data: emps }] = await Promise.all([
      supabase.from("final_settlements").select("*").order("settled_at", { ascending: false }),
      supabase.from("employees").select("employee_code, full_name"),
    ]);
    const nameByCode = Object.fromEntries((emps || []).map(e => [e.employee_code, e.full_name]));
    setRows((settlements || []).map(s => ({ ...s, employee_name: nameByCode[s.employee_code] || s.employee_code })));
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function markPaid(row) {
    setMarking(row.id); setErr("");
    try {
      const { error } = await supabase.from("final_settlements").update({
        is_paid: true, paid_at: new Date().toISOString(), paid_by: role,
      }).eq("id", row.id);
      if (error) throw error;
      await load();
    } catch (e) { setErr(e.message); }
    finally { setMarking(null); }
  }

  const filtered = useMemo(() => rows.filter(r => {
    if (monthFilter && r.payroll_month !== monthFilter) return false;
    if (branchFilter && r.branch !== branchFilter) return false;
    if (statusFilter !== "All" && r.payment_status !== statusFilter) return false;
    return true;
  }), [rows, monthFilter, branchFilter, statusFilter]);

  const branchOptions = useMemo(() => Array.from(new Set(rows.map(r => r.branch).filter(Boolean))).sort(), [rows]);

  const totals = useMemo(() => {
    const fnfRows = filtered.filter(r => r.payment_status === "FnF");
    const payable = fnfRows.reduce((s, r) => s + Number(r.net_payable || 0), 0);
    const paid = fnfRows.filter(r => r.is_paid).reduce((s, r) => s + Number(r.net_payable || 0), 0);
    return { fnfCount: fnfRows.length, payable, paid, outstanding: payable - paid };
  }, [filtered]);

  return (
    <div>
      <SettlementSlipModal row={slip} onClose={() => setSlip(null)} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {[
          ["F&F Settlements", totals.fnfCount],
          ["Total Payable", money(totals.payable)],
          ["Already Paid", money(totals.paid)],
          ["Outstanding", money(totals.outstanding)],
        ].map(([label, value]) => (
          <div key={label} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="text-xl font-bold text-slate-800">{value}</p>
          </div>
        ))}
      </div>

      {err && <div className="mb-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{err}</div>}

      <div className="flex flex-wrap gap-3 mb-4">
        <input type="month" value={monthFilter} onChange={e => setMonthFilter(e.target.value)}
          className="px-4 py-2 rounded-xl border border-slate-200 text-sm" />
        <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm">
          <option value="">All Branches</option>
          {branchOptions.map(b => <option key={b}>{b}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm">
          <option value="All">All Status</option>
          <option value="FnF">F&F</option>
          <option value="No_FnF">No F&F</option>
        </select>
      </div>

      {loading
        ? <p className="text-slate-400 text-sm">Loading settlements...</p>
        : (
          <>
          <p className="text-xs text-slate-400 mb-2">Click a row for the full settlement slip.</p>
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto overflow-y-auto max-h-[70vh]">
            <table className="w-full min-w-[1000px] text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>{["Employee", "Type", "Branch", "Department", "Last Working Day", "Month", "Status", "Net Payable", "Paid", "Action"].map(h =>
                  <th key={h} className="text-left px-4 py-3 font-medium sticky top-0 z-10 bg-slate-50 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.length === 0
                  ? <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-400">No settlements found.</td></tr>
                  : filtered.map(r => (
                    <tr key={r.id} onClick={() => setSlip(r)} className="hover:bg-slate-50 cursor-pointer">
                      <td className="px-4 py-3 font-medium">{r.employee_name} <span className="text-xs text-slate-400">({r.employee_code})</span></td>
                      <td className="px-4 py-3">
                        <Badge tone={r.separation_type === "termination" ? "yellow" : "slate"}>
                          {r.separation_type === "termination" ? "Termination" : "Resignation"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">{r.branch || "—"}</td>
                      <td className="px-4 py-3">{r.department || "—"}</td>
                      <td className="px-4 py-3">{r.last_working_day || "—"}</td>
                      <td className="px-4 py-3">{r.payroll_month}</td>
                      <td className="px-4 py-3"><Badge tone={r.payment_status === "FnF" ? "blue" : "red"}>{r.payment_status === "FnF" ? "F&F" : "No F&F"}</Badge></td>
                      <td className="px-4 py-3 font-semibold">{money(r.net_payable)}</td>
                      <td className="px-4 py-3">
                        {r.is_paid ? <Badge tone="green">Paid</Badge> : <span className="text-slate-400 text-xs">Unpaid</span>}
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        {r.payment_status === "FnF" && !r.is_paid && canMarkPaid && (
                          <Button onClick={() => markPaid(r)} disabled={marking === r.id} className="rounded-lg text-xs py-1 px-2">
                            {marking === r.id ? "Marking…" : "Mark Paid"}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          </>
        )}
    </div>
  );
}

export default function FinalSettlement({ role }) {
  const [innerTab, setInnerTab] = useState("process");
  const [employees, setEmployees] = useState([]);
  const [selEmp, setSelEmp] = useState(null);
  const [sepType, setSepType] = useState("resignation"); // "resignation" | "termination"
  const [resignDate, setResignDate] = useState("");      // resignation date OR termination date
  const [lastDay, setLastDay] = useState("");
  const [resignReason, setResignReason] = useState("");
  const [attendanceData, setAttendanceData] = useState([]);
  const [calc, setCalc] = useState(null);
  const [calcLoading, setCalcLoading] = useState(false);
  const [calcKeyDone, setCalcKeyDone] = useState(null); // input signature the figures on screen were built from
  const [refreshTick, setRefreshTick] = useState(0);    // manual Recalculate
  const [processing, setProcessing] = useState(false);
  const [overrideMode, setOverrideMode] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [payoutMode, setPayoutMode] = useState("worked");
  const [customDays, setCustomDays] = useState("");
  const [salaryNotPayable, setSalaryNotPayable] = useState(false); // termination only
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const isTermination = sepType === "termination";

  function resetForm() {
    setSelEmp(null); setSepType("resignation");
    setResignDate(""); setLastDay(""); setResignReason("");
    setAttendanceData([]); setCalc(null); setCalcKeyDone(null);
    setOverrideMode(false); setOverrideReason("");
    setPayoutMode("worked"); setCustomDays(""); setSalaryNotPayable(false);
  }

  // select("*") deliberately: the settlement now runs the real payroll engine,
  // which reads a dozen fields off the employee row (exemptions, eligibility
  // group, EOBI, tenure dates...), not just the handful the picker shows.
  useEffect(() => {
    supabase.from("employees").select("*").order("full_name")
      .then(({ data }) => setEmployees(data || []));
  }, []);

  const noticeRequired = useMemo(() => {
    if (!selEmp) return 0;
    return NOTICE_CALENDAR_DAYS[selEmp.staff_level] || NOTICE_CALENDAR_DAYS["Non-Management"];
  }, [selEmp]);

  const noticeDaysServed = useMemo(() => calendarDaysBetween(resignDate, lastDay), [resignDate, lastDay]);
  const noticeRemaining = Math.max(0, noticeRequired - noticeDaysServed);
  const noticeComplete = noticeDaysServed >= noticeRequired;
  const customDaysNum = Math.max(0, Math.min(62, Math.round(Number(customDays) || 0)));

  // Termination is employer-initiated: no short-notice penalty ever.
  const noticePenalty = (!isTermination && !noticeComplete && !overrideMode)
    ? Number(selEmp?.salary || 0) : 0;

  // A fixed number of paid days replaces the engine's month totals. Used by
  // the Master payout override and by "salary not payable" on a termination.
  const paidDaysOverride = useMemo(() => {
    if (isTermination) return salaryNotPayable ? 0 : null;
    if (!overrideMode) return null;
    if (payoutMode === "full_period") return noticeRequired;
    if (payoutMode === "custom") return customDaysNum;
    return null;
  }, [isTermination, salaryNotPayable, overrideMode, payoutMode, noticeRequired, customDaysNum]);

  // Everything the settlement figures actually depend on, as one signature.
  // Comparing it against calcKeyDone is what tells us the numbers on screen
  // no longer match the form -- previously a date edit that didn't happen to
  // flip the notice penalty left last run's figures sitting there looking
  // current, with no way to force a recalculation.
  const calcKey = useMemo(
    () => JSON.stringify([selEmp?.employee_code || null, sepType, lastDay, noticePenalty, paidDaysOverride]),
    [selEmp?.employee_code, sepType, lastDay, noticePenalty, paidDaysOverride]
  );
  const calcStale = !!calc && calcKeyDone !== null && calcKeyDone !== calcKey;

  // The settlement itself. Resolves the real unpaid window (paid-through
  // watermark -> last working day) and runs the regular payroll engine over
  // every month in it, so the leaver's final months cost exactly what they
  // would have if they'd stayed.
  //
  // Debounced: a <input type="date"> fires onChange on every keystroke while
  // a date is being typed, and each run costs a full payroll pass per month
  // in the window. Without the delay, typing one date queued half a dozen
  // of them and the panel sat spinning long after the form had settled.
  useEffect(() => {
    if (!selEmp || !lastDay || !/^\d{4}-\d{2}-\d{2}$/.test(lastDay)) {
      setCalc(null); setCalcKeyDone(null); return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setCalcLoading(true); setErr("");
      buildSettlement({
        employee: selEmp,
        separationType: sepType,
        lastWorkingDay: lastDay,
        noticePenalty,
        paidDaysOverride,
      })
        .then(r => { if (!cancelled) { setCalc(r); setCalcKeyDone(calcKey); } })
        .catch(e => { if (!cancelled) { setErr(e.message); setCalc(null); setCalcKeyDone(null); } })
        .finally(() => { if (!cancelled) setCalcLoading(false); });
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calcKey, refreshTick]);

  // Attendance over the resolved window, only for the absconding check.
  useEffect(() => {
    if (!selEmp || !calc?.windowStart || !calc?.windowEnd) { setAttendanceData([]); return; }
    supabase.from("attendance").select("attendance_status, work_date")
      .eq("employee_code", selEmp.employee_code)
      .gte("work_date", calc.windowStart).lte("work_date", calc.windowEnd)
      .order("work_date")
      .then(({ data }) => setAttendanceData(data || []));
  }, [selEmp, calc?.windowStart, calc?.windowEnd]);

  const isAbsconding = useMemo(() => {
    if (isTermination) return false;
    const sorted = [...attendanceData].sort((a, b) => b.work_date?.localeCompare(a.work_date));
    let consecutive = 0;
    for (const a of sorted) {
      if ((a.attendance_status || "") === "Absent") {
        consecutive++;
        if (consecutive >= 7) return true;
      } else consecutive = 0;
    }
    return false;
  }, [attendanceData, isTermination]);

  const blocked = !isTermination && isAbsconding && !overrideMode;

  async function processSettlement() {
    const dateLabel = isTermination ? "termination" : "resignation";
    if (!selEmp || !resignDate || !lastDay) return setErr(`Complete all ${dateLabel} details first.`);
    if (isTermination && lastDay > resignDate) return setErr("Last working day must be on or before the termination date.");
    if (!isTermination && lastDay < resignDate) return setErr("Last working day cannot be before the resignation date.");
    if (!isTermination && isAbsconding && !overrideMode) return setErr("Cannot process: absconding case. Master override required.");
    if (!isTermination && overrideMode && payoutMode === "custom" && !customDays.trim()) return setErr("Enter the number of days to pay for the custom payout.");
    if (!calc) return setErr("Settlement is still being calculated.");
    setErr(""); setProcessing(true);

    // One RPC, one transaction. Zeroing leave, clearing the leftover payroll
    // rows, flipping the employee's status and writing the settlement used to
    // be four separate calls from here -- a failure part-way through left the
    // employee out of payroll with nothing to pay them from.
    const payload = {
      employee_code: selEmp.employee_code,
      payroll_month: lastDay.slice(0, 7),
      separation_type: sepType,
      resignation_date: isTermination ? null : resignDate,
      termination_date: isTermination ? resignDate : null,
      last_working_day: lastDay,
      resignation_reason: resignReason || null,
      staff_level: selEmp.staff_level, branch: selEmp.branch, department: selEmp.department,
      salary: Number(selEmp.salary || 0), daily_rate: calc.dailyRate,
      days_present: calc.daysPresent, weekly_offs: calc.weeklyOffs,
      absent_days: calc.absentDays, paid_days: calc.paidDays,
      pending_salary: calc.pendingSalary, leave_encashment: 0,
      loan_balance: calc.loanClosingBalance,
      salary_payable: isTermination ? !salaryNotPayable : true,
      payout_mode: paidDaysOverride != null ? payoutMode : "worked",
      payout_days: calc.paidDays,
      notice_required_days: isTermination ? null : noticeRequired,
      notice_served_days: isTermination ? null : noticeDaysServed,
      notice_complete: isTermination ? true : noticeComplete,
      notice_penalty: noticePenalty,
      is_absconding: isAbsconding,
      override_applied: !isTermination && overrideMode,
      override_by: (!isTermination && overrideMode) ? (role || "Master") : null,
      override_reason: (!isTermination && overrideMode) ? overrideReason : null,
      settled_through_month: calc.settledThrough,
      window_start: calc.windowStart, window_end: calc.windowEnd,
      released_hold_amount: calc.releasedHold,
      recoverable_at_exit: calc.recoverableAtExit,
      gross_earnings: calc.grossEarnings,
      total_deductions: calc.totalDeductions,
      net_payable: calc.cashPayable,
      payment_status: calc.paymentStatus,
      lines: calc.lines,
    };

    try {
      await processFinalSettlement(payload);
    } catch (e) {
      setProcessing(false);
      return setErr(e.message || "Could not process the settlement.");
    }

    setProcessing(false);
    const extra = calc.recoverableAtExit > 0 ? ` (plus ${money(calc.recoverableAtExit)} recoverable at exit)` : "";
    const label = isTermination ? "Termination" : "Settlement";
    const fnf = calc.paymentStatus === "FnF" ? "F&F" : "No F&F";
    setMsg(`${label} processed for ${selEmp.full_name}. Payable: ${money(calc.cashPayable)}${extra}. Recorded as ${fnf} covering ${calc.months.join(", ")}, removed from regular payroll.`);
    resetForm();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const dateFieldLabel = isTermination ? "Termination Date" : "Resignation Date";
  const canProcess = selEmp && calc && !calcLoading && !calcStale && !blocked
    && resignDate && lastDay
    && !(isTermination && lastDay > resignDate)
    && !(!isTermination && lastDay < resignDate)
    && !(!isTermination && overrideMode && !overrideReason.trim())
    && !(!isTermination && overrideMode && payoutMode === "custom" && !customDays.trim());

  return (
    <div>
      <PageTitle title="Final Settlement" subtitle="Resignation & termination processing, notice-period validation and settlement calculator." />

      <div className="flex flex-wrap gap-2 mb-5">
        {[["process", "Process Settlement"], ["ledger", "Settlements Ledger"]].map(([k, l]) => (
          <button key={k} onClick={() => setInnerTab(k)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${innerTab === k ? "bg-slate-950 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            {l}
          </button>
        ))}
      </div>

      {innerTab === "ledger" ? <SettlementsLedger role={role} /> : (
      <>
      {msg && <div className="mb-3 p-3 rounded-xl bg-blue-50 text-blue-700 text-sm">{msg}</div>}
      {err && <div className="mb-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{err}</div>}

      {/* Separation type */}
      <div className="flex flex-wrap gap-2 mb-4">
        <span className="text-xs text-slate-500 self-center mr-1">Separation type:</span>
        {[["resignation", "Resignation"], ["termination", "Termination"]].map(([k, l]) => (
          <button key={k}
            onClick={() => { setSepType(k); setOverrideMode(false); setPayoutMode("worked"); setCustomDays(""); setSalaryNotPayable(false); setAttendanceData([]); }}
            className={`px-4 py-1.5 rounded-xl text-sm font-medium transition ${sepType === k ? "bg-slate-950 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            {l}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Separation Form */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
          <h2 className="font-bold text-slate-800 mb-4">{isTermination ? "Termination Details" : "Resignation Details"}</h2>
          <div className="space-y-4">
            <div>
              <p className="text-xs text-slate-500 mb-1">Employee</p>
              <EmpPicker employees={employees} value={selEmp}
                onChange={v => { setSelEmp(v); setOverrideMode(false); setPayoutMode("worked"); setCustomDays(""); setSalaryNotPayable(false); setAttendanceData([]); }} />
            </div>
            {selEmp && (
              <div className="p-3 bg-slate-50 rounded-xl text-sm text-slate-600">
                {selEmp.department} · {selEmp.branch} · <strong>{selEmp.staff_level}</strong> · {money(selEmp.salary)}/month
              </div>
            )}
            <div>
              <p className="text-xs text-slate-500 mb-1">{dateFieldLabel}</p>
              <input type="date" value={resignDate} onChange={e => setResignDate(e.target.value)}
                className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Last Working Day{isTermination ? " (on or before termination date)" : ""}</p>
              <input type="date" value={lastDay} onChange={e => setLastDay(e.target.value)}
                max={isTermination ? (resignDate || undefined) : undefined}
                className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Reason</p>
              <textarea value={resignReason} onChange={e => setResignReason(e.target.value)} rows={2}
                className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm resize-none" />
            </div>
            {isTermination && (
              <label className="flex items-start gap-2 p-3 rounded-xl bg-slate-50 cursor-pointer">
                <input type="checkbox" className="mt-0.5" checked={salaryNotPayable} onChange={e => setSalaryNotPayable(e.target.checked)} />
                <span className="text-sm text-slate-700">
                  <strong>Salary not payable</strong> for the final period
                  <span className="block text-xs text-slate-500">Leave unticked to pay for the days worked up to the last working day (default).</span>
                </span>
              </label>
            )}
          </div>
        </div>

        {/* Right panel: notice analysis (resignation) or termination summary */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
          <h2 className="font-bold text-slate-800 mb-4">{isTermination ? "Termination Summary" : "Notice Period Analysis"}</h2>
          {!selEmp
            ? <p className="text-slate-400 text-sm">Select an employee to see details.</p>
            : isTermination ? (
              <div className="space-y-3">
                <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-500">
                  Employer-initiated. No notice period or short-notice penalty applies. Salary is payable by
                  default for the days worked up to the last working day.
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Termination Date</span>
                  <span className="font-semibold">{resignDate || "—"}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Last Working Day</span>
                  <span className="font-semibold">{lastDay || "—"}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Salary Payable</span>
                  <Badge tone={salaryNotPayable ? "red" : "green"}>{salaryNotPayable ? "No — withheld" : "Yes"}</Badge>
                </div>
                {lastDay && resignDate && lastDay > resignDate && (
                  <div className="p-3 bg-red-50 rounded-xl text-sm text-red-700">
                    Last working day is after the termination date.
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-500">
                  Calendar days counted from resignation date to last working day (inclusive). No day exclusions.
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Required Notice (calendar days)</span>
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
                    Notice period incomplete. Short notice penalty = 1 month salary unless Master overrides.
                  </div>
                )}
                {role === "Master" && (isAbsconding || !noticeComplete) && (
                  <div className="border border-slate-200 rounded-xl p-3 space-y-3">
                    <div className="flex items-center gap-2">
                      <input type="checkbox" id="override" checked={overrideMode}
                        onChange={e => { setOverrideMode(e.target.checked); if (!e.target.checked) { setPayoutMode("worked"); setCustomDays(""); } }} />
                      <label htmlFor="override" className="text-sm font-semibold text-slate-700">Master Override</label>
                    </div>
                    {overrideMode && (
                      <>
                        <input value={overrideReason} onChange={e => setOverrideReason(e.target.value)}
                          placeholder="Override reason (mandatory)..." className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
                        <div className="space-y-1.5">
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Salary payout</p>
                          {Object.entries(PAYOUT_MODE_LABELS).map(([k, l]) => (
                            <label key={k} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                              <input type="radio" name="payoutMode" checked={payoutMode === k} onChange={() => setPayoutMode(k)} />
                              {l}
                            </label>
                          ))}
                          {payoutMode === "full_period" && (
                            <p className="text-xs text-slate-500 pl-6">Pays {noticeRequired} days (the full required notice period), regardless of the actual last working day.</p>
                          )}
                          {payoutMode === "custom" && (
                            <div className="pl-6 flex items-center gap-2">
                              <input type="number" min="0" max="62" value={customDays}
                                onChange={e => setCustomDays(e.target.value)}
                                className="w-24 px-3 py-1.5 rounded-lg border border-slate-200 text-sm" />
                              <span className="text-xs text-slate-500">days to pay ({money(calc?.dailyRate || 0)}/day)</span>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
        </div>
      </div>

      {selEmp && lastDay && (
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm mb-4">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="font-bold text-slate-800">Settlement Calculator</h2>
            <div className="flex items-center gap-3">
              {calcLoading
                ? <span className="text-xs text-slate-400">Recalculating…</span>
                : calcStale
                ? <span className="text-xs text-amber-600 font-medium">Details changed — figures below are out of date.</span>
                : calc ? <span className="text-xs text-emerald-600">Up to date</span> : null}
              <Button variant="outline" disabled={calcLoading} className="rounded-xl text-xs"
                onClick={() => setRefreshTick(t => t + 1)}>
                {calcLoading ? "Calculating…" : "Recalculate"}
              </Button>
            </div>
          </div>
          {blocked
            ? <div className="p-4 bg-red-50 rounded-xl text-red-700">Settlement blocked. Master must approve to proceed.</div>
            : !calc
            ? <div className="p-4 bg-slate-50 rounded-xl text-slate-500 text-sm">
                {calcLoading ? `Working out what ${selEmp.full_name} is owed…` : "Enter the separation details, then press Recalculate."}
              </div>
            : (
              <div className={`space-y-4 ${calcLoading || calcStale ? "opacity-50" : ""}`}>
                {/* What period is actually being paid, and why */}
                <div className="bg-blue-50 rounded-xl p-4">
                  <h3 className="text-xs font-semibold text-blue-500 uppercase tracking-wider mb-2">Unpaid Period</h3>
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                    <span><span className="text-slate-500">Paid up to:</span> <strong>{calc.settledThrough || "—"}</strong></span>
                    <span><span className="text-slate-500">Settling:</span> <strong>{calc.windowStart} → {calc.windowEnd}</strong></span>
                    <span><span className="text-slate-500">Months:</span> <strong>{calc.months.length ? calc.months.join(", ") : "none"}</strong></span>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    Each month is costed by the regular payroll engine, so the figures match what
                    payroll would have paid — including exemptions, half days, overtime, EOBI and tax.
                  </p>
                  {calc.notes.map((n, i) => (
                    <p key={i} className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-1.5 mt-2">{n}</p>
                  ))}
                </div>

                {/* Per-month breakdown */}
                {calc.monthLines.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[620px]">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>{["Month", "Present", "Weekly Off", "Absent", "Earnings", "Deductions", "Net"].map(h => (
                          <th key={h} className={`px-3 py-2 font-medium ${h === "Month" ? "text-left" : "text-right"}`}>{h}</th>
                        ))}</tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {calc.monthLines.map(l => (
                          <tr key={l.payroll_month}>
                            <td className="px-3 py-2 font-medium">{l.payroll_month}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{l.present_days}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{l.weekly_offs}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{l.absent_days}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-emerald-600">{money(l.gross)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-red-500">{money(l.deductions)}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-semibold">{money(l.net)}</td>
                          </tr>
                        ))}
                        {calc.holdLines.map(l => (
                          <tr key={`hold-${l.payroll_month}`} className="bg-amber-50/40">
                            <td className="px-3 py-2 font-medium">{l.payroll_month} <span className="text-xs text-amber-700">held salary</span></td>
                            <td className="px-3 py-2" colSpan={3} />
                            <td className="px-3 py-2 text-right tabular-nums text-emerald-600">{money(l.gross)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-300">—</td>
                            <td className="px-3 py-2 text-right tabular-nums font-semibold">{money(l.net)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2.5 text-sm">
                    <h3 className="font-semibold text-slate-700 mb-2">Earnings</h3>
                    <div className="flex justify-between">
                      <span className="text-slate-500">
                        {paidDaysOverride != null
                          ? `Salary (${calc.paidDays} paid days × ${money(calc.dailyRate)})`
                          : `Unpaid months (${calc.months.length || 0})`}
                      </span>
                      <span className="text-emerald-600">{money(calc.pendingSalary)}</span>
                    </div>
                    {calc.releasedHold > 0 && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Held salary released</span>
                        <span className="text-emerald-600">{money(calc.releasedHold)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-slate-500">Leave Encashment</span>
                      <span className="text-slate-400">Rs. 0 (forfeited on exit)</span>
                    </div>
                    <div className="flex justify-between font-semibold border-t border-slate-100 pt-2">
                      <span>Gross Earnings</span><span>{money(calc.grossEarnings)}</span>
                    </div>
                  </div>
                  <div className="space-y-2.5 text-sm">
                    <h3 className="font-semibold text-slate-700 mb-2">Deductions</h3>
                    {paidDaysOverride == null && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Monthly deductions (loans, fines, tax, EOBI…)</span>
                        <span className="text-red-500">{money(calc.monthLines.reduce((s, l) => s + l.deductions, 0))}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-slate-500">
                        Loan balance at exit
                        {calc.installmentsTaken > 0 && (
                          <span className="block text-xs text-slate-400">
                            {money(calc.loanOutstanding)} outstanding − {money(calc.installmentsTaken)} already taken above
                          </span>
                        )}
                      </span>
                      <span className="text-red-500">{money(calc.loanClosingBalance)}</span>
                    </div>
                    {calc.advanceResidual > 0 && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Unrecovered advances</span>
                        <span className="text-red-500">{money(calc.advanceResidual)}</span>
                      </div>
                    )}
                    {!isTermination && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Short Notice Penalty</span>
                        <span className="text-red-500">{money(noticePenalty)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-semibold border-t border-slate-100 pt-2">
                      <span>Total Deductions</span><span className="text-red-500">{money(calc.totalDeductions)}</span>
                    </div>
                  </div>
                  <div className="md:col-span-2 bg-slate-50 rounded-2xl p-4 flex justify-between items-center">
                    <div>
                      <span className="text-lg font-bold text-slate-800 mr-2">Net Payable</span>
                      <Badge tone={calc.paymentStatus === "FnF" ? "blue" : "red"}>
                        {calc.paymentStatus === "FnF" ? "F&F" : "No F&F"}
                      </Badge>
                    </div>
                    <span className="text-2xl font-bold text-emerald-600">{money(calc.cashPayable)}</span>
                  </div>
                  {calc.recoverableAtExit > 0 && (
                    <div className="md:col-span-2 p-3 rounded-xl bg-amber-50 text-amber-800 text-sm">
                      Deductions exceed what is owed by <strong>{money(calc.recoverableAtExit)}</strong>. Nothing is
                      paid out, and this stays on record as recoverable at exit — the loan is not written off
                      automatically.
                    </div>
                  )}
                </div>
              </div>
            )}
          <div className="mt-4">
            <Button onClick={processSettlement} className="rounded-2xl" disabled={!canProcess || processing}>
              {processing ? "Processing…" : isTermination ? "Process Termination" : "Process Settlement"}
            </Button>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}
