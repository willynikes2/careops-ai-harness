// Selection counts provider errors as misses (reported pass rates exclude them): the chat default must answer reliably.
const reliability = (m) => (m.total === undefined ? m.passRate : m.passed / Math.max(1, m.total + (m.errors ?? 0)));
export function chooseDefault(models) {
  const ok = models.filter(m => reliability(m) >= 0.9).sort((a, b) => a.avgCostUsd - b.avgCostUsd);
  return (ok[0] ?? [...models].sort((a, b) => reliability(b) - reliability(a))[0]).id;
}
