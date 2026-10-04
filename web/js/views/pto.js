import { api, newKey } from '../api.js';
import { el, heading, table, cell, pill, date, timestamp, hours, notice, message, busy, loading, empty, stat, button } from './shared.js';

export function pto(root, ctx) {
  const feedback = notice();
  const balances = el('div', { class: 'stat-grid' });
  const requests = el('div', {}, loading());
  const dateInput = el('input', { type: 'date', id: 'pto-date', name: 'date', required: true });
  const submit = el('button', { class: 'button primary', type: 'submit' }, 'Submit');
  const form = el('form', { class: 'inline-form' }, el('div', { class: 'field' }, el('label', { for: 'pto-date' }, 'Date of your day off'), dateInput), submit);
  const refresh = button('Refresh', load);
  let ticket = 0;
  root.append(heading('My PTO', 'Plan time away and follow your requests. All dates use the New York calendar.', refresh), feedback, balances,
    el('section', { class: 'card' }, el('h2', {}, 'Request a day'), el('p', { class: 'muted' }, 'One day is 8 hours. Requests need manager approval and at least 2 business days of notice.'), form),
    el('section', { class: 'card' }, el('h2', {}, 'Your requests'), requests));
  async function load() {
    const current = ++ticket;
    refresh.disabled = true;
    const result = await api('/pto/me');
    if (!ctx.active() || current !== ticket) return;
    refresh.disabled = false;
    if (result.error) {
      message(feedback, result.error.message);
      requests.replaceChildren(empty('Requests could not be refreshed. Try Refresh again.'));
      return;
    }
    if (feedback.classList.contains('error')) message(feedback, '');
    balances.replaceChildren(stat('Available hours', hours(result.balance.hoursAvailable)), stat('Pending hours', hours(result.balance.hoursPending), 'Awaiting manager approval'));
    if (!result.requests.length) { requests.replaceChildren(empty('No time off requested yet. Your first request will appear here.')); return; }
    const grid = table(['Date', 'Hours', 'Status', 'Submitted'], 'Your time-off requests');
    for (const request of result.requests) grid.body.append(el('tr', {}, cell(date(request.date)), cell(hours(request.hours)), cell(pill(request.status)), cell(timestamp(request.createdAt))));
    requests.replaceChildren(grid.node);
  }
  // One key per intended request: a retry after a dropped connection replays instead of duplicating; a new date gets a new key.
  let attempt = null;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submit.disabled) return;
    const selected = dateInput.value;
    if (!attempt || attempt.date !== selected) attempt = { date: selected, key: newKey() };
    const idempotencyKey = attempt.key;
    busy(submit, true, 'Submitting…');
    dateInput.disabled = true;
    message(feedback, '');
    const result = await api('/pto/requests', { method: 'POST', body: { date: selected, hours: 8, idempotencyKey } });
    busy(submit, false);
    dateInput.disabled = false;
    if (!ctx.active()) return;
    if (result.error) message(feedback, result.error.message);
    else {
      attempt = null;
      form.reset();
      message(feedback, `Your request for ${date(result.date)} was submitted. Status: ${result.status.toLowerCase()}.`, 'success');
      await load();
    }
  });
  ctx.on(window, 'careops:data-changed', load);
  load();
}
