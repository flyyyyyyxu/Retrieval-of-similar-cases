/* 后端 API 客户端。页面代码只通过这里访问后端，不直接连 ES 或模型。
 * 字段定义以 docs/openapi.json（由 backend/app/schemas.py 生成）为准。
 * 用法：输入问题 → 内部 parse → search → answer；用户无需确认结构化条件。
 */
export const api = (() => {
  'use strict';
  const BASE = '/api';

  async function request(path, { method = 'GET', body, signal, responseType } = {}) {
    let res;
    try { res = await fetch(BASE + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    }); } catch (error) {
      if (error.name === 'AbortError') throw error;
      throw new Error('无法连接检索服务，请检查网络和后端是否启动。');
    }
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      const message = typeof detail.detail === 'string' ? detail.detail
        : Array.isArray(detail.detail) ? detail.detail.map(item => item.msg).join('；')
        : `请求失败（${res.status}），请稍后重试。`;
      const err = new Error(message);
      err.status = res.status;
      throw err;
    }
    return res.status === 204 ? null : responseType === 'blob' ? res.blob() : res.json();
  }

  return {
    /** 配置状态（不代表实时探活）：数据模式、模型、重排 */
    health: options => request('/health', options),

    /** 内部检索适配，不展示条件确认页 */
    parse: (text, options) => request('/query/parse', { ...options, method: 'POST', body: { text } }),

    /** 独立的可选问题优化；只在用户点击按钮时调用 */
    optimize: (text, options) => request('/query/optimize', { ...options, method: 'POST', body: { text } }),

    /** 命中文书的预生成分析归纳，SearchAnswer v3: conclusion（总结）、judicial_points（带标题的分点观点）、comparison_table（cases + rows/cells 多维度比较）；保留 judicial_view/case_comparison 兼容字段，各单元格附原文引用 */
    answer: (searchId, options) => request('/search/answer', { ...options, method: 'POST', body: { search_id: searchId } }),

    /** 内部 ParsedQuery + 手选地域/年份/层级 Filters（regions/years/court_levels 数组，同维度OR、跨维度AND；兼容旧单值/年份范围） → { search_id, data_mode, hits, degraded, took_ms } */
    search: (query, options) => request('/search', { ...options, method: 'POST', body: { query, size: 10 } }),

    /** 十二类过滤条件：ResultFilters / ResultFilterOptions；当前 scope=returned_results */
    filterOptions: (searchId, options) => request(`/search/${encodeURIComponent(searchId)}/filters`, options),
    filterResults: (searchId, filters, options) => request('/search/filter', { ...options, method: 'POST', body: { search_id: searchId, filters } }),

    /** 报告使用受限 Delta ops；格式定义以 schemas.py 为准。下载前先保存最新编辑内容。 */
    createReport: (searchId, caseIds, filters) => request('/reports', { method: 'POST', body: { search_id: searchId, case_ids: caseIds, filters } }),
    reports: () => request('/reports'),
    getReport: id => request(`/reports/${encodeURIComponent(id)}`),
    saveReport: (id, body) => request(`/reports/${encodeURIComponent(id)}`, { method: 'PUT', body }),
    downloadReport: (id, format) => request(`/reports/${encodeURIComponent(id)}/download?format=${format}`, { responseType: 'blob' }),

    /** 文书详情：paragraphs 供原文定位；content_sections 为可选摘要列表，null=未适配，[]=无摘要；overview/analysis 可为 AI 归纳，origin=ai 且 citations 带已校验引用；research_points 提供同争点裁判结论与比较事实 */
    getCase: (caseId, options) => request(`/cases/${encodeURIComponent(caseId)}`, options),

    /** 单篇相似点/差异点，点开案例时再调用 */
    explain: (caseId, query, searchId, options) =>
      request(`/cases/${encodeURIComponent(caseId)}/explain`, {
        ...options,
        method: 'POST',
        body: { query, search_id: searchId },
      }),

    /** 相关性反馈 */
    feedback: (searchId, caseId, relevant, reason) =>
      request('/feedback', {
        method: 'POST',
        body: { search_id: searchId, case_id: caseId, relevant, reason },
      }),
  };
})();
