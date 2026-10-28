// Builds src/content/data/pickem-wc1936.json for the 1936 World Cup pick'em: the 32 finalists in
// draw order, how each one qualified, which of them are dark horses, and every squad for the award
// picks. The draw and the poster's art come from the Season Preview's draw build, the squads from
// the football engine's bundle. Ratings stay behind; they only decide the dark horses.
//
//   npm run sync-pickem-wc1936
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
const PREVIEW = path.resolve('../Avium Season Preview');
const DRAW = path.join(PREVIEW, 'wc_draw.json');
const OUT = path.resolve('src/content/data/pickem-wc1936.json');
const ART = path.resolve('public/assets/pickem/wc1936');

if (fs.statSync(BUNDLE).mtimeMs < fs.statSync(PRESET).mtimeMs)
  console.warn('warning: the engine bundle is older than AVIUM.tsv; rebuild it for current squads');

const { PRESET_CATALOG } = await import(pathToFileURL(BUNDLE).href);
const intl = new Map(PRESET_CATALOG.filter((t) => t.league === 'Avium International').map((t) => [t.code, t]));
const draw = JSON.parse(fs.readFileSync(DRAW, 'utf8')).groups;

// The line under each name on the draw poster: "West 3rd · 2-1 GAI". Same rule as finish() in
// the Season Preview's build_wc.py, so the page and the poster never disagree.
const ord = (n) => n + (n % 100 >= 10 && n % 100 <= 20 ? 'th' : { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
function finish(t) {
  if (t.host) return 'Hosts';
  const conf = t.route.startsWith('Eastern') ? 'East' : 'West';
  return `${conf} ${ord(t.place)}` + (t.playoff ? ` · ${t.playoff.score} ${t.playoff.opp}` : '');
}

fs.rmSync(path.join(ART, 'flags'), { recursive: true, force: true });
fs.mkdirSync(path.join(ART, 'flags'), { recursive: true });
const flag = (code) => execFileSync('sips', ['-s', 'format', 'png', '-Z', '160',
  path.join(PREVIEW, 'assets', `wcflag_${code}.png`), '--out', path.join(ART, 'flags', `${code}.png`)], { stdio: 'ignore' });

const groups = {}, teams = {};
let host = null;
for (const [g, sides] of Object.entries(draw)) {
  groups[g] = sides.map((s) => s.code);
  // Dark horses: the two sides in each group the engine rates lowest. A dark horse pick has to be
  // one of them, so it is a real bet against the group's favourites.
  const dark = new Set([...sides].sort((a, b) => intl.get(a.code).skill - intl.get(b.code).skill).slice(0, 2).map((s) => s.code));
  for (const s of sides) {
    const t = intl.get(s.code);
    if (!t) throw new Error(`${s.code} is not in the international preset`);
    if (s.host) host = s.code;
    teams[s.code] = {
      name: s.name, finish: finish(s), route: s.route,
      q: s.host ? null : { conf: s.conf[0].toUpperCase(), pos: s.place, W: s.w, D: s.d, L: s.l, GF: s.gf, GA: s.ga, Pts: s.pts },
      ...(dark.has(s.code) ? { dark: true } : {}),
      best: s.best, last: s.last,
      squad: t.squad.map((p) => [p.fullName || p.name, p.pos]),
    };
    flag(s.code);
  }
}

// The poster's art and its one typeface.
for (const [from, to] of [['assets/wc1936_wordmark.png', 'wordmark.png'], ['assets/wc1936_emblem.png', 'emblem.png'], ['assets/wc1936_pattern.png', 'pattern.png']])
  fs.copyFileSync(path.join(PREVIEW, from), path.join(ART, to));
execFileSync('sips', ['-Z', '640', path.join(ART, 'emblem.png')], { stdio: 'ignore' });
for (const f of ['Grenze.ttf', 'Grenze-OFL.txt']) fs.copyFileSync(path.join(ENGINE, 'src/fonts', f), path.join(ART, f));

fs.writeFileSync(OUT, JSON.stringify({ host, groups, teams }, null, 1) + '\n');
console.log(`wrote ${path.relative(process.cwd(), OUT)}: ${Object.keys(teams).length} teams, `
  + `${Object.values(teams).filter((t) => t.dark).length} dark horses, `
  + `${Object.values(teams).reduce((a, t) => a + t.squad.length, 0)} players`);
