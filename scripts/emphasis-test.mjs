// What src/lib/emphasis.mjs has to fix, and what it has to leave alone.
//
//   node scripts/emphasis-test.mjs
import { fixEmphasis } from '../src/lib/emphasis.mjs';

const NBSP = ' ';
const fixes = [
  ['The **Crimson-Red Calamity **was', 'The **Crimson-Red Calamity** was'],
  ['The ** Crimson** was', 'The **Crimson** was'],
  ['ends in **Name **', 'ends in **Name**'],
  ['**Testland ** is', '**Testland** is'],
  [`league in${NBSP}**[[karjania]]**`, `league in${NBSP}**[[karjania]]**`],
  [`**in${NBSP}**[[karjania]]`, '**in** [[karjania]]'],
  ['an *italic *word', 'an *italic* word'],
  ['*Main articles:* [[a]]*, *[[b]]', '*Main articles:* [[a]], [[b]]'],
  ['his words, *“so it goes.”*It was', 'his words, *“so it goes.”* It was'],
  ['word**“quote”**', 'word **“quote”**'],
  ['- **Bold **item', '- **Bold** item'],
  ['* **Bold **item', '* **Bold** item'],
  ['  - *it *x', '  - *it* x'],
  ['| **8-2 **Nichirin | x |', '| **8-2** Nichirin | x |'],
  ['**a **and **b**', '**a** and **b**'],
];
const alone = [
  '2 * 3 * 4',
  '* * *',
  'a lone * asterisk',
  'In code, `a ** b **` stays.',
  '[link](https://x.org/a**b **c) and text',
  '\\*\\*not bold \\*\\*',
  '***bold italic ***',
  '**Bold** and *it* and **“q”**, (**x**)',
  '<figure><img src="/a.png" alt="**x **"><figcaption>ok</figcaption></figure>',
  '1934* | * Estimated',
];
const docs = [
  // Frontmatter is left to its own renderer; only the body is fixed.
  ['---\ntitle: "**T **"\n---\n\n**B **x\n', '---\ntitle: "**T **"\n---\n\n**B** x\n'],
  ['```\n**a **\n```\n**b **c', '```\n**a **\n```\n**b** c'],
];

let fail = 0;
const check = (label, got, want) => {
  const good = got === want && fixEmphasis(got) === got;   // and a second pass changes nothing
  if (!good) { fail = 1; console.log(`FAIL  ${label}\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`); }
  else console.log(`ok    ${label}`);
};
for (const [a, b] of fixes) check(a, fixEmphasis(a), b);
for (const a of alone) check(`leaves ${a}`, fixEmphasis(a), a);
for (const [a, b] of docs) check(JSON.stringify(a), fixEmphasis(a), b);
process.exit(fail);
