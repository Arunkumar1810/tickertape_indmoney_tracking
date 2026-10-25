const test = require('node:test');
const assert = require('node:assert');
const LedgerParser = require('../scripts/lib/ledger_parser');

test('LedgerParser parses CSV with mixed dates, pay-ins, and payouts correctly', () => {
  const sampleCsv = `
Posting Date,Particulars,Debit,Credit,Net Balance
15-01-2024,"Funds Added via UPI / HDFC Bank",0,"100,000.00","100,000.00"
20-06-2024,"E-Collect Payin - Netbanking",0,"50,000.00","150,000.00"
10-10-2024,"Funds Payout to HDFC Bank","25,000.00",0,"125,000.00"
05-11-2024,"Dividend Credit - TCS",0,"1,200.00","126,200.00"
`;

  const cashflows = LedgerParser.parse(sampleCsv);

  assert.strictEqual(cashflows.length, 4);

  // Payin 1 -> -100,000 on 2024-01-15
  assert.strictEqual(cashflows[0].date, '2024-01-15');
  assert.strictEqual(cashflows[0].amount, -100000);
  assert.strictEqual(cashflows[0].category, 'PAYIN');

  // Payin 2 -> -50,000 on 2024-06-20
  assert.strictEqual(cashflows[1].date, '2024-06-20');
  assert.strictEqual(cashflows[1].amount, -50000);
  assert.strictEqual(cashflows[1].category, 'PAYIN');

  // Payout -> +25,000 on 2024-10-10
  assert.strictEqual(cashflows[2].date, '2024-10-10');
  assert.strictEqual(cashflows[2].amount, 25000);
  assert.strictEqual(cashflows[2].category, 'PAYOUT');

  // Dividend -> +1,200 on 2024-11-05
  assert.strictEqual(cashflows[3].date, '2024-11-05');
  assert.strictEqual(cashflows[3].amount, 1200);
  assert.strictEqual(cashflows[3].category, 'DIVIDEND');
});

test('LedgerParser parses JSON array input', () => {
  const sampleJson = [
    { date: '2024-02-01', particulars: 'UPI Payin', credit: 200000 },
    { date: '2024-08-15', particulars: 'Payout to bank', debit: 30000 }
  ];

  const cashflows = LedgerParser.parse(sampleJson);
  assert.strictEqual(cashflows.length, 2);
  assert.strictEqual(cashflows[0].amount, -200000);
  assert.strictEqual(cashflows[1].amount, 30000);
});
