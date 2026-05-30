import React from "react";
import { Badge } from "./ui";

export default function StatusBadge({ status }) {
  const tone = status === "Absent" ? "red" : status === "Late" ? "yellow" : status === "Half Day" ? "purple" : status === "Contractor" ? "blue" : "green";
  return <Badge tone={tone}>{status}</Badge>;
}
