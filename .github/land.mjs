/**
 * Lands a pull request from the editor on main, merging each file against the copy
 * the writer actually opened.
 *
 * The editor opens every page from the live site and records which commit of main
 * that was, as a Based-on line in each commit it sends. A writer's fork, meanwhile,
 * can sit days behind main: GitHub will not bring a fork past a change to a workflow
 * file with the token the editor asks for. A pull request branched from that old fork
 * starts from the wrong place, so git sees every page it touches as changed on both
 * sides and refuses to merge. Merging against the copy the writer opened is right
 * whether their fork is fresh or stale; it keeps whatever landed on main since, and
 * never quietly undoes it.
 *
 * A page sent without the line, because it waited in the editor from before the line
 * existed or was opened from a file on disk, is merged against the version of it on
 * main that it is nearest to. Such pages used to go to GitHub's own merge, which
 * starts from the stale fork: #67 sat a day in conflict that way, and the hand merge
 * that cleared it lost the Shushestan half.
 *
 * Every paragraph is one line of its file, so where both sides changed the same line
 * the merge goes on word by word. Where both changed the same words, the writer's
 * stand and main's are written to $NOTES for the pull request to show; a change of
 * spacing alone, which the editor makes whenever it saves, never outweighs a word.
 *
 * Stages the result in the working tree of a main checkout and prints one line:
 *   ready            merged; commit what is staged
 *   wait <reason>    a page deleted or added across someone else's work, or a picture
 *                    already on main: that is for a person to settle
 *
 * Env: ONTO, the main commit to land on (default HEAD); PR_HEAD, the pull request;
 * NOTES, where to write the words the writer's replaced (optional).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fixEmphasis } from '../src/lib/emphasis.mjs';

const ONTO = process.env.ONTO || 'HEAD';
const { PR_HEAD, NOTES } = process.env;
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 64 << 20 });
const bytes = (id) => execFileSync('git', ['cat-file', 'blob', id], { maxBuffer: 64 << 20 });
/** The blob a file is at a commit, or null where it does not exist there. */
const blob = (ref, path) => {
  try { return git('rev-parse', '--verify', '-q', `${ref}:${path}`).trim() || null; } catch { return null; }
};
const notes = [];
const done = (line) => {
  if (NOTES) writeFileSync(NOTES, notes.join('\n'));
  console.log(line);
  process.exit(0);
};
const put = (path, data) => {
  // Bold that would print its asterisks is fixed on the way in, whatever sent it.
  if (/^src\/content\/.*\.md$/.test(path)) data = fixEmphasis(data.toString('utf8'));
  mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, data); git('add', '--', path);
};

/** The commit of main the writer opened this file from, off the last commit that changed it. */
function basedOn(path) {
  const msg = git('log', '-1', '--format=%B', `${ONTO}..${PR_HEAD}`, '--', path);
  const from = (msg.match(/^Based-on: ([0-9a-f]{7,40})$/m) || [])[1];
  if (!from) return null;
  try { git('cat-file', '-e', `${from}^{commit}`); return from; } catch { return null; }
}

/** How far apart two versions of a file are: the characters in the words that differ. */
function distance(a, b) {
  let n = 0;
  for (const l of git('diff', '--no-color', '--word-diff=porcelain', a, b).split('\n')) {
    if ((l[0] === '+' && !l.startsWith('+++')) || (l[0] === '-' && !l.startsWith('---'))) n += l.length - 1;
  }
  return n;
}

/**
 * The version of a page on main that an edit which never said where it started is
 * nearest to. An edit changes a few passages of the copy it was opened from and
 * leaves the rest alone, so that copy is nearer to it than any version before or
 * since. A tie goes to the older version: whatever main changed after it then counts
 * as a change on main and is kept, where the newer would let the edit write over it.
 */
function nearest(path, theirs) {
  const versions = [];
  for (const c of git('log', '--format=%H', '-n', '200', ONTO, '--', path).split('\n').filter(Boolean)) {
    const b = blob(c, path);
    if (b && !versions.includes(b)) versions.push(b);
  }
  let best = null, least = Infinity;
  for (const v of versions.reverse()) {           // oldest first, so a tie keeps it
    const d = distance(v, theirs);
    if (d < least) { least = d; best = v; }
  }
  return best;
}

const scratch = mkdtempSync(join(tmpdir(), 'land-'));
const file = (name, data) => { const p = join(scratch, name); writeFileSync(p, data); return p; };
/** git merge-file on three texts: the result, and whether it came out without a conflict. */
function mergeFile(ours, base, theirs, ...opt) {
  try {
    const text = execFileSync('git', ['merge-file', '-p', ...opt, file('ours', ours), file('base', base), file('theirs', theirs)],
      { maxBuffer: 64 << 20 });
    return { text, clean: true };
  } catch (e) {
    if (e.status > 0 && e.status <= 127) return { text: e.stdout, clean: false };   // the number of conflicts
    throw e;
  }
}

/**
 * Main's version and the writer's, merged against the copy the writer opened: line by
 * line as git merges, and word by word where that collides. Each word, and each run of
 * space between words, goes to git as a line of its own, JSON-quoted so that a line
 * break inside a run comes back intact.
 */
function merge(path, ours, base, theirs) {
  const byLine = mergeFile(ours, base, theirs);
  if (byLine.clean) return byLine.text;

  const words = (buf) => buf.toString('utf8').split(/(\s+)/).filter((t) => t !== '')
    .map((t) => JSON.stringify(t)).join('\n') + '\n';
  const byWord = mergeFile(words(ours), words(base), words(theirs), '--diff3');
  const out = [];
  let side = null, hunk = null;
  for (const line of byWord.text.toString('utf8').split('\n')) {
    if (line.startsWith('<<<<<<< ')) { side = 'ours'; hunk = { ours: [], base: [], theirs: [] }; continue; }
    if (line.startsWith('||||||| ') && side) { side = 'base'; continue; }
    if (line === '=======' && side) { side = 'theirs'; continue; }
    if (line.startsWith('>>>>>>> ') && side) { out.push(...settle(path, hunk, out)); side = null; continue; }
    if (!line) continue;
    (side ? hunk[side] : out).push(JSON.parse(line));
  }
  return out.join('');
}

/** One place where both sides changed the same words: which stands. */
function settle(path, { ours, base, theirs }, before) {
  const text = (ts) => ts.filter((t) => /\S/.test(t)).join(' ');
  if (text(theirs) === text(base)) return ours;       // the writer only respaced it
  if (text(ours) === text(base)) return theirs;       // main only respaced it
  const say = (ts) => `"${ts.join('').replace(/\s+/g, ' ').trim().slice(0, 300)}"`;
  const lead = before.slice(-16).join('').replace(/\s+/g, ' ').trim().slice(-80);
  notes.push(`- \`${path.split('/').pop()}\`${lead ? `, after "...${lead}"` : ''}: main had ${say(ours)}; this edit has ${say(theirs)}`);
  return theirs;
}

const changes = git('diff', '--name-status', '--no-renames', `${ONTO}...${PR_HEAD}`)
  .trim().split('\n').filter(Boolean)
  .map((l) => { const [s, path] = l.split('\t'); return { gone: s.startsWith('D'), path }; });
if (!changes.length) done('wait nothing to merge');

// A pick'em entry is one person's own file, replaced whole: the gate has checked it.
const PICK = /^src\/content\/data\/pickem-wc1935\/entries\//;

const plan = changes.map((c) => {
  // A picture is only ever added, so it has nothing to be merged against.
  if (c.path.startsWith('public/assets/') || PICK.test(c.path)) return { ...c, base: null };
  const from = basedOn(c.path);
  if (from) return { ...c, base: blob(from, c.path) };
  const theirs = c.gone ? null : blob(PR_HEAD, c.path);
  return { ...c, base: theirs && nearest(c.path, theirs) };
});

for (const { path, gone, base } of plan) {
  const theirs = gone ? null : blob(PR_HEAD, path);
  const ours = blob(ONTO, path);
  if (theirs === ours) continue;                         // already so on main
  if (PICK.test(path) && theirs) { put(path, bytes(theirs)); continue; }
  // A picture cannot be merged line by line. The gate only lets a new one through,
  // so one already on main that differs is not this pull request's to replace.
  if (path.startsWith('public/assets/') && ours) done(`wait ${path} is already on main`);
  if (ours === base) {                                   // untouched on main since it was opened
    if (theirs) put(path, bytes(theirs)); else git('rm', '-q', '--', path);
    continue;
  }
  // Main has moved since the writer opened it. Deleting a page someone has since
  // edited, or adding one at a name someone has since taken, is theirs to settle.
  if (!base || !theirs || !ours) done(`wait ${path} changed on main since it was opened`);
  put(path, merge(path, bytes(ours), bytes(base), bytes(theirs)));
}
done('ready');
