import React, { useState } from "react";
import Imports from "./Imports.jsx";
import Exports from "./Exports.jsx";

export default function DataManagement({ selectedFile, setSelectedFile, preview, importing, message, error, onPreview, onImport, employees, payroll, attendance, loans }) {
  const [tab, setTab] = useState("import");
  return (
    <div>
      <div className="flex gap-2 mb-6">
        {["import", "export"].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-xl text-sm font-medium capitalize transition-colors ${tab === t ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "import" && (
        <Imports selectedFile={selectedFile} setSelectedFile={setSelectedFile} preview={preview} importing={importing} message={message} error={error} onPreview={onPreview} onImport={onImport} />
      )}
      {tab === "export" && (
        <Exports employees={employees} payroll={payroll} attendance={attendance} loans={loans} />
      )}
    </div>
  );
}
