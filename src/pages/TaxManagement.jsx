import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { Button, Badge, PageTitle } from "../components/ui.jsx";
import { money } from "../utils/format.js";

const DEFAULT_SLABS = [
  { fiscal_year: "2024-25", min_amount: 0, max_amount: 600000, base_tax: 0, rate_percentage: 0, label: "Up to 600,000" },
  { fiscal_year: "2024-25", min_amount: 600001, max_amount: 1200000, base_tax: 0, rate_percentage: 5, label: "600,001 – 1,200,000" },
  { fiscal_year: "2024-25", min_amount: 1200001, max_amount: 2200000, base_tax: 30000, rate_percentage: 15, label: "1,200,001 – 2,200,000" },
  { fiscal_year: "2024-25", min_amount: 2200001, max_amount: 3200000, base_tax: 180000, rate_percentage: 25, label: "2,200,001 – 3,200,000" },
  { fiscal_year: "2024-25", min_amount: 3200001, max_amount: 4100000, base_tax: 430000, rate_percentage: 30, label: "3,200,001 – 4,100,000" },
  { fiscal_year: "2024-25", min_amount: 4100001, max_amount: 999999999, base_tax: 700000, rate_percentage: 35, label: "Above 4,100,000" },
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
  const [taxHistory, setTaxHistory] = useState([]);
  const [selectedFY, setSelectedFY] = useState("2024-25");
  const [reportMonth, setReportMonth] = useState(curMonth);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const [{ data: sl }, { data: emps }, { data: ts }, { data: th }] = await Promise.all([
      supabase.from("tax_slabs").select("*").order("min_amount"),
      supabase.from("employees").select("employee_code, full_name, department, branch, salary, status").eq("status", "Active").order("full_name"),
      supabase.from("employee_tax_settings").select("*"),
      supabase.from("employee_tax_settings").select("*").order("created_at", { ascending: false }).limit(200),
    ]);
    setSlabs(sl && sl.length > 0 ? sl : DEFAULT_SLABS);
    setEmployees(emps || []);
    setTaxSettings(ts || []);
    setTaxHistory(th || []);
  }

  async function seedSlabs() {
    setErr("");
    await supabase.from("tax_slabs").delete().eq("fiscal_year", "2024-25");
    const { error } = await supabase.from("tax_slabs").insert(DEFAULT_SLABS);
    if (error) return setErr(error.message);
    setMsg("Tax slabs seeded for FY 2024-25."); loadAll();
  }

  async function toggleTax(empCode, current) {
    const existing = taxSettings.find(t => t.employee_code === empCode);
    if (existing) {
      await supabase.from("employee_tax_settings").update({ tax_enabled: !current }).eq("id", existing.id);
    } else {
      await supabase.from("employee_tax_settings").insert({ employee_code: empCode, tax_enabled: !current });
    }
    loadAll();
  }

  async function saveManualTax(empCode, val) {
    const existing = taxSettings.find(t => t.employee_code === empCode);
    if (existing) {
      await supabase.from("employee_tax_settings").update({ manual_tax_amount: Number(val) || null }).eq("id", existing.id);
    } else {
      await supabase.from("employee_tax_settings").insert({ employee_code: empCode, tax_enabled: true, manual_tax_amount: Number(val) || null });
    }
    loadAll();
  }

  const activeSlabs = slabs.filter(s => s.fiscal_year === selectedFY || !s.fiscal_year);

  const empTaxData = useMemo(() => employees.map(emp => {
    const setting = taxSettings.find(t => t.employee_code === emp.employee_code);
    const taxEnabled = setting ? setting.tax_enabled !== false : false;
    const annualSalary = Number(emp.salary || 0) * 12;
    const autoTax = calculateMonthlyTax(annualSalary, activeSlabs);
    const manualTax = setting?.manual_tax_amount;
    const monthlyTax = taxEnabled ? (manualTax != null ? Number(manualTax) : autoTax) : 0;
    return { ...emp, taxEnabled, annualSalary, autoTax, manualTax, monthlyTax };
  }), [employees, taxSettings, activeSlabs]);

  const reportData = useMemo(() => empTaxData.filter(e => e.taxEnabled && e.monthlyTax > 0), [empTaxData]);
  const totalMonthlyTax = useMemo(() => reportData.reduce((s, e) => s + e.monthlyTax, 0), [reportData]);

  const [manualInputs, setManualInputs] = useState({});

  return (
    <div>
      <PageTitle title="Tax Management" subtitle="Pakistan FBR income tax slabs, employee settings and monthly tax reports." />
      {msg && <div className="mb-3 p-3 rounded-xl bg-blue-50 text-blue-700 text-sm">{msg}</div>}
      {err && <div className="mb-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{err}</div>}

      <div className="flex flex-wrap gap-2 mb-4">
        {[["slabs", "Tax Slabs"], ["settings", "Employee Settings"], ["history", "History"], ["report", "Tax Report"]].map(([k, l]) => (
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
            {role === "Master" && (
              <Button onClick={seedSlabs} variant="outline" className="rounded-2xl">Seed Default Slabs (FY 2024-25)</Button>
            )}
          </div>
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
            <div className="px-5 pt-4 pb-2">
              <h2 className="font-bold text-slate-800">FBR Salaried Tax Slabs — {selectedFY}</h2>
              <p className="text-xs text-slate-400 mt-0.5">Annual income tax slabs for salaried individuals. Tax is deducted monthly (annual tax ÷ 12).</p>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>{["Income Range (Annual)", "Base Tax", "Rate on Excess", "Example: Rs. 1.5M/yr → Monthly Tax"].map(h => <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>)}</tr>
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
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
          <div className="px-5 pt-4 pb-2">
            <h2 className="font-bold text-slate-800">Employee Tax Settings</h2>
            <p className="text-xs text-slate-400">Toggle tax deduction per employee. Override with manual amount if needed.</p>
          </div>
          <table className="w-full min-w-[800px] text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>{["Employee", "Annual Salary", "Auto Tax/Mo", "Manual Override", "Monthly Tax", "Tax Enabled", "Action"].map(h => <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {empTaxData.map(emp => (
                <tr key={emp.employee_code}>
                  <td className="px-4 py-3 font-medium">{emp.full_name}<div className="text-xs text-slate-400">{emp.employee_code}</div></td>
                  <td className="px-4 py-3">{money(emp.annualSalary)}</td>
                  <td className="px-4 py-3">{money(emp.autoTax)}</td>
                  <td className="px-4 py-3">
                    <input type="number" value={manualInputs[emp.employee_code] ?? (emp.manualTax ?? "")}
                      onChange={e => setManualInputs(m => ({ ...m, [emp.employee_code]: e.target.value }))}
                      onBlur={e => { saveManualTax(emp.employee_code, e.target.value); }}
                      placeholder="Auto" className="w-28 px-3 py-1.5 rounded-xl border border-slate-200 text-xs" />
                  </td>
                  <td className="px-4 py-3 font-semibold">{emp.taxEnabled ? money(emp.monthlyTax) : <span className="text-slate-400">—</span>}</td>
                  <td className="px-4 py-3"><Badge tone={emp.taxEnabled ? "green" : "slate"}>{emp.taxEnabled ? "Yes" : "No"}</Badge></td>
                  <td className="px-4 py-3">
                    <Button variant="outline" onClick={() => toggleTax(emp.employee_code, emp.taxEnabled)} className="rounded-xl text-xs py-1 px-2">{emp.taxEnabled ? "Disable" : "Enable"}</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "history" && (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
          <div className="px-5 pt-4 pb-2"><h2 className="font-bold text-slate-800">Tax Deduction History</h2><p className="text-xs text-slate-400">Tax settings changes and deduction log per employee.</p></div>
          <table className="w-full min-w-[700px] text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>{["Employee", "Tax Enabled", "Manual Override", "Auto Calculated", "Updated"].map(h => <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {taxSettings.length === 0
                ? <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No tax settings configured yet.</td></tr>
                : taxSettings.map((t, i) => {
                    const emp = employees.find(e => e.employee_code === t.employee_code);
                    return (
                      <tr key={i}>
                        <td className="px-4 py-3 font-medium">{emp?.full_name || t.employee_code}</td>
                        <td className="px-4 py-3"><Badge tone={t.tax_enabled ? "green" : "slate"}>{t.tax_enabled ? "Yes" : "No"}</Badge></td>
                        <td className="px-4 py-3">{t.manual_tax_amount != null ? money(t.manual_tax_amount) : <span className="text-slate-400">—</span>}</td>
                        <td className="px-4 py-3">{emp ? money(calculateMonthlyTax(Number(emp.salary || 0) * 12, activeSlabs)) : "—"}</td>
                        <td className="px-4 py-3">{t.updated_at?.slice(0, 10) || t.created_at?.slice(0, 10) || "—"}</td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>
      )}

      {tab === "report" && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div><p className="text-xs text-slate-500 mb-1">Report Month</p><input type="month" value={reportMonth} onChange={e => setReportMonth(e.target.value)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm" /></div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
            <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm"><p className="text-xs text-slate-500">Taxable Employees</p><p className="text-2xl font-bold">{reportData.length}</p></div>
            <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm"><p className="text-xs text-slate-500">Total Monthly Tax</p><p className="text-2xl font-bold text-red-500">{money(totalMonthlyTax)}</p></div>
            <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm"><p className="text-xs text-slate-500">Annual Tax Liability</p><p className="text-2xl font-bold">{money(totalMonthlyTax * 12)}</p></div>
          </div>
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
            <div className="px-5 pt-4 pb-2"><h2 className="font-bold text-slate-800">Employee-wise Tax Report — {reportMonth}</h2></div>
            <table className="w-full min-w-[700px] text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>{["Employee", "Department", "Monthly Salary", "Annual Salary", "Tax Slab", "Monthly Tax"].map(h => <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reportData.length === 0
                  ? <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No employees with tax enabled.</td></tr>
                  : reportData.map(emp => {
                      const slab = activeSlabs.find(s => emp.annualSalary >= Number(s.min_amount) && emp.annualSalary <= Number(s.max_amount));
                      return (
                        <tr key={emp.employee_code}>
                          <td className="px-4 py-3 font-medium">{emp.full_name}<div className="text-xs text-slate-400">{emp.employee_code}</div></td>
                          <td className="px-4 py-3">{emp.department}</td>
                          <td className="px-4 py-3">{money(emp.salary)}</td>
                          <td className="px-4 py-3">{money(emp.annualSalary)}</td>
                          <td className="px-4 py-3"><Badge tone="yellow">{slab?.rate_percentage ?? 0}%</Badge></td>
                          <td className="px-4 py-3 font-bold text-red-500">{money(emp.monthlyTax)}</td>
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
