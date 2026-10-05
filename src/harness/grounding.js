// Deterministic checks on what the user will read. Citations prove a document was supplied; these prove
// that record IDs and authoritative numbers in the answer actually come from the supplied context.

// Unicode look-alikes (non-breaking hyphens, full-width digits, zero-width characters, HTML entities)
// are folded to plain ASCII before checking, so "CLM‑5555" cannot pass as unrecognized text.
export function canonicalText(s) {
  return String(s).normalize('NFKC')
    .replace(/[​-‍⁠﻿­]/g, '')
    .replace(/&(#45|#x2d|#8209|#8211|#8212|#8722|hyphen|dash|minus|ndash|mdash);/gi, '-')
    .replace(/[\p{Pd}−]/gu, '-');
}

// Every CLM-like mention must be a canonical CLM-dddd that is in the authorized facts.
export function unknownClaimIds(text, knownIds) {
  const out = new Set();
  for (const m of canonicalText(text).matchAll(/\bC\s*L\s*M\s*-?\s*(\p{Nd}+)/giu)) {
    const id = /^[0-9]{4}$/.test(m[1]) ? `CLM-${m[1]}` : m[0].trim();
    if (!knownIds.has(id)) out.add(id);
  }
  return [...out];
}

const num = (s) => Number(String(s).replace(/,/g, ''));
const numbersIn = (s) => (String(s).match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map(num);
function factNumbers(v, out = []) {
  if (typeof v === 'number') out.push(v);
  else if (typeof v === 'string') out.push(...numbersIn(v));
  else if (Array.isArray(v)) v.forEach(x => factNumbers(x, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { factNumbers(x, out); if (/cents$/i.test(k) && typeof x === 'number') out.push(x / 100); }
  return out;
}

// Quantities a reader would act on: money, percentages and durations/counts with a unit.
const QUANTITY = /\$\s?(\d[\d,]*(?:\.\d+)?)|(\d[\d,]*(?:\.\d+)?)\s?(%|percent\b)|(\d[\d,]*(?:\.\d+)?)[\s-]?(hours?|hrs?|h|business days?|days?|weeks?|months?|years?|sessions?|visits?)\b/gi;
const DEFAULT_PTO_DAY = 8;

// Returns the quantities in `text` that appear nowhere in the facts, documents or the user's message,
// and are not a sum or difference of the user's own figures (e.g. "40 hours minus one 8-hour day = 32").
export function ungroundedQuantities(text, { facts = {}, docs = [], message = '' }) {
  const own = [...new Set([...factNumbers(facts), ...numbersIn(message), DEFAULT_PTO_DAY])];
  const allowed = new Set([...own, ...docs.flatMap(d => numbersIn(d.content))]);
  for (const a of own) for (const b of own) { allowed.add(+(a + b).toFixed(2)); allowed.add(+Math.abs(a - b).toFixed(2)); }
  const bad = [];
  for (const m of canonicalText(text).replace(/§\s*[\d.]+/g, '').matchAll(QUANTITY)) {
    const value = num(m[1] ?? m[2] ?? m[4]);
    if (!allowed.has(value) && ![...allowed].some(a => Math.abs(a - value) < 0.005)) bad.push(m[0].trim());
  }
  return [...new Set(bad)];
}
