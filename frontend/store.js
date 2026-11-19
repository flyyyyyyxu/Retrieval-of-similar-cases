const KEY = 'qingan.api.v2';
function read() {
  try {
    const value = JSON.parse(localStorage.getItem(KEY));
    return value && Array.isArray(value.history) && Array.isArray(value.saved) ? value : {};
  } catch { return {}; }
}
const persisted = read();
const defaultFolder = { id: 'default', name: '默认收藏夹' };
const folders = Array.isArray(persisted.folders) ? persisted.folders.filter(f => typeof f?.id === 'string' && typeof f?.name === 'string') : [];
if (!folders.some(folder => folder.id === 'default')) folders.unshift(defaultFolder);
export const state = {
  health: null, healthError: '', draft: '', parsed: null,
  searchFilters: { region: null, year_from: null, year_to: null, court_level: null }, resultInputFilters: {},
  parseDegraded: [], parseError: '', parseStatus: 'idle',
  result: null, resultQuery: null, resultError: '', resultStatus: 'idle',
  progress: [], progressOpen: true, answer: null, answerStatus: 'idle',
  optimization: null, optimizeStatus: 'idle', optimizeNotice: '',
  sort: 'relevance', resultsY: 0, activeHistory: null,
  resultTab: 'cases', caseTabs: new Map(), expandedCases: new Set(), selectedCases: new Set(),
  resultFilters: {}, filteredHits: null, filterOpen: false, filterOptions: null,
  filterStatus: 'idle', filterError: '', caseView: 'list',
  readerTabs: [], activeReaderId: null, readerOpen: false, readerMode: null,
  reportCases: new Set(), reportGenerating: false,
  history: persisted.history || [], folders, activeFolder: 'all',
  saved: (persisted.saved || []).map(item => ({ ...item, folderId: folders.some(f => f.id === item.folderId) ? item.folderId : 'default' })),
  documents: new Map(), documentErrors: new Map(),
  explanations: new Map(), explanationPending: new Set(), feedback: new Map(), returnTo: 'results',
};
export function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ history: state.history, saved: state.saved, folders: state.folders }));
    return true;
  } catch { return false; }
}
export const documentKey = id => JSON.stringify([state.health?.data_mode, id]);
export const explanationKey = id => JSON.stringify([state.result?.data_mode, state.resultQuery, id]);
export function sortedHits() {
  const hits = [...(state.filteredHits || state.result?.hits || [])];
  if (state.sort !== 'relevance') {
    const sign = state.sort === 'newest' ? -1 : 1;
    hits.sort((a, b) => {
      const priority = Number(b.case.source_type === 'typical') - Number(a.case.source_type === 'typical');
      if (priority) return priority;
      if (!a.case.judge_date && !b.case.judge_date) return 0;
      if (!a.case.judge_date) return 1;
      if (!b.case.judge_date) return -1;
      return sign * a.case.judge_date.localeCompare(b.case.judge_date);
    });
  } else hits.sort((a, b) => Number(b.case.source_type === 'typical') - Number(a.case.source_type === 'typical'));
  return hits;
}
export function isSaved(id) {
  return state.saved.some(item => item.case.id === id && item.mode === state.health?.data_mode);
}
export function currentCase(id) {
  return state.documents.get(documentKey(id))
    || state.result?.hits.find(hit => hit.case.id === id)?.case
    || state.saved.find(item => item.case.id === id && item.mode === state.health?.data_mode)?.case;
}
export function saveResult() {
  const record = {
    id: state.result.search_id, time: Date.now(), query: structuredClone(state.resultQuery),
    response: structuredClone(state.result), sort: state.sort, scroll: state.resultsY,
    progress: structuredClone(state.progress), answer: structuredClone(state.answer),
    answerStatus: state.answerStatus,
    resultTab: state.resultTab, resultFilters: { ...state.resultFilters },
    filteredHits: state.filteredHits, caseView: state.caseView,
    reportCaseIds: [...state.reportCases],
    inputFilters: structuredClone(state.resultInputFilters),
  };
  state.activeHistory = record.id;
  state.history = [record, ...state.history.filter(item => item.id !== record.id)].slice(0, 20);
  return persist();
}
export function updateRecord() {
  const record = state.history.find(item => item.id === state.activeHistory);
  if (record) {
    Object.assign(record, { sort: state.sort, scroll: state.resultsY,
      resultTab: state.resultTab, resultFilters: { ...state.resultFilters } });
    record.filteredHits = state.filteredHits;
    record.caseView = state.caseView;
    record.reportCaseIds = [...state.reportCases];
    persist();
  }
}
