// The 1936 World Cup pick'em, minus the page. The bracket, group scoring and knockout scoring are
// 1935's, from core.js, unchanged; this adds the dark horse, the 1936 entry codes and the export
// card in the Cortesia draw poster's look. Nothing here touches the DOM, so
// scripts/pickem-check-wc1936.mjs runs it under node.
import * as K from './core.js';

export {
  GROUP_KEYS, R16, MATCHES, FEED, AWARDS, AWARD_NAME, POINTS, GROUP_MAX,
  seed, participants, loser, normalize, champion, runnerUp, scoreOk, groupMarks, koStatus, crowd,
} from './core.js';
const { GROUP_KEYS, MATCHES, AWARDS, AWARD_NAME, participants, champion, runnerUp, scoreOk } = K;

// The dark horse: one side from the two each group's draw rates lowest, worth this much for every
// round it survives. Out of the group is one round; each knockout tie won is another.
export const DARK = 3;
export const DARK_ROUNDS = ['g', 'r', 'q', 's', 'f'];
export const DARK_MAX = DARK * DARK_ROUNDS.length;

export function blank(draw, results = false) {
  return { ...K.blank(draw, results), dark: null };
}

export function progress(m) {
  return { ...K.progress(m), dark: !!m.dark };
}

// An entry needs every knockout pick, the tiebreaker and a name. The dark horse and the awards are
// optional, as the awards were in 1935.
export const complete = (m) => K.complete(m);

const groupOf = (r, t) => GROUP_KEYS.find((g) => r.groups[g].includes(t));

/** The rounds a side has survived so far: out of its group, then each knockout tie it won. */
export function survived(r, t) {
  if (!t) return [];
  const out = [], g = groupOf(r, t);
  if (g && r.done?.[g] && r.groups[g].slice(0, 2).includes(t)) out.push('g');
  for (const round of ['r', 'q', 's', 'f'])
    if (MATCHES.some((id) => id[0] === round && r.ko[id] === t)) out.push(round);
  return out;
}

/** Whether a side is still in it: false once it has gone out of its group or lost a tie. */
export function alive(r, t) {
  const g = groupOf(r, t);
  if (g && r.done?.[g] && !r.groups[g].slice(0, 2).includes(t)) return false;
  return !MATCHES.some((id) => id !== 't' && K.loser(r, id) === t);
}

export function scoreEntry(p, r) {
  const out = K.scoreEntry(p, r);
  out.dark = survived(r, p.dark).length * DARK;
  out.total += out.dark;
  return out;
}

export function standings(entries, results) {
  return entries
    .map((e) => ({ entry: e, ...scoreEntry(e, results) }))
    .sort((a, b) => b.total - a.total || b.exact - a.exact || a.gap - b.gap
      || a.entry.name.localeCompare(b.entry.name));
}

// ── entry codes ─────────────────────────────────────────────────────────────────────────────
// 1935's layout with the dark horse after the awards: one six-bit place in the draw order.

const PREFIX = 'WC36-', VERSION = 1, NO_TEAM = 63;

export function encode(m, data) {
  const order = K.teamOrder(data), w = new K.BitWriter();
  for (const g of GROUP_KEYS) w.put(K.permRank(m.groups[g], data.groups[g]), 5);
  for (const id of MATCHES) w.put(m.ko[id] === participants(m, id)[1] ? 1 : 0, 1);
  w.put(m.score[0], 4); w.put(m.score[1], 4);
  for (const k of AWARDS) {
    const [code, name] = (m.awards[k] || '').split('|');
    const i = order.indexOf(code);
    w.put(i < 0 ? NO_TEAM : i, 6); w.put(i < 0 ? 0 : K.fnv(name) & 0xffff, 16);
  }
  const d = order.indexOf(m.dark);
  w.put(d < 0 ? NO_TEAM : d, 6);
  const name = Array.from(new TextEncoder().encode(m.name.trim()));
  const bytes = [VERSION, ...w.end(), name.length, ...name];
  bytes.push(K.fnv(String.fromCharCode(...bytes)) & 0xff);
  return PREFIX + K.toB64(bytes);
}

export function decode(code, data) {
  const s = String(code).trim().replace(/^WC36-/i, '');
  let bytes;
  try { bytes = K.fromB64(s); } catch { throw new Error('Not an entry code.'); }
  if (bytes.length < 4) throw new Error('Not an entry code.');
  const sum = bytes.pop();
  if ((K.fnv(String.fromCharCode(...bytes)) & 0xff) !== sum) throw new Error('This code is damaged. Copy it again from the card.');
  if (bytes[0] !== VERSION) throw new Error('This code is from another version of the pick\'em.');
  const order = K.teamOrder(data), r = new K.BitReader(bytes, 1), m = blank(data.groups);
  try {
    for (const g of GROUP_KEYS) {
      const n = r.get(5);
      if (n > 23) throw new Error('bad');
      m.groups[g] = K.permFrom(n, data.groups[g]);
    }
    for (const id of MATCHES) m.ko[id] = participants(m, id)[r.get(1)];
    m.score = [r.get(4), r.get(4)];
    for (const k of AWARDS) {
      const i = r.get(6), h = r.get(16), code2 = order[i], t = code2 && data.teams[code2];
      const hit = t && t.squad.find(([n]) => (K.fnv(n) & 0xffff) === h);
      const was = !hit && t && Object.keys(t.renamed || {}).find((n) => (K.fnv(n) & 0xffff) === h);
      m.awards[k] = hit ? `${code2}|${hit[0]}` : was ? `${code2}|${t.renamed[was]}` : null;
    }
    const d = order[r.get(6)];
    m.dark = d && data.teams[d]?.dark ? d : null;
    const at = r.byte, len = bytes[at];
    m.name = new TextDecoder().decode(new Uint8Array(bytes.slice(at + 1, at + 1 + len)));
  } catch { throw new Error('This code is damaged. Copy it again from the card.'); }
  return m;
}

// ── the export card ─────────────────────────────────────────────────────────────────────────
// One portrait poster in the draw poster's look: the paisley ground, the white group cards with
// their gold heads and diamond letters, the diamond flags, Grenze throughout, and the trophy over
// the champion. The page hands in every image and the font as data URIs, so the file carries its
// own art and looks the same wherever it is opened.

export const CARD = { w: 1600, h: 2350 };
const C = { navy: '#0c2462', gold: '#f2c418', royal: '#1f4fa2', ink: '#161616', white: '#fff', muted: '#8a97b8', line: '#e2e6ef', pale: '#eef1f7' };
const F = "Grenze, 'Iowan Old Style', Georgia, serif";
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function text(x, y, str, { size, fill = C.ink, anchor = 'start', weight = 500, fit, spacing, upper } = {}) {
  let extra = '';
  const s = upper ? String(str).toUpperCase() : String(str);
  // Grenze runs narrow; a name still wider than its box is squeezed rather than run over the edge.
  const est = s.length * size * (upper ? 0.56 : 0.46) + (spacing ? s.length * spacing : 0);
  if (fit && est > fit) extra = ` textLength="${fit}" lengthAdjust="spacingAndGlyphs"`;
  if (spacing) extra += ` letter-spacing="${spacing}"`;
  return `<text x="${x}" y="${y}" font-family="${esc(F)}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${extra}>${esc(s)}</text>`;
}

// Where a baseline goes so caps and lining figures sit centred on `cy`: in Grenze both stand
// 0.61em tall with nothing below the line.
const mid = (cy, size) => cy + size * 0.305;
const DIA = (s, x = 0, y = 0) => `${x + s / 2},${y} ${x + s},${y + s / 2} ${x + s / 2},${y + s} ${x},${y + s / 2}`;
// The page's shapes, all at the diamonds' 45°: a box with chamfered corners (`top` and `bottom`
// choose which), and a plate with pointed ends.
function cham(x, y, w, h, c, fill, { top = true, bottom = true } = {}) {
  const t = top ? c : 0, b = bottom ? c : 0;
  return `<polygon points="${x + t},${y} ${x + w - t},${y} ${x + w},${y + t} ${x + w},${y + h - b} ${x + w - b},${y + h} ${x + b},${y + h} ${x},${y + h - b} ${x},${y + t}" fill="${fill}"/>`;
}
const pointed = (x, y, w, h, fill) => `<polygon points="${x + h / 2},${y} ${x + w - h / 2},${y} ${x + w},${y + h / 2} ${x + w - h / 2},${y + h} ${x + h / 2},${y + h} ${x},${y + h / 2}" fill="${fill}"/>`;

// A flag is the poster's diamond: navy edge, white rim, the flag inside. Embedded once as a symbol.
function flag(x, y, s, t) {
  return t
    ? `<use href="#fl-${t}" xlink:href="#fl-${t}" x="${x}" y="${y}" width="${s}" height="${s}"/>`
    : `<polygon points="${DIA(s, x, y)}" fill="none" stroke="${C.muted}" stroke-width="2" stroke-dasharray="5 5"/>`;
}

// The poster's group letter: a navy diamond, a gold ring, a navy core, the letter in gold.
function letter(cx, cy, s, l) {
  const d = (k) => DIA(s - 2 * k, cx - s / 2 + k, cy - s / 2 + k);
  return `<polygon points="${d(0)}" fill="${C.navy}"/><polygon points="${d(s * 0.05)}" fill="${C.gold}"/><polygon points="${d(s * 0.1)}" fill="${C.navy}"/>`
    + text(cx, mid(cy, s * 0.5), l, { size: s * 0.5, fill: C.gold, anchor: 'middle', weight: 800 });
}

function plate(cx, y, w, label, size = 34) {
  return pointed(cx - w / 2, y, w, size * 1.9, C.gold)
    + text(cx, mid(y + size * 0.95, size), label, { size, fill: C.navy, anchor: 'middle', weight: 800, spacing: size * 0.3, upper: true, fit: w - 40 });
}

export function buildCard(m, data, { flags = {}, fontCss = '', wordmark = null, emblem = null, pattern = null, site = '' } = {}) {
  const T = data.teams, name = (t) => (t ? T[t].name : '');
  const fl = (t) => (t && flags[t] ? t : null);
  const symbols = Object.entries(flags).map(([t, href]) =>
    `<symbol id="fl-${t}" viewBox="0 0 100 100"><polygon points="${DIA(100)}" fill="${C.navy}"/><polygon points="${DIA(94, 3, 3)}" fill="${C.white}"/>`
    + `<clipPath id="fc-${t}"><polygon points="${DIA(90, 5, 5)}"/></clipPath>`
    + `<image href="${esc(href)}" x="5" y="5" width="90" height="90" preserveAspectRatio="xMidYMid slice" clip-path="url(#fc-${t})"/></symbol>`).join('');
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${CARD.w}" height="${CARD.h}" viewBox="0 0 ${CARD.w} ${CARD.h}">`);
  out.push(`<defs><style><![CDATA[${fontCss}text{font-variant-numeric:lining-nums;font-feature-settings:'lnum' 1}]]></style>`
    + (pattern ? `<pattern id="ground" width="420" height="420" patternUnits="userSpaceOnUse"><image href="${esc(pattern)}" width="420" height="420"/></pattern>` : '')
    + `<linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.navy}" stop-opacity="0.1"/><stop offset="0.5" stop-color="${C.navy}" stop-opacity="0.45"/><stop offset="1" stop-color="${C.navy}" stop-opacity="0.85"/></linearGradient>${symbols}</defs>`);
  out.push(`<rect width="${CARD.w}" height="${CARD.h}" fill="${C.navy}"/>`);
  if (pattern) out.push(`<rect width="${CARD.w}" height="${CARD.h}" fill="url(#ground)"/>`);
  out.push(`<rect width="${CARD.w}" height="${CARD.h}" fill="url(#shade)"/>`);

  // Head: the poster's wordmark, then the entrant on a gold plate.
  if (wordmark) out.push(`<image href="${esc(wordmark)}" x="170" y="44" width="1260" height="270" preserveAspectRatio="xMidYMid meet"/>`);
  else out.push(text(800, 230, 'Cortesia 1936', { size: 170, fill: C.white, anchor: 'middle', weight: 900 }));
  const who = m.name.trim() ? `Pick'em · ${m.name.trim()}` : "Pick'em";
  out.push(plate(800, 336, 820, who, 34));

  // Groups: four across, two down, the poster's cards.
  GROUP_KEYS.forEach((g, gi) => {
    const x = 60 + (gi % 4) * 380, y = 450 + Math.floor(gi / 4) * 404, w = 340, h = 372;
    out.push(cham(x, y, w, h, 16, C.white));
    out.push(cham(x, y, w, 64, 16, C.gold, { bottom: false }));
    out.push(text(x + 26, mid(y + 32, 26), 'Group', { size: 26, fill: C.navy, weight: 800, spacing: 8.8, upper: true }));
    out.push(letter(x + w - 58, y + 64, 84, g));
    m.groups[g].forEach((t, i) => {
      const ry = y + 104 + i * 66, q = i < 2 && !(m.done && !m.done[g]);
      if (i === 2) out.push(`<line x1="${x + 20}" y1="${ry - 7}" x2="${x + w - 20}" y2="${ry - 7}" stroke="${C.line}" stroke-width="2" stroke-dasharray="6 6"/>`);
      out.push(`<polygon points="${DIA(26, x + 18, ry + 14)}" fill="${q ? C.gold : C.pale}"/>`);
      out.push(text(x + 31, mid(ry + 27, 17), String(i + 1), { size: 17, fill: C.navy, anchor: 'middle', weight: 800 }));
      out.push(flag(x + 56, ry + 2, 52, fl(t)));
      out.push(text(x + 120, ry + 30, name(t), { size: 30, weight: 500, fit: w - 120 - 16 }));
      out.push(text(x + 120, ry + 50, T[t].finish, { size: 14, fill: C.royal, weight: 600, spacing: 1.4, upper: true, fit: w - 120 - 16 }));
    });
  });

  // Knockouts
  out.push(plate(800, 1276, 480, 'Knockouts', 30));
  const top = 1420, H = 700, bh = 84;
  const cols = {
    rL: { x: 40, w: 206 }, qL: { x: 268, w: 194 }, sL: { x: 484, w: 186 },
    c: { x: 692, w: 216 },
    sR: { x: 930, w: 186 }, qR: { x: 1138, w: 194 }, rR: { x: 1354, w: 206 },
  };
  for (const [k, lbl] of [['rL', 'Round of 16'], ['qL', 'Quarter-finals'], ['sL', 'Semi-finals'], ['sR', 'Semi-finals'], ['qR', 'Quarter-finals'], ['rR', 'Round of 16']])
    out.push(text(cols[k].x + cols[k].w / 2, top - 22, lbl, { size: 17, fill: C.gold, anchor: 'middle', weight: 700, spacing: 2, upper: true }));

  const at = {};
  for (let i = 0; i < 4; i++) { at[`r${i}`] = ['rL', top + (i + 0.5) * H / 4]; at[`r${i + 4}`] = ['rR', top + (i + 0.5) * H / 4]; }
  for (let i = 0; i < 2; i++) { at[`q${i}`] = ['qL', top + (i + 0.5) * H / 2]; at[`q${i + 2}`] = ['qR', top + (i + 0.5) * H / 2]; }
  at.s0 = ['sL', top + H / 2]; at.s1 = ['sR', top + H / 2]; at.f = ['c', top + H / 2 + 40]; at.t = ['c', top + H / 2 + 250];

  const link = (from, to) => {
    const [ca, ya] = at[from], [cb, yb] = at[to], A = cols[ca], B = cols[cb];
    const rightward = A.x < B.x, x1 = rightward ? A.x + A.w : A.x, x2 = rightward ? B.x : B.x + B.w, mx = (x1 + x2) / 2;
    return `<path d="M${x1} ${ya} H${mx} V${yb} H${x2}" fill="none" stroke="${C.gold}" stroke-opacity="0.7" stroke-width="3"/>`;
  };
  for (const [to, from] of Object.entries(K.FEED)) for (const f of from) out.push(link(f, to));

  const box = (id) => {
    const [ck, cy] = at[id], { x, w } = cols[ck], y = cy - bh / 2;
    const [a, b] = participants(m, id), win = m.ko[id];
    const parts = [cham(x, y, w, bh, 10, C.white),
      `<line x1="${x + 8}" y1="${cy}" x2="${x + w - 8}" y2="${cy}" stroke="${C.line}" stroke-width="1.5"/>`];
    [a, b].forEach((t, i) => {
      const ly = y + i * (bh / 2), won = t && win === t, lost = t && win && win !== t;
      if (won) parts.push(`<rect x="${x}" y="${ly + 6}" width="5" height="${bh / 2 - 12}" fill="${C.gold}"/>`);
      if (!t) { parts.push(text(x + 16, ly + 28, id[0] === 'r' ? K.R16[+id[1]][i] : '·', { size: 18, fill: C.muted })); return; }
      parts.push(flag(x + 10, ly + 6, 30, fl(t)));
      const scoreW = id === 'f' && scoreOk(m) && champion(m) ? 26 : 0;
      parts.push(text(x + 48, ly + 28, name(t), { size: 21, weight: won ? 700 : 500, fill: lost ? C.muted : C.ink, fit: w - 48 - 10 - scoreW }));
      if (scoreW) {
        const g = t === champion(m) ? m.score[0] : m.score[1];
        parts.push(text(x + w - 12, ly + 29, String(g), { size: 22, weight: 800, fill: C.navy, anchor: 'end' }));
      }
    });
    return parts.join('');
  };
  for (const id of MATCHES) out.push(box(id));

  // The centre: the trophy, the champion under it, the final and the third-place match.
  const champ = champion(m), cx = 800;
  if (emblem) out.push(`<image href="${esc(emblem)}" x="${cx - 110}" y="${top - 60}" width="220" height="220" preserveAspectRatio="xMidYMid meet"/>`);
  out.push(flag(cx - 34, top + 158, 68, fl(champ)));
  out.push(text(cx, top + 270, champ ? name(champ) : 'Champion', { size: 44, fill: champ ? C.white : C.muted, anchor: 'middle', weight: 800, fit: 300 }));
  out.push(text(cx, at.f[1] - bh / 2 - 12, 'Final', { size: 18, fill: C.gold, anchor: 'middle', weight: 700, spacing: 2, upper: true }));
  if (scoreOk(m) && m.score[0] === m.score[1]) out.push(text(cx, at.f[1] + bh / 2 + 24, 'won on penalties', { size: 17, fill: C.muted, anchor: 'middle' }));
  out.push(text(cx, at.t[1] - bh / 2 - 12, 'Third place', { size: 18, fill: C.gold, anchor: 'middle', weight: 700, spacing: 2, upper: true }));

  // The dark horse, the awards and the tiebreaker: every card the same three rows, each centred
  // on the card's middle, so nothing depends on guessing how wide a name renders.
  const cards = [{ title: 'Dark horse', dark: true }, ...AWARDS.map((k) => ({ title: AWARD_NAME[k], pick: m.awards[k] })), { title: 'Final score', score: true }];
  cards.forEach((c, i) => {
    const x = 60 + i * 300, y = 2108, w = 280, h = 186, cx = x + w / 2;
    out.push(cham(x, y, w, h, 14, C.white));
    out.push(cham(x, y, w, 46, 14, C.gold, { bottom: false }));
    out.push(text(cx, mid(y + 23, 18), c.title, { size: 18, fill: C.navy, anchor: 'middle', weight: 800, spacing: 3, upper: true, fit: w - 30 }));
    const rows = (flags, main, sub) => {
      if (flags.length === 1) out.push(flag(cx - 23, y + 60, 46, fl(flags[0])));
      else flags.forEach((t, k) => out.push(flag(cx - 52 + k * 58, y + 60, 46, fl(t))));
      out.push(text(cx, y + 142, main, { size: 28, weight: 700, anchor: 'middle', fit: w - 30 }));
      if (sub) out.push(text(cx, y + 166, sub, { size: 13, fill: C.royal, weight: 600, spacing: 1.3, upper: true, anchor: 'middle', fit: w - 30 }));
    };
    if (c.dark) { if (m.dark) rows([m.dark], name(m.dark), T[m.dark].finish); else rows([null], '·'); return; }
    if (c.score) {
      const ru = runnerUp(m);
      if (champ && ru && scoreOk(m)) rows([champ, ru], `${m.score[0]} – ${m.score[1]}`, m.score[0] === m.score[1] ? `${name(champ)} on penalties` : `${name(champ)} v ${name(ru)}`);
      else rows([null, null], '·');
      return;
    }
    const [tc, pn] = (c.pick || '').split('|');
    if (pn) rows([tc], pn, name(tc)); else rows([null], '·');
  });

  if (site) out.push(text(800, CARD.h - 18, site, { size: 16, fill: C.muted, anchor: 'middle', weight: 500, spacing: 1 }));
  out.push('</svg>');
  return out.join('\n');
}
