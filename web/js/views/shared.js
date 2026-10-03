export const roles = { employee: 'Employee', manager: 'Manager', billing: 'Billing Specialist', admin: 'Compliance Admin' };
export const claimStatuses = ['SUBMITTED', 'PENDING_INFO', 'DENIED', 'APPEALED', 'RESUBMITTED', 'PAID', 'CLOSED'];
export const taskKinds = { AUTH_DOCUMENTATION: 'Authorization documentation', CODING_REVIEW: 'Coding review', PAYER_CALL: 'Payer call', APPEAL_PREP: 'Appeal preparation' };

// All server text is a text node, including model answers and audit details.
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key === 'disabled' || key === 'checked' || key === 'hidden' || key === 'required' || key === 'selected') node[key] = value;
    else node.setAttribute(key, value);
  }
  node.append(...children.flat().filter(child => child !== undefined && child !== null));
  return node;
}

export const button = (label, onClick, className = 'button secondary') => el('button', { type: 'button', class: className, onclick: onClick }, label);
export const labelize = value => String(value ?? '').toLowerCase().replaceAll('_', ' ').replace(/^./, c => c.toUpperCase());
export const pill = (value, label = labelize(value)) => el('span', { class: `pill status-${String(value).toLowerCase().replace(/[^a-z_]/g, '')}` }, label);
export const money = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
export const cost = amount => `$${Number(amount).toFixed(4)}`;
export const hours = value => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
export function date(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`));
}
export function timestamp(value) {
  if (!value) return 'Not recorded';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York', timeZoneName: 'short' }).format(new Date(value));
}
export const notice = () => el('p', { class: 'notice', role: 'status', hidden: true });
export function message(node, text, kind = 'error') {
  node.textContent = text ?? '';
  node.className = `notice ${kind}`;
  node.hidden = !text;
  node.setAttribute('role', kind === 'error' ? 'alert' : 'status');
}
export function busy(control, waiting, pendingLabel = 'Working…') {
  if (waiting) {
    control.dataset.label = control.textContent;
    control.replaceChildren(el('span', { class: 'spinner', 'aria-hidden': 'true' }), pendingLabel);
  } else control.textContent = control.dataset.label ?? control.textContent;
  control.disabled = waiting;
}
export const loading = () => el('p', { class: 'loading', role: 'status' }, el('span', { class: 'spinner', 'aria-hidden': 'true' }), 'Loading…');
export const empty = text => el('p', { class: 'empty-state' }, text);
export const heading = (title, description, actions) => el('div', { class: 'page-heading' }, el('div', {}, el('p', { class: 'eyebrow' }, 'CAREOPS WORKSPACE'), el('h1', {}, title), el('p', { class: 'muted' }, description)), actions);
export function table(headers, caption) {
  const body = el('tbody');
  const node = el('div', { class: 'table-scroll' }, el('table', {}, el('caption', { class: 'sr-only' }, caption), el('thead', {}, el('tr', {}, headers.map(header => el('th', { scope: 'col' }, header)))), body));
  return { node, body };
}
export const cell = (...children) => el('td', {}, ...children);
export const details = (title, value) => el('details', { class: 'technical-detail' }, el('summary', {}, title), el('pre', {}, JSON.stringify(value, null, 2)));
export function stat(label, value, description) {
  return el('div', { class: 'card stat-card' }, el('p', { class: 'muted' }, label), el('p', { class: 'stat-value' }, value), description ? el('p', { class: 'muted small' }, description) : null);
}
export const dataChanged = () => window.dispatchEvent(new Event('careops:data-changed'));
