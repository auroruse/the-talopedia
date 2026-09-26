/**
 * Whether a pull request is routine enough to merge itself.
 *
 * A nation may edit the pages it is credited on, and nothing else. The credit is the
 * byline the page already prints, read from main rather than from the pull request,
 * so a pull request cannot write its author onto somebody else's page: the page has
 * to be theirs on both sides of the change. That also settles the communal pages,
 * which are credited to two nations and so are never solely anyone's.
 *
 * This file sits outside the paths a pull request may touch, so changing the rule is
 * itself a thing a person has to approve.
 *
 * Prints one line: `merge`, or `wait <reason>`.
 */
import { execFileSync } from 'node:child_process';
import { ACCOUNT_OF } from '../src/lib/contributors.mjs';
import { decode, complete } from '../src/lib/pickem/core.js';

const { PR_AUTHOR, BASE, HEAD, ADMIN } = process.env;

const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
/** A file's contents at a ref, or null where it does not exist there. */
const show = (ref, path) => {
  try { return git('show', `${ref}:${path}`); } catch { return null; }
};

/** Everything the editor writes: a page, a navbox, and an image. Nothing else is a
    thing a contributor can produce, so nothing else merges on its own. */
const PAGE = /^src\/content\/(articles|portals)\/[^/]+\.md$/;
const NAVBOX = /^src\/content\/data\/navboxes\/([^/]+)\.yaml$/;
const ASSET = /^public\/assets\/./;
const writable = (p) => PAGE.test(p) || NAVBOX.test(p);

/**
 * Who the site says wrote a page: `authors` when it is set and `nation` when it is
 * not, which is exactly what prints at the top of the article. A frontmatter shape
 * this cannot read comes back empty and therefore matches nobody, so an unfamiliar
 * file is reviewed rather than waved through.
 */
function byline(text) {
  if (text == null) return null;
  const end = text.indexOf('\n---', 3);
  const fm = end < 0 ? text : text.slice(0, end);
  const clean = (s) => s.trim().replace(/^["']|["']$/g, '');
  const list = fm.match(/^authors:[ \t]*\[([^\]]*)\]/m);
  if (list) return list[1].split(',').map(clean).filter(Boolean).sort();
  const one = fm.match(/^nation:[ \t]*(\S.*)$/m);
  return one ? [clean(one[1])] : [];
}

/**
 * Who a file is credited to. A navbox is named after the nation whose navbox it is,
 * so its credit is the file name; site.yaml is everybody's and therefore nobody's.
 * Everything else carries its credit in its own frontmatter.
 */
function creditOf(ref, path) {
  const nav = path.match(NAVBOX);
  if (nav) return nav[1] === 'site' ? [] : [nav[1]];
  return byline(show(ref, path));
}

const decline = (why) => { console.log(`wait ${why}`); process.exit(0); };
const named = (credit) => (credit?.length ? credit.join(' and ') : 'nobody');
const changed = git('diff', '--name-status', `${BASE}...${HEAD}`).trim().split('\n').filter(Boolean);

/**
 * A pick'em entry. Anyone with a GitHub account may file their own, and replace it until
 * the picks lock, so this is checked before the nation rule. It travels alone, it is the
 * file named for whoever opened the pull request, and it has to be a complete set of picks
 * that decodes against the draw on main. Nothing about it is trusted that main cannot check.
 */
const PICK = /^src\/content\/data\/pickem-wc1935\/entries\/([a-z0-9-]+)\.json$/;
if (changed.some((l) => PICK.test(l.split('\t').pop()))) {
  if (changed.length !== 1) decline('a pick\'em entry travels alone.');
  const [status, path] = changed[0].split('\t');
  if (!/^[AM]$/.test(status)) decline(`${path} is added or replaced, never ${status === 'D' ? 'deleted' : 'moved'}.`);
  if (path.match(PICK)[1] !== PR_AUTHOR.toLowerCase()) decline(`${path} is not ${PR_AUTHOR}'s entry.`);
  const state = JSON.parse(show(BASE, 'src/content/data/pickem-wc1935-state.json') || '{}');
  if (state.locked) decline('the pick\'em is locked.');
  const text = show(HEAD, path) || '';
  let entry = null;
  try { entry = text.length < 2000 ? JSON.parse(text) : null; } catch { /* declined below */ }
  if (!entry || Object.keys(entry).join() !== 'code' || typeof entry.code !== 'string') decline(`${path} is not an entry.`);
  let picks = null;
  try { picks = decode(entry.code, JSON.parse(show(BASE, 'src/content/data/pickem-wc1935.json'))); } catch { /* declined below */ }
  if (!picks || !complete(picks)) decline(`${path} does not hold a complete set of picks.`);
  console.log('merge');
  process.exit(0);
}

const nation = Object.keys(ACCOUNT_OF).find((n) => ACCOUNT_OF[n] === PR_AUTHOR);
const admin = PR_AUTHOR === ADMIN;
if (!nation && !admin) decline(`${PR_AUTHOR} does not write for a nation.`);

for (const line of changed) {
  const [status, ...paths] = line.split('\t');
  const from = paths[0];                            // where it stood on main
  const to = paths[paths.length - 1];               // where the pull request leaves it
  const added = status.startsWith('A');
  const deleted = status.startsWith('D');

  // A picture that is new belongs to nobody yet, so anyone may add one. Replacing or
  // deleting one is how another nation's flag would go missing, so that is reviewed;
  // and a branch from an old fork calls a picture added since "new", so main decides.
  if (added && ASSET.test(to)) {
    if (show(BASE, to) == null) continue;
    decline(`${to} would replace a picture already on main.`);
  }
  if (!writable(to) || !writable(from)) decline(`${to} is not a page.`);
  if (admin) continue;

  // The page has to be this nation's alone, both as it stands and as it would stand.
  // One check covers taking someone else's page, handing your own away, and the
  // communal pages, which are never solely one nation's. What it stands as is read
  // off main whatever the diff calls it: a branch from an old fork reports a page
  // made since as newly added, and would otherwise walk straight over it.
  const was = creditOf(BASE, from);
  const now = deleted ? null : creditOf(HEAD, to);
  if (was && (was.length !== 1 || was[0] !== nation)) decline(`${from} is credited to ${named(was)}.`);
  if (now && (now.length !== 1 || now[0] !== nation)) decline(`${to} would be credited to ${named(now)}.`);
}

console.log('merge');
