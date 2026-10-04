import { api } from '../api.js';
import { el, heading, table, cell, pill, timestamp, notice, message, busy, loading, empty, button, details, roles, labelize, dataChanged } from './shared.js';

export function audit(root, ctx) {
  const feedback = notice();
  const content = el('section', { class: 'card' }, loading());
  const filter = el('input', { type: 'checkbox', id: 'security-only' });
  const refresh = button('Refresh now', load);
  const automatic = button('Auto-refresh: off', () => {
    enabled = !enabled;
    automatic.textContent = `Auto-refresh: ${enabled ? 'on' : 'off'}`;
    automatic.setAttribute('aria-pressed', String(enabled));
    if (enabled) { load(); timer = setInterval(load, 15000); }
    else clearInterval(timer);
  });
  automatic.setAttribute('aria-pressed', 'false');
  const reset = button('Reset demo data', async () => {
    if (!window.confirm('Reset all shared demo business data to the starting records? Other signed-in viewers will see the reset. Sessions remain signed in.')) return;
    busy(reset, true, 'Resetting…');
    message(feedback, '');
    const result = await api('/admin/reset', { method: 'POST' });
    if (!ctx.active()) return;
    busy(reset, false);
    if (result.error) message(feedback, result.error.message);
    else { message(feedback, 'Demo data reset. Sessions are still signed in.', 'success'); dataChanged(); }
  }, 'button danger');
  let enabled = false;
  let timer;
  let ticket = 0;
  root.append(heading('Audit Log', 'See who did what, and inspect the checks behind each assistant turn.', reset), feedback,
    el('div', { class: 'toolbar' }, el('label', { class: 'checkbox-label', for: 'security-only' }, filter, 'Security events only'), el('div', { class: 'button-row' }, refresh, automatic)),
    el('p', { class: 'small muted' }, 'Showing up to 100 events, newest first. Auto-refresh checks every 15 seconds.'), content);
  async function load() {
    const current = ++ticket;
    refresh.disabled = true;
    const result = await api(`/audit?${filter.checked ? 'security=1&' : ''}limit=100`);
    if (!ctx.active() || current !== ticket) return;
    refresh.disabled = false;
    if (result.error) { message(feedback, result.error.message); if (!content.querySelector('table')) content.replaceChildren(empty('Audit records could not be loaded.')); return; }
    if (feedback.classList.contains('error')) message(feedback, '');
    if (!result.events.length) { content.replaceChildren(empty(filter.checked ? 'No security events match this filter.' : 'No audit events recorded yet.')); return; }
    const grid = table(['When', 'Who', 'Event', 'Details', 'Decision record'], 'Audit events, newest first');
    const events = [...result.events].sort((a, b) => b.at.localeCompare(a.at) || b.id - a.id);
    for (const event of events) grid.body.append(el('tr', {}, cell(timestamp(event.at)), cell(el('strong', {}, event.actorName ?? 'System'), el('p', { class: 'small muted' }, roles[event.actorRole] ?? 'System')),
      cell(el('span', {}, labelize(event.kind)), event.security ? pill('denied', 'Security') : null), cell(details('Recorded details', event.detail)),
      cell(event.turnId ? button('View trace', () => ctx.openTrace(event.turnId), 'text-button') : el('span', { class: 'muted' }, 'No assistant turn'))));
    content.replaceChildren(grid.node);
  }
  filter.addEventListener('change', load);
  ctx.cleanup(() => clearInterval(timer));
  ctx.on(window, 'careops:data-changed', load);
  load();
}
