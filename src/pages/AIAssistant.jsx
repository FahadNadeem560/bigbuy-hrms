import React, { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { Button, PageTitle } from "../components/ui.jsx";

const MODEL = "claude-sonnet-4-20250514";
const API_URL = "https://api.anthropic.com/v1/messages";

const SUGGESTIONS = [
  "How many employees are present today?",
  "Show me employees with pending loan repayments.",
  "Which employees have been absent more than 5 days this month?",
  "What is the total payroll for this month?",
  "List employees due for increment review.",
];

export default function AIAssistant() {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("anthropic_api_key") || "");
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Hello! I'm your HRMS AI Assistant. I can answer questions about your employees, attendance, payroll, loans, and more. What would you like to know?" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [context, setContext] = useState(null);
  const bottomRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => { fetchContext(); }, []);

  async function fetchContext() {
    const today = new Date().toISOString().slice(0, 10);
    const monthStart = today.slice(0, 7) + "-01";
    try {
      const [{ data: emps }, { data: todayAtt }, { data: leaves }, { data: loans }, { data: payroll }] = await Promise.all([
        supabase.from("employees").select("employee_code, full_name, department, branch, salary, status, staff_level").eq("status", "Active"),
        supabase.from("attendance").select("employee_code, attendance_status, status, late_minutes").eq("work_date", today),
        supabase.from("leave_requests").select("employee_code, leave_type, start_date, end_date, status").eq("status", "Pending"),
        supabase.from("loans").select("employee_code, outstanding_balance, loan_amount, status").eq("status", "Active"),
        supabase.from("payroll").select("employee_code, net_pay, status").gte("pay_period_start", monthStart),
      ]);
      setContext({ emps: emps || [], todayAtt: todayAtt || [], leaves: leaves || [], loans: loans || [], payroll: payroll || [], today });
    } catch (e) {
      // Context fetch failure is non-fatal
    }
  }

  function buildSystemPrompt() {
    if (!context) return "You are an HR assistant for The Big Buy Supermarket HRMS.";
    const { emps, todayAtt, leaves, loans, payroll, today } = context;
    const presentToday = todayAtt.filter(a => (a.attendance_status || a.status) === "Present").length;
    const absentToday = todayAtt.filter(a => (a.attendance_status || a.status) === "Absent").length;
    const lateToday = todayAtt.filter(a => Number(a.late_minutes || 0) > 0).length;
    const totalActiveLoanBalance = loans.reduce((s, l) => s + Number(l.outstanding_balance || 0), 0);
    const deptCounts = emps.reduce((m, e) => { m[e.department] = (m[e.department] || 0) + 1; return m; }, {});
    const branchCounts = emps.reduce((m, e) => { m[e.branch] = (m[e.branch] || 0) + 1; return m; }, {});

    return `You are an expert HR assistant for The Big Buy Supermarket HRMS (a Pakistani retail chain).
Today's date: ${today}
Total active employees: ${emps.length}
Today's attendance: ${presentToday} present, ${absentToday} absent, ${lateToday} late
Pending leave requests: ${leaves.length}
Active loans outstanding total: Rs. ${totalActiveLoanBalance.toLocaleString()}
This month payroll records: ${payroll.length}
Departments: ${Object.entries(deptCounts).map(([d, c]) => `${d}(${c})`).join(", ")}
Branches: ${Object.entries(branchCounts).map(([b, c]) => `${b}(${c})`).join(", ")}

Employee data (first 30): ${JSON.stringify(emps.slice(0, 30).map(e => ({ code: e.employee_code, name: e.full_name, dept: e.department, branch: e.branch, salary: e.salary, level: e.staff_level })))}

Answer HR questions concisely. Be factual. If you don't have enough data, say so. Format numbers with commas.`;
  }

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    if (!apiKey) { setErr("Please set your Anthropic API key first."); setShowKeyInput(true); return; }
    setErr("");
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: text }]);
    setLoading(true);
    try {
      const history = messages.filter(m => m.role !== "system");
      const res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 1024,
          system: buildSystemPrompt(),
          messages: [...history.map(m => ({ role: m.role, content: m.content })), { role: "user", content: text }],
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error?.message || `API error ${res.status}`);
      }
      const data = await res.json();
      const reply = data.content?.[0]?.text || "No response.";
      setMessages(prev => [...prev, { role: "assistant", content: reply }]);
    } catch (e) {
      setErr(`Error: ${e.message}`);
      setMessages(prev => [...prev, { role: "assistant", content: `Sorry, I encountered an error: ${e.message}` }]);
    } finally {
      setLoading(false);
    }
  }

  function saveKey() {
    localStorage.setItem("anthropic_api_key", apiKey);
    setShowKeyInput(false);
    setErr("");
  }

  function clearChat() {
    setMessages([{ role: "assistant", content: "Chat cleared. How can I help you?" }]);
  }

  return (
    <div className="flex flex-col h-[calc(100vh-120px)]">
      <PageTitle title="AI Assistant" subtitle="Ask natural-language HR questions. Powered by Claude."
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowKeyInput(s => !s)} className="rounded-2xl text-xs">
              {apiKey ? "Change API Key" : "Set API Key"}
            </Button>
            <Button variant="outline" onClick={clearChat} className="rounded-2xl text-xs">Clear Chat</Button>
          </div>
        } />

      {/* API Key Input */}
      {showKeyInput && (
        <div className="mb-4 bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-slate-500 mb-2">Anthropic API Key (stored in browser localStorage)</p>
          <div className="flex gap-2">
            <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
              placeholder="sk-ant-..." className="flex-1 px-4 py-2 rounded-xl border border-slate-200 text-sm" />
            <Button onClick={saveKey} className="rounded-2xl">Save</Button>
          </div>
          <p className="text-xs text-slate-400 mt-2">Get your key at console.anthropic.com. Never share it.</p>
        </div>
      )}

      {err && <div className="mb-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{err}</div>}

      {/* Chat Window */}
      <div className="flex-1 bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden flex flex-col">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${
                m.role === "user"
                  ? "bg-slate-950 text-white"
                  : "bg-slate-50 border border-slate-100 text-slate-800"
              }`}>
                {m.role === "assistant" && (
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-xs font-semibold text-slate-400">AI Assistant</span>
                  </div>
                )}
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 text-sm text-slate-400">
                <div className="flex gap-1 items-center">
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Suggestions (show only at start) */}
        {messages.length <= 1 && (
          <div className="px-5 pb-3 flex flex-wrap gap-2">
            {SUGGESTIONS.map(s => (
              <button key={s} onClick={() => setInput(s)}
                className="text-xs px-3 py-1.5 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition">
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="border-t border-slate-100 p-4 flex gap-2">
          <input
            data-testid="ai-chat-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Ask anything about your HR data..."
            disabled={loading}
            className="flex-1 px-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
          <Button data-testid="ai-chat-send" onClick={send} disabled={loading || !input.trim()} className="rounded-2xl">
            {loading ? "..." : "Send"}
          </Button>
        </div>
      </div>
    </div>
  );
}
