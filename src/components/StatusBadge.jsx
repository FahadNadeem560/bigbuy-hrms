import React from "react";
import { Badge } from "./ui.js";

export default function StatusBadge({ status }) {
  const tone = status === "Absent" ? "red" : status === "Late" ? "yellow" : status === "Half Day" ? "purple" : status === "Contractor" ? "blue" : (status === "Weekly Off" || status === "Gazetted Holiday") ? "slate" : "green";
  return <Badge tone={tone}>{status}</Badge>;
}
