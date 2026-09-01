/** Pure markup builders. No state, no side effects — easy to reason about. */

export const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Highlight literal query hits; falls back to plain escaping when absent. */
export function mark(text, query) {
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

export function entryCard(entry, query) {
  const meaning = entry.meanings[0]
    ? `<p class="card__meaning">${mark(entry.meanings[0], query)}</p>`
    : '<p class="card__meaning card__meaning--missing">பொருள் இன்னும் ஆவணப்படுத்தப்படவில்லை</p>';

  const example = entry.examples[0]
    ? `<p class="card__example">${mark(entry.examples[0], query)}</p>`
    : '';

  const english = entry.english.length
    ? `<p class="card__english">${mark(entry.english.join(', '), query)}</p>`
    : '';

  const thumb = entry.image
    ? `<img class="card__thumb" src="images/${esc(entry.image)}" alt="${esc(entry.word)}" loading="lazy" decoding="async" onerror="this.hidden=true">`
    : '';

  return `
    <article class="card" data-id="${esc(entry.id)}" tabindex="0" role="button"
             aria-label="${esc(entry.word)} — ${esc(entry.meanings[0] || 'பொருள் தேவை')}">
      ${thumb}
      <header class="card__head">
        <h3 class="card__word">${mark(entry.word, query)}</h3>
        <span class="card__latin">${mark(entry.latin, query)}</span>
        ${entry.type ? `<span class="tag tag--type">${esc(entry.type)}</span>` : ''}
      </header>
      ${meaning}
      ${english}
      ${example}
      ${entry.variants.length
        ? `<p class="card__variants"><span class="label">வேறு வடிவங்கள்</span> ${list(entry.variants, 'pill', query)}</p>`
        : ''}
    </article>`;
}

export function entryDetail(entry) {
  const section = (title, body) =>
    body ? `<section class="detail__section"><h4>${esc(title)}</h4>${body}</section>` : '';

  const ol = (values) => `<ol class="detail__list">${values.map((v) => `<li>${esc(v)}</li>`).join('')}</ol>`;
  const ul = (values) => `<ul class="detail__list">${values.map((v) => `<li>${esc(v)}</li>`).join('')}</ul>`;

  const categoryTags = entry.categoryLabels.length
    ? entry.categoryLabels.map((label) => `<span class="tag">${esc(label)}</span>`).join('')
    : (entry.categories || []).map((c) => `<span class="tag">${esc(c)}</span>`).join('');

  return `
    <form method="dialog" class="detail__close-form">
      <button class="detail__close" aria-label="மூடு" value="close">✕</button>
    </form>
    <article class="detail__body">
      <header>
        <h3 class="detail__word">${esc(entry.word)}</h3>
        <p class="detail__latin">${esc(entry.latin)}${
          entry.latinVariants.length ? ` · ${esc(entry.latinVariants.join(', '))}` : ''
        }</p>
        <p class="detail__tags">
          ${entry.type ? `<span class="tag tag--type">${esc(entry.type)}</span>` : ''}
          ${categoryTags}
        </p>
      </header>

      ${entry.image
        ? `<img class="detail__image" src="images/${esc(entry.image)}" alt="${esc(entry.word)}" loading="lazy" onerror="this.hidden=true">`
        : ''}

      ${entry.meanings.length
        ? section('பொருள் / Meaning', ol(entry.meanings))
        : section('பொருள்', '<p class="muted">இச்சொல் மூலத்தில் பட்டியலிடப்பட்டுள்ளது, ஆனால் பொருள் தரப்படவில்லை.</p>')}
      ${section('English', entry.english.length ? ul(entry.english) : '')}
      ${section('வழக்கு / எடுத்துக்காட்டு / Example', entry.examples.length ? ul(entry.examples) : '')}
      ${section('வேறு வடிவங்கள் / Other forms', entry.variants.length ? ul(entry.variants) : '')}
      ${section('குறிப்புகள் / Notes', entry.notes.length ? ul(entry.notes) : '')}

      <footer class="detail__foot">
        <button type="button" class="btn" data-action="copy-link" data-id="${esc(entry.id)}">🔗 இணைப்பை நகலெடு · Copy </button>
        <code class="detail__id">${esc(entry.id)}</code>
      </footer>
    </article>`;
}

export function suggestionItems(entries, activeIndex, query) {
  return entries
    .map((entry, index) => {
      const hint = entry.meanings[0] || entry.english[0] || 'பொருள் தேவை';
      return `
        <li id="sugg-${index}" class="suggest__item${index === activeIndex ? ' suggest__item--on' : ''}"
            role="option" aria-selected="${index === activeIndex}" data-id="${esc(entry.id)}">
          <span class="suggest__word">${mark(entry.word, query)}</span>
          <span class="suggest__latin">${mark(entry.latin, query)}</span>
          <span class="suggest__hint">${esc(hint)}</span>
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
  undocumented: 'பொருள் தேவை · Needs meaning',
};

const SORT_LABELS = { alpha: 'அகர வரிசை · A–Z', richest: 'விவரம் நிறைந்தவை · Richest' };

/** Removable pills summarising what is active, so the drawer can stay shut. */
export function activeFilterPills(state) {
  const pill = (kind, value, label) => `
    <button type="button" class="active-filter" data-clear="${kind}" data-value="${esc(value)}"
            title="நீக்கு">
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
