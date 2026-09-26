// Drives the built editor headless: types, pauses, moves between boxes and pages,
// undoes and redoes, and writes a pass/fail list into #undo-results. Run through
// scripts/editor-undo-test.sh.
(async () => {
  const out = [];
  const ok = (name, cond, got) => out.push(`${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : `  got ${JSON.stringify(got)}`}`);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s) => document.querySelector(s);
  const paras = () => [...document.querySelectorAll('#body .ce')];
  const txt = (i = 0) => paras()[i]?.textContent.replace(/\u00a0/g, ' ');
  const click = (el) => el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  const focusEnd = (el) => {
    click(el);
    el.focus();
    const r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  };
  const type = (text) => { for (const ch of text) document.execCommand('insertText', false, ch); };
  /**
   * File > Open, and wait until the editor says it has opened the file. The run's clock is
   * virtual and races ahead of a real read, so a fixed wait could end before the file was in;
   * reading the same file here first lets real time pass for the editor's read to land.
   */
  const openFile = async (md, name) => {
    const f = new File([md], name);
    const dt = new DataTransfer();
    dt.items.add(f);
    $('#open-file-input').files = dt.files;
    $('#open-file-input').dispatchEvent(new Event('change'));
    await f.text();
    for (let i = 0; i < 200 && !$('#status').textContent.includes(name); i++) await sleep(20);
    await sleep(200);
  };
  const undo = () => $('#undo').click();
  const redo = () => $('#redo').click();
  const caret = () => {
    const s = getSelection();
    if (!s.rangeCount) return null;
    const n = s.focusNode;
    const box = (n.nodeType === 1 ? n : n.parentElement).closest('[contenteditable="true"]');
    const r = document.createRange(); r.selectNodeContents(box); r.setEnd(n, s.focusOffset);
    return { box, at: r.toString().length };
  };
  window.confirm = () => true;
  try {
    await sleep(1500);

    // A word at a time.
    focusEnd(paras()[0]);
    type('hello world again');
    ok('typed a sentence', txt() === 'hello world again', txt());
    undo();
    ok('undo takes the last word only', txt() === 'hello world ', txt());
    const c1 = caret();
    ok('caret lands where that word was', c1?.box === paras()[0] && c1?.at === 12, c1?.at);
    undo();
    ok('the next undo takes the word before, keeping its space', txt() === 'hello ', txt());
    redo();
    ok('redo puts it back', txt() === 'hello world ', txt());
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', ctrlKey: true, bubbles: true }));
    ok('ctrl+y redoes', txt() === 'hello world again', txt());
    const c2 = caret();
    ok('redo leaves the caret at the end of what came back', c2?.at === 17, c2?.at);

    // Typing straight after an undo keeps the state it undid to.
    undo();
    type('there');
    ok('typing after undo keeps the space', txt() === 'hello world there', txt());
    ok('and it is saved as an ordinary space', $('#preview').textContent.includes('hello world there') && !$('#preview').textContent.includes('\u00a0'), $('#preview').textContent.slice(-40));
    undo();
    ok('undo after that returns to the undone-to state', txt() === 'hello world ', txt());

    // A pause ends a step, even mid-word.
    focusEnd(paras()[0]);
    type('ab'); await sleep(1300); type('cd');
    undo();
    ok('a pause splits a step', txt() === 'hello world ab', txt());

    // Another box is another step, and undo goes there.
    focusEnd(paras()[0]);
    paras()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await sleep(50);
    const second = paras()[1];
    ok('enter made a second paragraph', !!second, paras().length);
    focusEnd(second);
    type('second');
    focusEnd(paras()[0]);
    type('X');
    undo();
    ok('undo in the first box takes only X', txt(0) === 'hello world ab' && txt(1) === 'second', [txt(0), txt(1)]);
    undo();
    ok('then the second box', txt(1) === '', txt(1));
    const c3 = caret();
    ok('caret moved to the second box', c3?.box === paras()[1], c3 && paras().indexOf(c3.box));
    undo();
    ok('then the new paragraph itself', paras().length === 1, paras().length);

    // A sidebar cell is a step of its own.
    const cell = [...document.querySelectorAll('.ib-edit td .ce')][0];
    const cellWas = cell.textContent;
    focusEnd(cell);
    type('Tokyo');
    focusEnd(paras()[0]);
    type('Y');
    undo(); undo();
    const cellNow = [...document.querySelectorAll('.ib-edit td .ce')][0].textContent;
    ok('undo reaches back into the sidebar, one step each', cellNow === cellWas && txt() === 'hello world ab', [cellNow, cellWas, txt()]);

    // A link added mid-sentence leaves ordinary spaces either side, so the words
    // around it still wrap one at a time.
    focusEnd(paras()[0]);
    paras()[0].textContent = '';
    type('The quick brown fox jumps over the lazy dog.');
    const tn = paras()[0].firstChild;
    const at = tn.nodeValue.indexOf('brown');
    const sr = document.createRange(); sr.setStart(tn, at); sr.setEnd(tn, at + 9);
    getSelection().removeAllRanges(); getSelection().addRange(sr);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
    $('#lp-target').value = 'brown-fox';
    $('#lp-apply').click();
    const linked = paras()[0];
    ok('link inserted', !!linked.querySelector('a[data-slug="brown-fox"]'), linked.innerHTML);
    ok('no glued spaces around the link', !linked.innerHTML.includes('&nbsp;') && !linked.textContent.includes('\u00a0'), linked.innerHTML);

    // An empty table cell takes the caret where it is clicked. With no height it was
    // no place for one, so the click, and the typing, went to the cell beside it.
    focusEnd(paras()[0]);
    document.querySelector('.tbl-cell[data-r="3"][data-c="2"]').click();
    await sleep(100);
    const cellBox = (r, c) => [...document.querySelectorAll('.ed-tbl tr')][r].querySelectorAll('td, th')[c].querySelector('.ce');
    const blankCell = cellBox(1, 0);
    ok('an empty cell is a line tall', blankCell.getBoundingClientRect().height > 10, blankCell.getBoundingClientRect().height);
    blankCell.scrollIntoView({ block: 'center' });
    const rc = blankCell.closest('td').getBoundingClientRect();
    // Where a click in the middle of the cell puts the caret, then typing there. The
    // hit test alone reports the right cell even when the bug is live; it is the
    // typing that shows where the caret really was.
    const hit = document.caretRangeFromPoint(rc.left + rc.width / 2, rc.top + rc.height / 2);
    getSelection().removeAllRanges(); getSelection().addRange(hit);
    document.execCommand('insertText', false, 'Club');
    const rowText = [...blankCell.closest('tr').querySelectorAll('td:not(.row-x)')].map((c) => c.textContent);
    ok('typing where it was clicked goes into it', rowText[0] === 'Club' && rowText[1] === '', rowText);
    blankCell.textContent = '';
    // What a cell holds once its last letter is deleted is a lone <br>: a blank cell.
    blankCell.innerHTML = '<br>';
    blankCell.dispatchEvent(new Event('input', { bubbles: true }));
    const tableMd = $('#preview').textContent.split('\n').filter((l) => l.startsWith('|'));
    ok('a cell emptied by deleting saves blank', tableMd.length > 0 && !tableMd.join('\n').includes('<br>'), tableMd);

    // Tables, edited the way Google Docs edits them.
    const T = () => document.querySelector('.ed-tbl');
    const rowsT = () => [...T().tBodies[0].rows];
    const cellT = (r, c) => rowsT()[r].querySelectorAll('td, th')[c];
    const widthT = () => Math.max(...rowsT().map((tr) => [...tr.children].reduce((w, td) => w + (td.colSpan || 1), 0)));
    const where = () => {
      const n = getSelection().focusNode, e = n?.nodeType === 1 ? n : n?.parentElement, td = e?.closest('td, th');
      return td && T()?.contains(td) ? `${rowsT().indexOf(td.parentElement)},${[...td.parentElement.children].indexOf(td)}` : 'out';
    };
    const key = (k, extra = {}) => {
      const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra });
      (getSelection().focusNode?.parentElement || T()).dispatchEvent(ev);
      return ev.defaultPrevented;
    };
    const into = (r, c, end = true) => {
      T().focus();
      const g = document.createRange(); g.selectNodeContents(cellT(r, c).querySelector('.ce')); g.collapse(!end);
      getSelection().removeAllRanges(); getSelection().addRange(g);
    };
    const menu = (r, c) => {
      const td = cellT(r, c), b = td.getBoundingClientRect();
      td.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: b.left + 5, clientY: b.top + 5 }));
      return [...document.querySelectorAll('.point-menu button')];
    };
    const choose = (r, c, label) => {
      const b = menu(r, c).find((x) => x.textContent === label);
      if (!b || b.disabled) return false;
      b.click();
      return true;
    };
    ok('no delete-row column and no button bar', !T().querySelector('.row-x, button') && !document.querySelector('.tbl-bar'), T().innerHTML.slice(0, 80));
    into(1, 0); key('Tab');
    ok('Tab goes to the next cell', where() === '1,1', where());
    key('Tab');
    ok('and on to the next row', where() === '2,0', where());
    key('Tab', { shiftKey: true });
    ok('Shift+Tab goes back', where() === '1,1', where());
    const rowsBefore = rowsT().length;
    into(rowsBefore - 1, 1); key('Tab');
    ok('Tab from the last cell adds a row', rowsT().length === rowsBefore + 1 && where() === `${rowsBefore},0`, [rowsT().length, where()]);
    into(1, 0); document.execCommand('insertText', false, 'ab');
    into(1, 0, true); key('ArrowRight');
    ok('Right at the end of a cell goes to the next', where() === '1,1', where());
    into(1, 1, false); key('ArrowLeft');
    ok('Left at the start of a cell goes back', where() === '1,0', where());
    into(1, 0); key('ArrowDown');
    ok('Down goes to the cell below', where() === '2,0', where());
    key('ArrowUp');
    ok('Up comes back', where() === '1,0', where());
    into(0, 0); key('ArrowUp');
    ok('Up from the top row leaves the table', where() === 'out', where());
    into(rowsT().length - 1, 0); key('ArrowDown');
    ok('Down from the bottom row leaves it too', where() === 'out' && !!T().closest('[data-kind]').nextElementSibling, where());
    const cellsBefore = T().querySelectorAll('td, th').length;
    into(1, 1, false);
    ok('Backspace at the start of a cell leaves the table whole', key('Backspace') && T().querySelectorAll('td, th').length === cellsBefore, T().querySelectorAll('td, th').length);
    const items = menu(1, 0).map((b) => b.textContent);
    ok('right-click has the Google Docs items', ['Insert row above', 'Insert row below', 'Insert column left', 'Insert column right', 'Delete row', 'Delete column', 'Delete table', 'Merge cells', 'Unmerge cells'].every((x) => items.includes(x)), items);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    const w0 = widthT(), r0 = rowsT().length;
    choose(1, 0, 'Insert column right');
    ok('insert column right', widthT() === w0 + 1 && where() === '1,1', [widthT(), where()]);
    choose(1, 1, 'Delete column');
    ok('delete column', widthT() === w0, widthT());
    choose(1, 0, 'Insert row above');
    ok('insert row above', rowsT().length === r0 + 1 && where() === '1,0', [rowsT().length, where()]);
    choose(1, 0, 'Delete row');
    ok('delete row', rowsT().length === r0 && cellT(1, 0).textContent === 'ab', [rowsT().length, cellT(1, 0).textContent]);
    cellT(1, 0).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    cellT(2, 1).dispatchEvent(new MouseEvent('mouseover', { bubbles: true, buttons: 1 }));
    ok('dragging across cells selects them whole', T().querySelectorAll('.cell-sel').length === 4, T().querySelectorAll('.cell-sel').length);
    ok('merge cells', choose(2, 1, 'Merge cells') && cellT(1, 0).colSpan === 2 && cellT(1, 0).rowSpan === 2, [cellT(1, 0).colSpan, cellT(1, 0).rowSpan]);
    ok('saved as a merged cell', /rowspan="2"/.test($('#preview').textContent) && /colspan="2"/.test($('#preview').textContent), ($('#preview').textContent.match(/<td[^>]*span[^>]*>/) || [''])[0]);
    ok('unmerge cells', choose(1, 0, 'Unmerge cells') && cellT(1, 0).colSpan === 1 && widthT() === w0 && rowsT().every((tr) => tr.children.length === w0), rowsT().map((tr) => tr.children.length));
    into(1, 0, true); key('ArrowRight', { shiftKey: true });
    ok('Shift+Right at a cell edge selects whole cells', T().querySelectorAll('.cell-sel').length === 2, T().querySelectorAll('.cell-sel').length);
    key('x');
    ok('typing over them empties them and starts in the first', cellT(1, 0).textContent === 'x' && cellT(1, 1).textContent === '' && !T().querySelector('.cell-sel'), [cellT(1, 0).textContent, cellT(1, 1).textContent]);
    ok('make header row', choose(2, 0, 'Make header row') && [...rowsT()[2].children].every((td) => td.tagName === 'TH'), rowsT()[2].children[0].tagName);
    choose(1, 0, 'Delete table');
    ok('delete table', !document.querySelector('.ed-tbl'), !!document.querySelector('.ed-tbl'));

    // Lists, the Google Docs way.
    const L = () => [...document.querySelectorAll('.ce-list')].at(-1);
    const lis = () => [...L().children];
    const liText = (i) => lis()[i].querySelector('.ce').textContent;
    const liLvl = (i) => +lis()[i].dataset.level || 0;
    const inLi = () => {
      const n = getSelection().focusNode, e = n?.nodeType === 1 ? n : n?.parentElement, li = e?.closest('.ce-list li');
      return li && L().contains(li) ? lis().indexOf(li) : -1;
    };
    const press = (k, extra = {}) => {
      const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra });
      document.activeElement.dispatchEvent(ev);
      return ev.defaultPrevented;
    };
    const caretAt = (i, end = true, offset = null) => {
      const box = lis()[i].querySelector('.ce'); box.focus();
      const r = document.createRange();
      if (offset != null) r.setStart(box.firstChild, offset); else r.selectNodeContents(box);
      r.collapse(offset != null ? true : !end);
      getSelection().removeAllRanges(); getSelection().addRange(r);
    };
    const mdNow = () => $('#preview').textContent;
    focusEnd(paras()[0]);
    document.querySelector('[data-add="list"]').click();
    await sleep(50);
    type('one'); press('Enter'); type('two');
    ok('Enter makes the next item', lis().length === 2 && liText(1) === 'two' && inLi() === 1, lis().map((li) => li.textContent));
    press('Tab');
    ok('Tab nests it', liLvl(1) === 1, liLvl(1));
    ok('saved as a nested list', mdNow().includes('- one\n  - two'), (mdNow().match(/- one[\s\S]{0,20}/) || [''])[0]);
    press('Tab', { shiftKey: true });
    ok('Shift+Tab brings it back out', liLvl(1) === 0, liLvl(1));
    caretAt(0); press('Tab');
    ok('the first item cannot nest under nothing', liLvl(0) === 0, liLvl(0));
    caretAt(1); press('Tab');
    press('Enter', { shiftKey: true }); type('more');
    ok('Shift+Enter is a new line in the same item', lis().length === 2 && !!lis()[1].querySelector('.ce br'), lis().map((li) => li.querySelector('.ce').innerHTML));
    ok('saved as a line break inside the item', mdNow().includes('  - two<br>more'), (mdNow().match(/- two[\s\S]{0,20}/) || [''])[0]);
    caretAt(0, true, 1); press('Enter');
    ok('Enter mid-item splits it at the caret', liText(0) === 'o' && liText(1) === 'ne' && inLi() === 1, lis().map((li) => li.textContent));
    caretAt(1, false); press('Backspace');
    ok('Backspace at an item start joins it to the one above', lis().length === 2 && liText(0) === 'one', lis().map((li) => li.textContent));
    caretAt(1, false); press('Backspace');
    ok('Backspace at a nested item start brings it out a level', liLvl(1) === 0 && lis().length === 2, liLvl(1));
    caretAt(1, true); press('Tab'); press('Enter');
    ok('Enter at the end starts an empty item at the same level', lis().length === 3 && liLvl(2) === 1 && liText(2) === '', [lis().length, liLvl(2)]);
    press('Enter');
    ok('Enter on an empty nested item climbs out a level', lis().length === 3 && liLvl(2) === 0, [lis().length, liLvl(2)]);
    press('Enter');
    ok('and on an empty top-level item leaves the list', lis().length === 2 && document.activeElement.closest('[data-kind]')?.dataset.kind === 'para', [lis().length, document.activeElement.closest('[data-kind]')?.dataset.kind]);
    caretAt(0, true); press('ArrowDown');
    ok('Down goes to the next item', inLi() === 1, inLi());
    press('ArrowUp');
    ok('Up comes back', inLi() === 0, inLi());
    caretAt(0, false); press('ArrowLeft');
    ok('Left at the first item goes to the paragraph above', inLi() === -1 && document.activeElement.closest('[data-kind]')?.dataset.kind === 'para', document.activeElement.closest('[data-kind]')?.dataset.kind);
    caretAt(1); press('Tab', { shiftKey: true }); press('Tab'); await sleep(1100); undo();
    ok('undo takes a nesting back', liLvl(1) === 0, liLvl(1));
    redo();
    ok('and redo keeps it', liLvl(1) === 1, liLvl(1));

    // The medals sit in their own icons group, first after the arrows, and go in
    // without the white edge a flag gets.
    await new Promise((r) => setTimeout(r, 300));
    const groups = [...document.querySelectorAll('#mp-icons .mp-group')].map((g) => g.textContent);
    const medals = [...document.querySelectorAll('#mp-icons .mp-icon')].filter((b) => /\/assets\/icons\//.test(b.title));
    ok('an icons group with the three medals, after the arrows', groups[0] === 'arrows' && groups[1] === 'icons' && medals.length === 3, [groups.slice(0, 3), medals.length]);
    focusEnd(paras()[0]);
    medals.find((b) => /gold-medal/.test(b.title)).click();
    const medal = paras()[0].querySelector('img[data-slug*="gold-medal"]');
    ok('a medal goes in as an icon, without the flag border', !!medal && medal.classList.contains('sym') && getComputedStyle(medal).borderTopWidth === '0px', medal && [medal.className, getComputedStyle(medal).borderTopWidth]);
    ok('and is saved as :img', $('#preview').textContent.includes(':img[/assets/icons/gold-medal.webp]'), $('#preview').textContent.slice(-60));

    // An imgbb page link is caught before it goes in; the picture's own link is not.
    const note = () => { $('#mp-link').dispatchEvent(new Event('input')); return $('#mp-link-note').textContent; };
    $('#mp-link').value = 'https://ibb.co/hRCMF21d';
    ok('an imgbb page link is refused, pointing at the direct link', /page for the picture/.test(note()) && /i\.ibb\.co/.test(note()), note());
    $('#mp-link').value = 'https://i.ibb.co/QFXcvYjH/Shushestan-flag.png';
    ok("the picture's own link passes", !/page for the picture|not on the list/.test(note()), note());
    $('#mp-link').value = '';

    // Bold that took its trailing space along is saved with the space outside the
    // marks; **word ** does not close, and printed on the page as it stands.
    focusEnd(paras()[0]);
    paras()[0].innerHTML = 'nicknamed the <b>Crimson-Red Calamity </b>(x), <i>Main article: </i>y<i>, </i>z';
    paras()[0].dispatchEvent(new Event('input', { bubbles: true }));
    const saved = $('#preview').textContent;
    ok('bold with a trailing space is saved so it closes', saved.includes('**Crimson-Red Calamity** (x)'), (saved.match(/nicknamed[^\n]*/) || [''])[0]);
    ok('italic too, and marks around a lone comma dropped', saved.includes('*Main article:* y, z'), (saved.match(/nicknamed[^\n]*/) || [''])[0]);

    // A new page cannot be undone into the old one.
    $('#new').click();
    await sleep(50);
    ok('new page: nothing to undo', $('#undo').disabled === true, $('#undo').disabled);
    focusEnd(paras()[0]);
    type('fresh');
    undo(); undo(); undo();
    ok('undo stops at the new page', txt() === '' && !document.body.textContent.includes('hello world'), txt());

    // An arrow straight before a digit (:down1) is an arrow, before and after an undo.
    $('#file-q').value = 'nichirin national football';
    $('#file-q').dispatchEvent(new Event('input'));
    [...document.querySelectorAll('#file-list button')].find((b) => /Nichirin national football team/i.test(b.textContent)).click();
    await sleep(800);
    const rankCell = () => [...document.querySelectorAll('.ib-edit tr')].find((tr) => /Current \(1934\)/.test(tr.textContent))?.querySelector('td .ce');
    ok('opened with the ranking arrow as an arrow', rankCell()?.querySelector('[data-tok="down"]') && !rankCell().textContent.includes(':down'), rankCell()?.innerHTML);
    focusEnd(paras()[0]);
    type(' zz');
    undo();
    ok('still an arrow after undo', rankCell()?.querySelector('[data-tok="down"]') && !rankCell().textContent.includes(':down'), rankCell()?.innerHTML);
    ok('and saved as :down1', $('#preview').textContent.includes('3 (:down1)'), ($('#preview').textContent.match(/Current \(1934\).*/) || [''])[0]);
    const barcino = document.querySelector('a[data-slug="fc-barcino"]');
    ok('a page nobody has written yet keeps its initials', barcino?.textContent === 'FC Barcino', barcino?.textContent);
    ok('and its link is saved bare', $('#preview').textContent.includes('[[fc-barcino]]'), ($('#preview').textContent.match(/.*barcino.*/i) || [''])[0].slice(-80));

    // Asterisks typed by hand with the space inside would print on the page.
    focusEnd(paras()[0]);
    type(' **Calamity **then');
    ok('bold typed with a space inside is written closed', $('#preview').textContent.includes(' **Calamity** then'), ($('#preview').textContent.match(/.*Calamity.*/) || [''])[0].slice(-60));

    // Date panel: Age asks for Born, and Died only if dead.
    document.querySelector('#dt-mode button[data-mode="age"]').click();
    ok('age relabels the date as Born', $('#dt-date-label').textContent === 'Born', $('#dt-date-label').textContent);
    ok('died shows, marked optional', !$('#dt-died-row').hidden && /optional/.test($('#dt-died-row').textContent), $('#dt-died-row').hidden);
    $('#dt-date').value = '1888-06-09'; $('#dt-date').dispatchEvent(new Event('input'));
    ok('born only: age now', /^June 9, 1888 \(aged \d+\)$/.test($('#dt-preview').textContent), $('#dt-preview').textContent);
    $('#dt-died').value = '1933-05-11'; $('#dt-died').dispatchEvent(new Event('input'));
    ok('with died: that date, age at death', $('#dt-preview').textContent === 'May 11, 1933 (aged 44)', $('#dt-preview').textContent);
    document.querySelector('#dt-mode button[data-mode=""]').click();
    ok('plain puts the label back and hides died', $('#dt-date-label').textContent === 'Date' && $('#dt-died-row').hidden, $('#dt-date-label').textContent);

    // A type split out of Organizations brings its own sidebar.
    $('#f-type').value = 'national-team';
    $('#f-type').dispatchEvent(new Event('change'));
    const rows = [...document.querySelectorAll('.ib-edit tr[data-kind]')];
    const labels = rows.map((tr) => tr.dataset.kind === 'section' ? `§${tr.querySelector('.ce')?.textContent.trim()}` : tr.dataset.kind === 'full' ? '[value]'
      : tr.dataset.kind === 'row' ? tr.querySelector('.ce')?.textContent.trim() : `[${tr.dataset.kind}]`);
    ok('national team sidebar comes from the Nichirin team', labels.includes('AFA Code') && labels.includes('§Biggest Win')
      && labels[labels.indexOf('§Biggest Win') + 1] === '[value]', labels.join(' | '));

    // Any sidebar cell nests: its lines go under one another, drawn as the page draws them.
    const fieldRow = document.querySelector('.ib-edit tr[data-kind="row"]');
    fieldRow.querySelector('.ctl-add > button').click();
    ok('the + menu no longer has a Nested List row of its own',
      ![...fieldRow.querySelectorAll('.ctl-menu button')].some((b) => b.textContent === 'Nested List'), '');
    fieldRow.querySelector('.ctl-add > button').click();
    const [nLabel, nBox] = fieldRow.querySelectorAll('.ce');
    const depthButton = fieldRow.querySelector('button[data-nest="depth"]');
    const guidesButton = fieldRow.querySelector('button[data-nest="guides"]');
    ok('its depth and guide switches wait until something nests', depthButton?.hidden === true && guidesButton?.hidden === true, depthButton?.hidden);
    nLabel.textContent = 'Battles/wars';
    nBox.innerHTML = [[0, 'The Great War'], [1, 'Valtherian Front'], [2, 'Test'], [2, 'Test'], [2, 'Test'], [1, '']]
      .map(([l, t]) => `<div data-level="${l}">${t || '<br>'}</div>`).join('');
    nBox.dispatchEvent(new Event('input', { bubbles: true }));
    ok('and show once it does', depthButton.hidden === false && guidesButton.hidden === false, depthButton.hidden);
    const joints = [...nBox.children].map((d) => d.dataset.joint || '-').join(' ');
    ok('siblings join, the last turns the corner, an empty line draws nothing', joints === '- last more more last -', joints);
    const runs = [...nBox.children].map((d) => d.style.backgroundPosition || '-').join(' | ');
    ok('and a level still open runs past the lines under it', runs === '- | - | - | - | - | -', runs);
    nBox.innerHTML = [[0, 'World War II'], [1, 'North African campaign'], [2, 'Operation Torch'], [1, 'Italian campaign']]
      .map(([l, t]) => `<div data-level="${l}">${t}</div>`).join('');
    nBox.dispatchEvent(new Event('input', { bubbles: true }));
    const runs2 = [...nBox.children].map((d) => (d.dataset.joint || '-') + ' ' + (d.style.backgroundPosition || '-')).join(' | ');
    ok('a campaign with a battle under it keeps its line going to the next campaign', runs2 === '- - | more - | last 10px 0px | last -', runs2);
    nBox.innerHTML = ['World War II', 'North African campaign', 'Operation Torch', 'Battle of Port Lyautey']
      .map((t, i) => `<div data-level="${i}">${t}</div>`).join('');
    nBox.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(100);
    const treeOf = () => ($('#preview').textContent.match(/label: "Battles\/wars"\n[\s\S]*?(?=\n  - |\n---)/) || [''])[0];
    ok('it saves a level as two spaces, and the row its settings', treeOf().includes('value:\n      - "World War II"\n'
      + '      - "  North African campaign"\n      - "    Operation Torch"\n      - "      Battle of Port Lyautey"\n    depth: 3\n    guides: true'), treeOf());
    const lineOf = (text) => [...nBox.children].find((d) => d.textContent === text);
    const caretAtEnd = (node) => {
      const r = document.createRange(); r.selectNodeContents(node); r.collapse(false);
      getSelection().removeAllRanges(); getSelection().addRange(r);
    };
    const nlKey = (k, shiftKey = false) =>
      nBox.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, cancelable: true }));
    caretAtEnd(lineOf('Operation Torch')); nlKey('Tab', true); await sleep(100);
    ok('Shift+Tab lifts a line, and the one under it comes up too', treeOf().includes('      - "  Operation Torch"\n      - "    Battle of Port Lyautey"'), treeOf());
    caretAtEnd(lineOf('North African campaign')); nlKey('Tab'); await sleep(100);
    ok('Tab goes no deeper than one past the line above', treeOf().includes('      - "  North African campaign"'), treeOf());
    caretAtEnd(lineOf('Operation Torch')); nlKey('Enter'); type('Operation Husky'); await sleep(100);
    ok('Enter starts a line at the same level', treeOf().includes('      - "  Operation Torch"\n      - "  Operation Husky"'), treeOf());
    caretAtEnd(lineOf('Operation Husky')); $('#ins-nested').click(); type('Test op'); await sleep(100);
    ok('Insert > Nested list starts a line under the caret\'s', treeOf().includes('      - "  Operation Husky"\n      - "    Test op"'), treeOf());
    depthButton.click(); depthButton.click(); await sleep(100);
    ok('depth goes 3, 4, 1, and 1 brings everything up to one level', treeOf().includes('depth: 1')
      && treeOf().includes('      - "  Test op"') && !treeOf().includes('"    '), treeOf());
    guidesButton.click(); await sleep(100);
    ok('the guide lines switch off', treeOf().includes('guides: false') && guidesButton.classList.contains('off'), treeOf());
    const nestedMd = $('#preview').textContent;
    await openFile(nestedMd, 'nested-test.md');
    const back = [...document.querySelectorAll('.ib-edit tr[data-kind="row"]')].find((tr) => tr.querySelector('th')?.textContent === 'Battles/wars');
    const backLines = back && [...back.querySelectorAll('.ce.outline > div')].map((d) => d.dataset.level + ' ' + d.textContent).join(' | ');
    ok('and a saved page reads back as it was', back?.dataset.depth === '1' && back?.dataset.guides === 'false'
      && backLines === '0 World War II | 1 North African campaign | 1 Operation Torch | 1 Operation Husky | 1 Test op | 1 Battle of Port Lyautey', backLines);

    // The romanisation takes a line per native title, as the native title takes one per language.
    const romajiBox = $('#ib-romaji');
    const shiftEnter = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true });
    romajiBox.dispatchEvent(shiftEnter);
    const plainEnter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    romajiBox.dispatchEvent(plainEnter);
    ok('shift+enter opens another romanisation line, enter still moves on', !shiftEnter.defaultPrevented && plainEnter.defaultPrevented,
      [shiftEnter.defaultPrevented, plainEnter.defaultPrevented]);
    romajiBox.innerHTML = 'Koin Senso<br>Jiayin Zhanzheng';
    romajiBox.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(100);
    ok('and two lines save as two', $('#preview').textContent.includes('romaji:\n  - "Koin Senso"\n  - "Jiayin Zhanzheng"'),
      ($('#preview').textContent.match(/romaji:[^\n]*(\n  - [^\n]*)*/) || [''])[0]);

    // Sidebar pictures, dragged: beside another, across their pair, and out to a row of their own.
    const picsMd = ['---', 'title: "Pictures test"', 'type: overview', 'infobox:',
      '  - { image: "/assets/flags/albinya.png", caption: "Flag A" }',
      '  - { image: "/assets/flags/alemannia.png", caption: "Flag B" }',
      '  - { label: "Capital", value: "Somewhere" }', '---', '', 'Body.', ''].join('\n');
    await openFile(picsMd, 'pictures-test.md');
    const slotOf = (cap) => [...document.querySelectorAll('#ib .ib-slot')].find((s) => s.querySelector('.ce').textContent === cap);
    const dragOnto = (from, target, fx, fy) => {
      const dt = new DataTransfer();
      const img = from.querySelector('img');
      img.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
      const box = target.getBoundingClientRect();
      const at = { clientX: box.left + box.width * fx, clientY: box.top + box.height * fy, bubbles: true, cancelable: true, dataTransfer: dt };
      target.dispatchEvent(new DragEvent('dragover', at));
      target.dispatchEvent(new DragEvent('drop', at));
      img.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
    };
    const sidebarMd = () => ($('#preview').textContent.match(/infobox:\n[\s\S]*?(?=\n---)/) || [''])[0];
    dragOnto(slotOf('Flag A'), slotOf('Flag B'), 0.75, 0.5); await sleep(100);
    ok('a picture dropped on another stands beside it', sidebarMd().includes('  - images:\n'
      + '      - { src: "/assets/flags/alemannia.png", caption: "Flag B" }\n      - { src: "/assets/flags/albinya.png", caption: "Flag A" }'), sidebarMd());
    dragOnto(slotOf('Flag A'), slotOf('Flag B'), 0.25, 0.5); await sleep(100);
    ok('within its pair it changes sides', sidebarMd().includes(
      '      - { src: "/assets/flags/albinya.png", caption: "Flag A" }\n      - { src: "/assets/flags/alemannia.png", caption: "Flag B" }'), sidebarMd());
    const capitalRow = [...document.querySelectorAll('#ib tr[data-kind="row"]')].find((tr) => tr.querySelector('th')?.textContent === 'Capital');
    dragOnto(slotOf('Flag B'), capitalRow.querySelector('td'), 0.5, 0.9); await sleep(100);
    ok('onto another row it takes a row of its own there', sidebarMd().includes('  - { image: "/assets/flags/albinya.png", caption: "Flag A" }\n'
      + '  - { label: "Capital", value: "Somewhere" }\n  - { image: "/assets/flags/alemannia.png", caption: "Flag B" }'), sidebarMd());

    // Picture rows joined into one gallery: no divider between, as many rows of one or two as wanted.
    await openFile(['---', 'title: "Gallery test"', 'type: overview', 'infobox:', '  - images:',
      '      - { src: "/assets/flags/albinya.png", caption: "A" }', '      - { src: "/assets/flags/alemannia.png", caption: "B" }',
      '  - { image: "/assets/flags/andam-islands.png", caption: "C" }', '  - { image: "/assets/flags/arunya.png", caption: "D" }',
      '---', '', 'Body.', ''].join('\n'), 'gallery-test.md');
    const pictureRows = () => [...document.querySelectorAll('#ib tr[data-kind="image"]')];
    const joinSwitch = (tr) => tr.querySelector('.ctl > button');
    joinSwitch(pictureRows()[1]).click(); joinSwitch(pictureRows()[2]).click(); await sleep(100);
    ok('picture rows joined save as one gallery', sidebarMd().includes('  - { image: "/assets/flags/andam-islands.png", caption: "C", join: true }\n'
      + '  - { image: "/assets/flags/arunya.png", caption: "D", join: true }'), sidebarMd());
    const topRule = (tr) => getComputedStyle(tr.querySelector('td')).borderTopWidth;
    ok('and are drawn with no divider between', topRule(pictureRows()[1]) === '0px' && topRule(pictureRows()[0]) !== '0px', [topRule(pictureRows()[0]), topRule(pictureRows()[1])]);
    dragOnto(slotOf('D'), slotOf('C'), 0.75, 0.5); await sleep(100);
    ok('a pair made by dragging keeps its place in the gallery', sidebarMd().includes('  - images:\n'
      + '      - { src: "/assets/flags/andam-islands.png", caption: "C" }\n      - { src: "/assets/flags/arunya.png", caption: "D" }\n    join: true'), sidebarMd());
    await openFile($('#preview').textContent, 'gallery-back.md');
    ok('and a saved gallery opens joined', pictureRows().length === 2 && pictureRows()[1].classList.contains('ib-join')
      && joinSwitch(pictureRows()[1]).classList.contains('on'), pictureRows().map((tr) => tr.className).join(' | '));

    // Insert as Icon: any picture, in the line at the caret, the height of its text, outlined or not.
    focusEnd(paras()[0]);
    document.querySelector('[data-as="icon"]').click();
    ok('Icon offers the white outline and puts the shapes away', !$('#mp-outline-row').hidden && $('#mp-ratio').closest('.mp-row').hidden, '');
    const iconIn = async (url) => {
      $('#mp-link').value = url;
      $('#mp-link').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      await sleep(100);
      return [...paras()[0].querySelectorAll('img.tok[data-tok="img"]')].find((i) => i.dataset.slug.startsWith(url));
    };
    document.querySelector('[data-outline="0"]').click();
    const bareIcon = await iconIn('https://i.imgur.com/AyTZTRT.jpeg');
    ok('without the outline, it goes in at the caret the height of the text', $('#preview').textContent.includes(':img[https://i.imgur.com/AyTZTRT.jpeg|bare]')
      && bareIcon?.classList.contains('sym') && !bareIcon.classList.contains('sized'), bareIcon?.className);
    document.querySelector('[data-outline="1"]').click();
    const lined = await iconIn('https://i.imgur.com/eehIIHD.png');
    ok('with it, it wears the flag\'s white outline', $('#preview').textContent.includes(':img[https://i.imgur.com/eehIIHD.png|outline]')
      && lined && !lined.classList.contains('sym'), lined?.className);
    document.querySelector('[data-as="image"]').click();

    // Insert > Data table: the same grid, marked so the page can sort it by any column.
    focusEnd(paras()[0]);
    document.querySelector('#dtbl-pick .tbl-cell[data-r="3"][data-c="2"]').click();
    await sleep(100);
    const dataBlk = document.querySelector('#body .blk[data-sortable]');
    ok('a data table goes in, labelled as one', dataBlk?.querySelector('.blk-tag')?.textContent === 'Data table', dataBlk && dataBlk.className);
    ok('and is written as a sortable HTML table', $('#preview').textContent.includes('<table class="sortable">'),
      ($('#preview').textContent.match(/<table[^>]*>/g) || []).join(' '));

    // A data table opened from a file: an ampersand reads as one, and small print stays small.
    const cellIn = '<td>Kanaeya &amp; Co.<br><small>Native</small><br><small>*Romaji*</small></td>';
    await openFile(`---\ntitle: "Table test"\ntype: list\n---\n\n<table class="sortable">\n`
      + `<tr><th>Name</th><th>Group</th></tr>\n<tr>${cellIn}<td>A</td></tr>\n</table>\n`, 'table-test.md');
    const nameCell = document.querySelector('#body .blk[data-sortable] .ed-tbl tr:nth-child(2) td');
    ok('an opened data table shows & as itself', nameCell?.textContent === 'Kanaeya & Co.NativeRomaji', nameCell?.textContent);
    ok('its small print is small, the romaji italic too', nameCell?.querySelectorAll('small').length === 2
      && nameCell.querySelector('small i')?.textContent === 'Romaji', nameCell?.innerHTML);
    ok('and it saves as it came in, bar the entity', $('#preview').textContent
      .includes('<td>Kanaeya & Co.<br><small>Native</small><br><small>*Romaji*</small></td>'),
      ($('#preview').textContent.match(/<td>Kanaeya[^\n]*/) || [])[0]);
  } catch (err) {
    out.push('FAIL threw: ' + err.message);
  }
  const pre = document.createElement('pre');
  pre.id = 'undo-results';
  pre.textContent = out.join('\n');
  document.body.append(pre);
})();
