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
  const numbers = new Map();
  const citationKey = c => JSON.stringify([c.case_id, c.paragraph_id]);
  for (const point of [summary, viewpoint, ...comparisons].filter(Boolean)) {
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
  const ready = summary || viewpoint || comparisons.length;
  const part = (key, label, content, fallback) => `<section class="answer-part" aria-labelledby="answer-${key}"><h3 id="answer-${key}">${label}</h3>${content || `<p class="search-answer-text answer-empty">${fallback}</p>`}</section>`;
  return `<section class="search-answer ${ready ? '' : 'is-pending'}" aria-labelledby="answer-title"><h2 id="answer-title">检索分析</h2>
    ${part('summary', '总结', paragraphs(summary), '暂未生成可核验的总结。')}
    ${part('viewpoint', '裁判观点', paragraphs(viewpoint), '暂未生成可核验的裁判观点。')}
    ${part('comparison', '案例比较', comparisons.map(paragraphs).join(''), '暂无足够依据形成案例比较。')}
    <p class="answer-note">${ready ? 'AI归纳，请结合引用和完整文书复核。' : `${state.answerStatus === 'error' ? '检索分析暂不可用，' : ''}可先查看下方案例并核对原文。`}</p></section>`;
}
