// mdファイルの保存と読み込み
// - Chrome など：File System Access API で同じファイルへ上書き保存
// - Safari（iPhone）や、この機能が無効な Brave：ダウンロードで保存、ファイル選択で読み込み
import * as db from './db.js';
import * as store from './store.js';
import { toMarkdown, fromMarkdown } from './mdformat.js';
import { toast } from './util.js';

export const canOverwrite = 'showSaveFilePicker' in window && 'showOpenFilePicker' in window;

let handle = null;

const TYPES = [{ description: 'Markdown', accept: { 'text/markdown': ['.md'] } }];

export async function restoreHandle() {
  if (!canOverwrite) return;
  try { handle = (await db.get('fileHandle')) || null; } catch { handle = null; }
}

async function setHandle(h) {
  handle = h;
  try { await (h ? db.set('fileHandle', h) : db.del('fileHandle')); } catch { /* 保存できなくても続ける */ }
}

export const hasHandle = () => !!handle;

function suggestedName() {
  const t = store.state.settings.title.trim() || 'plot';
  return t.replace(/[\\/:*?"<>|\r\n]+/g, '_').slice(0, 60) + '.md';
}

const isAbort = err => err && err.name === 'AbortError';

async function writeTo(h) {
  if ((await h.queryPermission?.({ mode: 'readwrite' })) !== 'granted') {
    if ((await h.requestPermission?.({ mode: 'readwrite' })) !== 'granted') throw new Error('ファイルへの書き込みが許可されませんでした');
  }
  const w = await h.createWritable();
  await w.write(new Blob([toMarkdown(store.state)], { type: 'text/markdown' }));
  await w.close();
}

// 保存（上書き）
export async function save() {
  if (!canOverwrite) return download();
  if (!handle) return saveAs();
  try {
    await writeTo(handle);
    store.markSaved(handle.name);
    toast(`「${handle.name}」に上書き保存しました`);
  } catch (err) {
    if (isAbort(err)) return;
    console.warn(err);
    toast('上書きできませんでした。保存先を選び直してください');
    return saveAs();
  }
}

// 名前を付けて保存
export async function saveAs() {
  if (!canOverwrite) return download();
  try {
    const h = await window.showSaveFilePicker({ suggestedName: suggestedName(), types: TYPES });
    await writeTo(h);
    await setHandle(h);
    store.markSaved(h.name);
    toast(`「${h.name}」に保存しました`);
  } catch (err) {
    if (isAbort(err)) return;
    alert('保存できませんでした：' + err.message);
  }
}

// ダウンロードで保存
export function download() {
  const name = suggestedName();
  const blob = new Blob([toMarkdown(store.state)], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  store.markSaved(name);
  toast(`「${name}」をダウンロードしました`);
}

function confirmDiscard() {
  return !store.dirty || confirm('保存していない変更があります。変更を破棄して続けますか？');
}

function load(text, name, h) {
  let s;
  try { s = fromMarkdown(text); } catch (err) {
    alert('読み込めませんでした：' + err.message);
    return false;
  }
  store.replace(s, { name });
  setHandle(h || null);
  toast(`「${name}」を読み込みました`);
  return true;
}

// ファイルを開く
export async function open() {
  if (!confirmDiscard()) return;
  if (canOverwrite) {
    try {
      const [h] = await window.showOpenFilePicker({ types: TYPES, excludeAcceptAllOption: false });
      const file = await h.getFile();
      load(await file.text(), h.name, h);
    } catch (err) {
      if (!isAbort(err)) alert('開けませんでした：' + err.message);
    }
    return;
  }
  // iPhone など：ファイルを選んで読み込み
  const input = document.createElement('input');
  input.type = 'file';
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (file) load(await file.text(), file.name, null);
  });
  input.click();
}

export function newDocument(state) {
  if (!confirmDiscard()) return;
  store.replace(state, { name: '' });
  setHandle(null);
}
