// 小さな共通関数

// DOM要素を作る。h('div', {class: 'x', onclick: fn}, 子要素...)
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  let value;
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'value') value = v;
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, children);
  // select の value は option を入れてから設定する
  if (value !== undefined) el.value = value;
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
}

// 文字数（改行は数えない。絵文字なども1文字として数える）
export function countChars(s) {
  return [...(s || '').replace(/\r?\n/g, '')].length;
}

export function uid(prefix = 'x') {
  return prefix + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 6);
}

export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let toastTimer;
export function toast(msg, ms = 2500) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

// 文字数表示つきの入力欄（textarea）
export function counted(textareaProps, getLimit) {
  const ta = h('textarea', textareaProps);
  const counter = h('div', { class: 'counter' });
  const update = () => {
    const n = countChars(ta.value);
    const limit = getLimit();
    counter.textContent = limit ? `${n} / ${limit} 文字` : `${n} 文字`;
    const over = limit && n > limit;
    counter.classList.toggle('over', !!over);
    if (over) counter.textContent += `（${n - limit}文字オーバー）`;
  };
  ta.addEventListener('input', update);
  update();
  return { ta, counter, update };
}

// テキストエリアの高さを内容に合わせる
export function autoGrow(ta, min = 3) {
  ta.rows = min;
  const fit = () => {
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 2 + 'px';
  };
  ta.addEventListener('input', fit);
  requestAnimationFrame(fit);
  return ta;
}
