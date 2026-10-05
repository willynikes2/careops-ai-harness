import { NUMBER_WORDS, wordsToNumber } from '../util/numbers.js';

// Deterministic checks on what the user will read. Citations prove a document was supplied; these check
// that record IDs and authoritative numbers in the answer match values the app supplied, with the same unit.

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
const DIGITS = '\\d[\\d,]*(?:\\.\\d+)?';
const UNIT = '(%|percent\\b|hours?\\b|hrs?\\b|h\\b|business days?\\b|days?\\b|weeks?\\b|months?\\b|years?\\b|sessions?\\b|visits?\\b)';
const QUANTITY = new RegExp(`\\$\\s?(${DIGITS})|(?:\\b(${DIGITS})|\\b(${NUMBER_WORDS}))[\\s-]?${UNIT}`, 'gi');
const unitClass = (u) => (/^(%|percent)/i.test(u) ? 'percent' : /^(hours?|hrs?|h)$/i.test(u) ? 'hours' : 'count');

// Each quantity in a text, as { value, unit: 'money' | 'percent' | 'hours' | 'count', text }.
export function quantities(text) {
  const out = [];
  for (const m of canonicalText(text).replace(/§\s*[\d.]+/g, '').matchAll(QUANTITY)) {
    if (m[1]) { out.push({ value: num(m[1]), unit: 'money', text: m[0].trim() }); continue; }
    const value = m[2] ? num(m[2]) : wordsToNumber(m[3]);
    if (value != null) out.push({ value, unit: unitClass(m[4]), text: m[0].trim() });
  }
  return out;
}

// Authoritative values by unit: the user's own records (typed by field name) and what the documents state.
// The user's message is NOT evidence — a number the user asserted proves nothing.
function authoritative(facts, docs) {
  const by = { money: new Set(), percent: new Set(), hours: new Set(), count: new Set([1]) };
  const walk = (v, key = '') => {
    if (Array.isArray(v)) v.forEach(x => walk(x, key));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, k);
    else if (typeof v === 'number') {
      if (/hours/i.test(key)) by.hours.add(v);
      else if (/cents$/i.test(key)) by.money.add(v / 100);
    }
  };
  walk(facts);
  const DEFAULT_PTO_DAY = 8;
  const ownHours = [...by.hours, DEFAULT_PTO_DAY];
  for (const a of ownHours) for (const b of ownHours) { by.hours.add(+(a + b).toFixed(2)); by.hours.add(+Math.abs(a - b).toFixed(2)); }
  const money = [...by.money];
  for (const a of money) for (const b of money) by.money.add(+(a + b).toFixed(2));
  for (const d of docs) for (const q of quantities(d.content)) by[q.unit].add(q.value);
  return by;
}

// Returns the quantities in `text` that match no authoritative value with the same unit (sums and
// differences of the user's own hour figures are allowed, e.g. "40 hours minus one 8-hour day = 32").
export function ungroundedQuantities(text, { facts = {}, docs = [] }) {
  const by = authoritative(facts, docs);
  return [...new Set(quantities(text).filter(q => ![...by[q.unit]].some(a => Math.abs(a - q.value) < 0.005)).map(q => q.text))];
}
