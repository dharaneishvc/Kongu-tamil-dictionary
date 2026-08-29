# கொங்கு வட்டார வழக்கு அகராதி · Kongu Tamil Dialect Dictionary

An open, community-editable dictionary of **Kongu Tamil** (கொங்குத் தமிழ்) regional
and archaic words — published as a plain CSV dataset with a fast, dependency-free
website on top of it.

## Core design pattern: one data CSV + one category master CSV

The project is built around a simple, extensible schema:

- `data/entries.csv` stores the dictionary entries.
- `data/categories.csv` stores the category master list.
- Each row in the dictionary uses a foreign key such as `category_id` instead of a hardcoded Tamil label.
- The site resolves the category name and English label at runtime from the master CSV.
- The first view always starts on **All**. If a new group is added to `categories.csv` with `is_active=1`, it appears in the filter UI automatically.

This keeps the taxonomy open and future-proof: the website and filters are driven by data, not by hardcoded JS constants.

* **Dataset** — [`data/entries.csv`](data/entries.csv) · CC BY-SA 4.0
* **Website** — static HTML/CSS/ES-modules, no framework, no build step, no tracking
* **Search** — works in Tamil script *and* Latin transliteration / phonetic romanization, spelling-tolerant, with live autocomplete
* **Contributing** — [`contribute.html`](contribute.html) explains the whole workflow on the site itself

---

## Table of contents

1. [What this is](#what-this-is)
2. [Where the data came from](#where-the-data-came-from)
3. [Dataset schema](#dataset-schema)
4. [Using the dataset](#using-the-dataset)
5. [Running the site locally](#running-the-site-locally)
6. [Deploying for free](#deploying-for-free)
7. [How to contribute](#how-to-contribute)
   * [Add a new word](#a-add-a-new-word)
   * [Edit an existing word](#b-edit-an-existing-word)
   * [Merge duplicates](#c-merge-duplicates)
   * [Add an image](#d-add-an-image)
   * [Formatting rules](#e-formatting-rules-read-this)
   * [Review checklist](#f-review-checklist)
8. [How the site works](#how-the-site-works)
9. [Licence](#licence)

---

## What this is

The aim is a comprehensive dialect dictionary compiling **over 3,000** native words,
phrases and expressions unique to the Kongu belt, each with its grammatical
classification, context and usage examples. It focuses deeply on the agrarian roots,
lifestyle, kinship and distinctive tonal expressions of Kongu Tamil, capturing many
fading words tied to traditional farming, household objects and rural Kongu life.
The live website counts the current entries directly from the CSV.

Kongu Tamil is the dialect of the Kongu Nadu region (Coimbatore, Erode, Salem,
Tiruppur, Karur, Namakkal and neighbouring parts of Karnataka and Kerala). Much of
its vocabulary — words for farm tools, house parts, kinship, festivals, food — is
disappearing as the dialect levels toward standard spoken Tamil.

Existing word lists for the dialect are scattered prose: hard to search, impossible to
query, full of duplicates. This project consolidates them into **one normalised,
machine-readable dataset** and gives it a search interface that works the way people
actually type — including Latin-letter phonetic input, and without demanding that you know whether
the word is spelled with ழ, ள or ல.

**Design goals**

| Goal | How |
| --- | --- |
| One source of truth | Dictionary rows and category metadata are plain CSV files. The site reads them directly; nothing is generated. |
| Editable by non-programmers | Any row can be fixed in GitHub's web editor, no tooling. |
| Zero lock-in | No framework, no CDN, no database, no API key, no build. |
| Honest about gaps | Words with no recorded gloss are kept and flagged as "needs meaning" rather than silently dropped. |
| Free to host | Pure static files — GitHub Pages, Netlify, Cloudflare Pages all work. |

---

## Dataset schema

`data/entries.csv` — UTF-8, comma-separated, `\n` line endings, header row
first. Multi-valued cells use a space-padded pipe: ` | `.

| # | Column | Required | Description |
| --- | --- | --- | --- |
| 1 | `id` | auto | Stable numeric identifier, such as `1`. Permalinks (`#/w/1`) depend on it — never renumber existing rows. |
| 2 | `headword` | **yes** | The Kongu word, Tamil script. One per row. |
| 3 | `variants` | no | Alternative spellings/forms of the same word. |
| 4 | `latin` | no | Latin-letter phonetic transliteration of the headword, not an English meaning. |
| 5 | `latin_variants` | no | Other Latin transliteration spellings people might type. |
| 6 | `meaning_ta` | **yes**\* | Meaning in Tamil. Multiple senses separated by `|`. |
| 7 | `meaning_en` | no | English gloss. |
| 8 | `example_1` | no | Usage sentence. |
| 9 | `example_2` | no | Second usage sentence. |
| 10 | `more_examples` | no | Any further sentences, `|`-separated. |
| 11 | `word_type` | no | பெயர்ச்சொல் / வினைச்சொல் / உரிச்சொல் … |
| 12 | `category_id` | **yes** | Foreign key into `data/categories.csv`; drives bilingual category chips on the site. |
| 13 | `notes` | no | Etymology, sub-regional usage, caveats. |
| 14 | `image` | no | Filename inside `images/`, e.g. `ollu.jpg`. Not a path. |

\* Some entries may have an empty `meaning_ta`: the word is recorded but no gloss
has been written yet. They are deliberately retained — filter for them on the site with
**பொருள் தேவை** and fill them in.

**Categories.** Every entry points to one category in `data/categories.csv`; the website
calculates category counts from the CSV at runtime.

| Group |
| --- |
| வீடும் வீட்டுப் பொருளும் |
| உணவும் சமையலும் |
| விவசாயமும் கால்நடையும் |
| மனிதப் பண்பும் நடத்தையும் |
| செயலும் வினையும் |
| உடலும் நலமும் |
| பேச்சு வழக்கும் உரிச்சொல்லும் |
| இயற்கையும் உயிரினமும் |
| பண்டிகை, சடங்கு, வழிபாடு |
| இடமும் திசையும் |
| உறவுமுறைச் சொற்கள் |
| நேரமும் பருவமும் |
| அளவும் அளவைகளும் |
| உடையும் அணிகலனும் |

To count rows locally:

```bash
python -c "import csv; print(len(list(csv.DictReader(open('data/entries.csv', encoding='utf-8')))))"
```

---

## Using the dataset

```python
import pandas as pd

df = pd.read_csv("data/entries.csv")
df["meaning_ta"] = df["meaning_ta"].fillna("").str.split(r"\s*\|\s*")
print(df.loc[df.category_id.eq("farming_livestock"), "headword"].head())
```

```bash
# every word that still needs a meaning
awk -F',' 'NR>1 && $6=="" {print $2}' data/entries.csv
```

```js
const rows = (await (await fetch('data/entries.csv')).text());
```

Attribution: the dataset is CC BY-SA 4.0 — credit this project and keep derivatives
share-alike.

---

## Running the site locally

Once it is hosted (GitHub Pages, Netlify, …) nothing extra is needed — it is plain
static files over HTTP.

Locally, **double-clicking `index.html` may show a blank page**. Most browsers refuse
to load ES modules and `fetch()` a data file from a `file://` URL, because that origin
is treated as opaque. Some Chromium builds allow it, so it might work for you; if it
does not, the page shows a short notice explaining what to do rather than failing
silently.

The reliable way is to serve the folder over HTTP:

```bash
python -m http.server 8000
# open http://localhost:8000
```

Any static server works (`npx serve`, `php -S localhost:8000`, VS Code Live Server).
There is nothing to install, compile or watch.

---

## Deploying for free

**GitHub Pages** — Settings → Pages → *Deploy from a branch* → `main` / `root`.
Done; the site is entirely static and every path is relative, so it works from a
subdirectory such as `username.github.io/kongu-dictionary/`.

**Netlify / Cloudflare Pages / Vercel** — connect the repo, leave the build command
empty and set the publish directory to `/`.

---

## How to contribute

Most edits live in **`data/entries.csv`**. Category names live in
**`data/categories.csv`**. Edit the CSVs and the site changes; you do not need to
touch any JavaScript. The same guide is available on the site itself at
[`contribute.html`](contribute.html), written bilingually.

The easiest route needs no local setup at all:

> Open [`data/entries.csv`](data/entries.csv) on GitHub → click the
> ✏️ pencil → make your edit → **Commit changes** → **Propose changes** → **Create
> pull request**.

### A. Add a new word

Append a row at the end of the file. **Leave `id` empty** — a maintainer assigns it
when merging, which keeps existing permalinks stable.

```csv
id,headword,variants,latin,latin_variants,meaning_ta,meaning_en,example_1,example_2,more_examples,word_type,category_id,notes,image
,ஒல்லு,,ollu,,நெல் குத்தும் செக்கு,husking mill,ஒல்லுல நெல்லக் குத்திட்டு வா,,,,farming_livestock,,
```

Minimum viable row: `headword` + `meaning_ta`. Everything else is a bonus — but a
usage sentence in `example_1` is worth more than any other optional field, because it
shows the word alive in context.

Before adding, **search the site first**. The search is spelling-tolerant precisely so
you can find near-duplicates: `பொடக்காலி`, `podakkaali` and `potakkali` all reach the
same entry.

### B. Edit an existing word

1. Find the word on the site and open its card; the detail panel shows its numeric `id`
  (e.g. `123`).
2. In the CSV, <kbd>Ctrl</kbd>+<kbd>F</kbd> for that id.
3. Edit only that line. **Do not change the `id`.**

Adding a second sense to an existing word means extending the cell, not adding a row:

```diff
-123,கோடு,,kootu,,கடைசி,,,,,பெயர்ச்சொல்,home_household,,
+123,கோடு,,kootu,,கடைசி | பக்கம் உயர்ந்த அடுப்பு,,அந்தக் கோட்டிலே உட்கார்,,,,பெயர்ச்சொல்,home_household,"புறநானூறு 164 இல் ""கோடுயர் அடுப்பு""",
```

### C. Merge duplicates

Two rows for the same word is a bug. To fix it:

1. Keep the row with the **lower id**.
2. Move the other row's meanings, variants and examples into it, `|`-separating them.
3. Delete the second row entirely.

### D. Add an image

1. Upload the picture into `images/` — lowercase filename, no spaces, JPG or WebP,
   ideally under 300 KB and at least 800 px wide.
2. Put **just the filename** in that word's `image` column (`ollu.jpg`, not
   `images/ollu.jpg`).
3. The image must be your own photo, or licensed for commercial reuse. Note the
   source in `notes` if it is not yours.

The site picks it up automatically — as a thumbnail on the card and full width in the
detail panel. No code change is needed.

### E. Formatting rules (read this)

* **One row per headword.** Search before adding.
* **`|` separates multiple values** inside a single cell — never a comma.
* **Quote any cell containing a comma or a quotation mark**, per normal CSV rules:
  `"பொருள் ஒன்று, பொருள் இரண்டு"`. To include a literal `"`, double it: `""`.
* **UTF-8, no BOM.** If you use Excel, save as *CSV UTF-8 (Comma delimited)* — plain
  "CSV" mangles Tamil. LibreOffice Calc and Google Sheets are safer choices.
* **Never reorder or rename columns**, and never delete the header row.
* **Keep the tone factual.** If a meaning is uncertain, say so in `notes`
  (`"உறுதிப்படுத்தப்படவில்லை"`) rather than asserting it.

### F. Review checklist

Before opening the pull request:

- [ ] The word does not already exist (searched in both scripts).
- [ ] Column count is unchanged — 14 fields per row.
- [ ] Cells containing commas are quoted.
- [ ] `id` is untouched on edits, empty on new rows.
- [ ] The file still opens correctly (`python -m http.server` and load the site).
- [ ] Meaning is written in Tamil; English gloss, if given, is in `meaning_en`.

Not sure about something? Open an issue instead — a half-remembered word from a
grandparent is genuinely useful data, even if you cannot pin the spelling down.

---

## How the site works

```
index.html            dictionary search page
about.html            project overview and maintainer details
contribute.html       contribution guide
assets/
  main.js             browser entry point; wires DOM events to the store
  store.js            observable state + CSV loading + entry normalisation
  selectors.js        derives the visible result list (filter → score → sort), memoised
  search.js           query folding + relevance scoring
  csv.js              RFC 4180 parser (quoted fields, embedded commas/newlines)
  render.js           pure HTML builders — no state, no side effects
  router.js           mirrors query/filters/open word into the URL
  styles.css          design tokens + components, light & dark
data/entries.csv
data/categories.csv
images/
```

One-directional data flow: an event patches the store → the store notifies →
`selectors` recomputes (only if its signature changed) → `render` produces markup.
Rendering is scheduled through `requestAnimationFrame`, so a fast typist triggers one
paint, not twenty.

**Search.** Both the query and the entry are reduced to a *fold key* that erases the
distinctions people mix up: ழ/ள/ல, ண/ந/ன, ற/ர, long vs short vowels, pulli, and on
the Latin side `th`/`t`, `zh`/`l`, `ka`/`ga`, `sh`/`s`, doubled letters. Matches are
scored — exact beats prefix beats word-start beats substring, headword beats meaning —
with a subsequence pass as a last resort so a badly mistyped query still returns
something. For the current dataset size this is a linear scan taking well under a millisecond, so
there is no index to build or invalidate.

**Autocomplete.** The top eight matches drop down under the box as you type, showing
the word, its romanisation and a one-line gloss. Navigate with ↑/↓, open with
<kbd>Enter</kbd>, dismiss with <kbd>Esc</kbd>, or click. It reuses the same memoised
result list as the grid below, so it costs nothing extra. Implemented with the ARIA
combobox pattern (`role="combobox"`, `aria-activedescendant`, `role="listbox"`).

**Accessibility & niceties.** Keyboard-first (<kbd>/</kbd> focuses search, <kbd>F</kbd>
opens the filter drawer, <kbd>R</kbd> opens a random word, <kbd>Esc</kbd> clears),
`aria-live` result count, respects `prefers-reduced-motion` and
`prefers-color-scheme`, shareable URLs for every word, and infinite scroll via
`IntersectionObserver`. Filters and sorting live in a `<dialog>` drawer behind one
button, so the default page is just search and results; whatever is active is echoed
as removable pills next to the button.

---

## Licence

* **Dictionary text** — [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
  Contributions to the CSV are accepted under the same licence.
* **Website code** — MIT, see [`LICENSE`](LICENSE).
* **Images** — as stated per file; contributors must have the right to publish them.
