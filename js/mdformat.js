// md への書き出しと、md からの読み込み。書式の規則は README.md を参照。
import {
  SETTING_FIELDS, CHAR_LINE_FIELDS, CHAR_TEXT_FIELDS, RULE_LISTS,
  newState, normalize, allSections, episodeNumbers, labelsBySection, chapterNumbers, pad3,
} from './model.js';

export const MARKER = '<!-- plot-editor v1 -->';

const H = {
  settings: '初期設定',
  characters: 'キャラクター',
  synopsis: 'あらすじ',
  structure: '部/章/節',
  foreshadows: '伏線と回収',
  engines: 'エンジン',
  episodes: 'エピソード',
  checklist: 'チェックリスト',
};

// ---------- 書き出し ----------

const oneLine = v => String(v ?? '').replace(/\r?\n/g, ' ').trim();

// 複数行の文章。行頭の # や <!-- や \ は見出し・目印と区別するため \ を付ける
function text(v) {
  const s = String(v ?? '').replace(/\r\n?/g, '\n').replace(/^\n+|\s+$/g, '');
  if (!s) return [];
  return s.split('\n').map(l => (/^\s*(#|<!--|\\)/.test(l) ? '\\' + l : l));
}

function meta(obj) {
  // JSON の中に --> が現れないように > を逃がす
  return `<!-- ${JSON.stringify(obj).replace(/>/g, '\\u003e')} -->`;
}

export function toMarkdown(s) {
  const L = [];
  const push = (...lines) => L.push(...lines);
  const nums = episodeNumbers(s);
  const chNo = chapterNumbers(s);

  push(`# ${oneLine(s.settings.title) || '無題'}`, MARKER, '');
  push('> このファイルは plot-editor で作った小説のプロットです。見出しの構造を変えずに編集すれば、plot-editor で読み込み直せます。', '');

  push(`## ${H.settings}`, '');
  for (const [k, label] of SETTING_FIELDS) push(`### ${label}`, ...text(s.settings[k]), '');

  push(`## ${H.characters}`, '');
  for (const c of s.characters) {
    push(`### ${oneLine(c.name)}`, meta({ id: c.id }));
    for (const [k, label] of CHAR_LINE_FIELDS) push(`- ${label}: ${oneLine(c[k])}`);
    push('');
    for (const [k, label] of CHAR_TEXT_FIELDS) push(`#### ${label}`, ...text(c[k]), '');
  }

  push(`## ${H.synopsis}`, meta({ limit: s.synopsis.limit || 0 }), ...text(s.synopsis.text), '');

  for (const [k, label] of RULE_LISTS) {
    push(`## ${label}`);
    for (const r of s.rules[k]) push(`- ${oneLine(r)}`);
    push('');
  }

  push(`## ${H.structure}`, meta({ template: s.structure.template, show: s.structure.show }), '');
  const labels = labelsBySection(s);
  s.structure.parts.forEach((p, pi) => {
    push(`### 第${pi + 1}部 ${oneLine(p.title)}`.trimEnd(), meta({ id: p.id }), ...text(p.memo), '');
    for (const c of p.chapters) {
      push(`#### 第${chNo.get(c.id)}章 ${oneLine(c.title)}`.trimEnd(), meta({ id: c.id, person: c.person }));
      push(...text(c.memo));
      push('<!-- list -->', `- 人称: ${oneLine(c.person || s.settings.person) || '（未設定）'}${c.person ? '' : '（初期設定）'}`, '<!-- /list -->', '');
      c.sections.forEach((x, si) => {
        push(`##### 第${si + 1}節 ${oneLine(x.title)}`.trimEnd(), meta({ id: x.id }), ...text(x.memo));
        const list = [];
        for (const e of s.episodes) if (e.sectionId === x.id) list.push(`- ${pad3(nums.get(e.id))} ${oneLine(e.title)}`.trimEnd());
        for (const l of labels.get(x.id) || []) list.push('- ' + labelLine(l));
        if (list.length) push('<!-- list -->', ...list, '<!-- /list -->');
        push('');
      });
    }
  });
  const unplaced = s.episodes.filter(e => !e.sectionId);
  if (unplaced.length) {
    push('<!-- list -->', '未配置のエピソード：');
    for (const e of unplaced) push(`- ${pad3(nums.get(e.id))} ${oneLine(e.title)}`.trimEnd());
    push('<!-- /list -->', '');
  }

  push(`## ${H.foreshadows}`, '');
  for (const f of s.foreshadows) {
    push(`### ${oneLine(f.label)}`, meta({ id: f.id, setupAt: f.setupAt, payoffAt: f.payoffAt }), '');
    push('#### 伏線', ...text(f.setup), '', '#### 回収', ...text(f.payoff), '');
  }

  push(`## ${H.engines}`, '');
  for (const g of s.engines) {
    push(`### ${oneLine(g.label)}`, meta({ id: g.id, kind: g.kind, from: g.from, to: g.to }), `- 種類: ${g.kind}`, ...text(g.content), '');
  }

  push(`## ${H.episodes}`, '');
  for (const e of s.episodes) {
    push(`### ${pad3(nums.get(e.id))} ${oneLine(e.title)}`.trimEnd(), meta({ id: e.id, section: e.sectionId }), ...text(e.body), '');
  }

  push(`## ${H.checklist}`);
  for (const k of s.checklist) push(`- [${k.done ? 'x' : ' '}] ${oneLine(k.text)}`);
  push('');

  return L.join('\n');
}

function labelLine(l) {
  const name = `「${oneLine(l.item.label) || '（無題）'}」`;
  switch (l.type) {
    case 'setup': return `【伏線】${name}`;
    case 'payoff': return `【回収】${name}`;
    case 'from': return `【エンジン開始・${l.item.kind}】${name}`;
    case 'during': return `【エンジン継続・${l.item.kind}】${name}`;
    case 'to': return `【エンジン終了・${l.item.kind}】${name}`;
  }
}

// ---------- 読み込み ----------

// 見出しで木構造にする
function tree(src) {
  const root = { level: 0, title: '', lines: [], children: [] };
  const stack = [root];
  for (const line of src.replace(/\r\n?/g, '\n').split('\n')) {
    const m = /^(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/.exec(line);
    if (m) {
      const node = { level: m[1].length, title: m[2] || '', lines: [], children: [] };
      while (stack[stack.length - 1].level >= node.level) stack.pop();
      stack[stack.length - 1].children.push(node);
      stack.push(node);
    } else {
      stack[stack.length - 1].lines.push(line);
    }
  }
  return root;
}

function nodeMeta(node) {
  for (const l of node.lines) {
    if (!l.trim()) continue;
    const m = /^\s*<!--\s*(\{.*\})\s*-->\s*$/.exec(l);
    if (m) { try { return JSON.parse(m[1]); } catch { return {}; } }
    return {};
  }
  return {};
}

// 目印・一覧を除いた本文
function nodeText(node) {
  const out = [];
  let inList = false, metaDone = false;
  for (const l of node.lines) {
    if (!metaDone && l.trim()) {
      metaDone = true;
      if (/^\s*<!--\s*\{.*\}\s*-->\s*$/.test(l)) continue;
    }
    if (/^\s*<!--\s*list\s*-->\s*$/.test(l)) { inList = true; continue; }
    if (/^\s*<!--\s*\/list\s*-->\s*$/.test(l)) { inList = false; continue; }
    if (inList) continue;
    out.push(l.startsWith('\\') ? l.slice(1) : l);
  }
  return out.join('\n').replace(/^\n+|\s+$/g, '');
}

function listItems(node) {
  return node.lines.filter(l => /^\s*[-*] /.test(l)).map(l => l.replace(/^\s*[-*] /, '').trim());
}

const stripNo = (title, re) => title.replace(re, '');

export function fromMarkdown(src) {
  const root = tree(src);
  const s = newState();
  // 大項目（##）を集める。# が無い場合にも対応
  const sections = new Map();
  const collect = n => {
    for (const c of n.children) {
      if (c.level === 2) sections.set(c.title.trim(), c);
      else if (c.level < 2) collect(c);
    }
  };
  collect(root);
  if (!sections.size) throw new Error('plot-editor の形式のmdではありません（「## 初期設定」などの見出しがありません）');
  const sub = (n, title) => n?.children.find(c => c.title.trim() === title);

  const st = sections.get(H.settings);
  for (const [k, label] of SETTING_FIELDS) s.settings[k] = sub(st, label) ? nodeText(sub(st, label)) : '';

  const ch = sections.get(H.characters);
  s.characters = (ch?.children || []).map(n => {
    const c = { id: nodeMeta(n).id, name: n.title.trim() };
    for (const [k, label] of CHAR_LINE_FIELDS) {
      const line = n.lines.find(l => l.startsWith(`- ${label}:`));
      c[k] = line ? line.slice(label.length + 3).trim() : '';
    }
    for (const [k, label] of CHAR_TEXT_FIELDS) c[k] = sub(n, label) ? nodeText(sub(n, label)) : '';
    return c;
  });

  const syn = sections.get(H.synopsis);
  if (syn) {
    s.synopsis.text = nodeText(syn);
    const lim = nodeMeta(syn).limit;
    s.synopsis.limit = Number.isFinite(lim) ? lim : 800;
  }

  for (const [k, label] of RULE_LISTS) {
    const n = sections.get(label);
    s.rules[k] = n ? listItems(n) : [];
  }

  const str = sections.get(H.structure);
  if (str) {
    const m = nodeMeta(str);
    if (m.template) s.structure.template = m.template;
    if (Array.isArray(m.show)) s.structure.show = m.show;
    s.structure.parts = str.children.map(pn => ({
      id: nodeMeta(pn).id,
      title: stripNo(pn.title, /^第\d+部\s?/),
      memo: nodeText(pn),
      chapters: pn.children.map(cn => {
        const cm = nodeMeta(cn);
        return {
          id: cm.id,
          title: stripNo(cn.title, /^第\d+章\s?/),
          memo: nodeText(cn),
          person: cm.person || '',
          sections: cn.children.map(sn => ({
            id: nodeMeta(sn).id,
            title: stripNo(sn.title, /^第\d+節\s?/),
            memo: nodeText(sn),
          })),
        };
      }),
    }));
  }

  const fs = sections.get(H.foreshadows);
  s.foreshadows = (fs?.children || []).map(n => {
    const m = nodeMeta(n);
    return {
      id: m.id, label: n.title.trim(),
      setup: sub(n, '伏線') ? nodeText(sub(n, '伏線')) : '',
      payoff: sub(n, '回収') ? nodeText(sub(n, '回収')) : '',
      setupAt: m.setupAt, payoffAt: m.payoffAt,
    };
  });

  const en = sections.get(H.engines);
  s.engines = (en?.children || []).map(n => {
    const m = nodeMeta(n);
    const kindLine = n.lines.find(l => l.startsWith('- 種類:'));
    const content = nodeText({ lines: n.lines.filter(l => l !== kindLine) });
    return {
      id: m.id, label: n.title.trim(),
      kind: m.kind || (kindLine ? kindLine.slice(5).trim() : '謎'),
      content, from: m.from, to: m.to,
    };
  });

  const ep = sections.get(H.episodes);
  s.episodes = (ep?.children || []).map(n => {
    const m = nodeMeta(n);
    return { id: m.id, title: stripNo(n.title, /^\d+(\s|$)/), body: nodeText(n), sectionId: m.section ?? null };
  });

  const cl = sections.get(H.checklist);
  if (cl) {
    s.checklist = cl.lines
      .map(l => /^\s*[-*] \[( |x|X)\] ?(.*)$/.exec(l))
      .filter(Boolean)
      .map(m => ({ text: m[2].trim(), done: m[1] !== ' ' }));
  }

  return normalize(s);
}
