// ドラッグ操作（マウス・指の両対応）。Pointer Events で動かす。
//
// sortable(container, {group, onDrop}) …並べ替え。container 直下の [data-id] 要素の
//   つまみ（.handle）をつかんで動かす。同じ group の別の入れ物へも移せる。
// draggable(el, {group, onDrop, onClick}) …ラベルなどを [data-drop-group] の場所へ置く。

const opts = new WeakMap();
let suppressClick = false;
document.addEventListener('click', e => {
  if (suppressClick) { e.stopPropagation(); e.preventDefault(); suppressClick = false; }
}, true);

export function sortable(container, o) {
  container.dataset.sortGroup = o.group;
  opts.set(container, o);
  container.addEventListener('pointerdown', e => {
    const handle = e.target.closest('.handle');
    if (!handle || e.button > 0) return;
    const item = handle.closest('[data-id]');
    if (!item || item.parentElement !== container) return;
    e.preventDefault();
    startSort(e, item, container, o);
  });
}

export function draggable(el, o) {
  el.addEventListener('pointerdown', e => {
    if (e.button > 0) return;
    e.preventDefault();
    startDrop(e, el, o);
  });
}

// ---- 共通：つかんで動かす ----
function track(e, el, { onStart, onMove, onEnd, onCancel, onClick }) {
  const sx = e.clientX, sy = e.clientY;
  let dragging = false, ghost, x = sx, y = sy, raf;
  const scroller = el.closest('.pane-body') || document.scrollingElement;

  const begin = () => {
    dragging = true;
    const r = el.getBoundingClientRect();
    ghost = el.cloneNode(true);
    ghost.classList.add('drag-ghost');
    Object.assign(ghost.style, { width: r.width + 'px', left: r.left + 'px', top: r.top + 'px' });
    ghost.dataset.dx = sx - r.left;
    ghost.dataset.dy = sy - r.top;
    document.body.append(ghost);
    document.body.classList.add('dragging');
    onStart?.();
    loop();
  };
  const place = () => {
    ghost.style.left = x - ghost.dataset.dx + 'px';
    ghost.style.top = y - ghost.dataset.dy + 'px';
    onMove(x, y, document.elementFromPoint(x, y));
  };
  // 端に近づいたら自動でスクロール
  const loop = () => {
    const r = scroller.getBoundingClientRect();
    const edge = 60;
    let dy = 0;
    if (y < r.top + edge) dy = -Math.ceil((r.top + edge - y) / 4);
    else if (y > r.bottom - edge) dy = Math.ceil((y - (r.bottom - edge)) / 4);
    if (dy) { scroller.scrollTop += dy; place(); }
    raf = requestAnimationFrame(loop);
  };
  const move = ev => {
    if (ev.pointerId !== e.pointerId) return;
    x = ev.clientX; y = ev.clientY;
    if (!dragging && Math.hypot(x - sx, y - sy) > 6) begin();
    if (dragging) { ev.preventDefault(); place(); }
  };
  const finish = ev => {
    if (ev.pointerId !== e.pointerId) return;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', finish);
    window.removeEventListener('pointercancel', finish);
    cancelAnimationFrame(raf);
    if (!dragging) { if (ev.type === 'pointerup') onClick?.(); return; }
    ghost.remove();
    document.body.classList.remove('dragging');
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 0);
    if (ev.type === 'pointercancel') onCancel?.();
    else onEnd(document.elementFromPoint(x, y));
  };
  window.addEventListener('pointermove', move, { passive: false });
  window.addEventListener('pointerup', finish);
  window.addEventListener('pointercancel', finish);
}

// ---- 並べ替え ----
function startSort(e, item, container, o) {
  const ph = document.createElement('div');
  ph.className = 'drop-placeholder';
  const groupSel = `[data-sort-group="${o.group}"]`;
  const restore = () => { ph.remove(); item.classList.remove('drag-source'); };
  track(e, item, {
    onStart() {
      ph.style.height = item.getBoundingClientRect().height + 'px';
      item.before(ph);
      item.classList.add('drag-source');
    },
    onMove(x, y, target) {
      const cont = target?.closest(groupSel);
      if (!cont) return;
      const items = [...cont.children].filter(c => c.dataset.id && c !== item && c !== ph);
      const before = items.find(c => {
        const r = c.getBoundingClientRect();
        return y < r.top + r.height / 2;
      });
      if (before) before.before(ph);
      else if (items.length) items[items.length - 1].after(ph);
      else cont.prepend(ph);
    },
    onEnd() {
      const cont = ph.parentElement;
      // 置き場所（目印）より前にある項目の数 ＝ 新しい位置
      const idx = [...cont.children].filter(c => (c.dataset.id && c !== item) || c === ph).indexOf(ph);
      restore();
      if (idx >= 0) o.onDrop({ id: item.dataset.id, to: cont, index: idx, from: container });
    },
    onCancel: restore,
  });
}

// ---- ラベルを置く ----
function startDrop(e, el, o) {
  const groupSel = `[data-drop-group="${o.group}"]`;
  let hover = null;
  const setHover = t => {
    if (hover === t) return;
    hover?.classList.remove('drop-hover');
    hover = t;
    hover?.classList.add('drop-hover');
  };
  track(e, el, {
    onStart: () => el.classList.add('drag-origin'),
    onMove: (x, y, target) => setHover(target?.closest(groupSel) || null),
    onEnd() {
      const t = hover;
      setHover(null);
      el.classList.remove('drag-origin');
      if (t) o.onDrop(t);
    },
    onCancel() { setHover(null); el.classList.remove('drag-origin'); },
    onClick: o.onClick,
  });
}
