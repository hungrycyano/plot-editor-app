// 作業中のデータ・自動保存（ブラウザ内）・未保存の管理
import * as db from './db.js';
import { newState, normalize, tidy } from './model.js';
import { debounce } from './util.js';

export let state = newState();
export let dirty = false;
// 保存先のファイル名（表示用）
export let fileName = '';

const listeners = { commit: new Set(), touch: new Set(), dirty: new Set() };
export const on = (ev, fn) => listeners[ev].add(fn);
const emit = ev => listeners[ev].forEach(fn => fn());

const autosave = debounce(() => saveLocal(), 400);

async function saveLocal() {
  try {
    await db.set('state', JSON.stringify(state));
    await db.set('meta', { dirty, fileName });
  } catch (err) {
    console.warn('自動保存に失敗しました', err);
  }
}

function markDirty() {
  if (!dirty) { dirty = true; emit('dirty'); }
}

// 構造が変わったとき（追加・削除・並べ替えなど）。画面全体を描き直す。
export function commit() {
  tidy(state);
  markDirty();
  emit('commit');
  autosave();
}

// 画面だけ描き直す（データは変わらない。開閉や表示の切り替えなど）
export function refresh() {
  emit('commit');
}

// 文字の入力など、描き直さなくてよい変更
export function touch() {
  markDirty();
  emit('touch');
  autosave();
}

export function replace(s, { name = '', isDirty = false } = {}) {
  state = normalize(s);
  fileName = name;
  dirty = isDirty;
  emit('dirty');
  emit('commit');
  saveLocal();
}

export function markSaved(name) {
  if (name) fileName = name;
  dirty = false;
  emit('dirty');
  saveLocal();
}

export async function loadLocal() {
  try {
    const raw = await db.get('state');
    const meta = (await db.get('meta')) || {};
    if (raw) {
      state = normalize(JSON.parse(raw));
      dirty = !!meta.dirty;
      fileName = meta.fileName || '';
    }
  } catch (err) {
    console.warn('前回のデータを読み込めませんでした', err);
  }
}
