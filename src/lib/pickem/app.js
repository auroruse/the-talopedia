// The pick'em page: drag the groups, click through the bracket, name the awards and the final
// score, save the card, and submit. A submission is a pull request carrying one file, named for
// the GitHub account that sent it, the same road a wiki edit takes; the gate lands it on its own.
// With ?admin the same page enters results and writes the state file the leaderboard scores against.
import * as K from './core.js';

const DATA = JSON.parse(document.getElementById('pk-data').textContent);
const T = DATA.teams;
const ADMIN = new URLSearchParams(location.search).has('admin');
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const badgeUrl = (t) => `${DATA.badgeBase}${t}.png`;

const store = {
  get(k) { try { const v = localStorage.getItem('pk35:' + k); return v == null ? null : JSON.parse(v); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('pk35:' + k, JSON.stringify(v)); } catch { /* private mode: picks just don't persist */ } },
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
  for (const id of K.MATCHES) if (typeof o.ko?.[id] === 'string') m.ko[id] = o.ko[id];
  if (Array.isArray(o.score)) m.score = o.score.map((v) => (Number.isInteger(v) ? v : null)).slice(0, 2);
  for (const k of K.AWARDS) if (typeof o.awards?.[k] === 'string') m.awards[k] = o.awards[k];
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

function save() {
  if (mode === 'results') store.set('results', results); else store.set('picks', picks);
}
function changed() {
  K.normalize(model());
  save();
  render();
}

// ── pieces ──────────────────────────────────────────────────────────────────────────────────

const flag = (t, cls = '') => `<span class="pk-badge ${cls}"><img src="${badgeUrl(t)}" alt="" loading="lazy"></span>`;
const ordinal = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
function qualLabel(t) {
  const q = T[t].q;
  if (T[t].invited) return { short: 'Invited', long: 'Invited, did not play the qualifiers' };
  if (!q) return { short: 'Hosts', long: 'Host nation, qualified automatically' };
  const conf = q.conf === 'E' ? 'East' : 'West';
  return { short: `${ordinal(q.pos)} ${conf} · ${q.Pts} pts`, long: `${ordinal(q.pos)} in the ${conf}ern qualifiers: ${q.W}W ${q.D}D ${q.L}L, ${q.GF}–${q.GA}` };
}

// ── groups ──────────────────────────────────────────────────────────────────────────────────

function renderGroups() {
  const m = model(), can = editable();
  $('#pk-groups').innerHTML = K.GROUP_KEYS.map((g) => `
    <section class="pk-group" aria-label="Group ${g}">
      <h3 class="pk-tab">Group ${g}</h3>
      <ol class="pk-rows" data-g="${g}">
        ${m.groups[g].map((t, i) => {
          const q = qualLabel(t), qual = i < 2 && !(m.done && !m.done[g]);
          return `<li class="pk-row${qual ? ' is-q' : ''}${can ? ' can' : ''}" data-t="${t}" ${can ? 'tabindex="0"' : ''}
                    aria-label="${esc(T[t].name)}, ${ordinal(i + 1)}${can ? '. Arrow keys move it.' : ''}">
            <span class="pk-pos">${i + 1}</span>${flag(t)}
            <span class="pk-team"><span class="pk-name">${esc(T[t].name)}</span><span class="pk-meta" title="${esc(q.long)}">${q.short}</span></span>
            ${can ? '<span class="pk-grip" aria-hidden="true"><svg viewBox="0 0 10 16" width="10" height="16"><circle cx="2" cy="3" r="1.5"/><circle cx="8" cy="3" r="1.5"/><circle cx="2" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="2" cy="13" r="1.5"/><circle cx="8" cy="13" r="1.5"/></svg></span>' : ''}
          </li>`;
        }).join('')}
      </ol>
      ${mode === 'results' && !viewing ? `<label class="pk-done"><input type="checkbox" data-done="${g}" ${m.done[g] ? 'checked' : ''}> Group finished</label>` : ''}
    </section>`).join('');
}

function moveTeam(g, from, to) {
  const a = model().groups[g], [t] = a.splice(from, 1);
  a.splice(to, 0, t);
  changed();
  document.querySelector(`.pk-rows[data-g="${g}"] [data-t="${t}"]`)?.focus();
}

let drag = null;
function bindGroups() {
  const host = $('#pk-groups');
  host.addEventListener('pointerdown', (e) => {
    const li = e.target.closest('.pk-row.can');
    if (!li || e.button !== 0) return;
    // On a touchscreen only the grip drags, so a thumb elsewhere still scrolls the page.
    if (e.pointerType !== 'mouse' && !e.target.closest('.pk-grip')) return;
    e.preventDefault();
    const rows = [...li.parentElement.children];
    drag = { li, rows, g: li.parentElement.dataset.g, from: rows.indexOf(li), to: rows.indexOf(li), y0: e.clientY, id: e.pointerId,
             pitch: rows[1].getBoundingClientRect().top - rows[0].getBoundingClientRect().top };
    li.setPointerCapture(e.pointerId);
    li.classList.add('dragging');
  });
  host.addEventListener('pointermove', (e) => {
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
    if (!drag || e.pointerId !== drag.id) return;
    const { g, from, to } = drag;
    drag = null;
    if (from !== to) moveTeam(g, from, to); else renderGroups();
  };
  host.addEventListener('pointerup', end);
  host.addEventListener('pointercancel', end);
  host.addEventListener('keydown', (e) => {
    const li = e.target.closest('.pk-row.can');
    if (!li || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const rows = [...li.parentElement.children], from = rows.indexOf(li), to = from + (e.key === 'ArrowUp' ? -1 : 1);
    if (to >= 0 && to < 4) moveTeam(li.parentElement.dataset.g, from, to);
  });
  host.addEventListener('change', (e) => {
    const g = e.target.dataset.done;
    if (!g) return;
    results.done[g] = e.target.checked;
    changed();
  });
}

// ── bracket ─────────────────────────────────────────────────────────────────────────────────

function matchHtml(m, id) {
  const [a, b] = K.participants(m, id), w = m.ko[id], can = editable() && a && b;
  const slot = (t, i) => {
    const seed = id[0] === 'r' ? K.R16[+id[1]][i] : '';
    if (!t) return `<div class="pk-slot tbd"><span class="pk-name">${seed || 'To be decided'}</span></div>`;
    const state = w === t ? ' win' : w ? ' lose' : '';
    return `<button type="button" class="pk-slot${state}" data-m="${id}" data-t="${t}" ${can ? '' : 'disabled'} aria-pressed="${w === t}"${seed ? ` aria-label="${esc(T[t].name)}, ${seed}"` : ''}>
      ${flag(t)}<span class="pk-name">${esc(T[t].name)}</span>
    </button>`;
  };
  // The round of 16 names its slots ("1A v 2B") above the match, so the names inside get the width.
  const seeds = id[0] === 'r' ? ` data-seeds="${K.R16[+id[1]].join(' v ')}"` : '';
  return `<div class="pk-match"${seeds}>${slot(a, 0)}${slot(b, 1)}</div>`;
}

function renderBracket() {
  const m = model(), mt = (id) => matchHtml(m, id);
  const champ = K.champion(m);
  const col = (key, label, body, cls) =>
    `<div class="pk-col ${cls}" data-col="${key}"><div class="pk-round"${label ? '' : ' aria-hidden="true"'}>${label}</div><div class="pk-colbody">${body}</div></div>`;
  const pair = (a, b) => `<div class="pk-pair">${mt(a)}${mt(b)}</div>`;
  const single = (id) => `<div class="pk-single">${mt(id)}</div>`;
  $('#pk-bracket').innerHTML = [
    col('rL', 'Round of 16', pair('r0', 'r1') + pair('r2', 'r3'), 'left'),
    col('qL', 'Quarter-finals', pair('q0', 'q1'), 'left'),
    col('sL', 'Semi-finals', single('s0'), 'left'),
    col('c', '', `
      <div class="pk-champ${champ ? ' set' : ''}">
        <div class="pk-label">Champion</div>
        ${champ ? flag(champ, 'big') : '<span class="pk-badge big empty"></span>'}
        <div class="pk-champ-name">${champ ? esc(T[champ].name) : 'To be decided'}</div>
      </div>
      <div class="pk-final"><div class="pk-round">Final</div>${mt('f')}</div>
      <div class="pk-third"><div class="pk-round">Third place</div>${mt('t')}</div>`, 'pk-center'),
    col('sR', 'Semi-finals', single('s1'), 'right'),
    col('qR', 'Quarter-finals', pair('q2', 'q3'), 'right'),
    col('rR', 'Round of 16', pair('r4', 'r5') + pair('r6', 'r7'), 'right'),
  ].join('');
}

function bindBracket() {
  $('#pk-bracket').addEventListener('click', (e) => {
    const b = e.target.closest('button.pk-slot');
    if (!b || b.disabled || !editable()) return;
    model().ko[b.dataset.m] = b.dataset.t;
    changed();
  });
}

// ── final score and awards ──────────────────────────────────────────────────────────────────

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
  if (!champ || !ru) { host.innerHTML = '<p class="pk-empty">Pick both finalists and a winner first.</p>'; return; }
  const [c, r] = m.score;
  host.innerHTML = `
    <div class="pk-scoreline">
      <span class="pk-sc-team">${flag(champ)}<span>${esc(T[champ].name)}</span></span>
      <input type="number" min="0" max="15" inputmode="numeric" data-score="0" value="${c ?? ''}" aria-label="${esc(T[champ].name)} goals" ${can ? '' : 'disabled'}>
      <span class="pk-dash">–</span>
      <input type="number" min="0" max="15" inputmode="numeric" data-score="1" value="${r ?? ''}" aria-label="${esc(T[ru].name)} goals" ${can ? '' : 'disabled'}>
      <span class="pk-sc-team right"><span>${esc(T[ru].name)}</span>${flag(ru)}</span>
    </div>
    <p class="pk-note" id="pk-score-note" aria-live="polite"></p>`;
  scoreNote();
}
function scoreNote() {
  const m = model(), [c, r] = m.score, el = $('#pk-score-note');
  if (!el) return;
  el.classList.toggle('bad', c != null && r != null && c < r);
  el.textContent = c == null || r == null ? 'Score after extra time, before any penalties.'
    : c < r ? 'Your champion can\'t lose the final.' : c === r ? `${T[K.champion(m)].name} win on penalties.` : '';
}

function renderAwards() {
  const m = model(), can = editable();
  for (const k of K.AWARDS) {
    const input = document.querySelector(`[data-award="${k}"]`), id = m.awards[k];
    if (document.activeElement !== input) input.value = id ? LABEL.get(id) || '' : '';
    input.disabled = !can;
    input.classList.remove('bad');
    const [code] = (id || '').split('|');
    document.querySelector(`[data-award-pick="${k}"]`).innerHTML = id && T[code] ? `${flag(code)}<span>${esc(T[code].name)}</span>` : '';
  }
}

function bindExtras() {
  $('#pk-score').addEventListener('input', (e) => {
    const i = e.target.dataset.score;
    if (i === undefined) return;
    const v = e.target.value === '' ? null : Math.max(0, Math.min(15, Math.trunc(+e.target.value)));
    model().score[+i] = Number.isFinite(v) ? v : null;
    save(); scoreNote(); renderBar();
  });
  for (const k of K.AWARDS) {
    const input = document.querySelector(`[data-award="${k}"]`);
    input.addEventListener('change', () => {
      const v = input.value.trim(), id = PLAYER.get(v);
      if (v && !id) { input.classList.add('bad'); return; }
      if (id && k === 'glove' && T[id.split('|')[0]].squad.find(([n]) => n === id.split('|')[1])?.[1] !== 'GK') { input.classList.add('bad'); return; }
      model().awards[k] = id || null;
      save(); renderAwards(); renderBar();
    });
  }
}

// ── the bar: name, progress, export ─────────────────────────────────────────────────────────

function renderBar() {
  const m = model(), p = K.progress(m), done = K.complete(m);
  const name = $('#pk-name');
  if (document.activeElement !== name) name.value = m.name;
  name.disabled = !editable() || mode === 'results';
  const chip = (ok, label) => `<span class="pk-chip${ok ? ' ok' : ''}">${ok ? '<svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true"><path d="M2.2 6.4l2.4 2.4 5.2-5.6"/></svg>' : ''}${label}</span>`;
  $('#pk-progress').innerHTML = mode === 'results' && !viewing ? '<span class="pk-chip warn">Entering results</span>'
    : chip(p.ko === K.MATCHES.length, `Knockouts ${p.ko}/${K.MATCHES.length}`) + chip(p.score, 'Final score') +
      chip(p.awards === 3, `Awards ${p.awards}/3`) + chip(p.name, 'Name');
  const submit = $('#pk-submit');
  if (submit.getAttribute('aria-busy') !== 'true') {
    submit.disabled = !done || !!viewing || mode === 'results' || LOCKED;
    submit.textContent = store.get('submitted') ? 'Update submission' : 'Submit picks';
  }
  $('#pk-reset').hidden = !editable() || mode === 'results';
}

const badgeCache = new Map();
function loadImg(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}
// Each badge as a small square PNG data URI, fitted whole, so the card carries its own images.
async function badgeURIs() {
  const out = {};
  await Promise.all(Object.keys(T).map(async (t) => {
    if (!badgeCache.has(t)) {
      const img = await loadImg(badgeUrl(t)), c = document.createElement('canvas'), S = 160;
      c.width = c.height = S;
      const s = Math.min(S / img.naturalWidth, S / img.naturalHeight), w = img.naturalWidth * s, h = img.naturalHeight * s;
      c.getContext('2d').drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
      badgeCache.set(t, c.toDataURL('image/png'));
    }
    out[t] = badgeCache.get(t);
  }));
  return out;
}

function fileName(ext) {
  const m = model(), who = (m.name || 'picks').normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'picks';
  return `wc1935-pickem-${mode === 'results' && !viewing ? 'results' : who}.${ext}`;
}
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const FONT_API = 'https://fonts.googleapis.com/css2?family=Anton&family=Roboto+Slab:wght@700&family=Source+Serif+4:wght@400;700&display=block&text=';
const fontCache = new Map();
const toDataUri = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
// The card's own glyphs only, so the fonts cost a few kilobytes. If Google cannot be reached the
// card still exports, in whatever fallback fonts the reader has.
async function fontCss(svg) {
  const chars = [...new Set(svg.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s/g, ''))].sort().join('') + ' ';
  if (fontCache.has(chars)) return fontCache.get(chars);
  try {
    let css = await (await fetch(FONT_API + encodeURIComponent(chars))).text();
    const urls = [...new Set(css.match(/https:\/\/fonts\.gstatic\.com[^)'"]+/g) || [])];
    for (const u of urls) css = css.split(u).join(await toDataUri(await (await fetch(u)).blob()));
    fontCache.set(chars, css);
    return css;
  } catch { return ''; }
}
let bannerUri = null;
async function cardSvg() {
  const m = model();
  if (!bannerUri) bannerUri = await toDataUri(await (await fetch(DATA.banner)).blob());
  const opts = { badges: await badgeURIs(), banner: bannerUri };
  return K.buildCard(m, DATA, { ...opts, fontCss: await fontCss(K.buildCard(m, DATA, opts)) });
}
function busy(btn, on) { btn.disabled = on; btn.setAttribute('aria-busy', String(on)); }
function say(msg) { $('#pk-status').textContent = msg; }
function sayLink(msg, href, label) {
  $('#pk-status').innerHTML = `${esc(msg)} <a href="${esc(href)}" target="_blank" rel="noopener">${esc(label)}</a>`;
}

// ── submitting: a pull request, the way the wiki editor sends a page ────────────────────────

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
  let sha;   // replacing an entry needs the blob it replaces
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
      // A fork left behind still works: the gate reads only what this branch adds.
      try { await gh(`/repos/${work}/merge-upstream`, { method: 'POST', body: JSON.stringify({ branch: main }) }); } catch { /* see above */ }
    }
    say('Submitting…');
    const login = me.login.toLowerCase(), title = `World Cup pick'em: ${m.name.trim()}`;
    const tip = await gh(`/repos/${work}/git/ref/heads/${main}`), branch = `pickem/${login}-${Date.now().toString(36)}`;
    await gh(`/repos/${work}/git/refs`, { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: tip.object.sha }) });
    await putFile(work, branch, `src/content/data/pickem-wc1935/entries/${login}.json`,
      b64text(JSON.stringify({ code: K.encode(m, DATA) }) + '\n'), title);
    const pr = await gh(`/repos/${DATA.repo}/pulls`, { method: 'POST',
      body: JSON.stringify({ title, head: canPush ? branch : `${me.login}:${branch}`, base: main, body: `Sent from the pick'em by @${me.login}.` }) });
    store.set('submitted', { at: Date.now(), pr: pr.html_url });
    sayLink('Submitted. It joins the leaderboard once it lands, usually within a few minutes.', pr.html_url, 'View the pull request');
  } catch (e) {
    if (e.status === 401) { token.set(''); openToken(); }
    say(e.message);
  } finally {
    busy(btn, false);
    renderBar();
  }
}

function bindBar() {
  $('#pk-name').addEventListener('input', (e) => {
    picks.name = e.target.value.slice(0, 32);
    save(); renderBar();
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
      download(blob, fileName('png')); say('PNG saved.');
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
  $('#pk-reset').addEventListener('click', (e) => {
    const b = e.currentTarget;
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Reset all picks?'; setTimeout(() => { b.dataset.armed = ''; b.textContent = 'Reset'; }, 3000); return; }
    b.dataset.armed = ''; b.textContent = 'Reset';
    const name = picks.name; picks = K.blank(DATA.groups); picks.name = name;
    changed(); say('Picks reset.');
  });
  $('#pk-back').addEventListener('click', () => { viewing = null; render(); });
}

function view(entry) {
  viewing = entry;
  render();
  $('#pk-top').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

// ── leaderboard and crowd ───────────────────────────────────────────────────────────────────

// Every entry on the site, decoded once. One that no longer decodes (the draw changed under it)
// is left off rather than shown wrong.
const ENTRIES = DATA.entries.flatMap((e) => {
  try { return [K.decode(e.code, DATA)]; } catch { console.warn(`pick'em entry ${e.login} no longer decodes`); return []; }
});
const anyResult = (r) => K.GROUP_KEYS.some((g) => r.done?.[g]) || K.MATCHES.some((id) => r.ko[id]) || K.AWARDS.some((k) => r.awards[k]);
const pct = (x) => (x ? `${Math.round(x * 100)}%` : '–');

let boardRows = [];
function renderBoard() {
  const list = ENTRIES, sec = $('#pk-board-sec');
  sec.hidden = !list.length;
  if (sec.hidden) return;
  const scored = anyResult(results), dash = '<span class="pk-dim">–</span>';
  const rows = boardRows = scored ? K.standings(list, results)
    : list.map((entry) => ({ entry })).sort((a, b) => a.entry.name.localeCompare(b.entry.name));
  let rank = 0;
  $('#pk-board').innerHTML = rows.map((r, i) => {
    const prev = rows[i - 1];
    if (scored && (!prev || prev.total !== r.total || prev.exact !== r.exact || prev.gap !== r.gap)) rank = i + 1;
    const c = K.champion(r.entry), pts = (v) => (scored ? v : dash);
    return `<tr>
      <td class="num">${scored ? rank : dash}</td><td>${esc(r.entry.name)}</td>
      <td class="num">${pts(r.groups)}</td><td class="num">${pts(r.ko)}</td><td class="num">${pts(r.awards)}</td><td class="num total">${pts(r.total)}</td>
      <td>${c ? `<span class="pk-inline">${flag(c)}${esc(T[c].name)}</span>` : ''}</td>
      <td class="act"><button type="button" class="pk-btn small" data-view="${i}" aria-label="View ${esc(r.entry.name)}'s picks">View</button></td></tr>`;
  }).join('');
  $('#pk-board-n').textContent = `${list.length} ${list.length === 1 ? 'entry' : 'entries'}`;
}

function renderCrowd() {
  const list = ENTRIES, sec = $('#pk-crowd-sec');
  sec.hidden = !(ADMIN ? adminLocked : LOCKED) || !list.length;
  if (sec.hidden) return;
  $('#pk-crowd-n').textContent = `${list.length} ${list.length === 1 ? 'entry' : 'entries'}`;
  $('#pk-crowd').innerHTML = K.crowd(list, DATA).map((r) => `<tr>
    <td><span class="pk-inline">${flag(r.team)}${esc(T[r.team].name)}</span></td><td class="num">${r.group}</td>
    <td class="num">${pct(r.win)}</td><td class="num">${pct(r.qualify)}</td><td class="num">${pct(r.q)}</td>
    <td class="num">${pct(r.s)}</td><td class="num">${pct(r.f)}</td><td class="num total">${pct(r.champ)}</td></tr>`).join('');
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
  for (const b of document.querySelectorAll('[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
  $('#pk-locked').checked = adminLocked;
}

function bindAdmin() {
  if (!ADMIN) return;
  for (const b of document.querySelectorAll('[data-mode]'))
    b.addEventListener('click', () => { mode = b.dataset.mode; viewing = null; render(); });
  $('#pk-locked').addEventListener('change', (e) => { adminLocked = e.target.checked; store.set('locked', adminLocked); render(); });
  $('#pk-state').addEventListener('click', async () => {
    const json = JSON.stringify({ locked: adminLocked, results: anyResult(results) ? results : null }, null, 1) + '\n';
    try { await navigator.clipboard.writeText(json); say('State file copied.'); }
    catch { download(new Blob([json], { type: 'application/json' }), 'pickem-wc1935-state.json'); say('State file saved.'); }
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
  $('#pk-viewing').hidden = !viewing;
  if (viewing) $('#pk-viewing-name').textContent = viewing.name || 'Unnamed';
  $('#pk-locked-note').hidden = !LOCKED || !!viewing || mode === 'results';
  document.body.classList.toggle('pk-readonly', !editable());
  renderGroups(); renderBracket(); renderScore(); renderAwards(); renderBar();
  renderBoard(); renderCrowd(); renderAdmin();
}

buildLists();
bindGroups(); bindBracket(); bindExtras(); bindBar(); bindTables(); bindAdmin();
render();
const sent = store.get('submitted');
if (sent?.pr) sayLink(`Submitted ${new Date(sent.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}.`, sent.pr, 'View the pull request');
