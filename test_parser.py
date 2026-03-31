import re
from datetime import datetime

def parse_invoice_text(text):
    data = {
        "invoiceNumber": "INV-TEMP",
        "invoiceDate": datetime.now().strftime("%Y-%m-%d"),
        "serviceProvider": "GENERIC_VENDOR",
        "currencyGid": "USD",
        "amount": "0.00",
        "domainName": "INTL",
        "items": []
    }

    text_clean = text.strip()
    lines = [l.strip() for l in text_clean.split('\n') if l.strip()]
    
    # Invoice Number
    inv_num_match = re.search(r'Invoice Number[:.\s]*([A-Z0-9_]+)', text, re.I)
    if inv_num_match:
        data["invoiceNumber"] = inv_num_match.group(1)
    else:
        inv_num_match_alt = re.search(r'(?:Ref|INV|Invoice)\s*[:.\s]*([A-Z0-9_-]+)', text, re.I)
        if inv_num_match_alt:
            data["invoiceNumber"] = inv_num_match_alt.group(1)

    # Invoice Date
    date_match = re.search(r'(?:Invoice Date|Date|Dated)[:.\s]*(\d{1,4}[-/]\d{1,2}[-/]\d{1,4})', text, re.I)
    if date_match:
        data["invoiceDate"] = date_match.group(1)

    # Currency
    curr_match = re.search(r'Currency[:.\s]*([A-Z]{3})', text, re.I)
    if curr_match:
        data["currencyGid"] = curr_match.group(1)
    elif any(c in text for c in ["USD", "$"]):
        data["currencyGid"] = "USD"
    elif any(c in text for c in ["INR", "₹"]):
        data["currencyGid"] = "INR"
    elif "EUR" in text:
        data["currencyGid"] = "EUR"

    # Total Amount
    amounts = re.search(r'(?:Total Amount|Total|Balance|Due|Grand)\s*(?:\([A-Z]{3}\))?[:.\s]*[^\d]*([\d,]+\.?\d*)', text, re.I)
    if amounts:
        data["amount"] = amounts.group(1).replace(',', '')

    # Service Provider
    carrier_match = re.search(r'(?:Carrier|Vendor|Service Provider)[:.\s]*([^:\n]+)', text, re.I)
    if carrier_match:
        # Stop at "Invoice" or "Number" if the OCR put them on same line
        val = carrier_match.group(1).strip()
        val = re.split(r'\s+Invoice|\s+Number', val, flags=re.IGNORECASE)[0].strip()
        data["serviceProvider"] = val
    elif lines:
        data["serviceProvider"] = lines[0][:50].upper().replace('INVOICE', '').strip()

    # Line Items
    items = []
    
    for line in lines:
        # Matches INTL.XXXXXX or similar shipments
        if 'INTL.' in line.upper() and ('A' in line.upper() or 'B' in line.upper() or 'C' in line.upper() or 'CHARGE' in line.upper()):
            # Look for number at the end
            amt_match = re.findall(r'([\d,]+\.\d{2})', line)
            if amt_match:
                amt = amt_match[-1].replace(',', '')
                # Don't add if it's the exact same as Total Amount and we only have 1 line, but we can do it safely
                
                cost_type = "BASE"
                # If " B " or "BASE"
                if re.search(r'\bB\b', line, re.I) or re.search(r'Base', line, re.I):
                    cost_type = "B"
                elif re.search(r'\bA\b', line, re.I) or re.search(r'Accessorial', line, re.I):
                    cost_type = "A"

                shipment_match = re.search(r'(INTL\.\d+)', line, re.I)
                if shipment_match:
                    items.append({
                        "shipmentGid": shipment_match.group(1).upper(),
                        "amount": amt,
                        "costTypeGid": cost_type
                    })

    if items:
        # Try to make sure we don't accidentally include "Total Amount" line as a line item
        # If the amount exactly matches the total amount and we have other matching lines, it might be the footer
        filtered_items = []
        for item in items:
            # check if line had "Total Amount"
            # It's already handled by 'INTL.' check, which filter out pure total line, 
            # unless "Shipment Reference: INTL.111000" and "Total Amount: 3355" are somehow squashed
            pass
            
        data["items"] = items
    else:
        data["items"] = [
            {
                "shipmentGid": "UNKNOWN",
                "amount": data["amount"],
                "costTypeGid": "BASE"
            }
        ]

    return data

text = """
TRANSPORT INVOICE
Carrier: T1_ARFW Logistics Pvt LtdInvoice Number: T1_ARFW_033DD7
Carrier Code: T1_ARFW Invoice XID: INV_853E5F78
Address: Chennai Logistics Hub Invoice Date: 2026-03-15
City: Chennai, India Currency: INR

Line Shipment Ref Cost Type Description Amount (INR)
1 INTL.111000 B Base Freight Charge 3155.33
2 INTL.111000 A Accessorial Charge 200.00

Total Amount (INR): 3355.33

Payment Terms: Net 30 Days
Shipment Reference: INTL.111000
Generated For: Oracle Transportation Management Test
"""

print(parse_invoice_text(text))
