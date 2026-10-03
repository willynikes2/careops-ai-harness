import { api } from '../api.js';
import { el, loading, details, timestamp, roles, labelize } from './shared.js';

const steps = ['identity', 'policy', 'state', 'retrieval', 'reasoning', 'validation', 'execution', 'audit'];
const symbols = { ok: '✓', denied: '⛔', error: '⚠', skipped: '–' };

export function createTraceDrawer() {
  const dialog = document.querySelector('#trace-drawer');
  const content = document.querySelector('#trace-content');
  let request = 0;
  let opener;
  document.querySelector('#close-trace').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    request += 1;
    if (opener?.isConnected) opener.focus();
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  return async function openTrace(turnId) {
    const ticket = ++request;
    opener = document.activeElement;
    content.replaceChildren(loading());
    if (!dialog.open) dialog.showModal();
    const result = await api(`/traces/${encodeURIComponent(turnId)}`);
    if (ticket !== request || !dialog.open) return;
    if (result.error) {
      content.replaceChildren(el('p', { class: 'notice error', role: 'alert' }, result.error.message));
      return;
    }
    const timeline = el('ol', { class: 'timeline' });
    for (const name of steps) {
      const step = result.steps.find(item => item.name === name);
      const status = step?.status ?? 'skipped';
      timeline.append(el('li', { class: `trace-step trace-${status}` },
        el('span', { class: 'trace-icon', 'aria-label': labelize(status) }, symbols[status] ?? '–'),
        el('div', {}, el('div', { class: 'trace-step-heading' }, el('h3', {}, labelize(name)), el('span', { class: 'muted small' }, step ? `${labelize(status)} · ${step.ms} ms` : 'Not recorded')),
          el('p', {}, step?.summary ?? 'This step was not recorded for this turn.'), step ? details('Technical details', step.detail) : null)));
    }
    content.replaceChildren(el('p', { class: 'muted' }, `${result.user.displayName} · ${roles[result.user.role] ?? result.user.role} · ${timestamp(result.at)}`), el('p', { class: 'small muted' }, 'Follow the checks made for this answer. Expand a step to inspect its recorded details.'), timeline);
  };
}
