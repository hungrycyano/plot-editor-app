// 左画面：参考資料・ネット検索・入力内容の表示（プレビュー）・エピソード一覧
import { h, countChars, uid, toast } from './util.js';
import * as store from './store.js';
import * as db from './db.js';
import {
  SETTING_FIELDS, CHAR_LINE_FIELDS, CHAR_TEXT_FIELDS, RULE_LISTS,
  allSections, sectionMap, sectionName, episodeNumbers, chapterNumbers, labelsBySection, pad3,
} from './model.js';
import { ui, saveUi, isOpen, setOpen } from './ui.js';
import { button } from './widgets.js';

export const LEFT_TABS = [
  ['refs', '参考資料'],
  ['search', 'ネット検索'],
  ['preview', 'プレビュー'],
  ['list', 'エピソード一覧'],
];

// 右の内容に左右されない画面（入力中に描き直さなくてよい）
export const isStatic = tab => tab === 'refs' || tab === 'search';

// 左画面だけを描き直す
const redraw = () => window.dispatchEvent(new Event('left-redraw'));

export function renderLeft(root, rightTab) {
  ({ refs: renderRefs, search: renderSearch, preview: p => renderPreview(p, rightTab), list: renderList })[ui.leftTab](root);
}

// ---------- 文章の表示（右の入力欄と同じ .prose を使う） ----------
function prose(text, cls = '') {
  const el = h('div', { class: 'prose pv-text ' + cls });
  const paras = String(text || '').split(/\n/);
  for (const p of paras) el.append(p ? h('p', null, p) : h('p', { class: 'blank' }, ' '));
  return el;
}

const empty = () => h('span', { class: 'note' }, '（未入力）');

// ---------- プレビュー ----------
const PREVIEW_MODES = [
  ['auto', '右画面に合わせる'],
  ['settings', '初期設定・キャラクター'],
  ['plot', 'プロット'],
  ['body', '本文（選択中のエピソード）'],
  ['all', '本文（全文）'],
];

function renderPreview(root, rightTab) {
  const sel = h('select', {
    value: ui.previewMode,
    onchange: e => { ui.previewMode = e.target.value; saveUi(); store.refresh(); },
  }, PREVIEW_MODES.map(([k, l]) => h('option', { value: k }, l)));
  root.append(h('div', { class: 'toolbar' }, h('label', { class: 'inline' }, '表示：', sel)));
  let mode = ui.previewMode;
  if (mode === 'auto') mode = { settings: 'settings', structure: 'plot', episodes: 'plot', body: 'body' }[rightTab] || 'plot';
  const doc = h('div', { class: 'pv' });
  ({ settings: pvSettings, plot: pvPlot, body: pvBody, all: pvAll })[mode](doc);
  root.append(doc);
}

function pvSettings(doc) {
  const s = store.state;
  doc.append(h('h1', null, s.settings.title || '（タイトル未入力）'));
  if (s.settings.subtitle) doc.append(h('p', { class: 'subtitle' }, s.settings.subtitle));
  if (s.settings.catchcopy) doc.append(h('p', { class: 'catch' }, s.settings.catchcopy));
  doc.append(h('h2', null, '初期設定'), h('dl', null, SETTING_FIELDS.filter(([k]) => !['title', 'subtitle', 'catchcopy'].includes(k)).map(([k, l]) =>
    [h('dt', null, l), h('dd', null, s.settings[k] ? prose(s.settings[k]) : empty())])));
  doc.append(h('h2', null, `キャラクター（${s.characters.length}人）`));
  for (const c of s.characters) {
    doc.append(h('h3', null, c.name || '（名前未入力）', c.category ? h('small', null, `　${c.category}`) : null));
    const items = [...CHAR_LINE_FIELDS, ...CHAR_TEXT_FIELDS].filter(([k]) => c[k]);
    doc.append(items.length ? h('dl', null, items.map(([k, l]) => [h('dt', null, l), h('dd', null, prose(c[k]))])) : empty());
  }
  const n = countChars(s.synopsis.text);
  doc.append(h('h2', null, 'あらすじ', h('small', null, `　${n}${s.synopsis.limit ? ' / ' + s.synopsis.limit : ''}字`)), s.synopsis.text ? prose(s.synopsis.text) : empty());
  for (const [k, l] of RULE_LISTS) {
    const items = s.rules[k].filter(Boolean);
    doc.append(h('h2', null, l), items.length ? h('ul', null, items.map(r => h('li', null, r))) : empty());
  }
}

const LABEL_TEXT = {
  setup: f => ['fs', `伏線「${f.label || '（無題）'}」`],
  payoff: f => ['pay', `回収「${f.label || '（無題）'}」`],
  from: g => ['eng', `▶エンジン開始・${g.kind}「${g.label || '（無題）'}」`],
  during: g => ['eng during', `┃${g.kind}「${g.label || '（無題）'}」継続`],
  to: g => ['eng', `■エンジン終了・${g.kind}「${g.label || '（無題）'}」`],
};

function pvPlot(doc) {
  const s = store.state;
  const nums = episodeNumbers(s);
  const chNo = chapterNumbers(s);
  const labels = labelsBySection(s);
  doc.append(h('h1', null, s.settings.title || '（タイトル未入力）'));
  const head = [['テーマ', s.settings.theme], ['人称', s.settings.person], ['型', s.structure.template]].filter(([, v]) => v);
  if (head.length) doc.append(h('dl', { class: 'inline-dl' }, head.map(([k, v]) => [h('dt', null, k), h('dd', null, v)])));
  const epLine = e => h('li', { class: 'pv-ep' }, h('span', { class: 'num' }, pad3(nums.get(e.id))), ' ', e.title || '（無題）',
    h('small', null, `　${countChars(e.body)}字`));
  s.structure.parts.forEach((p, pi) => {
    doc.append(h('h2', null, `第${pi + 1}部 ${p.title}`));
    if (p.memo) doc.append(prose(p.memo, 'memo'));
    for (const c of p.chapters) {
      const person = c.person || s.settings.person;
      doc.append(h('h3', null, `第${chNo.get(c.id)}章 ${c.title}`, person ? h('small', { class: 'person-tag' }, `人称：${person}${c.person ? '' : '（初期設定）'}`) : null));
      if (c.memo) doc.append(prose(c.memo, 'memo'));
      c.sections.forEach((x, si) => {
        doc.append(h('h4', null, `第${si + 1}節 ${x.title}`));
        if (x.memo) doc.append(prose(x.memo, 'memo'));
        const ls = labels.get(x.id) || [];
        if (ls.length) doc.append(h('div', { class: 'labels' }, ls.map(l => { const [cls, t] = LABEL_TEXT[l.type](l.item); return h('span', { class: 'chip static ' + cls }, t); })));
        const eps = s.episodes.filter(e => e.sectionId === x.id);
        if (eps.length) doc.append(h('ul', { class: 'pv-eps' }, eps.map(epLine)));
      });
    }
  });
  const unplaced = s.episodes.filter(e => !e.sectionId);
  if (unplaced.length) doc.append(h('h2', null, '未配置のエピソード'), h('ul', { class: 'pv-eps' }, unplaced.map(epLine)));
  if (!s.structure.parts.length && !s.episodes.length) doc.append(h('p', { class: 'note' }, '②部/章/節で骨組みを作ると、ここにプロットが表示されます。'));

  const map = sectionMap(s);
  const where = id => (id ? sectionName(map.get(id)) : '未配置');
  if (s.foreshadows.length) {
    doc.append(h('h2', null, '伏線と回収'), h('table', null,
      h('tr', null, h('th', null, 'ラベル'), h('th', null, '伏線'), h('th', null, '回収')),
      s.foreshadows.map(f => h('tr', null,
        h('td', null, f.label || '（無題）'),
        h('td', null, h('small', null, where(f.setupAt)), prose(f.setup)),
        h('td', null, h('small', null, where(f.payoffAt)), prose(f.payoff)),
      ))));
  }
  if (s.engines.length) {
    doc.append(h('h2', null, 'エンジン'), h('table', null,
      h('tr', null, h('th', null, 'ラベル'), h('th', null, '種類'), h('th', null, '範囲・内容')),
      s.engines.map(g => h('tr', null,
        h('td', null, g.label || '（無題）'),
        h('td', null, g.kind),
        h('td', null, h('small', null, `${where(g.from)} 〜 ${where(g.to)}`), prose(g.content)),
      ))));
  }
}

function pvBody(doc) {
  const s = store.state;
  const e = s.episodes.find(x => x.id === ui.currentEpisode) || s.episodes[0];
  if (!e) return doc.append(h('p', { class: 'note' }, 'エピソードがありません。'));
  const x = sectionMap(s).get(e.sectionId);
  doc.append(
    h('p', { class: 'note' }, sectionName(x)),
    h('h2', null, `${pad3(episodeNumbers(s).get(e.id))} ${e.title || '（無題）'}`),
    prose(e.body),
    h('p', { class: 'note right' }, `${countChars(e.body)}字`),
  );
}

function pvAll(doc) {
  const s = store.state;
  const nums = episodeNumbers(s);
  const map = sectionMap(s);
  doc.append(h('h1', null, s.settings.title || '（タイトル未入力）'));
  let last;
  for (const e of s.episodes) {
    if (e.sectionId !== last) {
      last = e.sectionId;
      doc.append(h('h3', { class: 'pv-sec' }, sectionName(map.get(e.sectionId))));
    }
    doc.append(h('h4', null, `${pad3(nums.get(e.id))} ${e.title || '（無題）'}`), prose(e.body));
  }
  const total = s.episodes.reduce((n, e) => n + countChars(e.body), 0);
  doc.append(h('p', { class: 'note right' }, `合計 ${total}字`));
}

// ---------- エピソード一覧 ----------
function renderList(root) {
  const s = store.state;
  const nums = episodeNumbers(s);
  const map = sectionMap(s);
  root.append(h('div', { class: 'toolbar' },
    h('span', null, `${s.episodes.length}件`), h('span', { class: 'grow' }),
    button('すべて開く', () => { s.episodes.forEach(e => setOpen('list:' + e.id, true)); store.refresh(); }, 'small'),
    button('すべて閉じる', () => { s.episodes.forEach(e => setOpen('list:' + e.id, false)); store.refresh(); }, 'small'),
  ));
  if (!s.episodes.length) root.append(h('p', { class: 'note' }, 'エピソードがありません。'));
  let last;
  for (const e of s.episodes) {
    if (e.sectionId !== last) {
      last = e.sectionId;
      root.append(h('div', { class: 'list-sec' }, sectionName(map.get(e.sectionId))));
    }
    const key = 'list:' + e.id;
    const d = h('details', { class: 'list-item', open: isOpen(key) },
      h('summary', null, h('span', { class: 'num' }, pad3(nums.get(e.id))), ' ', e.title || '（無題）'),
      e.body ? prose(e.body) : h('p', { class: 'note' }, '（本文なし）'));
    d.addEventListener('toggle', () => setOpen(key, d.open));
    root.append(d);
  }
}

// ---------- ネット検索 ----------
const ENGINES = [
  ['google', 'Google', q => `https://www.google.com/search?q=${encodeURIComponent(q)}`],
  ['brave', 'Brave Search', q => `https://search.brave.com/search?q=${encodeURIComponent(q)}`],
  ['weblio', 'Weblio辞書', q => `https://www.weblio.jp/content/${encodeURIComponent(q)}`],
  ['thesaurus', 'Weblio類語辞典', q => `https://thesaurus.weblio.jp/content/${encodeURIComponent(q)}`],
];

function renderSearch(root) {
  const input = h('input', { type: 'search', placeholder: '調べたい言葉', enterKeyHint: 'search' });
  const engine = h('select', { value: ui.searchEngine, onchange: e => { ui.searchEngine = e.target.value; saveUi(); } },
    ENGINES.map(([k, l]) => h('option', { value: k }, l)));
  const go = () => {
    const q = input.value.trim();
    if (!q) return input.focus();
    const [, , url] = ENGINES.find(([k]) => k === engine.value) || ENGINES[0];
    window.open(url(q), '_blank', 'noopener');
  };
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
  root.append(
    h('div', { class: 'form' },
      h('label', { class: 'field wide' }, h('span', { class: 'field-label' }, '検索する言葉'), input),
      h('label', { class: 'field wide' }, h('span', { class: 'field-label' }, '検索サイト'), engine),
      h('div', { class: 'wide' }, button('新しいタブで開く ↗', go, 'primary')),
    ),
    h('p', { class: 'note' }, '検索結果は、いま使っているブラウザ（Brave / Chrome など）の新しいタブで開きます。アプリ内には表示しません。'),
  );
}

// ---------- 参考資料 ----------
// 開いたファイルはこの端末のブラウザ内にだけ残す（mdファイルには含めない）
let refsCache = null;
const urls = new Map();

async function loadRefs() {
  if (refsCache) return refsCache;
  try { refsCache = (await db.get('refs')) || []; } catch { refsCache = []; }
  return refsCache;
}
async function saveRefs() { try { await db.set('refs', refsCache); } catch { toast('参考資料を端末に保存できませんでした'); } }

function kindOf(file) {
  const n = file.name.toLowerCase();
  if (/\.(md|markdown)$/.test(n)) return 'md';
  if (/\.(txt|text)$/.test(n) || file.type === 'text/plain') return 'txt';
  if (file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|heic|bmp)$/.test(n)) return 'image';
  if (/\.(docx?|rtf)$/.test(n)) return 'word';
  return null;
}

async function addFiles(files) {
  await loadRefs();
  const skipped = [];
  for (const file of files) {
    const kind = kindOf(file);
    if (!kind) { skipped.push(`${file.name}（表示できない形式）`); continue; }
    if (kind === 'word') { skipped.push(`${file.name}（Wordファイルはエクスプローラーから直接開いてください）`); continue; }
    const id = uid('r');
    const data = kind === 'image' ? new Blob([await file.arrayBuffer()], { type: file.type || 'image/png' }) : await file.text();
    try { await db.set('ref:' + id, data); } catch { toast('ファイルを端末に保存できませんでした'); }
    refsCache.push({ id, name: file.name, kind });
    ui.refActive = id;
  }
  saveUi();
  await saveRefs();
  if (skipped.length) alert('次のファイルは表示しません：\n' + skipped.join('\n'));
  redraw();
}

async function removeRef(id) {
  refsCache = refsCache.filter(r => r.id !== id);
  try { await db.del('ref:' + id); } catch { /* なくても続ける */ }
  if (urls.has(id)) { URL.revokeObjectURL(urls.get(id)); urls.delete(id); }
  if (ui.refActive === id) ui.refActive = refsCache[0]?.id || null;
  saveUi();
  await saveRefs();
  redraw();
}

// md を安全に表示する（スクリプトなどを取り除く）
function safeHtml(html) {
  const t = document.createElement('template');
  t.innerHTML = html;
  t.content.querySelectorAll('script,iframe,object,embed,link,meta,style,form').forEach(n => n.remove());
  t.content.querySelectorAll('*').forEach(n => {
    for (const a of [...n.attributes]) {
      if (/^on/i.test(a.name) || (/^(href|src|xlink:href)$/i.test(a.name) && /^\s*javascript:/i.test(a.value))) n.removeAttribute(a.name);
    }
    if (n.tagName === 'A') { n.target = '_blank'; n.rel = 'noopener'; }
  });
  return t.content;
}

function renderRefs(root) {
  const input = h('input', { type: 'file', multiple: true, accept: '.md,.markdown,.txt,text/plain,text/markdown,image/*', hidden: true });
  input.addEventListener('change', () => addFiles([...input.files]));
  const bar = h('div', { class: 'toolbar' }, button('ファイルを選ぶ（md・txt・画像）', () => input.click(), 'primary small'), input);
  const tabs = h('div', { class: 'ref-tabs' });
  const view = h('div', { class: 'ref-view' });
  root.append(bar, tabs, view,
    h('p', { class: 'note' }, '開いたファイルはこの端末のブラウザ内にだけ残ります（保存するmdファイルには含まれません）。Wordファイルはアプリ内に表示しないので、エクスプローラーから直接開いてください。'));
  loadRefs().then(async refs => {
    if (!refs.length) { view.append(h('p', { class: 'note' }, '参考資料はまだありません。')); return; }
    const active = refs.find(r => r.id === ui.refActive) || refs[0];
    for (const r of refs) {
      tabs.append(h('span', { class: 'ref-tab' + (r === active ? ' active' : '') },
        h('button', { type: 'button', class: 'link', onclick: () => { ui.refActive = r.id; saveUi(); redraw(); } }, r.name),
        h('button', { type: 'button', class: 'icon small', title: '閉じる', onclick: () => removeRef(r.id) }, '×')));
    }
    let data;
    try { data = await db.get('ref:' + active.id); } catch { data = null; }
    if (data == null) { view.append(h('p', { class: 'note' }, '内容を読み込めませんでした。もう一度ファイルを選んでください。')); return; }
    if (active.kind === 'image') {
      if (!urls.has(active.id)) urls.set(active.id, URL.createObjectURL(data));
      view.append(h('img', { src: urls.get(active.id), alt: active.name, class: 'ref-img' }));
    } else if (active.kind === 'md' && window.marked) {
      view.append(h('div', { class: 'md-view prose' }, safeHtml(window.marked.parse(data))));
    } else {
      view.append(h('div', { class: 'txt-view prose' }, data));
    }
  });
}
