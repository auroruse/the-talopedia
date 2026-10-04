// Opens a page in headless Chrome, waits in real time for #undo-results, and prints it.
// The editor keeps drafts in IndexedDB, which never answers under --virtual-time-budget:
// the clock runs out with the store still opening. So the run takes as long as it takes.
//
//   node scripts/editor-run.mjs <url>
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9399;
const profile = mkdtempSync(join(tmpdir(), 'editor-run-'));
const chrome = spawn(CHROME, ['--headless', '--disable-gpu', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let targets;
for (let i = 0; i < 100 && !targets; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); } catch { await sleep(100); }
}
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const waiting = new Map(), thrown = [];
ws.addEventListener('message', (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); }
  if (msg.method === 'Runtime.exceptionThrown') {
    thrown.push(msg.params.exceptionDetails.exception?.description?.split('\n')[0] ?? 'an exception');
  }
});
const send = (method, params = {}) => new Promise((res) => {
  const n = ++id; waiting.set(n, res); ws.send(JSON.stringify({ id: n, method, params }));
});

let out = null;
try {
  await send('Runtime.enable');
  await send('Page.navigate', { url: process.argv[2] });
  for (let t = Date.now(); out == null && Date.now() - t < 180000;) {
    await sleep(500);
    out = (await send('Runtime.evaluate', { returnByValue: true,
      expression: `document.getElementById('undo-results')?.textContent ?? null` })).result.result.value;
  }
} finally {
  ws.close();
  chrome.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}
// An exception thrown by the test itself, before it could write its results, is the
// one thing worth printing when there are none.
console.log(out ?? `FAIL no results in three minutes${thrown.length ? `: ${thrown[0]}` : ''}`);
