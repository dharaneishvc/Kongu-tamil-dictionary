/** Application shell: wires DOM events to the store and the store to the DOM. */
import { createStore, initialState, loadDataset, INITIAL_LIMIT, PAGE_SIZE } from './store.js';
import { selectResults } from './selectors.js';
import { activeFilterPills, categoryChips, entryCard, entryDetail, esc, suggestionItems } from './render.js';
import { readUrl, shareUrl, writeUrl } from './router.js';

const SUGGESTION_LIMIT = 8;

const el = {
  query: document.getElementById('q'),
  field: document.querySelector('.search__field'),
  suggestions: document.getElementById('suggestions'),
  clear: document.querySelector('[data-action="clear"]'),
  categories: document.getElementById('categories'),
  sort: document.getElementById('sort'),
  filters: document.getElementById('filters'),
  filterCount: document.getElementById('filter-count'),
  activeFilters: document.getElementById('active-filters'),
  status: document.getElementById('status'),
  results: document.getElementById('results'),
  sentinel: document.getElementById('sentinel'),
  viewAll: document.querySelector('[data-action="view-all"]'),
  detail: document.getElementById('detail'),
  meta: document.getElementById('dataset-meta'),
  emptyTpl: document.getElementById('tpl-empty'),
};

const store = createStore(initialState);
const byId = new Map();
let suppressSuggestUntil = 0;

/* ---------------------------------------------------------------- theme */

const THEME_KEY = 'kongu.theme';

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
}

applyTheme(
  localStorage.getItem(THEME_KEY) ||
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
);

/* -------------------------------------------------------------- rendering */

let renderScheduled = false;

// what the DOM currently shows, so each region is rebuilt only when it changes
const painted = {
  results: null, limit: 0, query: null,
  categories: null, category: null,
  detailId: null,
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
    el.status.textContent = 'Loading.. · தரவு ஏற்றப்படுகிறது…';
    el.results.innerHTML = skeletons(6);
    return;
  }

  if (state.status === 'error') {
    el.status.textContent = '';
    el.results.innerHTML =
      `<div class="empty"><p class="empty__title">Unable to load · தரவை ஏற்ற முடியவில்லை</p>` +
      `<p class="muted">${esc(state.error)}</p>` +
      `<button type="button" class="btn" data-action="retry">மீண்டும் முயற்சி · Retry</button></div>`;
    return;
  }

  const results = selectResults(state);
  const shown = results.slice(0, state.limit);

  el.status.textContent = results.length
    ? `${results.length.toLocaleString('ta-IN')} ${results.length === 1 ? 'சொல்' : 'சொற்கள்'}${
        state.query.trim() ? ` — “${state.query.trim()}”` : ''
      }`
    : '';

  if (results !== painted.results || state.limit !== painted.limit || state.query !== painted.query) {
    if (results.length) {
      el.results.innerHTML = shown.map((entry) => entryCard(entry, state.query)).join('');
    } else {
      el.results.replaceChildren(el.emptyTpl.content.cloneNode(true));
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

  if (el.viewAll) {
    const canShowMore = shown.length < results.length;
    el.viewAll.hidden = state.viewAll || !canShowMore;
    el.viewAll.textContent = canShowMore
      ? `அனைத்தையும் காண்க · View all (${results.length.toLocaleString('ta-IN')})`
      : '';
  }
  el.sentinel.hidden = !state.viewAll || shown.length >= results.length;
  el.clear.hidden = !state.query;

  if (el.query.value !== state.query) el.query.value = state.query;
  if (el.sort.value !== state.sort) el.sort.value = state.sort;

  renderActiveFilters(state);
  renderSuggestions(state, results);
  syncDetail(state);
  writeUrl(state);
}

function renderActiveFilters(state) {
  const count =
    (state.category ? 1 : 0) +
    Object.values(state.filters).filter(Boolean).length +
    (state.sort === 'relevance' ? 0 : 1);

  el.filterCount.hidden = count === 0;
  el.filterCount.textContent = count;
  el.activeFilters.innerHTML = activeFilterPills(state);
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
    if (el.detail.open) el.detail.close();
    return;
  }
  if (painted.detailId !== entry.id) {
    el.detail.innerHTML = entryDetail(entry);
    painted.detailId = entry.id;
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

const setQuery = debounce(
  (value) => store.patch({ query: value, limit: INITIAL_LIMIT, viewAll: false, suggestOpen: true, suggestIndex: -1 }),
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
      store.patch({ selectedId: active.dataset.id, suggestOpen: false });
    } else {
      store.patch({ suggestOpen: false });
    }
  } else if (event.key === 'Escape') {
    if (visible) store.patch({ suggestOpen: false });
    else if (el.query.value) store.patch({ query: '', limit: INITIAL_LIMIT, viewAll: false });
  }
});

// pointerdown fires before focusout, so the choice survives the blur
el.suggestions.addEventListener('pointerdown', (event) => {
  const item = event.target.closest('.suggest__item[data-id]');
  if (!item) return;
  event.preventDefault();
  store.patch({ selectedId: item.dataset.id, suggestOpen: false });
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

el.sort.addEventListener('change', (event) =>
  store.patch({ sort: event.target.value, limit: INITIAL_LIMIT, viewAll: false })
);

el.categories.addEventListener('click', (event) => {
  const chip = event.target.closest('[data-category]');
  if (!chip) return;
  const next = chip.dataset.category;
  store.patch({ category: next === store.get().category ? '' : next, limit: INITIAL_LIMIT, viewAll: false });
});

el.activeFilters.addEventListener('click', (event) => {
  const pill = event.target.closest('[data-clear]');
  if (!pill) return;
  const { clear, value } = pill.dataset;
  if (clear === 'category') store.patch({ category: '', limit: INITIAL_LIMIT, viewAll: false });
  else if (clear === 'sort') store.patch({ sort: 'relevance', limit: INITIAL_LIMIT, viewAll: false });
  else {
    store.patch({
      filters: { ...store.get().filters, [value]: false },
      limit: INITIAL_LIMIT,
      viewAll: false,
    });
    syncFilterInputs();
  }
});

function syncFilterInputs() {
  const { filters } = store.get();
  document
    .querySelectorAll('[data-filter]')
    .forEach((input) => (input.checked = Boolean(filters[input.dataset.filter])));
}

document.querySelectorAll('[data-filter]').forEach((input) => {
  input.addEventListener('change', () => {
    store.patch({
      filters: { ...store.get().filters, [input.dataset.filter]: input.checked },
      limit: INITIAL_LIMIT,
      viewAll: false,
    });
  });
});

el.results.addEventListener('click', (event) => {
  const card = event.target.closest('.card[data-id]');
  if (card) store.patch({ selectedId: card.dataset.id });
});

el.results.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const card = event.target.closest('.card[data-id]');
  if (!card) return;
  event.preventDefault();
  store.patch({ selectedId: card.dataset.id });
});

el.detail.addEventListener('close', () => {
  suppressSuggestUntil = performance.now() + 500;
  store.patch({ selectedId: null, suggestOpen: false });
});

el.detail.addEventListener('click', async (event) => {
  if (event.target === el.detail) {
    el.detail.close();
    return;
  }
  const copy = event.target.closest('[data-action="copy-link"]');
  if (!copy) return;
  const entry = byId.get(copy.dataset.id);
  try {
    await navigator.clipboard.writeText(shareUrl(entry));
    copy.textContent = '✓ நகலெடுக்கப்பட்டது · Copied';
    setTimeout(() => (copy.textContent = '🔗 இணைப்பை நகலெடு · Copy'), 1600);
  } catch {
    copy.textContent = shareUrl(entry);
  }
});

document.addEventListener('click', (event) => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'clear') {
    store.patch({ query: '', limit: INITIAL_LIMIT, viewAll: false, suggestOpen: false });
    el.query.focus();
  } else if (action === 'theme') {
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  } else if (action === 'random') {
    showRandom();
  } else if (action === 'filters') {
    el.filters.showModal();
  } else if (action === 'close-filters') {
    el.filters.close();
  } else if (action === 'reset') {
    store.patch({
      query: '',
      category: '',
      sort: 'relevance',
      filters: { ...initialState.filters },
      limit: INITIAL_LIMIT,
      viewAll: false,
    });
    syncFilterInputs();
  } else if (action === 'view-all') {
    store.patch({ viewAll: true, limit: PAGE_SIZE });
  } else if (action === 'retry') {
    loadData();
  }
});

el.filters.addEventListener('click', (event) => {
  if (event.target === el.filters) el.filters.close();
});

document.addEventListener('keydown', (event) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName);
  const busy = el.detail.open || el.filters.open;

  if (event.key === '/' && !typing) {
    event.preventDefault();
    el.query.focus();
    el.query.select();
  } else if (event.key === 'Escape' && typing && el.query.value) {
    store.patch({ query: '', limit: INITIAL_LIMIT, viewAll: false });
  } else if ((event.key === 'r' || event.key === 'R') && !typing && !busy) {
    showRandom();
  } else if ((event.key === 'f' || event.key === 'F') && !typing && !busy) {
    event.preventDefault();
    el.filters.showModal();
  }
});

function showRandom() {
  const pool = selectResults(store.get());
  if (!pool.length) return;
  const entry = pool[Math.floor(Math.random() * pool.length)];
  store.patch({ selectedId: entry.id });
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
  const id = location.hash.replace(/^#\/?w\//, '');
  store.patch({ selectedId: byId.has(id) ? id : null });
});

/* ----------------------------------------------------------------- boot */

store.subscribe(scheduleRender);
if (location.protocol !== 'file:') scheduleRender();

async function loadData() {
  if (location.protocol === 'file:') return;
  store.patch({ status: 'loading', error: null });
  try {
    const { meta, entries, categories } = await loadDataset();
    entries.forEach((entry) => byId.set(entry.id, entry));

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
      query: fromUrl.query,
      category: resolvedCategory,
      filters,
      sort: ['relevance', 'alpha', 'richest'].includes(fromUrl.sort) ? fromUrl.sort : 'relevance',
      selectedId: byId.has(fromUrl.selectedId) ? fromUrl.selectedId : null,
    });
    syncFilterInputs();

    if (el.meta) {
      el.meta.textContent =
        `${meta.total.toLocaleString('ta-IN')} சொற்கள் total words · ` +
        `${meta.withExample} எடுத்துக்காட்டுகள் with Examples · ` +
        `${meta.withEnglish} ஆங்கிலப் பொருள் with English meaning · ` +
        `${meta.needsMeaning} பொருள் தேவை without meaning · `;
    }
  } catch (error) {
    store.patch({ status: 'error', error: error.message || 'Unknown data loading error' });
  }
}

if (location.protocol !== 'file:') loadData();
