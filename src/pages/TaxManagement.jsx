import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { Button, Badge, PageTitle } from "../components/ui.jsx";
import { money } from "../utils/format.js";

const DEFAULT_SLABS = [
  { fiscal_year: "2024-25", min_amount: 0,       max_amount: 600000,   base_tax: 0,      rate_percentage: 0,  label: "Up to 600,000" },
  { fiscal_year: "2024-25", min_amount: 600001,  max_amount: 1200000,  base_tax: 0,      rate_percentage: 5,  label: "600,001 – 1,200,000" },
  { fiscal_year: "2024-25", min_amount: 1200001, max_amount: 2200000,  base_tax: 30000,  rate_percentage: 15, label: "1,200,001 – 2,200,000" },
  { fiscal_year: "2024-25", min_amount: 2200001, max_amount: 3200000,  base_tax: 180000, rate_percentage: 25, label: "2,200,001 – 3,200,000" },
  { fiscal_year: "2024-25", min_amount: 3200001, max_amount: 4100000,  base_tax: 430000, rate_percentage: 30, label: "3,200,001 – 4,100,000" },
  { fiscal_year: "2024-25", min_amount: 4100001, max_amount: 999999999,base_tax: 700000, rate_percentage: 35, label: "Above 4,100,000" },
];

export function calculateMonthlyTax(annualSalary, slabs) {
  const s = (slabs && slabs.length > 0) ? slabs : DEFAULT_SLABS;
  const annual = Number(annualSalary || 0);
  if (annual <= 0) return 0;
  const slab = s.find(sl => annual >= Number(sl.min_amount) && annual <= Number(sl.max_amount));
  if (!slab || Number(slab.rate_percentage) === 0) return 0;
  const annualTax = Number(slab.base_tax) + ((annual - Number(slab.min_amount)) * Number(slab.rate_percentage) / 100);
  return Math.round(annualTax / 12);
}

export default function TaxManagement({ role }) {
  const now = new Date();
  const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [tab, setTab] = useState("slabs");
  const [slabs, setSlabs] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [taxSettings, setTaxSettings] = useState([]);
  const [selectedFY, setSelectedFY] = useState("2024-25");
  const [reportMonth, setReportMonth] = useState(curMonth);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  // Per-employee inline edit state
  const [editingCode, setEditingCode] = useState(null);
  const [editMode, setEditMode] = useState("auto");
  const [editAmount, setEditAmount] = useState("");
  const [editReason, setEditReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const [{ data: sl }, { data: emps }, { data: ts }] = await Promise.all([
      supabase.from("tax_slabs").select("*").order("min_amount"),
      supabase.from("employees").select("employee_code, full_name, department, branch, salary, status, staff_level").eq("status", "Active").order("full_name"),
      supabase.from("employee_tax_settings").select("*"),
    ]);
    setSlabs(sl && sl.length > 0 ? sl : DEFAULT_SLABS);
    setEmployees(emps || []);
    setTaxSettings(ts || []);
  }

  async function seedSlabs() {
    setErr("");
    await supabase.from("tax_slabs").delete().eq("fiscal_year", "2024-25");
    const { error } = await supabase.from("tax_slabs").insert(DEFAULT_SLABS);
    if (error) return setErr(error.message);
    setMsg("Tax slabs seeded for FY 2024-25."); loadAll();
  }

  function startEdit(emp, setting) {
    setEditingCode(emp.employee_code);
    setEditMode(setting?.tax_mode || "auto");
    setEditAmount(setting?.manual_tax_amount != null ? String(setting.manual_tax_amount) : "");
    setEditReason(setting?.exempt_reason || "");
  }

  async function saveMode(empCode) {
    if (editMode === "exempt" && !editReason.trim()) {
      setErr("Exemption reason is required for Exempt mode."); return;
    }
    if (editMode === "manual" && !editAmount) {
      setErr("Manual tax amount is required."); return;
    }
    setErr(""); setSaving(true);
    const existing = taxSettings.find(t => t.employee_code === empCode);
    const payload = {
      employee_code: empCode,
      tax_mode: editMode,
      tax_enabled: editMode !== "exempt",
      manual_tax_amount: editMode === "manual" ? Number(editAmount) : null,
      exempt_reason: editMode === "exempt" ? editReason : null,
      updated_at: new Date().toISOString(),
    };
    let error;
    if (existing) {
      ({ error } = await supabase.from("employee_tax_settings").update(payload).eq("id", existing.id));
    } else {
      ({ error } = await supabase.from("employee_tax_settings").insert(payload));
    }
    setSaving(false);
    if (error) { setErr(error.message); return; }
    setMsg("Tax settings saved."); setEditingCode(null); loadAll();
  }

  const activeSlabs = slabs.filter(s => s.fiscal_year === selectedFY || !s.fiscal_year);

  const empTaxData = useMemo(() => employees.map(emp => {
    const setting = taxSettings.find(t => t.employee_code === emp.employee_code);
    const taxMode = setting?.tax_mode || "auto";
    const annualSalary = Number(emp.salary || 0) * 12;
    const autoTax = calculateMonthlyTax(annualSalary, activeSlabs);
    let monthlyTax = 0;
    if (taxMode === "auto") monthlyTax = autoTax;
    else if (taxMode === "manual") monthlyTax = Number(setting?.manual_tax_amount || 0);
    else monthlyTax = 0; // exempt
    return { ...emp, taxMode, annualSalary, autoTax, monthlyTax, setting };
  }), [employees, taxSettings, activeSlabs]);

  const reportData = useMemo(() => empTaxData.filter(e => e.taxMode !== "exempt" && e.monthlyTax > 0), [empTaxData]);
  const totalMonthlyTax = useMemo(() => reportData.reduce((s, e) => s + e.monthlyTax, 0), [reportData]);

  const modeBadge = (mode) => {
    if (mode === "auto")   return <Badge tone="blue">Auto</Badge>;
    if (mode === "manual") return <Badge tone="yellow">Manual</Badge>;
    if (mode === "exempt") return <Badge tone="green">Exempt</Badge>;
    return <Badge tone="slate">{mode}</Badge>;
  };

  return (
    <div>
      <PageTitle title="Tax Management" subtitle="Pakistan FBR income tax slabs, per-employee mode (Auto / Manual / Exempt) and monthly reports." />
      {msg && <div className="mb-3 p-3 rounded-xl bg-blue-50 text-blue-700 text-sm">{msg}</div>}
      {err && <div className="mb-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{err}</div>}

      <div className="flex flex-wrap gap-2 mb-4">
        {[["slabs","Tax Slabs"],["settings","Employee Settings"],["report","Tax Report"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${tab === k ? "bg-slate-950 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{l}</button>
        ))}
      </div>

      {tab === "slabs" && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <select value={selectedFY} onChange={e => setSelectedFY(e.target.value)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm">
              <option value="2024-25">FY 2024-25</option>
              <option value="2025-26">FY 2025-26</option>
            </select>
            {(role === "Master" || role === "Finance") && (
              <Button onClick={seedSlabs} variant="outline" className="rounded-2xl">Seed Default Slabs</Button>
            )}
          </div>
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
            <div className="px-5 pt-4 pb-2">
              <h2 className="font-bold text-slate-800">FBR Salaried Tax Slabs — {selectedFY}</h2>
              <p className="text-xs text-slate-400 mt-0.5">Annual income tax for salaried individuals. Deducted monthly (annual ÷ 12).</p>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>{["Income Range (Annual)","Base Tax","Rate on Excess","Example: 1.5M/yr"].map(h => <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(activeSlabs.length > 0 ? activeSlabs : DEFAULT_SLABS).map((s, i) => {
                  const eg = calculateMonthlyTax(1500000, activeSlabs.length > 0 ? activeSlabs : DEFAULT_SLABS);
                  return (
                    <tr key={i}>
                      <td className="px-4 py-3 font-medium">{s.label || `${money(s.min_amount)} – ${s.max_amount >= 999999999 ? "Above" : money(s.max_amount)}`}</td>
                      <td className="px-4 py-3">{money(s.base_tax)}</td>
                      <td className="px-4 py-3"><Badge tone={Number(s.rate_percentage) === 0 ? "green" : "yellow"}>{s.rate_percentage}%</Badge></td>
                      <td className="px-4 py-3 text-slate-500">{i === 1 ? money(eg) + "/mo" : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "settings" && (
        <div>
          <div className="bg-blue-50 rounded-2xl p-4 mb-4 text-sm text-blue-700">
            <strong>Tax Modes:</strong> Auto = FBR slab calculation · Manual = fixed monthly amount · Exempt = no tax deduction (reason required)
          </div>
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
            <div className="px-5 pt-4 pb-2">
              <h2 className="font-bold text-slate-800">Employee Tax Settings</h2>
              <p className="text-xs text-slate-400">{employees.length} active employees</p>
            </div>
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>{["Employee","Dept","Monthly Salary","Auto Tax/Mo","Mode","Monthly Tax","Action"].map(h => <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {empTaxData.map(emp => {
                  const isEditing = editingCode === emp.employee_code;
                  return (
                    <tr key={emp.employee_code} className={emp.taxMode === "exempt" ? "bg-green-50/30" : ""}>
                      <td className="px-4 py-3 font-medium">
                        {emp.full_name}
                        <div className="text-xs text-slate-400">{emp.employee_code}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{emp.department}</td>
                      <td className="px-4 py-3">{money(emp.salary)}</td>
                      <td className="px-4 py-3">{money(emp.autoTax)}</td>
                      <td className="px-4 py-3">{modeBadge(emp.taxMode)}</td>
                      <td className="px-4 py-3 font-semibold">
                        {emp.taxMode === "exempt"
                          ? <span className="text-green-600">Exempt</span>
                          : money(emp.monthlyTax)}
                      </td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <div className="space-y-2 min-w-[260px]">
                            <div className="flex gap-3">
                              {[["auto","Auto"],["manual","Manual"],["exempt","Exempt"]].map(([v, l]) => (
                                <label key={v} className="flex items-center gap-1.5 cursor-pointer">
                                  <input type="radio" value={v} checked={editMode === v} onChange={() => setEditMode(v)}
                                    className="accent-slate-800" />
                                  <span className="text-sm">{l}</span>
                                </label>
                              ))}
                            </div>
                            {editMode === "manual" && (
                              <input type="number" value={editAmount} onChange={e => setEditAmount(e.target.value)}
                                placeholder="Monthly tax amount" className="w-full px-3 py-1.5 rounded-xl border border-slate-200 text-xs" />
                            )}
                            {editMode === "exempt" && (
                              <input value={editReason} onChange={e => setEditReason(e.target.value)}
                                placeholder="Exemption reason (required)" className="w-full px-3 py-1.5 rounded-xl border border-slate-200 text-xs" />
                            )}
                            <div className="flex gap-2">
                              <Button onClick={() => saveMode(emp.employee_code)} disabled={saving} className="rounded-xl text-xs py-1 px-3">
                                {saving ? "Saving..." : "Save"}
                              </Button>
                              <Button variant="outline" onClick={() => setEditingCode(null)} className="rounded-xl text-xs py-1 px-3">Cancel</Button>
                            </div>
                          </div>
                        ) : (
                          <Button variant="outline" onClick={() => startEdit(emp, emp.setting)} className="rounded-xl text-xs py-1 px-3">Edit</Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "report" && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div>
              <p className="text-xs text-slate-500 mb-1">Report Month</p>
              <input type="month" value={reportMonth} onChange={e => setReportMonth(e.target.value)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm"><p className="text-xs text-slate-500">Total Employees</p><p className="text-2xl font-bold">{employees.length}</p></div>
            <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm"><p className="text-xs text-slate-500">Taxable</p><p className="text-2xl font-bold">{reportData.length}</p></div>
            <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm"><p className="text-xs text-slate-500">Exempt</p><p className="text-2xl font-bold text-green-600">{empTaxData.filter(e => e.taxMode === "exempt").length}</p></div>
            <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm"><p className="text-xs text-slate-500">Monthly Tax Total</p><p className="text-2xl font-bold text-red-500">{money(totalMonthlyTax)}</p></div>
          </div>
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
            <div className="px-5 pt-4 pb-2"><h2 className="font-bold text-slate-800">Tax Report — {reportMonth}</h2></div>
            <table className="w-full min-w-[700px] text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>{["Employee","Dept","Salary/Mo","Annual Salary","Mode","Tax Slab","Monthly Tax"].map(h => <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {empTaxData.length === 0
                  ? <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No employees found.</td></tr>
                  : empTaxData.map(emp => {
                      const slab = activeSlabs.find(s => emp.annualSalary >= Number(s.min_amount) && emp.annualSalary <= Number(s.max_amount));
                      return (
                        <tr key={emp.employee_code} className={emp.taxMode === "exempt" ? "opacity-50" : ""}>
                          <td className="px-4 py-3 font-medium">{emp.full_name}<div className="text-xs text-slate-400">{emp.employee_code}</div></td>
                          <td className="px-4 py-3">{emp.department}</td>
                          <td className="px-4 py-3">{money(emp.salary)}</td>
                          <td className="px-4 py-3">{money(emp.annualSalary)}</td>
                          <td className="px-4 py-3">{modeBadge(emp.taxMode)}</td>
                          <td className="px-4 py-3">
                            {emp.taxMode === "exempt" ? <span className="text-green-600 text-xs">{emp.setting?.exempt_reason || "—"}</span>
                              : <Badge tone="yellow">{slab?.rate_percentage ?? 0}%</Badge>}
                          </td>
                          <td className="px-4 py-3 font-bold">
                            {emp.taxMode === "exempt"
                              ? <span className="text-green-600">0 (Exempt)</span>
                              : <span className="text-red-500">{money(emp.monthlyTax)}</span>}
                          </td>
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
