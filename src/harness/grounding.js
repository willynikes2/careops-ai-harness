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

// Each value is bound to a CONCEPT (notice period, accrual, balance, claim amount, …) and to topic words.
// A number in the answer must match a value with the same unit and the same concept as its own clause:
// "40 hours" from the balance can never support "40 hours notice", whatever words they share.
const STOP = new Set('the a an is are was were be been to of in on for and or at by with your you we it its this that these those as from has had will would can could may might should must not no do does any all each than then so if into about our their there here also only just more most other such per up out over under what which who how when within'.split(' '));
const GENERIC = new Set(['pto', 'policy', 'paid', 'time', 'hour', 'hours', 'day', 'days', 'business', 'claim', 'claims', 'employee', 'employees', 'staff', 'careops', 'guide', 'manual', 'sop', 'section', 'full-time', 'plan']);
const stem = (w) => { if (/\d/.test(w)) return w; const x = w.replace(/'s$/, '').replace(/(ing|ed|es|s)$/, ''); return (x.length >= 5 ? x.slice(0, 5) : x) || w; }; // IDs like clm-1004 stay whole
// Generic domain words ("claim", "policy", "hours") are dropped from document sentences, where they would
// license any value; in the answer they are kept, so "the claim is $3,250" can bind to the claim's own amount.
export function topicWords(text, { generic = true } = {}) {
  return new Set((String(text).toLowerCase().match(/[a-z][a-z0-9'-]*[a-z0-9]|[a-z]/g) ?? []).filter(w => !STOP.has(w) && (!generic || !GENERIC.has(w)) && w.length > 1).map(stem));
}
const sentences = (text) => canonicalText(text).replace(/§\s*[\d.]+/g, '').split(/(?<=[.!?;:])\s+|\n+/).filter(x => x.trim());
const clauses = (sentence) => sentence.split(/,(?!\d)|;|\s(?:and|but|so|while|which|because)\s/i).filter(x => x.trim());

// Policy concepts are specific; record concepts are general. A clause that names a policy concept must be
// supported by a value of that concept; otherwise its record concept; otherwise shared topic words.
const SPECIFIC = {
  notice: /\bnotice|\bin advance\b|\bahead of time\b|\blead time\b/,
  accrual: /\baccru|\bearn(?:s|ed|ing)?\b|\bper month\b|\beach month\b|\bevery month\b|\bmonthly\b/,
  carryover: /\bcarr(?:y|ies|ied)[\s-]?over\b|\bcarryover\b|\broll(?:s|ed)?[\s-]?over\b|\bunused\b/,
  match: /\bmatch|\b401\s?\(?k\)?|\bretirement\b|\bemployer contribution/,
  deadline: /\bdeadline|\bwindow|\bcounts? from\b|\bresubmi|\bappeal|\bcorrect(?:ed|ion)?\b|\bretro|\btimely filing\b/,
  threshold: /\bescalat|\bthreshold|\bexceed|\b(?:over|above|more than|under|below|less than)\s+\$/,
  coverage: /\bcovered\b|\bcoverage\b/, // insurance coverage; "40 hours covers five days" is arithmetic, not coverage
  frequency: /\bevery\b|\bonce\b|\btwice\b|\bper year\b|\ba year\b|\bannual/,
  sessions: /\bsessions?\b|\bcounsel|\bassistance program\b/,
  eligibility: /\beligib|\bwaiting period\b/,
};
const GENERAL = {
  balance: /\bavailable\b|\bleft\b|\bremaining\b|\bbalance|\brequestable\b|\byou(?:'ve got|'d have| would have| have) (?:about |only |up to )?\d|\bleaves?\b/,
  pending: /\bpending\b|\bawaiting\b/,
  request: /\brequest|\bbook|\btake\b|\btaking\b|\btime off\b|\boff\b/,
  fullday: /\bfull day\b|\bwhole day\b|\bone day\b|\ba day\b/,
  amount: /\bamount\b|\bbilled\b|\bbill\b|\bcharge|\bcost|\bowe|\btotal\b|\bworth\b|\bclaim (?:is|was) (?:for )?\$/,
};
const conceptsIn = (text, table) => { const t = canonicalText(text).toLowerCase(); return Object.keys(table).filter(k => table[k].test(t)); };
const allConcepts = (text) => [...conceptsIn(text, SPECIFIC), ...conceptsIn(text, GENERAL)];

// What each typed record field means, as concepts and the words people use for it.
const FIELD_TOPICS = [
  [/^hours(Available|Requestable)$/, ['balance', 'request'], 'available left remaining remain have balance requestable'],
  [/^hoursPending$/, ['pending'], 'pending awaiting waiting'],
  [/^hours$/, ['request', 'pending'], 'request requested approved denied pending off booked'],
  [/^ptoRequestedHours$/, ['request'], 'request requested off take'],
  [/cents$/i, ['amount', 'threshold'], 'amount billed bill charge total owe owed value worth claim'], // thresholds are compared against claim amounts
];
const fieldFor = (key) => FIELD_TOPICS.find(([re]) => re.test(key));

function authoritative(facts, docs) {
  const entries = [];
  const add = (unit, value, concepts, words, kind = 'record') => entries.push({ unit, value: +Number(value).toFixed(2), concepts: new Set(concepts), kind,
    policy: concepts.some(c => c in SPECIFIC), keys: typeof words === 'string' ? topicWords(words, { generic: false }) : words });
  const own = [];
  // A record's own ID (e.g. CLM-1004) is a topic word for its values: "CLM-1004 is $3,250" is about that claim's amount.
  const walk = (v, key = '', parent = null) => {
    if (Array.isArray(v)) v.forEach(x => walk(x, key, parent));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, k, v);
    else if (typeof v === 'number' && fieldFor(key)) {
      const [, concepts, topic] = fieldFor(key);
      const words = `${topic} ${typeof parent?.id === 'string' ? parent.id : ''}`;
      if (/hours/i.test(key)) { add('hours', v, concepts, words); if (concepts.includes('balance')) own.push(v); } else add('money', v / 100, concepts, words);
    }
  };
  walk(facts);
  // A PTO request is for one day; "one day" is established only when the user is booking one.
  if (facts.ptoDateCandidates?.length) add('day', 1, ['request', 'fullday'], 'off take request book');
  const DEFAULT_PTO_DAY = 8;
  add('hours', DEFAULT_PTO_DAY, ['fullday', 'request'], 'full day request form one');
  // "40 hours minus an 8-hour day leaves 32": what would remain of the user's own balance.
  for (const a of own) for (const b of [...own, DEFAULT_PTO_DAY]) if (a > b) add('hours', a - b, ['balance'], 'after would left remain remaining leave then once balance available have');
  const money = entries.filter(e => e.unit === 'money').map(e => e.value);
  for (let i = 0; i < money.length; i += 1) for (let j = i + 1; j < money.length; j += 1) add('money', money[i] + money[j], ['amount'], 'total combined together sum altogether');
  for (const d of docs) for (const sentence of sentences(d.content)) {
    const keys = topicWords(sentence); const concepts = allConcepts(sentence);
    for (const q of quantities(sentence)) add(q.unit, q.value, concepts, keys, 'document');
  }
  return entries;
}

// Returns the quantities in `text` that no authoritative value supports: same unit, same concept as the
// clause the number sits in, and a shared topic word with its sentence (or the one before). "The 60 days"
// may refer back to a value already grounded in this answer, but only for the same concept.
export function ungroundedQuantities(text, { facts = {}, docs = [] }) {
  const entries = authoritative(facts, docs);
  const bad = new Set();
  const grounded = [];
  const list = sentences(text);
  list.forEach((sentence, i) => {
    const keys = new Set([...topicWords(sentence, { generic: false }), ...(i > 0 ? topicWords(list[i - 1], { generic: false }) : [])]);
    for (const clause of clauses(sentence)) {
      const specific = conceptsIn(clause, SPECIFIC); const general = conceptsIn(clause, GENERAL);
      for (const q of quantities(clause)) {
        const same = (e) => e.unit === q.unit && Math.abs(e.value - q.value) < 0.005;
        // A policy clause (notice, accrual, deadline…) needs a value of that policy concept. A clause about the
        // user's records (available, request…) needs a record value, or a document value that is not a policy
        // figure — so the accrual rate or carryover limit can never be passed off as the user's balance.
        const conceptOk = (e) => (specific.length ? specific.some(c => e.concepts.has(c)) : general.length ? (e.kind === 'record' || !e.policy) : true);
        const backRef = new RegExp(`\\b(the|that|this)\\s+${q.text.replace(/[.*+?^${}()|[\]\\$]/g, '\\$&')}`, 'i').test(clause)
          && grounded.some(g => same(g) && conceptOk(g));
        // A shared single-figure policy concept (one escalation threshold, one notice period…) is itself enough topic
        // overlap; deadlines are not single-figure (30/60/120 days differ by action), so they still need a shared word.
        const sharedConcept = (e) => specific.some(c => c !== 'deadline' && e.concepts.has(c));
        const ok = backRef || entries.some(e => same(e) && conceptOk(e) && (sharedConcept(e) || [...e.keys].some(k => keys.has(k))));
        if (ok) { const e = entries.find(x => same(x) && conceptOk(x)); grounded.push({ ...q, kind: e?.kind ?? 'record', policy: e?.policy ?? false, concepts: e?.concepts ?? new Set(specific) }); } else bad.add(q.text);
      }
    }
  });
  return [...bad];
}

// Procedures may only use channels and documents the sources mention: an answer that sends someone to a
// portal, an invoice or a reimbursement process the documents never describe is inventing a procedure.
const CHANNELS = {
  portal: /\bportals?\b/, website: /\bweb[\s-]?sites?\b|\bonline form/, 'mobile app': /\bmobile apps?\b/, email: /\be-?mails?\b/, fax: /\bfax/,
  phone: /\bphone\b|\bhotline/, invoice: /\binvoices?\b/, receipt: /\breceipts?\b/, reimbursement: /\breimburs/, voucher: /\bvouchers?\b/,
  upload: /\bupload/, ticket: /\btickets?\b/, 'help desk': /\bhelp[\s-]?desk/, intranet: /\bintranet/, 'payroll system': /\bpayroll system/,
  'HR system': /\bhr system/, 'self-service': /\bself[\s-]service/,
};
// Only an affirmative instruction can invent a procedure: a negated clause ("a phone call does not replace this",
// "I cannot treat this as an email") is checked out, clause by clause, so "no invoice needed, just email HR" still fails.
const NEGATED = /\b(?:not|no|never|cannot|can't|won't|don't|doesn't|isn't|aren't|without|neither|nor)\b|n't\b/;
export function inventedChannels(text, { facts = {}, docs = [] }) {
  const known = `${JSON.stringify(facts)} ${docs.map(d => d.content).join(' ')}`.toLowerCase();
  const affirmative = sentences(text).flatMap(clauses).map(c => c.toLowerCase()).filter(c => !NEGATED.test(c)).join(' \n ');
  return Object.keys(CHANNELS).filter(name => CHANNELS[name].test(affirmative) && !CHANNELS[name].test(known));
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

// "this claim is over $5,000" is checked against the claim's amount, however it is worded ("the claim amount",
// "its amount", "this one", the ID). A restated policy ("Claims over $5,000 are escalated") and a hypothetical
// ("if a claim were over $5,000") are not claims about this record; negation ("not over") is honoured.
const COMPARATOR = new RegExp(`(?:(not|n't|never)\\s+)?\\b(over|above|more than|greater than|exceed(?:s|ing|ed)?|under|below|less than)\\b((?:\\s+[^\\s$]+){0,4}?)\\s+\\$\\s?(${DIGITS})`, 'gi');
export function claimComparisonProblems(text, facts = {}) {
  const claims = facts.claims ?? [];
  const out = [];
  for (const sentence of sentences(text)) {
    for (const m of sentence.matchAll(COMPARATOR)) {
      const before = sentence.slice(0, m.index).split(/[,;:]\s|\s(?:and|but|so|while|which)\s/i).pop().toLowerCase();
      if (/\bclaims\b|\b(any|a) claim\b|\bif\b|\bwould\b|\bunless\b|\bonly when\b|\bwhen\b|\bwere\b/.test(before)) continue;
      const negated = Boolean(m[1]) || /\b(not|n't|never|no)\s*$/.test(before) || /\b(does|is|are|was)\s+not\s*$/.test(before);
      const ids = sentence.match(/CLM-\d{4}/gi) ?? [];
      const claim = ids.length ? claims.find(c => c.id === ids[0].toUpperCase()) : claims.length === 1 ? claims[0] : null;
      if (!claim || claim.amountCents == null) continue;
      const amount = claim.amountCents / 100; const threshold = num(m[4]);
      const above = /over|above|more|greater|exceed/i.test(m[2]);
      const holds = above ? amount > threshold : amount < threshold;
      if (negated ? holds : !holds) out.push(`${claim.id} is ${negated ? 'not ' : ''}${m[2]} $${m[4]} but its amount is $${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    }
  }
  return out;
}

// Calendar dates stated in the answer must appear in the records, the documents, or be today. A date with a
// year must match exactly (year included) and be a real calendar date; a month-day without a year matches by day.
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DATE = /\b(\d{4})-(\d{2})-(\d{2})\b|\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b(?:,?\s+(\d{4})\b)?/gi;
function monthDays(text) {
  const out = [];
  for (const m of canonicalText(text).matchAll(DATE)) {
    const [y, mo, d] = m[1] ? [Number(m[1]), Number(m[2]), Number(m[3])] : [m[6] ? Number(m[6]) : null, MONTHS.indexOf(m[4].slice(0, 3).toLowerCase()) + 1, Number(m[5])];
    const real = !y || (() => { const x = new Date(Date.UTC(y, mo - 1, d)); return x.getUTCFullYear() === y && x.getUTCMonth() === mo - 1 && x.getUTCDate() === d; })();
    out.push({ md: `${mo}-${d}`, full: y ? `${y}-${mo}-${d}` : null, real, text: m[0] });
  }
  return out;
}
export function ungroundedDates(text, { facts = {}, docs = [], today = null }) {
  const known = [...monthDays(JSON.stringify(facts)), ...docs.flatMap(d => monthDays(d.content)), ...(today ? monthDays(today) : [])];
  const md = new Set(known.map(d => d.md)); const full = new Set(known.filter(d => d.full).map(d => d.full));
  return [...new Set(monthDays(text).filter(d => !d.real || (d.full ? !full.has(d.full) : !md.has(d.md))).map(d => d.text))];
}
