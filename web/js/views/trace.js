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
    const d = result.decision;
    const row = (label, value, tone) => [el('dt', {}, label), el('dd', tone ? { class: `decision-${tone}` } : {}, value)];
    const decisionCard = d ? el('section', { class: 'decision-card', 'aria-label': 'Decision summary' }, el('h3', {}, 'Decision summary'), el('dl', { class: 'decision-grid' },
      ...row('Identity', `${d.actor} — ${roles[d.role] ?? d.role}`),
      ...row('Intent', d.intent ? labelize(d.intent) : '—'),
      ...row('Required permission', d.requiredPermission ?? '—'),
      ...row('Authorization', d.authorization ?? '—', d.authorization === 'DENIED' ? 'bad' : 'good'),
      ...row('Restricted retrieval', d.restrictedRetrieval),
      ...row('Model received restricted data', d.modelReceivedRestrictedData, /^YES/.test(d.modelReceivedRestrictedData ?? '') ? 'bad' : 'good'),
      ...row('Sources', d.sources?.length ? d.sources.join(' · ') : 'None'),
      ...row('Reasoning model', d.model ?? 'Not called'),
      ...row('Requested action', d.requestedAction ?? 'None'),
      ...row('Validation', d.validation, /FAILED|REJECTED/.test(d.validation ?? '') ? 'bad' : null),
      ...(d.initialExecution && d.initialExecution !== d.execution ? row('Execution at this turn', d.initialExecution) : []),
      ...row(d.initialExecution && d.initialExecution !== d.execution ? 'Execution now' : 'Execution', d.execution, d.execution === 'SUCCESS' ? 'good' : ['REJECTED', 'CANCELLED', 'EXPIRED'].includes(d.execution) ? 'bad' : null),
      ...(d.lifecycle?.length ? row('After this turn', d.lifecycle.map(e => `${labelize(e.event)} · ${timestamp(e.at)} · ${e.auditId}`).join('\n')) : []),
      ...(d.stateChange ? row('State change', d.stateChange) : []),
      ...row('Audit', [d.auditEventId, ...(d.securityEventIds?.length ? d.securityEventIds : d.securityEventId ? [d.securityEventId] : []).map(id => `${id} (security)`), d.executionAuditId && `${d.executionAuditId} (execution)`].filter(Boolean).join(' · ') || '—'))) : null;
    const timeline = el('ol', { class: 'timeline' });
    for (const name of steps) {
      const step = result.steps.find(item => item.name === name);
      const status = step?.status ?? 'skipped';
      timeline.append(el('li', { class: `trace-step trace-${status}` },
        el('span', { class: 'trace-icon', 'aria-label': labelize(status) }, symbols[status] ?? '–'),
        el('div', {}, el('div', { class: 'trace-step-heading' }, el('h3', {}, labelize(name)), el('span', { class: 'muted small' }, step ? `${labelize(status)} · ${step.ms} ms` : 'Not recorded')),
          el('p', {}, step?.summary ?? 'This step was not recorded for this turn.'),
          name === 'execution' && d?.lifecycle?.length ? el('p', { class: 'small muted' }, `Recorded when the turn ran. Later: ${d.lifecycle.map(e => `${labelize(e.event).toLowerCase()} (${e.auditId})`).join(', ')}.`) : null,
          step ? details('Technical details', step.detail) : null)));
    }
    content.replaceChildren(el('p', { class: 'muted' }, `${result.user.displayName} · ${roles[result.user.role] ?? result.user.role} · ${timestamp(result.at)}`), decisionCard ?? '', el('h3', { class: 'timeline-title' }, 'Step by step'), el('p', { class: 'small muted' }, 'Expand a step to inspect its recorded details.'), timeline);
  };
}
