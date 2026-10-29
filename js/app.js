// 起動・画面レイアウト・タブ切り替え
import { h, debounce } from './util.js';
import * as store from './store.js';
import * as fileio from './fileio.js';
import { newState, templateState } from './model.js';
import { ui, saveUi } from './ui.js';
import { applyFocus } from './widgets.js';
import { setNav } from './nav.js';
import { renderSettings } from './view-settings.js';
import { renderStructure } from './view-structure.js';
import { renderEpisodes } from './view-episodes.js';
import { renderBody } from './view-body.js';
import { renderLeft, LEFT_TABS, isStatic } from './leftpane.js';

const RIGHT_TABS = [
  ['settings', '①初期設定', renderSettings],
  ['structure', '②部/章/節', renderStructure],
  ['episodes', '③エピソード', renderEpisodes],
  ['body', '④本文', renderBody],
];

const $ = sel => document.querySelector(sel);
const rightBody = $('#rightBody');
const leftBody = $('#leftBody');
const scrollPos = {};

function renderTabs(nav, tabs, current, onPick) {
  nav.replaceChildren(...tabs.map(([k, label]) =>
    h('button', { type: 'button', class: 'tab' + (k === current ? ' active' : ''), role: 'tab', 'aria-selected': String(k === current), onclick: () => onPick(k) }, label)));
}

function renderRight() {
  const st = rightBody.scrollTop;
  renderTabs($('#rightTabs'), RIGHT_TABS, ui.rightTab, goto);
  const tab = RIGHT_TABS.find(([k]) => k === ui.rightTab) || RIGHT_TABS[0];
  const frag = h('div', { class: 'view view-' + tab[0] });
  tab[2](frag);
  rightBody.replaceChildren(frag);
  rightBody.scrollTop = st;
  applyFocus();
}

let leftRenderedTab = null;
function renderLeftPane(force = true) {
  if (!force && isStatic(ui.leftTab) && leftRenderedTab === ui.leftTab) return;
  const st = leftBody.scrollTop;
  renderTabs($('#leftTabs'), LEFT_TABS, ui.leftTab, k => {
    scrollPos['L' + ui.leftTab] = leftBody.scrollTop;
    ui.leftTab = k; saveUi();
    renderLeftPane();
    leftBody.scrollTop = scrollPos['L' + k] || 0;
  });
  const frag = h('div', { class: 'view' });
  renderLeft(frag, ui.rightTab);
  leftBody.replaceChildren(frag);
  leftBody.scrollTop = st;
  leftRenderedTab = ui.leftTab;
}

function goto(tab, { keepScroll = false } = {}) {
  scrollPos[ui.rightTab] = rightBody.scrollTop;
  ui.rightTab = tab;
  saveUi();
  if (document.body.classList.contains('mobile')) setMobilePane('right');
  renderRight();
  if (!keepScroll) rightBody.scrollTop = scrollPos[tab] || 0;
  renderLeftPane(false);
}
setNav(goto);

// ---------- 未保存の表示 ----------
function updateDirty() {
  $('#dirtyMark').hidden = !store.dirty;
  $('#docName').replaceChildren(store.fileName || store.state.settings.title || '無題');
  document.title = (store.dirty ? '● ' : '') + (store.state.settings.title || 'plot-editor') + ' - plot-editor';
}

// ---------- メニュー ----------
function setupMenu() {
  const menu = $('#menu');
  const close = () => { menu.hidden = true; $('#menuBtn').setAttribute('aria-expanded', 'false'); };
  $('#menuBtn').addEventListener('click', e => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    $('#menuBtn').setAttribute('aria-expanded', String(!menu.hidden));
  });
  document.addEventListener('click', e => { if (!menu.hidden && !menu.contains(e.target)) close(); });
  const item = (label, fn, note) => h('button', { type: 'button', class: 'menu-item', onclick: () => { close(); fn(); } }, label, note ? h('small', null, note) : null);
  menu.replaceChildren(...[
    item('新規作成', () => fileio.newDocument(newState())),
    item('テンプレートで新規作成', () => fileio.newDocument(templateState()), '4部・3章・1節・36エピソードの空の枠を作ります'),
    item('開く…', () => fileio.open(), fileio.canOverwrite ? '開いたファイルにそのまま上書き保存できます' : 'mdファイルを選んで読み込みます'),
    fileio.canOverwrite ? item('上書き保存', () => fileio.save(), 'Ctrl+S') : null,
    fileio.canOverwrite ? item('名前を付けて保存…', () => fileio.saveAs()) : null,
    item('ダウンロードで保存', () => fileio.download(), 'mdファイルをダウンロードします'),
    h('p', { class: 'menu-note' }, fileio.canOverwrite
      ? '保存先：同じファイルへ上書き保存'
      : 'このブラウザは上書き保存に対応していないため、「ダウンロード」で保存します。Brave の場合は brave://flags/#file-system-access-api を有効にすると上書き保存できます。'),
    h('p', { class: 'menu-note' }, '作業中の内容は、この端末のブラウザ内に自動で一時保存されます（外部には送りません）。'),
  ].filter(Boolean));
  $('#saveBtn').addEventListener('click', () => fileio.save());
  $('#saveBtn').title = fileio.canOverwrite ? '上書き保存（Ctrl+S）' : 'ダウンロードで保存';
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      e.shiftKey ? fileio.saveAs() : fileio.save();
    }
  });
}

// ---------- レイアウト（PC：左右分割／iPhone：タブ切り替え） ----------
function setMobilePane(p) {
  ui.mobilePane = p;
  saveUi();
  document.body.dataset.pane = p;
  document.querySelectorAll('.mobile-switch button').forEach(b => b.classList.toggle('active', b.dataset.pane === p));
}

function setupLayout() {
  const mq = matchMedia('(max-width: 800px)');
  const apply = () => document.body.classList.toggle('mobile', mq.matches);
  mq.addEventListener('change', apply);
  apply();
  setMobilePane(ui.mobilePane);
  document.querySelectorAll('.mobile-switch button').forEach(b => b.addEventListener('click', () => setMobilePane(b.dataset.pane)));

  const main = $('#main');
  const setWidth = w => { ui.leftWidth = Math.max(15, Math.min(80, w)); main.style.setProperty('--left', ui.leftWidth + '%'); };
  setWidth(ui.leftWidth);
  $('#splitter').addEventListener('pointerdown', e => {
    e.preventDefault();
    const r = main.getBoundingClientRect();
    const move = ev => setWidth(((ev.clientX - r.left) / r.width) * 100);
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); saveUi(); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
}

// ---------- オフライン（PWA） ----------
function setupServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch(err => console.warn('Service Worker を登録できませんでした', err));
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;
    const bar = $('#updateBar');
    bar.hidden = false;
  });
  $('#updateReload').addEventListener('click', () => location.reload());
}

// ---------- 起動 ----------
async function start() {
  await store.loadLocal();
  await fileio.restoreHandle();
  setupLayout();
  setupMenu();
  store.on('commit', () => { renderRight(); renderLeftPane(false); updateDirty(); });
  store.on('touch', debounce(() => { if (!isStatic(ui.leftTab)) renderLeftPane(); updateDirty(); }, 300));
  store.on('dirty', updateDirty);
  window.addEventListener('left-redraw', () => renderLeftPane());
  window.addEventListener('beforeunload', e => {
    if (store.dirty) { e.preventDefault(); e.returnValue = ''; }
  });
  renderRight();
  renderLeftPane();
  updateDirty();
  setupServiceWorker();
}

start();
