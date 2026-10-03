import { z } from 'zod';
// The only shape a model answer may take. Anything else is withheld.
export const ModelOutput = z.object({
  answer: z.string().min(1).max(4000),
  citations: z.array(z.union([z.string(), z.number()]).transform(String)).max(10).default([]),
  proposed_action: z.object({ tool: z.string().max(64), args: z.record(z.unknown()).default({}) }).nullable().default(null),
  needs_clarification: z.string().max(500).nullable().default(null),
});
export function parseModelOutput(text) {
  const cleaned = String(text ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = cleaned.indexOf('{'); const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return { ok: false, reason: 'no JSON object in model output' };
  let json; try { json = JSON.parse(cleaned.slice(start, end + 1)); } catch { return { ok: false, reason: 'model output is not valid JSON' }; }
  const parsed = ModelOutput.safeParse(json);
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, reason: 'model output does not match the response schema' };
}
