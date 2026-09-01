/** RFC 4180 CSV reader — handles quoted fields, embedded commas and newlines. */

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    if (row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
  };

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];

    if (quoted) {
      if (ch !== '"') {
        field += ch;
      } else if (source[i + 1] === '"') {
        field += '"';
        i += 1;
      } else {
        quoted = false;
      }
      continue;
    }

    if (ch === '"' && field === '') quoted = true;
    else if (ch === ',') endField();
    else if (ch === '\n') endRow();
    else if (ch !== '\r') field += ch;
  }

  if (field !== '' || row.length) endRow();
  return rows;
}

/** Parse into objects keyed by the header row and reject malformed records. */
export function parseCsvRecords(text, expectedHeader = null) {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const header = rows[0].map((name) => name.trim());
  if (header.some((name) => !name) || new Set(header).size !== header.length) {
    throw new Error('CSV header contains an empty or duplicate column name');
  }
  if (expectedHeader && header.join('\u0000') !== expectedHeader.join('\u0000')) {
    throw new Error(`CSV header mismatch: expected ${expectedHeader.join(',')}`);
  }

  return rows.slice(1).map((cells, index) => {
    if (cells.length !== header.length) {
      throw new Error(`CSV row ${index + 2} has ${cells.length} fields; expected ${header.length}`);
    }
    const record = {};
    header.forEach((name, index) => {
      record[name] = cells[index] ?? '';
    });
    return record;
  });
}
