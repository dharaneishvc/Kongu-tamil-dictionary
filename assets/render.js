/** Pure markup builders. No state, no side effects — easy to reason about. */

export const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Highlight literal query hits; falls back to plain escaping when absent. */
function mark(text, query) {
  const safe = esc(text);
  const needle = (query || '').trim();
  if (needle.length < 2) return safe;
  try {
    return safe.replace(new RegExp(escapeRegExp(esc(needle)), 'gi'), '<mark>$&</mark>');
  } catch {
    return safe;
  }
}

const list = (values, className, query) =>
  values.map((value) => `<span class="${className}">${mark(value, query)}</span>`).join('');

const MATCH_LABELS = {
  headword: 'தலைச்சொல் · Headword',
  variant: 'வேறு வடிவம் · Variant',
  meaning: 'பொருள் · Meaning',
  example: 'எடுத்துக்காட்டு · Example',
  notes: 'குறிப்பு · Note',
};

const NO_MEANING = 'பொருள் தேவை · Needs meaning';

const RESET_BUTTON = '<button type="button" class="btn" data-action="reset">வடிகட்டிகளை நீக்கு · Remove filters</button>';

/** Full-width message shown in place of the result grid; `body` is trusted markup. */
export const emptyState = (title, body = '') =>
  `<div class="empty"><p class="empty__title">${esc(title)}</p>${body}</div>`;

export function collectionEmptyState(collection) {
  return collection === 'favorites'
    ? emptyState('சேமித்த சொற்கள் இல்லை · No saved words', '<p class="muted">ஒரு சொல்லின் விவரத்தைத் திறந்து “சேமி” என்பதைத் தேர்ந்தெடுக்கவும். · Open a word and choose “Save”.</p>')
    : emptyState('சமீபத்திய சொற்கள் இல்லை · No recent words', '<p class="muted">நீங்கள் திறக்கும் சொற்கள் இங்கே தோன்றும். · Words you open will appear here.</p>');
}

/** No-match state, offering close spellings when there are any. */
export function noResultsState(closest) {
  const hint = closest.length
    ? `<p class="muted">இந்தச் சொல்லைத் தேடினீர்களா? · Did you mean?</p><div class="chips">${closest
        .map((entry) => `<button type="button" class="chip" data-action="use-suggestion" data-query="${esc(entry.word)}">${esc(entry.word)}</button>`)
        .join('')}</div>`
    : '<p class="muted">எழுத்துப்பிழை இருக்கலாம் — வேறு வடிவத்தில் முயற்சிக்கவும், அல்லது வடிகட்டிகளை நீக்கவும். · Maybe a typo — try another spelling, or remove filters.</p>';
  return emptyState('முடிவுகள் இல்லை · No results', `${hint}<div class="empty__actions">${RESET_BUTTON}</div>`);
}

export function entryCard(entry, query) {
  const meaning = entry.meanings[0]
    ? `<p class="card__meaning">${mark(entry.meanings[0], query)}</p>`
    : '<p class="card__meaning card__meaning--missing">பொருள் இன்னும் ஆவணப்படுத்தப்படவில்லை · Meaning not yet documented</p>';

  const example = entry.examples[0]
    ? `<p class="card__example">${mark(entry.examples[0], query)}</p>`
    : '';

  const english = entry.english.length
    ? `<p class="card__english">${mark(entry.english.join(', '), query)}</p>`
    : '';

  const thumb = entry.image
    ? `<img class="card__thumb" src="images/${esc(entry.image)}" alt="${esc(entry.word)}" loading="lazy" decoding="async">`
    : '';

  return `
    <article class="card" data-id="${esc(entry.id)}" tabindex="0" role="button"
             aria-label="${esc(entry.word)} — ${esc(entry.meanings[0] || NO_MEANING)}">
      ${thumb}
      <header class="card__head">
        <h3 class="card__word">${mark(entry.word, query)}</h3>
        <span class="card__latin">${mark(entry.latin, query)}</span>
        ${entry.type ? `<span class="tag tag--type">${esc(entry.type)}</span>` : ''}
      </header>
      ${entry.matchReason
        ? `<p class="card__match"><span class="label">பொருத்தம் · Match</span> ${esc(MATCH_LABELS[entry.matchReason] || entry.matchReason)}</p>`
        : ''}
      ${meaning}
      ${english}
      ${example}
      ${entry.variants.length
        ? `<p class="card__variants"><span class="label">வேறு வடிவங்கள் · Variants</span> ${list(entry.variants, 'pill', query)}</p>`
        : ''}
    </article>`;
}

export function entryDetail(entry, isFavorite = false) {
  const section = (title, body) =>
    body ? `<section class="detail__section"><h4>${esc(title)}</h4>${body}</section>` : '';

  const ol = (values) => `<ol class="detail__list">${values.map((v) => `<li>${esc(v)}</li>`).join('')}</ol>`;
  const ul = (values) => `<ul class="detail__list">${values.map((v) => `<li>${esc(v)}</li>`).join('')}</ul>`;

  const categoryTags = entry.categoryLabels.map((label) => `<span class="tag">${esc(label)}</span>`).join('');

  return `
    <form method="dialog" class="detail__close-form">
      <button class="detail__close" aria-label="மூடு · Close" value="close">✕</button>
    </form>
    <article class="detail__body">
      <header>
        <div class="detail__word-row"><h3 class="detail__word">${esc(entry.word)}</h3><button type="button" class="detail__speak" data-action="speak" data-id="${esc(entry.id)}" title="ஒலிப்பைக் கேட்க · Hear pronunciation" aria-label="ஒலிப்பைக் கேட்க · Hear pronunciation">🔊</button></div>
        <p class="detail__latin">${esc(entry.latin)}${
          entry.latinVariants.length ? ` · ${esc(entry.latinVariants.join(', '))}` : ''
        }</p>
        <p class="detail__tags">
          ${entry.type ? `<span class="tag tag--type">${esc(entry.type)}</span>` : ''}
          ${categoryTags}
        </p>
      </header>

      ${entry.image
        ? `<img class="detail__image" src="images/${esc(entry.image)}" alt="${esc(entry.word)}" loading="lazy">`
        : ''}

      ${entry.meanings.length
        ? section('பொருள் / Meaning', ol(entry.meanings))
        : section('பொருள் / Meaning', '<p class="muted">இச்சொல் மூலத்தில் பட்டியலிடப்பட்டுள்ளது, ஆனால் பொருள் தரப்படவில்லை. · Listed in the source without a meaning.</p>')}
      ${section('English', entry.english.length ? ul(entry.english) : '')}
      ${section('வழக்கு / எடுத்துக்காட்டு / Example', entry.examples.length ? ul(entry.examples) : '')}
      ${section('வேறு வடிவங்கள் / Other forms', entry.variants.length ? ul(entry.variants) : '')}
      ${section('குறிப்புகள் / Notes', entry.notes.length ? ul(entry.notes) : '')}
      ${section('மூலம் / Source', entry.sourceLabels.length ? ul(entry.sourceLabels) : '')}

      <footer class="detail__foot">
        <button type="button" class="btn detail__favorite" data-action="toggle-favorite" data-id="${esc(entry.id)}" title="${isFavorite ? "சேமிப்பை நீக்கு · Remove saved word" : "சேமி · Save word"}" aria-label="${isFavorite ? "சேமிப்பை நீக்கு · Remove saved word" : "சேமி · Save word"}">&#x1F516; <span>${isFavorite ? "சேமிக்கப்பட்டது · Saved" : "சேமி · Save"}</span></button>
        <button type="button" class="btn" data-action="share" data-id="${esc(entry.id)}" title="பகிர் · Share" aria-label="பகிர் · Share">பகிர் · Share</button>
        <button type="button" class="btn" data-action="copy-link" data-id="${esc(entry.id)}" title="இணைப்பை நகலெடு · Copy link" aria-label="இணைப்பை நகலெடு · Copy link">&#x1F517; இணைப்பை நகலெடு · Copy link</button>
        <code class="detail__id">${esc(entry.id)}</code>
      </footer>
    </article>`;
}

export function suggestionItems(entries, activeIndex, query) {
  return entries
    .map((entry, index) => {
      const hint = entry.meanings[0] || entry.english[0] || NO_MEANING;
      const reason = MATCH_LABELS[entry.matchReason];
      return `
        <li id="sugg-${index}" class="suggest__item${index === activeIndex ? ' suggest__item--on' : ''}"
            role="option" aria-selected="${index === activeIndex}" data-id="${esc(entry.id)}">
          <span class="suggest__word">${mark(entry.word, query)}</span>
          <span class="suggest__latin">${mark(entry.latin, query)}</span>
          <span class="suggest__hint">${reason ? `<span class="suggest__reason">${esc(reason)}</span> · ` : ''}${esc(hint)}</span>
        </li>`;
    })
    .join('');
}

export function categoryChips(categories, active) {
  const chip = (value, label, count) => `
    <button type="button" class="chip${value === active ? ' chip--on' : ''}"
            data-category="${esc(value)}" aria-pressed="${value === active}">
      ${esc(label)}${count != null ? `<span class="chip__count">${count}</span>` : ''}
    </button>`;

  return [chip('', 'அனைத்தும் · All', null)]
    .concat(categories.map((c) => chip(c.id, `${c.label_ta} · ${c.label_en}`, c.count)))
    .join('');
}

const FILTER_LABELS = {
  examples: 'எடுத்துக்காட்டு உள்ளவை · Has example',
  english: 'ஆங்கிலப் பொருள் உள்ளவை · Has English',
  images: 'படம் உள்ளவை · Has image',
  undocumented: NO_MEANING,
};

const SORT_LABELS = { alpha: 'அகர வரிசை · A–Z', richest: 'விவரம் நிறைந்தவை · Richest' };

/** Removable pills summarising what is active, so the drawer can stay shut. */
export function activeFilterPills(state) {
  const pill = (kind, value, label) => `
    <button type="button" class="active-filter" data-clear="${kind}" data-value="${esc(value)}"
            title="நீக்கு · Remove" aria-label="${esc(label)} — நீக்கு · Remove">
      ${esc(label)}<span aria-hidden="true">✕</span>
    </button>`;

  const pills = [];
  if (state.category) {
    const category = state.categories.find((item) => item.id === state.category);
    const label = category ? `${category.label_ta} · ${category.label_en}` : state.category;
    pills.push(pill('category', state.category, label));
  }
  for (const [name, on] of Object.entries(state.filters)) {
    if (on) pills.push(pill('filter', name, FILTER_LABELS[name]));
  }
  if (state.sort !== 'relevance') pills.push(pill('sort', state.sort, SORT_LABELS[state.sort]));
  return pills.join('');
}
