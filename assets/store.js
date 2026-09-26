/**
 * App state and data: a minimal observable store, plus loading and indexing
 * the CSV dataset (with an IndexedDB copy for offline use).
 */
import { parseCsvRecords } from './csv.js?v=1';
import { foldLatin, foldLatinTerm, foldTamil, foldTamilTerm } from './search.js?v=1';

export function createStore(initialState) {
  let state = { ...initialState };
  const listeners = new Set();

  return {
    get() {
      return state;
    },
    patch(partial) {
      const next = { ...state, ...partial };
      const changed = Object.keys(partial).some((key) => next[key] !== state[key]);
      if (!changed) return state;
      state = next;
      listeners.forEach((listener) => listener(state));
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const DATASET_URL = 'data/entries.csv';
const CATEGORY_GROUPS_URL = 'data/categories.csv';
const SOURCES_URL = 'data/sources.csv';
export const INITIAL_LIMIT = 24;
export const PAGE_SIZE = 60;

export const STORAGE_KEYS = { favorites: 'kongu.favorites', recent: 'kongu.recent' };

const readList = (key) => {
  try { return JSON.parse(localStorage.getItem(key) || '[]').filter(Boolean); } catch { return []; }
};

export function saveList(key, values) {
  try { localStorage.setItem(key, JSON.stringify(values)); } catch { /* storage blocked: keep in memory only */ }
}

const ENTRY_HEADER = [
  'id', 'headword', 'variants', 'latin', 'latin_variants', 'meaning_ta',
  'meaning_en', 'examples', 'word_type', 'category_id', 'notes', 'source_id', 'image',
];
const CATEGORY_HEADER = ['id', 'label_ta', 'label_en', 'is_active'];
const SOURCE_HEADER = ['id', 'label', 'is_active'];

export const initialState = {
  status: 'loading',
  error: null,
  entries: [],
  categories: [],
  query: '',
  category: '',
  sort: 'relevance',
  filters: { examples: false, english: false, images: false, undocumented: false },
  limit: INITIAL_LIMIT,
  viewAll: false,
  selectedId: null,
  suggestOpen: false,
  suggestIndex: -1,
  collection: '',
  favorites: readList(STORAGE_KEYS.favorites),
  recent: readList(STORAGE_KEYS.recent),
};

const MULTI_VALUE_SEP = '|';

const DATA_CACHE_DB = 'kongu-dictionary-cache';
const DATA_CACHE_STORE = 'datasets';
const DATA_CACHE_KEY = 'current';

function openDataCache() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB unavailable'));
    const request = indexedDB.open(DATA_CACHE_DB, 2);
    request.onupgradeneeded = () => request.result.createObjectStore(DATA_CACHE_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readCachedDataset() {
  let db;
  try {
    db = await openDataCache();
    return await new Promise((resolve, reject) => {
      const request = db.transaction(DATA_CACHE_STORE, 'readonly').objectStore(DATA_CACHE_STORE).get(DATA_CACHE_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch { return null; } finally { db?.close(); }
}

async function writeCachedDataset(dataset) {
  let db;
  try {
    db = await openDataCache();
    await new Promise((resolve, reject) => {
      const request = db.transaction(DATA_CACHE_STORE, 'readwrite').objectStore(DATA_CACHE_STORE).put(dataset, DATA_CACHE_KEY);
      request.onsuccess = resolve;
      request.onerror = () => reject(request.error);
    });
  } catch { /* storage restrictions must not block the dataset */ } finally { db?.close(); }
}

const split = (value) =>
  (value || '')
    .split(MULTI_VALUE_SEP)
    .map((part) => part.trim())
    .filter(Boolean);

/** Load the committed CSV files — data, category master and source master. */
export async function loadDataset() {
  try {
    const dataset = await fetchDataset();
    void writeCachedDataset(dataset);
    return dataset;
  } catch (error) {
    const cached = await readCachedDataset();
    if (cached) return cached;
    throw error;
  }
}

async function fetchDataset() {
  const [datasetResponse, groupsResponse, sourcesResponse] = await Promise.all([
    fetch(DATASET_URL, { cache: 'no-cache' }),
    fetch(CATEGORY_GROUPS_URL, { cache: 'no-cache' }),
    fetch(SOURCES_URL, { cache: 'no-cache' }),
  ]);

  if (!datasetResponse.ok) throw new Error(`Dataset request failed (${datasetResponse.status})`);
  if (!groupsResponse.ok) throw new Error(`Category groups request failed (${groupsResponse.status})`);
  if (!sourcesResponse.ok) throw new Error(`Source list request failed (${sourcesResponse.status})`);

  const groupById = indexById(
    parseCsvRecords(await groupsResponse.text(), CATEGORY_HEADER).map(normaliseGroup),
    'category',
  );
  const sourceById = indexById(
    parseCsvRecords(await sourcesResponse.text(), SOURCE_HEADER).map(normaliseSource),
    'source',
  );

  const entries = parseCsvRecords(await datasetResponse.text(), ENTRY_HEADER)
    .filter((record) => (record.headword || '').trim())
    .map((record) => toEntry(record, groupById, sourceById));

  const entryIds = new Set();
  for (const entry of entries) {
    if (!/^\d+$/.test(entry.id)) throw new Error(`Entry has an invalid id: ${entry.id || '(blank)'}`);
    if (entryIds.has(entry.id)) throw new Error(`Duplicate entry id: ${entry.id}`);
    entryIds.add(entry.id);
    for (const categoryId of entry.categories) {
      if (!groupById.has(categoryId)) throw new Error(`Unknown category id: ${categoryId}`);
    }
    for (const sourceId of entry.sourceIds) {
      if (!sourceById.has(sourceId)) throw new Error(`Unknown source id: ${sourceId}`);
    }
  }

  return { meta: buildMeta(entries), entries, categories: collectCategories(entries, groupById) };
}

/** Map master-table rows by id, skipping blank ids and rejecting duplicates. */
function indexById(records, kind) {
  const byId = new Map();
  for (const record of records) {
    if (!record.id) continue;
    if (byId.has(record.id)) throw new Error(`Duplicate ${kind} id: ${record.id}`);
    byId.set(record.id, record);
  }
  return byId;
}

function normaliseGroup(record) {
  return {
    id: (record.id || '').trim(),
    label_ta: (record.label_ta || '').trim(),
    label_en: (record.label_en || '').trim(),
    is_active: String(record.is_active || '1').trim() !== '0',
  };
}

function normaliseSource(record) {
  return {
    id: (record.id || '').trim(),
    label: (record.label || '').trim(),
    is_active: String(record.is_active || '1').trim() !== '0',
  };
}

function toEntry(record, groupById, sourceById) {
  const variants = split(record.variants);
  const latinVariants = split(record.latin_variants);
  const meanings = split(record.meaning_ta);
  const english = split(record.meaning_en);
  const categoryIds = split(record.category_id);
  const sourceIds = split(record.source_id);
  const examples = split(record.examples);
  const notes = split(record.notes);

  return {
    id: (record.id || '').trim(),
    word: record.headword.trim(),
    variants,
    latin: (record.latin || '').trim(),
    latinVariants,
    meanings,
    english,
    examples,
    type: (record.word_type || '').trim(),
    categories: categoryIds,
    categoryLabels: categoryIds
      .map((id) => {
        const group = groupById.get(id);
        if (!group) return id;
        return group.label_ta && group.label_en ? `${group.label_ta} · ${group.label_en}` : group.label_ta || group.label_en || id;
      }),
    notes,
    sourceIds,
    sourceLabels: sourceIds.map((id) => sourceById.get(id)?.label || id),
    image: (record.image || '').trim(),
    // Search keys, folded once at load. Headword/variant keys drop spaces (one term
    // each, space-joined); prose keys keep word boundaries.
    kt: [record.headword, ...variants].map(foldTamilTerm).filter(Boolean).join(' '),
    kl: [record.latin, ...latinVariants].map(foldLatinTerm).filter(Boolean).join(' '),
    km: meanings.map(foldTamil).filter(Boolean).join(' '),
    ke: english.map(foldLatin).filter(Boolean).join(' '),
    kx: examples.map(foldTamil).filter(Boolean).join(' '),
    kn: notes.map(foldTamil).filter(Boolean).join(' '),
    // headword-only keys, so an exact match always outranks a variant/partial hit
    ktHead: foldTamilTerm(record.headword),
    klHead: foldLatinTerm(record.latin),
  };
}

function buildMeta(entries) {
  return {
    total: entries.length,
    withExample: entries.filter((entry) => entry.examples.length).length,
    withEnglish: entries.filter((entry) => entry.english.length).length,
    needsMeaning: entries.filter((entry) => !entry.meanings.length).length,
  };
}

function collectCategories(entries, groupById) {
  const counts = new Map();
  for (const entry of entries) {
    for (const categoryId of entry.categories) {
      counts.set(categoryId, (counts.get(categoryId) || 0) + 1);
    }
  }

  return [...groupById.values()]
    .filter((group) => group.is_active !== false)
    .map((group) => ({
      id: group.id,
      label_ta: group.label_ta || group.id,
      label_en: group.label_en || group.id,
      count: counts.get(group.id) || 0,
    }))
    .sort((a, b) => b.count - a.count || a.label_ta.localeCompare(b.label_ta, 'ta'));
}
