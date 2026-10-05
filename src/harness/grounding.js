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
// Units stay distinct: "2 business days" never supports "2 years", and counts never stand in for durations.
const UNIT = '(%|percent\\b|dollars?\\b|usd\\b|hours?\\b|hrs?\\b|h\\b|business days?\\b|days?\\b|weeks?\\b|months?\\b|years?\\b|sessions?\\b|visits?\\b)';
const QUANTITY = new RegExp(`(?:\\$|\\busd\\s?)\\s?(${DIGITS})|(?:\\b(${DIGITS})|\\b(${NUMBER_WORDS}))[\\s-]?${UNIT}`, 'gi');
function unitOf(u) {
  const x = u.toLowerCase();
  if (x === '%' || x === 'percent') return 'percent';
  if (/^(dollars?|usd)$/.test(x)) return 'money';
  if (/^(hours?|hrs?|h)$/.test(x)) return 'hours';
  if (x.startsWith('business')) return 'business_day';
  return x.replace(/s$/, ''); // day, week, month, year, session, visit
}

// Each quantity in a text, as { value, unit, text } with unit money | percent | hours | business_day | day | week | month | year | session | visit.
export function quantities(text) {
  const out = [];
  for (const m of canonicalText(text).replace(/§\s*[\d.]+/g, '').matchAll(QUANTITY)) {
    if (m[1]) { out.push({ value: num(m[1]), unit: 'money', text: m[0].trim() }); continue; }
    const value = m[2] ? num(m[2]) : wordsToNumber(m[3]);
    if (value != null) out.push({ value, unit: unitOf(m[4]), text: m[0].trim() });
  }
  return out;
}

// Authoritative values by unit: the user's own records (typed by field name) and what the documents state.
// The user's message is NOT evidence — a number the user asserted proves nothing.
function authoritative(facts, docs) {
  const by = new Map();
  const add = (unit, v) => { if (!by.has(unit)) by.set(unit, new Set()); by.get(unit).add(+Number(v).toFixed(2)); };
  const walk = (v, key = '') => {
    if (Array.isArray(v)) v.forEach(x => walk(x, key));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, k);
    else if (typeof v === 'number') {
      if (/hours/i.test(key)) add('hours', v);
      else if (/cents$/i.test(key)) add('money', v / 100);
    }
  };
  walk(facts);
  // A PTO request is for one day; "one day" is established only when the user is booking one.
  if (facts.ptoDateCandidates?.length) add('day', 1);
  const DEFAULT_PTO_DAY = 8;
  const ownHours = [...(by.get('hours') ?? []), DEFAULT_PTO_DAY];
  add('hours', DEFAULT_PTO_DAY);
  for (const a of ownHours) for (const b of ownHours) if (a > b) add('hours', a - b); // "40 hours minus an 8-hour day = 32"; never sums
  const money = [...(by.get('money') ?? [])];
  for (let i = 0; i < money.length; i += 1) for (let j = i + 1; j < money.length; j += 1) add('money', money[i] + money[j]);
  for (const d of docs) for (const q of quantities(d.content)) add(q.unit, q.value);
  return by;
}

// Returns the quantities in `text` that match no authoritative value with the same unit.
export function ungroundedQuantities(text, { facts = {}, docs = [] }) {
  const by = authoritative(facts, docs);
  return [...new Set(quantities(text).filter(q => ![...(by.get(q.unit) ?? [])].some(a => Math.abs(a - q.value) < 0.005)).map(q => q.text))];
}

// "the claim is over $5,000" is checked against the claim's amount. The subject must be a specific claim
// (its ID, or "the/this claim|amount" when exactly one claim is in context), so a restated policy
// ("Claims over $5,000 are escalated") is not mistaken for a claim about this record.
const COMPARE = new RegExp(`(CLM-\\d{4}|\\b(?:the|this|that)\\s+(?:claim|claim's amount|amount|billed amount))(?:'s amount)?\\s+(?:is|was|of|at|totals?|amounts? to)?\\s*(?:well\\s+|just\\s+)?(over|above|more than|greater than|exceed(?:s|ing)?|under|below|less than)\\s+(?:the\\s+)?\\$\\s?(${DIGITS})`, 'gi');
export function claimComparisonProblems(text, facts = {}) {
  const claims = facts.claims ?? [];
  const out = [];
  for (const m of canonicalText(text).matchAll(COMPARE)) {
    const claim = /^CLM-/i.test(m[1]) ? claims.find(c => c.id === m[1].toUpperCase()) : claims.length === 1 ? claims[0] : null;
    if (!claim || claim.amountCents == null) continue;
    const amount = claim.amountCents / 100; const threshold = num(m[3]);
    const above = /over|above|more|greater|exceed/i.test(m[2]);
    if (above ? !(amount > threshold) : !(amount < threshold)) out.push(`${claim.id} is ${m[2]} $${m[3]} but its amount is $${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  }
  return out;
}

// Calendar dates stated in the answer must appear in the records, the documents, or be today.
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DATE = /\b(\d{4})-(\d{2})-(\d{2})\b|\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/gi;
function monthDays(text) {
  const out = [];
  for (const m of canonicalText(text).matchAll(DATE)) {
    const md = m[1] ? `${Number(m[2])}-${Number(m[3])}` : `${MONTHS.indexOf(m[4].slice(0, 3).toLowerCase()) + 1}-${Number(m[5])}`;
    out.push({ md, text: m[0] });
  }
  return out;
}
export function ungroundedDates(text, { facts = {}, docs = [], today = null }) {
  const known = new Set([...monthDays(JSON.stringify(facts)), ...docs.flatMap(d => monthDays(d.content)), ...(today ? monthDays(today) : [])].map(d => d.md));
  return [...new Set(monthDays(text).filter(d => !known.has(d.md)).map(d => d.text))];
}
