#!/usr/bin/env python3
import os
import re
import sys
import glob
import json
import zipfile
import argparse
import xml.etree.ElementTree as ET
from datetime import datetime
from bs4 import BeautifulSoup

MONTHS = {
    'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04', 'May': '05', 'Jun': '06',
    'Jul': '07', 'Aug': '08', 'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
}

def to_iso(date_str):
    if not date_str:
        return None
    date_str = str(date_str).strip()
    if re.match(r'^\d{4}-\d{2}-\d{2}', date_str):
        return date_str[:10]
    m = re.search(r'(\d{1,2})-([A-Za-z]{3})-(\d{4})', date_str)
    if m:
        d, mon, y = m.groups()
        return f"{y}-{MONTHS.get(mon, '01')}-{int(d):02d}"
    return date_str

def parse_amount(amt_val):
    if isinstance(amt_val, (int, float)):
        return float(amt_val)
    if not amt_val:
        return 0.0
    s = str(amt_val).replace('$', '').replace(',', '').strip()
    try:
        return float(s)
    except Exception:
        return 0.0

def categorize(title, tx_type=None):
    t_lower = (title or "").lower()
    tt = (tx_type or "").upper()
    if tt in ('JNLC', 'CSD'):
        if "withdraw" in t_lower:
            return "WITHDRAWAL"
        return "DEPOSIT"
    if "withdrawal" in t_lower:
        return "WITHDRAWAL"
    elif "deposit" in t_lower or "minisave" in t_lower or "remc" in t_lower:
        return "DEPOSIT"
    elif "dividend tax" in t_lower or tt == "DIVTAX":
        return "DIVTAX"
    elif "dividend" in t_lower or tt == "DIV":
        return "DIVIDEND"
    elif "buy" in t_lower or tt == "BUY":
        return "BUY"
    elif "sell" in t_lower or tt == "SELL":
        return "SELL"
    return "OTHER"

def parse_excel_statement(fpath):
    with zipfile.ZipFile(fpath) as z:
        shared = []
        if 'xl/sharedStrings.xml' in z.namelist():
            tree = ET.fromstring(z.read('xl/sharedStrings.xml'))
            for si in tree.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}si'):
                t = si.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t')
                shared.append(t.text if t is not None else '')
                
        sheet = ET.fromstring(z.read('xl/worksheets/sheet1.xml'))
        rows = sheet.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row')
        
        all_rows = []
        for r in rows:
            row_dict = {}
            for c in r.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c'):
                r_ref = c.attrib.get('r', '')
                col = ''.join([ch for ch in r_ref if ch.isalpha()])
                t_type = c.attrib.get('t')
                v = c.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v')
                val = v.text if v is not None else ''
                if t_type == 's' and val.isdigit():
                    val = shared[int(val)] if int(val) < len(shared) else val
                row_dict[col] = val
            all_rows.append(row_dict)
            
        header = None
        h_idx = 0
        for i, pr in enumerate(all_rows):
            if 'Transaction type' in pr.values():
                header = pr
                h_idx = i
                break
        if not header:
            return []
            
        col_map = {k: v for k, v in header.items()}
        txs = []
        for pr in all_rows[h_idx+1:]:
            row_named = {col_map.get(k, k): v for k, v in pr.items()}
            
            ttype = str(row_named.get('Transaction type') or '').strip().upper()
            tid = str(row_named.get('Transaction Id') or '').strip()
            date_raw = row_named.get('Trade Date')
            date_iso = to_iso(date_raw)
            name = row_named.get('Investment name')
            symbol = row_named.get('Source holding ID')
            
            outflow = parse_amount(row_named.get('Outflow'))
            inflow = parse_amount(row_named.get('Inflow'))
            div_amt = parse_amount(row_named.get('Dividend Amount'))
            
            # Cash deposits / withdrawals (JNLC / CSD / REMC)
            if ttype in ('JNLC', 'CSD') or tid.upper().startswith('REMC'):
                # Ignore negligible rebalancing cash fractions (like -0.33)
                val = outflow if outflow != 0.0 else inflow
                if abs(val) < 1.0:
                    continue
                cat = 'DEPOSIT' if val > 0 else 'WITHDRAWAL'
                title = f"Remittance Deposit ({tid})" if tid.upper().startswith('REMC') else (
                    "MiniSave deposit credited in MSFT" if abs(val - 12.74) < 0.01 else (
                        f"Bank Deposit ({tid})" if cat == 'DEPOSIT' else f"Bank Withdrawal ({tid})"
                    )
                )
                txs.append({
                    'id': tid,
                    'date': date_iso,
                    'category': cat,
                    'type': ttype,
                    'title': title,
                    'status': 'Success',
                    'amount': abs(val),
                    'currency': 'USD',
                    'raw_amount': val,
                    'source': os.path.basename(fpath)
                })
            elif ttype == 'BUY':
                txs.append({
                    'id': tid,
                    'date': date_iso,
                    'category': 'BUY',
                    'type': ttype,
                    'title': f"{symbol or name or 'Stock'} buy settlement",
                    'status': 'Success',
                    'amount': abs(outflow),
                    'currency': 'USD',
                    'raw_amount': -abs(outflow),
                    'symbol': symbol,
                    'source': os.path.basename(fpath)
                })
            elif ttype == 'SELL':
                txs.append({
                    'id': tid,
                    'date': date_iso,
                    'category': 'SELL',
                    'type': ttype,
                    'title': f"{symbol or name or 'Stock'} sell settlement",
                    'status': 'Success',
                    'amount': abs(inflow),
                    'currency': 'USD',
                    'raw_amount': abs(inflow),
                    'symbol': symbol,
                    'source': os.path.basename(fpath)
                })
            elif ttype == 'DIV':
                txs.append({
                    'id': tid,
                    'date': date_iso,
                    'category': 'DIVIDEND',
                    'type': ttype,
                    'title': f"{symbol or name or 'Stock'} Dividend",
                    'status': 'Success',
                    'amount': abs(div_amt if div_amt != 0.0 else inflow),
                    'currency': 'USD',
                    'raw_amount': abs(div_amt if div_amt != 0.0 else inflow),
                    'symbol': symbol,
                    'source': os.path.basename(fpath)
                })
            elif ttype == 'DIVTAX':
                txs.append({
                    'id': tid,
                    'date': date_iso,
                    'category': 'DIVTAX',
                    'type': ttype,
                    'title': f"{symbol or name or 'Stock'} Dividend Tax Withheld",
                    'status': 'Success',
                    'amount': abs(outflow),
                    'currency': 'USD',
                    'raw_amount': -abs(outflow),
                    'symbol': symbol,
                    'source': os.path.basename(fpath)
                })
        return txs

def parse_html_content(content, source_path):
    soup = BeautifulSoup(content, 'html.parser')
    lis = soup.find_all('li', class_=lambda c: c and 'group' in c and 'rounded-xl' in c)
    all_txs = []

    for li in lis:
        h2 = li.find('h2')
        title = h2.get_text(strip=True) if h2 else ""
        status_p = li.find('p', class_=lambda c: c and 'rounded-full' in c)
        status = status_p.get_text(strip=True) if status_p else "Success"
        
        sections = li.find_all('section')
        date_str = ""
        amount_str = ""
        for sec in sections:
            text = sec.get_text(" | ", strip=True)
            date_match = re.search(r'Date\s*\|\s*(?:On\s*)?([0-9]{1,2}-[A-Za-z]{3}-[0-9]{4})', text)
            if date_match:
                date_str = date_match.group(1)
            amt_match = re.search(r'Amount\s*\|\s*([^\s|]+)', text)
            if amt_match:
                val = amt_match.group(1).replace('$', '').replace(',', '').strip()
                amount_str = val

        category = categorize(title)
        raw_amt = parse_amount(amount_str)

        all_txs.append({
            'date': to_iso(date_str),
            'category': category,
            'title': title,
            'status': status.capitalize() if status.lower() in ('success', 'failed') else status,
            'amount': abs(raw_amt),
            'currency': 'USD',
            'raw_amount': raw_amt,
            'source': os.path.basename(source_path)
        })
    return all_txs

def parse_json_content(data, source_path):
    pages = []
    if isinstance(data, list):
        pages = data
    elif isinstance(data, dict):
        if "monthly_trxn" in data:
            pages = [data]
        elif "pages" in data:
            pages = data["pages"]
        elif "all_transactions" in data:
            return data.get("all_transactions", [])
        else:
            pages = [data]

    all_txs = []
    for page in pages:
        for m in page.get("monthly_trxn", []):
            for t in m.get("trxn_list", []):
                title = t.get("card_title", "")
                category = categorize(title)
                status_raw = t.get("status", "Success")
                status = "Success" if status_raw.upper() == "SUCCESS" else ("Failed" if status_raw.upper() == "FAILED" else status_raw)
                
                raw_amt = parse_amount(t.get("amount", 0))
                date_iso = to_iso(t.get("created")) or to_iso(t.get("created_date"))

                all_txs.append({
                    'id': t.get("id"),
                    'date': date_iso,
                    'category': category,
                    'title': title.strip(),
                    'status': status,
                    'amount': abs(raw_amt),
                    'currency': 'USD',
                    'raw_amount': raw_amt,
                    'navlink': t.get("navlink"),
                    'source': os.path.basename(source_path)
                })
    return all_txs

def deduplicate_transactions(tx_list):
    tx_list_sorted = sorted(tx_list, key=lambda x: str(x.get('date') or ''), reverse=True)
    deduped = []
    
    for t in tx_list_sorted:
        t_amt = round(t.get('amount', 0), 2)
        t_cat = t.get('category')
        t_date_str = str(t.get('date') or '')
        t_id = str(t.get('id') or '')
        
        is_dup = False
        for ex in deduped:
            ex_amt = round(ex.get('amount', 0), 2)
            ex_cat = ex.get('category')
            ex_date_str = str(ex.get('date') or '')
            ex_id = str(ex.get('id') or '')
            
            # If both have the same non-empty ID, definitely duplicate
            if t_id and ex_id and t_id == ex_id:
                is_dup = True
                break
                
            # If both have distinct REMC IDs or distinct UUIDs from the same source file, NOT duplicate
            if t_id and ex_id:
                if t_id.startswith('REMC') and ex_id.startswith('REMC') and t_id != ex_id:
                    continue
                if t.get('source') and ex.get('source') and t.get('source') == ex.get('source') and t_id != ex_id:
                    continue

            # Check matching category, amount, and close date (within 2 days for cross-source settlement)
            if ex_cat == t_cat and abs(ex_amt - t_amt) < 0.001:
                try:
                    d1 = datetime.strptime(t_date_str, '%Y-%m-%d')
                    d2 = datetime.strptime(ex_date_str, '%Y-%m-%d')
                    days_diff = abs((d1 - d2).days)
                except Exception:
                    days_diff = 999
                
                if days_diff <= 2:
                    is_dup = True
                    # Prefer REMC ID or richer details
                    if t_id.startswith('REMC') and not ex_id.startswith('REMC'):
                        ex['id'] = t_id
                    elif t_id and not ex_id:
                        ex['id'] = t_id
                    if t.get('type') and not ex.get('type'):
                        ex['type'] = t.get('type')
                    break
                    
        if not is_dup:
            deduped.append(t)
            
    return deduped

def build_ledger_contract(all_txs, source_description):
    deposits = [t for t in all_txs if t['category'] == 'DEPOSIT']
    withdrawals = [t for t in all_txs if t['category'] == 'WITHDRAWAL']
    dep_with = [t for t in all_txs if t['category'] in ('DEPOSIT', 'WITHDRAWAL')]

    successful_deposits = [d for d in deposits if d.get('status') == 'Success']
    successful_withdrawals = [w for w in withdrawals if w.get('status') == 'Success']

    total_deposited = sum(d['amount'] for d in successful_deposits)
    total_withdrawn = sum(w['amount'] for w in successful_withdrawals)

    # Sort deposits and withdrawals chronologically ascending for ledger display
    dep_with_sorted = sorted(dep_with, key=lambda x: str(x.get('date') or ''))

    return {
        'account_id': 'indmoney_us',
        'broker': 'INDmoney / DriveWealth',
        'source': source_description,
        'currency': 'USD',
        'summary': {
            'total_deposits_usd': round(total_deposited, 2),
            'total_withdrawals_usd': round(total_withdrawn, 2),
            'net_funds_invested_usd': round(total_deposited - total_withdrawn, 2),
            'successful_deposits_count': len(successful_deposits),
            'failed_deposits_count': len(deposits) - len(successful_deposits),
            'successful_withdrawals_count': len(successful_withdrawals),
            'total_transactions_count': len(all_txs)
        },
        'deposits_and_withdrawals': [
            {
                'date': t['date'],
                'category': t['category'],
                'title': t['title'],
                'status': t['status'],
                'amount_usd': t['amount'],
                'currency': 'USD',
                **({'type': t['type']} if t.get('type') else {}),
                **({'transaction_id': t['id']} if t.get('id') else {}),
                **({'navlink': t['navlink']} if t.get('navlink') else {})
            }
            for t in dep_with_sorted
        ],
        'all_transactions': [
            {
                'date': t['date'],
                'category': t['category'],
                'title': t['title'],
                'status': t['status'],
                'amount_usd': t['amount'] if t['category'] in ('DEPOSIT', 'DIVIDEND', 'SELL') else -t['amount'],
                'currency': 'USD',
                **({'type': t['type']} if t.get('type') else {}),
                **({'transaction_id': t['id']} if t.get('id') else {})
            }
            for t in all_txs
        ]
    }

def main():
    parser = argparse.ArgumentParser(description="Parse INDmoney Excel statements & wallet JSON/HTML into canonical ledger.")
    parser.add_argument("--cache-dir", default=os.path.join(os.path.dirname(__file__), "..", ".cache"), help="Cache directory")
    parser.add_argument("--output", default=r"C:\Users\sarav\Downloads\My US Stocks Investments - INDmoney.json", help="Path to output JSON")
    parser.add_argument("--cache-output", default=os.path.join(os.path.dirname(__file__), "..", ".cache", "indmoney_ledger.json"), help="Skill cache output path")
    args = parser.parse_args()

    cache_dir = os.path.abspath(args.cache_dir)
    excel_files = sorted(glob.glob(os.path.join(cache_dir, "INDMoney_Statement_*.xlsx")))
    
    all_raw_txs = []
    sources = []

    # 1. Parse Excel statements if present
    if excel_files:
        print(f"Found {len(excel_files)} Excel statements in {cache_dir}:")
        for ef in excel_files:
            bname = os.path.basename(ef)
            parsed = parse_excel_statement(ef)
            print(f"  • {bname}: {len(parsed)} transactions extracted")
            all_raw_txs.extend(parsed)
            sources.append(bname)

    # 2. Check for Downloads JSON or HTML wallet files
    downloads_json = r"C:\Users\sarav\Downloads\My US Stocks Investments - INDmoney.json"
    if os.path.exists(downloads_json):
        try:
            with open(downloads_json, "r", encoding="utf-8") as f:
                content = json.load(f)
            if "monthly_trxn" in content:
                json_txs = parse_json_content(content, downloads_json)
                print(f"Loaded {len(json_txs)} transactions from {downloads_json}")
                all_raw_txs.extend(json_txs)
                sources.append("Downloads JSON API")
        except Exception:
            pass

    # 3. Deduplicate and build canonical ledger
    deduped = deduplicate_transactions(all_raw_txs)
    source_desc = ", ".join(sources) if sources else "INDMoney Statements"
    result = build_ledger_contract(deduped, source_desc)

    # 4. Write canonical output to Downloads and Skill Cache
    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)

    os.makedirs(os.path.dirname(os.path.abspath(args.cache_output)), exist_ok=True)
    with open(args.cache_output, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)

    print(f"\n✅ Ledger successfully generated across {len(deduped)} total unique events.")
    print(f"   Output JSON: {args.output}")
    print(f"   Skill Cache: {args.cache_output}\n")

    summary = result['summary']
    print("==================================================")
    print(f"Total Deposits:      ${summary['total_deposits_usd']:8.2f} ({summary['successful_deposits_count']} deposits)")
    print(f"Total Withdrawals:   ${summary['total_withdrawals_usd']:8.2f} ({summary['successful_withdrawals_count']} withdrawals)")
    print(f"Net Funds Invested:  ${summary['net_funds_invested_usd']:8.2f}")
    print("==================================================\n")

    print("Deposits & Withdrawals Ledger:")
    for dw in result['deposits_and_withdrawals']:
        sym = "+" if dw['category'] == 'DEPOSIT' else "-"
        amt = dw['amount_usd']
        d = dw['date']
        cat = dw['category']
        tid = dw.get('transaction_id', '')
        title = dw['title']
        print(f"  {sym} {cat:11s} | {d} | ${amt:8.2f} | {tid} | {title}")

if __name__ == "__main__":
    main()
