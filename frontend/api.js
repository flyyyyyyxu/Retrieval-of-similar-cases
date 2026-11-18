/* 后端 API 客户端。页面代码只通过这里访问后端，不直接连 ES 或模型。
 * 字段定义以 docs/openapi.json（由 backend/app/schemas.py 生成）为准。
 * 用法：await QinganAPI.parse('案情...') → 用户确认条件 → QinganAPI.search(query)
 */
window.QinganAPI = (() => {
  'use strict';
  const BASE = '/api';

  async function request(path, { method = 'GET', body } = {}) {
    const res = await fetch(BASE + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      const err = new Error(detail.detail || `请求失败（${res.status}）`);
      err.status = res.status;
      throw err;
    }
    return res.status === 204 ? null : res.json();
  }

  return {
    /** 运行状态：数据模式（mock/es/replay）、模型与重排是否可用 */
    health: () => request('/health'),

    /** 案情 → { query: ParsedQuery, degraded: [] }，query 展示给用户编辑 */
    parse: (text) => request('/query/parse', { method: 'POST', body: { text } }),

    /** 确认后的 ParsedQuery → { search_id, data_mode, hits, degraded, took_ms } */
    search: (query, size = 10) => request('/search', { method: 'POST', body: { query, size } }),

    /** 文书详情，含 paragraphs[{id, section, text}] 供原文定位 */
    getCase: (caseId) => request(`/cases/${encodeURIComponent(caseId)}`),

    /** 单篇相似点/差异点，点开案例时再调用 */
    explain: (caseId, query, searchId) =>
      request(`/cases/${encodeURIComponent(caseId)}/explain`, {
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
