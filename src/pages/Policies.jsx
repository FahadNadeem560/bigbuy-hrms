import React from "react";
import { Card, CardContent, PageTitle } from "../components/ui";
import { STAFF_LEVEL_POLICIES } from "../config/staffPolicies";

export default function Policies() {
  return <div><PageTitle title="Policy Rules" subtitle="Flexible rules by management level." /><div className="grid grid-cols-1 xl:grid-cols-3 gap-4">{Object.values(STAFF_LEVEL_POLICIES).map((policy) => <Card key={policy.label} className="rounded-2xl shadow-sm border border-slate-100"><CardContent className="p-5"><h2 className="text-lg font-bold mb-3">{policy.label}</h2><div className="space-y-2 text-sm text-slate-600"><p>Required hours: <b>{policy.requiredHours}</b></p><p>Grace minutes: <b>{policy.graceMinutes}</b></p><p>Half-day threshold: <b>{policy.halfDayLateMinutes}</b> minutes</p><p>Overtime eligible: <b>{policy.overtimeEligible ? "Yes" : "No"}</b></p><p>Notice days: <b>{policy.noticeDays}</b></p></div></CardContent></Card>)}</div></div>;
}
