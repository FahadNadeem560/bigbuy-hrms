import React, { useState, useEffect, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../lib/supabaseClient.js";
import { Button, Badge, PageTitle } from "../components/ui.jsx";
import { money } from "../utils/format.js";
import { BRANCH_CODE_MAP } from "../constants/branches.js";

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
        const incPct = Number(obj.increment_percentage) || (oldSal && incAmt ? Math.round((incAmt / oldSal) * 10000) / 100 : null);

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
      if (toInsert.length > 0) {
        const { error } = await supabase.from("salary_increments").insert(toInsert);
        if (error) throw new Error(error.message);
        inserted = toInsert.length;
      }

      setSummary({
        total: dataRows.length,
        inserted,
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Total Rows", val: summary.total, color: "text-slate-700" },
              { label: "Imported", val: summary.inserted, color: "text-emerald-600" },
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

export default function IncrementHistory() {
  const [employees, setEmployees] = useState([]);
  const [increments, setIncrements] = useState([]);
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
  const [filterMonth, setFilterMonth] = useState("");
  const [filterType, setFilterType] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function load() {
    setLoading(true);
    const [{ data: emps }, { data: incs }] = await Promise.all([
      supabase.from("employees").select("employee_code, full_name, department, branch, salary, staff_level").order("full_name"),
      supabase.from("salary_increments").select("*").order("effective_from", { ascending: false }),
    ]);
    setEmployees(emps || []);
    setIncrements(incs || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const pct = useMemo(() => {
    if (!form.prevSalary || !form.newSalary) return 0;
    return Math.round(((Number(form.newSalary) - Number(form.prevSalary)) / Number(form.prevSalary)) * 100 * 10) / 10;
  }, [form.prevSalary, form.newSalary]);

  async function addIncrement() {
    if (!form.employee || !form.prevSalary || !form.newSalary) return setErr("Employee, previous and new salary are required.");
    setErr("");
    const amount = Number(form.newSalary) - Number(form.prevSalary);
    const { error } = await supabase.from("salary_increments").insert({
      employee_code: String(form.employee.employee_code),
      employee_name: form.employee.full_name,
      old_salary: Number(form.prevSalary),
      new_salary: Number(form.newSalary),
      effective_from: form.date,
      increment_amount: amount,
      increment_percentage: pct,
      type: form.type || "Increment",
      status: "Approved",
      submitted_by: "HR",
      approved_by: form.approvedBy,
      approved_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    });
    if (error) return setErr(error.message);
    setMsg(`Increment recorded for ${form.employee.full_name}: ${money(form.prevSalary)} → ${money(form.newSalary)} (+${pct}%)`);
    setForm(BLANK);
    setShowForm(false);
    load();
  }

  async function applyBulkIncrement() {
    if (!bulkValue) return setErr("Enter increment value.");
    setErr("");
    const targets = employees.filter(e => {
      const bOk = bulkBranch === "All" || e.branch === bulkBranch;
      const dOk = !bulkDept || e.department?.toLowerCase().includes(bulkDept.toLowerCase());
      return bOk && dOk;
    });
    const rows = targets.map(emp => {
      const prev = Number(emp.salary || 0);
      const inc = bulkType === "percent" ? prev * (Number(bulkValue) / 100) : Number(bulkValue);
      const next = Math.round(prev + inc);
      const p = prev > 0 ? Math.round((inc / prev) * 100 * 10) / 10 : 0;
      return {
        employee_code: String(emp.employee_code),
        employee_name: emp.full_name,
        old_salary: prev,
        new_salary: next,
        effective_from: new Date().toISOString().slice(0, 10),
        increment_amount: Math.round(inc),
        increment_percentage: p,
        type: "Increment",
        status: "Approved",
        submitted_by: "HR",
        approved_by: "HR",
        approved_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };
    });
    if (!rows.length) return setErr("No employees match the filters.");
    const { error } = await supabase.from("salary_increments").insert(rows);
    if (error) return setErr(error.message);
    setMsg(`Bulk increment applied to ${rows.length} employees.`);
    setBulkValue(""); setBulkBranch("All"); setBulkDept("");
    setShowForm(false);
    load();
  }

  const filtered = useMemo(() => increments.filter(i => {
    const empOk = !filterEmp || (i.employee_name || "").toLowerCase().includes(filterEmp.toLowerCase()) || String(i.employee_code).includes(filterEmp);
    const monthOk = !filterMonth || (i.effective_from || "").startsWith(filterMonth);
    const typeOk = !filterType || i.type === filterType;
    return empOk && monthOk && typeOk;
  }), [increments, filterEmp, filterMonth, filterType]);

  const types = useMemo(() => [...new Set(increments.map(i => i.type).filter(Boolean))], [increments]);

  return (
    <div>
      <PageTitle
        title="Salary Increments"
        subtitle="Track all salary changes with full history."
        action={
          <div className="flex gap-2">
            <Button variant="outline" className="rounded-2xl" onClick={() => { setShowImport(s => !s); setShowForm(false); }}>
              {showImport ? "Close Import" : "Import History"}
            </Button>
            <Button className="rounded-2xl" onClick={() => { setShowForm(s => !s); setShowImport(false); }}>
              {showForm ? "Cancel" : "+ Add Increment"}
            </Button>
          </div>
        }
      />

      {msg && <div className="mb-3 p-3 rounded-xl bg-blue-50 text-blue-700 text-sm">{msg}</div>}
      {err && <div className="mb-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{err}</div>}

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
            <button onClick={() => setBulkMode(true)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition ${bulkMode ? "bg-slate-950 text-white" : "bg-white border border-slate-200 text-slate-600"}`}>
              Bulk by Dept/Branch
            </button>
          </div>

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
                <Button onClick={addIncrement} className="rounded-2xl">Save Increment</Button>
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

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-slate-500">Total Records</p>
          <p className="text-2xl font-bold">{increments.length}</p>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-slate-500">Increments</p>
          <p className="text-2xl font-bold text-emerald-600">{increments.filter(i => (i.increment_amount || 0) > 0).length}</p>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-slate-500">Downward Revisions</p>
          <p className="text-2xl font-bold text-red-500">{increments.filter(i => (i.increment_amount || 0) < 0).length}</p>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-slate-500">Net Cost Change</p>
          <p className="text-2xl font-bold">{money(increments.reduce((s, i) => s + (Number(i.increment_amount) || 0), 0))}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input value={filterEmp} onChange={e => setFilterEmp(e.target.value)} placeholder="Filter by employee name / code…"
          className="px-4 py-2 rounded-xl border border-slate-200 text-sm w-56" />
        <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
          className="px-4 py-2 rounded-xl border border-slate-200 text-sm" />
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="px-4 py-2 rounded-xl border border-slate-200 text-sm">
          <option value="">All Types</option>
          {types.map(t => <option key={t}>{t}</option>)}
        </select>
        {(filterEmp || filterMonth || filterType) && (
          <button onClick={() => { setFilterEmp(""); setFilterMonth(""); setFilterType(""); }}
            className="px-4 py-2 rounded-xl border border-slate-200 text-sm text-slate-500 hover:bg-slate-50">
            Clear Filters
          </button>
        )}
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
                {["Emp Code", "Employee Name", "Effective Month", "Previous Salary", "New Salary", "Increment Amount", "Increment %", "Type", "Status"].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0
                ? <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">No increment records found.</td></tr>
                : filtered.map(inc => {
                  const amt = Number(inc.increment_amount) || 0;
                  const pctV = Number(inc.increment_percentage) || 0;
                  const isPos = amt >= 0;
                  const month = inc.effective_from ? inc.effective_from.slice(0, 7) : "—";
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
                    </tr>
                  );
                })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
