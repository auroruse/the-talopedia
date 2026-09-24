// Data tables: clicking a header cell sorts the rows by that column, ascending, then
// descending, then back to the order they were written in, as Wikipedia's sortable
// tables do. What each cell sorts by is worked out in sort-key.mjs.
import { keyOf, compare } from './sort-key.mjs';

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
  const keys = [...head.cells].map((_, col) => new Map(written.map((r) => [r, keyOf(r.cells[col]?.textContent)])));
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
