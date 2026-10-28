// Self-check for the 1936 pick'em: codes round-trip with the dark horse, a perfect entry scores the
// maximum, a dark horse scores for each round it survives, and a damaged code is refused. Writes a
// sample export card when given a path.
//
//   node scripts/pickem-check-wc1936.mjs [sample.svg]
import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as K from '../src/lib/pickem/wc1936.js';

const data = JSON.parse(fs.readFileSync('src/content/data/pickem-wc1936.json', 'utf8'));
const darks = Object.keys(data.teams).filter((t) => data.teams[t].dark);

let seedN = 11;
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
  m.dark = rnd(4) ? darks[rnd(darks.length)] : null;
  return m;
}

// 1. Codes round-trip, every field.
for (let i = 0; i < 300; i++) {
  const m = randomPicks(i % 3 ? `Entrant ${i}` : 'Dar Hadid Ūltras 龍宮');
  if (i % 7 === 0) m.awards.ball = null;
  assert.ok(K.complete(m));
  const code = K.encode(m, data);
  assert.ok(code.startsWith('WC36-'));
  assert.deepEqual(K.decode(code, data), m, `round trip ${i}`);
}

// 2. Picks scored against themselves score the maximum, dark horse included when it wins it all.
const m = randomPicks('Max');
const r = structuredClone(m);
r.done = Object.fromEntries(K.GROUP_KEYS.map((g) => [g, true]));
const champ = K.champion(r);
m.dark = champ;
const s = K.scoreEntry(m, r);
const maxNoDark = 8 * K.GROUP_MAX + 8 * 2 + 4 * 4 + 2 * 8 + 16 + 4 + 3 * 5;
assert.equal(s.total - s.dark, maxNoDark);
assert.equal(s.dark, K.DARK_MAX);

// 3. A dark horse out in the groups scores nothing and is no longer alive.
const g = K.GROUP_KEYS.find((x) => !r.groups[x].slice(0, 2).includes(champ));
const out = r.groups[g][3];
assert.deepEqual(K.survived(r, out), []);
assert.equal(K.alive(r, out), false);
assert.equal(K.alive(r, champ), true);

// 4. A damaged code is refused.
const good = K.encode(m, data), bad = good.slice(0, -3) + (good.at(-3) === 'A' ? 'B' : 'A') + good.slice(-2);
assert.throws(() => K.decode(bad, data));

if (process.argv[2]) fs.writeFileSync(process.argv[2], K.buildCard(m, data, {}));
console.log(`pick'em 1936 checks pass: 300 codes, max ${maxNoDark} + ${K.DARK_MAX} dark horse`);
