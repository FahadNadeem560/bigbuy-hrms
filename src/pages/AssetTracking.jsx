import React, { useState, useMemo, useRef, useEffect } from "react";
import { Button, Badge, PageTitle } from "../components/ui.jsx";
import { supabase } from "../lib/supabaseClient.js";

const ITEMS = ["Uniform — Shirt", "Uniform — Trousers", "Uniform — Shoes", "ID Card", "Locker Key", "Cash Counter Bag", "Handheld Scanner", "Safety Vest"];
const SIZES = ["XS", "S", "M", "L", "XL", "XXL", "N/A"];
const CONDITIONS = ["Good", "Fair", "Damaged"];

let nextId = 1;
const BLANK = { employee: null, item: ITEMS[0], size: "M", qty: 1, issuedDate: new Date().toISOString().slice(0, 10), notes: "" };

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
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AssetTracking() {
  const [employees, setEmployees] = useState([]);
  const [assets, setAssets] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [filterEmp, setFilterEmp] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    supabase.from("employees").select("employee_code, full_name, department, branch").order("full_name")
      .then(({ data }) => setEmployees(data || []));
  }, []);

  function issueAsset() {
    if (!form.employee || !form.item) return;
    setAssets(a => [...a, {
      id: nextId++, employeeCode: form.employee.employee_code, employeeName: form.employee.full_name,
      item: form.item, size: form.size, qty: form.qty, issuedDate: form.issuedDate,
      notes: form.notes, status: "Issued", returnedDate: null, condition: null, clearance: false,
    }]);
    setForm(BLANK); setShowForm(false);
    setMsg(`${form.item} issued to ${form.employee.full_name}.`);
  }

  function returnAsset(id, condition) {
    setAssets(a => a.map(asset => asset.id === id
      ? { ...asset, status: "Returned", returnedDate: new Date().toISOString().slice(0, 10), condition, clearance: true }
      : asset));
    setMsg("Asset marked as returned.");
  }

  const filtered = useMemo(() => assets.filter(a => {
    const empOk = !filterEmp || (a.employeeName || a.employeeCode || "").toLowerCase().includes(filterEmp.toLowerCase());
    const statusOk = filterStatus === "All" || a.status === filterStatus;
    return empOk && statusOk;
  }), [assets, filterEmp, filterStatus]);

  const outstanding = assets.filter(a => a.status === "Issued");
  const empOutstanding = useMemo(() => {
    const map = {};
    outstanding.forEach(a => {
      if (!map[a.employeeCode]) map[a.employeeCode] = { name: a.employeeName, code: a.employeeCode, items: [] };
      map[a.employeeCode].items.push(a.item);
    });
    return Object.values(map);
  }, [outstanding]);

  return (
    <div>
      <PageTitle title="Uniform & Asset Tracking" subtitle="Issue, track and clear employee uniforms and assets."
        action={<Button onClick={() => setShowForm(s => !s)} className="rounded-2xl">{showForm ? "Cancel" : "+ Issue Asset"}</Button>} />

      {msg && <div className="mb-3 p-3 rounded-xl bg-blue-50 text-blue-700 text-sm">{msg}</div>}

      {showForm && (
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm mb-4">
          <h2 className="font-bold text-slate-800 mb-4">Issue Asset / Uniform</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="md:col-span-2 lg:col-span-1">
              <p className="text-xs text-slate-500 mb-1">Employee</p>
              <EmpPicker employees={employees} value={form.employee} onChange={v => setForm(f => ({ ...f, employee: v }))} />
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Item</p>
              <select value={form.item} onChange={e => setForm(f => ({ ...f, item: e.target.value }))}
                className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm">
                {ITEMS.map(i => <option key={i}>{i}</option>)}
              </select>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Size</p>
              <select value={form.size} onChange={e => setForm(f => ({ ...f, size: e.target.value }))}
                className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm">
                {SIZES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Quantity</p>
              <input type="number" min={1} value={form.qty} onChange={e => setForm(f => ({ ...f, qty: Number(e.target.value) }))}
                className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Issue Date</p>
              <input type="date" value={form.issuedDate} onChange={e => setForm(f => ({ ...f, issuedDate: e.target.value }))}
                className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Notes</p>
              <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={issueAsset} className="rounded-2xl">Issue Asset</Button>
            <Button variant="outline" onClick={() => setShowForm(false)} className="rounded-2xl">Cancel</Button>
          </div>
        </div>
      )}

      {/* Outstanding Report */}
      {empOutstanding.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4">
          <p className="font-semibold text-amber-800 mb-2">Outstanding Items — Pending Clearance ({empOutstanding.length} employees)</p>
          <div className="flex flex-wrap gap-2">
            {empOutstanding.map(e => (
              <div key={e.code} className="bg-white rounded-xl px-3 py-1.5 border border-amber-100 text-sm">
                <span className="font-medium">{e.name}</span>
                <span className="text-amber-600 ml-2">{e.items.length} item{e.items.length > 1 ? "s" : ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm mb-4">
        <div className="flex flex-wrap gap-3">
          <input value={filterEmp} onChange={e => setFilterEmp(e.target.value)} placeholder="Filter by employee..."
            className="flex-1 min-w-[160px] px-4 py-2 rounded-xl border border-slate-200 text-sm" />
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="px-4 py-2 rounded-xl border border-slate-200 text-sm">
            <option value="All">All</option><option>Issued</option><option>Returned</option>
          </select>
        </div>
      </div>

      {/* Asset Ledger */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
        <div className="px-5 pt-4 pb-2">
          <h2 className="font-bold text-slate-800">Asset Register</h2>
          <p className="text-xs text-slate-400 mt-0.5">{filtered.length} records</p>
        </div>
        <table className="w-full min-w-[800px] text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>{["Employee", "Item", "Size", "Qty", "Issued", "Status", "Returned", "Condition", "Clearance", "Action"].map(h => (
              <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
            ))}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0
              ? <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-400">No assets tracked yet.</td></tr>
              : filtered.map(a => (
                <tr key={a.id}>
                  <td className="px-4 py-3 font-medium">{a.employeeName}</td>
                  <td className="px-4 py-3">{a.item}</td>
                  <td className="px-4 py-3">{a.size}</td>
                  <td className="px-4 py-3">{a.qty}</td>
                  <td className="px-4 py-3">{a.issuedDate}</td>
                  <td className="px-4 py-3"><Badge tone={a.status === "Returned" ? "green" : "yellow"}>{a.status}</Badge></td>
                  <td className="px-4 py-3">{a.returnedDate || "—"}</td>
                  <td className="px-4 py-3">{a.condition || "—"}</td>
                  <td className="px-4 py-3"><Badge tone={a.clearance ? "green" : "red"}>{a.clearance ? "Cleared" : "Pending"}</Badge></td>
                  <td className="px-4 py-3">
                    {a.status === "Issued" && (
                      <select className="px-2 py-1 rounded-lg border border-slate-200 text-xs"
                        onChange={e => e.target.value && returnAsset(a.id, e.target.value)} defaultValue="">
                        <option value="">Return...</option>
                        {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
