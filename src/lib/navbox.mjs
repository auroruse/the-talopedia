import { navbox as read, nation, url } from './registry.mjs';
import { renderInline, esc, unesc, link, icon, CUSTOM, custom } from './inline.mjs';

/**
 * A navbox entry may be a bare slug, an explicit [[link]], or a nation id.
 * A nation gets its flag, and a nation with a portal is bolded and points there,
 * which is what "bold denotes nations with nation portals" means in practice.
 */
function entry(raw) {
  const s = String(raw);
  if (s.startsWith('[[') || s.startsWith(':') || s.startsWith('**')) return s;
  const n = nation(s);
  if (!n) return `[[${s}]]`;
  // Always the registry's short name: an overview article is titled with the
  // official long form ("People's Republic of Rudania"), which a nation list
  // should not carry.
  const link = n.portal ? `**[[portal:${s}|${n.name}]]**` : `[[${s}|${n.name}]]`;
  return n.flag ? `:flag[${s}] ${link}` : link;
}

const row = (cells) => `<tr>${cells.join('')}</tr>`;

export function renderNavbox(id, fallbackTitle = '') {
  const box = read(id);
  if (!box) return '';
  const body = [];
  for (const g of box.groups) {
    const rows = g.rows || [{ items: g.items }];
    rows.forEach((r, i) => {
      const cells = [];
      if (i === 0 && g.label) {
        cells.push(`<th class="grp" rowspan="${rows.length}">${esc(g.label)}</th>`);
      }
      if (r.note != null) {
        cells.push(`<td class="note" colspan="2">${renderInline(r.note)}</td>`);
      } else {
        if (r.label) cells.push(`<th class="row">${esc(r.label)}</th>`);
        const list = (r.items || []).map(entry).join(' • ');
        cells.push(`<td colspan="${r.label ? 1 : 2}">${renderInline(list)}</td>`);
      }
      body.push(row(cells));
    });
  }
  const crumb = box.crumb ? `<span class="crumb">${renderInline(box.crumb)}</span>` : '';
  // A navbox with no title is headless, for when the surrounding box already names
  // it. Away from that box the caller can supply a title to use instead.
  const title = box.title || fallbackTitle;
  const head = title || box.crumb
    ? `<div class="navbox-head">${esc(title)}${crumb}</div>` : '';
  return `<nav class="navbox">${head}<table class="nb"><tbody>${body.join('')}</tbody></table></nav>`;
}

/**
 * Turns the deferred markers left by the markdown pass into their live form.
 * Runs on every page render, so a renamed title or a changed navbox shows up
 * everywhere at once rather than waiting for each file to be edited.
 */
export function resolveHtml(html = '') {
  return html
    // First, before anything is expanded below. A <figure> written straight into the
    // markdown is raw HTML: Astro never sees its <img> and so never puts the base path
    // on it, which 404s every picture wherever the site is served from a subpath. The
    // navboxes and icons expanded afterwards build their own URLs through url() already,
    // and running this over their output would prefix them a second time.
    .replace(/(<img\b[^>]*?\ssrc=")(\/(?!\/)[^"]*)"/g, (_, head, path) => {
      // A body holds both kinds: a raw <figure> from the markdown, whose path is bare,
      // and an :img[...] token, which was built through url() while the markdown
      // compiled and already carries the base. Prefixing the second one again is how
      // every flag on the front page turned into a broken image.
      const base = url('/').replace(/\/$/, '');
      return `${head}${base && path.startsWith(base + '/') ? path : url(path)}"`;
    })
    .replace(/<a data-wl="([^"]+)"(?: data-d="([^"]*)")?><\/a>/g,
      (_, slug, d) => link(unesc(slug), d === undefined ? undefined : unesc(d)))
    .replace(/<i data-ico="([^"]+)"><\/i>/g, (_, slug) => icon(unesc(slug)))
    // A raw <table> or <figcaption> written into the markdown is an HTML block, and
    // the markdown parser never looks inside one, so any [[link]] or :img[] in there
    // would print as itself. Nothing that came through the parser still carries this
    // syntax by now, so a pass over the finished HTML only catches those blocks.
    .replace(CUSTOM, (...m) => custom(m, false))
    // Emphasis in those same blocks, and only in those: a cell rendered from a
    // markdown table already holds finished HTML and has no marks left to convert,
    // so this cannot reach it, and prose is left to the markdown parser.
    .replace(/<(td|th|figcaption)\b([^>]*)>([\s\S]*?)<\/\1>/g, (_, tag, attrs, inner) =>
      `<${tag}${attrs}>${inner
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')}</${tag}>`)
    // A data table wider than the column scrolls inside its own box, where it would
    // otherwise push the whole page sideways. The table itself is left as it was, so
    // one that fits looks exactly like a plain table.
    .replace(/<table class="sortable">[\s\S]*?<\/table>/g, (t) => `<div class="dt-box">${t}</div>`);
}
