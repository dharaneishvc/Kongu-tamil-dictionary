/**
 * Query normalisation and relevance scoring for the Kongu dictionary.
 *
 * Entries are prepared with fold keys (`kt`, `kl`, `km`, `ke`) when the CSV
 * loads; this module folds the query the same way so the two can be compared
 * directly.
 */

const TAMIL_RE = /[\u0B80-\u0BFF]/;
const LATIN_RE = /[A-Za-z]/;

export const hasTamil = (s) => TAMIL_RE.test(s || '');
export const hasLatin = (s) => LATIN_RE.test(s || '');

const LATIN_DIGRAPHS = [
  // casual double-vowel spellings for long vowels (ī/ū strip to plain i/u
  // after diacritics are removed, so "ee"/"oo" must fold the same way)
  ['ee', 'i'], ['oo', 'u'],
  ['zh', 'l'], ['th', 't'], ['dh', 't'], ['sh', 's'], ['ch', 's'],
  ['ph', 'p'], ['gh', 'k'], ['kh', 'k'], ['bh', 'p'], ['jh', 's'],
  ['ng', 'n'], ['nj', 'n'], ['nd', 'nt'], ['mb', 'mp'],
];

const LATIN_SINGLES = {
  d: 't', g: 'k', b: 'p', j: 's', w: 'v', z: 's',
  // 'c' always transliterates ச (ch/s sound) in this dataset — fold it like
  // the 'ch' digraph, not like English hard-c, or "chee"/"see" queries never
  // match headwords spelled with plain 'c' (e.g. cīrāṭṭutal).
  c: 's', q: 'k', x: 'ks', f: 'p', y: 'i',
};

const TAMIL_FOLD = {
  'ழ': 'ல', 'ள': 'ல',
  'ற': 'ர',
  'ண': 'ந', 'ன': 'ந',
  'ஸ': 'ச', 'ஷ': 'ச', 'ஜ': 'ச', 'ஶ': 'ச', 'ஹ': 'க',
  'ஆ': 'அ', 'ஈ': 'இ', 'ஊ': 'உ', 'ஏ': 'எ', 'ஓ': 'ஒ',
  '\u0BBE': '', '\u0BC0': '\u0BBF', '\u0BC2': '\u0BC1',
  '\u0BC7': '\u0BC6', '\u0BCB': '\u0BCA',
};

const PULLI = '\u0BCD';

function collapse(text) {
  let out = '';
  for (const ch of text) {
    if (out.length && out[out.length - 1] === ch) continue;
    out += ch;
  }
  return out;
}

export function foldLatin(text) {
  if (!text) return '';
  let s = text.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  s = s.replace(/[^a-z]+/g, '');
  for (const [from, to] of LATIN_DIGRAPHS) s = s.split(from).join(to);
  s = [...s].map((ch) => LATIN_SINGLES[ch] ?? ch).join('');
  return collapse(s);
}

export function foldTamil(text) {
  if (!text) return '';
  let s = text.normalize('NFC');
  s = [...s].map((ch) => (ch in TAMIL_FOLD ? TAMIL_FOLD[ch] : ch)).join('');
  s = s.split(PULLI).join('');
  s = s.replace(/[^\u0B80-\u0BFF]+/g, '');
  return collapse(s);
}

/** Build the comparable keys for whatever the user typed. */
export function queryKeys(query) {
  const trimmed = (query || '').trim();
  return {
    raw: trimmed,
    tamil: hasTamil(trimmed) ? foldTamil(trimmed) : '',
    latin: hasLatin(trimmed) ? foldLatin(trimmed) : '',
  };
}

/** Cheap "letters appear in order" test, used only as a last-resort match. */
function isSubsequence(needle, haystack) {
  let i = 0;
  for (const ch of haystack) {
    if (ch === needle[i]) i += 1;
    if (i === needle.length) return true;
  }
  return needle.length === 0;
}

const FIELD_WEIGHTS = [
  ['kt', 'tamil', 100],   // headword + variants, Tamil script
  ['kl', 'latin', 100],   // headword + variants, romanised
  ['km', 'tamil', 55],    // meaning, Tamil
  ['ke', 'latin', 55],    // meaning, English
];

/**
 * Score one entry against the prepared query keys.
 * Returns 0 when the entry does not match at all.
 */
export function scoreEntry(entry, keys) {
  let best = 0;

  // an exact match on the headword OR any single variant/spelling always wins
  // over a mere prefix/substring hit, regardless of field weight order below
  if (keys.tamil && entry.kt && (entry.ktHead === keys.tamil || entry.kt.split(' ').includes(keys.tamil))) {
    best = Math.max(best, 140);
  }
  if (keys.latin && entry.kl && (entry.klHead === keys.latin || entry.kl.split(' ').includes(keys.latin))) {
    best = Math.max(best, 140);
  }

  for (const [field, kind, weight] of FIELD_WEIGHTS) {
    const key = keys[kind];
    if (!key) continue;
    const value = entry[field];
    if (!value) continue;

    if (value === key) best = Math.max(best, weight + 40);
    else if (value.startsWith(key)) best = Math.max(best, weight + 25);
    else if (new RegExp(`(^| )${key}`).test(value)) best = Math.max(best, weight + 15);
    // a mid-word hit on a 1-2 letter key is noise, not a match
    else if (key.length > 2 && value.includes(key)) best = Math.max(best, weight);
  }

  if (best === 0 && keys.raw.length >= 3) {
    // fall back to loose letter-order matching on the headword only
    for (const [field, kind] of [['kt', 'tamil'], ['kl', 'latin']]) {
      const key = keys[kind];
      if (key && key.length >= 3 && isSubsequence(key, entry[field] || '')) {
        best = Math.max(best, 20);
      }
    }
  }

  // shorter headwords are usually the better hit for an equal-quality match
  return best === 0 ? 0 : best + Math.max(0, 12 - (entry.word || '').length) / 100;
}
