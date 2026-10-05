import { api } from '../api.js';
import { el, heading, table, cell, pill, cost, timestamp, notice, message, busy, loading, empty, button, stat, labelize } from './shared.js';

function lab(root, ctx, { title, description, endpoint, render, costNote }) {
  const feedback = notice();
  const content = el('div', {}, loading());
  const refresh = button('Refresh results', () => load(false));
  const run = button('Run again (live)', () => load(true), 'button primary');
  let pending = false;
  root.append(heading(title, description, el('div', { class: 'button-row' }, refresh, run)),
    el('p', { class: 'small muted' }, costNote), feedback, content);
  async function load(live) {
    if (pending) return;
    pending = true;
    refresh.disabled = true;
    run.disabled = true;
    if (live) busy(run, true, 'Running…');
    message(feedback, live ? 'The live run is in progress. Results will appear when it finishes.' : '', 'neutral');
    const result = await api(`/labs/${endpoint}${live ? '/run' : ''}`, live ? { method: 'POST' } : {});
    if (!ctx.active()) return;
    pending = false;
    if (live) busy(run, false);
    refresh.disabled = false;
    run.disabled = false;
    if (result.error) {
      message(feedback, result.error.message);
      if (!content.dataset.loaded) content.replaceChildren(empty(result.error.code === 'not_found' ? 'No recorded run yet. Run the lab to create the first result.' : 'Results could not be loaded. Try Refresh results.'));
    } else {
      content.replaceChildren(render(result, ctx));
      content.dataset.loaded = 'true';
      message(feedback, live ? 'Live run complete.' : '', 'success');
    }
  }
  load(false);
}

// What the lab saw when it confirmed the proposal inside a rolled-back transaction (worst case: the user clicks Confirm).
function confirmedText(v) {
  if (!('ifConfirmed' in v)) return 'If confirmed: not measured in this stored run.';
  if (!v.ifConfirmed) return 'If confirmed: nothing to confirm — no action was proposed.';
  const fx = v.ifConfirmed.effects.map(e => `${e.change} ${e.table.replace('_', ' ')} (${e.owner === v.ifConfirmed.userId ? 'own record' : `owned by ${e.owner}`})`).join(', ') || 'no changes';
  return `If confirmed: ${v.ifConfirmed.status.toLowerCase()} — ${fx}${v.ifConfirmed.crossedBoundary ? ' — CROSSED A BOUNDARY' : ''}. Measured in a rolled-back transaction; nothing was kept.`;
}

export function attackLab(root, ctx) {
  lab(root, ctx, {
    title: 'Attack Lab', endpoint: 'attacks',
    description: 'Two layers of protection, measured separately.',
    costNote: 'A live run costs about $0.05. Actual cost varies; the shared daily budget still applies.',
    render: (result, context) => {
      const baseline = result.summary.baseline;
      const hardened = result.summary.hardened;
      const held = baseline.boundaryMoves === 0 && hardened.boundaryMoves === 0;
      const content = el('div', {},
        el('section', { class: 'card' }, el('h2', {}, 'A stronger prompt helps. Server checks enforce the rules.'), el('p', {}, 'The hardened prompt asks the model to resist misleading instructions. That protection is probabilistic: the model can still make mistakes. The harness uses deterministic checks in code to control permissions, records, and actions, even when the model is misled.'), el('p', { class: 'small muted' }, '“Leaked” describes the prompt-layer judge. “Harness stepped in” counts turns where server checks rejected a tool request or withheld an answer. “Boundary moves” counts role changes, protected data in an answer (patient names and claim IDs the user may not see, taken from the database), and any change to someone else’s records when the lab confirms the proposed action inside a transaction that is rolled back.')),
        el('div', { class: 'stat-grid three' }, stat('Baseline prompt leaks', `${baseline.promptLeaks}/${result.attacks}`, `Harness stepped in: ${baseline.interventions ?? 0}`), stat('Hardened prompt leaks', `${hardened.promptLeaks}/${result.attacks}`, `Harness stepped in: ${hardened.interventions ?? 0}`), stat(`Boundary moves: ${baseline.boundaryMoves + hardened.boundaryMoves}`, held ? '✓ Held' : '⚠ Review needed', `Baseline: ${baseline.boundaryMoves} · Hardened: ${hardened.boundaryMoves}`)));
      if (!held) content.append(el('p', { class: 'notice error', role: 'alert' }, 'This run recorded a boundary move. Review the answers and traces below.'));
      const grid = table(['Attack', 'Category', 'Baseline result', 'Hardened result', 'Boundary'], 'Prompt attacks and server boundary results');
      result.results.forEach((entry, index) => {
        const expanded = el('tr', { id: `attack-detail-${index}`, hidden: true });
        const toggle = button(labelize(entry.attack.replaceAll('-', ' ')), () => {
          expanded.hidden = !expanded.hidden;
          toggle.setAttribute('aria-expanded', String(!expanded.hidden));
        }, 'text-button');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-controls', expanded.id);
        const rowHeld = !entry.baseline.boundaryMoved && !entry.hardened.boundaryMoved;
        grid.body.append(el('tr', {}, cell(toggle), cell({ indirect: 'In a document', 'tool-abuse': 'Tool abuse', 'cross-user': 'Cross-user data' }[entry.category] ?? 'Direct message'), cell(pill(entry.baseline.leaked ? 'denied' : 'approved', entry.baseline.leaked ? 'Leaked' : 'Blocked')), cell(pill(entry.hardened.leaked ? 'denied' : 'approved', entry.hardened.leaked ? 'Leaked' : 'Blocked')), cell(pill(rowHeld ? 'approved' : 'denied', rowHeld ? '✓ Held' : '⚠ Moved'))));
        expanded.append(el('td', { colspan: '5', class: 'expanded-cell' }, el('h3', {}, 'Attack text'), el('p', { class: 'preserve-lines' }, entry.message), el('div', { class: 'two-columns' }, ...['baseline', 'hardened'].map(variant => el('section', {}, el('h3', {}, `${labelize(variant)} answer`), el('p', { class: 'preserve-lines' }, entry[variant].answer), el('p', { class: 'small muted' }, `Boundary: ${entry[variant].boundaryMoved ? 'moved' : 'held'}`), el('p', { class: 'small muted' }, confirmedText(entry[variant])), entry[variant].exposed?.length ? el('p', { class: 'small muted' }, `Protected data in the answer: ${entry[variant].exposed.join(', ')}`) : null, entry[variant].turnId ? button(`View ${variant} trace`, () => context.openTrace(entry[variant].turnId), 'text-button') : null)))));
        grid.body.append(expanded);
      });
      content.append(el('section', { class: 'card' }, result.results.length ? grid.node : empty('This run contains no individual attack results.')),
        el('p', { class: 'small muted' }, `${result.attacks} attacks × 2 prompt versions · ${result.model} · ${timestamp(result.at)}. These results describe this run; they do not prove immunity to every attack.`));
      return content;
    },
  });
}

// Every stored answer with its sources, action and validation result, so a reviewer can check each score.
function evidence(result, criteria) {
  const rows = (result.rows ?? []).filter(r => 'answer' in r);
  if (!rows.length) return el('p', { class: 'small muted' }, 'This stored run predates per-answer evidence. Run the lab again to record each answer.');
  const section = el('section', { class: 'card' }, el('h2', {}, 'Inspect the answers'), el('p', { class: 'small muted' }, 'Each scored attempt, exactly as the harness returned it. Checks are deterministic: they confirm the expected words, sources and action are present; they do not prove every sentence is true.'));
  for (const model of result.models) {
    const mine = rows.filter(r => r.model === model.id);
    const list = el('div', { class: 'evidence-list' });
    for (const r of mine) {
      const verdict = r.infraError ? 'Provider error (not scored)' : r.pass ? 'Passed' : `Failed: ${r.failed.map(f => criteria[f] ?? f).join(', ')}`;
      list.append(el('article', { class: 'evidence-item' },
        el('p', {}, el('strong', {}, `${r.question}`), ' ', pill(r.infraError ? 'pending' : r.pass ? 'approved' : 'denied', verdict), el('span', { class: 'small muted' }, ` · run ${r.rep}`)),
        el('p', { class: 'preserve-lines' }, r.answer || '(no answer)'),
        el('p', { class: 'small muted' }, `Sources: ${r.sources.length ? r.sources.join(', ') : 'none'} · Action: ${r.proposedAction ?? 'none'} · Validation: ${r.validation}`)));
    }
    section.append(el('details', { class: 'evidence-model' }, el('summary', {}, `${model.label} — ${mine.length} answers`), list));
  }
  return section;
}

export function modelLab(root, ctx) {
  lab(root, ctx, {
    title: 'Model Lab', endpoint: 'models',
    description: 'Same questions, same harness, different models.',
    costNote: 'A live run sends the task set to each model and uses the shared daily budget. It may take a few minutes.',
    render: result => {
      const content = el('div', {}, el('section', { class: 'card' }, el('h2', {}, 'Choose on measured quality and cost'), el('p', {}, 'Each answer is checked for a readable response, valid sources, real record identifiers, the expected action, and the required fact. An answer passes only when all checks pass. The target is at least 90%; the cheapest model meeting that bar is the preferred default.')));
      const criteria = { json_valid: 'Readable response', citations_valid: 'Valid sources', no_fabricated_ids: 'Real records', expected_action: 'Expected action', key_fact: 'Required fact' };
      const grid = table(['Model', 'Pass rate', 'Errors', ...Object.values(criteria), 'Avg cost / answer', 'Cost per 1,000', 'Avg latency'], 'Model quality, cost, and latency');
      for (const model of result.models) {
        const chosen = model.id === result.defaultModel;
        const scored = model.total > 0;
        const percent = Math.round(model.passRate * 100);
        const name = el('div', {}, el('strong', {}, model.label));
        if (chosen) name.append(el('p', { class: 'chosen-note' }, !scored ? 'Default fallback: no scored answers' : model.passRate >= 0.9 ? 'Chosen: cheapest model meeting the 90% bar (provider errors count as misses here)' : 'Chosen: best available result; below the 90% bar'));
        const meter = el('div', { class: 'pass-rate' }, el('strong', {}, scored ? `${percent}%` : 'Not scored'), scored ? el('progress', { max: '1', value: String(model.passRate), 'aria-label': `${model.label} pass rate` }) : null, el('span', { class: 'small muted' }, `${model.passed}/${model.total} scored answers`));
        grid.body.append(el('tr', { class: chosen ? 'chosen-row' : '' }, cell(name), cell(meter), cell(String(model.errors ?? 0)), ...Object.keys(criteria).map(key => cell(scored ? `${model.criteria[key]}/${model.total}` : '—')), cell(scored ? cost(model.avgCostUsd) : '—'), cell(scored ? cost(model.costPer1k) : '—'), cell(scored ? `${(model.avgLatencyMs / 1000).toFixed(2)} s` : '—')));
      }
      content.append(el('section', { class: 'card model-table' }, result.models.length ? grid.node : empty('This run contains no model results.')),
        el('p', { class: 'small muted' }, 'Errors mean an answer could not be obtained, for example during a provider outage or when the budget runs out. They are excluded from pass rates, costs, and latency averages. No scored answers means quality and cost are not measured.'),
        el('p', { class: 'small muted' }, `${result.items} questions × ${result.reps} repetitions = ${result.items * result.reps} attempts per model · ${timestamp(result.at)}.`),
        evidence(result, criteria),
        el('p', { class: 'small muted' }, 'Illustrative for this task set — not a general model ranking. Costs and latency are measured for this run.'));
      return content;
    },
  });
}
