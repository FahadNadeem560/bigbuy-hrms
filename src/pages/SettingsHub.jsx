import React, { useState } from "react";
import Policies from "./Policies.jsx";
import PolicySettings from "./PolicySettings.jsx";

const TABS = [
  ["rules",    "Policy Rules"],
  ["settings", "Policy Settings"],
];

export default function SettingsHub() {
  const [tab, setTab] = useState("rules");
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-5">
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${tab === k ? "bg-slate-950 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            {l}
          </button>
        ))}
      </div>
      {tab === "rules"    && <Policies />}
      {tab === "settings" && <PolicySettings />}
    </div>
  );
}
