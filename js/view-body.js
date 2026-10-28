// ④本文（選んだエピソードを広い入力欄で書く）
import { h, counted, autoGrow } from './util.js';
import * as store from './store.js';
import { episodeNumbers, moveEpisode, pad3, EPISODE_LIMIT, RULE_LISTS } from './model.js';
import { button, fold } from './widgets.js';
import { ui, saveUi } from './ui.js';
import { sectionSelect, deleteEpisode, insertEpisode } from './view-episodes.js';

export function renderBody(root) {
  const s = store.state;
  const nums = episodeNumbers(s);
  let e = s.episodes.find(x => x.id === ui.currentEpisode);
  if (!e && s.episodes.length) { e = s.episodes[0]; ui.currentEpisode = e.id; saveUi(); }

  const select = (cur) => {
    ui.currentEpisode = cur;
    saveUi();
    store.refresh();
  };
  const idx = e ? s.episodes.indexOf(e) : -1;
  root.append(h('div', { class: 'toolbar' },
    prevNext(idx - 1, '◀', '前のエピソード', select),
    h('select', { class: 'grow', value: e?.id || '', onchange: ev => select(ev.target.value) },
      s.episodes.length ? null : h('option', { value: '' }, '（エピソードがありません）'),
      s.episodes.map(x => h('option', { value: x.id }, `${pad3(nums.get(x.id))} ${x.title || '（無題）'}`)),
    ),
    prevNext(idx + 1, '▶', '次のエピソード', select),
    button('＋ 新規', () => { const ep = insertEpisode(e ? { afterId: e.id } : {}); select(ep.id); }, 'small primary', '今のエピソードの次に追加'),
  ));
  if (!e) {
    root.append(h('p', { class: 'note' }, 'エピソードがありません。「＋ 新規」で作るか、③エピソードで追加してください。'));
    return;
  }

  // 書くときの注意（必須・禁止・文体ルール）
  const rules = RULE_LISTS.filter(([k]) => s.rules[k].some(Boolean)).map(([k, label]) =>
    h('div', { class: 'rule-mini' }, h('strong', null, label), h('ul', null, s.rules[k].filter(Boolean).map(r => h('li', null, r)))));
  if (rules.length) root.append(fold('body:rules', '書くときの注意（必須・禁止・文体ルール）', rules, false, 'compact'));

  const c = counted({ value: e.body, class: 'prose body-text', placeholder: '本文（1シーンの短文。3000字まで）' }, () => EPISODE_LIMIT);
  autoGrow(c.ta, 16);
  c.ta.addEventListener('input', () => { e.body = c.ta.value; store.touch(); });

  root.append(
    h('div', { class: 'body-head' },
      h('span', { class: 'num big' }, pad3(nums.get(e.id))),
      h('input', {
        type: 'text', class: 'title-input grow', value: e.title, placeholder: 'タイトル（一行）',
        oninput: ev => { e.title = ev.target.value; store.touch(); },
      }),
    ),
    h('div', { class: 'row gap' },
      h('label', { class: 'inline' }, '節：', sectionSelect(e.sectionId, v => { moveEpisode(s, e.id, v, Infinity); store.commit(); })),
      h('span', { class: 'grow' }),
      button('削除', () => deleteEpisode(e), 'small danger'),
    ),
    c.ta,
    c.counter,
  );
}

function prevNext(i, label, title, select) {
  const s = store.state;
  const target = s.episodes[i];
  return h('button', { type: 'button', class: 'icon', title, disabled: !target, onclick: () => target && select(target.id) }, label);
}
