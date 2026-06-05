import React, { useState, useMemo } from "react";
import { Button, Badge, PageTitle } from "../components/ui.jsx";
import { BRANCH_CODE_MAP } from "../constants/branches.js";

const STATUSES = ["Applied", "Shortlisted", "Interviewed", "Offered", "Joined", "Rejected"];
const STATUS_TONES = { Applied: "slate", Shortlisted: "blue", Interviewed: "yellow", Offered: "purple", Joined: "green", Rejected: "red" };

let nextId = 1;
const BLANK_JOB = { title: "", branch: "Main Branch", department: "", headcount: 1, status: "Open" };
const BLANK_APP = { name: "", appliedDate: new Date().toISOString().slice(0, 10), position: "", jobId: "", status: "Applied", interviewDate: "", offerDate: "", notes: "" };

export default function Recruitment() {
  const [tab, setTab] = useState("jobs");
  const [jobs, setJobs] = useState([]);
  const [applicants, setApplicants] = useState([]);
  const [showJobForm, setShowJobForm] = useState(false);
  const [showAppForm, setShowAppForm] = useState(false);
  const [jobForm, setJobForm] = useState(BLANK_JOB);
  const [appForm, setAppForm] = useState(BLANK_APP);
  const [filterStatus, setFilterStatus] = useState("All");
  const [search, setSearch] = useState("");
  const [msg, setMsg] = useState("");

  function addJob() {
    if (!jobForm.title || !jobForm.department) return;
    setJobs(j => [...j, { ...jobForm, id: nextId++, created_at: new Date().toISOString().slice(0, 10), filled: 0 }]);
    setJobForm(BLANK_JOB); setShowJobForm(false);
    setMsg("Job opening created.");
  }

  function addApplicant() {
    if (!appForm.name || !appForm.position) return;
    setApplicants(a => [...a, { ...appForm, id: nextId++, created_at: new Date().toISOString() }]);
    setAppForm(BLANK_APP); setShowAppForm(false);
    setMsg("Applicant added.");
  }

  function updateApplicantStatus(id, status) {
    setApplicants(a => a.map(ap => ap.id === id ? { ...ap, status } : ap));
    if (status === "Joined") {
      setJobs(j => j.map(job => job.title === applicants.find(a => a.id === id)?.position
        ? { ...job, filled: (job.filled || 0) + 1 } : job));
    }
  }

  const filteredApps = useMemo(() => applicants.filter(a => {
    const statusOk = filterStatus === "All" || a.status === filterStatus;
    const searchOk = !search || a.name.toLowerCase().includes(search.toLowerCase()) || a.position.toLowerCase().includes(search.toLowerCase());
    return statusOk && searchOk;
  }), [applicants, filterStatus, search]);

  const funnel = useMemo(() => STATUSES.map(s => ({ status: s, count: applicants.filter(a => a.status === s).length })), [applicants]);

  return (
    <div>
      <PageTitle title="Recruitment" subtitle="Manage job openings, applicant pipeline and interview tracking." />

      <div className="flex flex-wrap gap-2 mb-4">
        {[["jobs", "Job Openings"], ["applicants", "Applicants"], ["pipeline", "Pipeline"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${tab === k ? "bg-slate-950 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            {l}
          </button>
        ))}
      </div>

      {msg && <div className="mb-3 p-3 rounded-xl bg-blue-50 text-blue-700 text-sm">{msg}</div>}

      {tab === "jobs" && (
        <div>
          <div className="flex justify-end mb-3">
            <Button onClick={() => setShowJobForm(s => !s)} className="rounded-2xl">{showJobForm ? "Cancel" : "+ New Job Opening"}</Button>
          </div>
          {showJobForm && (
            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm mb-4">
              <h2 className="font-bold text-slate-800 mb-4">Create Job Opening</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-500 mb-1">Job Title</p>
                  <input value={jobForm.title} onChange={e => setJobForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="e.g. Sales Associate" className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Branch</p>
                  <select value={jobForm.branch} onChange={e => setJobForm(f => ({ ...f, branch: e.target.value }))}
                    className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm">
                    {Object.keys(BRANCH_CODE_MAP).map(b => <option key={b}>{b}</option>)}
                  </select>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Department</p>
                  <input value={jobForm.department} onChange={e => setJobForm(f => ({ ...f, department: e.target.value }))}
                    className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Required Headcount</p>
                  <input type="number" min={1} value={jobForm.headcount} onChange={e => setJobForm(f => ({ ...f, headcount: Number(e.target.value) }))}
                    className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <Button onClick={addJob} className="rounded-2xl">Create Opening</Button>
                <Button variant="outline" onClick={() => setShowJobForm(false)} className="rounded-2xl">Cancel</Button>
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {jobs.length === 0
              ? <div className="md:col-span-3 bg-white border border-slate-100 rounded-2xl p-10 text-center text-slate-400 shadow-sm">No job openings yet.</div>
              : jobs.map(j => (
                <div key={j.id} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-slate-800">{j.title}</h3>
                    <Badge tone={j.filled >= j.headcount ? "green" : "blue"}>{j.filled >= j.headcount ? "Filled" : "Open"}</Badge>
                  </div>
                  <p className="text-sm text-slate-500">{j.department} · {j.branch}</p>
                  <div className="mt-3 flex justify-between text-sm text-slate-600">
                    <span>Headcount: <strong>{j.headcount}</strong></span>
                    <span>Filled: <strong className="text-emerald-600">{j.filled}</strong></span>
                  </div>
                  <p className="text-xs text-slate-400 mt-2">Posted: {j.created_at}</p>
                </div>
              ))}
          </div>
        </div>
      )}

      {tab === "applicants" && (
        <div>
          <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
            <div className="flex gap-2 flex-wrap">
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search applicant..."
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm" />
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm">
                <option value="All">All Status</option>
                {STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <Button onClick={() => setShowAppForm(s => !s)} className="rounded-2xl">{showAppForm ? "Cancel" : "+ Add Applicant"}</Button>
          </div>

          {showAppForm && (
            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm mb-4">
              <h2 className="font-bold text-slate-800 mb-4">Add Applicant</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-500 mb-1">Applicant Name</p>
                  <input value={appForm.name} onChange={e => setAppForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Position Applied</p>
                  <input value={appForm.position} onChange={e => setAppForm(f => ({ ...f, position: e.target.value }))}
                    list="job-titles" className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
                  <datalist id="job-titles">{jobs.map(j => <option key={j.id} value={j.title} />)}</datalist>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Applied Date</p>
                  <input type="date" value={appForm.appliedDate} onChange={e => setAppForm(f => ({ ...f, appliedDate: e.target.value }))}
                    className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Interview Date (optional)</p>
                  <input type="date" value={appForm.interviewDate} onChange={e => setAppForm(f => ({ ...f, interviewDate: e.target.value }))}
                    className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Notes</p>
                  <input value={appForm.notes} onChange={e => setAppForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Additional notes..." className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm" />
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <Button onClick={addApplicant} className="rounded-2xl">Add Applicant</Button>
                <Button variant="outline" onClick={() => setShowAppForm(false)} className="rounded-2xl">Cancel</Button>
              </div>
            </div>
          )}

          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
            <table className="w-full min-w-[750px] text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>{["Name", "Position", "Applied", "Interview", "Status", "Notes", "Update Status"].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredApps.length === 0
                  ? <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No applicants found.</td></tr>
                  : filteredApps.map(a => (
                    <tr key={a.id}>
                      <td className="px-4 py-3 font-medium">{a.name}</td>
                      <td className="px-4 py-3">{a.position}</td>
                      <td className="px-4 py-3">{a.appliedDate}</td>
                      <td className="px-4 py-3">{a.interviewDate || "—"}</td>
                      <td className="px-4 py-3"><Badge tone={STATUS_TONES[a.status]}>{a.status}</Badge></td>
                      <td className="px-4 py-3 max-w-[120px] truncate">{a.notes || "—"}</td>
                      <td className="px-4 py-3">
                        <select value={a.status} onChange={e => updateApplicantStatus(a.id, e.target.value)}
                          className="px-2 py-1 rounded-lg border border-slate-200 text-xs">
                          {STATUSES.map(s => <option key={s}>{s}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "pipeline" && (
        <div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {funnel.map(({ status, count }) => (
              <div key={status} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm text-center">
                <Badge tone={STATUS_TONES[status]}>{status}</Badge>
                <p className="text-3xl font-bold mt-2 text-slate-900">{count}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-3">Conversion Rates</h3>
            <div className="space-y-2 text-sm">
              {[
                ["Applied → Shortlisted", "Applied", "Shortlisted"],
                ["Shortlisted → Interviewed", "Shortlisted", "Interviewed"],
                ["Interviewed → Offered", "Interviewed", "Offered"],
                ["Offered → Joined", "Offered", "Joined"],
              ].map(([label, from, to]) => {
                const fromCount = applicants.filter(a => a.status === from || STATUSES.indexOf(a.status) >= STATUSES.indexOf(from)).length;
                const toCount = applicants.filter(a => STATUSES.indexOf(a.status) >= STATUSES.indexOf(to)).length;
                const pct = fromCount > 0 ? Math.round((toCount / fromCount) * 100) : 0;
                return (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-slate-500">{label}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-32 bg-slate-100 rounded-full h-2">
                        <div className="bg-slate-700 h-2 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="font-semibold w-10 text-right">{pct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
