import { api } from '../api.js';
import { busy, message } from './shared.js';

export function login() {
  const form = document.querySelector('#login-form');
  const error = document.querySelector('#login-error');
  const submit = form.querySelector('[type="submit"]');
  for (const row of document.querySelectorAll('[data-account]')) {
    row.addEventListener('click', () => {
      form.elements.username.value = row.dataset.account;
      form.elements.password.value = 'careops-demo';
      message(error, '');
      submit.focus();
    });
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submit.disabled) return;
    busy(submit, true, 'Signing in…');
    message(error, '');
    const result = await api('/auth/login', { method: 'POST', body: { username: form.elements.username.value.trim(), password: form.elements.password.value } });
    if (result.error) {
      message(error, result.error.message);
      busy(submit, false);
    } else location.assign('/app.html');
  });
}
