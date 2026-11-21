/**
 * Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, embedded commas and newlines, CRLF, BOM).
 * Returns an array of rows (arrays of strings). Blank lines are dropped.
 * Throws an Error that names the line when a quote is malformed.
 */
export function parseCsv(text) {
  const src = String(text ?? '').replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let quoteOpenedAt = 0;
  let line = 1;

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else if (ch === '\r' && src[i + 1] === '\n') {
        // keep a single newline inside quoted fields
      } else {
        if (ch === '\n') line++;
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      if (field !== '') throw new Error(`line ${line}: a quote appears in the middle of an unquoted field`);
      inQuotes = true;
      quoteOpenedAt = line;
    } else if (ch === ',') {
      endField();
    } else if (ch === '\r') {
      if (src[i + 1] === '\n') i++;
      endRow();
      line++;
    } else if (ch === '\n') {
      endRow();
      line++;
    } else {
      field += ch;
    }
  }
  if (inQuotes) throw new Error(`line ${quoteOpenedAt}: a quoted field is never closed`);
  if (field !== '' || row.length) endRow();
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}
