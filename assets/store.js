/**
 * Minimal observable store: one state object, shallow patches, subscribers.
 * Keeps the rendering layer dumb and the data flow one-directional.
 */
import { parseCsvRecords } from './csv.js';
import { foldLatin, foldTamil } from './search.js';

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

export const DATASET_URL = 'data/entries.csv';
export const CATEGORY_GROUPS_URL = 'data/categories.csv';
export const INITIAL_LIMIT = 24;
export const PAGE_SIZE = 60;

const ENTRY_HEADER = [
  'id', 'headword', 'variants', 'latin', 'latin_variants', 'meaning_ta',
  'meaning_en', 'examples', 'word_type', 'category_id', 'notes', 'image',
];
const CATEGORY_HEADER = ['id', 'label_ta', 'label_en', 'is_active'];

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
};

const MULTI_VALUE_SEP = '|';

const split = (value) =>
  (value || '')
    .split(MULTI_VALUE_SEP)
    .map((part) => part.trim())
    .filter(Boolean);

/** Load the committed CSV files — data and category master. */
export async function loadDataset(url = DATASET_URL) {
  const [datasetResponse, groupsResponse] = await Promise.all([
    fetch(url, { cache: 'no-cache' }),
    fetch(CATEGORY_GROUPS_URL, { cache: 'no-cache' }),
  ]);

  if (!datasetResponse.ok) throw new Error(`Dataset request failed (${datasetResponse.status})`);
  if (!groupsResponse.ok) throw new Error(`Category groups request failed (${groupsResponse.status})`);

  const groups = parseCsvRecords(await groupsResponse.text(), CATEGORY_HEADER)
    .filter((record) => (record.id || '').trim())
    .map(normaliseGroup);
  const groupIds = new Set();
  for (const group of groups) {
    if (groupIds.has(group.id)) throw new Error(`Duplicate category id: ${group.id}`);
    groupIds.add(group.id);
  }
  const groupById = new Map(groups.map((group) => [group.id, group]));

  const entries = parseCsvRecords(await datasetResponse.text(), ENTRY_HEADER)
    .filter((record) => (record.headword || '').trim())
    .map((record) => toEntry(record, groupById));

  const entryIds = new Set();
  for (const entry of entries) {
    if (!/^\d+$/.test(entry.id)) throw new Error(`Entry has an invalid id: ${entry.id || '(blank)'}`);
    if (entryIds.has(entry.id)) throw new Error(`Duplicate entry id: ${entry.id}`);
    entryIds.add(entry.id);
    for (const categoryId of entry.categories) {
      if (!groupById.has(categoryId)) throw new Error(`Unknown category id: ${categoryId}`);
    }
  }

  const categories = collectCategories(entries, groupById);

  return { meta: buildMeta(entries), entries, categories, categoryGroups: groups };
}

function normaliseGroup(record) {
  return {
    id: (record.id || '').trim(),
    label_ta: (record.label_ta || '').trim(),
    label_en: (record.label_en || '').trim(),
    is_active: String(record.is_active || '1').trim() !== '0',
  };
}

function toEntry(record, groupById) {
  const variants = split(record.variants);
  const latinVariants = split(record.latin_variants);
  const meanings = split(record.meaning_ta);
  const english = split(record.meaning_en);
  const categoryIds = split(record.category_id || record.category);

  const examples = split(record.examples);

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
    notes: split(record.notes),
    image: (record.image || '').trim(),
    // fuzzy keys, built once at load so searching stays a plain string compare
    kt: foldTamil([record.headword, ...variants].join(' ')),
    kl: foldLatin([record.latin, ...latinVariants].join(' ')),
    km: foldTamil(meanings.join(' ')),
    ke: foldLatin(english.join(' ')),
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
      const group = groupById.get(categoryId) || { id: categoryId, label_ta: categoryId, label_en: categoryId };
      counts.set(categoryId, (counts.get(categoryId) || 0) + 1);
      group.count = counts.get(categoryId);
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
