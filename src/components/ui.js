import React from "react";

export function Card({ className = "", children }) {
  return <div className={`bg-white ${className}`}>{children}</div>;
}

export function CardContent({ className = "", children }) {
  return <div className={className}>{children}</div>;
}

export function Button({ className = "", variant = "default", children, ...props }) {
  const style = variant === "outline"
    ? "border border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
    : variant === "secondary"
      ? "bg-white text-slate-950 hover:bg-slate-100"
      : "bg-slate-950 text-white hover:bg-slate-800";
  return <button className={`inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed ${style} ${className}`} {...props}>{children}</button>;
}

export function Badge({ children, tone = "default" }) {
  const tones = {
    green: "bg-emerald-50 text-emerald-700 border-emerald-100",
    red: "bg-red-50 text-red-700 border-red-100",
    yellow: "bg-amber-50 text-amber-700 border-amber-100",
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    slate: "bg-slate-50 text-slate-700 border-slate-100",
    purple: "bg-purple-50 text-purple-700 border-purple-100",
    default: "bg-slate-50 text-slate-700 border-slate-100",
  };
  return <span className={`px-3 py-1 rounded-full text-xs border whitespace-nowrap ${tones[tone]}`}>{children}</span>;
}

export function Table({ headers, rows, renderRow }) {
  return <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-sm"><table className="w-full min-w-[760px] text-sm"><thead className="bg-slate-50 text-slate-500"><tr>{headers.map((h) => <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{rows.map((row, i) => renderRow(row, i))}</tbody></table></div>;
}

export function PageTitle({ title, subtitle, action }) {
  return <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6"><div><h1 className="text-2xl md:text-3xl font-bold text-slate-950">{title}</h1><p className="text-slate-500 mt-1">{subtitle}</p></div>{action}</div>;
}

export function StatCard({ title, value, sub, icon }) {
  return <Card className="rounded-2xl shadow-sm border border-slate-100"><CardContent className="p-5 flex items-center justify-between gap-3"><div><p className="text-sm text-slate-500">{title}</p><h3 className="text-2xl font-bold mt-1 text-slate-900">{value}</h3><p className="text-xs text-slate-400 mt-1">{sub}</p></div><span className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center text-2xl shrink-0">{icon}</span></CardContent></Card>;
}
