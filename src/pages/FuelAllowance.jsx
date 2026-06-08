import React, { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { Button, Badge, PageTitle } from "../components/ui.jsx";
import { money } from "../utils/format.js";

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

export default function FuelAllowance({ role }) {
  const now = new Date();
  const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [tab, setTab] = useState("rates");
  const [fuelRates, setFuelRates] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [claims, setClaims] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [rateForm, setRateForm] = useState({ rate_per_km: "", effective_from: "" });
  const [vehicleForm, setVehicleForm] = useState({ employee: null, vehicle_type: "Car", registration: "", is_eligible: true });
  const [claimForm, setClaimForm] = useState({ employee: null, claim_month: curMonth, km_traveled: "", route: "", trip_date: "", purpose: "" });
  const [showRateForm, setShowRateForm] = useState(false);
  const [showVehicleForm, setShowVehicleForm] = useState(false);
  const [showClaimForm, setShowClaimForm] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const [{ data: fr }, { data: v }, { data: c }, { data: emps }] = await Promise.all([
      supabase.from("fuel_rates").select("*").order("effective_from", { ascending: false }),
      supabase.from("employee_vehicles").select("*").order("created_at", { ascending: false }),
      supabase.from("fuel_claims").select("*").order("created_at", { ascending: false }).limit(300),
      supabase.from("employees").select("employee_code, full_name, department, branch").order("full_name"),
    ]);
    setFuelRates(fr || []);
    setVehicles(v || []);
    setClaims(c || []);
    setEmployees(emps || []);
  }

  const currentRate = fuelRates[0]?.rate_per_km || 0;

  async function saveRate() {
    if (!rateForm.rate_per_km || !rateForm.effective_from) return setErr("Rate and effective date required.");
    setErr("");
    const { error } = await supabase.from("fuel_rates").insert({ rate_per_km: Number(rateForm.rate_per_km), effective_from: rateForm.effective_from, created_by: "Master" });
    if (error) return setErr(error.message);
    setMsg("Fuel rate saved."); setRateForm({ rate_per_km: "", effective_from: "" }); setShowRateForm(false); loadAll();
  }

  async function saveVehicle() {
    if (!vehicleForm.employee) return setErr("Employee is required.");
    setErr("");
    const { error } = await supabase.from("employee_vehicles").insert({
      employee_code: vehicleForm.employee.employee_code, employee_name: vehicleForm.employee.full_name,
      vehicle_type: vehicleForm.vehicle_type, registration: vehicleForm.registration, is_eligible: vehicleForm.is_eligible,
    });
    if (error) return setErr(error.message);
    setMsg("Vehicle assigned."); setVehicleForm({ employee: null, vehicle_type: "Car", registration: "", is_eligible: true }); setShowVehicleForm(false); loadAll();
  }

  async function submitClaim() {
    if (!claimForm.employee || !claimForm.km_traveled || !claimForm.claim_month) return setErr("Employee, KM and month required.");
    setErr("");
    const rate = currentRate;
    const amount = Number(claimForm.km_traveled) * Number(rate);
    const { error } = await supabase.from("fuel_claims").insert({
      employee_code: claimForm.employee.employee_code, employee_name: claimForm.employee.full_name,
      claim_month: claimForm.claim_month, km_traveled: Number(claimForm.km_traveled),
      route: claimForm.route, trip_date: claimForm.trip_date, purpose: claimForm.purpose,
      calculated_amount: amount, rate_used: Number(rate), status: "Pending",
    });
    if (error) return setErr(error.message);
    setMsg(`Claim submitted: ${claimForm.km_traveled} KM × Rs.${rate}/km = ${money(amount)}`);
    setClaimForm({ employee: null, claim_month: curMonth, km_traveled: "", route: "", trip_date: "", purpose: "" });
    setShowClaimForm(false); loadAll();
  }

  async function approveClaim(id) {
    await supabase.from("fuel_claims").update({ status: "Approved", approved_by: "Master", approved_at: new Date().toISOString() }).eq("id", id);
    setMsg("Claim approved."); loadAll();
  }

  async function rejectClaim(id) {
    await supabase.from("fuel_claims").update({ status: "Rejected" }).eq("id", id);
    loadAll();
  }

  const pending = claims.filter(c => c.status === "Pending");

  const deptReport = useMemo(() => {
    const map = {};
    claims.filter(c => c.status === "Approved").forEach(c => {
      const emp = employees.find(e => e.employee_code === c.employee_code);
      const dept = emp?.department || "Unknown";
      if (!map[dept]) map[dept] = { dept, count: 0, totalKm: 0, totalAmt: 0 };
      map[dept].count++;
      map[dept].totalKm += Number(c.km_traveled || 0);
      map[dept].totalAmt += Number(c.calculated_amount || 0);
    });
    return Object.values(map).sort((a, b) => b.totalAmt - a.totalAmt);
  }, [claims, employees]);

  const statusTone = s => s === "Approved" ? "green" : s === "Rejected" ? "red" : "yellow";

  return (
    <div>
      <PageTitle title="Fuel Allowance" subtitle="Manage fuel rates, vehicle assignments, KM claims and approval workflow." />
      {msg && <div className="mb-3 p-3 rounded-xl bg-blue-50 text-blue-700 text-sm">{msg}</div>}
      {err && <div className="mb-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{err}</div>}

      <div className="flex flex-wrap gap-2 mb-4">
        {[["rates", "Fuel Rates"], ["vehicles", "Vehicles"], ["claims", "KM Claims"], ["approval", `Approval (${pending.length})`], ["reports", "Reports"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${tab === k ? "bg-slate-950 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{l}</button>
        ))}
      </div>

      {tab === "rates" && (
        <div>
          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm mb-4 flex items-center gap-4">
            <div><p className="text-xs text-slate-500">Current Rate</p><p className="text-3xl font-bold text-emerald-600">Rs. {currentRate}<span className="text-sm font-normal text-slate-400">/km</span></p></div>
            {role === "Master" && <Button onClick={() => setShowRateForm(s => !s)} className="rounded-2xl ml-auto">{showRateForm ? "Cancel" : "Update Rate"}</Button>}
          </div>
          {showRateForm && (
            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm mb-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><p className="text-xs text-slate-500 mb-1">Rate per KM (Rs.)</p><input type="number" value={rateForm.rate_per_km} onChange={e => setRateForm(v => ({ ...v, rate_per_km: e.target.value }))} placeholder="e.g. 18" className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" /></div>
                <div><p className="text-xs text-slate-500 mb-1">Effective From</p><input type="date" value={rateForm.effective_from} onChange={e => setRateForm(v => ({ ...v, effective_from: e.target.value }))} className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" /></div>
              </div>
              <div className="mt-3 flex gap-2"><Button onClick={saveRate} className="rounded-2xl">Save</Button><Button variant="outline" onClick={() => setShowRateForm(false)} className="rounded-2xl">Cancel</Button></div>
            </div>
          )}
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
            <div className="px-5 pt-4 pb-2"><h2 className="font-bold text-slate-800">Rate History</h2></div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500"><tr>{["Rate/km", "Effective From", "Set By"].map(h => <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {fuelRates.length === 0 ? <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-400">No rates configured.</td></tr>
                  : fuelRates.map(r => <tr key={r.id}><td className="px-4 py-3 font-semibold">Rs. {r.rate_per_km}/km</td><td className="px-4 py-3">{r.effective_from}</td><td className="px-4 py-3">{r.created_by || "—"}</td></tr>)}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "vehicles" && (
        <div>
          <div className="flex justify-end mb-3"><Button onClick={() => setShowVehicleForm(s => !s)} className="rounded-2xl">{showVehicleForm ? "Cancel" : "+ Assign Vehicle"}</Button></div>
          {showVehicleForm && (
            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm mb-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><p className="text-xs text-slate-500 mb-1">Employee *</p><EmpPicker employees={employees} value={vehicleForm.employee} onChange={v => setVehicleForm(f => ({ ...f, employee: v }))} /></div>
                <div><p className="text-xs text-slate-500 mb-1">Vehicle Type</p><select value={vehicleForm.vehicle_type} onChange={e => setVehicleForm(f => ({ ...f, vehicle_type: e.target.value }))} className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm"><option>Car</option><option>Motorcycle</option><option>Van</option></select></div>
                <div><p className="text-xs text-slate-500 mb-1">Registration No.</p><input value={vehicleForm.registration} onChange={e => setVehicleForm(f => ({ ...f, registration: e.target.value }))} className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" /></div>
                <div><p className="text-xs text-slate-500 mb-1">Fuel Claim Eligible</p><select value={vehicleForm.is_eligible ? "yes" : "no"} onChange={e => setVehicleForm(f => ({ ...f, is_eligible: e.target.value === "yes" }))} className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm"><option value="yes">Yes</option><option value="no">No</option></select></div>
              </div>
              <div className="mt-3 flex gap-2"><Button onClick={saveVehicle} className="rounded-2xl">Save</Button><Button variant="outline" onClick={() => setShowVehicleForm(false)} className="rounded-2xl">Cancel</Button></div>
            </div>
          )}
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500"><tr>{["Employee", "Vehicle Type", "Registration", "Eligible"].map(h => <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {vehicles.length === 0 ? <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">No vehicles assigned.</td></tr>
                  : vehicles.map(v => <tr key={v.id}><td className="px-4 py-3 font-medium">{v.employee_name || v.employee_code}</td><td className="px-4 py-3">{v.vehicle_type}</td><td className="px-4 py-3">{v.registration || "—"}</td><td className="px-4 py-3"><Badge tone={v.is_eligible ? "green" : "slate"}>{v.is_eligible ? "Yes" : "No"}</Badge></td></tr>)}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "claims" && (
        <div>
          <div className="flex justify-end mb-3"><Button onClick={() => setShowClaimForm(s => !s)} className="rounded-2xl">{showClaimForm ? "Cancel" : "+ Submit KM Claim"}</Button></div>
          {showClaimForm && (
            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm mb-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><p className="text-xs text-slate-500 mb-1">Employee *</p><EmpPicker employees={employees} value={claimForm.employee} onChange={v => setClaimForm(f => ({ ...f, employee: v }))} /></div>
                <div><p className="text-xs text-slate-500 mb-1">Claim Month *</p><input type="month" value={claimForm.claim_month} onChange={e => setClaimForm(f => ({ ...f, claim_month: e.target.value }))} className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" /></div>
                <div><p className="text-xs text-slate-500 mb-1">KM Traveled *</p><input type="number" value={claimForm.km_traveled} onChange={e => setClaimForm(f => ({ ...f, km_traveled: e.target.value }))} placeholder="0" className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" /></div>
                <div><p className="text-xs text-slate-500 mb-1">Trip Date</p><input type="date" value={claimForm.trip_date} onChange={e => setClaimForm(f => ({ ...f, trip_date: e.target.value }))} className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" /></div>
                <div><p className="text-xs text-slate-500 mb-1">Route</p><input value={claimForm.route} onChange={e => setClaimForm(f => ({ ...f, route: e.target.value }))} placeholder="e.g. Office → Client" className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" /></div>
                <div><p className="text-xs text-slate-500 mb-1">Purpose</p><input value={claimForm.purpose} onChange={e => setClaimForm(f => ({ ...f, purpose: e.target.value }))} placeholder="Meeting, delivery, etc." className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" /></div>
              </div>
              {claimForm.km_traveled && currentRate > 0 && (
                <div className="mt-3 p-3 bg-emerald-50 rounded-xl text-sm text-emerald-700">
                  Calculated: {claimForm.km_traveled} km × Rs.{currentRate}/km = <strong>{money(Number(claimForm.km_traveled) * Number(currentRate))}</strong>
                </div>
              )}
              <div className="mt-3 flex gap-2"><Button onClick={submitClaim} className="rounded-2xl">Submit Claim</Button><Button variant="outline" onClick={() => setShowClaimForm(false)} className="rounded-2xl">Cancel</Button></div>
            </div>
          )}
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
            <table className="w-full min-w-[800px] text-sm">
              <thead className="bg-slate-50 text-slate-500"><tr>{["Employee", "Month", "KM", "Route", "Purpose", "Amount", "Status"].map(h => <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {claims.length === 0 ? <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No claims.</td></tr>
                  : claims.map(c => <tr key={c.id}><td className="px-4 py-3 font-medium">{c.employee_name || c.employee_code}</td><td className="px-4 py-3">{c.claim_month}</td><td className="px-4 py-3">{c.km_traveled} km</td><td className="px-4 py-3 text-slate-500">{c.route || "—"}</td><td className="px-4 py-3 text-slate-500">{c.purpose || "—"}</td><td className="px-4 py-3 font-semibold">{money(c.calculated_amount)}</td><td className="px-4 py-3"><Badge tone={statusTone(c.status)}>{c.status}</Badge></td></tr>)}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "approval" && (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
          <div className="px-5 pt-4 pb-2"><h2 className="font-bold text-slate-800">Fuel Claim Approval</h2><p className="text-xs text-slate-400">{pending.length} pending</p></div>
          <table className="w-full min-w-[800px] text-sm">
            <thead className="bg-slate-50 text-slate-500"><tr>{["Employee", "Month", "KM", "Amount", "Status", "Action"].map(h => <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {claims.length === 0 ? <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No claims.</td></tr>
                : claims.map(c => <tr key={c.id}><td className="px-4 py-3 font-medium">{c.employee_name || c.employee_code}</td><td className="px-4 py-3">{c.claim_month}</td><td className="px-4 py-3">{c.km_traveled} km</td><td className="px-4 py-3 font-semibold">{money(c.calculated_amount)}</td><td className="px-4 py-3"><Badge tone={statusTone(c.status)}>{c.status}</Badge></td><td className="px-4 py-3">{c.status === "Pending" && role === "Master" && <div className="flex gap-1"><Button onClick={() => approveClaim(c.id)} className="rounded-xl text-xs py-1 px-2">Approve</Button><Button variant="outline" onClick={() => rejectClaim(c.id)} className="rounded-xl text-xs py-1 px-2">Reject</Button></div>}</td></tr>)}
            </tbody>
          </table>
        </div>
      )}

      {tab === "reports" && (
        <div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
            <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm"><p className="text-xs text-slate-500">Total Claims</p><p className="text-2xl font-bold">{claims.length}</p></div>
            <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm"><p className="text-xs text-slate-500">Approved Total</p><p className="text-2xl font-bold text-emerald-600">{money(claims.filter(c => c.status === "Approved").reduce((s, c) => s + Number(c.calculated_amount || 0), 0))}</p></div>
            <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm"><p className="text-xs text-slate-500">Pending Amount</p><p className="text-2xl font-bold text-yellow-600">{money(pending.reduce((s, c) => s + Number(c.calculated_amount || 0), 0))}</p></div>
          </div>
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
            <div className="px-5 pt-4 pb-2"><h2 className="font-bold text-slate-800">Department-wise Fuel Expense</h2></div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500"><tr>{["Department", "Claims", "Total KM", "Total Amount"].map(h => <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {deptReport.length === 0 ? <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">No approved claims.</td></tr>
                  : deptReport.map((d, i) => <tr key={i}><td className="px-4 py-3 font-medium">{d.dept}</td><td className="px-4 py-3">{d.count}</td><td className="px-4 py-3">{d.totalKm} km</td><td className="px-4 py-3 font-semibold">{money(d.totalAmt)}</td></tr>)}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
