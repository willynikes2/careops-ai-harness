export function loadConfig(env = process.env) {
  return {
    port: Number(env.PORT ?? 3000),
    dbPath: env.DB_PATH ?? './data/careops.db',
    kbUrl: env.KB_URL ?? 'http://careops-kb:3838',
    kbApiKey: env.KB_API_KEY ?? '',
    openrouterKey: env.OPENROUTER_API_KEY ?? '',
    defaultModel: env.DEFAULT_MODEL ?? 'openai/gpt-5.4-mini',
    dailyBudgetUsd: Number(env.DAILY_BUDGET_USD ?? 3),
    demoPassword: env.DEMO_PASSWORD ?? 'careops-demo',
    secureCookies: env.NODE_ENV === 'production',
  };
}
