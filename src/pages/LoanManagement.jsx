import React, { useState, useEffect, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../lib/supabaseClient.js";
import { Button, Badge, PageTitle } from "../components/ui.jsx";
import { money } from "../utils/format.js";
import { notifyLoanProposed, notifyLoanCreatedByMaster, proposeLoanChange, applyLoanChangeAsMaster, clearLoanAsMaster, earlySettleLoanAsMaster, submitLoanGuaranteeDocuments, fetchLoanGuaranteeDocuments, attachSignedReceiptUrls, markLoanDisbursed } from "../services/loanService.js";

function nextMonthStr() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

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

function loanStatusTone(status) {
  if (status === "Active") return "yellow";
  if (status === "Pending Approval") return "blue";
  if (status === "Pending Disbursement") return "purple";
  if (status === "Rejected") return "red";
  return "green";
}

export default function LoanManagement({ role, actorName }) {
  const actor = actorName || role;
  const canManage = ["Master", "HR"].includes(role);
  const canDisburse = ["Master", "Finance"].includes(role);
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
  const [reliefMonth, setReliefMonth] = useState(nextMonthStr());
  const [loanChanges, setLoanChanges] = useState([]);
  const [guaranteeItems, setGuaranteeItems] = useState([]);
  const [loanDocs, setLoanDocs] = useState({});
  const [disburseTarget, setDisburseTarget] = useState(null);
  const [disburseFile, setDisburseFile] = useState(null);
  const [disbursing, setDisbursing] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [printingLoan, setPrintingLoan] = useState(null);

  // Bulk import state
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importSummary, setImportSummary] = useState(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => { loadAll(); }, []);

  // Print is triggered a tick after printingLoan is set (so the print-only
  // slip below has actually rendered), and cleared on 'afterprint' so the
  // slip disappears again once the browser's print dialog closes -- covers
  // both an actual print and a Cancel.
  useEffect(() => {
    if (!printingLoan) return;
    const t = setTimeout(() => window.print(), 50);
    const clear = () => setPrintingLoan(null);
    window.addEventListener("afterprint", clear);
    return () => { clearTimeout(t); window.removeEventListener("afterprint", clear); };
  }, [printingLoan]);

  async function loadAll() {
    const [{ data: lns }, { data: emps }, { data: changes }] = await Promise.all([
      supabase.from("loans").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.from("employees").select("employee_code, full_name, department, branch, salary, joining_date").order("full_name"),
      supabase.from("loan_changes").select("*").order("created_at", { ascending: false }).limit(200),
    ]);
    setLoans(lns || []);
    setEmployees(emps || []);
    setLoanChanges(changes || []);
    try {
      setLoans(await attachSignedReceiptUrls(lns || []));
    } catch { /* receipt thumbnails are a supplement to the ledger, not required to view it */ }
    try {
      const docs = await fetchLoanGuaranteeDocuments((lns || []).map(l => l.id));
      const map = {};
      docs.forEach(d => { if (!map[d.loan_id]) map[d.loan_id] = []; map[d.loan_id].push(d); });
      setLoanDocs(map);
    } catch { /* documents are a supplement to the ledger, not required to view it */ }
  }

  // HR proposes (Pending Approval, no payroll effect until Master/GM
  // approves in the Approval Queue); Master applies instantly since Master
  // is itself an approver — same split as Salary Increments.
  function addGuaranteeItem() {
    setGuaranteeItems(items => [...items, { file: null, remarks: "", previewUrl: "" }]);
  }
  function updateGuaranteeItem(idx, patch) {
    setGuaranteeItems(items => items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function removeGuaranteeItem(idx) {
    setGuaranteeItems(items => items.filter((_, i) => i !== idx));
  }

  async function submitLoan() {
    if (!form.employee || !form.loan_amount || !form.monthly_deduction || !form.start_date)
      return setErr("Employee, loan amount, monthly deduction and start date are required.");
    const validItems = guaranteeItems.filter(it => it.file && it.remarks.trim());
    if (validItems.length === 0)
      return setErr("Add at least one guarantee document — a photo of the item taken as security plus a remark describing it — before submitting.");
    if (validItems.length !== guaranteeItems.length)
      return setErr("Every guarantee item needs both an image and a remark — remove any incomplete rows before submitting.");
    setErr(""); setMsg("");
    const months = Math.ceil(Number(form.loan_amount) / Number(form.monthly_deduction));
    const needsApproval = role === "HR";
    const { data: inserted, error } = await supabase.from("loans").insert({
      employee_code: form.employee.employee_code,
      employee_name: form.employee.full_name, loan_amount: Number(form.loan_amount),
      monthly_deduction: Number(form.monthly_deduction), outstanding_balance: Number(form.loan_amount),
      start_date: form.start_date, reason: form.reason, status: needsApproval ? "Pending Approval" : "Pending Disbursement",
      repayment_months: months, auto_deduct: true, created_at: new Date().toISOString(),
      submitted_by: role,
      guarantor_1_code: form.guarantor1?.employee_code || null, guarantor_1_name: form.guarantor1?.full_name || null,
      guarantor_2_code: form.guarantor2?.employee_code || null, guarantor_2_name: form.guarantor2?.full_name || null,
    }).select().single();
    if (error) { setErr(error.message); window.scrollTo({ top: 0, behavior: "smooth" }); return; }

    // The loan row is already committed at this point, so a documents
    // failure must say so distinctly rather than looking like nothing
    // happened — the loan exists but still needs its guarantee photos.
    try {
      await submitLoanGuaranteeDocuments(inserted.id, validItems, actor);
    } catch (e) {
      setErr(`Loan saved, but the guarantee documents failed to upload (${e.message}). Reopen the loan and retry, or contact admin.`);
      setForm(BLANK); setGuaranteeItems([]); setShowForm(false); loadAll();
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    // Everything below is just notifications, so a failure there must never
    // look like the submission itself silently did nothing (previously an
    // uncaught rejection here would skip setMsg entirely, leaving HR with no
    // confirmation either way even though the loan had actually gone through).
    try {
      if (needsApproval) {
        await notifyLoanProposed({
          employeeName: form.employee.full_name, loanAmount: Number(form.loan_amount),
          monthlyDeduction: Number(form.monthly_deduction), submittedByRole: role,
        });
        setMsg("Loan request submitted — awaiting Master/GM approval.");
      } else {
        await notifyLoanCreatedByMaster({
          employeeName: form.employee.full_name, loanAmount: Number(form.loan_amount),
          monthlyDeduction: Number(form.monthly_deduction),
        });
        setMsg("Loan application created — awaiting Finance disbursement.");
      }
    } catch {
      setMsg("Loan submitted and saved (a notification failed to send, but the loan itself was recorded).");
    }
    setForm(BLANK); setGuaranteeItems([]); setShowForm(false); loadAll();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function disburseLoan(id) {
    if (!disburseFile) return setErr("Upload a picture of the employee's signed receiving slip first.");
    setDisbursing(true); setErr("");
    try {
      const loan = loans.find(l => l.id === id);
      await markLoanDisbursed({ loanId: id, actorName: actor, receiptFile: disburseFile, employeeName: loan?.employee_name });
      setMsg("Loan marked as paid — now Active.");
      setDisburseTarget(null); setDisburseFile(null); loadAll();
    } catch (e) { setErr(e.message); }
    setDisbursing(false);
  }

  // ─── Bulk Import ───────────────────────────────────────────────────────
  function downloadLoanImportTemplate() {
    const instructions =
      "INSTRUCTIONS: Employee Code must match an existing employee. Outstanding Balance is optional — leave blank for a " +
      "fresh loan (defaults to Loan Amount), or enter the remaining balance for an existing loan, or 0 to record a loan " +
      "that has already been fully paid off (imported for history, status will be set to Cleared). Guarantor codes are " +
      "optional but if given must match existing employees and cannot be the borrower themselves. Repayment Months is " +
      "auto-calculated from Loan Amount / Monthly Deduction. Do not leave Employee Code, Loan Amount, Monthly Deduction " +
      "or Start Date blank.";
    const aoa = [
      [instructions],
      ["Employee Code", "Loan Amount", "Outstanding Balance", "Monthly Deduction", "Start Date", "Reason", "Guarantor 1 Code", "Guarantor 2 Code"],
      ["1001", 25000, "", 5000, "2026-04-01", "Medical emergency", "1002", "1003"],
      ["1004", 20000, 0, 4000, "2025-11-01", "Paid off — imported for record", "", ""],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }];
    ws["!cols"] = [{ wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 24 }, { wch: 16 }, { wch: 16 }];
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
        const balanceRaw = String(obj["Outstanding Balance"] ?? "").trim();
        const outstandingBalance = balanceRaw === "" ? loanAmount : Number(balanceRaw);
        const loanStatus = outstandingBalance <= 0 ? "Cleared" : "Active";
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
        else if (isNaN(outstandingBalance) || outstandingBalance < 0) status = "error: invalid outstanding balance";
        else if (outstandingBalance > loanAmount) status = "error: outstanding balance exceeds loan amount";
        else if (!monthlyDeduction || monthlyDeduction <= 0) status = "error: invalid monthly deduction";
        else if (!startDate) status = "error: missing start date";
        else if (g1Code && !g1) status = `error: guarantor 1 (${g1Code}) not found`;
        else if (g2Code && !g2) status = `error: guarantor 2 (${g2Code}) not found`;
        else if (g1Code && g1Code === code) status = "error: guarantor 1 cannot be the borrower";
        else if (g2Code && g2Code === code) status = "error: guarantor 2 cannot be the borrower";
        else if (g1Code && g2Code && g1Code === g2Code) status = "warning: same guarantor listed twice";

        return { code, emp, loanAmount, outstandingBalance, loanStatus, monthlyDeduction, startDate, reason, months, g1Code, g1, g2Code, g2, status };
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
        outstanding_balance: row.outstandingBalance, start_date: row.startDate, reason: row.reason,
        status: row.loanStatus, repayment_months: row.months, auto_deduct: true,
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
    if (role !== "Master") return setErr("Only Master can clear a loan.");
    try {
      await clearLoanAsMaster(id, role);
      setMsg("Loan marked as cleared."); loadAll();
    } catch (e) { setErr(e.message); }
  }

  // Master-only, same as Clear — Early Settle sets the exact same columns
  // (status='Cleared', outstanding_balance=0), so restricting one without
  // the other leaves an identical loophole open.
  async function earlySettle(id) {
    if (role !== "Master") return setErr("Only Master can early-settle a loan.");
    try {
      await earlySettleLoanAsMaster(id, role);
      const loan = loans.find(l => l.id === id);
      setMsg(`Early settlement: ${money(loan?.outstanding_balance)} settled.`); loadAll();
    } catch (e) { setErr(e.message); }
  }

  // HR can only propose (Pending, no change to loans.monthly_deduction yet);
  // Master applies instantly — same split as loan creation and everywhere
  // else in this workflow. GM never proposes, only approves in the Queue.
  async function reschedule(id) {
    if (!rescheduleAmount || !rescheduleDate) return setErr("New monthly deduction amount and effective date required.");
    const loan = loans.find(l => l.id === id);
    if (!loan) return;
    try {
      if (role === "Master") {
        const newMonths = Math.ceil(Number(loan.outstanding_balance || 0) / Number(rescheduleAmount));
        await applyLoanChangeAsMaster({
          loanId: id, employeeCode: loan.employee_code, employeeName: loan.employee_name, changeType: "reschedule",
          oldMonthly: loan.monthly_deduction, newMonthly: Number(rescheduleAmount), newRepaymentMonths: newMonths,
          reason: `Rescheduled effective ${rescheduleDate}`, actorName: role,
        });
        setMsg("Loan rescheduled.");
      } else {
        await proposeLoanChange({
          loanId: id, employeeCode: loan.employee_code, employeeName: loan.employee_name,
          changeType: "reschedule", oldMonthly: loan.monthly_deduction, newMonthly: Number(rescheduleAmount),
          reason: `Rescheduled effective ${rescheduleDate}`, submittedByRole: role,
        });
        setMsg("Reschedule request submitted — awaiting Master/GM approval.");
      }
      setRescheduleTarget(null); setRescheduleAmount(""); setRescheduleDate(""); loadAll();
    } catch (e) { setErr(e.message); }
  }

  async function skipMonth(id) {
    if (!reliefReason.trim()) return setErr("Reason for skipping deduction is required.");
    if (!reliefMonth) return setErr("Month to skip is required.");
    const loan = loans.find(l => l.id === id);
    if (!loan) return;
    try {
      if (role === "Master") {
        await applyLoanChangeAsMaster({
          loanId: id, employeeCode: loan.employee_code, employeeName: loan.employee_name, changeType: "relief",
          effectiveMonth: reliefMonth, reason: reliefReason, actorName: role,
        });
        setMsg(`No deduction recorded for ${reliefMonth}.`);
      } else {
        await proposeLoanChange({
          loanId: id, employeeCode: loan.employee_code, employeeName: loan.employee_name,
          changeType: "relief", effectiveMonth: reliefMonth, reason: reliefReason, submittedByRole: role,
        });
        setMsg("Skip-month request submitted — awaiting Master/GM approval.");
      }
      setReliefTarget(null); setReliefReason(""); setReliefMonth(nextMonthStr()); loadAll();
    } catch (e) { setErr(e.message); }
  }

  const filtered = useMemo(() => loans.filter(l => {
    const empMatch = !filterEmp || `${l.employee_name || ""} ${l.employee_code || ""}`.toLowerCase().includes(filterEmp.toLowerCase());
    const statusMatch = filterStatus === "All" || l.status === filterStatus;
    return empMatch && statusMatch;
  }), [loans, filterEmp, filterStatus]);

  const totalOutstanding = useMemo(() => filtered.filter(l => l.status === "Active").reduce((s, l) => s + Number(l.outstanding_balance || 0), 0), [filtered]);

  // Blocks resubmitting a reschedule/skip while one's already awaiting
  // Master/GM approval, and surfaces it in the ledger instead of the buttons.
  const pendingChangeByLoan = useMemo(() => {
    const map = {};
    loanChanges.filter(c => c.status === "Pending").forEach(c => { map[c.loan_id] = c; });
    return map;
  }, [loanChanges]);

  const historyLoan = selectedHistory ? loans.filter(l => l.employee_code === selectedHistory || l.employee_id === selectedHistory) : [];
  const historyChanges = selectedHistory ? loanChanges.filter(c => c.employee_code === selectedHistory) : [];

  return (
    <>
    <div className="print:hidden">
      <PageTitle title="Loans & Advances" subtitle="Manage employee loan applications, rescheduling, relief and settlements."
        action={canManage && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowImport(s => !s)} className="rounded-2xl">{showImport ? "Cancel Import" : "Import Loans"}</Button>
            <Button onClick={() => setShowForm(s => !s)} className="rounded-2xl">{showForm ? "Cancel" : "+ New Loan"}</Button>
          </div>
        )} />

      {msg && <div className="mb-3 p-3 rounded-xl bg-blue-50 text-blue-700 text-sm">{msg}</div>}
      {err && <div className="mb-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{err}</div>}

      {canManage && showImport && (
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm mb-4">
          <h2 className="font-bold text-slate-800 mb-3">Import Loans</h2>
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 mb-3">
            <strong>Instructions:</strong> Employee Code must match an existing employee. Outstanding Balance is optional — leave blank for a
            fresh loan, or set it (including 0 for already paid-off loans) to import historical loans for the record; a balance of 0 is
            imported as Cleared. Guarantor codes are optional but if given must match existing employees and cannot be the borrower themselves.
            Repayment Months is auto-calculated from Loan Amount / Monthly Deduction.
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
              <div className="overflow-x-auto overflow-y-auto max-h-[70vh] rounded-xl border border-slate-200">
                <table className="w-full text-xs min-w-[900px]">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      {["Code", "Employee", "Loan Amount", "Outstanding", "Monthly Ded.", "Months", "Start Date", "Guarantor 1", "Guarantor 2", "Loan Status", "Status"].map(h => (
                        <th key={h} className="text-left px-3 py-2 font-medium sticky top-0 z-10 bg-slate-50 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {importPreview.map((row, i) => (
                      <tr key={i} className={row.status.startsWith("error") ? "bg-red-50" : row.status.startsWith("warning") ? "bg-yellow-50" : ""}>
                        <td className="px-3 py-2 font-mono">{row.code || "—"}</td>
                        <td className="px-3 py-2">{row.emp?.full_name || "—"}</td>
                        <td className="px-3 py-2 text-center">{money(row.loanAmount)}</td>
                        <td className="px-3 py-2 text-center">{money(row.outstandingBalance)}</td>
                        <td className="px-3 py-2 text-center">{money(row.monthlyDeduction)}</td>
                        <td className="px-3 py-2 text-center">{row.months || "—"}</td>
                        <td className="px-3 py-2">{row.startDate || "—"}</td>
                        <td className="px-3 py-2">{row.g1 ? `${row.g1.employee_code} — ${row.g1.full_name}` : row.g1Code || "—"}</td>
                        <td className="px-3 py-2">{row.g2 ? `${row.g2.employee_code} — ${row.g2.full_name}` : row.g2Code || "—"}</td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded-lg text-[11px] font-medium ${row.loanStatus === "Cleared" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{row.loanStatus}</span>
                        </td>
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

      {canManage && showForm && (
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

          <div className="mt-4 border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-slate-700">Guarantee Documents <span className="text-red-500">*</span></p>
              <Button variant="outline" onClick={addGuaranteeItem} className="rounded-xl text-xs py-1 px-2">+ Add Item</Button>
            </div>
            <p className="text-xs text-slate-400 mb-2">Photo of each item taken as security (CNIC, cheque, property papers, etc.) with a remark describing it. At least one is required to submit.</p>
            {guaranteeItems.length === 0 && <p className="text-xs text-slate-400 italic">No items added yet.</p>}
            <div className="space-y-2">
              {guaranteeItems.map((item, idx) => (
                <div key={idx} className="flex flex-wrap items-center gap-2 p-2 bg-slate-50 rounded-xl">
                  <input type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0] || null; updateGuaranteeItem(idx, { file: f, previewUrl: f ? URL.createObjectURL(f) : "" }); }} className="text-xs" />
                  {item.previewUrl && <img src={item.previewUrl} alt="" className="w-10 h-10 object-cover rounded-lg border border-slate-200" />}
                  <input value={item.remarks} onChange={e => updateGuaranteeItem(idx, { remarks: e.target.value })} placeholder="Remarks (e.g. Original CNIC, Cheque #1234...)" className="flex-1 min-w-[160px] px-3 py-1.5 rounded-xl border border-slate-200 text-xs" />
                  <button onClick={() => removeGuaranteeItem(idx)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 flex gap-2"><Button onClick={submitLoan} className="rounded-2xl">Submit Loan</Button><Button variant="outline" onClick={() => { setShowForm(false); setGuaranteeItems([]); }} className="rounded-2xl">Cancel</Button></div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-4">
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm"><p className="text-xs text-slate-500">Active Loans</p><p className="text-2xl font-bold">{loans.filter(l => l.status === "Active").length}</p></div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm"><p className="text-xs text-slate-500">Pending Approval</p><p className="text-2xl font-bold text-amber-600">{loans.filter(l => l.status === "Pending Approval").length}</p></div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm"><p className="text-xs text-slate-500">Pending Disbursement</p><p className="text-2xl font-bold text-purple-600">{loans.filter(l => l.status === "Pending Disbursement").length}</p></div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm"><p className="text-xs text-slate-500">Total Outstanding</p><p className="text-2xl font-bold text-red-500">{money(totalOutstanding)}</p></div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm"><p className="text-xs text-slate-500">Cleared Loans</p><p className="text-2xl font-bold text-emerald-600">{loans.filter(l => l.status === "Cleared").length}</p></div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm"><p className="text-xs text-slate-500">Total Loans</p><p className="text-2xl font-bold">{loans.length}</p></div>
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm mb-4">
        <div className="flex flex-wrap gap-3">
          <input value={filterEmp} onChange={e => setFilterEmp(e.target.value)} placeholder="Search by name or employee code..." className="flex-1 min-w-[160px] px-4 py-2 rounded-xl border border-slate-200 text-sm" />
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm">
            <option value="All">All Status</option><option>Active</option><option>Pending Approval</option><option>Pending Disbursement</option><option>Cleared</option><option>Rejected</option>
          </select>
        </div>
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto overflow-y-auto max-h-[70vh]">
        <div className="px-5 pt-4 pb-2"><h2 className="font-bold text-slate-800">Loan Ledger</h2><p className="text-xs text-slate-400 mt-0.5">{filtered.length} records</p></div>
        <table className="w-full min-w-[1050px] text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>{["Employee", "Guarantors", "Loan Amount", "Monthly Ded.", "Outstanding", "Start Date", "Months", "Status", "Documents", ...((canManage || canDisburse) ? ["Actions"] : [])].map(h => (
              <th key={h} className="text-left px-4 py-3 font-medium sticky top-0 z-10 bg-slate-50 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">{h}</th>
            ))}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0
              ? <tr><td colSpan={(canManage || canDisburse) ? 10 : 9} className="px-4 py-8 text-center text-slate-400">No loans found.</td></tr>
              : filtered.map(l => (
                <tr key={l.id}>
                  <td className="px-4 py-3">
                    <button onClick={() => setSelectedHistory(l.employee_code || l.employee_id)} className="font-medium text-blue-600 hover:underline">
                      {l.employee_name || l.employee_code || l.employee_id}
                    </button>
                    {l.employee_name && (l.employee_code || l.employee_id) && (
                      <div className="text-xs text-slate-400 font-mono">{l.employee_code || l.employee_id}</div>
                    )}
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
                  <td className="px-4 py-3">
                    <Badge tone={loanStatusTone(l.status)}>{l.status}</Badge>
                    {l.status === "Rejected" && l.rejection_reason && <div className="text-[11px] text-slate-400 mt-1">{l.rejection_reason}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(loanDocs[l.id] || []).map((d, di) => (
                        <a key={di} href={d.image_url} target="_blank" rel="noreferrer" title={d.remarks}>
                          <img src={d.image_url} alt="" className="w-8 h-8 object-cover rounded-lg border border-slate-200" />
                        </a>
                      ))}
                      {l.disbursement_receipt_url && (
                        <a href={l.disbursement_receipt_url} target="_blank" rel="noreferrer" title={`Receiving slip — disbursed by ${l.disbursed_by || "Finance"}`}>
                          <img src={l.disbursement_receipt_url} alt="" className="w-8 h-8 object-cover rounded-lg border border-purple-200" />
                        </a>
                      )}
                      {!(loanDocs[l.id] || []).length && !l.disbursement_receipt_url && "—"}
                    </div>
                  </td>
                  {(canManage || canDisburse) && (
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1 items-center">
                      {l.status !== "Pending Approval" && l.status !== "Rejected" && (
                        <Button variant="outline" onClick={() => setPrintingLoan(l)} className="rounded-xl text-xs py-1 px-2" title="Print approval slip to hand to Finance">🖨️ Print</Button>
                      )}
                      {canDisburse && l.status === "Pending Disbursement" && (
                        disburseTarget === l.id
                          ? <div className="flex flex-col gap-1 min-w-[180px]">
                              <input type="file" accept="image/*" onChange={e => setDisburseFile(e.target.files?.[0] || null)} className="text-xs" />
                              <div className="flex gap-1">
                                <Button onClick={() => disburseLoan(l.id)} disabled={disbursing} className="rounded-xl text-xs py-1 px-2">{disbursing ? "Saving…" : "Mark Paid"}</Button>
                                <Button variant="outline" onClick={() => { setDisburseTarget(null); setDisburseFile(null); }} className="rounded-xl text-xs py-1 px-2">Cancel</Button>
                              </div>
                            </div>
                          : <Button variant="outline" onClick={() => setDisburseTarget(l.id)} className="rounded-xl text-xs py-1 px-2 text-purple-600">Upload Receipt &amp; Mark Paid</Button>
                      )}
                      {canManage && l.status === "Active" && pendingChangeByLoan[l.id] && (
                        <Badge tone="blue">
                          Pending: {pendingChangeByLoan[l.id].change_type === "reschedule" ? "Reschedule" : "Skip Month"}
                        </Badge>
                      )}
                      {canManage && l.status === "Active" && !pendingChangeByLoan[l.id] && (
                        <>
                          {rescheduleTarget === l.id
                            ? <>
                                <input type="number" value={rescheduleAmount} onChange={e => setRescheduleAmount(e.target.value)} placeholder="New amount" className="w-24 px-2 py-1 rounded-xl border border-slate-200 text-xs" />
                                <input type="date" value={rescheduleDate} onChange={e => setRescheduleDate(e.target.value)} className="px-2 py-1 rounded-xl border border-slate-200 text-xs" />
                                <Button onClick={() => reschedule(l.id)} className="rounded-xl text-xs py-1 px-2">{role === "Master" ? "Confirm" : "Request"}</Button>
                                <Button variant="outline" onClick={() => setRescheduleTarget(null)} className="rounded-xl text-xs py-1 px-2">Cancel</Button>
                              </>
                            : <Button variant="outline" onClick={() => setRescheduleTarget(l.id)} className="rounded-xl text-xs py-1 px-2">Reschedule</Button>}
                          {reliefTarget === l.id
                            ? <div className="flex gap-1">
                                <input type="month" value={reliefMonth} onChange={e => setReliefMonth(e.target.value)} className="px-2 py-1 rounded-xl border border-slate-200 text-xs" />
                                <input value={reliefReason} onChange={e => setReliefReason(e.target.value)} placeholder="Reason..." className="w-28 px-2 py-1 rounded-xl border border-slate-200 text-xs" />
                                <Button onClick={() => skipMonth(l.id)} className="rounded-xl text-xs py-1 px-2">{role === "Master" ? "Skip" : "Request"}</Button>
                                <Button variant="outline" onClick={() => setReliefTarget(null)} className="rounded-xl text-xs py-1 px-2">×</Button>
                              </div>
                            : <Button variant="outline" onClick={() => setReliefTarget(l.id)} className="rounded-xl text-xs py-1 px-2">Skip Month</Button>}
                          {role === "Master" && (
                            <>
                              <Button variant="outline" onClick={() => { if (window.confirm(`Settle remaining ${money(l.outstanding_balance)}?`)) earlySettle(l.id); }} className="rounded-xl text-xs py-1 px-2 text-emerald-600">Early Settle</Button>
                              <Button variant="outline" onClick={() => clearLoan(l.id)} className="rounded-xl text-xs py-1 px-2">Clear</Button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                  )}
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
                  <div className="flex justify-between mb-1"><span className="font-semibold">{money(l.loan_amount)}</span><Badge tone={loanStatusTone(l.status)}>{l.status}</Badge></div>
                  <div className="text-slate-500">Monthly: {money(l.monthly_deduction)} · Start: {l.start_date}</div>
                  <div className="text-slate-500">Outstanding: {money(l.outstanding_balance)} · Reason: {l.reason || "—"}</div>
                  {(l.guarantor_1_name || l.guarantor_2_name) && (
                    <div className="text-slate-500">
                      Guarantors: {[l.guarantor_1_name && `${l.guarantor_1_code} — ${l.guarantor_1_name}`, l.guarantor_2_name && `${l.guarantor_2_code} — ${l.guarantor_2_name}`].filter(Boolean).join(", ")}
                    </div>
                  )}
                  {(loanDocs[l.id] || []).length > 0 && (
                    <div className="mt-2 border-t border-slate-50 pt-2">
                      <p className="text-xs font-semibold text-slate-400 mb-1">Guarantee Documents:</p>
                      <div className="flex flex-wrap gap-2">
                        {loanDocs[l.id].map((d, di) => (
                          <a key={di} href={d.image_url} target="_blank" rel="noreferrer" className="block">
                            <img src={d.image_url} alt="" className="w-14 h-14 object-cover rounded-lg border border-slate-200" title={d.remarks} />
                            <div className="text-[10px] text-slate-400 max-w-[56px] truncate">{d.remarks}</div>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                  {l.disbursement_receipt_url && (
                    <div className="mt-2 text-xs text-slate-500">
                      Disbursed by {l.disbursed_by || "Finance"} on {l.disbursed_at?.slice(0, 10)} —{" "}
                      <a href={l.disbursement_receipt_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">view receiving slip</a>
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

      {/* Print-only loan approval slip -- rendered as a sibling outside the
          print:hidden wrapper above (not nested inside it) so it actually
          shows when printing -- a print:block descendant of a print:hidden
          ancestor stays hidden, since the ancestor's display:none wins.
          Invisible on screen either way, only shown to the print
          stylesheet, so HR can hand a physical copy to Finance without
          printing the whole ledger page. */}
      {printingLoan && (() => {
        const l = printingLoan;
        const emp = employees.find(e => e.employee_code === (l.employee_code || l.employee_id));
        return (
          <div className="hidden print:block p-8 text-sm text-black">
            <h1 className="text-lg font-bold mb-1">Loan Approval Slip</h1>
            <p className="text-xs text-slate-500 mb-6">Printed {new Date().toLocaleString()}</p>

            <table className="w-full text-sm mb-6">
              <tbody>
                <tr><td className="py-1 pr-4 font-semibold w-48">Employee</td><td className="py-1">{l.employee_name || emp?.full_name} ({l.employee_code || l.employee_id})</td></tr>
                <tr><td className="py-1 pr-4 font-semibold">Department / Branch</td><td className="py-1">{emp?.department || "—"} / {emp?.branch || "—"}</td></tr>
                <tr><td className="py-1 pr-4 font-semibold">Loan Amount</td><td className="py-1">{money(l.loan_amount)}</td></tr>
                <tr><td className="py-1 pr-4 font-semibold">Monthly Deduction</td><td className="py-1">{money(l.monthly_deduction)}</td></tr>
                <tr><td className="py-1 pr-4 font-semibold">Repayment Months</td><td className="py-1">{l.repayment_months || "—"}</td></tr>
                <tr><td className="py-1 pr-4 font-semibold">Start Date</td><td className="py-1">{l.start_date || "—"}</td></tr>
                <tr><td className="py-1 pr-4 font-semibold">Reason</td><td className="py-1">{l.reason || "—"}</td></tr>
                <tr><td className="py-1 pr-4 font-semibold">Guarantors</td><td className="py-1">
                  {[l.guarantor_1_name && `${l.guarantor_1_code} — ${l.guarantor_1_name}`, l.guarantor_2_name && `${l.guarantor_2_code} — ${l.guarantor_2_name}`].filter(Boolean).join(", ") || "—"}
                </td></tr>
                <tr><td className="py-1 pr-4 font-semibold">Status</td><td className="py-1">{l.status}</td></tr>
                <tr><td className="py-1 pr-4 font-semibold">Approved By</td><td className="py-1">{l.approved_by || "—"}{l.approved_at ? ` on ${new Date(l.approved_at).toLocaleDateString()}` : ""}</td></tr>
              </tbody>
            </table>

            <div className="grid grid-cols-2 gap-8 mt-16">
              <div><div className="border-t border-black pt-1">HR Signature</div></div>
              <div><div className="border-t border-black pt-1">Finance Signature</div></div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
