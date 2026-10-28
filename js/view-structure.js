// ②部/章/節（骨組み＋プロット作成）・伏線/エンジンのラベル・チェックリスト
import { h, uid } from './util.js';
import * as store from './store.js';
import {
  TEMPLATES, SHOW_ITEMS, ENGINE_KINDS,
  newPart, newChapter, newSection, episodeNumbers, chapterNumbers, labelsBySection,
  detachSections, contentCount, partSectionIds, chapterSectionIds, autoCheck, pad3,
} from './model.js';
import { fold, bindInput, bindText, field, button, handle, countInput, focusLater, openDialog, stringList } from './widgets.js';
import { sortable, draggable } from './dnd.js';
import { ui, isOpen, setOpen } from './ui.js';
import { goto } from './nav.js';
import { episodeContainer, insertEpisode, sectionSelect } from './view-episodes.js';

// ---------- 削除・増減の確認 ----------
function confirmRemove(what, sectionIds) {
  const { eps, labels } = contentCount(store.state, sectionIds);
  const extra = eps || labels ? `\n中のエピソード ${eps}件・ラベル ${labels}個は「未配置」に戻ります。` : '';
  return confirm(`${what}を削除しますか？${extra}`);
}

function resize(arr, n, make, idsOf, what) {
  if (n > arr.length) {
    while (arr.length < n) arr.push(make());
  } else if (n < arr.length) {
    const removed = arr.slice(n);
    const ids = removed.flatMap(idsOf);
    if (!confirmRemove(`後ろの${what} ${removed.length}個`, ids)) return store.commit();
    detachSections(store.state, ids);
    arr.length = n;
  }
  store.commit();
}

// ---------- ラベル ----------
const LABEL_INFO = {
  setup: { cls: 'fs', text: '伏線' },
  payoff: { cls: 'pay', text: '回収' },
  from: { cls: 'eng', text: '▶開始' },
  to: { cls: 'eng', text: '■終了' },
  during: { cls: 'eng during', text: '┃継続' },
};

function chip(type, item) {
  const info = LABEL_INFO[type];
  const kind = item.kind ? `・${item.kind}` : '';
  const el = h('span', { class: `chip ${info.cls}`, title: 'クリックで内容を表示／ドラッグで移動' },
    h('span', { class: 'chip-type' }, info.text + (type === 'setup' || type === 'payoff' ? '' : kind)),
    h('span', { class: 'chip-label' }, item.label || '（無題）'),
  );
  const isEngine = 'kind' in item;
  const open = () => (isEngine ? engineDialog(item) : foreshadowDialog(item));
  if (type === 'during') {
    el.addEventListener('click', open);
    return el;
  }
  const prop = { setup: 'setupAt', payoff: 'payoffAt', from: 'from', to: 'to' }[type];
  draggable(el, {
    group: 'labels',
    onClick: open,
    onDrop(target) {
      item[prop] = target.dataset.section || null;
      store.commit();
    },
  });
  return el;
}

function locationSelect(value, onChange) {
  return sectionSelect(value, onChange, '未配置（置き場）');
}

export function foreshadowDialog(f) {
  const s = store.state;
  openDialog('伏線と回収', h('div', { class: 'form' },
    field('ラベル', bindInput(f, 'label', { placeholder: '例：壊れた時計', dataset: { k: 'label' } }), 'wide'),
    field('伏線の内容', bindText(f, 'setup', { placeholder: 'どこで何をほのめかすか' }, 3), 'wide'),
    field('伏線を置く節', locationSelect(f.setupAt, v => { f.setupAt = v; store.touch(); }), 'wide'),
    field('回収の内容', bindText(f, 'payoff', { placeholder: 'どう明かす・つなげるか' }, 3), 'wide'),
    field('回収する節', locationSelect(f.payoffAt, v => { f.payoffAt = v; store.touch(); }), 'wide'),
    h('p', { class: 'note wide' }, '伏線と回収は必ず一対です。片方だけを消すことはできません。'),
    h('div', { class: 'row gap wide' },
      button('伏線と回収を削除', () => {
        if (!confirm(`伏線「${f.label || '（無題）'}」を、回収とあわせて削除しますか？`)) return;
        s.foreshadows.splice(s.foreshadows.indexOf(f), 1);
        document.getElementById('dialog').close();
      }, 'danger'),
      h('span', { class: 'grow' }),
      button('閉じる', () => document.getElementById('dialog').close(), 'primary'),
    ),
  ), () => store.commit());
}

export function engineDialog(g) {
  const s = store.state;
  openDialog('エンジン', h('div', { class: 'form' },
    field('ラベル', bindInput(g, 'label', { placeholder: '例：少女は誰か', dataset: { k: 'label' } }), 'wide'),
    field('種類', h('select', { value: g.kind, onchange: e => { g.kind = e.target.value; store.touch(); } },
      ENGINE_KINDS.map(k => h('option', { value: k }, k)))),
    field('内容', bindText(g, 'content', { placeholder: '読者を引っ張る謎・感情・苦難など' }, 3), 'wide'),
    field('開始する節', locationSelect(g.from, v => { g.from = v; store.touch(); }), 'wide'),
    field('終了する節', locationSelect(g.to, v => { g.to = v; store.touch(); }), 'wide'),
    h('p', { class: 'note wide' }, '開始から終了までの節に「┃継続」が表示されます。1つの節だけなら、開始と終了を同じ節にしてください。'),
    h('div', { class: 'row gap wide' },
      button('エンジンを削除', () => {
        if (!confirm(`エンジン「${g.label || '（無題）'}」を削除しますか？`)) return;
        s.engines.splice(s.engines.indexOf(g), 1);
        document.getElementById('dialog').close();
      }, 'danger'),
      h('span', { class: 'grow' }),
      button('閉じる', () => document.getElementById('dialog').close(), 'primary'),
    ),
  ), () => store.commit());
  setTimeout(() => document.querySelector('#dialog input[data-k="label"]')?.focus(), 0);
}

function labelTray() {
  const s = store.state;
  const loose = [];
  for (const f of s.foreshadows) {
    if (!f.setupAt) loose.push(chip('setup', f));
    if (!f.payoffAt) loose.push(chip('payoff', f));
  }
  for (const g of s.engines) {
    if (!g.from) loose.push(chip('from', g));
    if (!g.to) loose.push(chip('to', g));
  }
  const area = h('div', { class: 'tray-area', dataset: { dropGroup: 'labels', section: '' } },
    loose.length ? loose : h('span', { class: 'note' }, '未配置のラベルはありません（ここへドラッグすると未配置に戻せます）'));
  const all = h('div', { class: 'label-index' },
    s.foreshadows.map(f => button(`伏線：${f.label || '（無題）'}`, () => foreshadowDialog(f), 'link fs')),
    s.engines.map(g => button(`エンジン：${g.label || '（無題）'}`, () => engineDialog(g), 'link eng')),
  );
  return h('div', { class: 'tray' }, fold('st:tray', `ラベル置き場（伏線 ${s.foreshadows.length}・エンジン ${s.engines.length}）`, [
    h('div', { class: 'row gap' },
      button('＋ 伏線と回収', () => {
        const f = { id: uid('f'), label: '', setup: '', payoff: '', setupAt: null, payoffAt: null };
        s.foreshadows.push(f);
        store.commit();
        foreshadowDialog(f);
        setTimeout(() => document.querySelector('#dialog input[data-k="label"]')?.focus(), 0);
      }, 'small fs-btn'),
      button('＋ エンジン', () => {
        const g = { id: uid('g'), label: '', kind: '謎', content: '', from: null, to: null };
        s.engines.push(g);
        store.commit();
        engineDialog(g);
      }, 'small eng-btn'),
      h('span', { class: 'note' }, 'ラベルを節へドラッグして置きます。クリックで内容を表示。'),
    ),
    area,
    s.foreshadows.length + s.engines.length ? fold('st:labelindex', 'ラベルの一覧', all, false, 'compact') : null,
  ], true, 'compact'));
}

// ---------- 骨組み ----------
function noticeBox() {
  const s = store.state;
  const show = new Set(s.structure.show);
  const toggles = h('div', { class: 'row gap wrap' }, SHOW_ITEMS.map(([k, label]) =>
    h('label', { class: 'check' }, h('input', {
      type: 'checkbox', checked: show.has(k),
      onchange: e => {
        const set = new Set(s.structure.show);
        e.target.checked ? set.add(k) : set.delete(k);
        s.structure.show = SHOW_ITEMS.map(([x]) => x).filter(x => set.has(x));
        store.commit();
      },
    }), label)));
  const items = [];
  for (const [k, label] of SHOW_ITEMS) {
    if (!show.has(k)) continue;
    let content;
    if (k === 'theme' || k === 'catchcopy') content = s.settings[k];
    else if (k === 'synopsis') content = s.synopsis.text;
    else content = s.rules[k].filter(Boolean);
    const empty = Array.isArray(content) ? !content.length : !content;
    items.push(h('div', { class: 'notice-item' }, h('strong', null, label),
      empty ? h('span', { class: 'note' }, '（未入力）')
        : Array.isArray(content) ? h('ul', null, content.map(x => h('li', null, x)))
          : h('div', { class: 'pre' }, content)));
  }
  return [
    items.length ? h('div', { class: 'notice' }, items) : null,
    fold('st:show', '表示する項目を選ぶ', toggles, false, 'compact'),
  ];
}

function templateBar() {
  const s = store.state;
  const sel = h('select', { value: s.structure.template, onchange: e => { s.structure.template = e.target.value; store.touch(); } },
    Object.keys(TEMPLATES).map(k => h('option', { value: k }, k)));
  return h('div', { class: 'toolbar wrap' },
    h('label', { class: 'inline' }, '型：', sel),
    button('この型で部を作る', () => {
      const names = TEMPLATES[s.structure.template];
      const parts = s.structure.parts;
      if (!names.length) return alert('「自由」には決まった部の名前がありません。部の数を入力してください。');
      if (parts.length && !confirm(`部を${names.length}つにして、名前を「${names.join('・')}」にします。よろしいですか？`)) return;
      if (parts.length > names.length) {
        const ids = parts.slice(names.length).flatMap(partSectionIds);
        if (!confirmRemove(`後ろの部 ${parts.length - names.length}個`, ids)) return;
        detachSections(s, ids);
        parts.length = names.length;
      }
      names.forEach((n, i) => { if (parts[i]) parts[i].title = n; else parts.push(newPart(n)); });
      store.commit();
    }, 'small'),
    countInput(s.structure.parts.length, n => resize(s.structure.parts, n, () => newPart(), partSectionIds, '部'), '部の数 '),
  );
}

function partEl(p, pi, ctx) {
  const key = 'part:' + p.id;
  const chapters = h('div', { class: 'chapters', dataset: { part: p.id } }, p.chapters.map(c => chapterEl(c, ctx)));
  sortable(chapters, {
    group: 'chapters',
    onDrop({ id, to, index }) {
      const s = store.state;
      const from = s.structure.parts.find(x => x.chapters.some(c => c.id === id));
      const dest = s.structure.parts.find(x => x.id === to.dataset.part);
      const [c] = from.chapters.splice(from.chapters.findIndex(c => c.id === id), 1);
      dest.chapters.splice(index, 0, c);
      store.commit();
    },
  });
  const collapsed = !isOpen(key, true);
  return h('div', { class: 'part' + (collapsed ? ' collapsed' : ''), dataset: { id: p.id } },
    h('div', { class: 'part-head' },
      handle(),
      button(collapsed ? '▸' : '▾', () => { setOpen(key, collapsed); store.refresh(); }, 'icon fold-btn', collapsed ? '開く' : '閉じる'),
      h('span', { class: 'no' }, `第${pi + 1}部`),
      bindInput(p, 'title', { placeholder: '部の名前（例：起）', class: 'grow' }),
      countInput(p.chapters.length, n => resize(p.chapters, n, newChapter, chapterSectionIds, '章'), '章 '),
      button('×', () => {
        if (!confirmRemove(`第${pi + 1}部「${p.title}」`, partSectionIds(p))) return;
        detachSections(store.state, partSectionIds(p));
        store.state.structure.parts.splice(pi, 1);
        store.commit();
      }, 'icon danger', 'この部を削除'),
    ),
    collapsed ? null : [
      memo(p, '部のメモ'),
      chapters,
      button('＋ 章を追加', () => { p.chapters.push(newChapter()); store.commit(); }, 'add small'),
    ],
  );
}

function memo(obj, placeholder) {
  return bindText(obj, 'memo', { placeholder, class: 'memo' }, 1);
}

function chapterEl(c, ctx) {
  const s = store.state;
  const key = 'chap:' + c.id;
  const sections = h('div', { class: 'sections', dataset: { chapter: c.id } }, c.sections.map((x, si) => sectionEl(x, si, c, ctx)));
  sortable(sections, {
    group: 'sections',
    onDrop({ id, to, index }) {
      const chs = s.structure.parts.flatMap(p => p.chapters);
      const from = chs.find(ch => ch.sections.some(x => x.id === id));
      const dest = chs.find(ch => ch.id === to.dataset.chapter);
      const [x] = from.sections.splice(from.sections.findIndex(x => x.id === id), 1);
      dest.sections.splice(index, 0, x);
      store.commit();
    },
  });
  const collapsed = !isOpen(key, true);
  const no = ctx.chNo.get(c.id);
  return h('div', { class: 'chapter' + (collapsed ? ' collapsed' : ''), dataset: { id: c.id } },
    h('div', { class: 'chapter-head' },
      handle(),
      button(collapsed ? '▸' : '▾', () => { setOpen(key, collapsed); store.refresh(); }, 'icon fold-btn', collapsed ? '開く' : '閉じる'),
      h('span', { class: 'no' }, `第${no}章`),
      bindInput(c, 'title', { placeholder: '章の名前', class: 'grow' }),
      countInput(c.sections.length, n => resize(c.sections, n, newSection, x => [x.id], '節'), '節 '),
      button('×', () => {
        if (!confirmRemove(`第${no}章「${c.title}」`, chapterSectionIds(c))) return;
        detachSections(s, chapterSectionIds(c));
        const p = s.structure.parts.find(p => p.chapters.includes(c));
        p.chapters.splice(p.chapters.indexOf(c), 1);
        store.commit();
      }, 'icon danger', 'この章を削除'),
    ),
    collapsed ? null : [
      h('label', { class: 'person' }, '人称：', bindInput(c, 'person', {
        placeholder: s.settings.person ? `${s.settings.person}（初期設定）` : '初期設定の人称（未入力）',
      })),
      memo(c, '章のメモ'),
      sections,
      button('＋ 節を追加', () => { c.sections.push(newSection()); store.commit(); }, 'add small'),
    ],
  );
}

function sectionEl(x, si, c, ctx) {
  const s = store.state;
  const labels = (ctx.labels.get(x.id) || []).map(l => chip(l.type, l.item));
  const eps = s.episodes.filter(e => e.sectionId === x.id).map(e => compactEp(e, ctx.nums.get(e.id)));
  return h('div', { class: 'section', dataset: { id: x.id, dropGroup: 'labels', section: x.id } },
    h('div', { class: 'section-head' },
      handle(),
      h('span', { class: 'no' }, `第${si + 1}節`),
      bindInput(x, 'title', { placeholder: '節の名前', class: 'grow' }),
      button('＋', () => insertEpisode({ sectionId: x.id }), 'icon', 'この節にエピソードを追加'),
      button('×', () => {
        if (!confirmRemove(`第${si + 1}節「${x.title}」`, [x.id])) return;
        detachSections(s, [x.id]);
        c.sections.splice(c.sections.indexOf(x), 1);
        store.commit();
      }, 'icon danger', 'この節を削除'),
    ),
    memo(x, '節のメモ'),
    labels.length ? h('div', { class: 'labels' }, labels) : null,
    episodeContainer(x.id, eps),
  );
}

function compactEp(e, num) {
  return h('div', { class: 'ep compact', dataset: { id: e.id } },
    h('div', { class: 'ep-head' },
      handle(),
      h('span', { class: 'num' }, pad3(num)),
      h('button', { type: 'button', class: 'ep-title', title: '④本文で開く', onclick: () => { ui.currentEpisode = e.id; goto('body'); } }, e.title || '（無題）'),
    ));
}

// ---------- チェックリスト ----------
function checklist() {
  const s = store.state;
  const warns = autoCheck(s);
  const list = h('div', { class: 'slist checklist' }, s.checklist.map((k, i) =>
    h('div', { class: 'srow' + (k.done ? ' done' : ''), dataset: { id: k.id } },
      handle(),
      h('input', { type: 'checkbox', checked: k.done, 'aria-label': '確認済み', onchange: e => { k.done = e.target.checked; store.commit(); } }),
      h('input', { type: 'text', value: k.text, dataset: { list: 'check', idx: String(i) }, oninput: e => { k.text = e.target.value; store.touch(); } }),
      button('×', () => { s.checklist.splice(i, 1); store.commit(); }, 'icon danger', '削除'),
    )));
  sortable(list, {
    group: 'checklist',
    onDrop({ id, to, index }) {
      if (to !== list) return;
      const [k] = s.checklist.splice(s.checklist.findIndex(k => k.id === id), 1);
      s.checklist.splice(index, 0, k);
      store.commit();
    },
  });
  const done = s.checklist.filter(k => k.done).length;
  return fold('st:check', `チェックリスト（${done}/${s.checklist.length}）`, [
    h('div', { class: 'autocheck' + (warns.length ? ' has-warn' : '') },
      h('strong', null, '自動チェック'),
      warns.length ? h('ul', null, warns.map(w => h('li', null, w))) : h('span', null, ' 抜けや順番の問題は見つかりませんでした'),
    ),
    list,
    h('div', { class: 'row gap' },
      button('＋ 項目を追加', () => {
        s.checklist.push({ id: uid('k'), text: '', done: false });
        focusLater(`input[data-list="check"][data-idx="${s.checklist.length - 1}"]`);
        store.commit();
      }, 'add'),
      button('チェックをすべて外す', () => { s.checklist.forEach(k => (k.done = false)); store.commit(); }, 'small'),
    ),
    fold('st:style', `文体ルール（${s.rules.style.length}）`, [
      h('p', { class: 'note' }, '文体の一貫性を確認するための決まりごと。ここでも①初期設定でも編集できます。'),
      stringList(s.rules.style, { group: 'rules-style-check', placeholder: '例：文末は「だ・である」調' }),
    ], false, 'compact'),
  ], true);
}

export function renderStructure(root) {
  const s = store.state;
  const ctx = { nums: episodeNumbers(s), chNo: chapterNumbers(s), labels: labelsBySection(s) };
  root.append(...noticeBox().filter(Boolean), templateBar(), labelTray());

  const parts = h('div', { class: 'parts' }, s.structure.parts.map((p, i) => partEl(p, i, ctx)));
  sortable(parts, {
    group: 'parts',
    onDrop({ id, to, index }) {
      if (to !== parts) return;
      const arr = s.structure.parts;
      const [p] = arr.splice(arr.findIndex(p => p.id === id), 1);
      arr.splice(index, 0, p);
      store.commit();
    },
  });
  if (!s.structure.parts.length) {
    root.append(h('p', { class: 'note' }, '部がまだありません。「型」を選んで「この型で部を作る」を押すか、部の数を入力してください。'));
  }
  root.append(parts, button('＋ 部を追加', () => { s.structure.parts.push(newPart()); store.commit(); }, 'add'));

  const unplaced = s.episodes.filter(e => !e.sectionId);
  root.append(h('div', { class: 'section unplaced' },
    h('div', { class: 'section-head' }, h('strong', null, `未配置のエピソード（${unplaced.length}）`), h('span', { class: 'grow' }),
      button('＋', () => insertEpisode({ sectionId: null }), 'icon', '未配置にエピソードを追加')),
    h('p', { class: 'note' }, 'エピソードを節へドラッグして割り当てます。'),
    episodeContainer(null, unplaced.map(e => compactEp(e, ctx.nums.get(e.id)))),
  ));

  root.append(checklist());
}
