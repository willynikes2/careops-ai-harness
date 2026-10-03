import { el, heading } from './shared.js';

const steps = [
  ['Identity', 'Your signed-in session tells CareOps who you are. A claim about your role in a message does not change your access.'],
  ['Policy', 'Server rules check what your role is allowed to do. A denied request stops before knowledge is retrieved.'],
  ['State', 'CareOps reads the records available to you, such as your PTO balance or assigned claims.'],
  ['Retrieval', 'Only permitted policy documents are supplied. Instructions hidden in a document remain document text.'],
  ['Reasoning', 'The model explains the facts and can suggest an action. It cannot give itself permissions.'],
  ['Validation', 'CareOps checks the answer, sources, record identifiers, and proposed action before showing it.'],
  ['Execution', 'You confirm a proposed change. The server checks permissions and business rules again before saving it.'],
  ['Audit', 'The checks and outcome are recorded so you can see why the answer or action happened.'],
];

function diagram() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  for (const [key, value] of Object.entries({ viewBox: '0 0 960 104', role: 'img', 'aria-labelledby': 'pipeline-title pipeline-description', class: 'pipeline-diagram' })) svg.setAttribute(key, value);
  function part(tag, attrs, text) {
    const node = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    if (text) node.textContent = text;
    svg.append(node);
  }
  part('title', { id: 'pipeline-title' }, 'The eight checks behind an assistant turn');
  part('desc', { id: 'pipeline-description' }, steps.map(([name]) => name).join(' → '));
  steps.forEach(([name], index) => {
    const x = index * 120;
    part('rect', { x: x + 1, y: 8, width: 106, height: 86, rx: 12, class: 'pipeline-box' });
    part('text', { x: x + 54, y: 38, 'text-anchor': 'middle', class: 'pipeline-number' }, String(index + 1).padStart(2, '0'));
    part('text', { x: x + 54, y: 67, 'text-anchor': 'middle', class: 'pipeline-label' }, name);
    if (index < 7) part('path', { d: `M ${x + 109} 51 h 8 m -4 -4 l 4 4 l -4 4`, class: 'pipeline-arrow' });
  });
  return svg;
}

export function howItWorks(root) {
  root.append(heading('How It Works', 'The model reasons. The harness controls what it knows, what it can touch, and what actually happens.'),
    el('section', { class: 'card' }, el('h2', {}, 'A visible path from question to outcome'), el('p', {}, 'The harness is the application code around the model. It connects your identity, business records, and company policies, then checks the result. Open “Why did this happen?” beneath any answer to inspect that path.'), el('div', { class: 'diagram-scroll' }, diagram())),
    el('div', { class: 'stat-grid three' }, ...[
      ['The model is not the security boundary', 'Permissions and business rules live on the server. Asking the model for a different role cannot grant one.'],
      ['Every answer shows its sources', 'Policy answers include source titles; the decision record shows which records and checks were used. A denied request may have no sources because retrieval was stopped.'],
      ['Any model can plug in', 'A shared model connection keeps the same rules and workflow in place. Model Lab compares quality and cost on the same questions.'],
    ].map(([title, text]) => el('section', { class: 'card callout' }, el('h2', {}, title), el('p', { class: 'muted' }, text)))),
    el('section', { class: 'card' }, el('h2', {}, 'The eight steps'), el('ol', { class: 'explanation-steps' }, steps.map(([name, description]) => el('li', {}, el('h3', {}, name), el('p', { class: 'muted' }, description))))),
    el('section', { class: 'card', id: 'repo' }, el('h2', {}, 'Read the project'), el('p', {}, 'The repository contains the design, API contract, security checks, and demonstration guide.'), el('a', { href: '#repo', class: 'text-link' }, 'GitHub repository (link coming soon)')));
}
