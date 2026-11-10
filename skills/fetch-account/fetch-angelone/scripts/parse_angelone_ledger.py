#!/usr/bin/env python3
"""
parse_angelone_ledger.py
Parses official Angel One Broking Ledger Excel (.xlsx) exports into canonical JSON ledger transactions.
Uses only Python standard library (zipfile, xml.etree.ElementTree).
"""

import sys
import os
import json
import zipfile
import xml.etree.ElementTree as ET

def parse_angelone_ledger(xlsx_path):
    if not os.path.exists(xlsx_path):
        return []

    with zipfile.ZipFile(xlsx_path) as z:
        shared = []
        if 'xl/sharedStrings.xml' in z.namelist():
            ss_tree = ET.fromstring(z.read('xl/sharedStrings.xml'))
            for si in ss_tree.iter('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}si'):
                t = ''.join([node.text for node in si.iter('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t') if node.text])
                shared.append(t)

        sheet_tree = ET.fromstring(z.read('xl/worksheets/sheet1.xml'))
        rows = []
        for r in sheet_tree.iter('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row'):
            row_vals = []
            for c in r.iter('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c'):
                v = c.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v')
                val = v.text if v is not None else ''
                t = c.attrib.get('t')
                if t == 's' and val != '':
                    val = shared[int(val)]
                row_vals.append(val)
            if any(row_vals):
                rows.append(row_vals)

        header_idx = -1
        for i, r in enumerate(rows):
            if len(r) >= 5 and 'Transaction' in r[0] and 'Date' in r[1]:
                header_idx = i
                break

        if header_idx == -1:
            return []

        transactions = []
        for r in rows[header_idx + 1:]:
            if len(r) < 6:
                continue
            tx_type = r[0].strip()
            date_str = r[1].strip()
            segment = r[2].strip() if len(r) > 2 else ''
            voucher = r[3].strip() if len(r) > 3 else ''
            debit = float(r[4].strip()) if len(r) > 4 and r[4].strip() else 0.0
            credit = float(r[5].strip()) if len(r) > 5 and r[5].strip() else 0.0

            if not date_str or (debit == 0.0 and credit == 0.0):
                continue

            date_clean = date_str.split(' ')[0]
            
            # Map category
            cat_upper = tx_type.upper()
            if 'FUNDS ADDED' in cat_upper or 'PAYIN' in cat_upper:
                category = 'PAYIN'
                amount = -credit  # Cash outflow from investor perspective
            elif 'QUARTERLY SETTLEMENT' in cat_upper or 'PAYOUT' in cat_upper or 'WITHDRAW' in cat_upper:
                category = 'PAYOUT'
                amount = debit   # Cash inflow back to investor
            elif 'DIVIDEND' in cat_upper:
                category = 'DIVIDEND'
                amount = credit
            elif 'TRADE' in cat_upper:
                category = 'TRADE'
                amount = credit - debit
            else:
                category = tx_type
                amount = credit - debit

            transactions.append({
                'date': date_clean,
                'amount': round(amount, 2),
                'category': category,
                'description': f"{tx_type} ({segment})" if segment else tx_type,
                'voucher': voucher
            })

        return transactions

def main():
    path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', '.cache', 'Transaction_2026.xlsx')
    txs = parse_angelone_ledger(path)
    if len(sys.argv) > 2 and sys.argv[2] == '--out':
        out_file = sys.argv[3]
        os.makedirs(os.path.dirname(os.path.abspath(out_file)), exist_ok=True)
        with open(out_file, 'w', encoding='utf-8') as f:
            json.dump(txs, f, indent=2)
    else:
        print(json.dumps(txs, indent=2))

if __name__ == '__main__':
    main()

