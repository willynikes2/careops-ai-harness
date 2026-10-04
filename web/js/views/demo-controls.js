import { api } from '../api.js';
import { el, heading, notice, message, busy, button, dataChanged } from './shared.js';

export function demoControls(root, ctx) {
  const feedback = notice();
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
  root.append(heading('Demo Controls', 'Return the shared synthetic workplace to its starting state before a walkthrough.'), feedback,
    el('section', { class: 'card stack' },
      el('h2', {}, 'Reset demo data'),
      el('p', {}, 'Restores the synthetic people, manager relationships, PTO balances and requests, claims and statuses, and billing follow-ups to their starting records.'),
      el('ul', { class: 'plain-list' },
        el('li', {}, 'Kept: the audit log and decision records (they are append-only), sign-ins, recorded lab results.'),
        el('li', {}, 'Knowledge documents, including the planted prompt-injection bulletin, are fixed fixtures and are not changed by a reset.'),
        el('li', {}, 'Only Compliance Admin can reset; the server checks the role and the request token, and the reset is recorded in the audit log.')),
      el('div', { class: 'button-row' }, reset)));
}
