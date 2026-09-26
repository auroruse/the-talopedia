// Self-check for the pick'em logic: codes round-trip, a changed group clears the right knockout
// picks, perfect picks score the maximum, and a damaged code is refused. Writes a sample export
// card next to itself when given a path.
//
//   node scripts/pickem-check.mjs [sample.svg]
import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as K from '../src/lib/pickem/core.js';

const data = JSON.parse(fs.readFileSync('src/content/data/pickem-wc1935.json', 'utf8'));

// A deterministic "random" full set of picks.
let seedN = 7;
const rnd = (n) => { seedN = (seedN * 1103515245 + 12345) >>> 0; return seedN % n; };
function randomPicks(name) {
  const m = K.blank(data.groups);
  m.name = name;
  for (const g of K.GROUP_KEYS) {
    const a = m.groups[g];
    for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  }
  for (const id of K.MATCHES) m.ko[id] = K.participants(m, id)[rnd(2)];
  const c = rnd(5), r = rnd(c + 1);
  m.score = [c, r];
  const all = Object.entries(data.teams).flatMap(([code, t]) => t.squad.map(([n, p]) => ({ id: `${code}|${n}`, p })));
  m.awards.boot = all[rnd(all.length)].id;
  m.awards.ball = all[rnd(all.length)].id;
  const gks = all.filter((x) => x.p === 'GK');
  m.awards.glove = gks[rnd(gks.length)].id;
  return m;
}

// 1. Codes round-trip, every field, many times over.
for (let i = 0; i < 300; i++) {
  const m = randomPicks(i % 3 ? `Entrant ${i}` : 'Hōrai Ūltras 龍宮');
  if (i % 7 === 0) m.awards.ball = null;
  assert.ok(K.complete(m));
  const code = K.encode(m, data);
  assert.deepEqual(K.decode(code, data), m, `round trip ${i}`);
}

// 2. A damaged code is refused, not misread.
const good = K.encode(randomPicks('Kirin'), data);
const bad = good.slice(0, 12) + (good[12] === 'A' ? 'B' : 'A') + good.slice(13);
assert.throws(() => K.decode(bad, data), /damaged/);

// 3. Swapping a group's top two clears exactly the knockout path the old winner was on.
const m = randomPicks('Clear');
const before = { ...m.ko };
[m.groups.A[0], m.groups.A[1]] = [m.groups.A[1], m.groups.A[0]];
K.normalize(m);
for (const id of K.MATCHES) {
  const [a, b] = K.participants(m, id);
  if (m.ko[id]) assert.ok(m.ko[id] === a || m.ko[id] === b, `${id} kept an impossible winner`);
}
assert.ok(!m.ko.r0 || m.ko.r0 === before.r0);
assert.ok(K.MATCHES.some((id) => before[id] && !m.ko[id]), 'nothing was cleared');

// 4. Perfect picks score the maximum; the tiebreaker sees the exact score.
const truth = randomPicks('Results');
const results = { ...structuredClone(truth), done: Object.fromEntries(K.GROUP_KEYS.map((g) => [g, true])) };
const s = K.scoreEntry(truth, results);
const max = 8 * (2 + 4 + 2) + 8 * 2 + 4 * 4 + 2 * 8 + 16 + 4 + 3 * 5;
assert.equal(s.total, max);
assert.ok(s.exact);
// An unfinished group scores nothing.
results.done.A = false;
assert.equal(K.scoreEntry(truth, results).groups, 7 * 8);

// 5. The card renders.
const badges = {};
for (const code of Object.keys(data.teams))
  badges[code] = 'data:image/png;base64,' + fs.readFileSync(`public/assets/pickem/wc1935/badges/${code}.png`).toString('base64');
const banner = 'data:image/png;base64,' + fs.readFileSync('public/assets/1935skj.png').toString('base64');
const svg = K.buildCard(truth, data, { badges, banner });
assert.ok(svg.startsWith('<svg') && svg.includes('KNOCKOUT STAGE'));
if (process.argv[2]) fs.writeFileSync(process.argv[2], svg);

console.log(`ok: 300 codes round-trip (${good.length} chars), damage refused, groups clear their own path, max score ${max}`);
