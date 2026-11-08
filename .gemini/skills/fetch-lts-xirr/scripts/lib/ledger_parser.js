const fs = require('fs');
const { readBrokingLedgerRecords } = require('./xlsx_reader');

/**
 * Parses funds ledger statements (CSV or JSON) into normalized investor cash flows
 */
class LedgerParser {
  /**
   * Parse CSV content into structured rows
   */
  static parseCsv(csvText) {
    const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length < 2) return [];

    // Find header line (skipping preamble lines if any)
    let headerIdx = -1;
    for (let i = 0; i < Math.min(10, lines.length); i++) {
      const lower = lines[i].toLowerCase();
      if ((lower.includes('date') || lower.includes('posting')) && (lower.includes('particular') || lower.includes('description') || lower.includes('debit') || lower.includes('credit') || lower.includes('amount'))) {
        headerIdx = i;
        break;
      }
    }

    if (headerIdx === -1) headerIdx = 0;

    const headers = lines[headerIdx].split(',').map(h => h.trim().replace(/^["']|["']$/g, '').toLowerCase());
    const rows = [];

    for (let i = headerIdx + 1; i < lines.length; i++) {
      // Basic CSV tokenizing with quote awareness
      const rawRow = lines[i];
      const tokens = [];
      let inQuote = false;
      let currentToken = '';

      for (let j = 0; j < rawRow.length; j++) {
        const char = rawRow[j];
        if (char === '"' || char === "'") {
          inQuote = !inQuote;
        } else if (char === ',' && !inQuote) {
          tokens.push(currentToken.trim().replace(/^["']|["']$/g, ''));
          currentToken = '';
        } else {
          currentToken += char;
        }
      }
      tokens.push(currentToken.trim().replace(/^["']|["']$/g, ''));

      const rowObj = {};
      headers.forEach((h, idx) => {
        rowObj[h] = tokens[idx] || '';
      });
      rows.push(rowObj);
    }

    return rows;
  }

  /**
   * Normalize any date string (DD-MM-YYYY, YYYY-MM-DD, DD/MM/YYYY, etc.) to YYYY-MM-DD
   */
  static normalizeDate(dateStr) {
    if (!dateStr) return null;
    const clean = dateStr.trim().split(' ')[0]; // Strip time component if present

    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;

    // DD-MM-YYYY or DD/MM/YYYY
    const dmy = clean.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (dmy) {
      const day = dmy[1].padStart(2, '0');
      const month = dmy[2].padStart(2, '0');
      const year = dmy[3];
      return `${year}-${month}-${day}`;
    }

    // Excel numeric serial date (e.g. 46316 -> 2026-10-21)
    if (/^\d{5}$/.test(clean)) {
      const serial = parseInt(clean, 10);
      const date = new Date(Math.round((serial - 25569) * 86400 * 1000));
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }
    }

    // Try standard JS Date parsing fallback
    const d = new Date(clean);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
    }

    return null;
  }

  /**
   * Parse numeric amounts handling commas and negatives
   */
  static parseAmount(amtStr) {
    if (typeof amtStr === 'number') return amtStr;
    if (!amtStr) return 0;
    const clean = String(amtStr).replace(/,/g, '').replace(/[^\d.-]/g, '');
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
  }

  /**
   * Parse funds statement (file path, raw string, or array) into Investor Cashflows
   */
  static parse(input) {
    let records = [];

    if (Array.isArray(input)) {
      records = input;
    } else if (typeof input === 'string') {
      if (fs.existsSync(input) && /\.xlsx$/i.test(input)) {
        records = readBrokingLedgerRecords(input);
      } else if (fs.existsSync(input)) {
        const fileContent = fs.readFileSync(input, 'utf8');
        try {
          records = JSON.parse(fileContent);
        } catch {
          records = LedgerParser.parseCsv(fileContent);
        }
      } else {
        try {
          records = JSON.parse(input);
        } catch {
          records = LedgerParser.parseCsv(input);
        }
      }
    }

    const cashflows = [];

    for (const r of records) {
      const dateField = r.date || r['posting date'] || r['voucher date'] || r['txn date'] || r['transaction date'];
      const normalizedDate = LedgerParser.normalizeDate(dateField);
      if (!normalizedDate) continue;

      const desc = (r.particulars || r.description || r.narrative || r.notes || r.transaction || r.type || '').toLowerCase();
      const debit = LedgerParser.parseAmount(r.debit || (r.type === 'DEBIT' ? r.amount : 0));
      const credit = LedgerParser.parseAmount(r.credit || (r.type === 'CREDIT' || r.type === 'PAYIN' ? r.amount : 0));
      const explicitAmount = LedgerParser.parseAmount(r.amount);

      // Identify Bank Pay-in (Funds added to trading account)
      // In broker ledger, a Pay-in is a CREDIT to the trading account.
      // From Investor's perspective, this is an OUTFLOW (-Amount) from their bank account.
      const isPayin = (
        desc.includes('payin') ||
        desc.includes('fund transfer') ||
        desc.includes('funds added') ||
        desc.includes('e-collect') ||
        desc.includes('upi') ||
        desc.includes('payment gateway') ||
        r.type === 'PAYIN' ||
        (credit > 0 && !desc.includes('dividend') && !desc.includes('sell') && !desc.includes('interest'))
      );

      // Identify Bank Payout (Funds withdrawn to bank account)
      // In broker ledger, a Payout is a DEBIT from the trading account.
      // From Investor's perspective, this is an INFLOW (+Amount) returning to their bank account.
      const isPayout = (
        desc.includes('payout') ||
        desc.includes('withdrawal') ||
        desc.includes('funds withdrawn') ||
        // Angel One auto-returns idle ledger balance to the bank on settlement day
        (desc.includes('settlement') && debit > 0) ||
        r.type === 'PAYOUT' ||
        (debit > 0 && (desc.includes('payout') || desc.includes('withdrawal')))
      );

      // Identify Direct Dividend credit
      const isDividend = desc.includes('dividend');

      if (isPayin) {
        const amt = credit || Math.abs(explicitAmount);
        if (amt > 0) {
          cashflows.push({
            date: normalizedDate,
            amount: -Math.abs(amt), // Negative cashflow: money left investor's bank into Angel One
            category: 'PAYIN',
            description: r.particulars || r.description || 'Fund Pay-in'
          });
        }
      } else if (isPayout) {
        const amt = debit || Math.abs(explicitAmount);
        if (amt > 0) {
          cashflows.push({
            date: normalizedDate,
            amount: Math.abs(amt), // Positive cashflow: money returned to investor's bank
            category: 'PAYOUT',
            description: r.particulars || r.description || 'Fund Payout'
          });
        }
      } else if (isDividend) {
        const amt = credit || explicitAmount;
        if (amt > 0) {
          cashflows.push({
            date: normalizedDate,
            amount: Math.abs(amt),
            category: 'DIVIDEND',
            description: r.particulars || r.description || 'Dividend Income'
          });
        }
      }
    }

    // Sort chronologically
    return cashflows.sort((a, b) => new Date(a.date) - new Date(b.date));
  }
}

module.exports = LedgerParser;
