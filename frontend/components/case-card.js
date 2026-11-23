import { esc, icon, caseHash } from '../ui.js';
import { state, isSaved, documentKey } from '../store.js';

const fields = [
  ['analysis', '案例分析', []],
  ['overview', '案情概要', ['案情概要', '案件概要', '基本案情']],
  ['opinion', '本院认为', ['本院认为', '裁判理由', '裁判要旨']],
  ['facts', '本院查明', ['本院查明', '经审理查明', '审理查明', '案件事实', '事实认定']],
  ['claims', '诉讼请求', ['诉讼请求', '原告诉称']],
  ['defense', '辩方观点', ['辩方观点', '被告辩称', '被告答辩', '答辩意见']],
  ['issues', '争议焦点', ['争议焦点', '争议问题']],
  ['evidence', '证据', ['证据', '举证质证', '证据认定']],
  ['result', '裁判结果', ['裁判结果', '判决如下', '裁定如下', '判决结果']],
];

export function highlightText(text) {
  const keywords = [...new Set(state.resultQuery?.keywords || [])]
    .filter(word => word.length > 1 && word.length < 100).slice(0, 12).sort((a, b) => b.length - a.length);
  if (!keywords.length) return esc(text);
  const pattern = new RegExp(`(${keywords.map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
  return text.split(pattern).map((part, i) => i % 2 ? `<mark>${esc(part)}</mark>` : esc(part)).join('');
}

// Measure the rendered excerpt: character counts cannot predict Chinese wrapping.
export function updateExcerptControls(root = document) {
  for (const panel of root.querySelectorAll('[role=tabpanel]:not([hidden])')) {
    const content = panel.querySelector('.case-field-content');
    const toggle = panel.querySelector('[data-action=expand-case]');
    if (content && toggle) toggle.hidden = !content.classList.contains('is-expanded') && content.scrollHeight <= content.clientHeight + 1;
  }
}

export function contentSections(hit, doc) {
  if (doc?.content_sections != null) {
    return doc.content_sections.filter(section => section.origin !== 'ai' || (section.citations?.length && section.citations.every(c => c.verified && c.case_id === doc.id))).map(section => {
      const label = fields.find(field => field[0] === section.key)?.[1] || '相关内容';
      const paragraphs = section.text?.trim()
        ? [{ text: section.text, id: section.paragraph_ids[0] || '' }]
        : doc.paragraphs.filter(p => section.paragraph_ids.includes(p.id));
      return { key: section.key, label, paragraphs, paragraphIds: section.paragraph_ids, origin: section.origin, citations: section.citations || [] };
    }).filter(section => section.paragraphs.length);
  }
  const paragraphs = doc?.paragraphs || hit.snippets || [];
  if (hit.case.doc_type === '案例评析') return paragraphs.length ? [{ key: 'related', label: '相关内容', paragraphs }] : [];
  return fields.map(([key, label, aliases]) => ({ key, label, paragraphs: paragraphs.filter(p => aliases.includes(p.section)) }))
    .filter(section => section.paragraphs.length);
}

export function caseCard(hit, index, collection = false) {
  const c = hit.case, saved = isSaved(c.id), key = documentKey(c.id);
  const inReport = state.reportCases.has(c.id);
  const doc = state.documents.get(key);
  const error = state.documentErrors.get(key);
  const tabs = contentSections(hit, doc);
  const preferred = state.caseTabs.get(key) || (tabs.some(tab => tab.key === 'analysis') ? 'analysis' : 'opinion');
  const active = tabs.some(tab => tab.key === preferred) ? preferred : tabs[0]?.key;
  const token = encodeURIComponent(c.id);
  const origin = collection ? 'data-origin="saved"' : '';
  const expanded = state.expandedCases.has(key);
  const dateLabel = c.source_type === 'typical' && c.updated_date ? `${c.updated_date.replaceAll('-', '.')} 更新` : c.judge_date && `${c.judge_date.replaceAll('-', '.')} 裁判`;
  const metadata = [c.court, c.case_number, dateLabel].filter(Boolean);
  const badge = { guiding: '指导性案例', typical: '官方典型案例', reference: '入库参考案例' }[c.source_type];

  function panel(tab) {
    const paragraphs = tab.paragraphs;
    const selected = active === tab.key;
    const analysisNote = tab.origin === 'ai' ? '<p class="answer-note">AI归纳</p>' : '';
    // 每个栏目按自己的原文依据定位；跳过仅含“本院认为”等标题的空引导段。
    const sourceIds = [...(tab.paragraphIds || []), ...paragraphs.map(p => p.id)].filter(Boolean);
    const target = sourceIds.find(id => {
      const source = doc?.paragraphs.find(p => p.id === id);
      return source && !['本院认为', '本院查明', '经审理查明', '判决如下', '裁定如下'].includes(source.text.replace(/[：:，,。\s]/g, ''));
    }) || sourceIds[0];
    return `<div role="tabpanel" id="case-panel-${token}-${tab.key}" aria-labelledby="case-tab-${token}-${tab.key}" ${selected ? 'tabindex="0"' : 'hidden'}>${analysisNote}<div class="case-field-content ${expanded ? 'is-expanded' : ''}">
      ${paragraphs.length ? paragraphs.map(p => `<p>${highlightText(p.text)}</p>`).join('') : error ? `<p class="field-empty">暂时无法读取文书。<button type="button" class="text-button" data-action="retry-document" data-id="${esc(c.id)}">重试</button></p>` : !doc ? '<p class="field-empty" role="status">正在读取文书内容…</p>' : '<p class="field-empty">暂无该部分内容。</p>'}
    </div>${paragraphs.length ? `<div class="field-actions"><button type="button" class="text-button" data-action="expand-case" data-id="${esc(c.id)}">${expanded ? '收起' : '展开'} ${icon('chevron')}</button><a class="text-button view-original" href="${esc(caseHash(c.id, target))}" data-action="open-case" data-id="${esc(c.id)}" ${origin}>${target ? '定位原文' : '查看原文'} ${icon('arrow')}</a></div>` : ''}</div>`;
  }

  return `<article class="case-row reference-case" data-case-id="${esc(c.id)}" data-collection="${collection}" data-selected="${state.selectedCases.has(c.id)}">
    <div class="case-selection">${!collection ? `<input type="checkbox" class="case-checkbox" data-select-case="${esc(c.id)}" ${state.selectedCases.has(c.id) ? 'checked' : ''} aria-label="选择案例：${esc(c.title)}">` : ''}</div>
    <div class="case-body"><div class="case-head"><span class="case-rank">${index + 1}</span>${badge ? `<span class="case-kind">${badge}</span>` : ''}<a class="case-title" href="${esc(caseHash(c.id))}" data-action="open-case" data-id="${esc(c.id)}" ${origin}>${esc(c.title)}</a>
      <div class="case-quick-actions"><button type="button" class="icon-btn bookmark ${saved ? 'is-saved' : ''}" data-action="save-case" data-id="${esc(c.id)}" aria-label="${saved ? '管理收藏' : '收藏案例'}" aria-pressed="${saved}" title="${saved ? '管理收藏' : '收藏案例'}">${icon('bookmark')}</button>${!collection ? `<button type="button" class="icon-btn add-to-report" data-action="report-case" data-id="${esc(c.id)}" aria-label="${inReport ? '从检索报告移除' : '加入检索报告'}" aria-pressed="${inReport}" title="${inReport ? '从检索报告移除' : '加入检索报告'}">${icon('report-add')}</button><button type="button" class="icon-btn" data-action="explain" data-id="${esc(c.id)}" title="对照案情与差异" aria-label="对照案情与差异">${icon('spark')}</button>` : ''}</div>
      ${c.doc_type ? `<span class="document-type-pill">${esc(c.doc_type)}</span>` : ''}
    </div><div class="case-meta">${metadata.map(value => `<span>${esc(value)}</span>`).join('')}</div>
      <div class="case-fields" role="tablist" aria-label="${esc(c.title)}文书内容">${tabs.map(tab => `<button type="button" role="tab" id="case-tab-${token}-${tab.key}" data-action="case-field" data-id="${esc(c.id)}" data-field="${tab.key}" aria-selected="${active === tab.key}" tabindex="${active === tab.key ? '0' : '-1'}">${tab.label}</button>`).join('')}</div>
      <div class="case-field-panels">${tabs.length ? tabs.map(panel).join('') : `<div class="case-field-content"><p class="field-empty">${error ? '暂时无法读取文书。' : doc ? '暂无摘要内容。' : '正在读取文书内容…'}</p>${error ? `<button type="button" class="text-button" data-action="retry-document" data-id="${esc(c.id)}">重试</button>` : ''}<a class="text-button view-original" href="${esc(caseHash(c.id))}" data-action="open-case" data-id="${esc(c.id)}" ${origin}>查看原文 ${icon('arrow')}</a></div>`}</div>
    </div>
  </article>`;
}
