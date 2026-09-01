/**
 * Derives the visible result list from state.
 * Memoised per entries array on a cheap signature so scrolling/paging never
 * re-runs the search and separate stores cannot share stale results.
 */
import { queryKeys, scoreEntry } from './search.js';

const cacheByEntries = new WeakMap();

const FILTERS = {
  examples: (entry) => entry.examples.length > 0,
  english: (entry) => entry.english.length > 0,
  images: (entry) => Boolean(entry.image),
  undocumented: (entry) => entry.meanings.length === 0,
};

function signatureOf(state) {
  const active = Object.entries(state.filters)
    .filter(([, on]) => on)
    .map(([name]) => name)
    .join(',');
  return [state.entries.length, state.query.trim(), state.category, state.sort, active].join('\u0000');
}

function richness(entry) {
  return (
    entry.meanings.length * 3 +
    entry.examples.length * 4 +
    entry.english.length * 2 +
    entry.variants.length +
    (entry.image ? 5 : 0)
  );
}

export function selectResults(state) {
  const signature = signatureOf(state);
  const cached = cacheByEntries.get(state.entries);
  if (cached?.signature === signature) return cached.results;

  const activeFilters = Object.entries(state.filters)
    .filter(([, on]) => on)
    .map(([name]) => FILTERS[name]);

  const keys = queryKeys(state.query);
  const searching = Boolean(keys.tamil || keys.latin);
  const scored = [];

  for (const entry of state.entries) {
    if (state.category && !entry.categories.includes(state.category)) continue;
    if (activeFilters.some((matches) => !matches(entry))) continue;

    if (searching) {
      const score = scoreEntry(entry, keys);
      if (score === 0) continue;
      scored.push({ entry, score });
    } else {
      scored.push({ entry, score: 0 });
    }
  }

  const byAlpha = (a, b) => a.entry.word.localeCompare(b.entry.word, 'ta');
  if (state.sort === 'alpha' || (!searching && state.sort === 'relevance')) {
    scored.sort(byAlpha);
  } else if (state.sort === 'richest') {
    scored.sort((a, b) => richness(b.entry) - richness(a.entry) || byAlpha(a, b));
  } else {
    scored.sort((a, b) => b.score - a.score || byAlpha(a, b));
  }

  const results = scored.map((item) => item.entry);
  cacheByEntries.set(state.entries, { signature, results });
  return results;
}
