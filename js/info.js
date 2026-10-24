// Small "i" buttons that show a plain-language card on hover, focus or tap.
// One floating card is shared by every button; content comes from PHASE_INFO.
import { esc, phaseLabel, phaseKey } from './util.js?v=20261024231912';

const NOTE = 'Participant ranges are typical examples for drug trials, not strict rules. Trials of devices, procedures and behavioral programs can work differently.';

const PHASE_INFO = {
  EARLY_PHASE1: {
    tag: 'First look', title: 'Is it safe to try in people at all?',
    body: 'An exploratory study done before a full Phase 1, usually with a handful of participants, to see how a treatment behaves in the body.',
  },
  PHASE1: {
    tag: 'Safety', title: 'Is it safe?',
    body: 'Researchers study safety, side effects, dosage, and how the body processes a treatment. Participants may be healthy volunteers or people with the condition being studied.',
    people: 'Typical participants: 20–100.', note: true,
  },
  PHASE2: {
    tag: 'Effectiveness', title: 'Does it work?',
    body: 'Researchers test whether the treatment appears effective for a particular condition while continuing to monitor safety.',
    people: 'Typical participants: several dozen to a few hundred.', note: true,
  },
  PHASE3: {
    tag: 'Confirmation', title: 'Does it work on a larger scale?',
    body: 'Researchers test the treatment in larger populations, often comparing it against an existing treatment or a placebo. These trials help establish evidence for regulatory approval.',
    people: 'Typical participants: several hundred to several thousand.', note: true,
  },
  PHASE4: {
    tag: 'Monitoring', title: 'What happens after approval?',
    body: 'Researchers study an already approved treatment, monitoring longer-term safety, effectiveness, and use in broader populations.',
    people: 'Participants: varies widely, sometimes thousands.', note: true,
  },
  'PHASE1+PHASE2': {
    tag: 'Safety + effectiveness', title: 'Is it safe, and does it seem to work?',
    body: 'Combines early safety testing with initial effectiveness testing.',
  },
  'PHASE2+PHASE3': {
    tag: 'Effectiveness + confirmation', title: 'Does it work, and does that hold up at scale?',
    body: 'Combines preliminary effectiveness testing with larger-scale confirmation.',
  },
  NA: {
    tag: 'No phase', title: 'Why is there no phase?',
    body: 'The study does not use the FDA-defined drug-development phases. This is common for behavioral programs, devices, procedures and some other study types.',
  },
  UNSPECIFIED: {
    tag: 'Not recorded', title: 'Why is the phase missing?',
    body: 'The registry entry does not list a phase for this trial.',
  },
};

const ORDER = ['EARLY_PHASE1', 'PHASE1', 'PHASE1+PHASE2', 'PHASE2', 'PHASE2+PHASE3', 'PHASE3', 'PHASE4', 'NA', 'UNSPECIFIED'];

// HTML for the phase label followed by its info button.
export function phaseWithInfo(phases) {
  const key = phaseKey(phases);
  return `<span class="info-wrap">${esc(phaseLabel(phases))} ${infoButton(key, `What ${phaseLabel(phases)} means`)}</span>`;
}

export function infoButton(key, label) {
  return `<button type="button" class="info-btn" data-info="${esc(key)}" aria-label="${esc(label)}" aria-expanded="false">i</button>`;
}

function cardHtml(key) {
  if (key === 'ALL') {
    return `<p class="info-title">Trial phases, in plain words</p>
      <ul class="info-list">${ORDER.map((k) => `<li><strong>${esc(phaseLabel(k === 'UNSPECIFIED' ? [] : k.split('+')))}</strong>: ${esc(PHASE_INFO[k].tag)}</li>`).join('')}</ul>
      <p class="info-note">${esc(NOTE)}</p>`;
  }
  const info = PHASE_INFO[key];
  if (!info) return '';
  return `<p class="info-tag">${esc(info.tag)}</p>
    <p class="info-title">${esc(info.title)}</p>
    <p>${esc(info.body)}</p>
    ${info.people ? `<p class="info-people">${esc(info.people)}</p>` : ''}
    ${info.note ? `<p class="info-note">${esc(NOTE)}</p>` : ''}`;
}

let card = null;
let current = null;
let hideTimer = null;

function ensureCard() {
  if (card) return card;
  card = document.createElement('div');
  card.className = 'info-card';
  card.id = 'info-card';
  card.setAttribute('role', 'tooltip');
  card.hidden = true;
  document.body.appendChild(card);
  card.addEventListener('mouseenter', () => clearTimeout(hideTimer));
  card.addEventListener('mouseleave', () => scheduleHide());
  return card;
}

function position(btn) {
  const r = btn.getBoundingClientRect();
  const c = ensureCard();
  const margin = 8;
  const width = Math.min(320, window.innerWidth - 2 * margin);
  c.style.width = `${width}px`;
  let left = r.left + r.width / 2 - width / 2;
  left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
  c.style.left = `${left}px`;
  const h = c.offsetHeight;
  const below = r.bottom + 8;
  const top = below + h <= window.innerHeight - margin ? below : Math.max(margin, r.top - h - 8);
  c.style.top = `${top}px`;
}

function show(btn) {
  clearTimeout(hideTimer);
  const key = btn.dataset.info;
  const c = ensureCard();
  if (current && current !== btn) current.setAttribute('aria-expanded', 'false');
  current = btn;
  btn.setAttribute('aria-expanded', 'true');
  btn.setAttribute('aria-describedby', 'info-card');
  c.innerHTML = cardHtml(key);
  c.hidden = false;
  position(btn);
}

function hide() {
  if (!card || card.hidden) return;
  card.hidden = true;
  if (current) { current.setAttribute('aria-expanded', 'false'); current.removeAttribute('aria-describedby'); }
  current = null;
}

function scheduleHide() {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(hide, 150);
}

export function initInfo() {
  document.addEventListener('mouseover', (e) => {
    const btn = e.target.closest && e.target.closest('.info-btn');
    if (btn) show(btn);
  });
  document.addEventListener('mouseout', (e) => {
    const btn = e.target.closest && e.target.closest('.info-btn');
    if (btn && btn === current && document.activeElement !== btn) scheduleHide();
  });
  document.addEventListener('focusin', (e) => {
    const btn = e.target.closest && e.target.closest('.info-btn');
    if (btn) show(btn);
  });
  document.addEventListener('focusout', (e) => {
    const btn = e.target.closest && e.target.closest('.info-btn');
    if (btn && btn === current) scheduleHide();
  });
  document.addEventListener('click', (e) => {
    const btn = e.target.closest && e.target.closest('.info-btn');
    if (btn) {
      e.preventDefault();
      if (current === btn && card && !card.hidden) hide(); else show(btn);
      return;
    }
    if (card && !card.hidden && !card.contains(e.target)) hide();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
  window.addEventListener('scroll', () => { if (current && card && !card.hidden) position(current); }, { passive: true });
  window.addEventListener('resize', () => { if (current && card && !card.hidden) position(current); });
  window.addEventListener('hashchange', hide);
}
