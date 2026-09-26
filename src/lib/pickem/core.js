// The 1935 World Cup pick'em, minus the page: the bracket, the scoring, the entry codes and the
// export card. Nothing here touches the DOM, so scripts/pickem-check.mjs runs it under node.
//
// A set of picks and a set of results are the same shape. Results carry `done`, one flag a group,
// because a group's order only counts once its last match is played.

export const GROUP_KEYS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

// Fixed World Cup slots, no draw. Winners meet runners-up, and a group's two qualifiers land in
// opposite halves, so they can only meet again in the final.
export const R16 = [
  ['1A', '2B'], ['1C', '2D'], ['1E', '2F'], ['1G', '2H'],
  ['1B', '2A'], ['1D', '2C'], ['1F', '2E'], ['1H', '2G'],
];
export const MATCHES = ['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'q0', 'q1', 'q2', 'q3', 's0', 's1', 'f', 't'];
const FEED = { q0: ['r0', 'r1'], q1: ['r2', 'r3'], q2: ['r4', 'r5'], q3: ['r6', 'r7'], s0: ['q0', 'q1'], s1: ['q2', 'q3'], f: ['s0', 's1'] };

export const AWARDS = ['boot', 'ball', 'glove'];
export const AWARD_NAME = { boot: 'Golden Boot', ball: 'Golden Ball', glove: 'Golden Glove' };
// Knockout points are per correct winner in each round, whoever that winner beat.
export const POINTS = { qualify: 1, exact: 1, perfect: 2, r: 2, q: 4, s: 8, f: 16, t: 4, award: 5 };

export function blank(draw, results = false) {
  const m = {
    name: '',
    groups: Object.fromEntries(GROUP_KEYS.map((g) => [g, draw[g].slice()])),
    ko: {},
    score: [null, null],          // [champion's goals, runner-up's goals], before any shootout
    awards: { boot: null, ball: null, glove: null },   // "CODE|Full Name"
  };
  if (results) m.done = Object.fromEntries(GROUP_KEYS.map((g) => [g, false]));
  return m;
}

// "1A" -> the side the model has winning Group A. A results model has nobody there until the
// group is finished.
export function seed(m, s) {
  const g = s[1];
  if (m.done && !m.done[g]) return null;
  return m.groups[g][+s[0] - 1];
}

export function participants(m, id) {
  if (id[0] === 'r') return R16[+id[1]].map((s) => seed(m, s));
  if (id === 't') return [loser(m, 's0'), loser(m, 's1')];
  return FEED[id].map((x) => m.ko[x] || null);
}

export function loser(m, id) {
  const [a, b] = participants(m, id), w = m.ko[id];
  return w && a && b ? (w === a ? b : a) : null;
}

// Drops every knockout pick that no longer has both of its sides in place. Runs upstream first,
// so a changed group clears the whole path its old qualifier was on and nothing else.
export function normalize(m) {
  for (const id of MATCHES) {
    const [a, b] = participants(m, id), w = m.ko[id];
    if (w && (!a || !b || (w !== a && w !== b))) delete m.ko[id];
  }
  return m;
}

export const champion = (m) => m.ko.f || null;
export const runnerUp = (m) => loser(m, 'f');

export function scoreOk(m) {
  const [c, r] = m.score;
  return Number.isInteger(c) && Number.isInteger(r) && c >= 0 && r >= 0 && c <= 15 && r <= 15 && c >= r;
}

export function progress(m) {
  return {
    ko: MATCHES.filter((id) => m.ko[id]).length,
    score: scoreOk(m),
    awards: AWARDS.filter((k) => m.awards[k]).length,
    name: !!m.name.trim(),
  };
}

// An entry needs every knockout pick, the tiebreaker and a name. Award picks are optional.
export function complete(m) {
  const p = progress(m);
  return p.ko === MATCHES.length && p.score && p.name;
}

// ── scoring ─────────────────────────────────────────────────────────────────────────────────

export function scoreEntry(p, r) {
  const out = { groups: 0, ko: 0, awards: 0 };
  for (const g of GROUP_KEYS) {
    if (!r.done?.[g]) continue;
    const a = p.groups[g], b = r.groups[g], top = new Set(b.slice(0, 2));
    out.groups += a.slice(0, 2).filter((t) => top.has(t)).length * POINTS.qualify;
    const exact = a.filter((t, i) => t === b[i]).length;
    out.groups += exact * POINTS.exact + (exact === 4 ? POINTS.perfect : 0);
  }
  for (const round of ['r', 'q', 's', 'f']) {
    const ids = MATCHES.filter((id) => id[0] === round);
    const won = new Set(ids.map((id) => r.ko[id]).filter(Boolean));
    for (const id of ids) if (p.ko[id] && won.has(p.ko[id])) out.ko += POINTS[round];
  }
  if (r.ko.t && p.ko.t === r.ko.t) out.ko += POINTS.t;
  for (const k of AWARDS) if (r.awards[k] && p.awards[k] === r.awards[k]) out.awards += POINTS.award;
  out.total = out.groups + out.ko + out.awards;
  // Tiebreaker: the exact final score first, then how close the goals were.
  const known = scoreOk(r) && scoreOk(p);
  out.exact = known && p.score[0] === r.score[0] && p.score[1] === r.score[1];
  out.gap = known ? Math.abs(p.score[0] + p.score[1] - r.score[0] - r.score[1]) : 0;
  return out;
}

export function standings(entries, results) {
  return entries
    .map((e) => ({ entry: e, ...scoreEntry(e, results) }))
    .sort((a, b) => b.total - a.total || b.exact - a.exact || a.gap - b.gap
      || a.entry.name.localeCompare(b.entry.name));
}

// Share of entries backing each side at each stage.
export function crowd(entries, data) {
  const n = entries.length || 1, rows = {};
  for (const g of GROUP_KEYS) for (const t of data.groups[g]) rows[t] = { team: t, group: g, win: 0, qualify: 0, q: 0, s: 0, f: 0, champ: 0 };
  for (const e of entries) {
    for (const g of GROUP_KEYS) { rows[e.groups[g][0]].win++; for (const t of e.groups[g].slice(0, 2)) rows[t].qualify++; }
    for (const id of MATCHES) {
      const w = e.ko[id];
      if (!w || id === 't') continue;
      const key = { r: 'q', q: 's', s: 'f', f: 'champ' }[id[0]];
      rows[w][key]++;
    }
  }
  for (const r of Object.values(rows)) for (const k of ['win', 'qualify', 'q', 's', 'f', 'champ']) r[k] /= n;
  return Object.values(rows).sort((a, b) => b.champ - a.champ || b.f - a.f || b.s - a.s || b.q - a.q || b.qualify - a.qualify);
}

// ── entry codes ─────────────────────────────────────────────────────────────────────────────
// Every pick packed into a few dozen characters, name included, so a code posted in Discord is
// the whole entry. The groups are permutation ranks against the draw order, the knockouts one bit
// a match (which side won), and an award pick is the nation plus a hash of the player's name, so a
// reshuffled squad list does not move it.

const PREFIX = 'WC35-', VERSION = 1, NO_TEAM = 63;

export function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

class BitWriter {
  constructor() { this.bytes = []; this.acc = 0; this.n = 0; }
  put(v, width) {
    for (let i = width - 1; i >= 0; i--) {
      this.acc = (this.acc << 1) | ((v >> i) & 1);
      if (++this.n === 8) { this.bytes.push(this.acc); this.acc = 0; this.n = 0; }
    }
  }
  end() { if (this.n) this.bytes.push(this.acc << (8 - this.n)); this.acc = 0; this.n = 0; return this.bytes; }
}
class BitReader {
  constructor(bytes, at) { this.b = bytes; this.i = at * 8; }
  get(width) {
    let v = 0;
    for (let k = 0; k < width; k++, this.i++) {
      const byte = this.b[this.i >> 3];
      if (byte === undefined) throw new Error('short');
      v = (v << 1) | ((byte >> (7 - (this.i & 7))) & 1);
    }
    return v;
  }
  get byte() { return Math.ceil(this.i / 8); }
}

function permRank(order, base) {
  const left = [0, 1, 2, 3];
  let n = 0;
  order.forEach((t, i) => { const k = left.indexOf(base.indexOf(t)); n = n * (4 - i) + k; left.splice(k, 1); });
  return n;
}
function permFrom(n, base) {
  const digits = [];
  for (let r = 1; r <= 4; r++) { digits.unshift(n % r); n = Math.floor(n / r); }
  const left = [0, 1, 2, 3];
  return digits.map((d) => base[left.splice(d, 1)[0]]);
}

const toB64 = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64 = (s) => Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const teamOrder = (data) => GROUP_KEYS.flatMap((g) => data.groups[g]);

export function encode(m, data) {
  const order = teamOrder(data), w = new BitWriter();
  for (const g of GROUP_KEYS) w.put(permRank(m.groups[g], data.groups[g]), 5);
  for (const id of MATCHES) w.put(m.ko[id] === participants(m, id)[1] ? 1 : 0, 1);
  w.put(m.score[0], 4); w.put(m.score[1], 4);
  for (const k of AWARDS) {
    const [code, name] = (m.awards[k] || '').split('|');
    const i = order.indexOf(code);
    w.put(i < 0 ? NO_TEAM : i, 6); w.put(i < 0 ? 0 : fnv(name) & 0xffff, 16);
  }
  const name = Array.from(new TextEncoder().encode(m.name.trim()));
  const bytes = [VERSION, ...w.end(), name.length, ...name];
  bytes.push(fnv(String.fromCharCode(...bytes)) & 0xff);
  return PREFIX + toB64(bytes);
}

export function decode(code, data) {
  const s = String(code).trim().replace(/^WC35-/i, '');
  let bytes;
  try { bytes = fromB64(s); } catch { throw new Error('Not an entry code.'); }
  if (bytes.length < 4) throw new Error('Not an entry code.');
  const sum = bytes.pop();
  if ((fnv(String.fromCharCode(...bytes)) & 0xff) !== sum) throw new Error('This code is damaged. Copy it again from the card.');
  if (bytes[0] !== VERSION) throw new Error('This code is from another version of the pick\'em.');
  const order = teamOrder(data), r = new BitReader(bytes, 1), m = blank(data.groups);
  try {
    for (const g of GROUP_KEYS) {
      const n = r.get(5);
      if (n > 23) throw new Error('bad');
      m.groups[g] = permFrom(n, data.groups[g]);
    }
    for (const id of MATCHES) m.ko[id] = participants(m, id)[r.get(1)];
    m.score = [r.get(4), r.get(4)];
    for (const k of AWARDS) {
      const i = r.get(6), h = r.get(16), code2 = order[i];
      const hit = code2 && data.teams[code2].squad.find(([n]) => (fnv(n) & 0xffff) === h);
      m.awards[k] = hit ? `${code2}|${hit[0]}` : null;
    }
    const at = r.byte, len = bytes[at];
    m.name = new TextDecoder().decode(new Uint8Array(bytes.slice(at + 1, at + 1 + len)));
  } catch { throw new Error('This code is damaged. Copy it again from the card.'); }
  return m;
}

// ── the export card ─────────────────────────────────────────────────────────────────────────
// One portrait poster in the draw poster's colours: groups, bracket, awards and the final score. `badges` maps a team code to an image href and `fontCss` is @font-face rules; the
// page hands in both as data URIs, so the file carries its own badges and type and looks the same
// wherever it is opened.

export const CARD = { w: 1600, h: 2330 };
const C = { navy: '#0B2A55', deep: '#071D3D', lift: '#123C73', yellow: '#FFC72C', white: '#FFFFFF', ink: '#0B2A55', muted: '#7A8BA6', line: '#E3E8EF', pale: '#F4F6FA' };
// The page's three faces: Anton for the poster's title, Roboto Slab for its group tabs, Source
// Serif 4 for its team names. The fallbacks only matter when the fonts could not be embedded.
const F = {
  display: "Anton, Impact, 'Arial Narrow Bold', sans-serif",
  slab: "'Roboto Slab', Rockwell, Georgia, serif",
  serif: "'Source Serif 4', Georgia, 'Times New Roman', serif",
};
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function text(x, y, str, { size, font = F.serif, fill = C.ink, anchor = 'start', weight = 400, fit, spacing } = {}) {
  let extra = '';
  // A name wider than its box is squeezed to fit rather than run over the edge.
  if (fit && str.length * size * 0.52 > fit) extra = ` textLength="${fit}" lengthAdjust="spacingAndGlyphs"`;
  if (spacing) extra += ` letter-spacing="${spacing}"`;
  return `<text x="${x}" y="${y}" font-family="${esc(font)}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${extra}>${esc(str)}</text>`;
}

// A badge is embedded once, as a symbol, and every place that shows it points at that copy. Badges
// are drawn whole, never cropped: they come in shields, discs and flags, not one shape.
function badge(x, y, s, t) {
  return t
    ? `<use href="#bd-${t}" xlink:href="#bd-${t}" x="${x}" y="${y}" width="${s}" height="${s}"/>`
    : `<circle cx="${x + s / 2}" cy="${y + s / 2}" r="${s * 0.42}" fill="none" stroke="${C.muted}" stroke-width="${Math.max(1.5, s / 30)}" stroke-dasharray="${s / 12} ${s / 12}"/>`;
}

function pill(cx, y, w, h, label, size) {
  return `<rect x="${cx - w / 2}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${C.yellow}"/>` +
    text(cx, y + h / 2 + size * 0.36, label, { size, font: F.slab, weight: 700, anchor: 'middle' });
}

export function buildCard(m, data, { badges = {}, fontCss = '', banner = null } = {}) {
  const T = data.teams, name = (t) => (t ? T[t].name : '');
  const bd = (t) => (t && badges[t] ? t : null);
  const symbols = Object.entries(badges).map(([t, href]) =>
    `<symbol id="bd-${t}" viewBox="0 0 1 1"><image href="${esc(href)}" width="1" height="1" preserveAspectRatio="xMidYMid meet"/></symbol>`).join('');
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${CARD.w}" height="${CARD.h}" viewBox="0 0 ${CARD.w} ${CARD.h}">`);
  out.push(`<defs>${fontCss ? `<style><![CDATA[${fontCss}]]></style>` : ''}` +
    `<pattern id="lattice" width="48" height="48" patternUnits="userSpaceOnUse"><path d="M24 0 L48 24 L24 48 L0 24 Z" fill="none" stroke="${C.lift}" stroke-width="2"/></pattern>` +
    `<linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.navy}"/><stop offset="1" stop-color="${C.deep}"/></linearGradient>${symbols}</defs>`);
  out.push(`<rect width="${CARD.w}" height="${CARD.h}" fill="url(#fade)"/><rect width="${CARD.w}" height="${CARD.h}" fill="url(#lattice)" opacity="0.55"/>`);

  // Header: the tournament banner on a white plate, or its words when there is no banner to hand.
  if (banner) {
    out.push(`<rect x="170" y="50" width="1260" height="256" rx="32" fill="${C.yellow}"/>`);
    out.push(`<rect x="170" y="42" width="1260" height="256" rx="32" fill="${C.white}"/>`);
    out.push(`<image href="${esc(banner)}" x="250" y="70" width="1100" height="200" preserveAspectRatio="xMidYMid meet"/>`);
  } else {
    out.push(text(800, 118, 'AFA WORLD CUP', { size: 64, font: F.display, fill: C.white, anchor: 'middle', spacing: 3 }));
    out.push(`<text x="800" y="268" font-family="${esc(F.display)}" font-size="156" fill="${C.yellow}" stroke="${C.white}" stroke-width="5" paint-order="stroke" text-anchor="middle" letter-spacing="2">SKJARNLAND 1935</text>`);
  }
  const who = m.name.trim() ? `PICK'EM  ·  ${m.name.trim().toUpperCase()}` : "PICK'EM";
  out.push(text(800, 362, who, { size: 40, font: F.slab, fill: C.white, anchor: 'middle', weight: 700, spacing: 2, fit: 1400 }));

  // Groups: four across, two down, the draw poster's cards.
  GROUP_KEYS.forEach((g, gi) => {
    const x = 60 + (gi % 4) * 380, y = 410 + Math.floor(gi / 4) * 385, w = 340;
    out.push(`<rect x="${x}" y="${y + 34}" width="${w}" height="318" rx="26" fill="${C.white}"/>`);
    out.push(pill(x + w / 2, y, 290, 68, `GROUP ${g}`, 38));
    m.groups[g].forEach((t, i) => {
      const ry = y + 96 + i * 62, q = i < 2 && !(m.done && !m.done[g]);
      if (i === 2) out.push(`<line x1="${x + 22}" y1="${ry - 8}" x2="${x + w - 22}" y2="${ry - 8}" stroke="${C.line}" stroke-width="2" stroke-dasharray="6 6"/>`);
      out.push(`<circle cx="${x + 36}" cy="${ry + 22}" r="17" fill="${q ? C.yellow : C.pale}"/>`);
      out.push(text(x + 36, ry + 29, String(i + 1), { size: 20, font: F.slab, weight: 700, anchor: 'middle' }));
      out.push(badge(x + 64, ry, 44, bd(t)));
      out.push(text(x + 118, ry + 31, name(t), { size: 26, fit: w - 118 - 18 }));
    });
  });

  // Knockouts
  out.push(pill(800, 1188, 420, 64, 'KNOCKOUT STAGE', 34));
  const top = 1330, H = 720, bh = 84;
  const cols = {
    rL: { x: 40, w: 200 }, qL: { x: 264, w: 190 }, sL: { x: 478, w: 180 },
    c: { x: 682, w: 236 },
    sR: { x: 942, w: 180 }, qR: { x: 1146, w: 190 }, rR: { x: 1360, w: 200 },
  };
  for (const [k, lbl] of [['rL', 'ROUND OF 16'], ['qL', 'QUARTER-FINALS'], ['sL', 'SEMI-FINALS'], ['sR', 'SEMI-FINALS'], ['qR', 'QUARTER-FINALS'], ['rR', 'ROUND OF 16']])
    out.push(text(cols[k].x + cols[k].w / 2, 1300, lbl, { size: 17, font: F.slab, fill: C.yellow, anchor: 'middle', weight: 700, spacing: 1.5 }));

  // Where each match sits: its column and the centre of its box.
  const at = {};
  for (let i = 0; i < 4; i++) { at[`r${i}`] = ['rL', top + (i + 0.5) * H / 4]; at[`r${i + 4}`] = ['rR', top + (i + 0.5) * H / 4]; }
  for (let i = 0; i < 2; i++) { at[`q${i}`] = ['qL', top + (i + 0.5) * H / 2]; at[`q${i + 2}`] = ['qR', top + (i + 0.5) * H / 2]; }
  at.s0 = ['sL', top + H / 2]; at.s1 = ['sR', top + H / 2]; at.f = ['c', top + H / 2]; at.t = ['c', top + H / 2 + 250];

  // Connectors first, so the boxes sit on top of them.
  const link = (from, to) => {
    const [ca, ya] = at[from], [cb, yb] = at[to], A = cols[ca], B = cols[cb];
    const rightward = A.x < B.x, x1 = rightward ? A.x + A.w : A.x, x2 = rightward ? B.x : B.x + B.w, mx = (x1 + x2) / 2;
    return `<path d="M${x1} ${ya} H${mx} V${yb} H${x2}" fill="none" stroke="${C.yellow}" stroke-opacity="0.55" stroke-width="3"/>`;
  };
  for (const [to, from] of Object.entries(FEED)) for (const f of from) out.push(link(f, to));

  const box = (id) => {
    const [ck, cy] = at[id], { x, w } = cols[ck], y = cy - bh / 2;
    const [a, b] = participants(m, id), win = m.ko[id];
    const parts = [`<rect x="${x}" y="${y}" width="${w}" height="${bh}" rx="10" fill="${C.white}"/>`,
      `<line x1="${x + 8}" y1="${cy}" x2="${x + w - 8}" y2="${cy}" stroke="${C.line}" stroke-width="1.5"/>`];
    [a, b].forEach((t, i) => {
      const ly = y + i * (bh / 2), won = t && win === t, lost = t && win && win !== t;
      if (won) parts.push(`<rect x="${x}" y="${ly}" width="6" height="${bh / 2}" fill="${C.yellow}"/>`);
      if (!t) { parts.push(text(x + 16, ly + 28, id[0] === 'r' ? R16[+id[1]][i] : '—', { size: 17, fill: C.muted })); return; }
      parts.push(badge(x + 12, ly + 8, 26, bd(t)));
      const scoreW = id === 'f' && scoreOk(m) && champion(m) ? 26 : 0;
      parts.push(text(x + 46, ly + 28, name(t), { size: 18, weight: won ? 700 : 400, fill: lost ? C.muted : C.ink, fit: w - 46 - 10 - scoreW }));
      if (scoreW) {
        const g = t === champion(m) ? m.score[0] : m.score[1];
        parts.push(text(x + w - 12, ly + 29, String(g), { size: 20, font: F.slab, weight: 700, anchor: 'end' }));
      }
    });
    return parts.join('');
  };
  for (const id of MATCHES) out.push(box(id));

  // The centre column: champion above the final, third place below it.
  const champ = champion(m), cx = 800;
  out.push(text(cx, top + 32, 'CHAMPION', { size: 22, font: F.slab, fill: C.yellow, anchor: 'middle', weight: 700, spacing: 2 }));
  out.push(badge(cx - 62, top + 52, 124, bd(champ)));
  out.push(text(cx, top + 232, champ ? name(champ).toUpperCase() : '—', { size: 40, font: F.display, fill: C.white, anchor: 'middle', spacing: 1, fit: 300 }));
  out.push(text(cx, top + H / 2 - 54, 'FINAL', { size: 20, font: F.slab, fill: C.yellow, anchor: 'middle', weight: 700, spacing: 2 }));
  if (scoreOk(m) && m.score[0] === m.score[1]) out.push(text(cx, top + H / 2 + 66, 'won on penalties', { size: 16, fill: C.muted, anchor: 'middle' }));
  out.push(text(cx, top + H / 2 + 196, 'THIRD PLACE', { size: 18, font: F.slab, fill: C.yellow, anchor: 'middle', weight: 700, spacing: 2 }));

  // Awards and the tiebreaker.
  const cards = [...AWARDS.map((k) => ({ title: AWARD_NAME[k].toUpperCase(), pick: m.awards[k] })), { title: 'FINAL SCORE', score: true }];
  cards.forEach((c, i) => {
    const x = 61 + i * 376, y = 2110, w = 350, h = 172;
    out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" fill="${C.deep}" stroke="${C.yellow}" stroke-width="2"/>`);
    out.push(text(x + w / 2, y + 40, c.title, { size: 22, font: F.slab, fill: C.yellow, anchor: 'middle', weight: 700, spacing: 1.5 }));
    if (c.score) {
      const ru = runnerUp(m);
      if (champ && ru && scoreOk(m)) {
        out.push(badge(x + 34, y + 70, 58, bd(champ)));
        out.push(badge(x + w - 92, y + 70, 58, bd(ru)));
        out.push(text(x + w / 2, y + 122, `${m.score[0]} – ${m.score[1]}`, { size: 60, font: F.display, fill: C.white, anchor: 'middle' }));
        out.push(text(x + w / 2, y + 156, `${T[champ].name} v ${T[ru].name}`, { size: 16, fill: C.muted, anchor: 'middle', fit: w - 30 }));
      } else out.push(text(x + w / 2, y + 112, '—', { size: 40, fill: C.muted, anchor: 'middle' }));
      return;
    }
    const [tc, pn] = (c.pick || '').split('|');
    if (!pn) { out.push(text(x + w / 2, y + 112, '—', { size: 40, fill: C.muted, anchor: 'middle' })); return; }
    out.push(text(x + w / 2, y + 100, pn, { size: 30, fill: C.white, anchor: 'middle', fit: w - 30 }));
    const nw = T[tc].name.length * 20 * 0.52 + 36;
    out.push(badge(x + w / 2 - nw / 2, y + 120, 28, bd(tc)));
    out.push(text(x + w / 2 - nw / 2 + 36, y + 141, T[tc].name, { size: 20, fill: C.muted }));
  });


  out.push('</svg>');
  return out.join('\n');
}
