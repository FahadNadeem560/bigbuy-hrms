export function money(value) {
  return `Rs. ${Math.round(Number(value || 0)).toLocaleString()}`;
}

export function timeToMinutes(t) {
  if (!t || t === "-") return null;
  const [h, m] = String(t).split(":").map(Number);
  return h * 60 + m;
}

export function minutesToHours(min) {
  return Math.round((Number(min || 0) / 60) * 100) / 100;
}
