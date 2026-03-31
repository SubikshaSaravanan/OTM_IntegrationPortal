import pandas as pd
from datetime import datetime
from uuid import uuid4
from fuzzy_matcher import find_column_fuzzy


def build_invoice_json_from_excel(excel_file, field_mapping=None):
    df = pd.read_excel(excel_file)
    return build_invoice_json_from_dataframe(df, field_mapping)


def build_invoice_json_from_dataframe(df, field_mapping=None):
    print("📊 EXCEL/DF COLUMNS:", df.columns.tolist())

    header = df.iloc[0]
    now = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S+00:00")

    # -------------------------
    # Helpers
    # -------------------------

    def get_vals(field_id, target_names):
        if not isinstance(target_names, list):
            target_names = [target_names]

        collected = []

        for target in target_names:
            col_name = find_column_fuzzy(df, target)
            val = header.get(col_name) if col_name and col_name in df.columns else None

            if val is not None and str(val).strip().lower() not in ["none", "nan", ""]:
                collected.append(str(val))

        return collected


    def get_val(field_id, default_col):
        vals = get_vals(field_id, default_col)
        return vals[0] if vals else None


    def get_row_val(row, field_id, default_col):
        target_name = field_mapping.get(field_id) if field_mapping else default_col
        col_name = find_column_fuzzy(df, target_name) if target_name else find_column_fuzzy(df, default_col)

        if col_name and col_name in df.columns:
            return row.get(col_name)

        return None


    # -------------------------
    # HEADER
    # -------------------------

    invoice_xid = get_val("invoiceXid", "invoice Xid *") or f"INV_{uuid4().hex[:6]}"
    invoice_number = get_val("invoiceNumber", "invoice Number") or "AUTOGEN"

    currency = get_val("currencyGid", "currency Gid") or "INR"
    servprov = get_val("serviceProvider", "servprov Alias Value") or "UNKNOWN"

    raw_date = get_val("invoiceDate", "invoice Date")
    formatted_date = now
    if raw_date:
        s = str(raw_date).split('.')[0]
        if len(s) == 14:
            formatted_date = f'{s[:4]}-{s[4:6]}-{s[6:8]}T{s[8:10]}:{s[10:12]}:{s[12:14]}+00:00'
        elif len(s) == 8:
            formatted_date = f'{s[:4]}-{s[4:6]}-{s[6:8]}T00:00:00+00:00'

    payload = {
        "domainName": "INTL",
        "invoiceXid": invoice_xid,
        "invoiceNumber": invoice_number,
        "invoiceType": "STANDARD",
        "invoiceSource": "MANUAL",
        "servprovAliasQualGid": "GLOG",
        "servprovAliasValue": servprov,
        "currencyGid": currency,
        "invoiceDate": {
            "value": formatted_date
        },
        "dateReceived": {
            "value": now
        },
        "refnums": {
            "items": []
        },
        "lineItems": {
            "items": []
        }
    }

    # -------------------------
    # REFNUMS (FIXED)
    # -------------------------

    refnum_qual = get_val("invoiceRefnumQualGid", "invoice Refnum Qual Gid *")
    refnum_val = get_val("invoiceRefnumValue", "invoice Refnum Value *")

    if refnum_qual and refnum_val:
        payload["refnums"]["items"].append({
            "invoiceRefnumQualGid": refnum_qual,
            "invoiceRefnumValue": refnum_val,
            "domainName": "INTL"
        })

    # -------------------------
    # LINE ITEMS
    # -------------------------

    for idx, row in df.iterrows():

        amount_val = get_row_val(row, "amount", "AMOUNT")

        try:
            amount = float(amount_val) if amount_val else 0.0
        except:
            amount = 0.0

        cost_type = get_row_val(row, "costTypeGid", "COST_TYPE") or "GENERIC"

        cost_ref = get_row_val(row, "costReferenceGid", "cost Reference Gid *")

        line_item = {
            "lineitemSeqNo": idx + 1,
            "description": "",
            "freightCharge": {
                "value": amount,
                "currency": currency
            },
            "processAsFlowThru": False,
            "costTypeGid": cost_type,
            "domainName": "INTL",
            "costRefs": {
                "items": []
            }
        }

        if cost_ref:
            line_item["costRefs"]["items"].append({
                "shipmentCostQualGid": cost_ref,
                "domainName": "INTL"
            })

        payload["lineItems"]["items"].append(line_item)

    return payload