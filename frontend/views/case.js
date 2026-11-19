import { state, documentKey, isSaved } from '../store.js';
import { esc, icon, empty, loading, sourceLabel, safeSource, caseHash } from '../ui.js';

export function casePage(id, target) {
  const key = documentKey(id), c = state.documents.get(key), error = state.documentErrors.get(key);
  const back = `<a class="text-button" href="${state.returnTo === 'saved' ? '#/saved' : '#/results'}">${icon('back')} ${state.returnTo === 'saved' ? '返回我的收藏' : '返回检索结果'}</a>`;
  if (!c) return `<div class="document-page"><div class="document-toolbar">${back}</div>${error ? empty('暂时无法打开文书', error, `<button type="button" class="btn" data-action="retry-document" data-id="${esc(id)}">重试</button>`) : loading('正在读取文书', '加载原文与段落定位。')}</div>`;
  const saved = isSaved(id), source = safeSource(c.source_url);
  return `<div class="document-page"><div class="document-toolbar">${back}<div><button type="button" class="btn small ${saved ? 'saved-button' : ''}" data-action="save-case" data-id="${esc(id)}" aria-pressed="${saved}">${icon('bookmark')} ${saved ? '已收藏' : '收藏案例'}</button><button type="button" class="btn small" data-action="copy-citation" data-id="${esc(id)}">复制引用</button></div></div>
    <div class="document-layout"><nav class="document-toc" aria-label="文书目录"><span class="mini-label">文书段落</span>${c.paragraphs.map(p => `<a href="${esc(caseHash(id, p.id))}" class="${target === p.id ? 'active' : ''}">${esc(p.section || p.id)} · ${esc(p.id)}</a>`).join('')}</nav>
      <article class="document-paper"><div class="document-heading"><span class="eyebrow">${esc(sourceLabel(c.source_type))}${c.cause ? ` ／ ${esc(c.cause)}` : ''}</span><h1 tabindex="-1">${esc(c.title)}</h1><div class="doc-metadata">${[c.court, c.case_number, c.judge_date].filter(Boolean).map(v => `<span>${esc(v)}</span>`).join('')}</div>
      ${c.source_type === 'demo' ? '<p class="document-demo">虚构文书示例，仅用于验证流程，非真实裁判文书。</p>' : ''}
      ${source ? `<p class="source-link"><a href="${esc(source)}" target="_blank" rel="noopener noreferrer">打开来源页面 ↗</a></p>` : '<p class="source-link muted">未提供外部来源链接，当前可核对库内正文。</p>'}
      ${!c.full_text_available ? '<p class="service-notice">数据源未提供完整正文，以下内容可能不完整。</p>' : ''}
      ${target && !c.paragraphs.some(p => p.id === target) ? '<p class="service-notice">引用段落在当前正文中不存在，请核对文书版本。</p>' : ''}</div>
      ${c.paragraphs.length ? c.paragraphs.map((p, i) => `<section class="doc-section ${target === p.id ? 'target-section' : ''}" id="doc-${esc(p.id)}" tabindex="-1"><h2><span>${String(i + 1).padStart(2, '0')}</span>${esc(p.section || '原文段落')}<small>${target === p.id ? '引用定位' : esc(p.id)}</small></h2><p class="quoted-paragraph">${esc(p.text)}</p></section>`).join('') : '<p class="service-notice">暂无可用正文段落。</p>'}<div class="doc-end">—— 当前文书内容结束 ——</div></article>
    </div></div>`;
}
