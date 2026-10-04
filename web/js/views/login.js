import { api } from '../api.js';
import { busy, message } from './shared.js';

export function login() {
  const form = document.querySelector('#login-form');
  const error = document.querySelector('#login-error');
  const personaError = document.querySelector('#persona-error');
  const submit = form.querySelector('[type="submit"]');
  const personas = [...document.querySelectorAll('[data-persona]')];
  // Persona shortcuts ask the server to start a normal session for a named demo persona; the browser never sends a role.
  for (const row of personas) {
    row.addEventListener('click', async () => {
      if (row.disabled) return;
      for (const other of personas) other.disabled = true;
      row.classList.add('is-busy');
      message(personaError, '');
      const result = await api('/auth/demo', { method: 'POST', body: { persona: row.dataset.persona } });
      if (result.error) {
        message(personaError, result.error.message);
        for (const other of personas) other.disabled = false;
        row.classList.remove('is-busy');
      } else location.assign('/app.html');
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
