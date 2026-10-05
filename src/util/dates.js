import { NUMBER_WORDS, wordsToNumber } from './numbers.js';
import { nyDate } from './clock.js';
export function addDays(ymd, n) { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
export const dow = (ymd) => new Date(`${ymd}T12:00:00Z`).getUTCDay(); // 0=Sun
export const isWeekend = (ymd) => [0, 6].includes(dow(ymd));
export function addBusinessDays(ymd, n) { let d = ymd; let left = n; while (left > 0) { d = addDays(d, 1); if (!isWeekend(d)) left -= 1; } return d; }
export function businessDaysUntil(from, to) { let n = 0; for (let d = addDays(from, 1); d <= to; d = addDays(d, 1)) if (!isWeekend(d)) n += 1; return n; }
export function formatDate(ymd) { return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }); }

// Hours the user stated ("for 4 hours", "four hours", "half day"), or null — parsed in code so a clarification cannot drop them.
export function requestedHours(text) {
  const t = String(text).toLowerCase();
  const digits = t.match(/\b(\d+(?:\.\d+)?)\s*(?:-\s*)?(?:hours?|hrs?|h)\b/);
  if (digits) return Number(digits[1]);
  const words = t.match(new RegExp(`\\b(${NUMBER_WORDS})[\\s-]+(?:hours?|hrs?)\\b`));
  if (words) return wordsToNumber(words[1]);
  if (/\bhalf[\s-]?day\b/.test(t)) return 4;
  return /\b(full|whole) day\b/.test(t) ? 8 : null;
}

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const isoDow = (d) => (d === 0 ? 7 : d); // Mon=1 … Sun=7
// Deterministic date resolution: the model never decides which calendar day a phrase means.
export function resolvePtoDate(text, now) {
  const today = nyDate(now); const t = String(text).toLowerCase();
  const iso = t.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return { kind: 'date', date: iso[1] };
  if (/\btomorrow\b/.test(t)) return { kind: 'date', date: addDays(today, 1) };
  const m = t.match(/\b(?:(this|next|coming)\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (!m) return { kind: 'none' };
  const [phrase, qualifier, dayName] = m; const target = DAY_NAMES.indexOf(dayName);
  const delta = (target - dow(today) + 7) % 7;
  const upcoming = addDays(today, delta === 0 ? 7 : delta);
  if (delta === 0) return qualifier === 'next' ? { kind: 'date', date: upcoming } : { kind: 'ambiguous', phrase, candidates: [today, upcoming] };
  // "next <day>" is ambiguous when that day is still ahead in the current Mon–Sun week.
  if (qualifier === 'next' && isoDow(dow(today)) < isoDow(target)) return { kind: 'ambiguous', phrase, candidates: [upcoming, addDays(upcoming, 7)] };
  return { kind: 'date', date: upcoming };
}
