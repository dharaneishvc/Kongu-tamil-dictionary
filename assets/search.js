/**
 * Query normalisation and relevance scoring for the Kongu dictionary.
 *
 * Entries carry pre-folded keys (`kt`/`kl` headword+variants, `km`/`ke`
 * meanings, `kx` examples, `kn` notes) built when the CSV loads; this module
 * folds the query the same way so the two can be compared directly.
 */

const TAMIL_RE = /[\u0B80-\u0BFF]/;
const LATIN_RE = /[A-Za-z]/;

const hasTamil = (value) => TAMIL_RE.test(value || '');
const hasLatin = (value) => LATIN_RE.test(value || '');

const LATIN_DIGRAPHS = [
  // casual double-vowel spellings for long vowels (ī/ū strip to plain i/u
  // after diacritics are removed, so "ee"/"oo" must fold the same way)
  ['aa', 'a'], ['ee', 'i'], ['ii', 'i'], ['oo', 'u'], ['uu', 'u'],
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

/** Non-letters become single spaces (keepWords) or are dropped entirely. */
function clean(s, nonLetters, keepWords) {
  return keepWords ? s.replace(nonLetters, ' ').replace(/\s+/g, ' ').trim() : s.replace(nonLetters, '');
}

function latinFold(text, keepWords) {
  if (!text) return '';
  let s = text.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  s = clean(s, /[^a-z]+/g, keepWords);
  for (const [from, to] of LATIN_DIGRAPHS) s = s.split(from).join(to);
  s = [...s].map((ch) => LATIN_SINGLES[ch] ?? ch).join('');
  return collapse(s);
}

function tamilFold(text, keepWords) {
  if (!text) return '';
  let s = text.normalize('NFC');
  s = [...s].map((ch) => (ch in TAMIL_FOLD ? TAMIL_FOLD[ch] : ch)).join('');
  s = s.split(PULLI).join('');
  s = clean(s, /[^\u0B80-\u0BFF]+/g, keepWords);
  return collapse(s);
}

// Single-argument wrappers so they are safe to pass straight to Array#map.
/** Prose folds keep word boundaries (meanings, examples, notes). */
export const foldLatin = (text) => latinFold(text, true);
export const foldTamil = (text) => tamilFold(text, true);
/** Headwords/variants compare as one unit, so spacing never affects a match. */
export const foldLatinTerm = (text) => latinFold(text, false);
export const foldTamilTerm = (text) => tamilFold(text, false);

/** Build the comparable keys for whatever the user typed. */
export function queryKeys(query) {
  const raw = (query || '').trim();
  const tamil = hasTamil(raw);
  const latin = hasLatin(raw);
  return {
    raw,
    tamil: tamil ? foldTamil(raw) : '',
    latin: latin ? foldLatin(raw) : '',
    tamilTerm: tamil ? foldTamilTerm(raw) : '',
    latinTerm: latin ? foldLatinTerm(raw) : '',
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
  ['km', 'tamil', 55],    // meaning, Tamil
  ['ke', 'latin', 55],    // meaning, English
  ['kx', 'tamil', 28],    // usage examples
  ['kn', 'tamil', 12],    // notes and editorial context
];

function valueScore(value, key, weight) {
  if (!value || !key) return 0;
  if (value === key) return weight + 40;
  if (value.startsWith(key)) return weight + 25;
  if (value.includes(` ${key}`)) return weight + 15;
  return key.length > 2 && value.includes(key) ? weight : 0;
}

function bestTermScore(values, key, weight) {
  return Math.max(0, ...values.map((value) => valueScore(value, key, weight)));
}

/**
 * Score one entry against the prepared query keys.
 * Returns 0 when the entry does not match at all.
 */
export function matchEntry(entry, keys) {
  let best = { score: 0, reason: '' };
  const consider = (score, reason) => {
    if (score > best.score) best = { score, reason };
  };

  // an exact literal match on headword or variants always beats folded matches
  if (keys.raw) {
    const rawLower = keys.raw.toLowerCase();
    if (entry.word === keys.raw || (entry.latin && entry.latin.toLowerCase() === rawLower)) {
      consider(200, 'headword');
    } else if (
      (entry.variants && entry.variants.includes(keys.raw)) ||
      (entry.latinVariants && entry.latinVariants.some((v) => v.toLowerCase() === rawLower))
    ) {
      consider(180, 'variant');
    }
  }

  consider(valueScore(entry.ktHead, keys.tamilTerm, 100), 'headword');
  consider(valueScore(entry.klHead, keys.latinTerm, 100), 'headword');
  consider(bestTermScore(entry.kt.split(' ').slice(1), keys.tamilTerm, 100), 'variant');
  consider(bestTermScore(entry.kl.split(' ').slice(1), keys.latinTerm, 100), 'variant');

  for (const [field, kind, weight] of FIELD_WEIGHTS) {
    const key = keys[kind];
    const reason = field === 'kx' ? 'example' : field === 'kn' ? 'notes' : 'meaning';
    consider(valueScore(entry[field], key, weight), reason);
  }

  if (best.score === 0 && keys.raw.length >= 3) {
    // fall back to loose letter-order matching on the headword only
    for (const [field, kind] of [['kt', 'tamilTerm'], ['kl', 'latinTerm']]) {
      const key = keys[kind];
      if (key && key.length >= 3 && isSubsequence(key, entry[field] || '')) {
        consider(20, 'headword');
      }
    }
  }

  // shorter headwords are usually the better hit for an equal-quality match
  if (best.score > 0) best.score += Math.max(0, 12 - (entry.word || '').length) / 100;
  return best;
}

function editDistance(first, second) {
  const row = Array.from({ length: second.length + 1 }, (_, index) => index);
  for (let i = 1; i <= first.length; i += 1) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= second.length; j += 1) {
      const above = row[j];
      row[j] = first[i - 1] === second[j - 1]
        ? diagonal
        : 1 + Math.min(diagonal, above, row[j - 1]);
      diagonal = above;
    }
  }
  return row[second.length];
}

/** Headwords within a small edit distance of the query, for "Did you mean?". */
export function suggestClosest(entries, query, limit = 5) {
  const keys = queryKeys(query);
  const key = keys.tamilTerm || keys.latinTerm;
  if (!key || key.length < 3) return [];
  const field = keys.tamilTerm ? 'kt' : 'kl';
  return entries
    .map((entry) => {
      const terms = entry[field].split(' ').filter(Boolean);
      return { entry, distance: Math.min(...terms.map((term) => editDistance(key, term))) };
    })
    .filter(({ distance }) => distance <= Math.max(2, Math.ceil(key.length * 0.45)))
    .sort((a, b) => a.distance - b.distance || a.entry.word.localeCompare(b.entry.word, 'ta'))
    .slice(0, limit)
    .map(({ entry }) => entry);
}
