// Builds src/content/data/pickem-wc1935.json for the World Cup pick'em: the 32 finalists in
// draw order, each side's qualifying record, and its squad for the award picks. The squads come
// out of the football engine's own bundle, so positions match what the engine plays them as.
// Ratings stay behind. Also copies each side's engine badge into public/, sized for the page.
//
//   npm run sync-pickem
//
// Run it again after a roster change. Rebuild the engine bundle first (`zsh test/rebuild.sh` in
// the engine), or this reads the squads as they were at the last build.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const ENGINE = path.resolve('../Avium Football Engine');
const BUNDLE = path.join(ENGINE, 'test/engine.mjs');
const PRESET = path.join(ENGINE, 'src/presets/AVIUM.tsv');
const PSTATS = path.join(ENGINE, 'public/avium/pstats');
const OUT = path.resolve('src/content/data/pickem-wc1935.json');
const BADGES = path.resolve('public/assets/pickem/wc1935/badges');

if (fs.statSync(BUNDLE).mtimeMs < fs.statSync(PRESET).mtimeMs)
  console.warn('warning: the engine bundle is older than AVIUM.tsv; rebuild it for current squads');

const { PRESET_CATALOG } = await import(pathToFileURL(BUNDLE).href);
const intl = new Map(PRESET_CATALOG.filter((t) => t.league === 'Avium International').map((t) => [t.code, t]));

// The draw, as announced. Order within a group is the pot order the poster prints.
const GROUPS = {
  A: ['NCH', 'SKJ', 'ANH', 'NRG'], B: ['AST', 'LVO', 'GIA', 'NMZ'],
  C: ['ESU', 'KAR', 'CAH', 'AEM'], D: ['HOL', 'COR', 'VAR', 'ASP'],
  E: ['ARV', 'PON', 'KMT', 'PER'], F: ['ASK', 'SID', 'NHO', 'ALB'],
  G: ['ALE', 'AUR', 'SEL', 'NKI'], H: ['VIC', 'FUR', 'SHI', 'ABB'],
};
const HOST = 'SKJ';

// Invited sides played no qualifiers, so they carry no record.
const INVITED = new Set(['ALB']);

// The final table of each conference's qualifying league, keyed by team name.
const qualifying = {};
for (const [conf, dir] of [['E', 'eastern'], ['W', 'western']]) {
  const md = fs.readFileSync(path.join(PSTATS, dir, '1935.md'), 'utf8');
  const table = md.slice(md.indexOf('## Final Table'));
  for (const line of table.split('\n')) {
    const c = line.split('|').map((s) => s.trim());
    if (!/^\d+$/.test(c[1] || '')) continue;
    const [pos, name, P, W, D, L, GF, GA, , Pts] = c.slice(1);
    qualifying[name] = { conf, pos: +pos, P: +P, W: +W, D: +D, L: +L, GF: +GF, GA: +GA, Pts: +Pts };
  }
}

fs.mkdirSync(BADGES, { recursive: true });
const badge = (src, code) => execFileSync('sips', ['-s', 'format', 'png', '-Z', '200', src, '--out', path.join(BADGES, `${code}.png`)], { stdio: 'ignore' });

const teams = {};
for (const code of Object.values(GROUPS).flat()) {
  const t = intl.get(code);
  if (!t) throw new Error(`${code} is not in the international preset`);
  const invited = INVITED.has(code), q = code === HOST || invited ? null : qualifying[t.name];
  if (code !== HOST && !invited && !q) throw new Error(`${t.name} has no qualifying record`);
  teams[code] = { name: t.name, q, ...(invited ? { invited } : {}), squad: t.squad.map((p) => [p.fullName || p.name, p.pos]) };
  badge(path.join(ENGINE, 'public/avium/badges', `${code}.png`), code);
}

fs.writeFileSync(OUT, JSON.stringify({ host: HOST, groups: GROUPS, teams }, null, 1) + '\n');
console.log(`wrote ${path.relative(process.cwd(), OUT)}: ${Object.keys(teams).length} teams, ` +
  `${Object.values(teams).reduce((a, t) => a + t.squad.length, 0)} players`);
