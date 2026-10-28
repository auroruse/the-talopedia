// The 1936 pick'em page, in four steps under a sticky band: order the groups, click through the
// bracket, the extras (final score, dark horse, awards), then name and submit. Once picks lock the
// band leads with the leaderboard and the crowd, and the picks steps turn into a marked record.
// Submitting is a pull request carrying one file named for the GitHub account, as in 1935; ?admin
// enters results and writes the state file the leaderboard scores against.
import * as K from './wc1936.js';

const DATA = JSON.parse(document.getElementById('pk-data').textContent);
const T = DATA.teams;
const ADMIN = new URLSearchParams(location.search).has('admin');
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const art = (f) => `${DATA.art}${f}`;
const flagUrl = (t) => art(`flags/${t}.png`);
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const narrow = () => matchMedia('(max-width: 1239px)').matches;

const store = {
  get(k) { try { const v = localStorage.getItem('pk36:' + k); return v == null ? null : JSON.parse(v); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('pk36:' + k, JSON.stringify(v)); } catch { /* private mode: picks just don't persist */ } },
};

// A stored model is trusted only if every group still holds the drawn sides.
function revive(o, results) {
  if (!o || typeof o !== 'object' || !o.groups) return null;
  const m = K.blank(DATA.groups, results);
  for (const g of K.GROUP_KEYS) {
    const a = o.groups[g];
    if (!Array.isArray(a) || a.length !== 4 || [...a].sort().join() !== [...DATA.groups[g]].sort().join()) return null;
    m.groups[g] = a.slice();
    if (results) m.done[g] = !!o.done?.[g];
  }
  m.name = typeof o.name === 'string' ? o.name : '';
  for (const id of K.MATCHES) if (typeof o.ko?.[id] === 'string' && T[o.ko[id]]) m.ko[id] = o.ko[id];
  if (Array.isArray(o.score)) m.score = o.score.map((v) => (Number.isInteger(v) ? v : null)).slice(0, 2);
  for (const k of K.AWARDS) if (typeof o.awards?.[k] === 'string' && T[o.awards[k].split('|')[0]]) m.awards[k] = o.awards[k];
  m.dark = T[o.dark]?.dark ? o.dark : null;
  return K.normalize(m);
}

const LOCKED = !!DATA.state.locked;
let picks = revive(store.get('picks'), false) || K.blank(DATA.groups);
let results = ADMIN ? (revive(store.get('results'), true) || revive(DATA.state.results, true) || K.blank(DATA.groups, true))
                    : (revive(DATA.state.results, true) || K.blank(DATA.groups, true));
let adminLocked = ADMIN ? (store.get('locked') ?? LOCKED) : LOCKED;
let mode = 'picks';            // 'picks' | 'results' (admin only)
let viewing = null;            // someone else's entry, read-only

const model = () => viewing || (mode === 'results' ? results : picks);
const editable = () => !viewing && (mode === 'results' || !LOCKED);
const anyResult = (r) => K.GROUP_KEYS.some((g) => r.done?.[g]) || K.MATCHES.some((id) => r.ko[id]) || K.AWARDS.some((k) => r.awards[k]);
// The results to mark a set of picks against: someone's entry being viewed, or your own once it is
// a whole entry. Never the results themselves.
const marking = () => (mode !== 'results' && (viewing || K.complete(picks)) && anyResult(results) ? results : null);

function save() { if (mode === 'results') store.set('results', results); else store.set('picks', picks); }
function changed() { K.normalize(model()); save(); render(); }

// ── pieces ──────────────────────────────────────────────────────────────────────────────────

// The poster's diamond flag: navy edge, white rim, the flag inside.
const flag = (t, cls = '') => (t
  ? `<span class="pk-dia ${cls}"><img src="${flagUrl(t)}" alt="" decoding="async"></span>`
  : `<span class="pk-dia ${cls} empty"></span>`);
const letter = (g, cls = '') => `<span class="pk-letter ${cls}" aria-hidden="true"><b>${g}</b></span>`;
const MARK_PATH = { right: 'M6.4 11.4l3.1 3.1 6.1-6.6', part: 'M6.5 11h9', wrong: 'M7.6 7.6l6.8 6.8M14.4 7.6l-6.8 6.8' };
const MARK_SAY = { right: 'right', part: 'through, but not in that place', wrong: 'wrong' };
const markIcon = (k) =>
  `<span class="pk-mark ${k}" aria-hidden="true"><svg viewBox="0 0 22 22"><circle cx="11" cy="11" r="10"/><path d="${MARK_PATH[k]}"/></svg></span>`;
const ordinal = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const groupOf = (t) => K.GROUP_KEYS.find((g) => DATA.groups[g].includes(t));

// ── steps ───────────────────────────────────────────────────────────────────────────────────

const PICK_STEPS = ['groups', 'knockouts', 'extras', 'submit'];
const STEP_NAME = { groups: 'Groups', knockouts: 'Knockouts', extras: 'Extras', submit: 'Submit', board: 'Leaderboard', crowd: 'The crowd' };
const ENTRIES = DATA.entries.flatMap((e) => {
  try { return [K.decode(e.code, DATA)]; } catch { console.warn(`pick'em entry ${e.login} no longer decodes`); return []; }
});
const locked = () => (ADMIN ? adminLocked : LOCKED);
function steps() {
  if (locked()) return ['board', 'crowd', 'groups', 'knockouts', 'extras'];
  return [...PICK_STEPS, 'board'];
}
let step = null;

function stepState(s) {
  const m = model(), p = K.progress(m), x = (p.score ? 1 : 0) + (p.dark ? 1 : 0) + p.awards;
  if (s === 'groups') return { sub: viewing || LOCKED ? '8 groups' : store.get('grouped') ? 'Set' : 'Order', ok: !!store.get('grouped') || !editable() };
  if (s === 'knockouts') return { sub: `${p.ko}/${K.MATCHES.length}`, ok: p.ko === K.MATCHES.length };
  if (s === 'extras') return { sub: `${x}/5`, ok: p.score && p.dark && p.awards === 3, part: p.score };
  if (s === 'submit') return { sub: store.get('submitted') ? 'Sent' : K.complete(picks) ? 'Ready' : 'Name', ok: !!store.get('submitted') };
  if (s === 'board') return { sub: plural(ENTRIES.length, 'entry', 'entries'), ok: false };
  return { sub: '', ok: false };
}

function renderSteps() {
  const list = steps();
  $('#pk-stepper').innerHTML = list.map((s, i) => {
    const st = stepState(s), cur = s === step;
    return `<li${!locked() && s === 'board' ? ' class="pk-aside"' : ''}><a href="#${s}" class="pk-stepbtn${cur ? ' cur' : ''}${st.ok ? ' ok' : ''}" ${cur ? 'aria-current="step"' : ''}>
      <span class="pk-stepnum" aria-hidden="true"><b>${st.ok ? '<svg viewBox="0 0 12 12" width="12" height="12"><path d="M2.2 6.4l2.4 2.4 5.2-5.6"/></svg>' : String(i + 1).padStart(2, '0')}</b></span>
      <span class="pk-steptx"><span class="pk-stepname">${STEP_NAME[s]}</span><span class="pk-stepsub">${st.sub}</span></span></a></li>`;
  }).join('');
  // The one button that always knows what to do next.
  const next = $('#pk-next'), m = model();
  next.hidden = !editable() || mode === 'results' || !PICK_STEPS.includes(step);
  const missing = step === 'knockouts' && K.MATCHES.find((id) => !m.ko[id] && K.participants(m, id).every(Boolean));
  const after = list[list.indexOf(step) + 1];
  if (missing) { next.textContent = 'Next pick'; next.dataset.go = 'pick'; }
  else if (step === 'submit' || !after) { next.hidden = true; }
  else { next.textContent = `Next: ${STEP_NAME[after]}`; next.dataset.go = after; }
  const p = K.progress(m);
  $('#pk-ko-n').textContent = `${p.ko}/${K.MATCHES.length}`;
  $('#pk-ex-n').textContent = `${(p.score ? 1 : 0) + (p.dark ? 1 : 0) + p.awards}/5`;
  const done = list.filter((s) => stepState(s).ok).length;
  $('#pk-meter-fill').style.transform = `scaleX(${PICK_STEPS.includes(step) || !locked() ? done / list.length : 1})`;
}

function go(s, { scroll = true } = {}) {
  const list = steps();
  if (!list.includes(s)) s = list[0];
  // Leaving the groups for the first time says they are set: the draw order is a pick too.
  if (step === 'groups' && s !== 'groups' && editable() && mode === 'picks') store.set('grouped', true);
  const changedStep = s !== step;
  step = s;
  for (const sec of $$('[data-step]')) {
    const on = sec.dataset.step === s;
    sec.hidden = !on;
    // The entrance plays once; left on, it would replay on every card a re-render makes.
    if (on && changedStep && !still()) {
      sec.classList.remove('enter'); void sec.offsetWidth; sec.classList.add('enter');
      clearTimeout(sec._enter); sec._enter = setTimeout(() => sec.classList.remove('enter'), 900);
    }
  }
  if (location.hash.slice(1) !== s) history.replaceState(null, '', `#${s}`);
  render();
  if (s === 'submit') queuePreview();
  if (scroll && changedStep) {
    const top = $('#pk-steps').getBoundingClientRect().top + scrollY - 0;
    if (scrollY > top) scrollTo({ top, behavior: still() ? 'auto' : 'smooth' });
  }
}

function bindSteps() {
  $('#pk-stepper').addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    e.preventDefault();
    go(a.getAttribute('href').slice(1));
  });
  $('#pk-next').addEventListener('click', () => {
    const to = $('#pk-next').dataset.go;
    if (to !== 'pick') { go(to); return; }
    const m = model(), id = K.MATCHES.find((x) => !m.ko[x] && K.participants(m, x).every(Boolean));
    if (!id) return;
    setRound(id === 't' ? 'f' : id[0]);
    const el = document.querySelector(`.pk-match[data-id="${id}"]`);
    el?.scrollIntoView({ behavior: still() ? 'auto' : 'smooth', block: 'center' });
    el?.classList.remove('nudge'); void el?.offsetWidth; el?.classList.add('nudge');
    el?.querySelector('button:not([disabled])')?.focus({ preventScroll: true });
  });
  addEventListener('hashchange', () => go(location.hash.slice(1)));
  // The band shrinks once it sticks.
  const io = new IntersectionObserver(([e]) => $('#pk-steps').classList.toggle('stuck', e.intersectionRatio < 1), { threshold: [1], rootMargin: '-1px 0px 0px 0px' });
  io.observe($('#pk-steps'));
}

// ── groups ──────────────────────────────────────────────────────────────────────────────────

let selected = null;           // { g, t }: the row picked up by a tap, waiting for where it goes

function renderGroups() {
  const m = model(), can = editable(), R = marking();
  $('#pk-groups').innerHTML = K.GROUP_KEYS.map((g, gi) => {
    const gm = R && K.groupMarks(m, R, g);
    const holding = selected?.g === g;
    return `
    <section class="pk-group${holding ? ' holding' : ''}" aria-label="Group ${g}" style="--i:${gi}">
      <h3 class="pk-ghead"><span class="pk-gword">Group</span>${letter(g)}</h3>
      <ol class="pk-rows" data-g="${g}">
        ${m.groups[g].map((t, i) => {
          const qual = i < 2 && !(m.done && !m.done[g]), mk = gm?.rows[i];
          const meta = mk ? `Finished ${ordinal(mk.finished)}` : T[t].finish;
          const sel = holding && selected.t === t;
          return `<li class="pk-row${qual ? ' is-q' : ''}${can ? ' can' : ''}${sel ? ' sel' : ''}${mk ? ` r-${mk.mark}` : ''}" data-t="${t}" ${can ? 'tabindex="0"' : ''}
                    aria-label="${esc(T[t].name)}, ${ordinal(i + 1)}${mk ? `, ${MARK_SAY[mk.mark]}, finished ${ordinal(mk.finished)}` : ''}${can ? '. Arrow keys move it; Enter picks it up.' : ''}">
            <span class="pk-pos" aria-hidden="true"><b>${i + 1}</b></span>${flag(t)}
            <span class="pk-team"><span class="pk-name">${esc(T[t].name)}</span><span class="pk-meta" title="${esc(mk ? meta : T[t].route)}">${esc(meta)}</span></span>
            ${can ? '<span class="pk-grip" aria-hidden="true"><svg viewBox="0 0 10 16" width="10" height="16"><circle cx="2" cy="3" r="1.5"/><circle cx="8" cy="3" r="1.5"/><circle cx="2" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="2" cy="13" r="1.5"/><circle cx="8" cy="13" r="1.5"/></svg></span>' : mk ? markIcon(mk.mark) : ''}
          </li>`;
        }).join('')}
      </ol>
      ${gm ? `<p class="pk-gpts"><b>${gm.pts}</b> of ${K.GROUP_MAX} points${gm.perfect ? ' · perfect group' : ''}</p>` : ''}
      ${mode === 'results' && !viewing ? `<label class="pk-done"><input type="checkbox" data-done="${g}" ${m.done[g] ? 'checked' : ''}> Group finished</label>` : ''}
    </section>`;
  }).join('');
}

function moveTeam(g, from, to, focus = true) {
  const a = model().groups[g], [t] = a.splice(from, 1);
  a.splice(to, 0, t);
  changed();
  const li = document.querySelector(`.pk-rows[data-g="${g}"] [data-t="${t}"]`);
  if (focus) li?.focus({ preventScroll: true });
  if (!still()) li?.classList.add('landed');
}

// A row moves three ways: dragged (a mouse at once, a finger by the grip or after a short hold),
// tapped and then tapped into its new place, or with the arrow keys.
let drag = null, pending = null;
function bindGroups() {
  const host = $('#pk-groups');
  const startDrag = (p) => {
    const { li, y0, id } = p;
    const rows = [...li.parentElement.children];
    drag = { li, rows, g: li.parentElement.dataset.g, from: rows.indexOf(li), to: rows.indexOf(li), y0, id,
             pitch: rows[1].getBoundingClientRect().top - rows[0].getBoundingClientRect().top };
    li.classList.add('dragging');
    navigator.vibrate?.(8);
  };
  host.addEventListener('pointerdown', (e) => {
    const li = e.target.closest('.pk-row.can');
    if (!li || e.button !== 0) return;
    const grip = !!e.target.closest('.pk-grip');
    pending = { li, x0: e.clientX, y0: e.clientY, id: e.pointerId, mouse: e.pointerType === 'mouse', timer: 0 };
    try { li.setPointerCapture(e.pointerId); } catch { /* already gone */ }
    if (grip) { e.preventDefault(); startDrag(pending); pending = null; return; }
    if (!pending.mouse) pending.timer = setTimeout(() => { if (pending) { startDrag(pending); pending = null; } }, 260);
  });
  host.addEventListener('pointermove', (e) => {
    if (pending && e.pointerId === pending.id) {
      const d = Math.hypot(e.clientX - pending.x0, e.clientY - pending.y0);
      if (pending.mouse && d > 4) { startDrag(pending); pending = null; }
      else if (!pending.mouse && d > 8) { clearTimeout(pending.timer); pending = null; }   // a scroll
    }
    if (!drag || e.pointerId !== drag.id) return;
    const dy = e.clientY - drag.y0, { from, pitch } = drag;
    const to = Math.max(0, Math.min(3, from + Math.round(dy / pitch)));
    drag.li.style.transform = `translateY(${dy}px)`;
    if (to === drag.to) return;
    drag.to = to;
    drag.rows.forEach((r, i) => {
      if (r === drag.li) return;
      const shift = from < to && i > from && i <= to ? -pitch : from > to && i >= to && i < from ? pitch : 0;
      r.style.transform = shift ? `translateY(${shift}px)` : '';
    });
  });
  const end = (e) => {
    if (pending && e.pointerId === pending.id) {
      clearTimeout(pending.timer);
      const li = pending.li;
      pending = null;
      if (e.type === 'pointerup') tap(li);
      return;
    }
    if (!drag || e.pointerId !== drag.id) return;
    const { g, from, to } = drag;
    drag = null; selected = null;
    if (from !== to) { store.set('grouped', true); moveTeam(g, from, to, false); } else renderGroups();
  };
  host.addEventListener('pointerup', end);
  host.addEventListener('pointercancel', end);
  // While a finger drags, the page must not scroll under it.
  document.addEventListener('touchmove', (e) => { if (drag) e.preventDefault(); }, { passive: false });
  host.addEventListener('contextmenu', (e) => { if (drag || pending) e.preventDefault(); });
  host.addEventListener('keydown', (e) => {
    const li = e.target.closest('.pk-row.can');
    if (!li) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tap(li); return; }
    if (e.key === 'Escape' && selected) { selected = null; renderGroups(); return; }
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const rows = [...li.parentElement.children], from = rows.indexOf(li), to = from + (e.key === 'ArrowUp' ? -1 : 1);
    if (to >= 0 && to < 4) { store.set('grouped', true); moveTeam(li.parentElement.dataset.g, from, to); }
  });
  host.addEventListener('change', (e) => {
    const g = e.target.dataset.done;
    if (!g) return;
    results.done[g] = e.target.checked;
    changed();
  });
  document.addEventListener('pointerdown', (e) => {
    if (selected && !e.target.closest('.pk-group')) { selected = null; renderGroups(); }
  });
}

function tap(li) {
  const g = li.parentElement.dataset.g, t = li.dataset.t;
  if (selected?.g === g && selected.t !== t) {
    const a = model().groups[g];
    const from = a.indexOf(selected.t), to = a.indexOf(t);
    selected = null;
    store.set('grouped', true);
    moveTeam(g, from, to);
    return;
  }
  selected = selected?.t === t ? null : { g, t };
  renderGroups();
  document.querySelector(`.pk-rows[data-g="${g}"] [data-t="${t}"]`)?.focus({ preventScroll: true });
}

// ── bracket ─────────────────────────────────────────────────────────────────────────────────

let round = 'r';               // the round a phone shows
function setRound(r, reveal = false) {
  round = r;
  $('#pk-bracket').dataset.round = r;
  for (const b of $$('[data-round-btn]')) b.setAttribute('aria-selected', String(b.dataset.roundBtn === r));
  const cur = document.querySelector(`[data-round-btn="${r}"]`), seg = $('#pk-rounds');
  if (cur) { seg.style.setProperty('--x', `${cur.offsetLeft}px`); seg.style.setProperty('--w', `${cur.offsetWidth}px`); }
  // A new round starts at its top, just under the band.
  const below = $('#pk-steps').getBoundingClientRect().bottom + 12, top = seg.getBoundingClientRect().top;
  if (reveal && seg.offsetParent && top < below) scrollBy({ top: top - below, behavior: still() ? 'auto' : 'smooth' });
}

function matchHtml(m, id, R) {
  const [a, b] = K.participants(m, id), w = m.ko[id], can = editable() && a && b;
  const st = R && w ? K.koStatus(m, R, id) : null;
  const slot = (t, i) => {
    const seed = id[0] === 'r' ? K.R16[+id[1]][i] : '';
    if (!t) return `<div class="pk-slot tbd"><span class="pk-dia empty"></span><span class="pk-name">${seed ? `${seed[0] === '1' ? 'Winner' : 'Runner-up'} ${seed[1]}` : 'To be decided'}</span></div>`;
    const mine = st && w === t, dark = m.dark === t;
    const state = (w === t ? ' win' : w ? ' lose' : '') + (mine ? ` r-${st}` : '');
    const say = [seed, dark ? 'your dark horse' : '', mine ? MARK_SAY[st] : ''].filter(Boolean).join(', ');
    return `<button type="button" class="pk-slot${state}" data-m="${id}" data-t="${t}" ${can ? '' : 'disabled'} aria-pressed="${w === t}"${say ? ` aria-label="${esc(T[t].name)}, ${say}"` : ''}>
      ${flag(t)}<span class="pk-name">${esc(T[t].name)}</span>${dark ? '<span class="pk-dh" title="Your dark horse">DH</span>' : ''}${mine ? markIcon(st) : ''}
    </button>`;
  };
  const seeds = id[0] === 'r' ? ` data-seeds="${K.R16[+id[1]].join(' v ')}"` : '';
  return `<div class="pk-match${w ? ' set' : ''}" data-id="${id}"${seeds}>${slot(a, 0)}${slot(b, 1)}</div>`;
}

let lastChamp = undefined;
function renderBracket() {
  const m = model(), R = marking(), mt = (id) => matchHtml(m, id, R);
  const champ = K.champion(m), cst = R && champ ? K.koStatus(m, R, 'f') : null;
  const col = (key, label, body, cls) =>
    `<div class="pk-col ${cls}" data-col="${key}"><div class="pk-round"${label ? '' : ' aria-hidden="true"'}>${label}</div><div class="pk-colbody">${body}</div></div>`;
  const pair = (a, b) => `<div class="pk-pair">${mt(a)}${mt(b)}</div>`;
  const single = (id) => `<div class="pk-single">${mt(id)}</div>`;
  const fresh = lastChamp !== undefined && champ && champ !== lastChamp;
  lastChamp = champ;
  $('#pk-bracket').innerHTML = [
    col('rL', 'Round of 16', pair('r0', 'r1') + pair('r2', 'r3'), 'left'),
    col('qL', 'Quarter-finals', pair('q0', 'q1'), 'left'),
    col('sL', 'Semi-finals', single('s0'), 'left'),
    col('c', '', `
      <div class="pk-champ${champ ? ' set' : ''}${fresh && !still() ? ' crowned' : ''}${cst ? ` r-${cst}` : ''}">
        <img class="pk-trophy" src="${art('emblem.png')}" alt="" width="640" height="640">
        ${flag(champ, 'big')}
        <div class="pk-champ-name">${champ ? esc(T[champ].name) : 'Champion'}${cst ? markIcon(cst) : ''}</div>
      </div>
      <div class="pk-final"><div class="pk-round">Final</div>${mt('f')}</div>
      <div class="pk-third"><div class="pk-round">Third place</div>${mt('t')}</div>`, 'pk-center'),
    col('sR', 'Semi-finals', single('s1'), 'right'),
    col('qR', 'Quarter-finals', pair('q2', 'q3'), 'right'),
    col('rR', 'Round of 16', pair('r4', 'r5') + pair('r6', 'r7'), 'right'),
  ].join('');
}

const ROUND_OF = (id) => (id === 't' || id === 'f' ? 'f' : id[0]);
function bindBracket() {
  $('#pk-bracket').addEventListener('click', (e) => {
    const b = e.target.closest('button.pk-slot');
    if (!b || b.disabled || !editable()) return;
    const id = b.dataset.m, m = model();
    m.ko[id] = b.dataset.t;
    changed();
    // On a phone, a finished round hands over to the next one.
    const r = ROUND_OF(id);
    if (narrow() && r !== 'f' && K.MATCHES.filter((x) => ROUND_OF(x) === r).every((x) => m.ko[x])) {
      const next = { r: 'q', q: 's', s: 'f' }[r];
      setTimeout(() => setRound(next, true), still() ? 0 : 220);
    }
  });
  $('#pk-rounds').addEventListener('click', (e) => {
    const b = e.target.closest('[data-round-btn]');
    if (b) setRound(b.dataset.roundBtn, true);
  });
}

// ── extras: final score, dark horse, awards ─────────────────────────────────────────────────

const PLAYER = new Map();     // "Name (Nation)" -> "CODE|Name"
const LABEL = new Map();      // "CODE|Name" -> "Name (Nation)"
function buildLists() {
  const all = [], keepers = [];
  for (const [code, t] of Object.entries(T))
    for (const [n, p] of t.squad) {
      const label = `${n} (${t.name})`, id = `${code}|${n}`;
      PLAYER.set(label, id); LABEL.set(id, label);
      all.push(label); if (p === 'GK') keepers.push(label);
    }
  const opts = (xs) => xs.sort((a, b) => a.localeCompare(b)).map((x) => `<option value="${esc(x)}"></option>`).join('');
  $('#pk-players').innerHTML = opts(all);
  $('#pk-keepers').innerHTML = opts(keepers);
}

function renderScore() {
  const m = model(), champ = K.champion(m), ru = K.runnerUp(m), can = editable();
  const host = $('#pk-score');
  if (!champ || !ru) { host.innerHTML = `<p class="pk-empty">Final TBD</p><button type="button" class="pk-btn" data-goto="knockouts">Pick the final</button>`; return; }
  const [c, r] = m.score;
  const side = (i, t, v) => `
    <div class="pk-sc-side">
      ${flag(t, 'mid')}<span class="pk-sc-name">${esc(T[t].name)}</span>
      <div class="pk-stepper" role="group" aria-label="${esc(T[t].name)} goals">
        <button type="button" class="pk-pm" data-score="${i}" data-d="-1" ${can ? '' : 'disabled'} aria-label="One fewer">−</button>
        <output class="pk-goals${v == null ? ' unset' : ''}">${v ?? '·'}</output>
        <button type="button" class="pk-pm" data-score="${i}" data-d="1" ${can ? '' : 'disabled'} aria-label="One more">+</button>
      </div>
    </div>`;
  host.innerHTML = `<div class="pk-scoreline">${side(0, champ, c)}<span class="pk-dash">–</span>${side(1, ru, r)}</div>
    <p class="pk-note" id="pk-score-note" aria-live="polite"></p>`;
  scoreNote();
}
function scoreNote() {
  const m = model(), [c, r] = m.score, el = $('#pk-score-note'), R = marking();
  if (!el) return;
  if (R && K.scoreOk(R)) {
    const exact = c === R.score[0] && r === R.score[1];
    el.className = `pk-note${exact ? ' good' : ''}`;
    el.textContent = `Finished ${R.score[0]}–${R.score[1]}${exact ? ' · exact' : ''}`;
    return;
  }
  el.className = `pk-note${c != null && r != null && c < r ? ' bad' : ''}`;
  el.textContent = c == null || r == null ? 'After extra time'
    : c < r ? 'Champion can\'t lose' : c === r ? `${T[K.champion(m)].name} on penalties` : 'After extra time';
}

function renderDark() {
  const m = model(), can = editable(), R = marking();
  const pts = R && m.dark ? K.survived(R, m.dark).length * K.DARK : null;
  const live = R && m.dark ? K.alive(R, m.dark) : null;
  $('#pk-dark-state').innerHTML = pts == null ? `<b>+${K.DARK}</b> a round`
    : `<b>${pts}</b> of ${K.DARK_MAX}${live === false ? ' · out' : ''}`;
  $('#pk-dark').innerHTML = K.GROUP_KEYS.map((g) => {
    const opts = DATA.groups[g].filter((t) => T[t].dark);
    return `<li class="pk-dk-row">${letter(g, 'sm')}${opts.map((t) => {
      const on = m.dark === t;
      return `<button type="button" class="pk-dk${on ? ' on' : ''}" data-dark="${t}" aria-pressed="${on}" ${can ? '' : 'disabled'}>
        ${flag(t)}<span class="pk-team"><span class="pk-name">${esc(T[t].name)}</span><span class="pk-meta">${esc(T[t].finish)}</span></span></button>`;
    }).join('')}</li>`;
  }).join('');
}

function renderAwards() {
  const m = model(), can = editable(), R = marking();
  for (const k of K.AWARDS) {
    const input = document.querySelector(`[data-award="${k}"]`), id = m.awards[k];
    if (document.activeElement !== input) input.value = id ? LABEL.get(id) || '' : '';
    input.disabled = !can;
    input.classList.remove('bad');
    const won = R?.awards[k], st = won ? (id === won ? 'right' : 'wrong') : null;
    const card = input.closest('.pk-card');
    card.classList.toggle('r-right', st === 'right');
    card.classList.toggle('r-wrong', st === 'wrong');
    const [code] = (id || '').split('|');
    document.querySelector(`[data-award-pick="${k}"]`).innerHTML =
      (id && T[code] ? `${flag(code, 'sm')}<span>${esc(T[code].name)}</span>` : '') + (st ? markIcon(st) : '')
      + (st === 'wrong' ? `<span class="pk-actual">Won by ${esc(LABEL.get(won) || won.split('|')[1])}</span>` : '');
  }
}

function bindExtras() {
  $('#pk-score').addEventListener('click', (e) => {
    const b = e.target.closest('[data-score]');
    if (b && editable()) {
      const m = model(), i = +b.dataset.score, d = +b.dataset.d, v = m.score[i];
      m.score[i] = Math.max(0, Math.min(15, v == null ? (d > 0 ? 1 : 0) : v + d));
      // The other side starts at nil the first time, so one tap gives a whole scoreline.
      if (m.score[1 - i] == null) m.score[1 - i] = 0;
      save(); renderScore(); renderSteps();
      $(`#pk-score [data-score="${i}"][data-d="${d}"]`)?.focus();
    }
  });
  $('#pk-dark').addEventListener('click', (e) => {
    const b = e.target.closest('[data-dark]');
    if (!b || !editable()) return;
    const m = model();
    m.dark = m.dark === b.dataset.dark ? null : b.dataset.dark;
    save(); renderDark(); renderSteps(); renderBracket();
    $(`#pk-dark [data-dark="${b.dataset.dark}"]`)?.focus();
  });
  for (const k of K.AWARDS) {
    const input = document.querySelector(`[data-award="${k}"]`);
    input.addEventListener('change', () => {
      const v = input.value.trim(), id = PLAYER.get(v);
      if (v && !id) { input.classList.add('bad'); return; }
      if (id && k === 'glove' && T[id.split('|')[0]].squad.find(([n]) => n === id.split('|')[1])?.[1] !== 'GK') { input.classList.add('bad'); return; }
      model().awards[k] = id || null;
      save(); renderAwards(); renderSteps();
    });
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-goto]');
    if (b) go(b.dataset.goto);
  });
}

// ── submit: name, checklist, card, pull request ─────────────────────────────────────────────

function renderSubmit() {
  const m = picks, p = K.progress(m), can = !LOCKED && !viewing && mode === 'picks';
  const name = $('#pk-name');
  if (document.activeElement !== name) name.value = m.name;
  name.disabled = !can;
  const row = (ok, label, value, to, optional) => `<li class="pk-chk${ok ? ' ok' : ''}${optional ? ' opt' : ''}">
      <span class="pk-chk-dot" aria-hidden="true">${ok ? '<svg viewBox="0 0 12 12" width="12" height="12"><path d="M2.2 6.4l2.4 2.4 5.2-5.6"/></svg>' : ''}</span>
      <span class="pk-chk-label">${label}</span><span class="pk-chk-val">${value}</span>
      ${!ok && to ? `<button type="button" class="pk-btn small" data-goto="${to}">Go</button>` : ''}</li>`;
  $('#pk-check').innerHTML =
    row(p.ko === K.MATCHES.length, 'Knockouts', `${p.ko}/${K.MATCHES.length}`, 'knockouts')
    + row(p.score, 'Final score', p.score ? `${m.score[0]}–${m.score[1]}` : 'Not set', 'extras')
    + row(p.name, 'Name', p.name ? esc(m.name.trim()) : 'Not set', null)
    + row(p.dark, 'Dark horse', m.dark ? esc(T[m.dark].name) : 'None', 'extras', true)
    + row(p.awards === 3, 'Awards', `${p.awards}/3`, 'extras', true);
  const submit = $('#pk-submit');
  if (submit.getAttribute('aria-busy') !== 'true') {
    submit.disabled = !K.complete(m) || !can;
    submit.textContent = store.get('submitted') ? 'Update submission' : 'Submit picks';
  }
  $('#pk-reset').hidden = !can;
}

const imgCache = new Map();
function loadImg(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}
const toDataUri = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
async function uri(src, max) {
  const key = `${src}@${max}`;
  if (!imgCache.has(key)) imgCache.set(key, (async () => {
    if (!max) return toDataUri(await (await fetch(src)).blob());
    const img = await loadImg(src), c = document.createElement('canvas');
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  })());
  return imgCache.get(key);
}
async function cardSvg() {
  const m = model(), flags = {};
  await Promise.all(Object.keys(T).map(async (t) => { flags[t] = await uri(flagUrl(t), 120); }));
  const font = await uri(art('Grenze.ttf'));
  const fontCss = `@font-face{font-family:Grenze;src:url(${font}) format('truetype');font-weight:100 900;}`;
  return K.buildCard(m, DATA, {
    flags, fontCss, site: DATA.site,
    wordmark: await uri(art('wordmark.png')), emblem: await uri(art('emblem.png'), 440), pattern: await uri(art('pattern.png')),
  });
}

let previewUrl = null, previewTimer = 0;
function queuePreview() {
  if (step !== 'submit') return;
  clearTimeout(previewTimer);
  previewTimer = setTimeout(async () => {
    try {
      const url = URL.createObjectURL(new Blob([await cardSvg()], { type: 'image/svg+xml' }));
      const img = $('#pk-preview');
      img.onload = () => { if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = url; img.parentElement.classList.add('ready'); };
      img.src = url;
    } catch { /* the preview is a nicety; the buttons still work */ }
  }, 160);
}

function fileName(ext) {
  const m = model(), who = (m.name || 'picks').normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'picks';
  return `wc1936-pickem-${mode === 'results' && !viewing ? 'results' : who}.${ext}`;
}
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function busy(btn, on) { btn.disabled = on; btn.setAttribute('aria-busy', String(on)); }
function say(msg) { $('#pk-status').textContent = msg; }
function sayLink(msg, href, label) {
  $('#pk-status').innerHTML = `${esc(msg)} <a href="${esc(href)}" target="_blank" rel="noopener">${esc(label)}</a>`;
}

const GH = 'https://api.github.com';
// The editor's own key, so anyone who has edited the wiki is never asked for a token twice.
const TOKEN_KEY = 'talopedia-gh-token';
const token = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } },
  set: (v) => { try { if (v) localStorage.setItem(TOKEN_KEY, v); else localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ } },
};
async function gh(path, opts = {}) {
  const r = await fetch(GH + path, {
    ...opts,
    headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${token.get()}`, ...(opts.body ? { 'content-type': 'application/json' } : {}) },
  });
  const text = await r.text(), data = text ? JSON.parse(text) : {};
  if (!r.ok) {
    const msg = data.message || r.statusText;
    const why = /Bad credentials/i.test(msg) ? ' The token is wrong or has expired.'
      : /not accessible|Not Found/i.test(msg) ? ' The token is missing the public_repo scope.' : '';
    throw Object.assign(new Error(`${msg}.${why}`), { status: r.status });
  }
  return data;
}
const b64text = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
async function putFile(repo, branch, path, content, message) {
  let sha;
  try { sha = (await gh(`/repos/${repo}/contents/${path}?ref=${branch}`)).sha; } catch { /* a first entry */ }
  await gh(`/repos/${repo}/contents/${path}`, { method: 'PUT', body: JSON.stringify({ message, content, branch, ...(sha && { sha }) }) });
}
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

function openToken() {
  $('#pk-token-panel').hidden = false;
  $('#pk-token').value = token.get();
  $('#pk-token').focus();
}

async function submit() {
  const m = picks, btn = $('#pk-submit');
  if (!K.complete(m) || LOCKED || viewing || mode === 'results') return;
  if (!token.get()) { openToken(); return; }
  busy(btn, true);
  try {
    say('Checking the token…');
    const me = await gh('/user'), base = await gh(`/repos/${DATA.repo}`);
    const canPush = !!base.permissions?.push, main = base.default_branch;
    let work = DATA.repo;
    if (!canPush) {
      say('Forking the Talopedia…');
      await gh(`/repos/${DATA.repo}/forks`, { method: 'POST' });
      work = `${me.login}/${base.name}`;
      for (let i = 0; i < 20; i++) { try { await gh(`/repos/${work}`); break; } catch { await pause(1500); } }
      try { await gh(`/repos/${work}/merge-upstream`, { method: 'POST', body: JSON.stringify({ branch: main }) }); } catch { /* the gate reads only what the branch adds */ }
    }
    say('Submitting…');
    const login = me.login.toLowerCase(), title = `World Cup 1936 pick'em: ${m.name.trim()}`;
    const tip = await gh(`/repos/${work}/git/ref/heads/${main}`), branch = `pickem/wc1936-${login}-${Date.now().toString(36)}`;
    await gh(`/repos/${work}/git/refs`, { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: tip.object.sha }) });
    await putFile(work, branch, `src/content/data/pickem-wc1936/entries/${login}.json`,
      b64text(JSON.stringify({ code: K.encode(m, DATA) }) + '\n'), title);
    const pr = await gh(`/repos/${DATA.repo}/pulls`, { method: 'POST',
      body: JSON.stringify({ title, head: canPush ? branch : `${me.login}:${branch}`, base: main, body: `Sent from the 1936 pick'em by @${me.login}.` }) });
    store.set('submitted', { at: Date.now(), pr: pr.html_url });
    sayLink('Submitted. On the leaderboard within a few minutes.', pr.html_url, 'View the pull request');
  } catch (e) {
    if (e.status === 401) { token.set(''); openToken(); }
    say(e.message);
  } finally {
    busy(btn, false);
    render();
  }
}

// Held for a second to confirm, as the RBRWT editor's Reset: letting go early drains it.
function holdButton(btn, done) {
  let t0 = 0, raf = 0;
  const label = btn.textContent;
  const tick = () => {
    const k = Math.min(1, (performance.now() - t0) / 1000);
    btn.style.setProperty('--hold', k);
    if (k >= 1) { stop(); btn.textContent = 'Cleared'; setTimeout(() => { btn.textContent = label; }, 1400); done(); return; }
    raf = requestAnimationFrame(tick);
  };
  const start = (e) => { if (e.button > 0) return; t0 = performance.now(); btn.classList.add('holding'); raf = requestAnimationFrame(tick); };
  const stop = () => { cancelAnimationFrame(raf); btn.classList.remove('holding'); btn.style.setProperty('--hold', 0); };
  btn.addEventListener('pointerdown', start);
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, stop);
  btn.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); start(e); } });
  btn.addEventListener('keyup', (e) => { if (e.key === 'Enter' || e.key === ' ') stop(); });
}

function bindSubmit() {
  $('#pk-name').addEventListener('input', (e) => {
    picks.name = e.target.value.slice(0, 32);
    save(); renderSubmit(); renderSteps(); queuePreview();
  });
  $('#pk-png').addEventListener('click', async (e) => {
    const b = e.currentTarget; busy(b, true);
    try {
      const url = URL.createObjectURL(new Blob([await cardSvg()], { type: 'image/svg+xml' }));
      const img = await loadImg(url), c = document.createElement('canvas');
      c.width = K.CARD.w; c.height = K.CARD.h;
      c.getContext('2d').drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
      if (!blob) throw new Error('blocked');
      download(blob, fileName('png')); say('Card saved.');
    } catch { say('This browser could not draw the card. Try another browser.'); }
    finally { busy(b, false); }
  });
  $('#pk-submit').addEventListener('click', submit);
  const useToken = () => {
    const v = $('#pk-token').value.trim();
    if (!v) { say('Paste a token first.'); return; }
    token.set(v);
    $('#pk-token-panel').hidden = true;
    submit();
  };
  $('#pk-token-go').addEventListener('click', useToken);
  $('#pk-token').addEventListener('keydown', (e) => { if (e.key === 'Enter') useToken(); });
  $('#pk-token-cancel').addEventListener('click', () => { $('#pk-token-panel').hidden = true; });
  holdButton($('#pk-reset'), () => {
    const name = picks.name; picks = K.blank(DATA.groups); picks.name = name;
    store.set('grouped', false);
    changed(); say('Picks reset.');
  });
  $('#pk-back').addEventListener('click', () => { viewing = null; go(locked() ? 'board' : step); });
}

function view(entry) {
  viewing = entry;
  go('knockouts');
}

// ── leaderboard and crowd ───────────────────────────────────────────────────────────────────

const pct = (x) => (x ? `${Math.round(x * 100)}%` : '–');
let boardRows = [];
function renderBoard() {
  const list = ENTRIES;
  $('#pk-board-n').textContent = String(list.length).padStart(2, '0');
  if (!list.length) { $('#pk-board').innerHTML = '<tr class="pk-none"><td colspan="10">No entries yet</td></tr>'; return; }
  const scored = anyResult(results), dash = '<span class="pk-dim">–</span>';
  const rows = boardRows = scored ? K.standings(list, results)
    : list.map((entry) => ({ entry })).sort((a, b) => a.entry.name.localeCompare(b.entry.name));
  let rank = 0;
  $('#pk-board').innerHTML = rows.map((r, i) => {
    const prev = rows[i - 1];
    if (scored && (!prev || prev.total !== r.total || prev.exact !== r.exact || prev.gap !== r.gap)) rank = i + 1;
    const c = K.champion(r.entry), d = r.entry.dark, pts = (v) => (scored ? v : dash);
    return `<tr style="--i:${Math.min(i, 30)}">
      <td class="num rank${rank === 1 && scored ? ' first' : ''}">${scored ? rank : dash}</td><td class="who">${esc(r.entry.name)}</td>
      <td class="num">${pts(r.groups)}</td><td class="num">${pts(r.ko)}</td><td class="num">${pts(r.dark)}</td><td class="num">${pts(r.awards)}</td><td class="num total">${pts(r.total)}</td>
      <td>${c ? `<span class="pk-inline">${flag(c, 'sm')}${esc(T[c].name)}</span>` : ''}</td>
      <td class="hide-sm">${d ? `<span class="pk-inline">${flag(d, 'sm')}${esc(T[d].name)}</span>` : dash}</td>
      <td class="act"><button type="button" class="pk-btn small" data-view="${i}" aria-label="View ${esc(r.entry.name)}'s picks">View</button></td></tr>`;
  }).join('');
}

function renderCrowd() {
  const list = ENTRIES;
  if (!locked()) return;
  if (!list.length) { $('#pk-crowd').innerHTML = '<tr class="pk-none"><td colspan="9">No entries</td></tr>'; return; }
  $('#pk-crowd-n').textContent = String(list.length).padStart(2, '0');
  const dark = {};
  for (const e of list) if (e.dark) dark[e.dark] = (dark[e.dark] || 0) + 1;
  $('#pk-crowd').innerHTML = K.crowd(list, DATA).map((r) => `<tr>
    <td><span class="pk-inline">${flag(r.team, 'sm')}${esc(T[r.team].name)}</span></td><td class="num">${r.group}</td>
    <td class="num">${pct(r.win)}</td><td class="num">${pct(r.qualify)}</td><td class="num">${pct(r.q)}</td>
    <td class="num">${pct(r.s)}</td><td class="num">${pct(r.f)}</td><td class="num total">${pct(r.champ)}</td>
    <td class="num">${T[r.team].dark ? pct((dark[r.team] || 0) / list.length) : ''}</td></tr>`).join('');
}

function bindTables() {
  $('#pk-board').addEventListener('click', (e) => {
    const b = e.target.closest('[data-view]');
    if (b) view(boardRows[+b.dataset.view].entry);
  });
}

// ── admin ───────────────────────────────────────────────────────────────────────────────────

function renderAdmin() {
  if (!ADMIN) return;
  $('#pk-admin').hidden = false;
  for (const b of $$('[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
  $('#pk-locked').checked = adminLocked;
}

function bindAdmin() {
  if (!ADMIN) return;
  for (const b of $$('[data-mode]'))
    b.addEventListener('click', () => { mode = b.dataset.mode; viewing = null; render(); });
  $('#pk-locked').addEventListener('change', (e) => { adminLocked = e.target.checked; store.set('locked', adminLocked); go(step); });
  $('#pk-state').addEventListener('click', async () => {
    const json = JSON.stringify({ locked: adminLocked, results: anyResult(results) ? results : null }, null, 1) + '\n';
    try { await navigator.clipboard.writeText(json); say('State file copied.'); }
    catch { download(new Blob([json], { type: 'application/json' }), 'pickem-wc1936-state.json'); say('State file saved.'); }
  });
  $('#pk-from-site').addEventListener('click', () => {
    results = revive(DATA.state.results, true) || K.blank(DATA.groups, true);
    adminLocked = LOCKED;
    store.set('results', results); store.set('locked', adminLocked);
    render(); say('Loaded the published state.');
  });
}

// ── render ──────────────────────────────────────────────────────────────────────────────────

function render() {
  const R = marking(), n = R ? K.scoreEntry(model(), R).total : 0, pts = `${n} point${n === 1 ? '' : 's'}`;
  $('#pk-viewing').hidden = !viewing;
  if (viewing) $('#pk-viewing-name').textContent = viewing.name || 'Unnamed';
  $('#pk-viewing-pts').textContent = viewing && R ? ` · ${pts}` : '';
  $('#pk-locked-note').hidden = !LOCKED || !!viewing || mode === 'results' || !PICK_STEPS.includes(step);
  $('#pk-locked-pts').textContent = !viewing && R ? ` Yours: ${pts}.` : '';
  document.body.classList.toggle('pk-readonly', !editable());
  renderSteps();
  renderGroups(); renderBracket(); renderScore(); renderDark(); renderAwards(); renderSubmit();
  renderBoard(); renderCrowd(); renderAdmin();
  setRound(round);
  queuePreview();
}

buildLists();
bindSteps(); bindGroups(); bindBracket(); bindExtras(); bindSubmit(); bindTables(); bindAdmin();
go(location.hash.slice(1) || (locked() ? 'board' : 'groups'), { scroll: false });
const sent = store.get('submitted');
if (sent?.pr) sayLink(`Submitted ${new Date(sent.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}.`, sent.pr, 'View the pull request');
