export function addDays(ymd, n) { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
export const dow = (ymd) => new Date(`${ymd}T12:00:00Z`).getUTCDay(); // 0=Sun
export const isWeekend = (ymd) => [0, 6].includes(dow(ymd));
export function addBusinessDays(ymd, n) { let d = ymd; let left = n; while (left > 0) { d = addDays(d, 1); if (!isWeekend(d)) left -= 1; } return d; }
export function businessDaysUntil(from, to) { let n = 0; for (let d = addDays(from, 1); d <= to; d = addDays(d, 1)) if (!isWeekend(d)) n += 1; return n; }
export function formatDate(ymd) { return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }); }
