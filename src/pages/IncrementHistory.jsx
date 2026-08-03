import React, { useState, useEffect, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../lib/supabaseClient.js";
import { Button, Badge, PageTitle } from "../components/ui.jsx";
import { money, formatMonthYear } from "../utils/format.js";
import { BRANCH_CODE_MAP } from "../constants/branches.js";
import { fetchActiveConfidentialIncentives } from "../services/payrollControlService.js";
import { proposeIncrement } from "../services/incrementService.js";

// ── helpers ──────────────────────────────────────────────────────────────────

function excelSerialToDate(val) {
  if (!val) return null;
  if (typeof val === "string") {
    const t = val.trim();
    if (!t) return null;
    // already ISO date or datetime
    if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
    // dd/mm/yyyy or mm/dd/yyyy
    if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/.test(t)) {
      const parts = t.split(/[\/\-]/);
      return `${parts[2]}-${parts[1].padStart(2,"0")}-${parts[0].padStart(2,"0")}`;
    }
    return t;
  }
  if (typeof val === "number") {
    const d = new Date((val - 25569) * 86400 * 1000);
    return d.toISOString().slice(0, 10);
  }
  return null;
}

function normalizeHeader(v) {
  return String(v || "").trim().toLowerCase().replace(/[\s\-\.\/]+/g, "_");
}

function downloadIncrementTemplate() {
  const rows = [{
    employee_code: "1001",
    employee_name: "Ali Raza",
    old_salary: 42000,
    new_salary: 46000,
    effective_from: "2025-11-01",
    increment_amount: 4000,
    increment_percentage: 9.52,
    type: "Increment",
    status: "Approved",
    submitted_by: "HR",
  }];
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Increments");
  XLSX.writeFile(wb, "salary_increments_template.xlsx");
}

// ── EmpPicker ─────────────────────────────────────────────────────────────────

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
    return employees.filter(e => e.full_name?.toLowerCase().includes(lq) || String(e.employee_code).toLowerCase().includes(lq)).slice(0, 10);
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
              <span className="text-xs text-slate-400 ml-2">{money(e.salary)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Import Panel ──────────────────────────────────────────────────────────────

function ImportPanel({ employees, onDone }) {
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState(null);
  const inputRef = useRef(null);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setSummary(null);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array", cellDates: false });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: true, header: 1 });

      // auto-detect header row: row 0 or row 3 (index)
      let headerRowIdx = 0;
      const firstRowNorm = (raw[0] || []).map(normalizeHeader);
      if (!firstRowNorm.includes("employee_code")) {
        for (let i = 1; i < Math.min(6, raw.length); i++) {
          if ((raw[i] || []).map(normalizeHeader).includes("employee_code")) {
            headerRowIdx = i;
            break;
          }
        }
      }
      const headers = (raw[headerRowIdx] || []).map(normalizeHeader);
      const dataRows = raw.slice(headerRowIdx + 1).filter(r => r.some(c => c !== ""));

      const empMap = {};
      employees.forEach(e => { empMap[String(e.employee_code)] = e; });

      // fetch existing combos to detect duplicates
      const { data: existing } = await supabase
        .from("salary_increments")
        .select("employee_code, effective_from");
      const existingSet = new Set((existing || []).map(r => `${r.employee_code}__${r.effective_from}`));

      const toInsert = [];
      const failed = [];
      let skippedDupes = 0;

      for (const row of dataRows) {
        const obj = {};
        headers.forEach((h, i) => { obj[h] = row[i]; });

        const code = String(obj.employee_code || "").trim();
        if (!code) continue;

        const emp = empMap[code];
        if (!emp) { failed.push(code); continue; }

        const effectiveFrom = excelSerialToDate(obj.effective_from);
        const dupeKey = `${code}__${effectiveFrom}`;
        if (existingSet.has(dupeKey)) { skippedDupes++; continue; }

        const oldSal = Number(obj.old_salary) || null;
        const newSal = Number(obj.new_salary) || null;
        const incAmt = Number(obj.increment_amount) || (oldSal && newSal ? newSal - oldSal : null);
        // Always derive from old salary + amount rather than trusting the file's percentage column,
        // which has historically contained raw ratios (0.33) instead of percentages (33.00).
        const incPct = oldSal && incAmt ? Math.round((incAmt / oldSal) * 10000) / 100 : (Number(obj.increment_percentage) || null);

        toInsert.push({
          employee_code: code,
          employee_name: obj.employee_name || emp.full_name,
          old_salary: oldSal,
          new_salary: newSal,
          effective_from: effectiveFrom,
          increment_amount: incAmt,
          increment_percentage: incPct,
          type: String(obj.type || "Increment").trim() || "Increment",
          status: "Approved",
          submitted_by: String(obj.submitted_by || "Historical Import").trim(),
          approved_by: "Historical Import",
          approved_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        });
        existingSet.add(dupeKey);
      }

      let inserted = 0;
      let synced = 0;
      if (toInsert.length > 0) {
        const { error } = await supabase.from("salary_increments").insert(toInsert);
        if (error) throw new Error(error.message);
        inserted = toInsert.length;

        // Reconcile each touched employee's live salary against their full
        // history (not just this file) — the newest Approved, non-future
        // record wins, regardless of what order the rows were imported in.
        const touchedCodes = [...new Set(toInsert.map(r => r.employee_code))];
        const syncResults = await Promise.all(
          touchedCodes.map(code => supabase.rpc("sync_employee_current_salary", { p_employee_code: code }))
        );
        synced = syncResults.filter(r => !r.error).length;
      }

      setSummary({
        total: dataRows.length,
        inserted,
        synced,
        skippedDupes,
        failed,
        preview: toInsert.slice(0, 10),
      });
      onDone();
    } catch (err) {
      setSummary({ error: err.message });
    } finally {
      setImporting(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm mb-4">
      <h3 className="font-semibold text-slate-800 mb-3">Import Increment History</h3>
      <div className="flex gap-3 items-center mb-4">
        <Button variant="outline" className="rounded-2xl" onClick={downloadIncrementTemplate}>
          Download Template
        </Button>
        <Button className="rounded-2xl" onClick={() => inputRef.current?.click()} disabled={importing}>
          {importing ? "Importing…" : "Import History (.xlsx)"}
        </Button>
        <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
      </div>

      {summary && !summary.error && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: "Total Rows", val: summary.total, color: "text-slate-700" },
              { label: "Imported", val: summary.inserted, color: "text-emerald-600" },
              { label: "Employees Synced", val: summary.synced || 0, color: "text-blue-600" },
              { label: "Skipped (Dupes)", val: summary.skippedDupes, color: "text-amber-600" },
              { label: "Failed", val: summary.failed.length, color: "text-red-600" },
            ].map(({ label, val, color }) => (
              <div key={label} className="bg-slate-50 rounded-xl p-3">
                <p className="text-xs text-slate-500">{label}</p>
                <p className={`text-xl font-bold ${color}`}>{val}</p>
              </div>
            ))}
          </div>
          {summary.failed.length > 0 && (
            <div className="p-3 rounded-xl bg-red-50 text-red-700 text-sm">
              <strong>Employee codes not found:</strong> {summary.failed.join(", ")}
            </div>
          )}
          {summary.preview.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 mb-1 font-medium">Preview (first {summary.preview.length} imported)</p>
              <div className="overflow-x-auto rounded-xl border border-slate-100">
                <table className="w-full text-xs min-w-[600px]">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>{["Code","Name","Old Salary","New Salary","Effective","Amount","Type"].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {summary.preview.map((r, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2">{r.employee_code}</td>
                        <td className="px-3 py-2">{r.employee_name}</td>
                        <td className="px-3 py-2">{money(r.old_salary)}</td>
                        <td className="px-3 py-2">{money(r.new_salary)}</td>
                        <td className="px-3 py-2">{r.effective_from}</td>
                        <td className={`px-3 py-2 font-semibold ${(r.increment_amount||0) >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {(r.increment_amount||0) >= 0 ? "+" : ""}{money(r.increment_amount)}
                        </td>
                        <td className="px-3 py-2">{r.type}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
      {summary?.error && (
        <div className="p-3 rounded-xl bg-red-50 text-red-700 text-sm">Import failed: {summary.error}</div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

const BLANK = { employee: null, prevSalary: "", newSalary: "", reason: "", approvedBy: "HR", date: new Date().toISOString().slice(0, 10), type: "Increment" };

export default function IncrementHistory({ role, actorName, actorEmployeeCode, dueFilter }) {
  const isMasterGm = ["Master", "GM"].includes(role);
  const [view, setView] = useState("monthly");
  const [employees, setEmployees] = useState([]);
  const [increments, setIncrements] = useState([]);
  const [incentivesByCode, setIncentivesByCode] = useState({});
  const [incentiveSinceByCode, setIncentiveSinceByCode] = useState({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkBranch, setBulkBranch] = useState("All");
  const [bulkDept, setBulkDept] = useState("");
  const [bulkType, setBulkType] = useState("percent");
  const [bulkValue, setBulkValue] = useState("");
  const [filterEmp, setFilterEmp] = useState("");
  const [filterMonth, setFilterMonth] = useState(new Date().toISOString().slice(0, 7));
  const [filterType, setFilterType] = useState("");
  const [monthBranchFilter, setMonthBranchFilter] = useState("");
  const [monthDeptFilter, setMonthDeptFilter] = useState("");
  const [yearFilter, setYearFilter] = useState(String(new Date().getFullYear()));
  const [dueBranchFilter, setDueBranchFilter] = useState(dueFilter?.branch || "");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (dueFilter?.view) setView(dueFilter.view);
    if (dueFilter?.branch) setDueBranchFilter(dueFilter.branch);
  }, [dueFilter]);

  async function load() {
    setLoading(true);
    const [{ data: emps }, { data: incs }] = await Promise.all([
      supabase.from("employees").select("employee_code, full_name, department, branch, salary, staff_level, status, joining_date, last_increment_date, next_increment_due").order("full_name"),
      supabase.from("salary_increments").select("*").order("effective_from", { ascending: false }),
    ]);
    setEmployees(emps || []);
    setIncrements(incs || []);
    if (isMasterGm) {
      fetchActiveConfidentialIncentives().then(rows => {
        const byCode = {};
        const sinceByCode = {};
        rows.forEach(r => {
          byCode[r.employee_code] = (byCode[r.employee_code] || 0) + Number(r.amount || 0);
          // If an employee has more than one active incentive row, show the
          // most recent effective_from as "since".
          if (!sinceByCode[r.employee_code] || r.effective_from > sinceByCode[r.employee_code]) {
            sinceByCode[r.employee_code] = r.effective_from;
          }
        });
        setIncentivesByCode(byCode);
        setIncentiveSinceByCode(sinceByCode);
      }).catch(() => { setIncentivesByCode({}); setIncentiveSinceByCode({}); });
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, [role]);

  const pct = useMemo(() => {
    if (!form.prevSalary || !form.newSalary) return 0;
    return Math.round(((Number(form.newSalary) - Number(form.prevSalary)) / Number(form.prevSalary)) * 100 * 10) / 10;
  }, [form.prevSalary, form.newSalary]);

  async function addIncrement() {
    if (!form.employee || !form.prevSalary || !form.newSalary) return setErr("Employee, previous and new salary are required.");
    if (role === "GM") return setErr("GM cannot propose increments — only approve or reject in the Approval Queue.");
    setErr("");

    if (role === "HR") {
      // HR can only propose: inserts a Pending row, no salary change until
      // Master/GM approves it via the Approval Queue.
      try {
        await proposeIncrement({
          employeeCode: String(form.employee.employee_code), employeeName: form.employee.full_name,
          oldSalary: Number(form.prevSalary), newSalary: Number(form.newSalary), effectiveFrom: form.date,
          type: form.type || "Increment", submittedByRole: "HR",
          confidentialIncentiveAtTime: incentivesByCode[form.employee.employee_code] || 0,
        });
      } catch (e) { return setErr(e.message); }
      setMsg(`Increment proposed for ${form.employee.full_name}: ${money(form.prevSalary)} → ${money(form.newSalary)} (+${pct}%). Awaiting Master/GM approval.`);
      setForm(BLANK);
      setShowForm(false);
      load();
      return;
    }

    // Master: instant-apply, same as before.
    // apply_salary_increment updates the employee's live salary and writes
    // the history row in one transaction, so the two can't drift apart.
    const { error } = await supabase.rpc("apply_salary_increment", {
      p_employee_code: String(form.employee.employee_code),
      p_new_salary: Number(form.newSalary),
      p_effective_from: form.date,
      p_type: form.type || "Increment",
      p_approved_by: form.approvedBy,
      p_submitted_by: "HR",
      p_confidential_incentive_at_time: isMasterGm ? (incentivesByCode[form.employee.employee_code] || 0) : null,
    });
    if (error) return setErr(error.message);
    setMsg(`Increment recorded for ${form.employee.full_name}: ${money(form.prevSalary)} → ${money(form.newSalary)} (+${pct}%). Employee salary updated.`);
    setForm(BLANK);
    setShowForm(false);
    load();
  }

  async function applyBulkIncrement() {
    if (role !== "Master") return setErr("Bulk increments are Master-only.");
    if (!bulkValue) return setErr("Enter increment value.");
    setErr("");
    const targets = employees.filter(e => {
      const bOk = bulkBranch === "All" || e.branch === bulkBranch;
      const dOk = !bulkDept || e.department?.toLowerCase().includes(bulkDept.toLowerCase());
      return bOk && dOk;
    });
    if (!targets.length) return setErr("No employees match the filters.");

    const today = new Date().toISOString().slice(0, 10);
    const results = await Promise.all(targets.map(emp => {
      const prev = Number(emp.salary || 0);
      const inc = bulkType === "percent" ? prev * (Number(bulkValue) / 100) : Number(bulkValue);
      const next = Math.round(prev + inc);
      return supabase.rpc("apply_salary_increment", {
        p_employee_code: String(emp.employee_code),
        p_new_salary: next,
        p_effective_from: today,
        p_type: "Increment",
        p_approved_by: "HR",
        p_submitted_by: "HR",
      });
    }));
    const failed = results.filter(r => r.error);
    if (failed.length) return setErr(`${failed.length} of ${targets.length} employees failed: ${failed[0].error.message}`);

    setMsg(`Bulk increment applied to ${targets.length} employees. Salaries updated.`);
    setBulkValue(""); setBulkBranch("All"); setBulkDept("");
    setShowForm(false);
    load();
  }

  const empByCode = useMemo(() => Object.fromEntries(employees.map(e => [e.employee_code, e])), [employees]);

  const filtered = useMemo(() => increments.filter(i => {
    const empOk = !filterEmp || (i.employee_name || "").toLowerCase().includes(filterEmp.toLowerCase()) || String(i.employee_code).includes(filterEmp);
    const monthOk = !filterMonth || (i.effective_from || "").startsWith(filterMonth);
    const typeOk = !filterType || i.type === filterType;
    const emp = empByCode[i.employee_code];
    const branchOk = !monthBranchFilter || emp?.branch === monthBranchFilter;
    const deptOk = !monthDeptFilter || (emp?.department || "").toLowerCase().includes(monthDeptFilter.toLowerCase());
    return empOk && monthOk && typeOk && branchOk && deptOk;
  }), [increments, filterEmp, filterMonth, filterType, monthBranchFilter, monthDeptFilter, empByCode]);

  const types = useMemo(() => [...new Set(increments.map(i => i.type).filter(Boolean))], [increments]);

  // ── Monthly view summary ──
  const monthlySummary = useMemo(() => {
    const uniqueEmployees = new Set(filtered.map(i => i.employee_code));
    const totalAmount = filtered.reduce((s, i) => s + (Number(i.increment_amount) || 0), 0);
    const pcts = filtered.map(i => Number(i.increment_percentage)).filter(p => !isNaN(p));
    const avgPct = pcts.length ? pcts.reduce((s, p) => s + p, 0) / pcts.length : 0;
    return { employeeCount: uniqueEmployees.size, totalAmount, avgPct };
  }, [filtered]);

  function exportMonthlyExcel() {
    const data = filtered.map(i => {
      const liveIncentive = incentivesByCode[i.employee_code] || 0;
      const since = incentiveSinceByCode[i.employee_code];
      const incentiveAtTime = i.confidential_incentive_at_time != null ? Number(i.confidential_incentive_at_time) : liveIncentive;
      return {
        "Emp Code": i.employee_code, Name: i.employee_name, Branch: empByCode[i.employee_code]?.branch || "",
        Department: empByCode[i.employee_code]?.department || "", "Effective Month": formatMonthYear(i.effective_from),
        "Old Salary": i.old_salary, "New Salary": i.new_salary, "Increment Amount": i.increment_amount,
        "Increment %": i.increment_percentage, "Given By": i.submitted_by, Status: i.status,
        ...(isMasterGm ? {
          "Monthly Incentive": liveIncentive > 0 ? liveIncentive : "",
          "Incentive Since": since ? formatMonthYear(since) : "",
          "Total Effective Comp.": Number(i.old_salary || 0) + incentiveAtTime,
        } : {}),
      };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Monthly Increments");
    XLSX.writeFile(wb, `increments_monthly_${filterMonth || "all"}.xlsx`);
  }

  // ── Yearly view pivot ──
  const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const yearlyPivot = useMemo(() => {
    const byEmp = {};
    increments.forEach(i => {
      if (!i.effective_from || !i.effective_from.startsWith(yearFilter)) return;
      const monthIdx = Number(i.effective_from.slice(5, 7)) - 1;
      if (monthIdx < 0 || monthIdx > 11) return;
      if (!byEmp[i.employee_code]) {
        const emp = empByCode[i.employee_code];
        byEmp[i.employee_code] = {
          employee_code: i.employee_code, employee_name: i.employee_name,
          branch: emp?.branch || "—", department: emp?.department || "—",
          months: Array(12).fill(0), totalIncrements: 0, totalAmount: 0,
        };
      }
      const row = byEmp[i.employee_code];
      row.months[monthIdx] += Number(i.increment_amount) || 0;
      row.totalIncrements += 1;
      row.totalAmount += Number(i.increment_amount) || 0;
    });
    return Object.values(byEmp).sort((a, b) => (a.employee_name || "").localeCompare(b.employee_name || ""));
  }, [increments, yearFilter, empByCode]);

  const yearlySummary = useMemo(() => {
    const monthTotals = Array(12).fill(0);
    let totalAmount = 0;
    yearlyPivot.forEach(row => { row.months.forEach((amt, i) => { monthTotals[i] += amt; }); totalAmount += row.totalAmount; });
    let bestMonth = 0;
    monthTotals.forEach((amt, i) => { if (amt > monthTotals[bestMonth]) bestMonth = i; });
    return { employeeCount: yearlyPivot.length, totalAmount, bestMonthLabel: monthTotals[bestMonth] > 0 ? MONTH_LABELS[bestMonth] : "—" };
  }, [yearlyPivot]);

  function exportYearlyExcel() {
    const data = yearlyPivot.map(row => {
      const obj = { "Emp Code": row.employee_code, Name: row.employee_name, Branch: row.branch, Department: row.department };
      MONTH_LABELS.forEach((label, i) => { obj[label] = row.months[i] > 0 ? row.months[i] : ""; });
      obj["Total Increments"] = row.totalIncrements;
      obj["Total Amount"] = row.totalAmount;
      return obj;
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Increments ${yearFilter}`);
    XLSX.writeFile(wb, `increments_yearly_${yearFilter}.xlsx`);
  }

  // ── Due for Increment view ──
  const lastIncrementByCode = useMemo(() => {
    const map = {};
    // increments is already sorted effective_from desc, so first hit per
    // employee_code is their most recent record.
    increments.forEach(i => { if (!map[i.employee_code]) map[i.employee_code] = i; });
    return map;
  }, [increments]);

  const dueList = useMemo(() => {
    const today = new Date();
    const cutoff = new Date(today.getTime() + 60 * 86400000);
    return employees
      .filter(e => e.status === "Active" && e.next_increment_due && new Date(e.next_increment_due) <= cutoff)
      .filter(e => !dueBranchFilter || e.branch === dueBranchFilter)
      .map(e => {
        const dueDate = new Date(e.next_increment_due);
        const diffDays = Math.round((dueDate - today) / 86400000);
        const bucket = diffDays < 0 ? "overdue" : diffDays <= 30 ? "thisMonth" : "nextMonth";
        const last = lastIncrementByCode[e.employee_code];
        return { ...e, diffDays, bucket, lastIncrementAmount: last?.increment_amount ?? null };
      })
      .sort((a, b) => a.diffDays - b.diffDays);
  }, [employees, dueBranchFilter, lastIncrementByCode]);

  const dueSummary = useMemo(() => ({
    overdue: dueList.filter(e => e.bucket === "overdue").length,
    thisMonth: dueList.filter(e => e.bucket === "thisMonth").length,
    nextMonth: dueList.filter(e => e.bucket === "nextMonth").length,
  }), [dueList]);

  return (
    <div>
      <PageTitle
        title="Salary Increments"
        subtitle="Track all salary changes with full history."
        action={
          view === "monthly" ? (
            <div className="flex gap-2">
              <Button variant="outline" className="rounded-2xl" onClick={() => { setShowImport(s => !s); setShowForm(false); }}>
                {showImport ? "Close Import" : "Import History"}
              </Button>
              {role !== "GM" && (
                <Button className="rounded-2xl" onClick={() => { setShowForm(s => !s); setShowImport(false); }}>
                  {showForm ? "Cancel" : role === "HR" ? "+ Propose Increment" : "+ Add Increment"}
                </Button>
              )}
            </div>
          ) : null
        }
      />

      <div className="flex flex-wrap gap-2 mb-5">
        {[["monthly", "Monthly View"], ["yearly", "Yearly View"], ["due", "Due for Increment"]].map(([k, l]) => (
          <button key={k} onClick={() => setView(k)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${view === k ? "bg-slate-950 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            {l}
            {k === "due" && dueSummary.overdue > 0 && <span className="ml-1.5 bg-red-500 text-white text-[10px] rounded-full px-1.5">{dueSummary.overdue}</span>}
          </button>
        ))}
      </div>

      {msg && <div className="mb-3 p-3 rounded-xl bg-blue-50 text-blue-700 text-sm">{msg}</div>}
      {err && <div className="mb-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{err}</div>}

      {view === "monthly" && (
      <>
      {/* Import Panel */}
      {showImport && <ImportPanel employees={employees} onDone={() => { load(); setShowImport(false); }} />}

      {/* Add Form */}
      {showForm && (
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm mb-4">
          <div className="flex gap-3 mb-4">
            <button onClick={() => setBulkMode(false)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition ${!bulkMode ? "bg-slate-950 text-white" : "bg-white border border-slate-200 text-slate-600"}`}>
              Individual
            </button>
            {role === "Master" && (
              <button onClick={() => setBulkMode(true)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition ${bulkMode ? "bg-slate-950 text-white" : "bg-white border border-slate-200 text-slate-600"}`}>
                Bulk by Dept/Branch
              </button>
            )}
          </div>
          {role === "HR" && (
            <p className="text-xs text-amber-600 mb-3">Bulk increments apply instantly and are Master-only. Individual increments you submit go to Master/GM for approval.</p>
          )}

          {!bulkMode ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <p className="text-xs text-slate-500 mb-1">Employee</p>
                <EmpPicker employees={employees} value={form.employee}
                  onChange={v => setForm(f => ({ ...f, employee: v, prevSalary: String(v?.salary || "") }))} />
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Previous Salary</p>
                <input type="number" value={form.prevSalary} onChange={e => setForm(f => ({ ...f, prevSalary: e.target.value }))}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">New Salary</p>
                <input type="number" value={form.newSalary} onChange={e => setForm(f => ({ ...f, newSalary: e.target.value }))}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
              </div>
              {pct !== 0 && (
                <div className="md:col-span-2 p-3 bg-slate-50 rounded-xl text-sm text-slate-600">
                  Increment: <strong className={pct >= 0 ? "text-emerald-600" : "text-red-600"}>{pct >= 0 ? "+" : ""}{pct}% ({money(Number(form.newSalary) - Number(form.prevSalary))})</strong>
                </div>
              )}
              <div>
                <p className="text-xs text-slate-500 mb-1">Effective Date</p>
                <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Type</p>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm">
                  <option>Increment</option>
                  <option>Downward Revision</option>
                  <option>Promotion</option>
                  <option>Probation Completion</option>
                </select>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Approved By</p>
                <input value={form.approvedBy} onChange={e => setForm(f => ({ ...f, approvedBy: e.target.value }))}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
              </div>
              <div className="md:col-span-2 flex gap-2">
                <Button onClick={addIncrement} className="rounded-2xl">{role === "HR" ? "Submit for Approval" : "Save Increment"}</Button>
                <Button variant="outline" onClick={() => setShowForm(false)} className="rounded-2xl">Cancel</Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-slate-500 mb-1">Branch</p>
                <select value={bulkBranch} onChange={e => setBulkBranch(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm">
                  <option value="All">All Branches</option>
                  {Object.keys(BRANCH_CODE_MAP).map(b => <option key={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Department (optional)</p>
                <input value={bulkDept} onChange={e => setBulkDept(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Increment Type</p>
                <select value={bulkType} onChange={e => setBulkType(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm">
                  <option value="percent">Percentage (%)</option>
                  <option value="fixed">Fixed Amount (Rs.)</option>
                </select>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">{bulkType === "percent" ? "Percentage" : "Amount (Rs.)"}</p>
                <input type="number" value={bulkValue} onChange={e => setBulkValue(e.target.value)}
                  placeholder={bulkType === "percent" ? "e.g. 10" : "e.g. 5000"}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
              </div>
              <div className="md:col-span-2 flex gap-2">
                <Button onClick={applyBulkIncrement} className="rounded-2xl">Apply Bulk Increment</Button>
                <Button variant="outline" onClick={() => setShowForm(false)} className="rounded-2xl">Cancel</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Monthly Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-slate-500">Employees Incremented{filterMonth ? ` — ${filterMonth}` : ""}</p>
          <p className="text-2xl font-bold">{monthlySummary.employeeCount}</p>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-slate-500">Total Increment Amount</p>
          <p className="text-2xl font-bold text-emerald-600">{money(monthlySummary.totalAmount)}</p>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-slate-500">Average Increment %</p>
          <p className="text-2xl font-bold">{monthlySummary.avgPct.toFixed(2)}%</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input value={filterEmp} onChange={e => setFilterEmp(e.target.value)} placeholder="Filter by employee name / code…"
          className="px-4 py-2 rounded-xl border border-slate-200 text-sm w-56" />
        <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
          className="px-4 py-2 rounded-xl border border-slate-200 text-sm" />
        <select value={monthBranchFilter} onChange={e => setMonthBranchFilter(e.target.value)}
          className="px-4 py-2 rounded-xl border border-slate-200 text-sm">
          <option value="">All Branches</option>
          {Object.keys(BRANCH_CODE_MAP).map(b => <option key={b}>{b}</option>)}
        </select>
        <input value={monthDeptFilter} onChange={e => setMonthDeptFilter(e.target.value)} placeholder="Department…"
          className="px-4 py-2 rounded-xl border border-slate-200 text-sm w-40" />
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="px-4 py-2 rounded-xl border border-slate-200 text-sm">
          <option value="">All Types</option>
          {types.map(t => <option key={t}>{t}</option>)}
        </select>
        {(filterEmp || filterMonth || filterType || monthBranchFilter || monthDeptFilter) && (
          <button onClick={() => { setFilterEmp(""); setFilterMonth(""); setFilterType(""); setMonthBranchFilter(""); setMonthDeptFilter(""); }}
            className="px-4 py-2 rounded-xl border border-slate-200 text-sm text-slate-500 hover:bg-slate-50">
            Clear Filters
          </button>
        )}
        <Button variant="outline" onClick={exportMonthlyExcel} className="rounded-xl">Export to Excel</Button>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
        <div className="px-5 pt-4 pb-2 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-slate-800">Increment History</h2>
            <p className="text-xs text-slate-400 mt-0.5">{filtered.length} records{filtered.length !== increments.length ? ` (of ${increments.length})` : ""}</p>
          </div>
        </div>
        {loading ? (
          <div className="px-5 py-10 text-center text-slate-400 text-sm">Loading…</div>
        ) : (
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                {["Emp Code", "Employee Name", "Effective Month", "Previous Salary", "New Salary", "Increment Amount", "Increment %", "Type", "Status",
                  ...(isMasterGm ? ["Monthly Incentive", "Incentive Since", "Total Effective Comp."] : [])].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0
                ? <tr><td colSpan={isMasterGm ? 12 : 9} className="px-4 py-8 text-center text-slate-400">No increment records found.</td></tr>
                : filtered.map(inc => {
                  const amt = Number(inc.increment_amount) || 0;
                  const pctV = Number(inc.increment_percentage) || 0;
                  const isPos = amt >= 0;
                  const month = inc.effective_from ? inc.effective_from.slice(0, 7) : "—";
                  const liveIncentive = incentivesByCode[inc.employee_code] || 0;
                  const incentiveAtTime = inc.confidential_incentive_at_time != null ? Number(inc.confidential_incentive_at_time) : liveIncentive;
                  return (
                    <tr key={inc.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 text-slate-500">{inc.employee_code}</td>
                      <td className="px-4 py-3 font-medium">{inc.employee_name}</td>
                      <td className="px-4 py-3">{month}</td>
                      <td className="px-4 py-3">{money(inc.old_salary)}</td>
                      <td className="px-4 py-3 font-semibold">{money(inc.new_salary)}</td>
                      <td className={`px-4 py-3 font-semibold ${isPos ? "text-emerald-600" : "text-red-600"}`}>
                        {isPos ? "+" : ""}{money(amt)}
                      </td>
                      <td className={`px-4 py-3 font-semibold ${isPos ? "text-emerald-600" : "text-red-600"}`}>
                        {isPos ? "+" : ""}{Math.abs(pctV).toFixed(2)}%
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${inc.type === "Downward Revision" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
                          {inc.type || "Increment"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={inc.status === "Approved" ? "green" : inc.status === "Pending" ? "yellow" : "red"}>
                          {inc.status || "Approved"}
                        </Badge>
                      </td>
                      {isMasterGm && (
                        <td className="px-4 py-3 text-purple-700" title="Current confidential incentive for this employee">{liveIncentive > 0 ? money(liveIncentive) : "—"}</td>
                      )}
                      {isMasterGm && (
                        <td className="px-4 py-3 text-purple-700 text-xs">{incentiveSinceByCode[inc.employee_code] ? formatMonthYear(incentiveSinceByCode[inc.employee_code]) : "—"}</td>
                      )}
                      {isMasterGm && (
                        <td className="px-4 py-3 font-semibold text-purple-800" title="Previous salary + confidential incentive at the time of this increment">
                          {money(Number(inc.old_salary || 0) + incentiveAtTime)}
                        </td>
                      )}
                    </tr>
                  );
                })}
            </tbody>
          </table>
        )}
      </div>
      </>
      )}

      {view === "yearly" && (
        <div>
          <div className="flex flex-wrap gap-3 mb-4 items-center">
            <select value={yearFilter} onChange={e => setYearFilter(e.target.value)}
              className="px-4 py-2 rounded-xl border border-slate-200 text-sm">
              {Array.from({ length: 7 }, (_, i) => String(new Date().getFullYear() - i)).map(y => <option key={y}>{y}</option>)}
            </select>
            <Button variant="outline" onClick={exportYearlyExcel} className="rounded-xl">Export to Excel</Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
              <p className="text-xs text-slate-500">Employees Incremented in {yearFilter}</p>
              <p className="text-2xl font-bold">{yearlySummary.employeeCount}</p>
            </div>
            <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
              <p className="text-xs text-slate-500">Total Amount Distributed</p>
              <p className="text-2xl font-bold text-emerald-600">{money(yearlySummary.totalAmount)}</p>
            </div>
            <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
              <p className="text-xs text-slate-500">Month with Most Increments</p>
              <p className="text-2xl font-bold">{yearlySummary.bestMonthLabel}</p>
            </div>
          </div>

          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
            <div className="px-5 pt-4 pb-2"><h2 className="font-bold text-slate-800">Yearly Increment Grid — {yearFilter}</h2></div>
            <table className="w-full min-w-[1400px] text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  {["Employee", "Branch", "Department", ...MONTH_LABELS, "Total Increments", "Total Amount"].map(h => (
                    <th key={h} className="text-left px-3 py-3 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {yearlyPivot.length === 0
                  ? <tr><td colSpan={17} className="px-4 py-8 text-center text-slate-400">No increments recorded in {yearFilter}.</td></tr>
                  : yearlyPivot.map(row => (
                    <tr key={row.employee_code} className="hover:bg-slate-50/50">
                      <td className="px-3 py-3 font-medium whitespace-nowrap">{row.employee_name}<div className="text-xs text-slate-400">{row.employee_code}</div></td>
                      <td className="px-3 py-3 whitespace-nowrap">{row.branch}</td>
                      <td className="px-3 py-3 whitespace-nowrap">{row.department}</td>
                      {row.months.map((amt, i) => (
                        <td key={i} className={`px-3 py-3 whitespace-nowrap ${amt > 0 ? "text-emerald-600 font-semibold" : "text-slate-300"}`}>
                          {amt > 0 ? money(amt) : "—"}
                        </td>
                      ))}
                      <td className="px-3 py-3 font-semibold whitespace-nowrap">{row.totalIncrements}</td>
                      <td className="px-3 py-3 font-bold whitespace-nowrap">{money(row.totalAmount)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view === "due" && (
        <div>
          <div className="flex flex-wrap gap-3 mb-4 items-center">
            <select value={dueBranchFilter} onChange={e => setDueBranchFilter(e.target.value)}
              className="px-4 py-2 rounded-xl border border-slate-200 text-sm">
              <option value="">All Branches</option>
              {Object.keys(BRANCH_CODE_MAP).map(b => <option key={b}>{b}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="bg-white border border-red-100 rounded-2xl p-4 shadow-sm">
              <p className="text-xs text-slate-500">Overdue</p>
              <p className="text-2xl font-bold text-red-600">{dueSummary.overdue}</p>
            </div>
            <div className="bg-white border border-amber-100 rounded-2xl p-4 shadow-sm">
              <p className="text-xs text-slate-500">Due This Month</p>
              <p className="text-2xl font-bold text-amber-600">{dueSummary.thisMonth}</p>
            </div>
            <div className="bg-white border border-emerald-100 rounded-2xl p-4 shadow-sm">
              <p className="text-xs text-slate-500">Due Next Month</p>
              <p className="text-2xl font-bold text-emerald-600">{dueSummary.nextMonth}</p>
            </div>
          </div>

          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
            <div className="px-5 pt-4 pb-2"><h2 className="font-bold text-slate-800">Due for Increment</h2><p className="text-xs text-slate-400">{dueList.length} employees</p></div>
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>{["Emp Code", "Name", "Branch", "Department", "Joining Date", "Last Increment Date", "Last Increment Amount", "Next Due Date", "Days Overdue/Remaining", "Current Salary"].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dueList.length === 0
                  ? <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-400">No employees due for increment in the next 60 days.</td></tr>
                  : dueList.map(e => {
                    const toneClass = e.bucket === "overdue" ? "bg-red-50 text-red-700" : e.bucket === "thisMonth" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700";
                    const daysLabel = e.diffDays < 0 ? `${Math.abs(e.diffDays)} days overdue` : `${e.diffDays} days remaining`;
                    return (
                      <tr key={e.employee_code} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3 text-slate-500">{e.employee_code}</td>
                        <td className="px-4 py-3 font-medium">{e.full_name}</td>
                        <td className="px-4 py-3">{e.branch || "—"}</td>
                        <td className="px-4 py-3">{e.department || "—"}</td>
                        <td className="px-4 py-3">{e.joining_date || "—"}</td>
                        <td className="px-4 py-3">{e.last_increment_date || "Never"}</td>
                        <td className="px-4 py-3">{e.lastIncrementAmount != null ? money(e.lastIncrementAmount) : "—"}</td>
                        <td className="px-4 py-3">{e.next_increment_due}</td>
                        <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${toneClass}`}>{daysLabel}</span></td>
                        <td className="px-4 py-3 font-semibold">{money(e.salary)}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
