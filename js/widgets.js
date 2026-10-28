// 画面部品（折りたたみ・入力欄・一覧の編集など）
import { h, autoGrow } from './util.js';
import { isOpen, setOpen } from './ui.js';
import * as store from './store.js';
import { sortable } from './dnd.js';

// 折りたたみ
export function fold(key, summary, content, def = true, cls = '') {
  const d = h('details', { class: 'fold ' + cls, open: isOpen(key, def) }, h('summary', null, summary), h('div', { class: 'fold-body' }, content));
  d.addEventListener('toggle', () => setOpen(key, d.open));
  return d;
}

// obj[key] とつながった一行の入力欄
export function bindInput(obj, key, props = {}, onInput) {
  return h('input', {
    type: 'text', value: obj[key] ?? '', ...props,
    oninput: e => { obj[key] = e.target.value; onInput?.(e.target.value); store.touch(); },
  });
}

// obj[key] とつながった複数行の入力欄（内容に合わせて高さが伸びる）
export function bindText(obj, key, props = {}, rows = 2, onInput) {
  const ta = h('textarea', {
    value: obj[key] ?? '', ...props,
    oninput: e => { obj[key] = e.target.value; onInput?.(e.target.value); store.touch(); },
  });
  return autoGrow(ta, rows);
}

export function field(label, control, cls = '') {
  return h('label', { class: 'field ' + cls }, h('span', { class: 'field-label' }, label), control);
}

export function button(label, onclick, cls = '', title) {
  return h('button', { type: 'button', class: cls, onclick, title }, label);
}

export const handle = () => h('span', { class: 'handle', title: 'ドラッグで移動', 'aria-label': '移動' }, '≡');

// 描き直したあとにフォーカスを当てる
let pendingFocus = null;
export const focusLater = sel => (pendingFocus = sel);
export function applyFocus() {
  if (!pendingFocus) return;
  const el = document.querySelector(pendingFocus);
  pendingFocus = null;
  if (el) { el.focus(); el.scrollIntoView({ block: 'nearest' }); }
}

// 文字列の配列を編集する一覧（追加・編集・削除・並べ替え）
export function stringList(arr, { group, placeholder = '', addLabel = '＋ 追加' }) {
  const list = h('div', { class: 'slist' });
  arr.forEach((v, i) => {
    list.append(h('div', { class: 'srow', dataset: { id: String(i) } },
      handle(),
      h('input', {
        type: 'text', value: v, placeholder, dataset: { list: group, idx: String(i) },
        oninput: e => { arr[i] = e.target.value; store.touch(); },
      }),
      button('×', () => { arr.splice(i, 1); store.commit(); }, 'icon danger', '削除'),
    ));
  });
  sortable(list, {
    group,
    onDrop({ id, to, index }) {
      if (to !== list) return;
      const [x] = arr.splice(+id, 1);
      arr.splice(index, 0, x);
      store.commit();
    },
  });
  const add = button(addLabel, () => {
    arr.push('');
    focusLater(`input[data-list="${group}"][data-idx="${arr.length - 1}"]`);
    store.commit();
  }, 'add');
  return [list, add];
}

// 枠の数を入力して増減する
export function countInput(current, onChange, label) {
  const inp = h('input', { type: 'number', min: 0, max: 99, value: String(current), class: 'num', inputMode: 'numeric', 'aria-label': label });
  const apply = () => {
    const n = Math.max(0, Math.min(99, parseInt(inp.value, 10) || 0));
    if (n !== current) onChange(n); else inp.value = String(current);
  };
  inp.addEventListener('change', apply);
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); apply(); } });
  return h('span', { class: 'count-input' }, label, inp);
}

// 簡易ダイアログ
export function openDialog(title, content, onClose) {
  const dlg = document.getElementById('dialog');
  dlg.replaceChildren(
    h('div', { class: 'dialog-head' }, h('h2', null, title), button('×', () => dlg.close(), 'icon', '閉じる')),
    h('div', { class: 'dialog-body' }, content),
  );
  const handler = () => { dlg.removeEventListener('close', handler); onClose?.(); };
  dlg.addEventListener('close', handler);
  dlg.showModal();
  return dlg;
}
