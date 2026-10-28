// 右画面のタブ切り替え（各画面から呼べるようにするための窓口）
let impl = () => {};
export const setNav = fn => (impl = fn);
export const goto = (tab, opts) => impl(tab, opts);
