// Data tables: clicking a header cell sorts the rows by that column, ascending, then
// descending, then back to the order they were written in, as Wikipedia's sortable
// tables do. Values sort the way Google Sheets sorts them: numbers and dates by value,
// text alphabetically with any numbers inside it read as numbers, and blank cells last
// whichever way the column runs.

const MONTHS = 'jan feb mar apr may jun jul aug sep oct nov dec'.split(' ');
const ISO = /^(\d{4})-(\d{2})-(\d{2})/;
const MONTH_FIRST = /^([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{1,4})\b/i;   // June 9, 1888
const DAY_FIRST = /^(\d{1,2})\s+([a-z]{3})[a-z]*\.?,?\s+(\d{1,4})\b/i;      // 9 June 1888
const NUMBER = /^[$€£¥₩]?\s*([-−+]?\d[\d,]*(?:\.\d+)?)/;
const text = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

// A date sorts as a year with the day as its fraction, so it falls in with plain years.
const asYear = (y, m, d) => y + (m * 31 + d) / 400;

/** What a cell sorts by: [0, number] for a number or date, [1, text], or [2] when blank. */
function keyOf(cell) {
  const t = (cell?.textContent || '').replace(/\s+/g, ' ').trim();
  if (!t) return [2];
  let m;
  if ((m = t.match(ISO))) return [0, asYear(+m[1], +m[2] - 1, +m[3])];
  if ((m = t.match(MONTH_FIRST)) && MONTHS.includes(m[1].toLowerCase())) {
    return [0, asYear(+m[3], MONTHS.indexOf(m[1].toLowerCase()), +m[2])];
  }
  if ((m = t.match(DAY_FIRST)) && MONTHS.includes(m[2].toLowerCase())) {
    return [0, asYear(+m[3], MONTHS.indexOf(m[2].toLowerCase()), +m[1])];
  }
  if ((m = t.match(NUMBER))) return [0, parseFloat(m[1].replace(/,/g, '').replace('−', '-'))];
  return [1, t];
}

/** Numbers before text going up, text before numbers coming down; blanks always last. */
function compare(a, b, dir) {
  if (a[0] === 2 || b[0] === 2) return (a[0] === 2) - (b[0] === 2);
  if (a[0] !== b[0]) return (a[0] - b[0]) * dir;
  return (a[0] === 0 ? a[1] - b[1] : text.compare(a[1], b[1])) * dir;
}

for (const table of document.querySelectorAll('table.sortable')) {
  const rows = [...table.rows];
  // The header is the run of rows made only of header cells; the last of them sorts.
  let h = 0;
  while (h < rows.length && [...rows[h].cells].every((c) => c.tagName === 'TH')) h++;
  const head = rows[h - 1], body = rows.slice(h);
  // A merged cell belongs to no one column, so a table with one is left as written.
  const merged = (r) => [...r.cells].some((c) => c.colSpan > 1 || c.rowSpan > 1);
  if (!head || !body.length || merged(head) || body.some(merged)) continue;

  const written = body.slice();
  const keys = [...head.cells].map((_, col) => new Map(written.map((r) => [r, keyOf(r.cells[col])])));
  [...head.cells].forEach((th, col) => {
    th.classList.add('sort-key');
    th.tabIndex = 0;
    const sort = () => {
      const now = th.getAttribute('aria-sort');
      const next = now === 'ascending' ? 'descending' : now === 'descending' ? null : 'ascending';
      for (const x of head.cells) x.removeAttribute('aria-sort');
      if (next) th.setAttribute('aria-sort', next);
      const dir = next === 'descending' ? -1 : 1;
      const order = next ? written.slice().sort((a, b) => compare(keys[col].get(a), keys[col].get(b), dir)) : written;
      body[0].parentElement.append(...order);
    };
    th.addEventListener('click', (e) => { if (!e.target.closest('a')) sort(); });
    th.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sort(); }
    });
  });
}
