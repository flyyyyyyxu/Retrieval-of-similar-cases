import { state } from '../store.js';
import { esc, caseHash } from '../ui.js';

export function searchAnswer() {
  if (!state.result) return '';
  if (state.answerStatus === 'loading') return '<section class="search-answer" aria-label="综合答复"><p class="answer-status" role="status">正在整理结论与裁判观点…</p></section>';
  const answer = state.answer;
  const validPoint = point => point?.citations?.some(c => c.verified && state.result.hits.some(hit => hit.case.id === c.case_id));
  const conclusion = answer?.status === 'ready' && validPoint(answer.conclusion) ? answer.conclusion : null;
  const viewpoint = answer?.status === 'ready' && validPoint(answer.judicial_view) ? answer.judicial_view : null;
  function citations(point) {
    return (point?.citations || []).filter(c => c.verified && state.result.hits.some(hit => hit.case.id === c.case_id)).map((c, i) => `<a class="answer-citation" href="${esc(caseHash(c.case_id, c.paragraph_id))}" data-action="open-case" data-id="${esc(c.case_id)}" title="${esc(c.quote)}" aria-label="核对引用${i + 1}">[${i + 1}]</a>`).join('');
  }
  return `<section class="search-answer" aria-labelledby="answer-title"><h2 id="answer-title">结论与裁判观点</h2><p class="search-answer-text"><strong>结论：</strong>${esc(conclusion?.text || '暂未生成综合结论。')}${citations(conclusion)} <strong>裁判观点：</strong>${esc(viewpoint?.text || '暂未生成可核验的综合观点。')}${citations(viewpoint)}</p>${!conclusion && !viewpoint ? `<p class="answer-note">${state.answerStatus === 'error' ? '综合答复暂不可用，' : ''}可先查看下方案例并核对原文。</p>` : '<p class="answer-note">AI归纳，请结合引用和完整文书复核。</p>'}</section>`;
}
