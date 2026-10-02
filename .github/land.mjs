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
import { ACCOUNT_OF } from '../src/lib/contributors.mjs';

const ONTO = process.env.ONTO || 'HEAD';
const { PR_HEAD, NOTES, WRITER } = process.env;
/** The nation whoever opened the pull request writes for, if any. */
const WRITES_FOR = Object.keys(ACCOUNT_OF).find((n) => ACCOUNT_OF[n] === WRITER);
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

/**
 * A NEW PAGE WITH NO NATION ON IT IS ITS WRITER'S: gate.mjs lets it through on that
 * footing, and this writes the byline in, as though they had picked their own nation.
 * The site navbox the editor falls back to when no nation is chosen goes with it.
 */
function credit(path, data) {
  if (!WRITES_FOR || !/^src\/content\/articles\/[^/]+\.md$/.test(path)) return data;
  const text = data.toString('utf8'), end = text.indexOf('\n---', 3);
  if (!text.startsWith('---') || end < 0) return data;
  const fm = text.slice(0, end).split('\n');
  if (fm.some((l) => /^authors:[ \t]*\[[^\]]*[^\s\],'"][^\]]*\]/.test(l) || /^nation:[ \t]*\S/.test(l))) return data;
  const kept = fm.filter((l) => !/^nation:/.test(l) && !/^navbox:[ \t]*site[ \t]*$/.test(l));
  const at = kept.findIndex((l) => /^type:/.test(l));
  kept.splice(at > 0 ? at + 1 : kept.length, 0, `nation: ${WRITES_FOR}`);
  return kept.join('\n') + text.slice(end);
}

/** The commit of main the writer opened this file from, off the last commit that changed it. */
function basedOn(path) {
  const msg = git('log', '-1', '--format=%B', `${ONTO}..${PR_HEAD}`, '--', path);
  const from = (msg.match(/^Based-on: ([0-9a-f]{7,40})$/m) || [])[1];
  if (!from) return null;
  try { git('cat-file', '-e', `${from}^{commit}`); return from; } catch { return null; }
}

/** Whether every change to a page on main since it was opened is one of this writer's own saves landing. */
function ownSaves(path, from) {
  const log = git('log', '--format=%an%x09%cn%x09%s', `${from}..${ONTO}`, '--', path).trim().split('\n').filter(Boolean);
  return log.length > 0 && log.every((l) => {
    const [author, committer, subject] = l.split('\t');
    return author === WRITER && committer === 'github-actions[bot]' && /\(#\d+\)$/.test(subject);
  });
}

/** Whether the writer's text holds what main added since it was opened: half its new paragraphs, word for word. */
function holds(ours, base, theirs) {
  const paras = (b) => b.toString('utf8').split('\n').filter((l) => l.trim().length > 20);
  const was = new Set(paras(base)), sent = new Set(paras(theirs));
  const added = [...new Set(paras(ours))].filter((l) => !was.has(l));
  return added.length > 0 && added.filter((l) => sent.has(l)).length * 2 >= added.length;
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

// Conflict markers no line of a page could be taken for: a setext heading is a run of =.
const MARK = 40;

/**
 * Main's version and the writer's, merged against the copy the writer opened: line by
 * line as git merges, and word by word only inside the paragraphs that collide. Going
 * word by word over the whole page lined up common words across unrelated paragraphs
 * and wove them together: the merges of #138 and #139 left Albinya's page reading "low
 * plains characterized by east" with five of its sections in twice.
 */
function merge(path, ours, base, theirs) {
  const byLine = mergeFile(ours, base, theirs, '--diff3', `--marker-size=${MARK}`);
  if (byLine.clean) return byLine.text;
  const out = [];
  let side = null, hunk = null;
  for (const line of byLine.text.toString('utf8').split(/(?<=\n)/)) {
    const bare = line.replace(/\n$/, '');
    if (bare.startsWith(`${'<'.repeat(MARK)} `)) { side = 'ours'; hunk = { ours: '', base: '', theirs: '' }; continue; }
    if (side && bare.startsWith(`${'|'.repeat(MARK)} `)) { side = 'base'; continue; }
    if (side && bare === '='.repeat(MARK)) { side = 'theirs'; continue; }
    if (side && bare.startsWith(`${'>'.repeat(MARK)} `)) { out.push(collide(path, hunk, out.join('').slice(-200))); side = null; continue; }
    if (side) hunk[side] += line; else out.push(line);
  }
  return out.join('');
}

/** How many words two passages differ by: all but the most they share in the same order. */
function apart(a, b) {
  const x = a.split(/\s+/).filter(Boolean), y = b.split(/\s+/).filter(Boolean);
  let row = new Array(y.length + 1).fill(0);
  for (const w of x) {
    const next = [0];
    for (let j = 0; j < y.length; j++) next.push(w === y[j] ? row[j] + 1 : Math.max(row[j + 1], next[j]));
    row = next;
  }
  return x.length + y.length - 2 * row[y.length];
}

/**
 * Paragraphs both sides changed. Where main's lie on the way from the copy the writer
 * opened to what the writer sent, every word main changed is changed the same way in
 * the writer's too: one writer saving a page twice before the first save had landed
 * sends text that already holds it, and theirs stands whole. Otherwise the two go word
 * by word, each word, and each run of space between words, a line of its own to git,
 * JSON-quoted so that a line break inside a run comes back intact.
 */
function collide(path, { ours, base, theirs }, lead) {
  if (apart(base, ours) + apart(ours, theirs) === apart(base, theirs)) return theirs;
  const words = (s) => s.split(/(\s+)/).filter((t) => t !== '').map((t) => JSON.stringify(t)).join('\n') + '\n';
  const byWord = mergeFile(words(ours), words(base), words(theirs), '--diff3');
  const out = [];
  let side = null, hunk = null;
  for (const line of byWord.text.toString('utf8').split('\n')) {
    if (line.startsWith('<<<<<<< ')) { side = 'ours'; hunk = { ours: [], base: [], theirs: [] }; continue; }
    if (line.startsWith('||||||| ') && side) { side = 'base'; continue; }
    if (line === '=======' && side) { side = 'theirs'; continue; }
    if (line.startsWith('>>>>>>> ') && side) { out.push(...settle(path, hunk, [lead, ...out])); side = null; continue; }
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
  if (from) return { ...c, base: blob(from, c.path), from };
  const theirs = c.gone ? null : blob(PR_HEAD, c.path);
  return { ...c, base: theirs && nearest(c.path, theirs) };
});

for (const { path, gone, base, from } of plan) {
  const theirs = gone ? null : blob(PR_HEAD, path);
  const ours = blob(ONTO, path);
  if (theirs === ours) continue;                         // already so on main
  if (PICK.test(path) && theirs) { put(path, bytes(theirs)); continue; }
  // A picture cannot be merged line by line. The gate only lets a new one through,
  // so one already on main that differs is not this pull request's to replace.
  if (path.startsWith('public/assets/') && ours) done(`wait ${path} is already on main`);
  if (ours === base) {                                   // untouched on main since it was opened
    if (theirs) put(path, ours ? bytes(theirs) : credit(path, bytes(theirs))); else git('rm', '-q', '--', path);
    continue;
  }
  // Main has moved since the writer opened it. Deleting a page someone has since
  // edited, or adding one at a name someone has since taken, is theirs to settle.
  if (!base || !theirs || !ours) done(`wait ${path} changed on main since it was opened`);
  // All main gained since was this writer's own earlier saves, and the text sent now
  // holds them: one writer saving a page again before the last save had landed, every
  // save still naming the copy first opened. Merged against that copy, the earlier saves
  // read as someone else's work to keep: a section moved between saves came in twice,
  // and a paragraph edited twice went word by word against itself. The latest stands.
  if (from && ownSaves(path, from) && holds(bytes(ours), bytes(base), bytes(theirs))) { put(path, bytes(theirs)); continue; }
  put(path, merge(path, bytes(ours), bytes(base), bytes(theirs)));
}
done('ready');
