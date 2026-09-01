/** Keeps shareable state (query, category, filters, sort, open word) in the URL. */

const KEYS = ['q', 'cat', 'f', 'sort', 'w'];

export function readUrl() {
  const params = new URLSearchParams(location.search);
  const hash = location.hash.replace(/^#\/?w\//, '');
  return {
    query: params.get('q') || '',
    category: params.get('cat') || '',
    filters: (params.get('f') || '').split(',').filter(Boolean),
    sort: params.get('sort') || 'relevance',
    selectedId: hash || params.get('w') || null,
  };
}

export function writeUrl(state) {
  const params = new URLSearchParams(location.search);
  const values = {
    q: state.query.trim(),
    cat: state.category,
    f: Object.entries(state.filters).filter(([, on]) => on).map(([name]) => name).join(','),
    sort: state.sort === 'relevance' ? '' : state.sort,
    w: '',   // legacy ?w= links are read, but the hash is what we write
  };

  for (const key of KEYS) {
    if (values[key]) params.set(key, values[key]);
    else params.delete(key);
  }

  const query = params.toString();
  const hash = state.selectedId ? `#/w/${state.selectedId}` : '';
  const url = `${location.pathname}${query ? `?${query}` : ''}${hash}`;
  if (url !== `${location.pathname}${location.search}${location.hash}`) {
    history.replaceState(null, '', url);
  }
}

export function shareUrl(entry) {
  return `${location.origin}${location.pathname}#/w/${entry.id}`;
}
