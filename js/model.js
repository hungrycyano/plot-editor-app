// データ構造と、データを操作する関数（画面には依存しない）
import { uid } from './util.js';

export const SETTING_FIELDS = [
  ['title', 'タイトル'],
  ['subtitle', 'サブタイトル'],
  ['catchcopy', 'キャッチコピー'],
  ['theme', 'テーマ'],
  ['genre', 'ジャンル'],
  ['world', '世界観'],
  ['era', '時代'],
  ['place', '場所'],
  ['person', '人称'],
  ['other', 'その他'],
];

// キャラクター：一行で書く項目
export const CHAR_LINE_FIELDS = [
  ['category', '分類'],
  ['age', '年齢'],
  ['gender', '性別'],
  ['role', '役職'],
];
// キャラクター：複数行で書く項目
export const CHAR_TEXT_FIELDS = [
  ['personalityGood', '性格（長所）'],
  ['personalityBad', '性格（短所）'],
  ['goalWish', '目的（本人の望み）'],
  ['goalRole', '目的（物語の中の役目）'],
  ['past', '過去'],
  ['relations', '人間関係'],
  ['likes', '好きなもの'],
  ['dislikes', '嫌いなもの'],
  ['other', 'その他'],
];

export const RULE_LISTS = [
  ['must', '必須事項'],
  ['ban', '禁止事項'],
  ['style', '文体ルール'],
];

export const TEMPLATES = {
  '起承転結': ['起', '承', '転', '結'],
  '序破急': ['序', '破', '急'],
  '三幕構成': ['第一幕（設定）', '第二幕（対立）', '第三幕（解決）'],
  '自由': [],
};

// 骨組み画面の上に表示できる注意項目
export const SHOW_ITEMS = [
  ['theme', 'テーマ'],
  ['catchcopy', 'キャッチコピー'],
  ['synopsis', 'あらすじ'],
  ['must', '必須事項'],
  ['ban', '禁止事項'],
  ['style', '文体ルール'],
];

export const ENGINE_KINDS = ['謎', '感情', '苦難', 'その他'];

export const EPISODE_LIMIT = 3000;

export const DEFAULT_CHECKLIST = [
  '物語の筋やエピソードが、テーマから離れていないか',
  '伏線・エンジンのラベルに抜けがないか',
  '時系列・内容・流れに問題がないか',
  '点と点がつながっているか',
  '文体が一貫しているか（文体ルールを参照）',
];

export function newState() {
  const settings = {};
  for (const [k] of SETTING_FIELDS) settings[k] = '';
  return {
    version: 1,
    settings,
    characters: [],
    synopsis: { text: '', limit: 800 },
    rules: {
      must: ['わかりやすい言葉で書く', '点と点をつなぐ'],
      ban: ['感情を書きすぎない', '説明しすぎない'],
      style: [],
    },
    structure: { template: '起承転結', show: ['theme', 'ban'], parts: [] },
    foreshadows: [],
    engines: [],
    episodes: [],
    checklist: DEFAULT_CHECKLIST.map(text => ({ id: uid('k'), text, done: false })),
  };
}

// テンプレート：4部（起承転結）・各3章・各1節・各節3エピソード（計36）の空の枠
export function templateState() {
  const s = newState();
  s.structure.parts = TEMPLATES['起承転結'].map(name => {
    const p = newPart(name);
    p.chapters = [newChapter(), newChapter(), newChapter()];
    return p;
  });
  for (const x of allSections(s)) for (let i = 0; i < 3; i++) s.episodes.push(newEpisode(x.sec.id));
  return s;
}

export function newCharacter() {
  const c = { id: uid('c'), name: '' };
  for (const [k] of [...CHAR_LINE_FIELDS, ...CHAR_TEXT_FIELDS]) c[k] = '';
  return c;
}
export const newSection = () => ({ id: uid('s'), title: '', memo: '' });
export const newChapter = () => ({ id: uid('ch'), title: '', memo: '', person: '', sections: [newSection()] });
export const newPart = (title = '') => ({ id: uid('p'), title, memo: '', chapters: [newChapter()] });
export const newEpisode = (sectionId = null) => ({ id: uid('e'), title: '', body: '', sectionId });

// 読み込んだデータの欠けを補い、整合性をとる
export function normalize(s) {
  const base = newState();
  s.version = 1;
  s.settings = { ...base.settings, ...(s.settings || {}) };
  s.characters = (s.characters || []).map(c => ({ ...newCharacter(), ...c }));
  s.synopsis = { ...base.synopsis, ...(s.synopsis || {}) };
  s.rules = { must: [], ban: [], style: [], ...(s.rules || {}) };
  s.structure = { ...base.structure, ...(s.structure || {}) };
  s.structure.parts = (s.structure.parts || []).map(p => ({
    id: p.id || uid('p'), title: p.title || '', memo: p.memo || '',
    chapters: (p.chapters || []).map(c => ({
      id: c.id || uid('ch'), title: c.title || '', memo: c.memo || '', person: c.person || '',
      sections: (c.sections || []).map(x => ({ id: x.id || uid('s'), title: x.title || '', memo: x.memo || '' })),
    })),
  }));
  const ids = new Set(allSections(s).map(x => x.sec.id));
  const ok = v => (v && ids.has(v) ? v : null);
  s.foreshadows = (s.foreshadows || []).map(f => ({
    id: f.id || uid('f'), label: f.label || '', setup: f.setup || '', payoff: f.payoff || '',
    setupAt: ok(f.setupAt), payoffAt: ok(f.payoffAt),
  }));
  s.engines = (s.engines || []).map(g => ({
    id: g.id || uid('g'), label: g.label || '', kind: g.kind || '謎', content: g.content || '',
    from: ok(g.from), to: ok(g.to),
  }));
  s.episodes = (s.episodes || []).map(e => ({
    id: e.id || uid('e'), title: e.title || '', body: e.body || '', sectionId: ok(e.sectionId),
  }));
  s.checklist = (s.checklist || []).map(k => ({ id: k.id || uid('k'), text: k.text || '', done: !!k.done }));
  sortEpisodes(s);
  return s;
}

// 編集のたびに呼ぶ軽い整合性チェック（オブジェクトは作り直さない）
export function tidy(s) {
  const ids = new Set(allSections(s).map(x => x.sec.id));
  detachSections(s, [...new Set([
    ...s.episodes.map(e => e.sectionId),
    ...s.foreshadows.flatMap(f => [f.setupAt, f.payoffAt]),
    ...s.engines.flatMap(g => [g.from, g.to]),
  ])].filter(v => v && !ids.has(v)));
  sortEpisodes(s);
}

// 骨組みの順に並べた節の一覧
export function allSections(s) {
  const out = [];
  let chapterNo = 0;
  s.structure.parts.forEach((part, pi) => {
    part.chapters.forEach(ch => {
      chapterNo++;
      ch.sections.forEach((sec, si) => {
        out.push({ sec, ch, part, partNo: pi + 1, chapterNo, sectionNo: si + 1, index: out.length });
      });
    });
  });
  return out;
}

export function sectionMap(s) {
  return new Map(allSections(s).map(x => [x.sec.id, x]));
}

export function sectionName(x) {
  if (!x) return '未配置';
  return `第${x.partNo}部 第${x.chapterNo}章 第${x.sectionNo}節` + (x.sec.title ? ` ${x.sec.title}` : '');
}

// 章の通し番号
export function chapterNumbers(s) {
  const m = new Map();
  let n = 0;
  for (const p of s.structure.parts) for (const c of p.chapters) m.set(c.id, ++n);
  return m;
}

// エピソードを「骨組みの順 → 節の中の順」に並べ直す。未配置は最後。
export function sortEpisodes(s) {
  const order = new Map(allSections(s).map((x, i) => [x.sec.id, i]));
  const rank = e => (e.sectionId != null && order.has(e.sectionId) ? order.get(e.sectionId) : Infinity);
  s.episodes = s.episodes
    .map((e, i) => ({ e, i }))
    .sort((a, b) => rank(a.e) - rank(b.e) || a.i - b.i)
    .map(x => x.e);
}

// 通し番号（並べ直したあとの配列の順）
export function episodeNumbers(s) {
  return new Map(s.episodes.map((e, i) => [e.id, i + 1]));
}

export const pad3 = n => String(n).padStart(3, '0');

// エピソードを、ある節（null=未配置）の index 番目へ移す
export function moveEpisode(s, id, sectionId, index) {
  const ep = s.episodes.find(e => e.id === id);
  if (!ep) return;
  const rest = s.episodes.filter(e => e !== ep);
  ep.sectionId = sectionId;
  const group = rest.filter(e => e.sectionId === sectionId);
  let pos;
  if (index < group.length) pos = rest.indexOf(group[index]);
  else if (group.length) pos = rest.indexOf(group[group.length - 1]) + 1;
  else pos = rest.length;
  rest.splice(pos, 0, ep);
  s.episodes = rest;
  sortEpisodes(s);
}

// 新しいエピソードを追加する。afterId があればその直後（割り込み挿入）
export function addEpisode(s, { sectionId = null, afterId = null, beforeId = null } = {}) {
  const ref = s.episodes.find(e => e.id === (afterId || beforeId));
  const ep = newEpisode(ref ? ref.sectionId : sectionId);
  if (ref) s.episodes.splice(s.episodes.indexOf(ref) + (afterId ? 1 : 0), 0, ep);
  else {
    // 指定した節の最後へ
    const group = s.episodes.filter(e => e.sectionId === ep.sectionId);
    const last = group[group.length - 1];
    s.episodes.splice(last ? s.episodes.indexOf(last) + 1 : s.episodes.length, 0, ep);
  }
  sortEpisodes(s);
  return ep;
}

// 節を消したときに、そこを参照しているものを未配置に戻す
export function detachSections(s, sectionIds) {
  const ids = new Set(sectionIds);
  for (const e of s.episodes) if (ids.has(e.sectionId)) e.sectionId = null;
  for (const f of s.foreshadows) {
    if (ids.has(f.setupAt)) f.setupAt = null;
    if (ids.has(f.payoffAt)) f.payoffAt = null;
  }
  for (const g of s.engines) {
    if (ids.has(g.from)) g.from = null;
    if (ids.has(g.to)) g.to = null;
  }
}

// 節に入っているものの数（削除の確認用）
export function contentCount(s, sectionIds) {
  const ids = new Set(sectionIds);
  const eps = s.episodes.filter(e => ids.has(e.sectionId)).length;
  const labels =
    s.foreshadows.reduce((n, f) => n + ids.has(f.setupAt) + ids.has(f.payoffAt), 0) +
    s.engines.reduce((n, g) => n + ids.has(g.from) + ids.has(g.to), 0);
  return { eps, labels };
}

export const partSectionIds = p => p.chapters.flatMap(c => c.sections.map(x => x.id));
export const chapterSectionIds = c => c.sections.map(x => x.id);

// 自動チェック（警告の一覧）
export function autoCheck(s) {
  const map = sectionMap(s);
  const idx = id => map.get(id)?.index;
  const nums = episodeNumbers(s);
  const warn = [];
  for (const f of s.foreshadows) {
    const name = `伏線「${f.label || '（無題）'}」`;
    if (!f.setupAt && !f.payoffAt) warn.push(`${name}：伏線・回収ともに未配置です`);
    else if (!f.setupAt) warn.push(`${name}：伏線が未配置です`);
    else if (!f.payoffAt) warn.push(`${name}：回収が未配置です`);
    else if (idx(f.payoffAt) < idx(f.setupAt)) warn.push(`${name}：回収が伏線より前の節にあります`);
  }
  for (const g of s.engines) {
    const name = `エンジン「${g.label || '（無題）'}」`;
    if (!g.from && !g.to) warn.push(`${name}：開始・終了ともに未配置です`);
    else if (!g.from) warn.push(`${name}：開始が未配置です`);
    else if (!g.to) warn.push(`${name}：終了が未配置です`);
    else if (idx(g.to) < idx(g.from)) warn.push(`${name}：終了が開始より前の節にあります`);
  }
  const unplaced = s.episodes.filter(e => !e.sectionId).length;
  if (unplaced) warn.push(`未配置のエピソードが ${unplaced} 件あります`);
  for (const e of s.episodes) {
    const n = [...e.body.replace(/\r?\n/g, '')].length;
    if (n > EPISODE_LIMIT) warn.push(`エピソード ${pad3(nums.get(e.id))}「${e.title || '（無題）'}」が ${EPISODE_LIMIT}文字を超えています（${n}文字）`);
  }
  const syn = [...s.synopsis.text.replace(/\r?\n/g, '')].length;
  if (s.synopsis.limit && syn > s.synopsis.limit) warn.push(`あらすじが上限 ${s.synopsis.limit}文字を超えています（${syn}文字）`);
  return warn;
}

// 節ごとのラベル（伏線・回収・エンジン）を集める
export function labelsBySection(s) {
  const secs = allSections(s);
  const index = new Map(secs.map(x => [x.sec.id, x.index]));
  const m = new Map(secs.map(x => [x.sec.id, []]));
  for (const f of s.foreshadows) {
    if (f.setupAt) m.get(f.setupAt).push({ type: 'setup', item: f });
    if (f.payoffAt) m.get(f.payoffAt).push({ type: 'payoff', item: f });
  }
  for (const g of s.engines) {
    if (g.from) m.get(g.from).push({ type: 'from', item: g });
    if (g.from && g.to) {
      let a = index.get(g.from), b = index.get(g.to);
      if (a > b) [a, b] = [b, a];
      for (let i = a + 1; i < b; i++) m.get(secs[i].sec.id).push({ type: 'during', item: g });
    }
    if (g.to) m.get(g.to).push({ type: 'to', item: g });
  }
  return m;
}
