export function money(value) {
  return `Rs. ${Math.round(Number(value || 0)).toLocaleString()}`;
}

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "2026-01-01" (or any Date-parseable string) -> "Jan-26"
export function formatMonthYear(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  return `${MONTH_ABBR[d.getUTCMonth()]}-${String(d.getUTCFullYear()).slice(-2)}`;
}

export function timeToMinutes(t) {
  if (!t || t === "-") return null;
  const [h, m] = String(t).split(":").map(Number);
  return h * 60 + m;
}

export function minutesToHours(min) {
  return Math.round((Number(min || 0) / 60) * 100) / 100;
}
