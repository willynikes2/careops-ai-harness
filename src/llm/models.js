export const MODELS = Object.freeze([
  { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B (open-weight)', inPerM: 0.04, outPerM: 0.17 },
  { id: 'qwen/qwen3-235b-a22b-2507', label: 'Qwen3 235B (open-weight)', inPerM: 0.09, outPerM: 0.35 },
  { id: 'openai/gpt-5.4-mini', label: 'GPT-5.4 mini', inPerM: 0.75, outPerM: 4.5 },
  { id: 'anthropic/claude-sonnet-5.5', label: 'Claude Sonnet 5.5 (frontier)', inPerM: 2.0, outPerM: 10.0 },
]);
export const isKnownModel = (id) => MODELS.some(m => m.id === id);
