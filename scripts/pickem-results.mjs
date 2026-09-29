// The pick'em's results file, from the football engine's own save of the tournament.
//
//   node scripts/pickem-results.mjs [export.json]
//
// Reads a "1935 World Cup" export (Tournament > Export in the engine; by default the one dropped over
// the results file itself) and writes src/content/data/pickem-wc1935-state.json: every finished group
// in its final order, the winner of every tie played so far, and the final's score once there is one.
// The engine plays the pick'em's own bracket, so each tie is checked against the slot it fills and a
// save that disagrees is refused rather than half-written. Picks stay locked.
import fs from 'node:fs';
import * as K from '../src/lib/pickem/core.js';

const OUT = 'src/content/data/pickem-wc1935-state.json';
const src = JSON.parse(fs.readFileSync(process.argv[2] || OUT, 'utf8'));
if (src.kind !== 'avium-tournament') throw new Error('not an engine tournament export');
const data = JSON.parse(fs.readFileSync('src/content/data/pickem-wc1935.json', 'utf8'));
const code = new Map(Object.entries(data.teams).map(([c, t]) => [t.name.normalize('NFC'), c]));
const who = (t) => (t ? code.get((t.$t || t.name || '').normalize('NFC')) : null);

const p = src.payload, results = K.blank(data.groups, true);
for (const g of p.tGroups) {
  const order = g.standings.map(who), ties = g.schedule.flat().filter((m) => m.home && m.away && !m.bye);
  if (order.some((c) => !c) || [...order].sort().join() !== [...data.groups[g.label]].sort().join())
    throw new Error(`Group ${g.label} does not match the draw: ${order}`);
  results.groups[g.label] = order;
  results.done[g.label] = ties.every((m) => m.result && !m.result.partial);
}

// The engine's own rule: penalties if there were any, otherwise the goals after extra time.
const goals = (r, side) => r[side === 'home' ? 'ftHome' : 'ftAway'] + (r.et?.[side] || 0);
const winner = (m) => {
  const r = m.result;
  if (!r || r.partial) return null;
  if (r.pen) return r.pen.home > r.pen.away ? 'home' : 'away';
  return goals(r, 'home') >= goals(r, 'away') ? 'home' : 'away';
};
const IDS = [['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7'], ['q0', 'q1', 'q2', 'q3'], ['s0', 's1'], ['f']];
const ties = (p.tKO?.rounds || []).flatMap((round, ri) => round.matches.map((m, mi) => [IDS[ri]?.[mi], m]));
if (p.tKO?.thirdPlace) ties.push(['t', p.tKO.thirdPlace]);
for (const [id, m] of ties) {
  const side = winner(m);
  if (!id || !side) continue;
  const want = K.participants(results, id), got = [who(m.home), who(m.away)];
  if (want.join() !== got.join()) throw new Error(`${id} is ${got.join(' v ')} in the save, ${want.join(' v ')} on the bracket`);
  results.ko[id] = got[side === 'home' ? 0 : 1];
  // The tiebreaker is the final's score after extra time, the champion's goals first.
  if (id === 'f') {
    const other = side === 'home' ? 'away' : 'home';
    results.score = [goals(m.result, side), goals(m.result, other)];
  }
}

fs.writeFileSync(OUT, JSON.stringify({ locked: true, results }, null, 1) + '\n');
const played = K.MATCHES.filter((id) => results.ko[id]);
console.log(`groups finished ${K.GROUP_KEYS.filter((g) => results.done[g]).length}/8, ties ${played.length}/${K.MATCHES.length}: `
  + played.map((id) => `${id} ${results.ko[id]}`).join(', '));
