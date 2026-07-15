import React, { useState, useEffect, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../lib/supabaseClient.js";
import { Button, Badge, PageTitle } from "../components/ui.jsx";
import { money } from "../utils/format.js";

function excelDateToJS(serial) {
  if (!serial) return null;
  if (typeof serial === "string") return serial.trim() || null;
  const date = new Date((serial - 25569) * 86400 * 1000);
  return date.toISOString().split("T")[0];
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
              <span className="text-xs text-slate-400 ml-2">{e.department}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const BLANK = { employee: null, loan_amount: "", monthly_deduction: "", start_date: "", reason: "", guarantor1: null, guarantor2: null };

export default function LoanManagement() {
  const [loans, setLoans] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [filterEmp, setFilterEmp] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [selectedHistory, setSelectedHistory] = useState(null);
  const [rescheduleTarget, setRescheduleTarget] = useState(null);
  const [rescheduleAmount, setRescheduleAmount] = useState("");
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [reliefTarget, setReliefTarget] = useState(null);
  const [reliefReason, setReliefReason] = useState("");
  const [loanChanges, setLoanChanges] = useState([]);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  // Bulk import state
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importSummary, setImportSummary] = useState(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const [{ data: lns }, { data: emps }, { data: changes }] = await Promise.all([
      supabase.from("loans").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.from("employees").select("employee_code, full_name, department, branch, salary, joining_date").order("full_name"),
      supabase.from("loan_changes").select("*").order("created_at", { ascending: false }).limit(200),
    ]);
    setLoans(lns || []);
    setEmployees(emps || []);
    setLoanChanges(changes || []);
  }

  async function submitLoan() {
    if (!form.employee || !form.loan_amount || !form.monthly_deduction || !form.start_date)
      return setErr("Employee, loan amount, monthly deduction and start date are required.");
    setErr("");
    const months = Math.ceil(Number(form.loan_amount) / Number(form.monthly_deduction));
    const { error } = await supabase.from("loans").insert({
      employee_code: form.employee.employee_code,
      employee_name: form.employee.full_name, loan_amount: Number(form.loan_amount),
      monthly_deduction: Number(form.monthly_deduction), outstanding_balance: Number(form.loan_amount),
      start_date: form.start_date, reason: form.reason, status: "Active",
      repayment_months: months, auto_deduct: true, created_at: new Date().toISOString(),
      guarantor_1_code: form.guarantor1?.employee_code || null, guarantor_1_name: form.guarantor1?.full_name || null,
      guarantor_2_code: form.guarantor2?.employee_code || null, guarantor_2_name: form.guarantor2?.full_name || null,
    });
    if (error) return setErr(error.message);
    setMsg("Loan application created successfully.");
    setForm(BLANK); setShowForm(false); loadAll();
  }

  // ─── Bulk Import ───────────────────────────────────────────────────────
  function downloadLoanImportTemplate() {
    const instructions =
      "INSTRUCTIONS: Employee Code must match an existing employee. Guarantor codes are optional but if given must " +
      "match existing employees and cannot be the borrower themselves. Repayment Months is auto-calculated from " +
      "Loan Amount / Monthly Deduction. Do not leave Employee Code, Loan Amount, Monthly Deduction or Start Date blank.";
    const aoa = [
      [instructions],
      ["Employee Code", "Loan Amount", "Monthly Deduction", "Start Date", "Reason", "Guarantor 1 Code", "Guarantor 2 Code"],
      ["1001", 25000, 5000, "2026-04-01", "Medical emergency", "1002", "1003"],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }];
    ws["!cols"] = [{ wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 24 }, { wch: 16 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Loan Import");
    XLSX.writeFile(wb, "loan_import_template.xlsx");
  }

  async function handleLoanImportPreview() {
    if (!importFile) return setErr("Select an Excel file first.");
    setErr(""); setImportSummary(null); setImportPreview(null);
    try {
      const data = await importFile.arrayBuffer();
      const wb = XLSX.read(data);
      const rawRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });

      const headerIdx = rawRows.findIndex(r => String(r[0] || "").trim() === "Employee Code");
      if (headerIdx === -1) throw new Error("Header row not found. Ensure you're using the downloaded template.");
      const headers = rawRows[headerIdx];
      const dataRows = rawRows.slice(headerIdx + 1).filter(r => r.some(c => c !== ""));

      const preview = dataRows.map(row => {
        const obj = {};
        headers.forEach((h, i) => { obj[String(h)] = row[i] ?? ""; });
        const code = String(obj["Employee Code"] || "").trim();
        const emp = employees.find(e => e.employee_code === code);
        const loanAmount = Number(obj["Loan Amount"] || 0);
        const monthlyDeduction = Number(obj["Monthly Deduction"] || 0);
        const startDate = excelDateToJS(obj["Start Date"]);
        const reason = String(obj["Reason"] || "").trim();
        const g1Code = String(obj["Guarantor 1 Code"] || "").trim();
        const g2Code = String(obj["Guarantor 2 Code"] || "").trim();
        const g1 = g1Code ? employees.find(e => e.employee_code === g1Code) : null;
        const g2 = g2Code ? employees.find(e => e.employee_code === g2Code) : null;
        const months = monthlyDeduction > 0 ? Math.ceil(loanAmount / monthlyDeduction) : 0;

        let status = "ok";
        if (!code) status = "error: missing employee code";
        else if (!emp) status = `error: ${code} not found`;
        else if (!loanAmount || loanAmount <= 0) status = "error: invalid loan amount";
        else if (!monthlyDeduction || monthlyDeduction <= 0) status = "error: invalid monthly deduction";
        else if (!startDate) status = "error: missing start date";
        else if (g1Code && !g1) status = `error: guarantor 1 (${g1Code}) not found`;
        else if (g2Code && !g2) status = `error: guarantor 2 (${g2Code}) not found`;
        else if (g1Code && g1Code === code) status = "error: guarantor 1 cannot be the borrower";
        else if (g2Code && g2Code === code) status = "error: guarantor 2 cannot be the borrower";
        else if (g1Code && g2Code && g1Code === g2Code) status = "warning: same guarantor listed twice";

        return { code, emp, loanAmount, monthlyDeduction, startDate, reason, months, g1Code, g1, g2Code, g2, status };
      });
      setImportPreview(preview);
    } catch (e) {
      setErr(e.message);
    }
  }

  async function handleLoanImportConfirm() {
    if (!importPreview) return;
    setImporting(true); setErr("");
    let imported = 0, failed = 0;
    const errors = [];
    for (const row of importPreview) {
      if (row.status.startsWith("error")) { failed++; errors.push(`${row.code || "?"}: ${row.status}`); continue; }
      const { error } = await supabase.from("loans").insert({
        employee_code: row.code, employee_name: row.emp?.full_name,
        loan_amount: row.loanAmount, monthly_deduction: row.monthlyDeduction,
        outstanding_balance: row.loanAmount, start_date: row.startDate, reason: row.reason,
        status: "Active", repayment_months: row.months, auto_deduct: true,
        guarantor_1_code: row.g1?.employee_code || null, guarantor_1_name: row.g1?.full_name || null,
        guarantor_2_code: row.g2?.employee_code || null, guarantor_2_name: row.g2?.full_name || null,
        created_at: new Date().toISOString(),
      });
      if (error) { failed++; errors.push(`${row.code}: ${error.message}`); }
      else imported++;
    }
    setImportSummary({ total: importPreview.length, imported, failed, errors });
    setImportPreview(null); setImportFile(null); setImporting(false);
    loadAll();
  }

  async function clearLoan(id) {
    const loan = loans.find(l => l.id === id);
    const { error } = await supabase.from("loans").update({ status: "Cleared", outstanding_balance: 0 }).eq("id", id);
    if (!error) {
      await supabase.from("loan_changes").insert({ loan_id: id, employee_code: loan?.employee_code, change_type: "settlement", reason: "Manual clear", created_at: new Date().toISOString() });
      setMsg("Loan marked as cleared."); loadAll();
    }
  }

  async function earlySettle(id) {
    const loan = loans.find(l => l.id === id);
    const { error } = await supabase.from("loans").update({ status: "Cleared", outstanding_balance: 0 }).eq("id", id);
    if (!error) {
      await supabase.from("loan_changes").insert({ loan_id: id, employee_code: loan?.employee_code, change_type: "early_settlement", old_balance: loan?.outstanding_balance, new_balance: 0, reason: "Early settlement — full balance paid", created_at: new Date().toISOString() });
      setMsg(`Early settlement: ${money(loan?.outstanding_balance)} settled.`); loadAll();
    } else setErr(error.message);
  }

  async function reschedule(id) {
    if (!rescheduleAmount || !rescheduleDate) return setErr("New monthly deduction amount and effective date required.");
    const loan = loans.find(l => l.id === id);
    const newMonths = Math.ceil(Number(loan?.outstanding_balance || 0) / Number(rescheduleAmount));
    const { error } = await supabase.from("loans").update({ monthly_deduction: Number(rescheduleAmount), repayment_months: newMonths }).eq("id", id);
    if (!error) {
      await supabase.from("loan_changes").insert({ loan_id: id, employee_code: loan?.employee_code, change_type: "reschedule", old_monthly: loan?.monthly_deduction, new_monthly: Number(rescheduleAmount), reason: `Rescheduled effective ${rescheduleDate}`, created_at: new Date().toISOString() });
      setMsg("Loan rescheduled."); setRescheduleTarget(null); setRescheduleAmount(""); setRescheduleDate(""); loadAll();
    } else setErr(error.message);
  }

  async function skipMonth(id) {
    if (!reliefReason.trim()) return setErr("Reason for skipping deduction is required.");
    const loan = loans.find(l => l.id === id);
    await supabase.from("loan_changes").insert({ loan_id: id, employee_code: loan?.employee_code, change_type: "relief", reason: reliefReason, created_at: new Date().toISOString() });
    setMsg("Month skip recorded. No deduction this month."); setReliefTarget(null); setReliefReason(""); loadAll();
  }

  const filtered = useMemo(() => loans.filter(l => {
    const empMatch = !filterEmp || (l.employee_name || l.employee_code || "").toLowerCase().includes(filterEmp.toLowerCase());
    const statusMatch = filterStatus === "All" || l.status === filterStatus;
    return empMatch && statusMatch;
  }), [loans, filterEmp, filterStatus]);

  const totalOutstanding = useMemo(() => filtered.filter(l => l.status === "Active").reduce((s, l) => s + Number(l.outstanding_balance || 0), 0), [filtered]);

  const historyLoan = selectedHistory ? loans.filter(l => l.employee_code === selectedHistory || l.employee_id === selectedHistory) : [];
  const historyChanges = selectedHistory ? loanChanges.filter(c => c.employee_code === selectedHistory) : [];

  return (
    <div>
      <PageTitle title="Loans & Advances" subtitle="Manage employee loan applications, rescheduling, relief and settlements."
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowImport(s => !s)} className="rounded-2xl">{showImport ? "Cancel Import" : "Import Loans"}</Button>
            <Button onClick={() => setShowForm(s => !s)} className="rounded-2xl">{showForm ? "Cancel" : "+ New Loan"}</Button>
          </div>
        } />

      {msg && <div className="mb-3 p-3 rounded-xl bg-blue-50 text-blue-700 text-sm">{msg}</div>}
      {err && <div className="mb-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{err}</div>}

      {showImport && (
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm mb-4">
          <h2 className="font-bold text-slate-800 mb-3">Import Loans</h2>
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 mb-3">
            <strong>Instructions:</strong> Employee Code must match an existing employee. Guarantor codes are optional but if given must match
            existing employees and cannot be the borrower themselves. Repayment Months is auto-calculated from Loan Amount / Monthly Deduction.
          </div>
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <Button variant="outline" onClick={downloadLoanImportTemplate} className="rounded-xl text-xs py-1.5 px-3">Download Template</Button>
            <input type="file" accept=".xlsx,.xls,.csv" id="loan-import-file"
              onChange={e => { setImportFile(e.target.files?.[0] || null); setImportPreview(null); setImportSummary(null); }}
              className="hidden" />
            <label htmlFor="loan-import-file" className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50">
              {importFile ? importFile.name : "Choose File"}
            </label>
            {importFile && !importPreview && (
              <Button onClick={handleLoanImportPreview} className="rounded-xl text-xs py-1.5 px-3">Preview Import</Button>
            )}
            {importFile && (
              <button onClick={() => { setImportFile(null); setImportPreview(null); setImportSummary(null); }}
                className="text-xs text-slate-400 hover:text-slate-600">Clear</button>
            )}
          </div>

          {importPreview && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-slate-700">{importPreview.length} rows parsed — review before confirming</p>
                <div className="flex gap-2">
                  <Button onClick={handleLoanImportConfirm} disabled={importing || importPreview.every(r => r.status.startsWith("error"))} className="rounded-xl text-xs py-1.5 px-3">
                    {importing ? "Importing..." : "Confirm Import"}
                  </Button>
                  <Button variant="outline" onClick={() => setImportPreview(null)} className="rounded-xl text-xs py-1.5 px-3">Cancel</Button>
                </div>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-xs min-w-[900px]">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      {["Code", "Employee", "Loan Amount", "Monthly Ded.", "Months", "Start Date", "Guarantor 1", "Guarantor 2", "Status"].map(h => (
                        <th key={h} className="text-left px-3 py-2 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {importPreview.map((row, i) => (
                      <tr key={i} className={row.status.startsWith("error") ? "bg-red-50" : row.status.startsWith("warning") ? "bg-yellow-50" : ""}>
                        <td className="px-3 py-2 font-mono">{row.code || "—"}</td>
                        <td className="px-3 py-2">{row.emp?.full_name || "—"}</td>
                        <td className="px-3 py-2 text-center">{money(row.loanAmount)}</td>
                        <td className="px-3 py-2 text-center">{money(row.monthlyDeduction)}</td>
                        <td className="px-3 py-2 text-center">{row.months || "—"}</td>
                        <td className="px-3 py-2">{row.startDate || "—"}</td>
                        <td className="px-3 py-2">{row.g1 ? `${row.g1.employee_code} — ${row.g1.full_name}` : row.g1Code || "—"}</td>
                        <td className="px-3 py-2">{row.g2 ? `${row.g2.employee_code} — ${row.g2.full_name}` : row.g2Code || "—"}</td>
                        <td className={`px-3 py-2 font-medium ${row.status.startsWith("error") ? "text-red-600" : row.status.startsWith("warning") ? "text-yellow-700" : "text-emerald-600"}`}>
                          {row.status}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {importSummary && (
            <div className="mt-3 p-3 bg-slate-50 rounded-xl text-xs text-slate-700">
              <span className="font-semibold">Total: {importSummary.total}</span>
              <span className="text-emerald-600 font-semibold ml-4">{importSummary.imported} imported</span>
              {importSummary.failed > 0 && <span className="text-red-500 font-semibold ml-3">{importSummary.failed} failed</span>}
              {importSummary.errors.length > 0 && (
                <div className="mt-2 space-y-0.5 text-red-500">{importSummary.errors.slice(0, 8).map((e, i) => <div key={i}>{e}</div>)}</div>
              )}
            </div>
          )}
        </div>
      )}

      {showForm && (
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm mb-4">
          <h2 className="font-bold text-slate-800 mb-4">New Loan Application</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><p className="text-xs text-slate-500 mb-1">Employee</p><EmpPicker employees={employees} value={form.employee} onChange={v => setForm(f => ({ ...f, employee: v }))} /></div>
            <div><p className="text-xs text-slate-500 mb-1">Start Date</p><input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" /></div>
            <div><p className="text-xs text-slate-500 mb-1">Loan Amount (Rs.)</p><input type="number" value={form.loan_amount} onChange={e => setForm(f => ({ ...f, loan_amount: e.target.value }))} placeholder="0" className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" /></div>
            <div><p className="text-xs text-slate-500 mb-1">Monthly Deduction (Rs.)</p><input type="number" value={form.monthly_deduction} onChange={e => setForm(f => ({ ...f, monthly_deduction: e.target.value }))} placeholder="0" className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" /></div>
            {form.loan_amount && form.monthly_deduction && (
              <div className="md:col-span-2 p-3 bg-slate-50 rounded-xl text-sm text-slate-600">Repayment: <strong>{Math.ceil(Number(form.loan_amount) / Number(form.monthly_deduction))} months</strong></div>
            )}
            <div><p className="text-xs text-slate-500 mb-1">Guarantor 1</p><EmpPicker employees={employees.filter(e => e.employee_code !== form.employee?.employee_code)} value={form.guarantor1} onChange={v => setForm(f => ({ ...f, guarantor1: v }))} /></div>
            <div><p className="text-xs text-slate-500 mb-1">Guarantor 2</p><EmpPicker employees={employees.filter(e => e.employee_code !== form.employee?.employee_code)} value={form.guarantor2} onChange={v => setForm(f => ({ ...f, guarantor2: v }))} /></div>
            <div className="md:col-span-2"><p className="text-xs text-slate-500 mb-1">Reason</p><input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder="Reason for loan..." className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" /></div>
          </div>
          <div className="mt-4 flex gap-2"><Button onClick={submitLoan} className="rounded-2xl">Submit Loan</Button><Button variant="outline" onClick={() => setShowForm(false)} className="rounded-2xl">Cancel</Button></div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm"><p className="text-xs text-slate-500">Active Loans</p><p className="text-2xl font-bold">{loans.filter(l => l.status === "Active").length}</p></div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm"><p className="text-xs text-slate-500">Total Outstanding</p><p className="text-2xl font-bold text-red-500">{money(totalOutstanding)}</p></div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm"><p className="text-xs text-slate-500">Cleared Loans</p><p className="text-2xl font-bold text-emerald-600">{loans.filter(l => l.status === "Cleared").length}</p></div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm"><p className="text-xs text-slate-500">Total Loans</p><p className="text-2xl font-bold">{loans.length}</p></div>
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm mb-4">
        <div className="flex flex-wrap gap-3">
          <input value={filterEmp} onChange={e => setFilterEmp(e.target.value)} placeholder="Search employee..." className="flex-1 min-w-[160px] px-4 py-2 rounded-xl border border-slate-200 text-sm" />
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm">
            <option value="All">All Status</option><option>Active</option><option>Cleared</option>
          </select>
        </div>
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
        <div className="px-5 pt-4 pb-2"><h2 className="font-bold text-slate-800">Loan Ledger</h2><p className="text-xs text-slate-400 mt-0.5">{filtered.length} records</p></div>
        <table className="w-full min-w-[1050px] text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>{["Employee", "Guarantors", "Loan Amount", "Monthly Ded.", "Outstanding", "Start Date", "Months", "Status", "Actions"].map(h => (
              <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
            ))}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0
              ? <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">No loans found.</td></tr>
              : filtered.map(l => (
                <tr key={l.id}>
                  <td className="px-4 py-3">
                    <button onClick={() => setSelectedHistory(l.employee_code || l.employee_id)} className="font-medium text-blue-600 hover:underline">
                      {l.employee_name || l.employee_code || l.employee_id}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {l.guarantor_1_name ? <div>{l.guarantor_1_code} — {l.guarantor_1_name}</div> : null}
                    {l.guarantor_2_name ? <div>{l.guarantor_2_code} — {l.guarantor_2_name}</div> : null}
                    {!l.guarantor_1_name && !l.guarantor_2_name && "—"}
                  </td>
                  <td className="px-4 py-3">{money(l.loan_amount)}</td>
                  <td className="px-4 py-3">
                    {rescheduleTarget === l.id
                      ? <div className="flex gap-1">
                          <input type="number" value={rescheduleAmount} onChange={e => setRescheduleAmount(e.target.value)} placeholder="New amount" className="w-24 px-2 py-1 rounded-xl border border-slate-200 text-xs" />
                          <input type="date" value={rescheduleDate} onChange={e => setRescheduleDate(e.target.value)} className="px-2 py-1 rounded-xl border border-slate-200 text-xs" />
                        </div>
                      : money(l.monthly_deduction)}
                  </td>
                  <td className="px-4 py-3 font-semibold text-red-500">{money(l.outstanding_balance)}</td>
                  <td className="px-4 py-3">{l.start_date}</td>
                  <td className="px-4 py-3">{l.repayment_months || "—"}</td>
                  <td className="px-4 py-3"><Badge tone={l.status === "Active" ? "yellow" : "green"}>{l.status}</Badge></td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {l.status === "Active" && (
                        <>
                          {rescheduleTarget === l.id
                            ? <>
                                <Button onClick={() => reschedule(l.id)} className="rounded-xl text-xs py-1 px-2">Confirm</Button>
                                <Button variant="outline" onClick={() => setRescheduleTarget(null)} className="rounded-xl text-xs py-1 px-2">Cancel</Button>
                              </>
                            : <Button variant="outline" onClick={() => setRescheduleTarget(l.id)} className="rounded-xl text-xs py-1 px-2">Reschedule</Button>}
                          {reliefTarget === l.id
                            ? <div className="flex gap-1">
                                <input value={reliefReason} onChange={e => setReliefReason(e.target.value)} placeholder="Reason..." className="w-28 px-2 py-1 rounded-xl border border-slate-200 text-xs" />
                                <Button onClick={() => skipMonth(l.id)} className="rounded-xl text-xs py-1 px-2">Skip</Button>
                                <Button variant="outline" onClick={() => setReliefTarget(null)} className="rounded-xl text-xs py-1 px-2">×</Button>
                              </div>
                            : <Button variant="outline" onClick={() => setReliefTarget(l.id)} className="rounded-xl text-xs py-1 px-2">Skip Month</Button>}
                          <Button variant="outline" onClick={() => { if (window.confirm(`Settle remaining ${money(l.outstanding_balance)}?`)) earlySettle(l.id); }} className="rounded-xl text-xs py-1 px-2 text-emerald-600">Early Settle</Button>
                          <Button variant="outline" onClick={() => clearLoan(l.id)} className="rounded-xl text-xs py-1 px-2">Clear</Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {selectedHistory && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-slate-800">Loan History — {selectedHistory}</h3>
              <Button variant="outline" onClick={() => setSelectedHistory(null)} className="rounded-xl text-xs">Close</Button>
            </div>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {historyLoan.map((l, i) => (
                <div key={i} className="border border-slate-100 rounded-xl p-3 text-sm">
                  <div className="flex justify-between mb-1"><span className="font-semibold">{money(l.loan_amount)}</span><Badge tone={l.status === "Active" ? "yellow" : "green"}>{l.status}</Badge></div>
                  <div className="text-slate-500">Monthly: {money(l.monthly_deduction)} · Start: {l.start_date}</div>
                  <div className="text-slate-500">Outstanding: {money(l.outstanding_balance)} · Reason: {l.reason || "—"}</div>
                  {(l.guarantor_1_name || l.guarantor_2_name) && (
                    <div className="text-slate-500">
                      Guarantors: {[l.guarantor_1_name && `${l.guarantor_1_code} — ${l.guarantor_1_name}`, l.guarantor_2_name && `${l.guarantor_2_code} — ${l.guarantor_2_name}`].filter(Boolean).join(", ")}
                    </div>
                  )}
                  {historyChanges.filter(c => c.loan_id === l.id).length > 0 && (
                    <div className="mt-2 border-t border-slate-50 pt-2 space-y-1">
                      <p className="text-xs font-semibold text-slate-400">Change Timeline:</p>
                      {historyChanges.filter(c => c.loan_id === l.id).map((c, ci) => (
                        <div key={ci} className="text-xs text-slate-500 flex gap-2">
                          <span className="font-medium capitalize">{c.change_type?.replace("_", " ")}:</span>
                          <span>{c.reason}</span>
                          {c.old_monthly && <span>Rs.{c.old_monthly} → Rs.{c.new_monthly}</span>}
                          <span className="text-slate-300">{c.created_at?.slice(0, 10)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {historyLoan.length === 0 && <p className="text-slate-400 text-sm">No loan history.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
