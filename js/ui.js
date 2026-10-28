// 画面の状態（開いているタブ・折りたたみなど）。この端末だけに覚えておく。
const KEY = 'plot-editor-ui';

const defaults = {
  rightTab: 'settings',
  leftTab: 'preview',
  previewMode: 'auto',
  mobilePane: 'right',
  leftWidth: 42, // 左画面の幅（%）
  currentEpisode: null,
  open: {}, // 折りたたみの開閉 { key: true/false }
  searchEngine: 'google',
  refActive: null,
};

export const ui = { ...defaults };
try { Object.assign(ui, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* 使えなくても続ける */ }

export function saveUi() {
  try { localStorage.setItem(KEY, JSON.stringify(ui)); } catch { /* 使えなくても続ける */ }
}

export const isOpen = (key, def = false) => (key in ui.open ? ui.open[key] : def);
export function setOpen(key, v) { ui.open[key] = v; saveUi(); }
