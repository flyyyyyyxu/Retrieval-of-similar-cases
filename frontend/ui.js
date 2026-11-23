export const $ = (selector, root = document) => root.querySelector(selector);
export const esc = value => String(value ?? '').replace(/[&<>"']/g,
  char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const paths = {
  folder: '<path d="M3 7V4h7l2 3h9v13H3Z"/>',
  report: '<path d="M5 3h10l4 4v14H5Z"/><path d="M14 3v5h5M8 12h8M8 16h8"/>',
  'report-add': '<path d="M5 3h10l4 4v7M14 3v5h5M5 3v18h7M8 12h5M17 15v6M14 18h6"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  print: '<path d="M6 8V3h12v5M6 17H3V9h18v8h-3M6 14h12v7H6Z"/><path d="M17 11h1"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z"/>',
  list: '<path d="M8 5h13M8 12h13M8 19h13M3 5h1M3 12h1M3 19h1"/>',
  chart: '<path d="M12 3a9 9 0 1 0 9 9h-9V3Z"/><path d="M15 2v7h7a8 8 0 0 0-7-7Z"/>',
  spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/><path d="M20 2v4m-2-2h4"/>',
  send: '<path d="m21 3-6 18-4-8-8-4 18-6ZM11 13l10-10"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>', back: '<path d="M20 12H4m6-6-6 6 6 6"/>',
  plus: '<path d="M12 4v16M4 12h16"/>',
  book: '<path d="M12 5v15M3 4c4-1 6 0 9 2 3-2 5-3 9-2v14c-4-1-6 0-9 2-3-2-5-3-9-2Z"/>',
  history: '<path d="M3 10a9 9 0 1 1 1 7M3 4v6h6m3-3v6l4 2"/>',
  bookmark: '<path d="M6 3h12v18l-6-4-6 4Z"/>', close: '<path d="m6 6 12 12M6 18 18 6"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>', menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
};
export const icon = name => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.book}</svg>`;
export const logo = () => `<a href="#/" class="brand" aria-label="清案，返回产品首页"><span class="brand-mark">${icon('book')}</span><span>清案</span><span class="brand-divider"></span><small>类案检索</small></a>`;
export const caseHash = (id, paragraph) => `#/case/${encodeURIComponent(id)}${paragraph ? `/${encodeURIComponent(paragraph)}` : ''}`;
export const modeLabel = mode => ({ mock: '本地样例数据', es: '案例库检索', replay: '缓存回放' })[mode] || '服务连接中';
export const sourceLabel = type => ({ demo: '虚构演示案例', guiding: '指导性案例', typical: '官方典型案例', reference: '入库参考案例', judgment: '裁判文书' })[type] || '来源类型待确认';
export const typeLabel = type => ({ 'private-lending': '民间借贷纠纷', 'financial-loan': '金融借款合同纠纷' })[type] || type || '待确认';
const degradationLabels = {
  llm_unavailable: '模型未配置或调用失败，当前使用规则处理。',
  query_broadened: '严格匹配结果较少，已补充宽松关键词匹配；显式筛选条件保留。',
  rerank_skipped: '未完成模型重排，当前沿用基础召回排序。',
  explain_fallback: '当前仅展示命中关键词的原文摘录，不代表已完成相似性判断。',
  citation_dropped: '部分引用未通过原文校验，对应内容已移除。',
};
export function degradation(codes = []) {
  if (!codes.length) return '';
  return `<aside class="service-notice" aria-label="处理说明"><ul>${[...new Set(codes)].map(code => `<li>${esc(degradationLabels[code] || code)}</li>`).join('')}</ul></aside>`;
}
export function empty(title, description, action = '') {
  return `<div class="empty-state">${icon('search')}<h2 tabindex="-1">${esc(title)}</h2><p>${esc(description)}</p>${action}</div>`;
}
export function loading(title, description, cancel = false) {
  return `<section class="loading-state" role="status"><span class="loader"></span><h2 tabindex="-1">${esc(title)}</h2><p>${esc(description)}</p>${cancel ? '<button type="button" class="text-button" data-action="cancel">取消</button>' : ''}</section>`;
}
export function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove('show'), 2600);
}
export function safeSource(url) {
  try {
    const parsed = new URL(url);
    return ['https:', 'http:'].includes(parsed.protocol) ? parsed.href : null;
  } catch { return null; }
}
