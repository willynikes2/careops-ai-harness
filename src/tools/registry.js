import { z } from 'zod';
import { can } from '../policy/permissions.js';
import { createPtoRequest } from '../domain/pto.js';
import { createFollowup, TASK_KINDS } from '../domain/claims.js';
import { formatDate } from '../util/dates.js';

// The ONLY operations a model can propose. Each is narrow, schema-checked, re-authorized at execution, and idempotent via pending_actions.
export const TOOLS = Object.freeze({
  create_pto_request: {
    permission: 'pto:request:self', intents: ['pto_request'],
    args: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), hours: z.number().positive().max(8).default(8) }).strict(),
    checkResources: (a, facts) => ((facts.ptoDateCandidates ?? []).includes(a.date) ? null : `date ${a.date} is not the date the user asked for`),
    summarize: (a) => `Request ${a.hours} hours of PTO on ${formatDate(a.date)} (${a.date})`,
    execute: ({ db, user, args, clock }) => createPtoRequest(db, { user, date: args.date, hours: args.hours, clock }),
    resultMessage: (r) => `PTO request for ${r.date} submitted — status ${r.status}. Your manager will see it in Approvals.`,
    stateChange: (r) => `PTO request ${r.id} created for ${r.date} (status ${r.status})`,
  },
  create_billing_followup: {
    permission: 'billing:task:create', intents: ['billing'],
    args: z.object({ claimId: z.string().regex(/^CLM-\d{4}$/), kind: z.enum(TASK_KINDS), note: z.string().min(1).max(500) }).strict(),
    checkResources: (a, facts) => ((facts.claims ?? []).some(c => c.id === a.claimId) ? null : `claim ${a.claimId} is not in this user's authorized context`),
    summarize: (a) => `Create ${a.kind} follow-up on ${a.claimId}: "${a.note}"`,
    execute: ({ db, user, args, clock }) => createFollowup(db, { user, claimId: args.claimId, kind: args.kind, note: args.note, clock }),
    resultMessage: (t) => `${t.kind} follow-up created on ${t.claimId}.`,
    stateChange: (t) => `Follow-up ${t.id} (${t.kind}) created on ${t.claimId}`,
  },
});
export const getTool = (name) => (Object.hasOwn(TOOLS, name) ? TOOLS[name] : null);
export const allowedToolsFor = (user, intent) => Object.entries(TOOLS).filter(([, t]) => can(user, t.permission) && t.intents.includes(intent)).map(([n]) => n);

export function validateProposal({ proposal, user, intent, facts }) {
  if (!proposal) return { ok: true, action: null };
  const tool = getTool(proposal.tool);
  if (!tool) return { ok: false, reason: `unknown tool "${proposal.tool}" (not in registry)` };
  if (!can(user, tool.permission)) return { ok: false, reason: `role ${user.role} lacks ${tool.permission}` };
  if (!tool.intents.includes(intent)) return { ok: false, reason: `tool ${proposal.tool} is not allowed for a "${intent}" request` };
  const parsed = tool.args.safeParse(proposal.args ?? {});
  if (!parsed.success) return { ok: false, reason: `invalid args: ${parsed.error.issues.map(i => `${i.path.join('.') || 'args'} ${i.message}`).join('; ')}` };
  const resourceError = tool.checkResources(parsed.data, facts);
  if (resourceError) return { ok: false, reason: resourceError };
  return { ok: true, action: { tool: proposal.tool, args: parsed.data, summary: tool.summarize(parsed.data) } };
}
