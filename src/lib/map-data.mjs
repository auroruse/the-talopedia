/**
 * The nation tables, drawn from the Avium Map's own data so they are never copied out
 * and left to go stale. A page asks for one with a note in its markdown, written on a
 * line of its own:
 *
 *   <!-- nation-table: area -->        area
 *   <!-- nation-table: population -->  population, urban population and density
 *   <!-- nation-table: living -->      GDP (PPP), HDI, life expectancy and literacy
 *
 * Working beside the map, the figures are read from its checkout, so a change there
 * shows here at once. Anywhere else, the deploy included, scripts/map-data.mjs fetches
 * the same files from the map's repository before the build. The map-watch workflow
 * rebuilds the site whenever the map's data changes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { nations } from './registry.mjs';
import { renderInline, esc } from './inline.mjs';

const SIBLING = path.resolve('../Avium Map/src/data');
const FETCHED = path.resolve('.map-data');
export const FILES = ['nations.tsv', 'cities.tsv', 'areas.json'];

// Renamed on the site and not yet on the map: the map's name and the current one.
const RENAMED = { Mizuho: 'Iriria', 'Hōrai': 'Shashanka', 'Ryūgu': 'Dar Hadid' };
// The flag a dependency already has on the site under another name.
const FLAG_OF = { barbary: 'barbarie', 'napolyon-bonparterre-islands': 'bonparterre-islands' };

const dir = () => (fs.existsSync(path.join(SIBLING, 'nations.tsv')) ? SIBLING : FETCHED);
const num = (s) => {
  const n = parseFloat(String(s ?? '').replace(/[,%$]/g, ''));
  return Number.isFinite(n) ? n : null;
};
const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const slugify = (s) => fold(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function tsv(file) {
  const [head, ...lines] = fs.readFileSync(file, 'utf8').trim().split('\n');
  const keys = head.split('\t');
  return lines.map((l) => Object.fromEntries(l.split('\t').map((v, i) => [keys[i], v.trim()])));
}

let cache = { at: 0, rows: null };
const TTL = process.env.NODE_ENV === 'production' ? Infinity : 1500;

/** One row per nation and dependency on the map, or null when the data is not to hand. */
export function mapNations() {
  if (Date.now() - cache.at < TTL && cache.rows) return cache.rows;
  const d = dir();
  if (!FILES.every((f) => fs.existsSync(path.join(d, f)))) {
    console.warn(`[map-data] no map data in ${d}; run node scripts/map-data.mjs`);
    return null;
  }
  const areas = JSON.parse(fs.readFileSync(path.join(d, 'areas.json'), 'utf8'));
  const urban = new Map();
  for (const c of tsv(path.join(d, 'cities.tsv'))) urban.set(c.NATION, (urban.get(c.NATION) ?? 0) + (num(c.POPULATION) ?? 0));

  const all = tsv(path.join(d, 'nations.tsv'));
  // A colony carries its metropole's code, so the metropole is the one with that code
  // that is not itself a colony.
  const sovereign = new Map(all.filter((r) => r.STATUS !== 'Colony').map((r) => [r['ALPHA-3 CODE'], r['COMMON NAME']]));
  const rows = all.map((r) => {
    const name = r['COMMON NAME'];
    const population = num(r.POPULATION);
    const land = areas[name] ?? null;
    const dependency = r.STATUS === 'Colony';
    return {
      name,
      dependency,
      of: dependency ? sovereign.get(r['ALPHA-3 CODE']) ?? null : null,
      population,
      // The cities on the map are the urban population. A colony of a few hamlets can
      // list more people in them than live there, so it stops at the whole.
      urban: population == null ? null : Math.min(urban.get(name) ?? 0, population),
      land,
      gdp: num(r['GDP PPP ($)']),
      hdi: num(r.HDI),
      life: num(r['LIFE EXPECTANCY']),
      literacy: num(r['LITERACY RATE']),
    };
  });
  cache = { at: Date.now(), rows };
  return rows;
}

/** Who a row is on the site: the name it shows, its flag and its page, where it has them. */
function who(r) {
  const name = RENAMED[r.name] || r.name;
  const key = fold(name);
  const known = nations().find((n) => fold(n.name) === key);
  if (known) return { name: known.name, flag: known.flag || null, slug: known.id, known: true };
  const slug = slugify(name);
  const flag = ['png', 'jpg'].map((x) => `/assets/flags/${FLAG_OF[slug] || slug}.${x}`).find((p) => fs.existsSync(path.join('public', p)));
  // A dependency with no flag of its own flies its sovereign's.
  const own = flag || (r.dependency && r.of ? who({ name: r.of }).flag : null);
  return { name, flag: own || null, slug: fs.existsSync(path.join('src/content/articles', slug + '.md')) ? slug : null };
}

/** The nation's name as the site shows it: flag and link where the site has them. */
function nameCell(r) {
  const w = who(r);
  const flag = w.flag ? (w.known ? `:flag[${w.slug}] ` : `:img[${w.flag}] `) : '';
  const html = renderInline(`${flag}${w.slug ? `[[${w.slug}|${w.name}]]` : w.name}`);
  return r.dependency ? `${html}${r.of ? ` <small>(${esc(r.of)})</small>` : ''}` : html;
}

const int = (n) => (n == null ? '' : Math.round(n).toLocaleString('en-US'));
const fixed = (n, d) => (n == null ? '' : n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
const pct = (a, b) => (a == null || !b ? '' : `${fixed((100 * a) / b, 1)}%`);

/** Dependencies are listed in their place but take no rank, as Wikipedia lists them. */
function ranked(rows, by) {
  let rank = 0;
  return rows
    .filter((r) => r[by] != null)
    .sort((a, b) => b[by] - a[by])
    .map((r) => ({ ...r, rank: r.dependency ? '' : String(++rank) }));
}

const TABLES = {
  area: {
    head: ['Rank', 'Nation', 'Area<br><small>(km²)</small>'],
    rows: (all) => ranked(all, 'land').map((r) => [r.rank, nameCell(r), int(r.land)]),
  },
  population: {
    head: ['Rank', 'Nation', 'Population', 'Urban population', 'Urban<br><small>(%)</small>', 'Density<br><small>(per km²)</small>'],
    rows: (all) => ranked(all, 'population').map((r) => [
      r.rank, nameCell(r), int(r.population), int(r.urban), pct(r.urban, r.population),
      r.land ? fixed(r.population / r.land, 1) : '',
    ]),
  },
  living: {
    head: ['Nation', 'GDP (PPP)<br><small>($ billions)</small>', 'HDI', 'Life expectancy<br><small>(years)</small>', 'Literacy rate'],
    rows: (all) => all.filter((r) => r.gdp != null).sort((a, b) => b.gdp - a.gdp).map((r) => [
      nameCell(r), int(r.gdp / 1e9), fixed(r.hdi, 3), fixed(r.life, 1), r.literacy == null ? '' : `${fixed(r.literacy, 1)}%`,
    ]),
  },
};

export const TABLE_NOTE = /<!--\s*nation-table:\s*([a-z]+)\s*-->/g;

/** The table a note asks for, or nothing when the note names none or the data is missing. */
export function nationTable(kind) {
  const t = TABLES[kind];
  const all = t && mapNations();
  if (!all) return '';
  const tr = (cells, tag) => `<tr>${cells.map((c) => `<${tag}>${c}</${tag}>`).join('')}</tr>`;
  return `<table class="sortable">${tr(t.head, 'th')}${t.rows(all).map((c) => tr(c, 'td')).join('')}</table>`;
}

const LEAD = {
  area: { by: 'land', unit: 'million km²', figure: (r) => fixed(r.land / 1e6, 2) },
  population: { by: 'population', unit: 'million', figure: (r) => fixed(r.population / 1e6, 1) },
  living: { by: 'gdp', unit: '$ trillion', figure: (r) => fixed(r.gdp / 1e12, 2) },
};

/** The first few nations of a table, for the Lists category; null when the data is missing. */
export function leaders(kind, n = 5) {
  const all = mapNations();
  const l = LEAD[kind];
  if (!all || !l) return null;
  const rows = ranked(all, l.by).filter((r) => !r.dependency).slice(0, n)
    .map((r) => ({ rank: r.rank, ...who(r), figure: l.figure(r) }));
  return { rows, unit: l.unit, count: all.filter((r) => r[l.by] != null).length };
}
