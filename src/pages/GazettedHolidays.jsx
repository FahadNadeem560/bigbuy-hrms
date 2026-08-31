import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { Button, Badge, PageTitle } from "../components/ui.jsx";

// One-click public / gazetted holiday marking. Writing a date here (and hitting
// Apply) stamps every employee's attendance row for that day via
// apply_gazetted_holiday() -> reclassify_attendance_row(), so it shows as
// "Gazetted Holiday" on every timesheet and flows into payroll:
//   - didn't work  -> paid day off, no absence deduction, all groups
//   - worked it     -> +1 day's pay for GH-eligible groups (Sales/Support,
//                      Floor Management); Management/Admin = normal pay
// Months whose payroll is already Published are never touched.
export default function GazettedHolidays({ role }) {
  const canEdit = role === "HR" || role === "Master";
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeErr, setNoticeErr] = useState(false);

  function say(msg, err = false) {
    setNotice(msg); setNoticeErr(err);
    if (!err) setTimeout(() => setNotice(""), 6000);
  }

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("gazetted_holidays").select("*").order("holiday_date", { ascending: false });
    setRows(data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function applyDate(d) {
    const { data, error } = await supabase.rpc("apply_gazetted_holiday", { p_date: d });
    if (error) return { error: error.message };
    const res = Array.isArray(data) ? data[0] : data;
    return { updated: res?.rows_updated ?? 0, published: !!res?.month_published };
  }

  async function addHoliday() {
    if (!canEdit || busy) return;
    if (!date) return say("Pick a date.", true);
    if (!name.trim()) return say("Name the holiday (e.g. Independence Day).", true);
    setBusy(true);
    const { error: insErr } = await supabase.from("gazetted_holidays")
      .insert({ holiday_date: date, holiday_name: name.trim(), is_active: true, created_by: role });
    if (insErr) { setBusy(false); return say(insErr.message.includes("duplicate") ? "That date is already a holiday." : insErr.message, true); }

    const r = await applyDate(date);
    setBusy(false);
    setDate(""); setName("");
    await load();
    if (r.error) say(`Holiday saved, but applying it failed: ${r.error}`, true);
    else if (r.published) say(`Holiday saved. ${date}'s payroll month is already Published — it was NOT applied to that month. Unlock and reprocess if it needs to count.`, true);
    else say(`${date} marked as a gazetted holiday — ${r.updated} attendance row(s) updated. Refresh Payroll for that month.`);
  }

  async function toggleActive(row) {
    if (!canEdit || busy) return;
    setBusy(true);
    const { error } = await supabase.from("gazetted_holidays").update({ is_active: !row.is_active }).eq("id", row.id);
    if (error) { setBusy(false); return say(error.message, true); }
    const r = await applyDate(row.holiday_date);
    setBusy(false);
    await load();
    if (r.error) say(`Saved, but reprocessing failed: ${r.error}`, true);
    else if (r.published) say(`Saved. ${row.holiday_date}'s payroll is Published — that month was not reprocessed.`, true);
    else say(`${row.holiday_date} ${row.is_active ? "removed" : "restored"} — ${r.updated} attendance row(s) reprocessed. Refresh Payroll for that month.`);
  }

  async function remove(row) {
    if (!canEdit || busy) return;
    if (!window.confirm(`Delete the holiday on ${row.holiday_date} (${row.holiday_name})? Attendance for that day will be reprocessed as normal working days.`)) return;
    setBusy(true);
    const { error } = await supabase.from("gazetted_holidays").delete().eq("id", row.id);
    if (error) { setBusy(false); return say(error.message, true); }
    const r = await applyDate(row.holiday_date);
    setBusy(false);
    await load();
    if (r.error) say(`Deleted, but reprocessing failed: ${r.error}`, true);
    else say(`${row.holiday_date} deleted — ${r.updated} attendance row(s) reprocessed. Refresh Payroll for that month.`);
  }

  const fmt = (d) => new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });

  return (
    <div>
      <PageTitle
        title="Gazetted / Public Holidays"
        subtitle="Mark a date once — it applies to every employee's timesheet and payroll automatically."
      />

      {notice && (
        <div className={`mb-3 p-3 rounded-xl text-sm ${noticeErr ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
          {notice}
        </div>
      )}
      {!canEdit && (
        <div className="mb-3 p-3 rounded-xl bg-amber-50 text-amber-700 text-xs">
          View-only — only HR and Master can add or remove holidays.
        </div>
      )}

      {canEdit && (
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr_auto] gap-3 items-end">
            <div>
              <p className="text-xs text-slate-500 mb-1">Date</p>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Holiday name</p>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Independence Day"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
            </div>
            <Button onClick={addHoliday} disabled={busy} className="rounded-xl">
              {busy ? "Applying…" : "Mark as Gazetted Holiday"}
            </Button>
          </div>
          <p className="text-xs text-slate-400 mt-2">
            Add each day of a multi-day holiday (e.g. Eid) as its own entry. Every affected month still needs a <strong>Refresh Payroll</strong> to pick up the change.
          </p>
        </div>
      )}

      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              {["Date", "Holiday", "Status", "Added by", canEdit ? "" : null].filter(v => v !== null).map((h, i) => (
                <th key={i} className="text-left px-4 py-3 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No holidays marked yet.</td></tr>
            ) : rows.map(row => (
              <tr key={row.id} className={row.is_active ? "" : "opacity-50"}>
                <td className="px-4 py-3 font-medium text-slate-800">{fmt(row.holiday_date)}</td>
                <td className="px-4 py-3">{row.holiday_name}</td>
                <td className="px-4 py-3">
                  <Badge tone={row.is_active ? "green" : "slate"}>{row.is_active ? "Active" : "Inactive"}</Badge>
                </td>
                <td className="px-4 py-3 text-slate-400 text-xs">{row.created_by || "—"}</td>
                {canEdit && (
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button disabled={busy} onClick={() => toggleActive(row)}
                      className="text-xs text-slate-500 hover:text-slate-800 mr-3 disabled:opacity-40">
                      {row.is_active ? "Deactivate" : "Reactivate"}
                    </button>
                    <button disabled={busy} onClick={() => remove(row)}
                      className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40">
                      Delete
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
