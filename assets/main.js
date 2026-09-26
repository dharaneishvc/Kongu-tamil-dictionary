/** Application shell: wires DOM events to the store and the store to the DOM. */
import { createStore, initialState, loadDataset, saveList, INITIAL_LIMIT, PAGE_SIZE, STORAGE_KEYS } from './store.js?v=1';
import { selectResults } from './selectors.js?v=1';
import { suggestClosest } from './search.js?v=1';
import { activeFilterPills, categoryChips, collectionEmptyState, emptyState, entryCard, entryDetail, esc, noResultsState, suggestionItems } from './render.js?v=1';
import { readUrl, readWordId, shareUrl, writeUrl } from './router.js?v=1';

const SUGGESTION_LIMIT = 8;
const RECENT_LIMIT = 12;

const el = {
  query: document.getElementById('q'),
  field: document.querySelector('.search__field'),
  suggestions: document.getElementById('suggestions'),
  clear: document.querySelector('[data-action="clear"]'),
  categories: document.getElementById('categories'),
  sort: document.getElementById('sort'),
  filters: document.getElementById('filters'),
  filterInputs: document.querySelectorAll('[data-filter]'),
  filterCount: document.getElementById('filter-count'),
  activeFilters: document.getElementById('active-filters'),
  favoriteCount: document.getElementById('favorite-count'),
  favorites: document.querySelector('[data-action="show-favorites"]'),
  clearFavorites: document.querySelector('[data-action="clear-favorites"]'),
  recent: document.querySelector('[data-action="show-recent"]'),
  clearRecent: document.querySelector('[data-action="clear-recent"]'),
  status: document.getElementById('status'),
  results: document.getElementById('results'),
  sentinel: document.getElementById('sentinel'),
  viewAll: document.querySelector('[data-action="view-all"]'),
  detail: document.getElementById('detail'),
  meta: document.getElementById('dataset-meta'),
};

const store = createStore(initialState);
const byId = new Map();
let suppressSuggestUntil = 0;

/** Patch state that changes the result list, so paging starts over. */
const refine = (partial) => store.patch({ ...partial, limit: INITIAL_LIMIT, viewAll: false });

/* -------------------------------------------------------------- rendering */

let renderScheduled = false;

// what the DOM currently shows, so each region is rebuilt only when it changes
const painted = {
  results: null, limit: 0, query: null,
  categories: null, category: null,
  detailId: null, detailFavorite: false,
};

function scheduleRender() {
  if (renderScheduled) return;
  renderScheduled = true;
  const schedule = document.visibilityState === 'visible' ? requestAnimationFrame : setTimeout;
  schedule(() => {
    renderScheduled = false;
    render(store.get());
  }, 0);
}

function render(state) {
  if (state.status === 'loading') {
    el.status.textContent = 'தரவு ஏற்றப்படுகிறது… · Loading…';
    el.results.innerHTML = skeletons(6);
    return;
  }

  if (state.status === 'error') {
    el.status.textContent = '';
    el.results.innerHTML = emptyState(
      'தரவை ஏற்ற முடியவில்லை · Unable to load',
      `<p class="muted">${esc(state.error)}</p><button type="button" class="btn" data-action="retry">மீண்டும் முயற்சி · Retry</button>`,
    );
    return;
  }

  const results = selectResults(state);
  const shown = results.slice(0, state.limit);

  el.status.textContent = results.length
    ? `${results.length.toLocaleString('ta-IN')} ${results.length === 1 ? 'சொல் · word' : 'சொற்கள் · words'}${
        state.query.trim() ? ` — “${state.query.trim()}”` : ''
      }`
    : '';

  if (results !== painted.results || state.limit !== painted.limit || state.query !== painted.query) {
    if (results.length) {
      el.results.innerHTML = shown.map((entry) => entryCard(entry, state.query)).join('');
    } else if (state.collection) {
      el.results.innerHTML = collectionEmptyState(state.collection);
    } else {
      el.results.innerHTML = noResultsState(suggestClosest(state.entries, state.query));
    }
    painted.results = results;
    painted.limit = state.limit;
    painted.query = state.query;
  }

  if (state.categories !== painted.categories || state.category !== painted.category) {
    el.categories.innerHTML = categoryChips(state.categories, state.category);
    painted.categories = state.categories;
    painted.category = state.category;
  }

  const canShowMore = shown.length < results.length;
  el.viewAll.hidden = state.viewAll || !canShowMore;
  el.viewAll.textContent = canShowMore
    ? `அனைத்தையும் காண்க · View all (${results.length.toLocaleString('ta-IN')})`
    : '';
  el.sentinel.hidden = !state.viewAll || shown.length >= results.length;
  el.clear.hidden = !state.query;

  if (el.query.value !== state.query) el.query.value = state.query;
  if (el.sort.value !== state.sort) el.sort.value = state.sort;

  el.favoriteCount.textContent = state.favorites.length ? `(${state.favorites.length})` : '';
  renderCollectionButton(el.favorites, el.clearFavorites, state.collection === 'favorites', state.favorites.length);
  renderCollectionButton(el.recent, el.clearRecent, state.collection === 'recent', state.recent.length);
  renderActiveFilters(state);
  renderSuggestions(state, results);
  syncDetail(state);
  writeUrl(state);
}

function renderCollectionButton(toggle, clear, active, count) {
  toggle.classList.toggle('btn--primary', active);
  toggle.setAttribute('aria-pressed', String(active));
  clear.hidden = !(active && count > 0);
}

function renderActiveFilters(state) {
  const count =
    (state.category ? 1 : 0) +
    Object.values(state.filters).filter(Boolean).length +
    (state.sort === 'relevance' ? 0 : 1);

  el.filterCount.hidden = count === 0;
  el.filterCount.textContent = count;
  el.activeFilters.innerHTML = activeFilterPills(state);
  el.filterInputs.forEach((input) => { input.checked = Boolean(state.filters[input.dataset.filter]); });
}

function renderSuggestions(state, results) {
  const open = state.suggestOpen && state.query.trim().length > 0 && results.length > 0;

  el.suggestions.hidden = !open;
  el.query.setAttribute('aria-expanded', String(open));

  if (!open) {
    el.query.removeAttribute('aria-activedescendant');
    el.suggestions.innerHTML = '';
    return;
  }

  const top = results.slice(0, SUGGESTION_LIMIT);
  const index = Math.min(state.suggestIndex, top.length - 1);
  el.suggestions.innerHTML = suggestionItems(top, index, state.query);

  if (index >= 0) el.query.setAttribute('aria-activedescendant', `sugg-${index}`);
  else el.query.removeAttribute('aria-activedescendant');
}

const skeletons = (count) =>
  Array.from({ length: count }, () => '<div class="card card--skeleton" aria-hidden="true"></div>').join('');

function syncDetail(state) {
  const entry = state.selectedId ? byId.get(state.selectedId) : null;
  if (!entry) {
    painted.detailId = null;
    painted.detailFavorite = false;
    if (el.detail.open) el.detail.close();
    return;
  }
  const isFavorite = state.favorites.includes(entry.id);
  if (painted.detailId !== entry.id || painted.detailFavorite !== isFavorite) {
    el.detail.innerHTML = entryDetail(entry, isFavorite);
    painted.detailId = entry.id;
    painted.detailFavorite = isFavorite;
  }
  if (!el.detail.open) el.detail.showModal();
}

/* --------------------------------------------------------------- events */

const debounce = (fn, wait) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
};

function speakEntry(entry) {
  if (!entry || !window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') return;
  window.speechSynthesis.cancel();
  if (window.speechSynthesis.paused) window.speechSynthesis.resume();
  const utterance = new SpeechSynthesisUtterance(entry.word);
  utterance.lang = 'ta-IN';
  window.speechSynthesis.speak(utterance);
}

async function copyText(value) {
  if (!navigator.clipboard?.writeText) return false;
  await navigator.clipboard.writeText(value);
  return true;
}

/** Briefly swap a button's label to confirm an action. */
function flash(button, text, ms = 1500) {
  const original = button.dataset.label ?? button.textContent;
  button.dataset.label = original;
  button.textContent = text;
  clearTimeout(button.flashTimer);
  button.flashTimer = setTimeout(() => { button.textContent = original; }, ms);
}

async function shareEntry(entry, button) {
  if (!entry) return;
  const url = shareUrl(entry);
  try {
    const shared = navigator.share
      ? await navigator.share({ title: entry.word, text: entry.meanings[0] || '', url }).then(() => true)
      : await copyText(url);
    if (shared) flash(button, '✓ பகிரப்பட்டது · Shared');
  } catch (error) {
    if (error?.name !== 'AbortError') await copyText(url).catch(() => {});
  }
}

async function copyLink(entry, button) {
  if (!entry) return;
  const url = shareUrl(entry);
  const copied = await copyText(url).catch(() => false);
  flash(button, copied ? '✓ நகலெடுக்கப்பட்டது · Copied' : url, copied ? 1500 : 6000);
}

const setQuery = debounce(
  (value) => refine({ query: value, collection: '', suggestOpen: true, suggestIndex: -1 }),
  120
);

el.query.addEventListener('input', (event) => setQuery(event.target.value));
el.query.addEventListener('focus', () => {
  if (performance.now() < suppressSuggestUntil) return;
  store.patch({ suggestOpen: true });
});

el.query.addEventListener('keydown', (event) => {
  const visible = !el.suggestions.hidden;
  const count = el.suggestions.children.length;

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    if (!visible || !count) return;
    event.preventDefault();
    const step = event.key === 'ArrowDown' ? 1 : -1;
    const next = (store.get().suggestIndex + step + count + 1) % (count + 1);
    store.patch({ suggestIndex: next === count ? -1 : next });
  } else if (event.key === 'Enter') {
    const active = el.suggestions.querySelector('.suggest__item--on');
    if (visible && active) {
      event.preventDefault();
      openEntry(active.dataset.id);
    } else {
      store.patch({ suggestOpen: false });
    }
  } else if (event.key === 'Escape') {
    if (visible) store.patch({ suggestOpen: false });
    else if (el.query.value) refine({ query: '' });
  }
});

// pointerdown fires before focusout, so the choice survives the blur
el.suggestions.addEventListener('pointerdown', (event) => {
  const item = event.target.closest('.suggest__item[data-id]');
  if (!item) return;
  event.preventDefault();
  openEntry(item.dataset.id);
});

el.suggestions.addEventListener('pointermove', (event) => {
  const item = event.target.closest('.suggest__item[data-id]');
  if (!item) return;
  const index = [...el.suggestions.children].indexOf(item);
  if (index !== store.get().suggestIndex) store.patch({ suggestIndex: index });
});

el.field.addEventListener('focusout', (event) => {
  if (el.field.contains(event.relatedTarget)) return;
  store.patch({ suggestOpen: false });
});

el.sort.addEventListener('change', (event) => refine({ sort: event.target.value }));

el.categories.addEventListener('click', (event) => {
  const chip = event.target.closest('[data-category]');
  if (!chip) return;
  const next = chip.dataset.category;
  refine({ category: next === store.get().category ? '' : next });
});

el.activeFilters.addEventListener('click', (event) => {
  const pill = event.target.closest('[data-clear]');
  if (!pill) return;
  const { clear, value } = pill.dataset;
  if (clear === 'category') refine({ category: '' });
  else if (clear === 'sort') refine({ sort: 'relevance' });
  else refine({ filters: { ...store.get().filters, [value]: false } });
});

el.filterInputs.forEach((input) => {
  input.addEventListener('change', () => {
    refine({ filters: { ...store.get().filters, [input.dataset.filter]: input.checked } });
  });
});

function openEntry(id) {
  const recent = [id, ...store.get().recent.filter((value) => value !== id)].slice(0, RECENT_LIMIT);
  saveList(STORAGE_KEYS.recent, recent);
  store.patch({ selectedId: id, recent, suggestOpen: false });
}

el.results.addEventListener('click', (event) => {
  if (event.target.closest('[data-action]')) return;
  const card = event.target.closest('.card[data-id]');
  if (card) openEntry(card.dataset.id);
});

el.results.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const card = event.target.closest('.card[data-id]');
  if (!card) return;
  event.preventDefault();
  openEntry(card.dataset.id);
});

el.detail.addEventListener('close', () => {
  suppressSuggestUntil = performance.now() + 500;
  store.patch({ selectedId: null, suggestOpen: false });
});

el.detail.addEventListener('click', (event) => {
  if (event.target === el.detail) el.detail.close();
});

function toggleCollection(name) {
  refine({ collection: store.get().collection === name ? '' : name, query: '', category: '' });
}

function clearCollection(name) {
  saveList(STORAGE_KEYS[name], []);
  refine({ [name]: [], collection: '', query: '', suggestOpen: false });
}

function toggleFavorite(id) {
  const { favorites } = store.get();
  const next = favorites.includes(id) ? favorites.filter((value) => value !== id) : [id, ...favorites];
  saveList(STORAGE_KEYS.favorites, next);
  store.patch({ favorites: next });
}

document.addEventListener('click', (event) => {
  const actionElement = event.target.closest('[data-action]');
  const action = actionElement?.dataset.action;
  if (action === 'use-suggestion') {
    refine({ query: actionElement.dataset.query, collection: '', suggestOpen: false });
  } else if (action === 'show-favorites') {
    toggleCollection('favorites');
  } else if (action === 'show-recent') {
    toggleCollection('recent');
  } else if (action === 'clear-favorites') {
    clearCollection('favorites');
  } else if (action === 'clear-recent') {
    clearCollection('recent');
  } else if (action === 'toggle-favorite') {
    toggleFavorite(actionElement.dataset.id);
  } else if (action === 'speak') {
    speakEntry(byId.get(actionElement.dataset.id));
  } else if (action === 'share') {
    shareEntry(byId.get(actionElement.dataset.id), actionElement);
  } else if (action === 'copy-link') {
    copyLink(byId.get(actionElement.dataset.id), actionElement);
  } else if (action === 'clear') {
    refine({ query: '', suggestOpen: false });
    el.query.focus();
  } else if (action === 'random') {
    showRandom();
  } else if (action === 'filters') {
    el.filters.showModal();
  } else if (action === 'close-filters') {
    el.filters.close();
  } else if (action === 'reset') {
    refine({ query: '', category: '', collection: '', sort: 'relevance', filters: { ...initialState.filters } });
  } else if (action === 'view-all') {
    store.patch({ viewAll: true, limit: PAGE_SIZE });
  } else if (action === 'retry') {
    loadData();
  }
});

document.addEventListener('error', (event) => {
  if (event.target.matches?.('.card__thumb, .detail__image')) event.target.hidden = true;
}, true);

el.filters.addEventListener('click', (event) => {
  if (event.target === el.filters) el.filters.close();
});

document.addEventListener('keydown', (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;

  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName);
  const busy = el.detail.open || el.filters.open;

  if (event.key === '/' && !typing) {
    event.preventDefault();
    el.query.focus();
    el.query.select();
  } else if ((event.key === 'r' || event.key === 'R') && !typing && !busy) {
    showRandom();
  } else if ((event.key === 'f' || event.key === 'F') && !typing && !busy) {
    event.preventDefault();
    el.filters.showModal();
  }
});

function showRandom() {
  const state = store.get();
  const pool = selectResults(state);
  const list = pool.length ? pool : state.entries;
  if (!list.length) return;
  const entry = list[Math.floor(Math.random() * list.length)];
  openEntry(entry.id);
}

new IntersectionObserver(
  (records) => {
    if (!records.some((record) => record.isIntersecting)) return;
    const state = store.get();
    if (state.status !== 'ready' || !state.viewAll) return;
    if (state.limit >= selectResults(state).length) return;
    store.patch({ limit: state.limit + PAGE_SIZE });
  },
  { rootMargin: '600px 0px' }
).observe(el.sentinel);

addEventListener('hashchange', () => {
  const id = readWordId();
  store.patch({ selectedId: id && byId.has(id) ? id : null });
});

/* ----------------------------------------------------------------- boot */

store.subscribe(scheduleRender);
if (location.protocol !== 'file:') scheduleRender();

async function loadData() {
  if (location.protocol === 'file:') return;
  store.patch({ status: 'loading', error: null });
  try {
    const { meta, entries, categories } = await loadDataset();
    byId.clear();
    entries.forEach((entry) => byId.set(entry.id, entry));

    const { favorites: savedFavorites, recent: savedRecent } = store.get();
    const favorites = savedFavorites.filter((id) => byId.has(id));
    const recent = savedRecent.filter((id) => byId.has(id));
    if (favorites.length !== savedFavorites.length) saveList(STORAGE_KEYS.favorites, favorites);
    if (recent.length !== savedRecent.length) saveList(STORAGE_KEYS.recent, recent);

    const fromUrl = readUrl();
    const filters = { ...initialState.filters };
    for (const name of fromUrl.filters) {
      if (name in filters) filters[name] = true;
    }

    const resolvedCategory = categories.some((c) => c.id === fromUrl.category)
      ? fromUrl.category
      : '';

    store.patch({
      status: 'ready',
      entries,
      categories,
      favorites,
      recent,
      query: fromUrl.query,
      category: resolvedCategory,
      filters,
      sort: ['relevance', 'alpha', 'richest'].includes(fromUrl.sort) ? fromUrl.sort : 'relevance',
      selectedId: byId.has(fromUrl.selectedId) ? fromUrl.selectedId : null,
    });

    el.meta.textContent = [
      `${meta.total.toLocaleString('ta-IN')} சொற்கள் · words`,
      `${meta.withExample.toLocaleString('ta-IN')} எடுத்துக்காட்டுடன் · with examples`,
      `${meta.withEnglish.toLocaleString('ta-IN')} ஆங்கிலப் பொருளுடன் · with English meaning`,
      `${meta.needsMeaning.toLocaleString('ta-IN')} பொருள் தேவை · need a meaning`,
    ].join(' • ');
  } catch (error) {
    store.patch({ status: 'error', error: error.message || 'Unknown data loading error' });
  }
}

if (location.protocol !== 'file:') loadData();
