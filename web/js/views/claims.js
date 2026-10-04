import { api, newKey } from '../api.js';
import { el, heading, table, cell, pill, date, money, notice, message, busy, loading, empty, button, taskKinds, claimStatuses, labelize } from './shared.js';

export function claims(root, ctx) {
  const feedback = notice();
  const queue = el('section', { class: 'card' }, loading());
  const panel = el('section', { class: 'card claim-detail', hidden: true, 'aria-label': 'Claim details' });
  const refresh = button('Refresh', () => { load(); if (selectedId) open(selectedId); });
  let selectedId = null;
  let detailTicket = 0;
  let listTicket = 0;
  root.append(heading('Claims', 'Review your assigned claims and record the next step.', refresh), feedback, queue, panel);

  async function load() {
    const ticket = ++listTicket;
    refresh.disabled = true;
    const result = await api('/claims');
    if (!ctx.active() || ticket !== listTicket) return;
    refresh.disabled = false;
    if (result.error) { message(feedback, result.error.message); queue.replaceChildren(empty('The claim queue could not be loaded.')); return; }
    if (feedback.classList.contains('error')) message(feedback, '');
    if (!result.claims.length) { queue.replaceChildren(empty('No claims are assigned to you.')); return; }
    const grid = table(['Claim', 'Patient', 'Payer', 'Amount', 'Status', 'Denial code'], 'Claims assigned to you');
    for (const claim of result.claims) {
      const link = button(claim.id, () => open(claim.id, true), 'text-button');
      link.setAttribute('aria-label', `Open claim ${claim.id}`);
      const row = el('tr', { class: 'clickable-row', 'data-claim': claim.id, onclick: event => { if (!event.target.closest('button')) open(claim.id, true); } },
        cell(link), cell(claim.patientName), cell(claim.payer), cell(money(claim.amountCents)), cell(pill(claim.status)), cell(claim.denialCode ?? '—'));
      row.classList.toggle('selected-row', claim.id === selectedId);
      grid.body.append(row);
    }
    queue.replaceChildren(grid.node);
  }

  async function open(id, focus = false, successText = '') {
    const ticket = ++detailTicket;
    selectedId = id;
    panel.hidden = false;
    const title = el('h2', { tabindex: '-1' }, id);
    const close = button('Close details', () => {
      ++detailTicket;
      selectedId = null;
      panel.hidden = true;
      const rows = [...queue.querySelectorAll('[data-claim]')];
      for (const row of rows) row.classList.remove('selected-row');
      const opener = rows.find(row => row.dataset.claim === id)?.querySelector('button');
      (opener ?? queue.querySelector('button'))?.focus();
    }, 'button quiet');
    const header = el('div', { class: 'split-line' }, title, close);
    panel.replaceChildren(header, loading());
    for (const row of queue.querySelectorAll('[data-claim]')) row.classList.toggle('selected-row', row.dataset.claim === id);
    const result = await api(`/claims/${encodeURIComponent(id)}`);
    if (!ctx.active() || ticket !== detailTicket) return;
    if (result.error) { panel.replaceChildren(header, el('p', { class: 'notice error', role: 'alert' }, result.error.message), button('Try again', () => open(id, true))); if (focus) title.focus(); return; }
    const { claim, tasks } = result;
    const localFeedback = notice();
    const kind = el('select', { id: 'followup-kind', required: true }, Object.entries(taskKinds).map(([value, label]) => el('option', { value }, label)));
    const note = el('textarea', { id: 'followup-note', rows: '2', maxlength: '500', required: true, 'aria-describedby': 'followup-help' });
    const add = el('button', { class: 'button primary', type: 'submit' }, 'Add follow-up');
    const form = el('form', { class: 'stack' }, el('div', {}, el('label', { for: 'followup-kind' }, 'Follow-up kind'), kind),
      el('div', {}, el('label', { for: 'followup-note' }, 'Note'), note, el('p', { id: 'followup-help', class: 'small muted' }, 'Write one sentence describing the next step, up to 500 characters.')), add);
    const target = el('select', { id: 'claim-status', required: true }, claimStatuses.map(value => el('option', { value, selected: value === claim.status }, labelize(value))));
    const change = el('button', { class: 'button secondary', type: 'submit' }, 'Update status');
    const transition = el('form', { class: 'stack' }, el('div', {}, el('label', { for: 'claim-status' }, 'New claim status'), target), change,
      el('p', { class: 'small muted' }, 'CareOps checks each change against the permitted workflow. A denied claim cannot move straight to paid.'));
    const taskList = tasks.length ? el('ul', { class: 'task-list' }, tasks.map(task => el('li', {}, el('div', { class: 'split-line' }, el('strong', {}, taskKinds[task.kind] ?? labelize(task.kind)), pill(task.status)), el('p', { class: 'preserve-lines' }, task.note)))) : empty('No follow-ups yet. Add the next step below.');
    panel.replaceChildren(header, el('p', { class: 'muted' }, `${claim.patientName} · ${claim.payer} · ${money(claim.amountCents)} · Service date ${date(claim.serviceDate)}`), pill(claim.status),
      el('div', { class: 'notice neutral' }, el('strong', {}, 'Denial reason'), el('p', {}, claim.denialReason ?? 'No denial reason recorded.'), claim.denialCode ? el('p', { class: 'small' }, `Code: ${claim.denialCode}`) : null),
      localFeedback, el('h3', {}, 'Follow-ups'), taskList, el('div', { class: 'two-columns' }, el('section', {}, el('h3', {}, 'Add follow-up'), form), el('section', {}, el('h3', {}, 'Change claim status'), transition)));
    if (successText) message(localFeedback, successText, 'success');
    if (focus) { title.focus(); panel.scrollIntoView({ block: 'nearest' }); }
    let pending = false;
    async function mutate(path, body, control, success) {
      if (pending) return;
      pending = true;
      for (const input of panel.querySelectorAll('input, select, textarea, button')) input.disabled = true;
      busy(control, true, 'Saving…');
      message(localFeedback, '');
      const response = await api(`/claims/${encodeURIComponent(id)}/${path}`, { method: 'POST', body });
      if (!ctx.active() || ticket !== detailTicket) return;
      if (response.error) {
        for (const input of panel.querySelectorAll('input, select, textarea, button')) input.disabled = false;
        busy(control, false);
        pending = false;
        message(localFeedback, response.error.message);
      } else { await Promise.all([load(), open(id, false, success)]); }
    }
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (!note.value.trim()) { note.setCustomValidity('Write a note describing the next step.'); note.reportValidity(); return; }
      if (!pending) mutate('followups', { kind: kind.value, note: note.value.trim(), idempotencyKey: newKey() }, add, 'Follow-up created.');
    });
    note.addEventListener('input', () => note.setCustomValidity(''));
    transition.addEventListener('submit', event => { event.preventDefault(); mutate('transition', { to: target.value }, change, 'Claim status updated.'); });
  }
  ctx.on(window, 'careops:data-changed', () => { load(); if (selectedId) open(selectedId); });
  load();
}
