import { state } from '../store.js';
import { esc, caseHash } from '../ui.js';

export function searchAnswer() {
  if (!state.result) return '';
  if (state.answerStatus === 'loading') return '<section class="search-answer" aria-label="检索分析"><p class="answer-status" role="status">正在整理总结、裁判观点与案例比较…</p></section>';
  const answer = state.answer;
  const hits = state.result.hits;
  const valid = point => answer?.status === 'ready' && point?.text && point.citations?.length
    && point.citations.every(c => c.verified && hits.some(h => h.case.id === c.case_id));
  const summary = valid(answer?.conclusion) ? answer.conclusion : null;
  const viewpoint = valid(answer?.judicial_view) ? answer.judicial_view : null;
  const comparisons = (answer?.case_comparison || []).filter(valid);
  const judicialPoints = (answer?.judicial_points || []).filter(valid);
  const candidateTable = answer?.comparison_table;
  const comparisonTable = answer?.status === 'ready' && candidateTable?.cases?.length >= 2
    && new Set(candidateTable.cases.map(c => c.id)).size === candidateTable.cases.length
    && candidateTable.cases.every(c => hits.some(h => h.case.id === c.id))
    && candidateTable.rows?.length && candidateTable.rows.every(row => row.cells?.length === candidateTable.cases.length)
      ? candidateTable : null;
  const tablePoints = comparisonTable ? comparisonTable.rows.flatMap(row => row.cells.filter(valid)) : [];
  const numbers = new Map();
  const citationKey = c => JSON.stringify([c.case_id, c.paragraph_id]);
  for (const point of [summary, viewpoint, ...comparisons, ...judicialPoints, ...tablePoints].filter(Boolean)) {
    for (const c of point.citations) if (!numbers.has(citationKey(c))) numbers.set(citationKey(c), numbers.size + 1);
  }
  function citations(refs) {
    const unique = new Map(refs.map(c => [citationKey(c), c]));
    return [...unique.values()].map(c => {
      const number = numbers.get(citationKey(c));
      const source = hits.find(h => h.case.id === c.case_id)?.case;
      const label = `核对引用${number}，${source.case_number || source.title}`;
      return `<a class="answer-citation" href="${esc(caseHash(c.case_id, c.paragraph_id))}" data-action="open-case" data-id="${esc(c.case_id)}" title="${esc(`${source.case_number || source.title}：${c.quote}`)}" aria-label="${esc(label)}">[${number}]</a>`;
    }).join('');
  }
  function paragraphs(point) {
    if (!point) return '';
    return point.text.split('\n\n').map(text => {
      const hit = hits.find(h => text.startsWith(`${h.case.case_number || h.case.title}：`));
      const refs = hit ? point.citations.filter(c => c.case_id === hit.case.id) : point.citations;
      return `<p class="search-answer-text">${esc(text)}${citations(refs)}</p>`;
    }).join('');
  }
  function judicialList() {
    const points = judicialPoints.length ? judicialPoints : viewpoint
      ? viewpoint.text.split('\n\n').map(text => ({ title: '', text, citations: viewpoint.citations })) : [];
    return points.length ? `<ol class="judicial-points">${points.map(point => `<li>${point.title ? `<h4>${esc(point.title)}</h4>` : ''}<p class="search-answer-text">${esc(point.text)}${citations(point.citations)}</p></li>`).join('')}</ol>` : '';
  }
  function table() {
    if (!comparisonTable) return comparisons.map(paragraphs).join('');
    return `<p class="comparison-intro">围绕${esc(comparisonTable.topic)}，比较${comparisonTable.cases.length}件相关类案。</p>
      <div class="comparison-shell"><p class="comparison-scroll-hint">左右滚动表格，查看完整类案。</p><div class="comparison-scroll" tabindex="0" role="region" aria-label="类案比较表，可横向滚动">
      <table class="case-comparison-table"><caption class="sr-only">${esc(comparisonTable.topic)}相关类案的多维度比较</caption>
      <colgroup><col class="comparison-dimension">${comparisonTable.cases.map(() => '<col class="comparison-case">').join('')}</colgroup>
      <thead><tr><th scope="col">比较维度</th>${comparisonTable.cases.map((c, i) => `<th scope="col"><span class="comparison-case-index">类案 ${i + 1}</span><a class="comparison-case-link" href="${esc(caseHash(c.id))}" data-action="open-case" data-id="${esc(c.id)}">${esc(c.case_number || c.title)}</a><span class="comparison-case-meta">${esc([c.court, c.judge_date].filter(Boolean).join(' · '))}</span></th>`).join('')}</tr></thead>
      <tbody>${comparisonTable.rows.map(row => `<tr data-comparison-dimension="${esc(row.key)}"><th scope="row">${esc(row.label)}</th>${row.cells.map((cell, i) => {
        const safe = valid(cell) && cell.citations.every(c => c.case_id === comparisonTable.cases[i].id);
        return `<td>${safe ? `${esc(cell.text)}${citations(cell.citations)}` : '<span class="comparison-missing">暂无可核验信息</span>'}</td>`;
      }).join('')}</tr>`).join('')}</tbody></table></div></div>`;
  }
  const ready = summary || viewpoint || judicialPoints.length || comparisonTable || comparisons.length;
  const part = (key, label, content, fallback) => `<section class="answer-part" aria-labelledby="answer-${key}"><h3 id="answer-${key}">${label}</h3>${content || `<p class="search-answer-text answer-empty">${fallback}</p>`}</section>`;
  return `<section class="search-answer ${ready ? '' : 'is-pending'}" aria-labelledby="answer-title"><h2 id="answer-title">检索分析</h2>
    ${part('summary', '总结', paragraphs(summary), '暂未生成可核验的总结。')}
    ${part('viewpoint', '裁判观点', judicialList(), '暂未生成可核验的裁判观点。')}
    ${part('comparison', '案例比较', table(), '暂无足够依据形成案例比较。')}
    <p class="answer-note">${ready ? 'AI归纳，请结合引用和完整文书复核。' : `${state.answerStatus === 'error' ? '检索分析暂不可用，' : ''}可先查看下方案例并核对原文。`}</p></section>`;
}
