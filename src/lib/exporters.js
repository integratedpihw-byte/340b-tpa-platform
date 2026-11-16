// Report export: CSV, Excel (.xlsx) and PDF.
//
// A column is { key, label, type } with type one of: text, number, money, date, datetime, bool.
// Rows are plain objects keyed by column key. Values: string, number, boolean or null.

// ---------- shared helpers ----------

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

function clean(v) {
  return String(v).replace(CONTROL_CHARS, '');
}

function cellText(col, v) {
  if (v === null || v === undefined || v === '') return '';
  if (col.type === 'bool') return v ? 'Yes' : 'No';
  if (col.type === 'money') return Number.isFinite(Number(v)) ? Number(v).toFixed(2) : clean(v);
  return clean(v);
}

export function fileStamp(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'report';
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- CSV ----------

// A text cell that starts with = + - @ (or a tab / carriage return) can run as a formula when the file is
// opened in a spreadsheet. A leading apostrophe makes it plain text. Numbers are written as numbers.
function csvText(col, v) {
  let s = cellText(col, v);
  if ((col.type === 'text' || col.type === undefined) && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(columns, rows) {
  const lines = [columns.map((c) => csvText({ type: 'text' }, c.label)).join(',')];
  for (const r of rows) lines.push(columns.map((c) => csvText(c, r[c.key])).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n'; // BOM so Excel reads UTF-8 correctly
}

export function csvBlob(columns, rows) {
  return new Blob([toCsv(columns, rows)], { type: 'text/csv;charset=utf-8' });
}

// ---------- Excel (.xlsx) ----------
// An .xlsx file is a zip of small XML files. Strings are stored as inline text, never as formulas.

const xmlEscape = (s) => clean(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function colLetter(index) {
  let n = index + 1;
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

// Excel stores dates as days since 1899-12-30.
export function excelSerial(value, withTime) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  if (!withTime) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
    if (m) return Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 86400000);
  }
  return (d.getTime() - Date.UTC(1899, 11, 30)) / 86400000;
}

// style ids in styles.xml below
const STYLE = { text: 0, header: 1, money: 2, date: 3, datetime: 4, number: 5, bold: 6 };

function cellXml(ref, col, v) {
  if (v === null || v === undefined || v === '') return '';
  const t = col.type;
  if (t === 'number' || t === 'money') {
    const n = Number(v);
    if (Number.isFinite(n)) return `<c r="${ref}" s="${t === 'money' ? STYLE.money : STYLE.number}"><v>${n}</v></c>`;
  } else if (t === 'date' || t === 'datetime') {
    const serial = excelSerial(v, t === 'datetime');
    if (serial !== null) return `<c r="${ref}" s="${t === 'date' ? STYLE.date : STYLE.datetime}"><v>${serial}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr" s="${STYLE.text}"><is><t xml:space="preserve">${xmlEscape(cellText(col, v))}</t></is></c>`;
}

function sheetXml(columns, rows, { header = true, freeze = true, filter = true } = {}) {
  const widths = columns.map((c) => {
    let w = clean(c.label).length;
    for (let i = 0; i < Math.min(rows.length, 500); i++) w = Math.max(w, cellText(c, rows[i][c.key]).length);
    return Math.min(Math.max(w + 2, 8), 60);
  });
  const lines = [];
  let r = 1;
  if (header) {
    lines.push(`<row r="1">${columns.map((c, i) => `<c r="${colLetter(i)}1" t="inlineStr" s="${STYLE.header}"><is><t>${xmlEscape(c.label)}</t></is></c>`).join('')}</row>`);
    r = 2;
  }
  for (const row of rows) {
    lines.push(`<row r="${r}">${columns.map((c, i) => cellXml(`${colLetter(i)}${r}`, c, row[c.key])).join('')}</row>`);
    r++;
  }
  const last = `${colLetter(Math.max(columns.length - 1, 0))}${Math.max(r - 1, 1)}`;
  const pane = header && freeze ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' : '';
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + pane
    + `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    + `<sheetData>${lines.join('')}</sheetData>`
    + (header && filter && rows.length > 0 ? `<autoFilter ref="A1:${last}"/>` : '')
    + '</worksheet>';
}

const STYLES_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
  + '<numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd hh:mm"/></numFmts>'
  + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
  + '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
  + '<fill><patternFill patternType="solid"><fgColor rgb="FFE2E8F0"/><bgColor indexed="64"/></patternFill></fill></fills>'
  + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
  + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
  + '<cellXfs count="7">'
  + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
  + '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>'
  + '<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
  + '<xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
  + '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
  + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
  + '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
  + '</cellXfs>'
  + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
  + '</styleSheet>';

function safeSheetName(name, fallback) {
  const n = clean(name).replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31);
  return n || fallback;
}

// meta: array of [label, value] rows shown on a second "About this report" sheet.
export async function toXlsx(sheetName, columns, rows, meta = []) {
  const { zipSync, strToU8 } = await import('fflate');
  const name1 = safeSheetName(sheetName, 'Report');
  const aboutCols = [{ key: 'k', label: 'Item', type: 'text' }, { key: 'v', label: 'Value', type: 'text' }];
  const aboutRows = meta.map(([k, v]) => ({ k, v: v === null || v === undefined ? '' : String(v) }));
  const files = {
    '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEscape(name1)}" sheetId="1" r:id="rId1"/><sheet name="About this report" sheetId="2" r:id="rId2"/></sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'),
    'xl/styles.xml': strToU8(STYLES_XML),
    'xl/worksheets/sheet1.xml': strToU8(sheetXml(columns, rows)),
    'xl/worksheets/sheet2.xml': strToU8(sheetXml(aboutCols, aboutRows, { filter: false })),
  };
  return zipSync(files, { level: 6 });
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// ---------- PDF ----------

export const PDF_MAX_ROWS = 2000;

// The built-in PDF fonts only cover Latin-1; anything else would print as garbage.
function pdfText(col, v) {
  return cellText(col, v).replace(/[^\x09\x0A\x0D\x20-\x7E -ÿ]/g, '?');
}

function pdfValue(col, v) {
  if (col.type === 'money' && v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v))) {
    const n = Number(v);
    return `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return pdfText(col, v);
}

// Returns { bytes, truncated }. meta: array of [label, value] printed under the title.
export async function toPdf(title, columns, rows, meta = []) {
  const [{ jsPDF }, autoTableModule] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const autoTable = autoTableModule.default || autoTableModule.autoTable;
  const truncated = rows.length > PDF_MAX_ROWS;
  const body = (truncated ? rows.slice(0, PDF_MAX_ROWS) : rows)
    .map((r) => columns.map((c) => pdfValue(c, r[c.key])));

  const doc = new jsPDF({ orientation: columns.length > 6 ? 'landscape' : 'portrait', unit: 'pt', format: 'letter' });
  const pageW = doc.internal.pageSize.getWidth();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(pdfText({}, title), 40, 44);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  let y = 62;
  for (const [k, v] of meta) {
    const line = pdfText({}, `${k}: ${v ?? ''}`);
    const wrapped = doc.splitTextToSize(line, pageW - 80);
    doc.text(wrapped, 40, y);
    y += 12 * wrapped.length;
  }
  if (truncated) {
    doc.setTextColor(180, 40, 40);
    doc.text(`Only the first ${PDF_MAX_ROWS.toLocaleString()} of ${rows.length.toLocaleString()} rows are shown. Use the Excel or CSV export for everything.`, 40, y);
    doc.setTextColor(0, 0, 0);
    y += 12;
  }
  autoTable(doc, {
    head: [columns.map((c) => pdfText({}, c.label))],
    body,
    startY: y + 6,
    margin: { left: 40, right: 40, bottom: 40 },
    styles: { fontSize: 8, cellPadding: 3, overflow: 'linebreak' },
    headStyles: { fillColor: [226, 232, 240], textColor: [15, 23, 42], fontStyle: 'bold' },
    columnStyles: Object.fromEntries(columns.map((c, i) => [i, c.type === 'money' || c.type === 'number' ? { halign: 'right' } : {}])),
    didDrawPage: () => {
      const n = doc.internal.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.text(`Page ${n}`, pageW - 40, doc.internal.pageSize.getHeight() - 20, { align: 'right' });
      doc.setTextColor(0);
    },
  });
  return { bytes: new Uint8Array(doc.output('arraybuffer')), truncated };
}
