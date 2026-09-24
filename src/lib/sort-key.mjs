/**
 * What a data table's cell sorts by, shared by the page script that sorts the table and
 * the build, which centres the columns that hold figures. Values sort the way Google
 * Sheets sorts them: numbers and dates by value, text alphabetically with any numbers
 * inside it read as numbers, and blank cells last whichever way the column runs.
 */

const MONTHS = 'jan feb mar apr may jun jul aug sep oct nov dec'.split(' ');
const ISO = /^(\d{4})-(\d{2})-(\d{2})/;
const MONTH_FIRST = /^([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{1,4})\b/i;   // June 9, 1888
const DAY_FIRST = /^(\d{1,2})\s+([a-z]{3})[a-z]*\.?,?\s+(\d{1,4})\b/i;      // 9 June 1888
const NUMBER = /^[$€£¥₩]?\s*([-−+]?\d[\d,]*(?:\.\d+)?)/;
const text = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

// A date sorts as a year with the day as its fraction, so it falls in with plain years.
const asYear = (y, m, d) => y + (m * 31 + d) / 400;

/** What a cell's text sorts by: [0, number] for a number or date, [1, text], or [2] when blank. */
export function keyOf(raw) {
  const t = (raw || '').replace(/\s+/g, ' ').trim();
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
export function compare(a, b, dir) {
  if (a[0] === 2 || b[0] === 2) return (a[0] === 2) - (b[0] === 2);
  if (a[0] !== b[0]) return (a[0] - b[0]) * dir;
  return (a[0] === 0 ? a[1] - b[1] : text.compare(a[1], b[1])) * dir;
}
