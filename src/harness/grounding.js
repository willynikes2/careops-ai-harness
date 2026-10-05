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
const DIGITS = '\\d(?:[\\d,]*\\d)?(?:\\.\\d+)?';
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

// Topic words: each value carries the content words of the sentence (or record field) it came from, and an
// answer's number must share at least one with its own sentence. That binds "40 hours" to carryover, not to notice.
const STOP = new Set('the a an is are was were be been to of in on for and or at by with your you we it its this that these those as from has had will would can could may might should must not no do does any all each than then so if into about our their there here also only just more most other such per up out over under what which who how when'.split(' '));
const GENERIC = new Set(['pto', 'policy', 'paid', 'time', 'hour', 'hours', 'day', 'days', 'business', 'claim', 'claims', 'employee', 'employees', 'staff', 'careops', 'guide', 'manual', 'sop', 'section', 'full-time', 'plan']);
const stem = (w) => { if (/\d/.test(w)) return w; const x = w.replace(/'s$/, '').replace(/(ing|ed|es|s)$/, ''); return (x.length >= 5 ? x.slice(0, 5) : x) || w; }; // IDs like clm-1004 stay whole
// Generic domain words ("claim", "policy", "hours") are dropped from document sentences, where they would
// license any value; in the answer they are kept, so "the claim is $3,250" can bind to the claim's own amount.
export function topicWords(text, { generic = true } = {}) {
  return new Set((String(text).toLowerCase().match(/[a-z][a-z0-9'-]*[a-z0-9]|[a-z]/g) ?? []).filter(w => !STOP.has(w) && (!generic || !GENERIC.has(w)) && w.length > 1).map(stem));
}
const sentences = (text) => canonicalText(text).replace(/§\s*[\d.]+/g, '').split(/(?<=[.!?;:])\s+|\n+/).filter(x => x.trim());
// What each typed record field is about, in the words people use for it.
const FIELD_TOPICS = [
  [/^hours(Available|Requestable)$/, 'available left remaining remain have balance requestable request use'],
  [/^hoursPending$/, 'pending awaiting waiting'],
  [/^hours$/, 'request requested approved denied pending off booked'],
  [/^ptoRequestedHours$/, 'request requested off take'],
  [/cents$/i, 'amount billed bill charge total owe owed value worth claim'],
];
const topicFor = (key) => FIELD_TOPICS.find(([re]) => re.test(key))?.[1];

function authoritative(facts, docs) {
  const entries = [];
  const add = (unit, value, words) => entries.push({ unit, value: +Number(value).toFixed(2), keys: typeof words === 'string' ? topicWords(words, { generic: false }) : words });
  const own = [];
  // A record's own ID (e.g. CLM-1004) is a topic word for its values: "CLM-1004 is $3,250" is about that claim's amount.
  const walk = (v, key = '', parent = null) => {
    if (Array.isArray(v)) v.forEach(x => walk(x, key, parent));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, k, v);
    else if (typeof v === 'number' && topicFor(key)) {
      const words = `${topicFor(key)} ${typeof parent?.id === 'string' ? parent.id : ''}`;
      if (/hours/i.test(key)) { add('hours', v, words); own.push(v); } else add('money', v / 100, words);
    }
  };
  walk(facts);
  // A PTO request is for one day; "one day" is established only when the user is booking one.
  if (facts.ptoDateCandidates?.length) add('day', 1, 'off take request book');
  const DEFAULT_PTO_DAY = 8;
  add('hours', DEFAULT_PTO_DAY, 'full day request form one');
  // "40 hours minus an 8-hour day leaves 32": differences of the user's own figures, about what would remain.
  for (const a of [...own, DEFAULT_PTO_DAY]) for (const b of [...own, DEFAULT_PTO_DAY]) if (a > b) add('hours', a - b, 'after would left remain remaining leave then once balance available have');
  const money = entries.filter(e => e.unit === 'money').map(e => e.value);
  for (let i = 0; i < money.length; i += 1) for (let j = i + 1; j < money.length; j += 1) add('money', money[i] + money[j], 'total combined together sum altogether');
  for (const d of docs) for (const sentence of sentences(d.content)) { const keys = topicWords(sentence); for (const q of quantities(sentence)) add(q.unit, q.value, keys); }
  return entries;
}

// Returns the quantities in `text` that match no authoritative value with the same unit AND a shared topic
// word in the same sentence (or the one before it).
export function ungroundedQuantities(text, { facts = {}, docs = [] }) {
  const entries = authoritative(facts, docs);
  const bad = new Set();
  const grounded = []; // a later "the 60 days" refers back to a value already grounded in this answer
  const list = sentences(text);
  list.forEach((sentence, i) => {
    const keys = new Set([...topicWords(sentence, { generic: false }), ...(i > 0 ? topicWords(list[i - 1], { generic: false }) : [])]);
    for (const q of quantities(sentence)) {
      const same = (e) => e.unit === q.unit && Math.abs(e.value - q.value) < 0.005;
      const ok = grounded.some(same) || entries.some(e => same(e) && [...e.keys].some(k => keys.has(k)));
      if (ok) grounded.push(q); else bad.add(q.text);
    }
  });
  return [...bad];
}

// Statuses, denial codes and payers named in the answer must match the record or the documents.
const CLAIM_STATUS = { paid: 'PAID', denied: 'DENIED', appealed: 'APPEALED', resubmitted: 'RESUBMITTED', closed: 'CLOSED', submitted: 'SUBMITTED', pending: 'PENDING_INFO' };
const STATUS_RE = /(CLM-\d{4}|\b(?:the|this) claim\b|\bit\b)\s+(?:is|was|has been|had been|remains|is still|is now|was already)\s+(?:now\s+|currently\s+|still\s+|already\s+)?(paid|denied|appealed|resubmitted|closed|submitted|pending)\b/gi;
const REQUEST_RE = /\b(?:your|the|this)\s+(?:pto\s+)?request(?:\s+for\s+([^.,;]{1,30}?))?\s+(?:is|was|has been)\s+(?:now\s+|still\s+|already\s+)?(approved|denied|pending)\b/gi;
export function recordMismatches(text, { facts = {}, docs = [] }) {
  const t = canonicalText(text); const out = [];
  const claims = facts.claims ?? [];
  for (const m of t.matchAll(STATUS_RE)) {
    const claim = /^CLM-/i.test(m[1]) ? claims.find(c => c.id === m[1].toUpperCase()) : claims.length === 1 ? claims[0] : null;
    if (claim && claim.status !== CLAIM_STATUS[m[2].toLowerCase()]) out.push(`${claim.id} called ${m[2].toLowerCase()} but its status is ${claim.status}`);
  }
  if (Array.isArray(facts.yourPtoRequests)) for (const m of t.matchAll(REQUEST_RE)) {
    const status = m[2].toUpperCase();
    const md = m[1] ? monthDays(m[1]).map(d => d.md) : [];
    const candidates = facts.yourPtoRequests.filter(r => !md.length || md.includes(monthDays(r.date)[0]?.md));
    if (!candidates.some(r => r.status === status)) out.push(`a PTO request called ${status.toLowerCase()} that no request of yours has`);
  }
  const known = `${JSON.stringify(facts)} ${docs.map(d => d.content).join(' ')}`;
  for (const code of new Set(t.match(/\b(?:CO|PR|OA|PI|CR)-\d{1,3}\b/g) ?? [])) if (!new RegExp(`\\b${code}\\b`).test(known)) out.push(`denial code ${code} is not in the record or documents`);
  for (const payer of new Set(t.match(/\bPayer [A-Z]\b/g) ?? [])) if (!known.includes(payer)) out.push(`${payer} is not in the record or documents`);
  return out;
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
