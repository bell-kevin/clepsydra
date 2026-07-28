// SPDX-License-Identifier: AGPL-3.0-only

export interface ParseResult {
  rows: Array<{ t: number; s: number }>;
  /** Line numbers that were skipped, with the reason, so nothing is dropped silently. */
  skipped: Array<{ line: number; text: string; reason: string }>;
  /** True when the values looked like heads (mostly negative) and were inverted. */
  signFlipped: boolean;
}

/**
 * Parse two columns of numbers out of whatever a person pastes in: a logger
 * export, a spreadsheet copy, a scan of a field sheet retyped by hand.
 *
 * Accepts comma, tab, semicolon or run-of-spaces separators. Ignores blank
 * lines, anything starting with # or //, and any line whose first field is not
 * a number (which covers most headers). Extra columns past the second are
 * ignored rather than treated as an error.
 *
 * Water-level loggers often record drawdown as a negative head change. If the
 * column reads mostly negative, it is inverted and the caller is told so
 * explicitly rather than being left to wonder.
 */
export function parseReadings(text: string): ParseResult {
  const rows: Array<{ t: number; s: number }> = [];
  const skipped: ParseResult['skipped'] = [];

  const lines = text.split(/\r?\n/);
  lines.forEach((raw, index) => {
    const line = raw.trim();
    if (line === '') return;
    if (line.startsWith('#') || line.startsWith('//')) return;

    const fields = line.split(/[\t,;]+|\s+/).filter((f) => f !== '');
    if (fields.length < 2) {
      skipped.push({ line: index + 1, text: line, reason: 'needs two values' });
      return;
    }
    const t = toNumber(fields[0]);
    const s = toNumber(fields[1]);
    if (t === null || s === null) {
      // A header row lands here; only complain if it looks like it meant to be data.
      const reason = t === null && s === null ? 'not numeric (header?)' : 'one value is not a number';
      skipped.push({ line: index + 1, text: line, reason });
      return;
    }
    rows.push({ t, s });
  });

  const negatives = rows.filter((r) => r.s < 0).length;
  const signFlipped = rows.length > 0 && negatives > rows.length / 2;
  if (signFlipped) {
    for (const r of rows) r.s = -r.s;
  }

  return { rows, skipped, signFlipped };
}

function toNumber(field: string): number | null {
  const cleaned = field.replace(/[$'"]/g, '').trim();
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function formatReadings(rows: Array<{ t: number; s: number }>): string {
  return rows.map((r) => `${r.t}\t${r.s}`).join('\n');
}
