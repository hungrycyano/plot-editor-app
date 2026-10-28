// ③エピソード（一覧・追加・割り込み挿入・削除・並べ替え・折りたたみ・文字数）
import { h, counted, autoGrow, countChars } from './util.js';
import * as store from './store.js';
import { allSections, sectionName, episodeNumbers, moveEpisode, addEpisode, pad3, EPISODE_LIMIT } from './model.js';
import { button, handle, focusLater } from './widgets.js';
import { sortable } from './dnd.js';
import { ui, isOpen, setOpen } from './ui.js';
import { goto } from './nav.js';

// 節を選ぶ select
export function sectionSelect(value, onChange, emptyLabel = '未配置') {
  const secs = allSections(store.state);
  return h('select', { value: value || '', onchange: e => onChange(e.target.value || null) },
    h('option', { value: '' }, emptyLabel),
    secs.map(x => h('option', { value: x.sec.id }, sectionName(x))),
  );
}

// エピソードを並べる入れ物（節ごと）。ドラッグで並べ替え・別の節へ移動できる。
export function episodeContainer(sectionId, rows) {
  const el = h('div', { class: 'ep-list', dataset: { section: sectionId || '' } }, rows);
  sortable(el, {
    group: 'episodes',
    onDrop({ id, to, index }) {
      moveEpisode(store.state, id, to.dataset.section || null, index);
      store.commit();
    },
  });
  return el;
}

export function deleteEpisode(e) {
  const s = store.state;
  const n = episodeNumbers(s).get(e.id);
  if (!confirm(`エピソード ${pad3(n)}「${e.title || '（無題）'}」を削除しますか？`)) return;
  s.episodes.splice(s.episodes.indexOf(e), 1);
  if (ui.currentEpisode === e.id) ui.currentEpisode = null;
  store.commit();
}

export function insertEpisode(opts) {
  const ep = addEpisode(store.state, opts);
  setOpen('ep:' + ep.id, true);
  focusLater(`[data-id="${ep.id}"] input.ep-title-input`);
  store.commit();
  return ep;
}

function epRow(e, num) {
  const key = 'ep:' + e.id;
  const count = h('span', { class: 'ep-count' });
  const titleBtn = h('button', { type: 'button', class: 'ep-title' });
  const setTitle = () => (titleBtn.textContent = e.title || '（無題）');
  const setCount = () => {
    const n = countChars(e.body);
    count.textContent = `${n}字`;
    count.classList.toggle('over', n > EPISODE_LIMIT);
  };
  setTitle(); setCount();
  const row = h('div', { class: 'ep', dataset: { id: e.id } },
    h('div', { class: 'ep-head' }, handle(), h('span', { class: 'num' }, pad3(num)), titleBtn, count),
  );
  let body = null;
  const open = v => {
    row.classList.toggle('open', v);
    if (v && !body) {
      const c = counted({ value: e.body, class: 'prose', placeholder: '本文（1シーンの短文）' }, () => EPISODE_LIMIT);
      autoGrow(c.ta, 4);
      c.ta.addEventListener('input', () => { e.body = c.ta.value; setCount(); store.touch(); });
      body = h('div', { class: 'ep-body' },
        h('input', {
          type: 'text', class: 'ep-title-input', value: e.title, placeholder: 'タイトル（一行）',
          oninput: ev => { e.title = ev.target.value; setTitle(); store.touch(); },
        }),
        h('label', { class: 'inline' }, '節：', sectionSelect(e.sectionId, v => { moveEpisode(store.state, e.id, v, Infinity); store.commit(); })),
        c.ta, c.counter,
        h('div', { class: 'row gap' },
          button('↑ 上に挿入', () => insertEpisode({ beforeId: e.id }), 'small'),
          button('↓ 下に挿入', () => insertEpisode({ afterId: e.id }), 'small'),
          button('④本文で開く', () => { ui.currentEpisode = e.id; goto('body'); }, 'small'),
          h('span', { class: 'grow' }),
          button('削除', () => deleteEpisode(e), 'small danger'),
        ),
      );
      row.append(body);
    } else if (!v && body) {
      body.remove();
      body = null;
    }
  };
  titleBtn.addEventListener('click', () => { const v = !row.classList.contains('open'); setOpen(key, v); open(v); });
  if (isOpen(key)) open(true);
  return row;
}

export function renderEpisodes(root) {
  const s = store.state;
  const nums = episodeNumbers(s);
  const total = s.episodes.reduce((n, e) => n + countChars(e.body), 0);
  root.append(h('div', { class: 'toolbar' },
    h('span', null, `エピソード ${s.episodes.length}件／本文 合計${total}字`),
    h('span', { class: 'grow' }),
    button('すべて閉じる', () => { for (const e of s.episodes) setOpen('ep:' + e.id, false); store.refresh(); }, 'small'),
    button('＋ エピソードを追加', () => insertEpisode({ sectionId: null }), 'primary small'),
  ));
  root.append(h('p', { class: 'note' }, '≡ をつかんで並べ替え・別の節へ移動できます。タイトルを押すと本文が開きます。番号は骨組み（部→章→節）の順で、未配置は最後です。'));

  const byId = new Map(s.episodes.map(e => [e.id, e]));
  const group = id => s.episodes.filter(e => e.sectionId === id).map(e => epRow(byId.get(e.id), nums.get(e.id)));
  for (const x of allSections(s)) {
    root.append(h('div', { class: 'ep-group' },
      h('div', { class: 'ep-group-head' }, sectionName(x),
        button('＋', () => insertEpisode({ sectionId: x.sec.id }), 'icon small', 'この節にエピソードを追加')),
      episodeContainer(x.sec.id, group(x.sec.id)),
    ));
  }
  root.append(h('div', { class: 'ep-group unplaced' },
    h('div', { class: 'ep-group-head' }, '未配置',
      button('＋', () => insertEpisode({ sectionId: null }), 'icon small', '未配置にエピソードを追加')),
    episodeContainer(null, group(null)),
  ));
}
