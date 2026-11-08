const fs = require('fs');
const zlib = require('zlib');

/**
 * Minimal zero-dependency .xlsx reader (zip + sheet XML). Returns sheets as
 * arrays of rows (arrays of cell strings). Sufficient for flat broker statements.
 */
function readZipEntries(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a valid .xlsx (zip) file');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = {};
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const start = localOff + 30 + lNameLen + lExtraLen;
    const data = buf.subarray(start, start + compSize);
    entries[name] = method === 0 ? data : zlib.inflateRawSync(data);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function unescapeXml(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d)).replace(/&amp;/g, '&');
}

function colIndex(ref) {
  const letters = ref.replace(/\d+/g, '');
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function readXlsx(filePath) {
  const entries = readZipEntries(fs.readFileSync(filePath));
  const text = name => (entries[name] ? entries[name].toString('utf8') : '');

  const shared = [];
  for (const m of text('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    const parts = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => unescapeXml(t[1]));
    shared.push(parts.join(''));
  }

  const wb = text('xl/workbook.xml');
  const rels = text('xl/_rels/workbook.xml.rels');
  const relTarget = {};
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = (m[0].match(/\bId="([^"]+)"/) || [])[1];
    const target = (m[0].match(/\bTarget="([^"]+)"/) || [])[1];
    if (id && target) relTarget[id] = target.replace(/^\/?(xl\/)?/, 'xl/');
  }

  const sheets = {};
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const name = unescapeXml((m[0].match(/\bname="([^"]*)"/) || [])[1] || '');
    const rid = (m[0].match(/\br:id="([^"]+)"/) || [])[1];
    const xml = text(relTarget[rid]);
    const rows = [];
    for (const r of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const row = [];
      for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1];
        const ref = (attrs.match(/\br="([A-Z]+\d+)"/) || [])[1];
        const type = (attrs.match(/\bt="([^"]+)"/) || [])[1];
        const body = c[2] || '';
        let val = '';
        if (type === 'inlineStr') {
          val = unescapeXml([...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join(''));
        } else {
          const v = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
          if (v !== undefined) val = type === 's' ? shared[+v] : unescapeXml(v);
        }
        if (ref) row[colIndex(ref)] = val;
      }
      rows.push(Array.from(row, v => (v === undefined ? '' : v)));
    }
    sheets[name] = rows;
  }
  return sheets;
}

/**
 * Convert an Angel One "Broking Ledger" sheet into record objects keyed by
 * lower-cased header (transaction, date, segment, voucher, debit, credit, ...).
 */
function readBrokingLedgerRecords(filePath) {
  const sheets = readXlsx(filePath);
  const name = Object.keys(sheets).find(n => /ledger/i.test(n)) || Object.keys(sheets)[0];
  const rows = sheets[name] || [];
  const headerIdx = rows.findIndex(r => {
    const l = r.map(c => String(c).toLowerCase());
    return l.includes('date') && l.includes('transaction') && (l.includes('debit') || l.includes('credit'));
  });
  if (headerIdx < 0) throw new Error(`No ledger header row (Transaction/Date/Debit/Credit) found in sheet "${name}"`);
  const headers = rows[headerIdx].map(h => String(h).trim().toLowerCase());
  const records = [];
  for (const r of rows.slice(headerIdx + 1)) {
    if (!r[headers.indexOf('date')]) continue;
    const obj = {};
    headers.forEach((h, i) => { if (h) obj[h] = r[i] === undefined ? '' : r[i]; });
    records.push(obj);
  }
  return records;
}

/**
 * Convert an Angel One "TradesAndCharges" tradebook sheet into records
 */
function readTradeBookRecords(filePath) {
  const sheets = readXlsx(filePath);
  const sheetName = Object.keys(sheets).find(n => /trade/i.test(n)) || Object.keys(sheets)[0];
  const rows = sheets[sheetName] || [];
  const headerIdx = rows.findIndex(r => {
    const l = r.map(c => String(c).toLowerCase());
    return l.includes('scrip/contract') && l.includes('buy/sell') && l.includes('quantity');
  });
  if (headerIdx < 0) throw new Error(`No TradeBook header row found in sheet "${sheetName}"`);
  const headers = rows[headerIdx].map(h => String(h).trim().toLowerCase());
  const records = [];
  for (const r of rows.slice(headerIdx + 1)) {
    const scrip = r[headers.indexOf('scrip/contract')];
    if (!scrip || String(scrip).startsWith('NOTE:')) continue;
    const obj = {};
    headers.forEach((h, i) => { if (h) obj[h] = r[i] === undefined ? '' : r[i]; });
    records.push(obj);
  }
  return records;
}

module.exports = { readXlsx, readBrokingLedgerRecords, readTradeBookRecords };
