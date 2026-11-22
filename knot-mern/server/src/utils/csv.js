/**
 * Builds RFC 4180 CSV. Cells that start with = + - @ are prefixed with an apostrophe so that
 * spreadsheet applications do not execute them as formulas (CSV injection).
 */
export function toCsv(rows, columns) {
  const cell = (value) => {
    if (value === null || value === undefined) return '';
    let text = value instanceof Date ? value.toISOString() : String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const header = columns.map((c) => cell(c.label)).join(',');
  const body = rows.map((row) => columns.map((c) => cell(row[c.key])).join(','));
  return [header, ...body].join('\r\n') + '\r\n';
}
