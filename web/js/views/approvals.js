import { api, newKey } from '../api.js';
import { el, heading, table, cell, pill, date, hours, notice, message, busy, loading, empty, button } from './shared.js';

export function approvals(root, ctx) {
  const feedback = notice();
  const content = el('section', { class: 'card' }, loading());
  const refresh = button('Refresh', load);
  let ticket = 0;
  root.append(heading('Approvals', 'Review time-off requests from your direct reports.', refresh), feedback, content);
  function row(request) {
    const node = el('tr');
    const actions = el('div', { class: 'button-row' });
    if (request.status === 'PENDING') {
      const keys = { APPROVED: newKey(), DENIED: newKey() }; // stable per row and decision, so a retry replays
      const approve = button('Approve', () => decide('APPROVED', approve), 'button primary small-button');
      const deny = button('Deny', () => decide('DENIED', deny), 'button danger small-button');
      actions.append(approve, deny);
      async function decide(decision, selected) {
        if (selected.disabled) return;
        approve.disabled = true;
        deny.disabled = true;
        const idempotencyKey = keys[decision];
        busy(selected, true, 'Saving…');
        message(feedback, '');
        const result = await api(`/pto/requests/${encodeURIComponent(request.id)}/decision`, { method: 'POST', body: { decision, idempotencyKey } });
        if (!ctx.active()) return;
        if (result.error) {
          busy(selected, false);
          approve.disabled = false;
          deny.disabled = false;
          message(feedback, result.error.message);
        } else {
          node.replaceWith(row(result));
          message(feedback, `${result.employeeName}'s request for ${date(result.date)} was ${result.status.toLowerCase()}.`, 'success');
        }
      }
    } else actions.append(el('span', { class: 'muted' }, 'Decision recorded'));
    node.append(cell(request.employeeName), cell(date(request.date)), cell(hours(request.hours)), cell(pill(request.status)), cell(actions));
    return node;
  }
  async function load() {
    const current = ++ticket;
    refresh.disabled = true;
    const result = await api('/pto/approvals');
    if (!ctx.active() || current !== ticket) return;
    refresh.disabled = false;
    if (result.error) { message(feedback, result.error.message); content.replaceChildren(empty('Requests could not be loaded.')); return; }
    if (feedback.classList.contains('error')) message(feedback, '');
    if (!result.requests.length) { content.replaceChildren(empty('Your direct reports have no requests to review.')); return; }
    const grid = table(['Employee', 'Date', 'Hours', 'Status', 'Decision'], 'Time-off requests from your direct reports');
    grid.body.append(...result.requests.map(row));
    content.replaceChildren(grid.node);
  }
  ctx.on(window, 'careops:data-changed', load);
  load();
}
