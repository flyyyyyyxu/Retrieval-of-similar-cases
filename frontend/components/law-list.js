import { esc, empty, caseHash, safeSource } from '../ui.js';
import { state, documentKey } from '../store.js';

export function groupedLaws() {
  const groups = new Map();
  for (const hit of state.result?.hits || []) {
    const doc = state.documents.get(documentKey(hit.case.id));
    for (const law of doc?.law_references || []) {
      const key = JSON.stringify([law.id, law.title, law.version, law.authority, law.published_date, law.effective_date]);
      if (!groups.has(key)) groups.set(key, { ...law, articles: new Map() });
      const group = groups.get(key);
      for (const article of law.articles) {
        // Do not merge conflicting text or different versions under a single article.
        const articleKey = JSON.stringify([article.id, article.number, article.text]);
        if (!group.articles.has(articleKey)) group.articles.set(articleKey, { ...article, cases: new Map() });
        group.articles.get(articleKey).cases.set(hit.case.id, { case: hit.case, paragraph: article.paragraph_ids?.[0] });
      }
    }
  }
  return [...groups.values()].map((group, index) => ({ ...group, index,
    articles: [...group.articles.values()].map((article, articleIndex) => ({ ...article, index: articleIndex, cases: [...article.cases.values()] })),
  }));
}

export function lawList() {
  const pending = state.result?.hits.some(hit => !state.documents.has(documentKey(hit.case.id)) && !state.documentErrors.has(documentKey(hit.case.id)));
  const groups = groupedLaws();
  if (pending) return '<div class="laws-loading" role="status"><span class="mini-spinner" aria-hidden="true"></span>正在读取引用法规…</div>';
  if (!groups.length && state.result?.hits.some(hit => state.documentErrors.has(documentKey(hit.case.id)))) {
    return empty('暂时无法读取引用法规', '', '<button type="button" class="btn small" data-action="retry-laws">重试</button>');
  }
  if (!groups.length) return empty('暂无引用法规', '');
  return groups.map((law, i) => {
    const metadata = [law.authority, law.published_date && `${law.published_date.replaceAll('-', '.')} 发布`, law.effective_date && `${law.effective_date.replaceAll('-', '.')} 实施`].filter(Boolean);
    const source = safeSource(law.source_url);
    return `<article class="statute-group"><header class="statute-heading"><span class="case-rank">${i + 1}</span>${source ? `<a href="${esc(source)}" target="_blank" rel="noopener noreferrer">${esc(law.title)}${law.version ? `（${esc(law.version)}）` : ''}</a>` : `<h3>${esc(law.title)}${law.version ? `（${esc(law.version)}）` : ''}</h3>`}</header><div class="statute-meta">${metadata.map(value => `<span>${esc(value)}</span>`).join('')}</div>
      ${law.articles.map(article => `<section class="statute-article"><div class="statute-text"><p><strong>${esc(article.number)}</strong>${esc(article.text)}</p></div><button type="button" class="law-citation-count" data-action="law-cases" data-law="${i}" data-article="${article.index}" aria-label="查看${esc(article.number)}的${article.cases.length}个引用案例">引用${article.cases.length}</button></section>`).join('')}</article>`;
  }).join('');
}

export function citingCases(lawIndex, articleIndex) {
  const group = groupedLaws()[lawIndex], article = group?.articles[articleIndex];
  if (!article) return null;
  return { title: `${group.title} · ${article.number}`, content: `<p class="law-quote">${esc(article.text)}</p><div class="law-related-cases">${article.cases.map(item => `<a href="${esc(caseHash(item.case.id, item.paragraph))}" data-action="open-case" data-id="${esc(item.case.id)}"><strong>${esc(item.case.title)}</strong><span>${esc([item.case.court, item.case.case_number].filter(Boolean).join(' · '))}</span></a>`).join('')}</div>` };
}
