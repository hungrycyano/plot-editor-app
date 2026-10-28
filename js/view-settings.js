// ①初期設定（初期設定・キャラクター・あらすじ・必須/禁止事項・文体ルール）
import { h, counted, autoGrow } from './util.js';
import * as store from './store.js';
import { SETTING_FIELDS, CHAR_LINE_FIELDS, CHAR_TEXT_FIELDS, RULE_LISTS, newCharacter } from './model.js';
import { fold, bindInput, bindText, field, button, handle, stringList, focusLater } from './widgets.js';
import { sortable } from './dnd.js';
import { isOpen, setOpen } from './ui.js';

const MULTI = new Set(['theme', 'world', 'other']);

export function renderSettings(root) {
  const s = store.state;

  root.append(fold('set:basic', '初期設定', h('div', { class: 'form' },
    SETTING_FIELDS.map(([k, label]) => field(label,
      MULTI.has(k) ? bindText(s.settings, k, {}, 2) : bindInput(s.settings, k, k === 'person' ? { placeholder: '例：一人称（僕）、三人称' } : {}),
      MULTI.has(k) ? 'wide' : '')),
  )));

  // キャラクター
  const cards = h('div', { class: 'cards' }, s.characters.map(charCard));
  sortable(cards, {
    group: 'chars',
    onDrop({ id, to, index }) {
      if (to !== cards) return;
      const i = s.characters.findIndex(c => c.id === id);
      const [c] = s.characters.splice(i, 1);
      s.characters.splice(index, 0, c);
      store.commit();
    },
  });
  root.append(fold('set:chars', `キャラクター（${s.characters.length}人）`, [
    cards,
    button('＋ キャラクターを追加', () => {
      const c = newCharacter();
      s.characters.push(c);
      setOpen('char:' + c.id, true);
      focusLater(`[data-id="${c.id}"] input[data-k="name"]`);
      store.commit();
    }, 'add'),
  ]));

  // あらすじ
  const syn = counted({ value: s.synopsis.text, class: 'prose', placeholder: 'あらすじ' }, () => s.synopsis.limit);
  autoGrow(syn.ta, 6);
  syn.ta.addEventListener('input', () => { s.synopsis.text = syn.ta.value; store.touch(); });
  const limit = h('input', {
    type: 'number', min: 0, class: 'num', value: String(s.synopsis.limit || 0), inputMode: 'numeric',
    oninput: e => { s.synopsis.limit = Math.max(0, parseInt(e.target.value, 10) || 0); syn.update(); store.touch(); },
  });
  root.append(fold('set:synopsis', 'あらすじ', [
    h('div', { class: 'row' }, h('label', { class: 'inline' }, '文字数の上限 ', limit, ' 文字（0 で上限なし）')),
    syn.ta, syn.counter,
  ]));

  // 必須・禁止・文体ルール
  const hints = {
    must: '例：わかりやすい言葉で書く',
    ban: '例：説明しすぎない',
    style: '例：文末は「だ・である」調／数字は漢数字',
  };
  root.append(fold('set:rules', '文章作成時の必須・禁止事項、文体ルール', RULE_LISTS.map(([k, label]) =>
    h('div', { class: 'rule-block' },
      h('h3', null, label),
      k === 'style' ? h('p', { class: 'note' }, '文体を一貫させるための決まりごと。チェックリストで確認するときに使います。') : null,
      stringList(s.rules[k], { group: 'rules-' + k, placeholder: hints[k] }),
    ),
  )));
}

function charCard(c) {
  const s = store.state;
  const key = 'char:' + c.id;
  const nameEl = h('span', { class: 'card-name' }, c.name || '（名前未入力）');
  const catEl = h('span', { class: 'card-sub' }, c.category);
  const body = h('div', { class: 'form' },
    field('名前', bindInput(c, 'name', { dataset: { k: 'name' } }, v => (nameEl.textContent = v || '（名前未入力）'))),
    CHAR_LINE_FIELDS.map(([k, label]) => field(label, bindInput(c, k, k === 'category' ? { placeholder: '主人公、敵キャラなど' } : {}, k === 'category' ? v => (catEl.textContent = v) : null))),
    CHAR_TEXT_FIELDS.map(([k, label]) => field(label, bindText(c, k, {}, 2), 'wide')),
    h('div', { class: 'wide right' }, button('このキャラクターを削除', () => {
      if (!confirm(`キャラクター「${c.name || '（名前未入力）'}」を削除しますか？`)) return;
      s.characters.splice(s.characters.indexOf(c), 1);
      store.commit();
    }, 'danger')),
  );
  const d = h('details', { class: 'card', open: isOpen(key, false), dataset: { id: c.id } },
    h('summary', null, handle(), nameEl, catEl),
    body,
  );
  d.addEventListener('toggle', () => setOpen(key, d.open));
  return d;
}
